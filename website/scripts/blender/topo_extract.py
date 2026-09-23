"""The city on a USGS historical topographic sheet, as world rasters.

The 1:62,500 San Francisco sheets (1895, 1915 ...) are public domain and
published georeferenced (USGS Historical Topographic Map Collection, GeoTIFF,
polyconic projection on NAD27 about 37.75 N 122.375 W, 5.29 m a pixel). This
reads one sheet into the map's world frame (x = metres east, y = metres north
of lon -122.438, lat 37.76) and writes two masks:
  water  — the sheet's blue water tint and lining (the shoreline of its survey)
  built  — the density of the sheet's black building ink (the built-up city)
The NAD27 sheet and the WGS84 world differ by a datum shift of ~100 m; it is
MEASURED here, not assumed: the offset that best lays the sheet's building
ink over the footprints the record dates before the survey is searched on a
grid and applied.

usage: python3 topo_extract.py <sheet.tif> <survey_year> <out_prefix>
out: <out_prefix>.png (R water, G built, 4 m a pixel) + <out_prefix>.json
"""
import json, math, sys, pickle, os
import numpy as np
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None

src, survey, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
im = Image.open(src); t = im.tag_v2
tie = t[33922]; sc = t[33550]; prm = t[34736]
X0, Y0, S = tie[3], tie[4], sc[0]
lat0, lon0 = prm[0], prm[1]
A = np.asarray(im.convert('RGB')).astype(np.float32)
H_, W_ = A.shape[:2]
# classes on the sheet itself: blueness of the tint and lining, black ink
blur = np.asarray(Image.fromarray(A.astype(np.uint8)).filter(ImageFilter.BoxBlur(3))).astype(np.float32)
blue = blur[..., 2] - 0.5 * (blur[..., 0] + blur[..., 1])
lum = A.mean(axis=2)
ink = (lum < 95).astype(np.float32)
water_px = (blue > -22).astype(np.float32)

# world raster
RES = 4.0
WX0, WY0, WX1, WY1 = -7000.0, -1000.0, 7400.0, 8400.0      # the sheet's part of the city (it stops at 37.75 N)
NX, NY = int((WX1 - WX0) / RES), int((WY1 - WY0) / RES)
gx = WX0 + (np.arange(NX) + 0.5) * RES; gy = WY1 - (np.arange(NY) + 0.5) * RES
GX, GY = np.meshgrid(gx, gy)


def sample(arr, dx, dy, GX=GX, GY=GY):
    """world raster of a sheet array, the sheet shifted by (dx, dy) world m"""
    lon = (GX - dx) / 88007.0 - 122.438; lat = (GY - dy) / 111320.0 + 37.76
    # polyconic near its origin: metres along the meridian and the parallel
    # (Clarke 1866); under 5 m from the exact inverse over this sheet
    X = (lon - lon0) * 111415.0 * math.cos(math.radians(lat0)) * (1 + 0.0)
    Y = (lat - lat0) * 110996.0
    px = ((X - X0) / S).astype(np.int32); py = ((Y0 - Y) / S).astype(np.int32)
    ok = (px >= 0) & (px < W_) & (py >= 0) & (py < H_)
    o = np.zeros(GX.shape, np.float32)
    o[ok] = arr[py[ok], px[ok]]
    return o, ok


# the record's footprints dated before the survey, rasterised (calibration),
# over the Western Addition and the Mission, where the survivors are dense
recs = pickle.load(open('/Users/daniel/code/qipu-render-work/history/recs_min.pkl', 'rb'))
CX0, CY0, CX1, CY1, CR = -1500.0, -500.0, 2000.0, 3000.0, 3.0
cgx = CX0 + (np.arange(int((CX1 - CX0) / CR)) + 0.5) * CR; cgy = CY1 - (np.arange(int((CY1 - CY0) / CR)) + 0.5) * CR
CGX, CGY = np.meshgrid(cgx, cgy)
REF = np.zeros(CGX.shape, np.float32)
for gid, cx, cy, yr, h, ty in recs:
    if yr and yr <= survey and CX0 < cx < CX1 and CY0 < cy < CY1:
        i = int((cx - CX0) / CR); j = int((CY1 - cy) / CR)
        REF[max(0, j - 1):j + 2, max(0, i - 1):i + 2] = 1.0
ink_b = np.asarray(Image.fromarray((ink * 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(1))).astype(np.float32) / 255
best = (-1, 0, 0)
for step, rng_ in ((10, range(-200, 201, 10)), (2, None)):
    if rng_ is None:
        rx = range(best[1] - 10, best[1] + 11, 2); ry = range(best[2] - 10, best[2] + 11, 2)
    else:
        rx = ry = rng_
    for dx in rx:
        for dy in ry:
            s_, ok_ = sample(ink_b, dx, dy, CGX, CGY)
            v = float((s_ * REF).sum()) / (float(REF[ok_].sum()) + 1)
            if v > best[0]: best = (v, dx, dy)
# the same score with no shift, to say how much the measured shift buys
s_, ok_ = sample(ink_b, 0, 0, CGX, CGY); print('ink over dated footprints unshifted', round(float((s_ * REF).sum()) / (float(REF[ok_].sum()) + 1), 3))
_, DX, DY = best
print('datum offset (world m):', DX, DY, 'ink over dated footprints', round(best[0], 3))
wat, ok = sample(water_px, DX, DY)
bil, _ = sample(ink, DX, DY)
# smooth: water as a clean shoreline, ink as a density over ~40 m
wat_img = Image.fromarray((wat * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(7)).filter(ImageFilter.GaussianBlur(2))
built = Image.fromarray((np.clip(bil * 4, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))
okimg = Image.fromarray((ok * 255).astype(np.uint8))
rgb = Image.merge('RGB', (wat_img, built, okimg))
rgb.save(out + '.png')
json.dump({'src': os.path.basename(src), 'survey': survey, 'x0': WX0, 'y1': WY1, 'res': RES, 'w': NX, 'h': NY,
           'datum_offset': [DX, DY], 'fit': best[0],
           'note': 'R water on the sheet, G building-ink density, B = inside the sheet'}, open(out + '.json', 'w'), indent=1)
print(out, NX, NY)
