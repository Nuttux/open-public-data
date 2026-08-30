#!/usr/bin/env python3
"""WHAT DATES A PLACE'S NAME, AND THE BRANCH §HELD DID NOT REACH.

    python3 pipeline/scripts/us_sf_places/diag_place_years.py

Read-only. Reads the SHIPPED `base/marks.json` and nothing else, so it measures
what is on the page rather than what the emitter intended.

── THE RULE THIS FILE IS CHECKING, IN emit_places.py's OWN WORDS ────────────
§HELD: *"A NAME IS A CLAIM AND A YEAR ON IT IS A SECOND ONE."* A label whose
year was BORROWED from the ground under it, or DEFAULTED to the 1906 floor,
carries `yr = YR_NONE` and is written only on the un-clocked map. Three of the
six bases in §YBASIS are held that way.

§YEARLESS_REGISTERS, a few lines further down, states a fact about two of the
publishers:

  > `gtr9-ntp6` (Recreation and Parks Properties) and `nc68-ngbr` (City
  > Facilities) publish a name, an owner and a geometry. **Neither publishes a
  > year of construction or of acquisition** -- DRAW.md 33.8b read every
  > column of both.

and then uses it on ONE branch: a row from either register *that resolved to no
footprint* is given a GROUND basis and held.

── AND THE OTHER BRANCH KEEPS A BORROWED NUMBER ────────────────────────────
A row from the same two registers that DID land on a footprint takes basis 1,
"the assessor roll year of the footprint the place stands on", and is written
from that year onward. The register is equally silent either way. What changed
the answer is whether there happened to be a dated structure underneath -- so
the age of a shed dates the name of whoever is in it now, and the map writes
today's occupant onto a historic frame.

This script reports that cohort, its size, and what it puts on the 1906 frame.
It fixes nothing: what a PRESENT-TENSE register means on a clocked map is a
design question -- `YR_NONE` would also take these names off the 2026 frame,
where they are true -- and that is not this script's to answer.
"""
from __future__ import annotations

import base64
import collections
import json
import pathlib
import struct

ROOT = pathlib.Path("/Users/daniel/code/open-public-data")
MARKS = ROOT / "website/public/data/us/sf/city/base/marks.json"

# emit_places.py YEARLESS_REGISTERS, restated so this script stands alone and
# asserted against the shipped SRC table below rather than assumed.
YEARLESS = ("gtr9-ntp6", "nc68-ngbr")
FLOOR = 1906            # SCRUB_MIN, and build_bldg.py's FLAG_NOYEAR value


def main() -> None:
    m = json.loads(MARKS.read_text())
    n = m["n"]
    yr = struct.unpack(f"<{n}H", base64.b64decode(m["yr"]))
    yb = base64.b64decode(m["yb"])
    src = base64.b64decode(m["src"])
    name = m["t"]
    SRC, YBASIS, NONE = m["SRC"], m["YBASIS"], m["YR_NONE"]

    missing = [r for r in YEARLESS if r not in SRC]
    if missing:
        raise SystemExit(f"the shipped SRC table has no {missing} — this "
                         f"script's copy of YEARLESS_REGISTERS has drifted "
                         f"from emit_places.py's")

    print(f"{n:,} labels ship in base/marks.json\n")
    print("BY WHAT EACH YEAR RESTS ON (§YBASIS):")
    byb = collections.Counter(yb[i] for i in range(n))
    for k in sorted(byb):
        held = "  HELD" if YBASIS[k].startswith("NONE") else ""
        print(f"   yb={k} {byb[k]:5,}  {YBASIS[k]}{held}")

    on1906 = [i for i in range(n) if yr[i] <= FLOOR]
    print(f"\n{len(on1906)} labels are written on the {FLOOR} frame:")
    for k, v in collections.Counter(yb[i] for i in on1906).most_common():
        print(f"   yb={k} {v:5,}  {YBASIS[k]}")

    # ── the cohort ──────────────────────────────────────────────────────────
    cohort = [i for i in range(n) if yb[i] == 1 and SRC[src[i]] in YEARLESS]
    print(f"\nTHE BRANCH §HELD DID NOT REACH")
    print(f"   {len(cohort):,} labels come from a register that publishes NO year "
          f"({', '.join(YEARLESS)})")
    print(f"   and are nonetheless dated, off the assessor roll year of the "
          f"footprint underneath.")
    ch1906 = [i for i in cohort if yr[i] <= FLOOR]
    print(f"   {len(ch1906)} of them are written on the {FLOOR} frame.\n")

    # the tell: one bulk roll year over a whole estate
    yc = collections.Counter(yr[i] for i in ch1906)
    for y, c in yc.most_common(4):
        print(f"      {c:3d} of the {len(ch1906)} carry exactly {y}")
    print()
    for i in sorted(ch1906, key=lambda i: (yr[i], name[i]))[:200]:
        print(f"      {yr[i]}  {name[i][:64]}")

    # and the same borrowed number where it is literally the floor
    floor_borrowed = [i for i in range(n) if yb[i] == 1 and yr[i] == FLOOR]
    print(f"\n{len(floor_borrowed)} labels ACROSS ALL REGISTERS carry exactly "
          f"{FLOOR} borrowed off a footprint,")
    print(f"   which is the value build_bldg.py writes when the assessor dates "
          f"nothing. §HELD holds")
    print(f"   that number when the place took it directly (yb=3, "
          f"{byb.get(3,0)} rows) and keeps it when the")
    print(f"   same number arrives through the footprint's roll year.")

    held = sum(1 for i in range(n) if yr[i] == NONE)
    print(f"\nFOR SCALE: {held:,} labels already carry YR_NONE and are written "
          f"only on the un-clocked map.")


if __name__ == "__main__":
    main()
