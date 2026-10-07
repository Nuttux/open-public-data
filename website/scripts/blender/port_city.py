"""PORT_CITY=1 (FIX4 07/10, Vancouver; SF never sets it): the port terminals' yards as geometry - container stacks,
ship-to-shore gantry cranes (and the bulk terminals' loaders), bulk piles, silos - from port_city_prep.py's data
(cities/<city>/port/port_city.json + piles.npz: LidarBC 2025 nDSM, OSM port areas, Sentinel-2 pile colours).

Map audit 07/10 (sheet 03): Centerm and Vanterm were flat mottled grey planes (the engine draws no yard), the AI painted
warehouses on them. The LiDAR caught 7 Centerm and 6 Vanterm STS cranes, booms raised, and ~4,500 stacks.
  containers  port_containers.py's own boxes (ISO 40 / 20 ft, corrugated, door end darker): one component, the city's data
  cranes      STS, parked as flown: a portal on four legs (30 m gauge across the quay, spacing from the LiDAR blob along it),
              the girder and back-reach at ~55 % of the peak, the machinery house, the A-frame, the boom raised ~80 deg to
              the measured peak, its stays; CONVENTION colour: the terminals' orange-red (Commons photos, viewing only),
              the house white. Loaders (peak < 55 m, the bulk berths): a grey portal and a boom inclined over the water.
  piles       the measured heap at 2 m (its nDSM), coloured by the Sentinel-2 true colour over it
  silos       cylinders at the LiDAR p90 height, concrete grey / tank white
build(bpy, sc, ground, box, cityconf, log) -> number of objects' faces."""
import json, math, os
import numpy as np

SRC = '/Users/daniel/code/qipu-render-work/port/port_city.json'          # citysnap: -> cities/<city>/port/
PILES = '/Users/daniel/code/qipu-render-work/port/piles.npz'
# albedos for the V6 light (rail_city's measured gain leans warm: keep the reds a touch cool)
MATS = {'crane_red': ((0.43, 0.075, 0.035), 0.55, 0.15), 'crane_white': ((0.62, 0.62, 0.60), 0.5, 0.0), 'crane_dark': ((0.05, 0.05, 0.05), 0.6, 0.3),
        'loader': ((0.40, 0.42, 0.44), 0.55, 0.2), 'silo': ((0.46, 0.45, 0.42), 0.85, 0.0), 'tank': ((0.62, 0.62, 0.60), 0.45, 0.1)}


def _lin(h):
    c = [int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


class _G:
    """per-material vertex / face lists"""
    def __init__(self): self.g = {}
    def add(self, key, V, F):
        v, f = self.g.setdefault(key, ([], [])); k = len(v); v.extend(V); f.extend(tuple(i + k for i in q) for q in F)
    def box(self, key, c, u, w, L, W, z0, z1):
        """an oriented box: centre c (x, y), long axis u (unit), L along u, W across, z0..z1"""
        v = np.array([-u[1], u[0]]); c = np.asarray(c, float); u = np.asarray(u, float)
        P = [c - u * L / 2 - v * W / 2, c + u * L / 2 - v * W / 2, c + u * L / 2 + v * W / 2, c - u * L / 2 + v * W / 2]
        V = [(float(p[0]), float(p[1]), z0) for p in P] + [(float(p[0]), float(p[1]), z1) for p in P]
        self.add(key, V, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])
    def beam(self, key, p0, p1, r):
        """a square beam of half-width r between two 3D points"""
        p0, p1 = np.asarray(p0, float), np.asarray(p1, float); d = p1 - p0; L = np.linalg.norm(d)
        if L < 1e-6: return
        d /= L; a = np.array([0, 0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0, 0])
        e1 = np.cross(d, a); e1 /= np.linalg.norm(e1); e2 = np.cross(d, e1)
        R = [e1 * r + e2 * r, -e1 * r + e2 * r, -e1 * r - e2 * r, e1 * r - e2 * r]
        V = [tuple(map(float, p0 + q)) for q in R] + [tuple(map(float, p1 + q)) for q in R]
        self.add(key, V, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)])


def sts(G, c, gz):
    """one STS crane, boom raised (parked), at c = dict(x, y, a, L, W, h)"""
    u = np.array([math.cos(c['a']), math.sin(c['a'])]); v = np.array([-u[1], u[0]]); o = np.array([c['x'], c['y']])
    h = float(c['h']); g = min(30.5, max(16.0, c['L'] * 0.48)); s = min(20.0, max(12.0, c['W'] * 0.72))
    hp = max(28.0, 0.55 * h); back = 22.0; R = 'crane_red'
    P = lambda a, b, z: (float(o[0] + u[0] * a + v[0] * b), float(o[1] + u[1] * a + v[1] * b), gz + z)
    for a in (-g / 2, g / 2):                                   # four legs, their sill beams along the quay
        for b in (-s / 2, s / 2):
            G.beam(R, P(a, b, 0.0), P(a, b, hp), 0.8)
            G.box('crane_dark', o + u * a + v * b, v, u, 3.0, 2.2, gz, gz + 1.4)               # the bogies
        G.beam(R, P(a, -s / 2, hp - 1.0), P(a, s / 2, hp - 1.0), 0.75); G.beam(R, P(a, -s / 2, 12.0), P(a, s / 2, 12.0), 0.6)
    for b in (-s / 2, s / 2):                                   # portal beams across the quay, the girder and back-reach
        G.beam(R, P(-g / 2, b, hp - 1.0), P(g / 2, b, hp - 1.0), 0.7)
        G.beam(R, P(-g / 2 - back, b * 0.75, hp + 1.2), P(g / 2 + 3.0, b * 0.75, hp + 1.2), 1.1)
    G.box('crane_white', o - u * (g / 2 + back - 7.0), u, v, 13.0, s * 0.8, gz + hp + 2.2, gz + hp + 8.0)   # machinery house
    ah = min(h - 6.0, hp + 0.42 * (h - hp))                      # the A-frame apex
    for b in (-s / 2, s / 2):
        G.beam(R, P(-g / 2, b * 0.75, hp + 2.2), P(0.0, b * 0.35, ah), 0.55)
        G.beam(R, P(g / 2, b * 0.75, hp + 2.2), P(0.0, b * 0.35, ah), 0.55)
    G.beam(R, P(0.0, -s * 0.35, ah), P(0.0, s * 0.35, ah), 0.5)
    tip_a = g / 2 + 3.0 + (h - hp - 2.0) * math.cos(math.radians(80))    # the boom, raised ~80 deg to the peak
    for b in (-2.6, 2.6):
        G.beam(R, P(g / 2 + 3.0, b, hp + 2.2), P(tip_a, b, h), 0.7)
        G.beam('crane_dark', P(0.0, b * 0.5, ah), P(tip_a, b, h - 1.0), 0.12)              # the stays
    for k in range(1, 6):                                        # the boom's cross bracing
        f = k / 6.0; a_ = g / 2 + 3.0 + (tip_a - g / 2 - 3.0) * f; z_ = hp + 2.2 + (h - hp - 2.2) * f
        G.beam(R, P(a_, -2.6, z_), P(a_, 2.6, z_), 0.35)


def loader(G, c, gz):
    """a bulk shiploader: a grey portal on the berth and a boom inclined out over the water"""
    u = np.array([math.cos(c['a']), math.sin(c['a'])]); v = np.array([-u[1], u[0]]); o = np.array([c['x'], c['y']])
    h = float(c['h']); s = min(14.0, max(8.0, c['W'] * 0.7)); hp = 0.55 * h; K = 'loader'
    P = lambda a, b, z: (float(o[0] + u[0] * a + v[0] * b), float(o[1] + u[1] * a + v[1] * b), gz + z)
    for a in (-6.0, 6.0):
        for b in (-s / 2, s / 2): G.beam(K, P(a, b, 0.0), P(a, b, hp), 0.6)
    G.box(K, o, u, v, 16.0, s + 1.5, gz + hp, gz + hp + 4.0)
    for b in (-1.6, 1.6): G.beam(K, P(0.0, b, hp + 3.0), P(c['L'] * 0.55, b, h - 3.0), 0.55)
    G.beam(K, P(-4.0, 0.0, hp + 4.0), P(-4.0, 0.0, h), 0.5)


def build(bpy, sc, ground, box, C, log=print):
    src = SRC if os.path.exists(SRC) else C.work('port', 'port_city.json')
    if not os.path.exists(src): log('port_city: no data'); return 0
    d = json.load(open(src)); x0, y0, x1, y1 = box
    inb = lambda x, y, pad=60: x0 - pad <= x <= x1 + pad and y0 - pad <= y <= y1 + pad
    def gz(x, y):
        z = ground(float(x), float(y)); return 0.0 if z is None else float(z)
    G = _G(); n = dict(cranes=0, loaders=0, stacks=0, boxes=0, piles=0, silos=0)
    for c in d.get('cranes', []):
        if not inb(c['x'], c['y'], 120): continue
        (sts if c.get('kind', 'sts') == 'sts' else loader)(G, c, gz(c['x'], c['y'])); n['cranes' if c.get('kind', 'sts') == 'sts' else 'loaders'] += 1
    for s in d.get('silos', []):
        if not inb(s['x'], s['y']): continue
        z = gz(s['x'], s['y']); k = 'tank' if s.get('kind') == 'tank' else 'silo'; r = s['r']; N = 24
        V = [(s['x'] + r * math.cos(2 * math.pi * i / N), s['y'] + r * math.sin(2 * math.pi * i / N), zz) for zz in (z - 1.0, z + s['h']) for i in range(N)]
        F = [(i, (i + 1) % N, N + (i + 1) % N, N + i) for i in range(N)] + [tuple(range(N, 2 * N))]
        G.add(k, V, F); n['silos'] += 1
    # piles: the measured heap at 2 m
    pm = {}
    pf = PILES if os.path.exists(PILES) else C.work('port', 'piles.npz')
    if os.path.exists(pf) and d.get('piles'):
        Z = np.load(pf)
        for p in d['piles']:
            hp_ = Z[p['key']].astype(np.float32) / 100.0; H, W = hp_.shape; res = p['res']
            if not inb(p['x0'] + W * res / 2, p['y1'] - H * res / 2, 200): continue
            idx = -np.ones((H, W), np.int64); keep = hp_ > 0.2
            keep = keep | np.pad(keep[1:], ((0, 1), (0, 0))) | np.pad(keep[:-1], ((1, 0), (0, 0))) | np.pad(keep[:, 1:], ((0, 0), (0, 1))) | np.pad(keep[:, :-1], ((0, 0), (1, 0)))
            ys, xs = np.nonzero(keep); idx[ys, xs] = np.arange(len(ys))
            V = [(p['x0'] + (j + 0.5) * res, p['y1'] - (i + 0.5) * res, gz(p['x0'] + (j + 0.5) * res, p['y1'] - (i + 0.5) * res) + float(hp_[i, j]) - 0.05) for i, j in zip(ys, xs)]
            a, b, c_, e = idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]; ok = (a >= 0) & (b >= 0) & (c_ >= 0) & (e >= 0)
            F = [(int(a[i, j]), int(e[i, j]), int(c_[i, j]), int(b[i, j])) for i, j in zip(*np.nonzero(ok))]
            key = 'pile_' + p['key']; G.add(key, V, F); pm[key] = (_lin(p['col']), 0.95, 0.0); n['piles'] += 1
    def mat(nm, col, rough, metal):
        m = bpy.data.materials.get(nm) or bpy.data.materials.new(nm); m.use_nodes = True; b_ = m.node_tree.nodes.get('Principled BSDF')
        if b_ is not None:
            b_.inputs['Base Color'].default_value = (*col, 1); b_.inputs['Roughness'].default_value = rough; b_.inputs['Metallic'].default_value = metal
        return m
    nf = 0
    for key, (V, F) in G.g.items():
        if not F: continue
        col, rough, metal = MATS.get(key) or pm[key]
        me = bpy.data.meshes.new('port_' + key); me.from_pydata(V, [], F); me.update()
        ob = bpy.data.objects.new('port_' + key, me); sc.collection.objects.link(ob); me.materials.append(mat('port_' + key, col, rough, metal)); nf += len(F)
    # the container stacks: port_containers.py's boxes (the same component as SF's yards), this city's data
    CB = [c for c in d.get('containers', []) if inb(c['x'], c['y'], 20)]
    if CB:
        import port_containers
        port_containers.emit(bpy, sc, CB, lambda x, y: gz(x, y), log, name='port_boxes_city'); n['stacks'] = len(CB); n['boxes'] = int(sum(c['t'] for c in CB))
    log(f'port_city: {n} ({nf} faces besides the boxes)')
    return n
