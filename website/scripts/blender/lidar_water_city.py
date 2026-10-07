"""lidar_water_city.py (FIX4 07/10, another city; CPU, ~1 GB): where the 2025 LiDAR saw water, on the render's sea grid.

LidarBC 2025 (1 m DSM tiles, lidar/bc2025/dsm, Open Government Licence - British Columbia) has no return over open water:
a tile cell that is nodata is water (or a dark / glass roof: the reader drops those). Binned onto city/sea.json's 2 m grid
(row 0 = north) as the share of no-return 1 m cells per 2 m cell (0-255) and the share covered by a tile at all.
water_mask.py river_lcc reads it in the Fraser zone: the North Arm's log-boom sloughs (McDonald Slough), which the land
cover calls 'other built' between thin channels, are water to the LiDAR (render sw: the slough ~40 % of its width).

  CITY=vancouver python3 lidar_water_city.py      # -> lidar/nowater_sea2m.npz"""
import os, sys, json, glob
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cityconf as C
if C.CITY == 'sf': sys.exit('SF: not used')
import rasterio
from pyproj import Transformer

sj = json.load(open(C.work('city', 'sea.json'))); RES = 2.0
ox, oy = float(sj['ox']), float(sj['oy']); W, H = int(round(sj['w'] / RES)), int(round(sj['h'] / RES))
P = C.CFG['proj']
SW = np.zeros((H, W), np.uint8); SC = np.zeros((H, W), np.uint8)      # no-return / covered 1 m cells per 2 m cell (max 4 each... up to ~6 with the skew)
T = None
for f in sorted(glob.glob(C.work('lidar', 'bc2025', 'dsm', '*.tif'))):
    with rasterio.open(f) as r:
        if T is None: T = Transformer.from_crs(r.crs, 'EPSG:4326', always_xy=True)
        A = r.read(1); tr = r.transform
        jj, ii = np.meshgrid(np.arange(r.width), np.arange(r.height))
        E = tr.c + (jj + 0.5) * tr.a; N = tr.f + (ii + 0.5) * tr.e
    lon, lat = T.transform(E.ravel(), N.ravel()); del E, N, jj, ii
    X = (lon - P['lon0']) * P['mpd'] * P['cosl']; Y = (lat - P['lat0']) * P['mpd']
    c = np.floor((X - ox) / RES).astype(np.int64); rr = np.floor((oy + H * RES - Y) / RES).astype(np.int64)
    ok = (c >= 0) & (c < W) & (rr >= 0) & (rr < H)
    v = A.ravel()[ok]; nr = (v < -1000) | ~np.isfinite(v); k = rr[ok] * W + c[ok]
    cnt = np.bincount(k, minlength=H * W).reshape(H, W); wat = np.bincount(k, weights=nr, minlength=H * W).reshape(H, W)
    SC = np.minimum(255, SC.astype(np.int32) + cnt).astype(np.uint8); SW = np.minimum(255, SW.astype(np.int32) + wat).astype(np.uint8)
    print(os.path.basename(f)[:24], 'cells', int(ok.sum()), 'no-return', int(nr.sum()), flush=True)
    del A, lon, lat, X, Y, c, rr, ok, v, nr, k, cnt, wat
frac = np.where(SC > 0, np.round(255.0 * SW / np.maximum(SC, 1)), 0).astype(np.uint8); cov = SC > 0
out = C.work('lidar', 'nowater_sea2m.npz')
np.savez_compressed(out, frac=frac, cov=np.packbits(cov, axis=1), w=W, h=H, ox=ox, oy=oy, res=RES,
                    source=np.array('LidarBC 2025 1 m DSM (OGL-BC): share of no-return cells per 2 m cell of city/sea.json grid, row 0 = north; cov = a tile covers it'))
print(out, 'covered', round(float(cov.mean()), 3), 'no-return share of covered', round(float((frac[cov] > 127).mean()), 3))
