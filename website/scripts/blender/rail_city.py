"""RAIL_CITY=1 (VT2 06/10, Vancouver; SF never sets it): the heavy-rail tracks of today as geometry, on their ballast.

vt1 (06/10): the scene's rail layer (the City's 174 km of track alignments) was never drawn, and the CPR / Waterfront /
False Creek Flats yards rendered as a pale beige plain that the AI painted as an invented park. Here each OSM
railway=rail way (mainline, yard, siding, spur, crossover; not in a tunnel, a building passage or covered, not on a bridge:
the bridges' decks are the structures' own) in the box is laid as the yard reads from the air (era.build_yards' recipe,
SF's Mission Bay): a 4.4 m dark ballast bed, a 2.6 m band of ties, two steel rails at standard gauge; on the yard and
siding tracks inside OSM landuse=railway, strings of freight cars (CONVENTION: share, mix and colours, keyed to the place:
boxcars, covered grain hoppers, tank cars, container well cars; about a third of the slots filled).
The ground under and between the tracks is ground_city.py rule 8's ballast (class gravel).
Source: OpenStreetMap (ODbL), Overpass 06/10 -> cities/<city>/transit/rail_osm.json (rail_q.txt).
build(bpy, sc, ground, box, cityconf, log) -> number of track pieces."""
import json, math, os
import numpy as np

GAUGE = 1.435 + 0.07        # rail centre to rail centre (m)
PIECE = 4.0                 # max piece length along a track (m)
DZ = {'ballast': 0.07, 'ties': 0.13, 'rails': 0.25}
HALF = {'ballast': 2.2, 'ties': 1.3, 'rails': 0.045}
CAR_SLOT = 16.0
CAR_SHARE = 0.36
# albedos for the V6 light as the ground's ballast (ground_hq GROUND_PNW gravel, VT2): dark grey-brown stone, darker ties
MATS = {'ballast': ((0.095, 0.083, 0.068), 0.95, 0.0), 'ties': ((0.050, 0.042, 0.034), 0.9, 0.0), 'rails': ((0.32, 0.30, 0.28), 0.35, 0.7)}
CARS = {'box_rust': (0.26, 0.09, 0.05), 'box_brown': (0.17, 0.10, 0.06), 'hopper_grey': (0.40, 0.39, 0.37), 'hopper_brown': (0.24, 0.14, 0.08),
        'tank_black': (0.07, 0.068, 0.065), 'well_red': (0.30, 0.07, 0.05), 'well_blue': (0.06, 0.13, 0.26), 'well_white': (0.55, 0.55, 0.53),
        'well_green': (0.08, 0.20, 0.12), 'frame': (0.08, 0.075, 0.07)}


def h01(*k):
    """a stable 0..1 hash of integers"""
    v = 2166136261
    for a in k:
        v = ((v ^ (int(a) & 0xffffffff)) * 16777619) & 0xffffffff
    v ^= v >> 13; v = (v * 1274126177) & 0xffffffff; v ^= v >> 16
    return v / 4294967296.0


def _ways(C):
    p = C.work('transit', 'rail_osm.json')
    if not os.path.exists(p): return [], []
    d = json.load(open(p)); tr, yd = [], []
    for e in d['elements']:
        t = e.get('tags', {}); g = e.get('geometry')
        if e['type'] == 'way' and g and t.get('railway') == 'rail':
            if t.get('tunnel') not in (None, 'no') or t.get('bridge') not in (None, 'no') or t.get('covered') not in (None, 'no'): continue
            x, y = C.proj(np.array([q['lon'] for q in g]), np.array([q['lat'] for q in g]))
            tr.append((e['id'], t.get('service', ''), np.c_[x, y]))
        if t.get('landuse') == 'railway':
            gs = [g] if e['type'] == 'way' and g else [m['geometry'] for m in e.get('members', []) if m.get('geometry') and m.get('role') in ('outer', '')]
            for g_ in gs:
                if len(g_) > 3:
                    x, y = C.proj(np.array([q['lon'] for q in g_]), np.array([q['lat'] for q in g_])); yd.append(np.c_[x, y])
    return tr, yd


def _inside(x, y, rings):
    for r in rings:
        ax, ay = r[:, 0], r[:, 1]; bx, by = np.roll(ax, -1), np.roll(ay, -1)
        c = ((ay > y) != (by > y)) & (x < (bx - ax) * (y - ay) / np.where(by == ay, 1e-12, by - ay) + ax)
        if c.sum() % 2: return True
    return False


def pieces(P, box, pad=20.0):
    """a polyline cut into <= PIECE m pieces inside box(+pad): [(p0, p1, along0)]"""
    out = []; s = 0.0
    for a, b in zip(P[:-1], P[1:]):
        L = float(np.hypot(*(b - a)))
        if L < 1e-6: continue
        inb = lambda q: box[0] - pad <= q[0] <= box[2] + pad and box[1] - pad <= q[1] <= box[3] + pad
        if not (inb(a) or inb(b) or inb((a + b) / 2)) and L < 400: s += L; continue
        n = max(1, int(math.ceil(L / PIECE)))
        for k in range(n):
            p0 = a + (b - a) * (k / n); p1 = a + (b - a) * ((k + 1) / n)
            if inb((p0 + p1) / 2): out.append((p0, p1, s + L * k / n))
        s += L
    return out


def build(bpy, sc, ground, box, C, log=print):
    tr, yd = _ways(C)
    if not tr: log('rail_city: no rail ways'); return 0
    G = {k: ([], []) for k in MATS}; CV = {k: ([], []) for k in CARS}; ntr = ncar = 0
    def quad(key, p0, p1, nv, g, w, z0, z1):
        V, F = G[key]; k = len(V)
        q = [p0 + nv * (g - w), p1 + nv * (g - w), p1 + nv * (g + w), p0 + nv * (g + w)]
        V.extend((float(a[0]), float(a[1]), z + DZ[key]) for a, z in zip(q, (z0, z1, z1, z0))); F.append((k, k + 1, k + 2, k + 3))
    def box3(key, c, d, n, L, W, H, z):
        V, F = CV[key]; k = len(V); dd, nn = d * (L / 2), n * (W / 2)
        for zz in (z, z + H):
            for a in (c - dd - nn, c + dd - nn, c + dd + nn, c - dd + nn): V.append((float(a[0]), float(a[1]), zz))
        F.extend([(k, k + 1, k + 2, k + 3), (k + 4, k + 7, k + 6, k + 5), (k, k + 4, k + 5, k + 1), (k + 1, k + 5, k + 6, k + 2), (k + 2, k + 6, k + 7, k + 3), (k + 3, k + 7, k + 4, k)])
    zc = {}
    def gz(p):
        key = (round(float(p[0]), 2), round(float(p[1]), 2))
        if key not in zc: zc[key] = ground(float(p[0]), float(p[1]))
        return zc[key]
    for wid, svc, P in tr:
        PC = pieces(P, box)
        for p0, p1, s0 in PC:
            z0, z1 = gz(p0), gz(p1)
            if z0 is None or z1 is None: continue
            d = (p1 - p0) / max(1e-9, float(np.hypot(*(p1 - p0)))); nv = np.array([-d[1], d[0]])
            quad('ballast', p0, p1, nv, 0.0, HALF['ballast'], z0, z1); quad('ties', p0, p1, nv, 0.0, HALF['ties'], z0, z1)
            for g in (-GAUGE / 2, GAUGE / 2): quad('rails', p0, p1, nv, g, HALF['rails'], z0, z1)
            ntr += 1
        # freight cars on the yard / siding tracks inside the railway land, in strings keyed to the way
        if svc not in ('yard', 'siding') or not yd or len(P) < 2: continue
        Ltot = float(np.sum(np.hypot(*(P[1:] - P[:-1]).T)))
        cum = np.r_[0.0, np.cumsum(np.hypot(*(P[1:] - P[:-1]).T))]
        for j in range(int(Ltot // CAR_SLOT)):
            if h01(wid, j // 5, 1) > 0.55 or h01(wid, j, 2) > CAR_SHARE / 0.55 * 0.9: continue
            s_ = (j + 0.5) * CAR_SLOT; i = int(np.searchsorted(cum, s_) - 1); i = min(max(i, 0), len(P) - 2)
            seg = P[i + 1] - P[i]; Ls = float(np.hypot(*seg))
            if Ls < 1e-6: continue
            d = seg / Ls; nv = np.array([-d[1], d[0]]); c = P[i] + d * (s_ - cum[i])
            if not (box[0] <= c[0] <= box[2] and box[1] <= c[1] <= box[3]) or not _inside(c[0], c[1], yd): continue
            z = gz(c)
            if z is None: continue
            u = h01(wid, j // 5, 3); v = h01(wid, j, 4); z += 1.05
            if u < 0.30:     # a grain train: covered hoppers
                key = 'hopper_grey' if v < 0.6 else 'hopper_brown'; box3(key, c, d, nv, 14.6, 3.1, 3.9, z)
            elif u < 0.55:   # container well cars: two boxes, one stacked
                box3('frame', c, d, nv, 15.0, 2.7, 0.5, z - 0.2)
                for lvl in (0, 1):
                    if lvl and v > 0.7: continue
                    key = ('well_red', 'well_blue', 'well_white', 'well_green')[int(h01(wid, j, 5 + lvl) * 4)]
                    box3(key, c, d, nv, 12.2, 2.44, 2.6, z + 0.3 + 2.6 * lvl)
            elif u < 0.75:   # tank cars
                box3('tank_black', c, d, nv, 12.5, 2.6, 2.6, z + 0.3); box3('frame', c, d, nv, 13.3, 3.0, 0.3, z)
            else:            # boxcars
                key = 'box_rust' if v < 0.55 else 'box_brown'; box3(key, c, d, nv, 14.8, 3.05, 3.4, z)
            ncar += 1
    def mat(nm, col, rough, metal):
        m = bpy.data.materials.get(nm) or bpy.data.materials.new(nm); m.use_nodes = True; b = m.node_tree.nodes.get('Principled BSDF')
        if b is not None:
            b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
        return m
    nf = 0
    for key, (V, F) in list(G.items()) + [('car_' + k, v) for k, v in CV.items()]:
        if not F: continue
        col, rough, metal = MATS[key] if key in MATS else (CARS[key[4:]], 0.6 if 'tank' in key else 0.8, 0.0)
        me = bpy.data.meshes.new('rail_' + key); me.from_pydata(V, [], F); me.update()
        ob = bpy.data.objects.new('rail_' + key, me); sc.collection.objects.link(ob); me.materials.append(mat('rail_' + key, col, rough, metal)); nf += len(F)
    log(f'rail_city: {ntr} track pieces ({ntr * PIECE / 1000:.1f} km max) from {len(tr)} OSM rail ways, {ncar} freight cars, {nf} faces')
    return ntr
