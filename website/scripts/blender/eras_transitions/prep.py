"""prep.py: one step A -> B of the transitions grammar over a canvas window: the objects that change (born / died), their
sprites, per-pixel heights and footprints, their dates, the consistent start key A* and the plates. Cached for render.py.

    python3 prep.py <yA> <yB> <x0,y0,x1,y1> <out.pkl>        (years as in stage.YEARS: 1938 1959 1985 2006 now)

A* (the start key) = the later key B wherever the thing shown did not change (static buildings keep B's own pixels, so a
building that stands in both years never changes rendition), the earlier key A on what did change (the objects gone by B, the
ground that changed, what stood behind the objects born in the step), relit where a changing object's shadow falls."""
import sys, os, json, math, pickle, time
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as nd
import stage as S, objects as O

T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)


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
    gA_raw = S.gids(S.load_pass(yA, 'gid', win)); gB_raw = S.gids(S.load_pass(yB, 'gid', win))
    cA = S.classes(S.load_pass(yA, 'class', win)); cB = S.classes(S.load_pass(yB, 'class', win)); log('passes')
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
    kA_ = np.array([b['key'] for b in PA] + ['']); kB_ = np.array([b['key'] for b in PB] + [''])
    stat_px = (MA >= 0) & (MB >= 0) & (kA_[MA] == kB_[MB]) & np.isin(kA_[MA], list(static))
    LAB = {'died': np.zeros((H, W), np.int32), 'born': np.zeros((H, W), np.int32)}; CAND = []
    for side, keys, P, M, cls in (('died', died, PA, MA, cA), ('born', born, PB, MB, cB)):
        kidx = {b['key']: i for i, b in enumerate(P)}
        for k in keys:
            b = P[kidx[k]]; m = M == kidx[k]
            if b['kind'] in ('lost', 'span'):     # a lost structure has no id: its prism raster where the two keys differ
                im = Image.new('L', (W, H)); dr = ImageDraw.Draw(im)
                for p in O.silhouette_polys(b, win): dr.polygon([(float(x), float(y)) for x, y in p], fill=1)
                m = (np.asarray(im) > 0) & ((DD > 20) | (cA != cB)) & (cls != S.WATER) & ~stat_px
                m = nd.binary_closing(nd.binary_opening(m, iterations=1), iterations=2) & (np.asarray(im) > 0)
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
    anach = nd.binary_opening(((LAB['born'] > 0) | (LAB['died'] > 0)) & (DD < 10) & np.isin(cB, [S.ROOF, S.FACADE, S.LANDMARK, S.OTHER]), iterations=1)
    anach = nd.binary_dilation(anach, iterations=1) & ((LAB['born'] > 0) | (LAB['died'] > 0))      # thin leaks too (a crown lattice), with their edges
    FITTED = None
    if anach.sum() > 500:
        BL = S.load_pass(yA, 'beauty', win).astype(np.float32)
        fit = stat_px & (DD < 12) & (np.abs(BL - A.astype(np.float32)).max(-1) < 80)
        idx = np.nonzero(fit.ravel())[0]; idx = idx[:: max(1, len(idx) // 400000)]
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
        DD = np.abs(A.astype(np.int16) - B.astype(np.int16)).max(-1)
        log('anachronisms of today in the earlier key replaced by its own render (fitted):', int(anach.sum()))
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
    LA, LB = lum(A), lum(B)
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
            cand = np.isfinite(hreq) & (DD[sl] < 10) & (lf > 1.25 * LB[sl] + 4) & ~SB[sl] & ~SD[sl]
            if cand.any():
                A[sl][cand] = fl[cand].astype(np.uint8); LA[sl][cand] = lf[cand]
        if o['side'] == 'born': dark = (LB[sl] < 0.82 * LA[sl]) & ~SB[sl] & ~SD[sl]
        else: dark = (LA[sl] < 0.82 * LB[sl]) & ~SD[sl] & ~SB[sl]
        dark &= np.isfinite(hreq) & (hreq > max(0.3, o.get('hcA', 0.0)))   # (what it already shaded in A stays A's)
        dark = nd.binary_opening(dark, iterations=1)
        o['shadow'] = (sx0, sy0, np.where(dark, hreq, np.inf).astype(np.float32)) if dark.any() else None
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
    Af, Bf = A.astype(np.float32), B.astype(np.float32)
    sm = lambda I: nd.gaussian_filter(I, (2.0, 2.0, 0))
    ratio = np.clip((sm(Af) + 4) / (sm(Bf) + 4), 0.25, 4.0)
    rel = np.clip(Bf * ratio, 0, 255).astype(np.uint8)
    Astar[shd] = rel[shd]
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
        if hid.sum() > 0.6 * mA.sum():
            # mostly hidden: A's rendition on the whole building; where B shows it, B takes over as the rising front passes
            Astar[mA] = A[mA]; q = mBv & mA
        else:
            # A's rendition behind, B's where B shows it, a 10 px feather on B's side of the line (switched with the front)
            Astar[hid] = A[hid]
            dh = nd.distance_transform_edt(~hid[sl])
            q = np.zeros((H, W), bool); q[sl] = mBv[sl] & mA[sl] & (dh < 10)
            wq = np.clip(dh / 10.0, 0, 1)[..., None]
            Astar[sl] = np.where(q[sl][..., None], (B[sl].astype(np.float32) * wq + A[sl].astype(np.float32) * (1 - wq)).astype(np.uint8), Astar[sl]); ncomp += 1
        if q.any():
            qy, qx, zq = zsw(q); SWK[qy, qx] = 1; SWO[qy, qx] = own; SWP[qy, qx] = zq; nswitch += int(q.sum())
    log('static behind born: completed from B', ncomp, '; A rendition + switch px', nswitch)
    # ground that changed (class or strong difference on ground classes, away from sprites and shadows): A's own
    ground = lambda c: np.isin(c, [S.GROUND, S.STREET, S.TREE, S.WATER, S.OTHER])
    dd = np.abs(A.astype(np.int16) - B.astype(np.int16)).max(-1)
    # water that is water in both years is the later year's water (its look, glitter and boats): not a change (BAR 26/09: one water)
    gch = ground(cA) & ground(cB) & ((cA != cB) | (dd > 28)) & ~SB & ~SD & ~shd & ~((cA == S.WATER) & (cB == S.WATER))
    # what changed that no record explains (pier sheds, kiosks, structures the era builders draw): the earlier key's own, never
    # today's in the past; a landmark model standing in both years (the Ferry Building) stays the later key's
    SOL = [S.ROOF, S.FACADE, S.LANDMARK, S.OTHER]
    unexpl = (dd > 28) & ~SB & ~SD & ~shd & ~stat_px & ~((cA == S.WATER) & (cB == S.WATER)) & ~((cA == S.LANDMARK) & (cB == S.LANDMARK)) & \
             (np.isin(cA, SOL) | np.isin(cB, SOL))
    # but a thing floating on the later year's water that touches no land (a boat, its wake) is life, not history: it stays the
    # later key's (the earlier key's own water there would be a ghost of the boat's shape in another water)
    fl = unexpl & ~np.isin(cA, SOL) & (cA == S.WATER)
    if fl.any():
        land = nd.binary_dilation(~(cA == S.WATER) & ~(cB == S.WATER) & ~fl, iterations=4)
        labf, nf = nd.label(fl); touch = np.unique(labf[land & fl]); touch = touch[touch > 0]
        boats = fl & ~np.isin(labf, touch); unexpl &= ~boats; log('floating life kept as the later key:', int(boats.sum()))
    gch |= unexpl
    gch = nd.binary_opening(gch, iterations=2); gch = nd.binary_closing(gch, iterations=2) & ~SB & ~SD & ~shd
    lab, ng = nd.label(gch); ar = nd.sum(gch, lab, range(1, ng + 1)); keep = np.isin(lab, np.nonzero(ar >= 150)[0] + 1)
    gch = keep; Astar[gch] = A[gch]
    log('A*: died', int(SD.sum()), 'born-behind', int(only_b.sum()), 'shadows', int(shd.sum()), 'ground', int(gch.sum()))
    # ── the lot / behind-both fill (neither key shows it): graded earth in the footprints, inpainted above ───────────
    both = SB & SD
    if astar_out: np.save(astar_out, Astar); log('A* saved for the step before:', astar_out)
    if os.environ.get('TR_NOPKL') == '1': log('K* only (no pickle)'); return
    meta = lambda P: [dict(key=b['key'], kind=b['kind'], h=float(b['h']), cy=float(b['cy']), zg=float(b.get('zg', 0.0)), ring=b['ring']) for b in P]
    pickle.dump(dict(win=win, yA=yA, yB=yB, eA=eA, eB=eB, A=A, B=B, Astar=Astar, cA=cA, cB=cB, SB=SB, SD=SD, FB=FB, FD=FD, both=both, gch=gch,
                     shd=shd, objs=objs, MA=MA, MB=MB, PA=meta(PA), PB=meta(PB), static=sorted(static), SWK=SWK, SWO=SWO, SWP=SWP), open(outp, 'wb'), protocol=4)
    log('saved', outp)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], tuple(int(v) for v in sys.argv[3].split(',')), sys.argv[4],
         bsrc=sys.argv[5] if len(sys.argv) > 5 and sys.argv[5] != '-' else None, astar_out=sys.argv[6] if len(sys.argv) > 6 else None)
