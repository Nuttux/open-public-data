"""HOTSPOTS AT z9 (27/09, assets_urban; HOT=1 default, HOT=0 = before; PEOPLE_V2=1 = the new figures everywhere).

At 9.4 cm/px a person is ~5 px wide and ~15 px tall at 29 degrees: legs, a torso in its own colour, arms, a head and hair
read. So the figures get legs (trousers from a palette), arms, a head with hair, a walking pose; the crowds of the city's
busiest places are added as groups:
  - PIER 39 (the deck and the entrance plaza), the FERRY BUILDING front with the Tuesday / Thursday / Saturday farmers
    market (CUESA: tents along the front arcade), FISHERMAN'S WHARF (Jefferson Street's sidewalks);
  - CAFE TABLES and umbrellas on the sidewalk at each business registered for tables and chairs (DataSF Shared Spaces
    dpch-7nr4, 500 points), PARKLETS in the parking lane at each approved parklet permit (DataSF jczu-j2ku, 13);
CONVENTION on the counts (a sunny weekday midday), the group sizes, the tents' and umbrellas' colours and the layouts;
SOURCED on the places (the permits, the market, the attractions). People are placed on what the ray finds first from
above (a deck, a sidewalk, a plaza), never on a street, a roof or the water.
"""
import json, math, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
SKIN = [(0.62, 0.42, 0.30), (0.45, 0.28, 0.18), (0.25, 0.15, 0.10), (0.70, 0.52, 0.40), (0.55, 0.38, 0.26)]
PANTS = [(0.16, 0.21, 0.32), (0.07, 0.07, 0.08), (0.52, 0.46, 0.35), (0.34, 0.34, 0.35), (0.11, 0.13, 0.20)]
HAIR = [(0.05, 0.04, 0.04), (0.16, 0.10, 0.06), (0.30, 0.20, 0.12), (0.55, 0.45, 0.30), (0.50, 0.50, 0.50)]
def W(lat, lon): return ((lon + 122.438) * 88007.3, (lat - 37.76) * 111320)

# (name, kind, geometry, count, z range of the surface): 'disc' = centre + radius; 'band' = a line (a, b) and offsets (v0, v1) off it
FERRY_A, FERRY_B, FERRY_N = (3955.8, 3855.5), (3836.7, 4018.2), (-0.807, -0.591)     # the front facade (footprint's min-area rectangle), outward normal
HOT = [('pier39', 'disc', (W(37.8093, -122.4099), 115.0), 320, (1.8, 7.0)),
       ('pier39_in', 'disc', (W(37.8083, -122.4098), 35.0), 70, (-5.0, 8.0)),
       ('ferry_front', 'band', (FERRY_A, FERRY_B, FERRY_N, 2.0, 22.0), 260, (-5.0, 8.0)),
       ('ferry_back', 'band', ((4001.2, 3888.7), (3882.1, 4051.4), (0.807, 0.591), 2.0, 12.0), 60, (0.5, 8.0)),
       ('jefferson', 'band', (W(37.80815, -122.4170), W(37.80800, -122.4138), None, -9.0, 9.0), 150, (-5.0, 12.0))]


def _person(VB, pose, k):
    """x forward, z up; material 0 = the clothes (a colour per person), 1 = bcol (trousers, skin, hair)"""
    vb = VB(); skin = (*SKIN[k % 5], 1.0); pants = (*PANTS[(k * 3 + 1) % 5], 1.0); hair = (*HAIR[(k * 2) % 5], 1.0); cl = (0.2, 0.2, 0.2, 1)
    if pose == 'sit':
        vb.box(-0.25, 0.25, -0.18, 0.18, 0.0, 0.16, pants, 1); vb.box(-0.2, 0.08, -0.2, 0.2, 0.16, 0.72, cl, 0)
        vb.box(-0.1, 0.1, -0.09, 0.09, 0.74, 0.95, skin, 1); vb.box(-0.1, 0.08, -0.09, 0.09, 0.93, 1.0, hair, 1); return vb
    s = 0.13 if pose == 'walk' else 0.0
    vb.box(-0.07 + s, 0.07 + s, -0.14, -0.03, 0.0, 0.84, pants, 1); vb.box(-0.07 - s, 0.07 - s, 0.03, 0.14, 0.0, 0.84, pants, 1)
    vb.box(-0.11, 0.11, -0.19, 0.19, 0.82, 1.42, cl, 0)                                  # the torso
    vb.box(-0.05 - s, 0.05 - s, -0.26, -0.19, 0.86, 1.38, cl, 0); vb.box(-0.05 + s, 0.05 + s, 0.19, 0.26, 0.86, 1.38, cl, 0)   # arms
    vb.box(-0.09, 0.09, -0.08, 0.08, 1.44, 1.66, skin, 1); vb.box(-0.1, 0.07, -0.09, 0.09, 1.62, 1.72, hair, 1)
    return vb


def protos(old):
    """life_people._protos() with the figures replaced (bike, surf kept)"""
    from life_boats import VB
    out = dict(old)
    for k in range(5):
        out[f'stand{k}'] = _person(VB, 'stand', k); out[f'sit{k}'] = _person(VB, 'sit', k); out[f'walk{k}'] = _person(VB, 'walk', k)
    return out


def plan_hot(inb):
    """(proto, x, y, yaw, zmin, zmax) for the crowds of the hot zones inside the region"""
    out = []
    for name, kind, g, N, zr in HOT:
        rr = random.Random(sum(map(ord, name)) * 131)
        if kind == 'disc':
            (cx, cy), R = g
            if not inb(cx, cy, R + 40): continue
            samp = lambda: (lambda a, d: (cx + math.cos(a) * d, cy + math.sin(a) * d, rr.uniform(0, 6.283)))(rr.uniform(0, 6.283), R * math.sqrt(rr.random()))
        else:
            a, b, nrm, v0, v1 = g
            L = math.hypot(b[0] - a[0], b[1] - a[1]); ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
            nx, ny = nrm if nrm else (-uy, ux)
            if not inb((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L / 2 + 40): continue
            def samp(a=a, ux=ux, uy=uy, nx=nx, ny=ny, L=L, v0=v0, v1=v1):
                u = rr.uniform(0, L); v = rr.uniform(v0, v1)
                return a[0] + ux * u + nx * v, a[1] + uy * u + ny * v, math.atan2(uy, ux) + (math.pi if rr.random() < 0.5 else 0.0)
        n = 0
        while n < N:
            x, y, yaw = samp(); g_ = 1 + min(4, int(rr.expovariate(1 / 1.3)))
            for i in range(g_):
                px, py = x + rr.uniform(-0.7, 0.7) * (i > 0), y + rr.uniform(-0.7, 0.7) * (i > 0)
                pose = 'walk' if (g_ <= 2 and rr.random() < 0.55) else 'stand'
                out.append((f'{pose}{rr.randrange(5)}', px, py, yaw + rr.uniform(-0.4, 0.4), zr[0], zr[1])); n += 1
    return out


def place(pl, ground, bvh, sbv, log):
    """ray down from 40 m on everything (bvh: decks, sidewalks, the ground's own plates): an upward face in the zone's z
    range, not a street -> (x, y, z, 0, yaw, kind name)"""
    from mathutils import Vector
    down = Vector((0, 0, -1)); pts = []
    for k, x, y, yaw, z0, z1 in pl:
        g = ground(x, y)
        if g is None: continue
        h = bvh.ray_cast(Vector((x, y, 60.0)), down, 80.0) if bvh else (None,)
        z = g
        if h[0] is not None and h[0].z > g - 0.5:
            if h[1].z < 0.9: continue                                            # a wall, a roof slope: nobody
            z = h[0].z
        if not (z0 <= z <= z1): continue
        if sbv is not None:
            s = sbv.ray_cast(Vector((x, y, z + 0.5)), down, 1.0)
            if s[0] is not None and abs(s[0].z - z) < 0.3: continue            # the roadway
        pts.append((x, y, z, k, yaw))
    return pts


def scene_bvh(bpy, sc, box):
    """one BVH of what people can stand on: the landmarks and piers (lm.*: Pier 39's deck, the Ferry Building), sidewalks, paths"""
    import bmesh
    from mathutils.bvhtree import BVHTree
    bm = bmesh.new(); dg = bpy.context.evaluated_depsgraph_get(); n = 0
    for o in sc.objects:
        if o.type != 'MESH' or not (o.name.startswith('lm.') or o.name in ('sidewalks', 'paths', 'verges')): continue      # (not the buildings: millions of faces; a figure inside one is hidden)
        me = o.evaluated_get(dg).to_mesh(); me.transform(o.matrix_world); bm.from_mesh(me); o.evaluated_get(dg).to_mesh_clear(); n += 1
    if not n: bm.free(); return None
    t = BVHTree.FromBMesh(bm); bm.free(); return t


# ── the props: market tents, cafe tables and umbrellas, parklets ─────────────────────────────────────────────────────
UMB = [(0.86, 0.84, 0.78), (0.14, 0.30, 0.20), (0.58, 0.12, 0.10), (0.12, 0.16, 0.28), (0.10, 0.10, 0.10), (0.66, 0.36, 0.22)]
TENT = [(0.84, 0.83, 0.80), (0.84, 0.83, 0.80), (0.82, 0.82, 0.80), (0.16, 0.34, 0.24), (0.18, 0.24, 0.40)]
CRATE = [(0.62, 0.14, 0.10), (0.78, 0.46, 0.12), (0.30, 0.46, 0.16), (0.70, 0.62, 0.20), (0.40, 0.22, 0.30)]


def _umbrella(vb, x, y, z, r, col):
    vb.box(x - 0.03, x + 0.03, y - 0.03, y + 0.03, z, z + 2.2, (0.3, 0.3, 0.3, 1), 0)
    n = 8; ring = [(x + r * math.cos(2 * math.pi * i / n), y + r * math.sin(2 * math.pi * i / n), z + 2.05) for i in range(n)]; ap = (x, y, z + 2.45)
    for i in range(n): vb.face([ring[i], ring[(i + 1) % n], ap], (*col, 1), 0)


def _table(vb, x, y, z, rr, chairs=True):
    tc = rr.choice(((0.18, 0.18, 0.19), (0.42, 0.32, 0.22), (0.62, 0.62, 0.60)))
    vb.box(x - 0.35, x + 0.35, y - 0.35, y + 0.35, z + 0.70, z + 0.74, (*tc, 1), 0); vb.box(x - 0.04, x + 0.04, y - 0.04, y + 0.04, z, z + 0.70, (*tc, 1), 0)
    if chairs:
        for dx, dy in ((0.62, 0), (-0.62, 0)):
            vb.box(x + dx - 0.2, x + dx + 0.2, y + dy - 0.2, y + dy + 0.2, z + 0.42, z + 0.46, (*tc, 1), 0)
            vb.box(x + dx + (0.18 if dx > 0 else -0.22), x + dx + (0.22 if dx > 0 else -0.18), y - 0.2, y + 0.2, z + 0.46, z + 0.85, (*tc, 1), 0)


def props(bpy, sc, T, ground, sbv, bvh, inb, log):
    """the tents, tables, umbrellas and parklets in the region: one object"""
    from life_boats import VB
    import transit_geom as TG
    from mathutils import Vector
    vb = VB(); down = Vector((0, 0, -1)); nt = nu = npk = nm = 0
    def zat(x, y):
        g = ground(x, y)
        if g is None: return None
        h = bvh.ray_cast(Vector((x, y, g + 8.0)), down, 12.0) if bvh else (None,)
        return h[0].z if (h[0] is not None and h[1].z > 0.9 and h[0].z < g + 3.0) else g
    # the farmers market along the Ferry Building's front (both sides of the clock-tower entrance)
    a, b, (nx, ny) = FERRY_A, FERRY_B, FERRY_N
    L = math.hypot(b[0] - a[0], b[1] - a[1]); ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L; rr = random.Random(1906)
    if inb((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, L / 2 + 30):
        u = 18.0
        while u < L - 18.0:
            if abs(u - L / 2) > 14.0:
                cx, cy = a[0] + ux * u + nx * 10.0, a[1] + uy * u + ny * 10.0; z = zat(cx, cy)
                if z is not None:
                    col = (*rr.choice(TENT), 1); h0, h1 = 2.5, 3.0
                    C = [(cx + ux * du + nx * dv, cy + uy * du + ny * dv) for du, dv in ((-1.5, -1.5), (1.5, -1.5), (1.5, 1.5), (-1.5, 1.5))]
                    for i in range(4): vb.face([(*C[i], z + h0), (*C[(i + 1) % 4], z + h0), (cx, cy, z + h1)], col, 0)
                    for (px, py) in C: vb.box(px - 0.03, px + 0.03, py - 0.03, py + 0.03, z, z + h0, (0.5, 0.5, 0.5, 1), 0)
                    for k in range(3):                                           # the stall's crates at its front
                        qx, qy = cx + ux * (k - 1) * 0.9 - nx * 1.2, cy + uy * (k - 1) * 0.9 - ny * 1.2
                        vb.box(qx - 0.4, qx + 0.4, qy - 0.3, qy + 0.3, z + 0.5, z + 0.8, (*rr.choice(CRATE), 1), 0)
                    nm += 1
            u += 3.4
    # cafe tables and parklets (DataSF): the kerb nearest the address, the tables on the sidewalk, a parklet in the parking lane
    try: S = json.load(open(os.path.join(HERE, 'sidewalk_today.json')))
    except Exception: S = {'tables': [], 'parklets': []}
    for kind, P in (('t', S['tables']), ('p', S['parklets'])):
        for x, y, _ in P:
            if not inb(x, y, 30) or sbv is None: continue
            g = ground(x, y)
            if g is None: continue
            q = sbv.find_nearest(Vector((x, y, g)))
            if q[0] is None or not (2.0 < q[3] < 30.0): continue
            qx, qy = q[0].x, q[0].y; d = math.hypot(x - qx, y - qy); dx, dy = (x - qx) / d, (y - qy) / d; tx, ty = -dy, dx
            rr = random.Random(int(x * 10) * 7 + int(y * 10))
            if kind == 't':
                n = rr.randint(2, 4); umb = rr.random() < 0.45; ucol = rr.choice(UMB)
                for i in range(n):
                    px, py = qx + dx * 1.5 + tx * (i - (n - 1) / 2) * 1.7, qy + dy * 1.5 + ty * (i - (n - 1) / 2) * 1.7; z = zat(px, py)
                    if z is None: continue
                    _table(vb, px, py, z, rr); nt += 1
                    if umb: _umbrella(vb, px, py, z, 1.1, ucol); nu += 1
            else:
                cx, cy = qx - dx * 1.2, qy - dy * 1.2; z = ground(cx, cy)
                if z is None: continue
                z += 0.12; Lp = rr.choice((6.0, 8.0, 12.0)); dk = (*rr.choice(((0.52, 0.40, 0.28), (0.44, 0.36, 0.28))), 1)
                C = [(cx + tx * du + dx * dv, cy + ty * du + dy * dv) for du, dv in ((-Lp / 2, -1.0), (Lp / 2, -1.0), (Lp / 2, 1.0), (-Lp / 2, 1.0))]
                vb.face([(p[0], p[1], z + 0.15) for p in C], dk, 0)
                for i in range(4): vb.face([(*C[i], z - 0.1), (*C[(i + 1) % 4], z - 0.1), (*C[(i + 1) % 4], z + 0.15), (*C[i], z + 0.15)], (0.25, 0.22, 0.2, 1), 0)
                for s in (-1, 1):                                                # planters with shrubs at both ends, a rail on the street side
                    px, py = cx + tx * s * (Lp / 2 - 0.5), cy + ty * s * (Lp / 2 - 0.5)
                    vb.box(px - 0.4, px + 0.4, py - 0.9, py + 0.9, z + 0.15, z + 0.75, (0.30, 0.28, 0.25, 1), 0)
                    vb.box(px - 0.35, px + 0.35, py - 0.8, py + 0.8, z + 0.75, z + 1.25, (0.20, 0.32, 0.12, 1), 0)
                rx, ry = cx - dx * 0.95, cy - dy * 0.95
                vb.box(min(rx - tx * Lp / 2, rx + tx * Lp / 2), max(rx - tx * Lp / 2, rx + tx * Lp / 2) + 0.05, min(ry - ty * Lp / 2, ry + ty * Lp / 2), max(ry - ty * Lp / 2, ry + ty * Lp / 2) + 0.05, z + 1.0, z + 1.08, (0.2, 0.2, 0.2, 1), 0)
                for i in range(int(Lp // 2.5)):
                    px, py = cx + tx * (i - (Lp // 2.5 - 1) / 2) * 2.2, cy + ty * (i - (Lp // 2.5 - 1) / 2) * 2.2
                    _table(vb, px, py, z + 0.15, rr, chairs=True)
                    if rr.random() < 0.5: _umbrella(vb, px, py, z + 0.15, 1.0, rr.choice(UMB))
                npk += 1
    if not vb.F: return 0
    me = TG.mesh_multi(bpy, 'urban.props', vb.V, vb.F, vb.C, vb.MI, [T['matte']])
    o = bpy.data.objects.new('urban.props', me); sc.collection.objects.link(o)
    log(f'urban_people: market tents {nm}, cafe tables {nt} (umbrellas {nu}), parklets {npk}')
    return 1
