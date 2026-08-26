"""Every constant that is a measurement of San Francisco, wired to its instrument.

    python3 pipeline/scripts/us_sf_city/derive/wiring.py

── WHAT THIS IS FOR ─────────────────────────────────────────────────────────
ADR-0012 §2.2 names the failure this closes, and `check_city_free.py` cannot see
it: a number that is really a name. `-8192`, `1849`, `2.9`, `0.42`. No city token,
so no grep finds them, and **they degrade silently rather than failing** — a
second city inherits the number, the map looks plausible, and nothing anywhere
says the measurement was never re-run.

`derive/README.md` recovered the instruments. This is the table that connects
each instrument to the number it produced AND to the file that consumes it, and
CHECKS BOTH:

  1. every instrument named below is a file that exists;
  2. every consumer named below still holds the value stated here.

If somebody changes `ROT_DEG` without re-running the bearing sheet, (2) fails and
prints the harness they owe. If somebody deletes a harness, (1) fails and prints
the constants that just lost their justification.

── WHY THE CONSUMERS ARE READ AND NEVER WRITTEN ─────────────────────────────
Four of the five constants live in `website/src/lib/city/`, which this pass does
not edit. That is not a workaround, it is the right shape: **the pipeline is a
reasonable place to keep the derivation table and a terrible place to keep the
values.** The values belong where they are used. So this reads those files and
asserts; it never touches them.

── WHAT IT DELIBERATELY DOES NOT CLAIM ──────────────────────────────────────
Passing does not mean the numbers are right for this city, and it certainly does
not mean they are right for another. `derive/README.md` states plainly that NONE
of the recovered harnesses runs today — every one drives a prototype page that no
longer exists. **What is recovered is the METHOD, not a working tool**, and this
table's job is to make sure the method is still findable from the number.
"""
from __future__ import annotations

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent            # .../us_sf_city/derive
CITY = HERE.parent                                        # .../us_sf_city
REPO = HERE.parents[3]


class Wire:
    """One constant: what it is, what measured it, and who reads it."""

    def __init__(self, name, value, *, instrument, method, consumers, caveat=None):
        self.name = name
        self.value = value
        self.instrument = instrument      # paths relative to derive/
        self.method = method
        self.consumers = consumers        # (path relative to repo, literal to find)
        self.caveat = caveat


# ── MEASURED: an instrument exists and the next city runs it ─────────────────
WIRED = [
    Wire("LOD_Z0", 1.55,
         instrument=["lod_probe.py", "MEASURED-lod.md"],
         method="the zoom at which the MEDIAN building projects to 1.6 px. The probe "
                "reads cam/UPBB/UD off the live page and reports median projected "
                "width per zoom; 1.55 is where that median crosses 1.6.",
         consumers=[("website/src/lib/city/buildings.ts", "export const LOD_Z0 = 1.55;"),
                    ("pipeline/scripts/us_sf_city/encode_city_chunks.py",
                     'name="Z_BUILDINGS (LOD_Z0)"')]),

    Wire("LOD_Z1", 2.35,
         instrument=["lod_probe.py", "MEASURED-lod.md"],
         method="2.4 px on the same sweep.",
         caveat="PARTIAL. The sweep gives the table; 'the first width at which a house "
                "is separable from its party wall' is a JUDGEMENT over that table and "
                "not an output of it.",
         consumers=[("website/src/lib/city/buildings.ts", "export const LOD_Z1 = 2.35;")]),

    Wire("DETAIL_PXM", 2.0,
         instrument=["zoom_citydetail.py", "MEASURED-detail.md"],
         method="a Sobel edge-length sweep: render into a blank canvas over z = 2.35…112, "
                "measure edge length per 1,000 m² inside a 240 m world square, take the "
                "deepest zoom still within 5 % of peak on three frames.",
         consumers=[("website/src/lib/city/camera.ts", "export const DETAIL_PXM = 2.0;")]),

    Wire("SA_DEFAULT", 0.42,
         instrument=["tilt_framing.py"],
         method="a framing sweep. SAS 0.50 → 0.34 at 1440×940, projecting the terrain "
                "mask's bbox and reporting what fraction of the frame the city fills: "
                "0.828 at 0.50, 0.738 at 0.42.",
         consumers=[("website/src/lib/city/projection.ts", "export const SA_DEFAULT = 0.42;")]),

    Wire("SA_FRAMING_FLOOR", 0.4099,
         instrument=["tilt_framing.py"],
         method="the crossing point of the same sweep — where the fill fraction passes "
                "0.72 — EXPORTED so a test can read it.",
         caveat="THE PATTERN WORTH COPYING: the bound is a published output of the "
                "measurement, not a remembered number.",
         consumers=[("website/src/lib/city/projection.ts",
                     "export const SA_FRAMING_FLOOR = 0.4099;")]),

    Wire("ROT_DEG", 315,
         instrument=["orient_truth.py", "orient_sheet.py", "orient_finalists.py",
                     "orient_faces315.py", "orient_cost.py", "orient_hitdiag.py",
                     "tilt_facadeink.py"],
         method="a bearing contact sheet with landmark ground truth run through the real "
                "proj(), plus the painted-wall cost at 210 against 315.",
         caveat="315 is north-up and generic. THE ACCEPTED COST IS NOT: it is one city's "
                "two street grids traded against each other (contract F3).",
         consumers=[("website/src/lib/city/projection.ts", "export const ROT_DEG = 315;")]),

    Wire("roof band quartiles (hq)", "12 numbers",
         instrument=["roof_bands.py"],
         method="genuine per-band quartiles of hgt_mediancm over 166,166 footprints, "
                "computed at build time and published in manifest.buildings.hq.",
         consumers=[("pipeline/scripts/us_sf_city/encode_city_chunks.py",
                     '"hq": ROOFD["hq"]')]),

    Wire("RSHADE amplitude", "±14 %",
         instrument=["roof_tonelab.py", "MEASURED-roof-tone.md"],
         method="a contact sheet at flat / ±8 / ±14 / ±20 %.",
         caveat="NOT A MEASUREMENT. The write-up says it was 'chosen by looking'. It is "
                "recorded as a taste decision with a rendered basis, and must not be "
                "quoted as measured.",
         consumers=[]),
]


# ── DECLARED: nothing measures these, and that is the finding ────────────────
# From derive/README.md's own list. They may not be carried into a portable core
# as-is, because there is nothing for a second city to re-run.
DECLARED = [
    ("bldg.yr base year 1849",
     [("website/src/lib/citygl/bldg.ts", "1849")],
     "one byte offset by one city's founding, so the FORMAT cannot represent a "
     "building older than a number nobody wrote down. The manifest already "
     "publishes year0 per chunk and the client ignores it."),
    ("PITCH_RUN_MULT [1.95, 1.6, 1.3, 1.0]",
     [("website/src/lib/city/roofs.ts",
       "const PITCH_RUN_MULT: readonly number[] = [1.95, 1.6, 1.3, 1.0];")],
     "ADR-0012 §5.0 says it comes from an inradius fit. IT DOES NOT. What exists is "
     "a prose argument, one worked example and a convexity census; 1.95 is the "
     "hand-picked top of a descending try-ladder."),
    ("HEIGHT_BANDS [9, 15, 25]",
     [("website/src/lib/city/roofs.ts",
       "export const HEIGHT_BANDS: readonly number[] = [9, 15, 25];")],
     "OVERSTATED in ADR-0012 §5.0. roof_bands.py is real and produces the QUARTILES "
     "INSIDE the bands; the band CUT POINTS are asserted in MEASURED-height-bands.md "
     "with a storey cross-check offered afterwards. No sweep and no fit chooses "
     "9, 15 or 25. This is the clearest case in the repository of a harness "
     "existing next to a number it does not actually produce."),
    ("ZSTEPS [1, 2.9, 7.2]",
     [("website/src/lib/city/camera.ts",
       "export const ZSTEPS: readonly number[] = [1, 2.9, 7.2];")],
     "the comment says only 'the three named stops the piece shipped with'. VZ_T0 = 2.9 "
     "is ADR-0012 §4.5's coincidental-equality hazard: the street layer gated on the "
     "tree threshold because it happens to equal ZSTEPS[1] at this city's numbers."),
    ("MINZ / MAXZ",
     [("website/src/lib/city/camera.ts", "export const MINZ = 1;"),
      ("website/src/lib/city/camera.ts", "export const MAXZ = 12;")],
     "prose rationale only. 'Past ~8x no new detail arrives' is asserted, not measured "
     "— and zoom_citydetail.py is exactly the harness that could measure it."),
    ("SNAP_PX / MARCH_SLACK_M / FOOT_CELL_M",
     [("website/src/lib/citygl/pick.ts", "const SNAP_PX = 18;"),
      ("website/src/lib/citygl/pick.ts", "const MARCH_SLACK_M = 40;"),
      ("website/src/lib/citygl/pick.ts", "const FOOT_CELL_M = 40;")],
     "declared guards inside the otherwise exemplary pick.ts, whose two OTHER constants "
     "are the example this whole exercise is aiming at — re-expressed as derivations "
     "from the city's own shipped rings, so no measurement has to be stored at all."),
    ("the grid box ORIGIN / NX / NY",
     [("pipeline/scripts/us_sf_city/_grid.py", "EXTENT_M = float(")],
     "LIFTED 2026-08-26. It was -8192 / 16 / 16 in the shared module with cells_of() "
     "raising outside it. It is an argument now, citymap.grid.for_extent() derives it "
     "from a bounding box, and the value that stayed is declared in this city's file."),
]


def main() -> int:
    ok = True
    print(f"  {len(WIRED)} wired constants, {len(DECLARED)} with no derivation\n")

    print("  ── MEASURED ─────────────────────────────────────────────────────")
    for w in WIRED:
        print(f"\n  {w.name} = {w.value}")
        for inst in w.instrument:
            p = HERE / inst
            mark = "ok  " if p.exists() else "MISS"
            if not p.exists():
                ok = False
            print(f"    {mark} instrument  derive/{inst}")
        print(f"         {w.method}")
        if w.caveat:
            print(f"         ! {w.caveat}")
        for rel, literal in w.consumers:
            p = REPO / rel
            if not p.exists():
                ok = False
                print(f"    MISS consumer    {rel}  (file not found)")
                continue
            found = literal in p.read_text()
            if not found:
                ok = False
            print(f"    {'ok  ' if found else 'DRIFT'} consumer    {rel}")
            if not found:
                print(f"         expected to find: {literal}")
                print(f"         if the value changed, RE-RUN: "
                      f"{', '.join('derive/' + i for i in w.instrument)}")

    print("\n  ── DECLARED — NOTHING MEASURES THESE ────────────────────────────")
    for name, consumers, why in DECLARED:
        print(f"\n  {name}")
        print(f"    {why}")
        for rel, literal in consumers:
            p = REPO / rel
            here = p.exists() and literal in p.read_text()
            print(f"    {'still there' if here else 'MOVED     '}  {rel}")

    print("\n  PASS — every instrument is on disk and every consumer still holds "
          "the value it was\n         measured at."
          if ok else
          "\n  FAIL — see MISS/DRIFT above.")
    print("\n  This does NOT mean the numbers are right for another city. "
          "derive/README.md:\n  none of these harnesses runs today — what is recovered "
          "is the METHOD, not a tool.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
