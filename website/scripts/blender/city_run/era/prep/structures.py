# structures.py (heroprep; generalises erapb/fwy.py): EVERY non-building structure that stands in Y0 and is gone by Y1 (era.STRUCTURES
# viaducts, era_lost halls/terminals) and every one that stands in Y1 but not in Y0 (today's freeways.json ways gated by
# era.freeway_keep's year_of: the Transbay bus ramps 2018.6, ...), as chunked prisms (<= 4 m pieces, each on its own true ground)
# that can be rasterised JOINTLY with the buildings of the year (occlusion), plus per-pixel path parameter s (0..1) and height.
import sys, os, math, json, numpy as np, shapely, shapely.ops  # ERA_CITY
import sys, math, json, numpy as np, shapely, shapely.ops
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); import eracity as EC   # per city (CITY unset = SF's literals)  # ERA_CITY
from shapely.geometry import LineString, Polygon
sys.path.insert(0, '/Users/daniel/code/qipu-render-work/eras2/transitions')
import stage as S
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import common as CM; S.SNAP = CM.SNAP; S.records()
import era as ERA, era_lost as LOST, city_data, terrain_hq as T
from scipy.spatial import cKDTree
FWJ = S.SNAP + '/data/freeways/freeways.json'
if EC.CITY != 'sf': FWJ = None   # SF's freeways.json; another city's today structures (bridges) are era.STRUCTURES, dated  # ERA_CITY
CH_M = 4.0


def _year_of_factory():
    fw = city_data.freeway_points(); kd = cKDTree(np.array([(f[0], f[1]) for f in fw]))
    def year_of(w):   # = era.freeway_keep's year_of (mathutils KDTree -> scipy)
        P = w['pts']; x, y = P[len(P) // 2][0], P[len(P) // 2][1]
        nm = (w.get('name') or ''); ref = (w.get('ref') or '')
        if 'Transbay' in nm: return 2018.6
        if 'Presidio Parkway' in nm or 'Doyle' in nm: return 1936
        if 'Central Freeway' in nm: return 1959
        if ref.startswith('I 80'): return ERA.freeway_year('I-80', x, y)
        if ref.startswith('I 280'): return ERA.freeway_year('I-280', x, y)
        if ref.startswith('US 101') and 'CA 1' not in ref: return ERA.freeway_year('HWY 101', x, y) or 1936
        dd, i = kd.query((x, y))
        if dd < 80:
            fy = ERA.freeway_year(fw[i][2], x, y)
            if fy is not None: return fy
        return 1970
    return year_of


def _stands(y0, y1, yr):  # yr None = today
    return (yr is None and y1 >= 9000) or (yr is not None and y0 <= yr < y1)


def _chunks_path(path, w, hfun, zgfun):
    """a path (world m) cut into <= CH_M pieces, each a flat-capped buffered quad prism; hfun(t) / zgfun(x, y) per piece"""
    L = LineString(path); n = max(1, int(math.ceil(L.length / CH_M))); out = []
    for k in range(n):
        a, b = k / n, (k + 1) / n
        seg = shapely.ops.substring(L, a, b, normalized=True)
        if seg.length < 0.05: continue
        poly = seg.buffer(w / 2, cap_style='flat')
        if poly.is_empty or poly.geom_type != 'Polygon': continue
        ring = list(poly.exterior.coords)[:-1]; m = seg.interpolate(0.5, normalized=True)
        out.append(dict(ring=ring, zg=float(zgfun(m.x, m.y)), h=float(hfun((a + b) / 2)), t=(a + b) / 2))
    return out


def lists(Y0, Y1, wbox, pad=400.0):
    """(gone, new): structure dicts {key, kind, gone, y0, y1, dem, h, path_len_m, line (LineString or None), chunks}"""
    x0, y0_, x1, y1_ = wbox[0] - pad, wbox[1] - pad, wbox[2] + pad, wbox[3] + pad
    near = lambda pts: any(x0 <= p[0] <= x1 and y0_ <= p[1] <= y1_ for p in pts)
    gz = lambda x, y: float(T.true_ground(np.array([x]), np.array([y]))[0])
    gone, new = [], []
    for st in ERA.STRUCTURES:                                  # the lost viaducts
        if not near(st['path']): continue
        a, b = _stands(st['y0'], st['y1'], Y0), _stands(st['y0'], st['y1'], Y1)
        if a == b: continue
        dk = list(st.get('decks', [7.5, 14.0]))
        if st.get('deck1_until') and Y0 >= st['deck1_until']: dk = [7.5]
        h = max(dk) + 1.6
        s = dict(key=st['k'], kind=st['kind'], gone=a, y0=st['y0'], y1=st['y1'], dem=st.get('dem'), h=h, w=st['w'],
                 line=LineString(st['path']), chunks=_chunks_path(st['path'], st['w'], lambda t: h, gz))
        if st.get('hag'):   # (V-ERAS) another city's structure with a deck profile (era._hag): zabs = a bridge deck at ABSOLUTE z  # ERA_CITY
            _S, _Z = np.asarray(st['hag'], float).T   # (bridges_city.py), else height over ground + its deck (C1 viaducts); each chunk  # ERA_CITY
            for c_ in s['chunks']: c_['h'] = max(0.3, float(np.interp(c_['t'] * s['line'].length, _S, _Z)) + (-c_['zg'] if st.get('zabs') else max(dk)) + 1.6)  # ERA_CITY
            s['h'] = max([c_['h'] for c_ in s['chunks']] + [0.3])  # ERA_CITY
        s['path_len_m'] = s['line'].length; (gone if a else new).append(s)
    for e in LOST.LOST:                                        # the lost halls / terminals (era_lost)
        f = e['form']; c = f.get('c')
        if c is None or not near([c]): continue
        a, b = _stands(e['y0'], e['y1'], Y0), _stands(e['y0'], e['y1'], Y1)
        if a == b: continue
        if f['kind'] != 'block': print('structures: era_lost', e['key'], f['kind'], 'near the window: form not rasterised (only block)'); continue
        (ux, uy), (vx, vy) = LOST._frame(f.get('ang', 0.0)); hl, hw = f['L'] / 2, f['W'] / 2
        ring = [(c[0] + sx * hl * ux + sy * hw * vx, c[1] + sx * hl * uy + sy * hw * vy) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        ln = LineString([(c[0] - hl * ux, c[1] - hl * uy), (c[0] + hl * ux, c[1] + hl * uy)])   # s along the long axis
        h = f['h'] + 0.3
        s = dict(key=e['key'], kind='lost_' + f['kind'], gone=a, y0=e['y0'], y1=e['y1'], dem=e.get('dem'), h=h, w=f['W'], line=ln,
                 chunks=[dict(ring=ring, zg=gz(*c) - 1.0, h=h + 1.0, t=0.5)], path_len_m=f['L'])
        (gone if a else new).append(s)
    year_of = _year_of_factory() if FWJ else None                                # today's viaducts / ramps a past year does not have
    for w in (json.load(open(FWJ))['ways'] if FWJ else []):
        if not near(w['pts']): continue
        yo = year_of(w); a, b = _stands(yo, 9999, Y0), _stands(yo, 9999, Y1)
        if a == b: continue
        P = np.asarray(w['pts'], float); Hg = np.asarray(w['hag'], float)
        L = LineString(P[:, :2]); cum = np.r_[0, np.cumsum(np.hypot(*np.diff(P[:, :2], axis=0).T))] / max(L.length, 1e-6)
        hfun = lambda t, cum=cum, Hg=Hg: max(0.3, float(np.interp(t, cum, Hg)) + (1.0 if np.interp(t, cum, Hg) >= 0.6 else 0.0))
        s = dict(key=f"{(w.get('name') or w['hw']).lower().replace(' ', '_')}_{w['id']}", kind=w['hw'], gone=a, y0=yo, y1=9999, dem=None,
                 h=float(Hg.max()) + 1.0, w=w['width'], line=L, chunks=_chunks_path(P[:, :2].tolist(), w['width'], hfun, gz), path_len_m=L.length)
        (gone if a else new).append(s)
    return gone, new


def chunk_prisms(sts):
    """flat list of chunk prisms (+ owner structure index), for a joint id_map with the buildings"""
    ch, own = [], []
    for i, s in enumerate(sts):
        for c in s['chunks']: ch.append(dict(ring=c['ring'], zg=c['zg'], h=c['h'], key=f"{s['key']}#{len(ch)}")); own.append(i)
    return ch, np.array(own + [-1], np.int32)


def s_param(sts, K, Zabove, zg_px, O):
    """per pixel path parameter (0..1) of the structure K >= 0 there: back-projected at the surface height, located on its line"""
    s = np.full(K.shape, -1.0, np.float32)
    for i, st in enumerate(sts):
        m = K == i
        if not m.any(): continue
        ys, xs = np.nonzero(m)
        X = (xs + 0.5 + O[0]) / 2 - S.OX; Y = (ys + 0.5 + O[1]) / 2 - S.OY
        wx, wy = S.c2w(X, Y, zg_px[m] + Zabove[m])
        s[m] = shapely.line_locate_point(st['line'], shapely.points(wx, wy), normalized=True)
    return s
