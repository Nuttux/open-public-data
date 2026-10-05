"""Land/water mask + distance to shore for one exported district.

The engine's water is an 8 m raster: its edge is a staircase. Rasterised at
2 m, blurred by ~8 m and re-thresholded, the shoreline comes out as a smooth
curve; a Euclidean distance transform then gives every water pixel its
distance to land, which the sea shader turns into shallow colour and foam.
Output: <dir>/sea.png (R = water, G = distance to shore, 0.5 m a step) and
<dir>/sea.json (the metres each pixel covers).
usage: python3 water_mask.py <scene_dir>
"""
import array, base64, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import distance_transform_edt

D = sys.argv[1]
d = json.load(open(f'{D}/scene.json'))
x0, y0, x1, y1 = d['box']; PAD, RES = 500, 2.0
ox, oy = x0 - PAD, y0 - PAD
W, H = int((x1 - x0 + 2 * PAD) / RES), int((y1 - y0 + 2 * PAD) / RES)
def _layer(names):
    im = Image.new('L', (W, H), 0); dw = ImageDraw.Draw(im)
    for m in d['meshes']:
        if m['layer'] not in names or m.get('instanced'): continue
        p = np.frombuffer(base64.b64decode(m['pos']), dtype=np.float32).reshape(-1, 3, 3)
        for t in p:
            dw.polygon([((t[k, 0] - ox) / RES, H - (t[k, 1] - oy) / RES) for k in range(3)], fill=255)
    return np.asarray(im) > 0

def close_limit_gap(raw, gap=150.0):
    """(fix4, 05/10, not SF) the engine's 'surround' land stops short of the city's own terrain along a land limit
    (Boundary Rd: an 8-74 m strip x 9.8 km; the engine's base/landmask has the same cut), and the open-water sheets
    under the box show through it. A water pixel lying between the two (distance to the city terrain + distance to
    the surround <= gap) that ESA WorldCover (engine base/surround-landcover-fine.bin, the surround's own source)
    calls land is land. Real channels between the city and its neighbours are WorldCover water: kept."""
    import cv2
    cj = f'{D}/../city.json'
    if not os.path.exists(cj): print('limit gap: no city.json, skipped'); return raw
    cfg = json.load(open(cj)); eng, pj = cfg['engine'], cfg['proj']
    lj = json.load(open(f'{eng}/base/surround-landcover.json')); fw, fh = lj['fine']['w'], lj['fine']['h']
    fine = np.fromfile(f'{eng}/base/{lj["fine"]["file"]}', np.uint8).reshape(fh, fw)   # rows Y-up
    w_, s_, e_, n_ = lj['bbox4326']
    def is_land(X, Y):                                          # WorldCover land (not water/wetland/uncovered)
        lon = pj['lon0'] + X / (pj['mpd'] * pj['cosl']); lat = pj['lat0'] + Y / pj['mpd']
        fi = np.clip(np.floor((lon - w_) / (e_ - w_) * fw).astype(int), 0, fw - 1)
        fj = np.clip(np.floor((lat - s_) / (n_ - s_) * fh).astype(int), 0, fh - 1)
        f = fine[fj, fi]; return (f >= 2) & (f < 255)
    terr, sur = _layer(('terrain',)), _layer(('surround',))
    dt = cv2.distanceTransform((~terr).astype(np.uint8), cv2.DIST_L2, 5) * RES
    ds = cv2.distanceTransform((~sur).astype(np.uint8), cv2.DIST_L2, 5) * RES
    cand = (raw > 0) & ~terr & ~sur & (dt + ds <= gap)
    lim = (cfg.get('block') or {}).get('limits')                # only along the city limits (not Coal Harbour's piers)
    if lim:
        g = json.load(open(lim if os.path.isabs(lim) else f'{D}/../{lim}'))
        g = g['geometry'] if 'geometry' in g else g['features'][0]['geometry']
        rings = g['coordinates'] if g['type'] == 'Polygon' else [r for pg in g['coordinates'] for r in pg]
        ed = np.zeros((H, W), np.uint8)
        for r in rings:
            r = np.asarray(r, float); Xr = (r[:, 0] - pj['lon0']) * pj['mpd'] * pj['cosl']; Yr = (r[:, 1] - pj['lat0']) * pj['mpd']
            cv2.polylines(ed, [np.stack([(Xr - ox) / RES, H - (Yr - oy) / RES], 1).round().astype(np.int32)], True, 255, 1)
        # a LAND limit only (Boundary Rd), not a limit that follows the shore (Coal Harbour, False Creek): the limit
        # pixel's surroundings (16 points at 60 and 120 m) are >= 85 % WorldCover land
        ey, ex = np.nonzero(ed); EX = ox + (ex + 0.5) * RES; EY = oy + (H - ey - 0.5) * RES
        ang = np.linspace(0, 2 * np.pi, 16, endpoint=False); fr = np.zeros(len(ex))
        for rad in (60.0, 120.0):
            for a_ in ang:
                fr += is_land(EX + rad * np.cos(a_), EY + rad * np.sin(a_))
        ed[ey[fr / 32 < 0.85], ex[fr / 32 < 0.85]] = 0
        cand &= cv2.distanceTransform((ed == 0).astype(np.uint8), cv2.DIST_L2, 5) * RES <= gap
    yy, xx = np.nonzero(cand)
    land = is_land(ox + (xx + 0.5) * RES, oy + (H - yy - 0.5) * RES)
    raw = raw.copy(); raw[yy[land], xx[land]] = 0
    print('limit gap: candidates', int(cand.sum()), 'made land', int(land.sum()), f'({land.sum() * RES * RES / 1e4:.1f} ha)')
    return raw

img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(img)
n = 0
for m in d['meshes']:
    if m['layer'] != 'water' or m.get('instanced'): continue  # all three: the shore band and both open-water sheets
    p = array.array('f'); p.frombytes(base64.b64decode(m['pos']))
    for t in range(len(p) // 9):
        pts = [((p[t*9+k*3] - ox) / RES, H - (p[t*9+k*3+1] - oy) / RES) for k in range(3)]
        dr.polygon(pts, fill=255); n += 1
# another city's engine lays its open-water sheet under the whole box and the
# neighbouring land ('surround': North Shore, Burnaby, Richmond) on top of it:
# that land is not sea. SF (CITY unset) is unchanged.
if os.environ.get('CITY', 'sf') != 'sf':
    for m in d['meshes']:
        if m['layer'] != 'surround' or m.get('instanced'): continue
        p = array.array('f'); p.frombytes(base64.b64decode(m['pos']))
        for t in range(len(p) // 9):
            dr.polygon([((p[t*9+k*3] - ox) / RES, H - (p[t*9+k*3+1] - oy) / RES) for k in range(3)], fill=0)
raw = np.asarray(img, dtype=np.uint8).copy()
if os.environ.get('CITY', 'sf') != 'sf':
    raw = close_limit_gap(raw)
# outside the exported box nothing was exported: carry the box's own edge
# outward, so a bay that runs off the frame keeps running
bx0, bx1 = int(PAD / RES), W - int(PAD / RES) - 1
by0, by1 = int(PAD / RES), H - int(PAD / RES) - 1
raw[:, :bx0] = raw[:, bx0:bx0 + 1]; raw[:, bx1 + 1:] = raw[:, bx1:bx1 + 1]
raw[:by0, :] = raw[by0:by0 + 1, :]; raw[by1 + 1:, :] = raw[by1:by1 + 1, :]
soft = np.asarray(Image.fromarray(raw).filter(ImageFilter.GaussianBlur(4)), dtype=np.float32) / 255
water = soft > 0.5
dist = distance_transform_edt(water) * RES                      # metres to land, 0 on land
edge = np.clip((soft - 0.5) * 6 + 0.5, 0, 1)                    # antialiased mask
out = np.zeros((H, W, 3), np.uint8)
out[..., 0] = (edge * 255).astype(np.uint8)
out[..., 1] = np.clip(dist * 2, 0, 255).astype(np.uint8)
Image.fromarray(out).save(f'{D}/sea.png')
json.dump({'ox': ox, 'oy': oy, 'w': W * RES, 'h': H * RES, 'triangles': n, 'water_share': float(water.mean())}, open(f'{D}/sea.json', 'w'))
print(D.split('/')[-1], 'water triangles', n, 'water share', round(float(water.mean()), 3))
