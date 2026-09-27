"""ek_prep.py <out dir>: the ERA KEYS v2 job (ek2; the root fix of the stitching between eras, AUDIT.md §6).

Why: the pilot's past keys (compose_hard, fin3) are a patchwork: the year's AI only on the tiles an early L7 plan chose (render
fallback on 58-68 % of the 1985 / 2006 changes in block 5:2, with straight seams at the AI coverage edges), today's pixels copied
wherever the gid mask missed a change (landmarks and structures have gid 0), and the year's AI made with a reference image (the
year's own L7 look pass: flatter, and less faithful to the render's geometry, FORENSICS). ek2 = one coherent generation of the
year from the year's own render, over EVERY tile that the transitions use, with the look agent's FIX recipe (render tile only, no
reference, reworded clauses, CPU noise). The transitions chain then takes the year's pixels only where the year differs.

Writes to <out dir>/up: r_<Y>_<i7>_<j7>.jpg (the year's L8 render of L7 frame i7:j7, JPEG q95), c_<Y>_<i7>_<j7>.png (its class
pass), and jobs/00_test.txt, jobs/10_rest.txt: lines "<Y> <gx> <gy> <dry|wet> <seed>" (gx, gy = global L8 px of the 1024 tile's
top-left, a multiple of 512: the world grid). Tiles: those meeting the year's changed pixels (the K* order maps O_<Y> < 255,
dilated 192 px), minus tiles > 95 % water. Seed = sha1('era8:gx,gy') (the same place gets the same noise in every year)."""
import sys, os, glob, hashlib, json, numpy as np
from PIL import Image
from scipy import ndimage as nd
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import stage as S
Image.MAX_IMAGE_PIXELS = None
OUT = sys.argv[1]; UP = f'{OUT}/up'; os.makedirs(f'{UP}/jobs', exist_ok=True)
KS = '/Volumes/DANI-SD-DRIVE2/transitions/kstar'; YEARS = ['1985', '2006', '1959', '1938']
GX0, GY0 = 40960, 12288                    # the pilot canvas (L7 frames 4-6 x 2-3) in global L8 px; stage canvas x = gx - 51200
TEST = (57760, 15788, 62440, 19288)        # the Embarcadero window (global L8 px): the test set, first
jobs_test, jobs_rest = [], []
def frame_files(a):
    y, i7, j7 = a; win = (i7 * 10240 - 51200, j7 * 6144 - 12288, (i7 + 1) * 10240 - 51200, (j7 + 1) * 6144 - 12288)
    rp, cp = f'{UP}/r_{y}_{i7}_{j7}.jpg', f'{UP}/c_{y}_{i7}_{j7}.png'
    if not os.path.exists(rp): Image.fromarray(S.load_pass(y, 'beauty', win)).save(rp + '.part', 'JPEG', quality=95); os.replace(rp + '.part', rp)
    if not os.path.exists(cp): Image.fromarray(S.load_pass(y, 'class', win)).save(cp + '.part', 'PNG', compress_level=1); os.replace(cp + '.part', cp)
    return a
import multiprocessing as mp
with mp.get_context('fork').Pool(6) as pool:
    for a in pool.imap_unordered(frame_files, [(y, i, j) for y in YEARS for i in (4, 5, 6) for j in (2, 3)]): print('frame', a, flush=True)
for y in YEARS:
    O = np.load(f'{KS}/O_{y}.npy', mmap_mode='r'); H, W = O.shape; c = 64
    cells = np.zeros((H // c, W // c), bool)
    for r in range(H // c):
        cells[r] = (np.asarray(O[r * c:(r + 1) * c]).reshape(c, W // c, c) < 255).any((0, 2))
    cells = nd.binary_dilation(cells, iterations=3)
    # water share per 64-px cell from the year's class pass
    wat = np.zeros((H // c, W // c), np.float32)
    for i7 in (4, 5, 6):
        for j7 in (2, 3):
            cl = S.classes(np.asarray(Image.open(f'{UP}/c_{y}_{i7}_{j7}.png').convert('RGB'))) == S.WATER
            ox, oy = (i7 - 4) * 10240 // c, (j7 - 2) * 6144 // c
            wat[oy:oy + 6144 // c, ox:ox + 10240 // c] = cl.reshape(6144 // c, c, 10240 // c, c).mean((1, 3))
    n = 0
    for ty in range(0, (H - 1024) // 512 + 1):
        for tx in range(0, (W - 1024) // 512 + 1):
            cc = (slice(ty * 8, ty * 8 + 16), slice(tx * 8, tx * 8 + 16))
            if not cells[cc].any(): continue
            ws = float(wat[cc].mean())
            if ws > 0.95: continue
            gx, gy = GX0 + tx * 512, GY0 + ty * 512
            seed = int(hashlib.sha1(f'era8:{gx},{gy}'.encode()).hexdigest()[:8], 16)
            line = f"{y} {gx} {gy} {'dry' if ws < 0.002 else 'wet'} {seed}"
            (jobs_test if (TEST[0] - 1024 < gx < TEST[2] and TEST[1] - 1024 < gy < TEST[3] and y in ('1985', '2006')) else jobs_rest).append(line); n += 1
    print(y, 'tiles', n, flush=True)
open(f'{UP}/jobs/00_test.txt', 'w').write('\n'.join(jobs_test) + '\n'); open(f'{UP}/jobs/10_rest.txt', 'w').write('\n'.join(jobs_rest) + '\n')
json.dump(dict(gx0=GX0, gy0=GY0, frames=[[i, j] for i in (4, 5, 6) for j in (2, 3)], years=YEARS), open(f'{UP}/canvas.json', 'w'))
print('test jobs', len(jobs_test), 'rest', len(jobs_rest))
