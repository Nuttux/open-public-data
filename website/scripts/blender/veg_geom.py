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
        self.N = []; self.has_n = False     # v3: per-vertex SHADING normals (zero = from the faces)
        self.Fa = []                        # v3: faces as int arrays (k, 3|4), already offset

    def add(self, V, F, c, N=None):
        V = np.asarray(V, dtype=np.float64).reshape(-1, 3)
        c = np.broadcast_to(np.asarray(c, dtype=np.float64), (len(V),))
        if isinstance(F, np.ndarray): self.Fa.append(F + self.n)
        else: self.F.extend([tuple(i + self.n for i in f) for f in F])
        self.V.append(V); self.C.append(np.array(c))
        if N is None: self.N.append(np.zeros_like(V))
        else: self.N.append(np.asarray(N, float).reshape(-1, 3)); self.has_n = True
        self.n += len(V)

    def arrays(self):
        F = self.F + [tuple(f) for a in self.Fa for f in a.tolist()] if self.Fa else self.F
        return np.concatenate(self.V), F, np.concatenate(self.C)

    def normals(self):
        """per-vertex shading normals: the given ones, else the area-weighted
        mean of the vertex's faces (a tube's ring, a frond's blade)"""
        V, F, _ = self.arrays(); N = np.concatenate(self.N).copy()
        miss = np.linalg.norm(N, axis=1) < 1e-9
        if miss.any():
            T = triangulate(F); fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
            acc = np.zeros_like(V)
            for j in range(3): np.add.at(acc, T[:, j], fn)
            N[miss] = acc[miss]
        return N / np.maximum(1e-12, np.linalg.norm(N, axis=1))[:, None]

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


# ── v3 (25/09, the deep-zoom kit): small leaves, soft shading ────────────────
# At level 9 (9 cm/px) the v2 cards (0.4-0.6 m squares, each flat-shaded at its
# own angle, around 80-face icosphere cores) read as faceted low-poly blobs. v3
# builds each clump from TWIGS (small balls of leaves on the clump's lumpy
# skin) of SMALL rhombic leaves (~2 px at level 9), shaded with SMOOTH normals:
# a leaf's shading normal is its twig's and its clump's outward direction (the
# games' "sphere normals" on foliage), so a crown shades as soft lit volumes
# with real self-shadow between the twigs, not as a heap of flat cards. The
# cores are smooth ellipsoids (subdivided twice, radial normals).
def _frames(t):
    """vectorised _frame: (n, 3) unit t -> u, w with u x w = t"""
    t = t / np.maximum(1e-12, np.linalg.norm(t, axis=1))[:, None]
    a = np.zeros_like(t); side = np.abs(t[:, 2]) < 0.9
    a[side, 2] = 1.0; a[~side, 0] = 1.0
    u = np.cross(t, a); u /= np.maximum(1e-12, np.linalg.norm(u, axis=1))[:, None]
    return u, np.cross(t, u)


def leaves(M, P, Ng, Ns, size, tone, stretch=1.3, rng=None):
    """one rhombic leaf per point P (n, 3): its plane faces Ng (flipped to Ns's
    side), shaded along Ns, `size` wide x `stretch` long, turned at random"""
    n = len(P)
    if not n: return
    rng = rng or np.random.default_rng(0)
    Ng = np.where((np.sum(Ng * Ns, 1) < 0)[:, None], -Ng, Ng)
    u, w = _frames(Ng)
    a = rng.uniform(0, 2 * math.pi, n)[:, None]; ca, sa = np.cos(a), np.sin(a)
    sz = np.broadcast_to(np.asarray(size, float), (n,))[:, None]
    e1 = (ca * u + sa * w) * sz * 0.5 * stretch; e2 = (-sa * u + ca * w) * sz * 0.5
    if V3.get('tri', 1):     # a triangle per leaf (3 vertices, 1 face: at ~1.5 px a leaf's outline does not read)
        V = np.stack([P + e1, P - e1 * 0.5 + e2, P - e1 * 0.5 - e2], 1).reshape(-1, 3); m = 3      # wound to face Ng (a back face flips the shading normal in Cycles: black leaves)
    else:
        V = np.stack([P - e1, P - e2, P + e1, P + e2], 1).reshape(-1, 3); m = 4      # tip, side, tip, side
    F = np.arange(m * n).reshape(n, m)
    col = np.repeat(np.broadcast_to(np.asarray(tone, float), (n,)), m)
    M.add(V, F, col, np.repeat(Ns, m, axis=0))


_ICO2 = None
def _ico2():
    """an icosphere subdivided twice: 162 vertices, 320 faces"""
    global _ICO2
    if _ICO2 is not None: return _ICO2
    V, F = _ico(); V = list(V); mid = {}
    def m(a, b):
        k = (min(a, b), max(a, b))
        if k not in mid:
            p = V[a] + V[b]; V.append(p / np.linalg.norm(p)); mid[k] = len(V) - 1
        return mid[k]
    F2 = []
    for a, b, c in F:
        ab, bc, ca = m(a, b), m(b, c), m(c, a)
        F2 += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    _ICO2 = (np.array(V), np.array(F2))
    return _ICO2


def blob3(M, centre, radii, c, rng, rough=0.12):
    """a smooth lumpy ellipsoid, shaded with its own normals (no facets)"""
    V, F = _ico2()
    # low-frequency lumps (a few random waves), not per-vertex noise
    k = rng.normal(size=(3, 3)); ph = rng.uniform(0, 6.3, 3)
    r = 1.0 + rough * np.sin(V @ k.T * 2.0 + ph).mean(1)
    radii = np.asarray(radii, float)
    P = np.asarray(centre, float) + V * radii * r[:, None]
    N = V / radii; N /= np.linalg.norm(N, axis=1)[:, None]
    M.add(P, F.copy(), c, N)


V3 = {'leaf': 0.14, 'dens': 1.0, 'stretch': 1.3, 'twig': 0.38, 'cap': 9000, 'axis_k': 0.5, 'flat': 0.0, 'tri': 1, 'twig_k': 0.9, 'jt': 0.14, 'jl': 0.03}


def clump3(M, centre, radii, n, size, c_lo, c_hi, rng, up=0.5, hang=0.0, stretch=1.0, core=None, shell=0.35, core_c=None, lobe=None, axis=None):
    """v3 clump, same call as clump(): twigs on a lumpy ellipsoid skin, small
    leaves around each twig (V3 leaf size, density, cap); `n` and `size` (the
    v2 card count and size) only scale the density a little"""
    centre = np.asarray(centre, float); radii = np.asarray(radii, float)
    lf = V3['leaf']; st = V3['stretch'] * (1.0 + 0.5 * max(0.0, stretch - 1.3))
    ra = (radii[0] * radii[1] + radii[1] * radii[2] + radii[0] * radii[2]) / 3.0
    area = 4 * math.pi * ra
    tw = V3['twig'] * max(0.7, min(1.4, math.sqrt(ra) / 1.6))
    nt = max(4, int(area / (math.pi * tw * tw) * 0.9))
    # twigs: on the skin, some pulled in (shell), the skin itself lumpy
    d = rng.normal(size=(nt, 3)); d /= np.linalg.norm(d, axis=1)[:, None]
    if hang: d[:, 2] *= 1.0 - 0.4 * hang
    rr = 1.0 - shell * 0.8 * rng.random(nt) ** 1.4
    T = centre + d * radii * rr[:, None]
    # leaves per twig: the clump's leaf budget spread over its twigs
    la = (0.375 if V3.get('tri', 1) else 0.5) * lf * lf * st          # one leaf's area
    want = V3['dens'] * 1.7 * area / la
    nl_total = min(want, V3['cap'])
    lf_eff = lf * math.sqrt(max(1.0, want / V3['cap']))
    per = max(3, int(nl_total / nt))
    tt = np.repeat(np.arange(nt), per)
    q = rng.normal(size=(len(tt), 3)); q /= np.linalg.norm(q, axis=1)[:, None]
    qr = tw * (0.35 + 0.65 * rng.random(len(tt)) ** 0.5)
    q = q * qr[:, None]
    if hang: q[:, 2] *= 1.0 + 1.6 * hang; q[:, 2] -= tw * 0.6 * hang       # drooping sprays
    if V3['flat']: q[:, 2] *= 1.0 - V3['flat']                              # the cypress' flat sprays
    P = T[tt] + q
    # shading normal: the clump's outward normal (ellipsoid), the twig's own, the crown's axis
    nc = (P - centre) / (radii * radii); nc /= np.maximum(1e-9, np.linalg.norm(nc, axis=1))[:, None]
    nq = q / np.maximum(1e-9, np.linalg.norm(q, axis=1))[:, None]
    Ns = nc * 1.0 + nq * V3.get('twig_k', 0.9)
    if axis is not None:
        na = P - np.asarray(axis, float); na[:, 2] *= 0.5
        na /= np.maximum(1e-9, np.linalg.norm(na, axis=1))[:, None]; Ns += na * V3['axis_k']
    Ns[:, 2] += up * 0.35
    Ns /= np.linalg.norm(Ns, axis=1)[:, None]
    Ng = Ns * 1.1 + rng.normal(size=Ns.shape) * 0.8
    Ng[:, 2] += up * 1.2
    if hang: Ng[:, 2] *= 1.0 - hang
    Ng /= np.linalg.norm(Ng, axis=1)[:, None]
    h = np.clip((P[:, 2] - centre[2]) / (2 * radii[2]) + 0.5, 0, 1)
    rrl = np.linalg.norm((P - centre) / radii, axis=1)
    lob = 0.5 if lobe is None else lobe
    tone = c_lo + (c_hi - c_lo) * np.clip(lob + 0.25 * (h - 0.5) + 0.25 * (np.minimum(rrl, 1.1) - 0.85)
                                           + V3.get('jt', 0.14) * (rng.random(nt)[tt] - 0.5) + V3.get('jl', 0.03) * (rng.random(len(tt)) - 0.5), 0, 1)
    leaves(M, P, Ng, Ns, lf_eff * rng.uniform(0.75, 1.25, len(tt)), tone, st, rng)
    if core:
        blob3(M, centre - np.array([0, 0, radii[2] * 0.1]), radii * core, c_lo if core_c is None else core_c, rng)
