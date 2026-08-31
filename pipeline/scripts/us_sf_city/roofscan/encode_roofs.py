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
ROOF_MIN_Z = 4.0   # the zoom a rooftop object first covers a pixel — the same
                   # floor `base/solo-face` takes for the facade detail


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
        ln, lh, lf = [], [], []          # the stepped levels: count, height, plan share
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
            #  a level is only worth shipping when the step is real: two levels
            #  the same width are one level, and a 3 % ledge is a parapet.
            lv = [l for l in r.get("levels", []) if isinstance(l, dict)]
            lv = [l for l in lv if l["frac"] < 0.94] + [l for l in lv if l["frac"] >= 0.94][:1]
            lv.sort(key=lambda l: -l["h"])
            lv = lv[:4]
            ln.append(len(lv) if len(lv) > 1 else 0)
            if len(lv) > 1:
                for l in lv:
                    lh.append(min(65535, max(0, int(round(l["h"] * DM)))))
                    lf.append(min(255, max(1, int(round(l["frac"] * 255)))))
            for t in keep:
                bx.append(t[0]); by.append(t[1]); bw.append(t[2]); bd.append(t[3]); bh.append(t[4])
        w = ChunkWriter(f"roof/{key}", "roof")
        w.add("gid", "u32", gid).add("flags", "u8", flags).add("slope", "u8", slope)
        w.add("ridge", "u8", ridge).add("rh", "u16", rh).add("cn", "u8", cn)
        w.add("bx", "i16", bx).add("by", "i16", by)
        w.add("bw", "u8", bw).add("bd", "u8", bd).add("bh", "u8", bh)
        w.add("ln", "u8", ln).add("lh", "u16", lh).add("lf", "u8", lf)
        blob = w.serialise()
        sub = os.path.join(out_dir, "roof")
        os.makedirs(sub, exist_ok=True)
        with open(os.path.join(sub, f"{key}.qc"), "wb") as fh: fh.write(blob)
        import gzip as _gz
        entries.append({"k": f"roof/{key}", "kind": "roof", "tier": "bldg",
                        "b": len(blob), "gz": len(_gz.compress(blob, 6)),
                        "n": len(gid), "boxes": len(bx)})
        if not quiet:
            print(f"  roof/{key:<8} {len(gid):>6} buildings  {len(bx):>6} boxes  {len(blob)/1024:>7.1f} KB")
    if dropped and not quiet:
        print(f"  ({dropped} rows had no published footprint and were dropped)")
    return entries


FIELDS = [("gid", "u32"), ("flags", "u8"), ("slope", "u8"), ("ridge", "u8"),
          ("rh", "u16"), ("cn", "u8"), ("bx", "i16"), ("by", "i16"),
          ("bw", "u8"), ("bd", "u8"), ("bh", "u8"),
          ("ln", "u8"), ("lh", "u16"), ("lf", "u8")]

PROV = {"gid": "roof_index", "flags": "roof_form", "slope": "roof_form",
        "ridge": "roof_form", "rh": "roof_plane", "cn": "roof_box",
        "bx": "roof_box", "by": "roof_box", "bw": "roof_box",
        "bd": "roof_box", "bh": "roof_box",
        "ln": "roof_step", "lh": "roof_step", "lf": "roof_step"}

SCAN = ("USGS 3DEP CA_SanFrancisco_1_B23, airborne LiDAR flown 2023-04-20; "
        "132-164 points/m2 measured over two 200 m squares")

SOURCES = {
    "roof_index": {
        "publisher": "DataSF", "dataset": "ynuv-fyni",
        "what": "the published footprint each measured roof belongs to",
    },
    "roof_plane": {
        "publisher": "USGS", "dataset": "CA_SanFrancisco_1_B23",
        "what": "the dominant roof level inside the footprint, taken as the mode "
                "of a 0.25 m height histogram over cells more than 2 m above "
                "ground, then the median of the cells within 0.45 m of it",
        "quantised": "decimetres",
        "not_measured": "WHERE a published ring is not tight to the walls, a "
                        "courtyard inside it is excluded by the 2 m floor rather "
                        "than modelled",
    },
    "roof_form": {
        "publisher": "USGS", "dataset": "CA_SanFrancisco_1_B23",
        "what": "median slope over roof cells with a full roof neighbourhood, and "
                "the ridge as the axis of the gradient structure tensor; pitched "
                "at 8-60 degrees",
        "quantised": "whole degrees; ridge 0-179",
        "not_measured": "a roof with two pitches is reported as one; the cap at 60 "
                        "degrees refuses the footprint edge, which straddles roof "
                        "and pavement and differentiates to near-vertical",
    },
    "roof_step": {
        "publisher": "USGS", "dataset": "CA_SanFrancisco_1_B23",
        "what": "the distinct levels a building steps through — the modes of a "
                "0.5 m height histogram at least 2 m apart and each covering at "
                "least 25 m2 — with the share of the footprint still standing at "
                "or above each one",
        "quantised": "decimetres; the share to 1/255; at most four levels",
        "not_measured": "the OUTLINE at each level. The share is measured and "
                        "the shape is not: the renderer insets the published "
                        "ring about its own centroid until its area matches, "
                        "rather than inventing a plan the scan did not give",
    },
    "roof_box": {
        "publisher": "USGS", "dataset": "CA_SanFrancisco_1_B23",
        "what": "connected cells standing more than 0.45 m over the roof plane and "
                "covering at least 0.5 m2 — plant, stair heads, tanks, lift "
                "overruns — as their bounding box and 90th-percentile height",
        "quantised": "decimetres; 8 largest per footprint",
        "not_measured": "WHAT each object is. The scan gives an extent and a "
                        "height and no class, so a box is drawn as a box",
    },
}


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
    #  ── A DETAIL COMPANION TAKES ITS OWN FLOOR, NOT ITS HOST'S ────────────
    #  The first cut inherited tier and minZ from the bldg chunk each roof
    #  mirrors. For `base/solo` that is tier `base`, minZ 0 — so the WHOLE-CITY
    #  frame fetched roof clutter, and data.test.ts caught it against the base
    #  tier's byte ceiling. It is right to: a 2 m plant box is far under a pixel
    #  at that zoom and can never be shown there.
    #
    #  `base/solo-face` is the precedent. The facade companion for the same
    #  solo buildings sits in tier `face` at minZ 4.0 rather than in `base`
    #  with its host. Roof plant is at least as fine as a window, so it takes
    #  the same floor and its own tier.
    host = {c["k"]: c for c in m["chunks"] if c.get("kind") == "bldg"}
    for e in entries:
        cell = e["k"].split("/", 1)[1]
        h = host.get("base/solo" if cell == "solo" else f"bldg/{cell}")
        e["tier"] = "roof"
        e["minZ"] = ROOF_MIN_Z
        if h and h.get("e") is not None: e["e"] = h["e"]
    m.setdefault("tiers", {})["roof"] = {
        "chunks": len(entries),
        "bytes": sum(e["b"] for e in entries),
        "gzipBytes": sum(e["gz"] for e in entries),
        "minZ": ROOF_MIN_Z,
    }
    keep = [c for c in m["chunks"] if c.get("kind") != "roof"]
    m["chunks"] = keep + entries
    m.setdefault("kinds", {})["roof"] = {
        "fields": [{"n": n, "t": t} for n, t in FIELDS],
        "provenance": dict(PROV),
        "note": ("What the 2023 survey measured on each roof. The record publishes "
                 "none of this: `layers/caps.ts` carries 512 second solids for "
                 "166,166 buildings and no tank, no penthouse box and no cornice "
                 "anywhere in its two chunks. This is a different, measured stream "
                 "— " + SCAN + ". A footprint with no row here draws exactly as it "
                 "did before it existed. Built by "
                 "pipeline/scripts/us_sf_city/roofscan/."),
    }
    m.setdefault("sources", {}).update(SOURCES)
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
