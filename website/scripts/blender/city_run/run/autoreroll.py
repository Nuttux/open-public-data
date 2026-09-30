#!/usr/bin/env python3
"""city_run/run/autoreroll.py: AUTOMATIC DETECT + RE-ROLL of AI tiles, between the AI step and the post (30/09, b8 defect sweep).
Per tile (1024 L9 px, the window's P.txt), against the window's render R_<w>.jpg and class map C_<w>.png:
  det      ai/look_regain/detectors.py detect() + its TH (veg_roof, roof_road, water_street, inv_water, ...), as the post's QA runs it
  quay     AI greenery on ground / street px within 300 L9 px of water where the render has none: largest blob (plants on quays,
           pier aprons and tips, waterfront plazas: b8 #1 #7).  The post removes it too (post_sb QUAY_R); a re-roll gives real paving.
  bridge   a landmark in water (bridge deck / tower, sparse component) drawn far from the render (mean |d| > 40 on the component):
           px count (b8: a house and rooftop units on the Bay Bridge).  The post puts the render back too (BRIDGE_RENDER).
  roofgrn  a grey render roof drawn green (a* 6 below the render, greenish): largest blob (b8 #3: half a pier shed painted as moss)
  garden   trees / lawn on a big flat roof: roof or landmark px green where the render is not, inside a flat render region: largest blob
           (b8 #11: a garden street on the Westfield roof)
  flat     colour disagreement with the neighbour tiles on FLAT render surfaces (roofs, rail beds, lots: render gradient low) in the
           384 px overlaps: dE of the overlap means > FLAT_DE (b8 #10: ballast vs a pale slab = a haze wedge after quilting); the tile
           farther from its neighbours' median is flagged
A tile is flagged when any score passes its threshold (TH_NEW + detectors' TH). Re-roll = the same prompt and L8 context with a NEW
noise key (nf9=1 hashes the L9 noise from (nfkey, position): a new generator seed alone repaints the same tile) -> rrq.py chunks;
up to MAX_TRIES rounds (default 2); per tile the candidate with the lowest score wins (the original when no re-roll is better); the
original is kept in <tiles>/orig/. A green-roof flag also fixes the tile's L8 context (roof px pulled to the render's a*b*) for its re-rolls.
  python3 autoreroll.py scan  <win dir> <tiles dir> [out.json]          scores + flags of every tile (no GPU)
  python3 autoreroll.py jobs  <win dir> <flags.json> <round> <out dir>  rrq chunk files for the flagged tiles (#OUT RR<round> nfR<round>)
  python3 autoreroll.py pick  <win dir> <tiles dir> <cand dir>...       per flagged tile: best of original + candidates -> tiles dir
  python3 autoreroll.py report <win dir>                                the per-run report (autoreroll.md next to P.txt)
  python3 autoreroll.py auto <win dir> <tiles dir> <l8 jpg> <origin x,y> <label>   THE STAGE: scan -> up to MAX_TRIES rounds of
                           (jobs for the still-flagged tiles -> autoreroll_card.py <label>r<k> -> pick) -> report. DRY=1: no card.
Switch: AUTO_REROLL=1 (default in the launcher steps, city_run/README.md); AUTO_REROLL=0 skips the stage."""
import os, sys, json, glob, shutil, numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd
Image.MAX_IMAGE_PIXELS = None
W = '/Users/daniel/code/qipu-render-work'
# thresholds calibrated on b8 (30/09): 11 known defect tiles vs 40 random tiles, each set just above the random tiles' max
TH_NEW = dict(quay=5000, bridge=4000, roofgrn=3000, garden=8000, flat=2)
# the look_regain detectors re-roll a tile only where they are quiet on clean b8 tiles (their own TH flagged 20 of 40 random tiles);
# the rest of them go to the report only
TH_DET_AUTO = dict(roof_road=30000, water_roof=5000, street_teal=12000, lawn=20000, water_street=15000)
FLAT_DE = float(os.environ.get('FLAT_DE', 10.0)); QUAY_R = int(os.environ.get('QUAY_R', 300)); MAX_TRIES = int(os.environ.get('MAX_TRIES', 2))
_G = {}
def _det():
    if not _G:
        sys.path.insert(0, f'{W}/ai'); import addguard
        src = open(f'{W}/ai/look_regain/detectors.py').read(); a = src.index('YW = np.array'); b = src.index('W4 = dict'); t0 = src.index('TH = dict'); t1 = src.index('\n', t0)
        g = dict(np=np, nd=nd, addguard=addguard, Image=Image); exec(src[t0:t1] + '\n' + src[a:b], g); _G.update(detect=g['detect'], TH=g['TH'])
    return _G
def codeof(c): c = c > 128; return (c[..., 0] * 4 + c[..., 1] * 2 + c[..., 2]).astype(np.uint8)
def lab(a): return cv2.cvtColor(np.ascontiguousarray(a), cv2.COLOR_RGB2LAB).astype(np.float32)
def big(m, it=2):
    m = nd.binary_opening(m, iterations=it); l, n = nd.label(m)
    return int(np.bincount(l.ravel())[1:].max()) if n else 0
def green(a): a = a.astype(np.int16); return (a[..., 1] > a[..., 0] + 8) & (a[..., 1] > a[..., 2] + 2)

class Win:
    """a window: P.txt lines, render + class mosaics (R_<w>.jpg / C_<w>.png, origin R_<w>.json)"""
    def __init__(self, wd):
        self.wd = wd; self.P = [l for l in open(f'{wd}/P.txt').read().splitlines() if l.startswith('C9:')]
        self.w = next(l.split()[1] for l in open(f'{wd}/P.txt') if l.startswith('#MOSAIC'))
        self.ox, self.oy = json.load(open(f'{wd}/R_{self.w}.json')).values()
        self.R = np.asarray(Image.open(f'{wd}/R_{self.w}.jpg').convert('RGB')); self.C = codeof(np.asarray(Image.open(f'{wd}/C_{self.w}.png').convert('RGB')))
        self.tiles = {l.split()[0][3:].replace(',', '_'): l for l in self.P}
    def crop(self, a, gx, gy, n=1024, pad=0):
        x, y = gx - self.ox - pad, gy - self.oy - pad; H, Wd = a.shape[:2]; s = n + 2 * pad
        out = np.zeros((s, s) + a.shape[2:], a.dtype); x0, y0 = max(0, x), max(0, y); x1, y1 = min(Wd, x + s), min(H, y + s)
        if x1 > x0 and y1 > y0: out[y0 - y:y1 - y, x0 - x:x1 - x] = a[y0:y1, x0:x1]
        return out

def scores(win, t, o):
    """o: the tile (1024x1024x3 uint8) -> dict of scores"""
    gx, gy = map(int, t.split('_')); r = win.crop(win.R, gx, gy); c = win.crop(win.C, gx, gy)
    G = _det(); cc = np.stack([(c >> 2) & 1, (c >> 1) & 1, c & 1], -1).astype(np.uint8) * 255
    d = {k: v for k, v in G['detect'](o, r, cc).items() if k != 'v'}
    # quay: greenery on ground / street near water where the render has none
    cp = win.crop(win.C, gx, gy, pad=QUAY_R); wat = cp == 1
    dw = nd.distance_transform_edt(~wat[::4, ::4]) * 4 if wat.any() else np.full((cp.shape[0] // 4 + 1, cp.shape[1] // 4 + 1), 1e9)
    dw = np.repeat(np.repeat(dw, 4, 0), 4, 1)[QUAY_R:QUAY_R + 1024, QUAY_R:QUAY_R + 1024]
    rg = r.astype(np.int16); rveg = nd.binary_dilation((c == 3) | (((rg[..., 1] - rg[..., 0]) >= 12) & ((rg[..., 1] - rg[..., 2]) >= 12)), iterations=10)   # the render's trees / lawns / green ground (= post_sb QUAY_R)
    d['quay'] = big((dw <= QUAY_R) & np.isin(c, (0, 5)) & green(o) & ~rveg)
    # bridge: landmark components in water, drawn far from the render
    l4, n4 = nd.label(c == 4); bsc = 0
    if n4:
        ring = nd.binary_dilation(c == 4, iterations=8) & (c != 4); lr = nd.grey_dilation(l4, size=17); lr[~ring] = 0
        tot = np.bincount(lr.ravel(), minlength=n4 + 1); wf = np.bincount(lr.ravel(), weights=(c == 1).ravel().astype(float), minlength=n4 + 1)
        dif = np.abs(o.astype(np.int16) - r.astype(np.int16)).max(-1) > 60
        for i in np.where((tot > 0) & (wf / np.maximum(tot, 1) > 0.85))[0]:
            if i == 0: continue
            mi = l4 == i; bsc += big(mi & dif, 1)
    d['bridge'] = int(bsc)
    Lo, Lr = lab(o), lab(r)
    # roofgrn: a render roof (not green) drawn green
    d['roofgrn'] = big((c == 2) & (Lo[..., 1] < Lr[..., 1] - 6) & (Lo[..., 1] < 124) & ~green(r), 3)
    # garden: greenery on big flat roofs / landmark roofs
    flat = cv2.blur(np.abs(cv2.Laplacian(Lr[..., 0], cv2.CV_32F)), (15, 15)) < 6
    d['garden'] = big(np.isin(c, (2, 4)) & flat & green(o) & ~nd.binary_dilation(green(r) | (c == 3), iterations=6), 2)
    return d

def flat_disagree(win, T, load):
    """per tile: the number of neighbours it disagrees with on flat surfaces (dE of the overlap means > FLAT_DE, farther from the median)"""
    S = 640; keys = set(T); out = {t: 0 for t in T}; pairs = []
    for t in T:
        gx, gy = map(int, t.split('_'))
        for dx, dy in ((S, 0), (0, S)):
            u = f'{gx + dx}_{gy + dy}'
            if u in keys: pairs.append((t, u, dx, dy))
    means = {}
    for t, u, dx, dy in pairs:
        gx, gy = map(int, t.split('_')); ov = (slice(dy, 1024), slice(dx, 1024)); ov2 = (slice(0, 1024 - dy), slice(0, 1024 - dx))
        r = win.crop(win.R, gx, gy)[ov]; c = win.crop(win.C, gx, gy)[ov]; Lr = lab(r)
        m = np.isin(c, (0, 2, 5, 7)) & (cv2.blur(np.abs(cv2.Laplacian(cv2.GaussianBlur(Lr[..., 0], (0, 0), 2), cv2.CV_32F)), (31, 31)) < 4)   # flat at 2 px (rail beds: thin rails blurred away)
        if m.sum() < 20000: continue
        a, b = lab(load(t)[ov])[m].mean(0), lab(load(u)[ov2])[m].mean(0); means.setdefault(t, []).append((u, a, b)); means.setdefault(u, []).append((t, b, a))
    for t, L in means.items():
        own = np.array([a for _, a, _ in L]); nb = np.array([b for _, _, b in L]); med = np.median(nb, 0)
        for (u, a, b) in L:
            de = float(np.linalg.norm(a - b))
            if de > FLAT_DE and np.linalg.norm(a - med) > np.linalg.norm(b - med): out[t] += 1
    return out

def flagged(d):
    TH = dict(TH_DET_AUTO, **TH_NEW); return [k for k, th in TH.items() if d.get(k, 0) >= th]
def report_flags(d): return [k for k, th in _det()['TH'].items() if d.get(k, 0) >= th and k not in TH_DET_AUTO]
def cost(d):
    TH = dict(TH_DET_AUTO, **TH_NEW); return sum(min(3.0, d.get(k, 0) / th) for k, th in TH.items())

def scan(wd, td, out=None):
    win = Win(wd); T = [t for t in win.tiles if os.path.exists(f'{td}/{t}.jpg')]
    load = lambda t: np.asarray(Image.open(f'{td}/{t}.jpg').convert('RGB'))
    res = {}
    for i, t in enumerate(T):
        d = scores(win, t, load(t)); res[t] = d
        if i % 100 == 0: print('scan', i, len(T), flush=True)
    fd = flat_disagree(win, T, load)
    for t in T: res[t]['flat'] = fd.get(t, 0); res[t]['flags'] = flagged(res[t]); res[t]['report'] = report_flags(res[t])
    fl = {t: d['flags'] for t, d in res.items() if d['flags']}
    json.dump(dict(scores=res, flagged=fl), open(out or f'{wd}/autoreroll_scan.json', 'w'))
    print('SCAN', len(T), 'tiles,', len(fl), 'flagged', json.dumps({k: sum(1 for v in fl.values() if k in v) for k in set(sum(fl.values(), []))}))
    return res, fl

def jobs(wd, fj, rnd, od):
    """rrq chunk: '#OUT RR<rnd> nfR<rnd>' + the flagged tiles' P lines with a new seed (prompt key unchanged)"""
    win = Win(wd); fl = json.load(open(fj))['flagged']; os.makedirs(od, exist_ok=True); rng = np.random.default_rng(1000 + int(rnd))
    L = [f'#OUT RR{rnd} nfR{rnd}', f'#MOSAIC {win.w}']
    for t in sorted(fl):
        a = win.tiles[t].split(); a[4] = str(int(rng.integers(2 ** 32))); L.append(' '.join(a))
    open(f'{od}/c_{int(rnd):03d}.txt', 'w').write('\n'.join(L) + '\n'); print('JOBS', len(L) - 2, 'tiles ->', f'{od}/c_{int(rnd):03d}.txt')

def pick(wd, td, cands):
    """per flagged tile: min cost among the original and each candidate dir's tile; the winner goes to td (original kept in td/orig/)"""
    win = Win(wd); sj = json.load(open(f'{wd}/autoreroll_scan.json')); fl = sj['flagged']; rep = []
    os.makedirs(f'{td}/orig', exist_ok=True)
    for t in sorted(fl):
        base = f'{td}/orig/{t}.jpg' if os.path.exists(f'{td}/orig/{t}.jpg') else f'{td}/{t}.jpg'
        opts = [('orig', base, sj['scores'][t])]
        for cd in cands:
            f = f'{cd}/{t}.jpg'
            if os.path.exists(f):
                d = scores(win, t, np.asarray(Image.open(f).convert('RGB'))); d['flat'] = 0; opts.append((os.path.basename(cd.rstrip('/')), f, d))
        best = min(opts, key=lambda o: cost(o[2]))
        if best[0] != 'orig':
            if not os.path.exists(f'{td}/orig/{t}.jpg'): shutil.copy2(f'{td}/{t}.jpg', f'{td}/orig/{t}.jpg')
            shutil.copy2(best[1], f'{td}/{t}.jpg')
        rep.append(dict(tile=t, flags=fl[t], choice=best[0], cost={o[0]: round(cost(o[2]), 2) for o in opts}, left=flagged(best[2])))
    json.dump(rep, open(f'{wd}/autoreroll_pick.json', 'w'), indent=1); print('PICK', sum(1 for r in rep if r['choice'] != 'orig'), 'replaced of', len(rep)); return rep

def report(wd):
    rep = json.load(open(f'{wd}/autoreroll_pick.json')) if os.path.exists(f'{wd}/autoreroll_pick.json') else []
    L = ['# auto re-roll report', '', f'{len(rep)} flagged tiles; {sum(1 for r in rep if r["choice"] != "orig")} replaced by a re-roll; '
         f'{sum(1 for r in rep if r["left"])} still flagged after the best candidate', '', '| tile | flags | chosen | cost (orig / re-rolls) | still flagged |', '|---|---|---|---|---|']
    for r in rep: L.append(f"| {r['tile']} | {', '.join(r['flags'])} | {r['choice']} | {' / '.join(f'{k} {v}' for k, v in r['cost'].items())} | {', '.join(r['left']) or '-'} |")
    open(f'{wd}/autoreroll.md', 'w').write('\n'.join(L) + '\n'); print('\n'.join(L[:3]))

def auto(wd, td, l8, origin, label):
    import subprocess
    _, fl = scan(wd, td); cands = []
    for rnd in range(1, MAX_TRIES + 1):
        if not fl: break
        cd = f'{wd}/rr{rnd}'; os.makedirs(cd, exist_ok=True); fj = f'{cd}/flagged.json'; json.dump(dict(flagged=fl), open(fj, 'w')); jobs(wd, fj, rnd, cd)
        cmd = [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'autoreroll_card.py'), f'{label}r{rnd}', wd, l8, origin, cd]
        if os.environ.get('DRY') == '1': print('DRY card:', ' '.join(cmd)); break
        r = subprocess.run(cmd, capture_output=True, text=True); open(f'{cd}/card.log', 'w').write(r.stdout + r.stderr)
        if 'ALL_DONE' not in r.stdout: print('CARD FAILED round', rnd, (r.stdout + r.stderr)[-400:])
        cands.append(f'{cd}/out/RR{rnd}'); rep = pick(wd, td, [c for c in cands if os.path.isdir(c)])
        fl = {x['tile']: x['left'] for x in rep if x['left']}
    report(wd)

if __name__ == '__main__':
    a = sys.argv[1:]
    if os.environ.get('AUTO_REROLL', '1') != '1': print('AUTO_REROLL=0: skipped'); sys.exit(0)
    if a[0] == 'scan': scan(a[1], a[2], a[3] if len(a) > 3 else None)
    elif a[0] == 'jobs': jobs(a[1], a[2], a[3], a[4])
    elif a[0] == 'pick': pick(a[1], a[2], a[3:])
    elif a[0] == 'report': report(a[1])
    elif a[0] == 'auto': auto(a[1], a[2], a[3], a[4], a[5])
    else: print(__doc__)
