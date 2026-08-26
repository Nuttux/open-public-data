"""Measure, per volume, the offset between the hOCR page index and the leaf that
archive.org's /page/nN actually shows — then the index can publish a URL that lands
on the right page instead of one page away.

The offset is a property of the VOLUME, not of the item: journalofproceed1912 came
back +1 on 5 of 5 probes, journalofproceed23 on 6 of 6, journalofproceed1915 came
back 0 on 2 of 2. That is a scan-level difference between the OCR page list and the
BookReader leaf list, and it is measured here rather than assumed.

Only DISTINCTIVE phrases are used — a phrase that archive.org finds on more than
three pages cannot pin an offset and is discarded rather than counted.
"""
import collections, json, os, random, re, subprocess, sys, time, urllib.parse

import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Code in the repo, data under CITY_DATA. See _paths.py.
from _paths import CACHE  # noqa: F401
HERE = os.path.dirname(os.path.abspath(__file__))
SRV = {}


def server(ident):
    if ident not in SRV:
        out = subprocess.run(["curl", "-sL", "--max-time", "60",
                              f"https://archive.org/metadata/{ident}"],
                             capture_output=True, text=True).stdout
        try:
            d = json.loads(out); SRV[ident] = (d["server"], d["dir"])
        except Exception:
            SRV[ident] = None
    return SRV[ident]


def phrase(t):
    cands = []
    for m in re.finditer(r"\b([A-Z][a-z]{3,}(?: [A-Za-z][a-z']{2,}){4,7})\b", t):
        s = m.group(1)
        if 30 <= len(s) <= 70 and not re.search(
                r"\b(Supervisor|Ayes|Noes|Absent|Resolution|Ordinance|Series|Board)\b", s):
            cands.append(s)
    return cands[:3]


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
    pg = []
    for m in d.get("matches", []):
        for p in m.get("par", []):
            if "page" in p: pg.append(p["page"])
    return sorted(set(pg))


PER = int(sys.argv[1]) if len(sys.argv) > 1 else 6
SHARD = int(sys.argv[2]) if len(sys.argv) > 2 else 0
NSH = int(sys.argv[3]) if len(sys.argv) > 3 else 1

rows = [json.loads(l) for l in open(os.path.join(CACHE, "items.jsonl"))]
rows = [r for r in rows if r["r"] and len(r["t"]) > 300]
byvol = collections.defaultdict(list)
for r in rows:
    byvol[r["v"]].append(r)

out = {}
for vi, v in enumerate(sorted(byvol)):
    if vi % NSH != SHARD:
        continue
    random.seed(hash(v) % 10 ** 6)
    pool = random.sample(byvol[v], min(90, len(byvol[v])))
    offs = []
    for r in pool:
        if len(offs) >= PER:
            break
        for q in phrase(re.sub(r"\s+", " ", r["t"])):
            pg = inside(v, q)
            time.sleep(0.25)
            if pg and len(pg) <= 3:
                offs.append(min((p - r["n"] for p in pg), key=abs))
                break
    c = collections.Counter(offs)
    mode, n = (c.most_common(1)[0] if c else (None, 0))
    out[v] = {"n": len(offs), "modal_offset": mode, "agree": n, "all": dict(c)}
    print(f"{v:<38} n={len(offs):<2} offset {mode}  agree {n}/{len(offs)}  {dict(c)}",
          flush=True)

json.dump(out, open(os.path.join(CACHE, f"leaf_offsets_{SHARD}.json"), "w"), indent=1)
good = [v for v, d in out.items() if d["n"] >= 3 and d["agree"] / max(d["n"], 1) >= 0.7]
print(f"\n{len(good)}/{len(out)} volumes calibrated with >=3 probes and >=70% agreement")
print("offset distribution:",
      dict(collections.Counter(out[v]["modal_offset"] for v in good)))
