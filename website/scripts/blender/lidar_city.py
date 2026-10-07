"""lidar_city.py (FIX4 07/10, another city; CPU): the 2025 LiDAR (LidarBC 1 m DSM / DEM tiles in lidar/bc2025, Open
Government Licence - British Columbia) sampled on a world-metre grid, for the prep scripts (port_city_prep.py,
city_places.py's measured heights). Nearest 1 m cell; nan where no tile or no return (open water, some dark roofs).

  import lidar_city as LC; X, Y, dsm, dem = LC.grid((x0, y0, x1, y1), res=1.0)     # rows from north (y1) down"""
import os, glob
import numpy as np
import cityconf as C

_IDX = {}
def _index(kind):
    if kind not in _IDX:
        import rasterio
        out = []
        for f in sorted(glob.glob(C.work('lidar', 'bc2025', kind, '*.tif'))):
            with rasterio.open(f) as r: out.append((f, r.bounds, r.crs))
        _IDX[kind] = out
    return _IDX[kind]

def to_utm(X, Y):
    from pyproj import Transformer
    lon, lat = C.unproj(X, Y) if hasattr(C, 'unproj') else _unproj(X, Y)
    crs = _index('dsm')[0][2]
    return Transformer.from_crs('EPSG:4326', crs, always_xy=True).transform(lon, lat)

def _unproj(X, Y):
    P = C.CFG['proj']
    return np.asarray(X) / (P['mpd'] * P['cosl']) + P['lon0'], np.asarray(Y) / P['mpd'] + P['lat0']

def sample(kind, X, Y):
    """nearest 1 m value of lidar/bc2025/<kind> (dsm | dem) at world points; nan outside tiles / nodata"""
    import rasterio
    from rasterio.windows import from_bounds
    E, N = to_utm(np.asarray(X, float), np.asarray(Y, float)); out = np.full(E.shape, np.nan, np.float32)
    e0, e1, n0, n1 = E.min(), E.max(), N.min(), N.max()
    for f, b, _ in _index(kind):
        if b.left > e1 or b.right < e0 or b.bottom > n1 or b.top < n0: continue
        k = (E >= b.left) & (E < b.right) & (N > b.bottom) & (N <= b.top)
        if not k.any(): continue
        with rasterio.open(f) as r:
            win = from_bounds(max(b.left, E[k].min() - 2), max(b.bottom, N[k].min() - 2), min(b.right, E[k].max() + 2), min(b.top, N[k].max() + 2), r.transform)
            win = win.round_offsets().round_lengths(); A = r.read(1, window=win); tr = r.window_transform(win); nd = r.nodata
        c = ((E[k] - tr.c) / tr.a).astype(int); rr = ((N[k] - tr.f) / tr.e).astype(int)
        ok = (c >= 0) & (c < A.shape[1]) & (rr >= 0) & (rr < A.shape[0])
        v = np.full(k.sum(), np.nan, np.float32); v[ok] = A[rr[ok], c[ok]]
        if nd is not None: v[v == nd] = np.nan
        v[v < -1000] = np.nan; out[k] = v
    return out

def grid(box, res=1.0):
    x0, y0, x1, y1 = box
    xs = np.arange(x0 + res / 2, x1, res); ys = np.arange(y1 - res / 2, y0, -res)
    X, Y = np.meshgrid(xs, ys)
    return X, Y, sample('dsm', X, Y), sample('dem', X, Y)
