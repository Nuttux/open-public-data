"""ground_smooth.py (04/10 B2b, Vancouver pilot fix 5): the second step after ground_landcover.py, for a city whose
ground classes come from a 5 m land-cover raster (CITY != sf; SF's ground_cls is NAIP at 1 m and never goes through here).

  CITY=vancouver python3 ground_smooth.py [--sigma 3.5] [--rail-m 40] [--sea-m 60]

1. SAND ONLY ON A BEACH: ground_landcover calls every Barren cell within 60 m of water sand. That made the CPR rail lands
   by Waterfront Station and the shores of Lost Lagoon sand. Here a sand pixel within RAIL_M of a rail line (engine
   base/rail.json) or farther than SEA_M from the open water (city/sea.png, the render's own sea: lakes are not beaches)
   goes back to gravel (the Barren class's own mapping); wet sand away from the sea (a lake's edge) becomes marsh.
2. NO STAIRCASE: the 5 m cells were resampled nearest to 1 m and stand rotated against the UTM grid, so every class edge
   is a staircase that ground_hq's 5x5 majority cannot round off (the 'triangle' jaggies on the rail lands). Each class's
   one-hot is blurred (Gaussian, sigma m) and the argmax taken: the edges become smooth curves, like water_mask.py's sea.
The input is kept as ground_cls_raw.npy (written once); ground_cls.npy is replaced. Tiled (2048 px + pad), numpy + cv2."""
import os, sys, json, argparse, time
import numpy as np, cv2
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cityconf as C
Image.MAX_IMAGE_PIXELS = None

ap = argparse.ArgumentParser(); ap.add_argument('--sigma', type=float, default=3.5); ap.add_argument('--rail-m', type=float, default=40.0)
ap.add_argument('--sea-m', type=float, default=60.0); a = ap.parse_args()
if C.CITY == 'sf': sys.exit('ground_smooth.py is for another city (CITY=...): SF keeps its NAIP classes')
GD = C.work('ground'); M = json.load(open(f'{GD}/ground_meta.json')); CLS = M['classes']; CI = {n: k for k, n in enumerate(CLS)}
raw = f'{GD}/ground_cls_raw.npy'
if not os.path.exists(raw): os.rename(f'{GD}/ground_cls.npy', raw)
G = np.load(raw); ny, nx = G.shape; x0, y0, res = M['x0'], M['y0'], M['res']; T0 = time.time()
print('classes', G.shape, 'row0 south', flush=True)

# 1. sand -> gravel near rails / away from the sea
sand = G == CI['sand']; print('sand px before', int(sand.sum()), flush=True)
rail = np.zeros((ny, nx), np.uint8)
for s in json.load(open(os.path.join(C.ENGINE, 'base', 'rail.json')))['segs']:
    p = [(int(round((s[0] - x0) / res)), int(round((s[1] - y0) / res))), (int(round((s[2] - x0) / res)), int(round((s[3] - y0) / res)))]
    cv2.line(rail, p[0], p[1], 1, 1)
k = int(round(a.rail_m / res)); near_rail = cv2.dilate(rail, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * k + 1, 2 * k + 1))) > 0; del rail
sj = json.load(open(C.work('city', 'sea.json'))); sp = np.asarray(Image.open(C.work('city', 'sea.png')))[:, :, 0] > 127   # row 0 = north, 2 m/px
sres = sj['w'] / sp.shape[1]; ks = int(round(a.sea_m / sres))
sea_near = cv2.dilate(sp.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * ks + 1, 2 * ks + 1))) > 0
jj, ii = np.nonzero(sand)
wx, wy = x0 + (ii + 0.5) * res, y0 + (jj + 0.5) * res
sc = np.clip(((wx - sj['ox']) / sres).astype(int), 0, sp.shape[1] - 1); sr = np.clip(((sj['oy'] + sj['h'] - wy) / sres).astype(int), 0, sp.shape[0] - 1)
bad = near_rail[jj, ii] | ~sea_near[sr, sc]
G2 = G.copy(); G2[jj[bad], ii[bad]] = CI['gravel']
# wet sand by a lake (Lost Lagoon's reedy edge) is no tidal flat: marsh there
jw, iw = np.nonzero(G == CI['wetsand']); wx, wy = x0 + (iw + 0.5) * res, y0 + (jw + 0.5) * res
inl = ~sea_near[np.clip(((sj['oy'] + sj['h'] - wy) / sres).astype(int), 0, sp.shape[0] - 1), np.clip(((wx - sj['ox']) / sres).astype(int), 0, sp.shape[1] - 1)]
G2[jw[inl], iw[inl]] = CI['marsh']; print('inland wetsand -> marsh', int(inl.sum()), flush=True); del near_rail, sea_near
print('sand -> gravel', int(bad.sum()), 'kept', int((~bad).sum()), f'{time.time() - T0:.0f}s', flush=True)

# 2. smooth class edges: per-class Gaussian, argmax (tiled)
T, P = 2048, int(4 * a.sigma / res) + 2; sg = a.sigma / res
out = np.zeros_like(G2)
for j in range(0, ny, T):
    for i in range(0, nx, T):
        ja, jb, ia, ib = max(0, j - P), min(ny, j + T + P), max(0, i - P), min(nx, i + T + P)
        t = G2[ja:jb, ia:ib]; ks_ = np.unique(t)
        if len(ks_) == 1: out[j:j + T, i:i + T] = ks_[0]; continue
        best = np.full(t.shape, -1.0, np.float32); arg = np.zeros(t.shape, np.uint8)
        for c in ks_:
            w = cv2.GaussianBlur((t == c).astype(np.float32), (0, 0), sg)
            up = w > best; best[up] = w[up]; arg[up] = c
        out[j:j + T, i:i + T] = arg[j - ja:j - ja + min(T, ny - j), i - ia:i - ia + min(T, nx - i)]
np.save(f'{GD}/ground_cls.npy', out)
ch = float((out != G).mean())
M['smooth'] = dict(script='ground_smooth.py', sigma_m=a.sigma, rail_m=a.rail_m, sea_m=a.sea_m, sand_to_gravel=int(bad.sum()), changed_share=round(ch, 4),
                   raw='ground_cls_raw.npy')
json.dump(M, open(f'{GD}/ground_meta.json', 'w'), indent=1)
print('DONE changed share', round(ch, 4), f'{time.time() - T0:.0f}s')
