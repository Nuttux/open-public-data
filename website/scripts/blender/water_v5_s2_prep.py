"""water_v5_s2_prep.py <out dir> <sentinel-2 item json> [box x0,y0,x1,y1]: the REAL bay's large-scale pattern for water_v5.py V5_REAL=1,
from one Copernicus Sentinel-2 L2A scene (10 m; contains modified Copernicus Sentinel data, free and open licence; read from the
public AWS COGs listed by earth-search). NAIP was tried first and rejected: its bay is dominated by sensor striping, flight-line bands,
the quarter-quad seam and sun glint. Sentinel-2 avoids glint and shows the bay's real turbidity bands, tidal fronts and wind streaks.
World frame (engine metres), 5 m a pixel:
  v5r_colr/g/b.png  the water colour relative to its median (per channel, stored /2: 0.5 = x1), 15 m low-pass: tone and colour
                    patches, fronts, darker / greener bands near shore and over shallows
  v5r_rough.png     the band-pass (30-400 m) of the water's brightness, standardised -> 0..1 (0.5 = mean): brighter streaks = rougher
                    (wind lanes, sheen), darker = slicks
Water = OSM coast distance > 0 and NIR low. Boats, wakes, the bridge and other objects (outliers vs a 100 m median, + 20 m) are
removed and filled by normalised convolution. Deterministic (one fixed scene)."""
import json, os, sys, numpy as np, rasterio
from rasterio.windows import from_bounds
from PIL import Image
from scipy import ndimage as nd
from scipy.ndimage import map_coordinates
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import roofs_prep as RP
OUT, ITEM = sys.argv[1], json.load(open(sys.argv[2]))
X0, Y0, X1, Y1 = map(float, (sys.argv[3] if len(sys.argv) > 3 else '1500,2500,5500,7000').split(','))
WD = os.environ.get('WATER_DIR') or '/Users/daniel/code/qipu-render-work/water'; RES = 5.0
nx, ny = int((X1 - X0) / RES), int((Y1 - Y0) / RES)
X, Y = np.meshgrid(X0 + (np.arange(nx) + 0.5) * RES, Y1 - (np.arange(ny) + 0.5) * RES)
ux, uy = RP.eng_to_utm(X.ravel(), Y.ravel()); pad = 60
bb = (ux.min() - pad, uy.min() - pad, ux.max() + pad, uy.max() + pad)
B = {}
with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_USE_HEAD='NO'):
    for k in ('red', 'green', 'blue', 'nir'):
        with rasterio.open(ITEM['assets'][k]['href']) as s:
            w = from_bounds(*bb, s.transform).round_offsets().round_lengths(); a = s.read(1, window=w).astype(np.float32); tr = s.window_transform(w)
        col = (ux - tr.c) / tr.a - 0.5; row = (uy - tr.f) / tr.e - 0.5
        B[k] = map_coordinates(a, [row, col], order=1, mode='nearest').reshape(ny, nx)
q = json.load(open(os.path.join(WD, 'shore_sd.json'))); sdv = np.asarray(Image.open(os.path.join(WD, 'shore_sd.png'))).astype(np.float32)
if sdv.ndim == 3: sdv = sdv[..., 0]
sdv = sdv / (65535.0 if sdv.max() > 255 else 255.0) * q['vmax']
SD = sdv[((q['y1'] - Y) / q['res']).astype(int).clip(0, sdv.shape[0] - 1), ((X - q['x0']) / q['res']).astype(int).clip(0, sdv.shape[1] - 1)]
W = (SD > 3.0) & (B['nir'] < np.percentile(B['nir'][SD > 20], 95) * 1.3)
def nconv(a, m, s): return nd.gaussian_filter(a * m, s) / np.maximum(nd.gaussian_filter(m, s), 1e-3)
L = 0.2126 * B['red'] + 0.7152 * B['green'] + 0.0722 * B['blue']; Wf = W.astype(np.float32)
med = nd.median_filter(np.where(W, L, nconv(L, Wf, 10)), size=21)                       # ~100 m
dev = L - med; mad = np.median(np.abs(dev[W])) + 1e-3
bad = nd.binary_dilation(W & (np.abs(dev) > max(5 * mad, 0.012 * np.median(L[W]) * 10)), iterations=4) & W
NEAR = float(os.environ.get('S2_NEAR', '0'))   # [S2_NEAR, 29/09 night] metres from the coast / piers whose S2 px are not trusted (pier shadow,
# mixed 10 m px): v5A showed them as dark halos 15-60 m around Pier 39 and the piers (the shader fades the map only inside 15-60 m);
# they are refilled from the nearest trusted water (40 m low-pass), so the pattern runs up to the walls without a ring. 0 = as before.
near = W & (SD < NEAR)
good = (W & ~bad & ~near).astype(np.float32); print('water px', int(W.sum()), 'removed', round(float(bad.sum() / W.sum()), 4), 'near', round(float(near.sum() / W.sum()), 4), flush=True)
if NEAR > 0:
    _, IDX = nd.distance_transform_edt(good < 0.5, return_indices=True)
    def nconv(a, m, s, _n=nconv):
        v = _n(a, m, s); wt = np.clip(nd.gaussian_filter(m, s) / 0.5, 0, 1); far = nd.gaussian_filter(_n(a, m, 8.0)[IDX[0], IDX[1]], 3.0)
        return wt * v + (1 - wt) * far
C = np.stack([nconv(B[k], good, 1.5) for k in ('red', 'green', 'blue')])
rel = np.stack([np.clip(C[k] / np.median(C[k][W]), 0, 2) for k in range(3)])
Lc = nconv(L, good, 3.0); bp = Lc - nconv(L, good, 40.0); z = (bp - np.median(bp[W])) / (bp[W].std() + 1e-6)
rough = np.clip(0.5 + 0.22 * z, 0, 1)
rel = np.where(W[None], rel, 1.0); rough = np.where(W, rough, 0.5)
for k, c in enumerate('rgb'): Image.fromarray((np.clip(rel[k] / 2, 0, 1) * 65535 + 0.5).astype(np.uint16)).save(os.path.join(OUT, f'v5r_col{c}.png'))
Image.fromarray((rough * 65535 + 0.5).astype(np.uint16)).save(os.path.join(OUT, 'v5r_rough.png'))
json.dump(dict(x0=X0, y0=Y0, x1=X1, y1=Y1, res=RES, source=f"Copernicus Sentinel-2 L2A {ITEM['id']} (contains modified Copernicus Sentinel data {ITEM['properties']['datetime'][:4]})",
               removed=round(float(bad.sum() / W.sum()), 4), rel_sd=[round(float(rel[k][W].std()), 4) for k in range(3)]), open(os.path.join(OUT, 'v5r.json'), 'w'), indent=1)
pv = np.clip(np.moveaxis(rel, 0, -1) * 110, 0, 255).astype(np.uint8); pv[~W] = 0
Image.fromarray(pv).save(os.path.join(OUT, 'v5r_prev_col.jpg'), quality=88); Image.fromarray((rough * 255).astype(np.uint8)).save(os.path.join(OUT, 'v5r_prev_rough.jpg'), quality=88)
print('v5r (S2) maps', nx, ny, 'rel sd', [round(float(rel[k][W].std()), 3) for k in range(3)], '->', OUT)
