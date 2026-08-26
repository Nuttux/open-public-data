"""Read San Francisco's footprint stream out of the mock's `bldg-data.js`.

WHAT IS SAN FRANCISCO HERE, and it is the whole file: the payload is
`window.BLDG` in `gen/bldg-data.js` under this city's intermediate tree, its
fields are named `cnt`/`vx`/`vy`/`xi`/`xn`/`h`/`yr`/`u`, `q` is asserted to be
1.0 because the centroid arithmetic below assumes integer metres, and `h` is a
u16 of whole metres because 255 m is below the top of THIS city (it was a u8
until 2026-08-24; see bldg/build_bldg.py MAX_H).

WHAT WAS NOT SAN FRANCISCO AND HAS LEFT. The delta codec — `rechain()`,
`replay()` and the int8 range they share — is `citymap/deltachain.py` now. It is
handed arrays and returns arrays; it never knew which city it was in. The two
names are re-exported below so the call sites that read this city's stream and
then re-chain it keep reading like one operation.

── WHY THE STREAM IS A DELTA CHAIN AT ALL ────────────────────────────────
Carried verbatim from gen/part3.html, because it is the reason the geometry is
affordable and the reason it cannot simply be sliced:

    Footprints are in HILBERT ORDER and every coordinate is a delta from the
    vertex before, so a building's first vertex is just another delta. That is
    what makes 886 k vertices affordable — no per-building origin (166 k x 4
    bytes saved), and a row of identical San Francisco houses becomes a repeated
    byte pattern inside gzip's window. 1.74 MB gzip, against 2.49 MB for the same
    geometry with per-building origins in depth order.
    A Hilbert curve still crosses the city a few times, so 878 hops do not fit an
    int8; those carry extra steps in the stream, indexed by UXI/UXN.

    Painter's order is NOT in the file. It is a counting sort on depth, run at
    load and on every setRot, which costs no bytes and is O(n).

The chain is global and sequential: you cannot take building 40,000 out of it
without walking the 39,999 in front. So the encoder REBUILDS the chain per cell.
Hilbert order means a cell's buildings are already near-contiguous in the global
order, so the deltas stay small and the escape mechanism is the same one — the
scheme is preserved, only re-anchored. Buildings keep their global index order
within the cell, so the painter's counting sort still works unchanged.
"""
from __future__ import annotations

import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from citymap.deltachain import MAXD, rechain, replay  # noqa: E402,F401
from _srcload import load, unb64  # noqa: E402


def read_bldg() -> dict:
    B = load("gen/bldg-data.js", "BLDG")
    n, q = B["n"], B["q"]
    cnt = np.frombuffer(unb64(B["cnt"]), dtype=np.uint8)
    vx = np.frombuffer(unb64(B["vx"]), dtype=np.int8).astype(np.int64)
    vy = np.frombuffer(unb64(B["vy"]), dtype=np.int8).astype(np.int64)
    xi = np.frombuffer(unb64(B["xi"]), dtype=np.uint32).astype(np.int64)
    xn = np.frombuffer(unb64(B["xn"]), dtype=np.uint16).astype(np.int64)
    assert cnt.size == n and xi.size == xn.size

    # escapes per building (the while-loop in part3 allows several per index)
    esc = np.zeros(n, dtype=np.int64)
    np.add.at(esc, xi, xn)

    per = esc + cnt.astype(np.int64)          # stream steps consumed per building
    start = np.zeros(n + 1, dtype=np.int64)
    np.cumsum(per, out=start[1:])
    assert start[n] == vx.size, (start[n], vx.size)

    # absolute integer position after every step of the stream
    ACC_X = np.cumsum(vx)
    ACC_Y = np.cumsum(vy)

    off = np.zeros(n + 1, dtype=np.int64)     # vertex offsets, part3's UOFF
    np.cumsum(cnt.astype(np.int64), out=off[1:])
    nv = int(off[n])

    # stream index of vertex k of building i = start[i] + esc[i] + k
    base = start[:n] + esc                     # first vertex's stream index, per building
    vtx_stream = np.repeat(base, cnt) + (np.arange(nv, dtype=np.int64) - np.repeat(off[:n], cnt))
    IX = ACC_X[vtx_stream]
    IY = ACC_Y[vtx_stream]

    assert q == 1.0, f"q is {q}; the integer-metre assumption below would be wrong"
    # centroid, part3's UX/UY: the arithmetic mean of the ring's own vertices
    sx = np.add.reduceat(IX.astype(np.float64), off[:n].astype(np.intp))
    sy = np.add.reduceat(IY.astype(np.float64), off[:n].astype(np.intp))
    cx = sx / cnt
    cy = sy / cnt

    return {
        "n": n, "q": q, "cnt": cnt, "off": off, "nv": nv,
        "IX": IX, "IY": IY, "cx": cx, "cy": cy,
        # `h` is a u16 of whole metres (u8 until 2026-08-24 — 255 m is
        # below the top of this city; see bldg/build_bldg.py MAX_H)
        "h": np.frombuffer(unb64(B["h"]), dtype=np.uint16),
        "yr": np.frombuffer(unb64(B["yr"]), dtype=np.uint8),
        "u": np.frombuffer(unb64(B["u"]), dtype=np.uint8),
        "useNames": B["useNames"], "meta": B["meta"],
    }
