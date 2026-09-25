"""The ground classes ground_hq paints (SF's come from NAIP, ground_prep.py),
for a city with a published land-cover raster instead:

    CITY=vancouver python3 ground_landcover.py <landcover.tif>

Vancouver: Metro Vancouver Land Cover Classification 2020 (5 m; PlanetScope
August 2020 + LiDAR 2016-2020; Open Government Licence – Metro Vancouver),
16 classes → ground_hq's classes (MAP below; "none" = unknown, the terrain's
own material). Barren ground within SAND_M of water is beach sand, gravel
elsewhere. Written at 1 m on the engine's frame (row 0 = south), over the city
box (city.json `bbox`) plus PAD, nearest class (the 5 m cells stay 5 m cells:
ground_hq's majority + box softens them): <city>/ground/ground_cls.npy +
ground_meta.json, the paths ground_hq reads once citysnap.sh points the
scripts at the city's folder. No tone map (no photo yet): GROUND_TONE finds none."""
import json, os, sys, time
import numpy as np
import rasterio
from pyproj import Transformer
from scipy.ndimage import distance_transform_edt
import cityconf as C

SRC = sys.argv[1]
RES, PAD, SAND_M = 1.0, 1000.0, 60.0
CLS = ['none', 'sand', 'lawn', 'drygrass', 'scrub', 'tree', 'soil', 'asphalt', 'concrete', 'gravel', 'marsh', 'water', 'wetsand', 'turf']
CI = {n: k for k, n in enumerate(CLS)}
LCC = {1: 'Buildings', 2: 'Paved', 3: 'Other built', 4: 'Barren', 5: 'Soil', 6: 'Conifer', 7: 'Deciduous', 8: 'Shrub',
       9: 'Modified Grass/Herb', 10: 'Natural Grass/Herb', 11: 'Non-photosynthetic veg', 12: 'Water', 13: 'Shadow',
       14: 'Snow/Ice', 15: 'Conifer/Paved', 16: 'Deciduous/Paved'}
MAP = {1: 'none', 2: 'asphalt', 3: 'concrete', 4: 'gravel', 5: 'soil', 6: 'tree', 7: 'tree', 8: 'scrub', 9: 'lawn',
       10: 'drygrass', 11: 'drygrass', 12: 'water', 13: 'none', 14: 'none',
       15: 'asphalt', 16: 'asphalt'}     # canopy over paving: the ground under the street trees is the street
LUT = np.zeros(256, np.uint8)
for k, v in MAP.items(): LUT[k] = CI[v]
T0 = time.time()

s, w, n, e = C.BBOX
x0, y0 = C.proj(w, s); x1, y1 = C.proj(e, n)
x0, y0, x1, y1 = np.floor(x0 - PAD), np.floor(y0 - PAD), np.ceil(x1 + PAD), np.ceil(y1 + PAD)
nx, ny = int((x1 - x0) / RES), int((y1 - y0) / RES)
ds = rasterio.open(SRC)
tr = Transformer.from_crs('EPSG:4326', ds.crs, always_xy=True)
# the source window under the box (its corners, reprojected), read once
lo, la = C.unproj(np.array([x0, x1, x0, x1]), np.array([y0, y0, y1, y1]))
U, V = tr.transform(lo, la)
win = rasterio.windows.from_bounds(min(U) - 50, min(V) - 50, max(U) + 50, max(V) + 50, ds.transform).round_offsets().round_lengths()
A = ds.read(1, window=win, boundless=True, fill_value=0); WT = ds.window_transform(win)
# barren by the water: sand (5 m cells)
near = distance_transform_edt(A != 12) * abs(WT.a) <= SAND_M
A2 = LUT[A]; A2[(A == 4) & near] = CI['sand']
print('source window', A.shape, f'{time.time() - T0:.0f}s', flush=True)
G = np.zeros((ny, nx), np.uint8)
xs = x0 + (np.arange(nx) + 0.5) * RES
for j0 in range(0, ny, 400):
    ys = y0 + (np.arange(j0, min(ny, j0 + 400)) + 0.5) * RES
    X, Y = np.meshgrid(xs, ys)
    lon, lat = C.unproj(X, Y); u, v = tr.transform(lon, lat)
    c = np.floor((u - WT.c) / WT.a).astype(np.int64); r = np.floor((v - WT.f) / WT.e).astype(np.int64)
    ok = (c >= 0) & (c < A.shape[1]) & (r >= 0) & (r < A.shape[0])
    blk = np.zeros(X.shape, np.uint8); blk[ok] = A2[r[ok], c[ok]]
    G[j0:j0 + blk.shape[0]] = blk
out = C.work('ground'); os.makedirs(out, exist_ok=True)
np.save(os.path.join(out, 'ground_cls.npy'), G)
share = {CLS[k]: round(100 * float((G == k).mean()), 2) for k in range(1, len(CLS)) if (G == k).any()}
json.dump(dict(x0=float(x0), y0=float(y0), res=RES, shape=[ny, nx], row0='south (y0)', classes=CLS, share_pct=share,
               source='Metro Vancouver Land Cover Classification 2020, 5 m (Open Government Licence - Metro Vancouver); ground_landcover.py',
               mapping={f'{k} {LCC[k]}': MAP[k] for k in MAP}, sand_rule=f'Barren within {SAND_M:g} m of Water = sand',
               built=time.strftime('%Y-%m-%d %H:%M')), open(os.path.join(out, 'ground_meta.json'), 'w'), indent=1)
print('ground', G.shape, share, f'{time.time() - T0:.0f}s', flush=True)
