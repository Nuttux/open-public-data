"""kinds_audit.py: film2_v3's order-map grammar on the pilot keys, measured: per step, the changed components by kind
(rise / sink / line / shore / grow / fade) with their pixel areas, and a kind map (box px / 8) for the audit sheet."""
import json, numpy as np, os
from PIL import Image
from scipy import ndimage as nd
Image.MAX_IMAGE_PIXELS = None
D = '/Users/daniel/code/qipu-render-work/eras2/pilot/sw/pilot'; OUT = '/Volumes/DANI-SD-DRIVE2/transitions/audit'
L = lambda p: np.asarray(Image.open(p).convert('RGB'))
def ids(p): a = L(p).astype(np.int64); return (a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]
def cls(p):
    a = L(p); c = a > 127; r, g, b = c[..., 0], c[..., 1], c[..., 2]
    k = np.zeros(c.shape[:2], np.uint8)
    k[r & g & ~b] = 1; k[~r & g & ~b] = 1; k[r & ~g & b] = 2; k[~r & g & b] = 3; k[~r & ~g & b] = 4; k[r & ~g & ~b] = 5; k[r & g & b] = 6
    ai = a.astype(np.int16); k[(ai[..., 0] > 200) & (ai[..., 1] > 90) & (ai[..., 1] < 170) & (ai[..., 2] < 60)] = 7
    return k
YS = [1938, 1959, 1985, 2006, 2026]
def key(y):
    m = f'{D}/mask_{y:.3f}.png'
    return dict(img=L(f'{D}/img_{y:.3f}.png').astype(np.int16), gid=ids(f'{D}/gid_{y:.3f}.png'), cls=cls(f'{D}/class_{y:.3f}.png'),
                mask=(np.asarray(Image.open(m).convert('L')) > 127) if os.path.exists(m) else None)
def colh(g):
    h = np.zeros(g.shape, np.float32); m = g > 0
    if not m.any(): return h
    rr, cc = np.nonzero(m); k = g[m].astype(np.int64) * g.shape[1] + cc
    uk, inv = np.unique(k, return_inverse=True); base = np.full(len(uk), -1, np.int64); np.maximum.at(base, inv, rr)
    h[rr, cc] = (base[inv] - rr).astype(np.float32); return h
solid = lambda k: (k['cls'] == 1) | (k['cls'] == 5)
res = {}; KC = dict(rise=(230, 60, 40), sink=(40, 90, 230), line=(240, 200, 30), shore=(30, 200, 220), grow=(40, 180, 60), fade=(255, 0, 255))
a = key(YS[0])
for y1 in YS[1:]:
    b = key(y1); H, W = b['gid'].shape
    d = np.abs(a['img'] - b['img']).max(-1) > 10
    if a['mask'] is not None: d &= nd.binary_dilation(a['mask'], iterations=6)
    d = nd.binary_closing(nd.binary_opening(d, iterations=1), iterations=3)
    lab, n = nd.label(d); ga = np.where(solid(a), a['gid'] + 1, 0); gb = np.where(solid(b), b['gid'] + 1, 0); ha, hb = colh(ga), colh(gb)
    K = np.zeros((H, W), np.uint8); st = {}
    names = list(KC)
    for c, sl in enumerate(nd.find_objects(lab)):
        m = lab[sl] == c + 1; A_, B_ = a['cls'][sl][m], b['cls'][sl][m]; n_ = m.sum()
        sa, sb = solid(a)[sl][m], solid(b)[sl][m]
        gain, loss = (sb & ~sa).mean() + (sb & sa & (hb[sl][m] > ha[sl][m] + 2)).mean(), (sa & ~sb).mean()
        st_new, st_gone = ((B_ == 2) & (A_ != 2)).mean(), ((A_ == 2) & (B_ != 2)).mean()
        wat = ((A_ == 4) != (B_ == 4)).mean(); tree = ((A_ == 3) | (B_ == 3)).mean()
        k = ('rise' if gain > 0.25 and gain >= loss else 'sink' if loss > 0.25 else 'line' if max(st_new, st_gone) > 0.3 and n_ > 300
             else 'shore' if wat > 0.3 else 'grow' if tree > 0.4 else 'fade')
        s_ = st.setdefault(k, [0, 0]); s_[0] += 1; s_[1] += int(n_)
        K[sl][m] = names.index(k) + 1
    tot = int(d.sum()); res[f'{a["img"].shape and YS[YS.index(y1)-1]}-{y1}'] = dict(changed_share=round(tot / d.size, 4), kinds={k: dict(n=v[0], px=v[1], share=round(v[1] / max(tot, 1), 3)) for k, v in st.items()})
    rgb = np.zeros((H // 8, W // 8, 3), np.uint8) + 30
    Ks = K[::8, ::8]
    for i, k in enumerate(names): rgb[Ks == i + 1] = KC[k]
    Image.fromarray(rgb).save(f'{OUT}/kinds_{YS[YS.index(y1)-1]}_{y1}.png')
    print(YS[YS.index(y1)-1], y1, json.dumps(res[list(res)[-1]]), flush=True)
    a = b
json.dump(res, open(f'{OUT}/kinds_audit.json', 'w'), indent=1)
