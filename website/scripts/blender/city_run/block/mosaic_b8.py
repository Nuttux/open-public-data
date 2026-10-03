"""mosaic_b8.py <render_dir> <out_blk_dir> <beauty_prefix> <passes_prefix> <x0,y0,x1,y1 extent (global L9)> <pad> <frames i:j:x0,x1,y0,y1 ...|@jobfile>
Frame (i,j) BORDER x0,x1,y0,y1 (y bottom-up) -> global (i*5120 + x0*5120, j*3072 + (1-y1)*3072). Files <render_dir>/<prefix>_<i>_<j>_z9_<i>_<j>.jpg
(beauty) and <passes_prefix>_<i>_<j>_z9_<i>_<j>.{class,mask,gid,part}.png. The extent is REFLECT-padded by <pad> px on every side
(gid / part 0 there); with real margin frames on a side, only the uncovered sides are reflected. meta.json {ox, oy, block, pad}. Row-banded writes are not needed at B8 size (5 uint8 planes ~ 12 GB peak)."""
import sys, os, json, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
RD, OD, BP, PP = sys.argv[1:5]; X0, Y0, X1, Y1 = map(int, sys.argv[5].split(',')); PAD = int(sys.argv[6]); os.makedirs(OD, exist_ok=True)
fr = sys.argv[7:]
if fr and fr[0].startswith('@'): fr = [f"{l.split()[1]}:{l.split()[2]}" for l in open(fr[0][1:]) if l.strip() and l.split()[0].startswith(BP)]
W_, H_ = X1 - X0 + 2 * PAD, Y1 - Y0 + 2 * PAD; OX, OY = X0 - PAD, Y0 - PAD
kinds = dict(R=('.jpg', 3, BP), class_=('.class.png', 3, PP), mask=('.mask.png', 3, PP), gid=('.gid.png', 3, PP), part=('.part.png', 1, PP))
for k, (sfx, c, pre) in kinds.items():
    out = np.zeros((H_, W_, c), np.uint8); got = np.zeros((H_, W_), bool)
    for f in fr:
        i, j, bd = f.split(':'); i, j = int(i), int(j); bx0, bx1, by0, by1 = map(float, bd.split(','))
        gx, gy = round(i * 5120 + bx0 * 5120), round(j * 3072 + (1 - by1) * 3072)
        a = np.asarray(Image.open(f'{RD}/{pre}_{i}_{j}_z9_{i}_{j}{sfx}')); a = a[..., None] if a.ndim == 2 else a[..., :c]
        px, py = gx - OX, gy - OY; h, w = a.shape[:2]; sx0, sy0 = max(0, -px), max(0, -py); ex, ey = min(w, W_ - px), min(h, H_ - py)
        if ex > sx0 and ey > sy0: out[py + sy0:py + ey, px + sx0:px + ex] = a[sy0:ey, sx0:ex]; got[py + sy0:py + ey, px + sx0:px + ex] = True
    inner = got[PAD:PAD + Y1 - Y0, PAD:PAD + X1 - X0]; assert inner.all(), f'{k}: holes {(~inner).sum()}'
    if k in ('R', 'class_', 'mask') and not got.all():
        # (30/09) reflect-fill only the UNCOVERED sides (B8: real margin crops left / right / bottom, nothing above Q -> the top alone)
        rows = np.nonzero(got.all(1))[0]; cols = np.nonzero(got[rows[0]:rows[-1] + 1].all(0))[0]; r0, r1, c0, c1 = rows[0], rows[-1] + 1, cols[0], cols[-1] + 1
        core = out[r0:r1, c0:c1]; out = np.pad(core, ((r0, H_ - r1), (c0, W_ - c1), (0, 0)), mode='reflect')
    n = dict(R='R.jpg', class_='R.class.png', mask='R.mask.png', gid='R.gid.png', part='R.part.png')[k]
    (Image.fromarray(out[..., 0]) if c == 1 else Image.fromarray(out)).save(f'{OD}/{n}', **({'quality': 96} if k == 'R' else {})); print(k, out.shape, flush=True); del out
json.dump(dict(ox=OX, oy=OY, block=[X0, Y0, X1, Y1], pad=PAD), open(f'{OD}/meta.json', 'w')); print('MOSAIC_DONE', OD)
