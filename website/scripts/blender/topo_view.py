"""A USGS sheet resampled into the world frame with a labelled 100 m grid and
today's shoreline in red, for reading the old shoreline off it by eye.
usage: python3 topo_view.py <sheet.tif> <mask.json (datum offset)> x0,y0,x1,y1 res out.png"""
import json, math, sys
import numpy as np
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS = None
sys.path.insert(0, '/Users/daniel/code/opd-history/website/scripts/blender')
import era
src, mj, box, res, out = sys.argv[1], sys.argv[2], [float(v) for v in sys.argv[3].split(',')], float(sys.argv[4]), sys.argv[5]
im = Image.open(src); t = im.tag_v2; tie = t[33922]; S = t[33550][0]; prm = t[34736]
X0, Y0, lat0, lon0 = tie[3], tie[4], prm[0], prm[1]
A = np.asarray(im.convert('RGB'))
DX, DY = json.load(open(mj))['datum_offset']
x0, y0, x1, y1 = box
nx, ny = int((x1 - x0) / res), int((y1 - y0) / res)
GX, GY = np.meshgrid(x0 + (np.arange(nx) + 0.5) * res, y1 - (np.arange(ny) + 0.5) * res)
lon = (GX - DX) / 88007.0 - 122.438; lat = (GY - DY) / 111320.0 + 37.76
X = (lon - lon0) * 111415.0 * math.cos(math.radians(lat0)); Y = (lat - lat0) * 110996.0
px = np.clip(((X - X0) / S).astype(int), 0, A.shape[1] - 1); py = np.clip(((Y0 - Y) / S).astype(int), 0, A.shape[0] - 1)
V = Image.fromarray(A[py, px]); d = ImageDraw.Draw(V)
G = int(sys.argv[6]) if len(sys.argv) > 6 else 100
for gx in range(int(x0 // G + 1) * G, int(x1), G):
    d.line([((gx - x0) / res, 0), ((gx - x0) / res, ny)], fill=(0, 160, 255) if gx % (G * 2) else (255, 0, 255), width=1)
    if gx % (G * 2) == 0: d.text(((gx - x0) / res + 2, 2), str(gx), fill=(255, 0, 255))
for gy in range(int(y0 // G + 1) * G, int(y1), G):
    d.line([(0, (y1 - gy) / res), (nx, (y1 - gy) / res)], fill=(0, 160, 255) if gy % (G * 2) else (255, 0, 255), width=1)
    if gy % (G * 2) == 0: d.text((2, (y1 - gy) / res + 2), str(gy), fill=(255, 0, 255))
import city_data
for nm, pls in city_data.named_lines().items():
    for pl in pls:
        pts = [((x - x0) / res, (y1 - y) / res) for x, y in pl]
        if any(0 <= a < nx and 0 <= b < ny for a, b in pts): d.line(pts, fill=(0, 200, 0), width=1)
for r in era.coast_rings():
    pts = [((x - x0) / res, (y1 - y) / res) for x, y in r]; d.line(pts + [pts[0]], fill=(255, 0, 0), width=2)
V.save(out); print(out, V.size)
