import numpy as np, json
from scipy import ndimage as nd
d = np.load('/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/lmk/wh/q4.npz'); P, R, C = d['P'].astype(np.float32), d['R'].astype(np.float32), d['C']
roof = (C[..., 1] > 200) & (C[..., 0] < 80) & (C[..., 2] < 80)
roof = nd.binary_opening(roof, iterations=1)
lab, n = nd.label(roof); print('roof comps', n)
sl = nd.find_objects(lab); Lr = R.mean(2); Lp = P.mean(2); out = []
for i, o in enumerate(sl, 1):
    m = lab[o] == i; a = int(m.sum())
    if a < 6000: continue   # >= 6000 px at 1/4 = 96k L9 px^2... (~ 960 m2 at 10px/m)
    me = nd.binary_erosion(m, iterations=3)
    if me.sum() < 3000: continue
    lr = Lr[o][me]; lp = Lp[o][me]; pr = P[o][me].mean(0); rr = R[o][me].mean(0)
    # flatness of render roof: std after removing the low-frequency; pitched roofs show two halves with different shade
    out.append(dict(i=i, y0=o[0].start * 4 + 55296, x0=o[1].start * 4 + 76800, y1=o[0].stop * 4 + 55296, x1=o[1].stop * 4 + 76800, area=a * 16, Lr=float(lr.mean()), sr=float(lr.std()), Lp=float(lp.mean()), sp=float(lp.std()), fill=float(a / m.size)))
print(len(out)); json.dump(out, open('/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/lmk/wh/comps.json', 'w'))
import collections
big = [c for c in out if c['area'] > 500000]
print(len(big))
for c in sorted(big, key=lambda c: -c['area'])[:40]: print({k: (round(v, 1) if isinstance(v, float) else v) for k, v in c.items()})
