#!/usr/bin/env python3
"""Does the published record carry a HEIGHT over the freeway centrelines?

    python3 pipeline/scripts/us_sf_city/diag_freeway_deck.py

Read-only. Measures before anything is drawn, because the claim under test —
"the 2010 LiDAR first return saw the decks, so an elevated structure has a
published height over its own centreline" — is a hypothesis and not a fact
until the two files are actually joined.

THE TWO FILES
  `geo/cache/streets.json`   DataSF 3psu-pn9h, 17,170 centrelines with
                             `classcode`: 1 = freeway mainline, 6 = ramp.
  `bldg/cache/fp-*.json`     DataSF ynuv-fyni, 177,023 footprints. It is the
                             LiDAR-derived file and it publishes, per polygon:
                               peak_1st_m      peak FIRST RETURN, metres
                               hgt_mediancm    median of (first return - bare
                                               earth) inside the polygon
                               gnd_mincm       bare earth minimum
                               p2010_zmin/zmaxn88ft   NAVD88 envelope

WHAT IS AND IS NOT BEING ASKED. `ynuv-fyni` is a file of BUILDING footprints.
If a freeway deck is not a building, it is not in it, and no amount of joining
will conjure one. So the join is run and REPORTED EITHER WAY: a mainline
kilometre with no footprint over it is a measurement that the record does not
support drawing a structure there, and that is the answer, not a failure.
"""
from __future__ import annotations

import ast
import json
import math
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
MOCK = ROOT / "scratchpad" / "sf-city-anim"

LAT0 = 37.76
MPD_LAT = 111_320.0
MPD_LON = MPD_LAT * math.cos(math.radians(LAT0))

CLASS = {"1": "freeway mainline", "6": "freeway ramp"}
NEAR_M = 120.0          # pass-1 coarse filter
HIT_M = 20.0            # a footprint this close to the centreline is "over" it
STEP_M = 25.0           # centreline sampling interval


def m_xy(lon: float, lat: float) -> tuple[float, float]:
    return (lon + 122.438) * MPD_LON, (lat - LAT0) * MPD_LAT


def densify(coords: list) -> list:
    """Sample a centreline every STEP_M metres, endpoints included."""
    pts = [m_xy(c[0], c[1]) for c in coords]
    out: list[tuple[float, float]] = []
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        d = math.hypot(x1 - x0, y1 - y0)
        n = max(1, int(d / STEP_M))
        for j in range(n):
            t = j / n
            out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    if pts:
        out.append(pts[-1])
    return out


def seg_len(coords: list) -> float:
    pts = [m_xy(c[0], c[1]) for c in coords]
    return sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
               for i in range(len(pts) - 1))


FIRST_XY = re.compile(r"\[(-?\d+\.\d+),\s*(\d+\.\d+)\]")


def main() -> int:
    streets = json.loads((MOCK / "geo" / "cache" / "streets.json").read_text())
    fw = {k: [r for r in streets if r.get("classcode") == k] for k in CLASS}

    print("── the freeway in 3psu-pn9h ──────────────────────────────────────")
    for k, name in CLASS.items():
        rows = fw[k]
        km = sum(seg_len(r["line"]["coordinates"]) for r in rows) / 1000.0
        names = sorted({r.get("streetname", "") for r in rows})
        print(f"  classcode {k}  {name:<18} {len(rows):>4} centrelines  {km:8.2f} km")
        print(f"                 {len(names)} distinct names, e.g. {', '.join(names[:4])}")

    # every sample point on the mainline and the ramps
    samples: dict[str, list] = {}
    for k in CLASS:
        pts = []
        for r in fw[k]:
            for p in densify(r["line"]["coordinates"]):
                pts.append((p[0], p[1], r.get("streetname", ""), r.get("cnn", "")))
        samples[k] = pts
        print(f"  classcode {k}: {len(pts):,} sample points at {STEP_M:.0f} m")

    # ── coarse spatial index over the sample points ──────────────────────
    CELL = NEAR_M
    grid: dict[tuple[int, int], list] = {}
    for k in CLASS:
        for i, (x, y, nm, cnn) in enumerate(samples[k]):
            grid.setdefault((int(x // CELL), int(y // CELL)), []).append((k, i, x, y))

    def near(x: float, y: float):
        cx, cy = int(x // CELL), int(y // CELL)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for it in grid.get((cx + dx, cy + dy), ()):
                    yield it

    # ── pass 1 over the footprints, cheap: first vertex only ─────────────
    files = sorted((MOCK / "bldg" / "cache").glob("fp-*.json"))
    if not files:
        print("no footprint cache under bldg/cache", file=sys.stderr)
        return 2
    cand, total = [], 0
    for f in files:
        for r in json.loads(f.read_text()):
            total += 1
            # `shape` arrives BOTH as a Python-repr string and as a real dict
            # in the same cache — the fetcher changed shape mid-corpus. Handle
            # both rather than skipping half the file silently.
            sh = r.get("shape")
            if isinstance(sh, dict):
                try:
                    c0 = sh["coordinates"][0][0][0]
                    x, y = m_xy(float(c0[0]), float(c0[1]))
                except Exception:
                    continue
            else:
                m = FIRST_XY.search(sh or "")
                if not m:
                    continue
                x, y = m_xy(float(m.group(1)), float(m.group(2)))
            for _k, _i, sx, sy in near(x, y):
                if (x - sx) ** 2 + (y - sy) ** 2 <= NEAR_M * NEAR_M:
                    cand.append(r)
                    break
    print(f"\n── the join ──────────────────────────────────────────────────────")
    print(f"  {total:,} footprints read; {len(cand):,} within {NEAR_M:.0f} m of a "
          f"freeway centreline (first vertex)")

    # ── pass 2: real polygon vertices for the candidates only ────────────
    hit = {k: {} for k in CLASS}          # cnn -> list of (dist, rec)
    for r in cand:
        sh = r.get("shape")
        if isinstance(sh, dict):
            shp = sh
        else:
            try:
                shp = ast.literal_eval(sh)
            except Exception:
                continue
        vs = []
        for poly in shp.get("coordinates", []):
            for ring in poly:
                for c in ring:
                    vs.append(m_xy(c[0], c[1]))
        if not vs:
            continue
        cxm = sum(v[0] for v in vs) / len(vs)
        cym = sum(v[1] for v in vs) / len(vs)
        best = None
        for k, i, sx, sy in near(cxm, cym):
            d2 = (cxm - sx) ** 2 + (cym - sy) ** 2
            if best is None or d2 < best[0]:
                best = (d2, k, i)
        if best is None:
            continue
        d = math.sqrt(best[0])
        if d > HIT_M:
            continue
        k, i = best[1], best[2]
        cnn = samples[k][i][3]
        hit[k].setdefault(cnn, []).append((d, r, samples[k][i][2]))

    def fnum(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    for k, name in CLASS.items():
        rows = fw[k]
        covered = hit[k]
        n_cl = len({r["cnn"] for r in rows})
        print(f"\n  classcode {k} — {name}")
        print(f"    {len(covered)} of {n_cl} centrelines have a footprint within "
              f"{HIT_M:.0f} m of them")
        allh = []
        for cnn, lst in covered.items():
            for d, r, nm in lst:
                pk = fnum(r.get("peak_1st_m"))
                med = fnum(r.get("hgt_mediancm"))
                if pk is not None:
                    allh.append((pk, med, nm, r.get("globalid", "")))
        if not allh:
            print("    NO published height over this class anywhere.")
            continue
        allh.sort(reverse=True)
        print(f"    {len(allh)} footprints, peak first return (m):")
        qs = [allh[int(len(allh) * q)][0] for q in (0.9, 0.5, 0.1)]
        print(f"      p10 {qs[2]:.1f}   p50 {qs[1]:.1f}   p90 {qs[0]:.1f}   "
              f"max {allh[0][0]:.1f}")
        print("    the tallest five, and the run they sit on:")
        for pk, med, nm, gid in allh[:5]:
            print(f"      {pk:7.1f} m first return   median above earth "
                  f"{(med or 0) / 100:5.1f} m   {nm}")

    # ── IS IT A DECK, OR A BUILDING BESIDE THE ROAD? ─────────────────────
    # A deck's polygon CONTAINS the centreline; a building next to the freeway
    # merely sits near it. Nothing else separates the two, and the whole claim
    # turns on which one these are, so it is tested rather than assumed.
    def contains(vs_rings, px, py):
        inside = False
        for ring in vs_rings:
            n = len(ring)
            j = n - 1
            for i in range(n):
                xi, yi = ring[i]
                xj, yj = ring[j]
                if (yi > py) != (yj > py):
                    xx = xi + (py - yi) * (xj - xi) / (yj - yi)
                    if px < xx:
                        inside = not inside
                j = i
        return inside

    print("\n── deck or neighbour? ────────────────────────────────────────────")
    for k, name in CLASS.items():
        n_over, n_beside, areas = 0, 0, []
        for cnn, lst in hit[k].items():
            for d, r, nm in lst:
                sh = r.get("shape")
                shp = sh if isinstance(sh, dict) else ast.literal_eval(sh)
                rings = [[m_xy(c[0], c[1]) for c in ring]
                         for poly in shp.get("coordinates", []) for ring in poly]
                if not rings:
                    continue
                over = any(contains(rings, sx, sy)
                           for _kk, _i, sx, sy in near(sum(v[0] for v in rings[0]) / len(rings[0]),
                                                       sum(v[1] for v in rings[0]) / len(rings[0]))
                           if _kk == k)
                if over:
                    n_over += 1
                else:
                    n_beside += 1
                xs = [v[0] for v in rings[0]]; ys = [v[1] for v in rings[0]]
                areas.append((max(xs) - min(xs)) * (max(ys) - min(ys)))
        print(f"  classcode {k} — {name}")
        print(f"    polygons the centreline runs INSIDE : {n_over}")
        print(f"    polygons merely beside it           : {n_beside}")
        if areas:
            areas.sort()
            print(f"    bbox area m2: p50 {areas[len(areas)//2]:,.0f}  "
                  f"max {areas[-1]:,.0f}")

    # ── the demolished freeways: are they still in the file? ─────────────
    print("\n── the demolished freeways ───────────────────────────────────────")
    want = ("EMBARCADERO", "CENTRAL", "TERRY", "FRANCOIS")
    for r in streets:
        nm = (r.get("streetname") or "").upper()
        if any(w in nm for w in want) and r.get("classcode") in ("1", "6"):
            print(f"  classcode {r['classcode']}  {r.get('streetname')}  "
                  f"cnn {r.get('cnn')}  accepted={r.get('accepted')}")
    keys = sorted({k for r in streets[:1] for k in r})
    print(f"  fields published per centreline: {', '.join(keys)}")
    print("  -> `accepted` is a BOOLEAN, not a year: 3psu-pn9h publishes what is "
          "there NOW and carries no demolition date for anything.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
