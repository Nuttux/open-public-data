"""People at about 5 pm (life_hq.py): on Mission Dolores Park's lawn, along the
Embarcadero's promenade and Crissy Field's, on Ocean Beach and East Beach, a
few surfers off Ocean Beach.

At 37 cm a pixel a person is a pixel wide and, at the camera's 29 degrees,
five pixels tall, with a shadow three times that on the ground (the sun at
24 degrees): a tick and its streak, which is how people read in an aerial
photograph at golden hour. Groups on the lawn (1-8 together, most sitting),
walkers, joggers and cyclists along the promenades, walkers near the water on
the beaches. A convention of a warm weekday evening, never a count.
Places: OpenStreetMap (ODbL, (c) OpenStreetMap contributors), life.json people.
"""
import math, random
import numpy as np

# (zone, count): a warm late-September weekday evening
N_PARK, N_BEACH_OB, N_BEACH_EB, N_SURF = 450, 90, 40, 12
WALK_SPACING = {'Herb Caen Way': 9.0, 'Golden Gate Promenade': 16.0}
SKIN = [(0.62, 0.42, 0.30), (0.45, 0.28, 0.18), (0.25, 0.15, 0.10), (0.70, 0.52, 0.40), (0.55, 0.38, 0.26)]


def _inside(x, y, r):
    ins = False
    for i in range(len(r)):
        (x1, y1), (x2, y2) = r[i], r[(i + 1) % len(r)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1: ins = not ins
    return ins


def _protos():
    """name -> VB (life_boats.VB): x forward, z up; material 0 the clothes
    (a colour per person), 1 skin/board (bcol)"""
    from life_boats import VB, srgb
    out = {}
    def person(sit=False, sk=0):
        vb = VB(); s = SKIN[sk]; skin = (*s, 1.0)
        if sit:
            vb.box(-0.25, 0.25, -0.22, 0.22, 0.0, 0.18, (0.2, 0.2, 0.2, 1), 0)      # legs out on the grass
            vb.box(-0.2, 0.1, -0.2, 0.2, 0.18, 0.75, (0.2, 0.2, 0.2, 1), 0)         # the body
            vb.box(-0.1, 0.1, -0.1, 0.1, 0.75, 0.97, skin, 1)
        else:
            vb.box(-0.13, 0.13, -0.2, 0.2, 0.0, 1.45, (0.2, 0.2, 0.2, 1), 0)
            vb.box(-0.1, 0.1, -0.1, 0.1, 1.45, 1.72, skin, 1)
        return vb
    for k in range(len(SKIN)):
        out[f'stand{k}'] = person(False, k); out[f'sit{k}'] = person(True, k)
    vb = VB()                                                          # a cyclist
    vb.box(-0.85, 0.85, -0.05, 0.05, 0.3, 0.7, (0.1, 0.1, 0.1, 1), 1)
    vb.box(-0.2, 0.15, -0.18, 0.18, 0.7, 1.45, (0.2, 0.2, 0.2, 1), 0)
    vb.box(-0.05, 0.13, -0.1, 0.1, 1.45, 1.66, (*SKIN[0], 1.0), 1)
    out['bike'] = vb
    vb = VB()                                                          # a surfer on the board, waiting
    vb.box(-1.0, 1.0, -0.26, 0.26, -0.05, 0.08, (0.85, 0.85, 0.82, 1), 1)
    vb.box(-0.4, 0.1, -0.2, 0.2, 0.08, 0.8, (0.02, 0.02, 0.02, 1), 1)
    out['surf'] = vb
    return out


def plan(D, sea, rr=None):
    """(proto, x, y, yaw, on_water) for everyone, from fixed seeds"""
    P = D.get('people') or {}
    out = []
    # the park: groups on the lawn
    for park in P.get('parks', []):
        r = park['ring']; xs = [p[0] for p in r]; ys = [p[1] for p in r]
        rr = random.Random(1991); n = 0; tries = 0
        while n < N_PARK and tries < 5000:
            tries += 1
            cx, cy = rr.uniform(min(xs), max(xs)), rr.uniform(min(ys), max(ys))
            if not _inside(cx, cy, r): continue
            g = 1 + int(rr.expovariate(1 / 2.2)); g = min(g, 8)
            face = rr.uniform(0, 2 * math.pi)
            for i in range(g):
                a = face + 2 * math.pi * i / g; d = 0.6 + 0.25 * g * rr.random()
                x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
                if not _inside(x, y, r): continue
                kind = 'sit' if rr.random() < 0.72 else 'stand'
                out.append((f'{kind}{rr.randrange(len(SKIN))}', x, y, a + math.pi, False)); n += 1
    # the beaches: walkers, most near the water
    for b in P.get('beaches', []):
        r = b['ring']; xs = [p[0] for p in r]; ys = [p[1] for p in r]
        N = N_BEACH_EB if b['name'] == 'East Beach' else N_BEACH_OB // 2
        rr = random.Random(sum(map(ord, b['name'])) * 31 + len(r)); n = 0; tries = 0
        while n < N and tries < 20000:
            tries += 1
            x, y = rr.uniform(min(xs), max(xs)), rr.uniform(min(ys), max(ys))
            if not _inside(x, y, r) or not sea.dist(x, y) == 0: continue
            # the wet sand draws them: accept by closeness to the water
            near = any(sea.dist(x + dx, y + dy) > 0 for dx, dy in ((12, 0), (-12, 0), (0, 12), (0, -12)))
            if not near and rr.random() < 0.7: continue
            out.append((f'stand{rr.randrange(len(SKIN))}', x, y, rr.uniform(0, 2 * math.pi), False)); n += 1
            if rr.random() < 0.3:          # walking in twos
                out.append((f'stand{rr.randrange(len(SKIN))}', x + 0.7, y + 0.3, rr.uniform(0, 2 * math.pi), False)); n += 1
        # surfers off Ocean Beach, in the water 40-150 m out
        if b['name'] == 'Ocean Beach':
            k = 0; tries = 0
            while k < N_SURF and tries < 5000:
                tries += 1
                x, y = rr.uniform(min(xs) - 200, min(xs)), rr.uniform(min(ys), max(ys))
                d = sea.dist(x, y)
                if not (35 <= d <= 150) and d != -1: continue
                if d == -1: continue
                out.append(('surf', x, y, rr.uniform(0, 2 * math.pi), True)); k += 1
    # the promenades
    for w in P.get('walks', []):
        sp = next((v for k, v in WALK_SPACING.items() if w['name'].startswith(k)), 12.0)
        pts = np.asarray(w['pts'], float)
        if len(pts) < 2: continue
        seg = np.hypot(*np.diff(pts, axis=0).T); s = np.concatenate([[0.0], np.cumsum(seg)])
        rr = random.Random(int(abs(s[-1]) * 10) + len(pts))
        q = rr.uniform(0, sp)
        while q < s[-1]:
            x, y = float(np.interp(q, s, pts[:, 0])), float(np.interp(q, s, pts[:, 1]))
            i = min(len(pts) - 2, int(np.searchsorted(s, q, side='right') - 1))
            tx, ty = pts[i + 1] - pts[i]; tl = math.hypot(tx, ty) or 1.0
            nx, ny = -ty / tl, tx / tl
            off = rr.uniform(-2.0, 2.0)
            yaw = math.atan2(ty, tx) + (math.pi if rr.random() < 0.5 else 0.0)
            kind = 'bike' if (w['name'].startswith('Golden Gate') and rr.random() < 0.25) or rr.random() < 0.06 else f'stand{rr.randrange(len(SKIN))}'
            out.append((kind, x + nx * off, y + ny * off, yaw, False))
            if rr.random() < 0.35: out.append((f'stand{rr.randrange(len(SKIN))}', x + nx * (off + 0.6), y + ny * (off + 0.6), yaw, False))
            q += rr.expovariate(1.0 / sp)
    return out


def cloth_mat(bpy):
    """clothes: a colour per person (the instance's random), mostly dark and
    muted, some bright"""
    m = bpy.data.materials.new('lf_cloth'); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
    p.inputs['Roughness'].default_value = 0.85
    # the person's own number, drawn from the place (life_traffic.place_random)
    oi = nt.nodes.new('ShaderNodeAttribute'); oi.attribute_type = 'INSTANCER'; oi.attribute_name = 'crand'
    rp = nt.nodes.new('ShaderNodeValToRGB'); rp.color_ramp.interpolation = 'CONSTANT'
    cols = [(0.02, 0.02, 0.025), (0.03, 0.04, 0.08), (0.12, 0.12, 0.12), (0.60, 0.60, 0.58), (0.35, 0.05, 0.04), (0.05, 0.12, 0.35),
            (0.30, 0.25, 0.15), (0.06, 0.15, 0.06), (0.70, 0.45, 0.05), (0.02, 0.02, 0.025)]
    for i, c in enumerate(cols):
        e = rp.color_ramp.elements[0] if i == 0 else rp.color_ramp.elements.new(i / len(cols))
        e.position = i / len(cols); e.color = (*c, 1.0)
    while len(rp.color_ramp.elements) > len(cols): rp.color_ramp.elements.remove(rp.color_ramp.elements[-1])
    nt.links.new(oi.outputs['Fac'], rp.inputs[0]); nt.links.new(rp.outputs[0], p.inputs['Base Color'])
    return m


def build(bpy, sc, coll, T, D, ground, sea, inb, log, t0, only_hot=False):
    import time
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    import transit_geom as TG
    from life_traffic import _instancer
    pl = [] if only_hot else [p for p in plan(D, sea) if inb(p[1], p[2], 30)]
    import os as _os
    HOT_ = _os.environ.get('HOT', '1') == '1'; PV2_ = _os.environ.get('PEOPLE_V2', '1') == '1'     # (27/09, assets_urban) urban_people.py
    if HOT_:
        import urban_people as UP
        hot_ = UP.plan_hot(inb)
    else: hot_ = []
    if not pl and not hot_: return 0
    # the surface: the paving where there is some (sidewalks, paths, streets), else the ground
    dg = bpy.context.evaluated_depsgraph_get(); bvs = []
    for nm in ('sidewalks', 'paths', 'streets'):
        o = sc.objects.get(nm)
        if o is not None and o.type == 'MESH' and len(o.data.polygons): bvs.append(BVHTree.FromObject(o, dg))
    down = Vector((0, 0, -1))
    so = sc.objects.get('streets'); sbv = BVHTree.FromObject(so, dg) if so is not None and len(so.data.polygons) else None
    pts = []; kinds = sorted({p[0] for p in pl} | {h_[0] for h_ in hot_})
    for k, x, y, yaw, wet in pl:
        if wet: z = sea.z(x, y)
        else:
            g = ground(x, y)
            if g is None: continue
            # nobody standing in the roadway (a park's lawn is crossed by streets)
            if sbv is not None and sbv.ray_cast(Vector((x, y, g + 3.0)), down, 4.0)[0] is not None: continue
            z = g
            for bv in bvs:
                h = bv.ray_cast(Vector((x, y, g + 3.0)), down, 4.0)
                if h[0] is not None and h[0].z > z: z = h[0].z
        pts.append((x, y, z, 0.0, yaw, kinds.index(k)))
    if HOT_:
        hbv_ = UP.scene_bvh(bpy, sc, None)
        for (x_, y_, z_, k_, yaw_) in UP.place(hot_, ground, hbv_, sbv, log): pts.append((x_, y_, z_, 0.0, yaw_, kinds.index(k_)))
        try: UP.props(bpy, sc, T, ground, sbv, hbv_, inb, log)
        except Exception as ex_: log('urban_people props failed', repr(ex_)[:200])
        log(f'urban_people: {len(hot_)} planned in the hot zones')
    cm = cloth_mat(bpy)
    protos = _protos(); colls = []
    if PV2_: protos = (UP if HOT_ else __import__('urban_people')).protos(protos)
    for k in kinds:
        vb = protos[k]
        me = TG.mesh_multi(bpy, f'lp_{k}', vb.V, vb.F, vb.C, vb.MI, [cm, T['matte']])
        c = bpy.data.collections.new(f'lp_{k}'); o = bpy.data.objects.new(f'lp_{k}', me); c.objects.link(o); colls.append(c)
    _instancer_kind(bpy, coll, 'life.people', pts, colls)
    log(f'life_people: {len(pts)} people in the region ({time.time() - t0:.1f}s)')
    return len(pts)


def _instancer_kind(bpy, coll, name, pts, protos):
    """life_traffic._instancer, the proto per point given, the clothes' colour from the place"""
    import life_traffic
    life_traffic._instancer(bpy, coll, name, [p[:5] for p in pts], protos, [p[5] for p in pts],
                            [life_traffic.hp(p[0], p[1], 21) for p in pts])
