#!/usr/bin/env python3
"""The 1906 loss schedule, placed — the film's fire.

    python3 pipeline/scripts/us_sf_city/build_fire_losses.py
        -> website/public/data/us/sf/city/film/fire.json

WHAT THIS IS. One scanned page of the *San Francisco Municipal Reports 1906*
(`excerptsfromsanf1908sanf`, the Office of the Mayor's official account of the
disaster) carries a table titled **"Value of Houses Destroyed by Fire"**: the
city's own account of what the fire took from it, structure by structure, with
a survey offset from a named corner to the inch and a value in dollars.

`scratchpad/sf-city-anim/coverage/` parsed it, geocoded it against DataSF
centrelines and validated it against DataSF's 1906 burned-area polygon
`ff3a-iqhv` — see `coverage/FIRE.md` for the method, the OCR repairs and the
checksum. **Nothing is parsed, geocoded or decided here.** This script is
arithmetic and projection only: it reads `fire_losses_geo.json`, converts
lon/lat to the map's own world frame through `manifest.proj`, and writes the
rows the film draws.

WHAT THE RECORD SUPPORTS, AND WHAT IT DOES NOT — this is what the film may
animate and the shape of this file follows it exactly:

  · **36 structures, and every one of them belongs to the Fire Department** —
    sixteen engine houses, a truck house, three chemical houses, two
    corporation yards, a drill tower, three sets of stables, an "Extra House".
    The city enumerated its own property in detail and everyone else's in
    aggregate, so this is NOT the 28,000 buildings the fire took; it is what
    the department that was supposed to fight the fire lost to it.
  · **27 destroyed by fire, 9 damaged by the earthquake only.** The 1906
    clerk's own distinction, and it agrees with `ff3a-iqhv` on all 35 placed
    rows: every fire loss inside the burn line, every quake-only one outside.
  · **NOT A FIRE THAT SPREADS.** `ff3a-iqhv` is one polygon with no time
    field — the final extent. There is no published ignition time for any of
    these structures, so the film may not animate a front moving across the
    city. What it animates is the schedule being READ: the rows arrive in the
    order the page prints them, which is the record's own order and is stated
    as such on screen and here.
  · **NOT A SETBACK.** Positions sit on the street centreline at the recorded
    offset, on the side the record gives. No setback is applied because none
    is published.
  · **The checksum is carried, not smoothed.** 26 of the 27 destroyed values
    parse and sum to $355,000 against the report's stated $380,000; Engine
    House No. 38's figure was lost at an OCR column break and is implied at
    exactly $25,000. That implication is carried in `usdImplied` and is NEVER
    added into `usd`, so a running total drawn from `usd` is the sum of what
    was actually read off the page.

Deterministic: same input bytes give byte-identical output.
"""
from __future__ import annotations

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from _srcload import MOCK, ROOT  # noqa: E402

SRC = MOCK / "coverage" / "fire_losses_geo.json"
OUT = ROOT / "website" / "public" / "data" / "us" / "sf" / "city" / "film"

SOURCE_URL = "https://archive.org/details/excerptsfromsanf1908sanf"
BURN_URL = "https://data.sfgov.org/d/ff3a-iqhv"


def main() -> None:
    proj = json.loads(
        (ROOT / "website" / "public" / "data" / "us" / "sf" / "city"
         / "manifest.json").read_text()
    )["proj"]
    kx = proj["mpd"] * proj["cosl"]
    ky = proj["mpd"]
    lon0, lat0 = proj["lon0"], proj["lat0"]

    rows = json.loads(SRC.read_text())

    out = []
    for r in rows:
        # A row with no coordinate cannot be drawn. It is counted in `meta`
        # rather than dropped silently: three rows failed the street join when
        # FIRE.md was written and one still does.
        if not r.get("position"):
            continue
        lon, lat = r["position"]
        out.append({
            "n": r["name"],
            "fire": r["fate"] == "destroyed_by_fire",
            "x": round((lon - lon0) * kx, 2),
            "y": round((lat - lat0) * ky, 2),
            "usd": r.get("value_usd"),
            "usdImplied": r.get("value_implied_by_table_total"),
            "st": r.get("storeys"),
            "mat": r.get("material"),
        })

    burned = [r for r in rows if r["fate"] == "destroyed_by_fire"]
    read_usd = sum(r["value_usd"] or 0 for r in burned)

    payload = {
        "meta": {
            "generated_by": "pipeline/scripts/us_sf_city/build_fire_losses.py",
            "source": "San Francisco Municipal Reports 1906, Office of the Mayor — "
                      "table \"Value of Houses Destroyed by Fire\"",
            "source_url": SOURCE_URL,
            "method": "scratchpad/sf-city-anim/coverage/FIRE.md — OCR repair, "
                      "survey-offset parse, historical rename, intersection "
                      "geocode against DataSF centrelines 3psu-pn9h",
            "validation": "every fire loss falls inside DataSF's 1906 burned-area "
                          "polygon and every quake-only loss falls outside it",
            "validation_url": BURN_URL,
            "order": "the order the page prints the schedule in. There is no "
                     "published ignition time for any of these structures, so "
                     "this is the order of a table being read and NOT the order "
                     "they caught fire.",
            "world": "x and y are world METRES in the map's own frame — "
                     "((lon - proj.lon0) * proj.mpd * proj.cosl, "
                     "(lat - proj.lat0) * proj.mpd). manifest.proj's own constants.",
        },
        "counts": {
            "inSchedule": len(rows),
            "placed": len(out),
            "burned": len(burned),
            "quakeOnly": len(rows) - len(burned),
            "burnedPlaced": sum(1 for r in out if r["fire"]),
        },
        "total": {
            "read": read_usd,
            "stated": 380000,
            "note": "the report prints its own total of $380,000. 26 of the 27 "
                    "destroyed values parse and sum to $355,000; Engine House "
                    "No. 38's figure was lost at an OCR column break and is "
                    "implied at exactly $25,000, which is carried on that row "
                    "and never added into a value read off the page.",
        },
        "losses": out,
    }

    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "fire.json"
    path.write_text(json.dumps(payload, separators=(",", ":"), sort_keys=False) + "\n")
    print(f"wrote {path}  {path.stat().st_size:,} bytes")
    print(f"  {payload['counts']['placed']} placed of {payload['counts']['inSchedule']}, "
          f"{payload['counts']['burnedPlaced']} of them burned; "
          f"${read_usd:,} read against ${payload['total']['stated']:,} stated")


if __name__ == "__main__":
    main()
