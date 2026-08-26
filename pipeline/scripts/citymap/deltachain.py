"""The footprint geometry codec: one global delta chain, re-anchored per cell.

WHAT IS TRUE OF A CITY HERE. A set of polygon rings is written as a single
sequential stream of int8 steps — each vertex a delta from the vertex before,
including the first vertex of each ring, so a ring carries no origin of its own.
Where one hop is too long for an int8 the stream carries extra steps, indexed by
a (which ring, how many extra) pair. Two things fall out of that and neither is
a fact about any city:

  * it is CHEAP. No per-ring origin at four bytes each, and repeated shapes
    become a repeated byte pattern inside gzip's window;
  * it CANNOT BE SLICED. The chain is global and sequential, so ring 40,000
    cannot be lifted out of it without walking the 39,999 in front. A chunked
    encoder therefore has to REBUILD the chain per cell, which is what
    `rechain()` does — the scheme is preserved, only re-anchored.

Re-anchoring is only affordable if rings that are near each other in space are
near each other in the stream. That is a property of the ORDER the producer
chose, not of this codec, and the producer states it; this module neither
imposes an order nor assumes one beyond "ascending global index".

`replay()` is the decoder, in Python, and it exists for one reason: so a
round-trip proof can assert that what was written is what the client will read,
rather than trusting the encoder to be its own witness.

NO CITY, NO SOURCE, NO PATH. This module is handed numpy arrays and returns
numpy arrays. What produces those arrays — which file, which publisher, which
projection — is the caller's business and stays in the caller's directory.
"""
from __future__ import annotations

import numpy as np

# The int8 range actually used. -128 is left unused so that every delta has a
# representable negation, which is what lets a hop be split symmetrically.
MAXD = 127


def rechain(gids: np.ndarray, cnt: np.ndarray, off: np.ndarray,
            IX: np.ndarray, IY: np.ndarray):
    """Rebuild the delta chain over `gids` (ascending global ring indices).

    `cnt`/`off` are the per-ring vertex counts and offsets of the WHOLE record;
    `IX`/`IY` are the absolute integer coordinates of every vertex in it.
    Returns (vx int8, vy int8, xi u32, xn u16) — the same four arrays the global
    stream is made of, so the decoder that reads one reads the other unchanged.
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
            # a ring edge longer than the int8 range would need an escape
            # mid-ring. Assert rather than assume: a producer whose rings have
            # one is a producer this codec cannot round-trip, and it should say
            # so at encode time rather than draw a wrong shape.
            assert -MAXD <= sx <= MAXD and -MAXD <= sy <= MAXD, ("long edge", g, k, sx, sy)
            vx.append(sx)
            vy.append(sy)
            ax += sx
            ay += sy
    return (np.array(vx, dtype=np.int8), np.array(vy, dtype=np.int8),
            np.array(xi, dtype=np.uint32), np.array(xn, dtype=np.uint16))


def replay(cnt: np.ndarray, vx: np.ndarray, vy: np.ndarray,
           xi: np.ndarray, xn: np.ndarray):
    """The decoder, in Python, for the round-trip proof.

    Returns (absolute X, absolute Y, per-ring vertex offsets).
    """
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
