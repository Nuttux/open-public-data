"""THE CITY'S REAL CANOPY, TREE BY TREE (vegetation agent, 24/09): every crown
the LiDAR and the photo agree on, private yards and block interiors included,
as (x, y, z, height, crown, arch) in veg/canopy_trees.npz, read by veg_hq
(CANOPY=1). Plain Python (numpy, scipy; laspy from lidar/venv), no Blender.

    python3 veg_canopy.py [x0 y0 x1 y1] [--debug out.png]   # whole city: ~ tiles of 500 m

Per 500 m tile (25 m margin):
  ground   USGS 3DEP LiDAR CA_SanFrancisco_1_B23 (public domain), class 2
           points, lowest per 2 m cell, holes filled from the nearest cell
  canopy   class 1 points (this survey leaves vegetation and roofs unclassified)
           height above that ground, highest per 1 m cell = the canopy height
           model (CHM), single empty cells filled from their neighbours
  mask     CHM > 2.5 m, NAIP 2022 NDVI > NDVI_MIN (ground_prep.patch; widened
           2 m for the photo's lean), and off every building footprint (ground_prep.bmask,
           widened 1.5 m): trees, not roofs, cranes or wires
  crowns   local maxima of the smoothed CHM (window growing with the height:
           a 6 m tree 3 m, a 30 m gum 9 m), grown into the mask by a watershed;
           per crown its top height and the width of a disc of its area
  skip     crowns within max(2.5 m, 0.35 crown) of a tree the DataSF Street Tree
           List or the engine's register already plants
  species  an OSM palm node within 3 m: its palm; in the named woods and parks
           (veg_zones): the zone's mix, in stands; elsewhere (yards, streets):
           tall crowns (>= 18 m) blue gum / Monterey pine / cypress, the rest the
           backyard broadleaf mix. Weights are ours.
"""
import os, sys, json, math, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
W = '/Users/daniel/code/qipu-render-work'
sys.path.append(f'{W}/lidar/venv/lib/python3.12/site-packages'); sys.path.insert(0, f'{W}/lidar')
OUT = f'{W}/veg/canopy_trees.npz'
TILE, PAD = 500.0, 25.0
HMIN = float(os.environ.get('CAN_HMIN', 2.5)); NDVI_MIN = float(os.environ.get('CAN_NDVI', 0.12))

def hp(x, y, salt):
    h = (int(round(x * 10)) * 73856093) ^ (int(round(y * 10)) * 19349663) ^ (salt * 83492791)
    h = (h ^ (h >> 13)) * 0x5bd1e995 & 0xffffffff
    return ((h ^ (h >> 15)) & 0xffffff) / float(0x1000000)

def _draw(mix, u):
    ks = sorted(mix); tot = sum(mix[k] for k in ks); acc = 0.0
    for k in ks:
        acc += mix[k] / tot
        if u < acc: return k
    return ks[-1]

YARD = dict(round=0.42, plane=0.12, ornamental=0.10, cherry=0.07, plum=0.06, olive=0.05, pohu=0.06, pine=0.04, cypress=0.04, column=0.02, small_palm=0.02)
TALL_URBAN = dict(euc=0.45, pine=0.30, cypress=0.25)
TALL_COAST = dict(cypress=0.50, pine=0.35, euc=0.15)
OPEN = ('urban', 'coast_band')


def tile(x0, y0, x1, y1, dbg=None):
    import ept, ground_prep as gp
    from scipy import ndimage as nd
    bx = (x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD)
    P, _ = ept.points(bx, maxd=7, cls=(1,)); G, _ = ept.points(bx, maxd=7, cls=(2,))
    if len(P) < 100 or len(G) < 20: return None
    X0, Y0 = bx[0], bx[1]; nx, ny = int(bx[2] - bx[0]), int(bx[3] - bx[1])
    # ground: lowest class-2 point per 2 m cell, holes from the nearest cell
    gx, gy = ((G[:, 0] - X0) / 2).astype(int), ((G[:, 1] - Y0) / 2).astype(int)
    k = (gx >= 0) & (gx < nx // 2) & (gy >= 0) & (gy < ny // 2)
    D = np.full((ny // 2, nx // 2), np.inf, np.float32); np.minimum.at(D, (gy[k], gx[k]), G[k, 2].astype(np.float32))
    hole = ~np.isfinite(D)
    if hole.all(): return None
    ii = nd.distance_transform_edt(hole, return_distances=False, return_indices=True)
    D = D[tuple(ii)]; D = nd.uniform_filter(D, 3)
    # canopy height model, 1 m
    px, py = (P[:, 0] - X0).astype(int), (P[:, 1] - Y0).astype(int)
    k = (px >= 0) & (px < nx) & (py >= 0) & (py < ny)
    gz = D[np.clip(py[k] // 2, 0, D.shape[0] - 1), np.clip(px[k] // 2, 0, D.shape[1] - 1)]
    hag = (P[k, 2] - gz).astype(np.float32)
    C = np.full((ny, nx), -1.0, np.float32); np.maximum.at(C, (py[k], px[k]), hag)
    empty = C < 0
    C = np.where(empty, nd.grey_dilation(C, 3), C); C[C < 0] = 0
    C = np.minimum(C, 60)
    # the photo and the footprints (row 0 = south, like our rasters)
    _, _, ndvi, ok = gp.patch(bx[0], bx[1], bx[0] + nx, bx[1] + ny, res=1.0)
    veg = nd.maximum_filter(np.where(ok, ndvi, -1), 5) > NDVI_MIN
    bm = nd.binary_dilation(gp.bmask(bx[0], bx[1], bx[0] + nx, bx[1] + ny, res=1.0, sweep=False) > 0, iterations=1)
    M = (C > HMIN) & veg & ~bm
    M = nd.binary_opening(M, iterations=1)
    S = nd.gaussian_filter(np.where(M, C, 0), 1.0)
    # tops: the window grows with the height
    mx = np.zeros_like(M)
    for lo, hi, sz in ((0, 8, 3), (8, 16, 5), (16, 25, 7), (25, 99, 9)):
        mx |= (S >= nd.maximum_filter(S, sz)) & (S >= lo) & (S < hi)
    mx &= M & (S > HMIN)
    lab, n = nd.label(mx)
    if n == 0: return None
    pos = np.array(nd.center_of_mass(mx, lab, range(1, n + 1)))
    mk = np.zeros(M.shape, np.int32)
    mk[pos[:, 0].round().astype(int), pos[:, 1].round().astype(int)] = np.arange(1, n + 1)
    mk[~M] = -1
    inp = np.clip(1000 - S * 25, 0, 65535).astype(np.uint16)
    ws = nd.watershed_ift(inp, mk); ws[~M] = 0
    idx = np.arange(1, n + 1)
    area = nd.sum(np.ones_like(ws), ws, idx)
    top = nd.maximum(C, ws, idx)
    yx = pos
    x = X0 + yx[:, 1] + 0.5; y = Y0 + yx[:, 0] + 0.5
    z = D[np.clip(yx[:, 0].astype(int) // 2, 0, D.shape[0] - 1), np.clip(yx[:, 1].astype(int) // 2, 0, D.shape[1] - 1)]
    crown = 2 * np.sqrt(area / math.pi)
    keep = (x >= x0) & (x < x1) & (y >= y0) & (y < y1) & (area >= 4) & (top > HMIN)
    if dbg:
        from PIL import Image
        DN, AL, _, _ = gp.patch(bx[0], bx[1], bx[0] + nx, bx[1] + ny, res=1.0)
        rgb = np.clip(AL.transpose(1, 2, 0) ** (1 / 2.2), 0, 1)[::-1]
        chm = np.clip(C / 30, 0, 1)[::-1]
        edge = (nd.grey_dilation(ws, 3) != ws)[::-1]
        a = (rgb * 255).astype(np.uint8); b = np.stack([chm * 255] * 3, -1).astype(np.uint8)
        c = a.copy(); c[edge & (ws[::-1] > 0) | (nd.grey_dilation(ws, 3)[::-1] > 0) & edge] = (255, 0, 255)
        m2 = mx[::-1]; c[nd.binary_dilation(m2, iterations=1)] = (255, 255, 0)
        Image.fromarray(np.concatenate([a, b, c], 1)).save(dbg)
    return np.stack([x, y, z, top, crown], 1)[keep].astype(np.float32)


def _one(a):
    try: return tile(*a)
    except Exception as ex:
        print('tile', a, 'FAILED', ex, flush=True); return None


def species(T, log=print):
    """(n,) archetype names for crowns T (x, y, z, h, crown)"""
    D = np.load(f'{W}/veg/veg.npz'); J = json.load(open(f'{W}/veg/veg_zones.json'))
    Z = D['zone']; x0, y1, res = D['zone_origin']; zones = J['zones']; HARCH = J['hint_arch']
    from scipy.spatial import cKDTree
    kh = cKDTree(np.stack([D['h_x'], D['h_y']], 1))
    dh, ih = kh.query(T[:, :2], distance_upper_bound=3.0)
    out = []
    for i, (x, y, z, h, cw) in enumerate(T):
        c, r = int((x - x0) / res), int((y1 - y) / res)
        zi = int(Z[r, c]) if 0 <= r < Z.shape[0] and 0 <= c < Z.shape[1] else 0
        zn = zones[zi]
        if np.isfinite(dh[i]):
            hn = HARCH[int(D['h_arch'][ih[i]])]
            if hn.endswith('palm'): out.append(hn); continue
        if zn['name'] not in OPEN:
            S = zn['stand']
            if S and hp(x, y, 33) < 0.75:
                ci, cj = math.floor(x / S), math.floor(y / S)
                out.append(_draw(zn['mix'], hp(ci, cj, 43)))
            else: out.append(_draw(zn['mix'], hp(x, y, 34)))
            continue
        if h >= 18: out.append(_draw(TALL_COAST if zn['name'] == 'coast_band' else TALL_URBAN, hp(x, y, 34)))
        else: out.append(_draw(YARD, hp(x, y, 34)))
    return out


def dedup(T):
    """drop the crowns a listed or register tree already stands in"""
    from scipy.spatial import cKDTree
    D = np.load(f'{W}/veg/veg.npz')
    pts = [np.stack([D['st_x'], D['st_y']], 1)]
    if os.path.exists(f'{W}/veg_src/engine_reg.npy'): pts.append(np.load(f'{W}/veg_src/engine_reg.npy')[:, :2])
    kd = cKDTree(np.concatenate(pts))
    d, _ = kd.query(T[:, :2])
    return d > np.maximum(2.5, 0.35 * T[:, 4])


if __name__ == '__main__':
    a = sys.argv[1:]; dbg = None
    if '--debug' in a: dbg = a[a.index('--debug') + 1]; a = a[:a.index('--debug')]
    if len(a) == 4:
        box = [float(v) for v in a]
    else:
        box = [-7000.0, -6000.0, 7600.0, 8600.0]
    import ground_prep as gp
    tiles = [(x, y) for x in np.arange(box[0], box[2], TILE) for y in np.arange(box[1], box[3], TILE)]
    tiles = [(x, y) for x, y in tiles if gp.GX0 <= x + TILE / 2 <= gp.GX1 and gp.GY0 <= y + TILE / 2 <= gp.GY1]
    t0 = time.time(); R = []
    if len(tiles) == 1:
        R = [tile(tiles[0][0], tiles[0][1], box[2], box[3], dbg)]
    else:
        from multiprocessing import Pool
        with Pool(int(os.environ.get('CAN_WORKERS', 3))) as pool:
            for k, r in enumerate(pool.imap_unordered(_one, [(x, y, min(x + TILE, box[2]), min(y + TILE, box[3])) for x, y in tiles])):
                if r is not None and len(r): R.append(r)
                if k % 20 == 0: print(f'{k}/{len(tiles)} tiles, {sum(len(q) for q in R)} crowns, {time.time() - t0:.0f}s', flush=True)
    T = np.concatenate([r for r in R if r is not None])
    n0 = len(T); T = T[dedup(T)]
    arch = species(T)
    names = sorted(set(arch)); ai = np.array([names.index(s) for s in arch], np.uint8)
    out = OUT if len(a) != 4 or os.environ.get('CAN_OUT') is None else os.environ['CAN_OUT']
    np.savez_compressed(os.environ.get('CAN_OUT', OUT), x=T[:, 0], y=T[:, 1], z=T[:, 2], height=T[:, 3], crown=T[:, 4], kind=ai, kind_names=np.array(names),
                        box=np.array(box), meta=json.dumps(dict(hmin=HMIN, ndvi_min=NDVI_MIN, crowns=n0, kept=len(T), date='2026-09-24',
                        sources='USGS 3DEP LiDAR CA_SanFrancisco_1_B23 (public domain), USDA NAIP 2022 (public domain), DataSF tkzw-k3nq, OSM (ODbL)')))
    u, c = np.unique(arch, return_counts=True)
    print('crowns', n0, 'kept (not a listed tree)', len(T), dict(zip(u.tolist(), c.tolist())), f'{time.time() - t0:.0f}s')
