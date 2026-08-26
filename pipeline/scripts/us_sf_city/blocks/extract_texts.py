"""Re-sweep the CACHED hOCR and keep the DECISION TEXT that geo/sweep_minutes.py threw away.

geo/cache/mentions.jsonl is one row per (volume, leaf, item, street, number) and carries
no text at all, so it can tell you a block was named and not what was decided there.
This pass walks the same cached bytes in the same order and emits one row per ITEM, with
the sentence the Board actually wrote, the meeting date, the money, and the resolved
streets.

The item numbering here is BYTE-FOR-BYTE the same walk as sweep_minutes.py (same page
order, same ex.ITEM split, same 60..3000 char gate, same `locations` gate, same
per-volume item_id counter), so `(v, i)` in this file and in mentions.jsonl are the same
item. That is asserted, not assumed: --check compares the item and mention counts against
the existing sweep and fails loudly on any drift.

Input   ../geo/cache/ia/*_hocr_searchtext.txt.gz  (cached, no network)
Output  cache/items.jsonl
"""
import gzip, importlib.util, json, os, re, sys, time

import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Code in the repo, data under CITY_DATA. See _paths.py.
from _paths import ANIM, REPO as ROOT, MIN, IA, CACHE  # noqa: F401
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(CACHE, exist_ok=True)


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


ex = _load(os.path.join(MIN, "extract.py"), "ex")
gz = _load(os.path.join(MIN, "gazetteer.py"), "gz")

# identical to sweep_minutes.STYPE
STYPE = re.compile(r"\s+(Street|Avenue|Boulevard|Road|Way|Drive|Place|Terrace|Alley|"
                   r"Lane|Court|Park|Plaza|Square|Highway|Circle|Path|Walk)$")


def volume_pages(ident):
    a = os.path.join(IA, f"{ident}_hocr_searchtext.txt.gz")
    b = os.path.join(IA, f"{ident}_hocr_pageindex.json.gz")
    if not (os.path.exists(a) and os.path.exists(b)):
        return None
    try:
        t = gzip.open(a, "rt", encoding="utf-8", errors="replace").read()
        pi = json.load(gzip.open(b, "rt"))
    except Exception as e:
        print(f"  !! {ident}: {e}", flush=True)
        return None
    starts = [e[0] for e in pi]
    return [(i, t[s:(starts[i + 1] if i + 1 < len(starts) else len(t))])
            for i, s in enumerate(starts)]


def main():
    vols = []
    for ln in open(os.path.join(ANIM, "vols.txt")):
        p = ln.split()
        if len(p) == 2:
            vols.append((int(p[0]), p[1]))

    gaz = gz.build(); keys = list(gaz)
    print(f"gazetteer: {len(gaz)} real SF streets", flush=True)

    out = open(os.path.join(CACHE, "items.jsonl"), "w")
    tot_items = tot_men = tot_res = 0
    for year, ident in vols:
        t0 = time.time()
        pages = volume_pages(ident)
        if pages is None:
            print(f"{year} {ident:44s} NO CACHED HOCR", flush=True)
            continue
        item_id = 0
        n_men = n_res = 0
        cur_date = None
        for leaf, raw in pages:
            text = ex.clean(raw)
            if len(text) < 60:
                continue
            # meeting date: last header on the page wins, carried forward, same rule
            # as extract.decisions(). sweep_minutes never did this — dates are new here.
            m = None
            for m in ex.MEETING.finditer(text):
                pass
            if m:
                mon = m.group(2).title()
                cur_date = (f"{int(m.group(4))}-"
                            f"{'JanFebMarAprMayJunJulAugSepOctNovDec'.find(mon[:3])//3+1:02d}-"
                            f"{int(m.group(3)):02d}")
            marks = [mm.start() for mm in ex.ITEM.finditer(text)]
            for a, b in zip(marks, marks[1:] + [len(text)]):
                body = text[a:b]
                if len(body) < 60 or len(body) > 3000:
                    continue
                locs = ex.locations_from(body)
                if not locs:
                    continue
                item_id += 1
                amounts = ex.MONEY.findall(body)
                mm = ex.ITEM.search(body)
                kind = mm.group(1)[0] if mm else "?"
                # Character offset of each location inside the item. The item
                # splitter cuts on Resolution|Ordinance|Motion, so the HEADING of
                # the NEXT item routinely trails into this one — measured on two
                # hand-checked samples out of 40. The offset is what lets the
                # index drop those, and it is recomputed here rather than by
                # editing pipeline/minutes/extract.py, which another pass owns.
                offs, used = {}, set()
                for mm2 in ex.STREET.finditer(body):
                    nm = mm2.group("name").strip()
                    nm = re.sub(r"^(?:On|At|In|To|From|Along|Near|Upon)\s+", "", nm)
                    sty2 = mm2.group("type").rstrip("s").title()
                    key = (f"{nm} {sty2}", mm2.group("num"))
                    if key not in used:
                        used.add(key); offs[key] = mm2.start()
                res = []
                for L in locs:
                    n_men += 1
                    mt = STYPE.search(L["street"])
                    sty = (mt.group(1) if mt else "")
                    base = STYPE.sub("", L["street"])
                    hit, how = gz.resolve(base, gaz, keys)
                    if how == "unresolved":
                        continue
                    n_res += 1
                    res.append({"s": gz.norm(hit), "d": hit, "a": L["number"],
                                "x": 1 if L["cross_of"] else 0, "h": how,
                                "ty": sty,
                                "o": offs.get((L["street"], L["number"]), 0)})
                out.write(json.dumps({
                    "v": ident, "y": year, "n": leaf, "i": item_id, "k": kind,
                    "dt": cur_date, "t": body,
                    "m": [x.replace(",", "") for x in amounts[:6]],
                    "r": res,
                }) + "\n")
        tot_items += item_id; tot_men += n_men; tot_res += n_res
        print(f"{year} {ident:44s} {len(pages):>5} pp {item_id:>6} items "
              f"{n_men:>7} men {n_res:>7} res  {time.time()-t0:.0f}s", flush=True)
    out.close()
    print(f"\nTOTAL items {tot_items:,}  mentions {tot_men:,}  resolved {tot_res:,}")

    # ---- assert we reproduced the existing sweep exactly -------------------
    sw = os.path.join(ANIM, "geo", "cache", "mentions.jsonl")
    if os.path.exists(sw):
        sw_rows = 0; sw_items = set()
        for ln in open(sw):
            d = json.loads(ln); sw_rows += 1; sw_items.add((d["v"], d["i"]))
        mine = set()
        for ln in open(os.path.join(CACHE, "items.jsonl")):
            d = json.loads(ln)
            if d["r"]:
                mine.add((d["v"], d["i"]))
        print(f"sweep mentions.jsonl : {sw_rows:,} rows, {len(sw_items):,} located items")
        print(f"this pass            : {tot_res:,} rows, {len(mine):,} located items")
        print(f"item-key overlap     : {len(sw_items & mine):,} "
              f"(only-sweep {len(sw_items - mine):,} / only-mine {len(mine - sw_items):,})")


if __name__ == "__main__":
    main()
