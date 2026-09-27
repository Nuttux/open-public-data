"""ek_blend.py <ek2 dir> [years...]: the era keys v2 mosaics from the pulled tiles (<ek2>/tiles/out/<Y>/t_<gx>_<gy>.jpg, 1024 px at
global L8 gx, gy, stride 512): per year and L7 frame (i7 4-6, j7 2-3), a weighted average with the FIX v2 weights (the raised
cosine to the power 4: every pixel is dominated by ONE generation, so two tiles that drew a facade differently never average into a
translucent ghost). Pixels no tile covers keep the old key (fin3; the transitions only read the year's pixels where the year changed,
which the tiles cover). Writes <ek2>/<Y>/m_<i7>_<j7>.jpg (q96) (+ cov_<i7>_<j7>.png: 255 where the AI covers)."""
import sys, os, glob, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
E = sys.argv[1]; YEARS = sys.argv[2:] or ['1938', '1959', '1985', '2006']; FIN = '/Volumes/DANI-SD-DRIVE2/qipu-eras/fin3'
T = 1024; win = np.sin(np.pi * (np.arange(T) + 0.5) / T) ** 2; W2 = (np.outer(win, win) ** 4 + 1e-6).astype(np.float32)
for y in YEARS:
    tiles = {}
    for p in glob.glob(f'{E}/tiles/out/{y}/t_*.jpg'):
        gx, gy = map(int, os.path.basename(p)[2:-4].split('_')); tiles[(gx, gy)] = p
    os.makedirs(f'{E}/{y}', exist_ok=True)
    for i7 in (4, 5, 6):
        for j7 in (2, 3):
            fx0, fy0 = i7 * 10240, j7 * 6144
            acc = np.zeros((6144, 10240, 3), np.float32); ws = np.zeros((6144, 10240), np.float32); n = 0
            for (gx, gy), p in tiles.items():
                if gx + T <= fx0 or gx >= fx0 + 10240 or gy + T <= fy0 or gy >= fy0 + 6144: continue
                a = np.asarray(Image.open(p).convert('RGB'), np.float32)
                x0, y0, x1, y1 = max(gx, fx0), max(gy, fy0), min(gx + T, fx0 + 10240), min(gy + T, fy0 + 6144)
                w = W2[y0 - gy:y1 - gy, x0 - gx:x1 - gx]
                acc[y0 - fy0:y1 - fy0, x0 - fx0:x1 - fx0] += a[y0 - gy:y1 - gy, x0 - gx:x1 - gx] * w[..., None]
                ws[y0 - fy0:y1 - fy0, x0 - fx0:x1 - fx0] += w; n += 1
            if n == 0: continue
            old = np.asarray(Image.open(f'{FIN}/{y}/m_{i7}_{j7}.png').convert('RGB'), np.float32)
            cov = ws > 1e-4
            out = np.where(cov[..., None], acc / np.maximum(ws, 1e-12)[..., None], old)
            Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8)).save(f'{E}/{y}/m_{i7}_{j7}.jpg', quality=96)   # (disk: ~25 MB, not ~150)
            Image.fromarray((cov * 255).astype(np.uint8)).save(f'{E}/{y}/cov_{i7}_{j7}.png')
            print(y, i7, j7, 'tiles', n, 'covered %.3f' % cov.mean(), flush=True)
