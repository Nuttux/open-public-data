"""How far an air-photo crop (aerial_crop.py) sits from today's footprints:
CITY=vancouver python3 aerial_align.py <crop.tif> <year> [zone …] [--draw lon,lat,half,out.png …]

For each zone (name:lon:lat:half_m, default city.json `eras.zones`) the
outlines of the records standing by <year> (record year ≤ year, footprint ≥
150 m²) are moved over the crop's gradient (Sobel) by −R..R m, and the shift
where the outlines sit on the most edge wins: (dx, dy) in metres, east/north,
= how far the photo sits from the footprints (a positive dx = the photo is
east of them). Score = mean gradient on the outlines at the best shift ÷ at
no shift, and the peak's contrast over the median shift. --draw writes a
crop with the outlines in red (no shift) and green (best shift of the zone
it falls in, or none). Prints one JSON line per zone."""
import sys, json, math
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from pyproj import Transformer
from scipy.ndimage import sobel
from PIL import Image, ImageDraw
import cityconf as C
import city_data as CD

R = 30
args = [a for a in sys.argv[1:]]
draws = []
while '--draw' in args:
    i = args.index('--draw'); draws.append(args[i + 1]); del args[i:i + 2]
TIF, YEAR = args[0], float(args[1])
ZONES = [z.split(':') for z in args[2:]] or [z.split(':') for z in C.CFG.get('eras', {}).get('zones', [])]

src = rasterio.open(TIF)
to_utm = Transformer.from_crs(4326, src.crs, always_xy=True)
_B = {}


def recs(x0, y0, x1, y1):
    """records standing by YEAR in an engine box, rings in the crop's CRS"""
    out = []
    for b in CD.buildings(x0, y0, x1, y1):
        y = b.get('year') or 0
        if not y or y > YEAR: continue
        r = b['ring']
        a = 0.5 * abs(sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r))))
        if a < 150: continue
        ll = [C.unproj(x, yy) for x, yy in r]
        ux, uy = to_utm.transform([p[0] for p in ll], [p[1] for p in ll])
        out.append((b['gid'], y, list(zip(ux, uy))))
    return out


def window(lon, lat, half):
    cx, cy = to_utm.transform(lon, lat)
    x0, y0, x1, y1 = cx - half, cy - half, cx + half, cy + half
    a = src.read(1, window=from_bounds(x0, y0, x1, y1, src.transform)).astype(np.float32)
    ex, ey = C.proj(lon, lat)
    d = half * 1.1
    return a, (x0, y1), recs(ex - d, ey - d, ex + d, ey + d)


def outline_px(rings, org, res, shape):
    img = Image.new('1', (shape[1], shape[0]), 0); dr = ImageDraw.Draw(img)
    for _, _, ring in rings:
        dr.polygon([((x - org[0]) / res, (org[1] - y) / res) for x, y in ring], outline=1)
    m = np.array(img); m[:R + 1] = 0; m[-R - 1:] = 0; m[:, :R + 1] = 0; m[:, -R - 1:] = 0
    return np.nonzero(m)


def zone(name, lon, lat, half):
    res = src.res[0]
    a, org, rings = window(lon, lat, half)
    valid = a > 0
    g = np.hypot(sobel(a, 0), sobel(a, 1)); g[~valid] = 0
    r_, c_ = outline_px(rings, org, res, a.shape)
    keep = valid[r_, c_]; r_, c_ = r_[keep], c_[keep]
    if len(r_) < 500: return dict(zone=name, n=len(rings), px=int(len(r_)), note='too little of the zone on the photo')
    k = int(R / res)
    S = np.zeros((2 * k + 1, 2 * k + 1), np.float32)
    for i, dy in enumerate(range(-k, k + 1)):
        for j, dx in enumerate(range(-k, k + 1)):
            S[i, j] = g[r_ + dy, c_ + dx].mean()
    i, j = np.unravel_index(S.argmax(), S.shape)
    dx_m, dy_m = (j - k) * res, -(i - k) * res            # rows grow south
    return dict(zone=name, year=YEAR, n=len(rings), px=int(len(r_)), dx=dx_m, dy=dy_m,
                shift_m=round(math.hypot(dx_m, dy_m), 1), gain=round(float(S[i, j] / S[k, k]), 2),
                peak=round(float(S[i, j] / np.median(S)), 2))


if __name__ == '__main__':
    res_z = []
    for z in ZONES:
        r = zone(z[0], float(z[1]), float(z[2]), float(z[3])); res_z.append(r); print(json.dumps(r), flush=True)
    for d in draws:
        lon, lat, half, out = d.split(',')
        lon, lat, half = float(lon), float(lat), float(half)
        a, org, rings = window(lon, lat, half)
        cx, cy = to_utm.transform(lon, lat)
        zc = {z[0]: to_utm.transform(float(z[1]), float(z[2])) for z in ZONES}
        near = min((z for z in res_z if 'dx' in z), default=None, key=lambda z: math.dist(zc[z['zone']], (cx, cy)))
        res = src.res[0]; sc = max(1, int(round(2 / res)))       # ≥ 2 px a metre on the drawing
        im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert('RGB')
        im = im.resize((im.width * sc, im.height * sc), Image.NEAREST); dr = ImageDraw.Draw(im)
        for gid, y, ring in rings:
            dr.polygon([((x - org[0]) / res * sc, (org[1] - yy) / res * sc) for x, yy in ring], outline=(255, 40, 40))
            if near:
                dr.polygon([((x + near['dx'] - org[0]) / res * sc, (org[1] - yy - near['dy']) / res * sc) for x, yy in ring],
                           outline=(40, 255, 40))
        im.save(out, quality=88)
        print(json.dumps(dict(draw=out, zone=near and near['zone'], n=len(rings))), flush=True)
