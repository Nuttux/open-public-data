"""D1 diagnostic — where does a street's YEAR come from, and why does it stop?

The street surface (`strt/<cell>.qc`) is gated on `yr`, which
`street/build_surface.py` takes as

    exist_year(cnn) = min(journal year, fabric year), and 0 if <= 1906

    journal year   time/out/street-years.json — the Board of Supervisors'
                   Journal of Proceedings, OCR'd off the Internet Archive and
                   parsed by time/streets_record.py
    fabric year    time/out/fabric-years.json — the earliest assessor year
                   among buildings within 40 m of the centreline

`3psu-pn9h.accepted` is a BOOLEAN, not a year, so no published file gives a
street an acceptance date. The date is a DOCUMENT claim, and this script
measures the document corpus: how many items each year holds, how many of them
carry the roadway-acceptance construct, and what the Board says instead once it
stops saying that.
"""
from __future__ import annotations

import collections
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
MOCK = os.path.normpath(os.path.join(ROOT, "scratchpad", "sf-city-anim"))
ITEMS = os.path.join(MOCK, "blocks", "cache", "items.jsonl")

# film/streets_accept.py's own TRIGGER, copied here so this diagnostic can run
# without importing the mock; asserted identical below.
TRIGGER = re.compile(
    r"(?:full\s+)?acceptance\s+of\s+(?:the\s+)?(?:roadways?|sidewalks?|streets?|"
    r"pavements?|highways?)\b", re.I)

# deliberately WIDER than TRIGGER: any phrasing in which the Board accepts a
# street, however worded. If this also collapses, the construct really left the
# Journal; if only TRIGGER collapses, the parser is the limit.
WIDE = re.compile(
    r"\baccept\w*\b(?:[^.]{0,80}?)\b(?:roadway|street|avenue|boulevard|"
    r"sidewalk|pavement|highway|thoroughfare)\w*\b", re.I)
DPW = re.compile(r"\bDepartment\s+of\s+Public\s+Works\b|\bDirector\s+of\s+Public\s+Works\b", re.I)
PUC = re.compile(r"\bPublic\s+Utilities\s+Commission\b", re.I)
SUBDIV = re.compile(r"\b(?:final|tentative)\s+map\b|\bsubdivision\s+map\b", re.I)


def check_trigger():
    src = open(os.path.join(MOCK, "film", "streets_accept.py")).read()
    if "acceptance\\s+of\\s+(?:the\\s+)?(?:roadways?|sidewalks?|streets?|" not in src:
        sys.exit("film/streets_accept.py TRIGGER has changed — update this file")


def main():
    check_trigger()
    n = collections.Counter()
    trig = collections.Counter()
    wide = collections.Counter()
    dpw = collections.Counter()
    puc = collections.Counter()
    sub = collections.Counter()
    for line in open(ITEMS, encoding="utf-8"):
        d = json.loads(line)
        try:
            y = int(d["y"])
        except (KeyError, TypeError, ValueError):
            continue
        t = d.get("t") or ""
        n[y] += 1
        if TRIGGER.search(t):
            trig[y] += 1
        if WIDE.search(t):
            wide[y] += 1
        if DPW.search(t):
            dpw[y] += 1
        if PUC.search(t):
            puc[y] += 1
        if SUBDIV.search(t):
            sub[y] += 1

    print(f"corpus: {sum(n.values()):,} items, {min(n)}-{max(n)}")
    print(f"{'year':>5} {'items':>7} {'accept(TRIGGER)':>16} {'accept(WIDE)':>13} "
          f"{'DPW':>6} {'PUC':>5} {'map':>5}")
    for y in sorted(n):
        print(f"{y:>5} {n[y]:>7,} {trig[y]:>16,} {wide[y]:>13,} "
              f"{dpw[y]:>6,} {puc[y]:>5,} {sub[y]:>5,}")

    def era(a, b, c):
        return sum(v for y, v in c.items() if a <= y <= b)

    print("\n=== eras ===")
    for a, b in ((1906, 1931), (1932, 1947), (1948, 1970), (1971, 1999)):
        print(f"  {a}-{b}: items {era(a,b,n):>7,}  TRIGGER {era(a,b,trig):>5,}  "
              f"WIDE {era(a,b,wide):>5,}  DPW {era(a,b,dpw):>5,}  "
              f"PUC {era(a,b,puc):>5,}  map {era(a,b,sub):>5,}")


PAPER = {"PAPER", "PAPER_FWYS", "PAPER_WATER", "PSEUDO"}


def layers():
    """Which published centreline segments reach the screen, by `layer`.

    `3psu-pn9h` carries a `layer` column, and three of its values are FEDERAL
    jurisdictions the City's street files describe but do not own. They fail
    twice: `classcode` is null so gen_geo2.py's 0-4 gate drops them from the
    centreline network, and `h8n7-e4ns` has no public right of way polygon for
    them so build_surface.py drops them from the surface. See DATA-TRUTH.md §2.
    """
    import glob

    import numpy as np

    from _chunk import field_array, read_chunk

    web = os.path.normpath(os.path.join(ROOT, "website", "public", "data",
                                        "us", "sf", "city"))
    rows = json.load(open(os.path.join(MOCK, "geo", "cache", "streets.json")))

    def I(v):
        try:
            return int(float(v))
        except (TypeError, ValueError):
            return None

    info = {I(r["cnn"]): r for r in rows if I(r["cnn"]) is not None}

    surf = set()
    for p in sorted(glob.glob(os.path.join(web, "strt", "*.qc"))):
        if os.path.basename(p).startswith("street-"):
            continue
        h, pl = read_chunk(open(p, "rb").read())
        k = np.asarray(field_array(h, pl, "kind")).astype(int)
        c = np.asarray(field_array(h, pl, "cnn")).astype(np.int64)
        surf.update(int(x) for x in c[k == 0])

    line = set()
    for rel in ("base/street-lines.qc", "strt/street-lines-2.qc"):
        h, pl = read_chunk(open(os.path.join(web, rel), "rb").read())
        line.update(int(x) for x in
                    np.asarray(field_array(h, pl, "cnn")).astype(np.int64))

    print(f"\n=== published centrelines that reach the screen ===")
    print(f"  drawn segment ROW surfaces: {len(surf):,}   drawn centrelines: {len(line):,}")
    by = collections.defaultdict(lambda: [0, 0, 0, 0])
    for c, r in info.items():
        e = by[r.get("layer") or "(none)"]
        e[0] += 1
        if (r.get("classcode") or "") == "":
            e[1] += 1
        if c in surf:
            e[2] += 1
        if c in line:
            e[3] += 1
    print(f"  {'layer':24s} {'segs':>6} {'null cls':>9} {'surface':>8} {'line':>6}")
    for k in sorted(by, key=lambda k: -by[k][0]):
        n_, nul, sf, ln = by[k]
        print(f"  {k:24s} {n_:>6,} {nul:>9,} {sf:>8,} {ln:>6,}")

    print("\n  classcode over the whole file (gen_geo2.py ships 0-4 only):")
    cc = collections.Counter((r.get("classcode") or "(null)") for r in info.values())
    for k in sorted(cc, key=lambda k: -cc[k]):
        print(f"    class {k:>6}  {cc[k]:>6,}")

    print("\n  null classcode by analysis neighbourhood:")
    nul = collections.Counter((r.get("analysis_neighborhood") or "(null)")
                              for r in info.values()
                              if (r.get("classcode") or "") == "")
    for k, v in nul.most_common(8):
        print(f"    {k:34s} {v:>5,}")


if __name__ == "__main__":
    main()
    layers()
