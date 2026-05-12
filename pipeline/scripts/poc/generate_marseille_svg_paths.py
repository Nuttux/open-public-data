#!/usr/bin/env python3
"""
Génère `website/src/components/fusion/marseille-arrondissements.ts` à partir
du GeoJSON de la Métropole AMP (16 arrondissements de Marseille).

Source : data.ampmetropole.fr — contours-geographiques-des-communes-et-arrondissements-municipaux
Filtre : statut='arrondissement municipal' AND insee_com_simple='13055'.

Projection linéaire simple (pas Mercator, pas de déformation visible à
l'échelle d'une commune) :
  x = (lon - LON_MIN) / (LON_MAX - LON_MIN) * W + MARGIN
  y = (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * H + MARGIN  (Y SVG inversé)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.request import urlopen

GEOJSON_URL = (
    "https://data.ampmetropole.fr/api/explore/v2.1/catalog/datasets/"
    "contours-geographiques-des-communes-et-arrondissements-municipaux/exports/geojson"
)
OUT_TS = (
    Path(__file__).parent.parent.parent.parent
    / "website" / "src" / "components" / "fusion" / "marseille-arrondissements.ts"
)

# SVG viewBox dimensions (matches roughly Paris choropleth scale).
W, H = 220, 220
MARGIN = 8


def fetch_geojson() -> dict:
    print(f"  fetching {GEOJSON_URL}")
    with urlopen(GEOJSON_URL, timeout=30) as resp:
        return json.load(resp)


def filter_marseille_arrondissements(gj: dict) -> list[dict]:
    feats = []
    for f in gj.get("features", []):
        p = f.get("properties", {})
        statut = (p.get("statut") or "").lower()
        commune = str(p.get("insee_com_simple", ""))
        if statut == "arrondissement municipal" and commune == "13055":
            feats.append(f)
    feats.sort(key=lambda f: int(f["properties"].get("com_arm_current_code", "0")))
    return feats


def bbox(features: list[dict]) -> tuple[float, float, float, float]:
    lon_min = lat_min = float("inf")
    lon_max = lat_max = float("-inf")

    def walk(coords):
        nonlocal lon_min, lat_min, lon_max, lat_max
        if isinstance(coords, (list, tuple)) and coords and isinstance(coords[0], (int, float)):
            lon, lat = coords[0], coords[1]
            lon_min = min(lon_min, lon)
            lat_min = min(lat_min, lat)
            lon_max = max(lon_max, lon)
            lat_max = max(lat_max, lat)
            return
        for c in coords:
            walk(c)

    for f in features:
        walk(f["geometry"]["coordinates"])
    return lon_min, lat_min, lon_max, lat_max


def project_factory(b: tuple[float, float, float, float]):
    lon_min, lat_min, lon_max, lat_max = b
    span_lon = lon_max - lon_min
    span_lat = lat_max - lat_min
    # Preserve aspect ratio by scaling on the bigger span.
    aspect = (W - 2 * MARGIN) / (H - 2 * MARGIN)
    geo_aspect = span_lon / span_lat * (1 / 1.36)  # very rough lat→km correction at 43°
    if geo_aspect > aspect:
        scale = (W - 2 * MARGIN) / span_lon
    else:
        scale = (H - 2 * MARGIN) / span_lat

    used_w = span_lon * scale
    used_h = span_lat * scale
    off_x = (W - used_w) / 2
    off_y = (H - used_h) / 2

    def project(lon: float, lat: float) -> tuple[float, float]:
        x = (lon - lon_min) * scale + off_x
        y = (lat_max - lat) * scale + off_y
        return x, y

    return project


def ring_to_path(ring: list, project) -> str:
    parts = []
    for i, (lon, lat) in enumerate(ring):
        x, y = project(lon, lat)
        parts.append(f"{'M' if i == 0 else 'L'}{x:.1f},{y:.1f}")
    parts.append("Z")
    return "".join(parts)


def feature_to_paths(f: dict, project) -> list[str]:
    g = f["geometry"]
    if g["type"] == "Polygon":
        rings = g["coordinates"]
        return [ring_to_path(rings[0], project)]  # outer ring only
    if g["type"] == "MultiPolygon":
        paths = []
        for poly in g["coordinates"]:
            paths.append(ring_to_path(poly[0], project))
        return paths
    return []


def simplify_ring(ring: list, tolerance: float = 0.0002) -> list:
    """Tiny Douglas-Peucker-ish simplification to keep the file under 50 KB."""
    if len(ring) <= 5:
        return ring

    def perp(p, a, b):
        ax, ay = a
        bx, by = b
        px, py = p
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
        t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
        t = max(0, min(1, t))
        cx, cy = ax + t * dx, ay + t * dy
        return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5

    def dp(start: int, end: int) -> list:
        if end <= start + 1:
            return []
        idx = start + 1
        dmax = 0.0
        for i in range(start + 1, end):
            d = perp(ring[i], ring[start], ring[end])
            if d > dmax:
                idx = i
                dmax = d
        if dmax > tolerance:
            return dp(start, idx) + [idx] + dp(idx, end)
        return []

    keep = [0] + dp(0, len(ring) - 1) + [len(ring) - 1]
    return [ring[i] for i in keep]


def main() -> int:
    gj = fetch_geojson()
    feats = filter_marseille_arrondissements(gj)
    print(f"  Marseille arrondissements: {len(feats)}")
    if len(feats) != 16:
        print(f"  ⚠ expected 16, got {len(feats)} — continuing anyway")

    b = bbox(feats)
    print(f"  bbox: lon=[{b[0]:.4f},{b[2]:.4f}]  lat=[{b[1]:.4f},{b[3]:.4f}]")
    project = project_factory(b)

    # Simplify rings before projection (geographic units) to keep the file lean.
    arr_data = []
    for f in feats:
        p = f["properties"]
        code = int(p["com_arm_current_code"])
        arr_num = code - 13200
        g = f["geometry"]
        if g["type"] == "Polygon":
            rings = [simplify_ring(g["coordinates"][0])]
        elif g["type"] == "MultiPolygon":
            rings = [simplify_ring(poly[0]) for poly in g["coordinates"]]
        else:
            rings = []
        paths = [ring_to_path(r, project) for r in rings]
        arr_data.append((arr_num, paths))

    arr_data.sort(key=lambda x: x[0])

    lines = []
    lines.append("// Auto-generated from data.ampmetropole.fr — do NOT edit by hand.")
    lines.append("// Regen: `python pipeline/scripts/poc/generate_marseille_svg_paths.py`.")
    lines.append("//")
    lines.append(f"// SVG viewBox: 0 0 {W} {H}")
    lines.append(f"// Source bbox: lon=[{b[0]:.4f},{b[2]:.4f}]  lat=[{b[1]:.4f},{b[3]:.4f}]")
    lines.append("")
    lines.append(f"export const MARSEILLE_VIEWBOX = '0 0 {W} {H}';")
    lines.append("")
    lines.append("export const MARSEILLE_GEO_BBOX = {")
    lines.append(f"  lonMin: {b[0]:.6f},")
    lines.append(f"  latMin: {b[1]:.6f},")
    lines.append(f"  lonMax: {b[2]:.6f},")
    lines.append(f"  latMax: {b[3]:.6f},")
    lines.append("} as const;")
    lines.append("")
    lines.append("// Project a (lon, lat) WGS84 point into the SVG viewBox so markers can")
    lines.append("// be placed consistently with the arrondissement paths above.")
    lines.append("export function projectMarseille(lon: number, lat: number): { x: number; y: number } {")
    lines.append("  const { lonMin, latMin, lonMax, latMax } = MARSEILLE_GEO_BBOX;")
    lines.append(f"  const W = {W};")
    lines.append(f"  const H = {H};")
    lines.append(f"  const MARGIN = {MARGIN};")
    lines.append("  const spanLon = lonMax - lonMin;")
    lines.append("  const spanLat = latMax - latMin;")
    lines.append("  const aspect = (W - 2 * MARGIN) / (H - 2 * MARGIN);")
    lines.append("  const geoAspect = (spanLon / spanLat) / 1.36;")
    lines.append("  const scale = geoAspect > aspect ? (W - 2 * MARGIN) / spanLon : (H - 2 * MARGIN) / spanLat;")
    lines.append("  const usedW = spanLon * scale;")
    lines.append("  const usedH = spanLat * scale;")
    lines.append("  const offX = (W - usedW) / 2;")
    lines.append("  const offY = (H - usedH) / 2;")
    lines.append("  return { x: (lon - lonMin) * scale + offX, y: (latMax - lat) * scale + offY };")
    lines.append("}")
    lines.append("")
    lines.append("// Array index = arrondissement number (1..16). Each entry is a list of")
    lines.append("// SVG path strings (MultiPolygon parts → multiple paths).")
    lines.append("export const MARSEILLE_ARRONDISSEMENT_PATHS: { arr: number; paths: string[] }[] = [")
    for arr_num, paths in arr_data:
        lines.append(f"  {{ arr: {arr_num}, paths: [")
        for p in paths:
            lines.append(f'    "{p}",')
        lines.append("  ] },")
    lines.append("];")
    lines.append("")

    OUT_TS.write_text("\n".join(lines), encoding="utf-8")
    size_kb = OUT_TS.stat().st_size // 1024
    print(f"  → {OUT_TS} ({size_kb} KB, {len(arr_data)} arrondissements)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
