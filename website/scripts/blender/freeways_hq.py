"""San Francisco's elevated freeways as viaducts, for the path-traced city
(hq_city.py): the I-80 through SoMa, the US-101 Central Freeway, the I-280
and the US-101 viaducts, their ramps, the Transbay bus ramps.

hq_city.py calls, once the scene stands (after life_hq), before camera and
light:
    freeways_hq.build(bpy, scene, mats, ground, box, scene_json, log, era)
build() never raises.

THE PROBLEM. The engine drapes every street on the ground (3DEP bare earth,
which removes the bridges), and the freeways are not in the City's street
file at all: the viaducts came out as lawn with lane dashes on it, and dark
slivers of right of way along them.

WHAT IS BUILT, per elevated carriageway (freeways.json, freeways_prep.py:
OpenStreetMap ways, deck heights MEASURED by the USGS 3DEP LiDAR, class 17):
  * the DECK: the street asphalt and paint (lane dashes 12 ft / 36 ft, edge
    lines, yellow on the left), a concrete parapet on each edge (0.85 m;
    none where the edge runs inside another deck: a gore, the two
    carriageways side by side), the fascia and the soffit, 1.7 m deep (1.4 m
    on a ramp); near a touchdown the deck's sides go down to the ground (the
    fill between retaining walls);
  * the BENTS every 30 m: one round column under a ramp (hammerhead cap),
    two or three under a mainline carriageway, a cap beam across; never
    across a surface street (the bent slides up to 12 m, or is left out) nor
    through a lower deck;
  * the ground UNDER it paved (the lots under the SoMa viaducts), 6 m past
    each edge;
and every motorway carriageway AT GRADE (the approaches, 101 and 280 on the
ground) paved: the engine's street file has no freeway, hq_city drew them as
lawn with lane dashes.
And the at-grade copy is taken away where the deck stands 1.2 m or more over
the ground: the engine's street triangles, markings and kerbs that are not on
a surface street (OSM), the parked cars there, the trees (none grows under a
deck). They are kept aside, not deleted (ab_swap: the old picture, for tests).

TRAFFIC. life_traffic (the life agent) places the moving cars; on a way that
is elevated it asks deck_z(way_id, x, y) and deck_half(way_id) here (pure
Python, no Blender needed) instead of the street mesh.

ERA. Today's viaducts only. With `era` set nothing is built (the history
agent owns the past: the Embarcadero Freeway 1959-91, the Central Freeway
north of Market 1959-2003).

env: FREEWAYS=0 (nothing built, deck_z() answers None) · FW_LOTS=0 (no paving
     under the decks) · FW_HIDE=0 (the at-grade copy left as it was) ·
     FW_GRADE=0 (the motorways at grade left as the engine drew them: lawn
     with lane dashes; by default they are paved, draped on the ground, their
     dashes, kerbs, parked cars, shards and the trees of their 9 m clear zone
     set aside, and deck_z() answers on them as well)

Sources: OpenStreetMap (ODbL, (c) OpenStreetMap contributors); USGS 3DEP
LiDAR CA_SanFrancisco_1_B23 and bare earth (public domain).
"""
import json, math, os, sys, time, traceback
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)

WORK = '/Users/daniel/code/qipu-render-work/freeways'
E = os.environ.get
H_BUILT = 0.6        # the deck is built where it stands this far over the bare earth
H_HIDE = 1.2         # and the at-grade copy is taken away where it stands this far
SPAN = 30.0          # bent spacing (m)
PARA_H, PARA_W = 0.85, 0.35
LOT_M = 6.0          # paving past each deck edge (m)
DASH, GAP = 3.66, 8.5
GG_S = (-3510.76, 6012.75)     # the Golden Gate's south tower (lm_bridges)

_F = None


# ── the data, and what life_traffic asks ─────────────────────────────────────
def load():
    global _F
    if _F is None:
        F = json.load(open(os.path.join(WORK, 'freeways.json')))
        by = {}
        for w in F['ways']:
            w['_P'] = np.asarray(w['pts'], np.float64); w['_H'] = np.asarray(w['hag'], np.float64)
            by[w['id']] = w
        F['_by'] = by
        _F = F
    return _F


def _bias(w):
    # overlapping decks never share a plane: ramps a little under the mainline
    return (0.0 if w['hw'] in ('motorway', 'trunk') else -0.03) - 0.006 * (w['id'] % 3)


def _proj(w, x, y):
    """nearest point of the way's centre line: (segment + t, lateral distance, deck z, height over the ground)"""
    P = w['_P']; A = P[:-1, :2]; AB = P[1:, :2] - A; L2 = (AB ** 2).sum(1) + 1e-12
    t = np.clip(((x - A[:, 0]) * AB[:, 0] + (y - A[:, 1]) * AB[:, 1]) / L2, 0, 1)
    d2 = (A[:, 0] + t * AB[:, 0] - x) ** 2 + (A[:, 1] + t * AB[:, 1] - y) ** 2
    k = int(d2.argmin()); tt = float(t[k])
    return k + tt, math.sqrt(float(d2[k])), float(P[k, 2] * (1 - tt) + P[k + 1, 2] * tt), \
        float(w['_H'][k] * (1 - tt) + w['_H'][k + 1] * tt)


def elevated(way_id):
    """True if some part of this OSM way is built here as a deck (in the air)"""
    if E('FREEWAYS', '1') == '0': return False
    w = load()['_by'].get(way_id)
    return w is not None and float(w['_H'].max()) >= H_BUILT


def deck_z(way_id, x, y):
    """the road's top (render z, m) at (x, y) on this OSM way: its deck where
    it is elevated, the pavement laid here where it runs at grade (every
    motorway carriageway is ours: the engine's street file has none); None
    if the way is not ours or FREEWAYS=0"""
    if E('FREEWAYS', '1') == '0': return None
    w = load()['_by'].get(way_id)
    if w is None: return None
    _, dist, z, h = _proj(w, float(x), float(y))
    if dist > w['width'] / 2 + 4.0: return None
    if h < H_BUILT: return z + 0.03 if E('FW_GRADE', '1') == '1' else None    # the pavement at grade (json z: ground + 0.10)
    return z + _bias(w)


def deck_half(way_id):
    """half the deck's width (m), kerb to kerb inside the parapets"""
    w = load()['_by'].get(way_id)
    return None if w is None else w['width'] / 2 - PARA_W


# ── build ────────────────────────────────────────────────────────────────────
def build(bpy, sc, M, ground, box, d=None, log=print, era=None, keep=None):
    """keep: for a past era, the history agent's filter (way dict -> bool: was
    this carriageway there that year?); without it nothing is built for an era"""
    if era is not None and keep is None:
        log(f'freeways_hq: era {era}: today\'s viaducts are not built (the history agent owns the past)'); return
    if E('FREEWAYS', '1') == '0': return
    t0 = time.time()
    try:
        _build(bpy, sc, M, ground, box, log, t0, keep=keep)
    except Exception as ex:
        traceback.print_exc(); log('freeways_hq: FAILED, scene left as it was:', ex)


def build_ways(bpy, sc, M, ground, box, ways, log=print, name='freeways_era'):
    """decks, parapets, bents and the paving under them for ways given by the
    caller (the history agent's lost freeways): each way a dict with id (int),
    hw ('motorway' or 'motorway_link'), lanes, width (m, kerb to kerb), s (arc
    length, m, per point), pts [[x, y, z deck top]...] every ~3 m, hag (deck
    over the ground, m, per point). Two stacked ways of a double deck: the
    bents rise through the lower one. Nothing at grade is hidden. Never raises."""
    try:
        _build(bpy, sc, M, ground, box, log, time.time(), ways=ways, name=name, hide=False)
    except Exception as ex:
        traceback.print_exc(); log('freeways_hq.build_ways: FAILED:', ex)


def _mats(bpy, M):
    T = {}
    a = M['asphalt'].copy(); a.name = 'fw.asphalt'
    # no manhole covers on a viaduct: the road material's cover cells off
    for n in a.node_tree.nodes:
        if n.type == 'MATH' and n.operation in ('LESS_THAN', 'GREATER_THAN'):
            v = n.inputs[1].default_value
            if abs(v - 0.34 / 25.0) < 1e-6 or abs(v - 0.28 / 25.0) < 1e-6: n.inputs[1].default_value = -1.0 if n.operation == 'LESS_THAN' else 9.0
    T['asph'] = a
    T['paint'] = M['paint']
    y = M['paint'].copy(); y.name = 'fw.yellow'
    for n in y.node_tree.nodes:
        if n.type == 'MIX' and n.data_type == 'RGBA' and tuple(round(v, 2) for v in n.inputs[7].default_value[:3]) == (0.78, 0.77, 0.72):
            n.inputs[7].default_value = (0.80, 0.58, 0.14, 1)
    T['yellow'] = y
    c = M['sidewalk'].copy(); c.name = 'fw.concrete'
    pr = next(n for n in c.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    if pr.inputs['Base Color'].links:
        src = pr.inputs['Base Color'].links[0].from_socket
        hv = c.node_tree.nodes.new('ShaderNodeHueSaturation'); hv.inputs['Value'].default_value = 0.92
        hv.inputs['Saturation'].default_value = 0.8
        c.node_tree.links.new(src, hv.inputs['Color']); c.node_tree.links.new(hv.outputs['Color'], pr.inputs['Base Color'])
    T['conc'] = c
    lot = M['asphalt'].copy(); lot.name = 'fw.lot'
    for n in lot.node_tree.nodes:
        if n.name == 'road_k':
            n.inputs[7].default_value = (1.18 * 1.32, 1.14 * 0.99, 1.08 * 0.65, 1) if os.environ.get('GROUND_V2', '1') == '1' else (1.18, 1.14, 1.08, 1)   # [GROUND_V2] road_mat's de-blue gain kept
    T['lot'] = lot
    return T


class _Acc:
    def __init__(self): self.V = []; self.F = []
    def quad(self, a, b, c, d_):
        k = len(self.V); self.V += [a, b, c, d_]; self.F.append((k, k + 1, k + 2, k + 3))
    def poly(self, pts):
        k = len(self.V); self.V += list(pts); self.F.append(tuple(range(k, k + len(pts))))


def _runs(mask):
    out = []; i = 0; n = len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j + 1 < n and mask[j + 1]: j += 1
            out.append((max(0, i - 1), min(n - 1, j + 1))); i = j + 1
        else: i += 1
    return out


def _stripe(Q, s, N, zf, off, s0_, s1_, width, acc):
    """a painted strip at lateral offset `off` from arc s0_ to s1_; zf(q, off) the surface"""
    ss = [s0_] + [q for q in s if s0_ < q < s1_] + [s1_]
    pl, pr = [], []
    for q in ss:
        qx = np.interp(q, s, Q[:, 0]); qy = np.interp(q, s, Q[:, 1])
        nx = np.interp(q, s, N[:, 0]); ny = np.interp(q, s, N[:, 1]); nn = math.hypot(nx, ny) or 1.0
        nx /= nn; ny /= nn
        pl.append((qx + nx * (off + width / 2), qy + ny * (off + width / 2), zf(q, off + width / 2) + 0.015))
        pr.append((qx + nx * (off - width / 2), qy + ny * (off - width / 2), zf(q, off - width / 2) + 0.015))
    for i in range(len(ss) - 1):
        acc.quad(pr[i], pr[i + 1], pl[i + 1], pl[i])


def _paint(r, zf, A, para=True):
    """lane dashes (12 ft / 36 ft), a solid white right edge line and a yellow
    left one (one-way carriageways: OSM draws each direction)"""
    Q, N, half, s = r['Q'], r['N'], r['half'], r['s']
    w = r['w']; nl = max(1, int(w['lanes']))
    sl = 0.9 if r['link'] else 1.2
    pw = PARA_W if para else 0.0
    lw = min(3.66, (2 * half - 2 * pw - sl - 0.6) / nl)
    offs = [half - pw - sl - i * lw for i in range(nl + 1)]
    sA, sB = float(s[0]) + 1.0, float(s[-1]) - 1.0
    if sB - sA <= 4: return
    _stripe(Q, s, N, zf, offs[0], sA, sB, 0.22, A['yellow'])
    _stripe(Q, s, N, zf, offs[-1], sA, sB, 0.22, A['paint'])
    for off in offs[1:-1]:
        q = math.ceil(sA / (DASH + GAP)) * (DASH + GAP)
        while q + DASH < sB:
            _stripe(Q, s, N, zf, off, q, q + DASH, 0.3, A['paint']); q += DASH + GAP


def _build(bpy, sc, M, ground, box, log, t0, ways=None, name='freeways', hide=True, keep=None):
    from mathutils import Vector
    from mathutils.kdtree import KDTree
    F = load()
    x0, y0, x1, y1 = box; pad = 300.0
    def inb(x, y, p=pad): return x0 - p <= x <= x1 + p and y0 - p <= y <= y1 + p
    if ways is not None:
        for w in ways: w['_P'] = np.asarray(w['pts'], np.float64); w['_H'] = np.asarray(w['hag'], np.float64)
    W = [w for w in (F['ways'] if ways is None else ways) if any(inb(x, y) for x, y, _ in w['pts'][::4] + [w['pts'][-1]]) and (keep is None or keep(w))]
    if not W: log('freeways_hq: no viaduct in the region'); return
    T = _mats(bpy, M)
    coll = bpy.data.collections.new(name); sc.collection.children.link(coll)
    A = {k: _Acc() for k in ('asph', 'paint', 'yellow', 'conc', 'lot')}
    # every built deck sample: for the parapet, pier and lower-deck tests
    R = []
    for w in W:
        P = w['_P']; H = w['_H']
        for a, b in _runs(H >= H_BUILT):
            if b - a < 1: continue
            Q = P[a:b + 1].copy(); h = H[a:b + 1].copy(); s = np.asarray(w['s'][a:b + 1], np.float64)
            keep = np.array([inb(x, y) for x, y in Q[:, :2]])
            if not keep.any(): continue
            tg = np.gradient(Q[:, :2], axis=0); tg /= np.maximum(1e-9, np.linalg.norm(tg, axis=1))[:, None]
            R.append(dict(w=w, Q=Q, h=h, s=s, T=tg, N=np.stack([-tg[:, 1], tg[:, 0]], 1), z=Q[:, 2] + _bias(w),
                          half=w['width'] / 2, link=w['hw'] not in ('motorway', 'trunk')))
    # the carriageways at grade (and the at-grade ends of the elevated ones):
    # a pavement draped on the ground
    RG = []
    if E('FW_GRADE', '1') == '1' and ways is None:
        for w in W:
            P = w['_P']; H = w['_H']
            if w['hw'] not in ('motorway', 'motorway_link'): continue    # the trunk roads are in the City's street file
            for a, b in _runs(H < H_BUILT):
                if b - a < 1: continue
                Q = P[a:b + 1].copy(); s_ = np.asarray(w['s'][a:b + 1], np.float64)
                # the Golden Gate's approach and toll plaza are the landmarks agent's
                if np.hypot(Q[:, 0] - GG_S[0], Q[:, 1] - GG_S[1]).min() < 900: continue
                if not any(inb(x, y, 60) for x, y in Q[:, :2]): continue
                tg = np.gradient(Q[:, :2], axis=0); tg /= np.maximum(1e-9, np.linalg.norm(tg, axis=1))[:, None]
                RG.append(dict(w=w, Q=Q, s=s_, T=tg, N=np.stack([-tg[:, 1], tg[:, 0]], 1), half=w['width'] / 2,
                               link=w['hw'] not in ('motorway', 'trunk'), h=np.zeros(len(Q))))
    if not R and not RG: log('freeways_hq: no viaduct in the region'); return
    ns = sum(len(r['Q']) for r in R)
    kd = KDTree(max(1, ns)); ref = []
    for ri, r in enumerate(R):
        for k, (x, y) in enumerate(r['Q'][:, :2]): kd.insert((x, y, 0.0), len(ref)); ref.append((ri, k))
    kd.balance()
    maxhalf = max([r['half'] for r in R + RG] + [1.0])
    def other_decks(x, y, ri, extra=0.0):
        """(z, half) of the other decks whose footprint holds (x, y)"""
        out = []
        for _, idx, dd in kd.find_range((x, y, 0.0), maxhalf + 2.0 + extra):
            rj, k = ref[idx]
            if rj == ri: continue
            r = R[rj]
            # lateral distance to that deck's centre line near sample k
            q = r['Q'][k, :2]; t = r['T'][k]; dx, dy = x - q[0], y - q[1]
            lat = abs(-dx * t[1] + dy * t[0]); lon = abs(dx * t[0] + dy * t[1])
            if lon <= 2.6 and lat < r['half'] + extra: out.append((float(r['z'][k]), r['half'], rj, r['T'][k]))
        return out
    # the surface streets (a pier never stands across one)
    SR = []
    for hw, half, pts in F.get('surface', []):
        P_ = np.asarray(pts, np.float64)
        if not any(inb(x, y) for x, y in P_[::3]): continue
        for (xa, ya), (xb, yb) in zip(P_[:-1], P_[1:]):
            L = math.hypot(xb - xa, yb - ya)
            if L < 0.01: continue
            n_ = max(1, int(L / 2.0))
            for i in range(n_ + 1):
                t_ = i / n_; SR.append((xa + (xb - xa) * t_, ya + (yb - ya) * t_, (xb - xa) / L, (yb - ya) / L, half))
    kds = KDTree(max(1, len(SR)))
    for i, q in enumerate(SR): kds.insert((q[0], q[1], 0.0), i)
    kds.balance()
    def roads_at(x, y, extra=0.0):
        return [SR[i] for _, i, dd in kds.find_range((x, y, 0.0), 11.0 + extra) if dd < SR[i][4] + extra]

    # ── decks ──
    npara = [0, 0]
    for ri, r in enumerate(R):
        Q, z, N, half, h = r['Q'], r['z'], r['N'], r['half'], r['h']
        n = len(Q); Dd = 1.4 if r['link'] else 1.7
        g = Q[:, 2] - h                                            # the bare earth under the deck
        zb = np.where(z - Dd > g + 1.0, z - Dd, g - 0.3)           # near a touchdown: down to the ground
        L = Q[:, :2] + N * half; Rt = Q[:, :2] - N * half
        # parapets: not where the edge runs inside another deck at about the same height
        para = np.ones((n, 2), bool)
        for k in range(n):
            for side, e in ((0, L[k]), (1, Rt[k])):
                if any(abs(zo - z[k]) < 2.0 for zo, _, _, _ in other_decks(e[0], e[1], ri, extra=-0.3)): para[k, side] = False
        npara[0] += int(para.sum()); npara[1] += 2 * n
        for k in range(n - 1):
            a, b = k, k + 1
            V = lambda p, zz: (float(p[0]), float(p[1]), float(zz))
            A['asph'].quad(V(Rt[a], z[a]), V(Rt[b], z[b]), V(L[b], z[b]), V(L[a], z[a]))
            A['conc'].quad(V(L[a], zb[a]), V(L[b], zb[b]), V(Rt[b], zb[b]), V(Rt[a], zb[a]))    # soffit
            for side, E_, sg in ((0, L, 1.0), (1, Rt, -1.0)):
                up = PARA_H if (para[a, side] and para[b, side]) else 0.0
                ea, eb = E_[a], E_[b]
                if side == 0: A['conc'].quad(V(ea, zb[a]), V(ea, z[a] + up), V(eb, z[b] + up), V(eb, zb[b]))
                else: A['conc'].quad(V(eb, zb[b]), V(eb, z[b] + up), V(ea, z[a] + up), V(ea, zb[a]))
                if up:
                    ia = ea - sg * N[a] * PARA_W; ib = eb - sg * N[b] * PARA_W
                    if side == 0:
                        A['conc'].quad(V(ea, z[a] + up), V(ia, z[a] + up), V(ib, z[b] + up), V(eb, z[b] + up))
                        A['conc'].quad(V(ia, z[a] + up), V(ia, z[a]), V(ib, z[b]), V(ib, z[b] + up))
                    else:
                        A['conc'].quad(V(eb, z[b] + up), V(ib, z[b] + up), V(ia, z[a] + up), V(ea, z[a] + up))
                        A['conc'].quad(V(ib, z[b] + up), V(ib, z[b]), V(ia, z[a]), V(ia, z[a] + up))
        for k, sg in ((0, 1.0), (n - 1, -1.0)):                      # end faces
            V = lambda p, zz: (float(p[0]), float(p[1]), float(zz))
            if sg > 0: A['conc'].quad(V(L[k], zb[k]), V(Rt[k], zb[k]), V(Rt[k], z[k]), V(L[k], z[k]))
            else: A['conc'].quad(V(Rt[k], zb[k]), V(L[k], zb[k]), V(L[k], z[k]), V(Rt[k], z[k]))
        _paint(r, lambda q, o, r=r: float(np.interp(q, r['s'], r['z'])), A)
    # ── bents ──
    nb = [0, 0, 0]
    for ri, r in enumerate(R):
        Q, z, half, h, s, Tg = r['Q'], r['z'], r['half'], r['h'], r['s'], r['T']
        w = r['w']; Dd = 1.4 if r['link'] else 1.7; rc = 0.7 if r['link'] else 0.85
        wd = 2 * half
        ncol = 1 if wd <= 11.5 else (2 if wd <= 19.0 else 3)
        across = [0.0] if ncol == 1 else list(np.linspace(-(half - 2.6), half - 2.6, ncol))
        st = math.ceil((s[0] + 8.0) / SPAN) * SPAN + (w['id'] % 5) * 2.0
        while st < s[-1] - 8.0:
            placed = False
            for dsh in (0.0, 4.0, -4.0, 8.0, -8.0, 12.0, -12.0):
                q = st + dsh
                if not (s[0] + 4.0 < q < s[-1] - 4.0): continue
                qx, qy = float(np.interp(q, s, Q[:, 0])), float(np.interp(q, s, Q[:, 1]))
                zq = float(np.interp(q, s, z)); hq = float(np.interp(q, s, h))
                tx, ty = float(np.interp(q, s, Tg[:, 0])), float(np.interp(q, s, Tg[:, 1])); tn = math.hypot(tx, ty) or 1.0
                tx /= tn; ty /= tn; nx, ny = -ty, tx
                gq = zq - hq; zbot = zq - Dd
                if zbot - gq < 2.2: break                              # the fill: no bent
                cols = [(qx + nx * o, qy + ny * o) for o in across]
                ok = True
                for cx, cy in cols:
                    # across a surface street? (along one is fine: a pier in a median)
                    if any(abs(rx * tx + ry * ty) < math.cos(math.radians(35)) for _, _, rx, ry, _ in roads_at(cx, cy, rc + 0.6)):
                        ok = False; break
                    # through a lower deck that crosses? (a double deck's bents do rise through the lower one)
                    if any(zo < zbot - 0.5 and abs(tx * to[0] + ty * to[1]) < math.cos(math.radians(20))
                           for zo, _, _, to in other_decks(cx, cy, ri, extra=rc + 0.5)):
                        ok = False; break
                if not ok:
                    nb[2] += 1; continue
                capd = 1.3 if zbot - gq > 4.5 else 0.0
                gcs = []
                for cx, cy in cols:
                    gg = ground(cx, cy); gcs.append(min(gq, gg if gg is not None else gq) - 0.6)
                for (cx, cy), gc in zip(cols, gcs):
                    top = zbot - capd + 0.05
                    ring = [(cx + rc * math.cos(a_ * math.pi / 4 + math.pi / 8), cy + rc * math.sin(a_ * math.pi / 4 + math.pi / 8)) for a_ in range(8)]
                    for i in range(8):
                        (ax, ay), (bx, by) = ring[i], ring[(i + 1) % 8]
                        A['conc'].quad((ax, ay, gc), (bx, by, gc), (bx, by, top), (ax, ay, top))
                if capd:
                    hc = (half - 1.0) if ncol > 1 else (half - 1.6)
                    hl = 0.9
                    c8 = []
                    for (lo, la) in ((-hl, -hc), (hl, -hc), (hl, hc), (-hl, hc)):
                        c8.append((qx + tx * lo + nx * la, qy + ty * lo + ny * la))
                    zt_, zb_ = zbot + 0.02, zbot - capd
                    for i in range(4):
                        (ax, ay), (bx, by) = c8[i], c8[(i + 1) % 4]
                        A['conc'].quad((ax, ay, zb_), (bx, by, zb_), (bx, by, zt_), (ax, ay, zt_))
                    A['conc'].poly([(x_, y_, zb_) for x_, y_ in c8[::-1]])
                nb[0] += 1; nb[1] += len(cols); placed = True
                break
            st += SPAN
    # ── the paving under the decks ──
    if E('FW_LOTS', '1') == '1':
        for r in R:
            Q, h, N, half = r['Q'], r['h'], r['N'], r['half']
            n = len(Q); ext = half + LOT_M
            if float(h.max()) < 2.0: continue
            offs = np.linspace(-ext, ext, 7)
            G = np.full((n, len(offs)), np.nan)
            for k in range(n):
                if h[k] < 1.5: continue
                for j, o in enumerate(offs):
                    gg = ground(float(Q[k, 0] + N[k, 0] * o), float(Q[k, 1] + N[k, 1] * o))
                    if gg is not None: G[k, j] = gg + 0.05
            for k in range(n - 1):
                for j in range(len(offs) - 1):
                    zz = G[k:k + 2, j:j + 2]
                    if np.isnan(zz).any(): continue
                    p = lambda kk, jj: (float(Q[kk, 0] + N[kk, 0] * offs[jj]), float(Q[kk, 1] + N[kk, 1] * offs[jj]), float(G[kk, jj]))
                    A['lot'].quad(p(k, j), p(k + 1, j), p(k + 1, j + 1), p(k, j + 1))
    # ── at grade: the pavement, draped (5 points across), and its paint ──
    for r in RG:
        Q, N, half, s_ = r['Q'], r['N'], r['half'], r['s']
        n = len(Q); offs = np.linspace(-half, half, 5)
        Z = np.zeros((n, 5))
        for k in range(n):
            for j, o in enumerate(offs):
                gg = ground(float(Q[k, 0] + N[k, 0] * o), float(Q[k, 1] + N[k, 1] * o))
                Z[k, j] = (gg if gg is not None else Q[k, 2] - 0.10) + 0.13
        p = lambda kk, jj: (float(Q[kk, 0] + N[kk, 0] * offs[jj]), float(Q[kk, 1] + N[kk, 1] * offs[jj]), float(Z[kk, jj]))
        for k in range(n - 1):
            for j in range(4): A['asph'].quad(p(k, j), p(k + 1, j), p(k + 1, j + 1), p(k, j + 1))
        def zf(q, o, s_=s_, Z=Z, offs=offs):
            return float(np.interp(o, offs, [np.interp(q, s_, Z[:, j]) for j in range(5)]))
        _paint(r, zf, A, para=False)
    objs = []
    for key, acc in A.items():
        if not acc.F: continue
        me = bpy.data.meshes.new(f'fw.{key}'); me.from_pydata(acc.V, [], acc.F)
        me.validate(); me.update()
        ob = bpy.data.objects.new(f'fw.{key}', me); coll.objects.link(ob); me.materials.append(T[key]); objs.append(ob)
    log(f'freeways_hq: {len(R)} deck runs on {len(W)} ways, {sum(len(o.data.polygons) for o in objs)} faces; '
        f'parapets {npara[0]}/{npara[1]} edge samples; bents {nb[0]} ({nb[1]} columns, {nb[2]} slid or left out off streets/decks) '
        f'({time.time() - t0:.1f}s)')
    # ── the at-grade copy, set aside ──
    if hide and E('FW_HIDE', '1') == '1':
        _hide_grade(bpy, sc, R, RG, roads_at, kd, ref, maxhalf, log)
    log(f'freeways_hq: done ({time.time() - t0:.1f}s)')


def _hide_grade(bpy, sc, R, RG, roads_at, kd, ref, maxhalf, log):
    import bmesh
    from mathutils.kdtree import KDTree
    kg = KDTree(max(1, sum(len(r['Q']) for r in RG))); rg = []
    for ri, r in enumerate(RG):
        for k, (x, y) in enumerate(r['Q'][:, :2]): kg.insert((x, y, 0.0), len(rg)); rg.append((ri, k))
    kg.balance()
    def _in(tree, refs, RR, x, y, extra, hmin):
        for _, idx, dd in tree.find_range((x, y, 0.0), maxhalf + extra + 2.0):
            ri, k = refs[idx]; r = RR[ri]
            if r['h'][k] < hmin: continue
            q = r['Q'][k, :2]; t = r['T'][k]; dx, dy = x - q[0], y - q[1]
            if abs(dx * t[0] + dy * t[1]) <= 2.6 and abs(-dx * t[1] + dy * t[0]) < r['half'] + extra: return True
        return False
    def in_corr(x, y, extra, grade=False):
        return (len(ref) and _in(kd, ref, R, x, y, extra, H_HIDE)) or (grade and len(rg) and _in(kg, rg, RG, x, y, extra, -1.0))
    out = {}
    def split(name, test, verts=False):
        ob = sc.objects.get(name)
        if ob is None or ob.type != 'MESH' or not len(ob.data.vertices): return
        bm = bmesh.new(); bm.from_mesh(ob.data)
        if verts: kill = [v for v in bm.verts if test([v.co])]
        else: kill = [f for f in bm.faces if test([v.co for v in f.verts])]
        if not kill: bm.free(); return
        ob2 = ob.copy(); ob2.data = ob.data.copy(); ob2.name = f'fw.was.{name}'
        for c in ob.users_collection: c.objects.link(ob2)
        ob2.hide_render = True; ob2.hide_viewport = True
        ks = set(k.index for k in kill)
        bmesh.ops.delete(bm, geom=kill, context='VERTS' if verts else 'FACES'); bm.to_mesh(ob.data); ob.data.update(); bm.free()
        bm = bmesh.new(); bm.from_mesh(ob2.data)
        seq = bm.verts if verts else bm.faces; seq.ensure_lookup_table()
        keep = [e for e in seq if e.index not in ks]
        bmesh.ops.delete(bm, geom=keep, context='VERTS' if verts else 'FACES'); bm.to_mesh(ob2.data); ob2.data.update(); bm.free()
        out[name] = len(ks)
    def tri_test(extra, road_extra, grade=False, gextra=None):
        def t(co):
            if not all(in_corr(c.x, c.y, extra) or (grade and in_corr(c.x, c.y, gextra, True)) for c in co): return False
            cx = sum(c.x for c in co) / len(co); cy = sum(c.y for c in co) / len(co)
            return not roads_at(cx, cy, road_extra)
        return t
    # (the engine's right-of-way slivers under a paved carriageway: some stand
    # up as shards through the pavement)
    split('streets', tri_test(2.0, 0.0, True, 0.5))
    split('markings', tri_test(2.0, 0.0, True, 1.0))
    split('sidewalks', tri_test(2.0, 4.0, True, 0.5))
    split('cars', tri_test(1.0, 0.0, True, 0.5), verts=True)
    # no tree under a deck, nor in a freeway's clear zone (Caltrans: 30 ft from
    # the travelled way; a canopy tree's crown here is 8-16 m wide)
    split('trees', lambda co: in_corr(co[0].x, co[0].y, 3.0) or in_corr(co[0].x, co[0].y, 9.0, True), verts=True)
    log('freeways_hq: at-grade copy set aside', out)


def ab_swap(sc):
    """tests: the new picture <-> the old one (the at-grade copy back, no viaducts)"""
    for ob in sc.objects:
        if ob.name.startswith('fw.'): ob.hide_render = not ob.hide_render
