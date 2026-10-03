"""ON THE POD (block52_v7): for every b7_*_z9_*.png frame in /root/q/out/lmk: JPEG q96 + mask/class copies + .guide.exr decoded to
<f>.gid.png (24-bit building id RGB) and <f>.part.png (uint8: 1 facade |nz|<0.35, 2 roof nz>0.6, else 0), into /root/q/out/b7/.
Same decode as faithful/v4/bid_correct.ids (the gid bytes were written as a face colour stored c**2.2: undo). pip install OpenEXR first.
python3 pod_post.py [src_dir] [out_dir]"""
import sys, os, glob, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
S = sys.argv[1] if len(sys.argv) > 1 else '/root/q/out/lmk'; O = sys.argv[2] if len(sys.argv) > 2 else '/root/q/out/b7'; os.makedirs(O, exist_ok=True)
def exr(path):
    import OpenEXR
    f = OpenEXR.File(path); ch = {}
    for p in f.parts:
        for k, v in p.channels.items(): ch[k] = v.pixels
    return ch
PG = (sys.argv[3] if len(sys.argv) > 3 else 'b7_*') + '_z9_*_*'
BASES = sorted({p[:-4] for p in glob.glob(f'{S}/{PG}.png') if p.count('.') == 1} | {p[:-10] for p in glob.glob(f'{S}/{PG}.guide.exr')})
for b in BASES:
    png = b + '.png'
    if png.endswith(('.mask.png', '.class.png', '.gid.png', '.part.png')): continue
    b = png[:-4]; n = os.path.basename(b)
    if os.path.exists(f'{O}/{n}.part.png') or os.path.exists(f'{O}/{n}.jpg') and not os.path.exists(b + '.guide.exr'): continue
    im = None
    if os.path.exists(png): im = Image.open(png).convert('RGB'); im.save(f'{O}/{n}.jpg', quality=96)
    for s in ('.mask.png', '.class.png'):
        if os.path.exists(b + s): Image.open(b + s).convert('RGB').save(f'{O}/{n}{s}')
    if not os.path.exists(b + '.guide.exr'): print(n, 'beauty', flush=True); continue
    ch = exr(b + '.guide.exr'); ks = list(ch); pick = lambda sfx: next(ch[k] for k in ks if k.endswith(sfx))
    try: r, g, bb = pick('Combined.R'), pick('Combined.G'), pick('Combined.B')
    except StopIteration: rgb = next(ch[k] for k in ks if k.endswith('Combined')); r, g, bb = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    by = lambda v: np.rint(255 * np.clip(v, 0, 1) ** (1 / 2.2)).astype(np.int64)
    gid = (by(r) << 16) | (by(g) << 8) | by(bb); gid = np.where(((r <= 1.001) & (g <= 1.001) & (bb <= 1.001)), gid, 0)
    try: nz = pick('Normal.Z')
    except StopIteration: nz = next(ch[k] for k in ks if k.endswith('Normal'))[..., 2]
    part = np.where(np.abs(nz) < 0.35, 1, np.where(nz > 0.6, 2, 0)).astype(np.uint8)
    Image.fromarray(np.stack([(gid >> 16) & 255, (gid >> 8) & 255, gid & 255], -1).astype(np.uint8)).save(f'{O}/{n}.gid.png')
    Image.fromarray(part).save(f'{O}/{n}.part.png')
    print(n, gid.shape, 'gids', len(np.unique(gid)) - 1, flush=True)
print('POD_POST_DONE')
