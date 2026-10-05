"""quay_wall.py (04/10 B2b, the Vancouver pilot's fix 5): a city's SEAWALL as geometry - a vertical concrete face along its
coastline from below the water to the promenade, with a coping on top. Vancouver's shore inside the city limits is a seawall
almost all the way round (downtown, Coal Harbour, Stanley Park, False Creek); van_vp1 drew it as a torn-paper edge with a grey
lip. hq_city calls build() when QUAY_WALL=1 (city.json env); unset (SF) = never imported. numpy only (Blender's python has no PIL, shapely or cv2).

The line: landmarks/coast_land.npz (coast_land_city.py: the render's own sea, blurred), the zero of its signed distance
(marching squares, linear: a smooth line, not the 4 m cells); kept inside the city limits (city.json block.limits, lon/lat)
and off the beaches (land-cover sand within 12 m inland). Height: the ground 3 m inland (the promenade) + QW_UP (0.25 m),
at most QW_MAX (5 m: a higher bank keeps its own slope above), down to QW_DOWN (-1.5 m) under the water."""
import os, json
import numpy as np

def _segments(cl, box, pad=60.0):
    """[(p, q, n_land)] the sd = 0 line inside box + pad, each piece with its unit normal towards the land"""
    z = np.load(cl)
    res, x0, y1 = float(z['res']), float(z['x0']), float(z['y1'])
    SD = z['sd_dm'].astype(np.float32) / 10.0                         # + on land; nodes = cell centres
    c0, c1 = max(int((box[0] - pad - x0) / res), 0), min(int((box[2] + pad - x0) / res) + 1, SD.shape[1] - 1)
    r0, r1 = max(int((y1 - box[3] - pad) / res), 0), min(int((y1 - box[1] + pad) / res) + 1, SD.shape[0] - 1)
    if c1 - c0 < 2 or r1 - r0 < 2: return []
    S = SD[r0:r1 + 1, c0:c1 + 1]
    X = lambda c: x0 + (c0 + c + 0.5) * res; Y = lambda r: y1 - (r0 + r + 0.5) * res
    out = []
    a, b, c, d = S[:-1, :-1], S[:-1, 1:], S[1:, 1:], S[1:, :-1]       # tl, tr, br, bl
    cross = ((a > 0) != (b > 0)) | ((b > 0) != (c > 0)) | ((c > 0) != (d > 0)) | ((d > 0) != (a > 0))
    for r, cc in zip(*np.nonzero(cross)):
        v = [S[r, cc], S[r, cc + 1], S[r + 1, cc + 1], S[r + 1, cc]]
        P = [(cc, r), (cc + 1, r), (cc + 1, r + 1), (cc, r + 1)]
        pts = []
        for k in range(4):
            va, vb = v[k], v[(k + 1) % 4]
            if (va > 0) != (vb > 0):
                t = va / (va - vb); pa, pb = P[k], P[(k + 1) % 4]
                pts.append((X(pa[0] + (pb[0] - pa[0]) * t), Y(pa[1] + (pb[1] - pa[1]) * t)))
        gx = (v[1] + v[2] - v[0] - v[3]) / 2; gy = (v[0] + v[1] - v[2] - v[3]) / 2     # gradient (+x east, +y north): towards land
        gn = float(np.hypot(gx, gy))
        if gn < 1e-6: continue
        n = (float(gx) / gn, float(gy) / gn)
        for k in range(0, len(pts) - 1, 2): out.append((pts[k], pts[k + 1], n))
    return out

def build(bpy, sc, M, ground, box, cityconf, log=print):
    C = cityconf
    cl = C.work('landmarks', 'coast_land.npz')
    if not os.path.exists(cl): log('quay_wall: no coast_land.npz'); return 0
    segs = _segments(cl, box)
    if not segs: log('quay_wall: no coastline in the box'); return 0
    # the city limits (lon/lat -> world), grown 40 m (the wall stands at the limit's water edge): even-odd test + edge distance
    lim = (C.CFG.get('block') or {}).get('limits'); inside = lambda x, y: True
    if lim and os.path.exists(lim):
        g = json.load(open(lim))['geometry']; polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
        E_ = []
        for poly in polys:
            for ring in poly:
                P_ = np.array([C.proj(lo, la) for lo, la in ring], np.float64)
                E_.append(np.c_[P_, np.roll(P_, -1, 0)])
        E_ = np.concatenate(E_); ax, ay, bx, by = E_.T
        def inside(x, y):
            c = ((ay > y) != (by > y)) & (x < (bx - ax) * (y - ay) / np.where(by == ay, 1e-12, by - ay) + ax)
            if c.sum() % 2: return True
            dx, dy = bx - ax, by - ay; t = np.clip(((x - ax) * dx + (y - ay) * dy) / np.maximum(dx * dx + dy * dy, 1e-12), 0, 1)
            return bool((np.hypot(ax + t * dx - x, ay + t * dy - y) < 40.0).any())
    sand = None
    try:
        gm = json.load(open(C.work('ground', 'ground_meta.json'))); G = np.load(C.work('ground', 'ground_cls.npy'), mmap_mode='r'); si = gm['classes'].index('sand')
        def sand(x, y):
            i, j = int(x - gm['x0']), int(y - gm['y0'])
            if not (12 <= j < G.shape[0] - 12 and 12 <= i < G.shape[1] - 12): return False
            return bool((np.asarray(G[j - 12:j + 13, i - 12:i + 13]) == si).mean() > 0.15)
    except Exception as ex: log('quay_wall: no sand test', ex)
    up, down, cap = float(os.environ.get('QW_UP', '0.25')), float(os.environ.get('QW_DOWN', '-1.5')), float(os.environ.get('QW_CAP', '0.6'))
    qmax = float(os.environ.get('QW_MAX', '5.0'))
    def top(x, y, n):
        g = ground(x + n[0] * 3.0, y + n[1] * 3.0)
        return min(max(g if g is not None else 0.6, 0.6) + up, qmax)
    V, F = [], []; n_seg = n_skip = 0
    for p, q, n in segs:
        mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
        if not (box[0] - 30 <= mx <= box[2] + 30 and box[1] - 30 <= my <= box[3] + 30): continue
        if not inside(mx, my): continue
        if sand is not None and sand(mx + n[0] * 6.0, my + n[1] * 6.0): n_skip += 1; continue
        ta, tb = top(p[0], p[1], n), top(q[0], q[1], n)
        ia, ib = (p[0] + n[0] * cap, p[1] + n[1] * cap), (q[0] + n[0] * cap, q[1] + n[1] * cap)
        k = len(V)
        V += [(p[0], p[1], down), (q[0], q[1], down), (q[0], q[1], tb), (p[0], p[1], ta), (ia[0], ia[1], ta + 0.05), (ib[0], ib[1], tb + 0.05)]
        if (q[0] - p[0]) * n[1] - (q[1] - p[1]) * n[0] > 0: F += [(k, k + 1, k + 2, k + 3), (k + 3, k + 2, k + 5, k + 4)]   # face out to the water
        else: F += [(k + 1, k, k + 3, k + 2), (k + 2, k + 3, k + 4, k + 5)]
        n_seg += 1
    if not F: log(f'quay_wall: no seawall in the box ({n_skip} beach pieces)'); return 0
    me = bpy.data.meshes.new('quay_wall'); me.from_pydata(V, [], F); me.update()
    ob = bpy.data.objects.new('quay_wall', me); sc.collection.objects.link(ob)
    me.materials.append(M.get('concrete_struct') or M.get('concrete') or M['sidewalk'])
    log(f'quay_wall: {n_seg} pieces, {n_skip} on beaches skipped')
    return n_seg
