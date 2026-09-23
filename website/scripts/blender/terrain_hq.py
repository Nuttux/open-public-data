"""The ground, made true: USGS 3DEP bare earth instead of the engine's terrain.

WHY. The engine's terrain (base/terrain.qc, base/terrain-fine.bin, and the
exported 'terrain' layer) was fetched from the 3DEP ImageServer with a bbox
whose aspect in DEGREES was not the aspect of the requested image, and the
service widens such a bbox to keep its pixels square in degrees: the grid it
returned spans 1.2649x the latitude the engine believes. The engine's relief
is therefore squeezed north-south about y = 1217 m: Twin Peaks drawn 450 m
north of itself, Telegraph Hill under Chinatown, Coit Tower at sea level.
Measured: engine-fine vs a correctly requested 3DEP grid, mean |dz| 20.3 m;
the same grid stretched by 1.2649 about y = 1217.3, 0.34 m. (The engine's
'surround' is not squeezed.) Fixed at the source in PR #94: a
terrain-fine.json that carries `registration` / `request` is read as it is
(SQUEEZE 1), and correct_scene checks that the scene was exported on the
terrain-fine.json it reads.

WHAT. correct_scene(d, log, box, sd) rewrites the exported scene in place,
BEFORE anything is built on it:
  * 'terrain': a new grid from 3DEP (2 m tiles, lm_dem.py), `res` metres a
    cell inside `box`, coarser outside, watertight at the seam; the engine's
    colours carried over by position; carved a little under the streets so
    the ground never pokes through a street between its vertices;
  * streets, markings, ground detail: re-draped on the true ground (the
    engine lifted its streets ~1.5 m over its coarse ground; viaducts keep
    their height above the ground);
  * engine massing ('buildings', per building by its centre) and the
    engine's landmarks ('heroes', per mesh): moved rigidly by the change of
    ground under them.
Everything downstream (ground(), buildings, trees, sidewalks) then stands on
the true ground. true_ground(x, y) is the same surface, for anyone who needs
it without a scene.

Sources: USGS 3DEP (public domain) via the ImageServer exportImage; the
engine's own terrain-fine.bin only to undo its lift.
"""
import json, math, os, time
import numpy as np
import lm_dem

CITY = '/Users/daniel/code/opd-render/website/public/data/us/sf/city'
# (dlon / dlat) of the engine's first 3DEP request = 1 / cos(37.76 deg). A
# terrain-fine.json built after the fix (PR #94) carries `request` and
# `registration` and is not squeezed: SQUEEZE is then 1 (see _engine_fine).
SQUEEZE_OLD = 1.2649
SQUEEZE = SQUEEZE_OLD
ADAPT = os.environ.get('TERRAIN_ADAPT', '1') == '1'      # two-level fine block (see _adaptive_tris)
ADAPT_THR = float(os.environ.get('TERRAIN_THR', '0.35'))  # m off the plane of an 8 m cell's corners that splits it
_EF = None

def _engine_fine():
    global _EF, SQUEEZE
    if _EF is None:
        j = json.load(open(f'{CITY}/base/terrain-fine.json'))
        a = np.fromfile(f'{CITY}/base/terrain-fine.bin', dtype='<u2').reshape(j['h'], j['w']).astype(np.float32) / 65535 * j['zmax']
        # the fixed build says how its grid is registered; the first one did not
        SQUEEZE = 1.0 if ('registration' in j or 'request' in j) else SQUEEZE_OLD
        _EF = (a, j['extent'])
    return _EF

def engine_ground(X, Y):
    """the engine's terrain as shipped (squeezed until PR #94), bilinear —
    what its streets and landmarks were draped on"""
    a, (x0, y0, x1, y1) = _engine_fine()
    H, W = a.shape
    c = np.clip((np.asarray(X) - x0) / (x1 - x0) * (W - 1), 0, W - 1.001)
    r = np.clip((np.asarray(Y) - y0) / (y1 - y0) * (H - 1), 0, H - 1.001)
    c0 = np.floor(c).astype(int); r0 = np.floor(r).astype(int); fx = c - c0; fy = r - r0
    return (a[r0, c0] * (1 - fx) * (1 - fy) + a[r0, c0 + 1] * fx * (1 - fy)
            + a[r0 + 1, c0] * (1 - fx) * fy + a[r0 + 1, c0 + 1] * fx * fy)

def true_ground(X, Y):
    """3DEP bare earth (metres above the vertical datum); where no tile is on
    disk, the engine's grid un-squeezed (0.34 m from 3DEP, 13 m cells)"""
    X = np.asarray(X, dtype=np.float64); Y = np.asarray(Y, dtype=np.float64)
    z = lm_dem.sample_arr(X, Y)
    bad = np.isnan(z)
    if bad.any():
        _, (x0, y0, x1, y1) = _engine_fine(); yc = (y0 + y1) / 2
        z[bad] = engine_ground(X[bad], yc + (Y[bad] - yc) / SQUEEZE)
    return z

# ── rasterising triangles onto a grid (numpy, chunked) ───────────────────────
def raster(P, V, x0, y0, step, nx, ny, mode='set', out=None):
    """P (n,3,3) triangles, V (n,3,k) per-corner values: writes the
    barycentric interpolation at every grid node (x0 + i*step, y0 + j*step)
    inside a triangle into out (ny, nx, k), 'set' or 'min'"""
    P = np.asarray(P, dtype=np.float64); V = np.asarray(V, dtype=np.float64)
    k = V.shape[2]
    if out is None: out = np.full((ny, nx, k), np.nan, np.float32)
    if not len(P): return out
    X, Y = P[:, :, 0], P[:, :, 1]
    i0 = np.clip(np.ceil((X.min(1) - x0) / step - 1e-9), 0, nx).astype(np.int64)
    i1 = np.clip(np.floor((X.max(1) - x0) / step + 1e-9), -1, nx - 1).astype(np.int64)
    j0 = np.clip(np.ceil((Y.min(1) - y0) / step - 1e-9), 0, ny).astype(np.int64)
    j1 = np.clip(np.floor((Y.max(1) - y0) / step + 1e-9), -1, ny - 1).astype(np.int64)
    w = i1 - i0 + 1; h = j1 - j0 + 1
    ok = (w > 0) & (h > 0)
    idx = np.nonzero(ok)[0]
    if not len(idx): return out
    # bucket by stencil size (next power of two per axis)
    bw = 1 << np.ceil(np.log2(np.maximum(w[idx], 1))).astype(np.int64)
    bh = 1 << np.ceil(np.log2(np.maximum(h[idx], 1))).astype(np.int64)
    for key in set(zip(bw.tolist(), bh.tolist())):
        sw, sh = key
        sel = idx[(bw == sw) & (bh == sh)]
        per = max(1, int(3e6 // (sw * sh)))
        di, dj = np.meshgrid(np.arange(sw), np.arange(sh)); di = di.ravel(); dj = dj.ravel()
        for c0 in range(0, len(sel), per):
            s = sel[c0:c0 + per]
            I = i0[s, None] + di[None, :]; J = j0[s, None] + dj[None, :]
            m = (I <= i1[s, None]) & (J <= j1[s, None])
            px = x0 + I * step; py = y0 + J * step
            ax, ay = X[s, 0, None], Y[s, 0, None]; bx, by = X[s, 1, None], Y[s, 1, None]; cx, cy = X[s, 2, None], Y[s, 2, None]
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            den = np.where(np.abs(den) < 1e-12, 1e-12, den)
            l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den
            l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den
            l3 = 1 - l1 - l2
            m &= (l1 >= -1e-6) & (l2 >= -1e-6) & (l3 >= -1e-6)
            if not m.any(): continue
            r_, c_ = np.nonzero(m)
            tt = s[r_]
            val = (l1[r_, c_, None] * V[tt, 0] + l2[r_, c_, None] * V[tt, 1] + l3[r_, c_, None] * V[tt, 2])
            JJ, II = J[r_, c_], I[r_, c_]
            if mode == 'min':
                flat = out.reshape(-1, k); lin = JJ * nx + II
                for q in range(k): np.fmin.at(flat[:, q], lin, val[:, q].astype(np.float32))
            else:
                out[JJ, II] = val
    return out

def _b64f(s):
    import base64
    return np.frombuffer(base64.b64decode(s), dtype=np.float32)

def _enc(a):
    import base64
    return base64.b64encode(np.ascontiguousarray(a, dtype=np.float32).tobytes()).decode()

def _water_mask(sd, x0, y0, step, nx, ny):
    """the render's own land/water mask (water_mask.py's sea.png, R = water)
    sampled on the grid; None if the scene has none"""
    if not sd: return None
    p, pj = os.path.join(sd, 'sea.png'), os.path.join(sd, 'sea.json')
    if not (os.path.exists(p) and os.path.exists(pj)): return None
    g = json.load(open(pj))
    try:
        from PIL import Image
        a = np.asarray(Image.open(p), dtype=np.float32)[..., 0] / 255.0
    except ImportError:
        import bpy
        im = bpy.data.images.load(p, check_existing=True); w_, h_ = im.size
        px = np.empty(w_ * h_ * 4, np.float32); im.pixels.foreach_get(px)
        a = px.reshape(h_, w_, 4)[::-1, :, 0]                      # bpy rows start at the bottom
    H, W = a.shape
    xs = x0 + np.arange(nx) * step; ys = y0 + np.arange(ny) * step
    c = np.clip(((xs - g['ox']) / g['w'] * W).astype(int), 0, W - 1)
    r = np.clip(((g['oy'] + g['h'] - ys) / g['h'] * H).astype(int), 0, H - 1)
    return a[np.ix_(r, c)] > 0.5

def _grid_tris(x0, y0, step, nx, ny, Z, C, keep=None):
    """triangle soup (and colours) of a regular grid; keep (ny-1, nx-1) bool"""
    xs = x0 + np.arange(nx) * step; ys = y0 + np.arange(ny) * step
    X, Y = np.meshgrid(xs, ys)
    V = np.stack([X, Y, Z], -1).astype(np.float32)
    a, b, c, d_ = V[:-1, :-1], V[:-1, 1:], V[1:, 1:], V[1:, :-1]
    ca, cb, cc, cd = C[:-1, :-1], C[:-1, 1:], C[1:, 1:], C[1:, :-1]
    if keep is None: keep = np.ones((ny - 1, nx - 1), bool)
    # split each cell along its flatter diagonal
    alt = np.abs(Z[:-1, :-1] - Z[1:, 1:]) > np.abs(Z[:-1, 1:] - Z[1:, :-1])
    t1 = np.where(alt[..., None, None], np.stack([a, b, d_], -2), np.stack([a, b, c], -2))
    t2 = np.where(alt[..., None, None], np.stack([b, c, d_], -2), np.stack([a, c, d_], -2))
    k1 = np.where(alt[..., None, None], np.stack([ca, cb, cd], -2), np.stack([ca, cb, cc], -2))
    k2 = np.where(alt[..., None, None], np.stack([cb, cc, cd], -2), np.stack([ca, cc, cd], -2))
    T = np.concatenate([t1[keep], t2[keep]]); K = np.concatenate([k1[keep], k2[keep]])
    return T, K

class _Ground:
    """the ground as built (before the street carve): bilinear on the grids
    added last-wins, 3DEP elsewhere — what the streets are draped on"""
    def __init__(self): self.grids = []
    def add(self, x0, y0, step, Z): self.grids.append((x0, y0, step, Z.astype(np.float32).copy()))
    def __call__(self, X, Y):
        X = np.asarray(X, dtype=np.float64); Y = np.asarray(Y, dtype=np.float64)
        out = true_ground(X, Y).astype(np.float64)
        for (x0, y0, st, Z) in self.grids:
            ny, nx = Z.shape
            c = (X - x0) / st; r = (Y - y0) / st
            ins = (c >= 0) & (c <= nx - 1) & (r >= 0) & (r <= ny - 1)
            if not ins.any(): continue
            cc, rr = c[ins], r[ins]
            c0 = np.clip(np.floor(cc).astype(int), 0, nx - 2); r0 = np.clip(np.floor(rr).astype(int), 0, ny - 2)
            fx, fy = cc - c0, rr - r0
            out[ins] = (Z[r0, c0] * (1 - fx) * (1 - fy) + Z[r0, c0 + 1] * fx * (1 - fy) + Z[r0 + 1, c0] * (1 - fx) * fy + Z[r0 + 1, c0 + 1] * fx * fy)
        return out

def _pier_nodes(recs, x0, y0, step, nx, ny, wm):
    """grid nodes under (and 4 m round) buildings that stand over the
    render's water — the pier sheds; their rings, grown, for the deck"""
    mask = np.zeros((ny, nx), bool); rings = []
    if wm is None or not recs: return mask, rings
    x1, y1 = x0 + (nx - 1) * step, y0 + (ny - 1) * step
    for b in recs:
        r = b['ring']
        if not (x0 <= b['cx'] <= x1 and y0 <= b['cy'] <= y1): continue
        wet = 0
        for (x, y) in r:
            i = int(round((x - x0) / step)); j = int(round((y - y0) / step))
            if 0 <= i < nx and 0 <= j < ny and wm[j, i]: wet += 1
        if wet == 0: continue
        cx, cy = b['cx'], b['cy']
        xs = [p[0] for p in r]; ys = [p[1] for p in r]
        size = max(8.0, min(max(xs) - min(xs), max(ys) - min(ys)))
        k = 1 + 8.0 / size
        g = [(cx + (x - cx) * k, cy + (y - cy) * k) for x, y in r]
        rings.append(g)
        gx = [p[0] for p in g]; gy = [p[1] for p in g]
        i0 = max(0, int((min(gx) - x0) / step)); i1 = min(nx - 1, int((max(gx) - x0) / step) + 1)
        j0 = max(0, int((min(gy) - y0) / step)); j1 = min(ny - 1, int((max(gy) - y0) / step) + 1)
        if i1 < i0 or j1 < j0: continue
        I, J = np.meshgrid(np.arange(i0, i1 + 1), np.arange(j0, j1 + 1))
        PX = x0 + I * step; PY = y0 + J * step
        ins = np.zeros(PX.shape, bool)
        for a in range(len(g)):
            (xa, ya), (xb, yb) = g[a], g[(a + 1) % len(g)]
            cnd = ((ya > PY) != (yb > PY)) & (PX < (xb - xa) * (PY - ya) / ((yb - ya) or 1e-12) + xa)
            ins ^= cnd
        mask[J[ins], I[ins]] = True
    return mask, rings

PIER_Z = 2.3

def _adaptive_tris(x0, y0, res, nx, ny, Z, C, keep, thr):
    """the fine block at two levels: cells of 2*res, split into four where
    the ground departs from the plane of their corners by more than `thr`
    (cliffs, hilltops, dunes); urban ground, graded smooth, stays coarse.
    Edge midpoints between a split and an unsplit cell are put on the
    unsplit cell's edge, so nothing cracks. nx - 1 and ny - 1 must be even.
    keep: (ny-1, nx-1) per fine cell. Returns (T, K, n_split, n_cells)."""
    Z = Z.copy()
    ny8, nx8 = (ny - 1) // 2, (nx - 1) // 2
    c00, c10, c01, c11 = Z[0:-1:2, 0:-1:2], Z[0:-1:2, 2::2], Z[2::2, 0:-1:2], Z[2::2, 2::2]
    hb = (c00 + c10) / 2; ht = (c01 + c11) / 2; vl = (c00 + c01) / 2; vr = (c10 + c11) / 2; cc = (c00 + c10 + c01 + c11) / 4
    dev = np.maximum.reduce([np.abs(Z[1::2, 1::2] - cc), np.abs(Z[0:-1:2, 1::2] - hb), np.abs(Z[2::2, 1::2] - ht),
                             np.abs(Z[1::2, 0:-1:2] - vl), np.abs(Z[1::2, 2::2] - vr)])
    k8 = keep[0::2, 0::2] | keep[1::2, 0::2] | keep[0::2, 1::2] | keep[1::2, 1::2]
    ref = (dev > thr) & k8
    # horizontal edge midpoints (rows 0,2,..; cols 1,3,..): split on both sides or flattened
    below = np.zeros((ny8 + 1, nx8), bool); above = np.zeros((ny8 + 1, nx8), bool)
    below[1:] = ref; above[:-1] = ref
    flat_h = ~(below & above)
    lin_h = (Z[0::2, 0:-1:2] + Z[0::2, 2::2]) / 2
    Zh = Z[0::2, 1::2]; Zh[flat_h] = lin_h[flat_h]; Z[0::2, 1::2] = Zh
    left = np.zeros((ny8, nx8 + 1), bool); right = np.zeros((ny8, nx8 + 1), bool)
    left[:, 1:] = ref; right[:, :-1] = ref
    flat_v = ~(left & right)
    lin_v = (Z[0:-1:2, 0::2] + Z[2::2, 0::2]) / 2
    Zv = Z[1::2, 0::2]; Zv[flat_v] = lin_v[flat_v]; Z[1::2, 0::2] = Zv
    # the unsplit cells at 2*res, the split ones at res
    Tc, Kc = _grid_tris(x0, y0, 2 * res, nx8 + 1, ny8 + 1, Z[0::2, 0::2], C[0::2, 0::2], k8 & ~ref)
    fine_keep = np.repeat(np.repeat(ref, 2, 0), 2, 1) & keep
    Tf, Kf = _grid_tris(x0, y0, res, nx, ny, Z, C, fine_keep)
    return np.concatenate([Tc, Tf]), np.concatenate([Kc, Kf]), int(ref.sum()), int(k8.sum())

def correct_scene(d, log=print, box=None, sd=None, res=None, far=None, pad=250.0):
    """rewrite the scene's ground and everything draped on it; see the module
    doc. box = the modelled area (fine grid there), sd = scene dir (for the
    render's water mask). Never raises: on failure the scene is unchanged."""
    t0 = time.time()
    if os.environ.get('TERRAIN_HQ', '1') == '0' or d.get('_terrain_hq'): return False
    try:
        return _correct(d, log, box, sd, res, far, pad, t0)
    except Exception as ex:
        import traceback; traceback.print_exc()
        log('terrain_hq: correction FAILED, engine terrain kept:', ex)
        return False

def _correct(d, log, box, sd, res, far, pad, t0):
    ter = [m for m in d['meshes'] if m['layer'] == 'terrain' and not m.get('instanced')]
    if not ter: return False
    TP = np.concatenate([_b64f(m['pos']) for m in ter]).reshape(-1, 3, 3)
    TC = np.concatenate([_b64f(m['col']) if m.get('col') else np.ones(len(_b64f(m['pos'])), np.float32) for m in ter]).reshape(-1, 3, 3)
    # the scene must have been exported on the terrain-fine.json read here (a
    # scene from before PR #94 with the fixed grid on disk, or the reverse,
    # would re-drape everything by the wrong offsets): say so loudly
    sv = TP.reshape(-1, 3)[::97]; sv = sv[sv[:, 2] > 2.0]
    if len(sv):
        dz_ = float(np.mean(np.abs(sv[:, 2] * 0.5 - engine_ground(sv[:, 0], sv[:, 1]))))
        log(f'terrain_hq: scene terrain vs terrain-fine.json (squeeze {SQUEEZE:g}): mean |dz| {dz_:.2f} m')
        if dz_ > 3.0: log('terrain_hq: WARNING — the scene was exported on another engine terrain than terrain-fine.json')
    ex0, ey0 = TP[..., 0].min(), TP[..., 1].min(); ex1, ey1 = TP[..., 0].max(), TP[..., 1].max()
    # the engine's district export stops its ground at the box but draws its
    # massing and streets further out: the true ground goes under all of it
    for m in d['meshes']:
        if m.get('instanced') or m['layer'] not in ('buildings', 'streets', 'street-detail'): continue
        P_ = _b64f(m['pos']).reshape(-1, 3)
        ex0, ey0 = min(ex0, P_[:, 0].min()), min(ey0, P_[:, 1].min()); ex1, ey1 = max(ex1, P_[:, 0].max()), max(ey1, P_[:, 1].max())
    span = max(ex1 - ex0, ey1 - ey0)
    if box is None:
        res = res or (3.0 if span < 4500 else 16.0); far = res; fb = (ex0, ey0, ex1, ey1)
    else:
        bw = max(box[2] - box[0], box[3] - box[1])
        res = res or (3.0 if bw < 2200 else 4.0 if bw < 3600 else 5.0)
        far = far or (8.0 if span < 4500 else 48.0)
        fb = (box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)
    far = max(far, res); ratio = max(1, int(round(far / res))); far = res * ratio
    # coarse lattice over the whole extent, aligned so the fine block's edges
    # fall on its lines
    gx0 = math.floor(ex0 / far) * far; gy0 = math.floor(ey0 / far) * far
    cnx = int(math.ceil((ex1 - gx0) / far)) + 1; cny = int(math.ceil((ey1 - gy0) / far)) + 1
    fi0 = max(0, int(math.floor((fb[0] - gx0) / far))); fj0 = max(0, int(math.floor((fb[1] - gy0) / far)))
    fi1 = min(cnx - 1, int(math.ceil((fb[2] - gx0) / far))); fj1 = min(cny - 1, int(math.ceil((fb[3] - gy0) / far)))
    colours = TC                                             # per corner rgb
    def build_grid(x0, y0, step, nx, ny):
        xs = x0 + np.arange(nx) * step; ys = y0 + np.arange(ny) * step
        X, Y = np.meshgrid(xs, ys)
        Z = true_ground(X, Y).astype(np.float32)
        C = raster(TP, colours, x0, y0, step, nx, ny)
        # nodes off the old terrain: the old terrain's median colour
        miss = np.isnan(C[..., 0]); cov_.append(~miss)
        if miss.any():
            C[miss] = np.nanmedian(C.reshape(-1, 3), 0) if (~miss).any() else 1.0
        wm = _water_mask(sd, x0, y0, step, nx, ny)
        if wm is not None:
            # the render's land: never below the water it borders (a fort, a
            # pier shed, a seawall the bare-earth model flattened to the sea)
            Z = np.where(~wm, np.maximum(Z, 0.6), Z)
            # pier sheds over the water stand on a deck (without ground under
            # their corners hq_city's generator skipped them: hollow piers)
            pm, rings = _pier_nodes(recs_, x0, y0, step, nx, ny, wm)
            if pm.any():
                Z = np.where(pm, np.maximum(Z, PIER_Z), Z); pier_.append(pm); piers_.extend(rings)
            else: pier_.append(None)
        else: pier_.append(None)
        return X, Y, Z, C
    def keep_cells(Z, cov):
        # deep water no one sees (the sea covers it), unless the old ground
        # was there (a pier's buildings stand on it)
        zmax = np.maximum.reduce([Z[:-1, :-1], Z[:-1, 1:], Z[1:, 1:], Z[1:, :-1]])
        c = cov[:-1, :-1] | cov[:-1, 1:] | cov[1:, 1:] | cov[1:, :-1]
        return c | (zmax > -3.0)
    cov_, pier_, piers_ = [], [], []
    try:
        import city_data
        recs_ = city_data.buildings(ex0, ey0, ex1, ey1)
    except Exception:
        recs_ = []
    G0 = _Ground()
    tris, cols = [], []
    # fine block
    nfx = (fi1 - fi0) * ratio + 1; nfy = (fj1 - fj0) * ratio + 1
    fx0 = gx0 + fi0 * far; fy0 = gy0 + fj0 * far
    Xf, Yf, Zf, Cf = build_grid(fx0, fy0, res, nfx, nfy)
    if ratio > 1 and (fi0 > 0 or fj0 > 0 or fi1 < cnx - 1 or fj1 < cny - 1):
        Xc, Yc, Zc, Cc = build_grid(gx0, gy0, far, cnx, cny)
        G0.add(gx0, gy0, far, Zc)
    else: Zc = None
    G0.add(fx0, fy0, res, Zf)
    Zf = _carve(d, Zf, fx0, fy0, res, nfx, nfy, G0)
    if ratio > 1:
        # the seam: fine nodes on the block's edge lie on coarse edges; put
        # them on those edges' straight lines so nothing cracks
        for side in ('b', 't', 'l', 'r'):
            if side in 'bt':
                j = 0 if side == 'b' else nfy - 1
                if (side == 'b' and fj0 == 0) or (side == 't' and fj1 == cny - 1): continue
                zz = Zf[j, ::ratio]
                t = (np.arange(nfx) % ratio) / ratio; k = np.arange(nfx) // ratio
                k1 = np.minimum(k + 1, len(zz) - 1)
                Zf[j] = zz[k] * (1 - t) + zz[k1] * t
            else:
                i = 0 if side == 'l' else nfx - 1
                if (side == 'l' and fi0 == 0) or (side == 'r' and fi1 == cnx - 1): continue
                zz = Zf[::ratio, i]
                t = (np.arange(nfy) % ratio) / ratio; k = np.arange(nfy) // ratio
                k1 = np.minimum(k + 1, len(zz) - 1)
                Zf[:, i] = zz[k] * (1 - t) + zz[k1] * t
    kf = keep_cells(Zf, cov_[0])
    if pier_[0] is not None:
        pm = pier_[0]; kf |= pm[:-1, :-1] | pm[:-1, 1:] | pm[1:, 1:] | pm[1:, :-1]
    if ADAPT and (nfx - 1) % 2 == 0 and (nfy - 1) % 2 == 0:
        T, K, nsp, ncl = _adaptive_tris(fx0, fy0, res, nfx, nfy, Zf, Cf, kf, ADAPT_THR)
        log(f'terrain_hq: {nsp} of {ncl} cells of {2 * res:g} m split to {res:g} m')
    else:
        T, K = _grid_tris(fx0, fy0, res, nfx, nfy, Zf, Cf, kf)
    tris.append(T); cols.append(K)
    nfine = len(T)
    if Zc is not None:
        # the coarse nodes shared with the fine block take the fine values
        Zc[fj0:fj1 + 1, fi0:fi1 + 1] = Zf[::ratio, ::ratio]
        keep = keep_cells(Zc, cov_[1])
        if pier_[1] is not None:
            pm = pier_[1]; keep |= pm[:-1, :-1] | pm[:-1, 1:] | pm[1:, 1:] | pm[1:, :-1]
        keep[fj0:fj1, fi0:fi1] = False
        T, K = _grid_tris(gx0, gy0, far, cnx, cny, Zc, Cc, keep); tris.append(T); cols.append(K)
    T = np.concatenate(tris); K = np.concatenate(cols)
    T[..., 2] *= 2.0                                           # the export's zex 2 convention
    ter[0]['pos'] = _enc(T.reshape(-1)); ter[0]['col'] = _enc(K.reshape(-1))
    ter[0]['nv'] = len(T) * 3; ter[0].pop('uv', None); ter[0].pop('cen', None)
    for m in ter[1:]: d['meshes'].remove(m)
    log(f'terrain_hq: ground from 3DEP, {nfine} fine triangles at {res:g} m, {len(T) - nfine} at {far:g} m ({time.time() - t0:.1f}s)')
    _surround(d, log, (ex0, ey0, ex1, ey1), box=box)
    d['_piers'] = [[(round(x, 2), round(y, 2)) for x, y in r] for r in piers_]
    if piers_: log(f'terrain_hq: {len(piers_)} pier sheds on decks')
    _redrape(d, log, G0)
    d['_terrain_hq'] = True
    log(f'terrain_hq: scene re-draped ({time.time() - t0:.1f}s)')
    return True

def _surround(d, log, ext, step=20.0, box=None):
    """the land round the city (Marin, Daly City, the East Bay's edge). The
    engine's 'surround' is NOT squeezed (measured by the terrain-fix agent),
    but it is a few hundred coarse triangles that do not meet the city's
    true ground at the county line: rebuilt from 3DEP where the tiles reach,
    outside the city's own ground — at `step` near the box (the region a
    pyramid frame sees), three times coarser beyond"""
    sur = [m for m in d['meshes'] if m['layer'] == 'surround' and not m.get('instanced')]
    if not sur: return
    SPp = np.concatenate([_b64f(m['pos']) for m in sur]).reshape(-1, 3, 3)
    SCc = np.concatenate([_b64f(m['col']) for m in sur]).reshape(-1, 3, 3)
    tiles = [os.path.basename(p)[2:-4].split('_') for p in __import__('glob').glob(f'{lm_dem.ROOT}/2m/t_*.npy')]
    if not tiles: return
    ti = [int(a) for a, b in tiles]; tj = [int(b) for a, b in tiles]
    x0, x1 = min(ti) * lm_dem.T, (max(ti) + 1) * lm_dem.T; y0, y1 = min(tj) * lm_dem.T, (max(tj) + 1) * lm_dem.T
    def one(st, near):
        nx = int((x1 - x0) / st) + 1; ny = int((y1 - y0) / st) + 1
        xs = x0 + np.arange(nx) * st; ys = y0 + np.arange(ny) * st
        X, Y = np.meshgrid(xs, ys)
        Z = lm_dem.sample_arr(X, Y)
        C = raster(SPp, SCc, x0, y0, st, nx, ny)
        # land = where the engine's surround has a triangle. 3DEP tiles that
        # reach into the bay read ~0 m over open water, and "above -2 m" alone
        # laid flat khaki slabs on the bay, cut square at the tile edges
        # (seen from level 5, 2026-09-23): a cell is land if the engine says
        # so, or if it clearly rises
        land = ~np.isnan(C[..., 0])
        C[~land] = (0.77, 0.67, 0.42)
        Zs = np.nan_to_num(Z, nan=-50.0)
        zmax = np.maximum.reduce([Zs[:-1, :-1], Zs[:-1, 1:], Zs[1:, 1:], Zs[1:, :-1]])
        cland = land[:-1, :-1] | land[:-1, 1:] | land[1:, 1:] | land[1:, :-1]
        CX, CY = np.meshgrid((xs[:-1] + xs[1:]) / 2, (ys[:-1] + ys[1:]) / 2)
        inside_city = (CX > ext[0] + st) & (CX < ext[2] - st) & (CY > ext[1] + st) & (CY < ext[3] - st)
        keep = (((zmax > -2.0) & cland) | (zmax > 3.0)) & ~inside_city
        if near is not None:
            nb = (CX > near[0]) & (CX < near[2]) & (CY > near[1]) & (CY < near[3])
            keep &= nb if st == step else ~nb
        T, K = _grid_tris(x0, y0, st, nx, ny, Zs.astype(np.float32), C, keep)
        return T, K
    if box is None:
        T, K = one(step, None)
    else:
        near = (box[0] - 1000, box[1] - 1000, box[2] + 1000, box[3] + 1000)
        T1, K1 = one(step, near); T2, K2 = one(step * 3, near)
        T, K = np.concatenate([T1, T2]), np.concatenate([K1, K2])
    T[..., 2] *= 2.0
    sur[0]['pos'] = _enc(T.reshape(-1)); sur[0]['col'] = _enc(K.reshape(-1)); sur[0]['nv'] = len(T) * 3
    sur[0].pop('uv', None); sur[0].pop('cen', None)
    for m in sur[1:]: d['meshes'].remove(m)
    log(f'terrain_hq: surround from 3DEP, {len(T)} triangles')

STREETS = ('streets', 'street-uncovered', 'street-detail')
PAINT = ('street-markings', 'bikeways')
FLAT = ('ground-detail',)

def _lift_street(off, base):
    """height over the true ground for a vertex the engine put `off` over its
    own ground: at grade -> `base`; a viaduct keeps its height (less the
    engine's 1.5 m lift)"""
    t = np.clip((off - 3.5) / 3.0, 0, 1); t = t * t * (3 - 2 * t)
    return base * (1 - t) + np.maximum(off - 1.5, base) * t

def _street_arrays(d):
    out = []
    for m in d['meshes']:
        if m.get('instanced') or m['layer'] not in STREETS: continue
        out.append(_b64f(m['pos']).reshape(-1, 3, 3))
    return np.concatenate(out) if out else np.zeros((0, 3, 3), np.float32)

def _carve(d, Z, x0, y0, step, nx, ny, G0=None):
    """the ground a little below every street: the streets are planes between
    their vertices, the ground is not"""
    S = _street_arrays(d)
    if not len(S): return Z
    S = S.astype(np.float64).copy()
    E = engine_ground(S[..., 0], S[..., 1]); L = (G0 or true_ground)(S[..., 0], S[..., 1])
    S[..., 2] = L + _lift_street(S[..., 2] - E, 0.10) - 0.28
    lo = raster(S, S[..., 2:3], x0, y0, step, nx, ny, mode='min')[..., 0]
    # the curb side too: carve one more node around every street node
    pad = np.pad(lo, 1, constant_values=np.nan)
    with np.errstate(all='ignore'):
        import warnings; warnings.simplefilter('ignore', RuntimeWarning)
        nb = np.nanmin(np.stack([pad[1:-1, 1:-1], pad[:-2, 1:-1], pad[2:, 1:-1], pad[1:-1, :-2], pad[1:-1, 2:]]), 0) + 0.08
    lo = np.where(np.isnan(lo), nb, lo)
    return np.where(np.isnan(lo), Z, np.minimum(Z, lo)).astype(np.float32)

def _redrape(d, log, G0=None):
    ground = G0 or true_ground
    n = {}
    for m in d['meshes']:
        if m.get('instanced') or 'pos' not in m: continue
        lay = m['layer']
        if lay in STREETS or lay in PAINT or lay in FLAT:
            P = _b64f(m['pos']).reshape(-1, 3).astype(np.float64).copy()
            E = engine_ground(P[:, 0], P[:, 1]); L = ground(P[:, 0], P[:, 1])
            off = P[:, 2] - E
            if lay in STREETS: P[:, 2] = L + _lift_street(off, 0.10)
            elif lay in PAINT: P[:, 2] = L + _lift_street(off - 0.45, 0.13)
            else: P[:, 2] = L + 0.05
            m['pos'] = _enc(P.reshape(-1)); n[lay] = n.get(lay, 0) + len(P) // 3
        elif lay == 'buildings' and m.get('cen'):
            P = _b64f(m['pos']).reshape(-1, 3, 3).astype(np.float64).copy(); c = _b64f(m['cen']).reshape(-1, 6)
            cx, cy = c[:len(P), 0], c[:len(P), 1]
            dz = np.maximum(ground(cx, cy), 0) - np.maximum(engine_ground(cx, cy), 0)
            P[..., 2] += dz[:, None]
            m['pos'] = _enc(P.reshape(-1)); n[lay] = n.get(lay, 0) + len(P)
        elif lay == 'heroes':
            P = _b64f(m['pos']).reshape(-1, 3).astype(np.float64).copy()
            cx = (P[:, 0].min() + P[:, 0].max()) / 2; cy = (P[:, 1].min() + P[:, 1].max()) / 2
            dz = max(float(ground(np.array([cx]), np.array([cy]))[0]), 0) - max(float(engine_ground(np.array([cx]), np.array([cy]))[0]), 0)
            if max(P[:, 0].max() - P[:, 0].min(), P[:, 1].max() - P[:, 1].min()) > 600: dz = 0.0   # a bridge: its piers stand in the water
            P[:, 2] += dz
            m['pos'] = _enc(P.reshape(-1)); n[lay] = n.get(lay, 0) + len(P) // 3
    log('terrain_hq: re-draped', n)
