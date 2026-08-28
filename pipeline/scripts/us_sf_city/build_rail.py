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

── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
**It is the network as the dataset describes it, which is TODAY'S.** This map
runs from 1849, and San Francisco's rail was at its largest around 1920 and has
shrunk since; drawing today's eight lines in 1900 would be a lie, and drawing
a 1900 network would be an invention, because no published geometry for it is
in this repo. So the layer that reads this gates it on the dataset's own
`data_as_of`, and the historic network stays an open problem rather than a
guessed one.

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

    seen: dict[tuple, str] = {}
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
                    # a corridor several lines share keeps the first kind that
                    # claims it; cable beats streetcar beats metro only by
                    # arrival order, and the drawn steel is the same either way
                    seen.setdefault(key, kind)
                prev = cur

    segs = [
        [a[0] * SNAP_M, a[1] * SNAP_M, b[0] * SNAP_M, b[1] * SNAP_M, k]
        for (a, b), k in seen.items()
    ]
    total_m = sum(
        ((s[2] - s[0]) ** 2 + (s[3] - s[1]) ** 2) ** 0.5 for s in segs
    )
    print(f"rail lines: {sorted(lines)}")
    print(f"{len(segs):,} deduped segments, {total_m / 1000:.1f} km of track")

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
            "currency": "the CURRENT network. It is not the historic one, and no "
                        "published geometry for the historic network is in this "
                        "repo, so the layer shows this only from asOf.",
        },
    }) + "\n")
    print(f"wrote {OUT} {OUT.stat().st_size:,} bytes, asOf {as_of}")


if __name__ == "__main__":
    main()
