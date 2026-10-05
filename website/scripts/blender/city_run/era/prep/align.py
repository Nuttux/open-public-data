# align.py (qhprep): a key year's prisms vs its render's building classes (IoU, best small shift)      usage: python3 align.py <Y>...
import sys, os, pickle, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import common as CM
from raster2 import id_map_z
for Y in sys.argv[1:]:
    P = pickle.load(open(CM.YD + f'{Y}/prisms.pkl', 'rb'))['prisms']; M, Z = id_map_z(P, CM.O, CM.W, CM.H); c = np.load(CM.YD + f'{Y}/Cc.npy')
    b = np.isin(c, (2, 4, 6)); p = M >= 0; best = []
    for dy in (-4, -2, 0, 2, 4):
        for dx in (-4, -2, 0, 2, 4):
            pp = np.roll(np.roll(p[::2, ::2], dy // 2, 0), dx // 2, 1); bb = b[::2, ::2]; best.append((round(float((pp & bb).sum() / (pp | bb).sum()), 3), dx, dy))
    # coverage per 1024 px tile: where the render has buildings and no prisms (or the reverse)
    H_, W_ = p.shape; bad = []
    for ty in range(0, H_, 1024):
        for tx in range(0, W_, 1024):
            pt, bt = p[ty:ty + 1024, tx:tx + 1024].mean(), b[ty:ty + 1024, tx:tx + 1024].mean()
            if abs(pt - bt) > 0.15: bad.append((tx, ty, round(float(pt), 2), round(float(bt), 2)))
    print(Y, 'prism px %.3f bldg-class px %.3f IoU %.3f | best shift' % (p.mean(), b.mean(), (p & b).sum() / (p | b).sum()), max(best), '| tiles |prism-bldg| > 0.15 (x, y, prism, bldg):', bad)
