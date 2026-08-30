#!/usr/bin/env python3
"""THE RAIL THIS CITY RUNS ON, WHICH THE MAP HAS NEVER DRAWN.

`base/terrain`, `strt/*`, `bldg/*`, `tree/*` and `water1/*` are the whole of
the shipped fabric, and none of them carries a rail. The street network comes
from DataSF `3psu-pn9h` centrelines, `h8n7-e4ns` right of way and `emxt-b6yg`
kerbs; none of the three has a track in it. So San Francisco — a city whose
cable cars are on its own seal — has been drawn without one.

── WHAT IS PUBLISHED, AND WHICH LINES ARE RAIL ──────────────────────────────
DataSF `9exe-acju`, "Muni Simple Routes": 135 route patterns with a
`lineabbr`. The rail lines are named by that column and nothing here guesses:

    cable car          CA (California), PH (Powell-Hyde), PM (Powell-Mason)
    historic streetcar F
    light rail         J, K, L, M, N, T

and the patterns the same dataset publishes as BUS working the same corridor —
`FBUS`, `KBUS`, `NBUS`, `TBUS`, `LOWL`, `NOWL` — are excluded by name for the
same reason: the column says what they are.

── AND EACH PIECE OF TRACK CARRIES THE YEAR THE CITY PAID TO LAY IT ─────────
The geometry is TODAY'S. The dates are not, and they are not guessed either:
`pipeline/seeds/sf_rail_opened.json` carries a year per line quoted from the
Board of Supervisors' own record of paying for its construction -- the Church
street line's Contract No. 23 in 1917, Eaton & Smith's fifth payment on the
Twin Peaks tunnel line in 1918, their first on Taraval in 1919, their fourth on
Ocean View track and paving in 1925, their second on the Sunset line in 1928,
and the Board's own hearing on "the new T-Third Street MUNI line" in 1917-2007
order. So the network arrives as the city built it, the same way `streets.ts`
draws a right of way from the year the Board is recorded accepting it.

THE GATE IS THE TRACK, NOT THE ROUTE'S NAME. The F was branded in 1995 and
Market Street has carried rail since the 1860s; gating the F's steel at 1995
would leave Market bare for ninety years of a century that had five streetcar
lines on it. A line whose alignment predates the map's first year gets year 0,
which the reader draws from the beginning -- the same convention `streets.ts`
uses for a street its record is silent about. The cable franchises are 19th
century and the scanned Journal begins in 1906, so 0 is the honest answer
rather than a citation that cannot exist.

WHAT THIS STILL IS NOT: the network only ever GREW here. San Francisco's
streetcar system peaked around 1920, most of it privately run by the Market
Street Railway, and what was torn up is not in today's geometry and so cannot
be drawn. The 1920s will read emptier than the city was. That is the same
limitation the streets already carry -- a demolished street is not drawn
either -- and it is a floor on what this shows, not a claim about the city.

`data_as_of` is carried for PROVENANCE and must never become the gate. It is a
publication timestamp, not a fact about the network: the reader did key on it
once, which made the test `year >= 2026` and produced present-only behaviour
purely by accident.

── THE TRACK IS DEDUPED, BECAUSE A PATTERN IS NOT A TRACK ───────────────────
A pattern is one direction of one line, so inbound and outbound lie on the
same rails and several lines share a corridor — Market Street carries five.
Drawn raw that is the same steel five times, z-fighting. So segments are
quantised to 2 m, undirected, and merged.

  python3 build_rail.py
"""
from __future__ import annotations

import json
import pathlib
import urllib.request

RAIL = {
    "CA": "cable", "PH": "cable", "PM": "cable",
    "F": "streetcar",
    "J": "metro", "K": "metro", "L": "metro",
    "M": "metro", "N": "metro", "T": "metro",
}
SRC = "https://data.sfgov.org/resource/9exe-acju.geojson?$limit=5000"
OPENED = pathlib.Path(
    "/Users/daniel/code/open-public-data/pipeline/seeds/sf_rail_opened.json"
)
MANIFEST = pathlib.Path(
    "/Users/daniel/code/open-public-data/website/public/data/us/sf/city/manifest.json"
)
OUT = pathlib.Path(
    "/Users/daniel/code/open-public-data/website/public/data/us/sf/city/base/rail.json"
)
# 2 m: under a track gauge, over the coordinate noise between two patterns
SNAP_M = 2.0


def main() -> None:
    P = json.loads(MANIFEST.read_text())["proj"]
    mx = P["mpd"] * P["cosl"]

    req = urllib.request.Request(SRC, headers={"User-Agent": "qipu-rail/1"})
    with urllib.request.urlopen(req, timeout=180) as r:
        gj = json.loads(r.read())
    feats = gj["features"]
    print(f"{len(feats)} patterns")

    opened = json.loads(OPENED.read_text())["lines"]
    missing = sorted(k for k in RAIL if k not in opened)
    if missing:
        raise SystemExit(f"no opening year seeded for {missing}")

    # a corridor keeps the FIRST kind that claims it and the EARLIEST year of
    # any line that runs on it: a piece of track exists from the moment the
    # first line to use it was built, whoever else joined later.
    seen: dict[tuple, str] = {}
    year: dict[tuple, int] = {}
    as_of = ""
    lines: set[str] = set()
    for f in feats:
        p = f["properties"]
        ab = p.get("lineabbr")
        kind = RAIL.get(ab)
        if kind is None:
            continue
        lines.add(ab)
        as_of = max(as_of, str(p.get("data_as_of") or ""))
        g = f["geometry"]
        parts = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        for part in parts:
            prev = None
            for lon, lat in part:
                x = (lon - P["lon0"]) * mx
                y = (lat - P["lat0"]) * P["mpd"]
                cur = (round(x / SNAP_M), round(y / SNAP_M))
                if prev is not None and prev != cur:
                    key = (prev, cur) if prev < cur else (cur, prev)
                    seen.setdefault(key, kind)
                    y = int(opened[ab]["year"])
                    if key not in year or y < year[key]:
                        year[key] = y
                prev = cur

    segs = [
        [a[0] * SNAP_M, a[1] * SNAP_M, b[0] * SNAP_M, b[1] * SNAP_M, k, year[(a, b)]]
        for (a, b), k in seen.items()
    ]
    total_m = sum(
        ((s[2] - s[0]) ** 2 + (s[3] - s[1]) ** 2) ** 0.5 for s in segs
    )
    print(f"rail lines: {sorted(lines)}")
    print(f"{len(segs):,} deduped segments, {total_m / 1000:.1f} km of track")
    import collections as _c
    by = _c.Counter(s[5] for s in segs)
    run = 0
    print("  track by the year the city paid to lay it:")
    for y in sorted(by):
        run += by[y]
        m = sum(((s[2]-s[0])**2 + (s[3]-s[1])**2) ** 0.5 for s in segs if s[5] == y)
        label = "before the map opens" if y == 0 else str(y)
        print(f"    {label:>20s}  {by[y]:5d} segments  {m/1000:5.1f} km   running {run:5d}")

    OUT.write_text(json.dumps({
        "kinds": ["cable", "streetcar", "metro"],
        "snapM": SNAP_M,
        "asOf": as_of,
        "lines": sorted(lines),
        "trackKm": round(total_m / 1000, 1),
        "segs": [[round(v, 1) if isinstance(v, float) else v for v in s] for s in segs],
        "source": {
            "publisher": "DataSF",
            "dataset": "Muni Simple Routes",
            "id": "9exe-acju",
            "url": "https://data.sfgov.org/Transportation/Muni-Simple-Routes/9exe-acju",
            "what": "route patterns; the rail lines are those whose lineabbr is "
                    "CA/PH/PM (cable car), F (historic streetcar) or J/K/L/M/N/T "
                    "(light rail). The dataset's own bus patterns on the same "
                    "corridors (FBUS, KBUS, NBUS, TBUS, LOWL, NOWL) are excluded.",
            "currency": "the CURRENT geometry. Each segment carries the year "
                        "the Board of Supervisors is recorded PAYING TO BUILD "
                        "that line, from pipeline/seeds/sf_rail_opened.json, so "
                        "the network arrives as the city built it. Year 0 means "
                        "the alignment predates the map's first year. What was "
                        "torn up -- most of the private streetcar system, which "
                        "peaked around 1920 -- is not in today's geometry and so "
                        "is not drawn.",
            "opened": "pipeline/seeds/sf_rail_opened.json",
        },
    }) + "\n")
    print(f"wrote {OUT} {OUT.stat().st_size:,} bytes, asOf {as_of}")


if __name__ == "__main__":
    main()
