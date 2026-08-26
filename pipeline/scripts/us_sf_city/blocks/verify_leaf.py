"""Does the page URL in the index point at the page the text is actually on?

The URL is built as archive.org/details/<vol>/page/n<LEAF> where LEAF is the index
of the page in the volume's hOCR pageindex. That is an ASSUMPTION: it says the hOCR
page order and the BookReader leaf order are the same list. Comparing the cached
hOCR against the cached _djvu.xml showed they are NOT always — 1912 aligns exactly,
1925 and 1955 are off by one over most of the book.

So this asks the authority instead. archive.org's own search-inside returns, for a
phrase, the BookReader page index that `/page/nN` addresses. A distinctive phrase is
lifted out of each sampled decision, sent to that endpoint, and the page it comes
back with is compared to the leaf the index published.
"""
import json, os, random, re, subprocess, sys, time, urllib.parse, collections

import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Code in the repo, data under CITY_DATA. See _paths.py.
from _paths import CACHE  # noqa: F401
HERE = os.path.dirname(os.path.abspath(__file__))
SRV = {}


def server(ident):
    if ident in SRV: return SRV[ident]
    out = subprocess.run(["curl", "-sL", "--max-time", "60",
                          f"https://archive.org/metadata/{ident}"],
                         capture_output=True, text=True).stdout
    try:
        d = json.loads(out); SRV[ident] = (d["server"], d["dir"])
    except Exception:
        SRV[ident] = None
    return SRV[ident]


def phrase(t):
    """A distinctive run of words: rare-ish, long enough to be unique, clean of OCR junk."""
    t = re.sub(r"\s+", " ", t)
    best = None
    for m in re.finditer(r"\b([A-Za-z][a-z]{3,}(?: [A-Za-z][a-z]{2,}){3,6})\b", t):
        s = m.group(1)
        if len(s) < 22 or len(s) > 60: continue
        if re.search(r"\b(Supervisor|Ayes|Noes|Absent|Resolution|Ordinance|Series)\b", s):
            continue
        best = s
        if len(s) > 34: break
    return best


def inside(ident, q):
    sv = server(ident)
    if not sv: return None
    url = (f"https://{sv[0]}/fulltext/inside.php?item_id={ident}&doc={ident}"
           f"&path={sv[1]}&q=" + urllib.parse.quote('"%s"' % q))
    out = subprocess.run(["curl", "-sL", "--max-time", "90", url],
                         capture_output=True, text=True).stdout
    try:
        d = json.loads(out)
    except Exception:
        return None
    pages = []
    for m in d.get("matches", []):
        for p in m.get("par", []):
            if "page" in p: pages.append(p["page"])
    return pages


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 20260821
    rows = [json.loads(l) for l in open(os.path.join(CACHE, "items.jsonl"))]
    rows = [r for r in rows if r["r"]]
    random.seed(seed)
    sample = random.sample(rows, n * 3)
    res = collections.Counter(); byvol = collections.defaultdict(list); detail = []
    done = 0
    for r in sample:
        if done >= n: break
        q = phrase(r["t"])
        if not q:
            continue
        pages = inside(r["v"], q)
        time.sleep(0.4)
        if pages is None:
            res["api_error"] += 1; continue
        if not pages:
            res["phrase_not_found"] += 1; continue
        done += 1
        off = min((p - r["n"] for p in pages), key=abs)
        res[f"offset {off:+d}" if off else "EXACT"] += 1
        byvol[r["v"]].append(off)
        detail.append({"v": r["v"], "y": r["y"], "leaf": r["n"], "ia_pages": pages,
                       "offset": off, "q": q})
        print(f"{r['y']} {r['v'][:34]:<34} leaf {r['n']:>5} -> IA {pages[:3]}"
              f"  off {off:+d}   \"{q[:40]}\"", flush=True)
    print("\nRESULT", dict(res))
    ok = res["EXACT"]; tot = sum(v for k, v in res.items() if k.startswith(("EXACT", "offset")))
    print(f"leaf EXACT {ok}/{tot} = {100*ok/max(tot,1):.1f}%")
    print("\nper-volume modal offset:")
    for v, offs in sorted(byvol.items()):
        c = collections.Counter(offs)
        print(f"  {v:<38} n={len(offs):<3} {dict(c)}")
    json.dump({"result": dict(res), "detail": detail,
               "by_volume": {k: dict(collections.Counter(v)) for k, v in byvol.items()}},
              open(os.path.join(CACHE, "verify_leaf.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
