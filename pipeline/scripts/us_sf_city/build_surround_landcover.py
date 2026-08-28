#!/usr/bin/env python3
"""WHAT THE REGIONAL LAND ACTUALLY IS, BECAUSE THE MAP WAS GUESSING IT.

`layers/surround.ts` draws every acre outside the city's own DEM — the Marin
headlands, the East Bay hills, the peninsula running south — and it colours all
of it from ONE quantity: the cell's elevation, lerped between a low sand and a
high sand. Nothing in that says whether a cell is redwood forest, a reservoir,
a subdivision or a salt marsh, because elevation cannot say it.

Reported from the page: *"some areas now look just like someone put a color and
thats it theres no detail, no texture nothing."* Two things were tried before
this and both are recorded in `scratchpad/gl-night/PLAN.md` with their numbers:

  * a detail NORMAL map from real 3DEP over the regional frame moved 0.57 % of
    the frame at NINE times its honest strength. This land is lit nearly
    head-on with all-up normals, so SHADING is not the lever.
  * a per-node colour mottle moved 4.43 %, which helped and did not cure it —
    it varies the tone of a wrong colour.

What is missing is not shading and not noise. It is that the map does not know
what is growing there. That is a data gap, and this closes it.

── WHAT IS PUBLISHED ────────────────────────────────────────────────────────
MRLC / USGS **NLCD 2021 Land Cover** for the conterminous US, 30 m, served as
WMS by the Multi-Resolution Land Characteristics consortium. It is the standard
national land cover product and it is public domain.

The WMS returns a STYLED image rather than class numbers, so the classes are
recovered from the colours — and that is only safe because the server publishes
its own colour map, which this script fetches (`request=GetStyles`) instead of
carrying a remembered copy of the NLCD legend. Every returned pixel must match
an entry of that colour map EXACTLY or the run fails: no nearest-colour guess,
no tolerance. Measured over this frame, 16 distinct colours come back and all
16 are exact colour-map entries, so the recovery is lossless.

── WHAT IS SHIPPED, AND AT WHAT GRAIN ───────────────────────────────────────
The surround mesh carries one colour per 110 x 139 m cell, so a class per pixel
is finer than anything that can be drawn. NLCD is fetched at 4x the cell grid
(1664 x 1120, ~31 m, which is NLCD's own resolution) and reduced to the FRACTION
of each cell that is each of eight families. A cell is then a blend rather than
a single winning class, so a wooded hillside running down into grass reads as a
gradient instead of a checkerboard of 110 m squares.

Fractions are bytes, 255 = the whole cell. **They do not have to sum to 255.**
The remainder is the part of the cell NLCD does not cover — open Pacific beyond
the L48 boundary — and a cell with no coverage at all keeps the elevation tint
the map already used, because the honest answer there is "not known" rather than
a colour picked to fill the hole.

The eight families, and every NLCD class folded into each, are declared in
FAMILIES below. The COLOURS are not here: they are art direction and they live
with the rest of the palette in `lib/city/terrain.ts`, so both renderers move
together.

  python3 build_surround_landcover.py
"""
from __future__ import annotations

import io
import json
import pathlib
import re
import urllib.request

import numpy as np
from PIL import Image

ROOT = pathlib.Path("/Users/daniel/code/open-public-data")
MANIFEST = ROOT / "website/public/data/us/sf/city/manifest.json"
OUT_DIR = ROOT / "website/public/data/us/sf/city/base"

WMS = "https://www.mrlc.gov/geoserver/mrlc_display/ows"
LAYER = "NLCD_2021_Land_Cover_L48"

#: how many NLCD samples per surround cell, per axis. 4 -> ~31 m, which is
#: NLCD's own 30 m grid: asking for more would only resample the same pixels.
MULT = 4

#: the eight families, in shipped byte order, and the NLCD classes in each.
#: The split is by how the ground READS from above, which is why evergreen is
#: kept apart from the other forest (Marin's conifer is far darker than oak
#: woodland) and why pasture sits with grassland rather than with crops.
FAMILIES: list[tuple[str, tuple[int, ...], str]] = [
    ("water",     (11,),                 "open water: reservoirs, lakes, the bay"),
    ("wetland",   (90, 95),              "woody and emergent wetland, incl. the South Bay marsh"),
    ("conifer",   (42,),                 "evergreen forest"),
    ("broadleaf", (41, 43),              "deciduous and mixed forest, incl. oak woodland"),
    ("shrub",     (51, 52),              "shrub and scrub, incl. coastal chaparral"),
    ("grass",     (71, 72, 73, 74, 81, 82), "grassland, herbaceous, pasture and crop"),
    ("developed", (21, 22, 23, 24),      "developed, all four intensities"),
    ("barren",    (31, 32),              "barren rock, sand and clay; unconsolidated shore"),
]
NF = len(FAMILIES)


def colormap() -> dict[tuple[int, int, int], int]:
    """The server's OWN colour map — never a remembered copy of the legend."""
    url = f"{WMS}?service=WMS&version=1.1.1&request=GetStyles&layers={LAYER}"
    req = urllib.request.Request(url, headers={"User-Agent": "qipu-landcover/1"})
    with urllib.request.urlopen(req, timeout=120) as r:
        sld = r.read().decode("utf-8")
    out: dict[tuple[int, int, int], int] = {}
    for m in re.finditer(
        r'ColorMapEntry\s+color="#([0-9a-fA-F]{6})"[^>]*?quantity="(\d+)"', sld
    ):
        h, q = m.group(1), int(m.group(2))
        out[(int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))] = q
    if not out:
        raise SystemExit("the server returned no colour map")
    print(f"colour map: {len(out)} entries from the server's own SLD")
    return out


def fetch(bbox: tuple[float, float, float, float], w: int, h: int) -> Image.Image:
    lon0, lat0, lon1, lat1 = bbox
    url = (
        f"{WMS}?service=WMS&version=1.1.1&request=GetMap&layers={LAYER}"
        f"&srs=EPSG:4326&bbox={lon0},{lat0},{lon1},{lat1}"
        f"&width={w}&height={h}&format=image/png"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "qipu-landcover/1"})
    with urllib.request.urlopen(req, timeout=600) as r:
        blob = r.read()
    print(f"  {len(blob):,} bytes")
    return Image.open(io.BytesIO(blob)).convert("RGB")


def main() -> None:
    man = json.loads(MANIFEST.read_text())
    s = man["surround"]
    W, H = s["w"], s["h"]
    bbox = tuple(s["bbox"])  # lon0, lat0, lon1, lat1
    MW, MH = W * MULT, H * MULT
    print(f"surround {W}x{H} cells at {s['cellW']:.1f} x {s['cellH']:.1f} m")
    print(f"fetching NLCD 2021 at {MW}x{MH} (~{s['cellW'] / MULT:.1f} m) ...")

    cmap = colormap()
    im = fetch(bbox, MW, MH)
    if im.size != (MW, MH):
        raise SystemExit(f"server returned {im.size}, asked {MW}x{MH}")
    a = np.asarray(im, dtype=np.uint8)

    # ── recover the class of every pixel, and REFUSE any colour that is not
    #    the server's. A tolerance here would silently invent land cover.
    key = (a[:, :, 0].astype(np.int32) << 16) | (a[:, :, 1].astype(np.int32) << 8) | a[:, :, 2]
    cls = np.zeros((MH, MW), dtype=np.int16) - 1
    for (r, g, b), q in cmap.items():
        cls[key == ((r << 16) | (g << 8) | b)] = q
    # white is the WMS background where NLCD has no coverage: the open Pacific
    # beyond the L48 land boundary. Not a class, and not guessed at.
    nodata = key == 0xFFFFFF
    cls[nodata] = 0
    bad = cls < 0
    if bad.any():
        seen = {tuple(int(v) for v in c) for c in a[bad][:20]}
        raise SystemExit(
            f"{int(bad.sum()):,} px matched no colour-map entry, e.g. {sorted(seen)[:8]}"
        )
    print(f"  every pixel recovered; {int(nodata.sum()):,} px ({100 * nodata.mean():.2f} %) "
          "outside NLCD coverage")

    # ── THE IMAGE'S FIRST ROW IS THE NORTH EDGE AND THE FRAME COUNTS Y UP ──
    # `build_terrain_fine.py` says it in the same words and for the same
    # reason, and the first cut of this script did not do it. The result was
    # not a crash and not an obviously broken picture: it was REAL land cover
    # drawn on the WRONG HILLS, mirrored about the frame's middle latitude, and
    # it read as plausible variation. A wrong answer that looks like an
    # improvement is the expensive kind, so the flip happens here, once,
    # rather than in the renderer where it would be one more thing to remember.
    cls = np.flipud(cls)

    # ── reduce to per-cell family fractions ────────────────────────────────
    out = np.zeros((H, W, NF), dtype=np.uint8)
    cells = MULT * MULT
    blocks = cls.reshape(H, MULT, W, MULT).transpose(0, 2, 1, 3).reshape(H, W, cells)
    for fi, (name, codes, _why) in enumerate(FAMILIES):
        hit = np.isin(blocks, codes).sum(axis=2)
        out[:, :, fi] = np.rint(hit * 255.0 / cells).astype(np.uint8)
        print(f"  {name:10s} {100 * hit.sum() / (H * W * cells):6.2f} % of the frame")

    known = out.sum(axis=2, dtype=np.int32)
    blank = int((known == 0).sum())
    print(f"  {blank:,} of {H * W:,} cells ({100 * blank / (H * W):.2f} %) have no "
          "coverage and keep the elevation tint")

    bin_path = OUT_DIR / "surround-landcover.bin"
    bin_path.write_bytes(out.tobytes())
    meta = {
        "w": W,
        "h": H,
        "families": [f[0] for f in FAMILIES],
        "classes": {f[0]: list(f[1]) for f in FAMILIES},
        "what": {f[0]: f[2] for f in FAMILIES},
        "mult": MULT,
        "sampleM": round(s["cellW"] / MULT, 2),
        "dtype": "u8",
        "layout": "row-major cell (j * w + i), then 8 family bytes",
        "encoding": "fraction of the cell that is that family, 255 = all of it",
        "coverage": (
            "the eight bytes need not sum to 255. The remainder is the part of "
            "the cell NLCD does not cover — open Pacific beyond the L48 land "
            "boundary. A cell summing to 0 is NOT KNOWN and the reader keeps "
            "the elevation tint there rather than inventing a colour."
        ),
        "bbox4326": list(bbox),
        "source": {
            "publisher": "MRLC / USGS",
            "dataset": "NLCD 2021 Land Cover (CONUS)",
            "layer": LAYER,
            "url": "https://www.mrlc.gov/data",
            "service": WMS,
            "what": "30 m national land cover, fetched at 4x the surround cell "
                    "grid and reduced to per-cell family fractions",
            "classes_recovered": (
                "the WMS returns a styled image, so classes are recovered from "
                "colours using the colour map the SERVER publishes via "
                "GetStyles. Exact match only — a pixel matching no entry fails "
                "the run."
            ),
            "licence": "USGS: USGS-authored or produced data and information "
                       "are in the public domain",
        },
        "note": (
            "This is land cover, not land USE, and it is 2021 — it describes "
            "the region today and says nothing about any earlier year the map "
            "can be scrubbed to."
        ),
    }
    (OUT_DIR / "surround-landcover.json").write_text(json.dumps(meta, indent=1) + "\n")
    print(f"wrote {bin_path} {bin_path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
