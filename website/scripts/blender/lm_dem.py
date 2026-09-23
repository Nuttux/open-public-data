"""USGS 3DEP bare-earth elevation on the render's world frame (fetch_dem.py
writes the tiles). sample(x, y) and grid(x0, y0, x1, y1, res) are bilinear;
None / NaN where no tile is on disk, so a caller can fall back."""
import os
import numpy as np

ROOT = '/Users/daniel/code/qipu-render-work/landmarks/dem'
T = 2000.0
_cache = {}

def _tile(res, i, j):
    k = (res, i, j)
    if k not in _cache:
        p = f'{ROOT}/{res:g}m/t_{i}_{j}.npy'
        a = np.load(p) if os.path.exists(p) else None
        if a is not None: a = np.where(a < -9000, np.nan, a)
        _cache[k] = a
    return _cache[k]

def available(res=2.0):
    return os.path.isdir(f'{ROOT}/{res:g}m')

def grid(x0, y0, x1, y1, step, res=2.0):
    """heights at the nodes x0 + i*step (i = 0..nx-1), y0 + j*step (row j
    NORTHWARD from y0); NaN where no data"""
    nx = int(round((x1 - x0) / step)) + 1; ny = int(round((y1 - y0) / step)) + 1
    xs = x0 + np.arange(nx) * step; ys = y0 + np.arange(ny) * step
    X, Y = np.meshgrid(xs, ys)
    return sample_arr(X, Y, res), xs, ys

def sample_arr(X, Y, res=2.0):
    X = np.asarray(X, dtype=np.float64); Y = np.asarray(Y, dtype=np.float64)
    out = np.full(X.shape, np.nan, dtype=np.float32)
    n = int(T / res)
    # pixel centres: tile (i, j) pixel (r, c) is at x = i*T + (c + 0.5)*res,
    # y = (j + 1)*T - (r + 0.5)*res
    ti = np.floor(X / T).astype(int); tj = np.floor(Y / T).astype(int)
    for (i, j) in set(zip(ti.ravel().tolist(), tj.ravel().tolist())):
        sel = (ti == i) & (tj == j)
        a = _tile(res, i, j)
        if a is None: continue
        # neighbours for the tile edge: pad from adjacent tiles when present
        pad = np.full((n + 2, n + 2), np.nan, np.float32); pad[1:-1, 1:-1] = a
        for (di, dj, sl_dst, sl_src) in (
                (-1, 0, (slice(1, -1), 0), (slice(None), -1)), (1, 0, (slice(1, -1), -1), (slice(None), 0)),
                (0, 1, (0, slice(1, -1)), (-1, slice(None))), (0, -1, (-1, slice(1, -1)), (0, slice(None)))):
            b = _tile(res, i + di, j + dj)
            if b is not None: pad[sl_dst] = b[sl_src]
        # fill the pad corners / missing edges from the tile itself
        for sl_dst, sl_src in (((slice(1, -1), 0), (slice(1, -1), 1)), ((slice(1, -1), -1), (slice(1, -1), -2)),
                               ((0, slice(None)), (1, slice(None))), ((-1, slice(None)), (-2, slice(None)))):
            m = np.isnan(pad[sl_dst]); v = pad[sl_dst]; v[m] = pad[sl_src][m]; pad[sl_dst] = v
        cx = (X[sel] - i * T) / res - 0.5 + 1; cy = ((j + 1) * T - Y[sel]) / res - 0.5 + 1
        c0 = np.clip(np.floor(cx).astype(int), 0, n); r0 = np.clip(np.floor(cy).astype(int), 0, n)
        fx = np.clip(cx - c0, 0, 1); fy = np.clip(cy - r0, 0, 1)
        v = (pad[r0, c0] * (1 - fx) * (1 - fy) + pad[r0, c0 + 1] * fx * (1 - fy)
             + pad[r0 + 1, c0] * (1 - fx) * fy + pad[r0 + 1, c0 + 1] * fx * fy)
        out[sel] = v
    return out

def sample(x, y, res=2.0):
    v = float(sample_arr(np.array([x]), np.array([y]), res)[0])
    return None if np.isnan(v) else v
