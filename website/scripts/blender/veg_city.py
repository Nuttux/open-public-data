"""THE TREES OF ANOTHER CITY, in the files veg_hq.py reads (SF: veg_prep.py +
veg_canopy.py; this script never runs for SF and changes nothing of SF's).

    CITY=vancouver python3 veg_city.py register   # the public register -> veg_work/register.npz
    CITY=vancouver python3 veg_city.py canopy     # LiDAR crowns -> veg_work/canopy_raw.npz (~minutes: nohup it)
    CITY=vancouver python3 veg_city.py finish     # zones, species -> veg/veg.npz, veg/veg_zones.json, veg/canopy_trees.npz
    CITY=vancouver python3 veg_city.py preview    # veg_work/preview_city.png, preview_crop.png

Outputs go to <city folder>/veg/, the folder veg_hq reads once citysnap.sh
re-points the scripts at the city (its VEG path). THE CONTRACT (veg_hq.Kinds):
  veg.npz        st_x, st_y float32 (engine m), st_arch uint8 (index into
                 veg_zones.json `arch`), st_dbh float32 (INCHES), st_site uint8
                 (0 unknown, 1 sidewalk, 2 median, 3 yard); h_x, h_y float32,
                 h_arch uint8 (index into `hint_arch`); zone uint8 (rows north
                 first), zone_origin float64 [x0, y_top, res]
  veg_zones.json arch (veg_prep.ARCH), hint_arch (ARCH + conifer, broad),
                 street_mix {arch: share}, zones [{name, mix, stand}]
  canopy_trees.npz x, y, z, height, crown float32, kind uint8, kind_names str

Sources (city.json + DATA.md): the city's public tree register (Vancouver:
opendata.vancouver.ca `public-trees`, OGL-Vancouver: genus, species, height_m
class, diameter_cm), its park polygons (`parks-polygon-representation`,
OGL-Vancouver), a 1 m LiDAR DSM and DEM of one survey (LidarBC 2025, OGL-BC),
the city's land-cover raster (Metro Vancouver LCC 2020, 5 m, OGL-MV: its
Conifer / Deciduous classes, over ground or over paving) and the engine's
footprints (city_data). Crowns: veg_canopy's method (local maxima of the
smoothed nDSM, window growing with height, watershed) on nDSM > HMIN, inside
the land cover's tree classes (widened one 5 m cell), off every footprint
(widened 1 m); the survey's empty pixels (LidarBC 2025 leaves tall tower tops
empty) are never canopy. Species: register genus -> SF's kinds (veg_prep.arch_of
plus CITY_SPECIAL below); crowns take their leaf type from the land cover and
their kind from the register's own mix of that leaf type (CONVENTION: yards
look like the boulevards), or from their zone's mix. Zone mixes: conifer share
MEASURED on the land cover inside the zone; the split inside each leaf type is
a CONVENTION (the MIXES table)."""
import csv, json, math, os, re, sys, time, collections
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import cityconf as C
if C.SF: sys.exit('veg_city.py is for other cities (CITY=...); SF keeps veg_prep.py / veg_canopy.py')
from veg_prep import ARCH, AI, arch_of as sf_arch_of

OUT, WRK, SRC = C.work('veg'), C.work('veg_work'), C.work('veg_src')
for d in (OUT, WRK): os.makedirs(d, exist_ok=True)
CFG = C.CFG.get('veg', {})
TREES_CSV = f'{SRC}/public_trees.csv'
PARKS = f'{SRC}/parks_polygons.geojson'
DSM = CFG.get('dsm', C.work('lidar/bc2025/dsm')); DEM = CFG.get('dem', C.work('lidar/bc2025/dem'))
LCC = CFG.get('lcc', C.work('ground/src/LCC2020/LCC2020.tif'))
LCC_CON, LCC_DEC = (6, 15), (7, 16)          # Conifer, Conifer/Paved | Deciduous, Deciduous/Paved
LCC_WOOD = (6, 7)                            # tree over ground (the woods' cover rule)
HMIN = 2.5; TILE, PAD = 500.0, 25.0; RES = 4.0
CONIFERS = ('pine', 'cypress', 'redwood', 'column')

# genus/species -> SF kind, for what SF's table lacks or reads wrong here (first match wins)
CITY_SPECIAL = [
    (r'^(unidentified|unknown)', 'unknown'), (r'^(planting|stump)', 'none'),
    (r'^thuja plicata', 'redwood'),             # western redcedar: a 20-40 m cone, not an emerald hedge (GAP: no cedar proto; fir)
    (r'^(tsuga|larix)', 'redwood'),             # hemlock, larch (GAP: fir proto)
    (r'^callitropsis', 'column'),               # Nootka cypress: narrow, weeping
    (r'^cercidiphyllum', 'round'),              # katsura (SF's prefix rule read it as cercis)
    (r'^(sorbus|stewartia|hibiscus|rhododendron|rhus|heptacodium)', 'ornamental'),
    (r'^(amelanchier|laburnum)', 'cherry'),     # serviceberry, golden chain: small flowering trees
    (r'^(gymnocladus|castanea|pterocarya)', 'plane'),
    (r'^(davidia|ostrya|cladrastis|maackia)', 'round'),
]
def arch_of(genus, species):
    s = f'{genus} {species}'.strip().lower()
    for rx, a in CITY_SPECIAL:
        if re.search(rx, s): return a
    return sf_arch_of(s)


def register():
    R = list(csv.DictReader(open(TREES_CSV, encoding='utf-8-sig'), delimiter=';'))
    X, Y, A, D, H = [], [], [], [], []; miss = collections.Counter(); gen = collections.Counter()
    for r in R:
        if not r['geo_point_2d']: continue
        lat, lon = map(float, r['geo_point_2d'].split(','))
        x, y = C.proj(lon, lat)
        a = arch_of(r['genus_name'], r['species_name'])
        if a == 'unknown': miss[f"{r['genus_name']} {r['species_name']}"] += 1
        gen[(r['genus_name'].strip().upper(), a)] += 1
        X.append(x); Y.append(y); A.append(AI[a])
        try: D.append(float(r['diameter_cm']) / 2.54)
        except ValueError: D.append(0.0)
        try: H.append(float(r['height_m']))
        except ValueError: H.append(0.0)
    X, Y, A, D, H = (np.array(v, np.float32) for v in (X, Y, A, D, H)); A = A.astype(np.uint8)
    D[(D < 0.5) | (D > 120)] = 0.0
    c = collections.Counter(ARCH[a] for a in A)
    print('register trees', len(X), dict(c.most_common()))
    print('  unmapped (drawn from the street mix):', sum(miss.values()), miss.most_common(10))
    np.savez_compressed(f'{WRK}/register.npz', x=X, y=Y, arch=A, dbh=D, h=H)
    json.dump({f'{g}': a for (g, a), n in sorted(gen.items(), key=lambda kv: -kv[1])}, open(f'{WRK}/genus_kind.json', 'w'), indent=0)
    # the join the renderer makes: engine register points -> nearest listed tree <= 2.3 m
    import city_data
    from scipy.spatial import cKDTree
    E = np.array([t[:2] for t in city_data.trees(-1e6, -1e6, 1e6, 1e6)], np.float64)
    if len(E):
        d, _ = cKDTree(np.c_[X, Y]).query(E)
        print(f'join: engine register {len(E)}; nearest listed tree <=1 m {np.mean(d <= 1):.3f} <=2.3 m {np.mean(d <= 2.3):.3f} median {np.median(d):.2f} m')


# ── the rasters, sampled on an engine-frame 1 m grid ─────────────────────────
_FILES = {}
def _files():
    if not _FILES:
        import glob, rasterio
        for kind, d in (('dsm', DSM), ('dem', DEM)):
            for p in sorted(glob.glob(f'{d}/*.tif')):
                k = os.path.basename(p).split('_xli')[0]
                with rasterio.open(p) as s: _FILES.setdefault(k, {})[kind] = (p, tuple(s.bounds), s.crs.to_wkt())
        for k in [k for k, v in _FILES.items() if len(v) < 2]: del _FILES[k]
    return _FILES

def _sample(paths_bounds, U, V):
    """values of the rasters at UTM points U, V (nearest pixel), NaN = no data"""
    import rasterio
    out = np.full(U.shape, np.nan, np.float32)
    u0, u1, v0, v1 = U.min(), U.max(), V.min(), V.max()
    for p, b in paths_bounds:
        if b[0] > u1 or b[2] < u0 or b[1] > v1 or b[3] < v0: continue
        with rasterio.open(p) as s:
            w = rasterio.windows.from_bounds(max(u0, b[0]) - 2, max(v0, b[1]) - 2, min(u1, b[2]) + 2, min(v1, b[3]) + 2, s.transform)
            w = w.round_offsets().round_lengths().intersection(rasterio.windows.Window(0, 0, s.width, s.height))
            a = s.read(1, window=w).astype(np.float32); t = s.window_transform(w); nd = s.nodata
        c = np.floor((U - t.c) / t.a).astype(int); r = np.floor((V - t.f) / t.e).astype(int)
        k = (c >= 0) & (c < a.shape[1]) & (r >= 0) & (r < a.shape[0]) & np.isnan(out)
        v = a[r[k], c[k]]
        if nd is not None: v[v == nd] = np.nan
        v[v < -500] = np.nan
        out[k] = v
    return out

_TR = {}
def _to(crs_wkt, X, Y):
    from pyproj import Transformer
    if crs_wkt not in _TR: _TR[crs_wkt] = Transformer.from_crs('EPSG:4326', crs_wkt, always_xy=True)
    lon, lat = C.unproj(X, Y)
    return _TR[crs_wkt].transform(lon, lat)

_B = None
def _bldg():
    global _B
    if _B is None:
        import city_data
        s, w, n, e = C.BBOX; x0, y0 = C.proj(w, s); x1, y1 = C.proj(e, n)
        B = city_data.buildings(x0 - 100, y0 - 100, x1 + 100, y1 + 100)
        rings = [np.array(b['ring'], np.float32) for b in B if len(b['ring']) >= 3]
        _B = (rings, np.array([[r[:, 0].min(), r[:, 1].min(), r[:, 0].max(), r[:, 1].max()] for r in rings]))
    return _B

def tile(x0, y0, x1, y1):
    from scipy import ndimage as nd
    from PIL import Image, ImageDraw
    import rasterio
    F = _files()
    bx = (x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD); nx, ny = int(bx[2] - bx[0]), int(bx[3] - bx[1])
    gx = bx[0] + np.arange(nx) + 0.5; gy = bx[1] + np.arange(ny) + 0.5       # row 0 = south
    GX, GY = np.meshgrid(gx, gy)
    crs = next(iter(F.values()))['dsm'][2]
    U, V = _to(crs, GX.ravel(), GY.ravel())
    dsm = _sample([F[k]['dsm'][:2] for k in F], U, V); dem = _sample([F[k]['dem'][:2] for k in F], U, V)
    if np.isnan(dsm).all(): return None
    Cm = (dsm - dem).reshape(ny, nx)
    valid = np.isfinite(Cm); Cm = np.where(valid, np.clip(Cm, 0, 80), 0).astype(np.float32)   # empty = not canopy
    with rasterio.open(LCC) as s: lwkt = s.crs.to_wkt()
    Lu, Lv = _to(lwkt, GX.ravel(), GY.ravel())
    L = np.nan_to_num(_sample([(LCC, (-1e12, -1e12, 1e12, 1e12))], Lu, Lv), nan=0).astype(np.uint8).reshape(ny, nx)
    con = np.isin(L, LCC_CON); dec = np.isin(L, LCC_DEC)
    lt = nd.binary_dilation(con | dec, iterations=5)                           # one 5 m cell
    rings, bb = _bldg()
    im = Image.new('L', (nx, ny), 0); dr = ImageDraw.Draw(im)
    for i in np.nonzero((bb[:, 0] < bx[2]) & (bb[:, 2] > bx[0]) & (bb[:, 1] < bx[3]) & (bb[:, 3] > bx[1]))[0]:
        r = rings[i]; dr.polygon([(float(x - bx[0]), float(y - bx[1])) for x, y in r], fill=1)
    bm = nd.binary_dilation(np.array(im) > 0, iterations=1)
    M = (Cm > HMIN) & valid & lt & ~bm
    M = nd.binary_opening(M, iterations=1)
    S = nd.gaussian_filter(np.where(M, Cm, 0), 1.0)
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
    ws = nd.watershed_ift(np.clip(1000 - S * 25, 0, 65535).astype(np.uint16), mk); ws[~M] = 0
    idx = np.arange(1, n + 1)
    area = nd.sum(np.ones_like(ws), ws, idx); top = nd.maximum(Cm, ws, idx)
    ncon = nd.sum(con, ws, idx); ndec = nd.sum(dec, ws, idx)
    z = nd.mean(np.nan_to_num(dem.reshape(ny, nx)), ws, idx)
    x = bx[0] + pos[:, 1] + 0.5; y = bx[1] + pos[:, 0] + 0.5
    crown = 2 * np.sqrt(area / math.pi)
    keep = (x >= x0) & (x < x1) & (y >= y0) & (y < y1) & (area >= 4) & (top > HMIN)
    return np.stack([x, y, z, top, crown, (ncon > ndec).astype(np.float32)], 1)[keep].astype(np.float32)

def _one(a):
    try: return tile(*a)
    except Exception as ex:
        print('tile', a, 'FAILED', repr(ex), flush=True); return None

def canopy():
    from multiprocessing import Pool
    t0 = time.time(); _files(); _bldg()
    print('lidar tiles', len(_files()), 'footprints', len(_B[0]), f'{time.time() - t0:.0f}s', flush=True)
    s, w, n, e = C.BBOX; X0, Y0 = C.proj(w, s); X1, Y1 = C.proj(e, n)
    X0, Y0 = math.floor(X0 / TILE) * TILE, math.floor(Y0 / TILE) * TILE
    tiles = [(x, y, x + TILE, y + TILE) for x in np.arange(X0, X1, TILE) for y in np.arange(Y0, Y1, TILE)]
    R = []
    with Pool(int(os.environ.get('CAN_WORKERS', 3))) as pool:
        for k, r in enumerate(pool.imap_unordered(_one, tiles)):
            if r is not None and len(r): R.append(r)
            if k % 40 == 0: print(f'{k}/{len(tiles)} tiles, {sum(len(q) for q in R)} crowns, {time.time() - t0:.0f}s', flush=True)
    T = np.concatenate(R)
    np.save(f'{WRK}/canopy_raw.npy', T)
    print('crowns', len(T), 'conifer', int(T[:, 5].sum()), f'{time.time() - t0:.0f}s')


# ── zones ─────────────────────────────────────────────────────────────────────
# the split inside each leaf type (CONVENTION); the conifer share of a zone is measured
MIXES = {
    'con_forest': dict(redwood=0.85, pine=0.05, column=0.10),       # PNW woods: Douglas-fir, hemlock, redcedar -> the fir proto
    'dec_forest': dict(round=0.55, plane=0.45),                     # red alder (round), bigleaf maple (plane)
    'con_park': dict(redwood=0.70, pine=0.15, column=0.15),
    'dec_park': dict(plane=0.55, round=0.25, cherry=0.12, ornamental=0.08),
    'con_garden': dict(redwood=0.6, pine=0.2, column=0.2),
    'dec_garden': dict(round=0.4, plane=0.3, ornamental=0.2, cherry=0.1),
}
NAMED = [('stanley', r'^Stanley Park$', 'forest', 60), ('garden', r'^(Vandusen Botanical Garden|Queen Elizabeth Park)$', 'garden', 25)]

def zones():
    from PIL import Image, ImageDraw
    from scipy import ndimage as nd
    import rasterio
    s, w, n, e = C.BBOX; X0, Y0 = C.proj(w, s); X1, Y1 = C.proj(e, n)
    X0, Y0, X1, Y1 = math.floor(X0 - 200), math.floor(Y0 - 200), math.ceil(X1 + 200), math.ceil(Y1 + 200)
    W_, H_ = int((X1 - X0) / RES), int((Y1 - Y0) / RES)
    xs = X0 + (np.arange(W_) + 0.5) * RES; ys = Y1 - (np.arange(H_) + 0.5) * RES       # row 0 = north
    GX, GY = np.meshgrid(xs, ys)
    with rasterio.open(LCC) as s_: lwkt = s_.crs.to_wkt()
    U, V = _to(lwkt, GX.ravel(), GY.ravel())
    L = np.nan_to_num(_sample([(LCC, (-1e12, -1e12, 1e12, 1e12))], U, V), nan=0).astype(np.uint8).reshape(H_, W_)
    names = ['urban', 'park']; A = np.zeros((H_, W_), np.uint8)
    J = json.load(open(PARKS))['features']
    def rings(g):
        polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        return [[((C.proj(*p)[0] - X0) / RES, (Y1 - C.proj(*p)[1]) / RES) for p in poly[0]] for poly in polys]
    im = Image.fromarray(A); dr = ImageDraw.Draw(im)
    for f in J:
        for r in rings(f['geometry']): dr.polygon(r, fill=1)
    A = np.array(im)
    # a wood nobody named: > 60 % tree cover (LCC tree over ground) within 40 m, in a patch of >= 5 ha
    wood = np.isin(L, LCC_WOOD).astype(np.float32)
    rr = int(40 / RES); yy, xx = np.mgrid[-rr:rr + 1, -rr:rr + 1]; ker = ((xx ** 2 + yy ** 2) <= rr * rr).astype(np.float32)
    cov = nd.convolve(wood, ker / ker.sum(), mode='constant')
    dense = cov > 0.6; lab, nl = nd.label(dense); sz = nd.sum(dense, lab, np.arange(1, nl + 1)) * RES * RES
    big = np.isin(lab, 1 + np.nonzero(sz >= 50000)[0])
    names.append('forest'); A[big] = 2
    for nm, rx, kind, st in NAMED:
        k = len(names); names.append(nm)
        im = Image.fromarray(A); dr = ImageDraw.Draw(im)
        for f in J:
            if re.search(rx, f['properties']['park_name'] or ''):
                for r in rings(f['geometry']): dr.polygon(r, fill=k)
        A = np.array(im)
    # the mixes: conifer share measured on the land cover inside each zone
    base = {'urban': 'park', 'park': 'park', 'forest': 'forest', 'stanley': 'forest', 'garden': 'garden'}
    stand = {'urban': 0, 'park': 35, 'forest': 50, 'stanley': 60, 'garden': 25}
    Z, meas = [], {}
    for i, nm in enumerate(names):
        m = A == i; nc = int(np.isin(L[m], LCC_CON).sum()); ndc = int(np.isin(L[m], LCC_DEC).sum())
        c = nc / max(1, nc + ndc); meas[nm] = dict(conifer_share=round(c, 3), tree_cells=nc + ndc, cells=int(m.sum()))
        b = base[nm]; mix = {}
        for a, v in MIXES[f'con_{b}'].items(): mix[a] = mix.get(a, 0) + c * v
        for a, v in MIXES[f'dec_{b}'].items(): mix[a] = mix.get(a, 0) + (1 - c) * v
        Z.append(dict(name=nm, mix={a: round(v, 4) for a, v in mix.items() if v > 0.001}, stand=stand[nm]))
    print('zones', meas)
    return A, np.array([X0, Y1, RES]), Z, meas


def finish():
    from scipy.spatial import cKDTree
    R = np.load(f'{WRK}/register.npz'); T = np.load(f'{WRK}/canopy_raw.npy')
    ZA, ZO, Z, meas = zones()
    cnt = collections.Counter(ARCH[a] for a in R['arch'])
    mix_street = {a: n for a, n in cnt.items() if a not in ('unknown', 'none')}
    tot = sum(mix_street.values()); mix_street = {a: round(v / tot, 4) for a, v in mix_street.items()}
    # the register's own mix by leaf type: the yards' (CONVENTION: yards look like the boulevards)
    yard_con = {a: v for a, v in mix_street.items() if a in CONIFERS}
    yard_dec = {a: v for a, v in mix_street.items() if a not in CONIFERS}
    tall_dec = {a: v for a, v in yard_dec.items() if a in ('plane', 'round')}       # >= 18 m broadleaf: the big street kinds
    # drop crowns a listed tree already stands in
    d, _ = cKDTree(np.c_[R['x'], R['y']]).query(T[:, :2])
    keep = d > np.maximum(2.5, 0.35 * T[:, 4]); n0 = len(T); T = T[keep]
    from veg_canopy import hp, _draw
    x0, y1, res = ZO; arch = []
    for x, y, z, h, cw, cf in T:
        c_, r_ = int((x - x0) / res), int((y1 - y) / res)
        zi = int(ZA[r_, c_]) if 0 <= r_ < ZA.shape[0] and 0 <= c_ < ZA.shape[1] else 0
        zn = Z[zi]
        if zn['name'] != 'urban':
            mix = {a: v for a, v in zn['mix'].items() if (a in CONIFERS) == bool(cf)} or zn['mix']
            S = zn['stand']
            u = hp(math.floor(x / S), math.floor(y / S), 43) if S and hp(x, y, 33) < 0.75 else hp(x, y, 34)
            arch.append(_draw(mix, u)); continue
        if cf: arch.append(_draw(yard_con, hp(x, y, 34)))
        elif h >= 18: arch.append(_draw(tall_dec, hp(x, y, 34)))
        else: arch.append(_draw(yard_dec, hp(x, y, 34)))
    names = sorted(set(arch)); ai = np.array([names.index(s) for s in arch], np.uint8)
    src = ('LidarBC 2025 DSM/DEM 1 m (OGL-BC), Metro Vancouver LCC 2020 (OGL-MV), City of Vancouver public-trees + '
           'parks-polygon-representation (OGL-Vancouver), building footprints 2015 (engine, OGL-Vancouver)')
    np.savez_compressed(f'{OUT}/canopy_trees.npz', x=T[:, 0], y=T[:, 1], z=T[:, 2], height=T[:, 3], crown=T[:, 4], kind=ai,
                        kind_names=np.array(names), conifer=T[:, 5].astype(np.uint8),
                        meta=json.dumps(dict(hmin=HMIN, crowns=n0, kept=len(T), date=time.strftime('%Y-%m-%d'), sources=src,
                                             conventions='kind: leaf type from LCC, species from the register mix of that leaf type (urban) or the zone mix')))
    HN = ARCH + ['conifer', 'broad']
    hi = np.full(len(T), HN.index('broad'), np.uint8); hi[T[:, 5] > 0] = HN.index('conifer')
    np.savez_compressed(f'{OUT}/veg.npz', st_x=R['x'], st_y=R['y'], st_arch=R['arch'], st_dbh=R['dbh'],
                        st_site=np.zeros(len(R['x']), np.uint8), st_h=R['h'],
                        h_x=T[:, 0].copy(), h_y=T[:, 1].copy(), h_arch=hi, zone=ZA, zone_origin=ZO)
    json.dump(dict(arch=ARCH, hint_arch=HN, street_mix=mix_street, zones=Z,
                   meta=dict(city=C.CITY, sources=src, zone_measures=meas, yard_conifer_mix=yard_con, yard_broadleaf_mix=yard_dec,
                             notes='st_dbh inches (diameter_cm / 2.54); st_site 0 (the register has no site field); st_h = register height_m class; '
                                   'hints = every LiDAR crown, conifer/broad from LCC 2020; zone mixes: conifer share measured, split = convention (veg_city.MIXES)')),
              open(f'{OUT}/veg_zones.json', 'w'), indent=1)
    u, c = np.unique(arch, return_counts=True)
    print('canopy crowns', n0, 'kept (no listed tree)', len(T), dict(zip(u.tolist(), c.tolist())))
    print('street mix', mix_street)


# ── preview ──────────────────────────────────────────────────────────────────
COL = {'plane': (60, 150, 60), 'round': (30, 100, 40), 'cherry': (240, 120, 180), 'plum': (150, 40, 90), 'column': (120, 170, 40),
       'redwood': (0, 70, 90), 'pine': (40, 130, 130), 'cypress': (90, 110, 50), 'ornamental': (230, 180, 60), 'olive': (150, 160, 120),
       'euc': (150, 170, 190), 'pohu': (200, 40, 40), 'small_palm': (255, 140, 0), 'none': (0, 0, 0), 'unknown': (160, 160, 160)}

def preview():
    from PIL import Image, ImageDraw
    D = np.load(f'{OUT}/veg.npz'); Q = np.load(f'{OUT}/canopy_trees.npz'); J = json.load(open(f'{OUT}/veg_zones.json'))
    kn = [str(v) for v in Q['kind_names']]
    ZA = D['zone']; x0, y1, res = D['zone_origin']
    def draw(bx, px, path, disc):
        W_, H_ = int((bx[2] - bx[0]) / px), int((bx[3] - bx[1]) / px)
        zc = [(236, 236, 230), (215, 230, 205), (190, 215, 190), (175, 205, 185), (220, 225, 200)]
        c0 = int((bx[0] - x0) / res); r0 = int((y1 - bx[3]) / res); c1 = int((bx[2] - x0) / res); r1 = int((y1 - bx[1]) / res)
        zz = ZA[max(0, r0):r1, max(0, c0):c1]
        bg = np.array(zc, np.uint8)[np.minimum(zz, len(zc) - 1)]
        im = Image.fromarray(bg).resize((W_, H_), Image.NEAREST); dr = ImageDraw.Draw(im)
        def pts(X, Y, cols, rad):
            k = (X > bx[0]) & (X < bx[2]) & (Y > bx[1]) & (Y < bx[3])
            for x, y, c, r in zip(X[k], Y[k], np.array(cols, np.uint8).reshape(-1, 3)[k], rad[k]):
                u, v = (x - bx[0]) / px, (bx[3] - y) / px; rr = max(0.5, r / px) if disc else 0.6
                dr.ellipse([u - rr, v - rr, u + rr, v + rr], fill=tuple(int(q) for q in c))
        pts(Q['x'], Q['y'], [COL.get(kn[k], (0, 0, 0)) for k in Q['kind']], Q['crown'] / 2)
        pts(D['st_x'], D['st_y'], [COL.get(J['arch'][a], (0, 0, 0)) for a in D['st_arch']],
            np.clip(2.0 + 0.3 * D['st_dbh'], 2.5, 15) / 2)
        im.save(path); print('wrote', path, im.size)
    s, w, n, e = C.BBOX; X0, Y0 = C.proj(w, s); X1, Y1 = C.proj(e, n)
    draw((X0, Y0, X1, Y1), 8.0, f'{WRK}/preview_city.png', False)
    cx, cy = C.proj(-123.1345, 49.2860)             # West End, Nelson Park
    draw((cx - 500, cy - 500, cx + 500, cy + 500), 0.5, f'{WRK}/preview_crop.png', True)


# ── the PNW kit (V-VEG 05/10, veg_pnw.py; veg_hq reads these with VEG_KIT=pnw) ──
# veg/veg_pnw.npz, veg/veg_zones_pnw.json, veg/canopy_pnw.npz: the same contract as veg.npz / veg_zones.json /
# canopy_trees.npz, the archetypes veg_pnw's (genus + species + CULTIVAR: 'Kwanzan' a cherry, 'Atropurpurea' a purple
# plum, 'Dawyck' a column), st_h the register's height class (m). The finish() files stay as they were (other
# branches render with them).
# the split inside each leaf type, per zone (CONVENTION after the woods' published make-up: Stanley Park and Pacific
# Spirit = second-growth Douglas-fir, western redcedar, western hemlock, with bigleaf maple and red alder in the
# gaps); the conifer share of each zone is MEASURED on LCC 2020; None = the register's own mix of that leaf type
PNW_MIX = {
    'forest': (dict(v_dfir=0.45, v_cedar=0.33, v_hemlock=0.22), dict(v_maple=0.45, v_ash=0.55)),
    'stanley': (dict(v_dfir=0.42, v_cedar=0.36, v_hemlock=0.22), dict(v_maple=0.5, v_ash=0.5)),
    'park': (dict(v_dfir=0.38, v_cedar=0.37, v_hemlock=0.1, pine=0.15), None),
    'garden': (dict(v_dfir=0.25, v_cedar=0.4, v_hemlock=0.1, pine=0.25), None),
    'urban': (None, None),
}
PNW_STAND = {'urban': 0, 'park': 30, 'forest': 35, 'stanley': 35, 'garden': 20}
PNW_TALL = ('v_maple', 'v_oak', 'v_elm', 'v_ash', 'v_linden', 'v_beech')        # broadleaf crowns >= 18 m tall

def pnw():
    import veg_pnw as VP
    from scipy.spatial import cKDTree
    from veg_canopy import hp, _draw
    ARCH_P = ['unknown', 'none'] + list(VP.ARCHS) + ['pine']; AIP = {a: i for i, a in enumerate(ARCH_P)}
    R = list(csv.DictReader(open(TREES_CSV, encoding='utf-8-sig'), delimiter=';'))
    X, Y, A, D, H = [], [], [], [], []; miss = collections.Counter(); bycult = collections.Counter()
    for r in R:
        if not r['geo_point_2d']: continue
        lat, lon = map(float, r['geo_point_2d'].split(','))
        x, y = C.proj(lon, lat)
        a = VP.arch_of(r['genus_name'], r['species_name'], r.get('cultivar_name', ''))
        if a == 'unknown': miss[f"{r['genus_name']} {r['species_name']}"] += 1
        bycult[(r['genus_name'].strip().upper(), a)] += 1
        X.append(x); Y.append(y); A.append(AIP[a])
        try: D.append(float(r['diameter_cm']) / 2.54)
        except ValueError: D.append(0.0)
        try: H.append(float(r['height_m']))
        except ValueError: H.append(0.0)
    X, Y, D, H = (np.array(v, np.float32) for v in (X, Y, D, H)); A = np.array(A, np.uint8)
    D[(D < 0.5) | (D > 120)] = 0.0
    cnt = collections.Counter(ARCH_P[a] for a in A)
    print('register trees', len(X), dict(cnt.most_common()))
    print('  unmapped (drawn from the street mix):', sum(miss.values()), miss.most_common(12))
    mix_street = {a: n for a, n in cnt.items() if a not in ('unknown', 'none')}
    tot = sum(mix_street.values()); mix_street = {a: round(v / tot, 4) for a, v in mix_street.items()}
    reg_con = {a: v for a, v in mix_street.items() if a in VP.CONIFERS}
    reg_dec = {a: v for a, v in mix_street.items() if a not in VP.CONIFERS}
    tall_dec = {a: v for a, v in reg_dec.items() if a in PNW_TALL}
    # zones (as finish(): parks, LCC woods, Stanley Park, the two gardens), mixes from PNW_MIX
    ZA, ZO, Z0, meas = zones()
    Z = []
    for z in Z0:
        nm = z['name']; c = meas[nm]['conifer_share']; con, dec = PNW_MIX[nm]
        con = con or reg_con; dec = dec or reg_dec
        mix = {}
        for a, v in con.items(): mix[a] = mix.get(a, 0) + c * v / sum(con.values())
        for a, v in dec.items(): mix[a] = mix.get(a, 0) + (1 - c) * v / sum(dec.values())
        Z.append(dict(name=nm, mix={a: round(v, 4) for a, v in mix.items() if v > 0.001}, stand=PNW_STAND[nm]))
    # the LiDAR crowns (canopy_raw: x y z h crown conifer), those a listed tree stands in dropped (as finish())
    T = np.load(f'{WRK}/canopy_raw.npy')
    d, _ = cKDTree(np.c_[X, Y]).query(T[:, :2])
    T = T[d > np.maximum(2.5, 0.35 * T[:, 4])]
    x0, y1, res = ZO; arch = []; byz = collections.Counter()
    for x, y, z, h, cw, cf in T:
        c_, r_ = int((x - x0) / res), int((y1 - y) / res)
        zi = int(ZA[r_, c_]) if 0 <= r_ < ZA.shape[0] and 0 <= c_ < ZA.shape[1] else 0
        zn = Z[zi]
        if zn['name'] != 'urban':
            mix = {a: v for a, v in zn['mix'].items() if (a in VP.CONIFERS) == bool(cf)} or zn['mix']
            S = zn['stand']
            u = hp(math.floor(x / S), math.floor(y / S), 43) if S and hp(x, y, 33) < 0.6 else hp(x, y, 34)
            a = _draw(mix, u)
        elif cf: a = _draw(reg_con, hp(x, y, 34))
        elif h >= 18: a = _draw(tall_dec, hp(x, y, 34))
        else: a = _draw(reg_dec, hp(x, y, 34))
        arch.append(a); byz[(zn['name'], a)] += 1
    names = sorted(set(arch)); ai = np.array([names.index(s) for s in arch], np.uint8)
    src = ('LidarBC 2025 DSM/DEM 1 m (OGL-BC), Metro Vancouver LCC 2020 (OGL-MV), City of Vancouver public-trees + '
           'parks-polygon-representation (OGL-Vancouver), building footprints 2015 (engine, OGL-Vancouver)')
    np.savez_compressed(f'{OUT}/canopy_pnw.npz', x=T[:, 0], y=T[:, 1], z=T[:, 2], height=T[:, 3], crown=T[:, 4], kind=ai,
                        kind_names=np.array(names), conifer=T[:, 5].astype(np.uint8),
                        meta=json.dumps(dict(kit='veg_pnw', kept=len(T), date=time.strftime('%Y-%m-%d'), sources=src,
                                             conventions='leaf type from LCC 2020; species: zone mix (veg_city.PNW_MIX) or the register mix of that leaf type (urban)')))
    HN = ARCH_P + ['conifer', 'broad']
    hi = np.full(len(T), HN.index('broad'), np.uint8); hi[T[:, 5] > 0] = HN.index('conifer')
    np.savez_compressed(f'{OUT}/veg_pnw.npz', st_x=X, st_y=Y, st_arch=A, st_dbh=D, st_site=np.zeros(len(X), np.uint8), st_h=H,
                        h_x=T[:, 0].copy(), h_y=T[:, 1].copy(), h_arch=hi, zone=ZA, zone_origin=ZO)
    json.dump(dict(arch=ARCH_P, hint_arch=HN, street_mix=mix_street, zones=Z,
                   meta=dict(city=C.CITY, kit='veg_pnw', sources=src, zone_measures=meas, register_conifer_mix=reg_con,
                             register_broadleaf_mix=reg_dec, genus_arch={f'{g} -> {a}': n for (g, a), n in bycult.most_common(80)},
                             notes='st_dbh inches; st_h = register height_m (the class midpoint, m); zone mixes: conifer share '
                                   'measured on LCC 2020, split = convention (veg_city.PNW_MIX)')),
              open(f'{OUT}/veg_zones_pnw.json', 'w'), indent=1)
    print('zones', {z['name']: z['mix'] for z in Z})
    print('canopy crowns kept', len(T), 'by zone/kind', dict(sorted(byz.items(), key=lambda kv: -kv[1])[:30]))
    print('street mix', mix_street)


if __name__ == '__main__':
    {'register': register, 'canopy': canopy, 'finish': finish, 'preview': preview, 'pnw': pnw}[sys.argv[1]]()
