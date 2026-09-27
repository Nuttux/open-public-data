"""prep.py: one step A -> B of the transitions grammar over a canvas window: the objects that change (born / died), their
sprites, per-pixel heights and footprints, their dates, the consistent start key A* and the plates. Cached for render.py.

    python3 prep.py <yA> <yB> <x0,y0,x1,y1> <out.pkl>        (years as in stage.YEARS: 1938 1959 1985 2006 now)

A* (the start key) = the later key B wherever the thing shown did not change (static buildings keep B's own pixels, so a
building that stands in both years never changes rendition), the earlier key A on what did change (the objects gone by B, the
ground that changed, what stood behind the objects born in the step), relit where a changing object's shadow falls."""
import sys, os, json, math, pickle, time, resource
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
import stage as S, objects as O

T0 = time.time(); RSS_U = 2**30 if sys.platform == 'darwin' else 2**20     # (ru_maxrss: bytes on macOS, KB on Linux)
def log(*a): print(f'[{time.time() - T0:6.1f}s {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / RSS_U:4.2f}G]', *a, flush=True)   # (peak RSS so far)


def rect_ring(c, ang, L, W):
    a = math.radians(ang); u = (math.cos(a), math.sin(a)); v = (-math.sin(a), math.cos(a))
    return [(c[0] + su * L / 2 * u[0] + sv * W / 2 * v[0], c[1] + su * L / 2 * u[1] + sv * W / 2 * v[1]) for su, sv in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def strip_ring(path, w):
    """a closed ring round a polyline of width w"""
    P = np.array(path, float); n = len(P); L, R = [], []
    for i in range(n):
        d = P[min(i + 1, n - 1)] - P[max(i - 1, 0)]; d /= max(np.hypot(*d), 1e-6); nrm = np.array([-d[1], d[0]])
        L.append(tuple(P[i] + nrm * w / 2)); R.append(tuple(P[i] - nrm * w / 2))
    return L + R[::-1]


def extra_prisms(era, wbox):
    """what objects.standing() does not hold: the lost structures (Transbay Terminal and its loop, era_lost / era.STRUCTURES)
    and the landmark models' true outlines (Transit Center, Salesforce Tower: footprints.json)"""
    EA, _ = O._era(); out = []
    F = json.load(open(f'{S.SNAP}/data/landmarks/footprints.json'))
    if era is not None and era < 2011.67:
        import era_lost as EL
        for e in EL.LOST:
            if e['key'] == 'transbay_terminal' and e['y0'] <= era < e['y1']:
                f = e['form']; r = rect_ring(f['c'], f['ang'], f['L'], f['W'])
                out.append(dict(key='Xterminal', kind='lost', ring=r, cx=f['c'][0], cy=f['c'][1], h=f['h'], dem=e['dem'], year=1939))
    if era is not None:
        # the lost viaducts (era.STRUCTURES: the Embarcadero and Central freeways, the Transbay loop), cut into spans of ~45 m
        # along their path: each span is built or taken down on its own, one after another (K3)
        for st in EA.STRUCTURES:
            if not (st['y0'] <= era < st['y1']): continue
            P_ = np.array(st['path'], float); seg = np.hypot(*np.diff(P_, axis=0).T); cum = np.concatenate([[0], np.cumsum(seg)]); L = cum[-1]
            ns = max(1, int(round(L / 45.0))); decks = st.get('decks', [7.5, 14.0])
            for i in range(ns):
                a, b = L * i / ns, L * (i + 1) / ns
                pts = [(float(np.interp(a, cum, P_[:, 0])), float(np.interp(a, cum, P_[:, 1])))] + \
                      [tuple(P_[k]) for k in range(len(P_)) if a < cum[k] < b] + [(float(np.interp(b, cum, P_[:, 0])), float(np.interp(b, cum, P_[:, 1])))]
                r = strip_ring(pts, st['w'] + 2.0); cx = float(np.mean([p[0] for p in pts])); cy = float(np.mean([p[1] for p in pts]))
                out.append(dict(key=f"X{st['k']}_{i:02d}", kind='span', struct=st['k'], si=i, ns=ns, ring=r, cx=cx, cy=cy, h=max(decks) + 1.2,
                                dem=st.get('dem'), y0s=st['y0'], y1s=st['y1'], year=int(st['y0'])))
    if era is None or era >= 2018.4:
        r = [tuple(p) for p in F['transit_center']['outer'][0]]
        if r[0] == r[-1]: r = r[:-1]
        out.append(dict(key='Ltransit', kind='lm', lm='transit_center', ring=r, cx=float(np.mean([p[0] for p in r])), cy=float(np.mean([p[1] for p in r])),
                        h=22.4, year=2018))
    return out


def col_rows(ring, zg, win, fx0, fy0, fw):
    """per bbox column, the footprint's near (max) and far (min) image rows, analytic (the footprint may lie outside the window)"""
    X, Y = S.w2c(np.array([p[0] for p in ring]), np.array([p[1] for p in ring]), zg); X = X - win[0] - fx0; Y = Y - win[1] - fy0
    xc = np.arange(fw) + 0.5; yn = np.full(fw, -np.inf); yf = np.full(fw, np.inf); n = len(X)
    for i in range(n):
        x1, y1, x2, y2 = X[i], Y[i], X[(i + 1) % n], Y[(i + 1) % n]
        if abs(x2 - x1) < 1e-6: continue
        m = (xc >= min(x1, x2)) & (xc <= max(x1, x2)); yy = y1 + (xc[m] - x1) * (y2 - y1) / (x2 - x1)
        yn[m] = np.maximum(yn[m], yy); yf[m] = np.minimum(yf[m], yy)
    ok = np.isfinite(yn)
    if not ok.any(): return np.full(fw, Y.max(), np.float32), np.full(fw, Y.min(), np.float32)
    idx = np.nonzero(ok)[0]; nn = idx[np.clip(np.searchsorted(idx, np.arange(fw)), 0, len(idx) - 1)]
    return np.where(ok, yn, yn[nn]).astype(np.float32), np.where(ok, yf, yf[nn]).astype(np.float32)


def periodic_fill(img, src, tgt, period):
    """fill the target pixels of a building from its own source pixels: the same column k periods (floors) up or down, then
    the same row mirrored from the nearest source run, then the nearest source pixel"""
    out = img.copy(); got = ~tgt.copy(); h, w = tgt.shape
    rr, cc = np.nonzero(tgt)
    for k in range(1, 60):
        for sg in (-1, 1):
            r2 = rr + sg * k * period; ok = (~got[rr, cc]) & (r2 >= 0) & (r2 < h)
            ok2 = np.zeros_like(ok); ok2[ok] = src[r2[ok], cc[ok]]
            out[rr[ok2], cc[ok2]] = img[r2[ok2], cc[ok2]]; got[rr[ok2], cc[ok2]] = True
        if got[rr, cc].all(): break
    rest = tgt & ~got
    if rest.any() and src.any():
        _, (iy, ix) = nd.distance_transform_edt(~src, return_indices=True)
        out[rest] = img[iy[rest], ix[rest]]
    return out


def main(yA, yB, win, outp, bsrc=None, astar_out=None):
    EA, _ = O._era()
    eA, eB = S.YEARS[yA], S.YEARS[yB]
    x0, y0, x1, y1 = win; W, H = x1 - x0, y1 - y0
    xs, ys = S.c2w(np.array([x0, x1, x0, x1]), np.array([y0, y0, y1, y1]), 0.0); wbox = (xs.min(), ys.min(), xs.max(), ys.max())
    A = S.load_key(yA, win); B = np.load(bsrc) if bsrc else S.load_key(yB, win); log('keys', A.shape, 'B from', bsrc or 'the key')
    assert B.shape == A.shape, (B.shape, A.shape)
    # what the earlier key may have copied is the later year's ORIGINAL key (compose_hard: outside its masks, the next year's
    # final pixels), not our consistent B: leak tests compare A with it
    EK = S.KEYS == 'ek2' and yA != 'now'
    # (ek2: no leak tests, so no reload of the later key: memory)
    DDo = None if EK else np.abs(A.astype(np.int16) - (S.load_key(yB, win) if bsrc else B).astype(np.int16)).max(-1)
    gA_raw = S.gids(S.load_pass(yA, 'gid', win)); gB_raw = S.gids(S.load_pass(yB, 'gid', win))
    rawA, rawB = S.load_pass(yA, 'class', win), S.load_pass(yB, 'class', win); cA = S.classes(rawA); cB = S.classes(rawB); log('passes')
    # ek2 (stage.KEYS): the earlier key is the year's OWN generation (no copies of the later key): changes are found in the RENDERS
    # (what the two years' scenes differ in), never in the keys (two generations of the same street differ everywhere)
    carm = lambda a: (a[..., 0] > 200) & (a[..., 1] > 90) & (a[..., 1] < 170) & (a[..., 2] < 60)
    CAR = carm(rawA) | carm(rawB); del rawA, rawB
    BLA_s = nd.gaussian_filter(S.load_pass(yA, 'beauty', win).astype(np.float32), (1.0, 1.0, 0))
    BLB_s = nd.gaussian_filter(S.load_pass(yB, 'beauty', win).astype(np.float32), (1.0, 1.0, 0))
    RD = np.abs(BLA_s - BLB_s).max(-1) > 30
    # the renders' chromaticity difference (a pure light change keeps it low), kept alone so the two float renders can go (memory)
    nrd = lambda a, b: np.abs(a / (a.sum(-1, keepdims=True) + 6) - b / (b.sum(-1, keepdims=True) + 6)).max(-1)
    if not EK: NRD = nrd(BLA_s, BLB_s); del BLA_s, BLB_s       # (ek2: after the renders' tone match, below)
    PA = O.standing(eA, wbox) + extra_prisms(eA, wbox)
    PB = O.standing(None if yB == 'now' else eB, wbox) + extra_prisms(None if yB == 'now' else eB, wbox)
    if yB == 'now':      # the Transit Center model replaces its four record footprints
        tc = {'g137652', 'g137653', 'g137629', 'g137642'}; PB = [b for b in PB if b['key'] not in tc]
        for b in PB:
            if b['key'] == 'L900011063': b['h'] = 326.0; b['hroof'] = 296.0
            if b['key'] == 'L900010917': b['h'] = 245.0; b['hroof'] = 210.0
    O.ground_z(PA, gA_raw, cA, win); O.ground_z(PB, gB_raw, cB, win)
    log('prisms', len(PA), len(PB))
    # ── identity maps: painter's prisms, overridden by the real gid pass where it has an id ──────────────────────────
    def idmap(P, graw, cls):
        M = O.id_map_z(P, win)                                            # index into P, -1 none (depth-tested per column)
        kidx = {b['key']: i for i, b in enumerate(P)}
        solid = np.isin(cls, [S.ROOF, S.FACADE, S.LANDMARK])
        real = (graw > 0) & solid
        if real.any():
            u, inv = np.unique(graw[real], return_inverse=True)
            m_ = np.array([kidx.get(f'g{S.decode_gid(int(g))}', kidx.get(f's{S.decode_gid(int(g))}', kidx.get(f'b{S.decode_gid(int(g))}', -2))) for g in u])
            v = m_[inv]; keep = v >= 0; rr = np.nonzero(real)
            M[rr[0][keep], rr[1][keep]] = v[keep]
        M[~solid & (cls != S.OTHER)] = -1
        return M
    MA = idmap(PA, gA_raw, cA); MB = idmap(PB, gB_raw, cB); log('id maps')
    kA = {b['key']: i for i, b in enumerate(PA)}; kB = {b['key']: i for i, b in enumerate(PB)}
    # the same record's own building in both keys is the same building (a height the LiDAR corrected today, a landmark model
    # replacing the generic one: the renders differ, history does not): static, B's pixels wherever B shows it
    def same(a, b): return not a.get('rise') and not b.get('rise')
    static = {k for k in kA if k in kB and same(PA[kA[k]], PB[kB[k]])}
    died = [k for k in kA if k not in static]; born = [k for k in kB if k not in static]
    log('static', len(static), 'died', len(died), 'born', len(born))
    # ── objects ────────────────────────────────────────────────────────────────────────────────────────────────────
    objs = []
    DD = np.abs(A.astype(np.int16) - B.astype(np.int16)).max(-1)
    def geometry(b):
        """per image column of the prism: ground near/far rows, roof rows; the footprint polygon raster (window coords)"""
        zg = b.get('zg', 0.0); X, Y = O.poly_px(b, zg, win)
        return X, Y, zg
    # pass 1: each changing object's pixels in its own key (label images), static pixels = both id maps on the same static key
    # (integer codes, not key strings indexed per pixel: a string array per pixel took ~250 B/px)
    code = {k: n for n, k in enumerate(sorted(set(kA) | set(kB)))}
    cdA = np.array([code[b['key']] for b in PA] + [-1]); cdB = np.array([code[b['key']] for b in PB] + [-2])
    stA = np.array([b['key'] in static for b in PA] + [False])
    stat_px = (MA >= 0) & (MB >= 0) & (cdA[MA] == cdB[MB]) & stA[MA]
    if EK:
        # ek2: the RENDERS decide what changed, but two era renders differ in tone where nothing changed (the era's ground and
        # street materials, exposure, a facade's aging: 35 % of static building px and half the ground differed by > 30 in
        # 1985 -> 2006). Render A is matched to render B per class and channel (a quantile LUT on the px of that class in both
        # years; for buildings the static ones only) before the difference: what remains is a change of SHAPE or of local light
        BLA_m = BLA_s.copy(); qq = np.linspace(0.5, 99.5, 100); RD0 = RD.mean()
        for c in range(8):
            tgt = cA == c
            mc = tgt & (cB == c) & ~CAR & (stat_px if c in (S.ROOF, S.FACADE, S.LANDMARK) else True)
            idx = np.nonzero(mc.ravel())[0]
            if len(idx) < 5000: continue
            idx = idx[:: max(1, len(idx) // 300000)]
            for ch in range(3):
                qa = np.maximum.accumulate(np.percentile(BLA_s[..., ch].ravel()[idx], qq) + np.arange(100) * 1e-3)
                qb = np.percentile(BLB_s[..., ch].ravel()[idx], qq)
                BLA_m[..., ch][tgt] = np.interp(BLA_s[..., ch][tgt], qa, qb)
        RD = np.abs(BLA_m - BLB_s).max(-1) > 30; NRD = nrd(BLA_m, BLB_s)
        lw_ = np.array([0.299, 0.587, 0.114], np.float32); LrA, LrB = BLA_m @ lw_, BLB_s @ lw_; del BLA_m, BLA_s, BLB_s
        log(f'ek2: renders tone-matched per class: changed {RD0:.3f} -> {RD.mean():.3f} of the window, static buildings {(RD & stat_px).sum() / max(stat_px.sum(), 1):.3f}')
    if EK:
        # the year's generation graded to the later key on what did not change (the same buildings seen in both keys): one monotone
        # curve per channel for the window (global: no local smudge), so a building of the year sits in the later key's light
        tm = (stat_px | (np.isin(cA, [S.GROUND, S.STREET, S.TREE]) & (cA == cB))) & (cA == cB) & (cA != S.WATER) & ~CAR & ~nd.binary_dilation(RD, iterations=4)
        idx = np.nonzero(tm.ravel())[0][::5]
        if len(idx) > 20000:
            q = np.linspace(0.5, 99.5, 100); A = A.copy(); Af = A.reshape(-1, 3); Bf = B.reshape(-1, 3)
            for ch in range(3):
                qa = np.percentile(Af[idx, ch], q) + np.arange(100) * 1e-3; qb = np.percentile(Bf[idx, ch], q)
                lut = np.clip(np.interp(np.arange(256), np.maximum.accumulate(qa), qb) + 0.5, 0, 255).astype(np.uint8)
                A[..., ch] = lut[A[..., ch]]
            log('ek2: the year graded to the later key on', len(idx) * 5, 'static px')
        DD = np.abs(A.astype(np.int16) - B.astype(np.int16)).max(-1)
    LAB = {'died': np.zeros((H, W), np.int32), 'born': np.zeros((H, W), np.int32)}; CAND = []
    for side, keys, P, M, cls in (('died', died, PA, MA, cA), ('born', born, PB, MB, cB)):
        kidx = {b['key']: i for i, b in enumerate(P)}
        for k in keys:
            b = P[kidx[k]]; m = M == kidx[k]
            if b['kind'] in ('lost', 'span'):     # a lost structure has no id: its whole prism raster (not only where the keys
                im = Image.new('L', (W, H)); dr = ImageDraw.Draw(im)       # differ: a key may already hold a ghost of it)
                for p in O.silhouette_polys(b, win): dr.polygon([(float(x), float(y)) for x, y in p], fill=1)
                m = (np.asarray(im) > 0) & (cls != S.WATER) & ~stat_px
            if m.sum() < 40: continue
            CAND.append((side, k, b)); LAB[side][m & (LAB[side] == 0)] = len(CAND)
    # pass 2: changed pixels no object owns (a spire, a brace, a rooftop kit outside the record's prism) go to the nearest
    # changing object within 14 px, so nothing of a future building shows in the past (and nothing of a gone one stays)
    for side, cls, oth in (('born', cB, 'died'), ('died', cA, 'born')):
        L_ = LAB[side]; U = (DD > 20) & ~stat_px & np.isin(cls, [S.ROOF, S.FACADE, S.LANDMARK, S.OTHER]) & (L_ == 0)
        if L_.any() and U.any():
            dist, (iy, ix) = nd.distance_transform_edt(L_ == 0, return_indices=True)
            cl = U & (dist <= 14); L_[cl] = L_[iy[cl], ix[cl]]; log('claimed', side, int(cl.sum()))
            if side == 'born':      # a landmark model's parts outside its record's outline (braces, fins): claimed over static pixels too
                U2 = (DD > 20) & (cls == S.LANDMARK) & (L_ == 0) & (LAB['died'] == 0)
                cl2 = U2 & (dist <= 10); L_[cl2] = L_[iy[cl2], ix[cl2]]; log('claimed landmark parts', int(cl2.sum()))
    # the earlier key's anachronisms: where it shows exactly today's pixels on an object that changes (a landmark with no id in
    # the passes escaped compose_hard's mask: Salesforce's crown and 181 Fremont stand in the 2006 key), its own Blender render of
    # the year, brought to the key's colours by a per-channel fit on the pixels that did not change
    SOLS = [S.ROOF, S.FACADE, S.LANDMARK, S.OTHER]
    # inside a changing object, the two years' RENDERS differ (a viaduct deck over the street, a tower over a lot) but the two
    # KEYS are equal: the earlier key copied the later one (compose_hard missed it: a structure classed as street, a gid-0 model)
    rdiff = RD
    if EK: anach = np.zeros((H, W), bool)       # (ek2: the year's own generation never copied the later key: no leaks to repair)
    else:
     anach = nd.binary_opening(((LAB['born'] > 0) | (LAB['died'] > 0)) & (DDo < 10) & (np.isin(cB, SOLS) | rdiff), iterations=1)
     anach = nd.binary_dilation(anach, iterations=1) & ((LAB['born'] > 0) | (LAB['died'] > 0))      # thin leaks too (a crown lattice), with their edges
     # and anything the later year's render has that the earlier year's render has not (a viaduct, a pier shed, a prop), shown the
     # same in both keys: the earlier key leaked it
     SOLT = SOLS + [S.TREE]                 # (a tree too: today's palms along the Embarcadero were planted after 1991)
     leak = nd.binary_opening((DDo < 10) & np.isin(cB, SOLT) & ~np.isin(cA, SOLT) & ~stat_px, iterations=1)
     leak = nd.binary_dilation(leak, iterations=1) & np.isin(cB, SOLT) & ~np.isin(cA, SOLT) & ~stat_px
     anach |= leak
     # leaks are regions, not pixels: inside each changing object, the leaked pixels closed into patches; an object that leaked on
     # more than a quarter of its pixels is replaced whole (a coherent render of it rather than a patchwork of it and its leak)
     for j_, (side_, k_, b_) in enumerate(CAND):
         mo = LAB[side_] == j_ + 1; n_ = int(mo.sum())
         if n_ < 50: continue
         la = anach & mo
         if la.sum() > 0.25 * n_: anach |= mo
         elif la.any(): anach |= nd.binary_closing(la, iterations=3) & mo
    FITTED = None
    if EK: anach[:] = False                     # (ek2: the year's own generation never copied the later key: no leaks to repair)
    if anach.sum() > 500:
        BL = S.load_pass(yA, 'beauty', win).astype(np.float32)
        fit = stat_px & (DD < 12) & (np.abs(BL - A.astype(np.float32)).max(-1) < 80)
        idx = np.nonzero(fit.ravel())[0]
        if len(idx) < 2000:        # too few static pixels to fit the render to the key (open water): the whole window instead
            idx = np.nonzero(((DD < 12) & (np.abs(BL - A.astype(np.float32)).max(-1) < 80)).ravel())[0]
        if len(idx) < 2000: idx = np.arange(0, A.shape[0] * A.shape[1], 97)
        idx = idx[:: max(1, len(idx) // 400000)]
        A = A.copy(); Af_ = A.reshape(-1, 3).astype(np.float32); Bf_ = BL.reshape(-1, 3)
        BLs = nd.gaussian_filter(BL, (0.8, 0.8, 0))                    # the render's noise softened
        fitted = np.zeros_like(BL)
        for ch in range(3):
            a_, b_ = np.polyfit(Bf_[idx, ch], Af_[idx, ch], 1); fitted[..., ch] = a_ * BLs[..., ch] + b_
        FITTED = np.clip(fitted, 0, 255)
        # then each patch brought to the key's own tone around it (mean and spread in a 24 px ring outside the patch)
        lab_, nlab = nd.label(anach)
        for k_, sl_ in enumerate(nd.find_objects(lab_)):
            y0_, y1_, x0_, x1_ = max(0, sl_[0].start - 30), min(H, sl_[0].stop + 30), max(0, sl_[1].start - 30), min(W, sl_[1].stop + 30)
            m_ = lab_[y0_:y1_, x0_:x1_] == k_ + 1; ring = nd.binary_dilation(m_, iterations=24) & ~m_ & ~anach[y0_:y1_, x0_:x1_]
            if ring.sum() < 50 or m_.sum() < 10: continue
            src_ = fitted[y0_:y1_, x0_:x1_]; ref_ = A[y0_:y1_, x0_:x1_].astype(np.float32)
            mu_s = np.clip(src_[m_].mean(0), 8, None); mu_r = ref_[ring].mean(0)
            g_ = np.clip((0.6 * mu_r + 0.4 * mu_s) / mu_s, 0.6, 1.6)          # a gain (never pushes a dark facade to black)
            A[y0_:y1_, x0_:x1_][m_] = np.clip(src_[m_] * g_, 0, 255).astype(np.uint8)
        # better than the render where the object shows itself elsewhere in the key: the leaked pixels of an object copied from
        # its own valid pixels, along its axis (a viaduct span: along its path) or a whole number of floors up or down (a building)
        nown = 0
        for j_, (side_, k_, b_) in enumerate(CAND):
            if side_ != 'died' or b_['kind'] in ('span', 'lost'): continue    # (a born object's pixels in A are what stood there before;
            mo = LAB['died'] == j_ + 1                                         #  a viaduct's own pixels are too few and mixed: its render)
            lk = mo & anach
            if lk.sum() < 20: continue
            ok_src = nd.binary_erosion(mo & ~anach, iterations=2)
            if ok_src.sum() < 3 * lk.sum(): continue
            yy_, xx_ = np.nonzero(mo); y0_, y1_, x0_, x1_ = yy_.min(), yy_.max() + 1, xx_.min(), xx_.max() + 1
            if b_['kind'] == 'span':
                P_ = np.array(b_['ring'], float); Xp, Yp = S.w2c(P_[:, 0], P_[:, 1], 0.0)
                d_ = np.array([Xp.max() - Xp.min(), Yp[np.argmax(Xp)] - Yp[np.argmin(Xp)]]); d_ = d_ / max(np.hypot(*d_), 1e-6)
                offs = [(int(round(d_[1] * t)), int(round(d_[0] * t))) for t in range(12, 400, 12) for t in (t, -t)]
            else:
                per = max(8, int(round(2 * (3.9 if b_['h'] >= 30 else 3.4) * S.PX_Z)))
                offs = [(sg * k * per, 0) for k in range(1, 40) for sg in (1, -1)]
            ly, lx = np.nonzero(lk); got = np.zeros(len(ly), bool)
            for oy_, ox_ in offs:
                sy_, sx_ = ly + oy_, lx + ox_; inb = (~got) & (sy_ >= 0) & (sy_ < H) & (sx_ >= 0) & (sx_ < W)
                q = np.zeros(len(ly), bool); q[inb] = ok_src[sy_[inb], sx_[inb]]
                A[ly[q], lx[q]] = A[sy_[q], sx_[q]]; got |= q
                if got.all(): break
            nown += int(got.sum())
        DD = np.abs(A.astype(np.int16) - B.astype(np.int16)).max(-1)
        log('anachronisms of today in the earlier key replaced by its own render (fitted):', int(anach.sum()), '; from the object itself:', nown)
    # a tree planted later (a tree in the later render, none in the earlier one) is not in the earlier year: the earlier key's
    # pixels there (an exact copy of it, or a translucent ghost of it) inpainted from the ground around (small patches)
    tadd = (cB == S.TREE) & (cA != S.TREE) & ~stat_px & (LAB['born'] == 0) & (LAB['died'] == 0)
    tadd = nd.binary_dilation(nd.binary_opening(tadd, iterations=1), iterations=2) & ~stat_px & ~np.isin(cA, SOLS) & (cA != S.WATER)
    if tadd.sum() > 20 and not EK:
        import cv2
        A = cv2.inpaint(np.ascontiguousarray(A), tadd.astype(np.uint8), 4, cv2.INPAINT_TELEA); log('trees planted later removed from the earlier key:', int(tadd.sum()))
    # a structure built later over WATER: in the earlier key its place is open water, the later key's water shifted from beside
    # it (the water of A* is the later key's where it is water in both years), never the earlier key's ghost of it
    nwat = 0
    wz = (LAB['born'] > 0) & (cA == S.WATER) & (cB != S.WATER)
    if wz.sum() > 20:
        wsrc = (cA == S.WATER) & (cB == S.WATER) & (LAB['born'] == 0) & (LAB['died'] == 0)
        ly, lx = np.nonzero(wz); got = np.zeros(len(ly), bool)
        for t in range(48, 2000, 48):
            for ox_ in (t, -t):
                sx_ = lx + ox_; inb = (~got) & (sx_ >= 0) & (sx_ < W); q = np.zeros(len(ly), bool); q[inb] = wsrc[ly[inb], sx_[inb]]
                A[ly[q], lx[q]] = B[ly[q], sx_[q]]; got |= q
            if got.all(): break
        nwat = int(got.sum())
        if nwat: A = A; log('water under structures built later:', nwat)
    DD = np.abs(A.astype(np.int16) - B.astype(np.int16)).max(-1)
    for j, (side, k, b) in enumerate(CAND):
        K = B if side == 'born' else A
        m = LAB[side] == j + 1
        n = int(m.sum())
        if n < 40: continue
        yy, xx = np.nonzero(m); bx0, bx1, by0, by1 = xx.min(), xx.max() + 1, yy.min(), yy.max() + 1
        X, Y, zg = geometry(b); hroof = b.get('hroof', b['h'])
        fx0, fx1 = int(min(bx0, X.min())) - 2, int(max(bx1, X.max())) + 3; fy0, fy1 = int(min(by0, Y.min() - b['h'] * S.PX_Z)) - 2, int(max(by1, Y.max())) + 3
        fx0, fy0 = max(fx0, 0), max(fy0, 0); fx1, fy1 = min(fx1, W), min(fy1, H)
        fw, fh = fx1 - fx0, fy1 - fy0
        fim = Image.new('L', (fw, fh)); ImageDraw.Draw(fim).polygon(list(zip((X - fx0).tolist(), (Y - fy0).tolist())), fill=1)
        foot = np.asarray(fim) > 0
        tim = Image.new('L', (fw, fh)); ImageDraw.Draw(tim).polygon(list(zip((X - fx0).tolist(), (Y - hroof * S.PX_Z - fy0).tolist())), fill=1)
        top = np.asarray(tim) > 0
        sp = m[fy0:fy1, fx0:fx1]
        o = dict(key=k, side=side, kind=b['kind'], h=float(b['h']), hroof=float(hroof), zg=float(zg), cx=b['cx'], cy=b['cy'],
                 year=b.get('year'), rise=b.get('rise'), box=(fx0, fy0, fx1, fy1), sprite=sp, foot=foot, top=top,
                 ynear=None, yfar=None, pix=K[fy0:fy1, fx0:fx1].copy(), n=n, ring=b['ring'], gone_by=b.get('gone_by'), dem=b.get('dem'),
                 lm=b.get('lm'), nb_year=b.get('nb_year'), **{k_: b[k_] for k_ in ('struct', 'si', 'ns', 'y0s', 'y1s') if k_ in b})
        o['ynear'], o['yfar'] = col_rows(b['ring'], zg, win, fx0, fy0, fw); o['i'] = len(objs)
        objs.append(o)
    log('objects', len(objs), 'born', sum(o['side'] == 'born' for o in objs), 'died', sum(o['side'] == 'died' for o in objs))
    # ── dates ──────────────────────────────────────────────────────────────────────────────────────────────────────
    for o in objs:
        if o['side'] == 'born':
            if o['key'] == 'L900011063': o['ys'], o['yc'] = 2013.24, 2017.0
            elif o['key'] == 'L900010917': o['ys'], o['yc'] = 2013.5, 2016.95
            elif o['key'] == 'Ltransit': o['ys'], o['yc'], o['site0'] = 2016.0, 2018.4, 2011.75   # SOURCED: built 2010-18, opened Aug 2018
            elif o['kind'] == 'span':    # built span after span from the path's start (CONVENTION on the order) over the SOURCED window
                T0, T1 = (1957.0, 1959.1) if o['struct'] == 'embarcadero_fwy' else (o['y0s'] - 2.0, o['y0s'])
                o['ys'] = T0 + (T1 - T0) * 0.8 * o['si'] / max(o['ns'], 1); o['yc'] = o['ys'] + 0.2 * (T1 - T0)
            else:
                gid = int(o['key'][1:]) if o['key'][0] in 'g' else 0
                y = EA.RECORD_YEAR_FIX.get(gid, o['year'] or eB)
                yc = y + 0.1 + 0.8 * EA._u(gid, 9); ys_ = yc - EA.rise_years(o['h'])
                o['ys'], o['yc'] = ys_, yc
            pa_ = PA[kA[o['key']]] if o['key'] in kA else None
            if pa_ is not None and pa_.get('rise'):     # already going up in the earlier key: how high it stood there
                o['hcA'] = float(pa_['h']) * EA.construction_stage(pa_['rise'])[0]
        else:
            if o['kind'] == 'span':      # SOURCED demolition window (era.STRUCTURES dem), spans from the path's far end back
                D0, D1 = o['dem'] if o.get('dem') else (o['y1s'] - 0.6, o['y1s']); k_ = o['ns'] - 1 - o['si']
                o['ds'] = D0 + (D1 - D0) * 0.82 * k_ / max(o['ns'], 1); o['de'] = o['ds'] + 0.18 * (D1 - D0)
            elif o['kind'] == 'lost': o['ds'], o['de'] = o['dem']
            elif o['key'] in kB:        # the same record, under construction in A: its A state goes as the B one takes over
                o['ds'], o['de'] = eA - 1.0, eA - 0.9; o['cont'] = True
            elif o['kind'] == 'sanborn': o['de'] = float(o['gone_by']) - 0.1; o['ds'] = o['de'] - 0.5
            elif o['kind'] == 'standin':
                gid = int(o['key'][1:]); y = EA.RECORD_YEAR_FIX.get(gid, o['year'] or eB)
                yc = y + 0.1 + 0.8 * EA._u(gid, 9); ys_ = yc - EA.rise_years(o['h'])
                o['de'] = ys_ - 0.1; o['ds'] = o['de'] - 0.45
            else:
                u = EA._u(abs(hash(o['key'])) % 100000, 4); o['de'] = eA + 1 + u * (eB - eA - 2); o['ds'] = o['de'] - 0.5
    # a clearance is not one instant: the Sanborn buildings sharing one gone_by year (a dated clearance, a convention year) come
    # down block by block over up to 3 years before it (a sweep across the area with a fixed per-lot draw; CONVENTION on the order)
    from collections import defaultdict
    grp = defaultdict(list)
    for o in objs:
        if o['side'] == 'died' and o['kind'] == 'sanborn' and o.get('gone_by'): grp[round(float(o['gone_by']), 2)].append(o)
    for gb, L_ in grp.items():
        if len(L_) < 3: continue
        # the window lies inside the step; the 1960 CONVENTION (no demolition date: hidden from 1960) is spread over the area's
        # documented clearance years, 1959.6-1963.5 (the produce market / Golden Gateway: pilot_events), CONVENTION
        lo, hi = (1959.6, 1963.5) if abs(gb - 1960.0) < 0.01 else (gb - min(3.0, 0.4 + 0.08 * len(L_)), gb - 0.1)
        lo, hi = max(lo, eA + 0.15), min(hi, eB - 0.1); hi = max(hi, lo + 0.2)
        key_ = np.array([o['cx'] * 0.8 + o['cy'] * 0.6 for o in L_]); rank = np.argsort(np.argsort(key_)) / max(len(L_) - 1, 1)
        for o, rk in zip(L_, rank):
            u = np.clip(rk + (EA._u(int(o['key'][1:]) % 10 ** 9, 7) - 0.5) * 0.3, 0, 1)
            o['de'] = lo + (hi - lo) * u; o['ds'] = o['de'] - 0.45
    # a building going up where another stood waits for the lot: the old one is gone before the new site starts
    born_o = [o for o in objs if o['side'] == 'born']; died_o = [o for o in objs if o['side'] == 'died']
    for d in died_o:
        if d['kind'] == 'lost': continue                      # SOURCED demolition dates stay
        fx0, fy0, fx1, fy1 = d['box']
        for b_ in born_o:
            bx0, by0, bx1, by1 = b_['box']
            if bx1 <= fx0 or bx0 >= fx1 or by1 <= fy0 or by0 >= fy1: continue
            ox0, oy0, ox1, oy1 = max(fx0, bx0), max(fy0, by0), min(fx1, bx1), min(fy1, by1)
            ov = (d['foot'][oy0 - fy0:oy1 - fy0, ox0 - fx0:ox1 - fx0] & b_['foot'][oy0 - by0:oy1 - by0, ox0 - bx0:ox1 - bx0]).sum()
            if ov > 0.15 * min(d['foot'].sum(), b_['foot'].sum()) and ov > 20:
                s0 = b_.get('site0', b_['ys'])
                if d['de'] > s0 - 0.05: d['de'] = s0 - 0.05; d['ds'] = min(d['ds'], d['de'] - 0.35)
                d.setdefault('next', []).append(b_['key'])
    for o in objs:
        if o['side'] == 'died' and not o.get('cont'): o['ds'] = max(o['ds'], eA + 0.05); o['de'] = max(o['de'], o['ds'] + 0.1)
    # ── masks over the window ──────────────────────────────────────────────────────────────────────────────────────
    SB = np.zeros((H, W), bool); SD = np.zeros((H, W), bool); FB = np.zeros((H, W), bool); FD = np.zeros((H, W), bool)
    for o in objs:
        if o.get('cont'): continue          # a building going up in A goes on in B: not a death (its pixels stay the key's own)
        fx0, fy0, fx1, fy1 = o['box']
        (SB if o['side'] == 'born' else SD)[fy0:fy1, fx0:fx1] |= o['sprite']
        (FB if o['side'] == 'born' else FD)[fy0:fy1, fx0:fx1] |= o['foot']
    log('sprites: born', int(SB.sum()), 'died', int(SD.sum()), 'both', int((SB & SD).sum()))
    # ── shadows: per object, the footprint swept along the sun vector; the height each pixel needs ─────────────────
    lum = lambda I: I.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    LA, LB = (None, None) if EK else (lum(A), lum(B))          # (ek2 uses the renders, not the keys' light)
    RDd = nd.binary_dilation(RD, iterations=2)
    RLO = NRD < 0.05          # the renders differ by light only (a shadow cast or lifted)
    kreg_p = os.path.join(os.path.dirname(bsrc or astar_out or outp), 'shade_k.json')
    KREG = json.load(open(kreg_p)) if (bsrc and os.path.exists(kreg_p)) else {}; KREG_OUT = dict(KREG)
    for o in objs:
        Hs = o['h']; X, Y, zg = geometry(dict(ring=o['ring'], zg=o['zg']))
        ext = Hs * np.abs(S.SHV); sx0 = int(max(0, X.min() - 4)); sx1 = int(min(W, X.max() + ext[0] + 6)); sy0 = int(max(0, Y.min() - ext[1] - Hs * S.PX_Z - 6)); sy1 = int(min(H, Y.max() + 6))
        if sx1 <= sx0 or sy1 <= sy0: o['shadow'] = None; continue
        hreq = np.full((sy1 - sy0, sx1 - sx0), np.inf, np.float32)
        step = 0.5 if Hs < 60 else 1.0
        for zz_ in np.arange(Hs, -0.01, -step):                               # descending: the lowest height that shadows wins
            im = Image.new('L', (sx1 - sx0, sy1 - sy0)); ImageDraw.Draw(im).polygon(list(zip((X + zz_ * S.SHV[0] - sx0).tolist(), (Y + zz_ * S.SHV[1] - sy0).tolist())), fill=1)
            mm = np.asarray(im) > 0; hreq[mm] = zz_
        sl = (slice(sy0, sy1), slice(sx0, sx1))
        if o['side'] == 'born' and FITTED is not None:
            # a shadow of today's building already in the earlier key (it leaked with the building): where the earlier key equals
            # today's and its own render is clearly brighter, the render (fitted) gives back the year's light
            fl = FITTED[sl]; lf = fl @ np.array([0.299, 0.587, 0.114], np.float32)
            cand = np.isfinite(hreq) & (DDo[sl] < 10) & (lf > 1.25 * LB[sl] + 4) & ~SB[sl] & ~SD[sl]
            if cand.any():
                A[sl][cand] = fl[cand].astype(np.uint8); LA[sl][cand] = lf[cand]
        # the shadow's REGION: for a born building, B's own shadow edge (B is the clean, later key) inside the swept footprint;
        # for a gone building, the swept footprint itself on the visible ground (geometry, not the earlier key's mask edges: the
        # compose_hard staircase). Its SHADE: one ratio per channel, measured between the two keys inside the region.
        free = ~SB[sl] & ~SD[sl] & np.isfinite(hreq) & (hreq > max(0.3, o.get('hcA', 0.0)))   # (what it already shaded in A stays A's)
        if EK:
            # ek2: the shadow is the year's own (A's pixels, from the RENDERS' difference); the region only times its switch
            # (the whole render difference inside the object's swept footprint, not only a same-colour one: a shade's colour is
            # bluer than sunlit asphalt, so the light-only test (RLO) missed most of the freeway's shadow and left the rest to the
            # ground-change mask: a jagged dark patch of 1985's shadow beside 2006's sunlit street, A/B #3 #02)
            # but only where the render is DARKER in the year the object stands (a shade), not every render difference in the swept
            # footprint (that took 2006's street in patches under a tall object's long sweep: held-out QA #04)
            dk = (LrB[sl] < 0.85 * LrA[sl] - 3) if o['side'] == 'born' else (LrA[sl] < 0.85 * LrB[sl] - 3)
            lr = RDd[sl] & free & dk
            reg = nd.binary_opening(lr, iterations=1)
            if reg.sum() < 20: o['shadow'] = None; continue
            o['shadow'] = (sx0, sy0, np.where(reg, hreq, np.inf).astype(np.float32)); o['shade_k'] = np.array([0.56, 0.56, 0.56], np.float32)
            continue
        if o['side'] == 'born':
            reg = nd.binary_opening((LB[sl] < 0.82 * LA[sl]) & free, iterations=1); meas = reg
        else:
            reg = free & np.isin(cB[sl], [S.GROUND, S.STREET, S.TREE]); meas = reg & (LA[sl] < 0.82 * LB[sl])
        if reg.sum() < 20: o['shadow'] = None; continue
        num, den = (B, A) if o['side'] == 'born' else (A, B)
        if o['side'] == 'born' and o['key'] in KREG:
            k = np.array(KREG[o['key']], np.float32)            # the ratio it was laid with, one step later in the chain: exact inverse
        elif meas.sum() >= 30:
            nu = num[sl][meas].astype(np.float32) + 2; de = den[sl][meas].astype(np.float32) + 2
            kl = float(np.median(nu.mean(-1) / de.mean(-1)))
            ch = np.clip((nu.mean(0) / nu.mean()) / (de.mean(0) / de.mean()), 0.94, 1.06)     # a shade may be a little bluer, no more
            k = kl * ch
        else: k = np.array([0.56, 0.56, 0.56], np.float32)
        o['shadow'] = (sx0, sy0, np.where(reg, hreq, np.inf).astype(np.float32)); o['shade_k'] = np.clip(k, 0.3, 0.92).astype(np.float32)
        if o['side'] == 'died': KREG_OUT[o['key']] = o['shade_k'].tolist()
    # ── A*: B where nothing changed, A on what changed ────────────────────────────────────────────────────────────
    Astar = B.copy()
    Astar[SD] = A[SD]
    only_b = SB & ~SD
    Astar[only_b] = A[only_b]
    # shadows of born objects on static things: B relit with A's low-frequency light; of died objects: B darkened likewise
    shd = np.zeros((H, W), bool)
    for o in objs:
        if o['shadow'] is None: continue
        sx0, sy0, hr = o['shadow']; shd[sy0:sy0 + hr.shape[0], sx0:sx0 + hr.shape[1]] |= np.isfinite(hr)
    # in A*: a born building's shadow lifted off B (B / k: the ground as lit in A), a gone building's shadow laid on B (B * k), with
    # a 1.2 px soft edge; the shade ratio per object and channel (no per-pixel ratio map: it copied the earlier key's mask edges)
    if not EK:
        Bf = B.astype(np.float32); AS = Astar.astype(np.float32)
        for o in objs:
            if o['shadow'] is None: continue
            sx0, sy0, hr = o['shadow']; reg = np.isfinite(hr); sl = (slice(sy0, sy0 + hr.shape[0]), slice(sx0, sx0 + hr.shape[1]))
            a = np.clip(nd.gaussian_filter(reg.astype(np.float32), 1.2), 0, 1)[..., None] * (~SB[sl] & ~SD[sl])[..., None]
            k = o['shade_k'][None, None, :]
            tgt = Bf[sl] / k if o['side'] == 'born' else Bf[sl] * k
            AS[sl] = AS[sl] * (1 - a) + tgt * a
        Astar = np.clip(AS + 0.5, 0, 255).astype(np.uint8); del Bf, AS
    else:
        # ek2: B wherever the two years' renders agree; the year's own (graded) pixels wherever they differ (objects, their shadows,
        # ground, cars, trees): the render outlines every change exactly, so no key-mask edge (staircase, patch) is ever drawn
        # (not every px where the renders differ: a static building or ground whose render only differs stays B's, one rendition)
        Astar = B.copy(); MAm = SD | SB | shd; Astar[MAm] = A[MAm]
    # static buildings hidden in B behind a born one: B's own rendition continued behind them (floors repeat); when B shows too
    # little of one, A's rendition on the whole building, and B's where B shows it switches as the rising front passes
    SWK = np.zeros((H, W), np.uint8); SWO = np.full((H, W), -1, np.int32); SWP = np.zeros((H, W), np.float32)
    blab = np.zeros((H, W), np.int32)
    for o in objs:
        if o['side'] == 'born': fx0, fy0, fx1, fy1 = o['box']; blab[fy0:fy1, fx0:fx1][o['sprite']] = o['i'] + 1
    kiA = {b['key']: i for i, b in enumerate(PA)}; kiB = {b['key']: i for i, b in enumerate(PB)}
    ncomp = nswitch = 0
    for s_ in static:
        ia, ib = kiA[s_], kiB[s_]; mA = MA == ia
        hid = mA & SB
        if hid.sum() < 150: continue
        mBv = (MB == ib) & ~SB
        yy, xx = np.nonzero(mA | mBv); y0_, y1_, x0_, x1_ = yy.min(), yy.max() + 1, xx.min(), xx.max() + 1
        sl = (slice(y0_, y1_), slice(x0_, x1_))
        hh = PA[ia]['h']; per = max(8, int(round(2 * (3.9 if hh >= 30 else 3.4) * S.PX_Z)))
        own = np.bincount(blab[hid][blab[hid] > 0]).argmax() - 1 if (blab[hid] > 0).any() else -1
        if own < 0: continue
        ob = objs[own]; fx0, fy0, fx1, fy1 = ob['box']
        def zsw(q):
            qy, qx = np.nonzero(q); cidx = np.clip(qx - fx0, 0, len(ob['ynear']) - 1)
            return qy, qx, np.clip((ob['ynear'][cidx] + fy0 - qy) / S.PX_Z, 0, 0.97 * ob['h'])
        # (ek2 tried B's floors repeated behind (periodic_fill): on a tower whose visible part is not one repeating floor (glass
        # + ledges) it drew a wedding-cake hallucination (A/B #3 #06, 181 Fremont's neighbour g137723 behind Salesforce Tower).
        # ek2 takes the first branch below in every case)
        if hid.sum() > 0.6 * mA.sum() or EK:
            # mostly hidden: A's rendition on the whole building; where B shows it, B takes over as the rising front passes
            Astar[mA] = A[mA]; q = mBv & mA
            if EK:
                # ek2 (every case): the year's rendition on the whole building, brought to B's rendition of it (per-channel mean and
                # contrast on the px both show), and the whole building switches to B's ONCE, when the rising front has covered its
                # hidden part (row by row, the switch drew rectangles where the front's columns end: A/B #4-5 #12; the A-behind
                # patch drew a second rendition inside B's: #11)
                ov = q
                if ov.sum() > 200:
                    a_ = A[ov].astype(np.float32); b_ = B[ov].astype(np.float32); g_ = np.clip(b_.std(0) / (a_.std(0) + 1), 0.7, 1.4)
                    Astar[mA] = np.clip((A[mA].astype(np.float32) - a_.mean(0)) * g_ + b_.mean(0) + 0.5, 0, 255).astype(np.uint8)
        else:
            # A's rendition behind, B's where B shows it, a 10 px feather on B's side of the line (switched with the front)
            Astar[hid] = A[hid]
            dh = nd.distance_transform_edt(~hid[sl])
            q = np.zeros((H, W), bool); q[sl] = mBv[sl] & mA[sl] & (dh < 10)
            wq = np.clip(dh / 10.0, 0, 1)[..., None]
            Astar[sl] = np.where(q[sl][..., None], (B[sl].astype(np.float32) * wq + A[sl].astype(np.float32) * (1 - wq)).astype(np.uint8), Astar[sl]); ncomp += 1
        if q.any():
            qy, qx, zq = zsw(q)
            if EK: zq = np.full_like(zq, min(float(zsw(hid)[2].max()), 0.97 * ob['h']))
            SWK[qy, qx] = 1; SWO[qy, qx] = own; SWP[qy, qx] = zq; nswitch += int(q.sum())
    log('static behind born: completed from B', ncomp, '; A rendition + switch px', nswitch)
    # ground that changed (class or strong difference on ground classes, away from sprites and shadows): A's own
    ground = lambda c: np.isin(c, [S.GROUND, S.STREET, S.TREE, S.WATER, S.OTHER])
    # water that is water in both years is the later year's water (its look, glitter and boats): not a change (BAR 26/09: one water)
    # a pure light change (same colour, another brightness) on ground no object shades is a key artefact (the staircase shadow
    # masks of compose_hard, a shadow of something that stands in both years): not a change
    if EK:
        light_only = NRD < 0.04
        dd = np.where(RD, 255, 0)                        # (the renders decide what changed)
    else:
        dd = np.abs(A.astype(np.int16) - B.astype(np.int16)).max(-1)
        nA = A.astype(np.float32) / (A.astype(np.float32).sum(-1, keepdims=True) + 6); nB = B.astype(np.float32) / (B.astype(np.float32).sum(-1, keepdims=True) + 6)
        light_only = (np.abs(nA - nB).max(-1) < 0.04) & (np.abs(LA - LB) > 12); del nA, nB
    gch = ground(cA) & ground(cB) & ((cA != cB) | ((dd > 28) & ~light_only)) & ~SB & ~SD & ~shd & ~((cA == S.WATER) & (cB == S.WATER))
    if EK:
        # ek2: on ground of the SAME class in both years (a street that stayed a street) a render difference is repaving, markings
        # or render noise, not history: the later key's street (the earlier year's generation there drew patches of another
        # asphalt on today's roadway: held-out QA #04); a class change (a road become a plaza, a lot become a park) stays a change
        gch &= (cA != cB)
    # what changed that no record explains (pier sheds, kiosks, structures the era builders draw): the earlier key's own, never
    # today's in the past; a landmark model standing in both years (the Ferry Building) stays the later key's
    SOL = [S.ROOF, S.FACADE, S.LANDMARK, S.OTHER]
    unexpl = (dd > 28) & ~light_only & ~SB & ~SD & ~shd & ~stat_px & ~((cA == S.WATER) & (cB == S.WATER)) & ~((cA == S.LANDMARK) & (cB == S.LANDMARK)) & \
             (np.isin(cA, SOL) | np.isin(cB, SOL))
    # but a thing floating on the later year's water that touches no land (a boat, its wake) is life, not history: it stays the
    # later key's (the earlier key's own water there would be a ghost of the boat's shape in another water)
    fl = (unexpl | gch) & ~np.isin(cA, SOL) & (cA == S.WATER)
    if fl.any():
        land = nd.binary_dilation(~(cA == S.WATER) & ~(cB == S.WATER) & ~fl, iterations=4)
        labf, nf = nd.label(fl); touch = np.unique(labf[land & fl]); touch = touch[touch > 0]
        # a VESSEL moored at a quay touches land too (today's docked ferry): a patch on the earlier year's water that the later
        # render classes mostly 'other' (vessels; piers and wharves are records or ground) and no record owns is life as well.
        # (erasing it left a slab of another water, a striped hull or a block of darker water: A/B #1 #03, #3 #03, #4 #03)
        if nf:
            oth = nd.mean((cB == S.OTHER).astype(np.float32), labf, np.arange(1, nf + 1)); vessel = np.nonzero(oth >= 0.8)[0] + 1
            touch = np.setdiff1d(touch, vessel)
        boats = fl & ~np.isin(labf, touch); unexpl &= ~boats; gch &= ~boats; log('floating life (boats, moored vessels) kept as the later key:', int(boats.sum()))
    gch |= unexpl
    gch = nd.binary_opening(gch, iterations=2); gch = nd.binary_closing(gch, iterations=2) & ~SB & ~SD & ~shd
    lab, ng = nd.label(gch); ar = nd.sum(gch, lab, range(1, ng + 1)); keep = np.isin(lab, np.nonzero(ar >= 150)[0] + 1)
    gch = keep; Astar[gch] = A[gch]
    if EK and gch.any():
        # ek2: a ground change is the year's own generation beside the later key's ground: two generations of one street differ in
        # local tone, so the patch read as a jagged dark slab (A/B #4 #02: 1985's parking beside 2006's plaza). The patch is
        # brought to the later key's tone at its edge by a smooth membrane: the mean B - A difference on the ring of B px around
        # it, spread inwards (normalised convolution, 32 px); its own texture and content stay the year's
        # (tried: plantings = the later key inpainted under today's trees: TELEA smeared dark blobs wherever today's trees stand on
        # the earlier year's street (A/B #10 #01-#09): the year's own street, toned by the membrane, reads better)
        gch_t = gch
        ring = nd.binary_dilation(gch, iterations=3) & ~gch & ~SB & ~SD & ~shd
        wr = nd.gaussian_filter(ring.astype(np.float32), 32)
        cor = np.stack([nd.gaussian_filter(np.where(ring, B[..., ch].astype(np.float32) - A[..., ch].astype(np.float32), 0), 32) for ch in range(3)], -1) / (wr[..., None] + 1e-6)
        cor[wr < 2e-4] = 0                                              # (no ring within reach: no correction)
        Astar[gch_t] = np.clip(A[gch_t].astype(np.float32) + cor[gch_t] + 0.5, 0, 255).astype(np.uint8); del cor, wr, ring
    log('A*: died', int(SD.sum()), 'born-behind', int(only_b.sum()), 'shadows', int(shd.sum()), 'ground', int(gch.sum()))
    # ONE WATER: wherever A* would show the earlier key's pixels on water of the earlier year's render (a boat or pier of today
    # erased, a structure built later over water, a shore moved), the later key's water copied from beside (the nearest pixels, left
    # or right, that are water in both years and B's own): no patch of another water ('slab') is ever left in the bay
    wm = (np.abs(Astar.astype(np.int16) - B.astype(np.int16)).max(-1) > 0) & (cA == S.WATER) & ~SD
    if wm.sum() > 20:
        wsrc = (cA == S.WATER) & (cB == S.WATER) & ~wm & (np.abs(Astar.astype(np.int16) - B.astype(np.int16)).max(-1) == 0)
        # each connected patch first as ONE block of the later key's water from beside (the same offset for the whole patch: a
        # docked ferry of today filled per row from different offsets drew a striped hull in A/B #3 #03); per row only as a fallback
        labw, nw_ = nd.label(wm, structure=np.ones((3, 3), bool)); nblk = 0
        for k_, bb in enumerate(nd.find_objects(labw)):
            if bb is None: continue
            mk = labw[bb] == k_ + 1; (ya, yb_), (xa, xb_) = (bb[0].start, bb[0].stop), (bb[1].start, bb[1].stop)
            for d_ in range(24, 3000, 24):
                hit = None
                for ox_, oy_ in ((d_, 0), (-d_, 0), (0, d_), (0, -d_)):
                    if xa + ox_ < 0 or xb_ + ox_ > W or ya + oy_ < 0 or yb_ + oy_ > H: continue
                    if wsrc[ya + oy_:yb_ + oy_, xa + ox_:xb_ + ox_][mk].mean() >= 0.995: hit = (ox_, oy_); break
                if hit:
                    ox_, oy_ = hit; Astar[ya:yb_, xa:xb_][mk] = B[ya + oy_:yb_ + oy_, xa + ox_:xb_ + ox_][mk]; wm[ya:yb_, xa:xb_][mk] = False; nblk += 1
                    break
        log('one water: patches copied as a block', nblk, 'of', nw_)
        ly, lx = np.nonzero(wm); got = np.zeros(len(ly), bool)
        for t_ in range(24, 3000, 24):
            for ox_ in (t_, -t_):
                sx_ = lx + ox_; inb = (~got) & (sx_ >= 0) & (sx_ < W); q_ = np.zeros(len(ly), bool); q_[inb] = wsrc[ly[inb], sx_[inb]]
                Astar[ly[q_], lx[q_]] = B[ly[q_], sx_[q_]]; got |= q_
            if got.all(): break
        log('one water: earlier-key water replaced by the later key\'s', int(got.sum()), 'of', int(wm.sum()))
    # ── the lot / behind-both fill (neither key shows it): graded earth in the footprints, inpainted above ───────────
    both = SB & SD
    if astar_out and os.environ.get('TR_ORDER') == '1':
        # the SLIDER's order map (GRAMMAR §7): per pixel that differs between A* and B, the moment of the step (0..254) it switches
        # from A* to B: a new building from its base up over its window, a gone one from its top down, a shadow when the height it
        # needs is reached, a ground change with its owner; 255 = the same in both years
        span = max(eB - eA, 1e-3); nrm = lambda y: min(0.98, max(0.02, (y - eA) / span))
        T = np.full((H, W), -1.0, np.float32)
        for o in objs:
            if o.get('cont'): continue
            fx0, fy0, fx1, fy1 = o['box']; sp = o['sprite']; fh, fw = sp.shape
            yn = o['ynear'][None, :]; rows = np.arange(fh, dtype=np.float32)[:, None]
            Z = np.clip((yn - rows) / S.PX_Z, 0, o['h'])
            if o['side'] == 'born': t0, t1 = nrm(o.get('site0', o['ys'])), nrm(o['yc']); tz = t0 + (t1 - t0) * (0.15 + 0.85 * Z / max(o['h'], 1))
            else: t0, t1 = nrm(o['ds']), nrm(o['de']); tz = t0 + (t1 - t0) * 0.9 * (1 - Z / max(o['h'], 1))
            v = T[fy0:fy1, fx0:fx1]; v[sp] = tz[sp]
            o['_t'] = (t0, t1)
            if o.get('shadow') is not None:
                sx0, sy0, hr = o['shadow']; reg = np.isfinite(hr); vv = T[sy0:sy0 + hr.shape[0], sx0:sx0 + hr.shape[1]]
                hh = np.clip(hr / max(o['h'], 1), 0, 1)
                ts = t0 + (t1 - t0) * (0.15 + 0.85 * hh) if o['side'] == 'born' else t0 + (t1 - t0) * 0.9 * (1 - hh)
                m_ = reg & (vv < 0); vv[m_] = ts[m_]
        if gch.any():
            seed = np.zeros((H, W), np.int32)
            for k_, o in enumerate(objs):
                if '_t' in o: fx0, fy0, fx1, fy1 = o['box']; seed[fy0:fy1, fx0:fx1][o['sprite'] | o['foot']] = k_ + 1
            if seed.any():
                _, (iy, ix) = nd.distance_transform_edt(seed == 0, return_indices=True); ow = seed[iy, ix] - 1
                g_ = gch & (T < 0); oo = ow[g_]
                tt = np.array([objs[k].get('_t', (0.5, 0.5))[1] for k in range(len(objs))] + [0.5], np.float32)
                T[g_] = tt[np.where(oo >= 0, oo, len(objs))]
        diff = np.abs(Astar.astype(np.int16) - B.astype(np.int16)).max(-1) > 0
        T[diff & (T < 0)] = 0.5
        ORD = np.where(diff, np.clip(np.round(T * 254), 0, 254), 255).astype(np.uint8)
        np.save(astar_out.replace('K_', 'O_'), ORD); log('order map saved', int(diff.sum()), 'px change')
    if astar_out:
        np.save(astar_out, Astar); log('A* saved for the step before:', astar_out)
        json.dump(KREG_OUT, open(os.path.join(os.path.dirname(astar_out), 'shade_k.json'), 'w'))
    if os.environ.get('TR_NOPKL') == '1': log('K* only (no pickle)'); return
    meta = lambda P: [dict(key=b['key'], kind=b['kind'], h=float(b['h']), cy=float(b['cy']), zg=float(b.get('zg', 0.0)), ring=b['ring']) for b in P]
    pickle.dump(dict(win=win, yA=yA, yB=yB, eA=eA, eB=eB, A=A, B=B, Astar=Astar, cA=cA, cB=cB, SB=SB, SD=SD, FB=FB, FD=FD, both=both, gch=gch,
                     shd=shd, objs=objs, MA=MA, MB=MB, PA=meta(PA), PB=meta(PB), static=sorted(static), SWK=SWK, SWO=SWO, SWP=SWP), open(outp, 'wb'), protocol=4)
    log('saved', outp)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], tuple(int(v) for v in sys.argv[3].split(',')), sys.argv[4],
         bsrc=sys.argv[5] if len(sys.argv) > 5 and sys.argv[5] != '-' else None, astar_out=sys.argv[6] if len(sys.argv) > 6 else None)
