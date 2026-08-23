"""Replay `bldg-data.js`'s delta stream, vectorised, and re-emit it per cell.

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

import numpy as np

from _srcload import load, unb64


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
        "h": np.frombuffer(unb64(B["h"]), dtype=np.uint8),
        "yr": np.frombuffer(unb64(B["yr"]), dtype=np.uint8),
        "u": np.frombuffer(unb64(B["u"]), dtype=np.uint8),
        "useNames": B["useNames"], "meta": B["meta"],
    }


MAXD = 127   # int8 range used; -128 is left unused so a delta always has a negation


def rechain(gids: np.ndarray, cnt: np.ndarray, off: np.ndarray,
            IX: np.ndarray, IY: np.ndarray):
    """Rebuild the delta chain over `gids` (ascending global indices).

    Returns (vx int8, vy int8, xi u32, xn u16). The decoder is byte-for-byte the
    walk in part3.html, so what comes out here is what the page already knows how
    to read.
    """
    vx: list[int] = []
    vy: list[int] = []
    xi: list[int] = []
    xn: list[int] = []
    ax = 0
    ay = 0
    for j, g in enumerate(gids):
        o = int(off[g])
        c = int(cnt[g])
        dx = int(IX[o]) - ax
        dy = int(IY[o]) - ay
        # split the hop into extra steps if either axis will not fit an int8
        steps = max((abs(dx) + MAXD - 1) // MAXD, (abs(dy) + MAXD - 1) // MAXD, 1)
        if steps > 1:
            extra = steps - 1
            for k in range(extra):
                sx = int(round(dx * (k + 1) / steps)) - int(round(dx * k / steps))
                sy = int(round(dy * (k + 1) / steps)) - int(round(dy * k / steps))
                assert -MAXD <= sx <= MAXD and -MAXD <= sy <= MAXD
                vx.append(sx)
                vy.append(sy)
                ax += sx
                ay += sy
            xi.append(j)
            xn.append(extra)
            dx = int(IX[o]) - ax
            dy = int(IY[o]) - ay
        assert -MAXD <= dx <= MAXD and -MAXD <= dy <= MAXD, (dx, dy)
        vx.append(dx)
        vy.append(dy)
        ax = int(IX[o])
        ay = int(IY[o])
        for k in range(1, c):
            sx = int(IX[o + k]) - ax
            sy = int(IY[o + k]) - ay
            # a footprint edge longer than 127 m would need an escape mid-ring.
            # The published data has none; assert rather than assume.
            assert -MAXD <= sx <= MAXD and -MAXD <= sy <= MAXD, ("long edge", g, k, sx, sy)
            vx.append(sx)
            vy.append(sy)
            ax += sx
            ay += sy
    return (np.array(vx, dtype=np.int8), np.array(vy, dtype=np.int8),
            np.array(xi, dtype=np.uint32), np.array(xn, dtype=np.uint16))


def replay(cnt: np.ndarray, vx: np.ndarray, vy: np.ndarray,
           xi: np.ndarray, xn: np.ndarray):
    """part3.html's decoder, in Python, for the round-trip proof."""
    n = cnt.size
    esc = np.zeros(n, dtype=np.int64)
    if xi.size:
        np.add.at(esc, xi.astype(np.int64), xn.astype(np.int64))
    per = esc + cnt.astype(np.int64)
    start = np.zeros(n + 1, dtype=np.int64)
    np.cumsum(per, out=start[1:])
    if start[n] != vx.size:
        raise ValueError(f"stream length {start[n]} != {vx.size}")
    AX = np.cumsum(vx.astype(np.int64))
    AY = np.cumsum(vy.astype(np.int64))
    off = np.zeros(n + 1, dtype=np.int64)
    np.cumsum(cnt.astype(np.int64), out=off[1:])
    nv = int(off[n])
    base = start[:n] + esc
    idx = np.repeat(base, cnt) + (np.arange(nv, dtype=np.int64) - np.repeat(off[:n], cnt))
    return AX[idx], AY[idx], off
