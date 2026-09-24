"""San Francisco's tree kinds as procedural protos (veg_geom meshes), and their
Blender build. Each proto: one mesh, ONE material (a colour ramp over the
vertex float `vc`, see veg_geom), its foot at the origin, well under 20 k faces.

What each one is drawn after (seen from 29° above the horizon at 37 cm/px, a
20 m crown is ~54 px: the silhouette, the gaps and the colour carry it):
  eucalyptus    Eucalyptus globulus, the blue gum of Sutro, the Presidio, GG Park,
                McLaren, Mount Davidson: a tall straight pale trunk forking high,
                an open crown of separate, vertically drawn-out clumps of
                hanging leaves (the "streaky" look), grey-green.
  cypress       Cupressus macrocarpa: a short massive trunk splitting into a few
                big spreading limbs, a broad FLAT-TOPPED crown of dense
                horizontal plates, dark green; wind-sheared (variant b).
  mpine         Pinus radiata: a straight trunk, a rounded, irregular, bumpy dome
                of dense tufts, dark green a shade warmer than the cypress.
  broadleaf     one generator for the street kinds: plane (broad, light green),
                round evergreen (brisbane box, Victorian box, ficus, magnolia),
                pohutukawa (dark, dense, low dome, a red flush), columnar
                (ginkgo, pear, Italian cypress), small ornamentals (cherry,
                purple-leaf plum, olive).
  palms         Canary Island date palm, Mexican fan palm, queen palm, small fan
                palm / cordyline: after lm_palms.py (landmarks agent, 23/09),
                with this kit's single ramp material.
"""
import math
import numpy as np
from veg_geom import Mesh, tube, branch_path, clump, blob, cards, envelope_points

BARK_LO, BARK_HI = 0.02, 0.10
LEAF_LO, LEAF_HI = 0.22, 0.78
ACCENT = 0.95


# ── eucalyptus ───────────────────────────────────────────────────────────────
def eucalyptus(seed, H=30.0):
    rng = np.random.default_rng(seed); M = Mesh(); k = H / 30.0
    R0 = 0.019 * H
    Hf = H * rng.uniform(0.38, 0.5)
    lean = rng.normal(0, 0.035, 2)
    T = branch_path((0, 0, 0), (lean[0], lean[1], 1.0), Hf, 0.04, 10, rng)
    tube(M, T, np.linspace(R0 * 1.4, R0 * 0.8, len(T)), 8, np.linspace(0.05, 0.08, len(T)))
    tips = []; origins = []
    nlead = int(rng.integers(2, 4))
    for i in range(nlead):
        a = 2 * math.pi * i / nlead + rng.uniform(-0.5, 0.5); s = math.tan(math.radians(rng.uniform(8, 22)))
        L = (H - Hf) * rng.uniform(0.82, 1.0)
        P = branch_path(T[-1], (s * math.cos(a), s * math.sin(a), 1.0), L, 0.2, 8, rng)
        tube(M, P, np.linspace(R0 * 0.62, R0 * 0.12, len(P)), 6, 0.08)
        tips.append(P[-1]); origins += [P[j] for j in range(1, len(P) - 1)]
        # foliage hangs along the leader's upper half too, not only at its tip
        for j in range(len(P) // 2, len(P) - 1):
            if rng.random() < 0.55: tips.append(P[j] + np.array([*rng.normal(0, 1.3 * k, 2), 0.0]))
    origins += [T[j] for j in range(len(T) - 3, len(T))]
    # the limbs: out and up from the leaders, longest mid-crown
    nl = int(rng.integers(13, 18))
    for i in range(nl):
        o = origins[rng.integers(len(origins))]
        tz = (o[2] - Hf * 0.8) / (H - Hf * 0.8)
        a = rng.uniform(0, 2 * math.pi); el = math.radians(rng.uniform(22, 58))
        L = H * rng.uniform(0.1, 0.2) * (0.6 + 0.6 * math.sin(math.pi * min(1.0, max(0.0, tz))))
        P = branch_path(o, (math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)), L, 0.35, 4, rng, droop=0.015)
        tube(M, P, np.linspace(R0 * 0.28, R0 * 0.06, len(P)), 4, 0.08)
        tips.append(P[-1])
        if rng.random() < 0.5: tips.append(P[len(P) // 2] + rng.normal(0, 0.5 * k, 3))
    # the foliage: separate hanging clumps, taller than wide, gaps between
    for t in tips:
        rx = rng.uniform(1.1, 1.9) * k; rz = rng.uniform(1.7, 2.8) * k
        c = t + np.array([0, 0, -rz * 0.4]) + rng.normal(0, 0.25 * k, 3)
        clump(M, c, (rx, rx * rng.uniform(0.8, 1.2), rz), int(rng.integers(120, 170)), 0.55 * k ** 0.5, LEAF_LO, LEAF_HI, rng,
              up=0.05, hang=0.75, stretch=2.3, core=None, shell=0.55)
    return M


# ── Monterey cypress ─────────────────────────────────────────────────────────
def cypress(seed, H=18.0, shear=0.0, wide=0.72):
    rng = np.random.default_rng(seed); M = Mesh(); k = H / 18.0
    W = H * wide * rng.uniform(0.95, 1.05)     # the plates add ~7 m: grove trees stand about as tall as wide
    R0 = 0.05 * H
    zf = H * rng.uniform(0.14, 0.22)
    T = branch_path((0, 0, 0), (0, 0, 1), zf, 0.05, 3, rng)
    tube(M, T, [R0 * 1.4, R0 * 1.1, R0, R0 * 0.95], 9, [0.03, 0.05, 0.06, 0.06])
    nl = int(rng.integers(4, 7)); limb_pts = []
    a0 = rng.uniform(0, 2 * math.pi)
    for i in range(nl):
        a = a0 + 2 * math.pi * i / nl + rng.uniform(-0.3, 0.3); el = math.radians(rng.uniform(28, 55))
        L = W * rng.uniform(0.33, 0.48)
        P = branch_path(T[-1], (math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)), L, 0.25, 5, rng, droop=0.01)
        tube(M, P, np.linspace(R0 * 0.55, R0 * 0.12, len(P)), 6, 0.05)
        limb_pts += list(P[2:])
    # the crown: tiers of flat plates under a flat top
    def prof(t):  # radius at relative height t of the crown (0 bottom, 1 top)
        return W / 2 * (0.62 + 0.38 * math.sin(math.pi * min(1.0, 0.25 + 0.75 * t)))
    H0, H1 = H * 0.4, H * 0.97
    n = int(42 * (0.9 + 0.2 * rng.random()))
    C = envelope_points(rng, n, prof, H0, H1, jitter=0.08)
    top = []
    for c in C:
        rx = rng.uniform(2.6, 3.8) * k; rz = rng.uniform(1.1, 1.6) * k
        c = c.copy(); c[2] = min(c[2], H - rz * 0.9)
        # wind: the crown drawn out leeward (+x), higher plates further
        c[0] += shear * W * (0.2 + 0.8 * (c[2] / H)) * 0.5
        clump(M, c, (rx, rx * rng.uniform(0.8, 1.15), rz), int(rng.integers(80, 105)), 0.6 * k ** 0.5, LEAF_LO, LEAF_HI, rng,
              up=0.8, core=0.8, shell=0.28)
        # a short limb to the plate so no plate floats
        o = limb_pts[int(np.argmin([np.linalg.norm(p - c) for p in limb_pts]))]
        if np.linalg.norm(o - c) > rx * 0.6:
            tube(M, [o, c], [R0 * 0.1, R0 * 0.05], 4, 0.05)
    return M


# ── Monterey pine ────────────────────────────────────────────────────────────
def mpine(seed, H=22.0):
    rng = np.random.default_rng(seed); M = Mesh(); k = H / 22.0
    W = H * rng.uniform(0.5, 0.58)
    R0 = 0.03 * H
    T = branch_path((0, 0, 0), (rng.normal(0, 0.04), rng.normal(0, 0.04), 1.0), H * 0.84, 0.06, 9, rng)
    tube(M, T, np.linspace(R0 * 1.25, R0 * 0.25, len(T)), 8, np.linspace(0.04, 0.08, len(T)))
    # an irregular dome, the widest a third of the way up the crown
    prof = lambda t: W / 2 * max(0.15, math.sin(math.pi * (0.12 + 0.88 * t) * 0.92)) ** 0.7
    C = envelope_points(rng, int(rng.integers(50, 58)), prof, H * 0.4, H - 1.4 * k, jitter=0.08)
    for c in C:
        o = T[int(np.argmin(np.abs(T[:, 2] - (c[2] - 1.5 * k))))]
        tube(M, [o, o + (c - o) * 0.6 + np.array([0, 0, 0.3]), c], [R0 * 0.25, R0 * 0.14, R0 * 0.05], 4, 0.06)
        rx = rng.uniform(1.5, 2.2) * k; rz = rx * rng.uniform(0.7, 0.9)
        clump(M, c, (rx, rx * rng.uniform(0.85, 1.15), rz), int(rng.integers(60, 80)), 0.5 * k ** 0.5,
              LEAF_LO, LEAF_HI, rng, up=0.35, stretch=1.8, core=0.8, shell=0.3)
    return M


# ── the broadleaf street kinds ───────────────────────────────────────────────
SHAPES = {
    'oval':   lambda t: math.sin(math.pi * t) ** 0.75,
    'round':  lambda t: math.sqrt(max(0.0, 1 - (2 * t - 1) ** 2)) * 0.95 + 0.05,
    'dome':   lambda t: (max(0.0, 1 - t ** 2.2)) ** 0.55,
    'column': lambda t: math.sin(math.pi * t) ** 0.5,
    'vase':   lambda t: (0.45 + 0.55 * math.sin(math.pi * min(1.0, 0.2 + 0.8 * t) * 0.9)),
}

def broadleaf(seed, H, W, bole=0.3, shape='oval', n=18, rc=1.4, cards_n=110, card=0.5, core=0.7, up=0.4,
              stretch=1.3, shell=0.35, accent=0.0, stems=1):
    rng = np.random.default_rng(seed); M = Mesh()
    R0 = 0.022 * H + 0.06
    Hb = H * bole
    prof = SHAPES[shape]
    base_pts = []
    for s in range(stems):
        off = np.array([0.0, 0.0, 0.0]) if stems == 1 else np.array([math.cos(2 * math.pi * s / stems) * 0.35, math.sin(2 * math.pi * s / stems) * 0.35, 0])
        d = (rng.normal(0, 0.06) + off[0] * 0.3, rng.normal(0, 0.06) + off[1] * 0.3, 1.0)
        T = branch_path(off, d, Hb + H * 0.12, 0.08, 5, rng)
        tube(M, T, np.linspace(R0 * 1.15 / stems ** 0.5, R0 * 0.8 / stems ** 0.5, len(T)), 7, np.linspace(0.04, 0.07, len(T)))
        base_pts.append(T[-1])
    C = envelope_points(rng, n, lambda t: W / 2 * prof(t), Hb + rc * 0.5, H - rc * 0.8, jitter=0.1)
    # limbs from the trunk head to the clumps (hidden in dense crowns, seen in open ones)
    for c in C[: max(3, n // 3)]:
        o = base_pts[rng.integers(len(base_pts))]
        mid = o + (c - o) * 0.55 + np.array([0, 0, 0.3])
        tube(M, [o, mid, c], [R0 * 0.45, R0 * 0.25, R0 * 0.08], 5, 0.07)
    for c in C:
        r = rc * rng.uniform(0.8, 1.2)
        clump(M, c, (r, r * rng.uniform(0.85, 1.15), r * rng.uniform(0.75, 0.95)), int(cards_n * rng.uniform(0.85, 1.15)), card,
              LEAF_LO, LEAF_HI, rng, up=up, stretch=stretch, core=core, shell=shell)
    if accent > 0:     # flowers (or the pohutukawa's red flush) on the sunlit outside
        na = int(accent * n * cards_n)
        idx = rng.integers(len(C), size=na)
        d = rng.normal(size=(na, 3)); d[:, 2] = np.abs(d[:, 2]) + 0.3; d /= np.linalg.norm(d, axis=1)[:, None]
        P = C[idx] + d * rc * 1.02
        cards(M, P, card * 0.8, d + np.array([0, 0, 0.8]), ACCENT, rng=rng)
    return M


# ── palms (after lm_palms.py) ────────────────────────────────────────────────
def _frond(M, base, az, elev, length, width, droop, tone, rng, pinnate=True, segs=7):
    ca, sa = math.cos(az), math.sin(az)
    x, y, z = base; P = [np.array(base, float)]
    for i in range(1, segs + 1):
        t = i / segs; e = elev - droop * t * 1.3; st = length / segs
        x += ca * math.cos(e) * st; y += sa * math.cos(e) * st; z += math.sin(e) * st
        P.append(np.array((x, y, z)))
    side = np.array((-sa, ca, 0.0))
    if pinnate:
        V, F, col = [], [], []
        for i, p in enumerate(P):
            t = i / segs
            w = width * (0.35 + 0.65 * math.sin(math.pi * min(1.0, t * 1.15))) if i else 0.08
            fold = 0.35 * w
            V += [p - side * w - np.array([0, 0, fold]), p, p + side * w - np.array([0, 0, fold])]
            col += [tone - 0.05, tone + 0.05, tone - 0.05]
            if i:
                a, b = 3 * (i - 1), 3 * i
                F += [(a, b, b + 1, a + 1), (a + 1, b + 1, b + 2, a + 2)]
        M.add(V, F, col)
    else:
        for i in range(len(P) - 1):
            tube(M, [P[i], P[i + 1]], 0.05, 3, tone - 0.1)
        tip = P[-1]; n = 9; V = [tip]
        e0 = elev
        for j in range(n + 1):
            a = -math.pi * 0.55 + math.pi * 1.1 * j / n
            dx = ca * math.cos(e0 * 0.3) * math.cos(a) + side[0] * math.sin(a)
            dy = sa * math.cos(e0 * 0.3) * math.cos(a) + side[1] * math.sin(a)
            dz = math.sin(e0 * 0.3) * math.cos(a) * 0.6 + 0.15
            V.append(tip + np.array((dx, dy, dz)) * width)
        M.add(V, [(0, j, j + 1) for j in range(1, n + 1)], [tone + 0.05] + [tone] * (n + 1))


def _lathe(M, prof, sides, tone):
    """a trunk from (radius, z) pairs"""
    P = [(0, 0, z) for _, z in prof]; R = [r for r, _ in prof]
    tube(M, P, R, sides, tone, cap=True)


def palm(seed, kind):
    rng = np.random.default_rng(seed); M = Mesh()
    if kind == 'phoenix':
        H = 9.0; R0, R1 = 0.55, 0.45
        _lathe(M, [(R0 * 1.25, 0.0), (R0, 0.8), (R1 * 1.05, H * 0.5), (R1, H - 0.3), (R1 * 1.45, H + 0.4)], 10, [0.03, 0.05, 0.06, 0.07, 0.05])
        crown = (0.0, 0.0, H + 0.4)
        for i in range(60):
            az = 2 * math.pi * i / 60 * 3 % (2 * math.pi) + rng.uniform(-0.08, 0.08)
            ring = i % 3
            elev = [0.95, 0.45, -0.05][ring] + rng.uniform(-0.1, 0.1)
            tone = [0.62, 0.5, 0.36][ring] + rng.uniform(-0.05, 0.05)
            _frond(M, crown, az, elev, rng.uniform(4.3, 5.4), 0.55, [0.35, 0.75, 1.05][ring], tone, rng)
        # the dead fronds' stubs under the head
        for i in range(10):
            az = rng.uniform(0, 2 * math.pi)
            _frond(M, (0, 0, H - 0.2), az, -0.9, rng.uniform(2.0, 3.0), 0.35, 0.2, ACCENT, rng)
    elif kind == 'washingtonia':
        H = 18.0
        _lathe(M, [(0.42, 0.0), (0.30, 1.0), (0.24, H * 0.6), (0.22, H - 3.2)], 8, [0.06, 0.07, 0.08, 0.08])
        _lathe(M, [(0.24, H - 2.2), (0.75, H - 1.7), (0.85, H - 0.9), (0.5, H - 0.2)], 10, ACCENT)   # a trimmed skirt of dead fronds (street palms are pruned)
        crown = (0.0, 0.0, H - 0.2)
        for i in range(26):
            az = 2 * math.pi * i / 26 + rng.uniform(-0.1, 0.1)
            _frond(M, crown, az, rng.uniform(-0.1, 1.1), rng.uniform(1.4, 1.9), rng.uniform(0.95, 1.2), 0.4,
                   rng.uniform(0.45, 0.7), rng, pinnate=False, segs=3)
    elif kind == 'queen':
        H = 10.0
        _lathe(M, [(0.26, 0.0), (0.21, 1.0), (0.19, H - 0.4), (0.25, H + 0.3)], 8, [0.08, 0.09, 0.1, 0.08])
        crown = (0.0, 0.0, H + 0.3)
        for i in range(18):
            az = 2 * math.pi * i / 18 + rng.uniform(-0.12, 0.12)
            _frond(M, crown, az, rng.uniform(0.5, 1.2), rng.uniform(3.2, 4.0), 0.5, 1.6, rng.uniform(0.4, 0.65), rng)
    else:   # fan_small: windmill / Mediterranean fan palm, cordyline
        H = 4.5
        _lathe(M, [(0.2, 0.0), (0.16, H - 0.2), (0.22, H)], 6, 0.05)
        crown = (0.0, 0.0, H)
        for i in range(16):
            az = 2 * math.pi * i / 16 + rng.uniform(-0.1, 0.1)
            _frond(M, crown, az, rng.uniform(-0.1, 1.0), rng.uniform(0.8, 1.1), 0.65, 0.3, rng.uniform(0.4, 0.65), rng, pinnate=False, segs=3)
    return M


# ── the kit: every proto, its ramp, its size class ───────────────────────────
# ramp: bark dark, bark light, leaf dark, leaf light, accent (sRGB hex). The
# leaf tones sit in the Poly Haven kit's range (their photographed leaves),
# a touch lighter: dense card crowns trap light, a black-green one reads as a hole.
RAMPS = {
    'euc':     ('#7c756a', '#a8a08e', '#566451', '#95a084', '#9a8a6a'),
    'cyp':     ('#4e4036', '#76624f', '#34472e', '#5d7443', '#6a5a40'),
    'pine':    ('#4f4035', '#7a6a58', '#34482a', '#607540', '#6a5a40'),
    'plane':   ('#6d6658', '#a89f8a', '#546c2e', '#8aa352', '#b09a50'),
    'round':   ('#4f463c', '#766a5c', '#3e592c', '#789250', '#8a7a50'),
    'pohu':    ('#4a4038', '#6e6254', '#3a4f33', '#6f8560', '#8a3328'),
    'column':  ('#5b5044', '#857866', '#51702c', '#94b055', '#b09a50'),
    'cherry':  ('#4d3f38', '#6d5b50', '#4d6a30', '#8ca45a', '#d8a8b0'),
    'plum':    ('#4d3f38', '#6d5b50', '#3d2630', '#6a3f48', '#d8a8b0'),
    'olive':   ('#5a5146', '#877b6b', '#5c6450', '#8f9679', '#8f9679'),
    'phoenix': ('#5e4e3c', '#8b7658', '#4a6a2c', '#86a354', '#8a6d4a'),
    'washy':   ('#6e6252', '#9a8a76', '#4f6b31', '#8ba262', '#8c6e4c'),
    'queen':   ('#85817a', '#aaa69c', '#4a6a2b', '#82a054', '#8c6e4c'),
    'fanpalm': ('#57493a', '#7a6a56', '#46612c', '#7f9652', '#8c6e4c'),
}

# name: (builder, ramp, TALL (max height / crown width), HMAX m)
def kit():
    K = {}
    K['euc_a'] = (lambda: eucalyptus(11, 30.0), 'euc', 2.6, 32.0)
    K['euc_b'] = (lambda: eucalyptus(12, 26.0), 'euc', 2.6, 32.0)
    K['euc_c'] = (lambda: eucalyptus(13, 32.0), 'euc', 2.6, 32.0)
    K['cyp_a'] = (lambda: cypress(21, 18.0, 0.0), 'cyp', 1.0, 22.0)
    K['cyp_b'] = (lambda: cypress(22, 16.0, 0.35, 0.9), 'cyp', 1.0, 22.0)   # open-grown, wind-sheared
    K['pine_a'] = (lambda: mpine(31, 22.0), 'pine', 1.6, 24.0)
    K['pine_b'] = (lambda: mpine(32, 19.0), 'pine', 1.6, 24.0)
    K['plane_a'] = (lambda: broadleaf(41, 14.0, 11.0, bole=0.28, shape='oval', n=20, rc=1.7, cards_n=120, card=0.55, core=0.55, up=0.35, shell=0.4), 'plane', 1.4, 18.0)
    K['plane_b'] = (lambda: broadleaf(42, 12.0, 10.0, bole=0.3, shape='vase', n=18, rc=1.6, cards_n=115, card=0.55, core=0.55, up=0.35, shell=0.4), 'plane', 1.4, 18.0)
    K['round_a'] = (lambda: broadleaf(51, 10.0, 8.5, bole=0.25, shape='round', n=18, rc=1.5, cards_n=120, card=0.45, core=0.75, up=0.45, shell=0.3), 'round', 1.4, 15.0)
    K['round_b'] = (lambda: broadleaf(52, 9.0, 7.0, bole=0.3, shape='oval', n=16, rc=1.4, cards_n=115, card=0.45, core=0.75, up=0.45, shell=0.3), 'round', 1.4, 15.0)
    K['pohu'] = (lambda: broadleaf(61, 8.0, 9.5, bole=0.15, shape='dome', n=20, rc=1.6, cards_n=120, card=0.45, core=0.8, up=0.55, shell=0.25, accent=0.015, stems=2), 'pohu', 1.0, 12.0)
    K['column'] = (lambda: broadleaf(71, 11.0, 4.2, bole=0.12, shape='column', n=14, rc=1.2, cards_n=100, card=0.42, core=0.7, up=0.3, shell=0.3), 'column', 3.0, 16.0)
    K['cherry'] = (lambda: broadleaf(81, 6.0, 5.5, bole=0.3, shape='round', n=12, rc=1.1, cards_n=100, card=0.4, core=0.6, up=0.4, shell=0.35), 'cherry', 1.3, 9.0)
    K['plum'] = (lambda: broadleaf(82, 6.0, 5.2, bole=0.3, shape='oval', n=12, rc=1.1, cards_n=100, card=0.4, core=0.6, up=0.4, shell=0.35), 'plum', 1.3, 9.0)
    K['olive'] = (lambda: broadleaf(83, 5.5, 5.5, bole=0.25, shape='round', n=12, rc=1.1, cards_n=110, card=0.38, core=0.5, up=0.4, shell=0.45, stems=2), 'olive', 1.2, 9.0)
    K['phoenix'] = (lambda: palm(91, 'phoenix'), 'phoenix', 99.0, 16.0)
    K['washy'] = (lambda: palm(92, 'washingtonia'), 'washy', 99.0, 26.0)
    K['queen'] = (lambda: palm(93, 'queen'), 'queen', 99.0, 14.0)
    K['fanpalm'] = (lambda: palm(94, 'fan_small'), 'fanpalm', 99.0, 7.0)
    return K


def hex_lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def _material(bpy, name, ramp):
    m = bpy.data.materials.get(name)
    if m is not None: return m
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree; N = nt.nodes; L = nt.links.new
    pr = N.get('Principled BSDF') or N.new('ShaderNodeBsdfPrincipled')
    out = N.get('Material Output') or N.new('ShaderNodeOutputMaterial')
    at = N.new('ShaderNodeAttribute'); at.attribute_type = 'GEOMETRY'; at.attribute_name = 'vc'
    cr = N.new('ShaderNodeValToRGB'); e = cr.color_ramp; e.interpolation = 'LINEAR'
    stops = [(0.0, ramp[0]), (BARK_HI, ramp[1]), (LEAF_LO, ramp[2]), (LEAF_HI, ramp[3]), (0.88, ramp[4]), (1.0, ramp[4])]
    # the two default stops become the ends; the others are added AT their
    # position (setting positions one by one re-sorts the list under the loop)
    e.elements[0].position = stops[0][0]; e.elements[0].color = hex_lin(stops[0][1]) + (1.0,)
    e.elements[1].position = stops[-1][0]; e.elements[1].color = hex_lin(stops[-1][1]) + (1.0,)
    for p_, hx in stops[1:-1]:
        e.elements.new(p_).color = hex_lin(hx) + (1.0,)
    L(at.outputs['Fac'], cr.inputs['Fac'])
    # each tree its own shade, by place ('crand', written by hq_city's instancer)
    ci = N.new('ShaderNodeAttribute'); ci.attribute_type = 'INSTANCER'; ci.attribute_name = 'crand'
    hsv = N.new('ShaderNodeHueSaturation')
    hm = N.new('ShaderNodeMapRange'); hm.inputs['To Min'].default_value = 0.485; hm.inputs['To Max'].default_value = 0.515
    vm = N.new('ShaderNodeMapRange'); vm.inputs['To Min'].default_value = 0.88; vm.inputs['To Max'].default_value = 1.12
    L(ci.outputs['Fac'], hm.inputs['Value']); L(ci.outputs['Fac'], vm.inputs['Value'])
    L(hm.outputs['Result'], hsv.inputs['Hue']); L(vm.outputs['Result'], hsv.inputs['Value'])
    L(cr.outputs['Color'], hsv.inputs['Color'])
    L(hsv.outputs['Color'], pr.inputs['Base Color'])
    pr.inputs['Roughness'].default_value = 0.7
    try: pr.inputs['Specular IOR Level'].default_value = 0.35
    except KeyError: pass
    # leaves let some light through: a thin translucent share on the foliage only
    gt = N.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.15
    L(at.outputs['Fac'], gt.inputs[0])
    k_ = N.new('ShaderNodeMath'); k_.operation = 'MULTIPLY'; k_.inputs[1].default_value = 0.22
    L(gt.outputs[0], k_.inputs[0])
    tr = N.new('ShaderNodeBsdfTranslucent'); L(hsv.outputs['Color'], tr.inputs['Color'])
    mx = N.new('ShaderNodeMixShader'); L(k_.outputs[0], mx.inputs[0])
    L(pr.outputs[0], mx.inputs[1]); L(tr.outputs[0], mx.inputs[2])
    L(mx.outputs[0], out.inputs['Surface'])
    return m


def to_blender(bpy, name, mesh, ramp_name):
    """one collection holding the proto's mesh object, foot at the origin"""
    V, F, C = mesh.arrays()
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in V], [], F)
    at = me.attributes.new('vc', 'FLOAT', 'POINT'); at.data.foreach_set('value', [float(c) for c in C])
    me.materials.append(_material(bpy, f'veg_{ramp_name}', RAMPS[ramp_name]))
    me.update()
    ob = bpy.data.objects.new(name, me)
    coll = bpy.data.collections.new(f'{name}_one'); coll.objects.link(ob)
    mn, mx = V.min(0), V.max(0)
    return coll, float(max(mx[0] - mn[0], mx[1] - mn[1])), float(mx[2]), len(F)
