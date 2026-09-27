"""build_pyr_tr.py <kstar dir> <tag>: the viewer layers of the consistent past keys (kstar_pilot.py): per year a
pyramid like build_pyr_hard.py (z8 tiles of 512 px cut from the canvas, every level below by 2x2 averaging of the level above),
drawn only on the tiles that differ from today's mosaic (fin3/now_m_*, = the base pyramid ckpt_pilot_today z8), and an eras json
for eras.html (?base=<tag>) and qa_audit.py (--eras). Canvas = L7 frames 4-6 x 2-3 (30720 x 12288 px, origin L8 device 40960,12288).
Writes eras2/transitions/pyr/era<Y>_<tag>/tiles (pyr = a symlink to the SD card) and eras2/transitions/viewer/eras_<tag>.json,
read by eras2/transitions/viewer/eras_tr.html (a copy of cloud/viewer/eras.html) and by qa_audit.py --eras."""
import sys, os, json, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
KD, TAG = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__)); PD = f'{HERE}/pyr'; VD = f'{HERE}/viewer'
C = '/Users/daniel/code/qipu-render-work/cloud'; FIN = '/Volumes/DANI-SD-DRIVE2/qipu-eras/fin3'
W, H, TX0, TY0 = 30720, 12288, 80, 24                      # canvas; its first z8 tile (40960 / 512, 12288 / 512)
NOW = np.zeros((H, W, 3), np.uint8)
for i in (4, 5, 6):
    for j in (2, 3):
        NOW[(j - 2) * 6144:(j - 1) * 6144, (i - 4) * 10240:(i - 3) * 10240] = np.asarray(Image.open(f'{FIN}/now_m_{i}_{j}.png').convert('RGB'))
out = dict(base=dict(year='today', tiles='../../../cloud/ckpt_pilot_today/tiles', name='pilot_today (look agent, L9 AI)', maxz=9), years=[])
for y in ('1938', '1959', '1985', '2006'):
    K = np.load(f'{KD}/K_{y}.npy', mmap_mode='r'); T = f'{PD}/era{y}_{TAG}/tiles'; ch = {8: set()}
    lev = {}
    for ty in range(H // 512):
        for tx in range(W // 512):
            a = np.asarray(K[ty * 512:(ty + 1) * 512, tx * 512:(tx + 1) * 512])
            if not a.any(): continue
            gx, gy = TX0 + tx, TY0 + ty
            if (a != NOW[ty * 512:(ty + 1) * 512, tx * 512:(tx + 1) * 512]).any(): ch[8].add((gx, gy))
            os.makedirs(f'{T}/8/{gx}', exist_ok=True); Image.fromarray(a).save(f'{T}/8/{gx}/{gy}.webp', quality=88)
            lev[(gx, gy)] = a
    # lower levels: 2x2 average of the level above (today's pixels where a child is today's)
    for z in range(7, -1, -1):
        nxt = {}; ch[z] = set()
        for (gx, gy) in {(x // 2, y_ // 2) for (x, y_) in lev}:
            q = np.zeros((1024, 1024, 3), np.float32); ok = False
            for dx in (0, 1):
                for dy in (0, 1):
                    c = lev.get((2 * gx + dx, 2 * gy + dy))
                    if c is not None: ok = True
                    else:                    # outside the pilot canvas: today's own tile of that level (no black borders)
                        bp = f'{C}/ckpt_pilot_today/tiles/{z + 1}/{2 * gx + dx}/{2 * gy + dy}.webp'
                        if os.path.exists(bp): c = np.asarray(Image.open(bp).convert('RGB'))
                    if c is not None: q[dy * 512:(dy + 1) * 512, dx * 512:(dx + 1) * 512] = c
                    if (2 * gx + dx, 2 * gy + dy) in ch[z + 1]: ch[z].add((gx, gy))
            if not ok: continue
            t = (q.reshape(512, 2, 512, 2, 3).mean((1, 3)) + 0.5).astype(np.uint8); nxt[(gx, gy)] = t
            os.makedirs(f'{T}/{z}/{gx}', exist_ok=True); Image.fromarray(t).save(f'{T}/{z}/{gx}/{gy}.webp', quality=88)
        lev = nxt
    # the slider's order tiles (z8, lossless): the moment each pixel of this year switches to the next year's (GRAMMAR §7)
    om = f'{KD}/O_{y}.npy'; nord = 0; otiles = []
    if os.path.exists(om):
        O = np.load(om, mmap_mode='r'); OT = f'{PD}/order{y}_{TAG}'
        for ty in range(H // 512):
            for tx in range(W // 512):
                o = np.asarray(O[ty * 512:(ty + 1) * 512, tx * 512:(tx + 1) * 512])
                if (o < 255).any() and K[ty * 512:(ty + 1) * 512, tx * 512:(tx + 1) * 512].any():
                    gx, gy = TX0 + tx, TY0 + ty; os.makedirs(f'{OT}/{gx}', exist_ok=True); Image.fromarray(o).save(f'{OT}/{gx}/{gy}.png'); nord += 1; otiles.append([gx, gy])
    print(y, 'order tiles', nord, flush=True)
    out['years'].append(dict(year=float(y), tiles=f'../pyr/era{y}_{TAG}/tiles', order=f'../pyr/order{y}_{TAG}', order_tiles=otiles, maxz=8, changed={str(z): sorted([list(t) for t in s]) for z, s in ch.items()}))
    print(y, 'changed z8 tiles', len(ch[8]), flush=True)
out['years'].sort(key=lambda e: e['year'])
json.dump(out, open(f'{VD}/eras_{TAG}.json', 'w')); print('eras json', f'{VD}/eras_{TAG}.json')
