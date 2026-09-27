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
import math, os
import numpy as np
from veg_geom import Mesh, tube, branch_path, clump as _clump2, blob, cards, envelope_points
import veg_geom as _VG3
# v3, the deep-zoom kit (VEG_V3=1, default): the same skeletons, their clumps
# built by veg_geom.clump3 (twigs of small leaves, smooth shading normals)
# while a v3 proto is being built (_MODE), its leaf parameters in _VG3.V3
_MODE = {'v3': False}
def clump(M, *a, **k):
    if _MODE['v3']: return _VG3.clump3(M, *a, **k)
    return _clump2(M, *a, **k)

BARK_LO, BARK_HI = 0.02, 0.10
LEAF_LO, LEAF_HI = 0.22, 0.78
ACCENT = 0.95
# CROWN SHADING v2 (24/09 pm, "evenly lit yellow-green blobs"): the solid core
# of each clump takes a DEEP leaf tone (vc 0.16: the leaf-dark stop x VEG_DEEPK),
# since light that enters a real crown is absorbed through many leaf layers
# before it comes back out; cards face out of their clump (a clump is shaded
# like a ball, lit on the sun side, dark on the far one) instead of up at the sky
V2 = os.environ.get('VEG_V2', '1') == '1'
DEEP = 0.16
# v2 defaults (each env-overridable), chosen on the city crops 24/09 pm (live_trees/01):
#   cards 8 parts outward to 0.2 sky (clumps shade like balls, lit on the sun side),
#   deep core 0.25 of the leaf-dark stop, lobes 1.6x bigger and fewer, lobe-to-lobe
#   tone 1.4, leaf lift halved (db2eb3ae2's +35 % made the canopies pale), leaf
#   translucency 0.30 -> 0.12 (it lit the shaded side as much as the sunlit one),
#   crevices darkened by a short local AO (2 m, down to 0.25), each tree's hue +-0.03
V2D = dict(VEG_DEEPK=0.25, VEG_LOBE=1.6, VEG_LOBEK=1.4, VEG_LIFT=0.5, VEG_TRANS=0.12, VEG_AO=2.0, VEG_AOMIN=0.25, VEG_HUEV=0.03)
V1D = dict(VEG_DEEPK=0.4, VEG_LOBE=1.35, VEG_LOBEK=1.0, VEG_LIFT=1.0, VEG_TRANS=0.30, VEG_AO=0.0, VEG_AOMIN=0.35, VEG_HUEV=0.015)
def vp(k):
    return float(os.environ.get(k, (V2D if V2 else V1D)[k]))
import veg_geom as _VG
if V2: _VG.CARD.update(radial=8.0, upk=0.2)
CORE_C = DEEP if V2 else None
LOBE_K = vp('VEG_LOBEK')


def lobe_tone(rng, zrel, rrel=1.0):
    """v2: a clump's own tone from where it sits in the crown (zrel 0 bottom ..
    1 top, rrel 0 axis .. 1 skin) and a draw: the crown's top and skin lighter,
    its underside and inside darker, clump to clump contrast. None in v1."""
    if not V2 or LOBE_K <= 0: return None
    return float(np.clip(0.5 + LOBE_K * (0.35 * (zrel - 0.5) + 0.2 * (rrel - 0.8) + 0.3 * (rng.random() - 0.5)), 0.05, 0.95))


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
            if rng.random() < 0.8: tips.append(P[j] + np.array([*rng.normal(0, 1.4 * k, 2), 0.0]))
    origins += [T[j] for j in range(len(T) - 3, len(T))]
    # the limbs: out and up from the leaders, longest mid-crown
    nl = int(rng.integers(17, 23))
    for i in range(nl):
        o = origins[rng.integers(len(origins))]
        tz = (o[2] - Hf * 0.8) / (H - Hf * 0.8)
        a = rng.uniform(0, 2 * math.pi); el = math.radians(rng.uniform(22, 58))
        L = H * rng.uniform(0.1, 0.2) * (0.6 + 0.6 * math.sin(math.pi * min(1.0, max(0.0, tz))))
        P = branch_path(o, (math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)), L, 0.35, 4, rng, droop=0.015)
        tube(M, P, np.linspace(R0 * 0.28, R0 * 0.06, len(P)), 4, 0.08)
        tips.append(P[-1])
        if rng.random() < 0.7: tips.append(P[len(P) // 2] + rng.normal(0, 0.5 * k, 3))
    # the foliage: separate hanging clumps, taller than wide, gaps between
    for t in tips:
        rx = rng.uniform(1.3, 2.2) * k; rz = rng.uniform(1.9, 3.0) * k
        c = t + np.array([0, 0, -rz * 0.4]) + rng.normal(0, 0.25 * k, 3)
        # a darker core inside each clump: the shadowed depth a blue gum shows
        # from above (card-only clumps read chalky, like dead trees: 24/09)
        clump(M, c, (rx, rx * rng.uniform(0.8, 1.2), rz), int(rng.integers(130, 170)), 0.58 * k ** 0.5, LEAF_LO, LEAF_HI, rng,
              up=0.1, hang=0.5, stretch=2.2, core=0.55, shell=0.4, core_c=CORE_C, lobe=lobe_tone(rng, (c[2] - Hf) / (H - Hf)))
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
              up=0.8, core=0.8, shell=0.28, core_c=CORE_C, lobe=lobe_tone(rng, (c[2] - H0) / (H1 - H0), math.hypot(c[0], c[1]) / max(0.1, prof((c[2] - H0) / (H1 - H0)))))
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
              LEAF_LO, LEAF_HI, rng, up=0.35, stretch=1.8, core=0.8, shell=0.3, core_c=CORE_C,
              lobe=lobe_tone(rng, (c[2] - H * 0.4) / (H * 0.6), math.hypot(c[0], c[1]) / max(0.1, W / 2)))
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
    if V2:     # fewer, bigger lobes, out on the envelope: gaps between them show the dark inside
        lk = vp('VEG_LOBE')
        n = max(5, int(round(n / lk ** 1.6))); cards_n = int(cards_n * lk ** 1.6 * 0.95); rc *= lk
    C = envelope_points(rng, n, lambda t: W / 2 * prof(t), Hb + rc * 0.5, H - rc * 0.8, jitter=0.1)
    # limbs from the trunk head to the clumps (hidden in dense crowns, seen in open ones)
    for c in C[: max(3, n // 3)]:
        o = base_pts[rng.integers(len(base_pts))]
        mid = o + (c - o) * 0.55 + np.array([0, 0, 0.3])
        tube(M, [o, mid, c], [R0 * 0.45, R0 * 0.25, R0 * 0.08], 5, 0.07)
    for c in C:
        r = rc * rng.uniform(0.8, 1.2)
        clump(M, c, (r, r * rng.uniform(0.85, 1.15), r * rng.uniform(0.75, 0.95)), int(cards_n * rng.uniform(0.85, 1.15)), card,
              LEAF_LO, LEAF_HI, rng, up=up, stretch=stretch, core=core, shell=shell, core_c=CORE_C,
              lobe=lobe_tone(rng, (c[2] - Hb) / max(0.1, H - Hb), math.hypot(c[0], c[1]) / max(0.1, W / 2 * prof(min(1.0, max(0.0, (c[2] - Hb) / max(0.1, H - Hb)))))))
    if accent > 0:     # flowers (or the pohutukawa's red flush) on the sunlit outside
        na = int(accent * n * cards_n)
        idx = rng.integers(len(C), size=na)
        d = rng.normal(size=(na, 3)); d[:, 2] = np.abs(d[:, 2]) + 0.3; d /= np.linalg.norm(d, axis=1)[:, None]
        P = C[idx] + d * rc * 1.02
        if _MODE['v3']:
            ns_ = d + np.array([0, 0, 0.8]); ns_ /= np.linalg.norm(ns_, axis=1)[:, None]
            m_ = max(1, int(5 * (card / _VG3.V3['leaf']) ** 2))      # one v2 card = a few small flowers
            Pk = np.repeat(P, m_, 0) + rng.normal(0, card * 0.35, (len(P) * m_, 3))
            _VG3.leaves(M, Pk, np.repeat(ns_, m_, 0), np.repeat(ns_, m_, 0), _VG3.V3['leaf'] * 0.9, ACCENT, 1.0, rng)
        else:
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
    if pinnate and _MODE['v3']:
        # v3: a thin rachis and its LEAFLETS, pairs every ~12 cm raised in a V
        # (a palm's feather reads at level 9: the v2 blade was one flat ribbon)
        tube(M, P, np.linspace(0.05, 0.015, len(P)), 3, tone - 0.12)
        P = np.array(P); seg = np.linalg.norm(np.diff(P, axis=0), axis=1); cum = np.concatenate([[0], np.cumsum(seg)])
        ss = np.arange(0.35, cum[-1], 0.12)
        if len(ss):
            Q = np.stack([np.interp(ss, cum, P[:, j]) for j in range(3)], 1)
            fw = np.gradient(Q, axis=0); fw /= np.maximum(1e-9, np.linalg.norm(fw, axis=1))[:, None]
            t = ss / cum[-1]; ln = width * 1.7 * (0.35 + 0.65 * np.sin(np.pi * np.minimum(1.0, t * 1.15)))
            Vs, Ns_, Cs = [], [], []
            for sg in (-1.0, 1.0):
                d = side[None, :] * sg * 0.8 + fw * 0.45 + np.array([0, 0, 0.35])[None, :]
                d /= np.linalg.norm(d, axis=1)[:, None]
                tip = Q + d * ln[:, None] - np.array([0, 0, 1.0])[None, :] * (0.25 * ln * ln)[:, None]   # the leaflets droop
                wv = np.cross(d, np.array([0, 0, 1.0])); wv /= np.maximum(1e-9, np.linalg.norm(wv, axis=1))[:, None]
                wv *= 0.035
                Vs.append(np.stack([Q - wv, Q + wv, tip + wv * 0.3, tip - wv * 0.3], 1))
                nn = np.cross(d, wv); nn /= np.maximum(1e-9, np.linalg.norm(nn, axis=1))[:, None]
                nn = np.where((nn[:, 2] < 0)[:, None], -nn, nn) + np.array([0, 0, 0.6]); nn /= np.linalg.norm(nn, axis=1)[:, None]
                Ns_.append(np.repeat(nn, 4, 0)); Cs.append(np.repeat(tone + 0.08 * (rng.random(len(Q)) - 0.5), 4))
            Vs = np.concatenate(Vs).reshape(-1, 3)
            M.add(Vs, np.arange(len(Vs)).reshape(-1, 4), np.concatenate(Cs), np.concatenate(Ns_))
    elif not pinnate and _MODE['v3']:
        # v3: a costapalmate fan split into pleated segments with gaps
        tube(M, P, 0.05, 3, tone - 0.1)
        tip = P[-1]; n = 22; Vs = []; Cs = []
        for j in range(n):
            a0_ = -math.pi * 0.6 + math.pi * 1.2 * j / n; a1_ = a0_ + math.pi * 1.2 / n * 0.8
            pts_ = []
            for a_, r_ in ((a0_, 0.12), (a1_, 0.12), (a1_, 1.0), (a0_, 1.0)):
                dx = ca * math.cos(elev * 0.3) * math.cos(a_) + side[0] * math.sin(a_)
                dy = sa * math.cos(elev * 0.3) * math.cos(a_) + side[1] * math.sin(a_)
                dz = math.sin(elev * 0.3) * math.cos(a_) * 0.6 + 0.15 - 0.25 * r_ * r_ * (0.5 + abs(math.sin(a_)))
                pts_.append(tip + np.array((dx, dy, dz)) * width * r_ + np.array((0, 0, 0.04 * (j % 2))))
            Vs += pts_; Cs += [tone + 0.04 * (j % 2 - 0.5)] * 4
        Vs = np.array(Vs); M.add(Vs, np.arange(len(Vs)).reshape(-1, 4), Cs)
    elif pinnate:
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


def palm(seed, kind, H=None):
    rng = np.random.default_rng(seed); M = Mesh()
    if kind == 'phoenix':
        H = H or 9.0; R0, R1 = 0.55, 0.45
        _lathe(M, [(R0 * 1.25, 0.0), (R0, 0.8), (R1 * 1.05, H * 0.5), (R1, H - 0.3), (R1 * 1.45, H + 0.4)], 10, [0.03, 0.05, 0.06, 0.07, 0.05])
        crown = (0.0, 0.0, H + 0.4)
        for i in range(60):
            az = 2 * math.pi * i / 60 * 3 % (2 * math.pi) + rng.uniform(-0.08, 0.08)
            ring = i % 3
            elev = [0.95, 0.45, -0.05][ring] + rng.uniform(-0.1, 0.1)
            tone = [0.62, 0.5, 0.36][ring] + rng.uniform(-0.05, 0.05)
            _frond(M, crown, az, elev, rng.uniform(4.3, 5.4) * min(1.0, 0.55 + 0.05 * H), 0.55, [0.35, 0.75, 1.05][ring], tone, rng)   # (a young palm's fronds shorter)
        # the dead fronds' stubs under the head
        for i in range(10):
            az = rng.uniform(0, 2 * math.pi)
            _frond(M, (0, 0, H - 0.2), az, -0.9, rng.uniform(2.0, 3.0), 0.35, 0.2, ACCENT, rng)
    elif kind == 'washingtonia':
        H = H or 18.0
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
    'euc':     ('#7c756a', '#a8a08e', '#465341', '#7a876c', '#9a8a6a'),
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

# v2 (24/09 pm): species-true and darker, less yellow. Under the golden-hour
# sun (1.0, 0.80, 0.58) and grade B every green drifts yellow: the albedos lean
# blue-green so a cypress, a pine or a blue gum still reads blue-green, the
# broadleaf mid green, and canopies sit among the darkest things in the frame
RAMPS2 = dict(RAMPS)
RAMPS2.update({
    'euc':    ('#7c756a', '#a8a08e', '#38453b', '#667867', '#8a7a5a'),
    'cyp':    ('#4e4036', '#76624f', '#27392a', '#4a6446', '#6a5a40'),
    'pine':   ('#4f4035', '#7a6a58', '#2b3f26', '#51683a', '#6a5a40'),
    'plane':  ('#6d6658', '#a89f8a', '#445e2c', '#789650', '#9a8a50'),
    'round':  ('#4f463c', '#766a5c', '#30492a', '#628446', '#7a6a48'),
    'column': ('#5b5044', '#857866', '#46652e', '#80a052', '#9a8a50'),
    'cherry': ('#4d3f38', '#6d5b50', '#425e2c', '#789650', '#d8a8b0'),
})
if os.environ.get('VEG_RAMPS2', '1' if V2 else '0') == '1': RAMPS = RAMPS2

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
    if V3_ON and V4_ON: return kit4()
    return kit3() if V3_ON else K


# ── v3: the deep-zoom kit (25/09) ────────────────────────────────────────────
# VEG_V3=1 (default; 0 = the v2 kit above, unchanged). The v2 skeletons and
# silhouettes (their L7 look was tuned on whole frames), rebuilt with v3 clumps
# (small leaves ~2 px at level 9 in twigs, smooth shading, smooth cores); the
# broad 'round' class split into the city's main evergreen street species, and
# 2-3 sizes per species (veg_hq picks the one nearest the tree's own size, so
# a young street tree is not a shrunken old one). The forms are a CONVENTION
# after each species' usual habit (not measured); the city's own list says who is where.
V3_ON = os.environ.get('VEG_V3', '1') == '1'
V3_GAIN = float(os.environ.get('VEG3_GAIN', 1.0))
# the v3 leaf gain per ramp: each species' foliage brought back to its v2
# mean (sRGB, crown pixels at level 8 on a grey ground, LOOK B; bench 25/09),
# so the level-7 frame keeps its tone: small leaves shadow each other and
# show the dark inside through their gaps, v3 crowns rendered 10-28 % darker
# at the same albedo (palms: their fronds were already matched)
V3_GAINS = {'euc': 1.9, 'pine': 1.38, 'cyp': 1.6, 'oak': 1.5, 'bbox': 1.12, 'plane': 1.26, 'round': 1.09, 'ficus': 1.43,
            'vbox': 1.04, 'pohu': 1.47, 'column': 1.31, 'cherry': 1.31, 'plum': 1.31, 'olive': 1.12,
            'phoenix': 1.27, 'queen': 1.6, 'washy': 0.88, 'fanpalm': 0.9}
V3LEAF = {   # species: V3 leaf params (leaf width m, density, stretch, twig ball m, leaf cap per clump, flat sprays)
    'euc':    dict(leaf=0.12, dens=0.8, stretch=2.6, twig=0.42, cap=7000),
    'cyp':    dict(leaf=0.15, dens=0.9, stretch=1.2, twig=0.45, cap=5500, flat=0.55),
    'pine':   dict(leaf=0.10, dens=0.95, stretch=3.0, twig=0.34, cap=6500),
    'plane':  dict(leaf=0.17, dens=0.9, stretch=1.1, twig=0.45, cap=9000),
    'round':  dict(leaf=0.14, dens=1.0, stretch=1.35, twig=0.36, cap=9000),
    'ficus':  dict(leaf=0.12, dens=1.1, stretch=1.4, twig=0.30, cap=9500),
    'vbox':   dict(leaf=0.13, dens=1.05, stretch=1.5, twig=0.34, cap=9000),
    'bbox':   dict(leaf=0.14, dens=1.0, stretch=1.45, twig=0.38, cap=9000),
    'oak':    dict(leaf=0.12, dens=1.0, stretch=1.3, twig=0.32, cap=8000),
    'pohu':   dict(leaf=0.13, dens=1.05, stretch=1.4, twig=0.34, cap=9000),
    'column': dict(leaf=0.13, dens=1.0, stretch=1.3, twig=0.32, cap=8000),
    'cherry': dict(leaf=0.13, dens=0.95, stretch=1.3, twig=0.32, cap=6500),
    'plum':   dict(leaf=0.13, dens=0.95, stretch=1.3, twig=0.32, cap=6500),
    'olive':  dict(leaf=0.11, dens=0.9, stretch=2.0, twig=0.30, cap=6500),
}
_V3D = dict(_VG3.V3)


def _v3(sp, fn, *a, **k):
    """build fn(*a) as a v3 proto with species sp's leaves"""
    _VG3.V3.clear(); _VG3.V3.update(_V3D); _VG3.V3.update(V3LEAF.get(sp, {}))
    _VG3.V3['dens'] *= float(os.environ.get('VEG3_DENS', 1.0)); _VG3.V3['leaf'] *= float(os.environ.get('VEG3_LEAF', 1.0))
    _MODE['v3'] = True
    try: M = fn(*a, **k)
    finally: _MODE['v3'] = False
    M.v3 = True
    return M


# the species' ramps: bark dark, bark light, leaf dark, leaf light, accent. In
# the v2 'round' range (the L7 look was tuned on it), each a shade toward its
# species: the fig a deep glossy green, the Victorian box a brighter mid green,
# the Brisbane box dark, the live oak a dark olive.
RAMPS.update({
    'ficus': ('#7d776d', '#a49c8e', '#2b4526', '#5a7e40', '#7a6a48'),
    'vbox':  ('#574d43', '#7e7264', '#34522a', '#6d9346', '#b8a860'),
    'bbox':  ('#6b5a4a', '#8c7a66', '#2e4829', '#5e7d45', '#7a6a48'),
    'oak':   ('#4e463e', '#716658', '#2f4228', '#5f7244', '#7a6a48'),
})


def oak(seed, H=10.0, W=14.0):
    """Quercus agrifolia, the coast live oak: a short trunk splitting low into
    a few massive sinuous limbs that spread out, a broad dense dome wider than
    tall, its skin of small dark leaves lumpy and uneven (a convention after its usual habit)"""
    rng = np.random.default_rng(seed); M = Mesh(); R0 = 0.03 * H + 0.1
    zb = H * rng.uniform(0.14, 0.2)
    T = branch_path((0, 0, 0), (rng.normal(0, 0.08), rng.normal(0, 0.08), 1.0), zb, 0.1, 3, rng)
    tube(M, T, np.linspace(R0 * 1.35, R0, len(T)), 9, np.linspace(0.03, 0.05, len(T)))
    tips = []; nl = int(rng.integers(4, 6)); a0 = rng.uniform(0, 2 * math.pi)
    for i in range(nl):
        a = a0 + 2 * math.pi * i / nl + rng.uniform(-0.35, 0.35); el = math.radians(rng.uniform(22, 42))
        L = W * rng.uniform(0.34, 0.46)
        P = branch_path(T[-1], (math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el)), L, 0.45, 6, rng, droop=0.02)
        tube(M, P, np.linspace(R0 * 0.62, R0 * 0.14, len(P)), 7, 0.05)
        tips += [P[j] for j in range(2, len(P))]
    prof = SHAPES['dome']; H0 = zb + 0.9
    C = envelope_points(rng, int(rng.integers(24, 30)), lambda t: W / 2 * prof(t), H0, H - 1.2, jitter=0.12)
    for c in C:
        o = tips[int(np.argmin([np.linalg.norm(p - c) for p in tips]))]
        if np.linalg.norm(o - c) > 1.4: tube(M, [o, c], [R0 * 0.14, R0 * 0.05], 5, 0.05)
        r = rng.uniform(1.5, 2.1)
        zrel = (c[2] - H0) / max(0.1, H - H0)
        clump(M, c, (r, r * rng.uniform(0.85, 1.15), r * rng.uniform(0.6, 0.8)), 110, 0.45, LEAF_LO, LEAF_HI, rng,
              up=0.5, core=0.72, shell=0.3, core_c=CORE_C, lobe=lobe_tone(rng, zrel, math.hypot(c[0], c[1]) / max(0.1, W / 2)))
    return M


def kit3():
    K = {}
    B = broadleaf
    K['euc_a'] = (lambda: _v3('euc', eucalyptus, 11, 30.0), 'euc', 2.6, 32.0)
    K['euc_b'] = (lambda: _v3('euc', eucalyptus, 12, 26.0), 'euc', 2.6, 32.0)
    K['euc_c'] = (lambda: _v3('euc', eucalyptus, 13, 32.0), 'euc', 2.6, 32.0)
    K['euc_y'] = (lambda: _v3('euc', eucalyptus, 14, 17.0), 'euc', 2.6, 32.0)         # young / street blue gum
    K['cyp_a'] = (lambda: _v3('cyp', cypress, 21, 18.0, 0.0), 'cyp', 1.0, 22.0)
    K['cyp_b'] = (lambda: _v3('cyp', cypress, 22, 16.0, 0.35, 0.9), 'cyp', 1.0, 22.0)
    K['cyp_y'] = (lambda: _v3('cyp', cypress, 23, 10.0, 0.1, 0.8), 'cyp', 1.0, 22.0)
    K['pine_a'] = (lambda: _v3('pine', mpine, 31, 22.0), 'pine', 1.6, 24.0)
    K['pine_b'] = (lambda: _v3('pine', mpine, 32, 19.0), 'pine', 1.6, 24.0)
    K['pine_y'] = (lambda: _v3('pine', mpine, 33, 12.0), 'pine', 1.6, 24.0)
    K['plane_a'] = (lambda: _v3('plane', B, 41, 14.0, 11.0, bole=0.28, shape='oval', n=20, rc=1.7, cards_n=120, card=0.55, core=0.55, up=0.35, shell=0.4), 'plane', 1.4, 18.0)
    K['plane_b'] = (lambda: _v3('plane', B, 42, 12.0, 10.0, bole=0.3, shape='vase', n=18, rc=1.6, cards_n=115, card=0.55, core=0.55, up=0.35, shell=0.4), 'plane', 1.4, 18.0)
    K['plane_y'] = (lambda: _v3('plane', B, 43, 7.5, 5.0, bole=0.35, shape='oval', n=12, rc=1.2, cards_n=110, card=0.5, core=0.5, up=0.35, shell=0.4), 'plane', 1.5, 18.0)
    K['round_a'] = (lambda: _v3('round', B, 51, 10.0, 8.5, bole=0.25, shape='round', n=18, rc=1.5, cards_n=120, card=0.45, core=0.75, up=0.45, shell=0.3), 'round', 1.4, 15.0)
    K['round_b'] = (lambda: _v3('round', B, 52, 9.0, 7.0, bole=0.3, shape='oval', n=16, rc=1.4, cards_n=115, card=0.45, core=0.75, up=0.45, shell=0.3), 'round', 1.4, 15.0)
    # Ficus microcarpa 'Nitida' (Indian laurel fig): a dense clipped round head, smooth grey trunk
    K['ficus_a'] = (lambda: _v3('ficus', B, 55, 9.0, 9.0, bole=0.28, shape='round', n=18, rc=1.6, cards_n=120, card=0.4, core=0.82, up=0.45, shell=0.22), 'ficus', 1.3, 14.0)
    K['ficus_b'] = (lambda: _v3('ficus', B, 56, 6.0, 5.5, bole=0.35, shape='round', n=12, rc=1.3, cards_n=120, card=0.4, core=0.82, up=0.45, shell=0.22), 'ficus', 1.3, 14.0)
    # Pittosporum undulatum (Victorian box): a dense rounded dome, bright glossy mid green
    K['vbox_a'] = (lambda: _v3('vbox', B, 57, 8.0, 8.0, bole=0.22, shape='dome', n=16, rc=1.5, cards_n=120, card=0.42, core=0.8, up=0.5, shell=0.25), 'vbox', 1.2, 12.0)
    K['vbox_b'] = (lambda: _v3('vbox', B, 58, 5.0, 4.8, bole=0.3, shape='round', n=10, rc=1.2, cards_n=115, card=0.42, core=0.8, up=0.5, shell=0.25), 'vbox', 1.2, 12.0)
    # Lophostemon confertus (Brisbane box): an upright oval, dark, fairly open
    K['bbox_a'] = (lambda: _v3('bbox', B, 59, 13.0, 8.0, bole=0.3, shape='oval', n=20, rc=1.5, cards_n=115, card=0.45, core=0.65, up=0.4, shell=0.35), 'bbox', 1.8, 16.0)
    K['bbox_b'] = (lambda: _v3('bbox', B, 60, 8.0, 5.0, bole=0.32, shape='oval', n=13, rc=1.2, cards_n=115, card=0.45, core=0.65, up=0.4, shell=0.35), 'bbox', 1.8, 16.0)
    K['oak_a'] = (lambda: _v3('oak', oak, 65, 11.0, 15.0), 'oak', 0.9, 16.0)
    K['oak_b'] = (lambda: _v3('oak', oak, 66, 7.0, 9.0), 'oak', 0.9, 16.0)
    K['pohu'] = (lambda: _v3('pohu', B, 61, 8.0, 9.5, bole=0.15, shape='dome', n=20, rc=1.6, cards_n=120, card=0.45, core=0.8, up=0.55, shell=0.25, accent=0.015, stems=2), 'pohu', 1.0, 12.0)
    K['pohu_b'] = (lambda: _v3('pohu', B, 62, 5.0, 5.5, bole=0.18, shape='dome', n=12, rc=1.3, cards_n=120, card=0.45, core=0.8, up=0.55, shell=0.25, accent=0.015, stems=2), 'pohu', 1.0, 12.0)
    K['column'] = (lambda: _v3('column', B, 71, 11.0, 4.2, bole=0.12, shape='column', n=14, rc=1.2, cards_n=100, card=0.42, core=0.7, up=0.3, shell=0.3), 'column', 3.0, 16.0)
    K['cherry'] = (lambda: _v3('cherry', B, 81, 6.0, 5.5, bole=0.3, shape='round', n=12, rc=1.1, cards_n=100, card=0.4, core=0.6, up=0.4, shell=0.35), 'cherry', 1.3, 9.0)
    K['plum'] = (lambda: _v3('plum', B, 82, 6.0, 5.2, bole=0.3, shape='oval', n=12, rc=1.1, cards_n=100, card=0.4, core=0.6, up=0.4, shell=0.35), 'plum', 1.3, 9.0)
    K['olive'] = (lambda: _v3('olive', B, 83, 5.5, 5.5, bole=0.25, shape='round', n=12, rc=1.1, cards_n=110, card=0.38, core=0.5, up=0.4, shell=0.45, stems=2), 'olive', 1.2, 9.0)
    K['phoenix'] = (lambda: _v3('palm', palm, 91, 'phoenix'), 'phoenix', 99.0, 16.0)
    K['phoenix_b'] = (lambda: _v3('palm', palm, 95, 'phoenix', 5.0), 'phoenix', 99.0, 16.0)
    K['washy'] = (lambda: _v3('palm', palm, 92, 'washingtonia'), 'washy', 99.0, 26.0)
    K['washy_b'] = (lambda: _v3('palm', palm, 96, 'washingtonia', 11.0), 'washy', 99.0, 26.0)
    K['queen'] = (lambda: _v3('palm', palm, 93, 'queen'), 'queen', 99.0, 14.0)
    K['fanpalm'] = (lambda: _v3('palm', palm, 94, 'fan_small'), 'fanpalm', 99.0, 7.0)
    return K


# ── v4: branch-driven crowns (assets_trees_glass, 27/09; veg_v4.py) ────────────
# VEG_V4=1 (default; 0 = the v3 kit, unchanged): the same names, sizes and
# (TALL, HMAX), so placement, species and the size pick are untouched; every
# broadleaf, conifer and blue gum regrown as a branch system carrying leaf
# sprays (no ball clumps, no solid core); palms stay v3.
V4_ON = os.environ.get('VEG_V4', '1') == '1'
V4_GAIN = float(os.environ.get('VEG4_GAIN', 1.0))
V4_GAINS = dict(V3_GAINS)
V4_GAINS.update({'euc': 1.45, 'cyp': 1.5, 'pine': 1.35})    # the v4 blue gum is more open: less lift (1.9 read pale, ghostly)
# v4 leaf stops (dark, light): a richer, healthier green than the v2/v3 golden-hour
# ramps (which leaned olive / teal), each species its own hue; bark and accent as before
RAMPS4_LEAF = {
    'plane': ('#3d6428', '#7fa84c'), 'round': ('#2f5226', '#66913f'), 'ficus': ('#2a4a22', '#5b8a3a'),
    'vbox': ('#35592a', '#71a044'), 'bbox': ('#2e4d27', '#5f8742'), 'oak': ('#2f4a26', '#627f40'),
    'pohu': ('#34502e', '#6a8c55'), 'olive': ('#56654a', '#8a9a72'), 'pine': ('#28422a', '#4f7040'),
    'cyp': ('#263f2a', '#4b6c44'), 'euc': ('#3d4d3d', '#71866a'), 'cherry': ('#3f6229', '#7ba24c'),
    'column': ('#43682c', '#80a552'),
}
# (the v3 widths / heights of each proto, measured in the tg0 crop log, so the
# v4 proto keeps the proportions veg_hq scales by)
V4_SIZE = {'euc_a': (20.2, 30.0), 'euc_b': (14.5, 26.9), 'euc_c': (18.7, 31.4), 'euc_y': (8.7, 18.2), 'cyp_a': (21.3, 18.5),
           'cyp_b': (20.7, 16.4), 'cyp_y': (11.8, 10.3), 'pine_a': (17.3, 22.8), 'pine_b': (14.6, 19.5), 'pine_y': (8.8, 12.5),
           'plane_a': (16.1, 13.4), 'plane_b': (14.1, 11.7), 'plane_y': (8.6, 7.5), 'round_a': (13.8, 10.3), 'round_b': (11.7, 9.5),
           'ficus_a': (13.9, 9.6), 'ficus_b': (9.9, 6.4), 'vbox_a': (13.1, 8.0), 'vbox_b': (7.7, 5.4), 'bbox_a': (13.3, 12.0),
           'bbox_b': (8.5, 8.0), 'oak_a': (19.9, 11.1), 'oak_b': (13.2, 7.1), 'pohu': (14.5, 8.6), 'pohu_b': (8.7, 5.6),
           'column': (8.5, 11.1), 'cherry': (8.7, 5.6), 'plum': (8.0, 6.4), 'olive': (9.0, 5.2)}
V4_WK = float(os.environ.get('VEG4_WK', 0.88))     # the envelope's width in the v3 extent (sprays reach past it)
def kit4():
    import veg_v4 as V4
    K = kit3()
    def put(nm, kind, seed, H, W=None, **o):
        _, ramp, t_, h_ = K[nm]
        def b(kind=kind, seed=seed, H=H, W=W, o=o):
            w_, h_ = V4_SIZE.get(nm, (W, H))
            M = V4.build(kind, seed, h_, w_ * V4_WK, **o); M.sfx = '_v4'; return M
        K[nm] = (b, ramp, t_, h_)
    put('euc_a', 'euc', 111, 30.0); put('euc_b', 'euc', 112, 26.0); put('euc_c', 'euc', 113, 32.0); put('euc_y', 'euc', 114, 17.0)
    put('cyp_a', 'cyp', 121, 18.0, 16.0); put('cyp_b', 'cyp', 122, 16.0, 17.0, shear=0.35); put('cyp_y', 'cyp', 123, 10.0, 8.5)
    put('pine_a', 'pine', 131, 22.0, 12.5); put('pine_b', 'pine', 132, 19.0, 11.0); put('pine_y', 'pine', 133, 12.0, 6.5, shape='cone')
    put('plane_a', 'plane', 141, 14.0, 11.0); put('plane_b', 'plane', 142, 12.0, 10.0, shape='vase'); put('plane_y', 'plane', 143, 7.5, 5.0)
    put('round_a', 'round', 151, 10.0, 8.5); put('round_b', 'round', 152, 9.0, 7.0, shape='oval')
    put('ficus_a', 'ficus', 155, 9.0, 9.0); put('ficus_b', 'ficus', 156, 6.0, 5.5)
    put('vbox_a', 'vbox', 157, 8.0, 8.0); put('vbox_b', 'vbox', 158, 5.0, 4.8, shape='round')
    put('bbox_a', 'bbox', 159, 13.0, 8.0); put('bbox_b', 'bbox', 160, 8.0, 5.0)
    put('oak_a', 'oak', 165, 11.0, 15.0); put('oak_b', 'oak', 166, 7.0, 9.0)
    put('pohu', 'pohu', 161, 8.0, 9.5); put('pohu_b', 'pohu', 162, 5.0, 5.5)
    put('column', 'column', 171, 11.0, 4.2)
    put('cherry', 'cherry', 181, 6.0, 5.5); put('plum', 'plum', 182, 6.0, 5.2); put('olive', 'olive', 183, 5.5, 5.5)
    # the ornamentals (veg_hq 'ornamental'): v4 small broadleaves in place of Poly Haven's
    # tree_small_02, a LEAFLESS tree that the AI pass painted as dead, broken trees
    def orn(seed, H, W, shape):
        def b():
            M = V4.build('cherry', seed, H, W, shape=shape); M.sfx = '_v4'; return M
        return b
    K['orn_a'] = (orn(191, 6.5, 6.2, 'round'), 'cherry', 1.3, 9.0)
    K['orn_b'] = (orn(192, 5.0, 4.4, 'oval'), 'cherry', 1.3, 9.0)
    return K


LEAF_LIFT = (1.40, 1.35, 1.25)     # linear RGB gain on the foliage stops


def hex_lin(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def _material(bpy, name, ramp):
    m = bpy.data.materials.get(name)
    if m is not None: return m
    if name[4:].replace('_v3', '').replace('_v4', '') in os.environ.get('VEG_DBGRAMP', '').split(','):     # diagnostics: this kind's leaves magenta
        ramp = (ramp[0], ramp[1], '#800060', '#ff00c0', '#ff00c0')
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    nt = m.node_tree; N = nt.nodes; L = nt.links.new
    pr = N.get('Principled BSDF') or N.new('ShaderNodeBsdfPrincipled')
    out = N.get('Material Output') or N.new('ShaderNodeOutputMaterial')
    at = N.new('ShaderNodeAttribute'); at.attribute_type = 'GEOMETRY'; at.attribute_name = 'vc'
    cr = N.new('ShaderNodeValToRGB'); e = cr.color_ramp; e.interpolation = 'LINEAR'
    stops = [(0.0, ramp[0]), (BARK_HI, ramp[1]), (LEAF_LO, ramp[2]), (LEAF_HI, ramp[3]), (0.88, ramp[4]), (1.0, ramp[4])]
    deep = None
    if V2:
        dk = vp('VEG_DEEPK'); deep = tuple(v * dk for v in hex_lin(ramp[2]))
    # the two default stops become the ends; the others are added AT their
    # position (setting positions one by one re-sorts the list under the loop)
    e.elements[0].position = stops[0][0]; e.elements[0].color = hex_lin(stops[0][1]) + (1.0,)
    e.elements[1].position = stops[-1][0]; e.elements[1].color = hex_lin(stops[-1][1]) + (1.0,)
    for i_, (p_, hx) in enumerate(stops[1:-1]):
        c_ = hex_lin(hx)
        # canopies read near-black from above (critic 24/09): the foliage stops
        # lifted ~35 %, a touch warmer (olive at this sun); bark stays as is
        if i_ in (1, 2): c_ = tuple(min(0.9, v * (1 + (k - 1) * vp('VEG_LIFT'))) for v, k in zip(c_, LEAF_LIFT))
        # v3: the small leaves shadow each other and show the dark inside
        # through their gaps (a crown ~20 % darker than v2's cards at the
        # same albedo, bench 25/09): the leaf stops lifted back to v2's mean
        if i_ in (1, 2) and name.endswith('_v3'): c_ = tuple(min(0.9, v * V3_GAIN * V3_GAINS.get(name[4:-3], 1.3)) for v in c_)
        if i_ in (1, 2) and name.endswith('_v4'): c_ = tuple(min(0.9, v * V4_GAIN * V4_GAINS.get(name[4:-3], 1.3)) for v in c_)
        e.elements.new(p_).color = c_ + (1.0,)
    if deep is not None: e.elements.new(DEEP).color = deep + (1.0,)
    L(at.outputs['Fac'], cr.inputs['Fac'])
    # each tree its own shade, by place ('crand', written by hq_city's instancer)
    ci = N.new('ShaderNodeAttribute'); ci.attribute_type = 'INSTANCER'; ci.attribute_name = 'crand'
    hsv = N.new('ShaderNodeHueSaturation')
    hv_ = vp('VEG_HUEV')
    hm = N.new('ShaderNodeMapRange'); hm.inputs['To Min'].default_value = 0.5 - hv_; hm.inputs['To Max'].default_value = 0.5 + hv_
    vm = N.new('ShaderNodeMapRange'); vm.inputs['To Min'].default_value = 0.88; vm.inputs['To Max'].default_value = 1.12
    L(ci.outputs['Fac'], hm.inputs['Value']); L(ci.outputs['Fac'], vm.inputs['Value'])
    L(hm.outputs['Result'], hsv.inputs['Hue']); L(vm.outputs['Result'], hsv.inputs['Value'])
    L(cr.outputs['Color'], hsv.inputs['Color'])
    base_ = hsv.outputs['Color']
    aod = vp('VEG_AO') if not name.endswith(('_v3', '_v4')) else float(os.environ.get('VEG3_AO', 0.0))   # v3: the leaves' own geometry shadows the crevices
    if aod > 0:   # v2 test: the crown's own crevices darker (AO within the tree, foliage only)
        ao = N.new('ShaderNodeAmbientOcclusion'); ao.only_local = True; ao.samples = 8; ao.inputs['Distance'].default_value = aod
        L(hsv.outputs['Color'], ao.inputs['Color'])
        am = N.new('ShaderNodeMapRange'); am.inputs['To Min'].default_value = vp('VEG_AOMIN')
        L(ao.outputs['AO'], am.inputs['Value'])
        mm = N.new('ShaderNodeMixRGB'); mm.blend_type = 'MULTIPLY'; mm.inputs['Fac'].default_value = 1.0
        L(hsv.outputs['Color'], mm.inputs['Color1']); L(am.outputs['Result'], mm.inputs['Color2'])
        base_ = mm.outputs['Color']
    L(base_, pr.inputs['Base Color'])
    pr.inputs['Roughness'].default_value = 0.7
    try: pr.inputs['Specular IOR Level'].default_value = 0.35
    except KeyError: pass
    # leaves let some light through: a thin translucent share on the foliage only
    gt = N.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.15
    L(at.outputs['Fac'], gt.inputs[0])
    k_ = N.new('ShaderNodeMath'); k_.operation = 'MULTIPLY'; k_.inputs[1].default_value = vp('VEG_TRANS')
    L(gt.outputs[0], k_.inputs[0])
    tr = N.new('ShaderNodeBsdfTranslucent'); L(base_, tr.inputs['Color'])
    mx = N.new('ShaderNodeMixShader'); L(k_.outputs[0], mx.inputs[0])
    L(pr.outputs[0], mx.inputs[1]); L(tr.outputs[0], mx.inputs[2])
    L(mx.outputs[0], out.inputs['Surface'])
    return m


def _to_blender3(bpy, name, mesh, ramp_name):
    """v3: the mesh through foreach_set (a proto has ~10^5 leaves), smooth
    faces and the leaves' own shading normals as custom normals"""
    V = np.concatenate(mesh.V); C = np.concatenate(mesh.C)
    polys = [np.asarray(f, np.int64) for f in mesh.F]
    loops = [np.concatenate(polys)] if polys else []
    sizes = [np.array([len(f) for f in mesh.F], np.int64)] if polys else []
    for a in mesh.Fa: loops.append(a.ravel()); sizes.append(np.full(len(a), a.shape[1], np.int64))
    loops = np.concatenate(loops); sizes = np.concatenate(sizes)
    starts = np.concatenate([[0], np.cumsum(sizes)[:-1]])
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(V)); me.vertices.foreach_set('co', V.astype(np.float32).ravel())
    me.loops.add(len(loops)); me.loops.foreach_set('vertex_index', loops.astype(np.int32))
    me.polygons.add(len(sizes)); me.polygons.foreach_set('loop_start', starts.astype(np.int32))
    me.update(calc_edges=True)
    at = me.attributes.new('vc', 'FLOAT', 'POINT'); at.data.foreach_set('value', C.astype(np.float32))
    me.polygons.foreach_set('use_smooth', np.ones(len(sizes), bool))
    N = mesh.normals().astype(np.float32)
    try:     # Blender 4.5+: free normals as the 'custom_normal' point attribute (2.4 s -> 0.01 s for a 750k-vertex proto)
        at = me.attributes.new('custom_normal', 'FLOAT_VECTOR', 'POINT'); at.data.foreach_set('vector', N.ravel())
    except Exception:
        me.normals_split_custom_set_from_vertices(N)
    sfx_ = getattr(mesh, 'sfx', '_v3'); rp_ = RAMPS[ramp_name]
    if sfx_ == '_v4' and ramp_name in RAMPS4_LEAF and os.environ.get('VEG4_RAMPS', '1') == '1':
        rp_ = (rp_[0], rp_[1], RAMPS4_LEAF[ramp_name][0], RAMPS4_LEAF[ramp_name][1], rp_[4])
    me.materials.append(_material(bpy, f'veg_{ramp_name}' + sfx_, rp_))
    me.update()
    ob = bpy.data.objects.new(name, me)
    coll = bpy.data.collections.new(f'{name}_one'); coll.objects.link(ob)
    mn, mx = V.min(0), V.max(0)
    return coll, float(max(mx[0] - mn[0], mx[1] - mn[1])), float(mx[2]), len(sizes)


def to_blender(bpy, name, mesh, ramp_name):
    """one collection holding the proto's mesh object, foot at the origin"""
    if getattr(mesh, 'v3', False): return _to_blender3(bpy, name, mesh, ramp_name)
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
