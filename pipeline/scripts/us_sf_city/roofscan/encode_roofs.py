"""
THE ROOF CHUNK — what the scan measured, in the format the map already reads.

One chunk per grid tile, `kind: "roof"`, keyed to sit beside the `bldg` chunk
it describes (`roof/10_10` next to `bldg/10_10`, `roof/solo` next to
`base/solo`). A tile with no roof chunk draws exactly as it does today, so this
ships incrementally and cannot break a neighbourhood it has not reached.

── WHY A NEW KIND AND NOT NEW COLUMNS ON `bldg` ─────────────────────────────
Adding columns to `bldg` means re-encoding all 139 footprint chunks, so a
partial run would leave the city half-described in a file the renderer must
trust whole. A separate kind is additive: the buildings layer looks a gid up,
finds nothing, and draws the prism it drew before.

── THE UNITS ARE DECIMETRES, AND THAT IS THE RECORD'S OWN PRECISION ─────────
The scan is rastered at 0.35 m and the published footprints are quantised to
1 m, so a decimetre is already finer than either input. Box sizes and rises are
one byte, clamped at 25.5 m — measured over the two test squares, the largest
rooftop object is 12.6 m across, so the clamp is headroom rather than a cut.
"""
from __future__ import annotations
import json, math, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from citymap.chunk import ChunkWriter
from chunks import all_footprints, bldg_chunk_paths, decode_chunk, decode_bldg

HERE = os.path.dirname(os.path.abspath(__file__))
CITY = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..",
                                    "website", "public", "data", "us", "sf", "city"))
GRID = {"cell": 1024.0, "originX": -8192.0, "originY": -8192.0, "nx": 16, "ny": 16}
LON0, LAT0, MPD, COSL = -122.438, 37.76, 111320.0, 0.790582709628753

DM = 10.0          # decimetres per metre
BOX_MAX_DM = 255   # one byte, 25.5 m
CLUTTER_CAP = 8    # boxes kept per building, largest first


def merc_to_world(mx, my):
    from pyproj import Transformer
    inv = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
    lon, lat = inv.transform(mx, my)
    return (lon - LON0) * MPD * COSL, (lat - LAT0) * MPD


def tile_of(x: float, y: float) -> str:
    i = int((x - GRID["originX"]) // GRID["cell"])
    j = int((y - GRID["originY"]) // GRID["cell"])
    i = min(max(i, 0), GRID["nx"] - 1); j = min(max(j, 0), GRID["ny"] - 1)
    return f"{i}_{j}"


def solo_gids() -> set[int]:
    p = os.path.join(CITY, "base", "solo.qc")
    if not os.path.exists(p): return set()
    return set(int(g) for g in decode_bldg(decode_chunk(p))["gid"])


def build(rows, out_dir: str, quiet: bool = False):
    """rows: the extractor's dicts. Writes roof/*.qc and returns a manifest list."""
    foot = {g: (rx, ry) for g, rx, ry, *_ in all_footprints(CITY)}
    solo = solo_gids()
    by_key: dict[str, list] = {}
    dropped = 0
    for r in rows:
        g = int(r["gid"])
        f = foot.get(g)
        if f is None: dropped += 1; continue
        cx, cy = float(np.mean(f[0])), float(np.mean(f[1]))
        key = "solo" if g in solo else tile_of(cx, cy)
        by_key.setdefault(key, []).append((r, cx, cy))
    os.makedirs(out_dir, exist_ok=True)
    entries = []
    for key, items in sorted(by_key.items()):
        gid, flags, slope, ridge, rh, cn = [], [], [], [], [], []
        bx, by, bw, bd, bh = [], [], [], [], []
        for r, cx, cy in items:
            boxes = r.get("clutter", [])[:CLUTTER_CAP]
            keep = []
            for b in boxes:
                wx, wy = merc_to_world(b["mx"], b["my"])
                dx = int(round((wx - cx) * DM)); dy = int(round((wy - cy) * DM))
                if abs(dx) > 32000 or abs(dy) > 32000: continue
                w = min(BOX_MAX_DM, max(1, int(round(b["w"] * DM))))
                d = min(BOX_MAX_DM, max(1, int(round(b["d"] * DM))))
                h = min(BOX_MAX_DM, max(1, int(round(max(0.0, b["rise"]) * DM))))
                keep.append((dx, dy, w, d, h))
            gid.append(int(r["gid"]))
            flags.append(1 if r["pitched"] else 0)
            slope.append(min(255, max(0, int(round(r["slope_deg"])))))
            ridge.append(0 if r["ridge_deg"] is None else int(round(r["ridge_deg"])) % 180)
            rh.append(min(65535, max(0, int(round(r["scan_h"] * DM)))))
            cn.append(len(keep))
            for t in keep:
                bx.append(t[0]); by.append(t[1]); bw.append(t[2]); bd.append(t[3]); bh.append(t[4])
        w = ChunkWriter(f"roof/{key}", "roof")
        w.add("gid", "u32", gid).add("flags", "u8", flags).add("slope", "u8", slope)
        w.add("ridge", "u8", ridge).add("rh", "u16", rh).add("cn", "u8", cn)
        w.add("bx", "i16", bx).add("by", "i16", by)
        w.add("bw", "u8", bw).add("bd", "u8", bd).add("bh", "u8", bh)
        blob = w.serialise()
        sub = os.path.join(out_dir, "roof")
        os.makedirs(sub, exist_ok=True)
        with open(os.path.join(sub, f"{key}.qc"), "wb") as fh: fh.write(blob)
        entries.append({"k": f"roof/{key}", "kind": "roof", "tier": "bldg",
                        "b": len(blob), "n": len(gid), "boxes": len(bx)})
        if not quiet:
            print(f"  roof/{key:<8} {len(gid):>6} buildings  {len(bx):>6} boxes  {len(blob)/1024:>7.1f} KB")
    if dropped and not quiet:
        print(f"  ({dropped} rows had no published footprint and were dropped)")
    return entries


def merge_manifest(entries, city_dir: str = CITY):
    """
    Put the roof chunks in the manifest, replacing any earlier run's.

    `CityData.loadTier` selects on `tier`, so these ride along with the
    footprints they describe and arrive in the same pass. Replace-or-append
    keyed on `k`, the same shape `verify_city_chunks.py` describes for every
    other kind, so re-running is idempotent rather than cumulative.
    """
    mp = os.path.join(city_dir, "manifest.json")
    m = json.load(open(mp))
    keep = [c for c in m["chunks"] if c.get("kind") != "roof"]
    m["chunks"] = keep + entries
    t = m.setdefault("tiers", {})
    m["kinds"] = m.get("kinds", {})
    if isinstance(m["kinds"], dict) and "roof" not in m["kinds"]:
        m["kinds"]["roof"] = {
            "what": "roof shape, pitch and the objects standing on it, per footprint",
            "source": "USGS 3DEP CA_SanFrancisco_1_B23, flown 2023-04-20",
            "script": "pipeline/scripts/us_sf_city/roofscan/",
        }
    json.dump(m, open(mp, "w"), separators=(",", ":"))
    return len(entries)


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "roofs.json")
    out = sys.argv[2] if len(sys.argv) > 2 else CITY
    data = json.load(open(src))
    rows = data if isinstance(data, list) else [r for v in data.values() for r in v]
    print(f"{len(rows)} extracted roofs -> {out}")
    ents = build(rows, out)
    total = sum(e["b"] for e in ents)
    print(f"\n{len(ents)} chunks, {sum(e['n'] for e in ents)} buildings, "
          f"{sum(e['boxes'] for e in ents)} boxes, {total/1024:.0f} KB total")
    if out == CITY:
        merge_manifest(ents)
        print("manifest.json updated")
