"""Buildings modelled from their records.

Each published footprint becomes a building in real geometry: walls with
recessed, framed, double-hung windows; a canted bay on the street wall of a
house; cornices on brackets, belt courses, corner boards; a front gable with
fish-scale shingles or a flat roof behind a parapet; a stoop up to a raised
first floor; a storefront where the record says there is a shop.

What decides the building is the record — footprint, height, storeys, year,
use, facade type, which wall faces the street (front), a neighbour (party) or
the yard (back). What is NOT in the record is generic and conventional (the
paint colours, the exact window rhythm) and is drawn from conventions per era,
never presented as data. Every draw is seeded by the building's gid, so a
building looks the same in every render.

Output: per-material lists of (verts, faces, face colour) — built into a few
big meshes by `emit()` so a district of thousands of buildings stays fast.
"""
import math, random
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

# ── materials the generator writes into ─────────────────────────────────────
# siding: lap boards (bump by world z) · trim: smooth painted wood · shingle:
# fish-scale gable · stucco · brick · concrete · glass · door · roof_shingle ·
# roof_flat (tar and gravel) · metal (flashing, rails) · stair (painted wood
# or concrete) · storefront glass · awning
MATS = ('siding', 'trim', 'shingle', 'stucco', 'brick', 'concrete', 'glass', 'door',
        'roof_shingle', 'roof_flat', 'metal', 'stair', 'shopglass', 'awning', 'curtain', 'chimney', 'roof_tile', 'deck')

# paint conventions. Victorian palettes after the Painted Ladies' own era
# (body, trim, accent); later eras: stucco pastels and whites.
VIC = [((0.46, 0.55, 0.42), (0.93, 0.90, 0.80), (0.45, 0.12, 0.14)),
       ((0.50, 0.62, 0.74), (0.96, 0.95, 0.92), (0.12, 0.20, 0.38)),
       ((0.86, 0.66, 0.66), (0.97, 0.95, 0.90), (0.14, 0.40, 0.42)),
       ((0.90, 0.80, 0.45), (0.97, 0.96, 0.90), (0.20, 0.36, 0.24)),
       ((0.66, 0.58, 0.74), (0.96, 0.94, 0.94), (0.36, 0.18, 0.40)),
       ((0.88, 0.72, 0.56), (0.95, 0.90, 0.78), (0.42, 0.26, 0.16)),
       ((0.56, 0.62, 0.66), (0.97, 0.96, 0.95), (0.62, 0.14, 0.12)),
       ((0.95, 0.93, 0.86), (0.36, 0.44, 0.40), (0.72, 0.52, 0.22)),
       ((0.34, 0.40, 0.46), (0.90, 0.86, 0.74), (0.74, 0.40, 0.20)),
       ((0.80, 0.84, 0.70), (0.98, 0.97, 0.93), (0.30, 0.30, 0.34))]
STUCCO = [(0.95, 0.93, 0.88), (0.94, 0.86, 0.66), (0.90, 0.80, 0.66), (0.80, 0.86, 0.78), (0.94, 0.80, 0.76),
          (0.76, 0.84, 0.92), (0.96, 0.95, 0.93), (0.86, 0.74, 0.62), (0.93, 0.89, 0.72), (0.98, 0.97, 0.95)]
BLOCK = [(0.78, 0.72, 0.64), (0.62, 0.36, 0.28), (0.86, 0.84, 0.80), (0.70, 0.68, 0.64), (0.82, 0.76, 0.66)]


LOD = 0          # 0: every opening modelled · 1: flat framed panes (city-wide)


class Out:
    """per-material accumulators"""
    def __init__(self):
        self.m = {k: ([], [], []) for k in MATS}   # verts, faces, face colours

    def poly(self, mat, pts, col=(1, 1, 1)):
        V, F, C = self.m[mat]
        k = len(V); V.extend(tuple(p) for p in pts); F.append(tuple(range(k, k + len(pts)))); C.append(col)

    def box3(self, mat, o, a, b, c, col):
        """a box from corner o along edge vectors a, b, c"""
        p = [o, o + a, o + a + b, o + b, o + c, o + a + c, o + a + b + c, o + b + c]
        for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.poly(mat, [p[i] for i in f], col)


class Wall:
    """one edge of a footprint, in its own frame: u along the edge, z up,
    w outward (positive = out of the building)"""
    def __init__(self, a, b, out):
        self.a = Vector((a[0], a[1], 0)); self.b = Vector((b[0], b[1], 0))
        d = self.b - self.a; self.L = d.length; self.t = d / self.L if self.L else Vector((1, 0, 0))
        self.n = Vector((self.t.y, -self.t.x, 0))             # outward for a CCW ring
        self.o = out

    def P(self, u, z, w=0.0):
        p = self.a + self.t * u + self.n * w; p.z = z; return p

    def rect(self, mat, u0, u1, z0, z1, w=0.0, col=(1, 1, 1)):
        self.o.poly(mat, [self.P(u0, z0, w), self.P(u1, z0, w), self.P(u1, z1, w), self.P(u0, z1, w)], col)

    def box(self, mat, u0, u1, z0, z1, w0, w1, col):
        o = self.P(u0, z0, w0)
        self.o.box3(mat, o, self.t * (u1 - u0), self.n * (w1 - w0), Vector((0, 0, z1 - z0)), col)

    def wall_with_holes(self, mat, u0, u1, z0, z1, holes, col):
        """the wall rectangle minus the openings, as grid cells"""
        if LOD >= 1:                     # panes sit on the face: the wall stays whole
            self.rect(mat, u0, u1, z0, z1, 0.0, col); return
        us = sorted({u0, u1, *[h[0] for h in holes], *[h[1] for h in holes]})
        zs = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes]})
        us = [u for u in us if u0 <= u <= u1]; zs = [z for z in zs if z0 <= z <= z1]
        for i in range(len(us) - 1):
            for j in range(len(zs) - 1):
                cu, cz = (us[i] + us[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
                if any(h[0] <= cu <= h[1] and h[2] <= cz <= h[3] for h in holes): continue
                self.rect(mat, us[i], us[i + 1], zs[j], zs[j + 1], 0.0, col)

    def opening(self, u0, u1, z0, z1, kind, trim, depth=0.2, rng=None, body=None, hood=None):
        """a recessed window or door: reveals, glass, casing, sill, sashes"""
        o = self.o
        if LOD >= 1:
            # the far city: a pane on the wall face with its frame and sill —
            # the proportions stay the record's, the modelling stops there
            if kind == 'door': self.rect('door', u0, u1, z0, z1, 0.02, body); return
            self.rect('shopglass' if kind == 'shop' else 'glass', u0, u1, z0, z1, 0.03, (1, 1, 1))
            if LOD >= 2: return
            self.box('trim', u0 - 0.1, u1 + 0.1, z0 - 0.08, z0, 0.0, 0.08, trim)
            self.box('trim', u0 - 0.1, u1 + 0.1, z1, z1 + 0.12, 0.0, 0.05, trim)
            return
        # reveals
        self.o.poly('trim', [self.P(u0, z0, 0), self.P(u0, z1, 0), self.P(u0, z1, -depth), self.P(u0, z0, -depth)], trim)
        self.o.poly('trim', [self.P(u1, z0, 0), self.P(u1, z0, -depth), self.P(u1, z1, -depth), self.P(u1, z1, 0)], trim)
        self.o.poly('trim', [self.P(u0, z1, 0), self.P(u1, z1, 0), self.P(u1, z1, -depth), self.P(u0, z1, -depth)], trim)
        self.o.poly('trim', [self.P(u0, z0, 0), self.P(u0, z0, -depth), self.P(u1, z0, -depth), self.P(u1, z0, 0)], trim)
        if kind == 'door':
            self.rect('door', u0, u1, z0, z1, -depth, body)
            self.box('trim', u0 - 0.12, u1 + 0.12, z1, z1 + 0.25, 0.0, 0.1, trim)          # head
            self.box('glass', u0 + 0.12, u1 - 0.12, z1 - 0.7, z1 - 0.12, -depth + 0.02, -depth + 0.04, (1, 1, 1))
            return
        mat = 'shopglass' if kind == 'shop' else 'glass'
        # a blind or a curtain behind about one pane in four
        if rng and rng.random() < 0.25 and kind != 'shop':
            self.rect('curtain', u0, u1, z0 + (z1 - z0) * rng.uniform(0.35, 0.8), z1, -depth - 0.02, (1, 1, 1))
        self.rect(mat, u0, u1, z0, z1, -depth, (1, 1, 1))
        if kind == 'shop':
            for uu in frange(u0, u1, 1.6)[1:-1]: self.box('metal', uu - 0.03, uu + 0.03, z0, z1, -depth, -depth + 0.06, (0.1, 0.1, 0.1))
            return
        c = 0.11                                                             # casing
        self.box('trim', u0 - c, u0, z0 - 0.02, z1 + c, 0.0, 0.04, trim)
        self.box('trim', u1, u1 + c, z0 - 0.02, z1 + c, 0.0, 0.04, trim)
        if hood == 'pediment':
            hz = z1 + c + 0.06
            self.box('trim', u0 - c - 0.1, u1 + c + 0.1, z1, hz, 0.0, 0.14, trim)
            # a shallow triangular pediment, its face and its top slopes
            um = (u0 + u1) / 2; pk = hz + 0.32; a_, b_ = u0 - c - 0.12, u1 + c + 0.12
            self.o.poly('trim', [self.P(a_, hz, 0.15), self.P(b_, hz, 0.15), self.P(um, pk, 0.15)], trim)
            self.o.poly('trim', [self.P(a_, hz, 0.15), self.P(um, pk, 0.15), self.P(um, pk, 0.0), self.P(a_, hz, 0.0)], trim)
            self.o.poly('trim', [self.P(um, pk, 0.15), self.P(b_, hz, 0.15), self.P(b_, hz, 0.0), self.P(um, pk, 0.0)], trim)
        elif hood == 'cap':
            self.box('trim', u0 - c - 0.12, u1 + c + 0.12, z1, z1 + c + 0.16, 0.0, 0.16, trim)
            self.box('trim', u0 - c - 0.16, u1 + c + 0.16, z1 + c + 0.16, z1 + c + 0.24, 0.0, 0.22, trim)
        else:
            self.box('trim', u0 - c - 0.04, u1 + c + 0.04, z1, z1 + c + 0.06, 0.0, 0.07, trim)   # head
        self.box('trim', u0 - c - 0.02, u1 + c + 0.02, z0 - 0.07, z0, 0.0, 0.08, trim)        # sill
        # double-hung: a meeting rail and the sash frames
        zm = (z0 + z1) / 2; w0 = -depth + 0.02; w1 = -depth + 0.06
        self.box('trim', u0, u1, zm - 0.03, zm + 0.03, w0, w1, trim)
        for uu in (u0, u1 - 0.05): self.box('trim', uu, uu + 0.05, z0, z1, w0, w1, trim)
        if kind == 'tall' and u1 - u0 > 0.9:
            self.box('trim', (u0 + u1) / 2 - 0.02, (u0 + u1) / 2 + 0.02, z0, z1, w0, w1, trim)


def frange(a, b, step):
    n = max(1, int(round((b - a) / step))); return [a + (b - a) * i / n for i in range(n + 1)]


def ring_ccw(r):
    a = sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))
    return (r, False) if a > 0 else (r[::-1], True)


def offset_ring(r, d):
    """miter offset of a CCW ring, outward for d > 0 (clamped at sharp corners)"""
    n = len(r); out = []
    for i in range(n):
        p0, p1, p2 = Vector(r[i - 1]), Vector(r[i]), Vector(r[(i + 1) % n])
        e0 = (p1 - p0).normalized(); e1 = (p2 - p1).normalized()
        n0 = Vector((e0.y, -e0.x)); n1 = Vector((e1.y, -e1.x))
        m = (n0 + n1); ml = m.length
        if ml < 1e-6: m = n0; s = d
        else:
            m /= ml; cosh = max(0.35, m.dot(n1)); s = d / cosh
        q = p1 + m * s; out.append((q.x, q.y))
    return out


def split_tri(tri, f):
    """split a triangle (3 Vectors) along f(p) = 0; returns triangles"""
    s = [f(p) for p in tri]
    if all(x >= -1e-9 for x in s) or all(x <= 1e-9 for x in s): return [tri]
    for k in range(3):                     # find the vertex alone on its side
        a, b, c = tri[k], tri[(k + 1) % 3], tri[(k + 2) % 3]
        sa, sb, sc = s[k], s[(k + 1) % 3], s[(k + 2) % 3]
        if (sa > 0) != (sb > 0) and (sa > 0) != (sc > 0):
            pab = a + (b - a) * (sa / (sa - sb)); pac = a + (c - a) * (sa / (sa - sc))
            return [[a, pab, pac], [pab, b, c], [pab, c, pac]]
    return [tri]


# ── the building ─────────────────────────────────────────────────────────────

def style_of(b):
    y, ty, h = b['year'] or 1950, b['ty'], b['h']
    if ty in ('OFFICE', 'HOTEL', 'INSTITUTION') or h > 22: return 'block'
    if ty in ('HOUSE', 'FLATS', 'APARTMENT', 'UNCLASSED') and y < 1912 and h < 19: return 'vic'
    if ty in ('HOUSE', 'FLATS', 'APARTMENT', 'RETAIL', 'UNCLASSED') and y < 1945 and h < 20: return 'stucco'
    if ty in ('HOUSE', 'FLATS') and h < 12: return 'midcentury'
    return 'block'


def substyle(b, style, rng):
    """the era's own vocabulary, by the record's year; which variant a
    building takes within its era is a seeded draw"""
    y = b['year'] or 1950
    if style == 'vic':
        if y < 1880: return rng.choice(('italianate', 'italianate', 'stick'))
        if y < 1890: return rng.choice(('stick', 'stick', 'italianate', 'queen'))
        return rng.choice(('queen', 'queen', 'stick', 'italianate'))
    if style == 'stucco':
        return 'edwardian' if y < 1918 else 'med'
    if style == 'midcentury':
        return 'sunset' if y < 1962 else 'modern'
    return 'tower' if b['h'] > 40 else ('commercial' if (b.get('shop') or b['ty'] in ('RETAIL', 'OFFICE')) else 'apartment')


def building(b, ground, out):
    """b: record from city_data.buildings; ground(x, y) -> z"""
    rng = random.Random(b['gid'] * 7919 + 13)
    ring, flipped = ring_ccw([tuple(p) for p in b['ring']])
    roles = b['roles'][::-1] if flipped else list(b['roles'])
    if flipped:  # roles are per edge i -> i+1; reversing the ring shifts them by one
        roles = roles[1:] + roles[:1]
    n = len(ring)
    if n < 3: return
    zs = [ground(x, y) for x, y in ring]
    zg = sum(zs) / n                       # the record's height stands on the mean ground
    zfoot = min(zs) - 0.6                  # walls run into the lowest ground
    style = style_of(b)
    top = zg + max(3.0, b['h'])
    storeys = b['st'] or max(1, round(b['h'] / 3.4))
    walls = [Wall(ring[i], ring[(i + 1) % n], out) for i in range(n)]
    fronts = [i for i in range(n) if roles[i] == 1 and walls[i].L > 2.0]
    if not fronts:                         # no front measured: the longest non-party edge
        cand = [i for i in range(n) if roles[i] != 2] or list(range(n))
        fronts = [max(cand, key=lambda i: walls[i].L)]
    f0 = max(fronts, key=lambda i: walls[i].L)

    sub = substyle(b, style, rng)
    corner = sum(1 for i in range(n) if roles[i] in (1, 3) and walls[i].L > 3.0) >= 2

    # ── roof form and eave ──
    if style == 'vic':
        roof = 'gable' if (sub == 'queen' and rng.random() < 0.9) or (sub != 'queen' and rng.random() < 0.15) else 'flat'
    elif style == 'midcentury':
        roof = 'gable' if (sub == 'sunset' and rng.random() < 0.4) else 'flat'
    elif sub == 'med':
        roof = 'gable' if rng.random() < 0.25 else 'flat'
    else:
        roof = 'flat'
    roof_mat = 'roof_tile' if (sub == 'med' or (sub == 'sunset' and rng.random() < 0.5)) else 'roof_shingle'
    # the roof axis: u along the front, v into the lot
    ax_u = walls[f0].t.copy(); ax_v = -walls[f0].n.copy()
    us = [Vector((x, y, 0)).dot(ax_u) for x, y in ring]
    vs = [Vector((x, y, 0)).dot(ax_v) for x, y in ring]
    umin, umax = min(us), max(us); uc = (umin + umax) / 2; hw = (umax - umin) / 2
    pitch = math.radians({'vic': 44, 'med': 24, 'sunset': 26}.get(style if style == 'vic' else sub, 28))
    rise = min(hw * math.tan(pitch), 0.55 * (top - zg)) if roof == 'gable' else 0.0
    eave = top - rise
    if roof == 'gable':
        def rz(p):  # roof height over a point
            return eave + max(0.0, hw - abs(p.dot(ax_u) - uc)) * math.tan(pitch) * (rise / (hw * math.tan(pitch)))
    else:
        def rz(p): return top

    # ── colours ──
    if style == 'vic':
        body, trim, accent = rng.choice(VIC)
    elif style in ('stucco', 'midcentury'):
        body = rng.choice(STUCCO); trim = (0.97, 0.96, 0.93) if rng.random() < 0.7 else (0.35, 0.36, 0.38)
        accent = rng.choice(((0.45, 0.14, 0.12), (0.18, 0.28, 0.24), (0.20, 0.22, 0.30)))
        if sub == 'edwardian' and rng.random() < 0.3: body, trim, accent = rng.choice(VIC)
    else:
        body = rng.choice(BLOCK); trim = (0.88, 0.86, 0.82); accent = (0.2, 0.2, 0.22)
    wall_mat = {'vic': 'siding', 'stucco': 'stucco', 'midcentury': 'stucco'}.get(style)
    if sub == 'edwardian' and rng.random() < 0.35: wall_mat = 'siding'
    if style == 'block':
        yr = b['year'] or 1960
        wall_mat = 'brick' if (yr < 1935 and rng.random() < 0.55) else ('stucco' if yr < 1960 else 'concrete')

    # ── floors ──
    raised = {'vic': rng.uniform(1.0, 1.6), 'stucco': rng.uniform(0.3, 2.6), 'midcentury': 0.2, 'block': 0.4}[style]
    if style == 'stucco' and raised > 1.5: raised = 2.6        # Edwardian over a garage level
    if sub == 'sunset': raised = 2.6                           # the Sunset house: garage below, living above
    first = zg + raised
    nfl = max(1, storeys if raised < 2 else max(1, storeys - 1))
    fh = max(2.6, (eave - first) / nfl)
    if first + fh > eave: first = zg + 0.3; fh = max(2.4, (eave - first) / nfl)
    hood = {'italianate': 'pediment', 'stick': 'cap', 'edwardian': 'cap'}.get(sub)
    bay_kind = {'italianate': 'slant', 'stick': 'square', 'queen': rng.choice(('slant', 'square')),
                'edwardian': 'square', 'med': 'square' if rng.random() < 0.4 else None,
                'sunset': 'box'}.get(sub)
    ctx = dict(style=style, sub=sub, first=first, fh=fh, nfl=nfl, eave=eave, zg=zg, trim=trim, body=body,
               accent=accent, roof=roof, hood=hood, bay=bay_kind, wall_mat=wall_mat)

    # ── walls ──
    for i, w in enumerate(walls):
        role = roles[i]
        if w.L < 0.05: continue
        holes = []
        if role != 2 and w.L > 1.4:
            holes = facade(w, i == f0 or role == 1, b, rng, ctx)
        w.wall_with_holes(wall_mat, 0.0, w.L, zfoot, eave, [h for h in holes if h[0] >= 0], body)
        # corner boards (wood) or quoins (stucco blocks) and a water table
        if role != 2 and LOD < 2:
            if wall_mat == 'siding':
                w.box('trim', 0.0, 0.16, first - raised, eave, 0.0, 0.05, trim)
                w.box('trim', w.L - 0.16, w.L, first - raised, eave, 0.0, 0.05, trim)
            w.box('trim' if wall_mat == 'siding' else 'concrete', -0.02, w.L + 0.02, zfoot, zg + 0.35, 0.0, 0.06, (0.55, 0.53, 0.50))
        # gable end: the wall above the eave follows the roof
        if roof == 'gable':
            pts = [0.0, w.L]
            ua, ub = w.a.dot(ax_u), w.b.dot(ax_u)
            if (ua - uc) * (ub - uc) < 0: pts.insert(1, w.L * (uc - ua) / (ub - ua))
            tops = [rz(w.P(u, 0)) for u in pts]
            if max(tops) > eave + 0.05:
                gmat = 'shingle' if (i == f0 and style == 'vic') else wall_mat
                gp = [w.P(0.0, eave), w.P(w.L, eave)] + [w.P(u, t) for u, t in list(zip(pts, tops))[::-1]]
                out.poly(gmat, gp, accent if gmat == 'shingle' else body)
                if i == f0 and style == 'vic':
                    w.box('trim', -0.25, w.L + 0.25, eave - 0.1, eave + 0.18, 0.0, 0.35, trim)
                    apex = max(tops); um = pts[1] if len(pts) == 3 else w.L / 2
                    if apex - eave > 2.2:
                        w.box('glass', um - 0.4, um + 0.4, eave + 0.5, eave + 1.5, 0.02, 0.05, (1, 1, 1))
                        w.box('trim', um - 0.5, um + 0.5, eave + 0.4, eave + 0.5, 0.0, 0.1, trim)
                        w.box('trim', um - 0.5, um + 0.5, eave + 1.5, eave + 1.62, 0.0, 0.1, trim)
                        # a sunburst of boards fanning from the attic window's head
                        for k in range(7 if LOD < 2 else 0):
                            ang = math.radians(20 + k * 23.3)
                            ex, ez = um + math.cos(ang) * 1.3, eave + 1.62 + math.sin(ang) * 0.9
                            if ez < rz(w.P(ex, 0)) - 0.15:
                                w.box('trim', min(um, ex) - 0.03, max(um, ex) + 0.03, eave + 1.62, max(eave + 1.7, ez), 0.0, 0.02, trim)
        else:
            w.rect(wall_mat, 0.0, w.L, eave, top + 0.05, 0.0, body)
        # the back of a house: a wooden deck and stair down to the yard
        if role == 0 and style in ('vic', 'stucco', 'midcentury') and w.L > 4.0 and LOD == 0 and rng.random() < 0.55 and first - zg > 0.8:
            rear_deck(w, rng.uniform(0.4, max(0.5, w.L - 3.6)), first, zg, trim, rng)

    # ── the corner turret of a Queen Anne ──
    if sub == 'queen' and corner and rng.random() < 0.65:
        others = [i for i in range(n) if i != f0 and roles[i] in (1, 3) and walls[i].L > 3.0]
        j = others[0]
        # the corner shared by the front and that street wall
        cpt = walls[f0].a if (walls[j].b - walls[f0].a).length < 0.5 else walls[f0].b
        turret(cpt, (walls[f0].n + walls[j].n).normalized(), first, eave, top, trim, body, accent, rng, out)

    # ── cornice on the street wall ──
    wf = walls[f0]
    if roof == 'flat':
        proj = {'vic': 0.6, 'stucco': 0.35, 'block': 0.5, 'midcentury': 0.2}[style]
        ctop = top + (1.0 if style == 'vic' else 0.3)          # a false front rises past the roof
        if style == 'vic': wf.rect('siding', 0.0, wf.L, top, ctop, 0.0, body)
        if sub == 'med':
            # a tiled coping over the parapet, pitched out
            a0, a1 = wf.P(-0.2, top + 0.1, 0.45), wf.P(wf.L + 0.2, top + 0.1, 0.45)
            b0, b1 = wf.P(-0.2, top + 0.55, -0.15), wf.P(wf.L + 0.2, top + 0.55, -0.15)
            out.poly('roof_tile', [a0, a1, b1, b0], (1, 1, 1))
        elif style != 'midcentury':
            wf.box('trim', -0.1, wf.L + 0.1, ctop - 0.45, ctop, 0.0, proj, trim)
            wf.box('trim', -0.05, wf.L + 0.05, ctop - 0.62, ctop - 0.45, 0.0, proj * 0.5, trim)
            if (style == 'vic' or sub == 'edwardian') and LOD < 2:
                for uu in frange(0.2, wf.L - 0.2, 0.7 if sub == 'italianate' else 1.0):   # brackets
                    wf.box('trim', uu - 0.07, uu + 0.07, ctop - 1.15, ctop - 0.45, 0.0, proj * 0.8, trim)
                # dentils under the cornice
                if sub in ('italianate', 'edwardian'):
                    for uu in frange(0.1, wf.L - 0.1, 0.22):
                        wf.box('trim', uu - 0.05, uu + 0.05, ctop - 0.75, ctop - 0.62, 0.0, 0.12, trim)
    elif style == 'vic':
        wf.box('trim', -0.1, wf.L + 0.1, eave - 0.35, eave - 0.1, 0.0, 0.22, trim)

    # ── roof ──
    if roof == 'gable':
        oring = offset_ring(ring, 0.35)
        pts2 = [Vector((x, y, 0)) for x, y in oring]
        tris = tessellate_polygon([pts2])
        f = lambda p: p.dot(ax_u) - uc
        rc_ = roof_colour(b, rng) if roof_mat == 'roof_shingle' else (1.0, 0.95, 0.9)
        for t in tris:
            for tri in split_tri([pts2[k].copy() for k in t], f):
                top_ = [Vector((p.x, p.y, rz(p) + 0.05)) for p in tri]
                out.poly(roof_mat, top_, rc_)
        # the ridge cap along the top
        ovs = [Vector((x, y, 0)).dot(ax_v) for x, y in oring]
        r0 = ax_u * uc + ax_v * min(ovs); r1 = ax_u * uc + ax_v * max(ovs)
        zr = rz(r0) + 0.05
        o_ = Vector((r0.x, r0.y, zr)) - ax_u * 0.14
        out.box3(roof_mat, o_, ax_v * (max(ovs) - min(ovs)), ax_u * 0.28, Vector((0, 0, 0.12)), tuple(c * 0.85 for c in rc_))
        if style == 'vic' and rng.random() < 0.8:
            vpos = min(vs) + (max(vs) - min(vs)) * rng.uniform(0.3, 0.7)
            upos = uc + (hw * 0.55) * (1 if rng.random() < 0.5 else -1)
            base = ax_u * upos + ax_v * vpos
            zc = rz(base) + rng.uniform(0.8, 1.4)
            o = Vector((base.x, base.y, eave)) - ax_u * 0.35 - ax_v * 0.45
            out.box3('chimney', o, ax_u * 0.7, ax_v * 0.9, Vector((0, 0, zc - eave)), (1, 1, 1))
            out.box3('trim', o - ax_u * 0.06 - ax_v * 0.06 + Vector((0, 0, zc - eave - 0.15)), ax_u * 0.82, ax_v * 1.02, Vector((0, 0, 0.18)), (0.55, 0.52, 0.48))
        for i in range(len(oring)):
            a, c = Vector((*oring[i], 0)), Vector((*oring[(i + 1) % len(oring)], 0))
            za, zc = rz(a) + 0.05, rz(c) + 0.05
            out.poly('trim', [Vector((a.x, a.y, za - 0.22)), Vector((c.x, c.y, zc - 0.22)), Vector((c.x, c.y, zc)), Vector((a.x, a.y, za))], trim)
    else:
        deck = top - 0.55
        inner = offset_ring(ring, -0.28)
        pts2 = [Vector((x, y, deck)) for x, y in inner]
        rc_ = roof_colour(b, rng, flat=True)
        for t in tessellate_polygon([pts2]):
            out.poly('roof_flat', [pts2[k] for k in t], rc_)
        for i in range(n):                                    # parapet: inner face and cap
            a, c = Vector((*ring[i], 0)), Vector((*ring[(i + 1) % n], 0))
            ia, ic = Vector((*inner[i], 0)), Vector((*inner[(i + 1) % n], 0))
            out.poly(wall_mat, [Vector((ic.x, ic.y, deck)), Vector((ia.x, ia.y, deck)), Vector((ia.x, ia.y, top + 0.05)), Vector((ic.x, ic.y, top + 0.05))], body)
            out.poly('trim', [Vector((a.x, a.y, top + 0.05)), Vector((c.x, c.y, top + 0.05)), Vector((ic.x, ic.y, top + 0.05)), Vector((ia.x, ia.y, top + 0.05))], trim)
        roof_kit(ring, deck, top, b, rng, out)
        # a roof deck on about one flat-roofed house in five
        if style in ('vic', 'stucco', 'midcentury') and rng.random() < 0.2 and LOD == 0:
            cx = sum(p[0] for p in ring) / n; cy = sum(p[1] for p in ring) / n
            d0 = Vector((cx, cy, deck + 0.12)) - ax_u * 1.6 - ax_v * 1.6
            out.box3('deck', d0, ax_u * 3.2, ax_v * 3.2, Vector((0, 0, 0.12)), (0.62, 0.48, 0.34))
            for (du, dv, lu, lv) in ((0, 0, 3.2, 0.05), (0, 3.15, 3.2, 0.05), (0, 0, 0.05, 3.2), (3.15, 0, 0.05, 3.2)):
                out.box3('metal', d0 + ax_u * du + ax_v * dv + Vector((0, 0, 1.12)), ax_u * lu, ax_v * lv, Vector((0, 0, 0.05)), (0.15, 0.15, 0.16))
                for k in range(5):
                    t_ = k / 4
                    out.box3('metal', d0 + ax_u * (du + lu * t_ * (lu > 1)) + ax_v * (dv + lv * t_ * (lv > 1)) + Vector((0, 0, 0.12)), ax_u * 0.05, ax_v * 0.05, Vector((0, 0, 1.0)), (0.15, 0.15, 0.16))


def turret(cpt, dirn, first, eave, top, trim, body, accent, rng, out):
    """an octagonal corner turret with a candle-snuffer roof"""
    R = rng.uniform(1.4, 1.8); cx = Vector((cpt.x, cpt.y, 0)) + Vector((dirn.x, dirn.y, 0)) * 0.6
    z0 = first + 0.2; z1 = max(eave, top - 1.0) + rng.uniform(0.6, 1.4); apex = z1 + R * 2.4
    P = [cx + Vector((math.cos(k * math.pi / 4 + math.pi / 8) * R, math.sin(k * math.pi / 4 + math.pi / 8) * R, 0)) for k in range(8)]
    for k in range(8):
        a, c = P[k], P[(k + 1) % 8]
        fw = Wall((a.x, a.y), (c.x, c.y), out)
        holes = []
        nf = max(1, int((z1 - z0) // 3.0))
        for f in range(nf):
            a0 = z0 + f * 3.0 + 0.9; a1 = a0 + 1.5
            if a1 < z1 - 0.3:
                holes.append((0.25, fw.L - 0.25, a0, a1)); fw.opening(0.25, fw.L - 0.25, a0, a1, 'dh', trim, 0.12)
        fw.wall_with_holes('siding', 0.0, fw.L, z0 - 1.0, z1, holes, body)
        fw.box('trim', -0.05, fw.L + 0.05, z1 - 0.35, z1, 0.0, 0.25, trim)
        # the conical roof: a triangle per side, shingled
        out.poly('roof_shingle', [Vector((a.x, a.y, z1)) + (a - cx).normalized() * 0.25, Vector((c.x, c.y, z1)) + (c - cx).normalized() * 0.25, Vector((cx.x, cx.y, apex))], (0.78, 0.76, 0.78))
    # a finial
    out.box3('metal', Vector((cx.x - 0.05, cx.y - 0.05, apex - 0.1)), Vector((0.1, 0, 0)), Vector((0, 0.1, 0)), Vector((0, 0, 0.9)), (0.2, 0.2, 0.2))


def rear_deck(w, u0, first, zg, trim, rng):
    """a wooden deck off the first floor at the back, posts, rail and a stair"""
    L_ = 3.2; D = 2.4; zd = first
    w.box('deck', u0, u0 + L_, zd - 0.2, zd, 0.0, D, (0.60, 0.46, 0.32))
    for uu in (u0 + 0.05, u0 + L_ - 0.15):
        w.box('deck', uu, uu + 0.1, zg - 0.2, zd, D - 0.15, D - 0.05, (0.55, 0.42, 0.30))
    # a railing: posts and a top rail, open between
    w.box('trim', u0, u0 + L_, zd + 0.95, zd + 1.02, D - 0.06, D, trim)
    w.box('trim', u0, u0 + 0.05, zd + 0.95, zd + 1.02, 0.0, D, trim)
    for uu in frange(u0, u0 + L_ - 0.05, 0.6): w.box('trim', uu, uu + 0.05, zd, zd + 1.0, D - 0.06, D - 0.01, trim)
    for ww_ in frange(0.1, D - 0.1, 0.6): w.box('trim', u0, u0 + 0.05, zd, zd + 1.0, ww_, ww_ + 0.05, trim)
    rise = zd - zg; nst = max(3, int(rise / 0.19)); run = 0.26
    for s_ in range(nst):
        zt = zd - (s_ + 1) * rise / nst
        w.box('deck', u0 + L_ + s_ * run, u0 + L_ + (s_ + 1) * run, zt - 0.05, zt, D - 1.0, D, (0.58, 0.45, 0.32))


SHINGLE_TINTS = [(1.0, 1.0, 1.02), (0.92, 0.95, 1.05), (1.12, 1.0, 0.88), (0.95, 1.03, 0.95), (1.18, 0.92, 0.82), (0.85, 0.85, 0.88)]
FLAT_TINTS = [(1.0, 1.0, 1.0), (1.55, 1.55, 1.52), (1.25, 1.18, 1.05), (0.8, 0.8, 0.82), (1.4, 1.42, 1.45)]

def roof_colour(b, rng, flat=False):
    # the measured aerial roof tone (paintIdx, 32 steps dark→light) sets the
    # lightness; the hue is a convention (shingle or membrane), per building
    # (colours are squared into linear by emit(): these are display values)
    t = b.get('paint', 16) / 31.0
    k = 0.70 + 0.5 * t + rng.uniform(-0.05, 0.05)
    tint = rng.choice(FLAT_TINTS if flat else SHINGLE_TINTS)
    return tuple(k * c for c in tint)


def roof_kit(ring, deck, top, b, rng, out):
    """what stands on a flat roof: a hatch or a stair penthouse, vents, a skylight"""
    cx = sum(p[0] for p in ring) / len(ring); cy = sum(p[1] for p in ring) / len(ring)
    area = abs(sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))) / 2
    X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    if area > 120 and rng.random() < 0.7:
        s = rng.uniform(2.2, 3.2)
        out.box3('stucco', Vector((cx - s / 2, cy - s / 2, deck)), X * s, Y * s, Z * rng.uniform(2.2, 2.8), (0.82, 0.80, 0.76))
    for k in range(int(min(6, area / 60))):
        px, py = cx + rng.uniform(-3, 3), cy + rng.uniform(-3, 3)
        out.box3('metal', Vector((px, py, deck)), X * 0.5, Y * 0.5, Z * 0.6, (0.6, 0.6, 0.62))
    if rng.random() < 0.4:
        px, py = cx + rng.uniform(-2, 2), cy + rng.uniform(-2, 2)
        out.box3('glass', Vector((px, py, deck)), X * 1.2, Y * 0.9, Z * 0.35, (1, 1, 1))


def facade(w, is_front, b, rng, c):
    """windows, bays, doors, garages, balconies and the stoop on one wall;
    returns the openings (u0, u1, z0, z1) cut through the wall"""
    holes = []; L = w.L
    style, sub = c['style'], c['sub']
    first, fh, nfl, eave, zg = c['first'], c['fh'], c['nfl'], c['eave'], c['zg']
    trim, body, accent = c['trim'], c['body'], c['accent']
    # window proportions by era: tall Victorian sashes, squarer later
    if style == 'vic': ww, wh = 0.95, min(2.4, fh * 0.64)
    elif sub == 'edwardian': ww, wh = 1.0, min(2.1, fh * 0.6)
    elif style == 'stucco': ww, wh = 1.15, min(1.8, fh * 0.55)
    elif sub == 'sunset': ww, wh = 1.2, 1.5
    elif sub == 'modern': ww, wh = 1.8, 1.6
    elif sub == 'tower': ww, wh = 1.5, min(2.4, fh * 0.72)
    else: ww, wh = 1.3, min(1.8, fh * 0.52)
    sill = (fh - wh) * 0.45
    hood = c['hood'] if is_front else None
    bay_u = []
    if is_front and c['bay'] and L > 4.0:
        kind = c['bay']
        # a narrow Victorian carries one bay; a wide Edwardian two, one each side
        n_b = 2 if (sub == 'edwardian' and L > 9.5) else 1
        bw = min(3.2 if kind != 'box' else 3.4, L * (0.4 if n_b == 1 else 0.3))
        if n_b == 1:
            left = rng.random() < 0.5
            starts = [0.35 if left else L - bw - 0.35]
        else:
            starts = [0.4, L - bw - 0.4]
        for bu0 in starts:
            z0_ = first if kind != 'box' else first
            z1_ = eave - 0.25 if kind != 'box' else first + fh - 0.2
            bay(w, bu0, bu0 + bw, z0_, z1_, c, rng, kind)
            bay_u.append((bu0, bu0 + bw))
    # the entry and its stoop (or the garage of a raised house)
    door_u = None
    garage_u = None
    if is_front and style != 'block' and L > 3.0:
        free = [(0.3, L - 0.3)]
        for hu in bay_u: free = cut(free, hu, 0.3)
        free = [f for f in free if f[1] - f[0] > 1.3]
        if first - zg > 2.0 and L > 5.0:
            # the raised house sits over a garage at the street
            gw = min(2.6, L - 2.2)
            cand = [f for f in [(0.4, L - 0.4)] if f[1] - f[0] > gw + 1.3]
            if cand:
                g0 = cand[0][0] if rng.random() < 0.5 else cand[0][1] - gw
                garage_u = (g0, g0 + gw)
                holes.append((g0, g0 + gw, zg + 0.05, zg + 2.3))
                w.rect('door', g0, g0 + gw, zg + 0.05, zg + 2.3, -0.12, mix(accent, (0.85, 0.84, 0.8), 0.6))
                for k in range(5 if LOD < 2 else 0): w.box('trim', g0, g0 + gw, zg + 0.08 + k * 0.45, zg + 0.11 + k * 0.45, -0.12, -0.08, trim)
                w.box('trim', g0 - 0.12, g0 + gw + 0.12, zg + 2.3, zg + 2.45, 0.0, 0.08, trim)
                free = cut(free, garage_u, 0.2)
                free = [f for f in free if f[1] - f[0] > 1.3]
        if free:
            f_ = max(free, key=lambda f: f[1] - f[0])
            du0 = f_[0] + 0.15 if rng.random() < 0.5 else f_[1] - 1.15
            door_u = (du0, du0 + 1.0)
            holes.append((door_u[0], door_u[1], first, first + 2.3))
            w.opening(door_u[0], door_u[1], first, first + 2.3, 'door', trim, 0.35, rng, accent)
            if style == 'vic' or sub == 'edwardian':
                w.box('trim', du0 - 0.25, du0 + 1.25, first + 2.35, first + 2.6, 0.0, 0.5, trim)       # an entry hood
            if LOD < 2: stoop(w, door_u[0] - 0.2, door_u[1] + 0.2, zg, first, trim, style)
    # a storefront where the record says shop
    shop = is_front and b.get('shop') and style != 'vic'
    if shop:
        s0, s1 = 0.3, L - 0.3
        holes.append((s0, s1, zg + 0.4, zg + 3.2))
        w.opening(s0, s1, zg + 0.4, zg + 3.2, 'shop', trim, 0.3)
        w.box('awning', s0, s1, zg + 3.2, zg + 3.5, 0.0, 1.2, accent)
        w.box('trim', 0.0, L, zg + 3.5, zg + 4.2, 0.0, 0.12, accent)    # sign band
    # windows: each floor, the rest of the wall
    gap_min = {'vic': 0.7, 'block': 0.9}.get(style, 1.0)
    for f in range(nfl):
        z0 = first + f * fh + sill; z1 = z0 + wh
        if z1 > eave - 0.2: break
        if shop and z0 < zg + 4.3: continue
        spans = [(0.3, L - 0.3)]
        for hu in bay_u: spans = cut(spans, hu, 0.4)
        if f == 0 and door_u: spans = cut(spans, door_u, 0.4)
        for s0, s1 in spans:
            if sub == 'sunset' and is_front and f == 0 and s1 - s0 > 3.0:
                # the picture window of a Sunset living room
                u0, u1 = s0 + 0.3, min(s1 - 0.3, s0 + 3.2)
                holes.append((u0, u1, z0 - 0.2, z1)); w.opening(u0, u1, z0 - 0.2, z1, 'tall', trim, 0.15, rng)
                continue
            k = int((s1 - s0) // (ww + gap_min))
            if not is_front and style != 'block': k = min(k, max(1, int((s1 - s0) // 3.2)))
            if k < 1: continue
            gap = (s1 - s0) / k
            for j in range(k):
                uc_ = s0 + gap * (j + 0.5)
                u0, u1 = uc_ - ww / 2, uc_ + ww / 2
                holes.append((u0, u1, z0, z1))
                w.opening(u0, u1, z0, z1, 'tall' if style == 'block' or sub == 'modern' else 'dh', trim, 0.18, rng, hood=hood)
                # balconies on a modern front
                if sub == 'modern' and is_front and f > 0 and j % 2 == 0 and LOD == 0:
                    w.box('concrete', u0 - 0.3, min(L - 0.2, u1 + gap + 0.3), z0 - sill - 0.15, z0 - sill, 0.0, 1.2, (0.8, 0.8, 0.78))
                    w.box('metal', u0 - 0.3, min(L - 0.2, u1 + gap + 0.3), z0 - sill, z0 - sill + 1.0, 1.15, 1.2, (0.12, 0.12, 0.13))
        if (style == 'vic' or sub == 'edwardian') and is_front and f > 0 and LOD < 2:
            w.box('trim', 0.0, L, first + f * fh - 0.06, first + f * fh + 0.12, 0.0, 0.06, trim)
    return holes


def cut(spans, hu, pad):
    ns = []
    for s0, s1 in spans:
        if hu[1] + pad <= s0 or hu[0] - pad >= s1: ns.append((s0, s1)); continue
        if hu[0] - pad > s0: ns.append((s0, hu[0] - pad))
        if hu[1] + pad < s1: ns.append((hu[1] + pad, s1))
    return ns


def mix(a, b, t): return tuple(x * (1 - t) + y * t for x, y in zip(a, b))


def bay(w, u0, u1, z0, z1, c, rng, kind):
    """a bay window: canted ('slant'), square, or a shallow box around the
    picture window of a Sunset house; windows in each face, its own cornice"""
    out = w.o; trim, body, style, sub = c['trim'], c['body'], c['style'], c['sub']
    fh, nfl, first = c['fh'], c['nfl'], c['first']
    d = 0.75 if kind != 'box' else 0.45
    inset = 0.6 if kind == 'slant' else 0.0
    A, B = w.P(u0, 0, 0), w.P(u1, 0, 0)
    C, D = w.P(u1 - inset, 0, d), w.P(u0 + inset, 0, d)
    faces = [(A, D), (D, C), (C, B)]
    wm = c['wall_mat'] if c['wall_mat'] in ('siding', 'stucco') else 'stucco'
    wh = min(2.3, fh * 0.62) if kind != 'box' else 1.5
    sill = (fh - wh) * 0.45
    for (p, q) in faces:
        fw = Wall((p.x, p.y), (q.x, q.y), out)
        if fw.L < 0.05: continue
        holes = []
        nfl_b = nfl if kind != 'box' else 1
        for f in range(nfl_b):
            a0 = first + f * fh + sill; a1 = a0 + wh
            if a1 > z1 - 0.2: break
            m = 0.18 if fw.L > 1.2 else 0.14
            if fw.L - 2 * m < 0.3: continue
            holes.append((m, fw.L - m, a0, a1))
            fw.opening(m, fw.L - m, a0, a1, 'dh' if kind != 'box' else 'tall', trim, 0.12, rng, hood=c['hood'] if kind == 'square' else None)
            if f > 0 and LOD < 2: fw.box('trim', 0.0, fw.L, first + f * fh - 0.05, first + f * fh + 0.1, 0.0, 0.05, trim)
        fw.wall_with_holes(wm, 0.0, fw.L, z0 - 0.5, z1, holes, body)
        fw.box('trim', -0.05, fw.L + 0.05, z1 - 0.4, z1, 0.0, 0.3, trim)            # the bay's cornice
        if LOD < 2: fw.box('trim', -0.02, fw.L + 0.02, z0 - 0.5, z0 - 0.3, 0.0, 0.1, trim)      # its base
        if style == 'vic' and kind == 'slant' and LOD == 0:
            fw.box('trim', fw.L * 0.2, fw.L * 0.8, z0 - 1.0, z0 - 0.5, 0.0, 0.08, trim)   # a panel under the bay
    for z, up in ((z1, True), (z0 - 0.5, False)):
        pl = [Vector((p.x, p.y, z)) for p in (A, B, C, D)]
        out.poly('trim', pl[::-1] if up else pl, trim)
    # a small tiled hood over the bay of a Mediterranean or Sunset house
    if sub in ('med', 'sunset'):
        e0, e1 = w.P(u0 - 0.2, z1 + 0.05, d + 0.35), w.P(u1 + 0.2, z1 + 0.05, d + 0.35)
        k0, k1 = w.P(u0 - 0.2, z1 + 0.7, 0.0), w.P(u1 + 0.2, z1 + 0.7, 0.0)
        out.poly('roof_tile', [e0, e1, k1, k0], (1, 1, 1))


def stoop(w, u0, u1, zg, zdoor, trim, style):
    """stairs from the sidewalk up to a raised door, out from the wall"""
    rise = zdoor - zg
    if rise < 0.3: return
    nst = max(2, int(round(rise / 0.18)))
    run = 0.28
    for s in range(nst):
        zt = zdoor - s * rise / nst
        w.box('stair', u0, u1, zg - 0.3, zt, s * run, (s + 1) * run, (0.72, 0.70, 0.66) if style != 'vic' else (0.62, 0.58, 0.54))
    # a landing and two side walls / rails
    w.box('stair', u0 - 0.15, u1 + 0.15, zg - 0.3, zdoor, 0.0, 0.3, (0.66, 0.63, 0.58))
    if style == 'vic':
        for uu in (u0 - 0.15, u1):
            w.box('stair', uu, uu + 0.15, zg - 0.3, zdoor + 0.9, 0.0, nst * run, (0.80, 0.78, 0.74))


def emit(bpy, out, mats, name='gen'):
    """one mesh per material, with a face colour attribute 'bcol'"""
    objs = []
    for k, (V, F, C) in out.m.items():
        if not F: continue
        me = bpy.data.meshes.new(f'{name}.{k}')
        me.from_pydata(V, [], F)
        # colours first, THEN validate: validate drops degenerate faces and
        # takes their attribute rows with them — done the other way round,
        # every colour after the first dropped face belonged to its neighbour
        at = me.color_attributes.new('bcol', 'FLOAT_COLOR', 'FACE')
        flat = []
        for c in C: flat.extend((c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2, 1.0))
        at.data.foreach_set('color', flat)
        me.validate(clean_customdata=False)
        me.materials.append(mats[k])
        ob = bpy.data.objects.new(f'{name}.{k}', me)
        bpy.context.scene.collection.objects.link(ob); objs.append(ob)
    return objs
