"""water_v5_real_prep.py [out dir] [box x0,y0,x1,y1]: the REAL bay's large-scale pattern for water_v5.py (V5_REAL=1), from USDA NAIP 2022
(60 cm, public domain; the quarter quads roofs_prep.py already reads). World frame (engine metres, x east, y north), 2 m a pixel:
  v5r_col.png   the real water colour relative to its own median (per channel, 0.5 = x1, range x0..x2), low-passed (~12 m): tone and
                colour patches, darker / greener bands near shore and over the shallows, turbidity
  v5r_rough.png the real surface roughness: local energy of the wave texture at 1 m (ripples resolved by NAIP), normalised to the
                bay's 5-95 %: slicks (smooth, low), gust patches and wind lanes (rough, high), current lines
Water = shore_sd > 0 (OSM coast) and NIR low. Boats, wakes, pier shadows and other small objects are removed first: water px that
depart from a 50 m local median by more than a robust threshold (+ a 4 m margin) are dropped and filled by normalised convolution,
so no boat or wake is baked in. Deterministic (fixed NAIP scene, no randomness)."""
import json, os, sys, math, numpy as np
from PIL import Image
from scipy import ndimage as nd
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import roofs_prep as RP
OUT = sys.argv[1] if len(sys.argv) > 1 else (os.environ.get('WATER_DIR') or '/Users/daniel/code/qipu-render-work/water')
X0, Y0, X1, Y1 = map(float, (sys.argv[2] if len(sys.argv) > 2 else '1500,2500,5500,7000').split(','))
WD = os.environ.get('WATER_DIR') or OUT
R1 = 1.0; T = 500.0   # sample NAIP at 1 m in 500 m tiles (each tile from its own quarter quad)
nx, ny = int((X1 - X0) / R1), int((Y1 - Y0) / R1); A = np.zeros((4, ny, nx), np.float32); Q = np.zeros((ny, nx), np.int16); QN = {}
for ty in range(int((Y1 - Y0) / T)):
    for tx in range(int((X1 - X0) / T)):
        x0, y1 = X0 + tx * T, Y1 - ty * T
        it = RP.pick_item(*RP.eng_to_utm(x0 + T / 2, y1 - T / 2)); p = RP.naip_patch(x0, y1 - T, x0 + T, y1, R1, it)
        qi = QN.setdefault(it['path'], len(QN)); Q[int(ty * T / R1):int((ty + 1) * T / R1), int(tx * T / R1):int((tx + 1) * T / R1)] = qi
        A[:, int(ty * T / R1):int((ty + 1) * T / R1), int(tx * T / R1):int((tx + 1) * T / R1)] = p
    print('row', ty, flush=True)
# water mask: OSM coast distance (shore_sd) > 0.5 m and low NIR
q = json.load(open(os.path.join(WD, 'shore_sd.json')))
im = Image.open(os.path.join(WD, 'shore_sd.png')); sdv = np.asarray(im).astype(np.float32); sdv = sdv / (65535.0 if sdv.max() > 255 else 255.0) * q['vmax']
if sdv.ndim == 3: sdv = sdv[..., 0]
X = X0 + (np.arange(nx) + 0.5) * R1; Y = Y1 - (np.arange(ny) + 0.5) * R1
ci = ((X - q['x0']) / q['res']).astype(int).clip(0, sdv.shape[1] - 1); ri = ((q['y1'] - Y) / q['res']).astype(int).clip(0, sdv.shape[0] - 1)
SD = sdv[ri[:, None], ci[None, :]]
nir = A[3]; W = (SD > 0.5) & (nir < np.percentile(nir[SD > 5], 97) + 10)
L = 0.2126 * A[0] + 0.7152 * A[1] + 0.0722 * A[2]
# remove boats, wakes, shadows: outliers vs a 50 m local median (on water), + 4 m margin
Wf = W.astype(np.float32)
def nconv(a, m, s): return nd.gaussian_filter(a * m, s) / np.maximum(nd.gaussian_filter(m, s), 1e-3)
med = nd.median_filter(np.where(W, L, np.nan_to_num(nconv(L, Wf, 20))), size=51)
Ls = nconv(L, Wf, 2.0); dev = Ls - med; mad = np.median(np.abs(dev[W])) + 1e-3   # objects >= ~3 m survive a 2 m blur, ripples do not
bad = W & (np.abs(dev) > max(6.0 * mad, 10.0))
bad = nd.binary_dilation(bad, iterations=4) & W
good = (W & ~bad).astype(np.float32)
print('water px', int(W.sum()), 'removed (boats / wakes / shadows)', round(float(bad.sum() / W.sum()), 4), flush=True)
# per QUARTER QUAD normalisation (different flights: tone, sun glint and striping differ; a raw map shows the quad seam)
C = np.stack([nconv(A[k], good, 12.0) for k in range(3)]); rel = np.ones_like(C)
Ls8 = nconv(L, good, 8.0); B_ = Ls8 - nconv(L, good, 150.0); z = np.zeros_like(L)
for qi in range(len(QN)):
    m = W & (Q == qi) & (good > 0)
    if m.sum() < 5000: continue
    for k in range(3): rel[k][Q == qi] = np.clip(C[k][Q == qi] / np.median(C[k][m]), 0, 2)
    z[Q == qi] = (B_[Q == qi] - np.median(B_[m])) / (B_[m].std() + 1e-3)
# feather the quad joins (40 m)
for k in range(3): rel[k] = nconv(rel[k], W.astype(np.float32), 6.0)
z = nconv(z, W.astype(np.float32), 6.0)
rough = np.clip(0.5 + 0.22 * z, 0, 1)    # brighter water = rougher (sheen), slicks darker = smoother: same sign as the shader's sheen
print('quads', len(QN), flush=True)
# fill land with neutral values (the shader only uses the sea sheet), then 2 m
rel = np.where(W[None], rel, 1.0); rough = np.where(W, rough, 0.5)
ds = lambda a: a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2).mean((1, 3))
relc = np.stack([ds(rel[k]) for k in range(3)], -1); rg = ds(rough)
Image.fromarray((np.clip(relc / 2.0, 0, 1) * 65535 + 0.5).astype(np.uint16)[..., 0]).save(os.path.join(OUT, 'v5r_colr.png'))
Image.fromarray((np.clip(relc / 2.0, 0, 1) * 65535 + 0.5).astype(np.uint16)[..., 1]).save(os.path.join(OUT, 'v5r_colg.png'))
Image.fromarray((np.clip(relc / 2.0, 0, 1) * 65535 + 0.5).astype(np.uint16)[..., 2]).save(os.path.join(OUT, 'v5r_colb.png'))
Image.fromarray((rg * 65535 + 0.5).astype(np.uint16)).save(os.path.join(OUT, 'v5r_rough.png'))
json.dump(dict(x0=X0, y0=Y0, x1=X1, y1=Y1, res=2.0, source='USDA NAIP 2022 60 cm (public domain), quarter quads as roofs_prep.py',
               col='relative to the median water colour, stored /2 (0.5 = x1), per channel png', rough='wave-texture energy, 5-95 % -> 0..1',
               removed=round(float(bad.sum() / W.sum()), 4), median_rgb=[float(np.median(C[k][W])) for k in range(3)], quads=list(QN)), open(os.path.join(OUT, 'v5r.json'), 'w'), indent=1)
# preview (small)
pv = np.clip(np.stack([C[k] for k in range(3)], -1), 0, 255).astype(np.uint8); pv[~W] = 0
Image.fromarray(pv).resize((nx // 4, ny // 4)).save(os.path.join(OUT, 'v5r_prev_col.jpg'), quality=85)
Image.fromarray((rough * 255).astype(np.uint8)).resize((nx // 4, ny // 4)).save(os.path.join(OUT, 'v5r_prev_rough.jpg'), quality=85)
print('v5r maps', relc.shape, '->', OUT)
