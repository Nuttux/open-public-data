#!/usr/bin/env python3
"""A FINER ELEVATION MODEL FOR THE GL RENDERER, AND ONLY FOR IT.

── WHAT IS WRONG WITH THE ONE WE HAVE ───────────────────────────────────────
`base/terrain` is 260 x 260 nodes on the city's own frame, which is a cell of
**53.815 m**. A San Francisco block is about 90 m, so the whole city carries
fewer than two elevation samples per block and every hill is a smooth mound.
Twin Peaks, Bernal, Potrero and Mount Davidson have no ridgeline at all — the
grid cannot express one. It is also stored one byte a node over 0..300 m, a
1.18 m quantum, which is invisible at 53.8 m spacing and would NOT be at 13 m.

── WHY THIS IS A SEPARATE ARTEFACT AND NOT A FINER `base/terrain` ───────────
The Canvas renderer at `/us/city/sf/the-city` rasterises the DEM ON THE CPU —
`lib/city/terrain.ts` §GROUND_PLATE measures it walking **67,081 quads in
226 ms of a 404 ms** whole-city frame. Sixteen times the nodes is sixteen
times that walk, and the PUBLISHED page becomes unusable. So the coarse chunk
stays exactly as it is, byte for byte, and this is an EXTRA the GPU renderer
loads if it is there.

It is deliberately not a catalogue chunk either. `lib/city/data.ts`
§fetchChunk refuses any key the manifest does not carry, so registering it
would mean regenerating the manifest that the published page also reads. An
optional asset fetched by the layer that wants it cannot break anything that
does not ask for it, and absence is simply the old behaviour.

── WHAT IS PUBLISHED ────────────────────────────────────────────────────────
Everything here is USGS 3DEP, the same publisher the coarse DEM and the
surround are already sourced from, fetched over the city's OWN frame so the
two grids share corners exactly. Nothing is invented and nothing is smoothed:
the service resamples, and what it returns is written down.

THE LAND MASK IS NOT TOUCHED. The coarse chunk's mask still decides what is
land, so the coastline, the bay and every rule that keys on them are unchanged
— this replaces relief and nothing else.

  python3 build_terrain_fine.py [--mult 4] [--out <dir>]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import struct
import sys
import urllib.request

import numpy as np

# ── the city's own frame, read off the shipped manifest rather than retyped ──
MANIFEST = pathlib.Path(
    "/Users/daniel/code/open-public-data/website/public/data/us/sf/city/manifest.json"
)
OUT_DIR = pathlib.Path(
    "/Users/daniel/code/open-public-data/website/public/data/us/sf/city/base"
)
SERVICE = (
    "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation"
    "/ImageServer/exportImage"
)


def frame() -> dict:
    m = json.loads(MANIFEST.read_text())
    for c in m["chunks"]:
        if c.get("k") == "base/terrain":
            return c
    raise SystemExit("base/terrain not in the manifest")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mult", type=int, default=4,
                    help="nodes per coarse node, per axis. 4 = 13.45 m cells")
    ap.add_argument("--out", type=pathlib.Path, default=OUT_DIR)
    a = ap.parse_args()

    t = frame()
    P = t["proj"]
    N, zmax = t["w"], t["zmax"]
    assert t["w"] == t["h"] == P["N"], (t["w"], t["h"], P["N"])

    # the frame in world metres, then in degrees through the published projection
    cell = 1.0 / P["s"]
    x0, y0 = P["X0"], P["Y0"]
    x1, y1 = x0 + N * cell, y0 + N * cell
    mx = P["mpd"] * P["cosl"]
    lon0, lon1 = P["lon0"] + x0 / mx, P["lon0"] + x1 / mx
    lat0, lat1 = P["lat0"] + y0 / P["mpd"], P["lat0"] + y1 / P["mpd"]

    M = N * a.mult
    print(f"coarse {N}x{N} at {cell:.3f} m  ->  fine {M}x{M} at {cell / a.mult:.3f} m")
    print(f"bbox {lon0:.6f},{lat0:.6f},{lon1:.6f},{lat1:.6f}")

    url = (
        f"{SERVICE}?bbox={lon0},{lat0},{lon1},{lat1}&bboxSR=4326"
        f"&size={M},{M}&imageSR=4326&format=tiff&pixelType=F32"
        "&noDataInterpretation=esriNoDataMatchAny"
        "&interpolation=RSP_BilinearInterpolation&f=image"
    )
    print("fetching 3DEP ...")
    req = urllib.request.Request(url, headers={"User-Agent": "qipu-terrain/1"})
    with urllib.request.urlopen(req, timeout=600) as r:
        blob = r.read()
    print(f"  {len(blob):,} bytes")

    raw = pathlib.Path("/tmp/sf_3dep_fine.tif")
    raw.write_bytes(blob)
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(raw)
    z = np.asarray(im).astype(np.float64)
    if z.shape != (M, M):
        raise SystemExit(f"service returned {z.shape}, asked for {(M, M)}")

    # ── THE NO-DATA SENTINEL IS +-3.4e38 AND IT COMES BACK BOTH WAYS ───────
    # First cut guarded only the negative side, so the POSITIVE sentinel
    # survived, clipped to the ceiling, and 2,576 pixels came out at exactly
    # 300 m — above Mount Davidson, which at 282 m is the highest ground in
    # the city. A DEM whose maximum is exactly the clip is a DEM that is
    # wrong, and it is worth saying so rather than shipping a smooth lie.
    #
    # So the test is a plausible RANGE and not a floor: anything outside it is
    # no-data and becomes sea level. The bay itself is 14 % of the frame and
    # comes back negative or absent; zero is right there, and the coarse
    # chunk's mask is what actually decides land in the renderer anyway.
    ok = np.isfinite(z) & (z > -100.0) & (z < 400.0)
    print(f"  no-data / out of range: {(~ok).sum():,} of {ok.size:,} px")
    z = np.where(ok, z, 0.0)
    z = np.clip(z, 0.0, float(zmax))

    # THE TIFF'S FIRST ROW IS THE NORTH EDGE and the city's frame counts Y up,
    # so it is flipped here rather than in the renderer, where it would be one
    # more thing to remember.
    z = np.flipud(z)

    # ── SIXTEEN BITS, NOT EIGHT, AND THE REASON IS THE NEW SPACING ──────────
    # One byte over 0..300 m is a 1.18 m step. At 53.8 m spacing that is well
    # under the slope between neighbours and cannot be seen. At 13.45 m it is
    # comparable to it, and a quantised height field TERRACES — the hillside
    # comes out as steps, which is the defect this exists to remove.
    q = np.rint(z * (65535.0 / zmax)).astype(np.uint16)

    a.out.mkdir(parents=True, exist_ok=True)
    binp = a.out / "terrain-fine.bin"
    binp.write_bytes(q.tobytes(order="C"))

    meta = {
        "w": M, "h": M, "zmax": zmax,
        "cellM": cell / a.mult,
        "mult": a.mult,
        "dtype": "u16le",
        "encoding": "metres = v / 65535 * zmax",
        "extent": [x0, y0, x1, y1],
        "bbox4326": [lon0, lat0, lon1, lat1],
        "source": {
            "publisher": "USGS",
            "dataset": "3D Elevation Program (3DEP) ImageServer exportImage",
            "url": SERVICE,
            "what": "elevation, float32 metres, resampled by the service onto the "
                    "city's own 260-node frame at {}x per axis".format(a.mult),
            "licence": "USGS: USGS-authored or produced data and information are "
                       "in the public domain",
        },
        "note": "The land MASK is not here. base/terrain's mask still decides "
                "what is land, so the coastline and everything keyed on it are "
                "unchanged; this carries relief only.",
    }
    # ── AND THE THING THE RENDERER ACTUALLY USES: A RESIDUAL NORMAL MAP ────
    # The terrain MESH stays at 260 nodes. Rebuilding it at 1040 means redoing
    # the coast refinement, the hem fade and the sub-vertex maps in
    # layers/terrain.ts, which is the most interlocking file in the renderer;
    # that is a real project and not a safe unattended one.
    #
    # A normal map gets most of the LOOK for none of that risk, because what
    # reads as "the hills have no detail" at these cameras is shading, not
    # silhouette: at the city stop a 53.8 m cell is about five pixels across,
    # so the outline barely changes, while the surface is one flat facet.
    #
    # IT IS BUILT FROM THE RESIDUAL, AND THAT IS THE WHOLE TRICK. terrain.ts
    # gives the ground straight-UP normals on purpose, because the hillshade is
    # already baked into the vertex colours and a second one would double it.
    # So the low frequencies the coarse grid ALREADY carries are subtracted
    # here, and what ships is only the detail 53.8 m cannot express. Nothing is
    # shaded twice, and the map is zero wherever the two grids agree.
    coarse_up = np.repeat(np.repeat(z[::a.mult, ::a.mult], a.mult, 0), a.mult, 1)
    coarse_up = coarse_up[:M, :M]
    resid = z - coarse_up
    # gradient in metres per metre, over the FINE cell
    fcell = cell / a.mult
    gy, gx = np.gradient(resid, fcell)
    nz = np.ones_like(gx)
    L = np.sqrt(gx * gx + gy * gy + nz * nz)
    # tangent-space normal, +Z up, packed the way three expects
    nmap = np.stack([(-gx / L), (-gy / L), (nz / L)], axis=-1)
    png = np.rint((nmap * 0.5 + 0.5) * 255.0).clip(0, 255).astype(np.uint8)
    Image.fromarray(png, mode="RGB").save(a.out / "terrain-normal.png", optimize=True)
    meta["normalMap"] = {
        "file": "terrain-normal.png",
        "what": "tangent-space normal of the RESIDUAL between the fine grid and "
                "the coarse one the mesh is already built at, so the shading it "
                "adds is exactly what 53.815 m cannot express",
        "residual_rms_m": float(np.sqrt((resid ** 2).mean())),
        "residual_p99_m": float(np.percentile(np.abs(resid), 99)),
    }
    print(f"  residual rms {meta['normalMap']['residual_rms_m']:.2f} m, "
          f"p99 {meta['normalMap']['residual_p99_m']:.2f} m")

    (a.out / "terrain-fine.json").write_text(json.dumps(meta, indent=1) + "\n")

    # what actually changed, so the claim in the commit is measured
    coarse_step = z[::a.mult, ::a.mult]
    print(f"wrote {binp.name} {binp.stat().st_size:,} bytes")
    print(f"  elevation 0..{z.max():.1f} m")
    print(f"  fine   mean |slope| between neighbours: {np.abs(np.diff(z, axis=0)).mean():.3f} m")
    print(f"  coarse mean |slope| between neighbours: {np.abs(np.diff(coarse_step, axis=0)).mean():.3f} m")


if __name__ == "__main__":
    main()
