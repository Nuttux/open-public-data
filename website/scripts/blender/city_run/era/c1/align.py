"""C1 step: footprint -> photo offset per mosaic year inside the area (outline-on-gradient search, +-40 m, the whole box and its 4 quadrants).
Positives: records standing by the year with a SOURCED year (from_src sourced:*), area >= 60 m2. Writes eras/c1/align.json."""
import json, numpy as np, cv2
import common as c
recs = [b for b in c.records(0) if str(b['from_src']).startswith('sourced')]
e0, n1, Wd, Hd = c.grid()
out = {}
for Y in (1950, 1959, 1967, 1972, 1978, 1982):
    a = c.napl(Y).astype(np.float32); g = cv2.GaussianBlur(a, (0, 0), 1.0)
    G = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
    m = np.zeros(G.shape, np.uint8)
    for b in recs:
        if b['from'] > Y or (b['until'] and b['until'] <= Y): continue
        P = np.array([c.to_px(*c.w2utm(x, y)) for x, y in b['ring']], np.int32)
        if cv2.contourArea(P.astype(np.float32)) < 60: continue
        cv2.polylines(m, [P], True, 1, 1)
    R = 40; res = {}
    for q, (j0, j1, i0, i1) in dict(all=(0, Hd, 0, Wd), NW=(0, Hd // 2, 0, Wd // 2), NE=(0, Hd // 2, Wd // 2, Wd),
                                    SW=(Hd // 2, Hd, 0, Wd // 2), SE=(Hd // 2, Hd, Wd // 2, Wd)).items():
        mm = np.zeros_like(m); mm[j0:j1, i0:i1] = m[j0:j1, i0:i1]; ys, xs = np.nonzero(mm)
        S = np.zeros((2 * R + 1, 2 * R + 1))
        for dy in range(-R, R + 1):
            yy = np.clip(ys + dy, 0, Hd - 1)
            for dx in range(-R, R + 1):
                S[dy + R, dx + R] = G[yy, np.clip(xs + dx, 0, Wd - 1)].mean()
        j, i = np.unravel_index(S.argmax(), S.shape)
        res[q] = dict(dE=int(i - R), dN=int(-(j - R)), peak=round(float(S.max() / np.median(S)), 3), n=int(len(xs)))
    out[Y] = res
    print(Y, ' '.join(f"{q}:{v['dE']:+d},{v['dN']:+d} p{v['peak']}" for q, v in res.items()), flush=True)
json.dump(out, open(f'{c.OUT}/align.json', 'w'), indent=1)
