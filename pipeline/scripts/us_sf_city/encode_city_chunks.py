#!/usr/bin/env python3
"""Turn the sf-city-anim mock's `*-data.js` payloads into fetched chunks.

    python3 pipeline/scripts/us_sf_city/encode_city_chunks.py
        -> website/public/data/us/sf/city/manifest.json
           website/public/data/us/sf/city/<kind>/<id>.qc

Deterministic: same input bytes give byte-identical output. Nothing here reads
the clock, iterates a set, or depends on the working directory.

The mock is one 15.4 MB page (6.59 MB gzipped) that parses everything before the
first frame. Daniel's decision, PRODUCTION-PLAN.md 2026-08-23, is PROGRESSIVE BY
ZOOM: first paint is terrain, block massing and the coastline; footprints,
facades, street surfaces and trees stream in as the camera needs them. So the
catalogue below has two axes — a TIER (which fields, keyed on zoom) and a CELL
(which 1024 m square) — and nothing is fetched before the camera can show it.

Provenance travels with the data. Every chunk's manifest entry names the
published dataset each of its fields came from, taken from the header comments in
gen/build.py and the `src`/`meta` blocks the mock's own payloads carry. The page
has to keep being able to say where a number came from; that is the whole project.
"""
from __future__ import annotations

import base64
import json
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import numpy as np

from _bldgsrc import read_bldg, rechain
from _chunk import ChunkWriter
from _grid import CELL, NX, NY, ORIGIN_X, ORIGIN_Y, cell_extent, cell_id, cells_of
from _srcload import MOCK, ROOT, load, load_json, unb64

OUT = ROOT / "website" / "public" / "data" / "us" / "sf" / "city"
# Every top-level directory under OUT that THIS script writes, and no other.
# `main()` clears exactly these; see the note there. Adding a chunk key with a
# new prefix means adding it here, and `emit()` asserts that it is listed.
CHUNK_DIRS = ("base", "bldg", "face", "strt", "tree", "water1")

# ── the zoom ladder these tiers are keyed on ────────────────────────────────
# z = cam.scale / cam.base; 1 is "the whole city fits the strip".
# LOD_Z0/LOD_Z1 are lod/BLOCK-L.md's, and neither is a round number: both are
# `median projected width / cam.base`, 1.6 px and 2.4 px respectively.
Z_MASSING = 0.0     # base tier: always
Z_BUILDINGS = 1.55  # LOD_Z0 — the dissolve begins; footprints start arriving
Z_TREES = 2.90      # VZ_T0 in part3 — street trees fade in
Z_STREET = 1.75     # the street SURFACE gate is per-feature px, not a zoom — and this
                    # constant is only the FETCH policy, which has to be satisfied before
                    # the gate can open. It was 2.90, borrowed from Z_TREES, so the data
                    # arrived a whole band after the mock starts drawing carriageway.
                    # Measured: at z=1.75 both builds draw 0 cells; at z=1.80 the mock
                    # draws 1,157 and production drew 0 because the tier was never asked
                    # for. 1.75 is the last zoom at which neither draws, so the chunk is
                    # in hand the moment the per-feature rule opens. See SHELL.md §13.
Z_FACADE = 4.00     # the facade generator engages when a wall is worth openings
Z_WATER1 = 3.00     # the 4x-refined bathymetry
Z_CANOPY = 1.55     # VZ_C0 in part3 — canopy blobs fade in

chunks: list[dict] = []
sources: dict[str, dict] = {}


def src(key: str, **kw) -> str:
    sources.setdefault(key, kw)
    return key


kinds: dict[str, dict] = {}


def emit(w: ChunkWriter, *, tier: str, minZ: float, extent, prov: dict,
         note: str | None = None, extra: dict | None = None) -> None:
    """Write one chunk and record it.

    The SCHEMA — field names, dtypes, provenance, the note — is recorded once per
    KIND, not once per chunk: 562 copies of the same field table was a 732 KB
    manifest, which is larger than the first paint it is supposed to make
    possible. Per-chunk BYTE LAYOUT is not in the manifest at all, because every
    chunk carries its own header saying where each of its fields starts. The
    manifest is the catalogue and the provenance; the chunk header is the layout.
    """
    import gzip as _gz

    blob = w.serialise()
    # a key whose prefix main() does not clear would leave a stale chunk behind
    # on the next run, and the manifest would not name it
    if w.key.split("/")[0] not in CHUNK_DIRS:
        raise ValueError(f"{w.key}: prefix is not in CHUNK_DIRS, so main() will "
                         f"not clear it — add it there first")
    path = OUT / f"{w.key}.qc"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(blob)
    k = kinds.setdefault(w.kind, {
        "fields": [{"n": f["n"], "t": f["t"]} for f in w.fields()],
        "provenance": prov,
        **({"note": note} if note else {}),
    })
    if [f["n"] for f in k["fields"]] != [f["n"] for f in w.fields()]:
        raise ValueError(f"{w.kind}: chunks of one kind must share a field list")
    entry = {
        "k": w.key,
        "kind": w.kind,
        "tier": tier,
        "minZ": minZ,
        "b": len(blob),
        "gz": len(_gz.compress(blob, 9, mtime=0)),
        "e": [round(float(v), 1) for v in extent] if extent else None,
    }
    if extra:
        entry.update(extra)
    chunks.append(entry)


# ═══════════════════════════════════════════════════════════════════════════
# BASE TIER — what the first paint needs and nothing else
# ═══════════════════════════════════════════════════════════════════════════

def encode_terrain(GEO: dict, CITY: dict) -> None:
    """The DEM and its land mask. 260 x 260 on gen_city.py's own frame."""
    dem = GEO["dem"]
    data = unb64(dem["data"])
    mask = unb64(dem["mask"])
    assert len(data) == dem["w"] * dem["h"], (len(data), dem["w"], dem["h"])
    assert len(mask) == (dem["w"] * dem["h"] + 7) // 8
    w = ChunkWriter("base/terrain", "terrain")
    w.add_bytes("dem", "u8", data, len(data))
    w.add_bytes("mask", "u8", mask, len(mask))
    P = CITY["proj"]
    emit(w, tier="base", minZ=Z_MASSING,
         extent=[P["X0"], P["Y0"], P["X0"] + dem["w"] / P["s"], P["Y0"] + dem["h"] / P["s"]],
         prov={
             "dem": src("dem", dataset="6d73-6c4f", publisher="DataSF",
                        what="elevation, 3DEP-derived, resampled to the piece's own 260 x 260 frame",
                        quantised=f"one byte a node over 0..{dem['zmax']} m"),
             "mask": src("dem"),
         },
         extra={"w": dem["w"], "h": dem["h"], "zmax": dem["zmax"], "proj": P},
         note="One byte a node, 0..255 mapped over 0..zmax metres. `mask` is one bit "
              "a node, 1 = land. Both are the mock's own arrays, byte-identical.")


def _rings_to_arrays(rings) -> tuple[np.ndarray, np.ndarray]:
    """[[ [x,y], ... ], ...] -> (ring lengths u32, flat f32 xy)."""
    ln = np.array([len(r) for r in rings], dtype=np.uint32)
    xy = np.array([c for r in rings for c in r], dtype=np.float32).reshape(-1)
    return ln, xy


def encode_coast(CITY: dict) -> None:
    cl, cxy = _rings_to_arrays(CITY["coast"])
    bl, bxy = _rings_to_arrays(CITY["burn"])
    w = ChunkWriter("base/coast", "coast")
    w.add("coastLen", "u32", cl).add("coastXY", "f32", cxy)
    w.add("burnLen", "u32", bl).add("burnXY", "f32", bxy)
    allxy = np.concatenate([cxy, bxy]).reshape(-1, 2)
    emit(w, tier="base", minZ=Z_MASSING,
         extent=[allxy[:, 0].min(), allxy[:, 1].min(), allxy[:, 0].max(), allxy[:, 1].max()],
         prov={
             "coastLen": src("coast", dataset="txuc-3kzm", publisher="DataSF",
                             what="the shoreline"),
             "coastXY": src("coast"),
             "burnLen": src("burn", dataset="ff3a-iqhv", publisher="DataSF",
                            what="the 1906 burned district"),
             "burnXY": src("burn"),
         },
         note="World metres, f32. Ring lengths are VERTEX counts, not byte counts.")


def encode_blocks(GEO: dict, PAINT: dict) -> None:
    """The 5,404 published assessor blocks — the massing tier's atom.

    lod/BLOCK-L.md, measured: the median assessor block is 8.3 x 7.5 px at
    whole-city zoom against 1.02 px for the median building. A block is the
    smallest object on this map that a whole-city pixel can resolve, which is
    why it and not the building is what the first paint draws.

    Which is why `bidx` ships here. The massing tier tones each block, and until
    this field existed the only per-block quantity in the record that could carry
    a tone was massing's mean LIDAR height — a proxy that says how TALL a block
    is, never what colour it is. paint/BLOCK-PAINT.md measured the real thing:
    the block's own roofs, area-weighted, quantised to the buildings' palette.
    5,043 of 5,404 blocks carry it (93.3 %).
    """
    GB = GEO["blocks"]
    n = GB["n"]
    cnt = np.frombuffer(unb64(GB["cnt"]), dtype=np.uint16)
    sc = np.frombuffer(unb64(GB["sc"]), dtype=np.uint8)
    ox = np.frombuffer(unb64(GB["ox"]), dtype=np.float32)
    oy = np.frombuffer(unb64(GB["oy"]), dtype=np.float32)
    vx = np.frombuffer(unb64(GB["vx"]), dtype=np.int16)
    vy = np.frombuffer(unb64(GB["vy"]), dtype=np.int16)
    z = np.frombuffer(unb64(GB["z"]), dtype=np.uint16)
    a = np.frombuffer(unb64(GB["a"]), dtype=np.float32)
    hood = np.frombuffer(unb64(GB["hood"]), dtype=np.uint8)
    # paint/blocks.py, keyed on the SAME 5,404 rings in the SAME canonical order as
    # GEO.blocks — the join is positional and there is no key to check it with, so it
    # is asserted from both ends. An off-by-one here would tone every block with its
    # neighbour's roofs and nothing downstream would raise.
    bidx = np.frombuffer(unb64(PAINT["bidx"]), dtype=np.uint8)
    assert cnt.size == n and ox.size == n and vx.size == int(cnt.sum())
    assert bidx.size == n, f"PAINT.bidx is {bidx.size} blocks, GEO.blocks.n is {n}"
    assert PAINT["nb"] == n, f"PAINT.nb is {PAINT['nb']}, GEO.blocks.n is {n}"
    w = ChunkWriter("base/blocks", "blocks")
    w.add("cnt", "u16", cnt).add("sc", "u8", sc)
    w.add("ox", "f32", ox).add("oy", "f32", oy)
    w.add("vx", "i16", vx).add("vy", "i16", vy)
    w.add("z", "u16", z).add("a", "f32", a).add("hood", "u8", hood)
    w.add("bidx", "u8", bidx)
    emit(w, tier="base", minZ=Z_MASSING,
         extent=[float(ox.min()), float(oy.min()), float(ox.max()), float(oy.max())],
         prov={**{k: src("blocks", dataset="acdm-wktn", publisher="DataSF",
                         what="227,937 active parcels dissolved by assessor block",
                         simplified=f"Douglas-Peucker at {GEO['meta']['blockTol']} m")
                  for k in ("cnt", "sc", "ox", "oy", "vx", "vy", "z", "a", "hood")},
               # NOT acdm-wktn: the ring is the Assessor's, the colour is a measurement
               # off aerial imagery. Its own source key, so the page cites the imagery
               # for the tone and the roll for the shape.
               "bidx": src("block_paint",
                           publisher="Esri World Imagery (ArcGIS Online public tiles)",
                           derived_from=["paint", "acdm-wktn"],
                           script="paint/blocks.py",
                           what="the AREA-WEIGHTED mean of the measured roof colours of the "
                                "buildings standing on the block. Area-weighted because the "
                                "massing solid IS those roofs seen from far away, so a "
                                "2,000 m2 warehouse owns more of those pixels than the "
                                "cottage beside it.",
                           measured="per building, the MEDIAN colour of the published aerial "
                                    "pixels inside the footprint, eroded 1.5 m inward so the "
                                    "sample is roof and not wall or kerb; zoom 18 = "
                                    "0.472 m/px, 8,661 tiles, retrieved 2026-08-23; 166,042 "
                                    "of 166,166 footprints returned a sample (99.9 %)",
                           membership="the block whose published ring CONTAINS the "
                                      "footprint's centroid; 152,242 of the 166,042 sampled "
                                      "footprints landed on one (91.7 %). The rest are solos "
                                      "and made land outside the assessor grid.",
                           quantised="32 palette entries, the same table the buildings use; "
                                     "mean error 5.8 against a median difference of 88 "
                                     "between two randomly chosen SF roofs",
                           coverage="5,043 of 5,404 blocks carry a measured index (93.3 %); "
                                    "the 361 that do not are park, water or right of way and "
                                    "ship 255",
                           not_measured="the roof from above TODAY. Not the colour anyone "
                                        "painted the front, not a claim about roofing "
                                        "material, and not the colour the block was in any "
                                        "past year.")},
         extra={"n": n, "hoodNames": GB["hoodNames"]},
         note="Per block: a ring origin (ox, oy) in world metres and `cnt` vertices "
              "as i16 deltas at scale `sc` (a per-block power-of-two quantiser). "
              "`z` is the ring's ground elevation, `a` its published area in m2, "
              "`hood` an index into hoodNames. Block IDs are strings and live in "
              "blocks-id.json, because nothing in the draw path needs them. "
              "`bidx` is the block's measured roof colour as an index into the SAME "
              "32-entry palette the buildings use — manifest.buildings.palette, dark to "
              "light — so one table tones both tiers and the batch key survives. 255 is "
              "the NOBLOCK sentinel: no sampled building stood on that block (park, water, "
              "right of way), 361 of 5,404, and the renderer must fall back rather than "
              "index the palette with it.")
    (OUT / "base").mkdir(parents=True, exist_ok=True)
    (OUT / "base" / "blocks-id.json").write_text(
        json.dumps({"id": GB["id"], "hoodNames": GB["hoodNames"]},
                   separators=(",", ":"), ensure_ascii=False))


def encode_massing(LODM: dict) -> np.ndarray:
    """lod/build_lod.py's block massing table, and the SOLO bitset.

    45,450 rows over 5,404 blocks: per block, per one of that block's own
    distinct build years, the cumulative built coverage and area-weighted mean
    LIDAR height. No era buckets and no smoothing — a block's mass in 1911 is
    exactly the buildings the roll dates 1911 or earlier, so nothing appears a
    year early or a year late.

    Returns the solo mask so the building encoder can exclude them.
    """
    off = np.frombuffer(unb64(LODM["off"]), dtype=np.uint32)
    ty = np.frombuffer(unb64(LODM["ty"]), dtype=np.uint8)
    tc = np.frombuffer(unb64(LODM["tc"]), dtype=np.uint8)
    th = np.frombuffer(unb64(LODM["th"]), dtype=np.uint8)
    solo_bytes = unb64(LODM["solo"])
    nb = LODM["nb"]
    assert off.size == nb + 1 and ty.size == tc.size == th.size == int(off[-1])
    w = ChunkWriter("base/massing", "massing")
    w.add("off", "u32", off).add("ty", "u8", ty).add("tc", "u8", tc).add("th", "u8", th)
    w.add_bytes("solo", "u8", solo_bytes, len(solo_bytes))
    p = src("massing", derived_from=["ynuv-fyni", "wv5m-vpq2", "acdm-wktn"],
            script="lod/build_lod.py",
            what="cumulative built coverage and area-weighted mean LIDAR height per "
                 "(assessor block, that block's own build year)",
            membership="the block whose published ring CONTAINS the footprint's centroid; "
                       "no nearest-block fallback")
    emit(w, tier="base", minZ=Z_MASSING, extent=None,
         prov={k: p for k in ("off", "ty", "tc", "th", "solo")},
         extra={"nb": nb, "n": LODM["n"], "year0": LODM["year0"], "tallM": LODM["tallM"],
                "rows": int(off[-1])},
         note="`ty` is year - year0. `tc` is coverage x 255. `th` is mean height in "
              "metres. `solo` is one bit per building over LODM.n: 1 = drawn as "
              "itself at every zoom (outside every assessor block, or tall enough "
              "that folding it into a mean would delete the skyline).")
    bits = np.unpackbits(np.frombuffer(solo_bytes, dtype=np.uint8), bitorder="little")
    return bits[:LODM["n"]].astype(bool)


# ═══════════════════════════════════════════════════════════════════════════
# BUILDINGS — solos globally, everything else per cell
# ═══════════════════════════════════════════════════════════════════════════

def _bldg_prov() -> dict:
    geom = src("bldg_geom", dataset="ynuv-fyni", publisher="DataSF",
               what="published building footprints, 166,166 of them",
               quantised="integer world metres (BLDG.q = 1.0)")
    return {
        "gid": src("bldg_index", what="the building's index in bldg-data.js, which every "
                                      "other per-building array in this record is keyed on"),
        "cnt": geom, "vx": geom, "vy": geom, "xi": geom, "xn": geom,
        "h": src("bldg_h", dataset="ynuv-fyni", publisher="DataSF",
                 what="hgt_mediancm, the median LIDAR return over the footprint",
                 quantised="1 m, one byte"),
        "yr": src("bldg_yr", dataset="wv5m-vpq2", publisher="DataSF",
                  what="year_property_built, 85.2 % coverage",
                  quantised="year - 1849, one byte"),
        "u": src("bldg_use", dataset="wv5m-vpq2", publisher="DataSF",
                 what="use_definition folded to 7 classes, plus provenance flags"),
        "st": src("roof_st", dataset="wv5m-vpq2", publisher="DataSF",
                  what="number_of_stories, closed_roll_year 2025; 151,634 of 166,166 (91.3 %)"),
        "hf": src("roof_hf", dataset="ynuv-fyni", publisher="DataSF",
                  what="the SUB-METRE residual of hgt_mediancm that the one-byte whole-metre "
                       "height rounds away. Without it 36.0 % of neighbouring buildings on a "
                       "block draw at exactly the same height, against 0.7 % in the published data."),
        "paintIdx": src("paint", publisher="Esri World Imagery (ArcGIS Online public tiles)",
                        what="the median colour of the published aerial pixels inside each "
                             "footprint, eroded 1.5 m inward so the sample is roof and not wall "
                             "or kerb; zoom 18 = 0.472 m/px, retrieved 2026-08-23; 166,042 of "
                             "166,166 returned a sample",
                        quantised="32 palette entries, mean error 5.8 against a median "
                                  "difference of 88 between two randomly chosen SF roofs",
                        not_measured="the roof from above TODAY. Not the colour anyone painted "
                                     "the front, not a claim about roofing material, and not the "
                                     "colour the building was in any past year."),
        "paintFlag": src(
            "paint_flag", publisher="Esri World Imagery (ArcGIS Online public tiles)",
            what="SAMPLE QUALITY, one bit per condition, NOT a coverage flag: 1 = the "
                 "footprint is more than half tree canopy in the imagery (1,889), 2 = "
                 "more than half deep shadow (829), 4 = no sample was returned and "
                 "paintIdx holds the city median instead (124). 163,480 of 166,166 "
                 "carry none of the three. `paintIdx` is a measurement for every "
                 "building whose bit 4 is CLEAR — 166,042 of 166,166, 99.9 % — which is "
                 "the field a reader of this column wants, and is why the bit names "
                 "ship beside it.",
            not_measured="anything about whether the colour exists. A zero here means "
                         "the sample was CLEAN, not that there was none."),
    }


def encode_buildings(B: dict, ROOFD: dict, PAINT: dict, solo: np.ndarray,
                     PROJ_DOWNTOWN) -> dict:
    n = B["n"]
    cnt, off, IX, IY = B["cnt"], B["off"], B["IX"], B["IY"]
    st = np.frombuffer(unb64(ROOFD["st"]), dtype=np.uint8)   # packed nibbles
    hf = np.frombuffer(unb64(ROOFD["hf"]), dtype=np.uint8)   # packed nibbles
    pidx = np.frombuffer(unb64(PAINT["idx"]), dtype=np.uint8)
    pflag = np.frombuffer(unb64(PAINT["flag"]), dtype=np.uint8)
    assert pidx.size == n and pflag.size == n
    assert st.size == (n + 1) // 2 and hf.size == (n + 1) // 2

    def nib(packed: np.ndarray) -> np.ndarray:
        out = np.empty(n, dtype=np.uint8)
        out[0::2] = packed[: (n + 1) // 2][: out[0::2].size] & 15
        out[1::2] = (packed[: n // 2] >> 4) & 15
        return out

    STN, HFN = nib(st), nib(hf)
    tx, ty = cells_of(B["cx"], B["cy"])
    groups: dict[str, np.ndarray] = {}
    solo_ids = np.nonzero(solo)[0]
    groups["base/solo"] = solo_ids
    rest = np.nonzero(~solo)[0]
    key = tx.astype(np.int64) * NY + ty
    for k in np.unique(key[rest]):
        ids = rest[key[rest] == k]
        groups[f"bldg/{cell_id(int(k) // NY, int(k) % NY)}"] = ids

    prov = _bldg_prov()
    stats = {"cells": 0, "bytes": 0, "gzip": 0, "solo_bytes": 0}
    for name in sorted(groups, key=lambda s: (s.split("/")[0], s)):
        ids = np.sort(groups[name])
        if ids.size == 0:
            continue
        vx, vy, xi, xn = rechain(ids, cnt, off, IX, IY)
        w = ChunkWriter(name, "bldg")
        w.add("gid", "u32", ids)
        w.add("cnt", "u8", cnt[ids])
        w.add("vx", "i8", vx).add("vy", "i8", vy)
        w.add("xi", "u32", xi).add("xn", "u16", xn)
        w.add("h", "u8", B["h"][ids]).add("yr", "u8", B["yr"][ids]).add("u", "u8", B["u"][ids])
        w.add("st", "u8", STN[ids]).add("hf", "u8", HFN[ids])
        w.add("paintIdx", "u8", pidx[ids]).add("paintFlag", "u8", pflag[ids])
        vsel = np.concatenate([np.arange(off[g], off[g] + cnt[g]) for g in ids])
        ext = [float(IX[vsel].min()), float(IY[vsel].min()),
               float(IX[vsel].max()), float(IY[vsel].max())]
        is_solo = name.startswith("base/")
        emit(w, tier="base" if is_solo else "bldg",
             minZ=Z_MASSING if is_solo else Z_BUILDINGS,
             extent=ext, prov=prov, extra={"n": int(ids.size)},
             note=("The 15,261 SOLOS — drawn as themselves at every zoom, and excluded "
                   "from their block's coverage and mean so nothing is counted twice. "
                   "They are NOT repeated in any bldg cell."
                   if is_solo else
                   "Non-solo footprints whose CENTROID falls in this cell. Geometry may "
                   "overhang the cell edge; `extent` is the true bound. The delta chain "
                   "is re-anchored per cell — see _bldgsrc.py."))
        e = chunks[-1]
        if is_solo:
            stats["solo_bytes"] = e["b"]
        else:
            stats["cells"] += 1
            stats["bytes"] += e["b"]
            stats["gzip"] += e["gz"]
    dtx, dty = PROJ_DOWNTOWN
    maxR = float(np.hypot(B["cx"] - dtx, B["cy"] - dty).max())
    return {**stats, "useNames": B["useNames"], "n": n, "nSolo": int(solo.sum()),
            "maxR": round(maxR, 3),
            "palette": PAINT["pal"], "hq": ROOFD["hq"],
            # THE BIT NAMES TRAVEL WITH THE COLUMN. `paintFlag` is a sample-quality
            # byte, not a coverage byte, and a reader who cannot see which bit is
            # which cannot tell a canopied roof from a missing one.
            "paintFlagBits": PAINT["flagBits"],
            "paintSampled": int((pflag & PAINT["flagBits"]["nosample"] == 0).sum())}


def encode_facades(FACD: dict, B: dict, solo: np.ndarray) -> None:
    """facade/build_facade.py's three per-building/per-edge streams.

    The Assessor's own property_class_code read as nine types (147,601 of
    166,166, 88.8 %), the one bit of that column that says THE GROUND FLOOR IS A
    SHOP (6,803), and two bits per ring edge saying whether the edge faces a
    published street centreline or has another published footprint against it.

    A window exists because the roll says the building has three storeys, not
    because windows look nice. Where a distinction cannot be sourced there is an
    honest global treatment and FACD.NOT_MEASURED says so.
    """
    n = B["n"]
    assert FACD["n"] == n
    fty = np.frombuffer(unb64(FACD["ty"]), dtype=np.uint8)
    st2p = np.frombuffer(unb64(FACD["st2"]), dtype=np.uint8)
    shopp = np.frombuffer(unb64(FACD["shop"]), dtype=np.uint8)
    rolep = np.frombuffer(unb64(FACD["role"]), dtype=np.uint8)
    st2 = np.empty(n, dtype=np.uint8)
    st2[0::2] = st2p[: st2[0::2].size] & 15
    st2[1::2] = (st2p[: n // 2] >> 4) & 15
    shop = np.unpackbits(shopp, bitorder="little")[:n]
    rbits = np.unpackbits(rolep, bitorder="little")
    role = (rbits[0::2] + 2 * rbits[1::2])[: B["nv"]].astype(np.uint8)

    cnt, off = B["cnt"], B["off"]
    tx, ty = cells_of(B["cx"], B["cy"])
    key = tx.astype(np.int64) * NY + ty
    prov = {
        "gid": src("bldg_index"),
        "ty": src("fac_ty", dataset="wv5m-vpq2", publisher="DataSF",
                  what="property_class_code read as nine building types; 147,601 of 166,166 (88.8 %)"),
        "st2": src("fac_st2", dataset="wv5m-vpq2", publisher="DataSF",
                   what="the storey supplement — a JOIN CORRECTION, now dead, kept as evidence. "
                        "See the note."),
        "shop": src("fac_shop", dataset="wv5m-vpq2", publisher="DataSF",
                    what="the one bit of property_class_code that says THE GROUND FLOOR IS A SHOP (6,803)"),
        "role": src("fac_role", derived_from=["ynuv-fyni", "3psu-pn9h"],
                    what="two bits per ring EDGE: does the edge face a published street "
                         "centreline (162,305 buildings), and does another published footprint "
                         "stand against it (163,536 of 885,776 edges)"),
    }
    note = (
        "Per building, in this cell's own order, matching bldg/<same id>.qc gid for "
        "gid. `role` is one entry per RING VERTEX (the edge leaving it).\n"
        "THE STOREY SUPPLEMENT (st2): bldg/ingest.py read the footprint file's `mblr` "
        "as mblr[2:9], a fixed seven-character slice, and the storey count inherited "
        "it. But wv5m-vpq2's parcel_number is SEVEN, EIGHT OR NINE characters "
        "(176,031 / 32,003 / 3,513 roll rows), so the slice truncated every parcel on "
        "an assessor block with a letter suffix: block 0460A lot 001 is published as "
        "0460A001 and the slice asked for 0460A00, which matches nothing. The slice "
        "resolved 149,445 footprints (89.9 %); the whole mblr resolves 159,852 "
        "(96.2 %). The truncation was fixed at source on 2026-08-23, so `st` in the "
        "bldg chunk already holds every value this array carries. It is kept because "
        "the two were derived from SEPARATE downloads by separate lookups and they "
        "agree on 9,984 of 9,984 element for element — which is the evidence that the "
        "fix recovered published data rather than invented it. Read `st` first; this "
        "never decides anything.")
    for k in np.unique(key):
        ids = np.sort(np.nonzero((key == k) & ~solo)[0])
        sids = np.sort(np.nonzero((key == k) & solo)[0])
        for who, sel in (("face", ids), ("base/solo-face", sids)):
            if sel.size == 0:
                continue
            name = f"face/{cell_id(int(k) // NY, int(k) % NY)}" if who == "face" else None
            if name is None:
                continue
            w = ChunkWriter(name, "face")
            w.add("gid", "u32", sel)
            w.add("ty", "u8", fty[sel]).add("st2", "u8", st2[sel]).add("shop", "u8", shop[sel])
            vsel = np.concatenate([np.arange(off[g], off[g] + cnt[g]) for g in sel])
            w.add("role", "u8", role[vsel])
            e = cell_extent(int(k) // NY, int(k) % NY)
            emit(w, tier="face", minZ=Z_FACADE, extent=e, prov=prov,
                 extra={"n": int(sel.size)}, note=note)
    # the solos' facades, globally, because the solos themselves are global
    sids = np.sort(np.nonzero(solo)[0])
    w = ChunkWriter("base/solo-face", "face")
    w.add("gid", "u32", sids)
    w.add("ty", "u8", fty[sids]).add("st2", "u8", st2[sids]).add("shop", "u8", shop[sids])
    vsel = np.concatenate([np.arange(off[g], off[g] + cnt[g]) for g in sids])
    w.add("role", "u8", role[vsel])
    emit(w, tier="face", minZ=Z_FACADE, extent=None, prov=prov,
         extra={"n": int(sids.size)},
         note="The solos' facade streams. Matches base/solo.qc gid for gid.\n" + note)
    return {"TYPES": FACD["TYPES"], "NOT_MEASURED": FACD["NOT_MEASURED"], "gates": FACD["gates"]}


# ═══════════════════════════════════════════════════════════════════════════
# WATER — a two-level pyramid, because the published grid is already one
# ═══════════════════════════════════════════════════════════════════════════

WT = 256  # bathymetry tile, nodes


def encode_water(WATD: dict, CTX: dict, PROJ: dict) -> dict:
    """NOAA NCEI bathymetry, sqrt-quantised to one byte a node.

    846,819 water nodes at 27.5 x 34.8 m, deepest 114.05 m at the Golden Gate,
    worst quantiser error 0.452 m. Works of the US government; public domain,
    like the 3DEP elevation the surround itself is built from.

    `mul` is 4: this grid is a 4x REFINEMENT of the surround grid, so every
    fourth node is a node of the coarser published grid. Level 0 is therefore not
    a resampling — it is the published coarse grid, taken exactly. That is the
    only decimation in this encoder that costs nothing in fidelity, and it is
    only available because the source says how it was refined.
    """
    nw, nh, mul = WATD["nw"], WATD["nh"], WATD["mul"]
    # The grid is the SURROUND grid refined 4x, and part3.html refuses to draw it
    # if it is not (`WATD is not a refinement of the surround grid`). So its world
    # frame is the surround's own bbox, mapped through the piece's projection —
    # not a guess and not a new constant.
    assert nw == CTX["w"] * mul + 1 and nh == CTX["h"] * mul + 1, "not a 4x refinement"
    lo0, la0, lo1, la1 = CTX["bb"]
    KX = PROJ["mpd"] * PROJ["cosl"]
    KY = PROJ["mpd"]

    def node_world(i: float, j: float) -> tuple[float, float]:
        return ((lo0 + (lo1 - lo0) * i / (nw - 1) - PROJ["lon0"]) * KX,
                (la0 + (la1 - la0) * j / (nh - 1) - PROJ["lat0"]) * KY)

    dep = np.frombuffer(unb64(WATD["dep"]), dtype=np.uint8)
    assert dep.size == nw * nh == WATD["n"], (dep.size, nw * nh, WATD["n"])
    grid = dep.reshape(nh, nw)
    lo = grid[::mul, ::mul]
    p = src("bathymetry", publisher="NOAA NCEI", url=WATD["src"]["url"],
            retrieved=WATD["src"]["retrieved"], sha256=WATD["src"]["sha256"],
            bbox=WATD["src"]["bbox"],
            what="bathymetry over gen_context.py's own frame and projection",
            quantised=f"sqrt to one byte a node over 0..{WATD['dmax']} m; worst error "
                      f"{WATD['worst_quant_m']} m",
            licence="works of the US government, public domain")
    w = ChunkWriter("base/water0", "water")
    w.add_bytes("dep", "u8", lo.tobytes(), lo.size)
    wx0, wy0 = node_world(0, 0)
    wx1, wy1 = node_world(nw - 1, nh - 1)
    emit(w, tier="base", minZ=Z_MASSING, extent=[wx0, wy0, wx1, wy1], prov={"dep": p},
         extra={"w": int(lo.shape[1]), "h": int(lo.shape[0]), "mul": mul,
                "level": 0, "dmax": WATD["dmax"], "qs": WATD["qs"]},
         note=f"Level 0: every {mul}th node of the shipped grid, which IS the "
              f"published coarse grid the 4x refinement was built from. Not a "
              f"resampling and lossless with respect to that grid. Depth in metres "
              f"= (v/255)^2 * dmax.")
    ntx, nty = (nw + WT - 1) // WT, (nh + WT - 1) // WT
    for j in range(nty):
        for i in range(ntx):
            sub = grid[j * WT:(j + 1) * WT, i * WT:(i + 1) * WT]
            if not sub.any():
                continue          # all land: nothing to draw, nothing to fetch
            w = ChunkWriter(f"water1/{i}_{j}", "water")
            w.add_bytes("dep", "u8", np.ascontiguousarray(sub).tobytes(), sub.size)
            x0, y0 = node_world(i * WT, j * WT)
            x1, y1 = node_world(i * WT + sub.shape[1] - 1, j * WT + sub.shape[0] - 1)
            emit(w, tier="water1", minZ=Z_WATER1, extent=[x0, y0, x1, y1], prov={"dep": p},
                 extra={"level": 1, "gx": i * WT, "gy": j * WT,
                        "w": int(sub.shape[1]), "h": int(sub.shape[0]),
                        "dmax": WATD["dmax"]},
                 note="Level 1: the 4x-refined grid, in node space, not world space. "
                      "gx/gy are the node offsets into the full nw x nh grid.")
    return {"nw": nw, "nh": nh, "mul": mul, "dmax": WATD["dmax"], "qs": WATD["qs"],
            "tile": WT, "deepest_m": WATD["deepest_m"], "water_nodes": WATD["water_nodes"],
            "bbox": list(CTX["bb"]),
            "world": [round(wx0, 1), round(wy0, 1), round(wx1, 1), round(wy1, 1)],
            "note": "Node (i, j) maps to world by linear interpolation over `world`; "
                    "j increases NORTH. Depth in metres = (v/255)^2 * dmax."}


# ═══════════════════════════════════════════════════════════════════════════
# STREETS — 22,191 published rights of way, per cell
# ═══════════════════════════════════════════════════════════════════════════

def _u16(s): return np.frombuffer(unb64(s), dtype=np.uint16)
def _i16(s): return np.frombuffer(unb64(s), dtype=np.int16)
def _u32(s): return np.frombuffer(unb64(s), dtype=np.uint32)
def _u8(s):  return np.frombuffer(unb64(s), dtype=np.uint8)
def _i32(s): return np.frombuffer(unb64(s), dtype=np.int32)


def _decode_rings(S: dict, cn, cl, cf, cd):
    """part3's rings(): n per feature, len per ring, first vertex absolute, rest deltas."""
    OX, OY, Q = S["ox"], S["oy"], S["q"]
    rn = _u8(S[cn]); rl = _u16(S[cl]); rf = _u16(S[cf]); rd = _i16(S[cd])
    nr = rl.size
    tot = int(rl.sum())
    off = np.zeros(nr + 1, dtype=np.int64)
    np.cumsum(rl.astype(np.int64), out=off[1:])
    px = np.zeros(tot, dtype=np.int64)
    py = np.zeros(tot, dtype=np.int64)
    di = 0
    for r in range(nr):
        o = int(off[r]); L = int(rl[r])
        px[o] = rf[r * 2]; py[o] = rf[r * 2 + 1]
        if L > 1:
            dx = rd[di:di + 2 * (L - 1):2].astype(np.int64)
            dy = rd[di + 1:di + 2 * (L - 1):2].astype(np.int64)
            px[o + 1:o + L] = px[o] + np.cumsum(dx)
            py[o + 1:o + L] = py[o] + np.cumsum(dy)
            di += 2 * (L - 1)
    assert di == rd.size, (di, rd.size)
    fo = np.zeros(S["n"] + 1, dtype=np.int64)
    np.cumsum(rn.astype(np.int64), out=fo[1:])
    return {"rn": rn, "rl": rl, "off": off, "fo": fo,
            "wx": OX + px * Q, "wy": OY + py * Q, "ix": px, "iy": py}


def encode_streets(STS: dict) -> dict:
    """street/build_surface.py. h8n7-e4ns publishes the right of way as AREA,
    emxt-b6yg publishes the kerb, and roadway = right of way minus every closed
    kerb ring of emxt-b6yg that meets it. Nothing is offset, buffered or widened;
    the boundary between pavement and carriageway is the published kerb and
    nothing else."""
    _line_sources()
    n = STS["n"]
    R = _decode_rings(STS, "rn", "rlen", "rf", "rxy")
    D = _decode_rings(STS, "dn", "dlen", "df", "dxy")
    kb = _u8(STS["dkb"])
    kbits = np.unpackbits(kb, bitorder="little")[: R["wx"].size + D["wx"].size][: D["wx"].size]
    kind, cls = _u8(STS["kind"]), _u8(STS["cls"])
    cnn = _u32(STS["cnn"])
    wid, fw = _u16(STS["w"]), _u16(STS["fw"])
    yr, imp, krb = _u16(STS["yr"]), _u16(STS["imp"]), _u16(STS["krb"])

    # a feature goes in the cell holding the centroid of its right-of-way rings
    fx = np.zeros(n); fy = np.zeros(n)
    for i in range(n):
        a, b = int(R["fo"][i]), int(R["fo"][i + 1])
        if a == b:
            fx[i] = fy[i] = np.nan
            continue
        v0, v1 = int(R["off"][a]), int(R["off"][b])
        fx[i] = R["wx"][v0:v1].mean(); fy[i] = R["wy"][v0:v1].mean()
    placed = ~np.isnan(fx)
    tx = np.zeros(n, dtype=np.int64); ty = np.zeros(n, dtype=np.int64)
    tx[placed], ty[placed] = cells_of(fx[placed], fy[placed])
    key = np.where(placed, tx * NY + ty, -1)

    prov = {
        "kind": src("street_row", dataset="h8n7-e4ns", publisher="DataSF",
                    what="22,191 published rights of way, as AREA"),
        "cls": src("street_cls", dataset="3psu-pn9h", publisher="DataSF",
                   what="classcode: 2/3 arterial, 4 collector, 5 local residential, "
                        "0 minor and private court"),
        "cnn": src("street_row"),
        "w": src("street_row", **{}) if False else src("street_row"),
        "fw": src("street_row"),
        "yr": src("street_year", publisher="San Francisco Board of Supervisors",
                  what="the year the Board is recorded accepting, paving and kerbing each "
                       "right of way, out of the Journal of Proceedings"),
        "imp": src("street_year"), "krb": src("street_year"),
        "rwLen": src("street_row"), "rwX": src("street_row"), "rwY": src("street_row"),
        "rdLen": src("street_kerb", dataset="emxt-b6yg", publisher="DataSF",
                     what="the published kerb; roadway = right of way minus every closed "
                          "kerb ring that meets it"),
        "rdX": src("street_kerb"), "rdY": src("street_kerb"), "rdKerb": src("street_kerb"),
        "fid": src("street_index", what="the feature's index in street-data.js"),
        "rwN": src("street_row"), "rdN": src("street_kerb"),
    }
    stats = {"cells": 0, "bytes": 0, "gzip": 0, "unplaced": int((~placed).sum())}
    for k in np.unique(key[key >= 0]):
        ids = np.sort(np.nonzero(key == k)[0])
        w = ChunkWriter(f"strt/{cell_id(int(k) // NY, int(k) % NY)}", "strt")
        w.add("fid", "u32", ids)
        w.add("kind", "u8", kind[ids]).add("cls", "u8", cls[ids]).add("cnn", "u32", cnn[ids])
        w.add("w", "u16", wid[ids]).add("fw", "u16", fw[ids])
        w.add("yr", "u16", yr[ids]).add("imp", "u16", imp[ids]).add("krb", "u16", krb[ids])
        for tag, O, bits in (("rw", R, None), ("rd", D, kbits)):
            rn = O["rn"][ids]
            rings = np.concatenate([np.arange(O["fo"][i], O["fo"][i + 1]) for i in ids]) \
                if rn.sum() else np.zeros(0, dtype=np.int64)
            rl = O["rl"][rings] if rings.size else np.zeros(0, dtype=np.uint16)
            vsel = np.concatenate([np.arange(O["off"][r], O["off"][r + 1]) for r in rings]) \
                if rings.size else np.zeros(0, dtype=np.int64)
            w.add(f"{tag}N", "u8", rn).add(f"{tag}Len", "u16", rl)
            w.add(f"{tag}X", "f32", O["wx"][vsel]).add(f"{tag}Y", "f32", O["wy"][vsel])
            if bits is not None:
                pack = np.packbits(bits[vsel].astype(np.uint8), bitorder="little")
                w.add_bytes("rdKerb", "u8", pack.tobytes(), pack.size)
        emit(w, tier="strt", minZ=Z_STREET,
             extent=cell_extent(int(k) // NY, int(k) % NY), prov=prov,
             extra={"n": int(ids.size)},
             note="Right-of-way and roadway rings are stored ABSOLUTE in world metres "
                  "(f32) rather than as the source's per-ring delta chain: a cell holds "
                  "a few hundred rings, the delta chain's gzip win is a whole-file "
                  "effect, and absolute coordinates make a cell independently "
                  "decodable. `rdKerb` is one bit per ROADWAY vertex: is the edge "
                  "leaving it a published KERB (1,961.6 km) or the outer edge of the "
                  "right of way (1,768.9 km)? The far edge of a right of way is a "
                  "property line and is never drawn as a kerb.")
        e = chunks[-1]
        stats["cells"] += 1; stats["bytes"] += e["b"]; stats["gzip"] += e["gz"]

    # islands and stairs are 1,120 and 268 features citywide — global, not tiled
    w = ChunkWriter("base/street-misc", "strt-misc")
    w.add("islandLen", "u16", _u16(STS["iln"])).add("islandXY", "u16", _u16(STS["ixy"]))
    w.add("stairLen", "u16", _u16(STS["sln"])).add("stairXY", "u16", _u16(STS["sxy"]))
    cov = unb64(STS["cov"])
    w.add_bytes("cov", "u8", cov, len(cov))
    emit(w, tier="strt", minZ=Z_STREET, extent=None,
         prov={"islandLen": src("street_row"), "islandXY": src("street_row"),
               "stairLen": src("street_row"), "stairXY": src("street_row"),
               "cov": src("street_cover")},
         extra={"q": STS["q"], "ox": STS["ox"], "oy": STS["oy"],
                "stairNames": STS["snm"], "covn": STS["covn"]},
         note="1,120 published islands and 268 published stair runs, citywide — too few "
              "to tile. Coordinates are u16 at scale q from (ox, oy): world = ox + v*q. "
              "`cov` is one bit per CENTRELINE — NOT per right of way, which this note "
              "said for four blocks and which `covn` = 4,895 refutes. It is indexed by "
              "gen/geo-data.js's own G.streets order, LSB first within each byte, and "
              "street/build_surface.py sets it by testing that centreline's own midpoint "
              "against the published right-of-way polygons.")
    return {**stats, "n": n, "stats": STS["stats"], "cite": STS["cite"]}


# ═══════════════════════════════════════════════════════════════════════════
# STREET CENTRELINES — the city of lines, and the names written along it
# ═══════════════════════════════════════════════════════════════════════════
#
# `3psu-pn9h` publishes 17,170 centreline segments; geo/build_streets.py keeps
# the 16,676 that are neither platted-but-unbuilt nor degenerate, and
# gen/gen_geo2.py ships the 4,895 of classcode 0-4 as `G.streets`. THAT ARRAY IS
# THE INDEX THE WHOLE LAYER IS KEYED ON: `TIME.street.yr` is one entry per
# element of it, and so is `street-data.js`'s `cov` mask, whose own note says a
# regenerated geo-data.js must not be able to shift it by one. So the chunks
# below keep the shipped array's ORDER, carry `fid` — the index itself — and the
# verifier checks every `cov` bit against the citywide mask AT `fid` rather than
# trusting a position.
#
# TWO CHUNKS, SPLIT ON THE CLASS GATE AND NOT ON A CELL.
#   `ST_CLS_MAX` is [2, 3, 4] by LOD band, so band 0 — the whole-city frame —
#   strokes classes 0-2 and nothing else. Those 999 lines ARE the wide shot's
#   street network, so they are base tier and fetched before the first paint.
#   Classes 3 and 4 cannot be drawn until band 1 (z >= sqrt(1 * 2.9) = 1.7029)
#   and are fetched at 1.70 and not before. That is this record's own rule —
#   nothing is fetched before the camera can show it — applied to the axis this
#   layer is actually gated on.
#
#   NOT TILED, for two measured reasons. (1) A centreline runs up to 3.1 km, so
#   a 1024 m cell cannot hold one: placing a feature by its midpoint and culling
#   on the cell's extent would drop Sloat Blvd from a frame showing its western
#   end. `strt` does not have this problem because a right of way is a small
#   ring. (2) The whole network is 14,432 vertices; spread over 125 cells that is
#   39 features and ~1.3 KB a request, and `strt`'s own note puts the useful cell
#   at ~35 KB.
LINE_BASE_CLS_MAX = 2    # ST_CLS_MAX[0] — website/src/lib/city/streets.ts
Z_LINES_2 = 1.70         # BANDS[0] = sqrt(ZSTEPS[0] * ZSTEPS[1]) = 1.7029
LABEL_BASE_RANK_MAX = 1  # part3.html L7025: rankMax at cam.step 1


def _line_sources() -> None:
    """Register the centreline and label sources WITH their notes, once.

    `src()` is a setdefault: the first call for a key fixes its note, so a bare
    `src("street_cover")` reached first would freeze an empty one. Every key the
    three street-line chunks use is defined here, and `encode_streets` calls
    this before any of them is referenced.
    """
    src("street_centreline", dataset="3psu-pn9h", publisher="DataSF",
        what="the published centreline of classcode 0-4, in world metres",
        quantised="0.1 m, after Douglas-Peucker at 3.0 m in geo/build_streets.py",
        derived_from=["geo/build_streets.py", "gen/gen_geo2.py"])
    src("street_centreline_index", dataset="3psu-pn9h", publisher="DataSF",
        what="the centreline's index in gen/geo-data.js `G.streets` — the order "
             "TIME.street.yr and street-data.js's `cov` are BOTH keyed on, carried so "
             "neither can be shifted by one silently",
        script="scratchpad/sf-city-anim/gen/gen_geo2.py")
    src("street_name", dataset="3psu-pn9h", publisher="DataSF",
        what="`streetname`. gen_geo2.py drops the column, so it is joined back onto the "
             "shipped array by replaying geo/build_streets.py's filter and checking "
             "every feature's own first vertex against the shipped one")
    src("street_line_year",
        publisher="San Francisco Board of Supervisors / DataSF",
        what="the earlier of (a) the year the Board's Journal records street work on "
             "this cnn and (b) the earliest wv5m-vpq2 roll year among the ynuv-fyni "
             "footprints within 40 m of the line. 0 = undated and the line is drawn in "
             "every year; 1,929 of the 4,895 are bounded at or before 1906, which is "
             "the map's first year, and read 0 for that reason",
        not_measured="3psu-pn9h's own date_added is a 1998 bulk load and carries no "
                     "street history — 14,514 of 17,170 rows share one date",
        script="scratchpad/sf-city-anim/time/build_time.py")
    src("street_cover", derived_from=["h8n7-e4ns"], publisher="DataSF",
        what="one bit per CENTRELINE, LSB first within each byte: does a published "
             "right of way contain this centreline's own midpoint? 4,361 of 4,895 do; "
             "the other 534 are the park roads, the Great Highway, Sloat and the "
             "freeways, and they keep their line at every zoom",
        script="scratchpad/sf-city-anim/street/build_surface.py")
    src("street_label", dataset="3psu-pn9h", publisher="DataSF",
        what="one label per continuous STRETCH of a named street: union-find over "
             "segment endpoints snapped to 25 m, anchored at the midpoint of the "
             "longest near-straight run inside the stretch. `len` is the summed length "
             "of that stretch's own segments in metres; `rank` is build_streets.py's "
             "LABEL RANK (classcode 2/3 -> 0, 4 -> 1, 5 -> 2, 0 -> 3, 1 -> 4, 6 -> 5) "
             "and is NOT the classcode",
        script="scratchpad/sf-city-anim/geo/build_streets.py")
    src("street_label_year",
        what="the year of the earliest centreline in this label's own stretch; 0 = the "
             "name is written in every year",
        derived_from=["street_line_year"],
        script="scratchpad/sf-city-anim/time/build_time.py")


def _centrelines(GEO2: dict) -> dict:
    """The 4,895 shipped centrelines, with `cnn` and `streetname` joined back on.

    gen_geo2.py drops both columns — the mock draws the network without ever
    naming a line — so they are recovered by replaying geo/build_streets.py's
    filter over the fetched dataset (LineString, not a PAPER layer, at least two
    vertices) and taking the classcode 0-4 rows in order.

    THE JOIN IS PROVED, NOT ASSUMED. Every one of the 4,895 rows has to land its
    own first vertex on the shipped `ox`/`oy` and carry the shipped classcode.
    Douglas-Peucker keeps a line's first and last vertex, so the first vertex
    survives the 3 m simplify untouched and is an exact witness; measured, the
    worst disagreement over all 4,895 is 0.0002 m, which is the float32 the mock
    stores it in. A single mismatch raises: a name attached to the wrong line is
    worse than no name at all.
    """
    S = GEO2["streets"]
    n = int(S["n"])
    cnt = _u16(S["cnt"])
    cls = _u8(S["cls"])
    ox = np.frombuffer(unb64(S["ox"]), dtype=np.float32)
    oy = np.frombuffer(unb64(S["oy"]), dtype=np.float32)
    vx = _i16(S["x"]).astype(np.float64)
    vy = _i16(S["y"]).astype(np.float64)
    off = np.zeros(n + 1, dtype=np.int64)
    np.cumsum(cnt.astype(np.int64), out=off[1:])
    x = np.empty(int(off[-1]), dtype=np.float32)
    y = np.empty(int(off[-1]), dtype=np.float32)
    for i in range(n):
        a, b = int(off[i]), int(off[i + 1])
        x[a:b] = ox[i] + vx[a:b] / 10.0
        y[a:b] = oy[i] + vy[a:b] / 10.0

    # geo/build_streets.py's own frame and its own filter, restated once
    PAPER = {"PAPER", "PAPER_FWYS", "PAPER_WATER", "PSEUDO"}
    LON0, LAT0, MPD = -122.4380, 37.7600, 111320.0
    KX = MPD * math.cos(math.radians(LAT0))
    KY = MPD
    rows = load_json("geo/cache/streets.json")
    cnn = np.zeros(n, dtype=np.uint32)
    name = [""] * n
    k = 0
    worst = 0.0
    for r in rows:
        g = r.get("line")
        if not g or g.get("type") != "LineString":
            continue
        if (r.get("layer") or "") in PAPER:
            continue
        cs = g["coordinates"]
        if len(cs) < 2:
            continue
        cc = (r.get("classcode") or "").strip()
        if not (cc.isdigit() and int(cc) <= 4):
            continue
        if k >= n:
            raise ValueError("more classcode 0-4 rows than gen/geo-data.js ships")
        px = round((cs[0][0] - LON0) * KX, 1)
        py = round((cs[0][1] - LAT0) * KY, 1)
        d = max(abs(px - float(ox[k])), abs(py - float(oy[k])))
        if d > 0.01:
            raise ValueError(f"centreline {k}: first vertex ({px}, {py}) is not the "
                             f"shipped ({float(ox[k])}, {float(oy[k])})")
        worst = max(worst, d)
        if int(cc) != int(cls[k]):
            raise ValueError(f"centreline {k}: classcode {cc} is not the shipped "
                             f"{int(cls[k])}")
        cnn[k] = np.uint32(int(r["cnn"]))
        name[k] = (r.get("streetname") or "").strip()
        k += 1
    if k != n:
        raise ValueError(f"joined {k} published rows onto {n} shipped centrelines")

    # a second, independent derivation of the same join, where the mock kept one
    shipcnn = MOCK / "time" / "out" / "ship-cnn.json"
    if shipcnn.exists():
        other = json.loads(shipcnn.read_text())
        if len(other) != n or any(int(other[i]) != int(cnn[i]) for i in range(n)):
            raise ValueError("the cnn join disagrees with time/out/ship-cnn.json")
    return {"n": n, "cnt": cnt, "cls": cls, "off": off, "x": x, "y": y,
            "cnn": cnn, "name": name, "worstJoin": worst}


def encode_centrelines(GEO2: dict, TIMED: dict, STS: dict, names: list,
                       nidx: dict) -> dict:
    """The centreline network, in the two chunks band 0 and band 1 ask for."""
    C = _centrelines(GEO2)
    n = C["n"]
    yr = _u16(TIMED["street"]["yr"])
    if yr.size != n:
        raise ValueError(f"TIME.street.yr has {yr.size} entries for {n} centrelines")
    covn = int(STS["covn"])
    if covn != n:
        raise ValueError(f"street-data.js covn={covn} for {n} centrelines — the mask is "
                         "keyed on gen/geo-data.js and the two have drifted apart")
    cov = np.unpackbits(_u8(STS["cov"]), bitorder="little")[:n]

    nm = np.full(n, 0xFFFF, dtype=np.uint16)
    for i, t in enumerate(C["name"]):
        if not t:
            continue
        j = nidx.get(t)
        if j is None:
            j = nidx[t] = len(names)
            names.append(t)
        nm[i] = j

    prov = {
        "fid": src("street_centreline_index"),
        "cls": src("street_cls"),
        "cnn": src("street_centreline"),
        "nm": src("street_name"),
        "yr": src("street_line_year"),
        "cov": src("street_cover"),
        "len": src("street_centreline"),
        "x": src("street_centreline"), "y": src("street_centreline"),
    }
    stats = {"n": n, "dated": int((yr > 0).sum()), "covered": int(cov.sum()),
             "unnamed": int((nm == 0xFFFF).sum()), "vertices": int(C["off"][-1]),
             "worstJoinM": round(float(C["worstJoin"]), 6), "chunks": {}}
    for key, tier, minZ, lo, hi in (
        ("base/street-lines", "base", Z_MASSING, 0, LINE_BASE_CLS_MAX),
        ("strt/street-lines-2", "strt", Z_LINES_2, LINE_BASE_CLS_MAX + 1, 255),
    ):
        ids = np.nonzero((C["cls"] >= lo) & (C["cls"] <= hi))[0]
        vsel = np.concatenate([np.arange(C["off"][i], C["off"][i + 1]) for i in ids])
        w = ChunkWriter(key, "strt-line")
        w.add("fid", "u32", ids.astype(np.uint32))
        w.add("cls", "u8", C["cls"][ids])
        w.add("cnn", "u32", C["cnn"][ids])
        w.add("nm", "u16", nm[ids])
        w.add("yr", "u16", yr[ids])
        pack = np.packbits(cov[ids].astype(np.uint8), bitorder="little")
        w.add_bytes("cov", "u8", pack.tobytes(), int(pack.size))
        w.add("len", "u16", C["cnt"][ids])
        w.add("x", "f32", C["x"][vsel]).add("y", "f32", C["y"][vsel])
        emit(w, tier=tier, minZ=minZ,
             extent=[float(C["x"][vsel].min()), float(C["y"][vsel].min()),
                     float(C["x"][vsel].max()), float(C["y"][vsel].max())],
             prov=prov,
             extra={"n": int(ids.size), "clsMin": lo,
                    "clsMax": int(C["cls"][ids].max()),
                    "vertices": int(vsel.size), "covered": int(cov[ids].sum()),
                    "dated": int((yr[ids] > 0).sum())},
             note="The published street centrelines, ABSOLUTE in world metres (f32) — "
                  "`strt`'s own choice for `strt`'s own reason, and here it is what "
                  "makes a chunk independently decodable. `cov` is one bit per feature "
                  "IN THIS CHUNK, LSB first, re-indexed from the citywide mask through "
                  "`fid`: pass 0 of the draw strokes the covered lines and fades them as "
                  "the right of way becomes a surface, pass 1 strokes the uncovered ones "
                  "and never fades them. `yr` 0 means undated and an undated line is "
                  "drawn in every year. `nm` indexes `names` on base/street-labels, and "
                  "0xFFFF is a centreline the City publishes no name for. The split "
                  "between the two chunks is ST_CLS_MAX — the LOD band's own class gate "
                  "— and not the 1024 m grid: a centreline runs up to 3.1 km and does "
                  "not fit in a cell.")
        e = chunks[-1]
        stats["chunks"][key] = {"n": int(ids.size), "b": e["b"], "gz": e["gz"]}
    return stats


MAP_Y0 = 1906   # street/build_surface.py's own constant: the first year drawn


def _exist_year(cnn: int, journal: dict, fabric: dict) -> int:
    """street/build_surface.py's `exist_year`, restated once and then PROVED.

    A street's date is not published. It is the earlier of two document claims:
    the year the Board's Journal is first recorded acting on that centreline
    (time/out/street-years.json) and the earliest assessor year among buildings
    within 40 m of it (time/out/fabric-years.json). Anything at or before 1906
    becomes 0, which this chunk format already defines as "undated, drawn in
    every year".

    Restating a rule is how two files drift, so `encode_unimplied()` below does
    not simply trust this: it runs it over the 4,895 centrelines the mock has
    ALREADY dated and refuses to ship unless it reproduces `TIME.street.yr`
    exactly, element for element. If the rule ever diverges the encoder stops.
    """
    ry = journal.get(cnn, 0)
    f = fabric.get(cnn, 0)
    y = min(ry, f) if (ry and f) else (ry or f or 0)
    return 0 if (not y or y <= MAP_Y0) else int(y)


def encode_unimplied(GEO2: dict, TIMED: dict, names: list, nidx: dict) -> dict:
    """`G.streetsUnimplied` — the 846 published centrelines no block implies.

    gen_geo2.py ships classcode 0-4 and drops 5-6, because "the gap between two
    real blocks already IS the street". That is true on the ordinary grid and
    false where there are no blocks: the Hunters Point Naval Shipyard is ONE
    assessor block, so nothing on the page stands for its streets and they were
    simply absent — buildings with no streets under them.

    These are a SEPARATE array and therefore a separate chunk, not more entries
    in `strt/street-lines-2`. Four things are keyed one-to-one on `G.streets` —
    `TIME.street.yr`, street-data.js's `cov` mask, `_centrelines()`'s
    positional replay and time/out/ship-cnn.json — and appending to it would
    shift all four silently.

    They carry their own `cnn`, recovered and proved in gen_geo2.py by the
    first-vertex witness, so the year join here is by KEY and not by position.
    """
    S = GEO2.get("streetsUnimplied")
    if not S or not int(S["n"]):
        return {"n": 0}
    n = int(S["n"])
    cnt = _u16(S["cnt"])
    cls = _u8(S["cls"])
    cnn = np.frombuffer(unb64(S["cnn"]), dtype=np.uint32)
    ox = np.frombuffer(unb64(S["ox"]), dtype=np.float32)
    oy = np.frombuffer(unb64(S["oy"]), dtype=np.float32)
    vx = _i16(S["x"]).astype(np.float64)
    vy = _i16(S["y"]).astype(np.float64)
    off = np.zeros(n + 1, dtype=np.int64)
    np.cumsum(cnt.astype(np.int64), out=off[1:])
    x = np.empty(int(off[-1]), dtype=np.float32)
    y = np.empty(int(off[-1]), dtype=np.float32)
    for i in range(n):
        a, b = int(off[i]), int(off[i + 1])
        x[a:b] = ox[i] + vx[a:b] / 10.0
        y[a:b] = oy[i] + vy[a:b] / 10.0

    journal = {int(r["cnn"]): int(r["y"])
               for r in load_json("time/out/street-years.json")["seg"] if r.get("y")}
    fabric = {int(r[0]): int(r[1])
              for r in load_json("time/out/fabric-years.json")["seg"] if r[1]}

    # ── THE PROOF, BEFORE THE RULE IS USED ON ANYTHING NEW ────────────────
    # Re-derive the year for the 4,895 the mock has already dated, and refuse
    # to ship unless it matches TIME.street.yr element for element.
    shipped = _u16(TIMED["street"]["yr"])
    C = _centrelines(GEO2)
    mine = np.array([_exist_year(int(c), journal, fabric) for c in C["cnn"]],
                    dtype=np.uint16)
    bad = int((mine != shipped).sum())
    if bad:
        i = int(np.nonzero(mine != shipped)[0][0])
        raise ValueError(
            f"the street-year rule has drifted from street/build_surface.py: it "
            f"disagrees with TIME.street.yr on {bad} of {shipped.size} shipped "
            f"centrelines (first at fid {i}, cnn {int(C['cnn'][i])}: "
            f"{int(mine[i])} against {int(shipped[i])})")

    yr = np.array([_exist_year(int(c), journal, fabric) for c in cnn], dtype=np.uint16)

    # the published name, off the same dataset, joined by cnn
    nm = np.full(n, 0xFFFF, dtype=np.uint16)
    byc = {}
    for r in load_json("geo/cache/streets.json"):
        try:
            byc[int(float(r["cnn"]))] = (r.get("streetname") or "").strip()
        except (TypeError, ValueError, KeyError):
            pass
    for i, c in enumerate(cnn):
        t = byc.get(int(c), "")
        if not t:
            continue
        j = nidx.get(t)
        if j is None:
            j = nidx[t] = len(names)
            names.append(t)
        nm[i] = j

    src("street_unimplied", dataset="3psu-pn9h", publisher="DataSF",
        what="a published centreline of classcode 5, 6 or NONE that no published "
             "assessor block edge comes within 30 m of, along at least a quarter "
             "of its length — measured in gen/gen_geo2.py against the same block "
             "rings this manifest ships. gen_geo2.py drops classes 5-6 because "
             "'the gap between two real blocks already IS the street', which is "
             "true on the grid and false where there are no blocks",
        derived_from=["gen/gen_geo2.py", "acdm-wktn"],
        not_measured="a class. 280 of the 846 carry NO published classcode at all "
                     "and ship as 7; `int(c or 5)` used to call those 'local "
                     "residential', which is the class that is dropped.")
    prov = {
        "fid": src("street_unimplied"),
        "cls": src("street_unimplied"), "cnn": src("street_centreline"),
        "nm": src("street_name"), "yr": src("street_line_year"),
        "cov": src("street_cover"),
        "len": src("street_centreline"),
        "x": src("street_centreline"), "y": src("street_centreline"),
    }
    w = ChunkWriter("strt/street-unimplied", "strt-line")
    w.add("fid", "u32", np.arange(n, dtype=np.uint32))
    w.add("cls", "u8", cls)
    w.add("cnn", "u32", cnn)
    w.add("nm", "u16", nm)
    w.add("yr", "u16", yr)
    # `cov` IS ZERO FOR EVERY ONE OF THESE, AND THAT IS A MEASUREMENT.
    # The bit means "a published right of way polygon contains this
    # centreline's own midpoint". h8n7-e4ns is the PUBLIC right of way and none
    # of these 846 has a polygon in it — a Navy yard is not public right of
    # way, a park road is not a street — so every bit is 0 and the renderer's
    # pass 1 strokes them without ever fading them into a surface, which is
    # exactly right because there is no surface to fade into. Shipped rather
    # than omitted so this chunk carries the same field list as the other two
    # `strt-line` chunks and decodes through the same path.
    _cov = np.packbits(np.zeros(n, dtype=np.uint8), bitorder="little")
    w.add_bytes("cov", "u8", _cov.tobytes(), int(_cov.size))
    w.add("len", "u16", cnt)
    w.add("x", "f32", x).add("y", "f32", y)
    emit(w, tier="strt", minZ=Z_STREET,
         extent=[float(x.min()), float(y.min()), float(x.max()), float(y.max())],
         prov=prov,
         extra={"n": n, "dated": int((yr > 0).sum()), "undated": int((yr == 0).sum()),
                "vertices": int(off[-1]), "implyM": S.get("implyM"),
                "implyFrac": S.get("implyFrac")},
         note="The streets NOTHING ELSE ON THE PAGE STANDS FOR. Same fields and "
              "same units as base/street-lines, minus `cov`: there is no right of "
              "way polygon for any of these, so there is nothing for the surface "
              "to fade into and pass 0 does not apply. `yr` 0 means UNDATED and an "
              f"undated line is drawn in every year — {int((yr == 0).sum())} of "
              f"{n}, because these are the streets the Board's Journal had least "
              "occasion to vote on and the assessor least occasion to date — which "
              "is the same rule the undated trees are drawn under, and the page "
              "must say so rather than let a reader at 1906 read the Presidio's "
              "road network as a 1906 fact. `cls` 7 is 'no published class'.")
    e = chunks[-1]
    return {"n": n, "dated": int((yr > 0).sum()), "undated": int((yr == 0).sum()),
            "vertices": int(off[-1]), "b": e["b"], "gz": e["gz"],
            "implyM": S.get("implyM"), "implyFrac": S.get("implyFrac")}


def encode_street_labels(GEO2: dict, TIMED: dict, names: list, nidx: dict) -> dict:
    """The street NAMES — 2,786 stretches over 2,292 distinct names.

    geo/build_streets.py builds a stretch by union-find over segment endpoints
    snapped to 25 m, because linemerge alone leaves Market Street in 78 pieces;
    the anchor is the midpoint of the longest near-straight run inside the
    stretch, so the name lies along a straight rather than bending round a
    corner. `rank` is that file's LABEL rank and not the classcode: the arterials
    take rank 0-1 and the freeways fall to the bottom, because a freeway is the
    least useful thing to name on a map of San Francisco.

    `dx`/`dy` ship as i16 at x10000. The source rounds the unit vector to four
    decimals, so that is an EXACT integer and the round trip is lossless. They
    are a direction and not a place: `part3.html` L7086 pushes (dx, dy) through
    proj() as a point and takes the angle of the difference from proj(0, 0).

    TWO CHUNKS, SPLIT ON THE REFERENCE'S OWN BAND GATE. `part3.html` L7025 is
    `rankMax = cam.step===0 ? 0 : (cam.step===1 ? 1 : 2)`, so the whole-city
    frame can write rank 0 and the district frame rank 0-1 — 337 of the 2,786.
    Those are base tier. The 2,449 local stretches cannot be written below band
    1 and are fetched at 1.70 beside the class 3-4 centrelines.
    """
    LB = GEO2["labels"]
    n = len(LB["i"])
    for t in LB["t"]:
        if t not in nidx:
            nidx[t] = len(names)
            names.append(t)
    nm = np.array([nidx[LB["t"][i]] for i in LB["i"]], dtype=np.uint16)
    lyr = _u16(TIMED["label"]["yr"])
    if lyr.size != n:
        raise ValueError(f"TIME.label.yr has {lyr.size} entries for {n} labels")
    rank = np.asarray(LB["r"], dtype=np.uint8)
    lx = np.asarray(LB["x"], dtype=np.float32)
    ly = np.asarray(LB["y"], dtype=np.float32)
    dx = np.round(np.asarray(LB["dx"], dtype=np.float64) * 10000).astype(np.int16)
    dy = np.round(np.asarray(LB["dy"], dtype=np.float64) * 10000).astype(np.int16)
    L = np.asarray(LB["L"], dtype=np.int64)
    if int(L.max()) > 65535:
        raise ValueError("a stretch is longer than u16 metres")

    prov = {
        "nm": src("street_name"),
        "rank": src("street_label"), "len": src("street_label"),
        "x": src("street_label"), "y": src("street_label"),
        "dx": src("street_label"), "dy": src("street_label"),
        "yr": src("street_label_year"),
    }
    out: dict = {}
    for key, tier, minZ, lo, hi in (
        ("base/street-labels", "base", Z_MASSING, 0, LABEL_BASE_RANK_MAX),
        ("strt/street-labels-2", "strt", Z_LINES_2, LABEL_BASE_RANK_MAX + 1, 255),
    ):
        ids = np.nonzero((rank >= lo) & (rank <= hi))[0]
        w = ChunkWriter(key, "strt-label")
        w.add("nm", "u16", nm[ids])
        w.add("rank", "u8", rank[ids])
        w.add("yr", "u16", lyr[ids])
        w.add("len", "u16", L[ids].astype(np.uint16))
        w.add("x", "f32", lx[ids]).add("y", "f32", ly[ids])
        w.add("dx", "i16", dx[ids]).add("dy", "i16", dy[ids])
        emit(w, tier=tier, minZ=minZ,
             extent=[float(lx[ids].min()), float(ly[ids].min()),
                     float(lx[ids].max()), float(ly[ids].max())],
             prov=prov,
             extra={"n": int(ids.size), "rankMin": lo,
                    "rankMax": int(rank[ids].max()),
                    "dated": int((lyr[ids] > 0).sum()),
                    **({"names": names, "distinct": len(names),
                        "dxyScale": 10000, "lenUnit": "m"} if tier == "base" else {})},
             note="`names` is the whole street-name table for this record and it travels "
                  "with the BASE chunk, because base/street-lines indexes it too: a name "
                  "exists once on the wire, and 0xFFFF on a centreline means the City "
                  "publishes none for it. `dx`/`dy` are the stretch's unit direction at "
                  "x10000 — an exact integer, because the source rounds to four decimals "
                  "— and are pushed through proj() as a POINT to get the angle the name "
                  "is set at. `yr` 0 means the name is written in every year. The split "
                  "between the two chunks is part3.html L7025's own `rankMax` by LOD "
                  "band: rank 0 at whole city, 0-1 at district, everything at block.")
        e = chunks[-1]
        out[key] = {"n": int(ids.size), "b": e["b"], "gz": e["gz"]}
    return {"n": n, "distinct": len(names), "dated": int((lyr > 0).sum()),
            "chunks": out}


# ═══════════════════════════════════════════════════════════════════════════
# TREES AND CANOPY
# ═══════════════════════════════════════════════════════════════════════════

def _wvarint(u: np.ndarray) -> np.ndarray:
    """part3's wvarint(): CONTINUATION BIT IS 0x80 ON THE LOW BYTES, little-endian
    7-bit groups, terminator is the byte WITHOUT the high bit."""
    out = []
    v = 0
    s = 0
    for b in u.tolist():
        v |= (b & 0x7F) << s
        if b & 0x80:
            s += 7
        else:
            out.append(v)
            v = 0
            s = 0
    return np.array(out, dtype=np.int64)


# ── A DEFECT IN THE SOURCE, MEASURED AND CARRIED FORWARD FLAGGED ───────────
# world/build_world.py buckets trees as `B[gj * GW + gi]` with GW = 400 columns of
# 24 m = 9,600 m. The city needs 595 columns: the easternmost published footprint
# vertex is at x = 7,072 and the bucket origin is X0 = -7,200, so the city is
# 14,272 m wide in x. gi therefore reaches 594 and the key ALIASES — a tree at
# column 450 is written to (gj + 1, column 50) and is drawn 9,600 m west and 24 m
# north of where it stands.
#
# PROOF, not inference: column 0 is x = -7,200, which is open Pacific about 800 m
# west of Ocean Beach, and it holds 192 tree cells. There are no street trees in
# the ocean. gi also saturates at exactly 399 in both the tree and the canopy
# array, and the cells-per-column histogram is flat at ~180 across all 400
# columns with no taper at either edge, which a real city does not do.
#
# The true column is NOT RECOVERABLE from the shipped file — the information was
# destroyed by the modulo. So the trees are carried through byte-faithfully and
# placed where the mock's own draw code places them (gen/part3.html vbuildCells:
# `gi = k % gw, gj = (k / gw) | 0`), so the render is unchanged, and the defect
# is named in the manifest so nothing downstream can present these positions as
# fact. The fix is one character in world/build_world.py — GW = 400 -> GW >= 595
# — and a regenerated world-data.js; it belongs there and not here, because
# inventing a position here would be inventing data.
TREE_FOLD = (
    "FIXED 2026-08-23, recorded because the fix is invisible in the data. "
    "world/build_world.py keyed cells as gj*GW + gi with GW = 400 columns of "
    "24 m = 9,600 m, while the city is 14,272 m wide from that origin and needs "
    "595. Every tree east of x = 2,376 (about Van Ness) folded 9,600 m west, so "
    "the eastern city had no trees and the western city wore them. Measured "
    "proof at the time: column 0 is open Pacific ~800 m off Ocean Beach and held "
    "192 tree cells. GW is now 600 (14,400 m) and the grid covers the city. The "
    "canopy array shares the origin, the GW and the arithmetic and was affected "
    "and fixed identically. Kept in the manifest so nobody re-derives it: 400 "
    "buckets is 14.4 km at 36 m and 9.6 km at 24 m, and the cell size moved "
    "while this constant did not."
)


def encode_trees(WRLD: dict) -> dict:
    T = WRLD["tree"]
    dk = _wvarint(_u8(T["k"]))
    cn = _wvarint(_u8(T["c"]))
    keys = np.cumsum(dk)
    off = np.zeros(cn.size + 1, dtype=np.int64)
    np.cumsum(cn, out=off[1:])
    assert off[-1] == T["n"], (off[-1], T["n"])
    pos, fb, bb, yr = _u8(T["p"]), _u8(T["f"]), _u8(T["b"]), _u8(T["y"])
    gw, cell, x0, y0, q = T["gw"], T["cell"], T["x0"], T["y0"], T["q"]
    col = keys % gw
    row = keys // gw
    cxw = x0 + (col + 0.5) * cell
    cyw = y0 + (row + 0.5) * cell
    tx, ty = cells_of(cxw, cyw)
    key = tx.astype(np.int64) * NY + ty
    fbits = np.unpackbits(fb, bitorder="little")
    form = (fbits[0::2] + 2 * fbits[1::2])[: T["n"]].astype(np.uint8)
    big = np.unpackbits(bb, bitorder="little")[: T["n"]].astype(np.uint8)
    prov = {
        "cellKey": src("tree", dataset="tkzw-k3nq", publisher="DataSF",
                       what="195,310 published street trees",
                       defect=TREE_FOLD),
        "cellCnt": src("tree"), "pos": src("tree"), "form": src("tree"),
        "big": src("tree"), "yr": src("tree"),
    }
    stats = {"cells": 0, "bytes": 0, "gzip": 0}
    for k in np.unique(key):
        sel = np.nonzero(key == k)[0]                       # source CELLS, ascending
        vsel = np.concatenate([np.arange(off[c], off[c + 1]) for c in sel])
        w = ChunkWriter(f"tree/{cell_id(int(k) // NY, int(k) % NY)}", "tree")
        w.add("cellKey", "u32", keys[sel]).add("cellCnt", "u16", cn[sel])
        w.add("pos", "u8", pos[vsel]).add("form", "u8", form[vsel])
        w.add("big", "u8", big[vsel]).add("yr", "u8", yr[vsel])
        emit(w, tier="tree", minZ=Z_TREES,
             extent=cell_extent(int(k) // NY, int(k) % NY), prov=prov,
             extra={"n": int(vsel.size), "nCells": int(sel.size),
                    "cell": cell, "q": q, "gw": gw, "x0": x0, "y0": y0},
             note=f"Trees are keyed on the source's own {cell:g} m grid: cellKey = "
                  f"row*{gw} + col, cell origin ({x0:g}, {y0:g}). `pos` is two nibbles, "
                  f"x and y within the cell at {cell / q:g} m. `yr` is the planting year "
                  f"the register gives, 0 where it gives none — 125,234 of the trees "
                  f"carry no date and are drawn undated rather than dropped.")
        e = chunks[-1]
        stats["cells"] += 1; stats["bytes"] += e["b"]; stats["gzip"] += e["gz"]

    K = WRLD["canopy"]
    ck = np.cumsum(_wvarint(_u8(K["k"])))
    w = ChunkWriter("base/canopy", "canopy")
    w.add("cellKey", "u32", ck).add("pos", "u8", _u8(K["p"])).add("area", "u8", _u8(K["a"]))
    emit(w, tier="canopy", minZ=Z_CANOPY, extent=None,
         prov={k: src("canopy", dataset="ni2e-vpbg", publisher="DataSF",
                      what="32,482 canopy cells out of the 2013 Urban Tree Canopy aerial",
                      defect=TREE_FOLD)
               for k in ("cellKey", "pos", "area")},
         extra={"n": K["n"], "cell": K["cell"], "q": K["q"], "gw": K["gw"],
                "x0": K["x0"], "y0": K["y0"], "amax": K["amax"]},
         note="Canopy blobs engage at z = 1.55 (VZ_C0), before street trees at 2.90, and "
              "the whole city is still in one frame at 1.55, so this is one citywide "
              "chunk and not a tiling: 130 cells of 1.5 KB would cost more in requests "
              "than the cull saves. The ground TINT is separate — see base/canopy-tint, "
              "which is on the first-paint path because it colours the ground at every "
              "zoom.")

    dem_f = unb64(WRLD["dem"]["f"])
    w = ChunkWriter("base/canopy-tint", "canopy-tint")
    w.add_bytes("demFrac", "u8", dem_f, len(dem_f))
    emit(w, tier="base", minZ=Z_MASSING, extent=None,
         prov={"demFrac": src("canopy")},
         extra={"demW": WRLD["dem"]["w"]},
         note="The canopy fraction on the DEM's own 53.8 m grid, for the ground tint. "
              "part3.html smooths it with two passes of a separable 1-2-1 kernel at "
              "load: the field is a coverage FRACTION, so smoothing it is smoothing a "
              "measurement rather than inventing one, and no cell is moved. Raw, one "
              "cell of the Presidio's forest against its neighbour of open sand is a "
              "hard 53.8 m square — the exact artefact Block M spent a night removing "
              "from the shoreline.")

    P = WRLD["park"]
    W = WRLD["water"]
    w = ChunkWriter("base/parks", "parks")
    w.add("cls", "u8", _u8(P["cls"])).add("len", "u16", _u16(P["ln"]))
    w.add("xy", "i32", _i32(P["xy"]))
    w.add("waterLen", "u16", _u16(W["ln"])).add("waterXY", "i32", _i32(W["xy"]))
    emit(w, tier="base", minZ=Z_MASSING, extent=None,
         prov={k: src("park", dataset="gtr9-ntp6", publisher="DataSF",
                      what="247 published Recreation and Parks rings")
               for k in ("n", "cls", "len", "xy")} |
              {k: src("water_bodies", dataset="xgse-mjer", publisher="DataSF",
                      what="32 named lakes and reservoirs")
               for k in ("waterLen", "waterXY")},
         extra={"nRings": P["n"], "names": P["names"],
                "nWaterRings": W["n"], "waterNames": W["names"], "xyScale": 10},
         note="Ring lengths are VERTEX counts. Coordinates are i32 DECIMETRES: "
              "world metres = v / 10.")
    return {**stats, "n": T["n"], "canopy": K["n"]}


# ═══════════════════════════════════════════════════════════════════════════
# THE SURROUND — Marin, the East Bay, the peninsula, the islands
# ═══════════════════════════════════════════════════════════════════════════

def encode_surround(CTX: dict, PROJ: dict) -> dict:
    """`gen_context.py`'s output: everything on the frame that is not the city.

    P3 wrote the surround's relief, the shoal band and both water plates
    against a `SurroundGrid` interface and shipped them drawing NOTHING,
    because no chunk kind carried this grid. That is what this fills.

    THE CELL IS 110.01 x 139.15 m AND THAT NUMBER TRAVELS IN THE MANIFEST.
    It has to, because it is the divisor the hillshade got wrong twice. Block W
    found `LAM` reading "metres of rise per CELL, used as a slope" in the city
    and fixed it; the SAME expression lit the surround, dividing by 1.8 against
    a cell of 110.01 x 139.15 m, over-reading the slope by 61x across and 77x
    down. Measured over this file's own 63,352 land cells, that put the median
    Lambert over Marin at 0.081 where flat ground returns 0.730, and clipped
    30,651 of them — 48.4 % — to exactly zero, which `XLAM[k] || 0.62` then
    drew BRIGHTER than a genuinely lit slope.

    NOTHING HERE COMPUTES A HILLSHADE. `buildSurroundLam` in terrain.ts does,
    correctly, and it takes `cellW` and `cellH` as arguments. What this encoder
    owes it is the elevation field and the true cell size, both carried
    explicitly so no downstream reader has to re-derive them from the bbox and
    guess a projection. verify_city_chunks.py re-runs both the broken and the
    fixed hillshade off the DECODED chunk and asserts every figure above, which
    is how we know the field encoded here is the one those numbers describe.

    Byte-exact: every array is the source's own bytes, moved unchanged.
    """
    XW, XH = CTX["w"], CTX["h"]
    zmax = CTX["zmax"]
    lo0, la0, lo1, la1 = CTX["bb"]
    KX = PROJ["mpd"] * PROJ["cosl"]
    KY = PROJ["mpd"]

    dem = unb64(CTX["dem"])
    land = unb64(CTX["land"])
    own = unb64(CTX["own"])
    segs = unb64(CTX["segs"])
    nbits = (XW * XH + 7) // 8
    assert len(dem) == XW * XH, (len(dem), XW * XH)
    assert len(land) == nbits and len(own) == nbits, (len(land), len(own), nbits)
    assert len(segs) == CTX["nsegs"] * 8, (len(segs), CTX["nsegs"])

    # The node lattice, in world metres. Node i is at bbox fraction i/XW, so
    # there are XW+1 of them and the LAST one closes the grid — the same
    # convention the SurroundGrid interface states (`mx`, length XW+1).
    def node_x(i: float) -> float:
        return (lo0 + (lo1 - lo0) * i / XW - PROJ["lon0"]) * KX

    def node_y(j: float) -> float:
        return (la0 + (la1 - la0) * j / XH - PROJ["lat0"]) * KY

    cellW = (lo1 - lo0) / XW * KX
    cellH = (la1 - la0) / XH * KY

    # The bathymetry is this grid refined 4x and encode_water() maps its nodes
    # with the same arithmetic. Assert they agree rather than trusting it: two
    # grids that are supposed to share metres and do not is exactly the class
    # of bug the magic and the CRC exist for.
    assert abs(node_x(0) - (lo0 - PROJ["lon0"]) * KX) < 1e-9

    nland = int(np.unpackbits(np.frombuffer(land, dtype=np.uint8))[:XW * XH].sum())
    nown = int(np.unpackbits(np.frombuffer(own, dtype=np.uint8))[:XW * XH].sum())

    hydro = src("surround-hydro", publisher="US Census Bureau",
                dataset="TIGERweb Areal Hydrography + State_County",
                url="https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb",
                what="the shoreline and the county coverage envelope that carve "
                     "land from water outside San Francisco",
                script="scratchpad/sf-city-anim/gen/gen_context.py",
                licence="US Census: 'The TIGER/Line Shapefiles ... are not "
                        "copyrighted.' Work of the US government, public domain")
    elev = src("surround-elevation", publisher="USGS",
               dataset="3D Elevation Program (3DEP) ImageServer exportImage",
               url="https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation",
               what="elevation outside the city, float32 metres, resampled to the "
                    "416 x 280 context frame and smoothed by two 1-2-1 passes "
                    "(gen_context.py: a 139 m cell straddling a cliff reads as a "
                    "staircase); zeroed where the hydrography says water",
               quantised=f"one byte a cell over 0..{zmax} m — the source file's own "
                         f"quantiser, {zmax / 255:.3f} m a step, worst error "
                         f"{zmax / 510:.3f} m",
               licence="USGS: 'USGS-authored or produced data and information are "
                       "in the public domain.'")

    w = ChunkWriter("base/surround", "surround")
    w.add_bytes("dem", "u8", dem, len(dem))
    w.add_bytes("land", "u8", land, len(land))
    w.add_bytes("own", "u8", own, len(own))
    w.add_bytes("segs", "u16", segs, CTX["nsegs"] * 4)

    labels = [{"n": L["n"],
               "x": round((L["ll"][0] - PROJ["lon0"]) * KX, 1),
               "y": round((L["ll"][1] - PROJ["lat0"]) * KY, 1),
               "ll": L["ll"],
               **({"sm": 1} if L.get("sm") else {}),
               **({"w": 1} if L.get("w") else {})}
              for L in CTX["labels"]]

    world = [node_x(0), node_y(0), node_x(XW), node_y(XH)]
    emit(w, tier="base", minZ=Z_MASSING, extent=world,
         prov={"dem": elev, "land": hydro, "own": hydro, "segs": hydro},
         extra={
             "w": XW, "h": XH, "zmax": zmax,
             "cellW": round(cellW, 4), "cellH": round(cellH, 4),
             "bbox": list(CTX["bb"]),
             "world": [round(v, 1) for v in world],
             "nsegs": CTX["nsegs"], "landCells": nland, "ownCells": nown,
             "bitOrder": "msb", "labels": labels,
         },
         note=(
             "Cell (i,j) is at k = j*w + i, j increasing NORTH. Elevation in "
             "metres = dem[k]/255*zmax. `land` and `own` are one bit a cell, "
             "MSB first within each byte (numpy packbits), so bit k is "
             "(a[k>>3] >> (7-(k&7))) & 1. `land` is the hydrography's own land "
             "bit and is what the shoal band's BFS measures distance from. "
             "`own` is `land` AND NOT already drawn by the city model — "
             "gen_context.py dilates the city's 260x260 mask by two cells and "
             "subtracts it, so the two shorelines cannot disagree into a fringe "
             "of the wrong tone. ONLY `own` CELLS ARE PAINTED: drawSurround "
             "walks `order` and applies no land test of its own, so `order` "
             "must be built over `own`. `segs` is 4 NODE indices a segment "
             "(i0,j0,i1,j1) for the surround's own fainter shoreline. Node (i,j) "
             "is at world x = world[0] + i*cellW, y = world[1] + j*cellH, with "
             "w+1 by h+1 nodes. THE CELL IS 110.01 x 139.15 m AND THAT IS THE "
             "DIVISOR THE HILLSHADE NEEDS: buildSurroundLam takes cellW/cellH "
             "and the shipped mock divided by 1.8 instead, over-reading slope "
             "61x across and 77x down. Nothing is hillshaded here; the field "
             "and the cell size are carried so it can be done right downstream."
         ))
    return {
        "w": XW, "h": XH, "zmax": zmax,
        "cellW": round(cellW, 4), "cellH": round(cellH, 4),
        "bbox": list(CTX["bb"]), "world": [round(v, 1) for v in world],
        "landCells": nland, "ownCells": nown, "nsegs": CTX["nsegs"],
        "meta": CTX["meta"],
        "note": "The surround carries no buildings and no blocks: there is no "
                "record for it and San Francisco is the subject. The bathymetry "
                "in `water` is this grid refined 4x (mul=4), so every 4th node "
                "of that grid IS a node of this one.",
    }


# ═══════════════════════════════════════════════════════════════════════════
# THE AUTHORED LANDMARKS — 11 heroes, 68 shaped caps, one bridge deck
# ═══════════════════════════════════════════════════════════════════════════

# Centimetres, as i32. Every authored height, cut-off, pitch and margin in
# `hero-data.js` is written to two decimals — asserted below over all 127 parts
# — so centimetres are EXACTLY lossless where f32 would not be: 117.6 m is not
# an f32, and 106 of the 127 z1 values are not. Ring and profile coordinates go
# the other way and stay f32, because `part3.html` loads them straight into
# `Float32Array` (`P.wx`, `P.wy`, `P.pu`, `P.ps`) and f32 IS the precision the
# page draws at. Two different rules for two different reasons, and the
# verifier checks each against the thing it claims to match.
CM = 100

# `pi` is an arcade's pitch in metres and three parts carry 1e9 — the clock
# face and two single arches — which is the file's way of saying ONE OPENING,
# NO REPETITION. 1e9 m in centimetres overflows i32, so it maps to -1, which a
# pitch can never otherwise be. The assert below refuses any OTHER value that
# will not fit, so a new sentinel cannot be silently swallowed.
PI_SINGLE = 1_000_000_000.0


def _cm(v: float, what: str) -> int:
    x = v * CM
    r = round(x)
    if abs(x - r) > 1e-6:
        raise ValueError(f"{what}: {v} is not a whole number of centimetres")
    if not -2**31 <= r < 2**31:
        raise ValueError(f"{what}: {v} m does not fit i32 centimetres")
    return int(r)


def encode_heroes(HERO: dict, LRD: dict, MARKS: dict, B: dict,
                  solo: np.ndarray) -> dict:
    """`hero-data.js`, `render-data.js` and the deck ring out of `marks-data.js`.

    P3 ported the LAW of this file — the containment gate, volume and n-gon
    conservation, the emphasis curve, the roofline test, the accent derivation,
    both winding fixes — and typed the record a hero must carry. There was no
    table behind it, so the eleven heroes, the 68 caps and the Golden Gate deck
    drew nothing. DRAW.md §11: *"Nothing here fabricates a hero."* This is the
    table.

    NOTHING IS AUTHORED HERE EITHER. Every number is moved out of the mock's own
    payloads, and where the mock's DECODER resolves a default — `c` falls back
    to `m`, `dk` to 0.75, `ink` to 0 — the RESOLVED value is what is stored,
    because the resolved value is what the page draws and what the round-trip
    proof can compare against.

    THE ANCHOR IS DERIVED AND IT HAS TO BE. `part3.html` takes a hero's ground
    anchor from `UX[HBI[q]]` — the footprint's own vertex mean — so it is a
    property of the building, not of the hero record. THREE OF THE ELEVEN
    BUILDINGS ARE NOT SOLOS (the Conservatory of Flowers, the Dutch Windmill and
    the Peace Pagoda), so their footprints live in a `bldg` cell that does not
    arrive until z >= 1.55 and the anchor would be unavailable at base tier.
    It is therefore computed here, by the same arithmetic, and shipped with the
    hero: `_bldgsrc.read_bldg()`'s `cx`/`cy` ARE part3's `UX`/`UY`.
    """
    H = HERO["h"]
    HN = len(H)

    bi, yrs, top, zr, acc, hull = [], [], [], [], [], []
    msA, msH, msR, msYr, msNv = [], [], [], [], []
    ax, ay, poff = [], [], [0]
    pk, pz0, pz1, pm, pc, pink, pmin = [], [], [], [], [], [], []
    pw, ppi, pmg, pdk, pnb, ptx, pty = [], [], [], [], [], [], []
    roff, proff = [0], [0]
    rx, ry, pu, ps = [], [], [], []
    strings = []

    for h in H:
        b = h["b"]
        if not 0 <= b < B["n"]:
            raise ValueError(f"{h['k']}: building index {b} out of range")
        bi.append(b)
        yrs.append(h["y"])
        ms = h["ms"]
        # ms.t is the MEASURED top and the gate's ceiling; the drawn top is the
        # tallest part's z1 and is never allowed above it.
        top.append(_cm(ms["t"], f"{h['k']}.ms.t"))
        zr.append(_cm(h["zr"] if h.get("zr") is not None else ms["t"], f"{h['k']}.zr"))
        acc.append(h["ac"] if h.get("ac") is not None else -1)
        hull.append(1 if h.get("hu") else 0)
        msA.append(_cm(ms["a"], f"{h['k']}.ms.a"))
        msH.append(_cm(ms["h"], f"{h['k']}.ms.h"))
        msR.append(_cm(ms["r"], f"{h['k']}.ms.r"))
        msYr.append(ms["yr"])
        msNv.append(ms["nv"])
        ax.append(float(B["cx"][b]))
        ay.append(float(B["cy"][b]))
        for p in h["p"]:
            n = len(p["r"]) // 2
            pk.append(p["k"])
            pz0.append(_cm(p["z0"], f"{h['k']}.z0"))
            pz1.append(_cm(p["z1"], f"{h['k']}.z1"))
            pm.append(p["m"])
            # part3: c:(p.c==null?p.m:p.c) — the resolved value
            pc.append(p["c"] if p.get("c") is not None else p["m"])
            pink.append(int(p.get("ink") or 0))
            pmin.append(_cm(p.get("px") or 0, f"{h['k']}.px"))
            pw.append(_cm(p.get("w") or 0, f"{h['k']}.w"))
            piv = p.get("pi") or 0
            ppi.append(-1 if piv == PI_SINGLE else _cm(piv, f"{h['k']}.pi"))
            pmg.append(_cm(p.get("mg") or 0, f"{h['k']}.mg"))
            pdk.append(_cm(p["dk"] if p.get("dk") is not None else 0.75, f"{h['k']}.dk"))
            pnb.append(int(p.get("n") or 0))
            t = p.get("t") or (0, 0)
            ptx.append(_cm(t[0], f"{h['k']}.t.x"))
            pty.append(_cm(t[1], f"{h['k']}.t.y"))
            for k in range(n):
                rx.append(p["r"][2 * k]); ry.append(p["r"][2 * k + 1])
            roff.append(len(rx))
            for k in range(len(p.get("p") or []) // 2):
                pu.append(p["p"][2 * k]); ps.append(p["p"][2 * k + 1])
            proff.append(len(pu))
            strings.append({"g": p.get("g"), "sh": p.get("sh") or ""})
        poff.append(len(pk))

    w = ChunkWriter("base/heroes", "hero")
    w.add("bi", "u32", bi).add("yr", "u16", yrs)
    w.add("top", "i32", top).add("zr", "i32", zr)
    w.add("acc", "i16", acc).add("hull", "u8", hull)
    w.add("msA", "i32", msA).add("msH", "i32", msH).add("msR", "i32", msR)
    w.add("msYr", "u16", msYr).add("msNv", "u16", msNv)
    w.add("ax", "f32", ax).add("ay", "f32", ay)
    w.add("poff", "u32", poff)
    w.add("pk", "u8", pk).add("pm", "u8", pm).add("pink", "u8", pink)
    w.add("pc", "i16", pc).add("pnb", "u16", pnb)
    w.add("pz0", "i32", pz0).add("pz1", "i32", pz1).add("pmin", "i32", pmin)
    w.add("pw", "i32", pw).add("ppi", "i32", ppi).add("pmg", "i32", pmg)
    w.add("pdk", "i32", pdk).add("ptx", "i32", ptx).add("pty", "i32", pty)
    w.add("roff", "u32", roff).add("proff", "u32", proff)
    w.add("rx", "f32", rx).add("ry", "f32", ry)
    w.add("pu", "f32", pu).add("ps", "f32", ps)

    hp = src("hero-authoring", publisher="this project",
             dataset="scratchpad/sf-city-anim/wonder/hero-data.js",
             what="authored landmark geometry — the parts, their profiles and "
                  "their materials. The FOOTPRINT, the POSITION, the YEAR and "
                  "the MEASURED top and area of every hero are published and "
                  "named per hero in base/heroes.json (`an`, `ys`, `ms`, `dr`); "
                  "what is authored is the SHAPE carved inside them",
             script="scratchpad/sf-city-anim/wonder/build_wonder.py",
             quantised="heights, cut-offs, pitches and margins in centimetres "
                       "(exact — every authored value is a whole centimetre); "
                       "ring and profile coordinates f32, which is the precision "
                       "part3.html itself draws them at",
             not_measured="A hero is drawn at EMPHASIS, up to 5.0x, and is "
                          "therefore NOT TO SCALE. The exaggeration applies to "
                          "the drawing and never to a claim: the published "
                          "footprint, position and year are unchanged, and the "
                          "measured top and area travel on every record. "
                          + HERO["note"])
    fab = src("bldg-footprint-centroid", publisher="DataSF", dataset="ynuv-fyni",
              what="the hero's ground anchor: the arithmetic mean of its own "
                   "published footprint ring's vertices, which is part3.html's "
                   "UX/UY. Derived here rather than read from the hero file "
                   "because the mock derives it too, and because 3 of the 11 "
                   "buildings are not solos so the ring is not at base tier",
              quantised="f32, as part3.html's UX/UY are")
    prov = {n: hp for n in ("bi", "yr", "top", "zr", "acc", "hull", "msA", "msH",
                            "msR", "msYr", "msNv", "poff", "pk", "pm", "pink",
                            "pc", "pnb", "pz0", "pz1", "pmin", "pw", "ppi",
                            "pmg", "pdk", "ptx", "pty", "roff", "proff",
                            "rx", "ry", "pu", "ps")}
    prov["ax"] = fab
    prov["ay"] = fab
    emit(w, tier="base", minZ=Z_MASSING, extent=None, prov=prov,
         extra={"n": HN, "parts": len(pk), "verts": len(rx), "profPts": len(pu),
                "cm": CM, "piSingle": -1},
         note=("Hero q owns parts poff[q]..poff[q+1]; part j owns ring vertices "
               "roff[j]..roff[j+1] and profile points proff[j]..proff[j+1]. "
               "Every i32 field is CENTIMETRES — divide by 100 for metres — and "
               "is exact, because every authored value is a whole centimetre. "
               "`rx`/`ry`/`pu`/`ps` are f32 world metres RELATIVE TO THE "
               "ANCHOR (ax, ay). `pk` 0=solid 1=arcade 2=rib. `pc` and `pdk` "
               "are the mock decoder's RESOLVED values (c defaults to m, dk to "
               "0.75). `ppi` = -1 means one opening and no repetition (the file "
               "writes 1e9). `acc` = -1 means the crown carries no chroma. "
               "`hull` = 1 on Sutro Tower alone and base/heroes.json says why. "
               "Names, anchors, year sources and the drawn/measured prose are "
               "in base/heroes.json, keyed by the same index."))

    # ── the strings, beside the chunk, as base/marks.json is ────────────────
    side = {
        "note": HERO["note"],
        "wo": HERO["wo"],
        "mat": HERO["mat"],
        # `measured` is the sentence landmarks.ts's Hero record asks for. The
        # source carries the measurement as a STRUCTURE (`ms`), not as prose, so
        # this renders it mechanically — the same template for all eleven, no
        # number touched, `ms` shipped alongside so the caller can format it
        # differently. Nothing is added that is not in `ms`.
        "heroes": [{"k": h["k"], "n": h["n"], "b": h["b"], "y": h["y"],
                    "an": h["an"], "ys": h["ys"], "dr": h["dr"],
                    "measured": (
                        f"Footprint {h['ms']['a']:,.1f} m2 on {h['ms']['nv']} "
                        f"published vertices; roof {h['ms']['h']:,.1f} m and top "
                        f"{h['ms']['t']:,.1f} m above ground; plan radius "
                        f"{h['ms']['r']:,.2f} m; roll year {h['ms']['yr']}."),
                    "hu": h.get("hu"), "ms": h["ms"], "em": h["em"],
                    "ac": h.get("ac", -1),
                    "accent": (HERO["mat"][h["ac"]][1]
                               if h.get("ac") is not None and h["ac"] >= 0 else None)}
                   for h in H],
        "parts": strings,
    }
    (OUT / "base").mkdir(parents=True, exist_ok=True)
    (OUT / "base" / "heroes.json").write_text(
        json.dumps(side, separators=(",", ":"), ensure_ascii=False))

    cstat = _encode_caps(LRD)
    gstat = _encode_bridge(LRD, MARKS)
    not_solo = [h["k"] for h in H if not solo[h["b"]]]
    return {"n": HN, "parts": len(pk), "verts": len(rx), "profPts": len(pu),
            "notSolo": not_solo,
            # TWO NUMBERS FOR CITY HALL'S FOOTPRINT, AND THEY ARE NOT A CONFLICT.
            # `ms.a` is 11,251.5 m2. The PUBLISHED ynuv-fyni ring measures
            # 11,205.92 m2 over its 26 vertices and a 441.5 m perimeter;
            # rounding that ring to the mock's own 1 m vertex quantiser
            # (`BLDG.q = 1.0`) gives a vertex set identical to the shipped one
            # and an area of exactly 11,251.5 — so `ms.a` is the PUBLISHED ring
            # AFTER the shipped quantiser, +45.6 m2 and +0.407 %. That is the
            # right number for this field, because the containment gate tests
            # generated vertices against the ring the page actually draws.
            # The 11,177 m2 in PLAN-NIGHT2.md is neither figure and reproduces
            # no derivation in the tree; it is corrected there.
            "msAreaNote": (
                "ms.a is the area of the footprint ring AS DRAWN — the published "
                "DataSF ynuv-fyni ring after the mock's own 1 m vertex quantiser "
                "(BLDG.q = 1.0). For City Hall the published ring is 11,205.92 m2 "
                "and the quantised ring is 11,251.5 m2, +0.407 %. The gate is "
                "stated against the drawn ring, so the drawn ring's area is what "
                "this field carries; a reader quoting a footprint should quote "
                "the published figure and say which."),
            "caps": cstat, "bridge": gstat,
            "notSoloNote": "These heroes' footprints are not in base/solo, so "
                           "their anchors could not be read at first paint and "
                           "are shipped on the hero record instead.",
            "note": "Emphasis is a property of the DRAWING. " + HERO["note"]}



def _encode_caps(LRD: dict) -> dict:
    """The 68 shaped caps: a published building, and which profile it is given.

    `render-data.js` packs them as 68 u32 building indices and 68 u8 profile
    indices into its own six-entry profile table. The SHAPE is drawn and the
    file says so in its own words, carried here verbatim into the manifest:
    the data fixes the top height and the plan area and says nothing about
    taper, and every profile is carved INSIDE the measured solid, so a drawn
    cap is always smaller than what was measured, never larger.
    """
    cap = LRD["cap"]
    idx = np.frombuffer(unb64(cap["i"]), dtype=np.uint32)
    prf = np.frombuffer(unb64(cap["p"]), dtype=np.uint8)
    assert idx.size == prf.size, (idx.size, prf.size)
    assert int(prf.max()) < len(LRD["prof"]), (int(prf.max()), len(LRD["prof"]))
    off, pu, ps = [0], [], []
    for pr in LRD["prof"]:
        for u, s in pr:
            pu.append(u); ps.append(s)
        off.append(len(pu))
    w = ChunkWriter("base/caps", "cap")
    w.add("bi", "u32", idx).add("prof", "u8", prf)
    w.add("poff", "u32", off).add("pu", "f32", pu).add("ps", "f32", ps)
    meas = "; ".join(LRD["meta"]["measured"])
    drawn = " ".join(LRD["meta"]["drawn"])
    p = src("cap-shape", publisher="DataSF / this project",
            dataset="ynuv-fyni zonal statistics + render/build_render.py",
            what="which published buildings are given a shaped cap, and which "
                 "of six profiles each is given. Measured, per the source: "
                 + meas,
            script="scratchpad/sf-city-anim/render/build_render.py",
            not_measured=drawn)
    emit(w, tier="base", minZ=Z_MASSING, extent=None,
         prov={n: p for n in ("bi", "prof", "poff", "pu", "ps")},
         extra={"n": int(idx.size), "profiles": LRD["profN"]},
         note=("Cap c sits on building bi[c] and takes profile prof[c], whose "
               "points are pu/ps over poff[prof]..poff[prof+1]. `u` is height "
               "fraction in [0,1], monotone; `s` is radius scale. Profile 0 is "
               "`prism` — the identity — and no cap uses it. The profile table "
               "is shared and is the same six `render-data.js` ships."))
    return {"n": int(idx.size), "profiles": LRD["profN"],
            "byProfile": {LRD["profN"][k]: int((prf == k).sum())
                          for k in sorted(set(prf.tolist()))}}


def _encode_bridge(LRD: dict, MARKS: dict) -> dict:
    """The Golden Gate deck, its two towers, and the year it EXISTED.

    THE YEAR IS 1937 AND THE 1933 IN THE BLOCK WRITE-UPS IS STALE.
    `rzic-39gi` gives the landmark `yearbuilt` 1933 and the FHWA National
    Bridge Inventory gives `YEAR_BUILT_027` 1937. Both are published and both
    are carried below, but they are not two opinions about the same event:
    **1933 is when construction began and 1937 is when the bridge was completed
    and opened.** A map that draws where a bridge IS wants the year it existed,
    so 1937 is the gate and 1933 is recorded beside it as what it is.
    `marks-data.js` already ships `ggbYr` 1937 and `landmarks.ts` already reads
    `GGB.year` 1937; it is the prose in render/BLOCK-LR.md and marks/BLOCK-N.md
    that is out of date, and it is corrected there rather than here.

    The towers are the FAA obstacle file's two points PROJECTED ONTO the City's
    published deck line — a tower cannot stand beside its own bridge, and the
    correction (6.64 m and 1.17 m) is smaller than the file's own whole-
    arc-second precision, which is 31 m of latitude here.
    """
    g = LRD["ggb"]
    ring = MARKS["ggb"]
    a, b = g["ax"], g["bx"]
    tow = [(a[0] + (b[0] - a[0]) * t["t"], a[1] + (b[1] - a[1]) * t["t"])
           for t in g["towers"]]
    # the assertion landmarks.ts states at GGB_TOWER_TOL_M
    TOL = 31.0
    for (px, py), t in zip(tow, g["towers"]):
        d = min(_seg_dist(px, py, ring[k], ring[k + 1]) for k in range(len(ring) - 1))
        if d > TOL:
            raise ValueError(f"tower {t['oas']} is {d:.1f} m off the published deck")
    w = ChunkWriter("base/bridge", "bridge")
    w.add("rx", "f32", [p[0] for p in ring]).add("ry", "f32", [p[1] for p in ring])
    w.add("tx", "f32", [p[0] for p in tow]).add("ty", "f32", [p[1] for p in tow])
    deck = src("ggb-deck", publisher="DataSF", dataset="97yj-54sx",
               what="Article 10 landmark no. 222, designated 1999 — the deck "
                    "corridor, five vertices. Corroborated by US Census "
                    "TIGERweb Primary Roads 'Golden Gate Brg': 9 of its 11 "
                    "vertices fall inside this ring, and both files stop at "
                    "37.8254 N, the county line mid-channel, because that is "
                    "where San Francisco stops",
               not_measured="The deck is drawn FLAT: no deck height is published "
                            "in either file, and the Bay Bridge on this map is "
                            "flat for the same reason. It carries no family "
                            "colour, no place mark, no hit target and no money — "
                            "the corpus decision `golden-gate-bridge` has "
                            "`geometry_source: NOT IN RECORD`, so nothing here "
                            "may imply this line is that decision's position")
    nbi = src("ggb-nbi", publisher="FHWA", dataset="National Bridge Inventory 2023 "
                                                  "(California), structure 27 0052",
              url="https://www.fhwa.dot.gov/bridge/nbi/2023/delimited/CA23.txt",
              retrieved="2026-08-22",
              sha256="d0e0e81cc510580fd364e448396c5a7c5cfa12c89a1ea3975ae8d83d9dda60df",
              what="main span 1280.2 m, structure length 2742.3 m, deck width "
                   "18.9 m, navigational vertical clearance 67.1 m, "
                   "YEAR_BUILT_027 = 1937",
              licence="work of the US government, public domain")
    faa = src("ggb-faa", publisher="FAA", dataset="Digital Obstacle File, "
                                                  "obstacles 06-000771 and 06-000108, type BRIDGE",
              url="https://aeronav.faa.gov/Obst_Data/DAILY_DOF_DAT.ZIP",
              retrieved="2026-08-22", currency="CURRENCY DATE = 08/18/26",
              sha256="d532c94bc91797bedef2083b59037464f258c31cb67fa0f15ec981485f380fc6",
              what="tower position and tower height: 760 ft above sea level, "
                   "757 ft above ground. The only published file found that "
                   "gives both. Positions are to the whole arc-second — 31 m of "
                   "latitude here — and are projected onto the published deck "
                   "line, moving them 6.64 m and 1.17 m",
              licence="work of the US government, public domain")
    emit(w, tier="base", minZ=Z_MASSING,
         extent=[min(p[0] for p in ring), min(p[1] for p in ring),
                 max(p[0] for p in ring), max(p[1] for p in ring)],
         prov={"rx": deck, "ry": deck, "tx": faa, "ty": faa},
         extra={"year": g["nbiYear"], "yearLandmark": g["year"],
                "yearSource": "FHWA NBI YEAR_BUILT_027 = completion and opening",
                "yearLandmarkSource": "DataSF rzic-39gi yearbuilt = construction began",
                "deckLenM": g["L"], "deckW": g["w"], "deckZ": g["z"],
                "spanM": g["span"], "structureLenM": g["slen"],
                "towerHeadM": g["th"], "towerFt": g["towers"][0]["amsl_ft"],
                "towerAglFt": g["towers"][0]["agl_ft"],
                "towerSepM": g["dtower"], "towerTolM": TOL,
                "towerOff": [t["off"] for t in g["towers"]],
                "oas": [t["oas"] for t in g["towers"]],
                "nbiKind": g["kind"], "nbiType": g["stype"]},
         note=("`rx`/`ry` are the published deck ring, 5 vertices, closed. "
               "`tx`/`ty` are the two towers. THE YEAR IS 1937 — the NBI's "
               "completion year, which is when the bridge existed. 1933 is "
               "`rzic-39gi`'s `yearbuilt` and is when construction BEGAN; it is "
               "carried as `yearLandmark` and is NOT the gate. The main cable's "
               "low point is drawn AT the deck, so the sag is the difference "
               "between two published figures (towerHeadM - deckZ = "
               f"{g['th'] - g['z']:.2f} m) and not a number of its own. The "
               "suspender spacing (30 m) and the leg size (7 m) are drawing "
               "decisions; nothing publishes them."))
    return {"year": g["nbiYear"], "yearLandmark": g["year"],
            "towers": len(tow), "towerSepM": g["dtower"], "towerTolM": TOL,
            "deckLenM": g["L"], "spanM": g["span"],
            "note": "1937 is completion and opening; 1933 is when construction "
                    "began. The map draws where the bridge IS, so the gate is 1937."}


def _seg_dist(px: float, py: float, a, b) -> float:
    import math
    vx, vy = b[0] - a[0], b[1] - a[1]
    wx, wy = px - a[0], py - a[1]
    L = vx * vx + vy * vy
    t = 0.0 if L == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / L))
    return math.hypot(px - (a[0] + vx * t), py - (a[1] + vy * t))


def encode_form(FORM: dict, TYPO: dict, LRD: dict, B: dict) -> dict:
    """`form-data.js` (Block C) and `typo-data.js`'s mast (the third solid).

    THIS IS THE CHUNK THE 68 SHAPED CAPS WERE BLOCKED ON, AND THE REASON IS
    WORTH KEEPING. `base/caps` has shipped `bi` and `prof` and the six-entry
    profile table since P4: which building gets a dome, which gets a spire, and
    what a dome's silhouette is. What it never shipped is the SOLID the profile
    shapes. `lrStep` sweeps a profile around a cap whose top, radius, plan
    angle and centre come from somewhere else entirely — `window.FORM` — so
    with `base/form` missing there was a shape and nothing to put it on, and
    all 68 caps, the second solid under them and the third solid beside them
    were absent from a page that had every byte of the shape.

    ── WHAT THE SECOND SOLID IS ────────────────────────────────────────────
    Every one of the 166,166 buildings is drawn as one prism at `hgt_mediancm`.
    A median is right for a building's MASS and wrong for its SILHOUETTE: it is
    by construction the height half the roof is below, so a tower, a drum, a
    campanile or a penthouse — anything a MINORITY of the roof does — is
    averaged out of existence. The Ferry Building publishes a median of 15.2 m
    and a maximum of 71.4 m; the page drew 15.2 and the clock tower was gone.

    `form/model3.py` recovers the second plane from three published columns and
    a cell count, with no fitting:

        L  = hgt_mediancm             the plane already drawn — UNCHANGED
        T  = hgt_maxcm                the highest 50 cm cell in the footprint
        f  = (hgt_meancm - L)/(T - L) the fraction of cells that must stand at
                                      T for the published MEAN to come out
        A2 = f * hgt_cells50cm * 0.25 the upper plane's area, m2

    gated at `T - L >= 6 m` (one San Francisco storey, from that file's own
    calibration of LIDAR height against the assessor's storey count) and
    `A2 >= 58.06 m2` (25 ft x 25 ft, one San Francisco lot frontage squared —
    below it sits the stair bulkhead, the lift overrun, the chimney and the
    aerial). It fires on 488 footprints, 0.29 % of the city.

    ── AND THE THIRD ──────────────────────────────────────────────────────
    The step model cannot see a steeple: a steeple is a handful of 50 cm cells
    and fails the area gate by two orders of magnitude. `typo/mast.py` reaches
    it through the PUBLISHED CLASS of the place under it, which is not a
    marginal enrichment — church 18 of 25, against a base rate of 2.1 % — and
    guards it with two other published instruments disagreeing: the aerial
    imagery's canopy flag (a LIDAR maximum over an overhanging tree is the
    tree) and a neighbouring footprint within 12 m publishing 85 % of the same
    maximum (two footprints that close cannot be told apart by a zonal
    statistic over either). 40 masts, and their plan is DECLARED at the same
    58.06 m2 on a footprint at least four times that.

    Both are one stream here for the same reason they are one stream in the
    mock: a mast is drawn by the SECOND solid's own machinery — same octagon,
    same projection, same painter's order, same year gate — and not one line of
    any draw loop is added for it.

    ── WHAT IS NOT SHIPPED ────────────────────────────────────────────────
    `FORM.k`, the inset ratio. `build_form.py` built two outlines and compared
    them on screen: INSET scales the footprint's own ring to the derived area,
    which on the Ferry Building draws a 26 x 7 m blade at 71 m and asserts a
    SHAPE for the tower that nothing measured. CORE — a regular octagon of the
    derived area, turned onto the footprint's own dominant edge direction —
    asserts only the area, which is the thing that was derived. CORE is what
    the mock draws, `k` has no reader anywhere in `part1-4.html`, and shipping
    a field whose only use was rejected would invite someone to use it.
    """
    fi = np.frombuffer(unb64(FORM["i"]), dtype=np.uint32)
    ft = np.frombuffer(unb64(FORM["t"]), dtype=np.uint16)
    fr = np.frombuffer(unb64(FORM["r"]), dtype=np.uint16)
    fa = np.frombuffer(unb64(FORM["an"]), dtype=np.uint8)
    fdx = np.frombuffer(unb64(FORM["dx"]), dtype=np.int16)
    fdy = np.frombuffer(unb64(FORM["dy"]), dtype=np.int16)
    n = int(FORM["n"])
    for name, arr in (("i", fi), ("t", ft), ("r", fr), ("an", fa),
                      ("dx", fdx), ("dy", fdy)):
        if arr.size != n:
            raise ValueError(f"FORM.{name}: {arr.size} values for n={n}")
    if int(fi.max()) >= B["n"]:
        raise ValueError(f"FORM.i addresses building {int(fi.max())} of {B['n']}")

    M = TYPO["mast"]
    mi = np.frombuffer(unb64(M["i"]), dtype=np.uint32)
    mt = np.frombuffer(unb64(M["t"]), dtype=np.uint16)
    mr = np.frombuffer(unb64(M["r"]), dtype=np.uint16)
    ma = np.frombuffer(unb64(M["an"]), dtype=np.uint8)
    mdx = np.frombuffer(unb64(M["dx"]), dtype=np.int16)
    mdy = np.frombuffer(unb64(M["dy"]), dtype=np.int16)
    msp = np.frombuffer(unb64(M["spire"]), dtype=np.uint8)
    mn = int(M["n"])
    for name, arr in (("i", mi), ("t", mt), ("r", mr), ("an", ma),
                      ("dx", mdx), ("dy", mdy), ("spire", msp)):
        if arr.size != mn:
            raise ValueError(f"TYPO.mast.{name}: {arr.size} values for n={mn}")
    if mn and int(mi.max()) >= B["n"]:
        raise ValueError(f"mast.i addresses building {int(mi.max())} of {B['n']}")

    # NEVER TWO SOLIDS OVER ONE ROOF. `mast.py` already drops the footprints that
    # carry Block C's step, and the client's merge skips a building that already
    # has a slot; this is the assertion that makes the invariant true HERE rather
    # than true somewhere upstream.
    both = np.intersect1d(fi, mi)
    if both.size:
        raise ValueError(f"{both.size} buildings carry both a step and a mast: "
                         f"{both[:8].tolist()}")

    # AND EVERY CAP HAS A SOLID TO SHAPE. `base/caps` names a BUILDING; the
    # profile is swept around the slot that building carries, so a cap whose
    # building has no slot is a shape with nothing to put it on — which is
    # exactly the state this chunk exists to end.
    ci = np.frombuffer(unb64(LRD["cap"]["i"]), dtype=np.uint32)
    slots = np.concatenate([fi, mi])
    miss = ci[~np.isin(ci, slots)]
    if miss.size:
        raise ValueError(f"{miss.size} of {ci.size} caps sit on a building with no "
                         f"form slot: {miss[:8].tolist()}")

    w = ChunkWriter("base/form", "form")
    w.add("bi", "u32", fi).add("top", "u16", ft).add("rad", "u16", fr)
    w.add("ang", "u8", fa).add("dx", "i16", fdx).add("dy", "i16", fdy)
    w.add("mbi", "u32", mi).add("mtop", "u16", mt).add("mrad", "u16", mr)
    w.add("mang", "u8", ma).add("mdx", "i16", mdx).add("mdy", "i16", mdy)
    w.add("mspire", "u8", msp)

    g = FORM["meta"]["gates"]
    step = src(
        "form-step", publisher="DataSF",
        dataset="ynuv-fyni (LIDAR zonal statistics per building footprint)",
        what="a SECOND solid on the 488 footprints whose own published statistics say "
             "there is one. `top` is hgt_maxcm, the highest 50 cm cell in the "
             "footprint. `rad` is the circumradius of a regular octagon whose area is "
             "f x hgt_cells50cm x 0.25 m2, where f = (hgt_meancm - hgt_mediancm)/"
             "(hgt_maxcm - hgt_mediancm) — gated at minStepM="
             f"{g['minStepM']}, minUpperM2="
             f"{g['minUpperM2']}, fMax={g['fMax']}"
             ". The base plane is unchanged: this is purely additive.",
        script="scratchpad/sf-city-anim/form/build_form.py",
        not_measured="WHERE inside the footprint the upper plane stands — the zonal "
                     "statistics are aggregates over the whole polygon and carry no "
                     "location, so it is drawn at the footprint's own area centroid; "
                     "nor its OUTLINE, which is drawn as a regular octagon of the "
                     "derived area turned onto the footprint's own dominant edge "
                     "direction; nor HOW MANY steps — two published moments support "
                     "two planes and a third is not identifiable from this file.")
    mast = src(
        "form-mast", publisher="DataSF",
        dataset="ynuv-fyni hgt_maxcm + the place class from nc68-ngbr department_name, "
                "gtr9-ntp6 propertytype, rzic-39gi proptype",
        what="a THIRD solid on 40 footprints whose published CLASS makes a LIDAR "
             "maximum attributable — church 18 of 25 against a 2.1 % base rate. Two "
             "guards, each a different published instrument disagreeing: the aerial "
             "canopy flag, and a published footprint within 12 m carrying 85 % of the "
             "same maximum. Minimum lift "
             f"{M['minLift']} m. `mspire` is 1 where the class is one that carries a "
             "spire, and it is the only thing that chooses the spire profile.",
        script="scratchpad/sf-city-anim/typo/mast.py",
        not_measured="the PLAN of the mast. Nothing published says how wide a steeple "
                     "is; it is DECLARED at "
                     f"{M['planM2']} m2 — the step model's own minimum, 25 ft x 25 ft "
                     "— on a footprint at least four times that, so the drawn plan is "
                     "never more than a quarter of the roof it stands on. `park` and "
                     "`landmark` are excluded as classes: a park building is a restroom "
                     "under a tree, and an Article 10 designation is a LISTING and not "
                     "a building.")
    prov = {k: step for k in ("bi", "top", "rad", "ang", "dx", "dy")}
    prov.update({k: mast for k in ("mbi", "mtop", "mrad", "mang", "mdx", "mdy",
                                   "mspire")})
    emit(w, tier="base", minZ=Z_MASSING, extent=None, prov=prov,
         extra={"n": n, "octN": int(FORM["octN"]), "nMast": mn,
                "nSpire": int((msp != 0).sum()),
                "gates": g, "mastPlanM2": M["planM2"],
                "mastMinLiftM": M["minLift"],
                "declined": FORM["meta"]["counts"],
                "mastByClass": M["by_class"], "mastDeclined": M["drop"]},
         note="Slot s stands on building bi[s]. `top` is DECIMETRES above the same "
              "datum the building's own height byte uses; `rad` is the octagon's "
              "circumradius in CENTIMETRES; `ang` is its plan rotation, the footprint's "
              "own dominant edge direction, as u8 x (pi/2)/255; `dx`,`dy` are DECIMETRES "
              "from the vertex mean the client already holds (`BldTable.cx`/`cy`) to the "
              "footprint's true AREA centroid. The `m*` fields are the third solid and "
              "carry the same units; the client appends them to the same slot stream, "
              "skipping any building that already has a slot. `octN` is 8 and is the "
              "octagon the area was derived for. A cap in `base/caps` names a building; "
              "it draws on THIS building's slot.")
    # The chunk is 7,464 bytes for 488 second solids and 40 third: the whole of
    # the city's silhouette above its own median plane, in less than a district
    # cell of footprints.
    return {"n": n, "octN": int(FORM["octN"]), "mast": mn,
            "spire": int((msp != 0).sum()),
            "byte": w.payload_bytes}


def encode_marks(MARKS: dict) -> None:
    keep = {k: v for k, v in MARKS.items() if k != "n"}
    (OUT / "base").mkdir(parents=True, exist_ok=True)
    (OUT / "base" / "marks.json").write_text(
        json.dumps(MARKS, separators=(",", ":"), ensure_ascii=False))


# ═══════════════════════════════════════════════════════════════════════════

def main() -> int:
    GEO = load("geo/geo-data.js", "GEO")
    CITY = load("gen/city-data.js", "CITY")
    LODM = load("lod/lod-data.js", "LODM")
    ROOFD = load("roofs/roof-data.js", "ROOFD")
    PAINT = load("paint/paint-data.js", "PAINT")
    FACD = load("facade/facade-data.js", "FACD")
    WATD = load("detail/water-data.js", "WATD")
    CTX = load("gen/context-data.js", "CTX")
    STS = load("street/street-data.js", "STSURF")
    WRLD = load("world/world-data.js", "WORLD")
    MARKS = load("marks/marks-data.js", "MARKS")
    HERO = load("wonder/hero-data.js", "HERO")
    LRD = load("render/render-data.js", "LRD")
    FORM = load("form/form-data.js", "FORM")
    TYPO = load("typo/typo-data.js", "TYPO")
    TIMED = load("time/time-data.js", "TIME")
    # TWO FILES CALL THEMSELVES `window.GEO` AND THEY ARE NOT THE SAME RECORD.
    # `geo/geo-data.js` is gen_geo.py's full payload — 16,676 centrelines, every
    # class. `gen/geo-data.js` is gen_geo2.py's trim and it is the one the PAGE
    # carries: 4,895 centrelines of classcode 0-4, which is the array both
    # TIME.street.yr and street-data.js's `cov` mask are indexed on. The
    # centreline chunks take the second, and `_centrelines()` refuses a mismatch
    # rather than encoding a shifted join.
    GEO2 = load("gen/geo-data.js", "GEO")

    # THIS DIRECTORY IS NOT ALL OURS, AND THE FIRST RE-RUN PROVED IT.
    # `blocks/` under OUT is written by scratchpad/sf-city-anim/blocks/build_index.py
    # — 39 MB of block records this encoder knows nothing about — and an
    # unconditional rmtree of OUT deleted it, which took the route down with a
    # server-side 404 on blocks/block-index.json. Only what this script writes
    # is cleared: the chunk directories it is about to rebuild, plus the two
    # top-level files it owns. Anything else in OUT is left alone.
    # AND `base/places.*` IS NOT THIS SCRIPT'S EITHER. us_sf_places/emit_places.py
    # writes base/places.qc, base/places.json and the manifest's `places` key as a
    # read-modify-write on top of whatever this encoder last produced. Clearing
    # `base/` wholesale therefore dropped 2,192 named places — silently, with
    # nothing in any log, because this script has no idea they existed. Two agents
    # hit it and both had to snapshot and merge by hand. So: carry those files
    # across the rebuild, and carry the manifest key with them.
    # THE RULE, GENERALISED, BECAUSE THE LIST KEPT BEING WRONG.
    # `CARRY` was a hand-maintained list of other people's files, and a
    # hand-maintained list is only ever as current as the last person who was
    # bitten. base/surround-coast.json was not on it — it is written by
    # emit_surround_coast.py, this encoder does not rebuild it, and the rmtree
    # below deleted it (`fix(sf): the Golden Gate was dry land` had shipped it
    # two hours earlier). So the list is now a FLOOR and not the rule.
    # The rule: snapshot everything under the directories about to be cleared,
    # and after the run put back anything that was there before and that this
    # run did not write. A file this encoder produces is overwritten normally;
    # a file it knows nothing about survives, whoever added it and whenever.
    CARRY = ("base/places.qc", "base/places.json")
    if OUT.exists():
        import shutil
        held = {}
        for rel in CARRY:
            f = OUT / rel
            if f.exists():
                held[rel] = f.read_bytes()
        # everything in the cleared directories, so nothing needs to be listed
        held_all = {}
        for name in CHUNK_DIRS:
            d = OUT / name
            if d.is_dir():
                for f in d.rglob("*"):
                    if f.is_file():
                        held_all[str(f.relative_to(OUT))] = f.read_bytes()
        held_places = None
        mf = OUT / "manifest.json"
        if mf.exists():
            try:
                held_places = json.loads(mf.read_text()).get("places")
            except Exception:
                held_places = None
        for name in CHUNK_DIRS:
            d = OUT / name
            if d.is_dir():
                shutil.rmtree(d)
        for name in ("manifest.json",):
            f = OUT / name
            if f.exists():
                f.unlink()
        OUT.mkdir(parents=True, exist_ok=True)
        for rel, blob in held.items():
            f = OUT / rel
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(blob)
        globals()["_HELD_PLACES"] = held_places
    OUT.mkdir(parents=True, exist_ok=True)

    encode_terrain(GEO, CITY)
    encode_coast(CITY)
    encode_blocks(GEO, PAINT)
    solo = encode_massing(LODM)
    B = read_bldg()
    bstat = encode_buildings(B, ROOFD, PAINT, solo, CITY["proj"]["downtown"])
    fstat = encode_facades(FACD, B, solo)
    wstat = encode_water(WATD, CTX, CITY["proj"])
    xstat = encode_surround(CTX, CITY["proj"])
    hstat = encode_heroes(HERO, LRD, MARKS, B, solo)
    mstat = encode_form(FORM, TYPO, LRD, B)
    sstat = encode_streets(STS)
    # ONE NAME TABLE FOR THE WHOLE RECORD. base/street-labels owns `names`; both
    # centreline chunks index it. Built here and threaded through both, so a
    # street name exists once on the wire and the two cannot disagree about an
    # index.
    _names: list[str] = []
    _nidx: dict[str, int] = {}
    lstat = encode_centrelines(GEO2, TIMED, STS, _names, _nidx)
    ustat = encode_unimplied(GEO2, TIMED, _names, _nidx)
    lbstat = encode_street_labels(GEO2, TIMED, _names, _nidx)
    tstat = encode_trees(WRLD)
    encode_marks(MARKS)

    tiers: dict[str, dict] = {}
    for c in chunks:
        tt = tiers.setdefault(c["tier"], {"chunks": 0, "bytes": 0, "gzipBytes": 0,
                                          "minZ": c["minZ"]})
        tt["chunks"] += 1
        tt["bytes"] += c["b"]
        tt["gzipBytes"] += c["gz"]

    manifest = {
        "format": "qc/1",
        "grid": {"cell": CELL, "originX": ORIGIN_X, "originY": ORIGIN_Y, "nx": NX, "ny": NY},
        "proj": CITY["proj"],
        "camera": {
            "note": "lod/BLOCK-L.md, measured: at the 315 deg bearing proj() is "
                    "axis-aligned, so a world metre is pxAcross * cam.scale px across the "
                    "screen and pxDown * cam.scale down it. z = cam.scale / cam.base.",
            "pxAcross": 1.2247, "pxDown": 0.7071, "baseAt1440x940": 0.05565,
            "presets": {"whole": 1.0, "district": 2.9, "block": 7.2},
            "LOD_Z0": 1.55, "LOD_Z1": 2.35, "MINZ": 1, "MAXZ": 12,
        },
        "tiers": tiers,
        "kinds": kinds,
        "buildings": {k: v for k, v in bstat.items() if k not in ("bytes", "gzip", "cells")},
        "facade": fstat,
        "water": wstat,
        "surround": xstat,
        "landmarks": hstat,
        "form": mstat,

        "streets": {k: v for k, v in sstat.items() if k not in ("bytes", "gzip", "cells", "cite")},
        "centrelines": lstat,
        "streetsUnimplied": ustat,
        "streetLabels": lbstat,
        "trees": {k: v for k, v in tstat.items() if k not in ("bytes", "gzip", "cells")},
        "sources": sources,
        "chunks": sorted(chunks, key=lambda c: c["k"]),
    }
    # Put back the `places` key emit_places.py added on top of the last build, so a
    # plain re-run of this encoder does not drop 2,192 named places from the map.
    _hp = globals().get("_HELD_PLACES")
    if _hp is not None and "places" not in manifest:
        manifest["places"] = _hp
        print("carried the places key across the rebuild")
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, separators=(",", ":"), ensure_ascii=False, sort_keys=False))

    total = sum(c["b"] for c in chunks)
    tgz = sum(c["gz"] for c in chunks)
    print(f"{len(chunks)} chunks, {total:,} bytes ({tgz:,} gzipped)")
    for t in sorted(tiers, key=lambda k: tiers[k]["minZ"]):
        v = tiers[t]
        print(f"  {t:8s} z>={v['minZ']:<5} {v['chunks']:4d} chunks  "
              f"{v['bytes']:>10,}  {v['gzipBytes']:>10,} gz")
    print("manifest", len(json.dumps(manifest, separators=(',', ':'))), "bytes")

    # AND PUT THE NAMED PLACES BACK, because this script rebuilds base/marks.json
    # from the mock and that is the file the renderer actually reads.
    # us_sf_places/emit_places.py merges 2,192 places from ten registers into it as
    # a read-modify-write; a plain re-run of this encoder drops 949 of them and
    # restores a stale 1,243, silently, with nothing in any log. That has now
    # happened twice and cost two agents a recovery each. Carrying the .qc across
    # the rebuild (above) is not enough on its own — the merge has to be re-applied.
    # Re-running the emitter is idempotent and takes about a second.
    _places_qc = OUT / "base" / "places.qc"
    if _places_qc.exists():
        import subprocess, sys as _sys
        _emit = pathlib.Path(__file__).resolve().parent.parent / "us_sf_places" / "emit_places.py"
        if _emit.exists():
            r = subprocess.run([_sys.executable, str(_emit), "--marks"],
                               capture_output=True, text=True)
            if r.returncode == 0:
                print("re-applied the named places into base/marks.json")
            else:
                print("WARNING: emit_places.py --marks failed:\n" + (r.stderr or r.stdout))

    # AND PUT THE AUTHORED HEROES BACK, WHICH IS THE SAME TRAP ONE FILE OVER.
    # `encode_heroes()` above rebuilds base/heroes.{qc,json} from the mock's
    # wonder/hero-data.js, which carries ELEVEN. us_sf_places/emit_heroes.py
    # merges further heroes into that register — its own seed, the same
    # `_chunk.ChunkWriter`, keyed on `k`, replace-or-append — and its docstring
    # names this trap in as many words: "re-running encode_city_chunks.py
    # rebuilds base/heroes.* from the mock and puts the eleven back. This must
    # be re-run after it."
    #
    # It was documented and it was still not automated, so it was still a trap:
    # a re-run of this encoder for an unrelated reason (the block-key fix, in
    # this case) silently dropped the Palace of Fine Arts Exhibition Hall, and
    # the only reason it was noticed is that the re-run was diffed against a
    # backup taken beforehand. The places merge earned its automation by costing
    # two agents a recovery each; this one is automated before it costs a third.
    #
    # emit_heroes.py refuses to run unless the shipped heroes survive a
    # read/re-encode round trip byte for byte, so a failure here is loud.
    # PUT BACK ANYTHING THIS RUN DID NOT WRITE. See the note beside `held_all`.
    _restored = []
    for rel, blob in held_all.items():
        f = OUT / rel
        if not f.exists():
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(blob)
            _restored.append(rel)
    if _restored:
        print("carried across the rebuild (not written by this encoder): "
              + ", ".join(sorted(_restored)))

    _heroes_qc = OUT / "base" / "heroes.qc"
    if _heroes_qc.exists():
        import subprocess, sys as _sys
        _emit = pathlib.Path(__file__).resolve().parent.parent / "us_sf_places" / "emit_heroes.py"
        if _emit.exists():
            r = subprocess.run([_sys.executable, str(_emit)],
                               capture_output=True, text=True)
            if r.returncode == 0:
                print("re-applied the authored heroes into base/heroes.qc")
            else:
                print("WARNING: emit_heroes.py failed:\n" + (r.stderr or r.stdout))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
