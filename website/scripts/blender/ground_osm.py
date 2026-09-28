"""GROUND PLATES FROM OSM (assets_ground, 28/09; env GROUND_OSM=0 = off; today only).

Surfaces the NAIP class map cannot tell apart, drawn from their OSM outlines so
each reads unmistakably from the air (the AI pass turned a playground's courts
into a muddy dirt lot and a lawn into sand, 27/09):
  - sports pitches: tennis / pickleball (acrylic court + surround, white lines,
    repeated when one outline holds several courts), basketball (acrylic or
    asphalt, boundary / centre / keys), soccer and multi-use fields (grass or
    artificial turf, boundary, halfway line, centre circle, boxes), baseball /
    softball (grass, the clay infield skin, baselines), boules / volleyball
    (sand-coloured grit), four-square (painted boxes on the schoolyard);
  - running tracks (red-brown polyurethane);
  - playgrounds (a poured-rubber mat: terracotta / blue / green, or sand or
    wood chips when OSM says so);
  - brownfield / construction ground: bare ochre-brown dirt (not sand, not
    grass);
  - parking lots on pier decks (Piers 30-32, 48, 3, 45: OSM amenity=parking inside a
    piers.json deck): white stall lines on the deck (a bare deck read as a roof and
    the AI built a shed on Pier 30-32, 28/09); the lots on land are assets_urban's;
  - small landuse=grass outlines (medians, strips, < 6000 m2): lush lawn
    (BAR 27/09 23:05).
Geometry: triangulated, split to <= 3 m, draped on the terrain (ground0) +4..6 cm
(at +2 cm the terrain's own facets poked through a lawn as dark holes, a3_sbpark);
lines +9 cm, 0.10 m wide (about 1 px at z9). Triangles over the street mesh are
dropped (OSM outlines overlap the kerb). One material, per-face colour 'bcol'.
Data: OSM (ODbL) ground/osm/landcover.json (Overpass, 24/09)."""
import os, json, math, hashlib
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

SRC = '/Users/daniel/code/qipu-render-work/ground/osm/landcover.json'
PIERS = '/Users/daniel/code/qipu-render-work/landmarks/piers.json'
LX, LY = 88007.3, 111320.0
DECK_CARS = []     # (x, y, z, heading) parked cars on the deck lots, for hq_city's car instancer

def _srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)
# (under the V6 sky fill a neutral albedo renders blue: neutrals get the
# ground's de-blue bias, as ground_hq's WARM x NEU)
def _warm(c, k=1.0): return (c[0] * 1.22 * k, c[1] * 1.0 * k, c[2] * 0.74 * k)
WHITE = _warm((0.62, 0.62, 0.60))
LAWN = (0.090, 0.150, 0.021)
TURF = (0.030, 0.090, 0.042)
CLAY = (0.26, 0.105, 0.045)
DIRT = _warm((0.215, 0.150, 0.088))
ASPH = _warm((0.105, 0.102, 0.098))
TRACK = (0.30, 0.075, 0.045)
GRIT = _warm((0.34, 0.27, 0.17))
SAND = (0.40, 0.30, 0.13)
CHIPS = (0.20, 0.115, 0.055)
COURTS = [(_srgb('2f6b4f'), _srgb('7a3b2e')), (_srgb('3a6484'), _srgb('3f7a4a')), (_srgb('3c7a52'), _srgb('2f5f44')), (_srgb('45708f'), _srgb('4a7760'))]
RUBBER = [_srgb('9c4a33'), _srgb('3d6f9a'), _srgb('4f8a4a'), _srgb('b0703a')]

def _h(i, n): return int(hashlib.sha1(str(i).encode()).hexdigest()[:8], 16) % n

def _xy(g): return [((p['lon'] + 122.438) * LX, (p['lat'] - 37.76) * LY) for p in g]

def _area(P):
    return 0.5 * sum(P[i][0] * P[i - 1][1] - P[i - 1][0] * P[i][1] for i in range(len(P)))

def _frame(P):
    """min-area bounding rectangle: centre, unit axes (u = long side), half sizes"""
    best = None; n = len(P)
    for i in range(n):
        ax, ay = P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]; L = math.hypot(ax, ay)
        if L < 1e-3: continue
        ux, uy = ax / L, ay / L
        us = [p[0] * ux + p[1] * uy for p in P]; vs = [-p[0] * uy + p[1] * ux for p in P]
        A = (max(us) - min(us)) * (max(vs) - min(vs))
        if best is None or A < best[0]: best = (A, ux, uy, min(us), max(us), min(vs), max(vs))
    _, ux, uy, u0, u1, v0, v1 = best
    if u1 - u0 < v1 - v0: ux, uy, u0, u1, v0, v1 = -uy, ux, v0, v1, -u1, -u0
    cu, cv = (u0 + u1) / 2, (v0 + v1) / 2
    c = (cu * ux - cv * uy, cu * uy + cv * ux)
    return c, (ux, uy), (-uy, ux), (u1 - u0) / 2, (v1 - v0) / 2

class _Acc:
    def __init__(self): self.V = []; self.F = []; self.C = []
    def tri(self, a, b, c, col):
        k = len(self.V); self.V += [a, b, c]; self.F.append((k, k + 1, k + 2)); self.C.append(col)

def _split(a, b, c, m=3.0):
    """a triangle cut into pieces with no side over m metres"""
    L = [math.dist(a, b), math.dist(b, c), math.dist(c, a)]
    if max(L) <= m: return [(a, b, c)]
    i = L.index(max(L)); t = [a, b, c]; p, q, r = t[i], t[(i + 1) % 3], t[(i + 2) % 3]
    mid = ((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
    return _split(p, mid, r, m) + _split(mid, q, r, m)

def build(sc, M, ground0, streets_obj=None, box=None, log=print):
    if os.environ.get('GROUND_OSM', '1') != '1' or not os.path.exists(SRC): return None
    import bpy, bmesh
    from mathutils.bvhtree import BVHTree
    E = json.load(open(SRC))['elements']
    bvh = None
    if streets_obj is not None:
        bm = bmesh.new(); bm.from_mesh(streets_obj.data); bm.transform(streets_obj.matrix_world); bvh = BVHTree.FromBMesh(bm); bm.free()
    def on_street(x, y):
        if bvh is None: return False
        h = bvh.ray_cast(Vector((x, y, 2000.0)), Vector((0, 0, -1)))
        return h[0] is not None
    A = _Acc(); nk = {}
    def plate(P, col, dz=0.06, keep_street=False):
        if len(P) < 3: return
        try: T = tessellate_polygon([[Vector((x, y, 0)) for x, y in P]])
        except Exception: return
        for t in T:
            for a, b, c in _split(P[t[0]], P[t[1]], P[t[2]]):
                cx, cy = (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3
                if not keep_street and on_street(cx, cy): continue
                A.tri(*[(p[0], p[1], ground0(p[0], p[1]) + dz) for p in (a, b, c)], col)
    def rect(c, u, v, u0, u1, v0, v1, col, dz=0.075):
        P = [(c[0] + u[0] * a + v[0] * b, c[1] + u[1] * a + v[1] * b) for a, b in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
        plate(P, col, dz, keep_street=True)
    def line(c, u, v, a0, b0, a1, b1, col=WHITE, w=0.10):
        """a painted line in the local frame (a along u, b along v)"""
        p0 = (c[0] + u[0] * a0 + v[0] * b0, c[1] + u[1] * a0 + v[1] * b0); p1 = (c[0] + u[0] * a1 + v[0] * b1, c[1] + u[1] * a1 + v[1] * b1)
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]; L = math.hypot(dx, dy)
        if L < 0.05: return
        nx, ny = -dy / L * w / 2, dx / L * w / 2
        plate([(p0[0] + nx, p0[1] + ny), (p1[0] + nx, p1[1] + ny), (p1[0] - nx, p1[1] - ny), (p0[0] - nx, p0[1] - ny)], col, 0.09, keep_street=True)
    def circle(c, u, v, a, b, r, col=WHITE, n=28, w=0.10, t0=0.0, t1=2 * math.pi):
        pts = [(a + r * math.cos(t0 + (t1 - t0) * i / n), b + r * math.sin(t0 + (t1 - t0) * i / n)) for i in range(n + 1)]
        for (a0, b0), (a1, b1) in zip(pts, pts[1:]): line(c, u, v, a0, b0, a1, b1, col, w)
    def box_(c, u, v, a0, a1, b0, b1, col=WHITE):
        line(c, u, v, a0, b0, a1, b0, col); line(c, u, v, a1, b0, a1, b1, col); line(c, u, v, a1, b1, a0, b1, col); line(c, u, v, a0, b1, a0, b0, col)
    if box is not None: bx0, by0, bx1, by1 = box
    DECKS = []
    try: DECKS = [p['ring'] for p in json.load(open(PIERS))['piers'] if p.get('kind') == 'deck']
    except Exception: pass
    def inpoly(x, y, R):
        k = False
        for i in range(len(R)):
            (x1, y1), (x2, y2) = R[i - 1], R[i]
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): k = not k
        return k
    def deck_top(R):
        """the deck's height as water_hq.piers.deck_z makes it (median of the ground inside, capped, >= PIER_Z + 0.1)"""
        xs = [x for x, _ in R]; ys = [y for _, y in R]; st = max(4.0, (max(xs) - min(xs) + max(ys) - min(ys)) / 30)
        S_ = [ground0(x, y) for x in [min(xs) + st * (i + 0.5) for i in range(int((max(xs) - min(xs)) / st))]
              for y in [min(ys) + st * (j + 0.5) for j in range(int((max(ys) - min(ys)) / st))] if inpoly(x, y, R)] or [ground0(*p) for p in R]
        S_.sort(); med = S_[len(S_) // 2]
        return min(max(min(S_[-1], med + 1.0) + 0.10, 2.4), 6.5)
    def deck_lot(P, R):
        """stalls 2.7 x 5.5 m in back-to-back pairs along the long side, 7 m aisles, white lines on the deck"""
        c, u, v, hu, hv = _frame(P)
        zd = deck_top(R) + 0.15      # (on water_hq's deck slab: its own height rule, a margin for the sampling)
        def lin(a0, b0, a1, b1):
            p0 = (c[0] + u[0] * a0 + v[0] * b0, c[1] + u[1] * a0 + v[1] * b0); p1 = (c[0] + u[0] * a1 + v[0] * b1, c[1] + u[1] * a1 + v[1] * b1)
            if not (inpoly(*p0, P) and inpoly(*p1, P)): return
            dx, dy = p1[0] - p0[0], p1[1] - p0[1]; L = math.hypot(dx, dy); nx, ny = -dy / L * 0.05, dx / L * 0.05
            Q = [(p0[0] + nx, p0[1] + ny), (p1[0] + nx, p1[1] + ny), (p1[0] - nx, p1[1] - ny), (p0[0] - nx, p0[1] - ny)]
            A.tri((*Q[0], zd), (*Q[1], zd), (*Q[2], zd), WHITE); A.tri((*Q[0], zd), (*Q[2], zd), (*Q[3], zd), WHITE)
        b = -hv + 1.0; n = 0
        while b + 11.0 <= hv - 1.0:
            for a in [(-hu + 1.0) + 2.7 * k for k in range(int((2 * hu - 2.0) / 2.7) + 1)]:
                lin(a, b, a, b + 11.0); n += 1
                for bb in (b + 2.75, b + 8.25):
                    cx_, cy_ = c[0] + u[0] * (a + 1.35) + v[0] * bb, c[1] + u[1] * (a + 1.35) + v[1] * bb
                    if a + 2.7 <= hu - 1.0 and inpoly(cx_, cy_, P) and _h((round(cx_, 1), round(cy_, 1)), 100) < 72:
                        DECK_CARS.append((cx_, cy_, zd - 0.15, math.atan2(v[1], v[0]) + (math.pi if _h((round(cy_, 1), 7), 2) else 0.0)))
            lin(-hu + 1.0, b + 5.5, hu - 1.0, b + 5.5)
            b += 11.0 + 7.0
        return n
    for e in E:
        g = e.get('geometry'); t = e.get('tags', {})
        if e.get('type') != 'way' or not g or len(g) < 4: continue
        P = _xy(g)
        if box is not None and not any(bx0 - 50 < x < bx1 + 50 and by0 - 50 < y < by1 + 50 for x, y in P): continue
        if P[0] == P[-1]: P = P[:-1]
        if len(P) < 3: continue
        ar = abs(_area(P))
        if ar < 4: continue
        le, lu, sp, sf = t.get('leisure', ''), t.get('landuse', ''), t.get('sport', ''), t.get('surface', '')
        k = None
        if le == 'pitch':
            c, u, v, hu, hv = _frame(P)
            if sp in ('tennis', 'pickleball', 'padel'):
                inner, outer = COURTS[_h(e['id'], len(COURTS))]
                if sf in ('asphalt',): outer = ASPH
                plate(P, outer)
                CL, CW = (23.77, 10.97) if sp == 'tennis' else (13.41, 6.10)
                n = max(1, int(round((2 * hv) / (CW + 7.0)))) if 2 * hu >= CL * 0.9 else 0
                for j in range(n):
                    b_ = -hv + (j + 0.5) * 2 * hv / n
                    rect(c, u, v, -CL / 2, CL / 2, b_ - CW / 2, b_ + CW / 2, inner)
                    box_(c, u, v, -CL / 2, CL / 2, b_ - CW / 2, b_ + CW / 2)
                    if sp == 'tennis':
                        for s in (-4.115, 4.115): line(c, u, v, -CL / 2, b_ + s, CL / 2, b_ + s)
                        for s in (-6.40, 6.40): line(c, u, v, s, b_ - 4.115, s, b_ + 4.115)
                        line(c, u, v, -6.40, b_, 6.40, b_)
                    else:
                        for s in (-2.13, 2.13): line(c, u, v, s, b_ - CW / 2, s, b_ + CW / 2)
                        line(c, u, v, -CL / 2, b_, -2.13, b_); line(c, u, v, 2.13, b_, CL / 2, b_)
                    line(c, u, v, 0, b_ - CW / 2 - 0.9, 0, b_ + CW / 2 + 0.9, _warm((0.05, 0.05, 0.05)), 0.12)   # the net
                k = sp
            elif sp == 'basketball':
                base = ASPH if sf in ('asphalt', '') and _h(e['id'], 3) else COURTS[_h(e['id'] + 1, len(COURTS))][0]
                plate(P, base)
                if 2 * hu > 18 and 2 * hv > 10:
                    L_, W_ = min(28.0, 2 * hu - 1.5), min(15.0, 2 * hv - 1.5)
                    box_(c, u, v, -L_ / 2, L_ / 2, -W_ / 2, W_ / 2); line(c, u, v, 0, -W_ / 2, 0, W_ / 2); circle(c, u, v, 0, 0, 1.8)
                    for s in (-1, 1):
                        a0 = s * L_ / 2; a1 = s * (L_ / 2 - 5.8)
                        rect(c, u, v, min(a0, a1), max(a0, a1), -2.45, 2.45, COURTS[_h(e['id'] + 2, len(COURTS))][1], 0.075)
                        box_(c, u, v, min(a0, a1), max(a0, a1), -2.45, 2.45)
                        circle(c, u, v, s * (L_ / 2 - 1.575), 0, 6.75, n=24, t0=math.pi / 2 if s > 0 else -math.pi / 2, t1=3 * math.pi / 2 if s > 0 else math.pi / 2)
                elif 2 * hu > 8:
                    box_(c, u, v, -hu + 0.5, hu - 0.5, -hv + 0.5, hv - 0.5); circle(c, u, v, hu - 2.0, 0, 1.8)
                k = 'basketball'
            elif sp == 'four_square':
                plate(P, ASPH, 0.06); box_(c, u, v, -hu, hu, -hv, hv); line(c, u, v, 0, -hv, 0, hv); line(c, u, v, -hu, 0, hu, 0)
                k = 'four_square'
            elif sp in ('baseball', 'softball'):
                plate(P, TURF if sf == 'artificial_turf' else LAWN)
                # home plate: the outline's sharpest corner (a field is a fan)
                best = None
                for i in range(len(P)):
                    a_, b_, c_ = P[i - 1], P[i], P[(i + 1) % len(P)]
                    v1 = (a_[0] - b_[0], a_[1] - b_[1]); v2 = (c_[0] - b_[0], c_[1] - b_[1])
                    n1, n2 = math.hypot(*v1), math.hypot(*v2)
                    if n1 < 3 or n2 < 3: continue
                    ang = math.acos(max(-1, min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / n1 / n2)))
                    if best is None or ang < best[0]: best = (ang, b_, v1, v2, n1, n2)
                if best and best[0] < math.radians(115):
                    _, H, v1, v2, n1, n2 = best
                    d = (v1[0] / n1 + v2[0] / n2, v1[1] / n1 + v2[1] / n2); dn = math.hypot(*d); du = (d[0] / dn, d[1] / dn); dv = (-du[1], du[0])
                    R = 29.0 if sp == 'baseball' else 18.0; B = 27.43 if sp == 'baseball' else 18.29
                    if min(n1, n2) > R * 1.3:
                        arc = [(0.0, 0.0)] + [(R * math.cos(a), R * math.sin(a)) for a in [(-math.pi / 4 - 0.05) + (math.pi / 2 + 0.1) * i / 16 for i in range(17)]]
                        plate([(H[0] + du[0] * a + dv[0] * b, H[1] + du[1] * a + dv[1] * b) for a, b in arc], CLAY, 0.07, keep_street=True)
                        s2 = B / math.sqrt(2)
                        plate([(H[0] + du[0] * a + dv[0] * b, H[1] + du[1] * a + dv[1] * b) for a, b in ((s2 * 0.25, 0), (s2, -s2 * 0.75), (s2 * 1.75, 0), (s2, s2 * 0.75))], TURF if sf == 'artificial_turf' else LAWN, 0.08, keep_street=True)
                        circle(H, du, dv, s2 * 1.0 * 0.95, 0, 2.7, CLAY, 12, 0.9)
                        for s in (-1, 1): line(H, du, dv, 0, 0, min(n1, n2) * 0.95 * math.cos(math.pi / 4), s * min(n1, n2) * 0.95 * math.sin(math.pi / 4))
                k = sp
            elif sp in ('boules', 'volleyball', 'beachvolleyball', 'horseshoes', 'bocce'):
                plate(P, SAND if 'volley' in sp else GRIT); box_(c, u, v, -hu + 0.3, hu - 0.3, -hv + 0.3, hv - 0.3); k = 'grit'
            elif sp in ('running', 'athletics') and sf in ('tartan', ''):
                plate(P, TRACK); k = 'track'
            else:
                # soccer, multi, football, other fields: grass or turf, the lines when it is field-sized
                g_ = ASPH if sf in ('asphalt', 'concrete', 'paved') else (TURF if sf == 'artificial_turf' or _h(e['id'], 2) else LAWN)
                if sf == 'tartan': g_ = COURTS[_h(e['id'], len(COURTS))][0]
                plate(P, g_)
                if g_ in (LAWN, TURF) and 2 * hu > 40 and 2 * hv > 25:
                    L_, W_ = 2 * hu - 3, 2 * hv - 3
                    box_(c, u, v, -L_ / 2, L_ / 2, -W_ / 2, W_ / 2); line(c, u, v, 0, -W_ / 2, 0, W_ / 2); circle(c, u, v, 0, 0, min(9.15, W_ / 5))
                    bw_ = min(40.3, W_ * 0.6); bd = min(16.5, L_ * 0.16)
                    for s in (-1, 1): box_(c, u, v, min(s * L_ / 2, s * (L_ / 2 - bd)), max(s * L_ / 2, s * (L_ / 2 - bd)), -bw_ / 2, bw_ / 2)
                k = sp or 'pitch'
        elif le == 'track' and ar > 200:
            plate(P, TRACK); k = 'track'
        elif le == 'playground' and ar < 20000:
            col = SAND if sf == 'sand' else (CHIPS if sf in ('woodchips', 'bark', 'wood') else (LAWN if sf == 'grass' else RUBBER[_h(e['id'], len(RUBBER))]))
            plate(P, col, 0.05); k = 'playground'
        elif lu in ('brownfield', 'construction') and ar < 40000:
            plate(P, DIRT, 0.04); k = 'dirt'
        elif t.get('amenity') == 'parking' and DECKS and any(inpoly(sum(x for x, _ in P) / len(P), sum(y for _, y in P) / len(P), R) for R in DECKS):
            R = next(R for R in DECKS if inpoly(sum(x for x, _ in P) / len(P), sum(y for _, y in P) / len(P), R))
            if deck_lot(P, R): k = 'deck_lot'
        elif lu == 'grass' and ar < 6000:
            plate(P, LAWN, 0.045); k = 'lawn'
        if k: nk[k] = nk.get(k, 0) + 1
    if not A.F: log('ground_osm: nothing in the box'); return None
    me = bpy.data.meshes.new('ground_osm'); me.from_pydata(A.V, [], A.F); me.update()
    for f in me.polygons:
        if f.normal.z < 0: f.flip()
    ca = me.color_attributes.new('bcol', 'FLOAT_COLOR', 'FACE')
    for i, col in enumerate(A.C): ca.data[i].color = (*col, 1.0)
    ob = bpy.data.objects.new('ground_osm', me); sc.collection.objects.link(ob); me.materials.append(_mat())
    log(f'ground_osm: {len(A.F)} tris, ' + ', '.join(f'{k} {n}' for k, n in sorted(nk.items())))
    return ob

def _mat():
    import bpy
    m = bpy.data.materials.get('ground_osm')
    if m: return m
    m = bpy.data.materials.new('ground_osm'); m.use_nodes = True; nt = m.node_tree; pr = nt.nodes['Principled BSDF']
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'bcol'; at.attribute_type = 'GEOMETRY'
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.25; nz.inputs['Detail'].default_value = 3.0
    nt.links.new(geo.outputs['Position'], nz.inputs['Vector'])
    fz = nt.nodes.new('ShaderNodeTexNoise'); fz.inputs['Scale'].default_value = 3.0; fz.inputs['Detail'].default_value = 2.0
    nt.links.new(geo.outputs['Position'], fz.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs[3].default_value = 0.88; mr.inputs[4].default_value = 1.10
    nt.links.new(nz.outputs['Fac'], mr.inputs[0])
    mf = nt.nodes.new('ShaderNodeMapRange'); mf.inputs[3].default_value = 0.94; mf.inputs[4].default_value = 1.05
    nt.links.new(fz.outputs['Fac'], mf.inputs[0])
    m1 = nt.nodes.new('ShaderNodeVectorMath'); m1.operation = 'SCALE'
    nt.links.new(at.outputs['Color'], m1.inputs[0]); nt.links.new(mr.outputs[0], m1.inputs['Scale'])
    m2 = nt.nodes.new('ShaderNodeVectorMath'); m2.operation = 'SCALE'
    nt.links.new(m1.outputs[0], m2.inputs[0]); nt.links.new(mf.outputs[0], m2.inputs['Scale'])
    nt.links.new(m2.outputs[0], pr.inputs['Base Color'])
    pr.inputs['Roughness'].default_value = 0.88
    return m
