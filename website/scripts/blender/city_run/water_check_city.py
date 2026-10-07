"""water_check_city.py (FIX4 07/10, another city; CPU, < 1 GB): the render's land/water line against the measured water,
in plan, for a few world boxes - the proof for a sea.png change (water_mask.py) before any GPU.

Render water = the scene's sea mask (city/sea.png, R > 0.5; terrain_hq lays the ground under the sea sheet there and
coast_land_city.py derives its line from it). References, on a 2 m grid:
  lidar  LidarBC 2025 1 m DSM tiles (lidar/bc2025/dsm): a cell inside the tiles with no return = water (nan; dark roofs too,
         so a box's building outlines are dropped);
  s2     Sentinel-2 L2A TCI 2025-08-12 (aud.py's rule: blue over red, dark) - 10 m, coarse;
  lcc    Metro Vancouver LCC 2020 class water (ground/ground_cls_raw.npy).
  CITY=vancouver python3 water_check_city.py [--sea DIR] [--boxes name:x0,y0,x1,y1 ...] [--json out.json]"""
import os, sys, json, glob, argparse
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import citycfg as C
Image.MAX_IMAGE_PIXELS = None
CW = f'{C.W}/cities/{C.CITY}'
S2U = 'https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com/sentinel-2-c1-l2a/10/U/DV/2025/8/S2C_T10UDV_20250812T191308_L2A/TCI.tif'
# the audit's crops (aud LOG step9c, world m from lonlat_of_l9 of the 2048 px boxes) + the river reaches round them
BOXES = {'sw_river': (-4829, -5085, -4594, -4604), 'evs_mitchell': (3845, -5579, 4079, -5102), 'sw_outside': (-6002, -3404, -5768, -2921),
         'arm_west': (-7300, -6000, -4000, -4300), 'arm_mid': (-4000, -6300, 0, -4300), 'arm_east': (0, -6800, 5200, -4600),
         'arm_outside_w': (-9000, -6300, -7300, -3500)}

def grid(b, st=2.0):
    xs = np.arange(b[0] + st / 2, b[2], st); ys = np.arange(b[3] - st / 2, b[1], -st)
    return np.meshgrid(xs, ys)

def sea_at(sd, X, Y):
    g = json.load(open(f'{sd}/sea.json')); a = np.asarray(Image.open(f'{sd}/sea.png'))[..., 0]; H, W = a.shape
    c = np.clip(((X - g['ox']) / g['w'] * W).astype(int), 0, W - 1); r = np.clip(((g['oy'] + g['h'] - Y) / g['h'] * H).astype(int), 0, H - 1)
    return a[r, c] > 127

def lidar_at(X, Y):
    """(water, covered): no-return cells inside the 2025 tiles"""
    import rasterio
    from pyproj import Transformer
    lon, lat = C.lonlat_of_world(X, Y); E, N = Transformer.from_crs('EPSG:4326', 'EPSG:26910', always_xy=True).transform(lon, lat)
    wat = np.zeros(X.shape, bool); cov = np.zeros(X.shape, bool)
    for f in glob.glob(f'{CW}/lidar/bc2025/dsm/*.tif'):
        with rasterio.open(f) as r:
            b = r.bounds; k = (E >= b.left) & (E < b.right) & (N > b.bottom) & (N <= b.top)
            if not k.any(): continue
            A = r.read(1); cc = ((E[k] - b.left) / r.res[0]).astype(int).clip(0, r.width - 1); rr = ((b.top - N[k]) / r.res[1]).astype(int).clip(0, r.height - 1)
            v = A[rr, cc]; cov[k] = True; wat[k] = (v < -1000) | ~np.isfinite(v)
    return wat, cov

def s2_ndwi(X, Y):
    """Sentinel-2 NDWI (B03 green, B08 NIR, 10 m) > 0: water, the turbid Fraser included (the TCI colour rule misses it)"""
    import rasterio
    from rasterio.windows import from_bounds
    from pyproj import Transformer
    lon, lat = C.lonlat_of_world(X, Y); B = []
    try:
        for b in ('B03', 'B08'):
            with rasterio.open(S2U.replace('TCI.tif', b + '.tif')) as r:
                E, N = Transformer.from_crs('EPSG:4326', r.crs, always_xy=True).transform(lon, lat)
                win = from_bounds(E.min() - 30, N.min() - 30, E.max() + 30, N.max() + 30, r.transform); A = r.read(1, window=win, boundless=True).astype(np.float32); tr = r.window_transform(win)
            c = np.clip(((E - tr.c) / tr.a).astype(int), 0, A.shape[1] - 1); rr = np.clip(((N - tr.f) / tr.e).astype(int), 0, A.shape[0] - 1); B.append(A[rr, c])
    except Exception as ex:
        print('s2 unavailable', ex); return None
    return (B[0] - B[1]) / np.maximum(B[0] + B[1], 1) > 0.0

def s2_at(X, Y):
    import rasterio
    from rasterio.windows import from_bounds
    from pyproj import Transformer
    lon, lat = C.lonlat_of_world(X, Y)
    try:
        with rasterio.open(S2U) as r:
            E, N = Transformer.from_crs('EPSG:4326', r.crs, always_xy=True).transform(lon, lat)
            win = from_bounds(E.min() - 30, N.min() - 30, E.max() + 30, N.max() + 30, r.transform); A = r.read(window=win, boundless=True); tr = r.window_transform(win)
    except Exception as ex:
        print('s2 unavailable', ex); return None
    c = np.clip(((E - tr.c) / tr.a).astype(int), 0, A.shape[2] - 1); rr = np.clip(((N - tr.f) / tr.e).astype(int), 0, A.shape[1] - 1)
    a = np.stack([A[k][rr, c] for k in range(3)], -1).astype(int); R, G, B = a[..., 0], a[..., 1], a[..., 2]
    return (B > R + 8) & (R + G + B < 260) & (B >= G - 6)

def lcc_at(X, Y):
    M = json.load(open(f'{CW}/ground/ground_meta.json')); G = np.load(f'{CW}/ground/ground_cls_raw.npy', mmap_mode='r')
    i = np.floor((Y - M['y0']) / M['res']).astype(int); j = np.floor((X - M['x0']) / M['res']).astype(int)
    ok = (i >= 0) & (i < G.shape[0]) & (j >= 0) & (j < G.shape[1]); out = np.zeros(X.shape, bool); cls = np.full(X.shape, -1)
    cls[ok] = np.asarray(G[i[ok], j[ok]]); out = cls == M['classes'].index('water'); return out, ok & (cls != 0)

def iou(a, b, m):
    a, b = a[m], b[m]; u = (a | b).sum(); return round(float((a & b).sum() / u), 3) if u else None

def check(sd, boxes, s2=True):
    out = {}
    for n, b in boxes.items():
        X, Y = grid(b); sea = sea_at(sd, X, Y); lw, lc = lidar_at(X, Y); cw, cc = lcc_at(X, Y)
        lc2 = lc & cc                     # LiDAR where LCC has a class too: building outlines (LCC 'none', dark roofs = no return) dropped
        o = dict(sea=round(float(sea.mean()), 3), lidar_water=round(float(lw[lc2].mean()), 3) if lc2.any() else None, lidar_cover=round(float(lc.mean()), 3),
                 lcc_water=round(float(cw[cc].mean()), 3) if cc.any() else None, iou_lidar=iou(sea, lw, lc2), iou_lcc=iou(sea, cw, cc),
                 sea_on_lidar_land=round(float((sea & lc2 & ~lw).sum() / max(1, (lc2 & ~lw).sum())), 3),
                 lidar_water_missed=round(float((~sea & lc2 & lw).sum() / max(1, (lc2 & lw).sum())), 3))
        if s2:
            sw_ = s2_ndwi(X, Y)
            if sw_ is not None: o.update(s2_water=round(float(sw_.mean()), 3), iou_s2=iou(sea, sw_, np.ones_like(sea)))
        out[n] = o; print(n, b, o, flush=True)
    return out

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--sea', default=f'{CW}/city'); ap.add_argument('--boxes', nargs='*'); ap.add_argument('--json'); ap.add_argument('--no-s2', action='store_true')
    a = ap.parse_args()
    bx = BOXES if not a.boxes else {s.split(':')[0]: tuple(map(float, s.split(':')[1].split(','))) for s in a.boxes}
    r = check(a.sea, bx, not a.no_s2)
    if a.json: json.dump(dict(sea=a.sea, boxes=bx, result=r), open(a.json, 'w'), indent=1)
