"""The deck's height along every elevated carriageway (freeways_prep.py):
measured by the LiDAR, cleaned, made continuous and smooth, joined at the
junctions and brought down to the ground where a ramp touches down.

PER SAMPLE (every 2 m of centre line). The bridge-deck points (class 17)
within 2.5 m, clustered in height (a gap of 1.2 m separates two levels). A
way crossed by a HIGHER way (OSM layer, crossing at more than 20 deg; a way
merging alongside is the same deck, not a level) sees the upper deck first:
it takes the level under the top one, or nothing. Otherwise it takes the top
level. No deck point but ground points at the bare earth: the way is at grade
there. Neither: not measured.

PER WAY. A running median (30 m) throws out what is not the deck (a sign
gantry, a truck); the gaps are interpolated along the way; a Gaussian of 6 m
smooths the rest (the decks' vertical curves are hundreds of metres long).
JUNCTIONS: where two elevated ways share a node, both take the mean there,
the correction fading over 60 m. TOUCHDOWNS: a way's end that meets no other
way read here and that the LiDAR did not see is at grade (the engine's
street, 0.10 m over the ground): the deck is brought to it over at least
25 m, at most 5 % (Caltrans' ramp grades). An end the LiDAR saw stays as
measured (a bus ramp entering the Transit Center stops in the air).
Never below the ground.
"""
import json, math, time
import numpy as np


def _resample(P, step):
    P = np.asarray(P, float)
    s = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))])
    n = max(2, int(math.ceil(s[-1] / step)) + 1)
    u = np.linspace(0, s[-1], n)
    return np.stack([np.interp(u, s, P[:, 0]), np.interp(u, s, P[:, 1])], 1), u, s


def _nanmedfilt(z, k):
    h = k // 2; out = np.full_like(z, np.nan)
    for i in range(len(z)):
        w = z[max(0, i - h):i + h + 1]; w = w[np.isfinite(w)]
        if len(w) >= 3: out[i] = np.median(w)
    return out


def _gauss(z, sig):
    if sig <= 0 or len(z) < 3: return z
    h = int(3 * sig); k = np.exp(-0.5 * (np.arange(-h, h + 1) / sig) ** 2); k /= k.sum()
    zp = np.concatenate([np.full(h, z[0]), z, np.full(h, z[-1])])
    return np.convolve(zp, k, mode='valid')


def _clusters(z, gap=1.2):
    z = np.sort(z); cut = np.where(np.diff(z) > gap)[0]
    return np.split(z, cut + 1)


GMAX, GTOL = 0.09, 0.4        # a deck climbs at most 9 % (Caltrans: 6 % on freeways, more on short ramps)


def _continuous(s, zr, cands, stats, win=80):
    """THE DECK IS ONE CONTINUOUS ROAD. Among every level seen at each sample
    (the rules' choice weighs 1.3, the other levels and the ground 1.0), the
    chain of samples that never climbs faster than GMAX (+ GTOL) and weighs
    the most: a way that the rules put on a deck crossing over it for a few
    metres, or on the level under it, snaps back to its own road. Samples off
    the chain are left for interpolation."""
    n = len(s); C = []
    for k in range(n):
        c = [(float(zr[k]), 1.3)] if np.isfinite(zr[k]) else []
        for z in cands.get(k, []):
            if not any(abs(z - q) < 0.3 for q, _ in c): c.append((z, 1.0))
        C.append(c)
    idx = [(k, j) for k in range(n) for j in range(len(C[k]))]
    if not idx: return zr
    K = np.array([a for a, _ in idx]); Zc = np.array([C[a][b][0] for a, b in idx]); Wc = np.array([C[a][b][1] for a, b in idx])
    best = Wc.copy(); prev = np.full(len(idx), -1)
    first = np.searchsorted(K, K - win)
    for m in range(len(idx)):
        lo = first[m]; hi = m
        while hi > lo and K[hi - 1] == K[m]: hi -= 1
        if hi <= lo: continue
        ds = s[K[m]] - s[K[lo:hi]]
        ok = np.abs(Zc[m] - Zc[lo:hi]) <= GMAX * ds + GTOL
        if ok.any():
            c = np.where(ok, best[lo:hi], -1.0); j = int(np.argmax(c))
            if c[j] >= 0: best[m] = c[j] + Wc[m]; prev[m] = lo + j
    m = int(np.argmax(best)); out = np.full(n, np.nan); kept = 0
    while m >= 0:
        out[K[m]] = Zc[m]; kept += 1; m = prev[m]
    stats['dp_dropped'] = stats.get('dp_dropped', 0) + int(np.isfinite(zr).sum() - kept)
    return out


def run(ways, S, W, OUT, HIGHWAYS=None, log=print):
    from scipy.spatial import cKDTree
    import lm_dem
    t0 = time.time()
    L = np.load(f'{W}/lidar_pts.npz'); P, Z, C = L['xy'].astype(np.float64), L['z'], L['c']
    d17 = C == 17; g2 = C == 2
    kd17 = cKDTree(P[d17]); Z17 = Z[d17]
    kdg = cKDTree(P[g2]); ZG = Z[g2]
    # every structure's centre line, 2 m apart, with its direction
    R = []
    for w in S:
        Q, u, s_orig = _resample(w['pts'], 2.0)
        T = np.gradient(Q, axis=0); T /= np.maximum(1e-9, np.linalg.norm(T, axis=1))[:, None]
        R.append(dict(Q=Q, s=u, T=T, sn=s_orig, half=w['width'] / 2))
    allQ = np.concatenate([r['Q'] for r in R]); allI = np.concatenate([np.full(len(r['Q']), i) for i, r in enumerate(R)])
    allT = np.concatenate([r['T'] for r in R])
    allK = np.concatenate([np.arange(len(r['Q'])) for r in R])
    kdS = cKDTree(allQ); maxhalf = max(r['half'] for r in R)
    stats = dict(deck=0, below=0, grade=0, none=0, covered_lost=0, ambiguous=0)
    nset = [set(w['nodes']) for w in S]
    for i, (w, r) in enumerate(zip(S, R)):
        Q, T = r['Q'], r['T']; n = len(Q)
        DEM = lm_dem.sample_arr(Q[:, 0], Q[:, 1]).astype(np.float64)
        if w.get('grade'):
            # at grade: on the ground (the renderer drapes it again on its own terrain)
            z = np.nan_to_num(DEM, nan=0.0) + 0.10; w['src'] = 'grade'
            r.update(z=z, DEM=np.nan_to_num(DEM, nan=0.0), meas=np.zeros(n, np.int8), kind=np.zeros(n, np.int8))
            continue
        zr = np.full(n, np.nan); kind = np.zeros(n, np.int8); amb = np.full(n, np.nan); ambref = {}; cands = {}   # kind: 1 deck, 2 grade
        rad = float(np.clip(r['half'] - 0.6, 1.2, 2.5))
        near = kdS.query_ball_point(Q, maxhalf + 0.5)
        n17 = kd17.query_ball_point(Q, rad)
        for k in range(n):
            above = 0; ref_ = None; lv_above = set()
            for q in near[k]:
                j = allI[q]
                if j == i or S[j]['layer'] <= w['layer'] or S[j].get('grade'): continue
                if np.hypot(*(allQ[q] - Q[k])) > R[j]['half'] + 0.5: continue
                if abs(float(np.dot(allT[q], T[k]))) < math.cos(math.radians(20)):   # crossing over
                    above = 2; lv_above.add(S[j]['layer']); continue
                # running along over it (a double deck: the centre lines within a few
                # metres); a way sharing a node merges into it at the same level
                if above < 2 and not (nset[i] & nset[j]) and np.hypot(*(allQ[q] - Q[k])) < max(3.0, 0.4 * R[j]['half']):
                    above = 1; ref_ = (j, allK[q])
            zz = Z17[n17[k]]
            if len(zz) >= 3:
                # (under another deck the lower level is seen through the gaps: a few points)
                cl = [c for c in _clusters(zz) if len(c) >= (3 if above else max(3, 0.15 * len(zz)))]
                cands[k] = [float(np.median(c)) for c in cl]
                if cl:
                    two = len(cl) >= 2 and np.median(cl[-1]) - np.median(cl[-2]) > 3.0
                    # crossed by decks on n levels: ours is the (n+1)th from the top,
                    # or the ground (the class-2 test below)
                    na = len(lv_above)
                    if above == 2: cands[k] = cands[k][:max(0, len(cl) - na)]     # not the decks crossing over it
                    if above == 2:
                        if len(cl) >= na + 1: zr[k] = np.median(cl[-(na + 1)]); kind[k] = 1; stats['below'] += 1; continue
                        stats['covered_lost'] += 1          # (then: on the ground?)
                    elif above == 1 and two: zr[k] = np.median(cl[-2]); kind[k] = 1; stats['below'] += 1; continue
                    elif above == 1: amb[k] = np.median(cl[-1]); ambref[k] = ref_; stats['ambiguous'] += 1; continue   # ours, or the deck over it
                    else: zr[k] = np.median(cl[-1]); kind[k] = 1; stats['deck'] += 1; continue
            gi = kdg.query_ball_point(Q[k], rad)
            if len(gi) >= 3 and np.isfinite(DEM[k]) and abs(np.median(ZG[gi]) - DEM[k]) < 1.0:
                zr[k] = DEM[k] + 0.10; kind[k] = 2; stats['grade'] += 1
                cands[k] = cands.get(k, []) + [float(DEM[k] + 0.10)]
            else: stats['none'] += 1
        r.update(zr=zr, amb=amb, ambref=ambref, kind=kind, DEM=DEM, cands=cands)
    # a level seen right under a higher parallel way: that way's deck (ours is
    # hidden under it) when the two agree within 2 m, else ours
    for i, (w, r) in enumerate(zip(S, R)):
        if w.get('grade'): continue
        for k in np.where(np.isfinite(r['amb']))[0]:
            j, kk = r['ambref'][k]; zo = R[j].get('zr')
            other = zo[kk] if zo is not None and np.isfinite(zo[kk]) else (R[j]['amb'][kk] if zo is not None else np.nan)
            if not (np.isfinite(other) and abs(other - r['amb'][k]) < 2.0):
                r['zr'][k] = r['amb'][k]; r['kind'][k] = 1
            else:       # the deck over it: not a level of this way
                r['cands'][k] = [z for z in r['cands'].get(k, []) if abs(z - r['amb'][k]) > 1.0]
    for i, (w, r) in enumerate(zip(S, R)):
        if w.get('grade'): continue
        Q = r['Q']; n = len(Q); zr = r['zr'].copy(); kind = r['kind']; DEM = r['DEM']
        zr = _continuous(r['s'], zr, r['cands'], stats)
        # clean: a running median, outliers out
        med = _nanmedfilt(zr, 15)
        bad = np.isfinite(zr) & np.isfinite(med) & (np.abs(zr - med) > 1.0)
        zr[bad] = np.nan
        ok = np.isfinite(zr)
        s = r['s']
        if ok.sum() >= 2:
            z = np.interp(s, s[ok], zr[ok])
            # 'measured': within 6 m of a sample used
            so = s[ok]; j_ = np.clip(np.searchsorted(so, s), 1, len(so) - 1)
            meas = (np.minimum(np.abs(s - so[j_ - 1]), np.abs(s - so[j_])) <= 6.0).astype(np.int8)
            w['src'] = 'lidar'
        else:
            # no measurement: OSM layer x 6.5 m over the ground
            z = np.nan_to_num(DEM, nan=0.0) + 6.5 * max(1, w['layer']); meas = np.zeros(n, np.int8); w['src'] = 'default'
        r.update(z=_gauss(z, 3.0), DEM=np.nan_to_num(DEM, nan=0.0), meas=meas, kind=kind)
    # ── junctions: a node shared by elevated ways gets one height ────────────
    def s_at_node(i, ni):
        return float(R[i]['sn'][ni])
    def add_corr(i, s_node, dz, L):
        r = R[i]; f = np.clip(1 - np.abs(r['s'] - s_node) / L, 0, 1); f = f * f * (3 - 2 * f)
        r['z'] = r['z'] + dz * f
    for it in range(3):
        at = {}
        for i, w in enumerate(S):
            for ni in (0, len(w['nodes']) - 1):
                at.setdefault(w['nodes'][ni], []).append((i, ni))
            # interior nodes shared with another way's end (a ramp leaving the mainline)
        ends = set(at)
        for i, w in enumerate(S):
            for ni, nd in enumerate(w['nodes'][1:-1], 1):
                if nd in ends: at[nd].append((i, ni))
        for nd, lst in at.items():
            lst = [(i, ni) for i, ni in lst if not S[i].get('grade')]
            if len(lst) < 2: continue
            zs = [float(np.interp(s_at_node(i, ni), R[i]['s'], R[i]['z'])) for i, ni in lst]
            m = float(np.mean(zs))
            for (i, ni), zv in zip(lst, zs):
                if abs(m - zv) > 0.01: add_corr(i, s_at_node(i, ni), m - zv, 60.0)
    # ── touchdowns ───────────────────────────────────────────────────────────
    cnt = {}
    for w in S:
        for nd in w['nodes']: cnt[nd] = cnt.get(nd, 0) + 1
    ntd = 0
    for i, w in enumerate(S):
        r = R[i]; w['ends'] = [0, 0]; w['td'] = [0.0, 0.0]
        if w.get('grade'): continue
        for e, ni in ((0, 0), (1, len(w['nodes']) - 1)):
            if cnt.get(w['nodes'][ni], 0) > 1: continue          # joins another elevated way
            s_e = r['s'][0] if e == 0 else r['s'][-1]
            k = 0 if e == 0 else -1
            dz = (r['DEM'][k] + 0.10) - r['z'][k]
            if e in w.get('cut_ends', ()): continue                 # meets the landmarks' Bay Bridge
            # the LiDAR saw this end: it is where it is (a bus ramp into the
            # Transit Center, a viaduct going on past the approaches read)
            if r['meas'][k] and r['kind'][max(0, len(r['s']) - 4):].any() if e else r['meas'][k] and r['kind'][:4].any(): continue
            # a bus ramp ends in the Transit Center, and an end more than 6 m up that
            # the LiDAR did not see goes on into something OSM does not draw: left
            if w['hw'] == 'busway' or abs(dz) > 6.0: continue
            Lb = min(max(25.0, abs(dz) / 0.05), 0.8 * r['s'][-1])
            f = np.clip(1 - np.abs(r['s'] - s_e) / Lb, 0, 1); f = f * f * (3 - 2 * f)
            r['z'] = r['z'] + dz * f; w['ends'][e] = 1; w['td'][e] = round(float(dz), 2); ntd += 1
    # ── the joints with the landmarks' Bay Bridge: their deck heights exactly ──
    import freeways_prep as FP
    nj = []
    for i, w in enumerate(S):
        r = R[i]
        for e in w.get('joints', ()):
            k = 0 if e == 0 else -1
            # a way leaving the bridge (its first point at the joint) is westbound, the
            # upper deck; one running onto it is eastbound, the lower deck
            tgt = FP.JOINT_UP if e == 0 else FP.JOINT_LO
            d = r['s'] - r['s'][0] if e == 0 else r['s'][-1] - r['s']
            f = np.clip(1 - d / FP.JOINT_L, 0, 1); f = f * f * (3 - 2 * f)
            nj.append((w['id'], round(float(r['z'][k]), 2), tgt))
            r['z'] = r['z'] + (tgt - r['z'][k]) * f
    if nj: log('profile: joints with the Bay Bridge (way, measured, landmarks):', nj)
    for i, w in enumerate(S):
        r = R[i]
        r['z'] = np.maximum(r['z'], r['DEM'] + 0.10)
    # ── out: every ~3 m ──────────────────────────────────────────────────────
    out = []
    for i, w in enumerate(S):
        r = R[i]; step = max(1, int(round(3.0 / max(0.5, r['s'][1] - r['s'][0]))))
        idx = list(range(0, len(r['s']), step))
        if idx[-1] != len(r['s']) - 1: idx.append(len(r['s']) - 1)
        hag = r['z'] - r['DEM']
        out.append(dict(id=w['id'], hw=w['hw'], name=w['name'], ref=w['ref'], layer=w['layer'], lanes=w['lanes'],
                        width=w['width'], oneway=w['oneway'], src=w['src'], ends=w['ends'], td=w['td'],
                        s0=w.get('s0', 0.0), n0=w['nodes'][0], n1=w['nodes'][-1], app=2 if w.get('grade') else int(bool(w.get('approach'))),
                        s=[round(float(r['s'][k]), 2) for k in idx],
                        pts=[[round(float(r['Q'][k, 0]), 2), round(float(r['Q'][k, 1]), 2), round(float(r['z'][k]), 2)] for k in idx],
                        hag=[round(float(hag[k]), 2) for k in idx], meas=[int(r['meas'][k]) for k in idx]))
    hmax = [max(o['hag']) for o in out]
    # the surface streets near a deck (where a pier must not stand across one)
    surf = []
    if HIGHWAYS:
        HALF = {'primary': 9.0, 'primary_link': 5.0, 'secondary': 8.0, 'secondary_link': 5.0, 'tertiary': 7.0,
                'tertiary_link': 4.5, 'residential': 6.0, 'unclassified': 6.0, 'living_street': 4.5, 'service': 3.0,
                'trunk': 10.0, 'busway': 4.0, 'pedestrian': 4.0}
        KX = 111320 * 0.790582709628753; KY = 111320.0
        el = np.concatenate([np.array(o['pts'])[:, :2] for o in out])
        kde = cKDTree(el)
        for e in json.load(open(HIGHWAYS))['elements']:
            t = e.get('tags', {}); hw = t.get('highway')
            if hw not in HALF or t.get('bridge', 'no') != 'no' or t.get('tunnel', 'no') != 'no': continue
            try:
                if int(str(t.get('layer', '0')).split(';')[0]) != 0: continue
            except ValueError: pass
            P = np.array([((g['lon'] + 122.438) * KX, (g['lat'] - 37.76) * KY) for g in e['geometry']])
            Q, _, _ = _resample(P, 5.0)
            if not np.isfinite(kde.query(Q, distance_upper_bound=80.0)[0]).any(): continue
            surf.append([hw, HALF[hw], [[round(float(a), 2), round(float(b), 2)] for a, b in P]])
    js = dict(surface=surf, src='OpenStreetMap (ODbL, (c) OpenStreetMap contributors); USGS 3DEP LiDAR CA_SanFrancisco_1_B23 '
                  '(class 17 bridge deck) and 3DEP bare earth (public domain)',
              made=time.strftime('%Y-%m-%d %H:%M'), stats=stats, touchdowns=ntd, ways=out)
    json.dump(js, open(f'{OUT}/freeways.json', 'w'), separators=(',', ':'))
    log(f'profile: {len(out)} ways, {len(surf)} surface streets, samples {stats}, {ntd} touchdowns, '
        f'{sum(o["src"] == "default" for o in out)} ways on defaults, hag max median {np.median(hmax):.1f} m, '
        f'{time.time() - t0:.0f}s')
    return js
