"""The traffic at about 5 pm on a weekday (life_hq.py): cars in the TRAVEL
lanes, Muni buses on their routes, delivery trucks downtown and in SoMa,
tractor-trailers on the freeways.

WHERE A CAR DRIVES. OpenStreetMap's highway ways (life.json roads, ODbL, (c)
OpenStreetMap contributors) give the direction and the number of lanes each
way (nf with the way, nb against it). The scene's own street mesh gives the
kerbs: from the way's centre line the carriageway is scanned out to its
edges at each car, and the lanes are laid inside it, right-hand traffic,
after a parking lane on each kerb where the street has room for one (none
on freeways and ramps). A car is dropped where:
  - its lane is off the street mesh (OSM and the engine's streets disagree);
  - it is within 2.3 m of a rail track's centre (transit_hq's rule for the
    parked cars: the trams and the LRVs keep their track);
  - it stands beside a parked car (the parking lane is taken, the lane
    offset landed in it);
  - it is on a crosswalk: within ~10 m (13 m on arterials) of an
    intersection, except that on arterials a platoon may queue at the stop
    line, the head car just short of it (a red light).
On the two great bridges the deck is the landmarks agent's roadway (lm.asphalt),
found by a ray from above; the Bay Bridge's eastbound lower deck, hidden under
the upper, is not drawn.

HOW MANY. Cars per km per lane at the evening peak, by class (DENSITY),
placed in platoons (a signal's queue, a freeway's bunching): freeways ~30
(dense, moving), arterials ~16, collectors ~8, residential streets ~2 (a car
every few blocks). A convention, never a count; a map at 5 pm, not a jam.
Buses: per route and direction every ~1.6 km along the way (Muni's frequent
routes run every 5-10 min at ~12 km/h); 60-ft artics on the trunk routes.

Placement is a function of the whole network: each way's cars come from its
own seed, and every check is a property of the place (the street mesh, the
track, the kerb), so the frames of the pyramid agree.
"""
import math, random, time
import numpy as np

DENSITY = {'motorway': 30.0, 'motorway_link': 14.0, 'trunk': 20.0, 'trunk_link': 10.0, 'primary': 16.0, 'primary_link': 8.0,
           'secondary': 10.0, 'secondary_link': 6.0, 'tertiary': 6.0, 'tertiary_link': 4.0, 'residential': 0.7,
           'unclassified': 0.9, 'living_street': 0.3, 'busway': 0.0}
PLATOON = {'motorway': (3.2, 22.0, 34.0), 'trunk': (2.6, 12.0, 24.0), 'primary': (2.8, 7.5, 14.0), 'secondary': (2.2, 7.5, 14.0),
           'tertiary': (1.7, 8.0, 16.0)}          # mean size, headway range (m)
ARTERIAL = {'motorway', 'trunk', 'primary', 'secondary'}
NO_PARK = {'motorway', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
TRUCK_ZONE = (2300.0, 1200.0, 4700.0, 4300.0)       # the Financial District and SoMa: deliveries
TRUNK_BUS = ('38', '38R', '14', '14R', '49', '5', '5R', '9', '9R', '1', '22', '28', '28R', '30', '8', '7')


def hp(x, y, salt):
    """a stable number in [0, 1) from the place (hq_city's own mix): every draw
    that could differ between two frames' builds is taken from where it is"""
    h = (int(round(x * 10)) * 73856093) ^ (int(round(y * 10)) * 19349663) ^ (salt * 83492791)
    h = (h ^ (h >> 13)) * 0x5bd1e995 & 0xffffffff
    return ((h ^ (h >> 15)) & 0xffffff) / float(0x1000000)


def place_random(bpy, mat, name):
    """a copy of a material whose per-object random (Object Info) is the
    instance's own 'crand' attribute, drawn from its place: an instance's
    Random is its index in the instancer, which differs between two frames'
    regions (a car changed colour across a seam)"""
    m = mat.copy(); m.name = name; nt = m.node_tree
    for oi in [n for n in nt.nodes if n.type == 'OBJECT_INFO']:
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_type = 'INSTANCER'; at.attribute_name = 'crand'
        for lk in list(oi.outputs['Random'].links):
            nt.links.new(at.outputs['Fac'], lk.to_socket)
    return m


def _resample(pts, step):
    P = np.asarray(pts, float)
    seg = np.hypot(*np.diff(P, axis=0).T); P = P[np.concatenate([[True], seg > 1e-3])]
    if len(P) < 2: return None
    s = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))])
    n = max(2, int(math.ceil(s[-1] / step)) + 1); S = np.linspace(0, s[-1], n)
    X = np.interp(S, s, P[:, 0]); Y = np.interp(S, s, P[:, 1])
    TX = np.gradient(X); TY = np.gradient(Y); tl = np.hypot(TX, TY) + 1e-12
    return X, Y, S, TX / tl, TY / tl


def plan_way(r, rr, R_ix=0.0):
    """(s, lane) candidates along one way, from its own seed: lane >= 0 with
    the way (0 = the kerb lane), < 0 against it (-1 = the kerb lane), None for
    a shared single lane. Platoons; on an arterial half the platoons that come
    within 45 m of an intersection wait at its stop line (a red light)"""
    hw = r['hw']; base = hw.replace('_link', '')
    P = np.asarray(r['pts']); Ls = float(np.hypot(*np.diff(P, axis=0).T).sum())
    dens = DENSITY.get(hw, 2.0)
    lanes = [k for k in range(r['nf'])] + [-1 - k for k in range(r['nb'])]
    if r.get('one'): lanes = [None]
    if not lanes: lanes = [0]
    ix = sorted(r.get('ix', []))
    out = []
    size, h0, h1 = PLATOON.get(base, (1.2, 8.0, 16.0))
    queue = base in ('trunk', 'primary', 'secondary', 'tertiary') and R_ix > 0
    for lane in lanes:
        if dens <= 0: break
        fwd = lane is None or lane >= 0
        # the kerb lane of an arterial carries a little less (buses, turns, parking manoeuvres)
        d = dens * (0.85 if (lane in (0, -1) and base in ('primary', 'secondary')) else 1.0)
        mean_gap = size * 1000.0 / d
        s = rr.uniform(0, mean_gap)
        while s < Ls:
            n = 1
            while rr.random() < 1 - 1 / size and n < 9: n += 1
            nxt = [q for q in ix if q > s] if fwd else [q for q in ix if q < s]
            stop = (min(nxt) - R_ix - 1.5) if (fwd and nxt) else ((max(nxt) + R_ix + 1.5) if nxt else None)
            if queue and stop is not None and abs(stop - s) < 45.0 and rr.random() < 0.5:
                # the head at the stop line, the others closed up behind it
                for i in range(n):
                    q = stop - (i * rr.uniform(6.8, 8.0)) * (1 if fwd else -1)
                    if 0 < q < Ls: out.append((q, lane))
                s = max(s, stop) + rr.expovariate(1.0 / mean_gap)
                continue
            q = s
            for i in range(n):
                if q > Ls: break
                out.append((q, lane))
                q += rr.uniform(h0, h1)
            s = q + rr.expovariate(1.0 / mean_gap)
    return out, Ls


def build(bpy, sc, coll, T, D, ground, inb, log, t0):
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    from mathutils.kdtree import KDTree
    import life_vehicles as LV, transit_geom as TG
    so = sc.objects.get('streets')
    if so is None: log('life_traffic: no street mesh'); return
    dg = bpy.context.evaluated_depsgraph_get()
    sb = BVHTree.FromObject(so, dg)
    down = Vector((0, 0, -1))
    # the bridge decks (landmarks_hq: lm.asphalt) — a ray from above
    deck = None
    da = sc.objects.get('lm.asphalt')
    if da is not None and len(da.data.polygons): deck = BVHTree.FromObject(da, dg)
    def street_z(x, y):
        g = ground(float(x), float(y))
        if g is None: return None
        h = sb.ray_cast(Vector((float(x), float(y), g + 25.0)), down, 40.0)
        if h[0] is not None and -0.8 < h[0].z - g < 2.5: return max(h[0].z, g)
        return None
    def deck_z(x, y):
        if deck is None: return None
        h = deck.ray_cast(Vector((float(x), float(y), 300.0)), down, 400.0)
        if h[0] is not None and h[0].z > 8.0 and h[1].z > 0.8: return h[0].z
        return None
    # the viaducts (freeways_hq, the freeways agent): a pure-Python query of
    # its decks; without it every freeway is the engine's, at grade
    # (only when the running script builds them: freeways_hq runs after life_hq)
    try:
        import sys as _sys
        _src = open(_sys.argv[_sys.argv.index('-P') + 1]).read() if '-P' in _sys.argv else ''
        if 'freeways_hq' not in _src: raise RuntimeError('the render script does not build the viaducts')
        import freeways_hq as FW; FW.load()
    except Exception as ex:
        FW = None; log('life_traffic: no viaduct decks (freeways_hq):', ex)
    # the tracks (transit.json): no car within 2.3 m of a centre line
    import transit_hq
    kt = None
    try:
        TD = transit_hq._load(); pts = []
        for t in TD['tracks']:
            if t.get('covered'): continue
            if not any(inb(x, y, 200) for x, y in t['pts']): continue
            rs = _resample(t['pts'], 1.5)
            if rs is None: continue
            for x, y in zip(rs[0], rs[1]):
                if inb(x, y, 100): pts.append((x, y))
        if pts:     # an empty tree's find() returns a None distance (frame 0:6: no track in the region)
            kt = KDTree(len(pts))
            for i, (x, y) in enumerate(pts): kt.insert((x, y, 0.0), i)
            kt.balance()
    except Exception as ex: log('life_traffic: no tracks', ex)
    # NO CAR PARKED ON A FREEWAY. hq_city parks a car along every kerb with a
    # wall within 18 m, and the engine draws the freeways at grade with kerbs:
    # the I-80 and US-101 viaducts through SoMa had parked cars along them.
    try: _clear_freeway_parking(bpy, sc, D, inb, log)
    except Exception as ex: log('life_traffic: freeway parking not cleared', ex)
    # the parked cars (hq_city's 'cars' instancer points)
    kp = None; PK = None
    co = sc.objects.get('cars')
    if co is not None and co.type == 'MESH' and len(co.data.vertices):
        PK = np.zeros(len(co.data.vertices) * 3, np.float32); co.data.vertices.foreach_get('co', PK); PK = PK.reshape(-1, 3)
        kp = KDTree(len(PK))
        for i, p in enumerate(PK): kp.insert((float(p[0]), float(p[1]), 0.0), i)
        kp.balance()
    placed = {}                    # 4 m grid of car centres (moving), for overlaps
    def free(x, y, L, W, z=0.0):
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                for px, py, pr, pz in placed.get((int(x // 4) + a, int(y // 4) + b), ()):
                    if abs(z - pz) < 3.0 and math.hypot(x - px, y - py) < pr + L * 0.45: return False
        return True
    # THE RED LANES. San Francisco paints its transit-only lanes red (Geary,
    # Mission, Van Ness's centre busway, Market, Sutter, Post, O'Farrell, 3rd,
    # 16th...): from the air a red band along the kerb lane, the city's
    # signature. OSM's bus:lanes / lanes:bus / busway tags give which lane;
    # the lane is found on the street mesh like a car's (life_prep._red_lanes)
    import os as _os
    try: nred = _red(bpy, coll, D, street_z, kt, inb, log) if _os.environ.get('LIFE_RED', '1') == '1' else 0
    except Exception as ex: import traceback; traceback.print_exc(); log('life_traffic: red lanes failed', ex); nred = 0
    cars, others = [], []
    nway = 0; rej = dict(off=0, track=0, parked=0, ix=0, over=0, deck=0); nmode = dict(street=0, lm=0, fw=0)
    for r in D['roads']:
        if not any(inb(x, y, 80) for x, y in r['pts'][:: max(1, len(r['pts']) // 8)] + [r['pts'][-1]]): continue
        rr = random.Random(r['id'])
        hw = r['hw']; base = hw.replace('_link', '')
        R_ix = 0.0 if base == 'motorway' else (13.0 if base in ARTERIAL else 10.0)
        cand, Ls = plan_way(r, rr, R_ix)
        if Ls < 8: continue
        rs = _resample(r['pts'], 1.0)
        if rs is None: continue
        X, Y, S, TX, TY = rs
        # the two great bridges' decks are the landmarks agent's (lm.asphalt, 56-76 m
        # up); every other 'bridge' way (the SoMa viaducts, the Central Freeway)
        # the engine draws at grade, in its street mesh
        bridge = r['br'] and hw == 'motorway' and (('Golden Gate Bridge' in r['name']) or ('Eisenhower' in r['name'] and r['pts'][0][0] > 4000))
        # freeways_hq's pavement: its viaducts, and (FW_GRADE) the freeways it paves at grade
        elev = FW is not None and (FW.elevated(r['id']) or hw in ('motorway', 'motorway_link'))
        # the Bay Bridge's eastbound deck is the lower one, under the upper: not drawn
        if bridge and 'Eisenhower' in r['name'] and r['pts'][-1][0] > r['pts'][0][0] + 200: continue
        ix = r.get('ix', [])
        # buses: per route every ~1.6 km along the way, one direction each
        nbus = r.get('bus', 0)
        bus_s = []
        if nbus and base not in ('motorway',):
            rb = random.Random(r['id'] * 3 + 1)
            spacing = 1600.0 / max(0.5, nbus)
            s = rb.uniform(0, spacing)
            while s < Ls:
                bus_s.append((s, rb.random() < 0.5 or r['nb'] == 0)); s += spacing * rb.uniform(0.7, 1.3)
        nway += 1
        red = r.get('red') or []
        def is_red(lane):
            if red == 'all': return True
            if lane is None: return False
            return (['f', lane] in red) if lane >= 0 else (['b', -1 - lane] in red)
        items = [(s, lane, True, None) for s, lane in cand if not is_red(lane)]
        for s, fwd in bus_s:
            lane = 0 if (fwd or r['nb'] == 0) else -1
            if r.get('one'): lane = None
            items.append((s, lane, True, 'bus'))
        for s, lane, head, kind in sorted(items, key=lambda t: t[0]):
            fwd = lane is None or lane >= 0
            # the crosswalk: keep clear of the intersection
            if R_ix and any(abs(s - q) < R_ix for q in ix): rej['ix'] += 1; continue
            if not (4.0 < s < Ls - 4.0): continue
            i = int(round(s)); i = min(max(i, 0), len(X) - 1)
            x0, y0, tx, ty = X[i], Y[i], TX[i], TY[i]
            if not inb(x0, y0, 30): continue
            nx, ny = -ty, tx
            rv = random.Random(r['id'] * 1009 + int(s * 10) + (7 if lane is None else lane) * 131)
            # the vehicle
            if kind == 'bus':
                vk = 'bus60' if r.get('muni') and rv.random() < 0.45 else 'bus40'; L, W = LV.LENGTH[vk], 2.6
            else:
                u_ = rv.random(); vk = None
                intruck = TRUCK_ZONE[0] < x0 < TRUCK_ZONE[2] and TRUCK_ZONE[1] < y0 < TRUCK_ZONE[3] and base not in ('residential',)
                if base == 'motorway' and u_ < 0.05: vk = f'semi{rv.randrange(4)}'
                elif intruck and u_ < 0.09: vk = rv.choice(['parcel'] + [f'box{k}' for k in range(5)] + [f'van{k}' for k in range(5)])
                elif u_ < 0.03: vk = rv.choice([f'van{k}' for k in range(5)] + [f'box{k}' for k in range(2)])
                if vk: L, W = LV.LENGTH[vk], 2.4
                else: L, W = 4.7, 1.85
            # the surface and the carriageway at this point: the landmarks' bridge
            # deck, the freeways agent's viaduct deck, or the street mesh
            mode = 'street'
            if bridge and deck_z(x0, y0) is not None: mode = 'lm'
            elif elev and FW.deck_z(r['id'], x0, y0) is not None: mode = 'fw'
            if mode == 'lm':
                lw = 3.5; half = (r['nf'] + r['nb']) * lw / 2
                dl = dr = half
                if r['nb'] == 0: dl = dr = r['nf'] * lw / 2
                park = 0.0
                onsurf = lambda x, y: (deck_z(x, y) or street_z(x, y))
                if lane is None: u = 0.0
                elif r['nb'] == 0 or lane >= 0: u = -dr + (lane + 0.5) * lw
                else: u = dl - (-1 - lane + 0.5) * lw
            elif mode == 'fw':
                # freeways_hq's deck: 12 ft lanes inside the parapets, the left
                # shoulder ~1.2 m on the mainline (0.9 on a ramp), the rest right
                half = FW.deck_half(r['id']) or (r['nf'] + r['nb']) * 1.83 + 1.5
                sh = 0.9 if hw.endswith('_link') else 1.2
                if lane is None: u = 0.0
                elif r['nb'] == 0:
                    lw = min(3.66, (2 * half - sh - 0.5) / max(1, r['nf']))
                    u = half - sh - (r['nf'] - 1 - lane + 0.5) * lw
                else:
                    lw = min(3.66, (2 * half - 1.2) / max(1, r['nf'] + r['nb']))
                    u = (-half + 0.6 + (lane + 0.5) * lw) if lane >= 0 else (half - 0.6 - (-1 - lane + 0.5) * lw)
                wid = r['id']
                onsurf = lambda x, y, wid=wid: FW.deck_z(wid, x, y)
            else:
                # the carriageway across the way: runs of street mesh, from the
                # centre line outward (a median leaves the centre off the street)
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
                if L1 and R1 and L1[0][0] == 0.0 and R1[0][0] == 0.0:
                    cl, cr = -R1[0][1], L1[0][1]; med = False           # one carriageway
                elif r['nb'] > 0 and L1 and R1 and L1[0][0] < 9.0 and R1[0][0] < 9.0:
                    med = True                                          # a median: a carriageway each side
                    rcl, rcr = -R1[0][1], -R1[0][0]; lcl, lcr = L1[0][0], L1[0][1]
                else: rej['off'] += 1; continue
                n_l = 1 if lane is None else r['nf'] + r['nb']
                if not med:
                    park = 0.0 if (hw in NO_PARK or base == 'motorway') else float(np.clip((cr - cl - n_l * 3.1) / 2, 0.0, 2.4))
                    lw = float(np.clip((cr - cl - 2 * park) / max(1, n_l), 2.6, 3.9))
                    if lane is None: u = (cl + cr) / 2
                    elif lane >= 0: u = cl + park + (lane + 0.5) * lw
                    else: u = cr - park - (-1 - lane + 0.5) * lw
                    if lane is not None and r['nb'] > 0 and ((lane >= 0 and u > (cl + cr) / 2 + 0.3) or (lane < 0 and u < (cl + cr) / 2 - 0.3)):
                        rej['off'] += 1; continue
                else:
                    if lane is None: rej['off'] += 1; continue
                    a_, b_, nn = (rcl, rcr, r['nf']) if lane >= 0 else (lcl, lcr, r['nb'])
                    park = 0.0 if (hw in NO_PARK or base == 'motorway') else float(np.clip((b_ - a_ - nn * 3.1), 0.0, 2.4))
                    lw = float(np.clip((b_ - a_ - park) / max(1, nn), 2.6, 3.9))
                    u = (a_ + park + (lane + 0.5) * lw) if lane >= 0 else (b_ - park - (-1 - lane + 0.5) * lw)
                    if not a_ - 0.2 <= u <= b_ + 0.2: rej['off'] += 1; continue
                onsurf = street_z
            x, y = x0 + nx * u, y0 + ny * u
            yaw = math.atan2(ty, tx) + (0.0 if fwd else math.pi)
            ca, sa = math.cos(yaw), math.sin(yaw)
            fx, fy, bx_, by_ = x + ca * L * 0.38, y + sa * L * 0.38, x - ca * L * 0.38, y - sa * L * 0.38
            zf, zb = onsurf(fx, fy), onsurf(bx_, by_)
            if zf is None or zb is None: rej['off'] += 1; continue
            if mode == 'street' and kt is not None and any(kt.find((px, py, 0.0))[2] < 2.3 for px, py in ((x, y), (fx, fy), (bx_, by_))):
                rej['track'] += 1; continue
            if mode == 'street' and kp is not None:
                hit = False
                for (p, idx, dd) in kp.find_range((x, y, 0.0), L / 2 + 3.0):
                    rx, ry = p[0] - x, p[1] - y
                    if abs(rx * -sa + ry * ca) < (W / 2 + 0.9 + 0.35) and abs(rx * ca + ry * sa) < L / 2 + 2.4: hit = True; break
                if hit: rej['parked'] += 1; continue
            if not free(x, y, L, W, (zf + zb) / 2): rej['over'] += 1; continue
            for q in (-0.35, 0.0, 0.35):
                px, py = x + ca * L * q, y + sa * L * q
                placed.setdefault((int(px // 4), int(py // 4)), []).append((px, py, max(W, L * 0.3), (zf + zb) / 2))
            pitch = math.atan2(zf - zb, 0.76 * L)
            z = (zf + zb) / 2 + 0.02
            nmode[mode] += 1
            if vk is None: cars.append((x, y, z, pitch, yaw))
            else: others.append((vk, x, y, z, pitch, yaw))
    log(f'life_traffic: {nway} ways, {len(cars)} cars, {len(others)} buses and trucks (on {nmode}); dropped {rej} ({time.time() - t0:.1f}s)')
    # the cars: hq_scene's own bodies (the 'carp{i}' collections hq_city builds), instanced
    src = [c for c in (bpy.data.collections.get(f'carp{i}') for i in range(8)) if c is not None]
    protos = []
    for i, c in enumerate(src):
        # the same bodies, their paint drawn from the car's place (see place_random)
        c2 = bpy.data.collections.new(f'lcarp{i}')
        for o in c.objects:
            me2 = o.data.copy()
            for k, m in enumerate(me2.materials):
                if m is not None and any(n.type == 'OBJECT_INFO' for n in m.node_tree.nodes):
                    pm_ = bpy.data.materials.get(f'lf_{m.name}') or place_random(bpy, m, f'lf_{m.name}')
                    me2.materials[k] = pm_
            c2.objects.link(bpy.data.objects.new(f'l{o.name}', me2))
        protos.append(c2)
    if cars and protos:
        kinds = [int(hp(p[0], p[1], 11) * len(protos)) % len(protos) for p in cars]
        _instancer(bpy, coll, 'life.cars', cars, protos, kinds, [hp(p[0], p[1], 12) for p in cars])
    # buses and trucks: small meshes, one per kind, linked as objects
    mats = [T['paint'], T['glass'], T['matte'], T['matte'], T['metal']]
    pm = {}
    vc = bpy.data.collections.new('life_vehicles'); coll.children.link(vc)
    for k, (vk, x, y, z, pitch, yaw) in enumerate(others):
        if vk not in pm:
            vb = LV.PROTOS[vk](); pm[vk] = TG.mesh_multi(bpy, f'lv_{vk}', vb.V, vb.F, vb.C, vb.MI, mats)
        ob = bpy.data.objects.new(f'lv.{vk}.{k}', pm[vk]); ob.location = (x, y, z); ob.rotation_euler = (0.0, -pitch, yaw)
        vc.objects.link(ob)


RED = (0.30, 0.058, 0.042, 1.0)         # SFMTA's transit-only red as it reads worn, a muted brick (sRGB ~#955243)
# (a saturated #b53b33 read as a fresh red band from the air, 24/09)
RED_BANDS = ((-1.0, -0.74, 0.10), (-0.74, -0.36, 0.42), (-0.36, 0.36, 0.14), (0.36, 0.74, 0.42), (0.74, 1.0, 0.10))
# across a lane (fractions of its half width): kerb edge, the tyre track, the
# centre, the other track, the edge; and how worn each is (paint gone to asphalt)


def _red(bpy, coll, D, street_z, kt, inb, log):
    import transit_geom as TG
    bank = TG.Bank(); n = 0
    for r in D['roads']:
        red = r.get('red')
        if not red or 'Ramp' in r.get('name', '') or r['br']: continue
        if not any(inb(x, y, 60) for x, y in r['pts']): continue
        rs = _resample(r['pts'], 1.5)
        if rs is None: continue
        X, Y, S, TX, TY = rs
        hw = r['hw']; base = hw.replace('_link', '')
        # A BUSWAY ON A TRAM TRACK IS A TRACKWAY, NOT A RED LANE: OSM tags the
        # Embarcadero's median streetcar reservation (the F and E lines) as
        # highway=busway, bus=yes; it is grey concrete with rails, never painted.
        # Read as 'all lanes red', its lanes were laid on the roadway's kerbs
        # beside the pier bulkheads (24/09)
        if red == 'all' and kt is not None:
            onrail = sum(1 for i in range(0, len(X), 4) if kt.find((X[i], Y[i], 0.0))[2] < 4.0)
            if onrail > 0.4 * len(range(0, len(X), 4)): continue
        R_ix = 13.0 if base in ARTERIAL or hw == 'busway' else 10.0
        ix = r.get('ix', [])
        lanes = ([k for k in range(r['nf'])] + [-1 - k for k in range(r['nb'])]) if red == 'all' else \
                [k if d == 'f' else -1 - k for d, k in red]
        for lane in lanes:
            strip = []                       # runs of the band edges across the lane
            def flush():
                if len(strip) >= 2:
                    for b_, (_t0, _t1, wear) in enumerate(RED_BANDS):
                        bank.strip('red', [p[b_] for p in strip], [p[b_ + 1] for p in strip], (wear, wear, wear, 1.0))
                strip.clear()
            for i in range(len(X)):
                x0, y0 = X[i], Y[i]
                if not inb(x0, y0, 20) or any(abs(S[i] - q) < R_ix - 3.0 for q in ix): flush(); continue
                nx, ny = -TY[i], TX[i]
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
                if L1 and R1 and L1[0][0] == 0.0 and R1[0][0] == 0.0:
                    cl, cr = -R1[0][1], L1[0][1]
                    n_l = max(1, r['nf'] + r['nb'])
                    park = 0.0 if hw in NO_PARK else float(np.clip((cr - cl - n_l * 3.1) / 2, 0.0, 2.4))
                    lw = float(np.clip((cr - cl - 2 * park) / n_l, 2.6, 3.9))
                    u = (cl + park + (lane + 0.5) * lw) if lane >= 0 else (cr - park - (-1 - lane + 0.5) * lw)
                elif r['nb'] > 0 and L1 and R1 and L1[0][0] < 9.0 and R1[0][0] < 9.0:
                    a_, b_, nn = (-R1[0][1], -R1[0][0], r['nf']) if lane >= 0 else (L1[0][0], L1[0][1], r['nb'])
                    park = 0.0 if hw in NO_PARK else float(np.clip((b_ - a_ - nn * 3.1), 0.0, 2.4))
                    lw = float(np.clip((b_ - a_ - park) / max(1, nn), 2.6, 3.9))
                    u = (a_ + park + (lane + 0.5) * lw) if lane >= 0 else (b_ - park - (-1 - lane + 0.5) * lw)
                else: flush(); continue
                x, y = x0 + nx * u, y0 + ny * u
                if kt is not None and kt.find((x, y, 0.0))[2] < 1.8: flush(); continue      # a track's lane: its slab
                h = (lw - 0.45) / 2
                ts = [RED_BANDS[0][0]] + [b_[1] for b_ in RED_BANDS]
                zs = [street_z(x + nx * h * t_, y + ny * h * t_) for t_ in ts]
                if any(z_ is None for z_ in zs): flush(); continue
                strip.append([(x + nx * h * t_, y + ny * h * t_, z_ + 0.03) for t_, z_ in zip(ts, zs)])
            flush()
        n += 1
    if not bank.nfaces(): return 0
    m = bpy.data.materials.get('lf_redlane')
    if m is None:
        m = bpy.data.materials.new('lf_redlane'); m.use_nodes = True; nt = m.node_tree; pb = nt.nodes['Principled BSDF']
        # worn paint: the red, patchy where the tyres wear it (a noise toward the asphalt's grey)
        geo = nt.nodes.new('ShaderNodeNewGeometry'); nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 0.35; nz.inputs['Detail'].default_value = 8
        nt.links.new(geo.outputs['Position'], nz.inputs['Vector'])
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = 0.45; mr.inputs['From Max'].default_value = 0.75
        mr.inputs['To Min'].default_value = 0.0; mr.inputs['To Max'].default_value = 0.3
        nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
        # + the band's own wear (bcol: the tyre tracks worn most), broken up by a
        # finer noise so the tracks are scuffed, not ruled
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'bcol'
        nz2 = nt.nodes.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 2.2; nz2.inputs['Detail'].default_value = 4
        nt.links.new(geo.outputs['Position'], nz2.inputs['Vector'])
        w2 = nt.nodes.new('ShaderNodeMath'); w2.operation = 'MULTIPLY'; nt.links.new(at.outputs['Fac'], w2.inputs[0])
        r2 = nt.nodes.new('ShaderNodeMapRange'); r2.inputs['From Min'].default_value = 0.3; r2.inputs['From Max'].default_value = 0.7
        r2.inputs['To Min'].default_value = 0.6; r2.inputs['To Max'].default_value = 1.4
        nt.links.new(nz2.outputs['Fac'], r2.inputs['Value']); nt.links.new(r2.outputs[0], w2.inputs[1])
        ad = nt.nodes.new('ShaderNodeMath'); ad.operation = 'ADD'; ad.use_clamp = True
        nt.links.new(mr.outputs[0], ad.inputs[0]); nt.links.new(w2.outputs[0], ad.inputs[1])
        nt.links.new(ad.outputs[0], mx.inputs[0])
        mx.inputs[6].default_value = RED; mx.inputs[7].default_value = (0.07, 0.065, 0.06, 1.0)
        nt.links.new(mx.outputs[2], pb.inputs['Base Color']); pb.inputs['Roughness'].default_value = 0.75
    nf = bank.nfaces()
    bank.emit(bpy, coll, {'red': m}, 'life.redlanes')
    log(f'life_traffic: red transit lanes on {n} ways, {nf} faces')
    return n


def _clear_freeway_parking(bpy, sc, D, inb, log):
    import bmesh
    from mathutils.kdtree import KDTree
    ob = sc.objects.get('cars')
    if ob is None or ob.type != 'MESH' or not len(ob.data.vertices): return
    S = []
    for r in D['roads']:
        if r['hw'] not in ('motorway', 'motorway_link'): continue
        if not any(inb(x, y, 60) for x, y in r['pts']): continue
        rs = _resample(r['pts'], 2.0)
        if rs is None: continue
        half = r['nf'] * 1.8 + 1.2
        for x, y in zip(rs[0], rs[1]):
            if inb(x, y, 40): S.append((x, y, half))
    if not S: return
    kd = KDTree(len(S))
    for i, (x, y, _) in enumerate(S): kd.insert((x, y, 0.0), i)
    kd.balance()
    bm = bmesh.new(); bm.from_mesh(ob.data)
    kill = []
    for v in bm.verts:
        p, i, dd = kd.find((v.co.x, v.co.y, 0.0))
        if i is not None and dd < S[i][2]: kill.append(v)
    if kill:
        bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(ob.data); ob.data.update()
    bm.free()
    log(f'life_traffic: {len(kill)} parked cars stood on a freeway, removed')


def _instancer(bpy, coll, name, pts, protos, kinds, crand):
    """instances on points: (x, y, z, pitch, yaw); kinds: the proto per point;
    crand: a number per point from its place, for the shaders' randomness"""
    # Collection Info (Separate Children) sorts the children BY NAME: each proto
    # goes in a wrapper named by its index, so 'kind' picks the proto it means
    # (the same fix as hq_city.instancer, 24/09)
    root = bpy.data.collections.new(f'{name}_protos')
    for i, c in enumerate(protos):
        w = bpy.data.collections.new(f'{name}_k{i:04d}'); root.children.link(w)
        try: w.children.link(c)
        except Exception: pass
    me = bpy.data.meshes.new(name); me.vertices.add(len(pts))
    me.vertices.foreach_set('co', [v for p in pts for v in p[:3]])
    for nm, vals, tp in (('pitch', [-p[3] for p in pts], 'FLOAT'), ('yaw', [p[4] for p in pts], 'FLOAT'),
                         ('kind', [int(k) for k in kinds], 'INT'), ('crand', [float(c) for c in crand], 'FLOAT')):
        at = me.attributes.new(nm, tp, 'POINT'); at.data.foreach_set('value', vals)
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    ng = bpy.data.node_groups.new(name, 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    n = ng.nodes; lk = ng.links.new
    gi = n.new('NodeGroupInput'); go = n.new('NodeGroupOutput')
    ci = n.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = root
    ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = True
    def attr(nm, tp):
        a_ = n.new('GeometryNodeInputNamedAttribute'); a_.data_type = tp; a_.inputs['Name'].default_value = nm; return a_.outputs[0]
    rot = n.new('ShaderNodeCombineXYZ'); lk(attr('pitch', 'FLOAT'), rot.inputs[1]); lk(attr('yaw', 'FLOAT'), rot.inputs[2])
    ii = n.new('GeometryNodeInstanceOnPoints'); lk(gi.outputs[0], ii.inputs['Points']); lk(ci.outputs[0], ii.inputs['Instance'])
    ii.inputs['Pick Instance'].default_value = True; lk(attr('kind', 'INT'), ii.inputs['Instance Index'])
    lk(rot.outputs[0], ii.inputs['Rotation'])
    # the point's 'crand' onto the instance (the shader reads it as an instancer attribute)
    st = n.new('GeometryNodeStoreNamedAttribute'); st.data_type = 'FLOAT'; st.domain = 'INSTANCE'
    st.inputs['Name'].default_value = 'crand'
    lk(ii.outputs[0], st.inputs['Geometry']); lk(attr('crand', 'FLOAT'), st.inputs['Value'])
    lk(st.outputs[0], go.inputs[0])
    ob.modifiers.new(name, 'NODES').node_group = ng
