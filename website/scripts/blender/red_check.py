"""THE RED-LANE CHECK (25/09): which of OpenStreetMap's bus lanes are really
painted red, per way, lane and stretch, read off the NAIP 2022 aerial.

python3 red_check.py            -> qipu-render-work/life/red_verified.json (+ a table by street)

life_prep._red_lanes turns OSM's bus-lane tags into life.json roads[].red, and
life_traffic._red drew all of them red; but many SF bus-only lanes are white
striped, not red (Sacramento, Sutter, Post, Clay, most of the outer Geary...).
Here every red way is sampled on the photo across its width (-18..18 m, every
0.5 m) every 2 m of its length, one NAIP patch per ~500 m box of ways:
- a red-paint pixel: (R - max(G, B)) / (R + G + B) > 0.15 on the linear albedo,
  R > 0.02 (works in the towers' shade too), NDVI < 0.25 (no autumn leaves);
- a station is red on a side when a 3 m window of that side, within the
  carriageway (|u| <= lanes x 1.65 + 5.4, 16 m at most), is half red or more;
- the way is cut in ~30 m chunks, leaving out the stations within 12 m of an
  intersection (the cross street's own red); a chunk is painted when 40 % of
  its stations and at least 4 of them are red; a short way with no chunk
  (all of it near intersections) is painted when half its stations are.
Lane k >= 0 is on the right of the way (with it), -1-k on the left, as
life_traffic places them. Output ways[id][lane] = [[s0, s1], ...] (the arc
length of life_traffic._resample), cls[id][lane] = PAINTED / PARTIAL / NOT /
n/a (painted chunks >= 70 %, <= 15 %, in between, no chunk)."""
import collections, json, os, sys, time
import numpy as np
from numpy.lib.stride_tricks import sliding_window_view as swv
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ground_prep as g
from life_traffic import _resample

WORK = '/Users/daniel/code/qipu-render-work/life'
U = np.arange(-18, 18.01, 0.5)
LW, PK = 3.3, 2.4


def lanes_of(r):
    red = r['red']
    return ([k for k in range(r['nf'])] + [-1 - k for k in range(r['nb'])]) if red == 'all' else \
        [k if d == 'f' else -1 - k for d, k in red]


def sample(R):
    tiles = collections.defaultdict(list)
    for r in R:
        c = np.asarray(r['pts']).mean(0); tiles[(int(c[0] // 500), int(c[1] // 500))].append(r)
    out = {}
    for ti, (k, rs) in enumerate(sorted(tiles.items())):
        P = np.concatenate([np.asarray(r['pts']) for r in rs])
        x0, y0 = np.floor(P.min(0) - 25); x1, y1 = np.floor(P.max(0) + 25); res = 0.5
        DN, AL, nd, ok = g.patch(float(x0), float(y0), float(x1), float(y1), res)
        A = np.clip(AL, 1e-4, 1); red = (A[0] - np.maximum(A[1], A[2])) / A.sum(0)
        M = ((red > 0.15) & (A[0] > 0.02) & (nd < 0.25) & ok).astype(np.uint8); ny, nx = M.shape
        for r in rs:
            rr = _resample(r['pts'], 2.0)
            if rr is None: continue
            X, Y, S, TX, TY = rr
            px = X[:, None] - TY[:, None] * U[None]; py = Y[:, None] + TX[:, None] * U[None]
            ci = np.clip(((px - x0) / res).astype(int), 0, nx - 1); ri = np.clip(((py - y0) / res).astype(int), 0, ny - 1)
            out[r['id']] = (S, M[ri, ci])
        print(f'  box {ti + 1}/{len(tiles)}: {len(rs)} ways', flush=True)
    return out


def side_scan(M, sgn, wmax):
    idx = np.where((U * sgn > -0.3) & (np.abs(U) <= wmax))[0]
    if sgn < 0: idx = idx[::-1]
    A = M[:, idx].astype(float)
    if A.shape[1] < 6: return np.zeros(len(M), bool)
    return swv(A, 6, axis=1).mean(-1).max(1) >= 0.5


def classify(r, S, M):
    ix = r.get('ix', [])
    keep = np.array([not any(abs(s - q) < 12 for q in ix) for s in S])
    wmax = min(16.0, max(1, r['nf'] + r['nb']) * LW / 2 + PK + 3.0)
    side = {sg: side_scan(M, sg, wmax) for sg in (-1, 1)}
    L = float(S[-1]); nch = max(1, int(round(L / 30))); edges = np.linspace(0, L, nch + 1)
    res = {}
    for lane in lanes_of(r):
        st = side[-1 if lane >= 0 else 1]; ch = []
        for a, b in zip(edges[:-1], edges[1:]):
            sel = keep & (S >= a) & (S <= b)
            if sel.sum() >= 3: ch.append((a, b, st[sel].mean(), int(st[sel].sum())))
        good = [c for c in ch if c[2] >= 0.4 and c[3] >= 4]
        if ch:
            f = len(good) / len(ch); cls = 'PAINTED' if f >= 0.7 else 'NOT' if f <= 0.15 else 'PARTIAL'
        elif len(S) >= 4 and st.mean() >= 0.5 and st.sum() >= 4: cls, good = 'PAINTED', [(0.0, L)]
        else: cls = 'n/a'
        iv = []
        for c in good:
            a, b = c[0], c[1]
            if iv and abs(iv[-1][1] - round(a, 1)) < 0.11: iv[-1][1] = round(b, 1)
            else: iv.append([round(a, 1), round(b, 1)])
        res[str(lane)] = (cls, iv, L)
    return res


if __name__ == '__main__':
    D = json.load(open(os.path.join(WORK, 'life.json')))
    R = [r for r in D['roads'] if r.get('red')]
    print(f'{len(R)} red ways', flush=True)
    SM = sample(R)
    ways, cls = {}, {}; agg = collections.defaultdict(collections.Counter)
    for r in R:
        if r['id'] not in SM: continue
        c = classify(r, *SM[r['id']])
        ways[str(r['id'])] = {k: v[1] for k, v in c.items() if v[1]}
        cls[str(r['id'])] = {k: v[0] for k, v in c.items()}
        for k, v in c.items(): agg[r['name'] or '(unnamed)'][v[0]] += v[2]
    kept = sum(b - a for v in ways.values() for iv in v.values() for a, b in iv)
    meta = dict(built=time.strftime('%Y-%m-%d %H:%M'), source='NAIP 2022 (0.6 m) via ground_prep.patch; red_check.py', kept_m=round(kept),
                doc='ways[id][lane] = painted [[s0, s1], ...] (life_traffic._resample arc length); a lane absent is not painted')
    json.dump(dict(meta=meta, ways=ways, cls=cls), open(os.path.join(WORK, 'red_verified.json'), 'w'))
    print(f'{"street":28s} {"drawn m":>8s} {"painted":>8s} {"partial":>8s} {"not":>8s} {"n/a":>6s}')
    for nm in sorted(agg, key=lambda k: -sum(agg[k].values())):
        a = agg[nm]
        print(f'{nm[:28]:28s} {sum(a.values()):8.0f} {a["PAINTED"]:8.0f} {a["PARTIAL"]:8.0f} {a["NOT"]:8.0f} {a["n/a"]:6.0f}')
    print(f'kept red: {kept:.0f} m (drawn before: {sum(sum(a.values()) for a in agg.values()):.0f} lane-m)')
