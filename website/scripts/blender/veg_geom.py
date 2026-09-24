"""Tree geometry for the city render, in plain numpy (no bpy): the same code
builds a proto in Blender (veg_protos.to_blender) and a quick software preview
outside it (veg_preview.py), so a silhouette is judged before a queue slot.

A mesh is vertices V (n, 3), faces F (lists of vertex indices, tris or quads)
and one float per vertex, `vc`, read by the proto's single material through a
colour ramp:
    0.00 - 0.10   bark      (0 dark, 0.1 light)
    0.20 - 0.80   foliage   (0.2 inner/shaded tone, 0.8 outer/sunlit tone)
    0.90 - 1.00   accent    (flowers, dead fronds, the pohutukawa's red)
The ramp gives ALBEDO, not light: the path tracer does the shading, so the
inner/outer spread stays small (a baked darkening would be counted twice).
"""
import math, os
import numpy as np
_E = lambda k, d: float(os.environ.get(k, d))
# card orientation: the weight of the clump's outward direction and of the sky
# in each card's normal (veg_protos sets its v2 values; VEG_RADIAL, VEG_UPK override)
CARD = {'radial': 0.6, 'upk': 1.0}


class Mesh:
    def __init__(self):
        self.V = []; self.F = []; self.C = []; self.n = 0

    def add(self, V, F, c):
        V = np.asarray(V, dtype=np.float64).reshape(-1, 3)
        c = np.broadcast_to(np.asarray(c, dtype=np.float64), (len(V),))
        self.V.append(V); self.C.append(np.array(c)); self.F.extend([tuple(i + self.n for i in f) for f in F]); self.n += len(V)

    def arrays(self):
        return np.concatenate(self.V), self.F, np.concatenate(self.C)

    def faces(self):
        return len(self.F)


def _frame(t):
    """two unit vectors perpendicular to t"""
    t = t / (np.linalg.norm(t) + 1e-12)
    a = np.array([0.0, 0.0, 1.0]) if abs(t[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = np.cross(t, a); u /= np.linalg.norm(u) + 1e-12
    return u, np.cross(t, u)


def tube(M, P, R, sides, c, cap=False):
    """a tapered tube along the polyline P (k, 3), radii R (k,), bark tone c
    (scalar or per ring); frames carried along so the tube does not twist"""
    P = np.asarray(P, float); k = len(P); R = np.broadcast_to(np.asarray(R, float), (k,))
    cr = np.broadcast_to(np.asarray(c, float), (k,))
    V = []; col = []
    u = None
    for i in range(k):
        t = P[min(i + 1, k - 1)] - P[max(i - 1, 0)]
        t /= np.linalg.norm(t) + 1e-12
        if u is None:
            u, w = _frame(t)
        else:           # parallel transport
            u = u - t * np.dot(u, t); u /= np.linalg.norm(u) + 1e-12; w = np.cross(t, u)
        for s in range(sides):
            a = 2 * math.pi * s / sides
            V.append(P[i] + R[i] * (math.cos(a) * u + math.sin(a) * w))
            # the bark is lighter on one side (a hint of its streaks)
            col.append(cr[i] + 0.02 * math.cos(a))
    F = []
    for i in range(k - 1):
        for s in range(sides):
            a0, a1 = i * sides + s, i * sides + (s + 1) % sides
            F.append((a0, a1, a1 + sides, a0 + sides))
    if cap:
        F.append(tuple(range((k - 1) * sides, k * sides)))
    M.add(V, F, col)


def branch_path(p0, d, L, bend, n, rng, droop=0.0):
    """a gently curving path from p0 along d, length L, n segments; `bend`
    random curvature, `droop` pulls the tip down (per unit length)"""
    d = np.asarray(d, float); d = d / np.linalg.norm(d)
    P = [np.asarray(p0, float)]
    for i in range(n):
        d = d + rng.normal(0, bend, 3) * (L / n) / 4.0 + np.array([0, 0, -droop * (L / n)])
        d /= np.linalg.norm(d)
        P.append(P[-1] + d * L / n)
    return np.array(P)


def cards(M, centres, size, normals, c, stretch=1.0, rng=None):
    """one quad per centre: a leaf card `size` wide (x `stretch` long), facing
    its normal, turned at random in its plane"""
    centres = np.asarray(centres, float); normals = np.asarray(normals, float)
    n = len(centres)
    size = np.broadcast_to(np.asarray(size, float), (n,)); c = np.broadcast_to(np.asarray(c, float), (n,))
    rng = rng or np.random.default_rng(0)
    V = np.empty((n * 4, 3)); col = np.repeat(c, 4); F = []
    for i in range(n):
        u, w = _frame(normals[i])
        a = rng.uniform(0, 2 * math.pi); ca, sa = math.cos(a), math.sin(a)
        e1 = (ca * u + sa * w) * size[i] * 0.5 * stretch; e2 = (-sa * u + ca * w) * size[i] * 0.5
        p = centres[i]
        V[4 * i] = p - e1 - e2; V[4 * i + 1] = p + e1 - e2; V[4 * i + 2] = p + e1 + e2; V[4 * i + 3] = p - e1 + e2
        F.append((4 * i, 4 * i + 1, 4 * i + 2, 4 * i + 3))
    M.add(V, F, col)


_ICO = None
def _ico():
    """an icosphere, subdivided once: 42 vertices, 80 faces"""
    global _ICO
    if _ICO is not None: return _ICO
    t = (1 + 5 ** 0.5) / 2
    V = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
         (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    V = [np.array(v, float) / np.linalg.norm(v) for v in V]; mid = {}
    def m(a, b):
        k = (min(a, b), max(a, b))
        if k not in mid:
            p = V[a] + V[b]; V.append(p / np.linalg.norm(p)); mid[k] = len(V) - 1
        return mid[k]
    F2 = []
    for a, b, c in F:
        ab, bc, ca = m(a, b), m(b, c), m(c, a)
        F2 += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    _ICO = (np.array(V), F2)
    return _ICO


def blob(M, centre, radii, c, rng, rough=0.25):
    """a lumpy ellipsoid (the dense core of a clump, so a crown is not see-through)"""
    V, F = _ico()
    r = 1.0 + rng.uniform(-rough, rough, len(V))
    P = np.asarray(centre, float) + V * np.asarray(radii, float) * r[:, None]
    M.add(P, F, c)


def clump(M, centre, radii, n, size, c_lo, c_hi, rng, up=0.5, hang=0.0, stretch=1.0, core=None, shell=0.35, core_c=None, lobe=None):
    """a clump of foliage: n leaf cards in an ellipsoid, crowded towards its
    skin (a crown is a shell of leaves around a darker inside); `up` tips
    the cards towards the sky (plates), `hang` towards the vertical
    (pendulous eucalyptus leaves); core = radii factor of a solid blob inside"""
    centre = np.asarray(centre, float); radii = np.asarray(radii, float)
    d = rng.normal(size=(n, 3)); d /= np.linalg.norm(d, axis=1)[:, None]
    rr = 1.0 - shell * rng.random(n) ** 1.5
    P = centre + d * radii * rr[:, None]
    # albedo: a little lighter on top and on the outside (older leaves inside)
    h = np.clip((P[:, 2] - centre[2]) / (2 * radii[2]) + 0.5, 0, 1)
    if lobe is None:
        tone = c_lo + (c_hi - c_lo) * np.clip(0.45 * h + 0.35 * rr + 0.3 * rng.random(n) - 0.1, 0, 1)
    else:   # v2: the clump's own tone (lobe, 0 dark .. 1 light) carries, the card's noise is small
        tone = c_lo + (c_hi - c_lo) * np.clip(lobe + 0.25 * (h - 0.5) + 0.2 * (rr - 0.8) + 0.12 * (rng.random(n) - 0.5), 0, 1)
    N = rng.normal(size=(n, 3)) + d * _E('VEG_RADIAL', CARD['radial'])
    N[:, 2] += up * 2.0 * _E('VEG_UPK', CARD['upk'])
    if hang:
        N[:, 2] *= (1.0 - hang)
    N /= np.linalg.norm(N, axis=1)[:, None]
    sz = size * rng.uniform(0.75, 1.25, n)
    cards(M, P, sz, N, tone, stretch=stretch, rng=rng)
    if core:
        blob(M, centre - np.array([0, 0, radii[2] * 0.1]), radii * core, c_lo if core_c is None else core_c, rng)


def envelope_points(rng, n, prof, H0, H1, jitter=0.12):
    """n points spread over a crown's envelope (a solid of revolution from z
    H0 to H1 whose radius at relative height t is prof(t)), roughly evenly
    (best-candidate sampling on the skin, pulled in at random)"""
    pts = []
    cand = 12
    for i in range(n):
        best = None; bd = -1
        for _ in range(cand):
            t = rng.random() ** 0.9
            a = rng.uniform(0, 2 * math.pi)
            r = prof(t) * (1.0 - rng.random() ** 2.5 * 0.45)
            p = np.array([r * math.cos(a), r * math.sin(a), H0 + t * (H1 - H0)])
            p += rng.normal(0, jitter, 3) * np.array([prof(0.5), prof(0.5), (H1 - H0) * 0.3])
            dmin = min((np.linalg.norm(p - q) for q in pts), default=1e9)
            if dmin > bd: bd = dmin; best = p
        pts.append(best)
    return np.array(pts)


def triangulate(F):
    T = []
    for f in F:
        for k in range(1, len(f) - 1): T.append((f[0], f[k], f[k + 1]))
    return np.array(T, dtype=np.int64)
