"""Emit the REACH chunk: which decisions are not on this map, and the record's
own words for why.

    python3 pipeline/scripts/us_sf_reach/build_reach.py [--check]

Reads  pipeline/scripts/us_sf_reach/reach_seed.json
       scratchpad/sf-city-anim/entries/*.json
Writes website/public/data/us/sf/reach/ledger.json

── WHY THIS CARRIES NO COORDINATES ───────────────────────────────────────
Because the record does not have any. `entries/hetch-hetchy.json` states it
outright: the corpus names O'Shaughnessy Dam, Early Intake, Moccasin, the Coast
Range Tunnel portals and Crystal Springs, but "land is described in section and
township, not in coordinates, so the line still has to be drawn from outside."
`entries/mills-field-sfo.json` is the same — Res. 26816 gives "Sections 34 and
35 of Township 3 South, Range 5 West", which is a survey-grid description, not a
mappable boundary.

So this chunk answers the question the record CAN answer — *is this decision on
the map, and if not, what did the Board say about where it went* — and leaves
the question it cannot. A position may be added later from published geometry
(REACH.md §4); nothing here will be guessed to fill the space in the meantime.

── THE VALIDATION, WHICH IS THE POINT ────────────────────────────────────
Every classification other than `in_city` must cite a beat, and the seed's
`fragment` must appear VERBATIM in that beat's own `quote`. This is the same
discipline as scratchpad/sf-city-anim/verify_quotes.py: the claim is held
against the text it came from, mechanically, every run. A fragment that has
drifted by one character fails the build rather than shipping.

Deterministic: sorted keys, fixed separators, no clock, no network.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
HERE = pathlib.Path(__file__).resolve().parent
ENTRIES = ROOT / "scratchpad/sf-city-anim/entries"
SEED = HERE / "reach_seed.json"
OUT = ROOT / "website/public/data/us/sf/reach/ledger.json"

# The three rings are a MEASURED property of the shipped files, not an opinion.
# Both numbers are read back from the manifest so this comment cannot drift:
#   chunk grid      grid.nx * grid.cell               the ground the camera reaches
#   surround plate  surround.world                    the ground that is loaded
RINGS = {
    "in_frame": "inside the chunk grid — the ground the camera can reach",
    "beyond_frame": "outside the chunk grid, inside the loaded surround plate",
    "beyond_plate": "outside everything the map holds",
}


def load_entries() -> dict:
    out = {}
    for f in sorted(ENTRIES.glob("*.json")):
        d = json.loads(f.read_text())
        out[d["id"]] = d
    return out


def check_fragment(entries, eid, ev, where, errs) -> str | None:
    """The fragment must be in that beat's quote, verbatim."""
    e = entries.get(eid)
    if e is None:
        errs.append(f"{eid}: no such entry")
        return None
    beats = e.get("beats", [])
    i = ev["beat"]
    if not (0 <= i < len(beats)):
        errs.append(f"{eid}: {where} beat {i} out of range (entry has {len(beats)})")
        return None
    q = beats[i].get("quote") or ""
    frag = ev["fragment"]
    if frag not in q:
        errs.append(
            f"{eid}: {where} fragment NOT FOUND in beat {i}'s quote.\n"
            f"        wanted: {frag[:90]!r}\n"
            f"        quote : {q[:120]!r}")
        return None
    return q


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="validate and report; write nothing")
    args = ap.parse_args()

    entries = load_entries()
    seed = json.loads(SEED.read_text())
    man = json.loads((ROOT / "website/public/data/us/sf/city/manifest.json").read_text())

    g, sur = man["grid"], man["surround"]
    grid_km = g["nx"] * g["cell"] / 1000.0
    sx0, sy0, sx1, sy1 = sur["world"]

    errs: list[str] = []
    rows = []
    seen = set()

    for r in seed["rows"]:
        eid = r["id"]
        if eid in seen:
            errs.append(f"{eid}: duplicated in the seed")
        seen.add(eid)
        e = entries.get(eid)
        if e is None:
            errs.append(f"{eid}: no such entry")
            continue

        ev = r.get("evidence")
        if r["reach"] != "in_city" and ev is None and "gap" not in r:
            errs.append(f"{eid}: reach={r['reach']} with neither evidence nor a declared gap")

        out = {
            "id": eid,
            "name": e.get("name"),
            "kind": e.get("kind"),
            "reach": r["reach"],
            "county_named_in_record": r.get("county_named_in_record"),
            "beats": len(e.get("beats", [])),
            # The entry's own honest sentence about whether the shape exists at
            # all. Carried whole: it is better prose than anything generated.
            "geometry_source": e.get("geometry_source"),
            "position": None,
            "position_note": "NO POSITION. The record describes this land in section "
                             "and township, not in coordinates. See REACH.md §4.",
        }

        for key, label in (("evidence", "evidence"), ("corroboration", "corroboration")):
            src = r.get(key)
            if not src:
                continue
            if check_fragment(entries, eid, src, label, errs) is None:
                continue
            b = entries[eid]["beats"][src["beat"]]
            s = b.get("source") or {}
            out[key] = {
                "year": b.get("year"),
                "headline": b.get("headline"),
                "fragment": src["fragment"],
                "note": src.get("note"),
                "item": s.get("item"),
                "leaf": s.get("leaf"),
                "url": s.get("url"),
            }

        if "gap" in r:
            out["gap"] = r["gap"]
        rows.append(out)

    if errs:
        print("REACH SEED FAILED VALIDATION:", file=sys.stderr)
        for e in errs:
            print("  " + e, file=sys.stderr)
        return 1

    by_reach: dict[str, int] = {}
    for r in rows:
        by_reach[r["reach"]] = by_reach.get(r["reach"], 0) + 1

    off_map = [r for r in rows if r["reach"] in ("outside", "annexation", "unstated")]

    payload = {
        "_": "Decisions the Board made that this map does not show. Built by "
             "pipeline/scripts/us_sf_reach/build_reach.py; every classification is "
             "held against the quote it came from at build time.",
        "vocab": seed["_vocab"],
        "extent": {
            "chunk_grid_km": round(grid_km, 3),
            "chunk_grid_note": "the only ground the camera lets a reader reach: "
                               "MINZ = 1 in lib/city/camera.ts stops the pull-back at the "
                               "whole-city fit, and cityBBox() builds the pan clamp from "
                               "the city's own coastline mask.",
            "surround_plate_km": [round((sx1 - sx0) / 1000, 2), round((sy1 - sy0) / 1000, 2)],
            "surround_plate_note": "already shipped, already loaded, currently unreachable: "
                                   "US Census TIGERweb shoreline + USGS 3DEP elevation, "
                                   f"{sur['landCells']:,} land cells.",
            "measured_pullback_limit_z": 0.76,
            "measured_pullback_note": "measured by pipeline/scripts/us_sf_reach/reach_zsweep.py: "
                                      "below z ~0.76 the surround plate's own rectangular edge "
                                      "enters the frame and the world becomes a slab on paper. "
                                      "That is ~26 km across, against the ~36 km a frame would "
                                      "need to hold the airport.",
        },
        "counts": {
            "entries_total": len(entries),
            "entries_classified": len(rows),
            "by_reach": dict(sorted(by_reach.items())),
            "off_map": len(off_map),
            "off_map_beats": sum(r["beats"] for r in off_map),
        },
        "rows": sorted(rows, key=lambda r: r["id"]),
    }

    if args.check:
        print(f"OK — {len(rows)} rows validated against {len(entries)} entries")
        print(f"   by reach: {payload['counts']['by_reach']}")
        print(f"   off the map: {len(off_map)} entries, "
              f"{payload['counts']['off_map_beats']} beats")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=1, sort_keys=False,
                              ensure_ascii=False) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}  ({OUT.stat().st_size:,} bytes)")
    print(f"   {len(rows)} rows, by reach: {payload['counts']['by_reach']}")
    print(f"   off the map: {len(off_map)} entries, "
          f"{payload['counts']['off_map_beats']} beats")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
