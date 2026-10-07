"""city_places.py (04/10 B2b, the Vancouver pilot's fixes 1-3): another city's big structures, signature models and lakes,
written as data for SF's own mechanisms (landmarks_hq + lm_places auto sidecars, city_data.overrides, water_hq.lakes).
CITY must be set (SF has its own: lm_prep.py, places/models/*_prep.py, landmarks/water.json).

  CITY=vancouver python3 city_places.py [all|lakes|big|models]

lakes   landmarks/water.json: every inland water body of the land cover (class 'water' of ground/ground_cls_raw.npy, Metro
        Vancouver LCC 2020) that the render's sea (city/sea.png) does not hold: Lost Lagoon, Trout Lake, ... ; drawn by
        water_hq.lakes as objects 'lm.lm_lake*', which the class pass codes as water (hq_city _ai_passes), so the post's
        guard (water = render) holds there. (van_vp1: Lost Lagoon was terrain, half of it painted as grass.)
big     places/overrides.json: OSM building=stadium|sports_hall|sports_centre|grandstand or leisure=stadium|sports_centre|
        sports_hall|ice_rink (newbuildings/osm tiles) + a seed list -> the engine records under each outline get a capped
        height, the plain 'works' wall (no office window grid) and a light membrane roof. (van_vp1: BC Place stood as a
        59 m office drum.)
models  places/models/v_*.npz + .json (auto sidecars) and landmarks/skip_gids.json: BC Place, Rogers Arena, Canada Place,
        Harbour Centre, Vancouver House - simple faithful silhouettes (heights: the engine's LiDAR records and public
        figures in each builder's docstring; shapes: the 2015 footprints / OSM outlines; looks: the Commons photos listed in
        landmarks/list.json, looked at, never copied). Recognisable from the z9 aerial view, not detailed.
Run after any change; then citysnap (the snapshot freezes these files) and lmk_pod.sh ships landmarks/ + places/."""
import os, sys, json, math, glob
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cityconf as C
if C.CITY == 'sf': sys.exit('city_places.py is for another city (CITY=...)')
for k_, v_ in (('NEWB', '1'), ('HEIGHTS', '1'), ('TOWERS', '1')): os.environ.setdefault(k_, str(C.CFG.get('env', {}).get(k_, v_)))
os.environ['PLACES_OV'] = '0'      # the records as the generator gets them before the overrides written here
import lm_kit, lm_dem
from lm_kit import hexc
lm_dem.ROOT = C.work('landmarks', 'dem')
from shapely.geometry import Polygon, Point, shape
from shapely import affinity
MODELS = os.environ.get('PLACES_MODELS_OUT') or C.work('places', 'models'); os.makedirs(MODELS, exist_ok=True)   # (FIX4) a test set elsewhere
SKIP_OUT = os.environ.get('LM_SKIP_OUT') or C.work('landmarks', 'skip_gids.json')

def osm_ways():
    """{way id: (tags, shapely polygon in world m)} of the city's OSM building tiles (newbuildings/osm)"""
    out = {}
    for f in glob.glob(C.work('newbuildings', 'osm', '*.json')):
        for e in json.load(open(f)).get('elements', []):
            g = e.get('geometry') or []
            if e.get('type') != 'way' or len(g) < 4 or e['id'] in out: continue
            try: p = Polygon([C.proj(q['lon'], q['lat']) for q in g]).buffer(0)
            except Exception: continue
            if p.is_valid and p.area > 1: out[e['id']] = (e.get('tags', {}), p)
    return out

_B = None
def recs():
    global _B
    if _B is None:
        import city_data; _B = city_data.buildings(-9000, -9000, 9000, 9000)
    return _B

def gids_in(poly, grow=1.0):
    pg = poly.buffer(grow)
    return [b for b in recs() if pg.contains(Point(b['cx'], b['cy']))]

# ── lakes ─────────────────────────────────────────────────────────────────────
def lakes(min_m2=1000.0):
    import cv2
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    M = json.load(open(C.work('ground', 'ground_meta.json'))); raw = C.work('ground', 'ground_cls_raw.npy')
    G = np.load(raw if os.path.exists(raw) else C.work('ground', 'ground_cls.npy'), mmap_mode='r')
    wi = M['classes'].index('water'); k = 2                                   # 2 m cells
    ny, nx = G.shape[0] // k, G.shape[1] // k
    W = (np.asarray(G[:ny * k, :nx * k]) == wi).reshape(ny, k, nx, k).mean((1, 3)).astype(np.float32)
    W = cv2.GaussianBlur(W, (0, 0), 1.5) > 0.5                               # row 0 = south
    sj = json.load(open(C.work('city', 'sea.json'))); sp = np.asarray(Image.open(C.work('city', 'sea.png')))[:, :, 0] > 127
    sres = sj['w'] / sp.shape[1]; res = M['res'] * k
    ys = M['y0'] + (np.arange(ny) + 0.5) * res; xs = M['x0'] + (np.arange(nx) + 0.5) * res
    rr = np.clip(((sj['oy'] + sj['h'] - ys) / sres).astype(int), 0, sp.shape[0] - 1); cc = np.clip(((xs - sj['ox']) / sres).astype(int), 0, sp.shape[1] - 1)
    S = sp[rr][:, cc]                                                         # the render's sea on the class grid
    Sd = cv2.dilate(S.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))) > 0      # +12 m
    L = W & ~Sd
    n, lab, st, _ = cv2.connectedComponentsWithStats(L.astype(np.uint8), connectivity=8)
    S8 = cv2.dilate(S.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))) > 0      # +20 m
    S14 = cv2.dilate(S.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))) > 0      # +14 m: the cut above + one cell
    out = []
    for i in range(1, n):
        a = st[i, cv2.CC_STAT_AREA] * res * res
        if a < min_m2: continue
        m = (lab == i)
        if (m & S8).sum() > 0.25 * m.sum(): continue                          # a fringe of the sea (docks, marinas), not a lake
        if (m & S14).any(): continue      # (fix4) touches the sea (cut off it only by the +12 m margin): tidal flat, slough, marina = sea level, no lake of its own
        cs, hier = cv2.findContours(m.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        def world(c):
            c = cv2.approxPolyDP(c, 0.6, True)[:, 0, :].astype(np.float64)
            return [(round(M['x0'] + (p[0] + 0.5) * res, 2), round(M['y0'] + (p[1] + 0.5) * res, 2)) for p in c]
        for j, c in enumerate(cs):
            if hier[0][j][3] != -1 or len(c) < 4: continue
            ring = world(c); holes = [world(cs[h]) for h in range(len(cs)) if hier[0][h][3] == j and len(cs[h]) >= 4]
            pa = Polygon(ring)
            if pa.area < min_m2: continue
            out.append(dict(id=f'v_lake_{len(out)}', kind='lake', name=None, ring=ring, holes=holes, area_m2=round(pa.area)))
    for w in out:   # the level: over the lake bed's own bumps (the DTM over water is noisy: the lowest third + 0.12 left islands of terrain)
        p = Polygon(w['ring'], w['holes']).buffer(-2.0)
        if p.is_empty: continue
        x0_, y0_, x1_, y1_ = p.bounds; X, Y = np.meshgrid(np.arange(x0_, x1_, 3.0), np.arange(y0_, y1_, 3.0))
        from shapely import contains_xy
        m = contains_xy(p, X, Y)
        if m.sum() < 4: continue
        zz = lm_dem.sample_arr(X[m], Y[m]); zz = zz[~np.isnan(zz)]
        if len(zz): w['z'] = round(float(np.percentile(zz, 97)) + 0.15, 2)
    names = {'Lost Lagoon': (-123.142, 49.2945), 'Trout Lake': (-123.0625, 49.2565), 'Beaver Lake': (-123.141, 49.3045)}
    for w in out:
        p = Polygon(w['ring'])
        for nm, ll in names.items():
            if p.buffer(30).contains(Point(*C.proj(*ll))): w['name'] = nm
    os.makedirs(C.work('landmarks'), exist_ok=True)
    json.dump(dict(source='city_places.py lakes: Metro Vancouver Land Cover Classification 2020 (5 m) water class not in city/sea.png; '
                          'Open Government Licence - Metro Vancouver', water=out), open(C.work('landmarks', 'water.json'), 'w'))
    print('LAKES', len(out), 'named', {w['name']: (w['area_m2'], w.get('z')) for w in out if w['name']}, 'largest', sorted(w['area_m2'] for w in out)[-6:])
    miss = [nm for nm in names if nm not in {w['name'] for w in out}]
    if miss: print('  not in the land cover as open water:', miss)

# ── big structures (overrides) ───────────────────────────────────────────────
BIG_B = {'stadium', 'sports_hall', 'sports_centre', 'grandstand'}
BIG_L = {'stadium', 'sports_centre', 'sports_hall', 'ice_rink'}
# seed: structures OSM does not tag as sport (way id: (cap m, roof colour, why))
BIG_SEED = {85240507: (26.0, '#7d8c5a', 'Vancouver Convention Centre West: a long low hall under a 2.4 ha living roof')}

def big(model_gids):
    O = osm_ways(); ov = {}; rows = []
    for wid, (t, p) in O.items():
        seed = BIG_SEED.get(wid)
        if not seed and not (t.get('building') in BIG_B or t.get('leisure') in BIG_L): continue
        if seed is None and 'building' not in t: continue
        stadium = t.get('building') == 'stadium' or t.get('leisure') == 'stadium'
        cap, roof, why = seed or ((32.0 if stadium else 14.0), '#d9d8d2', f"OSM way/{wid} building={t.get('building')} leisure={t.get('leisure')} {t.get('name') or ''}".strip())
        for b in gids_in(p):
            if b['gid'] in model_gids: continue
            if b['gid'] >= 2_000_000_000 and b.get('parent') is not None:     # a LiDAR tower split of the hall: the hall has none
                ov[str(b['gid'])] = dict(skip=True, why='tower split of a big structure: ' + why); continue
            e = dict(style='works', roof='flat', roof_col=roof, why=why)
            if b['h'] > cap: e['h'] = cap
            ov[str(b['gid'])] = e; rows.append((b['gid'], round(b['h'], 1), e.get('h'), t.get('name')))
    if os.path.exists(OSM5):                                            # fix5: Playland's halls and booths, plain and low
        _, _, inside, gone = playland_parts()
        for b in inside:
            if b['gid'] in model_gids or b['gid'] in gone or str(b['gid']) in ov: continue
            e = dict(style='works', roof='flat', roof_col='#d9d6cc', why='Playland: a park hall or booth, not a city building')
            if b['h'] > 7.0: e['h'] = 7.0
            ov[str(b['gid'])] = e
    path = C.work('places', 'overrides.json'); j = json.load(open(path)) if os.path.exists(path) else {}
    j['gids'] = ov; j['note'] = 'city_places.py big: stadiums, arenas, rinks, sports halls, convention halls (OSM tags + BIG_SEED) - capped height, plain wall, membrane roof'
    json.dump(j, open(path, 'w'), indent=0)
    print('BIG', len(ov), 'records;', sum(1 for r in rows if r[2]), 'capped; e.g.', [r for r in rows if r[3]][:8])

# ── models ───────────────────────────────────────────────────────────────────
def ccw(r):
    a2 = sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))
    return r if a2 > 0 else r[::-1]

def resample(poly, n):
    """n points evenly along a polygon's outline, counter-clockwise"""
    ext = poly.exterior; L = ext.length
    pts = [ext.interpolate(L * i / n) for i in range(n)]
    return ccw([(q.x, q.y) for q in pts])

def scaled(ring, c, s):
    return [(c[0] + (x - c[0]) * s, c[1] + (y - c[1]) * s) for x, y in ring]

def save(K, key, name, built, datum, z0, clear, gids, note, pad=900.0):
    out = {}
    for mat, (V, F, Cc, S) in K.m.items():
        out[f'{mat}|V'] = np.array(V, np.float32); out[f'{mat}|I'] = np.array([i for f in F for i in f], np.int32)
        out[f'{mat}|N'] = np.array([len(f) for f in F], np.int32); out[f'{mat}|C'] = np.array(Cc, np.float32); out[f'{mat}|S'] = np.array(S, bool)
    np.savez_compressed(os.path.join(MODELS, key + '.npz'), **out)
    rings = [[list(map(float, p)) for p in r] for r in clear]
    json.dump(dict(auto=True, name=name, built=built, gone=None, note=note, pad=pad, z0=float(z0), datum=list(map(float, datum)),
                   clear=rings, gids=[int(g) for g in gids], notree=rings), open(os.path.join(MODELS, key + '.json'), 'w'))
    print('MODEL', key, 'faces', sum(len(v[1]) for v in K.m.values()), 'z0 %.1f' % z0, 'gids', list(gids))

def z_at(x, y):
    v = lm_dem.sample(x, y)
    if v is None or (isinstance(v, float) and math.isnan(v)):
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'city_run')); import citycfg
        v = float(citycfg.dem()(np.array([x]), np.array([y]))[0])
    return float(v)

def rec(gid):
    return next(b for b in recs() if b['gid'] == gid)

def axes(poly):
    """(centre, unit long axis, unit short axis, half long, half short) of the minimum rotated rectangle"""
    r = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
    e1 = np.subtract(r[1], r[0]); e2 = np.subtract(r[2], r[1])
    if np.hypot(*e1) < np.hypot(*e2): e1, e2 = e2, e1
    c = np.mean(r, 0)
    return c, e1 / np.hypot(*e1), e2 / np.hypot(*e2), np.hypot(*e1) / 2, np.hypot(*e2) / 2

WHITE = hexc('#f1f1ec'); MEMB = hexc('#ecebe5'); CONC = hexc('#c9c8c2'); DARK = hexc('#2d3338'); STEEL = hexc('#8f969b')

def m_bcplace():
    """BC PLACE (1983; 2011 cable-supported retractable roof): an oval bowl, its white fabric roof hung by cables from 36 masts
    standing round the rim. Footprint gid 68367; rim ~35 m, roof crown ~55 m, mast tops ~80 m (2025 LiDAR maxima)."""
    b = rec(68367); P = Polygon(b['ring']).buffer(0); c = (P.centroid.x, P.centroid.y); z0 = z_at(*c); K = lm_kit.Kit(); N = 72
    R = resample(P.simplify(1.0), N)
    K.prism('lm_matte', scaled(R, c, 0.985), -3, 10, DARK, top=False)                         # glazed concourse
    K.prism('lm_paint', scaled(R, c, 0.99), 10, 34, CONC, top=False)                           # the bowl's wall
    K.prism('lm_paint', scaled(R, c, 1.0), 34, 35.2, WHITE, top=False)                         # the rim
    prof = [(1.0, 35.2), (0.86, 41.0), (0.7, 46.5), (0.52, 51.0), (0.36, 53.8), (0.3, 54.4)]
    rings = [[(x, y, z) for x, y in scaled(R, c, s)] for s, z in prof]
    K.loft('lm_paint', rings, MEMB, cap_top=False)
    K.face('lm_matte', [(x, y, 54.6) for x, y in scaled(R, c, 0.3)], hexc('#d9dcdd'))         # the retractable centre, closed
    for i in range(0, N, 2):                                                                  # 36 masts, cables to the roof
        x, y = R[i]; dx, dy = x - c[0], y - c[1]; s = 1.0 / math.hypot(dx, dy)
        foot = (x + dx * s * 2.0, y + dy * s * 2.0, 26.0); top = (x + dx * s * 5.0, y + dy * s * 5.0, 79.0)
        K.cyl('lm_paint', foot, top, 0.9, WHITE, n=8, r1=0.55)
        r_ = scaled([R[i]], c, 0.52)[0]
        K.tube('lm_steel', [top, (r_[0], r_[1], 51.3)], 0.18, STEEL, n=5)
        q = [scaled([R[i]], c, s)[0] for s, _ in prof]
        K.tube('lm_steel', [(q[k][0], q[k][1], prof[k][1] + 0.15) for k in range(len(prof))], 0.22, STEEL, n=4)
    return K, c, z0, [list(P.buffer(3).exterior.coords)], [68367]

def m_rogers():
    """ROGERS ARENA (1995): a big rounded box, glazed at the foot, grey metal above, a light flat roof stepped in at the
    edge. Footprint gid 68388; walls ~30 m, roof ~36 m (the record's 54 m is the LiDAR's rooftop gear and scoreboard masts)."""
    b = rec(68388); P = Polygon(b['ring']).buffer(0); c = (P.centroid.x, P.centroid.y); z0 = z_at(*c); K = lm_kit.Kit(); N = 64
    R = resample(P.simplify(1.0), N)
    K.prism('lm_matte', scaled(R, c, 0.985), -3, 9, DARK, top=False)
    K.prism('lm_paint', scaled(R, c, 0.995), 9, 30, hexc('#7d878e'), top=False)
    rings = [[(x, y, z) for x, y in scaled(R, c, s)] for s, z in ((1.0, 30), (0.9, 33.5), (0.8, 35.5))]
    K.loft('lm_paint', rings, hexc('#e3e2dc'))
    for i in range(6):
        u = (i - 2.5) * 9.0; x, y = c[0] + u, c[1]
        K.prism('lm_matte', [(x - 2.5, y - 2), (x + 2.5, y - 2), (x + 2.5, y + 2), (x - 2.5, y + 2)], 35.5, 37.3, hexc('#a5a8a8'))
    return K, c, z0, [list(P.buffer(3).exterior.coords)], [68388]

def _lidar_win(key, box):
    """(FIX4 07/10) the 2025 LiDAR DSM / DEM on a 1 m world grid over box (rows from the north), cached in landmarks/work so a
    rerun needs no tiles: (x0, y1, dsm, dem)"""
    f = C.work('landmarks', 'work', f'fix4_{key}.npz')
    if not os.path.exists(f):
        import lidar_city as LC
        X, Y, S, D = LC.grid(box, 1.0)
        np.savez_compressed(f, x0=float(box[0]), y1=float(box[3]), dsm=S.astype(np.float32), dem=D.astype(np.float32))
    z = np.load(f); return float(z['x0']), float(z['y1']), z['dsm'], z['dem']

def _mask_polys(m, x0, y1, simp=1.0, min_area=40.0):
    """shapely polygons (world m) of a boolean 1 m mask (rows from y1 down)"""
    import cv2
    cs, _ = cv2.findContours(m.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE); out = []
    for c in cs:
        if len(c) < 3: continue
        q = Polygon([(x0 + px + 0.5, y1 - py - 0.5) for px, py in c[:, 0, :]]).buffer(0.5).simplify(simp)
        if q.area >= min_area: out.append(q)
    return out

def m_canadaplace():
    """CANADA PLACE (1986): the pier at the foot of Howe St - Vancouver Convention Centre East under the sails, the cruise-ship
    terminal on its decks, the Pan Pacific hotel block at the shore end, a lower rounded roof at the bow; footprint gid 68768.
    (FIX4 07/10) The audit: 'crude white box, 3 sails', painted as red-roofed houses and glass pyramids. The 2025 LiDAR DSM
    (over the water the DEM is empty: heights are DSM - z0) gives every part: the hotel block (DSM > 60 m, roof p85), the
    hall (24-60 m, its roof the median ~28 m DSM), the bow roof (~26 m) and the sails - TEN peaks in two rows of five
    (47-55 m DSM, ~25 m over the hall roof): the membrane is the measured DSM itself (1 m, lightly smoothed) over the sail
    band, white, a steel mast at every peak; the deck at its DSM median (~16 m) all round with the promenade's railing,
    dark glazing under the deck edge, the bow and the shore end glazed (the glass facades). Commons photos (refs
    port-terminals 51, downtown 51: viewing only) for the look."""
    import cv2
    from scipy import ndimage as nd
    import shapely
    b = rec(68768); P = Polygon(b['ring']).buffer(0); cc, U, V, hl, hs = axes(P); z0 = z_at(*P.representative_point().coords[0]); K = lm_kit.Kit()
    land = np.array(C.proj(-123.1125, 49.2875))
    if np.dot(np.subtract(land, cc), U) > 0: U = -U                   # U points out to sea
    bx = [math.floor(v) - 10 for v in P.bounds[:2]] + [math.ceil(v) + 10 for v in P.bounds[2:]]
    x0, y1, S, _ = _lidar_win('canadaplace', tuple(bx))
    H_, W_ = S.shape; XX, YY = np.meshgrid(x0 + np.arange(W_) + 0.5, y1 - np.arange(H_) - 0.5)
    inP = shapely.contains_xy(P.buffer(1.0), XX, YY); Sf = np.where(inP, np.nan_to_num(S, nan=0.0), 0.0)
    R = ccw(list(P.simplify(0.8).exterior.coords)[:-1])
    tower = nd.binary_opening(Sf > 60, iterations=2)
    hall = nd.binary_opening((Sf > 23.5) & ~nd.binary_dilation(tower, iterations=3), iterations=3)
    deck = float(np.median(Sf[inP & ~hall & ~tower & (Sf > 8)])) - z0 if (inP & ~hall & ~tower & (Sf > 8)).any() else 12.0
    WALL = hexc('#e7e6df'); GL = hexc('#55656c'); ROOF = hexc('#d2d1ca')
    # the pier and its decks (the cruise terminal's level): white walls, dark glazing under the deck edge
    K.prism('lm_paint', R, -3, deck, WALL, top=True, top_col=hexc('#c4c3bc'), top_mat='lm_matte')
    K.prism('lm_matte', scaled(R, (P.centroid.x, P.centroid.y), 1.002), 1.5, deck - 2.0, GL, top=False)
    # the promenade: a pale walk 4 m wide round the deck, its railing a thin white band
    ring_in = P.buffer(-4.0)
    if not ring_in.is_empty:
        Ri = ccw(list(ring_in.simplify(0.8).exterior.coords)[:-1]) if ring_in.geom_type == 'Polygon' else None
        K.prism('lm_paint', scaled(R, (P.centroid.x, P.centroid.y), 1.003), deck, deck + 1.1, hexc('#f4f3ee'), top=False)
        if Ri: K.prism('lm_matte', Ri, deck, deck + 0.25, hexc('#bdb9ad'), top=True)
    # the sails' band (DSM > hall roof + 3 m): where it ends seaward the bow begins
    zroof = float(np.median(Sf[hall])) if hall.any() else 28.0
    sail = nd.binary_opening(hall & (Sf > zroof + 3.0), iterations=1)
    sail &= ~nd.binary_dilation(tower, iterations=25)                     # not the hotel's terraces
    lab, n = nd.label(sail); sz = nd.sum(sail, lab, range(1, n + 1)); sail = np.isin(lab, 1 + np.nonzero(sz >= 150)[0])
    us = (XX[sail] - cc[0]) * U[0] + (YY[sail] - cc[1]) * U[1]; ucut = float(us.max()) + 8.0 if len(us) else hl
    # the hall and the bow: each part at its own measured roof, white walls glazed at the foot
    from shapely.geometry import box as sbox
    cut = affinity.rotate(sbox(ucut, -500, ucut + 1000, 500), math.degrees(math.atan2(U[1], U[0])), origin=(0, 0))
    cut = affinity.translate(cut, cc[0], cc[1]); parts = []
    for q in _mask_polys(hall, x0, y1, simp=1.2, min_area=300.0):
        for g_, bow_ in ((q.difference(cut), False), (q.intersection(cut), True)):
            for gg in getattr(g_, 'geoms', [g_]):
                if gg.geom_type == 'Polygon' and gg.area >= 150: parts.append((gg, bow_))
    for q, bow in parts:
        qi = shapely.contains_xy(q, XX, YY) & hall
        if not qi.any(): continue
        zr = float(np.percentile(Sf[qi & ~sail], 40) if (qi & ~sail).any() else np.percentile(Sf[qi], 40)) - z0
        Rq = ccw(list(q.exterior.coords)[:-1])
        K.prism('lm_paint', Rq, deck, zr, WALL if not bow else hexc('#e9e7dc'), top=True, top_col=ROOF if not bow else hexc('#e6dfc6'), top_mat='lm_matte')
        K.prism('lm_matte', scaled(Rq, (q.centroid.x, q.centroid.y), 1.004), deck + 0.3, deck + 4.0, GL, top=False)
        if bow: K.prism('lm_matte', scaled(Rq, (q.centroid.x, q.centroid.y), 1.006), deck + 4.0, zr - 1.5, hexc('#7d9097'), top=False)   # the bow's glass
    # the hotel block at the shore end: banded white with dark window strips
    tp = _mask_polys(tower, x0, y1, simp=1.0, min_area=200.0); ztop = 0.0
    for q in tp:
        qi = shapely.contains_xy(q, XX, YY) & tower; zt = float(np.percentile(Sf[qi], 85)) - z0; ztop = max(ztop, zt)
        Rq = ccw(list(q.exterior.coords)[:-1]); c_ = (q.centroid.x, q.centroid.y)
        K.prism('lm_paint', Rq, deck, zt, hexc('#e3e1d9'), top=True, top_col=hexc('#a9a8a2'), top_mat='lm_matte')
        for k in range(int((zt - deck - 6) // 3.2)):
            z_ = deck + 4 + k * 3.2; K.prism('lm_matte', scaled(Rq, c_, 1.004), z_, z_ + 1.7, hexc('#3c4a52'), top=False)
    # the sails: the measured membrane (DSM > roof + 3 m in the hall), 1 m cells, white; masts at the peaks
    Zs = nd.gaussian_filter(np.where(sail, Sf, zroof), 0.8)
    grow = nd.binary_dilation(sail, iterations=2)
    Zs = np.where(sail, np.maximum(Zs, zroof), zroof) - z0
    idx = -np.ones(sail.shape, np.int64); ys, xs = np.nonzero(grow); idx[ys, xs] = np.arange(len(ys))
    verts = [(x0 + j + 0.5, y1 - i - 0.5, float(Zs[i, j])) for i, j in zip(ys, xs)]
    faces = []
    a, b_, c_, d_ = idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]
    ok = (a >= 0) & (b_ >= 0) & (c_ >= 0) & (d_ >= 0)
    for i, j in zip(*np.nonzero(ok)): faces.append((int(a[i, j]), int(d_[i, j]), int(c_[i, j]), int(b_[i, j])))
    K.mesh('lm_paint', verts, faces, hexc('#f6f6f2'), smooth=True)
    # the masts stand at the sail band's two long edges, one at each end of every cross ridge (the DSM's bright points)
    edge = nd.distance_transform_edt(sail) <= 4.0
    mx = nd.maximum_filter(np.where(sail, Sf, 0), size=13); pk = sail & edge & (Sf >= mx) & (Sf > zroof + 16)
    pys, pxs = np.nonzero(pk); peaks = []
    for i, j in sorted(zip(pys, pxs), key=lambda t: -Sf[t]):
        x, y = x0 + j + 0.5, y1 - i - 0.5
        if all(math.hypot(x - p[0], y - p[1]) > 11 for p in peaks): peaks.append((x, y, float(Sf[i, j]) - z0))
    for x, y, z in peaks: K.cyl('lm_steel', (x, y, z - 6.0), (x, y, z + 3.5), 0.3, STEEL, n=6, r1=0.15)
    print('canada place: deck %.1f, roof %.1f, hall parts %d, hotel %.1f m, sail cells %d, peaks %d (%s)' %
          (deck, zroof - z0, len(parts), ztop, int(sail.sum()), len(peaks), ', '.join('%.0f' % p[2] for p in peaks)))
    return K, tuple(cc), z0, [list(P.buffer(3).exterior.coords)], [68768]

def m_harbourctr():
    """HARBOUR CENTRE (1977): a slim concrete office shaft with two exterior glass elevators running up one face, crowned by
    the Lookout: a round 'flying saucer' far wider than the shaft (its underside a shallow cone, a band of glazing, the
    revolving restaurant's level), a low drum and a mast on top; rising out of a block-wide podium (the old Spencer's store,
    7 floors). Engine gid 68728 is the whole block at the LiDAR's 133 m: here the podium at 30 m and the tower at its spot
    (landmarks/list.json engine_xy); Lookout rim ~41 m across, its roof ~128 m, mast to ~160 m.
    (VT2 06/10) vt1 read the old one as a white cylinder with dark stripes and a dome cap: a 22 m shaft under a 35 m
    smooth-shaded lathe that closed in a dome, 8 m black strips on all four faces. Now: a 19 m shaft with chamfered corners
    and narrow window slots, the elevators as two bronze glass strips, a flat-shaded saucer 2.2x the shaft, a flat roof."""
    b = rec(68728); P = Polygon(b['ring']).buffer(0); _, U, V, _, _ = axes(P); K = lm_kit.Kit()
    t = np.array([1318.0, 3148.1]); z0 = z_at(*t)
    R = ccw(list(P.simplify(0.5).exterior.coords)[:-1])
    zp = [z_at(*p) - z0 for p in R]; zb = min(zp) - 2
    K.prism('lm_paint', R, zb, 30, hexc('#b9b3a6'), top=True, top_col=hexc('#9c9a93'), top_mat='lm_matte')
    K.prism('lm_matte', scaled(R, (P.centroid.x, P.centroid.y), 1.002), 4, 28, hexc('#3a4046'), top=False)   # the podium's dark glazing bands
    K.prism('lm_paint', R, 28, 30.5, hexc('#c9c3b6'), top=False)
    h, ch = 9.5, 2.5                                   # the shaft: 19 m square, corners chamfered 2.5 m
    oct_ = [(-h + ch, -h), (h - ch, -h), (h, -h + ch), (h, h - ch), (h - ch, h), (-h + ch, h), (-h, h - ch), (-h, -h + ch)]
    K.prism('lm_paint', ccw([tuple(t + U * a + V * b_) for a, b_ in oct_]), 30, 117, hexc('#c4bdb0'), top=True)
    # the office windows: narrow dark slots, 4 a face (concrete reads between them)
    for A, B_ in ((U, V), (V, U), (-U, V), (-V, U)):
        for w in (-5.4, -1.8, 1.8, 5.4):
            g = [t + A * (h + 0.1) + B_ * (w - 0.55), t + A * (h + 0.1) + B_ * (w + 0.55)]
            K.prism('lm_matte', ccw([tuple(g[0]), tuple(g[1]), tuple(g[1] + A * 0.25), tuple(g[0] + A * 0.25)]), 33, 114, hexc('#454b50'), top=False)
    # the two exterior glass elevators, on the face most turned to the south (Hastings Street, the camera's side)
    F = min((U, V, -U, -V), key=lambda a: a[1]); S_ = np.array([-F[1], F[0]])
    for w in (-3.6, 3.6):
        g = [t + F * h + S_ * (w - 1.3), t + F * h + S_ * (w + 1.3)]
        K.prism('lm_steel', ccw([tuple(g[0]), tuple(g[1]), tuple(g[1] + F * 1.7), tuple(g[0] + F * 1.7)]), 30, 121, hexc('#8a6a32'), top=True)
    # the Lookout: shallow cone underneath, the glazing band, the roof rim, a low drum (flat-shaded: no dome)
    K.lathe('lm_paint', t[0], t[1], 0, [(9.0, 113.0), (15.0, 116.5), (20.5, 120.0), (20.5, 120.6)], hexc('#d3cec3'), n=40, smooth=False, cap=False)
    K.lathe('lm_matte', t[0], t[1], 0, [(20.7, 120.6), (20.7, 125.0)], hexc('#2b333b'), n=40, smooth=False, cap=False)    # glazing, restaurant level
    K.lathe('lm_paint', t[0], t[1], 0, [(20.6, 125.0), (20.6, 126.2), (17.0, 127.6), (11.0, 128.2), (0.0, 128.2)], hexc('#b7b3aa'), n=40, smooth=False)
    K.lathe('lm_paint', t[0], t[1], 0, [(6.5, 128.0), (6.5, 132.0), (0.0, 132.0)], hexc('#c9c5bb'), n=24, smooth=False)
    K.cyl('lm_steel', (t[0], t[1], 132.0), (t[0], t[1], 160.0), 0.8, STEEL, n=8, r1=0.3)
    return K, tuple(t), z0, [list(P.buffer(2).exterior.coords)], [68728]

def m_vanhouse():
    """VANCOUVER HOUSE (2019, BIG): a 150 m residential tower that rises from a triangle at the foot (squeezed by the
    Granville Bridge ramps) and widens floor by floor into a full rectangle at the top - the 'twist' seen from every side;
    white slab edges every floor. Top outline = the engine's LiDAR tower split 2000000390 (157 m); podium 940615578 kept."""
    b = rec(2000000390); P = Polygon(b['ring']).buffer(0); cc, U, V, hl, hs = axes(P); z0 = z_at(*cc); K = lm_kit.Kit()
    top = [cc + U * a + V * b_ for a, b_ in ((-hl, -hs), (hl, -hs), (hl, hs), (-hl, hs))]
    bridge = np.array(C.proj(-123.1335, 49.2745))                     # the Granville Bridge side, where the base is cut back
    k = int(np.argmin([np.hypot(*(p - bridge)) for p in top]))         # the top corner over the ramps
    base = [p.copy() for p in top]
    nb = (k + 1) % 4; pb = (k - 1) % 4
    base[k] = top[pb] + (top[nb] - top[pb]) * 0.5 * 0.15 + (top[k] - top[pb]) * 0.15   # that corner pulled in: a triangle
    base[nb] = top[nb] + (top[(k + 2) % 4] - top[nb]) * 0.1
    zs = [-2, 18, 40, 62, 84, 104, 150]; H = 150.0
    rings = []
    for z in zs:
        f = min(1.0, max(0.0, (z - 18) / 86.0)); f = f * f * (3 - 2 * f)
        rings.append([(*(base[i] + (top[i] - base[i]) * f), z) for i in range(4)])
    rings = [r if Polygon([p[:2] for p in r]).exterior.is_ccw else r[::-1] for r in rings]
    K.loft('lm_matte', rings, hexc('#53646f'))
    for z in np.arange(20.0, H, 6.0):                                   # slab edges (every other floor at this scale)
        f = min(1.0, max(0.0, (z - 18) / 86.0)); f = f * f * (3 - 2 * f)
        q = [tuple(base[i] + (top[i] - base[i]) * f) for i in range(4)]
        qc = np.mean(q, 0); q = [tuple(qc + (np.array(p) - qc) * 1.015) for p in q]
        K.prism('lm_paint', ccw(q), z, z + 0.6, hexc('#e6e6e2'), top=False)
    K.prism('lm_paint', ccw([tuple(p) for p in top]), H - 0.5, H + 1.2, hexc('#cfd1d0'))
    return K, tuple(cc), z0, [list(P.buffer(2).exterior.coords)], [2000000390]

# ── fix5 (05/10): Science World, the Space Centre, Bloedel, the Marine Building, the Aquarium, the Stanley Park Pavilion,
# Playland. Heights: the 2025 LidarBC DSM (grid of today_lidar.py) minus the DEM median in a 5-15 m ring outside the outline
# (the grid's DEM under a big roof is not the ground); measured once, the numbers are in each docstring. Outlines: the 2015
# footprints / OSM (newbuildings/osm tiles + landmarks/work/osm_fix5.json, Overpass 05/10: the Aquarium site, Playland's rides).
OSM5 = C.work('landmarks', 'work', 'osm_fix5.json')
LIDAR_GRID = os.environ.get('LIDAR_GRID', '/Volumes/QIPU-SSD/tmp/vf1')        # dsm.npy / dem.npy (today_lidar.py's grid)
HCACHE = C.work('landmarks', 'work', 'fix5_heights.json')                       # sampled heights, kept so a rerun needs no grid

def osm5():
    """[(element, shapely geometry in world m)] of landmarks/work/osm_fix5.json (closed ways = polygons, open = lines)"""
    from shapely.geometry import LineString
    out = []
    for e in json.load(open(OSM5))['elements']:
        p = [C.proj(q['lon'], q['lat']) for q in e.get('geometry') or []]
        if len(p) < 2: continue
        out.append((e, Polygon(p).buffer(0) if len(p) > 3 and p[0] == p[-1] else LineString(p)))
    return out

_HC = None
def lidar_h(key, fn):
    """a measured height (or list) from the cache, else fn(dsm, dem) on the grid, cached"""
    global _HC
    if _HC is None: _HC = json.load(open(HCACHE)) if os.path.exists(HCACHE) else {}
    if key not in _HC:
        dsm = np.load(os.path.join(LIDAR_GRID, 'dsm.npy'), mmap_mode='r'); dem = np.load(os.path.join(LIDAR_GRID, 'dem.npy'), mmap_mode='r')
        _HC[key] = fn(dsm, dem); json.dump(_HC, open(HCACHE, 'w'))
    return _HC[key]

def _win(a, x, y, r):
    i, j = int(x + 7250), int(6750 - y); return np.asarray(a[j - r:j + r + 1, i - r:i + r + 1], np.float32)

def poly_h(P, q=90):
    """DSM percentile inside an outline minus the DEM median in a 5-15 m ring outside it"""
    import shapely
    def px(poly, a):
        x0, y0, x1, y1 = poly.bounds; i0, i1, r0, r1 = int(x0 + 7250), int(x1 + 7250) + 1, int(6750 - y1), int(6750 - y0) + 1
        X, Y = np.meshgrid(np.arange(i0, i1) - 7250 + 0.5, 6750 - np.arange(r0, r1) - 0.5)
        v = np.asarray(a[r0:r1, i0:i1], np.float32)[shapely.contains_xy(poly, X, Y)]; return v[np.isfinite(v)]
    def fn(dsm, dem):
        g = float(np.median(px(P.buffer(15).difference(P.buffer(5)), dem))); v = px(P, dsm)
        return round(float(np.percentile(v, q)) - g, 2) if len(v) else None
    return fn

SILVER = hexc('#c9ced3'); GLASS = hexc('#9fb0b4')

def _icosphere(n_sub):
    """unit icosphere: (verts, triangles)"""
    t = (1 + 5 ** 0.5) / 2
    V = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    V = [tuple(np.array(v) / np.linalg.norm(v)) for v in V]
    F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
         (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    for _ in range(n_sub):
        mid = {}; F2 = []
        def m(a, b):
            k = (min(a, b), max(a, b))
            if k not in mid:
                v = (np.array(V[a]) + np.array(V[b])) / 2; V.append(tuple(v / np.linalg.norm(v))); mid[k] = len(V) - 1
            return mid[k]
        for a, b, c in F:
            ab, bc, ca = m(a, b), m(b, c), m(c, a); F2 += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        F = F2
    return V, F

def m_sciworld():
    """SCIENCE WORLD (Expo Centre, 1986): the silver geodesic sphere at the head of False Creek, on a low white base.
    2025 LiDAR: top 46.1 m over the ground; the sphere's sections (r 16.8 m at 30 m, 15.8 at 35, 12.8 at 40, 6.6 at 44)
    fit a ball of R 16.5 m centred 29.6 m up at (1911.5, 1875.8); the base under it ~11 m (DSM p50 in the 18-45 m ring,
    16 m p90: the south wing). Footprint gid 68330 (the 2015 record: a 40 m drum over the whole 6,200 m2 outline).
    (FIX4 07/10) The audit: painted as a glass ball on a brown wooden pavilion (the render: a smooth white ball over a dark
    glazed floor and a matte tan deck). Now the ball is a geodesic icosphere (1,280 flat triangles, alternate panels a shade
    apart: the facets read at 9 cm/px), and the base white / pale grey with a thin glazing band and a light deck. (No mast:
    the LiDAR has no point over 18.4 m within 70 m of the ball but the ball itself.)"""
    b = rec(68330); P = Polygon(b['ring']).buffer(0); c = (1911.5, 1875.8); z0 = z_at(*c); K = lm_kit.Kit()
    R = ccw(list(P.simplify(0.8).exterior.coords)[:-1]); zb = min(z_at(*p) for p in R) - z0 - 1.5
    WH = hexc('#e9e9e4'); K.prism('lm_paint', R, zb, 9.0, WH, top=True, top_col=hexc('#d6d7d3'), top_mat='lm_matte')   # the white base, light deck
    K.prism('lm_matte', scaled(R, (P.centroid.x, P.centroid.y), 1.003), 1.0, 3.6, hexc('#5f6e76'), top=False)        # glazing band at the foot
    K.prism('lm_paint', scaled(R, (P.centroid.x, P.centroid.y), 1.004), 8.4, 9.2, hexc('#f4f4f0'), top=False)         # the deck's white edge
    K.cyl('lm_paint', (c[0], c[1], 8.5), (c[0], c[1], 14.0), 9.0, hexc('#dcdcd7'), n=24)                             # the drum the sphere sits on
    Rs, zc = 16.5, 29.6; Vs, Fs = _icosphere(3)
    A_ = hexc('#cfd4d8'); B_ = hexc('#b4bbc1')
    for k, (a, b_, c_) in enumerate(Fs):
        tri = [(c[0] + Rs * Vs[i][0], c[1] + Rs * Vs[i][1], zc + Rs * Vs[i][2]) for i in (a, b_, c_)]
        if (tri[0][2] + tri[1][2] + tri[2][2]) / 3 < zc - Rs * 0.82: continue                # hidden in the drum
        K.face('lm_steel', tri, A_ if (k % 4) else B_)
    return K, c, z0, [list(P.buffer(3).exterior.coords)], [68330]

def m_suntower():
    """SUN TOWER (1912, W. T. Whiteway; 128 W Pender at Beatty): the beaux-arts office tower, once the British Empire's
    tallest, its buff terracotta shaft topped by a green copper dome and lantern. Engine: podium gid 68461 (32.5 m, kept)
    and the LiDAR tower split 2000000293 (207 m2, a flat 74 m box: the audit found no dome). 2025 LiDAR over the ground:
    area >= 60 m 184 m2, >= 65 m 109, >= 70 m 16, top 76.2 at (1581.3, 2730.7): a shaft to ~61 m, the dome from there
    (r ~7.6 m at 60, 5.9 at 65, 2.3 at 70) and the lantern to 76 m. (FIX4 07/10)"""
    b = rec(2000000293); P = Polygon(b['ring']).buffer(0); c = (1581.3, 2730.4); z0 = z_at(*c); K = lm_kit.Kit()
    R = ccw(list(P.simplify(0.4).exterior.coords)[:-1]); zb = min(z_at(*p) for p in R) - z0 - 1.0; pc = (P.centroid.x, P.centroid.y)
    BUFF = hexc('#cdb994'); CU = hexc('#6f9a86')
    K.prism('lm_paint', R, zb, 59.0, BUFF, top=True, top_col=hexc('#9c927f'), top_mat='lm_matte')
    for z_ in np.arange(36.0, 58.0, 3.6): K.prism('lm_matte', scaled(R, pc, 1.004), z_, z_ + 1.6, hexc('#4a4a46'), top=False)   # window rows
    K.prism('lm_paint', scaled(R, pc, 1.03), 59.0, 60.5, hexc('#e0d3b6'), top=False)                                         # the cornice
    K.lathe('lm_paint', c[0], c[1], 0, [(7.6, 60.5), (7.6, 62.0), (7.0, 64.5), (5.9, 66.5), (4.2, 68.6), (2.4, 70.3), (1.4, 71.0)], CU, n=24, smooth=True)
    K.lathe('lm_paint', c[0], c[1], 0, [(1.5, 71.0), (1.5, 73.6), (0.9, 74.2), (0.2, 76.2)], hexc('#5f8a76'), n=12, smooth=False)  # the lantern
    return K, c, z0, [list(P.buffer(1.0).exterior.coords)], [2000000293]

def m_spacectr():
    """H. R. MACMILLAN SPACE CENTRE / MUSEUM OF VANCOUVER (1968): a round building under its conical 'Haida hat' roof in
    Vanier Park, low wings round it. 2025 LiDAR, centre (-1034.5, 2200.5): the roof's sections r 20.6 m at 14 m, 12.7 at 18,
    7.5 at 21, 4.1 at 24, top 26.6 m; wings ~9 m (DSM p50). Footprint gid 39751 (the 2015 record: a 17 m block)."""
    b = rec(39751); P = Polygon(b['ring']).buffer(0); c = (-1034.5, 2200.5); z0 = z_at(*c); K = lm_kit.Kit()
    from shapely.geometry import Point as Pt
    W_ = P.difference(Pt(c).buffer(22.0, 48)); zb = min(z_at(*p) for p in P.exterior.coords) - z0 - 1.5
    for g in getattr(W_, 'geoms', [W_]):
        if g.area < 30: continue
        K.prism('lm_paint', ccw(list(g.simplify(0.6).exterior.coords)[:-1]), zb, 8.0, hexc('#cfccc4'), top=True, top_col=hexc('#a9a8a2'), top_mat='lm_matte')
    K.lathe('lm_matte', c[0], c[1], 0, [(23.0, zb), (23.0, 9.0)], hexc('#5b6266'), n=40, smooth=True, cap=False)   # the drum
    K.lathe('lm_paint', c[0], c[1], 0, [(24.5, 9.0), (20.6, 14.0), (12.7, 18.0), (7.5, 21.0), (4.1, 24.0), (2.2, 25.6), (1.2, 26.6)],
            hexc('#dcd9d0'), n=40, smooth=True)
    return K, c, z0, [list(P.buffer(3).exterior.coords)], [39751]

def m_bloedel():
    """BLOEDEL CONSERVATORY (1969): the triodetic dome (aluminium tubes, plexiglass bubbles) on the plaza at the top of
    Queen Elizabeth Park. 2025 LiDAR, centre (1193.5, -1607.5): r 19.8 m at 4 m, 14.9 at 8, 11.1 at 10, 6.3 at 12, top
    14.0 m over the ground ring; OSM way 388316869 (1,477 m2). Footprint gid 63772 (the 2015 record: a 10 m cylinder house)."""
    b = rec(63772); c = (1193.5, -1607.5); z0 = z_at(*c); K = lm_kit.Kit()
    K.lathe('lm_paint', c[0], c[1], 0, [(21.0, -2.0), (21.0, 2.5), (20.2, 3.0)], CONC, n=36, smooth=False, cap=False)
    Rc, zc = 23.3, 14.0 - 23.3; prof = []
    for k in range(9):
        z = 3.0 + 11.0 * k / 8; prof.append((max(0.3, math.sqrt(max(0.0, Rc * Rc - (z - zc) ** 2))), z))
    K.lathe('lm_matte', c[0], c[1], 0, prof, GLASS, n=36, smooth=False)                      # facets = the triodetic grid
    for i in range(12):                                                                        # the main ribs
        a = 2 * math.pi * i / 12
        K.tube('lm_steel', [(c[0] + r * math.cos(a) * 1.01, c[1] + r * math.sin(a) * 1.01, z + 0.05) for r, z in prof], 0.18, STEEL, n=4)
    return K, c, z0, [list(Polygon(b['ring']).buffer(3).exterior.coords)], [63772]

def m_marine():
    """MARINE BUILDING (1930): the Art Deco tower at Burrard and Hastings, brick and terracotta, stepping in to a crown.
    Wikidata/OSM 97.8 m; the 2016 record 82.1 m (a flat box over the lot); 2025 LiDAR over the ground ring (15.5 m): area
    >= 30 m 1,102 m2, >= 70 m 568, >= 80 m 129, >= 88 m 39, top 94.6 at (949.6, 3444.6). Outline OSM way 125579375;
    replaces gid 58310 and its LiDAR tower split 2108422663."""
    O = osm_ways(); P = O[125579375][1]; c0 = (P.centroid.x, P.centroid.y); z0 = z_at(*c0); K = lm_kit.Kit()
    R = ccw(list(P.simplify(0.5).exterior.coords)[:-1]); zb = min(z_at(*p) for p in R) - z0 - 1.5
    BR = hexc('#8f735c'); TR = hexc('#b9a68a'); CU = hexc('#5d7d72')
    def step(area, c, z1, z2, col, top_col):
        s = math.sqrt(area / P.area); K.prism('lm_paint', scaled(R, c, s), z1, z2, col, top=True, top_col=top_col, top_mat='lm_matte')
    K.prism('lm_paint', R, zb, 24.0, TR, top=True, top_col=hexc('#7b7a74'), top_mat='lm_matte')       # the lower floors
    step(1102, (953.0, 3446.5), 24.0, 66.0, BR, hexc('#7b7a74'))                                    # the shaft
    step(700, (949.6, 3444.0), 66.0, 75.0, BR, TR)                                                  # first setback
    step(330, (949.6, 3444.6), 75.0, 82.0, TR, TR)
    step(130, (949.6, 3444.6), 82.0, 88.5, CU, CU)                                                  # the crown
    step(40, (949.6, 3444.6), 88.5, 93.0, CU, CU)
    K.cyl('lm_steel', (949.6, 3444.6, 93.0), (949.6, 3444.6, 95.0), 0.6, STEEL, n=6, r1=0.2)
    # (FIX4 07/10, audit: 'present, weak') the shaft's vertical piers - light terracotta ribs every ~3 m on each face,
    # dark spandrels between - the Deco striping that tells it from the glass towers round it
    sh = Polygon(scaled(R, (953.0, 3446.5), math.sqrt(1102 / P.area))).buffer(0)
    ext = list(sh.exterior.coords)
    for (ax_, ay_), (bx_, by_) in zip(ext[:-1], ext[1:]):
        L_ = math.hypot(bx_ - ax_, by_ - ay_)
        if L_ < 6: continue
        ux_, uy_ = (bx_ - ax_) / L_, (by_ - ay_) / L_; nx_, ny_ = uy_, -ux_
        for k in range(1, int(L_ // 3.1)):
            px_, py_ = ax_ + ux_ * k * L_ / int(L_ // 3.1), ay_ + uy_ * k * L_ / int(L_ // 3.1)
            q = [(px_ - ux_ * 0.35, py_ - uy_ * 0.35), (px_ + ux_ * 0.35, py_ + uy_ * 0.35), (px_ + ux_ * 0.35 + nx_ * 0.3, py_ + uy_ * 0.35 + ny_ * 0.3), (px_ - ux_ * 0.35 + nx_ * 0.3, py_ - uy_ * 0.35 + ny_ * 0.3)]
            K.prism('lm_paint', ccw(q), 24.0, 66.0, TR, top=True)
    return K, (949.6, 3444.6), z0, [list(P.buffer(2).exterior.coords)], [58310, 2108422663]

AQ_BLD = (89121125, 89121128, 398623351, 510312270, 1495285063, 1495290850, 1495290857, 1495290860, 1495302922, 1495302929,
          1495302930, 1495302938, 1495302939)

def m_aquarium():
    """VANCOUVER AQUARIUM (1956, rebuilt in stages): low flat-roofed halls and pools in the trees of Stanley Park. No 2015
    footprint; the OSM buildings inside the site (way 58305151), each at its 2025 LiDAR height (DSM p75 over the ground
    ring, kept 3-11 m)."""
    E = {e['id']: g for e, g in osm5()}; site = E[58305151]; c = (site.centroid.x, site.centroid.y); z0 = z_at(*c); K = lm_kit.Kit(); clear = []
    for wid in AQ_BLD:
        g = E.get(wid)
        if g is None or g.geom_type != 'Polygon' or g.area < 20: continue
        h = lidar_h(f'aq_{wid}', poly_h(g, 75)) or 5.0; h = min(11.0, max(3.0, h))
        R = ccw(list(g.simplify(0.5).exterior.coords)[:-1]); zb = min(z_at(*p) for p in R) - z0 - 1.0
        K.prism('lm_paint', R, zb, h, hexc('#d3d2cb'), top=True, top_col=hexc('#9aa3a2'), top_mat='lm_matte')
        K.prism('lm_matte', scaled(R, (g.centroid.x, g.centroid.y), 1.004), 0.5, min(h - 0.8, 3.5), DARK, top=False)
        clear.append(list(g.buffer(1.5).exterior.coords))
    return K, c, z0, clear, []

def m_sppavilion():
    """STANLEY PARK PAVILION (1911-13): a timber pavilion by the Malkin Bowl, two storeys under a dark hipped roof. No 2015
    footprint; OSM way 88279376 (1,011 m2); 2025 LiDAR ridge ~12 m over the ground ring, eaves ~7 m."""
    P = osm_ways()[88279376][1]; c = (P.centroid.x, P.centroid.y); z0 = z_at(*c); K = lm_kit.Kit()
    R = ccw(list(P.simplify(0.6).exterior.coords)[:-1]); zb = min(z_at(*p) for p in R) - z0 - 1.0
    K.prism('lm_paint', R, zb, 7.0, hexc('#d8cdb6'), top=False)
    cp = (P.centroid.x, P.centroid.y)                                 # the hipped roof: eaves out, rising to a short ridge
    K.loft('lm_matte', [[(x, y, 7.0) for x, y in scaled(R, cp, 1.04)], [(x, y, 10.0) for x, y in scaled(R, cp, 0.55)],
                        [(x, y, 11.5) for x, y in scaled(R, cp, 0.2)]], hexc('#4c4a46'))
    return K, c, z0, [list(P.buffer(2).exterior.coords)], []

PL_COL = [hexc(h) for h in ('#c9a24f', '#5f8fae', '#b8584c', '#7aa06a', '#d8d2c4', '#8c6fa3')]

def playland_parts():
    """Playland (Hastings Park): the rides and coasters of osm_fix5.json, the hull round them, the records they replace"""
    from shapely.ops import unary_union
    rides = [(e, g) for e, g in osm5() if 'attraction' in e.get('tags', {}) or 'roller_coaster' in e.get('tags', {})]
    hull = unary_union([g for _, g in rides]).convex_hull.buffer(25)
    rU = unary_union([g.buffer(2) for _, g in rides])
    inside = [b for b in recs() if hull.contains(Point(b['cx'], b['cy']))]
    gone = []
    for b in inside:
        P = Polygon(b['ring']).buffer(0)
        if (P.area < 200 and b['h'] >= 8) or P.intersection(rU).area >= 0.5 * P.area: gone.append(b['gid'])
    return rides, hull, inside, gone

def m_playland():
    """PLAYLAND (the PNE fair's amusement park, Hastings Park): from the air, ride platforms and the 1958 wooden roller
    coaster's white trestle, not buildings. The 2015 records under a ride (or < 200 m2 and >= 8 m: the drop tower, the
    swing tower, the wheel, 16-20 m 'boxes') are dropped; the ride outlines become low coloured platforms, each roller
    coaster track a white beam on posts at its 2025 LiDAR height (DSM max in 2 m round the track over the DEM min in 6 m,
    kept 1.5-24 m, smoothed). Halls and booths left stand as plain low 'works' (big())."""
    rides, hull, inside, gone = playland_parts(); c = (hull.centroid.x, hull.centroid.y); z0 = z_at(*c); K = lm_kit.Kit(); clear = []
    tracks = [(e, g) for e, g in rides if e['tags'].get('roller_coaster') == 'track']
    coasters = [(e, g) for e, g in rides if e['tags'].get('attraction') == 'roller_coaster']
    from shapely.geometry import LineString
    for e, g in coasters:                                            # a coaster area without track ways: its outline is the track
        if g.geom_type == 'Polygon' and not any(t.intersects(g) for _, t in tracks): tracks.append((e, LineString(g.exterior.coords)))
    for e, g in rides:
        if g.geom_type != 'Polygon' or e['tags'].get('attraction') == 'roller_coaster' or g.area < 8: continue
        R = ccw(list(g.simplify(0.4).exterior.coords)[:-1]); zb = min(z_at(*p) for p in R) - z0 - 0.5; col = PL_COL[e['id'] % len(PL_COL)]
        K.prism('lm_paint', R, zb, (z_at(*g.centroid.coords[0]) - z0) + 1.4, col, top=True)
        clear.append(list(g.buffer(1.0).exterior.coords))
    WOOD = hexc('#e9e3d3')
    for e, g in tracks:
        L = g.length; n = max(2, int(L / 3.0)); pts = [g.interpolate(L * i / n) for i in range(n + 1)]
        def fn(dsm, dem, pts=pts):
            out = []
            for q in pts:
                a = _win(dsm, q.x, q.y, 2); d = _win(dem, q.x, q.y, 6)
                out.append(round(float(np.nanmax(a) - np.nanmin(d)), 2) if np.isfinite(a).any() and np.isfinite(d).any() else None)
            return out
        hs = lidar_h(f'track_{e["id"]}', fn)
        hs = np.array([h if h is not None else np.nan for h in hs], float)
        if np.isnan(hs).all(): hs[:] = 4.0
        hs = np.where(np.isnan(hs), np.nanmedian(hs), hs); hs = np.clip(hs, 1.5, 24.0)
        hs = np.convolve(np.pad(hs, 2, mode='edge'), np.ones(5) / 5, 'valid')
        P3 = [(q.x, q.y, (z_at(q.x, q.y) - z0) + h) for q, h in zip(pts, hs)]
        for a_, b_ in zip(P3[:-1], P3[1:]): K.beam('lm_paint', a_, b_, 1.6, 0.5, WOOD)
        for k in range(0, len(P3), 2):                                # posts every ~6 m, a pair across the track
            x, y, z = P3[k]; g0 = z_at(x, y) - z0
            K.cyl('lm_paint', (x, y, g0 - 0.5), (x, y, z - 0.25), 0.22, WOOD, n=4, smooth=False)
        clear.append(list(g.buffer(2.0).exterior.coords))
    return K, c, z0, clear, gone

MODELS_DEF = {
    'v_bcplace': (m_bcplace, 'BC Place', 2011, 'the 2011 roof on the 1983 stadium (the roof as it stands today)'),
    'v_rogers': (m_rogers, 'Rogers Arena', 1995, 'opened 1995 as General Motors Place'),
    'v_canadaplace': (m_canadaplace, 'Canada Place', 1986, 'the Canada pavilion of Expo 86, then the convention centre and cruise terminal'),
    'v_harbourctr': (m_harbourctr, 'Harbour Centre', 1977, 'office tower and Lookout, opened 1977'),
    'v_vanhouse': (m_vanhouse, 'Vancouver House', 2019, 'completed 2019-20'),
    'v_sciworld': (m_sciworld, 'Science World', 1986, 'the Expo Centre of Expo 86, Science World since 1989'),
    'v_spacectr': (m_spacectr, 'H. R. MacMillan Space Centre', 1968, 'Space Centre and Museum of Vancouver, Vanier Park'),
    'v_bloedel': (m_bloedel, 'Bloedel Conservatory', 1969, 'triodetic dome, Queen Elizabeth Park'),
    'v_marine': (m_marine, 'Marine Building', 1930, 'Art Deco office tower, 1930'),
    'v_suntower': (m_suntower, 'Sun Tower', 1912, 'the 1912 Sun Tower, its copper dome'),
    'v_aquarium': (m_aquarium, 'Vancouver Aquarium', 1956, 'opened 1956, the halls as they stand today'),
    'v_sppavilion': (m_sppavilion, 'Stanley Park Pavilion', 1913, 'the park pavilion by the Malkin Bowl'),
    'v_playland': (m_playland, 'Playland', 1958, 'the PNE amusement park; its wooden coaster opened 1958'),
}

def models():
    skip = {'by_landmark': {}, 'built': {}, 'note': 'city_places.py models: the engine records each model replaces'}
    for key, (fn, name, built, note) in MODELS_DEF.items():
        K, datum, z0, clear, gids = fn()
        save(K, key, name, built, datum, z0, clear, gids, note)
        skip['by_landmark'][key] = gids; skip['built'][key] = built
    skip['gids'] = sorted({g for v in skip['by_landmark'].values() for g in v})
    json.dump(skip, open(SKIP_OUT, 'w'), indent=0)
    return set(skip['gids'])

if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    mg = set()
    if what in ('all', 'lakes'): lakes()
    if what in ('all', 'models'): mg = models()
    if what in ('all', 'big'):
        if not mg and os.path.exists(SKIP_OUT): mg = set(json.load(open(SKIP_OUT))['gids'])
        big(mg)
