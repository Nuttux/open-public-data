"""quay_wall.py (04/10 B2b, the Vancouver pilot's fix 5): a city's SEAWALL as geometry - a vertical concrete face along its
coastline from below the water to the promenade, with a coping on top. Vancouver's shore inside the city limits is a seawall
almost all the way round (downtown, Coal Harbour, Stanley Park, False Creek); van_vp1 drew it as a torn-paper edge with a grey
lip. hq_city calls build() when QUAY_WALL=1 (city.json env); unset (SF) = never imported.

The line: landmarks/coast_land.npz (coast_land_city.py: the render's own sea, blurred) at signed distance 0, smoothed;
kept inside the city limits (city.json block.limits) and off the beaches (land-cover sand within 12 m inland).
Height: the ground 3 m inland (the promenade) + QW_UP (0.25 m), down to QW_DOWN (-1.5 m) under the water."""
import os, json, math
import numpy as np

def _line(cl, box, pad=200.0):
    import cv2
    z = np.load(cl); land = np.unpackbits(z['land'], axis=1)[:, :int(z['nx'])].astype(np.uint8)
    res, x0, y1 = float(z['res']), float(z['x0']), float(z['y1'])
    c0, c1 = int((box[0] - pad - x0) / res), int((box[2] + pad - x0) / res) + 1
    r0, r1 = int((y1 - box[3] - pad) / res), int((y1 - box[1] + pad) / res) + 1
    c0, r0 = max(c0, 1), max(r0, 1); c1, r1 = min(c1, land.shape[1] - 1), min(r1, land.shape[0] - 1)
    if c1 <= c0 or r1 <= r0: return []
    sub = land[r0:r1, c0:c1]
    cs, _ = cv2.findContours(sub, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in cs:
        if len(c) < 8: continue
        p = c[:, 0, :].astype(np.float64)
        for _ in range(3):   # smooth the 4 m staircase (closed ring, a running mean)
            p = (np.roll(p, 1, 0) + 2 * p + np.roll(p, -1, 0)) / 4
        out.append(np.c_[x0 + (p[:, 0] + c0 + 0.5) * res, y1 - (p[:, 1] + r0 + 0.5) * res])
    return out

def build(bpy, sc, M, ground, box, cityconf, log=print):
    from shapely.geometry import shape, Point
    from shapely.prepared import prep
    C = cityconf
    cl = C.work('landmarks', 'coast_land.npz')
    if not os.path.exists(cl): log('quay_wall: no coast_land.npz'); return 0
    lim = (C.CFG.get('block') or {}).get('limits')
    from shapely.ops import transform
    L = prep(transform(lambda lo, la, z=None: C.proj(lo, la), shape(json.load(open(lim))['geometry'])).buffer(40)) if lim and os.path.exists(lim) else None   # limits: lon/lat
    sand = None
    try:
        gm = json.load(open(C.work('ground', 'ground_meta.json'))); G = np.load(C.work('ground', 'ground_cls.npy'), mmap_mode='r'); si = gm['classes'].index('sand')
        def sand(x, y):
            i, j = int(x - gm['x0']), int(y - gm['y0'])
            if not (0 <= j < G.shape[0] and 0 <= i < G.shape[1]): return False
            return bool((np.asarray(G[max(0, j - 12):j + 13, max(0, i - 12):i + 13]) == si).mean() > 0.15)
    except Exception as ex: log('quay_wall: no sand test', ex)
    up, down, cap = float(os.environ.get('QW_UP', '0.25')), float(os.environ.get('QW_DOWN', '-1.5')), float(os.environ.get('QW_CAP', '0.6'))
    qmax = float(os.environ.get('QW_MAX', '5.0'))
    V, F = [], []; n_seg = n_skip = 0
    for ring in _line(cl, box):
        n = len(ring)
        # resample every ~2.5 m
        d = np.r_[0, np.cumsum(np.hypot(*np.diff(np.r_[ring, ring[:1]], axis=0).T))]
        s = np.arange(0, d[-1], 2.5); R = np.c_[np.interp(s, d, np.r_[ring[:, 0], ring[0, 0]]), np.interp(s, d, np.r_[ring[:, 1], ring[0, 1]])]
        m = len(R)
        if m < 3: continue
        T = np.roll(R, -1, 0) - np.roll(R, 1, 0); T /= np.maximum(np.hypot(T[:, 0], T[:, 1]), 1e-6)[:, None]
        N = np.c_[-T[:, 1], T[:, 0]]
        # which side is land: probe the coast mask through ground() is not possible - test the contour's own orientation per point
        inl = R + N * 3.0; inr = R - N * 3.0
        keep = np.zeros(m, bool); top = np.zeros(m); nin = np.zeros((m, 2))
        for k in range(m):
            x, y = R[k]
            if not (box[0] - 30 <= x <= box[2] + 30 and box[1] - 30 <= y <= box[3] + 30): continue
            if L is not None and not L.contains(Point(x, y)): continue
            ga, gb = ground(*inl[k]), ground(*inr[k])
            ga = -9 if ga is None else ga; gb = -9 if gb is None else gb
            g, nn = (ga, N[k]) if ga >= gb else (gb, -N[k])
            if sand is not None and sand(*(R[k] + nn * 6.0)): n_skip += 1; continue
            keep[k] = True; top[k] = min(max(g, 0.6) + up, qmax); nin[k] = nn   # a bank higher than qmax: the terrain's own slope above the wall
        for k in range(m):
            k2 = (k + 1) % m
            if not (keep[k] and keep[k2]) or np.hypot(*(R[k2] - R[k])) > 6: continue
            a, b = R[k], R[k2]; ia, ib = a + nin[k] * cap, b + nin[k2] * cap
            q = len(V)
            V += [(a[0], a[1], down), (b[0], b[1], down), (b[0], b[1], top[k2]), (a[0], a[1], top[k]),
                  (ia[0], ia[1], top[k] + 0.05), (ib[0], ib[1], top[k2] + 0.05)]
            F += [(q, q + 1, q + 2, q + 3), (q + 3, q + 2, q + 5, q + 4)]
            n_seg += 1
    if not F: log('quay_wall: no seawall in the box'); return 0
    me = bpy.data.meshes.new('quay_wall'); me.from_pydata(V, [], F); me.update()
    ob = bpy.data.objects.new('quay_wall', me); sc.collection.objects.link(ob)
    me.materials.append(M.get('concrete_struct') or M.get('concrete') or M['sidewalk'])
    log(f'quay_wall: {n_seg} segments (~{n_seg * 2.5 / 1000:.1f} km), {n_skip} points on beaches skipped')
    return n_seg
