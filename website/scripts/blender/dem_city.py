"""Bare-earth elevation for a city other than SF, in lm_dem.py's tiles
(fetch_dem.py is SF's, from USGS 3DEP): CITY=vancouver python3 dem_city.py [res=2]

city.json `dem`: {"sources": [cloud-optimised GeoTIFF URLs, best first — a
later one only fills the nodata of the earlier], "credit": "…"}. Each tile of
T metres of the engine's world frame (row 0 = NORTH edge, lm_dem's layout) is
sampled at its pixel centres straight from the COGs (HTTP range reads: only
the window a tile needs is read), bilinear, in the raster's own CRS; the city
box (city.json `bbox`) plus a margin decides the tiles. Writes
<city>/landmarks/dem/<res>m/t_<i>_<j>.npy, the path lm_dem reads once
citysnap.sh has pointed the scripts at the city's folder. −9999 = no data."""
import os, sys, time, threading
from concurrent.futures import ThreadPoolExecutor
# remote COG reads: no bucket listing, merged ranges, a block cache (300 s → 43 s a tile, 25/09)
for _k, _v in dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_MULTIRANGE='YES',
                   GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES', VSI_CACHE='TRUE', GDAL_CACHEMAX='512').items():
    os.environ.setdefault(_k, _v)
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from pyproj import Transformer
from scipy.ndimage import map_coordinates
import cityconf as C

RES = float(sys.argv[1]) if len(sys.argv) > 1 else 2.0
T = 2000.0
PAD = 1500.0                                   # past the box: the frames' margins see beyond the city limits
SRC = C.CFG['dem']['sources']
REFILL = int(os.environ.get('DEM_REFILL', '0'))
OUT = C.work('landmarks', 'dem', f'{RES:g}m'); os.makedirs(OUT, exist_ok=True)

def tile_range():
    ext = C.CFG['dem'].get('extent')            # (fix4) [x0, y0, x1, y1] world m: the whole render grid with its margins
    if ext:
        return (range(int(np.floor(ext[0] / T)), int(np.ceil(ext[2] / T))), range(int(np.floor(ext[1] / T)), int(np.ceil(ext[3] / T))))
    s, w, n, e = C.BBOX
    x0, y0 = C.proj(w, s); x1, y1 = C.proj(e, n)
    return (range(int(np.floor((x0 - PAD) / T)), int(np.ceil((x1 + PAD) / T))),
            range(int(np.floor((y0 - PAD) / T)), int(np.ceil((y1 + PAD) / T))))

def sample(ds, tr, i, j, n):
    # the pixel centres in world metres → lon/lat (the frame is linear in both) → the raster's CRS
    xs = i * T + (np.arange(n) + 0.5) * RES; ys = (j + 1) * T - (np.arange(n) + 0.5) * RES
    X, Y = np.meshgrid(xs, ys)
    lon, lat = C.unproj(X, Y)
    U, V = tr.transform(lon, lat)
    pad = 4 * max(abs(ds.res[0]), abs(ds.res[1]))
    win = from_bounds(U.min() - pad, V.min() - pad, U.max() + pad, V.max() + pad, ds.transform)
    win = win.round_offsets().round_lengths()
    a = ds.read(1, window=win, boundless=True, fill_value=np.nan, masked=False).astype(np.float32)
    nd = ds.nodata
    if nd is not None: a[a == nd] = np.nan
    a[a < -500] = np.nan
    wt = ds.window_transform(win)
    col = (U - wt.c) / wt.a - 0.5; row = (V - wt.f) / wt.e - 0.5
    # bilinear, NaN-aware: a node touching nodata stays NaN (a later source fills it)
    v = map_coordinates(np.nan_to_num(a, nan=0.0), [row, col], order=1, mode='nearest')
    m = map_coordinates(np.isnan(a).astype(np.float32), [row, col], order=1, mode='nearest')
    v[m > 1e-3] = np.nan
    return v.astype(np.float32)

_TL = threading.local()
def _open():
    # a rasterio dataset is not shared between threads: one set a worker
    if not hasattr(_TL, 'dss'):
        _TL.dss = [rasterio.open(u) for u in SRC]
        _TL.trs = [Transformer.from_crs('EPSG:4326', ds.crs, always_xy=True) for ds in _TL.dss]
    return _TL.dss, _TL.trs

def one(ij):
    i, j = ij; n = int(T / RES)
    p = f'{OUT}/t_{i}_{j}.npy'
    first = 0
    if os.path.exists(p):
        # (fix4) DEM_REFILL=k: a tile on disk with nodata is filled from sources k.. only (a later, coarser source:
        # MRDEM-30 under the North Shore mountains the lidar never flew); its own values stay
        if not REFILL: return
        old = np.load(p)
        if not (old < -9000).any(): return
        first = REFILL
    dss, trs = _open()
    for attempt in range(4):
        try:
            out = np.full((n, n), np.nan, np.float32) if not first else np.where(old < -9000, np.nan, old).astype(np.float32)
            for ds, tr in list(zip(dss, trs))[first:]:
                m = np.isnan(out)
                if not m.any(): break
                out[m] = sample(ds, tr, i, j, n)[m]
            cov = float(np.mean(~np.isnan(out)))
            np.save(p, np.where(np.isnan(out), -9999.0, out).astype(np.float32))
            print('ok', i, j, f'cover {cov:.2f}', float(np.nanmin(out)) if cov else None, float(np.nanmax(out)) if cov else None, flush=True)
            break
        except Exception as ex:
            print('retry', i, j, str(ex)[:160], flush=True); time.sleep(5 * (attempt + 1))

def main():
    ii, jj = tile_range(); todo = [(i, j) for j in jj for i in ii]
    print('tiles', len(todo), 'sources', len(SRC), flush=True)
    with ThreadPoolExecutor(int(os.environ.get('DEM_WORKERS', 4))) as ex: list(ex.map(one, todo))
    print('done', flush=True)

if __name__ == '__main__':
    main()
