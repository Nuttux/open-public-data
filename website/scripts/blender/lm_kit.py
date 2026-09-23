"""Geometry and materials for the hand-modelled landmarks (landmarks_hq.py).

Kit accumulates faces per material key, with a face colour ('bcol', the same
attribute the district materials read) and a smooth flag, and emits one mesh
per material. Every primitive takes world coordinates (metres, z up).
"""
import math

def hexc(h, a=1.0):
    """'#rrggbb' (sRGB) -> linear rgba, as gen_buildings emits its paint"""
    h = h.lstrip('#')
    return tuple((int(h[i:i + 2], 16) / 255) ** 2.2 for i in (0, 2, 4)) + (a,)

def lin(r, g, b, a=1.0): return (r, g, b, a)

def v_add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def v_sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def v_mul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def v_dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def v_cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def v_len(a): return math.sqrt(v_dot(a, a))
def v_norm(a):
    l = v_len(a) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)
def lerp(a, b, t): return tuple(x + (y - x) * t for x, y in zip(a, b))

class Frame:
    """a local frame on the ground: origin (x, y), u axis at angle `ang`
    (radians from +x), v axis 90° left of it; P(u, v, z) -> world"""
    def __init__(self, x, y, ang=0.0, z=0.0):
        self.x, self.y, self.z = x, y, z
        self.cu, self.su = math.cos(ang), math.sin(ang)
    def P(self, u, v, z=0.0):
        return (self.x + u * self.cu - v * self.su, self.y + u * self.su + v * self.cu, self.z + z)
    def uv(self, x, y):
        dx, dy = x - self.x, y - self.y
        return (dx * self.cu + dy * self.su, -dx * self.su + dy * self.cu)
    @property
    def U(self): return (self.cu, self.su, 0.0)
    @property
    def V(self): return (-self.su, self.cu, 0.0)

class Kit:
    def __init__(self):
        self.m = {}          # mat -> [V, F, C, S]
        self.nf = 0

    def _g(self, mat):
        g = self.m.get(mat)
        if g is None: g = self.m[mat] = [[], [], [], []]
        return g

    def face(self, mat, pts, col=(0.8, 0.8, 0.8, 1), smooth=False):
        V, F, C, S = self._g(mat)
        k = len(V); V.extend(pts); F.append(tuple(range(k, k + len(pts)))); C.append(col if len(col) == 4 else (*col, 1.0)); S.append(smooth)
        self.nf += 1

    def mesh(self, mat, verts, faces, col=(0.8, 0.8, 0.8, 1), smooth=False):
        """a whole indexed mesh at once (faces index into verts)"""
        V, F, C, S = self._g(mat)
        k = len(V); V.extend(verts)
        c4 = col if len(col) == 4 else (*col, 1.0)
        for f in faces:
            F.append(tuple(i + k for i in f)); C.append(c4); S.append(smooth)
        self.nf += len(faces)

    # ── primitives ──────────────────────────────────────────────────────────
    def prism(self, mat, ring, z0, z1, col, top=True, bottom=False, smooth=False, top_col=None, top_mat=None):
        """vertical extrusion of a 2D ring (any winding) from z0 to z1"""
        r = ring[:-1] if ring[0] == ring[-1] else list(ring)
        a2 = sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))
        if a2 < 0: r = r[::-1]                                     # counter-clockwise
        n = len(r)
        verts = [(p[0], p[1], z0) for p in r] + [(p[0], p[1], z1) for p in r]
        faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        self.mesh(mat, verts, faces, col, smooth)
        if top: self.face(top_mat or mat, [(p[0], p[1], z1) for p in r], top_col or col)
        if bottom: self.face(mat, [(p[0], p[1], z0) for p in r[::-1]], col)

    def loft(self, mat, rings, col, cap_top=True, cap_bottom=False, smooth=False, closed=True):
        """rings: list of equal-length lists of 3D points, bottom to top"""
        n = len(rings[0]); verts = [p for r in rings for p in r]; faces = []
        m = n if closed else n - 1
        for j in range(len(rings) - 1):
            for i in range(m):
                a, b = j * n + i, j * n + (i + 1) % n
                faces.append((a, b, b + n, a + n))
        self.mesh(mat, verts, faces, col, smooth)
        if cap_top and closed: self.face(mat, list(rings[-1]), col)
        if cap_bottom and closed: self.face(mat, list(rings[0])[::-1], col)

    def lathe(self, mat, cx, cy, z0, prof, col, n=24, smooth=True, cap=True, ang0=0.0):
        """surface of revolution: prof = [(radius, z), ...] bottom to top"""
        rings = []
        for r, z in prof:
            rings.append([(cx + r * math.cos(ang0 + 2 * math.pi * i / n), cy + r * math.sin(ang0 + 2 * math.pi * i / n), z0 + z) for i in range(n)])
        self.loft(mat, rings, col, cap_top=cap and prof[-1][0] > 1e-3, smooth=smooth)

    def box(self, mat, fr, u0, u1, v0, v1, z0, z1, col, top=True, bottom=False):
        """box aligned with a Frame"""
        ring = [fr.P(u0, v0)[:2], fr.P(u1, v0)[:2], fr.P(u1, v1)[:2], fr.P(u0, v1)[:2]]
        self.prism(mat, ring, fr.z + z0, fr.z + z1, col, top=top, bottom=bottom)

    def beam(self, mat, p0, p1, w, h, col, up=(0, 0, 1), caps=True):
        """a rectangular member from p0 to p1: w across (perpendicular to up),
        h along `up`"""
        d = v_norm(v_sub(p1, p0))
        s = v_cross(d, up)
        if v_len(s) < 1e-6: s = v_cross(d, (1, 0, 0))
        s = v_norm(s); t = v_norm(v_cross(s, d))
        hs, ht = v_mul(s, w / 2), v_mul(t, h / 2)
        def ring(p): return [v_add(v_add(p, hs), ht), v_add(v_sub(p, hs), ht), v_sub(v_sub(p, hs), ht), v_sub(v_add(p, hs), ht)]
        r0, r1 = ring(p0), ring(p1)
        verts = r0 + r1
        faces = [(i, (i + 1) % 4, 4 + (i + 1) % 4, 4 + i) for i in range(4)]
        if caps: faces += [(3, 2, 1, 0), (4, 5, 6, 7)]
        self.mesh(mat, verts, faces, col)

    def cyl(self, mat, p0, p1, r, col, n=8, caps=False, smooth=True, r1=None):
        d = v_norm(v_sub(p1, p0))
        a = (1, 0, 0) if abs(d[0]) < 0.9 else (0, 1, 0)
        s = v_norm(v_cross(d, a)); t = v_cross(d, s)
        rr1 = r if r1 is None else r1
        verts = []
        for p, rad in ((p0, r), (p1, rr1)):
            for i in range(n):
                c, sn = math.cos(2 * math.pi * i / n), math.sin(2 * math.pi * i / n)
                verts.append(v_add(p, v_add(v_mul(s, c * rad), v_mul(t, sn * rad))))
        faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        self.mesh(mat, verts, faces, col, smooth)
        if caps:
            self.face(mat, verts[:n][::-1], col); self.face(mat, verts[n:], col)

    def tube(self, mat, pts, r, col, n=8, smooth=True):
        """a circular section swept along a polyline (parallel-transported)"""
        if len(pts) < 2: return
        d0 = v_norm(v_sub(pts[1], pts[0]))
        a = (0, 0, 1) if abs(d0[2]) < 0.9 else (1, 0, 0)
        s = v_norm(v_cross(d0, a))
        rings = []
        for k, p in enumerate(pts):
            if k == 0: d = d0
            elif k == len(pts) - 1: d = v_norm(v_sub(pts[k], pts[k - 1]))
            else: d = v_norm(v_sub(pts[k + 1], pts[k - 1]))
            s = v_norm(v_sub(s, v_mul(d, v_dot(s, d))))
            t = v_cross(d, s)
            rings.append([v_add(p, v_add(v_mul(s, math.cos(2 * math.pi * i / n) * r), v_mul(t, math.sin(2 * math.pi * i / n) * r))) for i in range(n)])
        self.loft(mat, rings, col, cap_top=False, smooth=smooth)

    def face_holes(self, mat, outer, holes, z, col):
        """a flat face at height z with holes (courtyards), triangulated"""
        try:
            from mathutils import Vector
            from mathutils.geometry import tessellate_polygon
        except ImportError:
            self.face(mat, [(p[0], p[1], z) for p in outer], col); return
        # holes the tessellator cannot take: slivers, and a hole inside another
        # hole (an islet's pond — OSM has one in the Palace of Fine Arts
        # lagoon): with them it dropped whole fans of the face (2026-09-24)
        def _ar(q): return 0.5 * abs(sum(q[i][0] * q[(i + 1) % len(q)][1] - q[(i + 1) % len(q)][0] * q[i][1] for i in range(len(q))))
        def _pin(x, y, q):
            ins = False
            for i in range(len(q)):
                (x1, y1), (x2, y2) = q[i][:2], q[(i + 1) % len(q)][:2]
                if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1: ins = not ins
            return ins
        hs = [h for h in holes if len(h) >= 3 and _ar(h) > 4.0]
        holes = [h for h in hs if not any(o is not h and _pin(h[0][0], h[0][1], o) for o in hs)]
        loops = [[Vector((p[0], p[1], z)) for p in outer]] + [[Vector((p[0], p[1], z)) for p in h] for h in holes]
        tris = tessellate_polygon(loops)
        pts = [p for l in loops for p in l]
        V = [tuple(p) for p in pts]
        F = []
        for t in tris:
            a, b, c = V[t[0]], V[t[1]], V[t[2]]
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0: t = (t[0], t[2], t[1])
            F.append(tuple(t))
        self.mesh(mat, V, F, col)

    def disc(self, mat, cx, cy, z, r, col, n=24):
        self.face(mat, [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n), z) for i in range(n)], col)

    # ── output ──────────────────────────────────────────────────────────────
    def emit(self, bpy, sc, mats, name='lm'):
        objs = []
        for k, (V, F, C, S) in self.m.items():
            if not F: continue
            me = bpy.data.meshes.new(f'{name}.{k}')
            me.from_pydata(V, [], F)
            at = me.color_attributes.new('bcol', 'FLOAT_COLOR', 'FACE')
            at.data.foreach_set('color', [x for c in C for x in c])
            me.polygons.foreach_set('use_smooth', S)
            me.validate(clean_customdata=False)
            mat = mats.get(k)
            if mat is not None: me.materials.append(mat)
            ob = bpy.data.objects.new(f'{name}.{k}', me); sc.collection.objects.link(ob); objs.append(ob)
        self.m = {}
        return objs


# ── materials ────────────────────────────────────────────────────────────────
def _nodes(bpy, name):
    m = bpy.data.materials.get(name)
    if m is not None: return m, None
    m = bpy.data.materials.new(name); m.use_nodes = True
    return m, m.node_tree

def materials(bpy, mats):
    """adds the landmark materials to `mats` (keys lm_*) and returns it"""
    def attr(nt):
        a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = 'bcol'; return a
    def noise(nt, scale, detail=3.0, vec=None):
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = detail
        if vec is not None: nt.links.new(vec, n.inputs['Vector'])
        return n
    def mrange(nt, src, a, b, lo=0.0, hi=1.0):
        r = nt.nodes.new('ShaderNodeMapRange'); r.interpolation_type = 'SMOOTHSTEP'; nt.links.new(src, r.inputs[0])
        r.inputs[1].default_value = lo; r.inputs[2].default_value = hi; r.inputs[3].default_value = a; r.inputs[4].default_value = b
        return r.outputs[0]
    def hsv_value(nt, col_sock, val_sock):
        h = nt.nodes.new('ShaderNodeHueSaturation'); nt.links.new(col_sock, h.inputs['Color']); nt.links.new(val_sock, h.inputs['Value']); return h.outputs[0]

    # painted steel / painted concrete: the paint from bcol, uneven by a few
    # per cent over tens of metres, darker where grime sits (AO)
    for key, rough, metal in (('lm_paint', 0.5, 0.0), ('lm_steel', 0.38, 0.35), ('lm_matte', 0.8, 0.0)):
        m, nt = _nodes(bpy, key)
        if nt is not None:
            pr = nt.nodes['Principled BSDF']; pr.inputs['Roughness'].default_value = rough; pr.inputs['Metallic'].default_value = metal
            a = attr(nt); geo = nt.nodes.new('ShaderNodeNewGeometry')
            n1 = noise(nt, 0.03, 3.0, geo.outputs['Position'])
            v = mrange(nt, n1.outputs['Fac'], 0.92, 1.07, 0.3, 0.7)
            ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.samples = 4; ao.inputs['Distance'].default_value = 1.2
            nt.links.new(a.outputs['Color'], ao.inputs['Color'])
            mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
            f = nt.nodes.new('ShaderNodeMath'); f.operation = 'MULTIPLY'; f.inputs[1].default_value = 0.45
            inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
            nt.links.new(ao.outputs['AO'], inv.inputs[1]); nt.links.new(inv.outputs[0], f.inputs[0]); nt.links.new(f.outputs[0], mx.inputs[0])
            nt.links.new(hsv_value(nt, a.outputs['Color'], v), mx.inputs[6]); mx.inputs[7].default_value = (0.35, 0.32, 0.28, 1)
            nt.links.new(mx.outputs[2], pr.inputs['Base Color'])
        mats[key] = m

    # verdigris copper: patina green, streaked darker where the rain runs
    m, nt = _nodes(bpy, 'lm_copper')
    if nt is not None:
        pr = nt.nodes['Principled BSDF']; pr.inputs['Roughness'].default_value = 0.55
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (2.5, 2.5, 0.25); nt.links.new(geo.outputs['Position'], mp.inputs[0])
        n1 = noise(nt, 1.0, 4.0, mp.outputs[0])
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; nt.links.new(mrange(nt, n1.outputs['Fac'], 0, 1, 0.35, 0.7), mx.inputs[0])
        mx.inputs[6].default_value = (0.16, 0.36, 0.28, 1); mx.inputs[7].default_value = (0.07, 0.15, 0.12, 1)
        nt.links.new(mx.outputs[2], pr.inputs['Base Color'])
    mats['lm_copper'] = m

    m, nt = _nodes(bpy, 'lm_gold')
    if nt is not None:
        pr = nt.nodes['Principled BSDF']; pr.inputs['Base Color'].default_value = (0.92, 0.66, 0.26, 1)
        pr.inputs['Metallic'].default_value = 1.0; pr.inputs['Roughness'].default_value = 0.28
    mats['lm_gold'] = m

    # a steel wire rope: the paint, a little sheen, twisted strands as bump
    m, nt = _nodes(bpy, 'lm_cable')
    if nt is not None:
        pr = nt.nodes['Principled BSDF']; pr.inputs['Roughness'].default_value = 0.42
        a = attr(nt); nt.links.new(a.outputs['Color'], pr.inputs['Base Color'])
    mats['lm_cable'] = m

    # glass for lanterns / conservatory: pale, clear-ish, not a mirror
    m, nt = _nodes(bpy, 'lm_glasshouse')
    if nt is not None:
        pr = nt.nodes['Principled BSDF']; pr.inputs['Base Color'].default_value = (0.75, 0.82, 0.82, 1)
        pr.inputs['Roughness'].default_value = 0.08; pr.inputs['Transmission Weight'].default_value = 0.55
        pr.inputs['Specular IOR Level'].default_value = 0.7
    mats['lm_glasshouse'] = m
    return mats
