"""THE ROAD MARKINGS (25/09, for the deep zoom: levels 8-9), called by
life_traffic.build after the red lanes. LIFE_MARKS=0 skips.

At level 9 (9 cm/px) a street reads as a street by its paint. The engine's
export carries the zebra crosswalks (hq_city's 'markings', kept as they are);
this draws the rest as thin decals 3.5 cm over the street mesh:
  lane lines   dashed white between lanes of one direction (MUTCD: 10 ft on,
               30 ft off, 4-6 in wide: 3 m / 9 m, 12 cm)
  centre line  double yellow (two 12 cm lines 10 cm apart) where a two-way
               arterial or collector has lanes both ways (OSM highway primary,
               secondary, tertiary, trunk; residential streets only when OSM
               lanes >= 3); none across a median (the median's own kerbs)
  stop bars    white, 45 cm (18 in), across the approach lanes, 1.2 m behind
               the crosswalk the export draws there (the zebra is found on the
               lane), else at the intersection's clear radius
  bike lanes   from the SFMTA Bikeway Network (DataSF, MTA Bike Network Linear
               Features, ygmz-vaxd, fetched 25/09 to life/bikeways_sfmta.json):
               class II lanes between the parking lane and the traffic, class
               IV separated ones at the kerb with the parking outside them (the
               posts not drawn), 15 cm white lines along them;
               GREEN where the record says 'GREEN PAINT' (surface_tr), and the
               buffered ones' second line 0.9 m out
OSM lane_markings=no suppresses a way's lines. The red transit lanes stay
life_traffic's (red_verified.json only). Where a street has no room for its
lanes the lines are not drawn (never across a kerb). Every draw is by place.
Sources: OSM ways (ODbL, (c) OpenStreetMap contributors), SFMTA / DataSF (PDDL).
"""
import json, math, os
import numpy as np

LIFE = '/Users/daniel/code/qipu-render-work/life'
# worn paint, LINEAR albedo (bcol): white ~sRGB 203, yellow ~206/170/63, SFMTA green ~89/149/101
WHITE = (0.60, 0.60, 0.58, 1.0)
YELLOW = (0.62, 0.40, 0.05, 1.0)
GREEN = (0.10, 0.30, 0.13, 1.0)
LINE_W, BIKE_W, BAR_W = 0.12, 0.15, 0.45
DASH_ON, DASH_P = 3.0, 12.0
CENTRE = ('primary', 'secondary', 'tertiary', 'trunk', 'unclassified')
SKIP = ('motorway', 'motorway_link', 'busway', 'service', 'track', 'path', 'footway', 'cycleway', 'pedestrian', 'living_street', 'steps')
NO_PARK = {'motorway', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
KX = 111320 * 0.790582709628753; KY = 111320.0     # life_prep.xy's engine projection
DIRV = {'N': (0.0, 1.0), 'S': (0.0, -1.0), 'E': (1.0, 0.0), 'W': (-1.0, 0.0)}


def _resample(pts, step):
    P = np.asarray(pts, float)
    seg = np.hypot(*np.diff(P, axis=0).T); P = P[np.concatenate([[True], seg > 1e-3])]
    if len(P) < 2: return None
    s = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))])
    n = max(2, int(math.ceil(s[-1] / step)) + 1); S = np.linspace(0, s[-1], n)
    X = np.interp(S, s, P[:, 0]); Y = np.interp(S, s, P[:, 1])
    TX = np.gradient(X); TY = np.gradient(Y); tl = np.hypot(TX, TY) + 1e-12
    return X, Y, S, TX / tl, TY / tl


def _osm_tags(log):
    p = os.path.join(LIFE, 'roads_osm.json')
    if not os.path.exists(p): return {}
    out = {}
    for e in json.load(open(p))['elements']:
        t = e.get('tags', {})
        k = {a: b for a, b in t.items() if a.startswith('cycleway') or a in ('lane_markings', 'lanes')}
        if k: out[e['id']] = k
    return out


def _bikeways(inb, log):
    """SFMTA's class II / IV records near the region: points every 3 m with
    (tangent, class, green, buffered, direct, dir, contraflow)"""
    p = os.path.join(LIFE, 'bikeways_sfmta.json')
    if not os.path.exists(p): log('life_marks: no SFMTA bikeways file'); return None, []
    from mathutils.kdtree import KDTree
    pts, att = [], []
    for d in json.load(open(p)):
        cls = d.get('facility_t') or ''
        if cls not in ('CLASS II', 'CLASS IV'): continue
        g = d.get('shape') or {}
        lines = g.get('coordinates') or []
        if g.get('type') == 'LineString': lines = [lines]
        a = dict(c4=cls == 'CLASS IV', green='GREEN PAINT' in (d.get('surface_tr') or ''), buf=(d.get('buffered') == 'YES'),
                 two=(d.get('direct') or '2W') == '2W', dir=DIRV.get((d.get('dir') or '')[:1]), contra=(d.get('contraflow') == 'YES'))
        for ln in lines:
            P = np.array([((lo + 122.438) * KX, (la - 37.76) * KY) for lo, la in ln])
            if len(P) < 2 or not any(inb(x, y, 200) for x, y in P): continue
            rs = _resample(P, 3.0)
            if rs is None: continue
            for x, y, tx, ty in zip(rs[0], rs[1], rs[3], rs[4]):
                pts.append((x, y)); att.append((tx, ty, a))
    if not pts: return None, []
    kd = KDTree(len(pts))
    for i, (x, y) in enumerate(pts): kd.insert((x, y, 0.0), i)
    kd.balance()
    return kd, att


def _zebras(sc):
    """a KD tree of the export's crosswalk bars (hq_city's 'markings' mesh)"""
    from mathutils.kdtree import KDTree
    ob = sc.objects.get('markings')
    if ob is None or ob.type != 'MESH' or not len(ob.data.vertices): return None
    V = np.zeros(len(ob.data.vertices) * 3, np.float32); ob.data.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
    kd = KDTree(len(V))      # (mesh_from's objects sit at the origin: vertices are world)
    for i, v in enumerate(V): kd.insert((float(v[0]), float(v[1]), 0.0), i)
    kd.balance(); return kd


def build(bpy, sc, coll, D, street_z, kt, inb, log):
    import time
    import transit_geom as TG
    t0 = time.time()
    tags = _osm_tags(log)
    kb, batt = _bikeways(inb, log)
    kz = _zebras(sc)
    bank = TG.Bank(); stats = dict(ways=0, lane=0, centre=0, bike=0, green=0, bar=0)

    def scan(x0, y0, nx, ny):
        """the carriageway across the way at (x0, y0): (cl, cr, median)"""
        runs = {}
        for sd in (1, -1):
            rs_ = []; on = False; st = 0.0; d_ = 0.0
            while d_ < 28.0 and len(rs_) < 2:
                o = street_z(x0 + nx * sd * d_, y0 + ny * sd * d_) is not None
                if o and not on: st = d_; on = True
                elif not o and on: rs_.append((st, d_ - 0.3)); on = False
                d_ += 0.6
            if on: rs_.append((st, d_))
            runs[sd] = rs_
        L1, R1 = runs[1], runs[-1]
        if L1 and R1 and L1[0][0] == 0.0 and R1[0][0] == 0.0: return (-R1[0][1], L1[0][1], None)
        if L1 and R1 and L1[0][0] < 9.0 and R1[0][0] < 9.0: return (-R1[0][1], L1[0][1], (-R1[0][0], L1[0][0]))
        return None

    def bike_at(x, y, tx, ty, oneway):
        """(fwd, back, green, buffered, class IV) from SFMTA at this point"""
        if kb is None: return None
        co, i, d = kb.find((x, y, 0.0))
        if i is None or d > 9.0: return None
        btx, bty, a = batt[i]
        if abs(btx * tx + bty * ty) < 0.8: return None           # a cross street's record
        if a['two']: f, b = True, (not oneway) or a['contra']
        else:
            dv = a['dir'] or (btx, bty); dt = dv[0] * tx + dv[1] * ty
            f, b = dt > 0.2, dt < -0.2
            if oneway and b: f, b = False, True                   # a contraflow lane on a one-way street
        return (f, b, a['green'], a['buf'], a['c4'])

    for r in D['roads']:
        hw = r['hw']; base = hw.replace('_link', '')
        if hw in SKIP or base in SKIP or r['br'] or r.get('one'): continue
        if not any(inb(x, y, 60) for x, y in r['pts'][:: max(1, len(r['pts']) // 8)] + [r['pts'][-1]]): continue
        t = tags.get(r['id'], {})
        if t.get('lane_markings') == 'no': continue
        rs = _resample(r['pts'], 1.0)
        if rs is None: continue
        X, Y, S, TX, TY = rs; n = len(X)
        nf, nb = r['nf'], r['nb']; oneway = nb == 0
        centre = (not oneway) and nf >= 1 and nb >= 1 and (base in CENTRE or (nf + nb) >= 3)
        lanes_f = nf >= 2; lanes_b = nb >= 2
        R_ix = 13.0 if base in ('trunk', 'primary', 'secondary') else 10.0
        ix = sorted(r.get('ix', []))
        # the layout, scanned every 5 m and held in between (a gap where the
        # carriageway is not found)
        # (every 5 m, a 3-scan median against the 0.6 m steps of the scan, and
        # linear in between: held values drew the lines as stair steps)
        idx = [i for i in list(range(0, n, 5)) + ([n - 1] if (n - 1) % 5 else []) if inb(X[i], Y[i], 30)]
        sc_ = {i: scan(X[i], Y[i], -TY[i], TX[i]) for i in idx}
        good = [i for i in idx if sc_[i] is not None]
        for k_, i in enumerate(good):
            nb_ = [sc_[j] for j in good[max(0, k_ - 1):k_ + 2] if (sc_[j][2] is None) == (sc_[i][2] is None) and abs(j - i) <= 10]
            if len(nb_) == 3:
                sc_[i] = (sorted(v[0] for v in nb_)[1], sorted(v[1] for v in nb_)[1], sc_[i][2])
        lay = [None] * n
        for k_, i in enumerate(idx[:-1]):
            j = idx[k_ + 1]; a_, b_ = sc_[i], sc_[j]
            for m_ in range(i, j + 1):
                if not inb(X[m_], Y[m_], 30): continue
                if a_ is None or b_ is None or (a_[2] is None) != (b_[2] is None) or j - i > 5: lay[m_] = a_ if m_ < j else b_; continue
                t_ = (m_ - i) / max(1, j - i)
                med = None if a_[2] is None else (a_[2][0] + (b_[2][0] - a_[2][0]) * t_, a_[2][1] + (b_[2][1] - a_[2][1]) * t_)
                lay[m_] = (a_[0] + (b_[0] - a_[0]) * t_, a_[1] + (b_[1] - a_[1]) * t_, med)
        if len(idx) == 1: lay[idx[0]] = sc_[idx[0]]
        bk = [bike_at(X[i], Y[i], TX[i], TY[i], oneway) if (i % 5 == 0) else None for i in range(n)]
        for i in range(n):
            if bk[i] is None and i % 5 and bk[i - i % 5] is not None: bk[i] = bk[i - i % 5]
        if not (centre or lanes_f or lanes_b or any(b_ is not None for b_ in bk)) and not ix: continue
        stats['ways'] += 1
        strips = {}

        def put(key, i, u, w, col):
            x0, y0, nx, ny = X[i], Y[i], -TY[i], TX[i]
            x, y = x0 + nx * u, y0 + ny * u
            z = street_z(x, y)
            if z is None: flush(key); return
            h = w / 2
            strips.setdefault(key, [col, []])[1].append(((x - nx * h, y - ny * h, z + 0.035), (x + nx * h, y + ny * h, z + 0.035)))

        def flush(key):
            s_ = strips.get(key)
            if s_ and len(s_[1]) >= 2:
                A = np.array([p[0] for p in s_[1]]); B = np.array([p[1] for p in s_[1]])
                bank.strip('marks', A, B, s_[0])
            if s_: s_[1].clear()

        def layout(i):
            L_ = lay[i]
            if L_ is None: return None
            cl, cr, med = L_
            b_ = bk[i] or (False, False, False, False, False)
            bw = 1.5 + (0.9 if b_[3] else 0.0)
            wf, wb = (bw if b_[0] else 0.0), (bw if b_[1] else 0.0)
            if med is None:
                nl = max(1, nf + nb); rem = cr - cl - nl * 3.1 - wf - wb
                if hw in NO_PARK: park = parkb = 0.0
                elif oneway: park = float(np.clip(rem, 0.0, 2.4)); parkb = float(np.clip(rem - park, 0.0, 2.4))
                else: park = parkb = float(np.clip(rem / 2, 0.0, 2.4))
                lw = (cr - cl - park - parkb - wf - wb) / nl
                if lw < 2.5: return None                       # no room: draw nothing rather than across a kerb
                lw = min(lw, 3.9)
                uf0 = cl + park + wf
                return dict(cl=cl, cr=cr, park=park, parkb=parkb, lw=lw, uf0=uf0, uc=uf0 + nf * lw, ub0=cr - parkb - wb, wf=wf, wb=wb, b=b_, med=False)
            a_, b2 = med
            lwf = (a_ - cl - wf) / max(1, nf); lwb = (cr - b2 - wb) / max(1, nb)
            if min(lwf, lwb if nb else 9.0) < 2.5: return None
            return dict(cl=cl, cr=cr, park=0.0, parkb=0.0, lw=min(3.9, lwf), lwb=min(3.9, lwb), uf0=cl + wf, uc=None, ub0=cr - wb, wf=wf, wb=wb, b=b_, med=True)

        for i in range(n):
            s = S[i]
            nearix = any(abs(s - q) < R_ix for q in ix)
            Lo = None if nearix else layout(i)
            if Lo is None:
                for k in list(strips): flush(k)
                continue
            keys = set()
            dash = (s % DASH_P) < DASH_ON
            if lanes_f and dash:
                for k in range(1, nf):
                    key = ('lf', k); keys.add(key); put(key, i, Lo['uf0'] + k * Lo['lw'], LINE_W, WHITE)
            if lanes_b and dash:
                lwb = Lo.get('lwb', Lo['lw'])
                for k in range(1, nb):
                    key = ('lb', k); keys.add(key); put(key, i, Lo['ub0'] - k * lwb, LINE_W, WHITE)
            if centre and not Lo['med']:
                for k, du in (('c1', -0.11), ('c2', 0.11)):
                    key = ('c', k); keys.add(key); put(key, i, Lo['uc'] + du, LINE_W, YELLOW)
            b_ = Lo['b']
            if b_[0] and Lo['wf'] > 0:
                u0 = Lo['cl'] + (0.0 if b_[4] else Lo['park']); u1 = u0 + 1.5        # class IV: at the kerb, the parking outside it
                if b_[2]: keys.add(('gf',)); put(('gf',), i, (u0 + u1) / 2, 1.5, GREEN)
                keys.add(('bf1',)); put(('bf1',), i, u1, BIKE_W, WHITE)
                if b_[3]: keys.add(('bf2',)); put(('bf2',), i, u1 + 0.9, BIKE_W, WHITE)
                if Lo['park'] > 0.5 and not b_[4]: keys.add(('bf0',)); put(('bf0',), i, u0, BIKE_W, WHITE)
            if b_[1] and Lo['wb'] > 0:
                u1 = Lo['cr'] - (0.0 if b_[4] else Lo['parkb']); u0 = u1 - 1.5
                if b_[2]: keys.add(('gb',)); put(('gb',), i, (u0 + u1) / 2, 1.5, GREEN)
                keys.add(('bb1',)); put(('bb1',), i, u0, BIKE_W, WHITE)
                if b_[3]: keys.add(('bb2',)); put(('bb2',), i, u0 - 0.9, BIKE_W, WHITE)
                if Lo['parkb'] > 0.5 and not b_[4]: keys.add(('bb0',)); put(('bb0',), i, u1, BIKE_W, WHITE)
            for k in list(strips):
                if k not in keys: flush(k)
        for k in list(strips): flush(k)
        stats['lane'] += int(lanes_f or lanes_b); stats['centre'] += int(centre); stats['bike'] += int(any(b_ is not None for b_ in bk))
        stats['green'] += int(any(b_ is not None and b_[2] for b_ in bk))

        # STOP BARS: the approach lanes at each intersection, behind its crosswalk
        if hw.endswith('_link') and base in ('motorway', 'trunk'): continue
        Ls = S[-1]
        for q in ix:
            for sgn in ((1,) if q >= Ls - 1.0 else (-1,) if q <= 1.0 else (1, -1)):
                if oneway and sgn < 0: continue
                # sgn 1: the forward traffic comes up to q; -1: the backward traffic down to q
                sa = None
                for d_ in np.arange(3.0, 24.0, 0.5):
                    s_ = q - sgn * d_
                    if not (0.5 < s_ < Ls - 0.5): break
                    i = int(round(s_)); L_ = layout(min(max(i, 0), n - 1)) if lay[min(max(i, 0), n - 1)] is not None else None
                    if L_ is None: continue
                    uln = (L_['uf0'] + 0.5 * L_['lw']) if sgn > 0 else (L_['ub0'] - 0.5 * L_.get('lwb', L_['lw']))
                    if kz is not None and kz.find((X[i] - TY[i] * uln, Y[i] + TX[i] * uln, 0.0))[2] < 1.0: sa = d_
                    elif sa is not None and d_ > sa + 2.0: break
                d_bar = (sa + 1.2) if sa is not None else R_ix + 0.6
                s_bar = q - sgn * d_bar
                if not (1.0 < s_bar < Ls - 1.0): continue
                i = int(round(s_bar)); i = min(max(i, 0), n - 1)
                L_ = layout(i)
                if L_ is None: continue
                if sgn > 0: ua, ub = L_['cl'] + L_['park'], (L_['uc'] if L_['uc'] is not None and not oneway else L_['cr'] - L_['parkb'])
                else: ua, ub = (L_['uc'] if L_['uc'] is not None else L_['cl']), L_['cr'] - L_['parkb']
                if L_['med']: ua, ub = ((L_['cl'], L_['uf0'] + nf * L_['lw']) if sgn > 0 else (L_['ub0'] - nb * L_.get('lwb', L_['lw']), L_['cr']))
                if ub - ua < 2.0: continue
                tx, ty = TX[i], TY[i]; nx, ny = -ty, tx
                x0, y0 = X[i], Y[i]
                s0, s1 = (0.0, -BAR_W) if sgn > 0 else (0.0, BAR_W)      # the bar's far edge on the line, its body toward the traffic
                C = []
                for uu, ss in ((ua, s0), (ub, s0), (ub, s1), (ua, s1)):
                    x, y = x0 + nx * uu + tx * ss, y0 + ny * uu + ty * ss
                    z = street_z(x, y)
                    if z is None: C = None; break
                    C.append((x, y, z + 0.036))
                if C is None: continue
                bank.quads('marks', C, [(0, 1, 2, 3)], WHITE); stats['bar'] += 1
    nfc = bank.nfaces()
    if not nfc: log('life_marks: nothing drawn'); return 0
    m = bpy.data.materials.get('lf_marks')
    if m is None:
        m = bpy.data.materials.new('lf_marks'); m.use_nodes = True; nt = m.node_tree; pb = nt.nodes['Principled BSDF']
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'bcol'
        # worn paint: a noise toward the asphalt where the tyres run
        geo = nt.nodes.new('ShaderNodeNewGeometry'); nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 1.3; nz.inputs['Detail'].default_value = 6
        nt.links.new(geo.outputs['Position'], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.35; mr.inputs['From Max'].default_value = 0.7
        mr.inputs['To Min'].default_value = 0.55; mr.inputs['To Max'].default_value = 1.0
        nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs[6].default_value = (0.07, 0.068, 0.065, 1.0)
        nt.links.new(mr.outputs[0], mx.inputs[0]); nt.links.new(at.outputs['Color'], mx.inputs[7])
        nt.links.new(mx.outputs[2], pb.inputs['Base Color'])
        pb.inputs['Roughness'].default_value = 0.8
        try: pb.inputs['Specular IOR Level'].default_value = 0.25
        except KeyError: pass
    bank.emit(bpy, coll, {'marks': m}, 'life.marks')
    log(f"life_marks: {stats['ways']} ways ({stats['lane']} with lane lines, {stats['centre']} centre lines, {stats['bike']} bike lanes, "
        f"{stats['green']} green), {stats['bar']} stop bars, {nfc} faces ({time.time() - t0:.1f}s)")
    return nfc
