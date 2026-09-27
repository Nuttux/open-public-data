"""render.py <prep.pkl> <plan.json>: the transitions grammar (GRAMMAR.md) rendered frame by frame from one prepared step.

Per frame (calendar time t): the background = A* switched to B pixel by pixel when the object that owns the pixel passes it
(a shadow when the rising top reaches the height the pixel needs, a sinking top for a demolition's shadow, a ground surface
at its date with a short wipe); under the objects the plates (what was behind); then every changing object in painter's order
(north first) in its stage: born = site -> foundation -> floors (the finished facade a few floors behind an open frame, the roof
moved down to the working height as the top slab) -> crown -> finish; died = stripped -> taken down from the top (ragged edge,
dust) or collapsed -> rubble -> cleared lot. The first frame is A*, the last frame is B, byte for byte (inside the view).
plan: view [x0,y0,x1,y1] canvas px, size [w,h], fps, holds [s0,s1], seconds, out (path without .mp4), captions [[t0,t1,text]],
workers, stills (every n frames), clip [f0,f1] (optional)."""
import sys, json, math, pickle, os, subprocess, time
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as nd
import cv2
import stage as S

PL = json.load(open(sys.argv[2])); D = pickle.load(open(sys.argv[1], 'rb'))
win = D['win']; WX0, WY0 = win[:2]; H, W = D['A'].shape[:2]
A, B, AS = D['A'], D['B'], D['Astar']; OBJ = D['objs']; eA, eB = D['eA'], D['eB']
FPS = PL.get('fps', 30); OW, OH = PL.get('size', [1920, 1080]); SEC = PL.get('seconds', 10.0); H0, H1 = PL.get('holds', [0.8, 1.2])
VX0, VY0, VX1, VY1 = [v - o for v, o in zip(PL['view'], (WX0, WY0, WX0, WY0))]
rng = np.random.default_rng(11)
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)
smooth = lambda x: x * x * (3 - 2 * x)
clip01 = lambda x: min(1.0, max(0.0, x))


# ── textures: graded earth, concrete ─────────────────────────────────────────────────────────────────────────────────
def fnoise(shape, sigma, seed):
    r = np.random.default_rng(seed).standard_normal(shape).astype(np.float32); r = nd.gaussian_filter(r, sigma); return r / (r.std() + 1e-6)
n1, n2, n3 = fnoise((H, W), 6, 1), fnoise((H, W), 1.5, 2), fnoise((H, W), 22, 3)
EARTH = np.clip(np.array([172, 156, 134], np.float32)[None, None] * (0.93 + 0.05 * n1 + 0.035 * n2 + 0.04 * n3)[..., None], 0, 255)
CONC = np.clip(np.array([196, 193, 186], np.float32)[None, None] * (0.97 + 0.02 * n2 + 0.02 * n1)[..., None], 0, 255)
# the cleared ground reads as PARCELS: each lot its own tone and material (graded earth to gravel), a slightly darker edge
GRAV = np.clip(np.array([150, 147, 140], np.float32)[None, None] * (0.95 + 0.04 * n2 + 0.03 * n1 + 0.03 * n3)[..., None], 0, 255)
_LT = np.ones((H, W), np.float32); _LM = np.zeros((H, W), np.float32); _rl = np.random.default_rng(5)
for _o in OBJ:
    _f = _o['foot']
    if not _f.any(): continue
    _x0, _y0, _x1, _y1 = _o['box']; _v = _LT[_y0:_y1, _x0:_x1]; _m = _LM[_y0:_y1, _x0:_x1]
    _v[_f] = _rl.uniform(0.9, 1.07); _m[_f] = _rl.uniform(0.0, 0.7)
    _e = _f & ~nd.binary_erosion(_f, iterations=2); _v[_e] *= 0.9
EARTH = np.clip((EARTH * (1 - _LM[..., None]) + GRAV * _LM[..., None]) * _LT[..., None], 0, 255)

# ── plates: what is behind the objects ───────────────────────────────────────────────────────────────────────────────
SB, SD, both = D['SB'], D['SD'], D['both']
E = np.where((SB & ~SD)[..., None], AS, B).copy()
FEET = D['FB'] | D['FD']
fill_earth = both & FEET
# the ground under a gone VIADUCT (a 'span') is a street, not a building lot: behind both it and a new tower (neither key shows
# it) it continues the ground just in front of it (the first px below it that a key shows), not a brown earth plate (a floating
# earth band across the Transbay towers' facades: A/B #4 #16)
SPF = np.zeros_like(both)
for o in OBJ:
    if o['side'] == 'died' and o['kind'] == 'span': fx0, fy0, fx1, fy1 = o['box']; SPF[fy0:fy1, fx0:fx1] |= o['foot']
sp_fill = fill_earth & SPF; fill_earth &= ~SPF
E[fill_earth] = EARTH[fill_earth].astype(np.uint8)
if sp_fill.any():
    rr, cc = np.nonzero(sp_fill); got = np.zeros(len(rr), bool); Hh = sp_fill.shape[0]
    for k in range(1, 160):
        sr = rr + k; ok = (~got) & (sr < Hh); ok2 = np.zeros(len(rr), bool); ok2[ok] = ~both[sr[ok], cc[ok]]
        E[rr[ok2], cc[ok2]] = E[sr[ok2], cc[ok2]]; got |= ok2
        if got.all(): break
    E[rr[~got], cc[~got]] = EARTH[rr[~got], cc[~got]].astype(np.uint8)
    log('span ground behind both: continued from below', int(got.sum()), 'of', len(rr))
hole = both & ~FEET
if hole.any():
    # behind BOTH a gone object and a new one (neither key shows it): what the earlier year shows just above the gone object
    # continues down over it (a ground point behind a low viaduct span or a building is seen about its height higher in the
    # image): each hole pixel of a gone object copies the plate its height (in px) above, once, from outside the hole; what is
    # left (no source) gets the graded site ground
    Hh, Ww = hole.shape
    for o in sorted([o for o in OBJ if o['side'] == 'died'], key=lambda o: o['h']):
        fx0, fy0, fx1, fy1 = o['box']; hm = hole[fy0:fy1, fx0:fx1] & o['sprite']
        if not hm.any(): continue
        off = int(o['h'] * S.PX_Z) + 4; rr, cc = np.nonzero(hm); rr = rr + fy0; cc = cc + fx0; got = np.zeros(len(rr), bool)
        for k in (1, 2, 3):
            sr = rr - k * off; ok = (~got) & (sr >= 0); ok2 = np.zeros(len(rr), bool); ok2[ok] = ~hole[sr[ok], cc[ok]]
            E[rr[ok2], cc[ok2]] = E[sr[ok2], cc[ok2]]; got |= ok2
        hole[rr[got], cc[got]] = False
    if hole.any():
        hr_, hc_ = np.nonzero(hole)
        top = np.full(W, H, np.int64); np.minimum.at(top, hc_, hr_)
        shade_ = np.clip(0.9 + 0.1 * np.minimum((hr_ - top[hc_]) / 60.0, 1.0), 0.85, 1.0)
        E[hr_, hc_] = np.clip(EARTH[hr_, hc_] * shade_[:, None], 0, 255).astype(np.uint8)
log('plates; both', int(both.sum()), 'hole inpainted', int(hole.sum()))

# ── objects: per-object arrays ───────────────────────────────────────────────────────────────────────────────────────
def lumf(I): return I.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
BORN = [o for o in OBJ if o['side'] == 'born']; DIED = [o for o in OBJ if o['side'] == 'died']
for k, o in enumerate(OBJ): o['i'] = k
def col_rows(ring, zg, fx0, fy0, fw):
    """per bbox column, the footprint's near (max) and far (min) image rows, analytic (the footprint may lie outside the window)"""
    X, Y = S.w2c(np.array([p[0] for p in ring]), np.array([p[1] for p in ring]), zg); X = X - WX0 - fx0; Y = Y - WY0 - fy0
    xc = np.arange(fw) + 0.5; yn = np.full(fw, -np.inf); yf = np.full(fw, np.inf); n = len(X)
    for i in range(n):
        x1, y1, x2, y2 = X[i], Y[i], X[(i + 1) % n], Y[(i + 1) % n]
        if abs(x2 - x1) < 1e-6: continue
        m = (xc >= min(x1, x2)) & (xc <= max(x1, x2)); yy = y1 + (xc[m] - x1) * (y2 - y1) / (x2 - x1)
        yn[m] = np.maximum(yn[m], yy); yf[m] = np.minimum(yf[m], yy)
    ok = np.isfinite(yn)
    if not ok.any():
        return np.full(fw, Y.max(), np.float32), np.full(fw, Y.min(), np.float32)
    idx = np.nonzero(ok)[0]; nn = idx[np.clip(np.searchsorted(idx, np.arange(fw)), 0, len(idx) - 1)]
    near = np.where(ok, yn, yn[nn]); far = np.where(ok, yf, yf[nn])
    # beyond the footprint's x range, the nearest end column (the side face continues)
    return near.astype(np.float32), far.astype(np.float32)
for o in OBJ:
    fx0, fy0, fx1, fy1 = o['box']; fh, fw = fy1 - fy0, fx1 - fx0
    o['ynear'], o['yfar'] = col_rows(o['ring'], o['zg'], fx0, fy0, fw)
    R_, C_ = np.mgrid[0:fh, 0:fw]
    yn, yf = o['ynear'][None, :], o['yfar'][None, :]; hr = o['hroof']
    tn, tf = yn - hr * S.PX_Z, yf - hr * S.PX_Z
    o['dz'] = np.broadcast_to(o['ynear'][None, :] + fy0, (fh, fw)).astype(np.float32)          # depth key: the near edge's row
    o['Z'] = np.where(R_ >= tn - 1.0, np.clip((yn - R_) / S.PX_Z, 0, hr), np.where(R_ >= tf - 1.0, hr, hr + (tf - R_) / S.PX_Z)).astype(np.float32)
    o['roofp'] = (R_ < tn - 1.0) & (R_ >= tf - 1.0)                          # rows of the roof polygon (by column)
    sp = o['sprite']; o['M'] = sp.copy(); o['pixf'] = o['pix'].astype(np.float32)
    o['fl'] = 3.9 if o['h'] >= 30 else (3.4 if o['h'] >= 12 else 3.0)
    L_ = lumf(o['pix']); med = np.median(L_[sp]) if sp.any() else 128.0
    o['shade'] = np.clip(nd.gaussian_filter(L_, 2) / max(med, 1.0), 0.5, 1.5).astype(np.float32)
    o['col'] = np.median(o['pix'][sp], 0).astype(np.float32) if sp.any() else np.array([150, 150, 150], np.float32)
    rp = sp & o['roofp']
    o['roofcol'] = np.median(o['pix'][rp], 0).astype(np.float32) if rp.sum() > 10 else o['col']
    cy_, cx_ = np.nonzero(o['foot']) if o['foot'].any() else (np.array([fh // 2]), np.array([fw // 2]))
    fcy, fcx = cy_.mean(), cx_.mean(); dd_ = np.hypot((R_ - fcy) / 0.5, C_ - fcx); o['fdist'] = (dd_ / max(dd_[o['foot']].max() if o['foot'].any() else 1, 1)).astype(np.float32)
    if o['foot'].sum() > 5:
        cov = np.cov(np.stack([cx_, cy_ * 2.0])); ev = np.linalg.eigh(cov)[1][:, -1]; ax = (C_ - fcx) * ev[0] + (R_ - fcy) * 2.0 * ev[1]
        ax = (ax - ax[o['foot']].min()) / max(np.ptp(ax[o['foot']]), 1); o['faxis'] = ax.astype(np.float32)
    else: o['faxis'] = o['fdist']
    o['jit'] = np.repeat(nd.gaussian_filter1d(np.random.default_rng(o['i']).uniform(-1, 1, fw // 6 + 2), 1.2), 6)[:fw].astype(np.float32)
# completion: the parts of a born building that another born building hides in B (periodic copy from its own floors above)
for o in BORN:
    fx0, fy0, fx1, fy1 = o['box']; sp = o['sprite']; fh, fw = sp.shape
    im = Image.new('L', (fw, fh)); dr = ImageDraw.Draw(im)
    Xb, Yb = S.w2c(np.array([p[0] for p in o['ring']]), np.array([p[1] for p in o['ring']]), o['zg'])
    Xb, Yb = Xb - WX0 - fx0, Yb - WY0 - fy0; Xt, Yt = Xb, Yb - o['h'] * S.PX_Z; n_ = len(Xb)
    dr.polygon(list(zip(Xb, Yb)), fill=1); dr.polygon(list(zip(Xt, Yt)), fill=1)
    for i_ in range(n_):
        j_ = (i_ + 1) % n_; dr.polygon([(Xb[i_], Yb[i_]), (Xb[j_], Yb[j_]), (Xt[j_], Yt[j_]), (Xt[i_], Yt[i_])], fill=1)
    sil = np.asarray(im) > 0
    others = SB[fy0:fy1, fx0:fx1] & ~sp
    comp = sil & ~sp & others
    if comp.sum() > 30 and sp.sum() > 200:
        per = max(8, int(round(2 * o['fl'] * S.PX_Z))); pix = o['pix'].copy(); got = np.zeros_like(comp)
        rr, cc = np.nonzero(comp)
        for k in range(1, 40):
            for sgn in (-1, 1):
                r2 = rr + sgn * k * per; ok = (~got[rr, cc]) & (r2 >= 0) & (r2 < fh)
                ok2 = np.zeros_like(ok); ok2[ok] = sp[r2[ok], cc[ok]]
                pix[rr[ok2], cc[ok2]] = o['pix'][r2[ok2], cc[ok2]]; got[rr[ok2], cc[ok2]] = True
            if got[rr, cc].all(): break
        comp &= got
        o['pix'] = pix; o['pixf'] = pix.astype(np.float32); o['M'] = sp | comp; o['comp'] = int(comp.sum())
log('objects', len(OBJ), 'completed', sum(1 for o in BORN if o.get('comp')))

# ── the calendar -> film time curve (slow where things happen) ──────────────────────────────────────────────────────
def active_w(t):
    s = 0.0
    for o in OBJ:
        w = math.sqrt(o['n'])
        if o['side'] == 'born' and o.get('site0', o['ys']) <= t <= o['yc']: s += w
        if o['side'] == 'died' and o['ds'] <= t <= o['de'] + 0.2: s += 0.6 * w
    return s
ts = np.linspace(eA, eB, 801); aw = np.array([active_w(t) for t in ts]); aw = nd.gaussian_filter1d(aw, 6)
rate = 0.22 + aw / max(aw.max(), 1e-6)                                         # film seconds per calendar year (relative)
for f0_, f1_, w_ in PL.get('focus', []):                                            # a captioned event gets its screen time
    rate += w_ * nd.gaussian_filter1d(((ts >= f0_) & (ts <= f1_)).astype(np.float64), 3)
cum = np.concatenate([[0], np.cumsum((rate[1:] + rate[:-1]) / 2 * np.diff(ts))]); cum = cum / cum[-1] * (SEC - H0 - H1)
def year_at(s):
    """film second -> calendar year"""
    if s <= H0: return eA
    if s >= SEC - H1: return eB
    return float(np.interp(s - H0, cum, ts))
def film_at(y): return H0 + float(np.interp(y, ts, cum))
N = int(round(SEC * FPS))

# ── background switches: shadows (by height), ground changes (by date, wiped outward) ────────────────────────────────
KIND = np.zeros((H, W), np.uint8); OWN = np.full((H, W), -1, np.int32); PAR = np.zeros((H, W), np.float32)
for o in OBJ:
    if o.get('shadow') is None: continue
    sx0, sy0, hr_ = o['shadow']; sl = (slice(sy0, sy0 + hr_.shape[0]), slice(sx0, sx0 + hr_.shape[1]))
    m = np.isfinite(hr_) & (KIND[sl] == 0)
    KIND[sl][m] = 1 if o['side'] == 'born' else 2; OWN[sl][m] = o['i']; PAR[sl][m] = hr_[m]
sw_ = D.get('SWK')
if sw_ is not None:
    m = sw_ == 1; KIND[m] = 1; OWN[m] = D['SWO'][m]; PAR[m] = D['SWP'][m]
g = D['gch'] & (KIND == 0)
if g.any():
    seed = np.zeros((H, W), np.int32)
    for o in OBJ:
        fx0, fy0, fx1, fy1 = o['box']; seed[fy0:fy1, fx0:fx1][o['foot'] | o['sprite']] = o['i'] + 1
    dist, (iy, ix) = nd.distance_transform_edt(seed == 0, return_indices=True)
    ow = seed[iy, ix] - 1; lab, n_ = nd.label(g)
    for k, sl in enumerate(nd.find_objects(lab)):
        m = lab[sl] == k + 1; oi = int(np.bincount(ow[sl][m][ow[sl][m] >= 0]).argmax()) if (ow[sl][m] >= 0).any() else -1
        dd = dist[sl][m]; dn = (dd - dd.min()) / max(np.ptp(dd), 1)
        KIND[sl][m] = 3; OWN[sl][m] = oi; PAR[sl][m] = dn            # resolved to film seconds below
log('switch px: shadow born', int((KIND == 1).sum()), 'shadow died', int((KIND == 2).sum()), 'ground', int((KIND == 3).sum()))


# ── object states, in FILM seconds: each object's calendar window mapped to the film, stretched to a minimum screen time ──
def film_window(o):
    c0, c1 = (o.get('site0', o['ys']), o['yc']) if o['side'] == 'born' else (o['ds'], o['de'])
    f0 = clip01((eA - c0) / max(c1 - c0, 1e-3)) if c0 < eA else 0.0
    s0, s1 = film_at(max(c0, eA)), film_at(c1)
    md = (0.7 + 1.0 * min(1.0, o['h'] / 150.0)) if o['side'] == 'born' else (0.8 + 0.5 * min(1.0, o['h'] / 60.0))
    md *= (1 - f0)
    if s1 - s0 < md:
        c = (s0 + s1) / 2; s0, s1 = c - md / 2, c + md / 2
        if f0 > 0 or s0 < H0: s1 += H0 - s0 if f0 == 0 else 0; s0 = H0 if f0 == 0 else s0
        if f0 > 0: s0, s1 = H0, H0 + md
        if s1 > SEC - H1: s0 -= s1 - (SEC - H1); s1 = SEC - H1
    o['s0'], o['s1'], o['f0'] = s0, s1, f0
    if o['side'] == 'born' and 'site0' in o: o['q'] = (o['ys'] - o['site0']) / max(o['yc'] - o['site0'], 1e-3)
for o in OBJ: film_window(o)
for o in DIED:
    nx = [b for b in BORN if b['key'] in o.get('next', [])]
    o['next_s'] = -1.0 if o.get('cont') else (min([b['s0'] for b in nx]) if nx else o['s1'] + 0.5)
m3 = KIND == 3
if m3.any():
    s1o = np.array([o['s1'] for o in OBJ] + [(H0 + SEC - H1) / 2], np.float32)
    PAR[m3] = s1o[np.where(OWN[m3] >= 0, OWN[m3], len(OBJ))] - 0.1 + 0.5 * PAR[m3]
def ofrac(o, s):
    if s < o['s0']: return o['f0'] if o['f0'] > 0 else -1.0
    return min(1.0, o['f0'] + (1 - o['f0']) * (s - o['s0']) / max(o['s1'] - o['s0'], 1e-3))
def born_state(o, s):
    """(stage, f, hc): stage 0 none, 1 site, 2 foundation, 3 structure, 4 crown, 5 finish, 6 done"""
    f = ofrac(o, s)
    if f < 0: return 0, 0.0, 0.0
    if f >= 1: return 6, 1.0, o['h']
    if 'q' in o:                                                             # a long site phase (the Transit Center's box)
        if f < o['q']:
            fs = f / o['q']; return (1, fs / 0.35, 0.0) if fs < 0.35 else (2, (fs - 0.35) / 0.65, 0.0)
        f = 0.16 + 0.84 * (f - o['q']) / (1 - o['q'])
    if f < 0.06: return 1, f / 0.06, 0.0
    if f < 0.16: return 2, (f - 0.06) / 0.10, 0.0
    t_top, t_fin = (0.86, 0.93) if o['hroof'] >= 40 else (0.78, 0.80)
    if f < t_top:
        u = (f - 0.16) / (t_top - 0.16); sm_ = 0.45 * u + 0.55 * (0.5 - 0.5 * math.cos(math.pi * u))
        nfl = max(1, int(round(o['hroof'] / o['fl']))); x = sm_ * nfl; k = math.floor(x); fr = x - k
        hc = min(o['hroof'], (k + smooth(clip01(fr / 0.7))) * o['hroof'] / nfl)
        return 3, u, hc
    if f < t_fin: u = (f - t_top) / (t_fin - t_top); return 4, u, o['hroof'] + (o['h'] - o['hroof']) * smooth(u)
    return 5, (f - t_fin) / (1 - t_fin), o['h']
def died_state(o, s):
    """(stage, g, rem): 0 standing, 1 stripped, 2 taken down, 3 rubble, 4 cleared (until next use), 5 gone"""
    g = ofrac(o, s)
    if g < 0: return 0, 0.0, o['h']
    if g >= 1: return (4, 1.0, 0.0) if s < o['next_s'] else (5, 1.0, 0.0)
    if g < 0.1: return 1, g / 0.1, o['h']
    small = o['h'] < 15
    if (small and g < 0.35) or (not small and g < 0.75):
        u = (g - 0.1) / (0.25 if small else 0.65); e = u * u if small else smooth(u)
        return 2, u, o['hroof'] * (1 - e)
    if g < 0.9: return 3, (g - (0.35 if small else 0.75)) / (0.55 if small else 0.15), 0.0
    return 4, clip01(g), 0.0
def heights(s):
    """per object the height of its working top (born) / what is left (died)"""
    hc = np.zeros(len(OBJ), np.float32)
    for o in OBJ:
        if o['side'] == 'born': hc[o['i']] = born_state(o, s)[2]
        else: hc[o['i']] = died_state(o, s)[2]
    return hc


def draw_born(F, o, s):
    if o['kind'] == 'span':                  # a viaduct span: piers, then the decks, revealed by height (no site, no slab)
        f = ofrac(o, s)
        if f < 0: return
        M = o['M']; Z = o['Z']; hc = o['h'] * smooth(clip01(f)) * 1.02
        m = M & ((Z <= hc) | (f >= 1)); F[m] = o['pixf'][m]; return
    st, f, hc = born_state(o, s)
    if st == 0: return
    fx0, fy0, fx1, fy1 = o['box']; V = F; M = o['M']; foot = o['foot'] & M; Z = o['Z']; P_ = o['pixf']
    if st == 6: V[M] = P_[M]; return
    if st in (1, 2):
        e = foot & (o['fdist'] <= (f if st == 1 else 1.0) * 1.05)
        V[e] = EARTH[fy0:fy1, fx0:fx1][e]; GS[e] = True
        if st == 2:
            ff = f
            c = foot & (o['faxis'] <= ff)
            V[c] = CONC[fy0:fy1, fx0:fx1][c] * np.clip(o['shade'][c], 0.75, 1.15)[:, None] ** 0.3; GS[c] = True
        return
    if st in (3, 4, 5) and not o.get('hcA'):              # the foundation stays under the rising structure
        V[foot] = CONC[fy0:fy1, fx0:fx1][foot] * np.clip(o['shade'][foot], 0.75, 1.15)[:, None] ** 0.3; GS[foot] = True
    hr = o['hroof']; lagf = 4 if o['h'] >= 60 else (2 if o['h'] >= 20 else 1)
    if st == 3: lag = lagf * o['fl']
    elif st == 4: lag = lagf * o['fl'] * (1 - f)
    else: lag = 0.0
    hcw = min(hc, hr)
    # walls: the finished facade up to hc - lag, the open frame above it
    wall = M & ~o['roofp'] & (Z <= hcw) & (Z < hr + 0.01)
    if o.get('hcA'):              # the part the earlier key already showed going up stays the key's own until a re-cladding front,
        ff = clip01((ofrac(o, s) - o['f0']) / max(1 - o['f0'], 1e-3))      # rising from the ground over the rest of the build, passes
        wall &= ~((Z <= o['hcA']) & (Z > min(ff * o['h'], hcw - lag)))
    fin = wall & (Z <= hcw - lag)
    V[fin] = P_[fin]
    frm = wall & ~fin
    if o['h'] >= 60 and st in (3, 4):                     # climbing screens round the top two floors of a tower
        scr = frm & (Z > hcw - 2 * o['fl'])
        if scr.any():
            shs = o['shade'][scr][:, None] ** 0.6
            cc = np.nonzero(scr)[1]; pan = (np.mod(cc + fx0, 7) == 0)[:, None]
            V[scr] = np.array([190, 190, 186], np.float32) * shs * np.where(pan, 0.86, 1.0)
            frm = frm & ~scr
    if frm.any():
        sh = o['shade'][frm][:, None]
        # the open frame's interior is dark (no facade yet): only a trace of the finished facade (0.12, was 0.30: on a glass tower
        # the frame band read as a translucent ghost of the finished curtain wall over its neighbours)
        base = P_[frm] * 0.12 + np.array([62, 62, 64], np.float32) * sh ** 0.5 * 0.62
        g_ = base.mean(-1, keepdims=True); base = g_ * 0.6 + base * 0.4
        zz = Z[frm]; slab = np.mod(zz, o['fl']) < 0.75
        cc_ = np.nonzero(frm)[1] + fx0; colm = np.mod(cc_, max(6, int(round((8.0 if o['h'] >= 30 else 4.0) * S.PX_E)))) < 2   # columns
        base[colm & ~slab] = base[colm & ~slab] * 0.45 + np.array([150, 147, 140], np.float32) * sh[colm & ~slab] ** 0.6 * 0.55
        base[slab] = (np.array([178, 175, 168], np.float32) * sh[slab] ** 0.6)
        V[frm] = base
    # the top slab: the roof moved down to the working height
    dy = int(round((hr - hcw) * S.PX_Z))
    if not (o.get('hcA') and hcw <= o['hcA'] + 0.5):     # (its own top slab once it rises above the key's)
        rp = o['roofp']; T = np.zeros_like(rp)
        if dy <= 0: T[:] = rp
        elif dy < rp.shape[0]: T[dy:] = rp[:rp.shape[0] - dy]
        T &= M
        if T.any():
            src_r, src_c = np.nonzero(T); sr = src_r - dy
            roofpx = P_[sr, src_c]
            conc = CONC[fy0 + src_r, fx0 + src_c] * np.clip(o['shade'][sr, src_c], 0.75, 1.15)[:, None] ** 0.3
            if st in (3, 4): roofpx = conc
            elif st == 5:     # the roof is finished across, from one end (a front with a soft edge), not faded
                fr_ = np.clip(sr + int(round(hr * S.PX_Z)), 0, o['faxis'].shape[0] - 1); ax = o['faxis'][fr_, src_c]
                a = np.clip((f * 1.2 - ax) / 0.2, 0, 1)[:, None]; roofpx = conc * (1 - a) + roofpx * a
            V[src_r, src_c] = roofpx
            # the slab's front edge: a thin shadow line under it (reads as a floor plate)
            edge = T & ~np.roll(T, -1, 0) & M
            edge2 = np.roll(edge, 1, 0) & wall & ~T
            V[edge2] = V[edge2] * 0.72
    # the crown (pixels above the roof plane) rises last
    if st >= 4:
        cr = M & (Z > hr + 0.01) & (Z <= hc)
        V[cr] = P_[cr]


def RUB(o, m, fy0, fy1, fx0, fx1):
    """rubble: the building's own colour broken with the earth, mottled"""
    e = EARTH[fy0:fy1, fx0:fx1][m]; nn = n2[fy0:fy1, fx0:fx1][m][:, None]; n_ = n1[fy0:fy1, fx0:fx1][m][:, None]
    return np.clip((o['col'] * 0.45 + e * 0.55) * (0.78 + 0.16 * nn + 0.08 * n_), 0, 255)


def draw_died(F, o, s):
    st, g, rem = died_state(o, s)
    if st == 5: return
    if o['kind'] == 'span' and st >= 3: return           # a viaduct span leaves the street under it, not a lot
    fx0, fy0, fx1, fy1 = o['box']; V = F; M = o['M']; Z = o['Z']; P_ = o['pixf']; foot = o['foot'] & M
    if st == 0: V[M] = P_[M]; return
    if st == 1:
        a = 0.15 * smooth(g); X = P_[M]; gm = X.mean(-1, keepdims=True); V[M] = (X * (1 - 0.3 * smooth(g)) + gm * 0.3 * smooth(g)) * (1 - a); return
    X = P_; gm = X.mean(-1, keepdims=True); Xs = (X * 0.7 + gm * 0.3) * 0.85
    if st == 2:
        remc = np.clip(rem + o['jit'][None, :] * o['fl'] * (0.8 if rem > o['fl'] else rem / o['fl'] * 0.8), 0, None)
        keep = M & (Z <= remc)
        V[keep] = Xs[keep]
        brk = keep & (Z > remc - o['fl'] * 0.6)
        V[brk] = V[brk] * 0.62
        # rubble grows at the foot as it comes down (a building; a viaduct span drops onto the street)
        rub = foot & (o['fdist'] <= 0.25 + 0.75 * g) & ~keep & (o['kind'] != 'span')
        V[rub] = RUB(o, rub, fy0, fy1, fx0, fx1); GS[rub] = True
    elif st == 3:
        rub = foot & (o['fdist'] <= 1.0 - 0.8 * g)
        er = foot & ~rub
        V[er] = EARTH[fy0:fy1, fx0:fx1][er]; GS[er] = True
        V[rub] = RUB(o, rub, fy0, fy1, fx0, fx1); GS[rub] = True
    elif st == 4:
        e_ = foot
        if not o.get('next') and s >= o['s1']:      # no building follows: the lot's own ground (the later key) wipes in from its centre
            w_ = clip01((s - o['s1']) / max(o['next_s'] - o['s1'], 1e-3)); e_ = foot & (o['fdist'] > w_)
        V[e_] = EARTH[fy0:fy1, fx0:fx1][e_]; GS[e_] = True


# ── dust: billowing puffs along the working edge of a demolition and at its foot (film seconds: a short demolition still
# breathes); each puff a soft noisy blob, lit from the south-west, growing, rising and drifting north-east, then thinning out ──
PUFFS = []
for k in range(12):
    r = 64; yy, xx = np.mgrid[-2 * r:2 * r + 1, -2 * r:2 * r + 1].astype(np.float32)
    nz = nd.gaussian_filter(np.random.default_rng(500 + k).standard_normal(yy.shape).astype(np.float32), 6); nz /= nz.std() + 1e-6
    ang = np.random.default_rng(600 + k).uniform(0, math.pi); ca, sa = math.cos(ang), math.sin(ang)
    u_, v_ = (xx * ca + yy * sa) / 1.15, (-xx * sa + yy * ca) / 0.9
    base = (np.exp(-(u_ ** 2 + v_ ** 2) / (2 * (0.6 * r) ** 2)) ** 0.7) * np.clip(0.72 + 0.35 * nz, 0, 1.3)
    lit = np.clip(1.0 + 0.10 * (-xx - yy) / r, 0.8, 1.2)                 # the sun from the south-west: upper-left brighter
    PUFFS.append((base.astype(np.float32), lit.astype(np.float32)))
PCACHE = {}
def puff(k, r):
    r = max(3, int(r)); key = (k, r)
    if key not in PCACHE:
        b_, l_ = PUFFS[k]; n = 4 * r + 1
        PCACHE[key] = (cv2.resize(b_, (n, n), interpolation=cv2.INTER_AREA), cv2.resize(l_, (n, n), interpolation=cv2.INTER_AREA))
        if len(PCACHE) > 3000: PCACHE.clear()
    return PCACHE[key]
DUST = []
for o in DIED:
    fx0, fy0, fx1, fy1 = o['box']; cols = np.nonzero(o['M'].any(0))[0]
    if len(cols) == 0 or o.get('cont') or o['h'] < 12: continue     # (a house comes down without a dust cloud: it read as a smudge)
    small = o['h'] < 15
    s0, s1 = o['s0'] + 0.1 * (o['s1'] - o['s0']), o['s0'] + (0.35 if small else 0.75) * (o['s1'] - o['s0'])
    s1 = max(s1, s0 + 0.25); npf = int(np.clip(math.sqrt(o['n']) / 2.5, 8, 80)); rr = np.random.default_rng(o['i'] + 99)
    for k in range(npf):
        te = rr.uniform(s0, s1 + (0.25 if small else 0.1)); c = int(rr.choice(cols)); u = clip01((te - s0) / (s1 - s0))
        yfoot = o['ynear'][c]; hz = o['hroof'] * ((1 - u * u) if small else (1 - smooth(u)))
        base = rr.random() < (0.55 if small else 0.3)
        y_ = yfoot - rr.uniform(0, 6) if base else yfoot - hz * S.PX_Z - rr.uniform(-4, 8)
        R0 = (3 + 0.8 * math.sqrt(max(o['h'], 3))) * rr.uniform(0.7, 1.3) * (1.15 if base else 1.0)
        DUST.append(dict(te=te, life=rr.uniform(0.6, 1.1), x=fx0 + c, y=fy0 + y_, r0=R0, vx=rr.uniform(8, 20), vy=rr.uniform(-16, -6) * (0.5 if base else 1.0),
                         a=rr.uniform(0.16, 0.28), k=int(rr.integers(0, 12)), sp=rr.uniform(0.9, 1.3) if base else 1.0))
log('dust puffs', len(DUST))
DCOL = np.array([206, 201, 191], np.float32)       # a light, dry haze
def draw_dust(F, s):
    for p in DUST:
        u = (s - p['te']) / p['life']
        if u < 0 or u > 1: continue
        r = p['r0'] * (0.55 + 1.25 * math.sqrt(u)) * p['sp'] ** u
        x = p['x'] + p['vx'] * u * p['life']; y = p['y'] + p['vy'] * u * p['life']
        if not (math.isfinite(x) and math.isfinite(y)): continue
        a = p['a'] * min(1.0, u / 0.12) * (1 - u) ** 1.6
        kb, kl = puff(p['k'], r); h_, w_ = kb.shape; x0, y0 = int(x) - w_ // 2, int(y) - h_ // 2
        X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(W, x0 + w_), min(H, y0 + h_)
        if X1 <= X0 or Y1 <= Y0: continue
        al = np.clip(kb[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0] * a, 0, 0.8)[..., None]
        col = DCOL[None, None, :] * kl[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0][..., None]
        F[Y0:Y1, X0:X1] = F[Y0:Y1, X0:X1] * (1 - al) + col * al


ORDER = sorted(OBJ, key=lambda o: -o['cy'])
GSB = np.zeros((max(o['box'][3] - o['box'][1] for o in OBJ), max(o['box'][2] - o['box'][0] for o in OBJ)), bool); GS = GSB
for o in OBJ: o['Rabs'] = (np.arange(o['box'][1], o['box'][3], dtype=np.float32)[:, None] + np.zeros((1, o['box'][2] - o['box'][0]), np.float32))
def compose(s):
    """the canvas window at film second s (float RGB)"""
    t = year_at(s); hc = heights(s)
    sw = np.zeros((H, W), bool)
    k1 = KIND == 1; own = np.where(OWN >= 0, OWN, 0)
    sw |= k1 & (hc[own] >= PAR)
    k2 = KIND == 2; sw |= k2 & (hc[own] < PAR)
    sw |= (KIND == 3) & (s >= PAR)
    Fb = np.where(sw[..., None], B, AS)
    F = np.where((SB | SD)[..., None], E, Fb).astype(np.float32)
    DZ = np.full((H, W), -1e9, np.float32)
    for o in ORDER:                        # each object drawn on a scratch, then kept where it is the nearest (per-column depth)
        fx0, fy0, fx1, fy1 = o['box']; Vs = np.full((fy1 - fy0, fx1 - fx0, 3), np.nan, np.float32)
        GS[:] = False; gs = GS[:fy1 - fy0, :fx1 - fx0]
        globals()['GS'] = gs
        if o['side'] == 'born': draw_born(Vs, o, s)
        else: draw_died(Vs, o, s)
        globals()['GS'] = GSB
        wr = ~np.isnan(Vs[..., 0])
        if not wr.any(): continue
        # per-pixel depth: the image row of the ground point under what is drawn (ground stages: the pixel's own row; walls:
        # the wall's foot; roof and slab: the row plus the height in px)
        dz = np.where(gs, o['Rabs'], o['Rabs'] + o['Z'] * S.PX_Z)
        dzv = DZ[fy0:fy1, fx0:fx1]; ok = wr & (dz >= dzv - 0.5)
        F[fy0:fy1, fx0:fx1][ok] = Vs[ok]; dzv[ok] = dz[ok]
    draw_dust(F, s)
    return F, t


CAMK = [(k[0], k[1] - WX0, k[2] - WY0, k[3]) for k in PL.get('cam', [])]     # [film s, centre x, centre y, width] in canvas px
def cam_box(s):
    if not CAMK: return VX0, VY0, VX1, VY1
    ks = [k[0] for k in CAMK]
    if s <= ks[0]: c = CAMK[0][1:]
    elif s >= ks[-1]: c = CAMK[-1][1:]
    else:
        j = max(i for i in range(len(ks)) if ks[i] <= s); u = smooth((s - ks[j]) / max(ks[j + 1] - ks[j], 1e-6))
        c = [CAMK[j][q] * (1 - u) + CAMK[j + 1][q] * u for q in (1, 2, 3)]
    cx, cy, cw = c; ch = cw * OH / OW
    return cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2


def frame(fi):
    s = fi / FPS; SUBF = PL.get('sub', 1)
    if SUBF > 1:            # a touch of motion blur on what moves (a rising slab, dust); what stands still stays byte-identical
        acc = None
        for k in range(SUBF):
            Fk, tk = compose(max(0.0, min(SEC, s + (k - (SUBF - 1) / 2) / (SUBF * FPS))))
            acc = Fk if acc is None else acc + Fk
        F = acc / SUBF; t = year_at(s)
    else:
        F, t = compose(s)
    cx0, cy0, cx1, cy1 = cam_box(s)                   # the camera (a slow eased glide between plan keys; the view when none)
    ix0, iy0 = max(0, int(math.floor(cx0)) - 2), max(0, int(math.floor(cy0)) - 2); ix1, iy1 = min(W, int(math.ceil(cx1)) + 2), min(H, int(math.ceil(cy1)) + 2)
    V = np.clip(F[iy0:iy1, ix0:ix1] + 0.5, 0, 255).astype(np.uint8)
    im = Image.fromarray(V).resize((OW, OH), Image.LANCZOS, box=(cx0 - ix0, cy0 - iy0, cx1 - ix0, cy1 - iy0))
    if PL.get('labels', True):
        dr = ImageDraw.Draw(im); FT = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', int(OH * 0.05)); FC = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', int(OH * 0.024))
        lab = 'today' if t >= eB - 0.01 and D['yB'] == 'now' else f'{int(t)}'
        dr.text((int(OW * 0.028) + 2, OH - int(OH * 0.1) + 2), lab, font=FT, fill=(0, 0, 0)); dr.text((int(OW * 0.028), OH - int(OH * 0.1)), lab, font=FT, fill=(255, 255, 255))
        k = 0
        for a, b, txt in PL.get('captions', []):
            if a - 0.1 <= t <= b + 0.3:
                yy = int(OH * 0.03) + k * int(OH * 0.045); w_ = dr.textlength(txt, font=FC)
                dr.rounded_rectangle((int(OW * 0.02), yy - 6, int(OW * 0.02) + w_ + 26, yy + int(OH * 0.032)), 6, fill=(20, 20, 18))
                dr.text((int(OW * 0.02) + 13, yy), txt, font=FC, fill=(255, 255, 255)); k += 1
    return im


if __name__ == '__main__':
    OUT = PL['out']; os.makedirs(OUT + '_frames', exist_ok=True)
    clip = PL.get('clip'); FR = [fi for fi in range(N) if not clip or clip[0] <= fi <= clip[1]]
    if PL.get('only'):
        for fi in PL['only']: frame(fi).save(f"{OUT}_frames/{fi:04d}.png"); log('still', fi, round(year_at(fi / FPS), 2))
        sys.exit(0)
    import multiprocessing as mp
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{OW}x{OH}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'slow', '-crf', str(PL.get('crf', 15)), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT + '.mp4'], stdin=subprocess.PIPE)
    st = PL.get('stills', 30)
    def job(fi):
        im = frame(fi)
        if fi % st == 0: im.save(f'{OUT}_frames/{fi:04d}.jpg', quality=92)
        return im.tobytes()
    with mp.get_context('fork').Pool(PL.get('workers', 6)) as pool:
        for k, b_ in enumerate(pool.imap(job, FR, chunksize=1)):
            ff.stdin.write(b_)
            if k % 30 == 0: log('frame', k, '/', len(FR))
    ff.stdin.close(); ff.wait()
    json.dump(dict(frames=len(FR), fps=FPS, timeline=[[round(s, 3), round(year_at(s), 3)] for s in np.arange(0, SEC + 1e-6, 0.5)],
                   objects=[dict(key=o['key'], side=o['side'], h=round(o['h'], 1), window=[round(o.get('ys', o.get('ds', 0)), 2), round(o.get('yc', o.get('de', 0)), 2)],
                                 film=[round(o['s0'], 2), round(o['s1'], 2)]) for o in OBJ]),
              open(OUT + '.timing.json', 'w'), indent=1)
    log(OUT + '.mp4', len(FR), 'frames')
