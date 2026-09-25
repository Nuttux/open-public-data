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


MPD = 111320.0                  # the engine's metres per degree (pipeline encode_city_chunks.py)


def ll(lat, lon):
    """published WGS84 coordinates -> world metres (the engine's frame:
    equirectangular about lat 37.76, lon -122.438, 111,320 m a degree)"""
    return ((lon - LON0) * MPD * math.cos(math.radians(LAT0)), (lat - LAT0) * MPD)


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
    gap = math.radians(st.get('gap', 0.0)); e = st.get('sq', 2.0)
    ga = math.radians(st.get('gap_at', 0.0))                  # where the open end faces, from +u
    # the field
    F = superellipse(c, u, v, fa * 1.02, fb * 1.02, 64, e)
    P.poly('field', [(x, y, zf + 0.05) for x, y in F])
    t0, t1 = (ga + gap / 2, ga + 2 * math.pi - gap / 2) if gap > 0 else (0.0, 2 * math.pi)
    closed = gap <= 0
    n = 64
    inner = [(x, y, zf + 1.5) for x, y in superellipse(c, u, v, fa, fb, n, e, t0, t1, closed)]
    outer = [(x, y, zf + H) for x, y in superellipse(c, u, v, oa, ob, n, e, t0, t1, closed)]
    foot = [(x, y, zf - 1.0) for x, y in superellipse(c, u, v, oa, ob, n, e, t0, t1, closed)]
    lip = [(x, y, zf - 1.0) for x, y in superellipse(c, u, v, fa, fb, n, e, t0, t1, closed)]
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
        rimin = [(x, y, zf + H + st['rim']) for x, y in superellipse(c, u, v, oa - 8, ob - 8, n, e, t0, t1, closed)]
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
    if L > 0:
        P.box('deck', c, u, v, L / 2 + d, W / 2 + d, z - 0.4, z + 0.15)
        P.box('water' if st.get('water', True) else 'basin', c, u, v, L / 2, W / 2, z - 0.5, z + 0.16)
    else: L = 304.8
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



def superellipse(c, u, v, a, b, n=64, e=2.0, t0=0.0, t1=2 * math.pi, closed=True):
    """a rounded rectangle (e > 2) or an ellipse (e = 2)"""
    m = n if closed else n + 1
    out = []
    for i in range(m):
        t = t0 + (t1 - t0) * i / n
        ct, st_ = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(ct) ** (2 / e), ct); y = b * math.copysign(abs(st_) ** (2 / e), st_)
        out.append((c[0] + u[0] * x + v[0] * y, c[1] + u[1] * x + v[1] * y))
    return out


def boxes(P, st, ground):
    """a compound of boxes in the structure's own frame: st['parts'] =
    [(material, u0, v0, u1, v1, z0, z1)] metres from c along ang; a
    st['field'] (x0, y0, x1, y1, world) is laid in grass first"""
    c = st['c']; u, v = _frame(st.get('ang', 0.0)); z = ground(*c) or 0.0
    if st.get('field'):
        x0, y0, x1, y1 = st['field']
        P.poly('field', [(x0, y0, z + 0.05), (x1, y0, z + 0.05), (x1, y1, z + 0.05), (x0, y1, z + 0.05)])
    for mat, u0, v0, u1, v1, z0, z1 in st['parts']:
        cc = (c[0] + u[0] * (u0 + u1) / 2 + v[0] * (v0 + v1) / 2, c[1] + u[1] * (u0 + u1) / 2 + v[1] * (v0 + v1) / 2)
        P.box(mat, cc, u, v, abs(u1 - u0) / 2, abs(v1 - v0) / 2, z + z0, z + z1)


# ── the lost structures (sources: history/CHECKPOINTS.md 'Lost structures') ──
# Positions and outlines MEASURED on the USGS 1:24,000 sheets (public
# domain; world-frame crops, history/refs/usgs24k, registration about
# +-20 m); dates and published dimensions SOURCED; heights and the form of
# the stands a CONVENTION where nothing is published.
LOST = [
    # Kezar Stadium, the 1925 bowl: dedicated 2 May 1925, 59,942 seats, 'one
    # tier of bleachers ... circled the entire field'; demolished June 1989
    # (rebuilt for 10,000, 1990). Outline on the 1956 San Francisco North
    # sheet: a rounded oval 250 x 165 m round a 200 x 105 m field, centre
    # (-1577, 747). Height of the rim: CONVENTION.
    dict(key='kezar_1925', y0=1925.33, y1=1989.45,
         form=dict(kind='bowl', c=(-1577.0, 747.0), ang=0.0, field=(100.0, 52.5), outer=(125.0, 82.5), h=14.0, sq=3.0)),
    # Seals Stadium, 16th/Bryant/Potrero/Alameda: opened 7 Apr 1931, closed 20
    # Sep 1959, demolished Nov 1959. Stands on the 1947 sheet: a C round the
    # west, north and south of the block (field to the east). CONVENTION on
    # the heights.
    dict(key='seals', y0=1931.27, y1=1959.85,
         form=dict(kind='boxes', c=(2530.0, 705.0), ang=0.0, field=(2443, 607, 2618, 802),
                   parts=[('stands', -82, -80, -48, 95, 0, 16), ('stands', -82, 62, 53, 95, 0, 14),
                          ('stands', -82, -80, 23, -58, 0, 12), ('wall', -87, -98, 88, -96, 0, 4)])),
    # Candlestick Park: opened 12 Apr 1960; enclosed with outfield stands for
    # the 49ers in 1971; closed 14 Aug 2014; demolished 4 Feb - 24 Sep 2015.
    # 1968 South sheet: a horseshoe open to the east-north-east; 1980: closed,
    # a rounded square ~210 x 280 m round a ~120 x 140 m field, centre (4562,
    # -5184). Height: CONVENTION (a two-deck concrete stadium).
    dict(key='candlestick', y0=1960.28, y1=2015.5, land=True,
         form=dict(kind='bowl', c=(4562.0, -5184.0), ang=90.0, field=(70.0, 60.0), outer=(140.0, 105.0), h=30.0, sq=3.5,
                   gap=110.0, gap_at=-80.0, rim=3.0),
         forms=[(1971.5, dict(gap=0.0))]),
    # Fleishhacker Pool: opened 22 Apr 1925, 1,000 x 150 ft of seawater, a
    # Mediterranean Revival bathhouse; closed by the end of 1971, filled with
    # rock and gravel (zoo parking); bathhouse burned 1 Dec 2012. Outline on
    # the 1956 San Francisco South sheet: the pool along 83.6 deg, centre
    # (-5980, -2958), the bathhouse on its west side.
    dict(key='fleishhacker', y0=1925.3, y1=2013.0,
         form=dict(kind='pool', c=(-5980.0, -2958.0), ang=83.6, L=304.8, W=45.7, deck=5.0, house=(130.0, 22.0, 9.0, 'v+')),
         forms=[(1972.0, dict(water=False)), (2000.5, dict(L=0.0))]),
    # Sutro Baths: opened 14 Mar 1896, 499.5 x 254.1 ft under 100,000 sq ft
    # of glass; burned 26 Jun 1966 during demolition. On the 1954 Point Bonita
    # sheet the building lies north-south at (-6635, 2225). Wall and ridge
    # heights: CONVENTION.
    dict(key='sutro_baths', y0=1896.2, y1=1966.49,
         form=dict(kind='hall', c=(-6635.0, 2225.0), ang=90.0, L=152.2, W=77.5, h=10.0, ridge=14.0)),
    # the Transbay Terminal: opened 14 Jan 1939, last bus 7 Aug 2010, torn
    # down Dec 2010 - Sep 2011; its concourse and train deck on the 1956 San
    # Francisco North sheet, 225 x 40 m from (3598, 3192) to (3760, 3348).
    # Height: CONVENTION (four levels, garage to deck). The loop viaduct is
    # in era.STRUCTURES.
    dict(key='transbay_terminal', y0=1939.04, y1=2011.67, dem=(2010.95, 2011.67),
         form=dict(kind='block', c=(3679.0, 3270.0), ang=43.9, L=225.0, W=40.0, h=18.0)),
]


KINDS = {'bowl': bowl, 'pool': pool, 'hall': hall, 'block': block, 'boxes': boxes}


def standing(era):
    """(entry, form) pairs standing in the year shown; an entry may change
    form over its life (`forms`: [(from_year, overrides)])"""
    out = []
    for e in LOST:
        if not (e['y0'] <= era < e['y1']): continue
        st = dict(e['form'])
        for y_, ov in e.get('forms', []):
            if era >= y_: st.update(ov)
        d = e.get('dem')       # the demolition grammar (era.demolished_path): it comes down over its window
        if d and era >= d[0] and 'h' in st:
            f = min(1.0, (era - d[0]) / (d[1] - d[0])); st['h'] = st['h'] * (1 - f) + 0.5 * f
            if 'L' in st: st['L'] = max(8.0, st['L'] * (1 - 0.6 * f))
        out.append((e, st))
    return out


def on_land(x, y, era):
    """inside a lost structure standing in the year (its ground was land)"""
    for e, st in standing(era):
        c = st['c']; r = st.get('r') or max(st.get('outer', (st.get('L', 50) / 2, 0))[0], st.get('L', 0) / 2) + 30
        if (x - c[0]) ** 2 + (y - c[1]) ** 2 < r * r: return True
    return False


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
