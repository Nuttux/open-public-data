"""lmk_lock.py (OPEN-GROUND step2 07/10, CITY != sf): lock(out, ren, code, box, city) puts the render back on the landmark (code 4) px of the
boxes in lmk_lock.json[city] (+ PAD L9 px), with a 1.5 px soft rim. SF / a city without boxes: nothing (returns 0)."""
import os, json, numpy as np
from scipy import ndimage as nd
PAD = 24
T = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lmk_lock.json')))

def lock(out, ren, code, box, city):
    n = 0
    for name, (x0, y0, x1, y1) in T.get(city, {}).items():
        a0, b0 = max(0, y0 - PAD - box[1]), max(0, x0 - PAD - box[0]); a1, b1 = min(out.shape[0], y1 + PAD - box[1]), min(out.shape[1], x1 + PAD - box[0])
        if a1 <= a0 or b1 <= b0: continue
        s = (slice(a0, a1), slice(b0, b1)); m = code[s] == 4
        if not m.any(): continue
        al = np.clip(nd.gaussian_filter(m.astype(np.float32), 1.5) * 1.6, 0, 1); al[m] = 1.0
        o = out[s].astype(np.float32); out[s] = (o * (1 - al[..., None]) + ren[s].astype(np.float32) * al[..., None]).astype(np.uint8); n += int(m.sum())
    return out, n
