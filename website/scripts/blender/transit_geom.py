"""Geometry helpers for transit_hq.py: polylines resampled along a track, and a
bank of quads per material emitted as Blender meshes in one go (numpy,
foreach_set), with a per-face colour attribute 'bcol'."""
import math
import numpy as np


def resample(pts, step):
    """a polyline (list of [x, y]) at `step` metres: X, Y, S (arc length),
    TX, TY (unit tangent), NX, NY (unit normal, to the left)"""
    P = np.asarray(pts, float)
    if len(P) < 2: return None
    seg = np.hypot(*np.diff(P, axis=0).T)
    P = P[np.concatenate([[True], seg > 1e-3])]
    if len(P) < 2: return None
    seg = np.hypot(*np.diff(P, axis=0).T)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    n = max(2, int(math.ceil(s[-1] / step)) + 1)
    S = np.linspace(0.0, s[-1], n)
    X = np.interp(S, s, P[:, 0]); Y = np.interp(S, s, P[:, 1])
    TX = np.gradient(X); TY = np.gradient(Y); tl = np.hypot(TX, TY) + 1e-12
    TX /= tl; TY /= tl
    return X, Y, S, TX, TY, -TY, TX


def smooth_bool(a, k):
    """majority over a window of 2k+1 samples"""
    k = min(k, (len(a) - 1) // 2)
    if k <= 0: return a
    c = np.convolve(a.astype(float), np.ones(2 * k + 1), mode='same')
    n = np.convolve(np.ones(len(a)), np.ones(2 * k + 1), mode='same')
    return c / n > 0.5


def runs(mask):
    """[(i0, i1)] inclusive-exclusive index runs where mask is True (each run
    shares its end sample with the next strip so strips meet)"""
    out = []; i = 0; n = len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]: j += 1
            out.append((max(0, i - 1) if i > 0 else 0, min(n, j + 1)))
            i = j
        else: i += 1
    return out


class Bank:
    """quads (and triangles as quads with a repeated last vertex are NOT
    allowed: use tris()) per material key"""
    def __init__(self):
        self.g = {}

    def _grp(self, key):
        g = self.g.get(key)
        if g is None: g = self.g[key] = dict(V=[], Q=[], QC=[], T=[], TC=[], n=0)
        return g

    def quads(self, key, V, F, C):
        V = np.asarray(V, np.float32).reshape(-1, 3); F = np.asarray(F, np.int64).reshape(-1, 4)
        if not len(F): return
        g = self._grp(key)
        C = np.asarray(C, np.float32)
        if C.ndim == 1: C = np.tile(C if len(C) == 4 else np.r_[C, 1.0], (len(F), 1))
        g['V'].append(V); g['Q'].append(F + g['n']); g['QC'].append(C); g['n'] += len(V)

    def tris(self, key, V, F, C):
        V = np.asarray(V, np.float32).reshape(-1, 3); F = np.asarray(F, np.int64).reshape(-1, 3)
        if not len(F): return
        g = self._grp(key)
        C = np.asarray(C, np.float32)
        if C.ndim == 1: C = np.tile(C if len(C) == 4 else np.r_[C, 1.0], (len(F), 1))
        g['V'].append(V); g['T'].append(F + g['n']); g['TC'].append(C); g['n'] += len(V)

    def strip(self, key, A, B, C):
        """a strip between two edges A, B ((n, 3) each): quads A[i] B[i] B[i+1] A[i+1]"""
        n = len(A)
        if n < 2: return
        i = np.arange(n - 1)
        self.quads(key, np.vstack([A, B]), np.stack([i, n + i, n + i + 1, i + 1], 1), C)

    def nfaces(self):
        return sum(sum(len(q) for q in g['Q']) + sum(len(t) for t in g['T']) for g in self.g.values())

    def emit(self, bpy, coll, mats, name):
        objs = []
        for key, g in self.g.items():
            if not g['Q'] and not g['T']: continue
            V = np.concatenate(g['V'])
            Q = np.concatenate(g['Q']) if g['Q'] else np.zeros((0, 4), np.int64)
            T = np.concatenate(g['T']) if g['T'] else np.zeros((0, 3), np.int64)
            C = np.concatenate((g['QC'] if g['Q'] else []) + (g['TC'] if g['T'] else []))
            me = bpy.data.meshes.new(f'{name}.{key}')
            me.vertices.add(len(V)); me.vertices.foreach_set('co', V.ravel())
            loops = np.concatenate([Q.ravel(), T.ravel()]).astype(np.int32)
            starts = np.concatenate([np.arange(len(Q)) * 4, len(Q) * 4 + np.arange(len(T)) * 3]).astype(np.int32)
            me.loops.add(len(loops)); me.loops.foreach_set('vertex_index', loops)
            me.polygons.add(len(Q) + len(T)); me.polygons.foreach_set('loop_start', starts)
            try: me.polygons.foreach_set('loop_total', np.concatenate([np.full(len(Q), 4), np.full(len(T), 3)]).astype(np.int32))
            except Exception: pass
            me.update(calc_edges=True)
            at = me.color_attributes.new('bcol', 'FLOAT_COLOR', 'FACE')
            at.data.foreach_set('color', C.astype(np.float32).ravel())
            me.validate(clean_customdata=False)
            m = mats.get(key)
            if m is not None: me.materials.append(m)
            ob = bpy.data.objects.new(f'{name}.{key}', me); coll.objects.link(ob); objs.append(ob)
        self.g = {}
        return objs


def mesh_multi(bpy, name, V, F, C, MI, mats):
    """a small mesh with several materials: F faces (tuples), C face colours
    (rgba), MI material index per face into `mats`"""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in V], [], [tuple(f) for f in F])
    for m in mats: me.materials.append(m)
    me.polygons.foreach_set('material_index', [int(i) for i in MI])
    at = me.color_attributes.new('bcol', 'FLOAT_COLOR', 'FACE')
    at.data.foreach_set('color', [x for c in C for x in c])
    me.update()
    return me
