"""quay_wall.py (04/10 B2b, the Vancouver pilot's fix 5): a city's SEAWALL as geometry - a vertical concrete face along its
coastline from below the water to the promenade, with a coping on top. Vancouver's shore inside the city limits is a seawall
almost all the way round (downtown, Coal Harbour, Stanley Park, False Creek); van_vp1 drew it as a torn-paper edge with a grey
lip. hq_city calls build() when QUAY_WALL=1 (city.json env); unset (SF) = never imported. numpy only (Blender's python has no PIL, shapely or cv2).

The line: landmarks/coast_land.npz (coast_land_city.py: the render's own sea, blurred), the zero of its signed distance
(marching squares, linear: a smooth line, not the 4 m cells); kept inside the city limits (city.json block.limits, lon/lat)
and off the beaches (land-cover sand within 12 m inland). Height: the ground 3 m inland (the promenade) + QW_UP (0.25 m),
at most QW_MAX (5 m: a higher bank keeps its own slope above), down to QW_DOWN (-1.5 m) under the water.

(V-VEG 05/10) QW_LINE=osm: the wall stands on the OSM coastline (veg/shore_pnw.npz, ground_city.py: natural=coastline,
land on its left), off the segments OSM beaches touch, instead of on coast_land's line, which runs a median 11 m (p75 24 m,
p95 68 m) seaward of it: van_vp1b drew that strip of the HRDEM's shore as a wide pale band in front of the seawall.
QW_SINK=1: seaward of the OSM coastline the terrain's vertices go under the sea sheet (a wall: to QW_SINK_Z,
-0.4 m; a beach: on a 4 cm/m shelf from 0.10 m at the line), and where the render's sea sheet is cut away there
(coast_land says land) a water surface ('ocean', the sea's own material without its land cut) covers the strip.
QW_BLVD=1 (the boulevards; here because build() is the city's last ground-edge hook in hq_city): Vancouver's street mesh
is the whole right of way, so its boulevards (the grass strip between kerb and sidewalk on nearly every street) and its
sidewalks rendered as asphalt. Where ground_city.py's class map (veg/ground_pnw.npy) says lawn or sidewalk concrete and
the 'streets' mesh is the surface, a 1 m cell of the terrain's own material (it paints the class map: the lawn, the pale
sidewalk) is laid 3 cm over the asphalt ('ground_blvd').
Unset (default) = the B2b behaviour above."""
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

def _shore(C):
    p = C.work('veg', 'shore_pnw.npz')
    return np.load(p) if os.path.exists(p) else None

def _osm_segments(S, box, pad=60.0):
    """[(p, q, n_land, beach)] of the OSM coastline inside box + pad"""
    seg = S['seg'].astype(np.float64); fl = S['beach']
    mx, my = (seg[:, 0] + seg[:, 2]) / 2, (seg[:, 1] + seg[:, 3]) / 2
    k = np.nonzero((mx > box[0] - pad) & (mx < box[2] + pad) & (my > box[1] - pad) & (my < box[3] + pad))[0]
    out = []
    for i in k:
        a, b, c, d = seg[i]; L = float(np.hypot(c - a, d - b))
        if L < 1e-3: continue
        n = (-(d - b) / L, (c - a) / L)                                  # left of the way = land
        # long OSM segments split to <= 4 m pieces (the wall's top follows the ground)
        m = max(1, int(np.ceil(L / 4.0)))
        for j in range(m):
            t0, t1 = j / m, (j + 1) / m
            out.append(((a + (c - a) * t0, b + (d - b) * t0), (a + (c - a) * t1, b + (d - b) * t1), n, bool(fl[i])))
    return out

def _sd(S, X, Y):
    """signed distance to the OSM coastline (m, + land; nan off the grid) and the beach flag at world points"""
    sd = S['sd2']; bg = S['beach_grid']; r_, x0, y0 = float(S['res']), float(S['x0']), float(S['y0'])
    c = np.floor((X - x0) / r_).astype(np.int64); r = np.floor((Y - y0) / r_).astype(np.int64)
    ok = (c >= 0) & (c < sd.shape[1]) & (r >= 0) & (r < sd.shape[0])
    v = np.full(X.shape, np.nan, np.float32); b = np.zeros(X.shape, bool)
    v[ok] = sd[r[ok], c[ok]].astype(np.float32) * (float(S['unit']) if 'unit' in S.files else 0.5)
    if bg.shape == sd.shape: b[ok] = bg[r[ok], c[ok]] > 0
    return v, b

def _sink(S, X, Y):
    """shore_pnw's sink grid (ground_city: seaward, within 30 m or on the land cover's water / mud / sand, inside the city) at world points"""
    if 'sink' not in S.files: return np.ones(np.shape(X), bool)
    g = S['sink']; r_, x0, y0 = float(S['res']), float(S['x0']), float(S['y0'])
    c = np.floor((np.asarray(X) - x0) / r_).astype(np.int64); r = np.floor((np.asarray(Y) - y0) / r_).astype(np.int64)
    ok = (c >= 0) & (c < g.shape[1]) & (r >= 0) & (r < g.shape[0]); out = np.zeros(np.shape(X), bool)
    out[ok] = g[r[ok], c[ok]] > 0
    return out

def sink(bpy, sc, C, box, log=print, pad=60.0):
    """QW_SINK=1: the terrain seaward of the OSM coastline under the sea sheet, and a water surface where the sea sheet is cut"""
    S = _shore(C)
    if S is None: log('quay_wall sink: no shore_pnw.npz'); return 0
    zw = float(os.environ.get('QW_SINK_Z', '-0.4')); n_tot = 0
    for ob in [o for o in bpy.data.objects if o.type == 'MESH' and o.name.split('.')[0] == 'terrain']:
        me = ob.data; nv = len(me.vertices)
        co = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        W = np.array(ob.matrix_world, np.float64)
        X = co[:, 0] * W[0, 0] + co[:, 1] * W[0, 1] + co[:, 2] * W[0, 2] + W[0, 3]
        Y = co[:, 0] * W[1, 0] + co[:, 1] * W[1, 1] + co[:, 2] * W[1, 2] + W[1, 3]
        inb = (X > box[0] - pad) & (X < box[2] + pad) & (Y > box[1] - pad) & (Y < box[3] + pad)
        s_, bch = _sd(S, X, Y)
        sea = inb & ~np.isnan(s_) & (s_ < -0.5) & _sink(S, X, Y)
        tgt = np.where(bch, 0.10 + 0.04 * np.nan_to_num(s_), zw).astype(np.float32)
        low = sea & (co[:, 2] > tgt)
        if low.any() and abs(W[2, 2] - 1.0) < 1e-6 and abs(W[2, 3]) < 1e-6:
            co[low, 2] = tgt[low]; me.vertices.foreach_set('co', co.ravel()); me.update()
            n_tot += int(low.sum())
    # the water surface over the strip the sea sheet leaves cut (coast_land: land), 2 m cells at the sheet's height + 5 mm
    cl = os.environ.get('COAST_LAND_FILE') or C.work('landmarks', 'coast_land.npz'); sea_m = bpy.data.materials.get('sea')
    nq = 0
    if os.path.exists(cl) and sea_m is not None:
        z = np.load(cl); cres, cx0, cy1 = float(z['res']), float(z['x0']), float(z['y1']); CS = z['sd_dm'].astype(np.float32) / 10.0
        R = 2.0; xs = np.arange(box[0] - pad, box[2] + pad, R) + R / 2; ys = np.arange(box[1] - pad, box[3] + pad, R) + R / 2
        GX, GY = np.meshgrid(xs, ys)
        s_, bch = _sd(S, GX.ravel(), GY.ravel()); s_ = s_.reshape(GX.shape)
        cc = np.clip(((GX - cx0) / cres).astype(np.int64), 0, CS.shape[1] - 1); rr = np.clip(((cy1 - GY) / cres).astype(np.int64), 0, CS.shape[0] - 1)
        need = ~np.isnan(s_) & (s_ < -0.5) & (CS[rr, cc] > -10.0) & _sink(S, GX.ravel(), GY.ravel()).reshape(GX.shape)     # (10 m into the sheet's own water: sea.png and coast_land's blur differ by a few m)
        jj, ii = np.nonzero(need)
        if len(ii):
            m_ = sea_m.copy(); m_.name = 'sea_fill'
            for nd_ in m_.node_tree.nodes:      # the sea's land cut (transparent where sea.png says land) held at 'water'
                if nd_.type == 'MIX_SHADER' and any(l_.from_node.type == 'BSDF_TRANSPARENT' for l_ in nd_.inputs[1].links):
                    for l_ in list(nd_.inputs[0].links): m_.node_tree.links.remove(l_)
                    nd_.inputs[0].default_value = 1.0
            x0_, y0_ = xs[ii] - R / 2, ys[jj] - R / 2; zf = 0.125
            V = np.stack([np.c_[x0_, y0_], np.c_[x0_ + R, y0_], np.c_[x0_ + R, y0_ + R], np.c_[x0_, y0_ + R]], 1).reshape(-1, 2)
            V = np.c_[V, np.full(len(V), zf)]
            F = np.arange(len(V)).reshape(-1, 4)
            me = bpy.data.meshes.new('ocean'); me.from_pydata(V.tolist(), [], F.tolist()); me.update()
            ob = bpy.data.objects.new('ocean', me); sc.collection.objects.link(ob); me.materials.append(m_)
            nq = len(ii)
    log(f'quay_wall sink: {n_tot} terrain vertices under the sea, {nq} water cells ({nq * 4} m2) over the cut strip')
    return n_tot

def boulevards(bpy, sc, C, box, log=print):
    """QW_BLVD=1: lawn and sidewalk cells of ground_pnw.npy over the 'streets' mesh, as 1 m quads of the terrain material"""
    gp = C.work('veg', 'ground_pnw.npy'); st = bpy.data.objects.get('streets'); tr = bpy.data.objects.get('terrain')
    if not (os.path.exists(gp) and st is not None and tr is not None and tr.active_material is not None):
        log('quay_wall boulevards: no class map / streets / terrain material'); return 0
    from mathutils.bvhtree import BVHTree
    gm = json.load(open(C.work('veg', 'ground_pnw.json'))); G = np.load(gp, mmap_mode='r'); cl = gm['classes']
    i0, j0 = int(np.floor(box[0] - gm['x0'])), int(np.floor(box[1] - gm['y0'])); i1, j1 = int(np.ceil(box[2] - gm['x0'])), int(np.ceil(box[3] - gm['y0']))
    i0, j0, i1, j1 = max(0, i0), max(0, j0), min(G.shape[1], i1), min(G.shape[0], j1)
    if i1 <= i0 or j1 <= j0: return 0
    sub = np.asarray(G[j0:j1, i0:i1])
    want = np.isin(sub, [cl.index('lawn'), cl.index('concrete')])
    jj, ii = np.nonzero(want)
    if not len(ii): return 0
    dg = bpy.context.evaluated_depsgraph_get(); bvh = BVHTree.FromObject(st, dg)
    from mathutils import Vector
    X = gm['x0'] + i0 + ii + 0.5; Y = gm['y0'] + j0 + jj + 0.5
    V, F = [], []; dn = Vector((0, 0, -1))
    for x, y in zip(X.tolist(), Y.tolist()):
        h = bvh.ray_cast(Vector((x, y, 2000.0)), dn)
        if h[0] is None: continue
        z = h[0].z + 0.03; k = len(V)
        V += [(x - 0.5, y - 0.5, z), (x + 0.5, y - 0.5, z), (x + 0.5, y + 0.5, z), (x - 0.5, y + 0.5, z)]; F.append((k, k + 1, k + 2, k + 3))
    if not F: log('quay_wall boulevards: none on the streets mesh'); return 0
    me = bpy.data.meshes.new('ground_blvd'); me.from_pydata(V, [], F); me.update()
    ob = bpy.data.objects.new('ground_blvd', me); sc.collection.objects.link(ob); me.materials.append(tr.active_material)
    log(f'quay_wall boulevards: {len(F)} m2 of lawn / sidewalk over the right of way ({len(ii)} candidate cells)')
    return len(F)

def build(bpy, sc, M, ground, box, cityconf, log=print):
    C = cityconf
    cl = os.environ.get('COAST_LAND_FILE') or C.work('landmarks', 'coast_land.npz')
    if not os.path.exists(cl): log('quay_wall: no coast_land.npz'); return 0
    osm_ = os.environ.get('QW_LINE', '') == 'osm' and _shore(C) is not None
    if os.environ.get('QW_BLVD', '0') == '1':
        try: boulevards(bpy, sc, C, box, log)
        except Exception as ex:
            import traceback; traceback.print_exc(); log('quay_wall boulevards: FAILED', ex)
    if os.environ.get('QW_SINK', '0') == '1':
        try: sink(bpy, sc, C, box, log)
        except Exception as ex:
            import traceback; traceback.print_exc(); log('quay_wall sink: FAILED', ex)
    segs = _osm_segments(_shore(C), box) if osm_ else _segments(cl, box)
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
    for sg in segs:
        p, q, n = sg[:3]
        mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
        if not (box[0] - 30 <= mx <= box[2] + 30 and box[1] - 30 <= my <= box[3] + 30): continue
        if not inside(mx, my): continue
        if osm_:
            if sg[3]: n_skip += 1; continue                                   # an OSM beach: no wall
        elif sand is not None and sand(mx + n[0] * 6.0, my + n[1] * 6.0): n_skip += 1; continue
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
    log(f'quay_wall: {n_seg} pieces, {n_skip} on beaches skipped' + (' (OSM coastline)' if osm_ else ''))
    return n_seg
