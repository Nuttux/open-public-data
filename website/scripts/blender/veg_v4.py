"""TREES v4 (assets_trees_glass, 27/09): BRANCH-DRIVEN CROWNS for the deep zoom.

Why: at z9 (9.4 cm/px) the v3 crowns read as broccoli, and the AI pass then
paints broccoli. v3 built each crown from ~20 ellipsoid clumps, each leaf
shaded along its clump's ball normal, over a solid dark core: every clump lit
like a floret. A real crown seen from above is a BRANCH SYSTEM carrying leaf
sprays: an irregular outline following the branch tips, clusters of every size,
sky and shadow gaps between them, limbs visible where the crown is open, and
light that shades the crown as a whole (sun side lit, far side and the inside
dark) with the leaves' own self-shadowing on top.

v4 grows each proto as: trunk(s) -> scaffold limbs -> branches -> twigs, every
branch sized to reach an irregular, lobed crown envelope (the species' profile,
low-frequency azimuthal lobes); leaf SPRAYS at the twig tips and along the last
branches (flattened ellipsoids of small leaves, oriented by their twig, surface
weighted), shading normals from the CROWN (not the spray), no solid core.
Species habits (convention after each species' usual form; refs in
qipu-render-work/assets_trees_glass/refs/TREES.md):
  plane    London plane: short bole, 3-5 ascending scaffolds, broad open rounded
           crown, big leaf clusters with gaps, pale mottled limbs showing
  round / ficus / vbox / bbox / oak / pohu / olive / cherry / plum / column
           the evergreen street kinds: denser, smaller sprays, finer texture
  pine     Monterey pine: straight leader, whorled spreading branches ending
           in dense needle tufts (dark gaps between), irregular dome
  cyp      Monterey cypress: short massive trunk, few big spreading limbs,
           dense flat horizontal plates, flat top, wind-sheared variant
  euc      blue gum: tall pale trunk forking high, open crown of hanging,
           vertically drawn-out sprays, sparse
Same kit names, sizes and (TALL, HMAX) as kit3: placement and species untouched.
VEG_V4=1 (default) in veg_protos.kit(); 0 = the v3 kit unchanged."""
import math
import numpy as np
import veg_geom as G
from veg_geom import Mesh, tube, leaves

LEAF_LO, LEAF_HI = 0.22, 0.78
UP = np.array([0.0, 0.0, 1.0])


def nz(v):
    return v / (np.linalg.norm(v) + 1e-12)


def turn(d, ang, az):
    """a direction at angle `ang` from d, turned by `az` around it"""
    u, w = G._frame(d)
    return nz(math.cos(ang) * d + math.sin(ang) * (math.cos(az) * u + math.sin(az) * w))


PROF = {
    'oval':   lambda t: math.sin(math.pi * t) ** 0.75,
    'round':  lambda t: math.sqrt(max(0.0, 1 - (2 * t - 1) ** 2)) * 0.95 + 0.05,
    'dome':   lambda t: (max(0.0, 1 - t ** 2.2)) ** 0.55,
    'broad':  lambda t: (max(0.0, 1 - t ** 1.6)) ** 0.45 * (0.55 + 0.45 * min(1.0, t * 4)),
    'column': lambda t: math.sin(math.pi * t) ** 0.5,
    'vase':   lambda t: (0.45 + 0.55 * math.sin(math.pi * min(1.0, 0.2 + 0.8 * t) * 0.9)),
    'flattop': lambda t: (0.62 + 0.38 * math.sin(math.pi * min(1.0, 0.25 + 0.75 * t))) * (1.0 if t < 0.85 else max(0.2, 1 - (t - 0.85) * 4)),
    'pinedome': lambda t: max(0.12, math.sin(math.pi * (0.12 + 0.88 * t) * 0.92)) ** 0.7,
    'cone':   lambda t: max(0.05, 1 - t) ** 0.9,
    'euc':    lambda t: max(0.1, math.sin(math.pi * (0.1 + 0.9 * t))) ** 0.6,
}


class Env:
    """the crown envelope: a solid of revolution (profile PROF[shape] between z0
    and z1, radius W/2 at its widest) with low-frequency lobes in azimuth and
    height, so the outline is irregular and each tree its own"""
    def __init__(self, rng, z0, z1, W, shape, lobes=0.15, shear=0.0):
        self.z0, self.z1, self.R, self.p = z0, z1, W / 2.0, PROF[shape]
        self.k = [(m, lobes * rng.uniform(0.4, 1.0) / (1 + 0.3 * (m - 2)), rng.uniform(0, 2 * math.pi)) for m in (2, 3, 5, 7)]
        self.vk = (lobes * 0.6, rng.uniform(0, 2 * math.pi), rng.uniform(1.5, 3.0))
        self.shear = shear

    def r(self, z, a):
        t = (z - self.z0) / max(0.1, self.z1 - self.z0)
        if t < 0 or t > 1: return 0.0
        l = 1.0 + sum(A * math.sin(m * a + ph) for m, A, ph in self.k)
        l *= 1.0 + self.vk[0] * math.sin(self.vk[2] * math.pi * t + self.vk[1] + a)
        return self.R * self.p(t) * max(0.3, l)

    def inside(self, p):
        x = p[0] - self.shear * (p[2] - self.z0)
        return math.hypot(x, p[1]) <= self.r(p[2], math.atan2(p[1], x))

    def dist(self, p, d, cap=40.0, step=0.3):
        """how far from p along d until the envelope's skin"""
        s = 0.0; q = np.array(p, float)
        if not self.inside(q): return 0.0
        while s < cap:
            s += step; q = p + d * s
            if not self.inside(q): return s - step * 0.5
        return cap

    def out(self, P):
        """(n, 3) points -> the crown's outward shading direction (axis ->
        point, flattened in z) and the relative height and radius"""
        c = np.zeros_like(P); c[:, 2] = P[:, 2]
        c[:, 0] = self.shear * (P[:, 2] - self.z0)
        v = P - c; v[:, 2] = 0.0
        rad = np.linalg.norm(v, axis=1)
        zr = np.clip((P[:, 2] - self.z0) / max(0.1, self.z1 - self.z0), 0, 1)
        o = v / np.maximum(1e-6, rad)[:, None] * 0.8
        o[:, 2] = (zr - 0.45) * 1.4
        return o / np.linalg.norm(o, axis=1)[:, None], zr, rad / max(0.1, self.R)


class Tree:
    """one proto being grown: the mesh, the envelope, the tips that will carry sprays"""
    def __init__(self, seed, sp):
        self.rng = np.random.default_rng(seed); self.M = Mesh(); self.sp = sp
        self.sprays = []        # (point, direction, size factor)
        self.nb = 0; self.nodes = []

    def path(self, p, d, L, order):
        sp = self.sp; rng = self.rng
        n = max(2, min(7, int(L / 0.8) + 1))
        P = [np.asarray(p, float)]; d = nz(np.asarray(d, float))
        trop = sp['trop'][min(order, len(sp['trop']) - 1)]
        bend = sp['bend']
        for i in range(n):
            d = nz(d + rng.normal(0, bend, 3) * (L / n) / 3.0 + np.array([0, 0, trop * (L / n) / max(1.0, L)]))
            P.append(P[-1] + d * L / n)
        return np.array(P)

    def branch(self, p, d, L, r, order):
        sp = self.sp; rng = self.rng; E = self.E
        P = self.path(p, d, L, order)
        rt = max(0.012, r * sp['taper'])
        if r > 0.015 or order <= 2:
            tube(self.M, P, np.linspace(r, rt, len(P)), 6 if order < 2 else (4 if order < 3 else 3),
                 np.linspace(0.05, 0.085, len(P)) if order < 2 else 0.08)
        self.nb += 1
        if order >= 1: self.nodes.extend(P[1:])
        dt = nz(P[-1] - P[-2])
        omax = sp['omax']
        if order >= omax or L < sp['lmin']:
            # a twig: leaves at its tip and along its outer part
            self.sprays.append((P[-1], dt, 1.0))
            for i in range(max(1, len(P) // 3), len(P) - 1):
                if rng.random() < sp.get('along', 0.8):
                    self.sprays.append((P[i] + rng.normal(0, 0.15, 3), nz(P[i + 1] - P[i] + rng.normal(0, 0.4, 3)), rng.uniform(0.6, 0.9)))
            return
        nk = sp['nk'][order]; nk = int(rng.integers(max(1, nk - 1), nk + 2))
        az0 = rng.uniform(0, 2 * math.pi)
        for c in range(nk):
            t = rng.uniform(sp['t0'][order], 0.97) if c < nk - 1 else rng.uniform(0.8, 1.0)
            fi = t * (len(P) - 1); i0 = min(int(fi), len(P) - 2); q = P[i0] + (P[i0 + 1] - P[i0]) * (fi - i0)
            dp = nz(P[i0 + 1] - P[i0])
            ang = math.radians(sp['ang'][order] + rng.normal(0, 9))
            cd = turn(dp, ang, az0 + c * 2.39996 + rng.normal(0, 0.3))
            cd = nz(cd + np.array([0, 0, sp['up'][order]]))
            Lc = E.dist(q, cd) * rng.uniform(0.72, 1.02)
            Lc = min(Lc, L * sp['lr'][order] * rng.uniform(0.8, 1.2))
            if Lc < 0.35:
                self.sprays.append((q, cd, 0.7)); continue
            self.branch(q, cd, Lc, max(0.012, r * sp['rr'] * (1 - 0.3 * t)), order + 1)
        # the branch's own tip carries leaves too
        self.sprays.append((P[-1], dt, 0.9))

    def infill(self, fill, size):
        """cover the envelope's outer shell: sprays at points of the skin (pulled
        in a little), each on a twig from the nearest branch node; `fill` = the
        share of the skin covered (a dense clipped fig ~1, a blue gum ~0.2)"""
        if fill <= 0 or not self.nodes: return
        rng = self.rng; E = self.E
        N = np.array(self.nodes)
        zs = np.linspace(E.z0, E.z1, 24); area = 0.0
        for z_ in zs: area += 2 * math.pi * E.r(z_, 0.0) * (E.z1 - E.z0) / 24
        area += math.pi * max(E.r(z_, 0.0) for z_ in zs) ** 2 * 0.5
        n = int(fill * area / (size * size * 1.3))
        for _ in range(n):
            t = rng.random() ** 0.8; a = rng.uniform(0, 2 * math.pi)
            z = E.z0 + (E.z1 - E.z0) * t
            r = E.r(z, a) * rng.uniform(0.62, 0.97)
            if r < 0.2: continue
            p = np.array([r * math.cos(a) + E.shear * (z - E.z0), r * math.sin(a), z])
            j = int(np.argmin(np.sum((N - p) ** 2, 1))); o = N[j]; dv = p - o; L = np.linalg.norm(dv)
            if L > 2.2 * size: continue          # no long bare twig out to a lone spray
            if L > 0.4: tube(self.M, [o, o + dv * 0.5 + np.array([0, 0, 0.1 * L]), p], [0.03, 0.02, 0.012], 3, 0.08)
            d = nz(dv) if L > 1e-3 else UP
            self.sprays.append((p, d, rng.uniform(0.75, 1.1)))

    def foliage(self, leaf, stretch, dens, size, flat=0.45, hang=0.0, up=0.6, jt=0.14, surf=0.5, cap=260000):
        """leaf sprays at every spray point: a flattened ellipsoid along its twig
        (horizontal sprays for most kinds, hanging ones for the blue gum),
        leaves weighted to its skin; shading from the crown, not the spray"""
        rng = self.rng; E = self.E; S = self.sprays
        if not S: return
        la = 0.375 * leaf * leaf * stretch
        # the spray sizes, and the leaf count each takes (by its skin area)
        Ls = np.array([size * f * rng.uniform(0.7, 1.3) for _, _, f in S])
        areas = Ls ** 2 * 2.2
        per = np.maximum(12, (dens * areas / la).astype(int))
        tot = per.sum()
        if tot > cap: per = np.maximum(10, (per * cap / tot).astype(int))
        Pc = np.array([p for p, _, _ in S]); Dc = np.array([d for _, d, _ in S])
        # spray frame: a1 along the twig (tilted toward the horizontal), a3 the spray's thin axis
        a1 = Dc.copy(); a1[:, 2] *= (1 - flat)
        if hang: a1[:, 2] -= hang
        a1 /= np.maximum(1e-9, np.linalg.norm(a1, axis=1))[:, None]
        a2 = np.cross(a1, UP); bad = np.linalg.norm(a2, axis=1) < 1e-3; a2[bad] = [1, 0, 0]
        a2 /= np.linalg.norm(a2, axis=1)[:, None]; a3 = np.cross(a2, a1)
        idx = np.repeat(np.arange(len(S)), per)
        n = len(idx)
        q = rng.normal(size=(n, 3)); q /= np.linalg.norm(q, axis=1)[:, None]
        rr = rng.random(n) ** (1.0 / (3.0 + 6 * surf))          # surf -> the leaves sit near the spray's skin
        q *= rr[:, None]
        L = Ls[idx]
        th = 0.25 + 0.6 * (1 - flat)                               # the spray's thickness ratio
        lx, ly, lz = L * 0.55, L * 0.42, L * 0.42 * th
        if hang:     # the blue gum's hanging sprays: drawn out downward
            lz = L * (0.3 + 0.9 * hang)
        off = -a1[idx] * (L * 0.25)[:, None]                       # the spray reaches back along its twig
        if hang: off += np.array([0, 0, -1.0]) * (L * 0.35 * hang)[:, None]
        P = Pc[idx] + off + a1[idx] * (q[:, :1] * lx[:, None]) + a2[idx] * (q[:, 1:2] * ly[:, None]) + a3[idx] * (q[:, 2:3] * lz[:, None])
        o, zr, rr_ = E.out(P)
        # shading normal: the crown's outward direction and the sky, a little spray and leaf noise
        so = (P - Pc[idx] - off); so /= np.maximum(1e-9, np.linalg.norm(so, axis=1))[:, None]
        Ns = o * 0.9 + UP * up + so * 0.35 + rng.normal(size=(n, 3)) * 0.18
        Ns /= np.linalg.norm(Ns, axis=1)[:, None]
        Ng = UP * (1.0 - hang * 0.7) + rng.normal(size=(n, 3)) * 0.75 + so * 0.3
        Ng /= np.linalg.norm(Ng, axis=1)[:, None]
        # tone (albedo only; the path tracer shades): the crown's top and skin a
        # touch lighter, spray to spray and leaf to leaf variation
        ts = rng.random(len(S))
        tone = 0.5 + 0.16 * (zr - 0.55) + 0.12 * (np.minimum(rr_, 1.1) - 0.75) + jt * (ts[idx] - 0.5) + 0.05 * (rng.random(n) - 0.5)
        tone = LEAF_LO + (LEAF_HI - LEAF_LO) * np.clip(tone, 0, 1)
        leaves(self.M, P, Ng, Ns, leaf * rng.uniform(0.75, 1.25, n), tone, stretch, rng)


def _trunk(T, base, H_top, r0, lean=0.05, bend=0.04, n=6):
    rng = T.rng
    d = nz(np.array([rng.normal(0, lean), rng.normal(0, lean), 1.0]))
    P = G.branch_path(base, d, H_top, bend, n, rng)
    tube(T.M, P, np.linspace(r0 * 1.25, r0 * 0.75, len(P)), 9, np.linspace(0.04, 0.07, len(P)))
    return P


def decurrent(seed, H, W, sp):
    """a broadleaf: bole, scaffold limbs from the trunk head, branches to the envelope"""
    T = Tree(seed, sp); rng = T.rng
    Hb = H * sp['bole']
    T.E = Env(rng, Hb * 0.8, H, W, sp['shape'], sp.get('lobes', 0.15))
    r0 = sp.get('r0k', 0.022) * H + 0.06
    stems = sp.get('stems', 1)
    for s in range(stems):
        off = np.zeros(3) if stems == 1 else np.array([math.cos(2 * math.pi * s / stems) * 0.3, math.sin(2 * math.pi * s / stems) * 0.3, 0])
        P = _trunk(T, off, Hb + H * 0.05, r0 / stems ** 0.5, lean=0.06 + 0.1 * (stems > 1))
        top = P[-1]
        ns = sp['scaf']; ns = int(rng.integers(max(2, ns - 1), ns + 2))
        a0 = rng.uniform(0, 2 * math.pi)
        for i in range(ns):
            az = a0 + 2 * math.pi * i / ns + rng.normal(0, 0.35)
            el = math.radians(90 - sp['ang0'] + rng.normal(0, 8))
            d = np.array([math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)])
            L = T.E.dist(top, d) * rng.uniform(0.55, 0.8)
            if L < 0.5: L = 0.5
            T.branch(top, d, L, r0 * 0.62 / stems ** 0.5, 1)
        if sp.get('leader', 0):     # a central leader through the crown (bbox, column)
            d = nz(np.array([rng.normal(0, 0.05), rng.normal(0, 0.05), 1.0]))
            T.branch(top, d, T.E.dist(top, d) * 0.85, r0 * 0.55, 1)
    T.infill(sp.get('fill', 0.5), sp['fol']['size'])
    T.foliage(**sp['fol'])
    T.M.v3 = True
    return T.M


def excurrent(seed, H, W, sp):
    """a conifer: a straight leader, branches in whorls along it to the envelope"""
    T = Tree(seed, sp); rng = T.rng
    z0 = H * sp['bole']
    T.E = Env(rng, z0 * 0.9, H, W, sp['shape'], sp.get('lobes', 0.15), shear=sp.get('shear', 0.0))
    r0 = sp.get('r0k', 0.03) * H
    ht = H * sp.get('lead', 0.86)
    P = _trunk(T, np.zeros(3), ht, r0, lean=0.04, bend=0.05, n=9)
    nw = sp['whorls']; nw = int(rng.integers(nw - 1, nw + 2))
    for w in range(nw):
        z = z0 + (ht - z0) * (w + rng.uniform(0.2, 0.8)) / nw
        i = int(np.argmin(np.abs(P[:, 2] - z))); q = P[i]
        k = int(rng.integers(sp['per_whorl'] - 1, sp['per_whorl'] + 2)); a0 = rng.uniform(0, 2 * math.pi)
        for j in range(k):
            az = a0 + 2 * math.pi * j / k + rng.normal(0, 0.4)
            el = math.radians(sp['el0'] + rng.normal(0, 10) + 25 * (w / max(1, nw - 1)) * sp.get('el_up', 1.0))
            d = np.array([math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)])
            L = T.E.dist(q, d) * rng.uniform(0.7, 1.0)
            if L < 0.4: continue
            T.branch(q, d, L, r0 * 0.4 * (1 - 0.5 * w / nw), 1)
    T.sprays.append((P[-1], UP, 1.0))
    T.infill(sp.get('fill', 0.5), sp['fol']['size'])
    T.foliage(**sp['fol'])
    T.M.v3 = True
    return T.M


def forked(seed, H, W, sp):
    """the blue gum: a tall straight trunk forking high into 2-3 leaders, limbs
    out of them, hanging sprays"""
    T = Tree(seed, sp); rng = T.rng
    Hf = H * rng.uniform(0.36, 0.48)
    T.E = Env(rng, Hf * 0.85, H, W, 'euc', sp.get('lobes', 0.22))
    r0 = 0.019 * H
    P = _trunk(T, np.zeros(3), Hf, r0 * 1.1, lean=0.035, bend=0.04, n=8)
    nl = int(rng.integers(2, 4))
    for i in range(nl):
        a = 2 * math.pi * i / nl + rng.uniform(-0.5, 0.5); s = math.tan(math.radians(rng.uniform(10, 24)))
        d = nz(np.array([s * math.cos(a), s * math.sin(a), 1.0]))
        T.branch(P[-1], d, T.E.dist(P[-1], d) * rng.uniform(0.85, 0.98), r0 * 0.62, 1)
    T.infill(sp.get('fill', 0.5), sp['fol']['size'])
    T.foliage(**sp['fol'])
    T.M.v3 = True
    return T.M


# ── the species ──────────────────────────────────────────────────────────────
# nk children per branch order, ang (deg from the parent), lr length ratio cap,
# t0 first child position, up tropism added, trop per-order curvature (+ up / - droop)
BROAD = dict(bole=0.28, shape='oval', lobes=0.16, scaf=4, ang0=38, omax=4, nk=[0, 4, 4, 3, 3], ang=[0, 40, 45, 50, 50],
             lr=[0, 0.8, 0.7, 0.6, 0.6], t0=[0, 0.3, 0.25, 0.2, 0.2], up=[0, 0.15, 0.1, 0.05, 0.0], trop=[0.3, 0.2, 0.0, -0.2, -0.2],
             bend=0.35, taper=0.4, rr=0.6, lmin=0.6)
SP = {
    # London plane: broad open crown, big clusters and gaps, pale limbs showing
    'plane': dict(BROAD, fill=0.45, lobes=0.2, scaf=4, ang0=40, nk=[0, 4, 3, 3, 3], ang=[0, 38, 42, 48, 50],
                  fol=dict(leaf=0.17, stretch=1.1, dens=1.25, size=1.5, flat=0.5, up=0.6, jt=0.16, surf=0.6)),
    'round': dict(BROAD, fill=0.8, shape='round', lobes=0.13, scaf=5, nk=[0, 4, 4, 3, 3],
                  fol=dict(leaf=0.14, stretch=1.35, dens=1.5, size=1.15, flat=0.4, up=0.55, jt=0.13, surf=0.5)),
    # Indian laurel fig: a dense clipped round head, smooth grey trunk
    'ficus': dict(BROAD, fill=1.0, shape='round', lobes=0.09, scaf=5, ang0=42, nk=[0, 5, 4, 3, 3],
                  fol=dict(leaf=0.12, stretch=1.4, dens=1.8, size=1.0, flat=0.35, up=0.5, jt=0.1, surf=0.45)),
    # Victorian box: a dense rounded dome
    'vbox': dict(BROAD, fill=0.9, shape='dome', lobes=0.12, scaf=5, bole=0.22, nk=[0, 4, 4, 3, 3],
                 fol=dict(leaf=0.13, stretch=1.5, dens=1.65, size=1.05, flat=0.4, up=0.55, jt=0.12, surf=0.5)),
    # Brisbane box: an upright oval, dark, fairly open, a leader
    'bbox': dict(BROAD, fill=0.6, shape='oval', lobes=0.16, scaf=4, ang0=28, leader=1, nk=[0, 4, 3, 3, 3],
                 fol=dict(leaf=0.14, stretch=1.45, dens=1.35, size=1.1, flat=0.45, up=0.55, jt=0.14, surf=0.55)),
    # coast live oak: sinuous spreading limbs, a broad lumpy dome
    'oak': dict(BROAD, fill=0.8, shape='dome', lobes=0.18, scaf=5, bole=0.16, ang0=55, bend=0.5, nk=[0, 4, 4, 3, 3],
                fol=dict(leaf=0.12, stretch=1.3, dens=1.6, size=1.2, flat=0.5, up=0.5, jt=0.14, surf=0.5)),
    # pohutukawa: low broad dome, multi-stem, dense
    'pohu': dict(BROAD, fill=0.85, shape='dome', lobes=0.14, scaf=3, bole=0.14, ang0=55, stems=2, nk=[0, 4, 4, 3, 3],
                 fol=dict(leaf=0.13, stretch=1.4, dens=1.6, size=1.1, flat=0.45, up=0.55, jt=0.12, surf=0.5)),
    # olive: open, multi-stem, fine silvery texture
    'olive': dict(BROAD, fill=0.5, shape='round', lobes=0.2, scaf=3, bole=0.22, ang0=45, stems=2, bend=0.5, nk=[0, 4, 3, 3, 3],
                  fol=dict(leaf=0.10, stretch=2.0, dens=1.2, size=0.9, flat=0.4, up=0.5, jt=0.14, surf=0.6)),
    'cherry': dict(BROAD, fill=0.55, shape='round', lobes=0.15, scaf=4, ang0=45, nk=[0, 4, 3, 3, 3],
                   fol=dict(leaf=0.13, stretch=1.3, dens=1.3, size=0.9, flat=0.45, up=0.55, jt=0.14, surf=0.55)),
    'plum': dict(BROAD, fill=0.55, shape='oval', lobes=0.15, scaf=4, ang0=38, nk=[0, 4, 3, 3, 3],
                 fol=dict(leaf=0.13, stretch=1.3, dens=1.3, size=0.9, flat=0.45, up=0.55, jt=0.14, surf=0.55)),
    'column': dict(BROAD, fill=0.9, shape='column', lobes=0.08, scaf=6, bole=0.1, ang0=14, leader=1, nk=[0, 4, 3, 3, 2], ang=[0, 25, 35, 40, 45],
                   fol=dict(leaf=0.13, stretch=1.3, dens=1.5, size=0.85, flat=0.3, up=0.45, jt=0.12, surf=0.5)),
    # Monterey pine: whorls, dense needle tufts at the branch ends, dark gaps
    'pine': dict( fill=0.6,bole=0.35, shape='pinedome', lobes=0.2, whorls=7, per_whorl=4, el0=8, lead=0.86, r0k=0.03, omax=3,
                 nk=[0, 3, 3, 2, 2], ang=[0, 40, 45, 45], lr=[0, 0.55, 0.5, 0.5], t0=[0, 0.35, 0.3, 0.3], up=[0, 0.35, 0.3, 0.3],
                 trop=[0.2, 0.25, 0.3, 0.2], bend=0.3, taper=0.35, rr=0.55, lmin=0.5,
                 fol=dict(leaf=0.10, stretch=3.0, dens=1.9, size=1.05, flat=0.2, up=0.6, jt=0.16, surf=0.35)),
    # Monterey cypress: big spreading limbs, flat horizontal plates, flat top
    'cyp': dict( fill=0.7,bole=0.4, shape='flattop', lobes=0.18, whorls=5, per_whorl=4, el0=22, el_up=0.6, lead=0.6, r0k=0.05, omax=3,
                nk=[0, 4, 4, 3, 3], ang=[0, 42, 50, 55], lr=[0, 0.6, 0.55, 0.5], t0=[0, 0.3, 0.25, 0.2], up=[0, 0.05, 0.0, 0.0],
                trop=[0.1, 0.05, 0.0, 0.0], bend=0.3, taper=0.35, rr=0.55, lmin=0.6,
                fol=dict(leaf=0.15, stretch=1.2, dens=1.9, size=1.9, flat=0.85, up=0.7, jt=0.13, surf=0.4)),
    # blue gum: hanging, drawn-out sprays, open
    'euc': dict( fill=0.2,omax=4, nk=[0, 5, 3, 3, 2], ang=[0, 38, 42, 45, 45], lr=[0, 0.5, 0.55, 0.5, 0.5], t0=[0, 0.3, 0.3, 0.3, 0.3], up=[0, 0.1, 0.0, -0.1, -0.1],
                trop=[0.3, 0.15, -0.05, -0.2, -0.3], bend=0.35, taper=0.35, rr=0.55, lmin=0.8, lobes=0.25,
                fol=dict(leaf=0.12, stretch=2.6, dens=0.95, size=1.5, flat=0.3, hang=0.6, up=0.45, jt=0.18, surf=0.5)),
}


def build(kind, seed, H, W=None, **over):
    sp = dict(SP[kind]); fol = dict(sp.get('fol', {}))
    for k, v in over.items():
        if k in fol: fol[k] = v
        else: sp[k] = v
    sp['fol'] = fol
    if kind == 'pine': return excurrent(seed, H, W or H * 0.55, sp)
    if kind == 'cyp': return excurrent(seed, H, W or H * 0.9, sp)
    if kind == 'euc': return forked(seed, H, W or H * 0.42, sp)
    return decurrent(seed, H, W or H * 0.8, sp)
