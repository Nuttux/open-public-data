"""city/run/mos.py: read any L9 box of the render from the CROP REGISTRY without building a whole-SB mosaic (Mac RAM).
Registry = <ROOT>/crops/<i>_<j>.{jpg, class.png, mask.png, gid.png, part.png} (full 5120 x 3072 crops, rendered once, shared by SBs), or
any list of pieces (file base, L9 x, L9 y) e.g. the partial probe / block52 crops. Outside the pieces: edge-replicated at the city
border (x < 0, y < 0, x >= 163840, y >= 98304); a hole INSIDE the city raises (a missing crop is a bug, not a black patch).
  m = Mos(ROOT); a = m.read((x0, y0, x1, y1), 'jpg' | 'class.png' | 'mask.png' | 'gid.png' | 'part.png')  -> uint8 HxWx3 (part: HxW)"""
import os, glob, re, numpy as np
from collections import OrderedDict
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
CW, CH, CITY_W, CITY_H = 5120, 3072, 32 * 5120, 32 * 3072
class Mos:
    def __init__(self, root=None, pieces=None, cache=24, synth_sea=True):
        """root: <ROOT> with crops/<i>_<j>.*; pieces: [(base path without suffix, x, y, w, h)] (overrides / adds to the registry)"""
        self.P = []; self.root = root; self.cache = OrderedDict(); self.N = cache; self.synth = synth_sea
        if root:
            for f in glob.glob(f'{root}/crops/*_*.jpg'):
                m = re.match(r'(\d+)_(\d+)\.jpg$', os.path.basename(f))
                if m: i, j = int(m.group(1)), int(m.group(2)); self.P.append((f[:-4], i * CW, j * CH, CW, CH))
        for p in pieces or []: self.P.append(p)
    def _get(self, base, sfx):
        k = (base, sfx)
        if k in self.cache: self.cache.move_to_end(k); return self.cache[k]
        f = f'{base}.{sfx}'
        if not os.path.exists(f) and sfx != 'jpg' and self.synth and os.path.exists(f'{base}.sea'):   # sea crop: beauty only, passes synthesized
            h, w = np.asarray(self._get(base, 'jpg')).shape[:2]
            a = np.zeros((h, w) if sfx == 'part.png' else (h, w, 3), np.uint8)
            if sfx == 'class.png': a[..., 2] = 255          # class water (0, 0, 255)
            if sfx == 'mask.png': a[..., 2] = 255
        else:
            im = Image.open(f); a = np.asarray(im if sfx == 'part.png' else im.convert('RGB'))
            if sfx == 'part.png' and a.ndim == 3: a = a[..., 0]
        self.cache[k] = a
        while len(self.cache) > self.N: self.cache.popitem(last=False)
        return a
    def read(self, box, sfx='jpg'):
        x0, y0, x1, y1 = box; W, H = x1 - x0, y1 - y0; ch = () if sfx == 'part.png' else (3,)
        # edge replicate outside the city: read the clamped box, then pad
        cx0, cy0, cx1, cy1 = max(0, x0), max(0, y0), min(CITY_W, x1), min(CITY_H, y1)
        out = np.zeros((cy1 - cy0, cx1 - cx0) + ch, np.uint8); got = np.zeros((cy1 - cy0, cx1 - cx0), bool)
        for base, px, py, pw, ph in self.P:
            ax0, ay0, ax1, ay1 = max(cx0, px), max(cy0, py), min(cx1, px + pw), min(cy1, py + ph)
            if ax0 >= ax1 or ay0 >= ay1: continue
            a = self._get(base, sfx); out[ay0 - cy0:ay1 - cy0, ax0 - cx0:ax1 - cx0] = a[ay0 - py:ay1 - py, ax0 - px:ax1 - px]; got[ay0 - cy0:ay1 - cy0, ax0 - cx0:ax1 - cx0] = True
        if not got.all(): raise RuntimeError(f'Mos hole: {int((~got).sum())} px missing in {box} ({sfx})')
        if (cx0, cy0, cx1, cy1) != (x0, y0, x1, y1):
            pad = ((cy0 - y0, y1 - cy1), (cx0 - x0, x1 - cx1)) + (((0, 0),) if ch else ())
            out = np.pad(out, pad, mode='edge')
        return out
