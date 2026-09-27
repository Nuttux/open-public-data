"""TODAY'S CONSTRUCTION SITES AND A LATTICE TOWER CRANE (27/09, assets_urban; SITES=1 / CRANE_V2=1 default, 0 = before).

Sites: DataSF Building Permits (i98e-djp9) for NEW construction (permit types 1-2), status 'issued' (not complete)
as of 2026-09-27, issued since 2023-06, 5 storeys or more, drawn on their parcel (DataSF parcels acdm-wktn, by
block/lot): sites_today.json (assets_urban/tools/sites_export.py). A site whose parcel still carries a standing record
in our data (> 6 m) is left alone (our data would show both). Each becomes a pseudo-record for gen_buildings.construction
(the eras' own grammar: excavation, then the frame round a core, the cladding behind, a tower crane from 25 m):
  h = storeys x 3.25 + 1.5 m (SOURCED storeys), the construction share = months since the permit's issue / era.rise_years(h)
  (CONVENTION on the pace), plus the site's trailers, material stacks and portable toilets (CONVENTION).
The tower crane (CRANE_V2, every year from 1955 on): a lattice mast (four chords, a diagonal per face per 2.5 m), a
triangular lattice jib and a counter-jib with its concrete blocks, the tower head with its pendants, the cab, the trolley
and a hook on its cable; yellow, or white and red (CONVENTION).
"""
import json, math, os, random
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
NOW = 2026 + 270 / 365.0                                    # 27 Sep 2026: the map's today


def records(recs, box=None):
    """today's sites as pseudo-records (gid 9e8 + i) for G.building -> construction()"""
    p = os.path.join(HERE, 'sites_today.json')
    if not os.path.exists(p): return []
    import era as EA
    out = []
    for i, s in enumerate(json.load(open(p))['sites']):
        r = [tuple(q) for q in s['ring']]; n = len(r)
        cx = sum(q[0] for q in r) / n; cy = sum(q[1] for q in r) / n
        if box and not (box[0] - 100 <= cx <= box[2] + 100 and box[1] - 100 <= cy <= box[3] + 100): continue
        h = s['stories'] * 3.25 + 1.5
        y, m, d = map(int, s['issued'].split('-')); t0 = y + (m - 1) / 12 + d / 365
        f = max(0.03, min(0.95, (NOW - t0) / EA.rise_years(h)))
        out.append(dict(gid=int(9e8) + i, ring=r, cx=cx, cy=cy, h=h, st=int(s['stories']), year=int(t0 + EA.rise_years(h)) + 1, rise=f,
                        ty='CONSTRUCTION', _site_today=s['addr'], use='construction'))
    if out:
        # a record standing (> 6 m) on the site's middle: our data still shows the old building -> leave the site out
        def inside(x, y, r):
            k = False
            for a in range(len(r)):
                (x1, y1), (x2, y2) = r[a], r[(a + 1) % len(r)]
                if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): k = not k
            return k
        keep = []
        for s in out:
            if any(abs(b['cx'] - s['cx']) < 80 and abs(b['cy'] - s['cy']) < 80 and (b.get('h') or 0) > 6 and inside(s['cx'], s['cy'], b['ring']) for b in recs): continue
            keep.append(s)
        out = keep
    return out


def _bar(out, p, q, w, col, mat='metal'):
    """a lattice member from p to q, w thick (a thin box along p->q)"""
    d = q - p
    if d.length < 1e-4: return
    a = d.normalized(); up = Vector((0, 0, 1)) if abs(a.z) < 0.95 else Vector((1, 0, 0))
    b = a.cross(up).normalized() * w; c = a.cross(b).normalized() * w
    out.box3(mat, p - (b + c) / 2, d, b, c, col)


def tower_crane(out, mx, my, zg, top, jib, ang, rng):
    """a lattice tower crane: the mast from zg to top at (mx, my), the jib `jib` m long toward ang"""
    col = rng.choice(((0.86, 0.66, 0.10), (0.86, 0.66, 0.10), (0.88, 0.87, 0.84)))
    acc = (0.70, 0.12, 0.10) if col[0] > 0.87 else col                     # the white cranes: red accents
    Z = Vector((0, 0, 1)); m = 1.0; t = 0.12
    C = [Vector((mx + sx * m, my + sy * m, 0)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for c in C: _bar(out, c + Z * zg, c + Z * top, t * 1.4, col)             # the four chords
    z = zg; k = 0
    while z + 2.5 <= top:                                                    # a diagonal per face per 2.5 m section, and the ties
        for i in range(4):
            a, b = C[i], C[(i + 1) % 4]
            if k % 2: _bar(out, a + Z * z, b + Z * (z + 2.5), t, col)
            else: _bar(out, b + Z * z, a + Z * (z + 2.5), t, col)
            _bar(out, a + Z * (z + 2.5), b + Z * (z + 2.5), t * 0.8, col)
        z += 2.5; k += 1
    u = Vector((math.cos(ang), math.sin(ang), 0)); v = Vector((-u.y, u.x, 0)); o = Vector((mx, my, top))
    out.box3('metal', o - u * 1.2 - v * 1.2, u * 2.4, v * 2.4, Z * 1.2, col)                 # the slewing ring and platform
    # the jib: a triangular lattice, 1.5 m wide, 1.7 m deep
    b0, b1, tp = o + Z * 1.2 - v * 0.75, o + Z * 1.2 + v * 0.75, o + Z * 2.9
    for p in (b0, b1, tp): _bar(out, p, p + u * jib, t * 1.3, col)
    s = 0.0; k = 0
    while s + 2.0 <= jib:
        for p in (b0, b1):
            _bar(out, p + u * (s + (0 if k % 2 else 2.0)), tp + u * (s + (2.0 if k % 2 else 0)), t * 0.8, col)
        _bar(out, b0 + u * s, b1 + u * s, t * 0.7, col)
        s += 2.0; k += 1
    # the counter-jib: a walkway with rails, its concrete blocks at the end
    cl = jib * 0.32
    out.box3('metal', o + Z * 1.2 - v * 1.0, -u * cl, v * 2.0, Z * 0.3, col)
    for sd in (-1, 1): _bar(out, o + Z * 2.3 + v * sd * 1.0, o + Z * 2.3 + v * sd * 1.0 - u * cl, 0.06, col)
    out.box3('concrete', o + Z * 0.2 - u * (cl - 0.2) - v * 1.1, u * 3.2, v * 2.2, Z * 2.6, (0.58, 0.57, 0.54))
    # the tower head (A-frame) and the pendants to both tips
    hd = o + Z * 1.2 + Z * 7.5
    for sd in (-1, 1): _bar(out, o + Z * 1.2 + v * sd * 1.0, hd, 0.18, col)
    _bar(out, hd, tp + u * (jib * 0.62), 0.05, (0.2, 0.2, 0.2)); _bar(out, hd, o + Z * 1.5 - u * cl, 0.05, (0.2, 0.2, 0.2))
    # the cab beside the mast top, on the jib side
    out.box3('metal', o + u * 0.6 + v * 1.1 + Z * 0.0, u * 1.6, v * 1.3, Z * 2.0, (0.84, 0.84, 0.82))
    out.box3('glass', o + u * 2.21 + v * 1.15 + Z * 0.8, u * 0.02, v * 1.2, Z * 1.0, (0.2, 0.25, 0.3))
    for sd in (-1, 1): out.box3('metal', o - u * (cl - 1.0) + v * sd * 1.05 - v * 0.05 + Z * 1.5, u * 0.6, v * 0.1, Z * 0.6, acc)
    # the trolley, the hoist cable and the hook block, somewhere along the jib
    tr = o + Z * 1.1 + u * (jib * rng.uniform(0.35, 0.85))
    out.box3('metal', tr - u * 0.7 - v * 0.8, u * 1.4, v * 1.6, Z * 0.35, (0.3, 0.3, 0.3))
    hz = max(zg + 4.0, tr.z - rng.uniform(15.0, 45.0))
    _bar(out, tr, Vector((tr.x, tr.y, hz + 0.8)), 0.04, (0.15, 0.15, 0.15))
    out.box3('metal', Vector((tr.x - 0.4, tr.y - 0.25, hz)), Vector((0.8, 0, 0)), Vector((0, 0.5, 0)), Z * 0.8, acc)


def site_extras(out, ring, zg, rng):
    """the site's office trailers, material stacks and portable toilets, inside the fence along its longest side"""
    n = len(ring); best = None
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]; L = math.hypot(b[0] - a[0], b[1] - a[1])
        if best is None or L > best[0]: best = (L, a, b)
    L, a, b = best
    if L < 18: return
    u = Vector(((b[0] - a[0]) / L, (b[1] - a[1]) / L, 0)); v = Vector((-u.y, u.x, 0))
    cx = sum(p[0] for p in ring) / n; cy = sum(p[1] for p in ring) / n
    if (Vector((cx, cy, 0)) - Vector((a[0], a[1], 0))).dot(v) < 0: v = -v                   # v points inside
    o = Vector((a[0], a[1], zg)) + v * 1.2 + u * 2.0; Z = Vector((0, 0, 1))
    for k in range(rng.randint(1, 3)):                                                      # trailers, stacked now and then
        p = o + u * (k * 13.0)
        if (p - o).length + 12 > L - 4: break
        out.box3('metal', p, u * 12.0, v * 3.0, Z * 2.9, rng.choice(((0.80, 0.80, 0.77), (0.62, 0.64, 0.64), (0.78, 0.74, 0.62))))
        if rng.random() < 0.3: out.box3('metal', p + Z * 2.95, u * 12.0, v * 3.0, Z * 2.9, (0.80, 0.80, 0.77))
    p = o + v * 5.0 + u * rng.uniform(2.0, max(2.5, L * 0.5))                              # stacks: rebar, formwork, pallets
    for k in range(rng.randint(3, 7)):
        q = p + u * (k * 2.6) + v * rng.uniform(-0.5, 0.5)
        out.box3('metal', q, u * 2.2, v * rng.uniform(1.0, 2.0), Z * rng.uniform(0.4, 1.2), rng.choice(((0.42, 0.28, 0.18), (0.52, 0.44, 0.30), (0.35, 0.36, 0.38), (0.62, 0.56, 0.40))))
    p = o + u * max(0.0, L - 8.0)                                                           # two portable toilets
    for k in range(2): out.box3('metal', p + u * (k * 1.3), u * 1.1, v * 1.1, Z * 2.3, (0.16, 0.34, 0.58))
