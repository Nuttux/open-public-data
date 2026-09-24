"""The two great bridges, modelled from published dimensions.

GOLDEN GATE BRIDGE (1933-37). Towers, piers, struts: OpenStreetMap's 3D
tower parts (ODbL, (c) OpenStreetMap contributors) give the legs' stepped
cellular section and the height of every tier and strut: legs 90 ft (27.4 m)
apart, tiers 21-74-123-162-195-225 m, portal struts at 111-121, 151-161,
185-193, 215-223 m, below-deck struts at 24-26 and 50-52 m. Published
(Golden Gate Bridge Highway & Transportation District; HAER CA-31): towers
746 ft (227.4 m) above water, main span 4,200 ft (1,280 m; the OSM tower
centres are 1,284 m apart and are used), side spans 1,125 ft (343 m),
clearance 220 ft (67 m), stiffening truss 25 ft (7.6 m) deep, main cables
36 3/8 in (0.92 m) with a 470 ft (143 m) sag, suspenders every 50 ft
(15.2 m), International Orange. Pylons S1/S2, the Fort Point arch and the
south anchorage placed on their OSM footprints.

BAY BRIDGE (1936). West span: two back-to-back suspension spans sharing the
central anchorage (W-4), towers ~ 526 ft (160 m) above water... see bay().
"""
import math
from lm_kit import Frame, hexc, lerp

ORANGE = hexc('#c2432d')
ORANGE_D = hexc('#a8381f')
CONC = hexc('#b8b2a4')
CONC_D = hexc('#9d978a')
ASPH = hexc('#3a3a3c')
WALK = hexc('#8f8b84')

# ── Golden Gate ──────────────────────────────────────────────────────────────
GG_S = (-3510.76, 6012.75)              # south tower centre (OSM parts)
GG_N = (-3628.90, 7291.62)              # north tower centre
GG_L = math.hypot(GG_N[0] - GG_S[0], GG_N[1] - GG_S[1])
GG_ANG = math.atan2(-(GG_N[0] - GG_S[0]), GG_N[1] - GG_S[1])   # u axis: across the bridge, east-ish
LEG_U = 13.73                            # leg / cable centre, half of 90 ft
SIDE = 343.0
# (z0, z1, steps): steps = [(half_u, half_v), ...] of the stepped cellular leg
GG_TIERS = [
    (13.0, 21.0, [(4.8, 2.8), (3.8, 4.85), (2.7, 7.8)]),
    (21.0, 74.0, [(3.8, 1.85), (2.7, 3.75), (1.6, 6.95)]),
    (74.0, 123.0, [(3.8, 1.85), (2.7, 3.75), (1.6, 5.85)]),
    (123.0, 162.0, [(3.8, 1.85), (2.7, 2.8), (1.6, 4.9)]),
    (162.0, 195.0, [(2.7, 1.85), (1.6, 4.9)]),
    (195.0, 225.0, [(1.6, 3.75)]),
]
GG_STRUTS_ABOVE = [(111, 121), (151, 161), (185, 193), (215, 223)]
GG_STRUTS_BELOW = [(24, 26), (50, 52)]
GG_TOP = 227.4
SADDLE = 222.6
SAG = 143.3

def stepped_ring(steps):
    """the outline (u, v) of a cross-shaped cellular section: steps of
    (half-width across, half-length along), widest-across first"""
    q = [(steps[0][0], 0.0)]
    for k, (hu, hv) in enumerate(steps):
        q.append((hu, hv))
        if k + 1 < len(steps): q.append((steps[k + 1][0], hv))
    q.append((0.0, steps[-1][1]))
    # mirror into the four quadrants, counter-clockwise from +u
    ring = q + [(-u, v) for (u, v) in reversed(q)][1:] + [(-u, -v) for (u, v) in q][1:] + [(u, -v) for (u, v) in reversed(q)][1:-1]
    out = []
    for p in ring:
        if not out or (abs(out[-1][0] - p[0]) > 1e-6 or abs(out[-1][1] - p[1]) > 1e-6): out.append(p)
    # drop points in the middle of a straight run
    keep = []
    for i, p in enumerate(out):
        a, b = out[i - 1], out[(i + 1) % len(out)]
        if abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-9: keep.append(p)
    return keep

def gg_road(v):
    """roadway (deck top) elevation along the axis, m above MHW"""
    L = GG_L
    if 0 <= v <= L: return 71.0 + 4.6 * (1 - ((v - L / 2) / (L / 2)) ** 2)
    if -SIDE <= v < 0: return 71.0 + 3.5 * v / SIDE
    if L < v <= L + SIDE: return 71.0 - 3.5 * (v - L) / SIDE
    if v < -SIDE: return max(59.5, 67.5 + (v + SIDE) * 0.0145)
    return max(66.0, 67.5 - (v - L - SIDE) * 0.004)

def gg_cable(v):
    L = GG_L
    if 0 <= v <= L:
        t = v / L; return SADDLE - 4 * SAG * t * (1 - t)
    if v < 0:
        v0, z0 = -SIDE, gg_road(-SIDE) + 4.2
        if v < v0: return z0 + (v - v0) * 0.07       # down over the arch into the anchorage
        t = (v - v0) / SIDE; return z0 + (SADDLE - z0) * t - 4 * 11.0 * t * (1 - t)
    v1, z1 = L + SIDE, gg_road(L + SIDE) + 4.2
    if v > v1: return z1 - (v - v1) * 0.12
    t = (v - L) / SIDE; return SADDLE + (z1 - SADDLE) * t - 4 * 11.0 * t * (1 - t)

def golden_gate(C):
    K, era, tg = C.K, C.era, C.tg
    F = Frame(GG_S[0], GG_S[1], GG_ANG)
    L = GG_L
    stage = 9 if era is None else (0 if era < 1933 else 1 if era < 1935 else 2 if era < 1936 else 3 if era < 1937 else 9)
    if stage == 0: return
    P = F.P
    paint = 'lm_paint'

    # ── piers: the south one in the strait inside its fender, the north one on
    # the Marin shore at Lime Point
    def pier(v0, zb):
        ring = [P(u, v0 + v)[:2] for (u, v) in ((-25, -5), (-21, -11.5), (21, -11.5), (25, -5), (27.5, 0), (25, 5), (21, 11.5), (-21, 11.5), (-25, 5), (-27.5, 0))]
        K.prism('concrete', ring, zb, 13.0, CONC)
    pier(0.0, -4.0)
    pier(L, max(-4.0, min(10.0, tg(*P(0, L)[:2]) - 2)))
    # the south fender: a concrete ring round the pier, pointed up and down the
    # current (east-west), its wall a few metres over the water
    fr = []
    for i in range(40):
        a = 2 * math.pi * i / 40; c, s = math.cos(a), math.sin(a)
        u = 60 * c * (1 - 0.18 * s * s); v = 26 * s
        fr.append((u, v))
    outer = [P(u, v)[:2] for u, v in fr]
    inner = [P(u * 0.94, v * 0.88)[:2] for u, v in fr]
    n = len(fr)
    Vv = [(*p, -3.0) for p in outer] + [(*p, 5.5) for p in outer] + [(*p, 5.5) for p in inner] + [(*p, -3.0) for p in inner]
    Ff = []
    for i in range(n):
        j = (i + 1) % n
        Ff += [(i, j, n + j, n + i), (n + i, n + j, 2 * n + j, 2 * n + i), (2 * n + i, 2 * n + j, 3 * n + j, 3 * n + i)]
    K.mesh('concrete', Vv, Ff, CONC_D)
    # water inside the fender is the sea's own (the sea plane runs under it)

    # ── anchorages and pylons (concrete) ──
    zr_s = gg_road(-SIDE)
    def block(u0, u1, v0, v1, z0, z1, col=CONC, mat='concrete'):
        ring = [P(u0, v0)[:2], P(u1, v0)[:2], P(u1, v1)[:2], P(u0, v1)[:2]]
        K.prism(mat, ring, z0, z1, col)
    def pylon(v, top):
        for sgn in (-1, 1):
            u = sgn * 16.5
            g0 = tg(*P(u, v)[:2]) - 1.0
            block(u - 3.0, u + 3.0, v - 6.0, v + 6.0, g0, top - 6, CONC)
            block(u - 2.4, u + 2.4, v - 5.2, v + 5.2, top - 6, top - 2, CONC)
            block(u - 1.6, u + 1.6, v - 4.2, v + 4.2, top - 2, top, CONC)
            # vertical fluting: three recessed ribs a face
            for k in (-1, 0, 1):
                block(u + sgn * 3.0 - 0.15, u + sgn * 3.0 + 0.35 * sgn, v + k * 3.2 - 0.5, v + k * 3.2 + 0.5, g0 + 2, top - 7, CONC_D)
    if stage >= 1:
        pylon(-SIDE, zr_s + 14.0)
        pylon(-455.0, gg_road(-455.0) + 14.0)
        # south anchorage (OSM footprint, v ~ -460 .. -560)
        g_a = min(tg(*P(0, -470)[:2]), tg(*P(0, -550)[:2]))
        block(-21.5, 21.5, -560, -462, g_a - 2, gg_road(-470) - 1.2, CONC)
        # the cable housings stand either side of the roadway, never over it
        # (a block across the whole width sat on the deck, 2026-09-23)
        for sg in (-1, 1):
            block(min(sg * 14.4, sg * 19.0), max(sg * 14.4, sg * 19.0), -548, -474, gg_road(-470) - 1.2, gg_road(-470) + 3.0, CONC)
        # north anchorage at the end of the Marin side span
        vn = L + SIDE
        g_n = tg(*P(0, vn + 20)[:2])
        block(-22.0, 22.0, vn - 8, vn + 62, min(g_n, 20) - 2, gg_road(vn) - 1.2, CONC)
        for sg in (-1, 1):
            block(min(sg * 14.4, sg * 19.0), max(sg * 14.4, sg * 19.0), vn - 4, vn + 50, gg_road(vn) - 1.2, gg_road(vn) + 3.0, CONC)
        pylon(vn - 2.0, gg_road(vn) + 14.0)

    # ── the towers ──
    if stage >= 2:
        for vt in (0.0, L):
            for sgn in (-1, 1):
                for (z0, z1, steps) in GG_TIERS:
                    ring = [P(sgn * LEG_U + u, vt + v)[:2] for (u, v) in stepped_ring(steps)]
                    K.prism(paint, ring, z0, z1, ORANGE)
                # the cap and the saddle housing
                K.prism(paint, [P(sgn * LEG_U + u, vt + v)[:2] for (u, v) in stepped_ring([(1.35, 3.3)])], 225.0, GG_TOP - 0.6, ORANGE)
                K.prism(paint, [P(sgn * LEG_U + u, vt + v)[:2] for (u, v) in stepped_ring([(1.0, 2.6)])], GG_TOP - 0.6, GG_TOP, ORANGE)
            # portal struts over the roadway: a deep box with recessed panels
            for (z0, z1) in GG_STRUTS_ABOVE:
                hu = LEG_U - (3.8 if z1 <= 162 else 2.7 if z1 <= 195 else 1.6) + 0.05
                ring = [P(-hu, vt - 1.9)[:2], P(hu, vt - 1.9)[:2], P(hu, vt + 1.9)[:2], P(-hu, vt + 1.9)[:2]]
                K.prism(paint, ring, z0, z1, ORANGE)
                # the art-deco face: proud vertical ribs and bands, so the
                # panels between them read as recessed
                npn = 5; w = 2 * hu / npn
                for k in range(1, npn):
                    uc = -hu + k * w
                    K.box(paint, F, uc - 0.3, uc + 0.3, vt - 2.25, vt + 2.25, z0 + 0.7, z1 - 0.7, ORANGE_D, top=False)
                for zz in (z0, z1 - 0.7):
                    K.box(paint, F, -hu, hu, vt - 2.15, vt + 2.15, zz, zz + 0.7, ORANGE)
            for (z0, z1) in GG_STRUTS_BELOW:
                hu = LEG_U - 3.8 + 0.05
                K.prism(paint, [P(-hu, vt - 1.9)[:2], P(hu, vt - 1.9)[:2], P(hu, vt + 1.9)[:2], P(-hu, vt + 1.9)[:2]], z0, z1, ORANGE)
            # below the deck: cross bracing between the legs
            hu = LEG_U - 3.8
            for (za, zb) in ((26.0, 50.0), (52.0, 64.0)):
                for vv in (vt - 1.2, vt + 1.2):
                    K.beam(paint, P(-hu, vv, za), P(hu, vv, zb), 1.1, 1.6, ORANGE, up=F.V)
                    K.beam(paint, P(hu, vv, za), P(-hu, vv, zb), 1.1, 1.6, ORANGE, up=F.V)

    # ── cables and suspenders ──
    if stage >= 3:
        def cable_pts(v0, v1, step=6.0):
            n = max(2, int(abs(v1 - v0) / step))
            return [(v0 + (v1 - v0) * i / n) for i in range(n + 1)]
        for sgn in (-1, 1):
            u = sgn * LEG_U
            for (va, vb) in ((-560.0, 0.0), (0.0, L), (L, L + SIDE + 40.0)):
                pts = [P(u, v, gg_cable(v)) for v in cable_pts(va, vb)]
                K.tube('lm_paint', pts, 0.46, ORANGE, n=10)
            # suspenders every 50 ft, symmetric about mid-span
            vs = []
            k0 = int((L / 2) / 15.24)
            vs += [L / 2 + 15.24 * k for k in range(-k0, k0 + 1) if 8 < L / 2 + 15.24 * k < L - 8]
            vs += [-8.0 - 15.24 * k for k in range(0, int((SIDE - 12) / 15.24) + 1)]
            vs += [L + 8.0 + 15.24 * k for k in range(0, int((SIDE - 12) / 15.24) + 1)]
            for v in vs:
                zt = gg_cable(v) - 0.4; zb = gg_road(v) + 0.2
                if zt - zb < 0.6: continue
                for du in (-0.18, 0.18):
                    K.cyl('lm_paint', P(u + du, v, zb), P(u + du, v, zt), 0.06, ORANGE, n=4, smooth=False)

    # ── the deck: stiffening trusses, floor, roadway ──
    if stage >= 9:
        vA, vB = -SIDE - 2, L + SIDE + 2
        PAN = 7.62
        # the suspended deck, south side span to north side span
        vs_ = [vA + PAN * i for i in range(int((vB - vA) / PAN) + 1)]
        for sgn in (-1, 1):
            u = sgn * LEG_U
            # chords as polylines of short beams (the deck is cambered)
            for k in range(len(vs_) - 1):
                va, vb = vs_[k], vs_[k + 1]
                ta, tb = gg_road(va) - 0.35, gg_road(vb) - 0.35
                K.beam(paint, P(u, va, ta), P(u, vb, tb), 0.7, 0.9, ORANGE, up=(0, 0, 1))
                K.beam(paint, P(u, va, ta - 7.3), P(u, vb, tb - 7.3), 0.7, 1.1, ORANGE, up=(0, 0, 1))
                K.beam(paint, P(u, va, ta - 7.3), P(u, va, ta), 0.45, 0.6, ORANGE, up=F.V)
                if k % 2 == 0: K.beam(paint, P(u, va, ta - 7.3), P(u, vb, tb), 0.4, 0.55, ORANGE, up=F.V)
                else: K.beam(paint, P(u, va, ta), P(u, vb, tb - 7.3), 0.4, 0.55, ORANGE, up=F.V)
        # floor beams and bottom lateral bracing
        for k in range(len(vs_) - 1):
            va, vb = vs_[k], vs_[k + 1]
            za, zb = gg_road(va) - 7.65, gg_road(vb) - 7.65
            K.beam(paint, P(-LEG_U, va, za), P(LEG_U, va, za), 0.5, 0.9, ORANGE_D)
            if k % 2 == 0:
                K.beam(paint, P(-LEG_U, va, za), P(LEG_U, vb, zb), 0.35, 0.4, ORANGE_D)
                K.beam(paint, P(LEG_U, va, za), P(-LEG_U, vb, zb), 0.35, 0.4, ORANGE_D)
        _deck_surface(K, P, vA, -560.0 if False else vA, vB, gg_road, 14.0)
        # approaches: the south viaduct over the anchorage and the bluff to the
        # toll plaza, the north one over the Lime Point valley
        # south of the anchorage the viaduct bends east to the toll plaza (OSM
        # ways 537838948 / 595194543, bridge=yes to ~ v -670: their mid-line
        # below); a straight deck ran on over the bluff. The deck is sheared
        # along the bend, not turned: 11 % narrower at its end, unseen at 37 cm
        BEND = [(-480.0, 0.0), (-537.0, 4.3), (-562.0, 9.8), (-590.0, 18.5), (-616.0, 31.0), (-644.0, 45.0), (-670.0, 59.4), (-700.0, 76.0)]
        def uc(v):
            if v >= BEND[0][0]: return 0.0
            for (va_, ua), (vb_, ub) in zip(BEND, BEND[1:]):
                if vb_ <= v <= va_: return ua + (ub - ua) * (v - va_) / (vb_ - va_)
            return BEND[-1][1] + (v - BEND[-1][0]) * (BEND[-1][1] - BEND[-2][1]) / (BEND[-1][0] - BEND[-2][0])
        P2 = lambda u, v, z=0.0: P(u + uc(v), v, z)
        _viaduct(C, K, P2, -690.0, vA, gg_road, 14.0, ORANGE)
        _viaduct(C, K, P, vB, L + SIDE + 200.0, gg_road, 14.0, ORANGE)
        # the Fort Point arch (between S1 and S2, over the fort)
        va, vb = -SIDE - 6.0, -455.0 + 6.0
        vc = (va + vb) / 2; half = (vb - va) / 2
        zs = 9.0; zc = gg_road(vc) - 10.5
        for sgn in (-1, 1):
            u = sgn * 14.8
            pts = []
            for i in range(41):
                v = va + (vb - va) * i / 40
                pts.append(P(u, v, zs + (zc - zs) * (1 - ((v - vc) / half) ** 2)))
            for i in range(40):
                K.beam(paint, pts[i], pts[i + 1], 1.4, 2.6, ORANGE, up=F.U)
            for i in range(2, 40, 3):
                vi = va + (vb - va) * i / 40
                K.beam(paint, pts[i], P(u, vi, gg_road(vi) - 1.0), 0.8, 0.8, ORANGE, up=F.V)
        for i in range(2, 40, 4):
            v = va + (vb - va) * i / 40; z = zs + (zc - zs) * (1 - ((v - vc) / half) ** 2)
            K.beam(paint, P(-14.8, v, z), P(14.8, v, z), 0.8, 1.2, ORANGE_D)

def _deck_surface(K, P, va_, vb_unused, vb, road, half):
    """roadway (asphalt), sidewalks (concrete), railings, from va_ to vb"""
    step = 7.62
    n = int((vb - va_) / step)
    vs = [va_ + (vb - va_) * i / n for i in range(n + 1)]
    def strip(mat, u0, u1, dz, col):
        V, Fc = [], []
        for i, v in enumerate(vs):
            z = road(v) + dz
            V += [P(u0, v, z), P(u1, v, z)]
            if i: Fc.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
        K.mesh(mat, V, Fc, col)
    strip('asphalt', -9.45, 9.45, 0.0, ASPH)
    strip('sidewalk', -13.6, -9.45, 0.2, WALK)
    strip('sidewalk', 9.45, 13.6, 0.2, WALK)
    # curbs, the slab edge and the railings
    for sgn in (-1, 1):
        V, Fc = [], []
        for i, v in enumerate(vs):
            z = road(v)
            V += [P(sgn * 9.45, v, z), P(sgn * 9.45, v, z + 0.2)]
            if i: Fc.append((2 * i - 2, 2 * i, 2 * i + 1, 2 * i - 1) if sgn > 0 else (2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
        K.mesh('lm_paint', V, Fc, hexc('#9a968e'))
        # slab fascia under the sidewalk edge, and the railing
        V, Fc = [], []
        for i, v in enumerate(vs):
            z = road(v)
            V += [P(sgn * 13.9, v, z - 1.0), P(sgn * 13.9, v, z + 0.2)]
            if i: Fc.append((2 * i - 2, 2 * i, 2 * i + 1, 2 * i - 1) if sgn < 0 else (2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
        K.mesh('lm_paint', V, Fc, ORANGE)
        V, Fc = [], []
        for i, v in enumerate(vs):
            z = road(v) + 0.2
            V += [P(sgn * 13.75, v, z), P(sgn * 13.75, v, z + 1.25)]
            if i: Fc.append((2 * i - 2, 2 * i, 2 * i + 1, 2 * i - 1))
        K.mesh('lm_paint', V, Fc, ORANGE)
        # centre median barrier (the moveable one) and lane lines
    V, Fc = [], []
    for i, v in enumerate(vs):
        z = road(v)
        V += [P(-0.3, v, z), P(-0.3, v, z + 0.8), P(0.3, v, z + 0.8), P(0.3, v, z)]
        if i:
            a = 4 * (i - 1); b = 4 * i
            Fc += [(a, b, b + 1, a + 1), (a + 1, b + 1, b + 2, a + 2), (a + 2, b + 2, b + 3, a + 3)]
    K.mesh('lm_paint', V, Fc, hexc('#c9c3b0'))
    for u in (-6.3, -3.15, 3.15, 6.3):
        for v in vs[::2]:
            z = road(v) + 0.012
            K.face('lm_paint', [P(u - 0.06, v, z), P(u + 0.06, v, z), P(u + 0.06, v + 3.0, road(v + 3.0) + 0.012), P(u - 0.06, v + 3.0, road(v + 3.0) + 0.012)], hexc('#d8d6d0'))

def _viaduct(C, K, P, va, vb, road, half, col):
    """a deck truss on steel bents from the ground up, where the ground is
    below the roadway"""
    step = 7.62
    n = max(1, int((vb - va) / step))
    vs = [va + (vb - va) * i / n for i in range(n + 1)]
    gz = [C.tg(*P(0, v)[:2]) for v in vs]
    keep = [road(v) - g > 3.0 for v, g in zip(vs, gz)]
    if not any(keep): return
    i0 = keep.index(True); i1 = len(keep) - 1 - keep[::-1].index(True)
    i0 = max(0, i0 - 1); i1 = min(len(vs) - 1, i1 + 1)
    sub = vs[i0:i1 + 1]
    _deck_surface(K, P, sub[0], None, sub[-1], road, half)
    for sgn in (-1, 1):
        u = sgn * 12.0
        for k in range(len(sub) - 1):
            va_, vb_ = sub[k], sub[k + 1]
            K.beam('lm_paint', P(u, va_, road(va_) - 0.4), P(u, vb_, road(vb_) - 0.4), 0.6, 0.8, col)
            K.beam('lm_paint', P(u, va_, road(va_) - 5.0), P(u, vb_, road(vb_) - 5.0), 0.6, 0.8, col)
            K.beam('lm_paint', P(u, va_, road(va_) - 5.0), P(u, vb_, road(vb_) - 0.4), 0.35, 0.45, col)
    # bents every ~45 m
    for k in range(0, len(sub), 6):
        v = sub[k]; zt = road(v) - 5.0
        if any(a <= v <= b for a, b in C.no_bents): continue
        for sgn in (-1, 1):
            g = C.tg(*P(sgn * 12.0, v)[:2])
            if zt - g < 2.0: continue
            K.beam('lm_paint', P(sgn * 12.0, v, g - 1.0), P(sgn * 12.0, v, zt), 1.6, 2.4, col, up=(0, 1, 0))
        K.beam('lm_paint', P(-12.0, v, zt), P(12.0, v, zt), 1.0, 1.4, col)


# ── the San Francisco–Oakland Bay Bridge, west spans ─────────────────────────
# OSM tower/pier footprints (ODbL): W2 (4592.0, 3423.4) and W6 (5993.3, 5078.7)
# on an axis at 49.75 deg; along it (m from W2): W1 cable bent -357.6, W3
# 705.1, central anchorage W4 1084.6, W5 1463.5, W6 2168.8, Yerba Buena
# anchorage 2542.3. Published (Caltrans; HAER CA-32): two suspension spans of
# 2,310 ft (704 m) main span sharing the central anchorage, towers 526 ft
# (160 m, OSM 160) above water, a double-deck stiffening truss (upper deck
# westbound, lower eastbound), the Yerba Buena tunnel 76 ft wide, 58 ft high,
# 540 ft long; aluminium-grey paint.
BAY_W2 = (4592.0, 3423.4)
BAY_ANG = math.radians(49.7475)
BAY_TOWERS = [0.0, 705.1, 1463.5, 2168.8]
BAY_W1, BAY_W4, BAY_YBA = -357.6, 1084.6, 2542.3
SILVER = hexc('#a3a8aa')
SILVER_D = hexc('#80868a')
BAY_TOP = 160.0
BAY_SADDLE = 156.5
BAY_CAB = 10.05                      # cable planes, half of 66 ft
BAY_TRUSS = 9.1

# west of the W1 cable bent the approach climbs at a steady ~3 %: USGS 3DEP
# lidar, class 17 (bridge deck), upper deck 41.4 m at v -795, 43.7 at -705,
# 46.4 at -615, 48.2 at -555, 54.1 at -355 (freeways/bay_approach_lidar.json).
# It crosses Rincon Hill ~18 m up, it does not land there: the 23-25 m first
# used came from the bare earth under it. The I-80 viaduct (the freeways
# agent's) takes over at v -705 at that height
_BAY_APPROACH = [(-795.0, 41.4), (-705.0, 43.7), (-615.0, 46.4), (-555.0, 48.2), (-357.6, 54.1)]
BAY_APPROACH_END = -705.0
_BAY_ROAD = [(-357.6, 54.1), (0.0, 63.5), (352.5, 70.0), (705.1, 66.0), (1084.6, 63.5),
             (1463.5, 66.0), (1816.0, 70.0), (2168.8, 63.5), (2542.3, 57.0), (2700.0, 54.0)]
def bay_road(v):
    """top of the upper deck, m above MHW (smooth through the control points)"""
    if v < _BAY_APPROACH[-1][0]:
        A = _BAY_APPROACH
        if v <= A[0][0]: return A[0][1]
        for (a, za), (b, zb) in zip(A, A[1:]):
            if v <= b: return za + (zb - za) * (v - a) / (b - a)
    P = _BAY_ROAD
    if v <= P[0][0]: return P[0][1]
    for (a, za), (b, zb) in zip(P, P[1:]):
        if v <= b:
            t = (v - a) / (b - a); t = t * t * (3 - 2 * t)
            return za + (zb - za) * t
    return P[-1][1]

def bay_cable(v):
    T = BAY_TOWERS
    def para(va, za, vb, zb, sag):
        t = (v - va) / (vb - va); return za + (zb - za) * t - 4 * sag * t * (1 - t)
    if v < BAY_W1:
        # from the W1 cable bent straight down into the San Francisco anchorage
        # (its top: bay_road(-560) - BAY_TRUSS - 0.5, see bay_bridge)
        za, zb = bay_road(BAY_W1) + 3.0, bay_road(-560.0) - BAY_TRUSS
        return za + (zb - za) * (BAY_W1 - v) / (BAY_W1 + 560.0)
    if v < T[0]: return para(BAY_W1, bay_road(BAY_W1) + 3.0, T[0], BAY_SADDLE, 9.0)
    if v < T[1]: return para(T[0], BAY_SADDLE, T[1], BAY_SADDLE, BAY_SADDLE - bay_road(352.5) - 2.8)
    if v < BAY_W4: return para(T[1], BAY_SADDLE, BAY_W4, bay_road(BAY_W4) + 7.0, 9.0)
    if v < T[2]: return para(BAY_W4, bay_road(BAY_W4) + 7.0, T[2], BAY_SADDLE, 9.0)
    if v < T[3]: return para(T[2], BAY_SADDLE, T[3], BAY_SADDLE, BAY_SADDLE - bay_road(1816.0) - 2.8)
    if v < BAY_YBA: return para(T[3], BAY_SADDLE, BAY_YBA, bay_road(BAY_YBA) + 3.0, 9.0)
    return bay_road(BAY_YBA) + 3.0 - (v - BAY_YBA) * 0.1

def bay_bridge(C):
    K, era, tg = C.K, C.era, C.tg
    stage = 9 if era is None else (0 if era < 1933 else 1 if era < 1935 else 2 if era < 1936 else 9)
    if stage == 0: return
    F = Frame(BAY_W2[0], BAY_W2[1], BAY_ANG - math.pi / 2)     # u across, v along (towards Yerba Buena)
    P = F.P
    paint = 'lm_paint'
    # piers: concrete caissons with rounded ends
    def caisson(v, hu, hv, top):
        ring = []
        for k in range(24):
            a = 2 * math.pi * k / 24
            u = hu * (1 if math.cos(a) >= 0 else -1) * min(1.0, abs(math.cos(a)) * 3) if False else None
        ring = [P(-hu + hv, v - hv)[:2], P(hu - hv, v - hv)[:2]] + \
               [P(hu - hv + hv * math.cos(a), v + hv * math.sin(a))[:2] for a in [(-math.pi / 2 + math.pi * k / 8) for k in range(1, 8)]] + \
               [P(hu - hv, v + hv)[:2], P(-hu + hv, v + hv)[:2]] + \
               [P(-hu + hv + hv * math.cos(a), v + hv * math.sin(a))[:2] for a in [(math.pi / 2 + math.pi * k / 8) for k in range(1, 8)]]
        K.prism('concrete', ring, -4.0, top, CONC_D)
    for vt in BAY_TOWERS: caisson(vt, 22.0, 7.5, 11.0)
    # the central anchorage: a concrete mass from the bay to above the deck
    va = BAY_W4
    ring = [P(-17.0, va - 34.0)[:2], P(17.0, va - 34.0)[:2], P(17.0, va + 34.0)[:2], P(-17.0, va + 34.0)[:2]]
    K.prism('concrete', [P(-19.0, va - 36.0)[:2], P(19.0, va - 36.0)[:2], P(19.0, va + 36.0)[:2], P(-19.0, va + 36.0)[:2]], -4.0, 10.0, CONC_D)
    K.prism('concrete', ring, 10.0, bay_road(va) - BAY_TRUSS - 1.0, CONC)
    K.box('concrete', F, -14.5, 14.5, va - 26.0, va + 26.0, bay_road(va) - BAY_TRUSS - 1.0, bay_road(va) + 8.5, CONC)
    for vv in (va - 26.0, va + 26.0):
        K.box('concrete', F, -14.5, 14.5, vv - 1.5, vv + 1.5, bay_road(va) + 8.5, bay_road(va) + 11.0, CONC_D)
    # the San Francisco anchorage (Rincon Hill) and the Yerba Buena one
    for (v0, v1) in ((-600.0, -520.0), (BAY_YBA - 10.0, BAY_YBA + 40.0)):
        g = min(tg(*P(0, v0)[:2]), tg(*P(0, v1)[:2]))
        K.box('concrete', F, -18.0, 18.0, v0, v1, g - 2.0, bay_road((v0 + v1) / 2) - BAY_TRUSS - 0.5, CONC)
    if stage >= 2:
        for vt in BAY_TOWERS:
            _bay_tower(K, F, vt, paint)
    if stage >= 9:
        # cables and suspenders
        vs = [BAY_W1 - 200.0 + 6.0 * i for i in range(int((BAY_YBA + 60 - BAY_W1 + 200) / 6.0) + 1)]
        for sgn in (-1, 1):
            pts = [P(sgn * BAY_CAB, v, bay_cable(v)) for v in vs if v <= BAY_YBA + 40]
            # break the polyline at the saddles and the W4 anchorage so the sweep does not smear the kinks
            K.tube(paint, pts, 0.36, SILVER, n=8)
            for v in [BAY_W1 + 9.14 * k for k in range(1, 400)]:
                if v >= BAY_YBA - 4: break
                if any(abs(v - t) < 6 for t in BAY_TOWERS) or abs(v - BAY_W4) < 40: continue
                zt = bay_cable(v) - 0.3; zb = bay_road(v) + 0.1
                if zt - zb < 0.8: continue
                K.cyl(paint, P(sgn * BAY_CAB, v, zb), P(sgn * BAY_CAB, v, zt), 0.07, SILVER, n=4, smooth=False)
        # the double-deck stiffening truss, W1 to the Yerba Buena anchorage
        _bay_truss(K, P, BAY_APPROACH_END, BAY_YBA + 150.0, paint)
        # the truss's west end sits on a steel bent; the freeway viaduct goes on from it
        g = min(tg(*P(u, BAY_APPROACH_END)[:2]) for u in (-11.0, 11.0))
        for sg in (-1, 1):
            K.beam(paint, P(sg * 9.0, BAY_APPROACH_END + 2.0, g - 1.0), P(sg * 9.0, BAY_APPROACH_END + 2.0, bay_road(BAY_APPROACH_END) - BAY_TRUSS - 0.3), 1.6, 2.4, SILVER, up=(0, 1, 0))
        K.beam(paint, P(-10.5, BAY_APPROACH_END + 2.0, bay_road(BAY_APPROACH_END) - BAY_TRUSS - 0.8), P(10.5, BAY_APPROACH_END + 2.0, bay_road(BAY_APPROACH_END) - BAY_TRUSS - 0.8), 1.2, 1.6, SILVER)
    # the Yerba Buena tunnel's west portal, the viaduct's end
    vp = 2668.0; g = tg(*P(0, vp)[:2])
    zt = bay_road(vp)
    K.box('concrete', F, -24.0, 24.0, vp, vp + 6.0, min(g, zt - 16) - 2, zt + 7.0, CONC)
    for (z0, z1) in ((zt - BAY_TRUSS - 0.4, zt - 2.6), (zt + 0.1, zt + 5.6)):
        pts = [P(-14.0, vp - 0.05, z0), P(14.0, vp - 0.05, z0)] + [P(14.0 * math.cos(math.pi * k / 10), vp - 0.05, z1 + 2.0 * math.sin(math.pi * k / 10)) for k in range(0, 11)]
        K.face('lm_steel', pts[::-1], hexc('#15171a'))

def _bay_tower(K, F, vt, paint):
    P = F.P
    z0, z1 = 11.0, BAY_TOP
    def leg_u(z): t = (z - z0) / (z1 - z0); return 12.6 + (10.6 - 12.6) * t
    def leg_w(z): t = (z - z0) / (z1 - z0); return 3.2 + (2.0 - 3.2) * t      # half width across
    def leg_d(z): t = (z - z0) / (z1 - z0); return 4.8 + (3.0 - 4.8) * t      # half depth along
    for sgn in (-1, 1):
        rings = []
        for z in (z0, 60.0, 110.0, z1):
            u, w, dd = leg_u(z), leg_w(z), leg_d(z)
            rings.append([P(sgn * u - w, vt - dd, z), P(sgn * u + w, vt - dd, z), P(sgn * u + w, vt + dd, z), P(sgn * u - w, vt + dd, z)])
        K.loft(paint, rings, SILVER)
        # the cap over the saddle
        u = leg_u(z1)
        K.box(paint, F, sgn * u - 2.4, sgn * u + 2.4, vt - 3.4, vt + 3.4, z1, z1 + 1.6, SILVER_D) if False else None
        ring = [P(sgn * u - 2.4, vt - 3.4)[:2], P(sgn * u + 2.4, vt - 3.4)[:2], P(sgn * u + 2.4, vt + 3.4)[:2], P(sgn * u - 2.4, vt + 3.4)[:2]]
        K.prism(paint, ring, z1, z1 + 1.8, SILVER_D)
    # the X-bracing between the legs: panels below and above the deck
    levels = [14.0, 36.0, 50.0] + [bay_road(vt) + 6.0, 92.0, 116.0, 138.0, 152.0]
    for i, z in enumerate(levels):
        ui = leg_u(z) - leg_w(z)
        for dv in (-2.6, 2.6):
            K.beam(paint, P(-ui, vt + dv, z), P(ui, vt + dv, z), 1.0, 1.6, SILVER)
        if i + 1 < len(levels) and not (levels[i + 1] > bay_road(vt) - BAY_TRUSS - 1 and z < bay_road(vt) + 1):
            za, zb = z, levels[i + 1]
            ua, ub = leg_u(za) - leg_w(za), leg_u(zb) - leg_w(zb)
            for dv in (-2.6, 2.6):
                K.beam(paint, P(-ua, vt + dv, za), P(ub, vt + dv, zb), 0.7, 1.0, SILVER)
                K.beam(paint, P(ua, vt + dv, za), P(-ub, vt + dv, zb), 0.7, 1.0, SILVER)
    K.beam(paint, P(-leg_u(z1), vt, z1 - 2.0), P(leg_u(z1), vt, z1 - 2.0), 2.4, 4.0, SILVER)

def _bay_truss(K, P, va, vb, paint):
    PAN = 9.14
    n = int((vb - va) / PAN)
    vs = [va + PAN * i for i in range(n + 1)]
    for sgn in (-1, 1):
        u = sgn * BAY_CAB
        for k in range(n):
            a, b = vs[k], vs[k + 1]
            ta, tb = bay_road(a) - 0.3, bay_road(b) - 0.3
            K.beam(paint, P(u, a, ta), P(u, b, tb), 0.7, 0.9, SILVER)
            K.beam(paint, P(u, a, ta - BAY_TRUSS), P(u, b, tb - BAY_TRUSS), 0.7, 0.9, SILVER)
            K.beam(paint, P(u, a, ta - BAY_TRUSS), P(u, a, ta), 0.4, 0.5, SILVER)
            if k % 2 == 0: K.beam(paint, P(u, a, ta - BAY_TRUSS), P(u, b, tb), 0.36, 0.45, SILVER)
            else: K.beam(paint, P(u, a, ta), P(u, b, tb - BAY_TRUSS), 0.36, 0.45, SILVER)
    # decks: upper (asphalt on top), lower (seen through the truss)
    def strip(mat, u0, u1, dz, col, step=2):
        V, Fc = [], []
        for i, v in enumerate(vs[::step]):
            z = bay_road(v) + dz
            V += [P(u0, v, z), P(u1, v, z)]
            if i: Fc.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
        K.mesh(mat, V, Fc, col)
    strip('asphalt', -9.2, 9.2, 0.0, ASPH)
    strip('lm_paint', -10.2, 10.2, -0.55, SILVER_D)            # the upper deck's underside edge
    strip('asphalt', -9.2, 9.2, -BAY_TRUSS + 0.4, ASPH)
    for u in (-6.1, -3.05, 0.0, 3.05, 6.1):
        for v in vs[::2]:
            z = bay_road(v) + 0.012
            K.face('lm_paint', [P(u - 0.06, v, z), P(u + 0.06, v, z), P(u + 0.06, v + 3.0, bay_road(v + 3.0) + 0.012), P(u - 0.06, v + 3.0, bay_road(v + 3.0) + 0.012)], hexc('#d8d6d0'))
    for sgn in (-1, 1):                                         # railings
        V, Fc = [], []
        for i, v in enumerate(vs[::2]):
            z = bay_road(v)
            V += [P(sgn * 9.3, v, z), P(sgn * 9.3, v, z + 1.1)]
            if i: Fc.append((2 * i - 2, 2 * i, 2 * i + 1, 2 * i - 1))
        K.mesh('lm_paint', V, Fc, SILVER)


# ── the Bay Bridge east span: the self-anchored suspension span (2013) ───────
# OSM (ODbL): the tower at (6996.1, 6152.1), 160 m; the span's deck marks run
# from (6879, 6065) to (7337, 6397) — 565 m, the published back span (180 m)
# plus main span (385 m). Published (Caltrans, T.Y. Lin / Moffatt & Nichol):
# a single tower of four pentagonal steel legs joined by shear links, 525 ft;
# twin orthotropic box-girder decks; one main cable looped round the west end
# and anchored into the deck at the east end; white. The skyway beyond: twin
# concrete box girders descending on paired piers towards Oakland.
SAS_A = (6862.0, 6052.0)
SAS_B = (7346.0, 6403.0)
SAS_T = (6996.1, 6152.1)
SAS_WHITE = hexc('#dfe0dd')
SAS_CONC = hexc('#c9c4b8')

def sas(C):
    if C.era is not None and C.era < 2013: return
    K, tg = C.K, C.tg
    ax, ay = SAS_A; bx, by = SAS_B
    L = math.hypot(bx - ax, by - ay); ang = math.atan2(by - ay, bx - ax)
    F = Frame(ax, ay, ang - math.pi / 2)          # u across (south = +u?), v along from A to B
    P = F.P
    vt = F.uv(*SAS_T)[1]; ut = F.uv(*SAS_T)[0]
    ZD = 49.0                                       # deck level (top)
    def road(v): return ZD - 0.004 * max(0.0, v - vt)
    # the two decks (box girders), a gap between them for the tower
    for (u0, u1) in ((-34.0, -9.0), (9.0, 34.0)):
        V, Fc = [], []
        n = 60
        for i in range(n + 1):
            v = -40.0 + (L + 80.0) * i / n; z = road(v)
            V += [P(u0, v, z), P(u1, v, z), P(u1, v, z - 5.5), P(u0, v, z - 5.5)]
            if i:
                a, b = 4 * (i - 1), 4 * i
                Fc += [(a, a + 1, b + 1, b), (a + 1, a + 2, b + 2, b + 1), (a + 2, a + 3, b + 3, b + 2), (a + 3, a, b, b + 3)]
        K.mesh('lm_paint', V, Fc, SAS_WHITE)
        # the road surface a hair above, lane lines
        K.face('asphalt', [P(u0 + 1.0, -40.0, road(-40.0) + 0.02), P(u1 - 1.0, -40.0, road(-40.0) + 0.02), P(u1 - 1.0, L + 40.0, road(L + 40.0) + 0.02), P(u0 + 1.0, L + 40.0, road(L + 40.0) + 0.02)], ASPH)
    # the tower: four pentagonal legs round the centre, shear links between
    for (du, dv) in ((-3.0, -3.0), (3.0, -3.0), (3.0, 3.0), (-3.0, 3.0)):
        cx_, cy_ = P(ut + du, vt + dv)[:2]
        ring = []
        for k in range(5):
            a = 2 * math.pi * k / 5 + math.atan2(dv, du)
            ring.append((cx_ + 2.7 * math.cos(a), cy_ + 2.7 * math.sin(a)))
        K.prism('lm_paint', ring, -3.0, 158.0, SAS_WHITE)
    for z in range(20, 150, 14):
        for (a, b) in (((-3.0, -3.0), (3.0, -3.0)), ((-3.0, 3.0), (3.0, 3.0)), ((-3.0, -3.0), (-3.0, 3.0)), ((3.0, -3.0), (3.0, 3.0))):
            K.beam('lm_paint', P(ut + a[0], vt + a[1], z), P(ut + b[0], vt + b[1], z), 0.9, 1.4, SAS_WHITE)
    K.box('lm_paint', Frame(*P(ut, vt)[:2], ang - math.pi / 2), -6.5, 6.5, -6.5, 6.5, 158.0, 160.0, SAS_WHITE)
    K.box('concrete', Frame(*P(ut, vt)[:2], ang - math.pi / 2), -14.0, 14.0, -12.0, 12.0, -4.0, 8.0, SAS_CONC)
    # the cable: two strands from the east end up over the tower and down to
    # the west end, where it loops under the deck
    def cable_z(v):
        if v >= vt:
            t = (v - vt) / (L - vt); return 158.0 + (road(L) + 2.0 - 158.0) * t - 4 * 34.0 * t * (1 - t)
        t = (vt - v) / vt; return 158.0 + (road(0) + 2.0 - 158.0) * t - 4 * 12.0 * t * (1 - t)
    for sgn in (-1, 1):
        pts = []
        for i in range(81):
            v = L * i / 80
            uc = ut + sgn * (1.5 + 7.5 * min(1.0, abs(v - vt) / 60.0))
            pts.append(P(uc, v, cable_z(v)))
        K.tube('lm_paint', pts, 0.4, SAS_WHITE, n=8)
        for i in range(1, 80):
            v = L * i / 80
            if abs(v - vt) < 12: continue
            uc = ut + sgn * (1.5 + 7.5 * min(1.0, abs(v - vt) / 60.0))
            zt = cable_z(v); zb = road(v)
            if zt - zb > 1.0: K.cyl('lm_paint', P(uc, v, zb), P(uc, v, zt), 0.08, SAS_WHITE, n=4, smooth=False)
    K.tube('lm_paint', [P(ut + 9.0 * math.cos(math.pi * k / 12), -6.0 * math.sin(math.pi * k / 12), road(0) - 3.0) for k in range(13)], 0.4, SAS_WHITE, n=8)
    # piers at the ends, the skyway on to the east, the transition to the tunnel
    for v in (0.0, L):
        for u in (-21.5, 21.5):
            K.box('concrete', Frame(*P(u, v)[:2], ang - math.pi / 2), -4.0, 4.0, -3.0, 3.0, -4.0, road(v) - 5.5, SAS_CONC)
    for k in range(1, 12):
        v = L + 160.0 * k; z = road(L) - 0.022 * (v - L)
        if z < 12: break
        for (u0, u1) in ((-34.0, -9.0), (9.0, 34.0)):
            va, vb = v - 160.0, v
            za, zb = road(L) - 0.022 * (va - L), z
            K.loft('concrete', [[P(u0, va, za), P(u1, va, za), P(u1, va, za - 4.5), P(u0, va, za - 4.5)],
                                 [P(u0, vb, zb), P(u1, vb, zb), P(u1, vb, zb - 4.5), P(u0, vb, zb - 4.5)]], SAS_CONC, cap_top=False)
            K.face('asphalt', [P(u0 + 1.0, va, za + 0.02), P(u1 - 1.0, va, za + 0.02), P(u1 - 1.0, vb, zb + 0.02), P(u0 + 1.0, vb, zb + 0.02)], ASPH)
            uc = (u0 + u1) / 2
            K.box('concrete', Frame(*P(uc, vb)[:2], ang - math.pi / 2), -3.5, 3.5, -2.5, 2.5, -4.0, zb - 4.5, SAS_CONC)
    # the transition from the Yerba Buena tunnel's east portal
    ex, ey = 6448.0, 5622.0
    E0 = F.uv(ex, ey)
    for (u0, u1) in ((-34.0, -9.0), (9.0, 34.0)):
        pts0 = [P(u0, -40.0, road(-40.0)), P(u1, -40.0, road(-40.0))]
        uu0, uu1 = E0[0] + (u0 + 34.0) * 0.4 - 11.0, E0[0] + (u1 + 34.0) * 0.4 - 11.0
        pts1 = [P(uu0, E0[1], 52.0), P(uu1, E0[1], 52.0)]
        K.face('lm_paint', [pts1[0], pts1[1], pts0[1], pts0[0]], SAS_CONC)
