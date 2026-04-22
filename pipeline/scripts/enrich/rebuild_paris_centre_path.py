#!/usr/bin/env python3
"""
Régénère intégralement `website/src/components/fusion/paris-arrondissements.ts`
depuis l'open data officiel de la Ville de Paris. Produit des paths SVG
parfaitement alignés entre eux — le bug historique du path Paris Centre
(fusion 1er-4e tronquée) est corrigé, et tous les autres arrondissements
sont re-projetés avec la même transformation pour éviter tout décalage
résiduel aux bords.

Algorithme :
  1. Fetch les geojsons des 20 arrondissements depuis opendata.paris.fr
  2. Fusionne les 4 polygones centraux (1, 2, 3, 4 → Paris Centre) par
     annulation d'arêtes partagées (une arête interne apparaît 2×, elle
     s'annule ; seules les arêtes externes restent)
  3. Projette WGS84 → viewBox (0 0 200 140) via une projection linéaire
     dont les bornes sont calibrées sur l'enveloppe de tous les
     arrondissements (pas d'hypothèse de scale fixe → aucun décalage)
  4. Simplifie chaque polygone (suppression des points quasi-colinéaires)
  5. Réécrit `ARRONDISSEMENT_PATHS` et `C_AR_BY_INDEX` d'un coup

Usage:
    python scripts/enrich/rebuild_paris_centre_path.py
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).parent.parent.parent.parent
TS_FILE = REPO_ROOT / "website" / "src" / "components" / "fusion" / "paris-arrondissements.ts"
API = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/arrondissements/records"

# viewBox cible + marges (laisser ~10 unités de respiration autour de Paris)
VIEWBOX_W = 200.0
VIEWBOX_H = 140.0
MARGIN_X = 10.0
MARGIN_Y = 15.0

# Ordre des c_ar dans la sortie — Paris Centre (0) en premier, puis 5→20.
# Le code existant utilise cet ordre dans `C_AR_BY_INDEX`.
OUTPUT_ORDER = [0, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

CENTRAL_ARRS = [1, 2, 3, 4]
SIMPLIFY_TOL = 0.2  # viewBox units


def fetch_arrondissement(c_ar: int) -> list[list[float]]:
    r = requests.get(
        API,
        params={"where": f"c_ar={c_ar}", "select": "c_ar,geom", "limit": 1},
        timeout=30,
    )
    r.raise_for_status()
    body = r.json()
    feat = body["results"][0]["geom"]
    geom = feat.get("geometry", feat)
    coords = geom["coordinates"][0]  # Polygon outer ring
    return coords


def key_point(pt: tuple[float, float]) -> tuple[float, float]:
    return (round(pt[0], 9), round(pt[1], 9))


def merge_polygons(polygons: list[list[list[float]]]) -> list[tuple[float, float]]:
    """Fusionne N polygones adjacents par annulation d'arêtes. Les arêtes
    internes (partagées par 2 polygones) sont éliminées ; il ne reste que
    le contour extérieur, qu'on ré-enchaîne en un polygone fermé."""
    edge_counts: dict[tuple, int] = defaultdict(int)
    edge_dir: dict[tuple, tuple[tuple, tuple]] = {}

    for poly in polygons:
        pts = [key_point((x, y)) for x, y in poly]
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            canon = tuple(sorted((a, b)))
            edge_counts[canon] += 1
            edge_dir[canon] = (a, b)

    external = [edge_dir[e] for e, c in edge_counts.items() if c == 1]
    adj: dict[tuple, list[tuple]] = defaultdict(list)
    for a, b in external:
        adj[a].append(b)
        adj[b].append(a)

    start = external[0][0]
    visited = set()
    path = [start]
    current = start
    prev = None
    while True:
        nexts = [n for n in adj[current] if n != prev and (current, n) not in visited and (n, current) not in visited]
        if not nexts:
            break
        nxt = nexts[0]
        visited.add((current, nxt))
        path.append(nxt)
        prev = current
        current = nxt
        if current == start:
            break

    return path


def compute_projection(all_coords: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    """Calibre une projection linéaire lng/lat → x/y(viewBox) pour que
    l'enveloppe de tous les arrondissements tienne dans la viewBox avec
    les marges prévues. Retourne (A, B, C, D) tels que :
        x = A × lng + B
        y = C × lat + D
    """
    lngs = [c[0] for c in all_coords]
    lats = [c[1] for c in all_coords]
    lng_min, lng_max = min(lngs), max(lngs)
    lat_min, lat_max = min(lats), max(lats)

    avail_w = VIEWBOX_W - 2 * MARGIN_X
    avail_h = VIEWBOX_H - 2 * MARGIN_Y

    # On veut garder le ratio géographique réel (Paris lng span ≈ 0.12 ×
    # cos(48.85) × lat span ≈ 0.08 pour respecter l'aspect ratio).
    cos_lat = 0.659  # cos(48.85°)
    # Scale horizontal (degré lng → unité viewBox)
    scale_lng = avail_w / (lng_max - lng_min)
    # Scale vertical (degré lat → unité viewBox) — ajusté pour aspect ratio
    scale_lat_target = scale_lng / cos_lat
    # Mais on doit aussi tenir dans avail_h
    scale_lat_fit = avail_h / (lat_max - lat_min)
    # On prend le plus contraignant (pour que ça rentre)
    if scale_lat_target * (lat_max - lat_min) > avail_h:
        # Le lat fit impose : on réduit le lng scale en conséquence
        scale_lat = scale_lat_fit
        scale_lng = scale_lat * cos_lat
    else:
        scale_lat = scale_lat_target

    # Centrage
    used_w = scale_lng * (lng_max - lng_min)
    used_h = scale_lat * (lat_max - lat_min)
    offset_x = (VIEWBOX_W - used_w) / 2 - scale_lng * lng_min
    offset_y = (VIEWBOX_H - used_h) / 2 - scale_lat * lat_min

    # y inversé : lat max (nord) → y petit
    A = scale_lng
    B = offset_x
    C = -scale_lat
    D = VIEWBOX_H - offset_y  # inverse pour flipper

    return (A, B, C, D)


def project(lng: float, lat: float, coeffs: tuple[float, float, float, float]) -> tuple[float, float]:
    A, B, C, D = coeffs
    x = A * lng + B
    y = C * lat + D
    return (round(x, 1), round(y, 1))


def simplify(points: list[tuple[float, float]], tol: float = 0.2) -> list[tuple[float, float]]:
    if len(points) < 4:
        return points
    result = [points[0]]
    i = 0
    while i < len(points) - 2:
        a = result[-1]
        c = points[i + 2]
        b = points[i + 1]
        dx, dy = c[0] - a[0], c[1] - a[1]
        length = (dx * dx + dy * dy) ** 0.5
        if length < 1e-6:
            result.append(b)
            i += 1
            continue
        perp = abs(dx * (a[1] - b[1]) - (a[0] - b[0]) * dy) / length
        if perp > tol:
            result.append(b)
        i += 1
    result.append(points[-1])
    return result


def points_to_svg_path(points: list[tuple[float, float]]) -> str:
    if not points:
        return ""
    parts = [f"M{points[0][0]},{points[0][1]}"]
    for x, y in points[1:]:
        parts.append(f"L{x},{y}")
    parts.append("Z")
    return "".join(parts)


def main():
    print("Fetching arrondissements 1-20 from opendata.paris.fr…")
    raw: dict[int, list[list[float]]] = {}
    for c in range(1, 21):
        raw[c] = fetch_arrondissement(c)
        print(f"  {c}e : {len(raw[c])} points")

    print("\nMerging 1-4 → Paris Centre via edge cancellation…")
    paris_centre = merge_polygons([raw[c] for c in CENTRAL_ARRS])
    print(f"  merged contour : {len(paris_centre)} points")

    print("\nCalibrating projection on global envelope…")
    all_coords = []
    for c in range(1, 21):
        all_coords.extend(raw[c])
    coeffs = compute_projection(all_coords)
    print(f"  A={coeffs[0]:.2f}  B={coeffs[1]:.2f}  C={coeffs[2]:.2f}  D={coeffs[3]:.2f}")

    print("\nProjecting + simplifying each polygon…")
    polygons_by_car: dict[int, list[tuple[float, float]]] = {}
    for c in range(1, 21):
        if c in CENTRAL_ARRS:
            continue
        projected = [project(lng, lat, coeffs) for lng, lat in raw[c]]
        simplified = simplify(projected, tol=SIMPLIFY_TOL)
        polygons_by_car[c] = simplified
        print(f"  {c}e : {len(simplified)} pts")

    # Paris Centre : convert tuples back to flat coords, project, simplify
    pc_projected = [project(lng, lat, coeffs) for lng, lat in paris_centre]
    pc_simplified = simplify(pc_projected, tol=SIMPLIFY_TOL)
    polygons_by_car[0] = pc_simplified
    print(f"  Paris Centre (c_ar=0) : {len(pc_simplified)} pts")

    # Build ordered paths + c_ar_by_index
    paths: list[str] = []
    c_ar_by_index: list[int] = []
    for c_ar in OUTPUT_ORDER:
        paths.append(points_to_svg_path(polygons_by_car[c_ar]))
        c_ar_by_index.append(c_ar)

    # Assemble TS file content
    paths_block = ",\n  ".join(f'"{p}"' for p in paths)
    car_block = ", ".join(str(c) for c in c_ar_by_index)
    ts_content = f"""export const ARRONDISSEMENT_PATHS = [
  {paths_block}
];

/**
 * Ordre des zones dans ARRONDISSEMENT_PATHS → numéro d'arrondissement.
 * Index 0 = Paris Centre (fusion 1er-4e depuis 2020).
 * Généré automatiquement par `pipeline/scripts/enrich/rebuild_paris_centre_path.py`.
 */
export const C_AR_BY_INDEX = [{car_block}];
"""

    print(f"\nWriting {TS_FILE}…")
    TS_FILE.write_text(ts_content, encoding="utf-8")
    print(f"  ✅ {len(paths)} polygones écrits ({len(ts_content)} chars).")


if __name__ == "__main__":
    main()
