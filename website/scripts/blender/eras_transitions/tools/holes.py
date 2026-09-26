"""holes.py: per step of the pilot keys (box res), the areas of born / died building sprites and of the 'unknown plate'
U = pixels where A shows a dying solid AND B shows a born solid (neither key shows what is behind)."""
import numpy as np, json
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
D = '/Users/daniel/code/qipu-render-work/eras2/pilot/sw/pilot'
def ids(p): a = np.asarray(Image.open(p).convert('RGB')).astype(np.int64); return (a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]
def cls(p):
    a = np.asarray(Image.open(p).convert('RGB')) > 127; r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return ((g & ~b) | (r & g & ~b)) | (r & ~g & ~b)      # building (roof/facade) or landmark
YS = [1938, 1959, 1985, 2006, 2026]
prev = None
for y in YS:
    g = ids(f'{D}/gid_{y:.3f}.png'); s = cls(f'{D}/class_{y:.3f}.png'); g = np.where(s, g, 0)
    if prev is not None:
        ga, gb = prev[1], g
        ua, ca = np.unique(ga[ga > 0], return_counts=True); ub, cb = np.unique(gb[gb > 0], return_counts=True)
        A = dict(zip(ua.tolist(), ca.tolist())); B = dict(zip(ub.tolist(), cb.tolist()))
        died = {k for k, v in A.items() if B.get(k, 0) < 0.2 * v}; born = {k for k, v in B.items() if A.get(k, 0) < 0.2 * v}
        mD = np.isin(ga, list(died)); mB = np.isin(gb, list(born)); U = mD & mB
        tot = ga.size
        print(f'{YS[YS.index(y)-1]}->{y}: died {len(died)} ({mD.sum()/tot:.3%} of frame), born {len(born)} ({mB.sum()/tot:.3%}), '
              f'unknown plate U {U.sum()/tot:.3%} = {U.sum()/max(mB.sum(),1):.1%} of born px; born px over static-in-A {((gb>0)&mB&(ga>0)&~mD).sum()/max(mB.sum(),1):.1%}, over ground-in-A {(mB&(ga==0)).sum()/max(mB.sum(),1):.1%}', flush=True)
        big = sorted(born, key=lambda k: -B[k])[:5]; print('   biggest born', [(k, B[k]) for k in big])
    prev = (None, g)
