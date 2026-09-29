"""city/run/coverage.py (city-run planner, 29/09): the whole-city extent in L9 px, from the L7 city render (64 frames 5120 x 3072 L7 = L9/4,
pyramid z7_present_0924_0735). Water per L7 px = speed/tp/tp_skip.py's colour lookup (32^3 RGB bins -> P(water), trained on the pilot
north row's L9 class maps /4, validated 896/897 tile decisions on the south row); empty = alpha < 8 (outside the modelled city).
Output (64 L9 px cells, 2560 x 1536 over 163840 x 98304 L9 px): cov/water64.npy, cov/empty64.npy (float16 fractions), cov/rgb64.png (the city at
1/64), cov/crops.json = per L9 crop (32 x 32, 5120 x 3072): land / water / empty fractions.   python3 coverage.py  (CPU only, ~3-5 min, < 3 GB RAM)"""
import os, json, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
Z7 = '/Volumes/DANI-SD-DRIVE2/qipu-render-work-backup/pyramid/z7_present_0924_0735'; PB = '/Users/daniel/code/qipu-render-work/ai/pilot/blocks'
D = os.environ.get('COV', '/Volumes/QIPU-SSD/qipu-city/cov'); os.makedirs(D, exist_ok=True); C = 16   # L7 px per cell (= 64 L9 px)
def frame(i, j): return np.asarray(Image.open(f'{Z7}/f_z7_{i}_{j}.png').convert('RGBA'))
def bins(f): q = f[..., :3].astype(np.int32) // 8; return (q[..., 0] * 32 + q[..., 1]) * 32 + q[..., 2]
def truth(b):
    m = json.load(open(f'{PB}/{b}/meta.json')); x0, y0, x1, y1 = m['block']; ox, oy = m['ox'], m['oy']
    a = np.asarray(Image.open(f'{PB}/{b}/R.class.png').convert('RGB').crop((x0 - ox, y0 - oy, x1 - ox, y1 - oy))) > 128
    w = (~a[..., 0] & ~a[..., 1] & a[..., 2]).astype(np.float32); del a
    return w.reshape(w.shape[0] // 4, 4, w.shape[1] // 4, 4).mean((1, 3))
if not os.path.exists(f'{D}/P.npy'):
    num = np.zeros(32 ** 3); den = np.zeros(32 ** 3)
    for b in ('4_2', '5_2', '6_2'):
        i, j = map(int, b.split('_')); k = bins(frame(i, j)).ravel(); t = truth(b).ravel()
        num += np.bincount(k, t, 32 ** 3); den += np.bincount(k, None, 32 ** 3); print('trained on', b, flush=True)
    np.save(f'{D}/P.npy', np.where(den > 20, num / np.maximum(den, 1), 0.5).astype(np.float32))
P = np.load(f'{D}/P.npy')
Wt = np.zeros((8 * 3072 // C, 8 * 5120 // C), np.float32); Em = np.zeros_like(Wt); RGB = np.zeros((*Wt.shape, 3), np.uint8)
red = lambda a: a.reshape(a.shape[0] // C, C, a.shape[1] // C, C, *a.shape[2:]).mean((1, 3))
for i in range(8):
    for j in range(8):
        f = frame(i, j); w = (P[bins(f)] > 0.5).astype(np.float32); e = (f[..., 3] < 8).astype(np.float32); w[e > 0] = 0
        s = np.s_[j * 3072 // C:(j + 1) * 3072 // C, i * 5120 // C:(i + 1) * 5120 // C]
        Wt[s] = red(w); Em[s] = red(e); RGB[s] = red(f[..., :3].astype(np.float32)).astype(np.uint8)
    print('frames col', i, flush=True)
np.save(f'{D}/water64.npy', Wt.astype(np.float16)); np.save(f'{D}/empty64.npy', Em.astype(np.float16)); Image.fromarray(RGB).save(f'{D}/rgb64.png')
cr = {}
for cj in range(32):
    for ci in range(32):
        s = np.s_[cj * 48:(cj + 1) * 48, ci * 80:(ci + 1) * 80]; w, e = float(Wt[s].mean()), float(Em[s].mean())
        cr[f'{ci}:{cj}'] = dict(land=round(1 - w - e, 4), water=round(w, 4), empty=round(e, 4))
json.dump(cr, open(f'{D}/crops.json', 'w')); print('city water', round(float(Wt.mean()), 4), 'empty', round(float(Em.mean()), 4),
      'crops with land >= 0.5 %', sum(v['land'] >= 0.005 for v in cr.values()), 'pure water/empty', sum(v['land'] < 0.005 for v in cr.values()))
