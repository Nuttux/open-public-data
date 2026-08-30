"""
READING THE PUBLISHED CITY CHUNKS FROM PYTHON.

`website/src/lib/city/data.ts` §decodeChunk is the reference and this is a
faithful port of it, checks included: the magic before anything else, then the
CRC over the whole payload. That file records why — this project has twice
been bitten by data that decoded without complaining and was wrong.

`website/src/lib/citygl/bldg.ts` §decodeBldg is the second half: a footprint
chunk stores every ring as one-byte deltas against an accumulator that is
GLOBAL ACROSS THE CHUNK, with an escape list consumed BEFORE each building's
own vertices. Get either wrong and the city comes out a diagonal smear.
"""
from __future__ import annotations
import json, os, zlib, glob
import numpy as np

MAGIC = b"QCT1"
DT = {"u8": np.uint8, "i8": np.int8, "u16": np.uint16, "i16": np.int16,
      "u32": np.uint32, "i32": np.int32, "f32": np.float32, "f64": np.float64}
BLDG_Q = 1.0                                  # the published 1 m vertex quantiser
RH_LEVELS = (-0.375, -0.125, 0.125, 0.375)    # lib/citygl/rise.ts

def _align8(n: int) -> int:
    return (n + 7) & ~7

def decode_chunk(path: str) -> dict:
    raw = open(path, "rb").read()
    if len(raw) < 16 or raw[:4] != MAGIC:
        raise ValueError(f"{path}: not a chunk (magic)")
    header_len, payload_len, want_crc = np.frombuffer(raw, np.uint32, 3, 4)
    base = _align8(16 + int(header_len))
    if base + int(payload_len) != len(raw):
        raise ValueError(f"{path}: length {base + int(payload_len)} != {len(raw)}")
    header = json.loads(raw[16:16 + int(header_len)].decode())
    payload = raw[base:base + int(payload_len)]
    got = zlib.crc32(payload) & 0xFFFFFFFF
    if got != int(want_crc):
        raise ValueError(f"{path}: crc {got:x} != {int(want_crc):x}")
    fields = {}
    for f in header["fields"]:
        dt = DT.get(f["t"])
        if dt is None: raise ValueError(f"{path}: unknown dtype {f['t']}")
        fields[f["n"]] = np.frombuffer(payload, dt, f["c"], f["o"])
    return {"key": header["k"], "kind": header["kind"], "fields": fields}

def decode_bldg(chunk: dict):
    """lib/citygl/bldg.ts §decodeBldg — rings in world metres, and the columns"""
    f = chunk["fields"]
    cnt, dx, dy = f["cnt"], f["vx"].astype(np.int32), f["vy"].astype(np.int32)
    xi, xn = f["xi"], f["xn"]
    n = len(cnt)
    esc = np.zeros(n, np.int64)
    np.add.at(esc, xi.astype(np.int64), xn.astype(np.int64))
    off = np.zeros(n + 1, np.int64); np.cumsum(cnt, out=off[1:])
    # one running sum over the whole chunk, escapes included, in stream order
    total = int(off[n] + esc.sum())
    ax = np.cumsum(dx[:total], dtype=np.int64)
    ay = np.cumsum(dy[:total], dtype=np.int64)
    rings, p = [], 0
    for i in range(n):
        p += int(esc[i])                       # escapes come first, and are skipped
        c = int(cnt[i])
        rings.append((ax[p:p + c] * BLDG_Q, ay[p:p + c] * BLDG_Q))
        p += c
    hf = f["hf"] & 3
    h = f["h"].astype(np.float64) + np.array(RH_LEVELS)[hf]
    return {"gid": f["gid"], "rings": rings, "h": h, "st": f["st"],
            "u": f["u"], "yr": f["yr"], "paintIdx": f["paintIdx"],
            "paintFlag": f["paintFlag"]}

def bldg_chunk_paths(city_dir: str):
    """
    EVERY footprint chunk, AND `base/solo.qc` IS ONE OF THEM.

    The tiled `bldg/` grid holds 150,901 of the 166,166 published footprints.
    The other 15,265 — `manifest.buildings.nSolo`, the large and the tall,
    drawn at every zoom — live in a single tier-0 chunk of kind `bldg` at
    `base/solo.qc`. Globbing `bldg/*.qc` alone silently yields a San Francisco
    whose tallest building is 19 m and which has no downtown at all. Measured
    the hard way.
    """
    paths = sorted(glob.glob(os.path.join(city_dir, "bldg", "*.qc")))
    solo = os.path.join(city_dir, "base", "solo.qc")
    if os.path.exists(solo): paths.append(solo)
    return paths


def all_footprints(city_dir: str):
    """every published footprint, as (gid, rx, ry, h, st, u, yr)"""
    out = []
    for p in bldg_chunk_paths(city_dir):
        b = decode_bldg(decode_chunk(p))
        for i, (rx, ry) in enumerate(b["rings"]):
            out.append((int(b["gid"][i]), rx, ry, float(b["h"][i]),
                        int(b["st"][i]), int(b["u"][i]), int(b["yr"][i])))
    return out

if __name__ == "__main__":
    import sys
    d = sys.argv[1] if len(sys.argv) > 1 else \
        os.path.join(os.path.dirname(__file__), "../../../../website/public/data/us/sf/city")
    fp = all_footprints(os.path.abspath(d))
    print(f"{len(fp):,} footprints")
    areas = np.array([0.5*abs(np.dot(rx, np.roll(ry,1)) - np.dot(ry, np.roll(rx,1)))
                      for _, rx, ry, *_ in fp[:20000]])
    hs = np.array([r[3] for r in fp])
    print(f"height  median {np.median(hs):.1f} m  max {hs.max():.1f} m")
    print(f"area    median {np.median(areas):.0f} m2 (first 20k)")
