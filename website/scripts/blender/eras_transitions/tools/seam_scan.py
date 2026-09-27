"""seam_scan.py <year> [out.json]: straight tone seams inside a year's key mosaics (fin3 m_<i>_<j>, L7 frames 4-6 x 2-3): columns
(and rows) where the key has a long run of tone steps across the line that its own Blender render does not have (the AI's tile
or mask boundaries, compose_hard's hard masks). Writes [{axis: 'x'|'y', pos: canvas px, lo, hi (extent along the line)}]."""
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as nd
sys.path.insert(0, '/Users/daniel/code/qipu-render-work/eras2/transitions')
import stage as S
Image.MAX_IMAGE_PIXELS = None
y = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else f'/Volumes/DANI-SD-DRIVE2/transitions/seams_{y}.json'
res = []
for i in (4, 5, 6):
    for j in (2, 3):
        ox, oy = (i - 5) * 10240, (j - 2) * 6144; win = (ox, oy, ox + 10240, oy + 6144)
        K = S.load_key(y, win).astype(np.float32).mean(-1); R = S.load_pass(y, 'beauty', win).astype(np.float32).mean(-1)
        for axis in ('x', 'y'):
            k = K if axis == 'x' else K.T; r = R if axis == 'x' else R.T
            # the step across each line between px p-1|p: medians of 3 px on each side, per row
            def step(a):
                L = (a[:, :-4] + a[:, 1:-3] + a[:, 2:-2]) / 3.0; Rr = (a[:, 3:-1] + a[:, 4:] + a[:, 2:-2] * 0) / 2.0
                return np.abs(Rr[:, :] - L[:, :])
            sk = np.abs(k[:, 3:] - k[:, :-3]); sr = np.abs(r[:, 3:] - r[:, :-3])
            # a seam: a step where the render is flat, AND flat on both sides along the line (not a crossing edge)
            cand = (sk > 10) & (sr < 4)
            # count per line the longest run (gaps of <= 6 px allowed)
            for p in range(cand.shape[1]):
                col = nd.binary_closing(cand[:, p], iterations=3)
                lab, n = nd.label(col)
                if n == 0: continue
                ln = nd.sum(col, lab, range(1, n + 1)); kk = int(np.argmax(ln))
                if ln[kk] >= 300:
                    sl = nd.find_objects(lab)[kk][0]
                    pos = p + 1 + (ox if axis == 'x' else oy)
                    res.append(dict(axis=axis, pos=int(pos), lo=int(sl.start + (oy if axis == 'x' else ox)), hi=int(sl.stop + (oy if axis == 'x' else ox)), run=int(ln[kk])))
        print(y, i, j, 'seams so far', len(res), flush=True)
json.dump(res, open(out, 'w'), indent=0); print(out, len(res))
