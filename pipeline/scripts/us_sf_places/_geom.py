"""The projection and the ring arithmetic, once.

The projection is the manifest's own — `proj.lon0`, `proj.lat0`, `proj.mpd`,
`proj.cosl` — read out of the shipped manifest rather than typed here, so a
place lands where the map's own buildings land or the build fails.
"""
from __future__ import annotations

import json
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[3]
MANIFEST = ROOT / "website/public/data/us/sf/city/manifest.json"

_p = json.loads(MANIFEST.read_text())["proj"]
LON0: float = _p["lon0"]
LAT0: float = _p["lat0"]
MPD: float = _p["mpd"]
COSL: float = _p["cosl"]
KX: float = MPD * COSL
KY: float = MPD

# The mock computed cosl as cos(radians(lat0)); the manifest carries the value
# it used. If the two ever part company every place moves, so it is asserted.
assert abs(COSL - math.cos(math.radians(LAT0))) < 1e-12, "manifest cosl is not cos(lat0)"


def to_m(lon: float, lat: float) -> tuple[float, float]:
    return ((lon - LON0) * KX, (lat - LAT0) * KY)


def exterior_rings(geom: dict | None) -> list[list[tuple[float, float]]]:
    """Every exterior ring of a (Multi)Polygon, in world metres."""
    if not geom:
        return []
    t = geom.get("type")
    if t == "MultiPolygon":
        polys = geom["coordinates"]
    elif t == "Polygon":
        polys = [geom["coordinates"]]
    else:
        return []
    return [[to_m(c[0], c[1]) for c in p[0]] for p in polys if p and p[0]]


def point_of(geom: dict | None) -> tuple[float, float] | None:
    if not geom:
        return None
    if geom.get("type") == "Point":
        c = geom["coordinates"]
        return to_m(c[0], c[1])
    if geom.get("type") == "MultiPoint" and geom["coordinates"]:
        c = geom["coordinates"][0]
        return to_m(c[0], c[1])
    return None


def ring_area(r: list[tuple[float, float]]) -> float:
    a = 0.0
    n = len(r)
    for i in range(n - 1):
        a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return abs(a) * 0.5


def poly_area(geom: dict | None) -> float:
    """Sum of the exterior rings, holes subtracted, world m2. Same arithmetic
    as `marks/places.py::_area` so the two builds' areas are comparable."""
    if not geom:
        return 0.0
    t = geom.get("type")
    if t == "MultiPolygon":
        polys = geom["coordinates"]
    elif t == "Polygon":
        polys = [geom["coordinates"]]
    else:
        return 0.0
    A = 0.0
    for poly in polys:
        for k, ring in enumerate(poly):
            r = [to_m(c[0], c[1]) for c in ring]
            if len(r) < 4:
                continue
            a = ring_area(r)
            A += a if k == 0 else -a
    return max(A, 0.0)


def centroid(geom: dict | None) -> tuple[float, float] | None:
    """Area-weighted centroid of the exterior rings, world metres."""
    sa = sx = sy = 0.0
    for r in exterior_rings(geom):
        a = px = py = 0.0
        for i in range(len(r) - 1):
            x0, y0 = r[i]
            x1, y1 = r[i + 1]
            cr = x0 * y1 - x1 * y0
            a += cr
            px += (x0 + x1) * cr
            py += (y0 + y1) * cr
        a *= 0.5
        if a == 0:
            continue
        sa += a
        sx += px / 6.0
        sy += py / 6.0
    if sa == 0:
        return point_of(geom)
    return (sx / sa, sy / sa)


def inside(ring: list[tuple[float, float]], px: float, py: float) -> bool:
    c = False
    n = len(ring)
    j = n - 1
    for k in range(n):
        xa, ya = ring[k]
        xb, yb = ring[j]
        if (ya > py) != (yb > py) and px < (xb - xa) * (py - ya) / (yb - ya) + xa:
            c = not c
        j = k
    return c
