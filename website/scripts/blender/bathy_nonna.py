"""The sea floor around a Canadian city, in terrain_hq's bathy_8m layout:

    CITY=vancouver python3 bathy_nonna.py

Source: Canadian Hydrographic Service, NONNA-10 (10 m bathymetric grid; Open
Government Licence – Canada: "Contains information licensed under the Open
Government Licence – Canada." — not for navigation), through its WCS (subset
axes X/Y in EPSG:3857). Values are elevations to chart datum (negative =
below); the render wants depth, positive, 0 where NONNA has nothing (terrain_hq
then falls back to its shelf). Grid: 8 m in the engine's world frame, row 0 at
y1 (north), over the city box (city.json `bbox`) plus PAD m.
Writes <city>/landmarks/bathy_8m.npy + .json (the paths terrain_hq reads once
citysnap.sh points the scripts at the city's folder)."""
import io, json, os, urllib.parse, urllib.request
import numpy as np
import rasterio
from pyproj import Transformer
from scipy.ndimage import map_coordinates
import cityconf as C

WCS = 'https://nonna-geoserver.data.chs-shc.ca/geoserver/wcs'
COV = 'nonna__NONNA 10 Coverage'
RES, PAD = 8.0, 2500.0

s, w, n, e = C.BBOX
x0, y0 = C.proj(w, s); x1, y1 = C.proj(e, n)
x0, y0, x1, y1 = np.floor(x0 - PAD), np.floor(y0 - PAD), np.ceil(x1 + PAD), np.ceil(y1 + PAD)
nx, ny = int((x1 - x0) / RES), int((y1 - y0) / RES)
to3857 = Transformer.from_crs('EPSG:4326', 'EPSG:3857', always_xy=True)
lo, la = C.unproj(np.array([x0, x1]), np.array([y0, y1]))
(mx0, mx1), (my0, my1) = to3857.transform(lo, la)
q = [('service', 'WCS'), ('version', '2.0.1'), ('request', 'GetCoverage'), ('coverageId', COV),
     ('subset', f'X({mx0:.0f},{mx1:.0f})'), ('subset', f'Y({my0:.0f},{my1:.0f})'), ('format', 'image/geotiff')]
url = WCS + '?' + urllib.parse.urlencode(q)
print('GET', url, flush=True)
b = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'qipu-render/0.1'}), timeout=300).read()
with rasterio.open(io.BytesIO(b)) as ds:
    A = ds.read(1).astype(np.float32); nd = ds.nodata; T = ds.transform; crs = ds.crs
    print('coverage', ds.crs, ds.res, A.shape, 'nodata', nd, flush=True)
if nd is not None: A[A == nd] = np.nan
A[(A < -1000) | (A > 1000)] = np.nan
# the 8 m nodes (pixel centres) → lon/lat → the coverage's CRS → its pixels, bilinear, NaN-aware
xs = x0 + (np.arange(nx) + 0.5) * RES; ys = y1 - (np.arange(ny) + 0.5) * RES
X, Y = np.meshgrid(xs, ys)
lon, lat = C.unproj(X, Y)
U, V = Transformer.from_crs('EPSG:4326', crs, always_xy=True).transform(lon, lat)
col = (U - T.c) / T.a - 0.5; row = (V - T.f) / T.e - 0.5
v = map_coordinates(np.nan_to_num(A, nan=0.0), [row, col], order=1, mode='constant', cval=0.0)
m = map_coordinates(np.isnan(A).astype(np.float32), [row, col], order=1, mode='constant', cval=1.0)
depth = np.where(m > 1e-3, 0.0, np.maximum(-v, 0.0)).astype(np.float32)
os.makedirs(C.work('landmarks'), exist_ok=True)
np.save(C.work('landmarks', 'bathy_8m.npy'), depth)
json.dump(dict(x0=float(x0), y1=float(y1), res=RES, nx=nx, ny=ny,
               source='CHS NONNA-10 (Open Government Licence - Canada; not for navigation), WCS subset, bilinear to the 8 m world grid; '
                      'depth = -elevation to chart datum, 0 where NONNA has no data'),
          open(C.work('landmarks', 'bathy_8m.json'), 'w'))
wet = depth > 0.5
print('grid', nx, ny, 'wet', f'{wet.mean():.2f}', 'depth p50/p95/max', np.percentile(depth[wet], [50, 95]).round(1) if wet.any() else None, float(depth.max()))
for name, (lo_, la_) in dict(false_creek=(-123.125, 49.271), coal_harbour=(-123.125, 49.292), english_bay=(-123.16, 49.285),
                             second_narrows=(-123.025, 49.295), north_arm=(-123.17, 49.205)).items():
    px, py = C.proj(lo_, la_); c = int((px - x0) / RES); r = int((y1 - py) / RES)
    print(name, round(float(depth[r, c]), 1) if 0 <= r < ny and 0 <= c < nx else 'outside')
