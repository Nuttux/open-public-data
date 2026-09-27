"""TODAY'S SURFACE PARKING LOTS (27/09, assets_urban; LOTS_V2=1 default, LOTS_V2=0 = before).

Before: an OSM surface lot was the NAIP ground class 'asphalt' under a photo tone of 60 cm: a brown, blotchy
plate with ghost cars and no stall lines (the tone carried them, blurred). Now each lot (lots_today.json:
OSM amenity=parking + parking=surface, Overpass 2026-09-24, ODbL; tools/lots_export.py) is:
  - a paved plate draped on the terrain (era.lots_mesh, the vacant lots' own code: worn asphalt);
  - its stalls: rows along the lot's longest side, 2.7 x 5.5 m, an edge row, then back-to-back pairs, 7 m
    aisles (CONVENTION: the common American layout; the real stripes are not in any open dataset);
  - painted stall lines (white, a yellow lot now and then), a concrete wheel stop at the head of each stall;
  - parked cars on ~75 % of the stalls (weekday midday; CONVENTION), nose in (1 in 6 backed in), each stall its
    own fixed draw, the city's own car kit (hq_city car_pick / instancer: the colours and models of the kerb).
Nothing moves elsewhere: it only adds objects inside the lots.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
SW, SD, AISLE, EDGE = 2.7, 5.5, 7.0, 0.9          # stall width, depth, aisle, margin from the lot edge (m)


def _h(x, y, k):
    v = math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453
    return v - math.floor(v)


def _in(x, y, r):
    k = False; n = len(r)
    for i in range(n):
        (x1, y1), (x2, y2) = r[i], r[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): k = not k
    return k


def load(box=None):
    p = os.path.join(HERE, 'lots_today.json')
    if not os.path.exists(p): return []
    out = []
    for oid, r in json.load(open(p))['lots']:
        xs = [q[0] for q in r]; ys = [q[1] for q in r]
        if box and (max(xs) < box[0] or min(xs) > box[2] or max(ys) < box[1] or min(ys) > box[3]): continue
        out.append(dict(ring=[tuple(q) for q in r], kind='paved', cars=[], gid=-int(oid), osm=oid))
    return out


def layout(r, occ=0.75):
    """stalls of a lot ring -> (stalls [(cx, cy, ux, uy, hx, hy)], cars [(x, y, heading, u)]); u = along the rows,
    h = the unit vector toward the stall's head (where the wheel stop is)"""
    n = len(r); best, bl = 0, -1.0
    for i in range(n):
        a, b = r[i], r[(i + 1) % n]; L = math.hypot(b[0] - a[0], b[1] - a[1])
        if L > bl: best, bl = i, L
    a, b = r[best], r[(best + 1) % n]
    ux, uy = (b[0] - a[0]) / bl, (b[1] - a[1]) / bl; vx, vy = -uy, ux
    us = [(p[0] - a[0]) * ux + (p[1] - a[1]) * uy for p in r]; vs = [(p[0] - a[0]) * vx + (p[1] - a[1]) * vy for p in r]
    if abs(min(vs)) > abs(max(vs)): vx, vy = -vx, -vy; vs = [-v for v in vs]
    rows = []; v = min(vs) + EDGE; first = True
    while v + SD <= max(vs) - EDGE:
        if first: rows.append((v, -1)); v += SD + AISLE; first = False; continue
        rows.append((v, 1))                                              # a back-to-back pair: heads meet in the middle
        if v + 2 * SD <= max(vs) - EDGE: rows.append((v + SD, -1)); v += 2 * SD + AISLE
        else: v += SD + AISLE
    stalls, cars = [], []
    for v0, hd in rows:
        u = min(us) + EDGE
        while u + SW <= max(us) - EDGE:
            cu, cv = u + SW / 2, v0 + SD / 2
            P = [(a[0] + ux * (cu + du) + vx * (cv + dv), a[1] + uy * (cu + du) + vy * (cv + dv)) for du in (-SW / 2, SW / 2) for dv in (-SD / 2, SD / 2)]
            if all(_in(x, y, r) for x, y in P):
                x, y = a[0] + ux * cu + vx * cv, a[1] + uy * cu + vy * cv
                hx, hy = vx * hd, vy * hd; stalls.append((x, y, ux, uy, hx, hy))
                if _h(x, y, 41) < occ:
                    nose = 1.0 if _h(x, y, 42) > 0.16 else -1.0
                    cars.append((x - hx * 0.25 * nose, y - hy * 0.25 * nose, math.atan2(hy * nose, hx * nose), _h(x, y, 24)))
            u += SW
    return stalls, cars


def marks(bpy, lots, ground, mats, log=print, lift=0.14):
    """the stall lines and wheel stops of every lot, draped on the terrain (one object each)"""
    L_V, L_F, L_C, S_V, S_F = [], [], [], [], []
    def quad(V, F, pts, z_off):
        zs = [ground(x, y) for x, y in pts]
        if any(z is None for z in zs): return False
        k = len(V); V.extend((x, y, z + lift + z_off) for (x, y), z in zip(pts, zs)); F.append((k, k + 1, k + 2, k + 3)); return True
    ns = 0
    for L in lots:
        yel = _h(L['ring'][0][0], L['ring'][0][1], 7) < 0.2
        seen = set()
        for (x, y, ux, uy, hx, hy) in L['stalls']:
            ns += 1
            for s in (-1, 1):                                     # the two side lines (a shared one drawn once)
                lx, ly = x + ux * s * SW / 2, y + uy * s * SW / 2; key = (round(lx, 1), round(ly, 1))
                if key in seen: continue
                seen.add(key); w = 0.05
                # the line runs from the head to 0.3 m short of the aisle
                P = [(lx - ux * w + hx * SD / 2, ly - uy * w + hy * SD / 2), (lx + ux * w + hx * SD / 2, ly + uy * w + hy * SD / 2),
                     (lx + ux * w - hx * (SD / 2 - 0.3), ly + uy * w - hy * (SD / 2 - 0.3)), (lx - ux * w - hx * (SD / 2 - 0.3), ly - uy * w - hy * (SD / 2 - 0.3))]
                if quad(L_V, L_F, P, 0.012): L_C.append(yel)
            # the wheel stop: 1.8 x 0.16 m, 0.12 high, 0.75 m in from the head
            sx, sy = x + hx * (SD / 2 - 0.75), y + hy * (SD / 2 - 0.75)
            z = ground(sx, sy)
            if z is None: continue
            z += lift; k = len(S_V)
            for du, dv, dz in ((-0.9, -0.08, 0), (0.9, -0.08, 0), (0.9, 0.08, 0), (-0.9, 0.08, 0), (-0.9, -0.08, 0.12), (0.9, -0.08, 0.12), (0.9, 0.08, 0.12), (-0.9, 0.08, 0.12)):
                S_V.append((sx + ux * du + hx * dv, sy + uy * du + hy * dv, z + dz))
            S_F.extend([(k, k + 3, k + 2, k + 1), (k + 4, k + 5, k + 6, k + 7), (k, k + 1, k + 5, k + 4), (k + 1, k + 2, k + 6, k + 5), (k + 2, k + 3, k + 7, k + 6), (k + 3, k, k + 4, k + 7)])
    for name, V, F, m in (('lot_lines', L_V, L_F, mats['line']), ('lot_stops', S_V, S_F, mats['stop'])):
        if not F: continue
        me = bpy.data.meshes.new(name); me.from_pydata(V, [], F); me.update()
        if name == 'lot_lines':
            me.materials.append(m); me.materials.append(mats['line_y'])
            for f, y in zip(me.polygons, L_C):
                f.material_index = 1 if y else 0
                if f.normal.z < 0: f.flip()
        else: me.materials.append(m)
        ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    log('LOTS_V2: stalls', ns, 'lines', len(L_F), 'stops', len(S_F) // 6)
