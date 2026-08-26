"""Are the three eras the same kind of document? Measured, not assumed.

    1906-1999  Journal of proceedings   bound, letterpress, OCR'd from scans
    1999-2016  Meeting minutes          bound, typed/laser, OCR'd from scans
    2016-2026  sfbos.org                born-digital PDF, real text layer

Merging them into one block record is a CLAIM: that a decision means the same
thing in all three. This measures whether it does, on one sample, with one
counter, so the numbers are comparable.

THE DENOMINATOR TRAP THIS EXISTS TO KILL. The Journal sweep
(`sweep/extract_items.py`) drops an item BEFORE counting it when the item names
no place — `if not locs: continue`, then `item_id += 1`. So its "rows" are
items that already mention a street. A count of every split item from the modern
PDFs is therefore not the same measurement, and comparing the two produced an
apparent threefold collapse in the modern record that is partly an artefact of
which items each side bothered to count. Everything below counts the SAME four
things at the SAME four gates, for all three eras.

    split      passages between two Resolution|Ordinance|Motion marks, 60..3000 chars
    mentions   ...of those, at least one street-shaped phrase
    resolved   ...of those, at least one street the DataSF gazetteer knows
    placed     ...of those, at least one assessor block

Usage:  python3 compare_minute_eras.py --measure  [--sample N]
        python3 compare_minute_eras.py --read     twenty items from each era
"""
from __future__ import annotations

import argparse
import collections
import importlib.util
import json
import os
import pathlib
import random
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
ANIM = REPO / "scratchpad" / "sf-city-anim"
SWEEP = ANIM / "sweep"
MIN = REPO / "pipeline" / "minutes"
SFBOS = HERE / "cache_sfbos"
SEED = REPO / "pipeline" / "seeds" / "countries" / "us" / "seed_us_sf_bos_minutes.tsv"
IA_DIRS = [ANIM / "geo" / "cache" / "ia", SWEEP / "cache" / "ia"]


def _load(p, n):
    s = importlib.util.spec_from_file_location(n, p)
    m = importlib.util.module_from_spec(s)
    sys.modules[n] = m
    s.loader.exec_module(m)
    return m


ex = _load(MIN / "extract.py", "ex_era")
gz = _load(MIN / "gazetteer.py", "gz_era")
ei = _load(SWEEP / "extract_items.py", "ei_era")
# builder: repo.  corpus: CITY_DATA tree.
BI = _load(REPO / "pipeline" / "scripts" / "us_sf_city" / "blocks" / "build_index.py", "bi_era")

STYPE = re.compile(r"\s+(Street|Avenue|Boulevard|Road|Way|Drive|Place|Terrace|Alley|"
                   r"Lane|Court|Park|Plaza|Square|Highway|Circle|Path|Walk)$", re.I)


def seed_cov() -> dict[str, tuple[int, int]]:
    out = {}
    for ln in open(SEED):
        if ln.startswith("#") or ln.startswith("year_from"):
            continue
        p = ln.rstrip("\n").split("\t")
        if len(p) >= 3:
            out[p[2]] = (int(p[0]), int(p[1]))
    return out


def ia_pages(ident):
    for d in IA_DIRS:
        if (d / f"{ident}_hocr_searchtext.txt.gz").exists():
            ei.IA = str(d)
            return ei.volume_pages(ident)[0]
    return None


def pdf_pages(path: pathlib.Path):
    t = subprocess.run(["pdftotext", "-layout", str(path), "-"],
                       capture_output=True).stdout.decode("utf8", "replace")
    return list(enumerate(t.split("\f")))


def walk(pages, gaz, keys):
    """The one counter. Yields a dict per split item."""
    cur = None
    for leaf, raw in pages:
        text = ex.clean(raw)
        if len(text) < 60:
            continue
        m = None
        for m in ex.MEETING.finditer(text):
            pass
        if m:
            mon = m.group(2).title()
            cur = (f"{int(m.group(4))}-"
                   f"{'JanFebMarAprMayJunJulAugSepOctNovDec'.find(mon[:3]) // 3 + 1:02d}-"
                   f"{int(m.group(3)):02d}")
        marks = [x.start() for x in ex.ITEM.finditer(text)]
        for a, b in zip(marks, marks[1:] + [len(text)]):
            body = text[a:b]
            if len(body) < 60 or len(body) > 3000:
                continue
            locs = ex.locations_from(body)
            res = []
            for L in locs:
                hit, how = gz.resolve(STYPE.sub("", L["street"]), gaz, keys)
                if how != "unresolved":
                    res.append(hit)
            mm = ex.ITEM.search(body)
            yield {"dt": cur, "leaf": leaf, "t": body, "len": len(body),
                   "k": mm.group(1) if mm else "?",
                   "n_men": len(locs), "n_res": len(res),
                   "money": len(ex.MONEY.findall(body))}


ERAS = ("1906-1999 Journal", "1999-2016 Minutes", "2016-2026 sfbos")


def pick(n_vol: int, seed: int):
    random.seed(seed)
    cov = seed_cov()
    excl = set(json.load(open(SWEEP / "out" / "modern_excluded.json")))
    base = {json.loads(l)["v"] for l in open(ANIM / "blocks" / "cache" / "items.jsonl")}
    journal = sorted({v for v in base if v.startswith("journal")})
    modern = sorted(k for k in cov
                    if not k.startswith("journal") and k not in excl
                    and cov[k][1] >= 1999
                    and (SWEEP / "out" / "items" / f"{k}.meta.json").exists())
    pdfs = sorted(SFBOS.glob("pdf/*.pdf"))
    return (random.sample(journal, min(n_vol, len(journal))),
            random.sample(modern, min(n_vol, len(modern))),
            random.sample(pdfs, min(n_vol * 4, len(pdfs))))


def measure(n_vol: int) -> None:
    gaz = gz.build()
    keys = list(gaz)
    a, b, c = pick(n_vol, 5)
    print(f"  sample: {len(a)} Journal volumes, {len(b)} Minutes volumes, "
          f"{len(c)} sfbos meetings\n")
    stats = {}
    items_by_era = {}
    for era, src in zip(ERAS, (a, b, c)):
        rows = []
        for s in src:
            pages = pdf_pages(s) if isinstance(s, pathlib.Path) else ia_pages(s)
            if pages is None:
                continue
            got = list(walk(pages, gaz, keys))
            if isinstance(s, pathlib.Path):
                # one PDF is one meeting; the header date is the meeting date
                d = re.match(r"bag(\d{2})(\d{2})(\d{2})", s.stem)
                dt = f"20{d.group(3)}-{d.group(1)}-{d.group(2)}" if d else None
                for r in got:
                    r["dt"] = r["dt"] or dt
            rows += got
        stats[era] = rows
        items_by_era[era] = rows
    print(f"  {'':22s} {'split':>8} {'mentions':>9} {'resolved':>9} "
          f"{'men%':>6} {'res%':>6} {'med chars':>10}")
    for era in ERAS:
        r = stats[era]
        men = [x for x in r if x["n_men"]]
        res = [x for x in r if x["n_res"]]
        med = sorted(x["len"] for x in r)[len(r) // 2] if r else 0
        print(f"  {era:22s} {len(r):>8,} {len(men):>9,} {len(res):>9,} "
              f"{100 * len(men) / max(1, len(r)):>5.1f}% "
              f"{100 * len(res) / max(1, len(men)):>5.1f}% {med:>10,}")

    print(f"\n  ITEMS PER MEETING (the unit a reader would recognise)")
    print(f"  {'':22s} {'meetings':>9} {'items/mtg':>10} {'resolved/mtg':>13}")
    for era in ERAS:
        r = [x for x in stats[era] if x["dt"]]
        mt = collections.Counter(x["dt"] for x in r)
        mr = collections.Counter(x["dt"] for x in r if x["n_res"])
        if not mt:
            continue
        n = len(mt)
        print(f"  {era:22s} {n:>9,} {sum(mt.values()) / n:>10.1f} "
              f"{sum(mr.values()) / n:>13.1f}")

    print(f"\n  HOW A DECISION IS NAMED (the word the item opens on)")
    print(f"  {'':22s} {'Resolution':>11} {'Ordinance':>10} {'Motion':>8}")
    for era in ERAS:
        r = stats[era]
        k = collections.Counter(x["k"] for x in r)
        tot = max(1, len(r))
        print(f"  {era:22s} {100 * k['Resolution'] / tot:>10.1f}% "
              f"{100 * k['Ordinance'] / tot:>9.1f}% {100 * k['Motion'] / tot:>7.1f}%")

    print(f"\n  WHAT THEY ARE ABOUT  (build_index.SUBJECT_CUES, % of items matching)")
    names = [n for n, _ in BI.SUBJECT_CUES]
    per = {}
    for era in ERAS:
        r = stats[era]
        c = collections.Counter()
        for x in r:
            for s in BI.subjects_of(x["t"]):
                c[s] += 1
        per[era] = (c, len(r))
    print(f"  {'subject':24s} " + "  ".join(f"{e.split()[0]:>10s}" for e in ERAS))
    for n in names:
        row = "  ".join(f"{100 * per[e][0][n] / max(1, per[e][1]):>9.1f}%" for e in ERAS)
        print(f"  {n:24s} {row}")
    none = "  ".join(
        f"{100 * sum(1 for x in stats[e] if not BI.subjects_of(x['t'])) / max(1, len(stats[e])):>9.1f}%"
        for e in ERAS)
    print(f"  {'(matches no cue)':24s} {none}")
    json.dump({e: len(stats[e]) for e in ERAS}, open("/dev/null", "w"))


def read_sample() -> None:
    gaz = gz.build()
    keys = list(gaz)
    a, b, c = pick(3, 11)
    for era, src in zip(ERAS, (a, b, c[:3])):
        print(f"\n{'=' * 78}\n{era}\n{'=' * 78}")
        rows = []
        for s in src:
            pages = pdf_pages(s) if isinstance(s, pathlib.Path) else ia_pages(s)
            if pages:
                rows += list(walk(pages, gaz, keys))
        random.seed(3)
        for x in random.sample(rows, min(20, len(rows))):
            print(f"  [{x['k']:<10} {str(x['dt']):<10} {x['len']:>4}c "
                  f"men={x['n_men']} res={x['n_res']}] {x['t'][:150]}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--measure", action="store_true")
    ap.add_argument("--read", action="store_true")
    ap.add_argument("--sample", type=int, default=10)
    a = ap.parse_args()
    if a.measure:
        measure(a.sample)
    if a.read:
        read_sample()
    if not (a.measure or a.read):
        ap.error("--measure or --read")


if __name__ == "__main__":
    main()
