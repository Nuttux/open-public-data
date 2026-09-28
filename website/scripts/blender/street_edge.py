"""street_edge.py — SE_APRON=1 (street_edge agent, 28/09): the kerb brought in where the walls need a sidewalk.

se_prep.py writes the aprons (convex polygons, world metres): the strip of the published roadway that lies within the
street's sidewalk width of the walls along it. Here each asphalt triangle is cut exactly by them (convex clipping, the
height interpolated on the triangle's own plane): the pieces outside stay asphalt, the pieces inside become sidewalk.
The street mesh built from the result then has its boundary — the kerb that hq_city's sidewalk band (15 cm step),
gutter pan and kerb cars follow — on the new line, straight and parallel to the published one."""
import os, json, array, math

HERE = os.path.dirname(os.path.abspath(__file__))
CELL = 16.0

def load(box=None, path=''):
    """the aprons inside box (x0, y0, x1, y1, world m), each (flat [(x, y), ...] CCW, bbox)"""
    path = path or os.path.join(HERE, 'se_aprons.json')
    out = []
    for q in json.load(open(path))['quads']:
        P = [(q[i], q[i + 1]) for i in range(0, len(q), 2)]
        xs = [p[0] for p in P]; ys = [p[1] for p in P]
        bb = (min(xs), min(ys), max(xs), max(ys))
        if box is not None and (bb[2] < box[0] or bb[0] > box[2] or bb[3] < box[1] or bb[1] > box[3]): continue
        out.append((P, bb))
    return out

def _cross(p, q, v): return (q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0])

def _clip(poly, p, q, inside):
    """the part of the convex polygon poly (3D vertices) on one side of the line p->q (inside = its left)"""
    out = []; n = len(poly)
    d = [_cross(p, q, v) * (1 if inside else -1) for v in poly]
    for i in range(n):
        A, B = poly[i], poly[(i + 1) % n]; da, db = d[i], d[(i + 1) % n]
        if da >= 0: out.append(A)
        if (da >= 0) != (db >= 0):
            t = da / (da - db); out.append(tuple(A[k] + (B[k] - A[k]) * t for k in range(3)))
    return out if len(out) >= 3 else []

def _area(P): return abs(sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))) / 2

def _subtract(T, Q):
    """convex T minus convex Q: (the convex pieces outside Q, the piece inside Q or [])"""
    outs = []; rem = T
    for i in range(len(Q)):
        p, q = Q[i], Q[(i + 1) % len(Q)]
        o = _clip(rem, p, q, False)
        if o and _area(o) > 1e-4: outs.append(o)
        rem = _clip(rem, p, q, True)
        if not rem: return outs, []
    return outs, (rem if _area(rem) > 1e-4 else [])

def _fan(P, arr, dz=0.0):
    for i in range(1, len(P) - 1):
        for v in (P[0], P[i], P[i + 1]): arr.extend((v[0], v[1], v[2] + dz))

def cut(SP, aprons, log=print):
    """SP: flat asphalt triangles (x, y, z) * 3. Returns (the asphalt left, the apron pieces as sidewalk triangles on
    the street's own surface; the caller lifts them to the kerb's height)"""
    G = {}
    for k, (P, bb) in enumerate(aprons):
        for i in range(int(math.floor(bb[0] / CELL)), int(math.floor(bb[2] / CELL)) + 1):
            for j in range(int(math.floor(bb[1] / CELL)), int(math.floor(bb[3] / CELL)) + 1): G.setdefault((i, j), []).append(k)
    keep, side = array.array('f'), array.array('f'); ncut = 0
    for t in range(len(SP) // 9):
        a = t * 9; T = [(SP[a + k * 3], SP[a + k * 3 + 1], SP[a + k * 3 + 2]) for k in range(3)]
        x0 = min(v[0] for v in T); x1 = max(v[0] for v in T); y0 = min(v[1] for v in T); y1 = max(v[1] for v in T)
        cand = set()
        for i in range(int(math.floor(x0 / CELL)), int(math.floor(x1 / CELL)) + 1):
            for j in range(int(math.floor(y0 / CELL)), int(math.floor(y1 / CELL)) + 1): cand.update(G.get((i, j), ()))
        cand = [k for k in cand if not (aprons[k][1][2] < x0 or aprons[k][1][0] > x1 or aprons[k][1][3] < y0 or aprons[k][1][1] > y1)]
        if not cand: keep.extend(SP[a:a + 9]); continue
        pieces = [T]; hit = False
        for k in cand:
            nxt = []
            for P in pieces:
                o, ins = _subtract(P, aprons[k][0])
                if ins: hit = True; _fan(ins, side)
                nxt.extend(o)
            pieces = nxt
            if not pieces: break
        if not hit: keep.extend(SP[a:a + 9]); continue
        ncut += 1
        for P in pieces: _fan(P, keep)
    log(f'street_edge: {len(aprons)} aprons cut {ncut} asphalt triangles: {len(SP) // 9} -> {len(keep) // 9} asphalt, '
        f'{len(side) // 9} sidewalk triangles')
    return keep, side
