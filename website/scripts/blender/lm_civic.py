"""Towers and civic landmarks, modelled from published dimensions on their
OpenStreetMap / DataSF outlines (footprints.json, lm_prep.py).

SALESFORCE TOWER (Pelli Clarke Pelli, 2018): 1,070 ft (326.1 m) to the top
of the crown, 61 floors; a square plan with rounded corners that tapers as it
rises; pale pearl glass behind white horizontal sunshades at every floor; the
top ~ 55 m an open crown of the same sunshades round the core.
SALESFORCE TRANSIT CENTER (2018): 1,400 ft long, its roof park (Salesforce
Park, 5.4 acres) 70 ft (21 m) over the street, a white perforated aluminium
skin in waves.
TRANSAMERICA PYRAMID (William Pereira, 1972): 853 ft (260 m); a four-sided
pyramid on the published footprint, white quartz-aggregate precast panels
with 3,678 windows; the elevator (east) and stair (west) wings rise out of
the sloping faces from the 29th floor to the base of the aluminium-clad
spire (212 ft, from 213 m); the base's exposed concrete trusses.
COIT TOWER (Arthur Brown Jr., 1933): 210 ft (64 m) of unpainted reinforced
concrete on Telegraph Hill, a fluted shaft 37 ft (11.3 m) across on a square
base, arched openings of the observation gallery at the top.
"""
import json, math, os
import numpy as np
from lm_kit import Frame, hexc

FP_PATH = '/Users/daniel/code/qipu-render-work/landmarks/footprints.json'
_FP = None
def FP():
    global _FP
    if _FP is None: _FP = json.load(open(FP_PATH)) if os.path.exists(FP_PATH) else {}
    return _FP

def outer(key):
    f = FP().get(key)
    return [list(map(tuple, r)) for r in f['outer']] if f else None

def centroid(r):
    a = cx = cy = 0.0
    for i in range(len(r)):
        (x1, y1), (x2, y2) = r[i], r[(i + 1) % len(r)]
        c = x1 * y2 - x2 * y1; a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c
    if abs(a) < 1e-9: return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)
    return cx / (3 * a), cy / (3 * a)

def orient(r, near=None):
    """dominant edge direction of an outline (radians, mod 90 deg)"""
    acc = {}
    for i in range(len(r) - 1):
        (x1, y1), (x2, y2) = r[i], r[i + 1]; L = math.hypot(x2 - x1, y2 - y1)
        a = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 90; k = round(a)
        acc[k] = acc.get(k, 0) + L
    k = max(acc, key=acc.get) if near is None else near
    # refine: length-weighted mean of the edges within 3 deg of k
    s = w = 0.0
    for i in range(len(r) - 1):
        (x1, y1), (x2, y2) = r[i], r[i + 1]; L = math.hypot(x2 - x1, y2 - y1)
        a = math.degrees(math.atan2(y2 - y1, x2 - x1)) % 90
        if abs(a - k) < 3: s += a * L; w += L
    return math.radians(s / w if w else k)

def extent(r, fr):
    uv = [fr.uv(*p) for p in r]
    return min(p[0] for p in uv), max(p[0] for p in uv), min(p[1] for p in uv), max(p[1] for p in uv)

def rrect(fr, hu, hv, rad, z=0.0, nseg=6, u0=0.0, v0=0.0):
    """rounded rectangle in a frame: half sizes hu, hv, corner radius rad"""
    rad = min(rad, hu * 0.999, hv * 0.999)
    pts = []
    for (cu, cv, a0) in ((hu - rad, hv - rad, 0), (-hu + rad, hv - rad, 90), (-hu + rad, -hv + rad, 180), (hu - rad, -hv + rad, 270)):
        for k in range(nseg + 1):
            a = math.radians(a0 + 90 * k / nseg)
            pts.append(fr.P(u0 + cu + rad * math.cos(a), v0 + cv + rad * math.sin(a), z))
    return pts

WHITE = hexc('#e9e6df')
PEARL = (0.36, 0.40, 0.44, 0.55)           # curtain glass: tint + how metallic (alpha)
QUARTZ = hexc('#e2dccd')
ALU = hexc('#c9ccce')
CONC = hexc('#cfc8b8')

# ── Salesforce Tower ─────────────────────────────────────────────────────────
SF_FIN = hexc('#d3d6d7')          # (25/09) the sunshades: pale pearl-grey, thinner (the tower read stark white in bands)
SF_GLASS = (0.31, 0.39, 0.46, 0.55)   # a bluer pearl glass (aerials refs/salesforce)
def salesforce(C):
    if C.era is not None and C.era < 2017: return
    r = outer('salesforce')
    if not r: return
    r = r[0]; cx, cy = centroid(r)
    fr = Frame(cx, cy, orient(r, near=45))
    u0, u1, v0, v1 = extent(r, fr)
    hu0, hv0 = (u1 - u0) / 2, (v1 - v0) / 2
    fr = Frame(cx + 0 * u0, cy, fr and orient(r, near=45))
    g = C.tg(cx, cy)
    K = C.K
    TOP, ROOF, CROWN0 = 326.1, 296.0, 271.0
    def half(z):                       # plan half-size at height z: a gentle, accelerating taper
        t = min(1.0, z / ROOF)
        return 1.0 - 0.27 * t ** 1.5
    def rad(z): return 0.22 + 0.10 * min(1.0, z / ROOF)
    # the lobby: a glass podium set in under the first sunshade
    fl = 4.18
    zs = [0.0, 8.5] + [8.5 + fl * k for k in range(1, 64) if 8.5 + fl * k < CROWN0] + [CROWN0]
    rings = []
    for z in zs:
        s = half(z); hu, hv = hu0 * s * 0.985, hv0 * s * 0.985
        rings.append(rrect(fr, hu, hv, rad(z) * min(hu, hv), g + z, 5))
    K.loft('curtain_wall', rings, SF_GLASS, cap_top=False)
    # sunshades: a white fin every floor, 0.8 m out, 0.25 m thick
    for z in zs[1:] + [CROWN0 + 3.4 * k for k in range(1, 17) if CROWN0 + 3.4 * k <= TOP - 0.3] + [TOP - 0.3]:
        s = half(min(z, ROOF)); hu, hv = hu0 * s, hv0 * s
        ro = rrect(fr, hu + 0.42, hv + 0.42, rad(z) * min(hu, hv) + 0.42, g + z, 5)
        ri = rrect(fr, hu - 0.35, hv - 0.35, rad(z) * min(hu, hv) - 0.35, g + z, 5)
        th = 0.2 if z < CROWN0 else 0.4
        roT = [(p[0], p[1], p[2] + th) for p in ro]; riT = [(p[0], p[1], p[2] + th) for p in ri]
        n = len(ro); V = ro + roT + riT + ri; Fc = []
        for i in range(n):
            j = (i + 1) % n
            Fc += [(i, j, n + j, n + i), (n + i, n + j, 2 * n + j, 2 * n + i), (2 * n + i, 2 * n + j, 3 * n + j, 3 * n + i), (3 * n + i, 3 * n + j, j, i)]
        K.mesh('lm_paint', V, Fc, SF_FIN)
    # vertical mullions of the crown (the sunshades' posts), and the core inside
    s = half(ROOF); hu, hv = hu0 * s, hv0 * s
    ring = rrect(fr, hu + 0.1, hv + 0.1, rad(ROOF) * min(hu, hv), 0, 5)
    for i in range(0, len(ring), 2):
        p = ring[i]
        K.cyl('lm_paint', (p[0], p[1], g + CROWN0), (p[0], p[1], g + TOP - 0.3), 0.18, SF_FIN, n=4, smooth=False)
    core = rrect(fr, hu * 0.62, hv * 0.62, 3.0, 0, 3)
    K.prism('lm_paint', [p[:2] for p in core], g + CROWN0, g + ROOF + 8, hexc('#bfc3c4'))
    K.prism('lm_paint', [p[:2] for p in rrect(fr, hu * 0.45, hv * 0.45, 2.0, 0, 3)], g + ROOF + 8, g + TOP - 6, hexc('#a9adb0'))

# ── 181 Fremont ─────────────────────────────────────────────────────────────
# OSM way 445566153 (ODbL, (c) OpenStreetMap contributors): height 244.4 m,
# 57 levels; not in DataSF (two 5.4 m lot records stood on its site)
FREMONT181_RING = [(3758.78, 3340.46), (3747.78, 3329.4), (3742.72, 3324.32), (3740.36, 3321.94), (3730.19, 3311.73),
                   (3736.84, 3305.11), (3755.46, 3286.6), (3774.17, 3305.4), (3766.77, 3312.77), (3776.65, 3322.7)]
FREMONT_GLASS = (0.29, 0.36, 0.44, 0.55)        # blue-grey curtain wall: tint + how metallic (alpha)
BRACE = hexc('#e4e5e2')

def fremont181(C):
    """181 FREMONT (Heller Manus, 2018): 802 ft (244.4 m, OSM) of blue-grey
    glass on a 40 x 36 m plate set at 45 degrees to the street grid, wrapped in
    a white exoskeleton of diagonal megabraces (each face a chevron every ~9
    floors), the upper floors cut back in sloping facets to a crown and a
    spire. The plan is OSM's outline (its stepped east corner kept); the
    braces run on the outline's bounding rectangle."""
    if C.era is not None and C.era < 2017: return
    r = FREMONT181_RING; K = C.K
    cx, cy = centroid(r); ang = orient(r, near=45)
    fr = Frame(cx, cy, ang)
    u0, u1, v0, v1 = extent(r, fr)
    g = min(C.tg(*p) for p in r)
    ROOF, CROWN_TOP, TOP = 205.0, 236.0, 244.4
    # the shaft: glass, a thin white band every floor (3.6 m) catching the light
    K.prism('curtain_wall', r, g - 1.0, g + ROOF, FREMONT_GLASS, top=False)
    for k in range(1, int(ROOF / 3.6)):
        z = g + k * 3.6
        ro = [(cx + (x - cx) * 1.004, cy + (y - cy) * 1.004) for x, y in r]
        K.prism('lm_paint', ro, z, z + 0.22, hexc('#aeb4b9'), top=False)
    # the crown: the plate pulled in towards its north corner in facets, to a point
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    apex = fr.P(uc + (u1 - uc) * 0.35, vc + (v1 - vc) * 0.35, g + CROWN_TOP)
    n = len(r)
    tiers = [(ROOF, 1.0), (ROOF + 12.0, 0.72), (ROOF + 22.0, 0.42)]
    rings = []
    for (z, sc) in tiers:
        rings.append([(apex[0] + (x - apex[0]) * sc, apex[1] + (y - apex[1]) * sc, g + z) for x, y in r])
    K.loft('curtain_wall', rings, FREMONT_GLASS, cap_top=False)
    top = rings[-1]
    for i in range(n):                                   # the last facets meet at the apex
        a, b = top[i], top[(i + 1) % n]
        K.face('curtain_wall', [a, b, apex], FREMONT_GLASS)
    # the crown's white frame: the ridges up to the apex
    for p in rings[0][::2]:
        K.beam('lm_paint', p, apex, 0.6, 0.6, BRACE)
    K.cyl('lm_paint', apex, (apex[0], apex[1], g + TOP), 0.45, BRACE, n=6, smooth=False, r1=0.12)
    # the exoskeleton: on each face of the bounding rectangle, diagonals from
    # corner to corner every 33 m (a zigzag, so every face reads as chevrons),
    # 0.5 m proud of the glass, and a white horizontal at every node
    faces = [((u0, v0), (u1, v0)), ((u1, v0), (u1, v1)), ((u1, v1), (u0, v1)), ((u0, v1), (u0, v0))]
    H = 33.0; nz = int(ROOF / H)
    for (a, b) in faces:
        du, dv = b[0] - a[0], b[1] - a[1]; L = math.hypot(du, dv)
        nu, nv = dv / L, -du / L                          # outward (the faces run counter-clockwise)
        off = 0.5
        pa = lambda t, z: fr.P(a[0] + du * t + nu * off, a[1] + dv * t + nv * off, g + z)
        for k in range(nz):
            z0, z1 = k * H, min(ROOF, (k + 1) * H)
            t0, t1 = (0.0, 1.0) if k % 2 == 0 else (1.0, 0.0)
            K.beam('lm_paint', pa(t0, z0), pa(0.5, (z0 + z1) / 2), 1.3, 0.8, BRACE, up=(0, 0, 1))
            K.beam('lm_paint', pa(0.5, (z0 + z1) / 2), pa(t1, z1), 1.3, 0.8, BRACE, up=(0, 0, 1))
            K.beam('lm_paint', pa(0.0, z1), pa(1.0, z1), 1.0, 0.8, BRACE, up=(0, 0, 1))
        for t in (0.0, 1.0):                              # the corner columns
            K.beam('lm_paint', pa(t, 0.0), pa(t, ROOF), 1.4, 1.4, BRACE, up=(du / L, dv / L, 0))
    # the lobby: a dark glass base, 12 m
    K.prism('lm_steel', [(cx + (x - cx) * 0.98, cy + (y - cy) * 0.98) for x, y in r], g - 0.5, g + 12.0, hexc('#2b3035'), top=False)

# ── Salesforce Transit Center and its roof park ──────────────────────────────
def transit_center(C):
    if C.era is not None and C.era < 2018: return
    rs = outer('transit_center')
    if not rs: return
    r = rs[0]; K = C.K
    cx, cy = centroid(r)
    g = min(C.tg(*p) for p in r[::8])
    ROOF = g + 21.3
    # the waving white skin: the outline extruded, the wall in vertical strips
    # whose outward lean follows a slow wave (the perforated aluminium panels)
    n = len(r) - 1 if r[0] == r[-1] else len(r)
    ring = r[:n]
    a2 = sum(ring[i][0] * ring[(i + 1) % n][1] - ring[(i + 1) % n][0] * ring[i][1] for i in range(n))
    if a2 < 0: ring = ring[::-1]
    V, Fc = [], []
    for i in range(n):
        (x1, y1), (x2, y2) = ring[i], ring[(i + 1) % n]
        L = math.hypot(x2 - x1, y2 - y1)
        if L < 1e-3: continue
        nx_, ny_ = (y2 - y1) / L, -(x2 - x1) / L
        m = max(1, int(L / 2.0))
        for k in range(m):
            t0, t1 = k / m, (k + 1) / m
            pa = (x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0); pb = (x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1)
            ph = (pa[0] * 0.021 + pa[1] * 0.017)
            w = 0.9 * math.sin(ph)
            q = len(V)
            V += [(pa[0], pa[1], g - 1), (pb[0], pb[1], g - 1),
                  (pb[0] + nx_ * w, pb[1] + ny_ * w, ROOF - 3), (pa[0] + nx_ * w, pa[1] + ny_ * w, ROOF - 3),
                  (pb[0], pb[1], ROOF), (pa[0], pa[1], ROOF)]
            Fc += [(q, q + 1, q + 2, q + 3), (q + 3, q + 2, q + 4, q + 5)]
    K.mesh('lm_paint', V, Fc, hexc('#ecebe6'))
    # the park: lawn, a loop path, planting beds; a parapet round it
    K.face('lawn', [(p[0], p[1], ROOF + 0.4) for p in ring], (1, 1, 1, 1))
    K.prism('lm_paint', [p for p in ring], ROOF, ROOF + 1.1, hexc('#e4e2dc'), top=False)
    fr = Frame(cx, cy, orient(r, near=45))
    u0, u1, v0, v1 = extent(ring, fr)
    along = (u1 - u0) > (v1 - v0)
    # a winding walk the length of the roof
    pts = []
    Lr = (u1 - u0) if along else (v1 - v0); Wd = (v1 - v0) if along else (u1 - u0)
    for k in range(121):
        t = -0.46 + 0.92 * k / 120
        s = 0.22 * Wd * math.sin(t * 9.0)
        pts.append(fr.P(t * Lr, s, ROOF + 0.45) if along else fr.P(s, t * Lr, ROOF + 0.45))
    for k in range(len(pts) - 1):
        a, b = pts[k], pts[k + 1]
        dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1
        ox, oy = -dy / L * 1.8, dx / L * 1.8
        K.face('path', [(a[0] - ox, a[1] - oy, a[2]), (b[0] - ox, b[1] - oy, b[2]), (b[0] + ox, b[1] + oy, b[2]), (a[0] + ox, a[1] + oy, a[2])], (1, 1, 1, 1))
    # trees along the walk
    rnd = np.random.default_rng(7)
    tp = []
    for k in range(0, len(pts), 3):
        for side in (-1, 1):
            a = pts[k]; j = min(k + 1, len(pts) - 1); b = pts[j] if j != k else pts[k - 1]
            dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy) or 1
            off = side * rnd.uniform(5, 11)
            tp.append((a[0] - dy / L * off, a[1] + dx / L * off, ROOF + 0.4, rnd.uniform(4.0, 7.5)))
    C.trees.extend(tp)

# ── Transamerica Pyramid ─────────────────────────────────────────────────────
def transamerica(C):
    if C.era is not None and C.era < 1971: return
    r = outer('transamerica')
    if not r: return
    r = r[0]; cx, cy = centroid(r)
    ang = orient(r)
    fr = Frame(cx, cy, ang)
    u0, u1, v0, v1 = extent(r, fr)
    fr = Frame(cx + 0, cy + 0, ang)
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    fr = Frame(*fr.P(cu, cv)[:2], ang)
    hu, hv = (u1 - u0) / 2 * 0.97, (v1 - v0) / 2 * 0.97
    g = C.tg(cx, cy); K = C.K
    TOP, CAP = 260.0, 213.1
    def plan(z):
        s = max(0.0, 1 - z / TOP); return hu * s, hv * s
    # the pyramid body in storey bands: quartz panels with window strips
    # (dark bands every 3.9 m), up to the spire
    zs = [0.0, 16.0] + [16.0 + 3.93 * k for k in range(1, 60) if 16.0 + 3.93 * k < CAP] + [CAP]
    for k in range(len(zs) - 1):
        za, zb = zs[k], zs[k + 1]
        a, b = plan(za), plan(zb)
        mid = za + (zb - za) * 0.62
        m = plan(mid)
        for (z0, z1, (ha, va), (hb, vb), col, mat) in ((za, mid, a, m, QUARTZ, 'lm_matte'), (mid, zb, m, b, hexc('#3a3e44'), 'lm_steel')):
            ra = [fr.P(ha, va, g + z0), fr.P(-ha, va, g + z0), fr.P(-ha, -va, g + z0), fr.P(ha, -va, g + z0)]
            rb = [fr.P(hb, vb, g + z1), fr.P(-hb, vb, g + z1), fr.P(-hb, -vb, g + z1), fr.P(hb, -vb, g + z1)]
            K.loft(mat, [ra, rb], col, cap_top=False)
    # vertical rhythm: thin proud ribs up each face (the panel joints)
    for side in range(4):
        for k in range(-7, 8):
            t = k / 8.0
            def P_(z):
                h_, v_ = plan(z)
                if side == 0: return fr.P(h_ + 0.12, t * v_, g + z)
                if side == 1: return fr.P(-h_ - 0.12, t * v_, g + z)
                if side == 2: return fr.P(t * h_, v_ + 0.12, g + z)
                return fr.P(t * h_, -v_ - 0.12, g + z)
            K.beam('lm_matte', P_(16.0), P_(CAP - 4), 0.35, 0.25, QUARTZ)
    # the spire: aluminium, from the cap to the top
    a = plan(CAP)
    K.loft('lm_steel', [[fr.P(a[0], a[1], g + CAP), fr.P(-a[0], a[1], g + CAP), fr.P(-a[0], -a[1], g + CAP), fr.P(a[0], -a[1], g + CAP)],
                        [fr.P(0.4, 0.4, g + TOP), fr.P(-0.4, 0.4, g + TOP), fr.P(-0.4, -0.4, g + TOP), fr.P(0.4, -0.4, g + TOP)]], ALU, cap_top=True)
    # the wings: vertical, rising out of the east and west faces from the 29th
    # floor (~ 114 m) to the spire's base
    Z29 = 114.0
    for sgn in (-1, 1):
        hz = plan(Z29)[0]
        wv = min(hv * 0.2, 5.8)
        ring = [fr.P(sgn * (hz * 0.6), -wv)[:2], fr.P(sgn * (hz + 0.2), -wv)[:2], fr.P(sgn * (hz + 0.2), wv)[:2], fr.P(sgn * (hz * 0.6), wv)[:2]]
        K.prism('lm_matte', ring, g + 30.0, g + CAP - 6.0, QUARTZ)
        # the wing's top slopes into the face
        K.loft('lm_matte', [[fr.P(sgn * (hz * 0.6), -wv, g + CAP - 6), fr.P(sgn * (hz + 0.2), -wv, g + CAP - 6), fr.P(sgn * (hz + 0.2), wv, g + CAP - 6), fr.P(sgn * (hz * 0.6), wv, g + CAP - 6)],
                            [fr.P(sgn * plan(CAP)[0], -wv * 0.5, g + CAP + 4), fr.P(sgn * plan(CAP)[0], -wv * 0.5, g + CAP + 4), fr.P(sgn * plan(CAP)[0], wv * 0.5, g + CAP + 4), fr.P(sgn * plan(CAP)[0], wv * 0.5, g + CAP + 4)]], QUARTZ)
    # the base: the pyramid's feet on an arcade of exposed concrete trusses
    for side in range(4):
        for k in range(-3, 4):
            t = k / 3.5
            if side < 2: p0 = fr.P((1 if side == 0 else -1) * hu * 1.0, t * hv, g); p1 = fr.P((1 if side == 0 else -1) * hu * 0.93, t * hv, g + 16)
            else: p0 = fr.P(t * hu, (1 if side == 2 else -1) * hv * 1.0, g); p1 = fr.P(t * hu, (1 if side == 2 else -1) * hv * 0.93, g + 16)
            K.beam('lm_matte', p0, p1, 1.4, 1.4, CONC)

# ── Coit Tower ───────────────────────────────────────────────────────────────
def coit(C):
    if C.era is not None and C.era < 1933: return
    r = outer('coit')
    if not r: return
    r = r[0]; cx, cy = centroid(r)
    ang = orient(r)
    fr = Frame(cx, cy, ang)
    g = C.tg(cx, cy); K = C.K
    CONCRETE = hexc('#ddd5c3')
    # the base: a square pavilion (the mural lobby) round the shaft
    K.box('lm_matte', Frame(cx, cy, ang, g), -11.2, 11.2, -11.2, 11.2, -2.0, 6.0, CONCRETE)
    K.box('lm_matte', Frame(cx, cy, ang, g), -11.6, 11.6, -11.6, 11.6, 6.0, 6.7, CONCRETE)
    # the fluted shaft: 20 flutes, slight taper
    R0, R1, N = 5.65, 5.4, 40
    prof_z = [6.7, 52.0]
    for k in range(N):
        a0 = 2 * math.pi * k / N; a1 = 2 * math.pi * (k + 1) / N
        rr = (R0, R1) if k % 2 == 0 else (R0 - 0.45, R1 - 0.45)
        pa0 = (cx + rr[0] * math.cos(a0), cy + rr[0] * math.sin(a0)); pa1 = (cx + rr[0] * math.cos(a1), cy + rr[0] * math.sin(a1))
        pb0 = (cx + rr[1] * math.cos(a0), cy + rr[1] * math.sin(a0)); pb1 = (cx + rr[1] * math.cos(a1), cy + rr[1] * math.sin(a1))
        K.face('lm_matte', [(*pa0, g + prof_z[0]), (*pa1, g + prof_z[0]), (*pb1, g + prof_z[1]), (*pb0, g + prof_z[1])], CONCRETE)
        # the flute's side walls
        if k % 2 == 0:
            for a in (a0, a1):
                K.face('lm_matte', [(cx + R0 * math.cos(a), cy + R0 * math.sin(a), g + prof_z[0]), (cx + (R0 - 0.45) * math.cos(a), cy + (R0 - 0.45) * math.sin(a), g + prof_z[0]),
                                    (cx + (R1 - 0.45) * math.cos(a), cy + (R1 - 0.45) * math.sin(a), g + prof_z[1]), (cx + R1 * math.cos(a), cy + R1 * math.sin(a), g + prof_z[1])], CONCRETE)
    # the gallery: a band of tall arched openings (dark), then the cornice
    K.lathe('lm_matte', cx, cy, g, [(5.55, 52.0), (5.55, 53.2), (5.25, 53.2)], CONCRETE, n=40, smooth=False, cap=False)
    for k in range(16):
        a0 = 2 * math.pi * (k + 0.18) / 16; a1 = 2 * math.pi * (k + 0.82) / 16
        am = (a0 + a1) / 2
        pts = [(cx + 5.3 * math.cos(a0), cy + 5.3 * math.sin(a0), g + 53.2), (cx + 5.3 * math.cos(a1), cy + 5.3 * math.sin(a1), g + 53.2),
               (cx + 5.3 * math.cos(a1), cy + 5.3 * math.sin(a1), g + 59.0), (cx + 5.3 * math.cos(am), cy + 5.3 * math.sin(am), g + 60.2),
               (cx + 5.3 * math.cos(a0), cy + 5.3 * math.sin(a0), g + 59.0)]
        K.face('lm_steel', pts, hexc('#23252a'))
    K.lathe('lm_matte', cx, cy, g, [(5.25, 53.2), (5.25, 60.8), (5.75, 61.0), (5.75, 62.0), (5.2, 62.2), (5.0, 64.0), (0.0, 64.0)], CONCRETE, n=40, smooth=False)

# ── Ferry Building ───────────────────────────────────────────────────────────
STONE = hexc('#e1ddd3')     # (25/09) Colusa sandstone, painted light grey-white (read khaki on the plaster texture)
STONE_D = hexc('#c8c3b7')
GLAZE = hexc('#26292e')

def arch_panel(K, fr, face_u, sgn, v0, v1, z0, z1, col=GLAZE, mat='lm_steel', proud=0.06, segs=6):
    """a dark arched opening on a wall facing sgn*u (u = face_u): rectangle
    from z0 to z1 with a half-round head on top"""
    u = face_u + sgn * proud; r = (v1 - v0) / 2; vc = (v0 + v1) / 2
    pts = [fr.P(u, v0, z0), fr.P(u, v1, z0)]
    for k in range(segs + 1):
        a = math.pi * k / segs
        pts.append(fr.P(u, vc + r * math.cos(a), z1 + r * math.sin(a)))
    if sgn < 0: pts = pts[::-1]
    K.face(mat, pts, col)

def rect_panel(K, fr, face_u, sgn, v0, v1, z0, z1, col=GLAZE, mat='lm_steel', proud=0.06):
    u = face_u + sgn * proud
    pts = [fr.P(u, v0, z0), fr.P(u, v1, z0), fr.P(u, v1, z1), fr.P(u, v0, z1)]
    if sgn < 0: pts = pts[::-1]
    K.face(mat, pts, col)

def ferry(C):
    if C.era is not None and C.era < 1898: return
    rs = outer('ferry')
    if not rs: return
    r = rs[0]; cx, cy = centroid(r); ang = orient(r)
    fr = Frame(cx, cy, ang)
    g = min(C.tg(*p) for p in r[::5]); g = max(g, 2.0)
    frg = Frame(cx, cy, ang, g)
    K = C.K
    # the long block: the outline to the cornice, the parapet, the roof
    K.prism('pl_stone', r, g - 1.0, g + 13.2, STONE, top=False)
    ring_out = [p for p in r]
    K.prism('pl_stone', ring_out, g + 13.2, g + 14.4, STONE_D, top=False)          # cornice band
    K.face('roof_flat', [(x, y, g + 14.4) for x, y in (r[:-1] if r[0] == r[-1] else r)], hexc('#8d8a84'))
    # the nave's clerestory: a long raised roof with a glass ridge, full length
    for sgn in (-1, 1):
        K.face('roof_flat', [fr.P(sgn * 9.0, -98, g + 14.4), fr.P(sgn * 9.0, 98, g + 14.4), fr.P(sgn * 3.0, 98, g + 20.0), fr.P(sgn * 3.0, -98, g + 20.0)][::(1 if sgn < 0 else -1)], hexc('#7d7a74'))
        K.face('lm_glasshouse', [fr.P(sgn * 3.0, -98, g + 20.0), fr.P(sgn * 3.0, 98, g + 20.0), fr.P(0, 98, g + 21.2), fr.P(0, -98, g + 21.2)][::(1 if sgn < 0 else -1)], (1, 1, 1, 1))
    for vv in (-98.0, 98.0):
        K.face('pl_stone', [fr.P(-9.0, vv, g + 14.4), fr.P(9.0, vv, g + 14.4), fr.P(3.0, vv, g + 20.0), fr.P(0, vv, g + 21.2), fr.P(-3.0, vv, g + 20.0)], STONE)
    # the arcades: arched openings below, windows above, pilasters between
    u0, u1, v0, v1 = extent(r, fr)
    for face_u, sgn, va, vb in ((-22.6, -1, -100.0, -21.5), (-22.6, -1, 23.0, 100.0), (24.8, 1, -100.0, 100.0), (-31.5, -1, -20.5, 22.0)):
        n = max(1, int((vb - va) / 7.4))
        w = (vb - va) / n
        for k in range(n):
            a, b = va + k * w, va + (k + 1) * w
            arch_panel(K, fr, face_u, sgn, a + 1.3, b - 1.3, g + 0.4, g + 5.2)
            rect_panel(K, fr, face_u, sgn, a + 1.6, b - 1.6, g + 7.8, g + 11.6)
            K.box('pl_stone', frg, face_u - 0.4 if sgn < 0 else face_u - 0.1, face_u + 0.1 if sgn < 0 else face_u + 0.4, a - 0.45, a + 0.45, 0.0, 13.2, STONE_D, top=False)
    # THE CLOCK TOWER (after the Giralda), at the head of Market Street: 245 ft
    # (74.7 m) to the finial. Proportions measured on Commons close-ups
    # (refs/ferry c2, c1): a 9.2 m shaft, the 22 ft (6.7 m) clocks nearly filling
    # its faces with their centres at ~31.5 m, then tier on tier above: a band of
    # small windows, a stepped cornice, the tall open colonnade of five bays a
    # side behind its balustrade, a stepped block with urns, a narrower open
    # stage of four bays, a round colonnaded tempietto, its balustrade, a slender
    # lantern, the little dome, the finial and the flagpole.
    tu, tv = -24.0, 0.0
    T = Frame(*fr.P(tu, tv)[:2], ang, g)
    def sq(h, z0, z1, col=STONE, mat='pl_stone', top=True):
        K.box(mat, T, -h, h, -h, h, z0, z1, col, top=top)
    def urns(h, z, s=0.5):
        for (a_, b_) in ((-h, -h), (-h, h), (h, -h), (h, h)):
            p_ = T.P(a_, b_)
            K.lathe('pl_stone', p_[0], p_[1], g + z, [(s * 0.6, 0.0), (s, s * 0.8), (s * 0.4, s * 1.6), (0.0, s * 2.0)], STONE, n=8, smooth=True)
    HS, ZC = 4.6, 31.5
    sq(HS, 0.0, ZC - 4.5, top=False)
    for (a_, b_) in ((-HS - 0.35, -HS + 0.9), (HS - 0.9, HS + 0.35)):                     # corner pilasters
        for (c_, d_) in ((-HS - 0.35, -HS + 0.9), (HS - 0.9, HS + 0.35)):
            K.box('pl_stone', T, a_, b_, c_, d_, 0.0, ZC + 5.7, STONE_D, top=False)
    for zz in (13.6, 20.0):
        sq(HS + 0.2, zz, zz + 0.5, STONE_D)
    for side in range(4):                                                     # slit windows up the shaft
        for zz in (15.0, 21.5):
            for off in (-1.3, 1.3):
                _tower_panel(K, T, side, HS, off - 0.4, off + 0.4, zz, zz + 3.2)
    sq(HS, ZC - 4.5, ZC + 5.7, top=False)                                    # the clock stage
    for side in range(4):
        _clock(K, T, side, HS + 0.1, ZC, 3.35)
    sq(HS + 0.45, ZC + 5.7, ZC + 6.3, STONE_D)
    sq(HS, ZC + 6.3, ZC + 9.4, top=False)                                    # the band of small windows
    for side in range(4):
        for off in (-3.0, -1.5, 0.0, 1.5, 3.0):
            _tower_panel(K, T, side, HS, off - 0.35, off + 0.35, ZC + 7.3, ZC + 8.3)
    sq(HS + 0.35, ZC + 9.4, ZC + 10.4, STONE_D); sq(HS + 0.65, ZC + 10.4, ZC + 11.9, STONE)    # the stepped cornice
    _sq_arcade(K, T, HS, 0.55, ZC + 11.9, ZC + 18.6, ZC + 20.0, 5, 0.66, STONE, core=2.2)   # the great open colonnade
    _balustrade(K, T, HS + 0.25, ZC + 11.9, 1.1)
    sq(HS + 0.6, ZC + 20.0, ZC + 21.0, STONE_D)
    urns(HS + 0.3, ZC + 21.0, 0.55)
    sq(HS - 0.4, ZC + 21.0, ZC + 23.2, STONE); sq(HS - 1.0, ZC + 23.2, ZC + 25.0, STONE)        # the stepped block
    _sq_arcade(K, T, 3.0, 0.45, ZC + 25.0, ZC + 29.6, ZC + 30.5, 4, 0.62, STONE, core=1.2)   # the narrower open stage
    sq(3.4, ZC + 30.5, ZC + 31.2, STONE_D); urns(3.1, ZC + 31.2, 0.4)
    for k in range(8):                                                        # the tempietto: a ring of columns round a core
        a_ = 2 * math.pi * k / 8 + math.pi / 8
        px, py = T.x + 2.1 * math.cos(a_), T.y + 2.1 * math.sin(a_)
        K.cyl('pl_stone', (px, py, g + ZC + 31.2), (px, py, g + ZC + 35.3), 0.2, STONE, n=6, smooth=True)
    K.lathe('pl_stone', T.x, T.y, g, [(1.1, ZC + 31.2), (1.1, ZC + 35.3)], STONE_D, n=12, smooth=True, cap=False)
    K.lathe('pl_stone', T.x, T.y, g, [(2.45, ZC + 35.3), (2.45, ZC + 36.0), (2.2, ZC + 36.1)], STONE_D, n=16, smooth=False, cap=False)
    for k in range(20):                                                       # its balustrade
        a_ = 2 * math.pi * k / 20
        K.cyl('pl_stone', (T.x + 2.3 * math.cos(a_), T.y + 2.3 * math.sin(a_), g + ZC + 36.1), (T.x + 2.3 * math.cos(a_), T.y + 2.3 * math.sin(a_), g + ZC + 36.8), 0.07, STONE, n=4, smooth=False)
    K.lathe('pl_stone', T.x, T.y, g, [(1.45, ZC + 36.1), (1.45, ZC + 38.8), (1.6, ZC + 38.9), (1.6, ZC + 39.2)], STONE, n=12, smooth=False, cap=False)    # the lantern
    for k in range(6):
        a_ = 2 * math.pi * (k + 0.5) / 6
        K.face('lm_steel', [(T.x + 1.47 * math.cos(a_ - 0.25), T.y + 1.47 * math.sin(a_ - 0.25), g + ZC + 36.6), (T.x + 1.47 * math.cos(a_ + 0.25), T.y + 1.47 * math.sin(a_ + 0.25), g + ZC + 36.6),
                            (T.x + 1.47 * math.cos(a_ + 0.25), T.y + 1.47 * math.sin(a_ + 0.25), g + ZC + 38.4), (T.x + 1.47 * math.cos(a_ - 0.25), T.y + 1.47 * math.sin(a_ - 0.25), g + ZC + 38.4)], GLAZE)
    K.lathe('pl_stone', T.x, T.y, g, [(1.5, ZC + 39.2), (1.3, ZC + 40.0), (0.8, ZC + 40.7), (0.3, ZC + 41.0), (0.15, ZC + 43.2), (0.0, ZC + 43.2)], STONE, n=12)
    K.cyl('lm_paint', (T.x, T.y, g + ZC + 43.2), (T.x, T.y, g + ZC + 51.0), 0.08, hexc('#d9d9d6'), n=4, smooth=False)

def _sq_arcade(K, T, h, t, z0, zs, zt, n, frac, col, core=0.0):
    """an open square loggia of half-size h, walls t thick: n round-headed arches a
    side (frac of each bay), spring at zs, walls to zt; a solid core of half-size `core`"""
    for side in range(4):
        F = Frame(T.x, T.y, math.atan2(T.su, T.cu) + side * math.pi / 2, T.z)
        bay = 2 * h / n
        for i in range(n):
            b0 = -h + i * bay; w = bay * frac; o0 = b0 + (bay - w) / 2; o1 = o0 + w
            K.box('pl_stone', F, b0, o0, -h, -h + t, z0, zt, col, top=False)
            K.box('pl_stone', F, o1, b0 + bay, -h, -h + t, z0, zt, col, top=False)
            m = 5
            for k in range(m):
                t0, t1 = o0 + w * k / m, o0 + w * (k + 1) / m; tc = (t0 + t1) / 2 - (o0 + w / 2)
                zc = zs + math.sqrt(max(0.0, (w / 2) ** 2 - tc ** 2))
                K.box('pl_stone', F, t0, t1, -h, -h + t, zc, zt, col, top=False, bottom=True)
    K.box('pl_stone', T, -h, h, -h, h, zt - 0.02, zt, col)                  # the roof over it
    if core > 0: K.box('pl_stone', T, -core, core, -core, core, z0, zt, STONE_D, top=False)

def _balustrade(K, T, h, z, ht):
    for side in range(4):
        F = Frame(T.x, T.y, math.atan2(T.su, T.cu) + side * math.pi / 2, T.z)
        K.box('pl_stone', F, -h, h, -h - 0.1, -h + 0.25, z + ht - 0.18, z + ht, STONE_D, top=True)
        for u in np.arange(-h + 0.3, h, 0.42):
            K.box('pl_stone', F, u - 0.07, u + 0.07, -h - 0.02, -h + 0.12, z, z + ht - 0.18, STONE, top=False)

def _tower_panel(K, T, side, h, a, b, z0, z1, arch=False):
    """a dark opening on one face (0..3) of a square tower of half-size h"""
    ang = side * math.pi / 2
    ca, sa = math.cos(ang), math.sin(ang)
    def P(t, z):                                   # t along the face, the face at distance h
        u = h + 0.06; return (T.x + (u * ca - t * sa) * T.cu - (u * sa + t * ca) * T.su,
                              T.y + (u * ca - t * sa) * T.su + (u * sa + t * ca) * T.cu, T.z + z)
    pts = [P(a, z0), P(b, z0), P(b, z1)]
    if arch:
        r = (b - a) / 2; c = (a + b) / 2
        pts += [P(c + r * math.cos(math.pi * k / 5), z1 + r * math.sin(math.pi * k / 5)) for k in range(1, 5)]
    pts.append(P(a, z1))
    K.face('lm_steel', pts, GLAZE)

def _clock(K, T, side, h, zc, rad):
    ang = side * math.pi / 2
    ca, sa = math.cos(ang), math.sin(ang)
    def P(t, z, d):
        u = h + d; return (T.x + (u * ca - t * sa) * T.cu - (u * sa + t * ca) * T.su,
                           T.y + (u * ca - t * sa) * T.su + (u * sa + t * ca) * T.cu, T.z + z)
    n = 24
    K.face('lm_paint', [P(rad * 1.12 * math.cos(2 * math.pi * k / n), zc + rad * 1.12 * math.sin(2 * math.pi * k / n), 0.1) for k in range(n)], hexc('#34322e'))   # the dark bronze ring (a white dial on the white tower vanished)
    K.face('lm_paint', [P(rad * 0.93 * math.cos(2 * math.pi * k / n), zc + rad * 0.93 * math.sin(2 * math.pi * k / n), 0.16) for k in range(n)], hexc('#f1ede2'))
    # the hands at ten past ten... the hour a golden-hour frame is taken: 5:40
    for (length, angle, w) in ((rad * 0.62, math.radians(90 - 170), 0.22), (rad * 0.88, math.radians(90 - 240), 0.14)):
        e = (length * math.cos(angle), length * math.sin(angle))
        nx, ny = -math.sin(angle) * w, math.cos(angle) * w
        K.face('lm_paint', [P(-nx, zc - ny, 0.2), P(nx, zc + ny, 0.2), P(e[0] + nx, zc + e[1] + ny, 0.2), P(e[0] - nx, zc + e[1] - ny, 0.2)], hexc('#1b1b1b'))

# ── City Hall ────────────────────────────────────────────────────────────────
GRANITE = hexc('#dfdcd4')     # (25/09) light Sierra granite on dressed stone (read khaki on the plaster texture)
GRANITE_D = hexc('#c6c2b8')
DOME = hexc('#7a7870')   # (25/09) the dome reads lead-grey with its gilded ribs (aerials refs/cityhall); the copper-green is the roof's mansard band

def _clean(r):
    return r[:-1] if len(r) > 1 and r[0] == r[-1] else r

def _sa(r):
    return sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))

def _mansard(K, r, z, d, h, col=None):
    """a sloped copper band from a ring (ccw: inward) d metres in and h up (mitred corners)"""
    n = len(r); inn = []
    for i in range(n):
        (x0, y0), (x1, y1), (x2, y2) = r[i - 1], r[i], r[(i + 1) % n]
        la = math.hypot(x1 - x0, y1 - y0) or 1; lb = math.hypot(x2 - x1, y2 - y1) or 1
        na = (-(y1 - y0) / la, (x1 - x0) / la); nb = (-(y2 - y1) / lb, (x2 - x1) / lb)
        bx, by = na[0] + nb[0], na[1] + nb[1]; lbis = math.hypot(bx, by) or 1
        k = d / max((na[0] * bx + na[1] * by) / lbis, 0.4)
        inn.append((x1 + bx / lbis * k, y1 + by / lbis * k))
    for i in range(n):
        a, b = r[i], r[(i + 1) % n]; ai, bi = inn[i], inn[(i + 1) % n]
        K.face('lm_matte', [(a[0], a[1], z), (b[0], b[1], z), (bi[0], bi[1], z + h), (ai[0], ai[1], z + h)], col or hexc('#a6c2bf'))   # light blue-grey copper (top-down aerial)

def cityhall(C):
    """SAN FRANCISCO CITY HALL (Bakewell & Brown, 1915): Beaux-Arts, Sierra
    granite; the dome 307 ft 6 in (93.7 m) to the lantern's top, on a
    colonnaded drum over the rotunda between two light courts; Doric
    colonnades on the long fronts, porticoes with pediments on Polk Street
    (east) and Van Ness (west), the dome's ribs and lantern gilded."""
    if C.era is not None and C.era < 1913: return
    f = FP().get('cityhall')
    if not f: return
    r = _clean([tuple(p) for p in f['outer'][0]])
    # the two light courts; OSM's other inner rings are slivers a metre wide
    # (2- and 4-point) that broke the roof's triangulation: most of the roof
    # went missing and the ground showed inside the walls (2026-09-24)
    def _area(q): return 0.5 * abs(sum(q[i][0] * q[(i + 1) % len(q)][1] - q[(i + 1) % len(q)][0] * q[i][1] for i in range(len(q))))
    holes = []
    for h in f['inner']:
        h = _clean([tuple(p) for p in h])
        if len(h) >= 3 and _area(h) > 60.0: holes.append(h)
    cx, cy = centroid(r); ang = orient(r)
    fr = Frame(cx, cy, ang)
    g = min(C.tg(*p) for p in r[::6])
    frg = Frame(cx, cy, ang, g)
    K = C.K
    ROOF = 23.0
    K.prism('pl_stone', r, g - 1.0, g + 7.0, GRANITE_D, top=False)              # rusticated base
    K.prism('pl_stone', r, g + 7.0, g + ROOF, GRANITE, top=False)
    K.prism('pl_stone', r, g + ROOF, g + ROOF + 1.2, GRANITE_D, top=False)       # entablature band
    K.prism('pl_stone', r, g + ROOF + 1.2, g + 26.5, GRANITE, top=False)         # attic
    K.face_holes('roof_flat', r, holes, g + 26.5, hexc('#a19d94'))
    for h in holes:                                                             # the light courts' walls
        K.prism('pl_stone', h[::-1], g + 7.0, g + 26.5, GRANITE_D, top=False)
        K.face('path', [(p[0], p[1], g + 7.0) for p in h], (1, 1, 1, 1))
        # (25/09, aerials refs/cityhall) the courts are roofed in green glass skylights
        K.face('lm_matte', [(p[0], p[1], g + 27.2) for p in (h if _sa(h) > 0 else h[::-1])], hexc('#7fae9f'))       # green-tinted glass skylight, just over the parapet
        _mansard(K, h[::-1] if _sa(h) > 0 else h, g + 26.5, 2.5, 1.2)
    # the copper-green mansard band all round the roof's edge (the aerials' turquoise frame)
    _mansard(K, r if _sa(r) > 0 else r[::-1], g + 26.5, 6.5, 2.4)
    # windows on every face of the outline (every edge over 5 m), four rows
    # a bay of 4.6 m; engaged columns and a proud architrave on the long
    # fronts (Polk and Van Ness)
    sa = sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))
    for i in range(len(r)):
        (x0_, y0_), (x1_, y1_) = r[i], r[(i + 1) % len(r)]
        Le = math.hypot(x1_ - x0_, y1_ - y0_)
        if Le < 5.0: continue
        dx, dy = (x1_ - x0_) / Le, (y1_ - y0_) / Le
        nx_, ny_ = (dy, -dx) if sa > 0 else (-dy, dx)                     # outward
        nb = max(1, int(Le / 4.6)); w = Le / nb
        for k in range(nb):
            a, b = k * w, (k + 1) * w
            # windows ~ 1.8 m wide in a 4.6 m bay: the granite reads, not the glass
            for (z0, z1, gw) in ((2.2, 4.8, 1.6), (8.8, 13.2, 1.9), (15.2, 19.2, 1.9), (24.4, 25.6, 1.4)):
                m_ = max(0.4, (b - a - gw) / 2)
                if b - a - 2 * m_ < 0.8: continue
                pa = (x0_ + dx * (a + m_) + nx_ * 0.06, y0_ + dy * (a + m_) + ny_ * 0.06)
                pb = (x0_ + dx * (b - m_) + nx_ * 0.06, y0_ + dy * (b - m_) + ny_ * 0.06)
                K.face('lm_steel', [(pa[0], pa[1], g + z0), (pb[0], pb[1], g + z0), (pb[0], pb[1], g + z1), (pa[0], pa[1], g + z1)], GLAZE)
    fronts = [(-42.6, -1, -47.5, 47.5), (43.5, 1, -47.5, 47.5)]
    for face_u, sgn, va, vb in fronts:
        n = int((vb - va) / 4.6); w = (vb - va) / n
        for k in range(n):
            a = va + k * w
            cu = face_u + sgn * 1.6
            p0 = fr.P(cu, a, g + 7.0); p1 = fr.P(cu, a, g + ROOF)
            K.cyl('pl_stone', p0, p1, 0.75, GRANITE, n=8)
        K.box('pl_stone', frg, min(face_u, face_u + sgn * 2.4), max(face_u, face_u + sgn * 2.4), va, vb, ROOF - 0.3, ROOF + 1.2, GRANITE_D)
    # the porticoes: six columns, a pediment, on Polk (east) and Van Ness (west)
    for (face_u, sgn, va, vb) in ((47.4, 1, -12.7, 8.1), (-50.5, -1, -12.4, 12.2)):
        vc = (va + vb) / 2; half = (vb - va) / 2 + 1.5
        for k in range(6):
            v = vc - half + 1.5 + (2 * half - 3.0) * k / 5
            K.cyl('pl_stone', fr.P(face_u + sgn * 2.2, v, g + 7.0), fr.P(face_u + sgn * 2.2, v, g + ROOF), 0.85, GRANITE, n=10)
        K.box('pl_stone', frg, min(face_u - sgn * 1.0, face_u + sgn * 3.4), max(face_u - sgn * 1.0, face_u + sgn * 3.4), vc - half, vc + half, ROOF, ROOF + 2.4, GRANITE_D)
        # the pediment: a triangular prism over the portico
        ua, ub = face_u - sgn * 1.0, face_u + sgn * 3.4
        pts = lambda u: [fr.P(u, vc - half, g + ROOF + 2.4), fr.P(u, vc + half, g + ROOF + 2.4), fr.P(u, vc, g + ROOF + 7.6)]
        A, B = pts(ua), pts(ub)
        K.face('pl_stone', B if sgn > 0 else B[::-1], GRANITE); K.face('pl_stone', A[::-1] if sgn > 0 else A, GRANITE)
        K.face('roof_flat', [A[0], A[2], B[2], B[0]] if sgn > 0 else [B[0], B[2], A[2], A[0]], hexc('#8a877f'))
        K.face('roof_flat', [A[2], A[1], B[1], B[2]] if sgn > 0 else [B[2], B[1], A[1], A[2]], hexc('#8a877f'))
    # the rotunda block under the dome, then the drum, the dome, the lantern
    K.box('pl_stone', frg, -19.0, 19.0, -19.0, 19.0, 26.5, 33.0, GRANITE)
    K.box('pl_stone', frg, -19.6, 19.6, -19.6, 19.6, 33.0, 34.2, GRANITE_D)
    X0, Y0 = cx, cy
    K.lathe('pl_stone', X0, Y0, g, [(17.6, 34.2), (17.6, 36.0), (15.6, 36.0), (15.6, 53.0), (17.9, 53.0), (17.9, 56.0), (16.0, 56.0), (16.0, 60.0), (15.2, 60.0)], GRANITE, n=48, smooth=False, cap=False)
    for k in range(32):
        a = 2 * math.pi * k / 32
        K.cyl('pl_stone', (X0 + 16.9 * math.cos(a), Y0 + 16.9 * math.sin(a), g + 36.0), (X0 + 16.9 * math.cos(a), Y0 + 16.9 * math.sin(a), g + 53.0), 0.62, GRANITE, n=8)
    for k in range(16):                                                         # drum windows between pairs
        a0 = 2 * math.pi * (k + 0.3) / 16; a1 = 2 * math.pi * (k + 0.7) / 16
        pts = [(X0 + 15.66 * math.cos(a0), Y0 + 15.66 * math.sin(a0), g + 40.0), (X0 + 15.66 * math.cos(a1), Y0 + 15.66 * math.sin(a1), g + 40.0),
               (X0 + 15.66 * math.cos(a1), Y0 + 15.66 * math.sin(a1), g + 50.0), (X0 + 15.66 * math.cos(a0), Y0 + 15.66 * math.sin(a0), g + 50.0)]
        K.face('lm_steel', pts, GLAZE)
    prof = []
    for k in range(13):
        t = k / 12; a = t * math.pi / 2
        prof.append((15.2 * math.cos(a) * (1 - 0.78 * t ** 3) + 3.3 * t ** 3, 60.0 + 20.0 * math.sin(a)))
    prof[-1] = (3.3, 80.0)
    K.lathe('lm_matte', X0, Y0, g, prof, DOME, n=48, cap=False)
    for k in range(16):                                                         # gilded ribs
        a = 2 * math.pi * k / 16; ca, sa = math.cos(a), math.sin(a)
        pts = [(X0 + (rr + 0.12) * ca, Y0 + (rr + 0.12) * sa, g + z) for rr, z in prof]
        for j in range(len(pts) - 1):
            K.beam('lm_gold', pts[j], pts[j + 1], 0.45, 0.3, (1, 1, 1, 1), up=(ca, sa, 0))
    K.lathe('pl_stone', X0, Y0, g, [(3.6, 80.0), (3.6, 81.0), (3.0, 81.0)], GRANITE, n=16, smooth=False, cap=False)
    for k in range(8):
        a = 2 * math.pi * k / 8
        K.cyl('pl_stone', (X0 + 3.0 * math.cos(a), Y0 + 3.0 * math.sin(a), g + 81.0), (X0 + 3.0 * math.cos(a), Y0 + 3.0 * math.sin(a), g + 86.0), 0.28, GRANITE, n=6)
    K.lathe('pl_stone', X0, Y0, g, [(2.2, 81.0), (2.2, 86.0), (3.4, 86.0), (3.4, 87.0)], GRANITE, n=16, smooth=False, cap=False)
    K.lathe('lm_gold', X0, Y0, g, [(3.0, 87.0), (2.6, 88.4), (1.6, 89.6), (0.5, 90.2), (0.35, 91.0), (0.55, 91.6), (0.12, 93.7), (0.0, 93.7)], (1, 1, 1, 1), n=16)

# ── Palace of Fine Arts ──────────────────────────────────────────────────────
POFA_STONE = hexc('#c9a77e')     # (25/09) warm ochre-tan cast stone (aerials refs/pofa; was pale cream)
POFA_STONE_D = hexc('#b08c63')
POFA_DOME = hexc('#626a64')      # the rotunda dome: weathered dark grey-green (was salmon)

def _fit_circle(pts):
    A = np.array([[2 * x, 2 * y, 1.0] for x, y in pts]); b = np.array([x * x + y * y for x, y in pts])
    (a, c, k), *_ = np.linalg.lstsq(A, b, rcond=None)
    return a, c, math.sqrt(max(k + a * a + c * c, 1.0))

def pofa(C):
    """PALACE OF FINE ARTS (Bernard Maybeck, 1915; recast in concrete
    1964-67): the open rotunda, 162 ft (49 m), eight arched sides between
    piers faced with paired Corinthian columns, an entablature, a drum with
    relief panels and a dome in warm ochre; its colonnades curve round the
    lagoon, paired columns under an entablature carrying the planter boxes
    (the weeping women's boxes) at intervals."""
    if C.era is not None and C.era < 1915: return
    rs = outer('pofa')
    if not rs: return
    r = rs[0]; cx, cy = centroid(r)
    g = C.tg(cx, cy); K = C.K
    ang0 = orient(r) + math.pi / 8
    def oct_ring(rad, z, rot=ang0):
        return [(cx + rad * math.cos(rot + 2 * math.pi * k / 8), cy + rad * math.sin(rot + 2 * math.pi * k / 8), z) for k in range(8)]
    # podium: an octagon with steps
    for (rad, z0, z1) in ((27.0, -1.0, 0.8), (25.5, 0.8, 1.6)):
        K.prism('pl_stone', [p[:2] for p in oct_ring(rad, 0)], g + z0, g + z1, POFA_STONE_D)
    # eight piers at the corners, paired columns before each, arches between
    for k in range(8):
        a = ang0 + 2 * math.pi * k / 8
        ca, sa = math.cos(a), math.sin(a)
        pc = (cx + 19.0 * ca, cy + 19.0 * sa)
        pf = Frame(pc[0], pc[1], a, g)
        K.box('pl_stone', pf, -3.2, 3.2, -2.6, 2.6, 1.6, 27.0, POFA_STONE, top=False)
        for dv in (-1.6, 1.6):                                                  # paired columns, out front
            p = pf.P(5.2, dv, 1.6); q = pf.P(5.2, dv, 21.8)
            K.cyl('pl_stone', p, q, 0.95, hexc('#a4594a'), n=10, r1=0.82)   # the rotunda's columns are red (Commons aerials, refs/pofa)
            K.box('pl_stone', Frame(q[0], q[1], a, q[2]), -1.25, 1.25, -1.25, 1.25, 0.0, 1.6, POFA_STONE_D)   # capital
        K.box('pl_stone', pf, 3.2, 6.6, -3.2, 3.2, 23.4, 27.0, POFA_STONE_D)    # entablature block over the pair
        # a statue group standing on it (a simple mass)
        K.box('pl_stone', pf, 3.8, 6.0, -1.6, 1.6, 27.0, 30.4, POFA_STONE)
    # the arch spandrels: between each two piers, a wall over a round arch
    for k in range(8):
        a0 = ang0 + 2 * math.pi * k / 8; a1 = ang0 + 2 * math.pi * (k + 1) / 8
        p0 = (cx + 19.0 * math.cos(a0), cy + 19.0 * math.sin(a0)); p1 = (cx + 19.0 * math.cos(a1), cy + 19.0 * math.sin(a1))
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1]); d = ((p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L)
        am = (a0 + a1) / 2; nrm = (math.cos(am), math.sin(am))
        span = L - 5.2; rr = span / 2; zspring = 14.0
        for side in (1.3, -1.3):
            pts = []
            base = lambda t, z: (p0[0] + d[0] * t + nrm[0] * side, p0[1] + d[1] * t + nrm[1] * side, g + z)
            pts.append(base(2.6, 27.0)); pts.append(base(2.6, zspring))
            for j in range(1, 12):
                th = math.pi - math.pi * j / 12
                pts.append(base(L / 2 + rr * math.cos(th), zspring + rr * math.sin(th)))
            pts.append(base(L - 2.6, zspring)); pts.append(base(L - 2.6, 27.0))
            K.face('pl_stone', pts if side > 0 else pts[::-1], POFA_STONE)
    # the ring over the piers, the drum, the dome
    K.lathe('pl_stone', cx, cy, g, [(23.0, 23.4), (23.0, 27.0), (21.0, 27.0), (21.0, 28.2), (17.8, 28.2), (17.8, 35.0), (18.6, 35.0), (18.6, 36.0), (17.2, 36.0)],
            POFA_STONE, n=8, smooth=False, cap=False, ang0=ang0)
    for k in range(8):                                                          # relief panels on the drum
        a = ang0 + 2 * math.pi * (k + 0.5) / 8
        pf = Frame(cx + 17.0 * math.cos(a), cy + 17.0 * math.sin(a), a, g)
        K.box('pl_stone', pf, 0.0, 0.5, -4.2, 4.2, 29.5, 33.8, POFA_STONE_D)
    prof = []
    for j in range(11):
        t = j / 10; th = t * math.pi / 2
        prof.append((17.2 * math.cos(th) * (1 - 0.05 * t), 36.0 + 11.2 * math.sin(th)))
    prof[-1] = (2.2, 47.2)
    K.lathe('lm_matte', cx, cy, g, prof + [(1.4, 47.8), (0.0, 49.0)], POFA_DOME, n=40)
    for k in range(16):                                                         # the dome's ribs
        a = ang0 + 2 * math.pi * k / 16; ca, sa = math.cos(a), math.sin(a)
        pts = [(cx + (rr_ + 0.15) * ca, cy + (rr_ + 0.15) * sa, g + z) for rr_, z in prof]
        for j in range(len(pts) - 1):
            K.beam('lm_matte', pts[j], pts[j + 1], 0.55, 0.35, POFA_STONE_D, up=(ca, sa, 0))

def _fit_circle_geo(P):
    """least-squares circle through points (Kasa, then Gauss-Newton on the
    geometric distance): (cx, cy, R)"""
    P = np.asarray(P, float); x, y = P[:, 0], P[:, 1]
    A = np.c_[2 * x, 2 * y, np.ones(len(x))]; b = x * x + y * y
    (a, c, k), *_ = np.linalg.lstsq(A, b, rcond=None); R = math.sqrt(max(k + a * a + c * c, 1.0))
    for _ in range(60):
        d = np.maximum(np.hypot(x - a, y - c), 1e-6)
        J = np.c_[-(x - a) / d, -(y - c) / d, -np.ones(len(x))]
        dp, *_ = np.linalg.lstsq(J, -(d - R), rcond=None)
        a, c, R = a + dp[0], c + dp[1], R + dp[2]
        if abs(dp).max() < 1e-4: break
    return float(a), float(c), float(R)

def pofa_colonnade(C):
    """the two curved peristyles round the lagoon's west side: paired rows of
    columns under an entablature, the planter boxes (the weeping women's)
    every third bay, a pavilion at each end. The two arms are arcs of ONE
    circle (centre in the lagoon, ~101 m): fitted on both DataSF outlines
    together — fitted one by one, the jagged outlines gave 34 m circles and
    the planter boxes grew into 50 m spokes (2026-09-24)."""
    if C.era is not None and C.era < 1915: return
    f = FP().get('pofa_colonnade')
    if not f: return
    K = C.K
    arms, pav = [], []
    for d_ in f['datasf']:
        ring = [tuple(p) for p in d_['ring']]
        xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
        (pav if max(max(xs) - min(xs), max(ys) - min(ys)) < 25 else arms).append(ring)
    for ring in pav:
        # an end pavilion of the colonnade: a pier block with its box on top
        cx, cy = centroid(ring); g = C.tg(cx, cy)
        K.prism('pl_stone', ring, g - 0.5, g + 15.5, POFA_STONE)
        K.prism('pl_stone', ring, g + 15.5, g + 16.5, POFA_STONE_D)
    if not arms: return
    ox, oy, _R = _fit_circle_geo([p for r in arms for p in r])
    for ring in arms:
        P = np.asarray(ring, float)
        rads = np.hypot(P[:, 0] - ox, P[:, 1] - oy)
        angs = np.arctan2(P[:, 1] - oy, P[:, 0] - ox)
        a_ref = float(np.median(angs))
        un = (angs - a_ref + math.pi) % (2 * math.pi) - math.pi
        a0, a1 = a_ref + float(un.min()), a_ref + float(un.max())
        rm = float(np.median(rads)); rows = (rm - 5.3, rm + 5.3)
        n = max(2, int((a1 - a0) * rm / 3.3))
        for i in range(n + 1):
            a = a0 + (a1 - a0) * i / n
            for rr in rows:
                x, y = ox + rr * math.cos(a), oy + rr * math.sin(a); g = C.tg(x, y)
                K.cyl('pl_stone', (x, y, g - 0.3), (x, y, g + 12.6), 0.62, POFA_STONE, n=8, r1=0.54)
                K.box('pl_stone', Frame(x, y, a, g + 12.6), -0.85, 0.85, -0.85, 0.85, 0.0, 1.0, POFA_STONE_D)
        # the entablatures (one per row) and, every third bay, a planter box
        for rr in rows:
            for i in range(n):
                aa, ab = a0 + (a1 - a0) * i / n, a0 + (a1 - a0) * (i + 1) / n
                pa = (ox + rr * math.cos(aa), oy + rr * math.sin(aa)); pb = (ox + rr * math.cos(ab), oy + rr * math.sin(ab))
                ga = C.tg(*pa)
                K.beam('concrete', (pa[0], pa[1], ga + 14.5), (pb[0], pb[1], ga + 14.5), 1.6, 2.6, POFA_STONE, up=(0, 0, 1))
        for i in range(1, n, 3):
            a = a0 + (a1 - a0) * i / n
            x, y = ox + rm * math.cos(a), oy + rm * math.sin(a); g = C.tg(x, y)
            fb = Frame(x, y, a, g)
            half = (rows[1] - rows[0]) / 2 + 1.0
            K.box('pl_stone', fb, -half, half, -2.6, 2.6, 15.8, 19.4, POFA_STONE)
            K.box('pl_stone', fb, -half - 0.3, half + 0.3, -2.9, 2.9, 19.4, 19.9, POFA_STONE_D)

# ── Sutro Tower ──────────────────────────────────────────────────────────────
SUTRO_C = (-1306.8, -529.5)
SUTRO_RED = hexc('#c4462b')
SUTRO_WHITE = hexc('#eae7e1')

def sutro(C):
    """SUTRO TOWER (1973): a three-legged steel lattice mast, 977 ft (297.8 m;
    FAA obstacle 06-000120) on the shoulder of Mount Sutro (3DEP 254.9 m).
    The DataSF ring gives the three legs' feet (at 60/180/300 deg, 33 m out);
    the legs lean in to a waist, carry two triangular platforms and a top
    crossarm, and end in three antenna masts; painted in bands of
    international orange and white."""
    if C.era is not None and C.era < 1972: return
    cx, cy = SUTRO_C
    g = C.tg(cx, cy); K = C.K
    TOP = 297.8
    angs = [math.radians(a) for a in (60.0, 180.0, 300.0)]
    # leg radius from the centre along the height (feet, platforms, waist, crossarm, masts)
    RZ = [(0.0, 31.5), (92.0, 19.5), (165.0, 11.5), (230.0, 12.5), (256.0, 17.5), (TOP, 17.5)]
    def rad(z):
        for (za, ra), (zb, rb) in zip(RZ, RZ[1:]):
            if z <= zb: return ra + (rb - ra) * (z - za) / (zb - za)
        return RZ[-1][1]
    def leg(a, z): r = rad(z); return (cx + r * math.cos(a), cy + r * math.sin(a), g + z)
    band = TOP / 14.0
    def col(z): return SUTRO_RED if int(z / band) % 2 == 0 else SUTRO_WHITE
    zs = [k * 6.0 for k in range(int(256 / 6.0) + 1)] + [256.0]
    for a in angs:
        for k in range(len(zs) - 1):
            za, zb = zs[k], zs[k + 1]
            w = 2.6 - 1.2 * (za / 256.0)
            K.beam('lm_paint', leg(a, za), leg(a, zb), w, w, col((za + zb) / 2), up=(math.cos(a), math.sin(a), 0))
        # the mast above the crossarm
        K.cyl('lm_paint', leg(a, 256.0), leg(a, 280.0), 0.9, SUTRO_RED, n=6, smooth=False)
        K.cyl('lm_paint', leg(a, 280.0), leg(a, TOP), 0.5, SUTRO_WHITE, n=6, smooth=False)
    # the lattice between the legs: a horizontal and an X in every face every ~18 m
    zl = [k * 18.0 for k in range(1, 15) if k * 18.0 < 250]
    for i in range(3):
        a, b = angs[i], angs[(i + 1) % 3]
        prev = 0.0
        for z in zl:
            K.beam('lm_paint', leg(a, z), leg(b, z), 0.7, 0.7, col(z))
            K.beam('lm_paint', leg(a, prev), leg(b, z), 0.45, 0.45, col(z))
            K.beam('lm_paint', leg(b, prev), leg(a, z), 0.45, 0.45, col(z))
            prev = z
    # platforms: triangular decks with a rail, and the top crossarm
    for (z0, z1) in ((92.0, 97.5), (162.0, 167.0), (254.0, 259.5)):
        tri0 = [leg(a, z0) for a in angs]; tri1 = [leg(a, z1) for a in angs]
        for q in (tri0, tri1):
            ext = [(cx + (p[0] - cx) * 1.12, cy + (p[1] - cy) * 1.12, p[2]) for p in q]
            K.face('lm_paint', ext, SUTRO_RED)
            K.face('lm_paint', ext[::-1], SUTRO_RED)
        for i in range(3):
            p0, p1 = tri1[i], tri1[(i + 1) % 3]
            e0 = (cx + (p0[0] - cx) * 1.12, cy + (p0[1] - cy) * 1.12); e1 = (cx + (p1[0] - cx) * 1.12, cy + (p1[1] - cy) * 1.12)
            K.face('lm_paint', [(e0[0], e0[1], g + z0), (e1[0], e1[1], g + z0), (e1[0], e1[1], g + z1), (e0[0], e0[1], g + z1)], SUTRO_WHITE)
    # footings
    for a in angs:
        p = leg(a, 0.0)
        K.box('concrete', Frame(p[0], p[1], a, g), -4.0, 4.0, -4.0, 4.0, -2.0, 1.5, hexc('#b9b3a6'))

# ── Alcatraz ─────────────────────────────────────────────────────────────────
ALC_WALL = hexc('#d9d2c1')
ALC_WALL_D = hexc('#b8ae99')
ALC_ROOF = hexc('#8b8880')

def alcatraz(C):
    """ALCATRAZ: the island's own relief from 3DEP (terrain_hq); the
    buildings on their OpenStreetMap outlines at the heights the National
    Park Service gives (the main cellhouse 1912, the 1909 lighthouse 84 ft,
    the 1940 water tower, Building 64 by the dock, the powerhouse and its
    chimney); the warden's house and the officers' club roofless since the
    1970 fire. Federal prison 1934-63; the military prison from 1859."""
    f = FP().get('alcatraz')
    if not f: return
    K = C.K; era = C.era
    for b in f['buildings']:
        r = [tuple(p) for p in b['ring']]
        r = r[:-1] if r[0] == r[-1] else r
        if len(r) < 3: continue
        cx, cy = centroid(r)
        g = min(C.tg(*p) for p in r)
        h, kind = b['h'], b['kind']
        if kind == 'lighthouse':
            if era is not None and era < 1909: continue
            K.lathe('lm_matte', cx, cy, g - 1, [(3.2, 0), (3.2, 2.0), (2.6, 2.4), (2.2, h - 5.5), (2.9, h - 5.3), (2.9, h - 4.7), (1.7, h - 4.7)], ALC_WALL, n=8, smooth=False, cap=False)
            K.lathe('lm_glasshouse', cx, cy, g - 1, [(1.6, h - 4.7), (1.6, h - 1.8)], ALC_WALL, n=8, smooth=False, cap=False)
            K.lathe('lm_paint', cx, cy, g - 1, [(1.9, h - 1.8), (1.2, h - 0.6), (0.3, h + 0.4), (0.0, h + 0.4)], hexc('#2d3033'), n=8, smooth=False)
            continue
        if kind == 'watertower':
            if era is not None and era < 1940: continue
            for k in range(4):
                a = math.pi / 4 + k * math.pi / 2
                K.cyl('lm_paint', (cx + 5.2 * math.cos(a), cy + 5.2 * math.sin(a), g), (cx + 3.9 * math.cos(a), cy + 3.9 * math.sin(a), g + 15.0), 0.35, hexc('#8e8a82'), n=6, smooth=False)
            K.lathe('lm_paint', cx, cy, g, [(0.0, 14.0), (4.6, 15.5), (4.8, 16.0), (4.8, 22.5), (3.8, 24.0), (0.6, 25.0), (0.0, 25.0)], hexc('#cfc9bc'), n=20)
            continue
        if kind == 'chimney':
            K.lathe('lm_matte', cx, cy, g, [(2.0, 0), (1.3, h), (0.0, h)], hexc('#a6998a'), n=12)
            continue
        if kind == 'tower':
            K.prism('lm_matte', r, g - 0.5, g + h - 3, ALC_WALL_D)
            K.prism('lm_glasshouse', [(cx + (x - cx) * 1.1, cy + (y - cy) * 1.1) for x, y in r], g + h - 3, g + h - 0.6, ALC_WALL, top=False)
            K.prism('lm_paint', [(cx + (x - cx) * 1.25, cy + (y - cy) * 1.25) for x, y in r], g + h - 0.6, g + h, hexc('#3c3f42'))
            continue
        if kind == 'ruin':
            # walls without a roof, their tops broken
            n = len(r)
            for i in range(n):
                (x1, y1), (x2, y2) = r[i], r[(i + 1) % n]
                L = math.hypot(x2 - x1, y2 - y1); m = max(1, int(L / 2.5))
                for k in range(m):
                    t0, t1 = k / m, (k + 1) / m
                    top = h * (0.55 + 0.45 * abs(math.sin(x1 * 0.7 + k * 1.9)))
                    pa = (x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0); pb = (x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1)
                    K.beam('lm_matte', (pa[0], pa[1], g - 0.5 + (top + 0.5) / 2), (pb[0], pb[1], g - 0.5 + (top + 0.5) / 2), 0.5, top + 0.5, hexc('#b9ad9a'))
            continue
        top = g + h
        K.prism('lm_matte', r, g - 1.0, top, ALC_WALL, top=False)
        if kind == 'gable' and len(r) >= 4:
            # a pitched roof over the outline's long axis
            ang = orient(r); fr = Frame(cx, cy, ang)
            u0, u1, v0, v1 = extent(r, fr)
            if (u1 - u0) < (v1 - v0): fr = Frame(cx, cy, ang + math.pi / 2); u0, u1, v0, v1 = extent(r, fr)
            ridge = top + (v1 - v0) * 0.3
            K.face('roof_shingle', [fr.P(u0, v0, top), fr.P(u1, v0, top), fr.P(u1, (v0 + v1) / 2, ridge), fr.P(u0, (v0 + v1) / 2, ridge)], ALC_ROOF)
            K.face('roof_shingle', [fr.P(u1, v1, top), fr.P(u0, v1, top), fr.P(u0, (v0 + v1) / 2, ridge), fr.P(u1, (v0 + v1) / 2, ridge)], ALC_ROOF)
            K.face('lm_matte', [fr.P(u0, v0, top), fr.P(u0, (v0 + v1) / 2, ridge), fr.P(u0, v1, top)], ALC_WALL)
            K.face('lm_matte', [fr.P(u1, v1, top), fr.P(u1, (v0 + v1) / 2, ridge), fr.P(u1, v0, top)], ALC_WALL)
        else:
            K.face('roof_flat', [(x, y, top) for x, y in r], ALC_ROOF)
            if h > 6: K.prism('lm_matte', r, top, top + 0.9, ALC_WALL_D, top=False)
        # rows of windows on the long sides
        if h >= 7:
            n = len(r)
            for i in range(n):
                (x1, y1), (x2, y2) = r[i], r[(i + 1) % n]
                L = math.hypot(x2 - x1, y2 - y1)
                if L < 8: continue
                dx, dy = (x2 - x1) / L, (y2 - y1) / L
                a2 = sum(r[j][0] * r[(j + 1) % n][1] - r[(j + 1) % n][0] * r[j][1] for j in range(n))
                nx, ny = (dy, -dx) if a2 > 0 else (-dy, dx)
                for k in range(int(L / 3.2)):
                    t = (k + 0.5) * L / int(L / 3.2)
                    for fz in range(int((h - 1.5) / 3.4)):
                        z0 = g + 1.4 + fz * 3.4
                        p0 = (x1 + dx * (t - 0.7) + nx * 0.06, y1 + dy * (t - 0.7) + ny * 0.06); p1 = (x1 + dx * (t + 0.7) + nx * 0.06, y1 + dy * (t + 0.7) + ny * 0.06)
                        K.face('lm_steel', [(p0[0], p0[1], z0), (p1[0], p1[1], z0), (p1[0], p1[1], z0 + 2.0), (p0[0], p0[1], z0 + 2.0)], GLAZE)

# ── Grace Cathedral ──────────────────────────────────────────────────────────
GRACE_W = hexc('#cfc9bd')
GRACE_W_D = hexc('#aea796')
GRACE_ROOF = hexc('#56655e')

def _gable(K, fr, u0, u1, v0, v1, z0, z1, wall_col, roof_col, wall_mat='concrete', roof_mat='lm_copper', along_u=True):
    """a box with a steep pitched roof (ridge along u or v)"""
    K.box(wall_mat, fr, u0, u1, v0, v1, 0.0, z0, wall_col, top=False)
    z0w, z1w = fr.z + z0, fr.z + z1
    if along_u:
        vm = (v0 + v1) / 2
        K.face(roof_mat, [fr.P(u0, v0, z0), fr.P(u1, v0, z0), fr.P(u1, vm, z1), fr.P(u0, vm, z1)], roof_col)
        K.face(roof_mat, [fr.P(u1, v1, z0), fr.P(u0, v1, z0), fr.P(u0, vm, z1), fr.P(u1, vm, z1)], roof_col)
        K.face(wall_mat, [fr.P(u0, v1, z0), fr.P(u0, vm, z1), fr.P(u0, v0, z0)], wall_col)
        K.face(wall_mat, [fr.P(u1, v0, z0), fr.P(u1, vm, z1), fr.P(u1, v1, z0)], wall_col)
    else:
        um = (u0 + u1) / 2
        K.face(roof_mat, [fr.P(u1, v0, z0), fr.P(u1, v1, z0), fr.P(um, v1, z1), fr.P(um, v0, z1)], roof_col)
        K.face(roof_mat, [fr.P(u0, v1, z0), fr.P(u0, v0, z0), fr.P(um, v0, z1), fr.P(um, v1, z1)], roof_col)
        K.face(wall_mat, [fr.P(u0, v0, z0), fr.P(um, v0, z1), fr.P(u1, v0, z0)], wall_col)
        K.face(wall_mat, [fr.P(u1, v1, z0), fr.P(um, v1, z1), fr.P(u0, v1, z0)], wall_col)

def grace(C):
    """GRACE CATHEDRAL (Lewis P. Hobart, 1928-64): French Gothic in
    reinforced concrete on Nob Hill; twin west towers (the building faces east
    onto Taylor Street) 174 ft (53 m), the nave's steep roof, the flèche over
    the crossing, buttresses, the rose window over the Ghiberti doors."""
    if C.era is not None and C.era < 1928: return
    f = FP().get('grace')
    if not f: return
    d = [x for x in f['datasf'] if x['gid'] == 139401]
    if not d: return
    rr = d[0]['ring']; c = centroid(rr)
    ang = math.radians(9.0)
    fr0 = Frame(c[0], c[1], ang)
    g = min(C.tg(*p) for p in rr[::3])
    fr = Frame(c[0], c[1], ang, g)
    K = C.K
    NAVE_Z, RIDGE = 27.0, 37.5
    _gable(K, fr, -40.0, 44.0, -12.0, 12.0, NAVE_Z, RIDGE, GRACE_W, GRACE_ROOF)
    _gable(K, fr, -16.0, -1.0, -24.0, 22.0, NAVE_Z, RIDGE, GRACE_W, GRACE_ROOF, along_u=False)
    # aisles either side, lower
    for (v0, v1) in ((-15.0, -12.0), (12.0, 13.5)):
        K.box('concrete', fr, -38.0, 42.0, v0, v1, 0.0, 15.0, GRACE_W_D)
    # the apse (west end): a half-octagon
    pts = [fr.P(-40.0 - 10.0 * math.sin(math.pi * k / 6), 12.0 * math.cos(math.pi * k / 6))[:2] for k in range(7)]
    K.prism('concrete', pts, g - 1.0, g + NAVE_Z, GRACE_W)
    apex = fr.P(-40.0, 0.0, RIDGE)
    for k in range(6):
        a, b = pts[k], pts[k + 1]
        K.face('lm_copper', [(b[0], b[1], g + NAVE_Z), (a[0], a[1], g + NAVE_Z), apex], GRACE_ROOF)
    # buttresses along the nave
    for k in range(10):
        u = -34.0 + k * 8.2
        for sgn in (-1, 1):
            K.box('concrete', fr, u - 0.9, u + 0.9, sgn * 15.0 - (2.6 if sgn < 0 else 0), sgn * 15.0 + (2.6 if sgn > 0 else 0), 0.0, 22.0, GRACE_W_D)
            # the lancet windows between
            vv = sgn * 12.02
            pts = [fr.P(u + 2.2, vv, 16.0), fr.P(u + 5.8, vv, 16.0), fr.P(u + 5.8, vv, 23.0), fr.P(u + 4.0, vv, 25.2), fr.P(u + 2.2, vv, 23.0)]
            K.face('lm_steel', pts if sgn > 0 else pts[::-1], GLAZE)
    # the twin towers at the east front, their pinnacles; the rose between
    for sgn in (-1, 1):
        vc = sgn * 10.5
        K.box('concrete', fr, 43.0, 53.0, vc - 5.0, vc + 5.0, 0.0, 49.0, GRACE_W)
        K.box('concrete', fr, 43.6, 52.4, vc - 4.4, vc + 4.4, 49.0, 53.0, GRACE_W_D)
        for (du, dv) in ((-4.0, -4.0), (4.0, -4.0), (4.0, 4.0), (-4.0, 4.0)):
            p = fr.P(48.0 + du, vc + dv)
            K.lathe('concrete', p[0], p[1], g, [(0.9, 53.0), (0.9, 54.5), (0.0, 58.0)], GRACE_W_D, n=4, smooth=False)
        for (z0, z1) in ((30.0, 44.0),):                                       # belfry louvres
            _tower_panel(K, Frame(*fr.P(48.0, vc)[:2], ang, g), 0, 5.0, -1.6, 1.6, z0, z1, arch=True)
    rc = fr.P(53.1, 0.0, 22.0)
    K.face('lm_steel', [fr.P(53.1, 5.5 * math.cos(2 * math.pi * k / 20), 22.0 + 5.5 * math.sin(2 * math.pi * k / 20)) for k in range(20)][::-1], GLAZE)
    K.box('concrete', fr, 43.0, 53.0, -5.5, 5.5, 0.0, 30.0, GRACE_W, top=False)
    K.face('lm_copper', [fr.P(53.0, -5.5, 30.0), fr.P(53.0, 5.5, 30.0), fr.P(44.0, 0.0, RIDGE)], GRACE_ROOF)
    # the flèche over the crossing
    cp = fr.P(-8.5, -1.0)
    K.lathe('lm_copper', cp[0], cp[1], g, [(3.2, RIDGE - 2), (3.2, RIDGE + 6.0), (2.4, RIDGE + 7.0), (2.4, RIDGE + 14.0), (0.2, 75.0), (0.0, 75.0)], GRACE_ROOF, n=8, smooth=False)

# ── St. Mary's Cathedral ─────────────────────────────────────────────────────
TRAVERTINE = hexc('#e5e0d4')

def stmarys(C):
    """CATHEDRAL OF SAINT MARY OF THE ASSUMPTION (Pietro Belluschi and Pier
    Luigi Nervi, 1971): a 255 ft (77.7 m) square whose roof is eight
    hyperbolic paraboloids rising from four corner pylons to a cross of
    stained glass 190 ft (58 m) up, a 55 ft gold cross on top; white
    travertine. Drawn as the shell z = H (1 - r)^2, r the diamond distance
    from the centre (0 at the cross, 1 at the corners), the glass cross along
    its axes."""
    if C.era is not None and C.era < 1970: return
    f = FP().get('stmarys')
    if not f: return
    d = [x for x in f['datasf'] if x['gid'] == 149499]
    if not d: return
    rr = d[0]['ring']
    ang = math.radians(9.0)
    fr0 = Frame(1111.0, 2699.0, ang)
    u0, u1, v0, v1 = extent([(u, v) for u, v in [(p[0], p[1]) for p in rr]], fr0) if False else (-39.0, 38.0, -38.0, 39.0)
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    cx, cy = fr0.P(cu, cv)[:2]
    a = 38.8
    g = C.tg(cx, cy)
    fr = Frame(cx, cy, ang, g)
    K = C.K
    zb, H = 7.0, 58.0
    K.prism('concrete', [tuple(p) for p in rr], g - 1.0, g + zb, hexc('#cfc9bd'))               # the plinth and its wings
    N = 28
    def z(x, y):
        r = (abs(x) + abs(y)) / (2 * a); return zb + H * max(0.0, 1 - r) ** 2
    V, Fc, Vg, Fg = [], [], [], []
    for i in range(N + 1):
        for j in range(N + 1):
            x = -a + 2 * a * i / N; y = -a + 2 * a * j / N
            V.append(fr.P(x, y, z(x, y) - g + g - fr.z + fr.z - g) if False else (fr.P(x, y)[0], fr.P(x, y)[1], g + z(x, y)))
    for i in range(N):
        for j in range(N):
            q = i * (N + 1) + j
            xc = -a + 2 * a * (i + 0.5) / N; yc = -a + 2 * a * (j + 0.5) / N
            quad = (q, q + (N + 1), q + (N + 1) + 1, q + 1)
            (Fg if (abs(xc) < 1.6 or abs(yc) < 1.6) else Fc).append(quad)
    K.mesh('lm_matte', V, Fc, TRAVERTINE)
    K.mesh('lm_steel', V, Fg, hexc('#2c3440'))
    # the walls under the shell's edges (glass between the corner pylons)
    for side in range(4):
        pts = []
        for k in range(N + 1):
            t = -a + 2 * a * k / N
            x, y = [(a, t), (-t, a), (-a, -t), (t, -a)][side]
            pts.append((x, y))
        for k in range(N):
            (xa, ya), (xb, yb) = pts[k], pts[k + 1]
            pa, pb = fr.P(xa, ya), fr.P(xb, yb)
            K.face('lm_steel', [(pa[0], pa[1], g + zb), (pb[0], pb[1], g + zb), (pb[0], pb[1], g + z(xb, yb)), (pa[0], pa[1], g + z(xa, ya))], hexc('#3a3f45'))
    for (x, y) in ((a, a), (-a, a), (-a, -a), (a, -a)):                       # the corner pylons
        p = fr.P(x, y)
        K.box('concrete', Frame(p[0], p[1], ang, g), -3.5, 3.5, -3.5, 3.5, zb - 1.0, zb + 6.0, TRAVERTINE)
    # the cross on top
    top = fr.P(0, 0, zb + H)
    K.box('lm_gold', Frame(top[0], top[1], ang, top[2]), -0.5, 0.5, -0.5, 0.5, 0.0, 16.8, (1, 1, 1, 1))
    K.box('lm_gold', Frame(top[0], top[1], ang, top[2]), -0.5, 0.5, -4.6, 4.6, 11.0, 12.0, (1, 1, 1, 1))

# ── Conservatory of Flowers ──────────────────────────────────────────────────
def conservatory(C):
    """CONSERVATORY OF FLOWERS (1878, Golden Gate Park): the oldest public
    wood-and-glass conservatory in the US, white; a central pavilion under a
    tall onion dome (16.4 m) with a cupola, two long wings with curved roofs,
    square pavilions at their ends; the outline is OpenStreetMap's."""
    if C.era is not None and C.era < 1878: return
    rs = outer('conservatory')
    if not rs: return
    r = rs[0]; cx, cy = centroid(r); ang = orient(r)
    fr = Frame(cx, cy, ang)
    u0, u1, v0, v1 = extent(r, fr)
    cu = (u0 + u1) / 2; cv = (v0 + v1) / 2
    X0, Y0 = fr.P(cu, cv)[:2]
    g = C.tg(X0, Y0); F = Frame(X0, Y0, ang, g)
    K = C.K
    W = hexc('#f1efe8'); GL = hexc('#dfe6e4')
    half = (u1 - u0) / 2
    # the wings: glass walls, barrel roofs
    for sgn in (-1, 1):
        ua, ub = sgn * 8.5, sgn * (half - 8.0)
        lo, hi = min(ua, ub), max(ua, ub)
        K.box('lm_matte', F, lo, hi, -5.5, 5.5, -0.5, 1.0, W)
        K.box('lm_glasshouse', F, lo, hi, -5.3, 5.3, 1.0, 4.0, GL, top=False)
        n = 10; prof = [(-5.5 * math.cos(math.pi * k / n), 4.0 + 3.2 * math.sin(math.pi * k / n)) for k in range(n + 1)]
        V = []; Fc = []
        for k, (vv, zz) in enumerate(prof):
            V += [F.P(lo, vv, zz), F.P(hi, vv, zz)]
            if k: Fc.append((2 * k - 2, 2 * k - 1, 2 * k + 1, 2 * k))
        K.mesh('lm_paint', V, Fc, W)
        for uu in [lo + (hi - lo) * t / 8 for t in range(9)]:                  # the ribs
            for k in range(n):
                K.beam('lm_paint', F.P(uu, prof[k][0], prof[k][1] + 0.05), F.P(uu, prof[k + 1][0], prof[k + 1][1] + 0.05), 0.2, 0.2, W)
        # the end pavilions
        ue = sgn * (half - 4.0)
        K.box('lm_glasshouse', F, ue - 4.0, ue + 4.0, -6.0, 6.0, -0.5, 5.2, GL)
        K.lathe('lm_paint', *F.P(ue, 0)[:2], g, [(5.6, 5.2), (4.6, 7.2), (2.6, 9.0), (0.3, 9.8), (0.0, 9.8)], W, n=4, smooth=False, ang0=ang + math.pi / 4)
    # the central pavilion and its dome
    K.lathe('lm_glasshouse', X0, Y0, g, [(8.4, -0.5), (8.4, 6.0)], GL, n=16, smooth=False, cap=False)
    prof = [(8.6, 6.0), (8.8, 7.0), (8.0, 9.0), (6.6, 11.4), (4.4, 13.4), (2.2, 14.6), (1.2, 14.8)]
    K.lathe('lm_paint', X0, Y0, g, prof, W, n=24, cap=False)
    K.lathe('lm_paint', X0, Y0, g, [(1.4, 14.8), (1.4, 15.8), (0.7, 16.4), (0.1, 17.4), (0.0, 17.4)], W, n=8)

# ── de Young Museum ──────────────────────────────────────────────────────────
DEYOUNG_CU = hexc('#6a4b37')

def deyoung(C):
    """DE YOUNG MUSEUM (Herzog & de Meuron, 2005): a long low building clad
    in perforated, dimpled copper that is darkening towards brown and green;
    the Hamon observation tower, 144 ft (44 m), twists as it rises to align
    with the city's grid. The previous de Young (1895-2002) stood here."""
    if C.era is not None and C.era < 2005: return
    f = FP().get('deyoung')
    if not f or not f['datasf']: return
    r = [tuple(p) for p in f['datasf'][0]['ring']]
    cx, cy = centroid(r); ang = orient(r)
    fr = Frame(cx, cy, ang)
    g = min(C.tg(*p) for p in r)
    K = C.K
    K.prism('lm_steel', r, g - 1.0, g + 13.6, DEYOUNG_CU, top=False)
    K.face('lm_steel', [(x, y, g + 13.6) for x, y in (r[:-1] if r[0] == r[-1] else r)], hexc('#5b4131'))
    K.prism('lm_steel', r, g + 13.6, g + 14.4, hexc('#7a5a43'), top=False)
    # the tower at the building's north-east end, twisting as it rises
    u0, u1, v0, v1 = extent(r, fr)
    tu, tv = u1 - 16.0, (v0 + v1) / 2 + 6.0
    T = fr.P(tu, tv)
    rings = []
    for k in range(9):
        z = 44.0 * k / 8; tw = math.radians(-26.0) * k / 8
        F2 = Frame(T[0], T[1], ang + tw, g)
        rings.append([F2.P(-9.0, -18.0, z), F2.P(9.0, -18.0, z), F2.P(9.0, 18.0, z), F2.P(-9.0, 18.0, z)])
    K.loft('lm_steel', rings, DEYOUNG_CU)
    F2 = Frame(T[0], T[1], ang + math.radians(-26.0), g)
    K.loft('lm_steel', [[F2.P(-9.05, -18.05, 40.0), F2.P(9.05, -18.05, 40.0), F2.P(9.05, 18.05, 40.0), F2.P(-9.05, 18.05, 40.0)],
                        [F2.P(-9.05, -18.05, 43.0), F2.P(9.05, -18.05, 43.0), F2.P(9.05, 18.05, 43.0), F2.P(-9.05, 18.05, 43.0)]], hexc('#2b2f33'), cap_top=False)

# ── Legion of Honor ──────────────────────────────────────────────────────────
LEGION = hexc('#e8e2d4')

def legion(C):
    """CALIFORNIA PALACE OF THE LEGION OF HONOR (George Applegarth, 1924): a
    three-quarter-scale Palais de la Légion d'Honneur; the Court of Honor
    ringed by Ionic colonnades, entered through a triumphal arch in a
    colonnaded screen to the east, the museum's pedimented portico facing it."""
    if C.era is not None and C.era < 1924: return
    f = FP().get('legion')
    if not f: return
    r = _clean([tuple(p) for p in f['outer'][0]])
    holes = [_clean([tuple(p) for p in h]) for h in f['inner'] if len(h) > 4]
    cx, cy = centroid(r); ang = orient(r)
    fr = Frame(cx, cy, ang)
    g = min(C.tg(*p) for p in r[::4])
    K = C.K
    H = 14.0
    K.prism('concrete', r, g - 1.0, g + H, LEGION, top=False)
    K.face_holes('roof_flat', r, holes, g + H, hexc('#9d9a92'))
    K.prism('concrete', r, g + H, g + H + 1.0, hexc('#d4cdbc'), top=False)
    for h in holes:
        K.prism('concrete', h[::-1], g - 0.2, g + H, LEGION, top=False)
        K.face('path', [(x, y, g + 0.05) for x, y in h], (1, 1, 1, 1))
        # the colonnade round the court
        n = len(h); hc = centroid(h)
        for i in range(n):
            (x1, y1), (x2, y2) = h[i], h[(i + 1) % n]
            L = math.hypot(x2 - x1, y2 - y1)
            for k in range(int(L / 3.4)):
                t = (k + 0.5) / int(L / 3.4)
                x, y = x1 + (x2 - x1) * t, y1 + (y2 - y1) * t
                x, y = x + (hc[0] - x) * 0.06, y + (hc[1] - y) * 0.06
                K.cyl('concrete', (x, y, g), (x, y, g + 10.5), 0.45, LEGION, n=8)
    # the museum's portico on the court's west side, with its pediment
    uw = -43.0
    for k in range(6):
        v = -7.5 + 3.0 * k
        K.cyl('concrete', fr.P(uw + 8.0, v, g), fr.P(uw + 8.0, v, g + H - 1.0), 0.6, LEGION, n=10)
    Fg = Frame(cx, cy, ang, g)
    K.box('concrete', Fg, uw, uw + 9.0, -9.5, 9.5, H - 1.0, H + 1.2, hexc('#d4cdbc'))
    A = [fr.P(uw + 9.0, -9.5, g + H + 1.2), fr.P(uw + 9.0, 9.5, g + H + 1.2), fr.P(uw + 9.0, 0.0, g + H + 5.0)]
    K.face('concrete', A, LEGION)
    K.face('roof_flat', [fr.P(uw, -9.5, g + H + 1.2), A[0], A[2], fr.P(uw, 0.0, g + H + 5.0)], hexc('#9d9a92'))
    K.face('roof_flat', [A[1], fr.P(uw, 9.5, g + H + 1.2), fr.P(uw, 0.0, g + H + 5.0), A[2]], hexc('#9d9a92'))
    # the triumphal arch in the east screen
    ue = 44.5
    K.box('concrete', Fg, ue - 3.0, ue + 1.0, -6.0, 6.0, 0.0, 16.0, LEGION)
    pts = [fr.P(ue + 1.05, -3.0, g), fr.P(ue + 1.05, 3.0, g)] + [fr.P(ue + 1.05, 3.0 * math.cos(math.pi * k / 8), g + 8.0 + 3.0 * math.sin(math.pi * k / 8)) for k in range(9)]
    K.face('lm_steel', pts[::-1], hexc('#20242a'))

# ── Oracle Park ──────────────────────────────────────────────────────────────
def _pip(x, y, r):
    ins = False
    for i in range(len(r)):
        (x1, y1), (x2, y2) = r[i], r[(i + 1) % len(r)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: ins = not ins
    return ins

def oracle(C):
    """ORACLE PARK (HOK Sport, 2000) on China Basin: home plate at the west
    corner (King & 3rd, Willie Mays Plaza), the field opening east to the bay,
    the right-field wall on McCovey Cove (309 ft), left 339 ft, centre 399 ft;
    the seating bowl in the Giants' dark green, the brick outer walls, the
    clock tower over the plaza, the light towers, the Coca-Cola bottle and the
    glove behind left field. Built as a height field over the DataSF outline."""
    if C.era is not None and C.era < 2000: return
    f = FP().get('oracle')
    if not f or not f['datasf']: return
    r = _clean([tuple(p) for p in f['datasf'][0]['ring']])
    ang = math.radians(45.4)
    c = centroid(f['outer'][0])
    fr = Frame(c[0], c[1], ang)
    g = min(C.tg(*p) for p in r); g = max(g, 2.0)
    K = C.K
    H = (-97.0, 73.0)                          # home plate, local (u, v)
    fences = [(0.0, 103.0), (-22.5, 118.0), (-45.0, 122.0), (-67.5, 118.0), (-90.0, 94.0)]
    def fence(th):
        for (a, ra), (b, rb) in zip(fences, fences[1:]):
            if b <= th <= a: return ra + (rb - ra) * (th - a) / (b - a)
        return 0.0
    def cell(u, v):
        du, dv = u - H[0], v - H[1]; rr = math.hypot(du, dv); th = math.degrees(math.atan2(dv, du))
        if -90.0 <= th <= 0.0:
            fr_ = fence(th)
            if rr < fr_:
                # the infield: dirt round the diamond, the grass beyond
                mu, mv = H[0] + 18.4 * math.cos(math.radians(-45)), H[1] + 18.4 * math.sin(math.radians(-45))
                if math.hypot(u - mu, v - mv) < 29.0 and rr > 3.0:
                    inner = abs(du) > 1.2 and abs(dv) > 1.2 and max(abs(du), abs(dv)) < 26.0 and rr < 36
                    return 0.12, ('lawn' if inner else 'dirt')
                return 0.12, 'lawn'
            d = rr - fr_
            return min(3.0 + d * 0.45, 11.0), 'seat'
        # foul territory then the stands, by distance to the nearer foul line
        d = min(abs(dv) if du > 0 else rr, abs(du) if dv < 0 else rr) if not (du < 0 and dv > 0) else rr
        if d < 14.0: return 0.12, 'dirt' if d < 4 else 'lawn'
        return min(2.5 + (d - 14.0) * 0.52, 32.0), 'seat'
    xs = [fr.uv(*p)[0] for p in r]; ys = [fr.uv(*p)[1] for p in r]
    step = 3.0
    nu = int((max(xs) - min(xs)) / step) + 1; nv = int((max(ys) - min(ys)) / step) + 1
    u0, v0 = min(xs), min(ys)
    ring_uv = [fr.uv(*p) for p in r]
    Z = {}
    for i in range(nu + 1):
        for j in range(nv + 1):
            u, v = u0 + i * step, v0 + j * step
            Z[(i, j)] = cell(u, v)[0]
    cols = {'lawn': ('lawn', (1, 1, 1, 1)), 'dirt': ('lm_matte', hexc('#9b6a45')), 'seat': ('lm_matte', hexc('#284236'))}
    for i in range(nu):
        for j in range(nv):
            u, v = u0 + (i + 0.5) * step, v0 + (j + 0.5) * step
            if not _pip(u, v, ring_uv): continue
            z, kind = cell(u, v)
            mat, col = cols[kind]
            if kind == 'seat' and int((z - 2.5) / 1.6) % 5 == 0: col = hexc('#8b8984')   # aisles / walkways
            pts = [fr.P(u0 + i * step, v0 + j * step, g + Z[(i, j)]), fr.P(u0 + (i + 1) * step, v0 + j * step, g + Z[(i + 1, j)]),
                   fr.P(u0 + (i + 1) * step, v0 + (j + 1) * step, g + Z[(i + 1, j + 1)]), fr.P(u0 + i * step, v0 + (j + 1) * step, g + Z[(i, j + 1)])]
            K.face(mat, pts, col)
    # the brick outer walls up to the stands' rim
    n = len(r)
    for k in range(n):
        (x1, y1), (x2, y2) = r[k], r[(k + 1) % n]
        za = cell(*fr.uv(x1, y1))[0]; zb = cell(*fr.uv(x2, y2))[0]
        K.face('brick', [(x1, y1, g - 1.0), (x2, y2, g - 1.0), (x2, y2, g + max(zb, 3.0) + 1.2), (x1, y1, g + max(za, 3.0) + 1.2)], hexc('#9c4e36'))
    # the outfield wall and the arcade on McCovey Cove
    pts = [(H[0] + fence(th) * math.cos(math.radians(th)), H[1] + fence(th) * math.sin(math.radians(th))) for th in [-90 + 3 * k for k in range(31)]]
    for k in range(len(pts) - 1):
        (ua, va), (ub, vb) = pts[k], pts[k + 1]
        hh = 7.6 if k < 10 else 3.0
        K.face('lm_matte', [fr.P(ua, va, g), fr.P(ub, vb, g), fr.P(ub, vb, g + hh), fr.P(ua, va, g + hh)], hexc('#2f4a3c'))
    # the clock tower over Willie Mays Plaza (behind home), light towers, the bottle and the glove
    tp = fr.P(H[0] - 34.0, H[1] + 10.0)
    T = Frame(tp[0], tp[1], ang, g)
    K.box('brick', T, -4.0, 4.0, -4.0, 4.0, 0.0, 30.0, hexc('#a0523a'))
    K.box('concrete', T, -4.5, 4.5, -4.5, 4.5, 30.0, 31.0, hexc('#d9d2c2'))
    for side in range(4): _clock(K, T, side, 4.0, 26.0, 2.1)
    K.lathe('lm_copper', tp[0], tp[1], g, [(3.6, 31.0), (0.2, 36.0), (0.0, 36.0)], hexc('#4f6b5e'), n=4, smooth=False, ang0=ang + math.pi / 4)
    for th in (-10.0, -35.0, -58.0, -82.0, 25.0, 60.0, 100.0, 140.0):
        rr = 150.0 if -90 <= th <= 0 else 70.0
        u, v = H[0] + rr * math.cos(math.radians(th)), H[1] + rr * math.sin(math.radians(th))
        if not _pip(u, v, ring_uv): continue
        p = fr.P(u, v)
        K.cyl('lm_paint', (p[0], p[1], g), (p[0], p[1], g + 45.0), 0.7, hexc('#8d9195'), n=6, smooth=False)
        K.box('lm_paint', Frame(p[0], p[1], ang + math.radians(th), g), -1.0, 1.0, -5.0, 5.0, 42.0, 47.0, hexc('#d9dadc'))
    bu, bv = H[0] + 132.0 * math.cos(math.radians(-18)), H[1] + 132.0 * math.sin(math.radians(-18))
    bp = fr.P(bu, bv)
    K.lathe('lm_paint', bp[0], bp[1], g, [(2.6, 0.0), (3.1, 6.0), (3.1, 12.0), (2.4, 15.0), (1.3, 19.0), (1.1, 23.5), (0.0, 24.0)], hexc('#a62a23'), n=16)
    gp = fr.P(bu + 12.0, bv + 14.0)
    K.lathe('lm_paint', gp[0], gp[1], g, [(4.5, 0.0), (5.2, 4.0), (4.0, 7.5), (0.0, 8.0)], hexc('#7a4b2a'), n=12)

# ── Chase Center ─────────────────────────────────────────────────────────────
def chase(C):
    """CHASE CENTER (Manica, 2019): the Warriors' arena in Mission Bay, a
    rounded drum of white horizontal fins over a glass base, 38 m (OSM
    height 38.1); not in the DataSF footprints the city is built from."""
    if C.era is not None and C.era < 2019: return
    rs = outer('chase')
    if not rs: return
    r = _clean(rs[0]); cx, cy = centroid(r)
    g = min(C.tg(*p) for p in r[::6])
    K = C.K
    H = 38.1
    K.prism('lm_steel', [(cx + (x - cx) * 0.97, cy + (y - cy) * 0.97) for x, y in r], g - 1.0, g + 8.0, hexc('#2c3136'), top=False)
    K.prism('lm_paint', r, g + 8.0, g + H, hexc('#d8d9d6'), top=False)
    for k in range(int((H - 9.0) / 2.4)):
        z = g + 9.0 + k * 2.4
        ro = [(cx + (x - cx) * 1.012, cy + (y - cy) * 1.012) for x, y in r]
        K.prism('lm_paint', ro, z, z + 0.35, hexc('#f1f1ee'), top=False)
    K.face('roof_flat', [(x, y, g + H) for x, y in r], hexc('#dcdcd8'))
    K.prism('lm_paint', [(cx + (x - cx) * 0.55, cy + (y - cy) * 0.55) for x, y in r], g + H, g + H + 2.2, hexc('#b9bbbc'))

# ── the Golden Gate Park windmills ───────────────────────────────────────────
WINDMILLS = {
    # key: (x, y, tower top, tower base radius, top radius, axle height, sail radius, facing azimuth deg)
    'dutchmill': (-6285.0, 1163.0, 16.5, 6.4, 4.2, 18.6, 15.5, 270.0),
    'murphymill': (-6221.0, 556.0, 22.0, 7.4, 4.9, 25.2, 17.4, 262.0),
}
SHINGLE = hexc('#6f5840')
SAIL = hexc('#e8e2d2')

def windmill(C, key):
    """THE DUTCH WINDMILL (1903) and THE MURPHY WINDMILL (1908) at the ocean
    end of Golden Gate Park, built to pump the park's irrigation water:
    octagonal smock towers shingled in wood on a masonry base, a turning cap,
    four lattice sails facing the sea wind — 102 ft (31 m) across on the
    Dutch mill, 114 ft (35 m) on the Murphy mill (restored 2011-12)."""
    x, y, top, r0, r1, axz, sr, az = WINDMILLS[key]
    g = C.tg(x, y); K = C.K
    if C.era is not None and C.era < (1903 if key == 'dutchmill' else 1908): return
    K.lathe('concrete', x, y, g, [(r0 + 0.6, -0.5), (r0 + 0.6, 2.8), (r0 + 0.2, 3.2)], hexc('#8d8577'), n=8, smooth=False, cap=False, ang0=math.pi / 8)
    K.lathe('lm_matte', x, y, g, [(r0, 3.2), (r1, top)], SHINGLE, n=8, smooth=False, cap=False, ang0=math.pi / 8)
    # the reefing stage (gallery) a third of the way up
    zs = 3.2 + (top - 3.2) * 0.3; rs = r0 + (r1 - r0) * 0.3
    K.lathe('lm_matte', x, y, g, [(rs + 1.8, zs), (rs + 1.8, zs + 0.35), (rs, zs + 0.35)], hexc('#5a4632'), n=8, smooth=False, cap=False, ang0=math.pi / 8)
    # the cap: a boat-shaped roof, turned to the wind
    a = math.radians(90.0 - az)                    # azimuth -> math angle
    fwd = (math.cos(a), math.sin(a))
    K.lathe('lm_matte', x, y, g, [(r1 + 0.4, top), (r1 + 0.2, top + 1.0), (r1 * 0.55, top + 3.4), (0.3, top + 4.6), (0.0, top + 4.6)], hexc('#4b3a2c'), n=12)
    hub = (x + fwd[0] * (r1 + 1.2), y + fwd[1] * (r1 + 1.2), g + axz)
    K.cyl('lm_paint', (x, y, g + axz), hub, 0.45, hexc('#3b3027'), n=8)
    side = (-fwd[1], fwd[0])
    for k in range(4):
        th = math.radians(30.0 + 90.0 * k)
        d = (side[0] * math.cos(th), side[1] * math.cos(th), math.sin(th))
        tip = (hub[0] + d[0] * sr, hub[1] + d[1] * sr, hub[2] + d[2] * sr)
        K.beam('lm_paint', hub, tip, 0.45, 0.45, SAIL, up=(fwd[0], fwd[1], 0))
        # the lattice: two rails and bars across, on the trailing side
        pd = (side[0] * math.cos(th + math.pi / 2), side[1] * math.cos(th + math.pi / 2), math.sin(th + math.pi / 2))
        w = sr * 0.14
        r_in, r_out = sr * 0.18, sr
        a0 = (hub[0] + d[0] * r_in + pd[0] * w, hub[1] + d[1] * r_in + pd[1] * w, hub[2] + d[2] * r_in + pd[2] * w)
        a1 = (hub[0] + d[0] * r_out + pd[0] * w, hub[1] + d[1] * r_out + pd[1] * w, hub[2] + d[2] * r_out + pd[2] * w)
        K.beam('lm_paint', a0, a1, 0.18, 0.18, SAIL, up=(fwd[0], fwd[1], 0))
        for j in range(9):
            t = r_in + (r_out - r_in) * j / 8
            p0 = (hub[0] + d[0] * t, hub[1] + d[1] * t, hub[2] + d[2] * t)
            p1 = (p0[0] + pd[0] * w, p0[1] + pd[1] * w, p0[2] + pd[2] * w)
            K.beam('lm_paint', p0, p1, 0.12, 0.12, SAIL, up=(fwd[0], fwd[1], 0))

def dutchmill(C): windmill(C, 'dutchmill')
def murphymill(C): windmill(C, 'murphymill')

# ── Mount Davidson cross ─────────────────────────────────────────────────────
DAVIDSON = (-1476.0, -2411.0)          # OSM node 633021134

def davidson_cross(C):
    """THE MOUNT DAVIDSON CROSS (1934): 103 ft (31.4 m) of concrete on the
    city's highest summit (928 ft), among the eucalyptus."""
    if C.era is not None and C.era < 1934: return
    x, y = DAVIDSON
    g = C.tg(x, y); K = C.K
    fr = Frame(x, y, math.radians(9.0), g)
    col = hexc('#d4cfc4')
    K.box('concrete', fr, -2.4, 2.4, -2.4, 2.4, -1.0, 2.0, hexc('#b6b0a4'))
    K.box('concrete', fr, -1.6, 1.6, -1.6, 1.6, 2.0, 31.4, col)
    K.box('concrete', fr, -6.2, 6.2, -1.45, 1.45, 20.8, 23.8, col)

# ── Fort Point ───────────────────────────────────────────────────────────────
def fortpoint(C):
    """FORT POINT (1853-61): a three-tier brick casemate fort on the point
    under the Golden Gate Bridge's south arch, a parade ground in the middle,
    the barbette tier on top with the 1864 lighthouse (a small iron tower)."""
    if C.era is not None and C.era < 1861: return
    f = FP().get('fortpoint')
    if not f: return
    r = _clean([tuple(p) for p in f['outer'][0]])
    holes = [_clean([tuple(p) for p in h]) for h in f['inner'] if len(h) > 4]
    cx, cy = centroid(r)
    g = max(min(C.tg(*p) for p in r), 1.0)
    K = C.K
    BR = hexc('#94634c'); BR_D = hexc('#744a38')
    H = 18.5      # three casemate tiers and the barbette parapet (4 levels, ~60 ft over the parade)
    K.prism('brick', r, g - 2.0, g + 4.0, hexc('#9a927f'), top=False)     # the granite lower course
    K.prism('brick', r, g + 4.0, g + H, BR, top=False)
    K.face_holes('lm_matte', r, holes, g + H, hexc('#5c554d'))     # the barbette tier: dark weathered paving (was #8a8378: read white at midday)
    K.prism('brick', r, g + H, g + H + 1.4, BR_D, top=False)
    for h in holes:
        K.prism('brick', h[::-1], g, g + H + 1.4, BR, top=False)
        K.face('path', [(x, y, g + 0.05) for x, y in h], (1, 1, 1, 1))
        # the courtyard galleries: three tiers of tall dark arches round the parade ground
        hh = list(h); m_ = len(hh)
        ah = sum(hh[i][0] * hh[(i + 1) % m_][1] - hh[(i + 1) % m_][0] * hh[i][1] for i in range(m_))
        for i in range(m_):
            (x1, y1), (x2, y2) = hh[i], hh[(i + 1) % m_]
            L = math.hypot(x2 - x1, y2 - y1)
            if L < 5: continue
            dx, dy = (x2 - x1) / L, (y2 - y1) / L
            nx, ny = (-dy, dx) if ah > 0 else (dy, -dx)          # into the courtyard
            k_ = int(L / 4.6)
            for k in range(k_):
                t = (k + 0.5) * L / k_
                for z0, zh in ((0.4, 3.6), (6.2, 3.4), (11.8, 3.4)):
                    pts = [(x1 + dx * (t - 1.5) + nx * 0.06, y1 + dy * (t - 1.5) + ny * 0.06, g + z0),
                           (x1 + dx * (t + 1.5) + nx * 0.06, y1 + dy * (t + 1.5) + ny * 0.06, g + z0)]
                    for j in range(7):
                        th = math.pi * j / 6
                        pts.append((x1 + dx * (t + 1.5 * math.cos(th)) + nx * 0.06, y1 + dy * (t + 1.5 * math.cos(th)) + ny * 0.06, g + z0 + zh - 1.5 + 1.5 * math.sin(th)))
                    K.face('lm_steel', pts if ah > 0 else pts[::-1], hexc('#1b1715'))
    # the casemates: three tiers of arched gun ports on the outer walls
    n = len(r)
    a2 = sum(r[i][0] * r[(i + 1) % n][1] - r[(i + 1) % n][0] * r[i][1] for i in range(n))
    for i in range(n):
        (x1, y1), (x2, y2) = r[i], r[(i + 1) % n]
        L = math.hypot(x2 - x1, y2 - y1)
        if L < 6: continue
        dx, dy = (x2 - x1) / L, (y2 - y1) / L
        nx, ny = (dy, -dx) if a2 > 0 else (-dy, dx)
        m = int(L / 4.2)
        for k in range(m):
            t = (k + 0.5) * L / m
            for z0 in (2.4, 7.4, 12.4):
                pts = [(x1 + dx * (t - 0.6) + nx * 0.06, y1 + dy * (t - 0.6) + ny * 0.06, g + z0)]
                pts.append((x1 + dx * (t + 0.6) + nx * 0.06, y1 + dy * (t + 0.6) + ny * 0.06, g + z0))
                for j in range(5):
                    th = math.pi * j / 4
                    pts.append((x1 + dx * (t + 0.6 * math.cos(th)) + nx * 0.06, y1 + dy * (t + 0.6 * math.cos(th)) + ny * 0.06, g + z0 + 1.6 + 0.6 * math.sin(th)))
                pts = pts[:2] + pts[2:]
                K.face('lm_steel', [pts[0], pts[1]] + pts[2:], hexc('#1d1a18'))
    # the lighthouse on the barbette tier
    lx, ly = -3458.0, 5626.0
    K.box('brick', Frame(lx, ly, 0.0), -3.2, 3.2, -3.2, 3.2, g, g + H + 4.5, BR_D)   # the stair tower under the light
    K.lathe('lm_paint', lx, ly, g + H + 4.5, [(1.6, 0.0), (0.9, 6.0), (1.1, 6.0), (1.1, 7.8), (0.4, 8.8), (0.0, 8.8)], hexc('#e9e5dc'), n=6, smooth=False)

# ── Union Square: the Dewey Monument ─────────────────────────────────────────
DEWEY = (2684.0, 3115.0)

def dewey(C):
    """THE DEWEY MONUMENT (Robert Aitken, 1903) in the middle of Union Square:
    a 97 ft (29.6 m) granite Corinthian column on a stepped base, the bronze
    Victory on top holding a trident and a wreath."""
    if C.era is not None and C.era < 1903: return
    x, y = DEWEY; g = C.tg(x, y); K = C.K
    GR = hexc('#d9d4c8')
    fr = Frame(x, y, math.radians(9.0), g)
    K.box('concrete', fr, -4.0, 4.0, -4.0, 4.0, -0.5, 1.0, GR)
    K.box('concrete', fr, -2.6, 2.6, -2.6, 2.6, 1.0, 5.2, GR)
    K.box('concrete', fr, -2.9, 2.9, -2.9, 2.9, 5.2, 5.8, hexc('#c4bfb3'))
    K.lathe('concrete', x, y, g, [(1.25, 5.8), (1.05, 24.6), (1.5, 25.8), (1.6, 26.6), (0.9, 26.8)], GR, n=16)
    K.lathe('lm_steel', x, y, g, [(0.8, 26.8), (0.9, 27.4), (0.45, 28.6), (0.5, 29.2), (0.25, 29.9), (0.0, 29.9)], hexc('#3b4a44'), n=8)
    K.cyl('lm_steel', (x, y, g + 27.5), (x + 0.3, y, g + 31.0), 0.06, hexc('#3b4a44'), n=4)

# ── the Japanese Tea Garden pagoda ───────────────────────────────────────────
PAGODA = (-2851.5, 1125.5)             # OSM way 34221099

def tea_pagoda(C):
    """THE PAGODA OF THE JAPANESE TEA GARDEN (from the 1915 exposition, moved
    to the garden that year): five tiers, vermilion posts and eaves under dark
    tiled roofs, about 13 m."""
    if C.era is not None and C.era < 1915: return
    x, y = PAGODA; g = C.tg(x, y); K = C.K
    RED = hexc('#b43a24'); ROOF = hexc('#2f3130')
    z = 0.0; s = 3.3
    for k in range(5):
        h = 2.4 if k == 0 else 1.7
        fr = Frame(x, y, math.radians(9.0), g)
        K.box('lm_paint', fr, -s, s, -s, s, z, z + h, RED)
        e = s + 1.5; zr = z + h
        pts = [fr.P(-e, -e, zr - 0.35), fr.P(e, -e, zr - 0.35), fr.P(e, e, zr - 0.35), fr.P(-e, e, zr - 0.35)]
        top = [fr.P(-s * 0.7, -s * 0.7, zr + 0.55), fr.P(s * 0.7, -s * 0.7, zr + 0.55), fr.P(s * 0.7, s * 0.7, zr + 0.55), fr.P(-s * 0.7, s * 0.7, zr + 0.55)]
        K.loft('roof_tile', [pts, top], ROOF)
        z = zr + 0.55; s *= 0.86
    K.cyl('lm_gold', (x, y, g + z), (x, y, g + z + 2.6), 0.18, (1, 1, 1, 1), n=6)

# ── California Academy of Sciences ───────────────────────────────────────────
def calacademy(C):
    """CALIFORNIA ACADEMY OF SCIENCES (Renzo Piano, 2008): a glass box under a
    2.5-acre living roof of native plants that rolls over seven hills — the two
    largest over the planetarium and the rainforest sphere — pierced by round
    skylights; a glass-and-photovoltaic canopy runs out round the edge. The
    outline is OpenStreetMap's (height 11 m)."""
    if C.era is not None and C.era < 2008: return
    rs = outer('calacademy')
    if not rs: return
    r = _clean(rs[0]); cx, cy = centroid(r); ang = orient(r)
    fr0 = Frame(cx, cy, ang)
    u0, u1, v0, v1 = extent(r, fr0)
    g = min(C.tg(*p) for p in r); K = C.K
    F = Frame(cx, cy, ang, g)
    H = 11.0
    hills = [(-37.0, 2.0, 21.0, 10.5), (37.0, 2.0, 21.0, 10.0), (-68.0, 30.0, 11.0, 4.5), (-68.0, -30.0, 11.0, 4.5),
             (68.0, 30.0, 11.0, 4.5), (68.0, -30.0, 11.0, 4.5), (0.0, 38.0, 11.0, 4.0)]
    def zroof(u, v):
        z = 0.0
        for (hu, hv, hr, hh) in hills:
            d2 = ((u - hu) ** 2 + (v - hv) ** 2) / (hr * hr)
            if d2 < 1.0: z = max(z, hh * (1 - d2) ** 1.4)
        return H + 0.4 + z
    K.prism('lm_steel', [(cx + (x - cx) * 0.98, cy + (y - cy) * 0.98) for x, y in r], g - 0.5, g + H, hexc('#2b3137'), top=False)
    step = 3.0
    nu = int((u1 - u0) / step); nv = int((v1 - v0) / step)
    for i in range(nu):
        for j in range(nv):
            ua, ub = u0 + i * (u1 - u0) / nu, u0 + (i + 1) * (u1 - u0) / nu
            va, vb = v0 + j * (v1 - v0) / nv, v0 + (j + 1) * (v1 - v0) / nv
            um, vm = (ua + ub) / 2, (va + vb) / 2
            if abs(um) < 12 and abs(vm) < 16:                                    # the piazza's glass roof
                K.face('lm_glasshouse', [F.P(ua, va, H + 0.5), F.P(ub, va, H + 0.5), F.P(ub, vb, H + 0.5), F.P(ua, vb, H + 0.5)], (1, 1, 1, 1))
                continue
            K.face('lawn', [F.P(ua, va, zroof(ua, va)), F.P(ub, va, zroof(ub, va)), F.P(ub, vb, zroof(ub, vb)), F.P(ua, vb, zroof(ua, vb))], (1, 1, 1, 1))
    # the round skylights on the hills
    rnd = np.random.default_rng(3)
    for (hu, hv, hr, hh) in hills:
        for k in range(int(hr * 1.2)):
            a = rnd.uniform(0, 2 * math.pi); rr = hr * math.sqrt(rnd.uniform(0.02, 0.7))
            u, v = hu + rr * math.cos(a), hv + rr * math.sin(a)
            p = F.P(u, v, zroof(u, v) + 0.25)
            K.disc('lm_paint', p[0], p[1], p[2], 1.0, hexc('#d8dbdc'), n=10)
            K.disc('lm_steel', p[0], p[1], p[2] + 0.03, 0.72, hexc('#1c2228'), n=10)
    # the canopy all round
    ro = [(cx + (x - cx) * 1.06, cy + (y - cy) * 1.06) for x, y in r]
    n = len(r)
    for i in range(n):
        j = (i + 1) % n
        K.face('lm_paint', [(r[i][0], r[i][1], g + H + 0.35), (r[j][0], r[j][1], g + H + 0.35), (ro[j][0], ro[j][1], g + H + 0.35), (ro[i][0], ro[i][1], g + H + 0.35)], hexc('#c9cdd0'))
        K.face('lm_paint', [(ro[j][0], ro[j][1], g + H + 0.35), (ro[i][0], ro[i][1], g + H + 0.35), (ro[i][0], ro[i][1], g + H - 0.3), (ro[j][0], ro[j][1], g + H - 0.3)], hexc('#9ea3a7'))

# ── Lombard Street, the crooked block ────────────────────────────────────────
def lombard(C):
    """LOMBARD STREET between Hyde and Leavenworth (1922): eight hairpin turns
    of red brick down a 27 % slope, the switchbacks planted with hedges and
    hydrangeas, stairs down both sides. The road is OpenStreetMap's centreline
    (157 nodes); it lies on the street surface the scene already has."""
    if C.era is not None and C.era < 1922: return
    rs = outer('lombard')
    if not rs: return
    cl = rs[0]
    K = C.K; sz = getattr(C, 'street_z', C.tg)
    a, b = cl[0], cl[-1]
    L = math.hypot(b[0] - a[0], b[1] - a[1]); d = ((b[0] - a[0]) / L, (b[1] - a[1]) / L); nrm = (-d[1], d[0])
    HALF = 9.6
    # the garden over the whole right of way, in cells, hedge and bloom
    n = int(L / 2.0); m = int(2 * HALF / 2.0)
    rnd = np.random.default_rng(5)
    for i in range(n):
        for j in range(m):
            t0, t1 = L * i / n, L * (i + 1) / n; s0, s1 = -HALF + 2 * HALF * j / m, -HALF + 2 * HALF * (j + 1) / m
            pts = []
            for (t, s_) in ((t0, s0), (t1, s0), (t1, s1), (t0, s1)):
                x, y = a[0] + d[0] * t + nrm[0] * s_, a[1] + d[1] * t + nrm[1] * s_
                pts.append((x, y, sz(x, y) + (0.08 if abs(s_) > HALF - 2.4 else 0.45)))
            edge = abs((s0 + s1) / 2) > HALF - 2.4
            col = hexc('#a7a39a') if edge else (hexc('#c86a92') if rnd.random() < 0.09 else hexc('#e3dcd2') if rnd.random() < 0.06 else hexc('#2f4a26') if rnd.random() < 0.6 else hexc('#3d5a2c'))   # hedges, a few pink and white hydrangeas (the 18 % pink read as red roofs)
            K.face('lm_matte', pts, col)
    # the brick road along the switchbacks, a curb each side
    pts = [tuple(p) for p in cl]
    for k in range(len(pts) - 1):
        (x1, y1), (x2, y2) = pts[k], pts[k + 1]
        Ls = math.hypot(x2 - x1, y2 - y1)
        if Ls < 1e-3: continue
        ox, oy = -(y2 - y1) / Ls * 2.9, (x2 - x1) / Ls * 2.9
        z1, z2 = sz(x1, y1) + 0.5, sz(x2, y2) + 0.5
        K.face('lm_matte', [(x1 - ox, y1 - oy, z1), (x2 - ox, y2 - oy, z2), (x2 + ox, y2 + oy, z2), (x1 + ox, y1 + oy, z1)], hexc('#8c3a2b'))
        for sgn in (-1, 1):
            K.face('lm_matte', [(x1 + sgn * ox, y1 + sgn * oy, z1), (x2 + sgn * ox, y2 + sgn * oy, z2), (x2 + sgn * ox * 1.08, y2 + sgn * oy * 1.08, z2 + 0.15), (x1 + sgn * ox * 1.08, y1 + sgn * oy * 1.08, z1 + 0.15)], hexc('#b3ada2'))
