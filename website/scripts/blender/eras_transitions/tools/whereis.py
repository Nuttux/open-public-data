"""whereis.py <prep.pkl> <plan.json> <frame> <px> <py> [r]: which objects, masks and switches own the canvas pixel under output pixel
(px, py) of a shot's frame (render.py's camera), within r canvas px."""
import sys, json, math, pickle, numpy as np
P = json.load(open(sys.argv[2])); D = pickle.load(open(sys.argv[1], 'rb')); fi, px, py = int(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]); r = int(sys.argv[6]) if len(sys.argv) > 6 else 6
FPS = P.get('fps', 30); OW, OH = P.get('size', [1920, 1080]); s = fi / FPS; smooth = lambda x: x * x * (3 - 2 * x)
K = P.get('cam', [])
if not K: x0, y0, x1, y1 = P['view']
else:
    ks = [k[0] for k in K]
    if s <= ks[0]: c = K[0][1:]
    elif s >= ks[-1]: c = K[-1][1:]
    else:
        j = max(i for i in range(len(ks)) if ks[i] <= s); u = smooth((s - ks[j]) / (ks[j + 1] - ks[j])); c = [K[j][q] * (1 - u) + K[j + 1][q] * u for q in (1, 2, 3)]
    cx, cy, cw = c; ch = cw * OH / OW; x0, y0, x1, y1 = cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2
X = x0 + px * (x1 - x0) / OW; Y = y0 + py * (y1 - y0) / OH; wx, wy = D['win'][:2]; lx, ly = int(X - wx), int(Y - wy)
print(f'canvas ({X:.0f}, {Y:.0f}) -> window px ({lx}, {ly})')
names = ['ground', 'water', 'roof', 'tree', 'landmark', 'street', 'facade', 'other']
sl = (slice(ly - r, ly + r + 1), slice(lx - r, lx + r + 1))
for nm in ('SB', 'SD', 'FB', 'FD', 'both', 'gch', 'shd'):
    if nm in D: print(f'  {nm}: {D[nm][sl].mean():.2f}')
print('  cA', names[int(np.bincount(D['cA'][sl].ravel()).argmax())], ' cB', names[int(np.bincount(D['cB'][sl].ravel()).argmax())])
if 'SWK' in D: print('  static-switch px', int((D['SWK'][sl] > 0).sum()))
for o in D['objs']:
    fx0, fy0, fx1, fy1 = o['box']
    if fx0 <= lx < fx1 and fy0 <= ly < fy1:
        sp = o['sprite'][max(0, ly - fy0 - r):ly - fy0 + r + 1, max(0, lx - fx0 - r):lx - fx0 + r + 1].mean(); ft = o['foot'][max(0, ly - fy0 - r):ly - fy0 + r + 1, max(0, lx - fx0 - r):lx - fx0 + r + 1].mean()
        if sp > 0 or ft > 0:
            w = (o.get('ys'), o.get('yc')) if o['side'] == 'born' else (o.get('ds'), o.get('de'))
            print(f"  {o['key']} {o['side']} {o['kind']} h {o['h']:.0f} zg {o['zg']:.1f} window {w} sprite {sp:.2f} foot {ft:.2f} box {o['box']}")
