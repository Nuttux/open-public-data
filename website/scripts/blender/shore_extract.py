"""sm_water.py <sheet.tif> <dx> <dy> <out_prefix> — water on a 1:62,500 San
Mateo sheet over the SE of the city, world frame 4 m: blue ink (the shore
line, the waterlining, marsh creeks) closed over ~60 m into a water body;
writes <out>.png (R water, B on-sheet) + a check image with today's streets"""
import sys, os, math, numpy as np
sys.path.insert(0, '/Users/daniel/code/opd-history/website/scripts/blender')
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
Image.MAX_IMAGE_PIXELS = None
src, DX, DY, out = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
CL = int(sys.argv[5]) if len(sys.argv) > 5 else 15        # closing radius, px of 4 m
x0, y0, x1, y1, res = [float(v) for v in os.environ.get("REGION", "1200,-6200,7400,-1000").split(",")] + [4.0]
im = Image.open(src); t = im.tag_v2
tie = t[33922]; sc = t[33550]; prm = t[34736]
X0, Y0, S = tie[3], tie[4], sc[0]; lat0, lon0 = prm[0], prm[1]
A = np.asarray(im.convert('RGB')).astype(np.float32); H_, W_ = A.shape[:2]
BT = float(os.environ.get("BT", 15)); blue = (A[..., 2] - A[..., 0] > BT) & (A.mean(axis=2) < 200)
if os.environ.get("OLIVE"): blue = (A.mean(axis=2) > 60) & (A.mean(axis=2) < 165) & (A[..., 1] - A[..., 0] > -8)
landink = (A.mean(axis=2) < float(os.environ.get("LD", 100))) | ((A[..., 0] - A[..., 2] > 70) & (A[..., 0] > 140))
NX, NY = int((x1 - x0) / res), int((y1 - y0) / res)
GX, GY = np.meshgrid(x0 + (np.arange(NX) + 0.5) * res, y1 - (np.arange(NY) + 0.5) * res)
def samp(arr, fn=np.max):
    # max over the sheet pixels inside a world cell (4 m ~ 0.75 sheet px: one sample is enough)
    lon = (GX - DX) / 88007.0 - 122.438; lat = (GY - DY) / 111320.0 + 37.76
    X = (lon - lon0) * 111415.0 * math.cos(math.radians(lat0)); Y = (lat - lat0) * 110996.0
    px = ((X - X0) / S).astype(np.int32); py = ((Y0 - Y) / S).astype(np.int32)
    ok = (px >= 0) & (px < W_) & (py >= 0) & (py < H_)
    o = np.zeros(GX.shape, arr.dtype); o[ok] = arr[py[ok], px[ok]]; return o, ok
b, ok = samp(blue); li, _ = samp(landink)
bd = ndimage.uniform_filter(b.astype(np.float32), 15)        # blue ink over 60 m
ld = ndimage.uniform_filter(li.astype(np.float32), 9)        # land ink (black, brown) over 36 m
w = (bd > float(sys.argv[6]) if len(sys.argv) > 6 else bd > 0.06) & (ld < 0.02)
st = ndimage.generate_binary_structure(2, 1)
w = ndimage.binary_closing(w, structure=st, iterations=CL)
w = ndimage.binary_opening(w, structure=st, iterations=3)
lab, n = ndimage.label(w); sz = ndimage.sum(w, lab, range(1, n + 1))
keep = np.zeros(n + 1, bool); keep[1:] = sz >= 400; w = keep[lab]
# today's sea on this grid (the city export's water mask, as topo24_change.py)
import json as _j
SEA = '/Users/daniel/code/qipu-render-work/city'
g = _j.load(open(f'{SEA}/sea.json')); sea = np.asarray(Image.open(f'{SEA}/sea.png'))[..., 0] > 127; SS = sea.shape[0]
si = ((GX - g['ox']) / g['w'] * SS).astype(int); sj = ((1 - (GY - g['oy']) / g['h']) * SS).astype(int)
sok = (si >= 0) & (si < SS) & (sj >= 0) & (sj < SS)
today_sea = np.zeros(GX.shape, bool); today_sea[sok] = sea[sj[sok], si[sok]]
band = w
land_ev = ndimage.binary_dilation(li, structure=st, iterations=int(sys.argv[7]) if len(sys.argv) > 7 else 6)
near = ndimage.distance_transform_edt(~band) < 100          # within 400 m of the shore band
passable = ((~land_ev & ~band) | today_sea) & ok
lab, n = ndimage.label(passable)
seeds = set(np.unique(lab[today_sea & ok])) - {0}
fl = np.isin(lab, list(seeds))
# leaks the flood makes through blank paper inland of the shore, cut by hand
# (EXCL: world polygons, one sheet's list in sm_excl.json)
import os
EX = _j.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shore_excl.json'))).get(out.split('/')[-1], [])
if EX:
    exm = Image.new('L', (NX, NY), 0); de = ImageDraw.Draw(exm)
    for pg in EX: de.polygon([((x - x0) / res, (y1 - y) / res) for x, y in pg], fill=255)
    fl &= ~(np.asarray(exm) > 0)
w = (fl | band) & ~today_sea
w = ndimage.binary_opening(w, structure=st, iterations=2)
rgb = np.zeros((NY, NX, 3), np.uint8); rgb[..., 0] = w * 255; rgb[..., 2] = ok * 255
Image.fromarray(rgb).save(out + '.png')
# DEBUG
dbg = np.zeros((NY, NX, 3), np.uint8); dbg[..., 0] = np.clip(bd * 1000, 0, 255); dbg[..., 1] = land_ev * 255; dbg[..., 2] = today_sea * 255
Image.fromarray(dbg).resize((NX // 2, NY // 2)).save(out + '_dbg.png')
import json
json.dump({'src': src.split('/')[-1], 'x0': x0, 'y1': y1, 'res': res, 'w': NX, 'h': NY, 'datum_offset': [DX, DY],
           'note': 'R water on the sheet (blue ink closed over ~60 m), B inside the sheet'}, open(out + '.json', 'w'), indent=1)
# check: the sheet, water tinted, today's streets
lon = (GX - DX) / 88007.0 - 122.438; lat = (GY - DY) / 111320.0 + 37.76
X = (lon - lon0) * 111415.0 * math.cos(math.radians(lat0)); Y = (lat - lat0) * 110996.0
px = np.clip(((X - X0) / S).astype(np.int32), 0, W_ - 1); py = np.clip(((Y0 - Y) / S).astype(np.int32), 0, H_ - 1)
c = A[py, px].astype(np.uint8); c[w] = (0.5 * c[w] + 0.5 * np.array([60, 120, 255])).astype(np.uint8)
img = Image.fromarray(c); d = ImageDraw.Draw(img)
import city_data
for nm, pls in city_data.named_lines().items():
    for pl in pls: d.line([((x - x0) / res, (y1 - y) / res) for x, y in pl], fill=(220, 0, 0), width=1)
img.save(out + '_check.jpg', quality=85); print(out, NX, NY, 'water px', int(w.sum()))
