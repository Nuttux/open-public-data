#!/usr/bin/env python3
"""DOES A STREET'S DATE MEAN THE STREET APPEARED? Mostly not, and by how much.

Daniel, looking at the century scrub against old maps: *"i notice you have not
so may streets in past years also i see old maps online wih way more streets
than what you put int he ordinance, maybe streets decided before the date."*

He is right, and this measures it rather than agreeing with it.

── THE CORPUS DATES MAINTENANCE, NOT CREATION ───────────────────────────────
`time/out/street-years.json` carries eight kinds of claim, in its own words:

    accept   the Board voted to accept this roadway as a city street
    open     the Board ordered this street opened, widened or extended
    grade    the Board ordered this roadway graded
    pave     the Board ordered this roadway paved or macadamized
    sewer    the Board ordered a sewer in this street
    curb     the Board ordered curbs or sidewalks in this street
    improve  the Board ordered this street improved
    name     the Board named or renamed this street

SEVEN OF THE EIGHT PRESUPPOSE THE STREET. You cannot pave, kerb, sewer, grade,
improve or accept a street that is not there; only `open` is about a street
coming into being, and even that covers widening an existing one. So a claim
year is an UPPER BOUND -- "existed no later than Y" -- and using it as the year
the street APPEARS draws the whole city late.

── AND THE BUILDINGS BESIDE THEM SAY SO ─────────────────────────────────────
`fabric-years.json` gives the earliest assessor year among buildings within
40 m of a centreline. Where both signals exist they can be compared, and a
street whose houses predate its own date is a street dated too late.

── WHAT AN OLD MAP SHOWS, WHICH IS NOT THE SAME THING ───────────────────────
A published map draws the SURVEYED grid: streets platted on paper, whether or
not anything was ever built on them. The Sunset and the Richmond appear as a
full grid on maps decades before they were streets in any physical sense. This
map draws streets with EVIDENCE of existing. Both are defensible and they
answer different questions, so the gap Daniel saw is partly real bias and
partly the two conventions disagreeing. This script separates them.

  python3 diag_street_coverage.py
"""
from __future__ import annotations

import collections
import json
import pathlib

ROOT = pathlib.Path("/Users/daniel/code/open-public-data")
ANIM = ROOT / "scratchpad/sf-city-anim/time/out"
MANIFEST = ROOT / "website/public/data/us/sf/city/manifest.json"

# every kind but `open` describes work done TO a street that is already there
CREATES = {"open"}


def main() -> None:
    sy = json.loads((ANIM / "street-years.json").read_text())
    fy = json.loads((ANIM / "fabric-years.json").read_text())
    total = json.loads(MANIFEST.read_text())["streets"]["n"]

    fab = {str(c): y for c, y, _n in fy["seg"]}
    best: dict[str, tuple[int, str]] = {}
    for s in sy["seg"]:
        c, y, k = str(s["cnn"]), s["y"], s["kind"]
        if c not in best or y < best[c][0]:
            best[c] = (y, k)

    print(f"{total:,} street segments ship in the map")
    print(f"  {len(best):,} carry a claim in the Board's Journal")
    print(f"  {sum(1 for v in fab.values() if v > 0):,} carry a building year on their frontage")
    signal = set(best) | {c for c, y in fab.items() if y > 0}
    print(f"  {len(signal):,} ({100*len(signal)/total:.0f} %) have ANY signal; "
          f"{total-len(signal):,} have none and are drawn from the first frame")

    kinds = collections.Counter(k for _, k in best.values())
    presup = sum(n for k, n in kinds.items() if k not in CREATES)
    print(f"\nWHICH CLAIM SETS THE DATE (the earliest one a street has):")
    for k, n in kinds.most_common():
        mark = "" if k in CREATES else "   <- presupposes the street"
        print(f"   {k:9s} {n:5,}  {100*n/len(best):4.1f} %{mark}")
    print(f"\n   {presup:,} of {len(best):,} ({100*presup/len(best):.1f} %) are dated by work done "
          f"to a street that already existed")

    both = [(c, jy, jk, fab[c]) for c, (jy, jk) in best.items() if fab.get(c, 0) > 0]
    earlier = [t for t in both if t[3] < t[1] - 5]
    gaps = sorted((t[1] - t[3] for t in earlier), reverse=True)
    print(f"\nCROSS-CHECK -- buildings older than the street's own Journal date, by >5 years:")
    print(f"   {len(earlier):,} of {len(both):,} ({100*len(earlier)/len(both):.1f} %)")
    if gaps:
        print(f"   median gap {gaps[len(gaps)//2]} years, worst {gaps[0]}")
    print("   NOTE the layer already takes min(journal, fabric), so the shipped date is the")
    print("   EARLIER of the two. This measures how late the Journal alone would have been.")

    only_journal = [c for c in best if fab.get(c, 0) <= 0]
    late = [c for c in only_journal if best[c][1] not in CREATES]
    print(f"\nWHERE IT STILL BITES: {len(only_journal):,} streets have a Journal claim and NO "
          f"building year,")
    print(f"   and {len(late):,} of those are dated by a maintenance claim. For these the map "
          f"asserts")
    print("   an appearance year the record does not support -- it supports 'no later than'.")

    shipped = collections.Counter()
    for c in signal:
        y = min(best.get(c, (9999, ""))[0], fab.get(c) or 9999)
        if y <= 1906:
            shipped["<=1906"] += 1
        elif y < 1930:
            shipped["1907-29"] += 1
        elif y < 1960:
            shipped["1930-59"] += 1
        else:
            shipped["1960+"] += 1
    print(f"\nSHIPPED DATES, min(journal, fabric):")
    for k in ("<=1906", "1907-29", "1930-59", "1960+"):
        print(f"   {k:9s} {shipped[k]:6,}")


if __name__ == "__main__":
    main()
