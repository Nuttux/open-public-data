"""Structures San Francisco has lost that no footprint record holds — the
stadiums, pools, halls and terminals that stood for decades and were torn
down — drawn in the years they stood.

Each entry of LOST says where it stood (world metres: x east, y north of lon
-122.438, lat 37.76 — `ll(lat, lon)` converts published coordinates), when
(first and last year standing), its form (a kind below, with the published
dimensions) and its sources. The forms are simple on purpose: at the city's
scale (37 cm a pixel) what reads is the outline, the height and the colour.
Everything here is SOURCED unless marked CONVENTION; sources in each entry and
in qipu-render-work/history/CHECKPOINTS.md.

Geometry is built as plain lists (verts, faces per material) — testable
without Blender — and emitted by `emit(bpy, parts, mats, name)`.
"""
import math

LAT0, LON0 = 37.76, -122.438


def ll(lat, lon):
    """published WGS84 coordinates -> world metres (the engine's frame, as
    topo_extract.py: equirectangular about lat 37.76, lon -122.438)"""
    return ((lon - LON0) * 111415.0 * math.cos(math.radians(LAT0)), (lat - LAT0) * 110996.0)


class Parts:
    """per-material vertex and face lists"""
    def __init__(self):
        self.m = {}

    def poly(self, mat, pts):
        V, F = self.m.setdefault(mat, ([], []))
        k = len(V); V.extend(tuple(p) for p in pts); F.append(tuple(range(k, k + len(pts))))

    def quad_strip(self, mat, A, B):
        """faces between two equal-length closed rings of points"""
        n = len(A)
        for i in range(n):
            j = (i + 1) % n
            self.poly(mat, [A[i], A[j], B[j], B[i]])

    def box(self, mat, c, u, v, hu, hv, z0, z1):
        """a box centred on c (x, y), half-sizes hu along unit u, hv along v"""
        P = []
        for (su, sv) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            P.append((c[0] + u[0] * su * hu + v[0] * sv * hv, c[1] + u[1] * su * hu + v[1] * sv * hv))
        lo = [(x, y, z0) for x, y in P]; hi = [(x, y, z1) for x, y in P]
        self.poly(mat, hi); self.poly(mat, lo[::-1]); self.quad_strip(mat, lo, hi)


def _frame(ang_deg):
    a = math.radians(ang_deg)
    return (math.cos(a), math.sin(a)), (-math.sin(a), math.cos(a))


def _ellipse(c, u, v, a, b, n=48, t0=0.0, t1=2 * math.pi, closed=True):
    m = n if closed else n + 1
    out = []
    for i in range(m):
        t = t0 + (t1 - t0) * i / n
        ca, sa = math.cos(t) * a, math.sin(t) * b
        out.append((c[0] + u[0] * ca + v[0] * sa, c[1] + u[1] * ca + v[1] * sa))
    return out


def bowl(P, st, ground):
    """a stadium: a field (grass) inside raked stands rising to an outer wall.
    st: c (x, y), ang (deg, the long axis), field (a, b) half-axes, outer
    (a, b), h (top of the stands over the field), gap (deg: an open end
    centred on the +u axis, 0 = closed), rim (a light-tower or roof rim
    height over the top, 0 = none)"""
    c = st['c']; u, v = _frame(st.get('ang', 0.0))
    zf = (ground(*c) or 0.0) + st.get('field_z', 0.0)
    fa, fb = st['field']; oa, ob = st['outer']; H = st['h']
    gap = math.radians(st.get('gap', 0.0))
    # the field
    F = _ellipse(c, u, v, fa * 1.02, fb * 1.02, 48)
    P.poly('field', [(x, y, zf + 0.05) for x, y in F])
    t0, t1 = (gap / 2, 2 * math.pi - gap / 2) if gap > 0 else (0.0, 2 * math.pi)
    closed = gap <= 0
    n = 48
    inner = [(x, y, zf + 1.5) for x, y in _ellipse(c, u, v, fa, fb, n, t0, t1, closed)]
    outer = [(x, y, zf + H) for x, y in _ellipse(c, u, v, oa, ob, n, t0, t1, closed)]
    foot = [(x, y, zf - 1.0) for x, y in _ellipse(c, u, v, oa, ob, n, t0, t1, closed)]
    lip = [(x, y, zf - 1.0) for x, y in _ellipse(c, u, v, fa, fb, n, t0, t1, closed)]
    m = len(inner)
    rng = range(m) if closed else range(m - 1)
    for i in rng:
        j = (i + 1) % m
        P.poly('stands', [inner[i], inner[j], outer[j], outer[i]])        # the rake (seats)
        P.poly('wall', [outer[i], outer[j], foot[j], foot[i]])           # the outer wall
        P.poly('wall', [lip[i], lip[j], inner[j], inner[i]])             # the field wall
    if not closed:                                                      # the open ends' side walls
        for k in (0, m - 1):
            P.poly('wall', [lip[k], inner[k], outer[k], foot[k]])
    if st.get('rim', 0) > 0:                                            # a roof rim over the top rows
        top = [(x, y, zf + H + st['rim']) for x, y, _ in outer]
        rimin = [(x, y, zf + H + st['rim']) for x, y in _ellipse(c, u, v, oa - 8, ob - 8, n, t0, t1, closed)]
        for i in rng:
            j = (i + 1) % m
            P.poly('roof', [rimin[i], rimin[j], top[j], top[i]])
            P.poly('wall', [outer[i], outer[j], top[j], top[i]])


def pool(P, st, ground):
    """an open-air pool: the water in its basin, a paved deck round it, a
    bathhouse. st: c, ang, L, W (the water), deck (m), house (L, W, h, side:
    'u-' | 'u+' | 'v-' | 'v+'), water (True: filled; False: drained)"""
    c = st['c']; u, v = _frame(st.get('ang', 0.0)); z = ground(*c) or 0.0
    L, W = st['L'], st['W']; d = st.get('deck', 6.0)
    P.box('deck', c, u, v, L / 2 + d, W / 2 + d, z - 0.4, z + 0.15)
    P.box('water' if st.get('water', True) else 'basin', c, u, v, L / 2, W / 2, z - 0.5, z + 0.16)
    hs = st.get('house')
    if hs:
        hl, hw, hh, side = hs
        off = {'u-': (-(L / 2 + d + hw / 2), 0), 'u+': (L / 2 + d + hw / 2, 0), 'v-': (0, -(W / 2 + d + hw / 2)), 'v+': (0, W / 2 + d + hw / 2)}[side]
        hc = (c[0] + u[0] * off[0] + v[0] * off[1], c[1] + u[1] * off[0] + v[1] * off[1])
        if side[0] == 'u': P.box('house', hc, u, v, hw / 2, hl / 2, z - 0.5, z + hh)
        else: P.box('house', hc, u, v, hl / 2, hw / 2, z - 0.5, z + hh)


def hall(P, st, ground):
    """a long hall under a pitched glass roof on masonry walls. st: c, ang,
    L, W, h (eaves), ridge (over the eaves), wall z from the lowest ground"""
    c = st['c']; u, v = _frame(st.get('ang', 0.0))
    z = min(ground(*c) or 0.0, st.get('zmax', 1e9))
    L, W, h, r = st['L'], st['W'], st['h'], st.get('ridge', 8.0)
    P.box('wall', c, u, v, L / 2, W / 2, z - 3.0, z + h)
    def w(a, b, zz): return (c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b, zz)
    for s in (-1, 1):
        P.poly('glassroof', [w(-L / 2, s * W / 2, z + h), w(L / 2, s * W / 2, z + h), w(L / 2, 0, z + h + r), w(-L / 2, 0, z + h + r)][::(1 if s > 0 else -1)])
    for a in (-L / 2, L / 2):
        P.poly('wall', [w(a, -W / 2, z + h), w(a, W / 2, z + h), w(a, 0, z + h + r)])


def block(P, st, ground):
    """a plain building: a box with a flat roof. st: c, ang, L, W, h"""
    c = st['c']; u, v = _frame(st.get('ang', 0.0)); z = ground(*c) or 0.0
    P.box('wall', c, u, v, st['L'] / 2, st['W'] / 2, z - 1.0, z + st['h'])
    P.box('roof', c, u, v, st['L'] / 2 - 0.3, st['W'] / 2 - 0.3, z + st['h'], z + st['h'] + 0.3)


KINDS = {'bowl': bowl, 'pool': pool, 'hall': hall, 'block': block}

# ── the lost structures (filled from sourced research; see CHECKPOINTS.md) ──
LOST = []


def standing(era):
    """(entry, form) pairs standing in the year shown; an entry may change
    form over its life (`forms`: [(from_year, overrides)])"""
    out = []
    for e in LOST:
        if not (e['y0'] <= era < e['y1']): continue
        st = dict(e['form'])
        for y_, ov in e.get('forms', []):
            if era >= y_: st.update(ov)
        out.append((e, st))
    return out


def build(era, ground, box=None, pad=600.0):
    """Parts of everything lost standing in the year shown (inside box)"""
    P = Parts(); names = []
    for e, st in standing(era):
        c = st['c']
        if box is not None and not (box[0] - pad <= c[0] <= box[2] + pad and box[1] - pad <= c[1] <= box[3] + pad): continue
        KINDS[st['kind']](P, st, ground); names.append(e['key'])
    return P, names


def emit(bpy, P, mats, name='lost'):
    obs = []
    for mat, (V, F) in P.m.items():
        if not F: continue
        me = bpy.data.meshes.new(f'{name}.{mat}'); me.from_pydata(V, [], F); me.validate(); me.update()
        ob = bpy.data.objects.new(f'{name}.{mat}', me); bpy.context.scene.collection.objects.link(ob)
        if mats.get(mat) is not None: me.materials.append(mats[mat])
        obs.append(ob)
    return obs
