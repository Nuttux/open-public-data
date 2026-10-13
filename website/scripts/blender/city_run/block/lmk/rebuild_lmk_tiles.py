#!/usr/bin/env python3
"""rebuild_lmk_tiles.py: re-apply the saved landmark patches (lmk/patches/<name>/{patch.png, alpha.png, canvas.json}) onto the LATEST block tiles and write
ONLY the touched z9 tiles to cloud/ckpt_van_ct_lmk/tiles/9/<x>/<y>.webp (merge_city_today.py lists van_ct_lmk FIRST, so those tiles win; every other tile keeps
falling through to the blocks, so a newer block repaint is never hidden). The base of a touched tile = the first block checkpoint of merge_city_today's SRC
order (NOT van_ct_lmk itself) that has it. RERUN after any block merge, then rerun merge_city_today.py.   python3 rebuild_lmk_tiles.py [--dry]"""
import os, sys, json, shutil
import numpy as np
from PIL import Image
W = '/Users/daniel/code/qipu-render-work'; H = os.environ.get('LMK_HOME', '/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/lmk')   # patches / jobs / out live on the SSD, not in git; PD = f'{H}/patches'
QF = '/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/city_today/qa_fail.txt'
def block_src():   # same list, same order as merge_city_today.SRC, minus van_ct_lmk
    ex = os.environ.get('EXCLUDE', '').split(',') + ['van_ct_' + l.strip() for l in (open(QF) if os.path.exists(QF) else []) if l.strip()]
    s = [x for x in ['van_ct_' + b for b in 'dt kits fv evn evm ws sc evs sw sp2 sp1 ps'.split()] if os.path.isdir(f'{W}/cloud/ckpt_{x}/tiles/9') and x not in ex]
    return s + [x for x in ['van_surround'] if os.path.isdir(f'{W}/cloud/ckpt_{x}/tiles/9')]
def main(dry=False):
    SRC = block_src(); names = sorted(d for d in os.listdir(PD) if os.path.exists(f'{PD}/{d}/patch.png') and not os.path.exists(f'{PD}/{d}/DISABLED'))
    cache = {}; n_missing = 0
    def base(tx, ty):
        if (tx, ty) in cache: return cache[(tx, ty)]
        for s in SRC:
            p = f'{W}/cloud/ckpt_{s}/tiles/9/{tx}/{ty}.webp'
            if os.path.exists(p): cache[(tx, ty)] = np.asarray(Image.open(p).convert('RGB')).astype(np.float32).copy(); return cache[(tx, ty)]
        cache[(tx, ty)] = None; return None
    for nm in names:
        cx0, cy0, cx1, cy1 = json.load(open(f'{PD}/{nm}/canvas.json'))['canvas']
        P = np.asarray(Image.open(f'{PD}/{nm}/patch.png').convert('RGB')).astype(np.float32); A = np.asarray(Image.open(f'{PD}/{nm}/alpha.png')).astype(np.float32)[..., None] / 255.
        ys, xs = np.nonzero(A[..., 0] > 0.004)
        if not len(ys): continue
        for ty in range((cy0 + ys.min()) // 512, (cy0 + ys.max()) // 512 + 1):
            for tx in range((cx0 + xs.min()) // 512, (cx0 + xs.max()) // 512 + 1):
                T = base(tx, ty)
                if T is None: n_missing += 1; continue
                x0, y0 = max(tx * 512, cx0), max(ty * 512, cy0); x1, y1 = min(tx * 512 + 512, cx1), min(ty * 512 + 512, cy1)
                if x1 <= x0 or y1 <= y0: continue
                a = A[y0 - cy0:y1 - cy0, x0 - cx0:x1 - cx0]; p = P[y0 - cy0:y1 - cy0, x0 - cx0:x1 - cx0]
                if a.max() <= 0.004: continue
                t = T[y0 - ty * 512:y1 - ty * 512, x0 - tx * 512:x1 - tx * 512]; T[y0 - ty * 512:y1 - ty * 512, x0 - tx * 512:x1 - tx * 512] = t * (1 - a) + p * a
                cache[(tx, ty)] = T; cache.setdefault('touched', set()).add((tx, ty))
    touched = sorted(cache.pop('touched', set())); print('patches', names, 'tiles', len(touched), 'no base tile', n_missing)
    if dry: return
    D = f'{W}/cloud/ckpt_van_ct_lmk/tiles'; NEW = D + '.new'
    if os.path.exists(NEW): shutil.rmtree(NEW)
    for tx, ty in touched:
        os.makedirs(f'{NEW}/9/{tx}', exist_ok=True); Image.fromarray(cache[(tx, ty)].clip(0, 255).astype(np.uint8)).save(f'{NEW}/9/{tx}/{ty}.webp', quality=90)
    if os.path.exists(D): shutil.rmtree(D + '.old', ignore_errors=True); os.rename(D, D + '.old')
    os.makedirs(os.path.dirname(D), exist_ok=True); os.rename(NEW, D); shutil.rmtree(D + '.old', ignore_errors=True); print('WROTE', D, len(touched))
if __name__ == '__main__': main('--dry' in sys.argv)
