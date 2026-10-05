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
MODELS = C.work('places', 'models'); os.makedirs(MODELS, exist_ok=True)

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

def m_canadaplace():
    """CANADA PLACE (1986): the long pier building at the foot of Howe St - the convention hall and cruise terminal, low and
    white, under its five white fabric sails in a row along the pier (peaks ~45 m, LiDAR); footprint gid 68768."""
    b = rec(68768); P = Polygon(b['ring']).buffer(0); cc, U, V, hl, hs = axes(P); z0 = z_at(*P.representative_point().coords[0]); K = lm_kit.Kit()
    c = (P.centroid.x, P.centroid.y)
    land = np.array(C.proj(-123.1125, 49.2875))                     # the shore end (Canada Place Way): the sails stand at the far end
    if np.dot(np.subtract(land, cc), U) > 0: U = -U                   # U points out to sea
    R = ccw(list(P.simplify(0.8).exterior.coords)[:-1])
    K.prism('lm_paint', R, -3, 20, hexc('#dcdcd6'), top=True, top_col=hexc('#c6c6c0'), top_mat='lm_matte')
    K.prism('lm_matte', scaled(R, c, 1.003), 2, 6, DARK, top=False)                            # the promenade glazing
    for k in range(5):
        u = hl - 40.0 - k * 31.0                                         # the five sails over the outer half, the bow first
        from shapely.geometry import LineString
        cut = P.intersection(LineString([tuple(cc + U * u - V * 2000), tuple(cc + U * u + V * 2000)]))   # the pier's cross-section there
        segs = list(getattr(cut, 'geoms', [cut])); sg = max(segs, key=lambda g: g.length); base = np.array(sg.interpolate(0.5, normalized=True).coords[0])
        n = 10; ang0 = math.atan2(U[1], U[0])
        prof = [(22.0, 19.5), (15.0, 26.5), (8.5, 34.5), (3.5, 41.5), (0.8, 45.5)]
        rings = []
        for r, z in prof:
            ring = []
            for i in range(n):
                a = ang0 + 2 * math.pi * i / n; rr = r * (1.0 if i % 2 == 0 else 0.78)            # the scalloped edge between the cables
                ring.append((base[0] + rr * math.cos(a), base[1] + rr * math.sin(a), z))
            rings.append(ring)
        K.loft('lm_paint', rings, WHITE, cap_top=True, smooth=True)
        K.cyl('lm_steel', (base[0], base[1], 40.0), (base[0], base[1], 48.5), 0.35, STEEL, n=6)
    return K, tuple(cc), z0, [list(P.buffer(3).exterior.coords)], [68768]

def m_harbourctr():
    """HARBOUR CENTRE (1977): a slim concrete office shaft with its round Lookout 'saucer' and a mast on top, rising out of
    a block-wide podium (the old Spencer's store, 7 floors). Engine gid 68728 is the whole block at the LiDAR's 133 m: here
    the podium at 30 m and the tower at its spot (landmarks/list.json engine_xy); saucer top ~134 m, mast to ~165 m."""
    b = rec(68728); P = Polygon(b['ring']).buffer(0); _, U, V, _, _ = axes(P); K = lm_kit.Kit()
    t = np.array([1318.0, 3148.1]); z0 = z_at(*t)
    R = ccw(list(P.simplify(0.5).exterior.coords)[:-1])
    zp = [z_at(*p) - z0 for p in R]; zb = min(zp) - 2
    K.prism('lm_paint', R, zb, 30, hexc('#b9b3a6'), top=True, top_col=hexc('#9c9a93'), top_mat='lm_matte')
    K.prism('lm_matte', scaled(R, (P.centroid.x, P.centroid.y), 1.002), 4, 28, hexc('#3a4046'), top=False)   # the podium's dark glazing bands
    K.prism('lm_paint', R, 28, 30.5, hexc('#c9c3b6'), top=False)
    h = 11.0
    sq = [tuple(t + U * a + V * b_) for a, b_ in ((-h, -h), (h, -h), (h, h), (-h, h))]
    K.prism('lm_paint', ccw(sq), 30, 118, hexc('#cdc6b8'), top=True)
    for s in (-1, 1):
        for A in (U, V):
            g = [tuple(t + A * (s * (h + 0.15)) + (V if A is U else U) * w) for w in (-4.0, 4.0)]
            K.prism('lm_matte', ccw([g[0], g[1], tuple(np.add(g[1], A * s * 0.3)), tuple(np.add(g[0], A * s * 0.3))]), 32, 117, DARK, top=False)
    K.lathe('lm_paint', t[0], t[1], 0, [(6.0, 116.0), (13.0, 119.5), (17.5, 123.0), (17.5, 127.0), (15.0, 131.0), (9.0, 133.5), (4.0, 134.2)], hexc('#d8d4ca'), n=32)
    K.lathe('lm_matte', t[0], t[1], 0, [(17.7, 123.4), (17.7, 126.6)], DARK, n=32, cap=False)          # the Lookout's glazing
    K.cyl('lm_steel', (t[0], t[1], 134.0), (t[0], t[1], 165.0), 0.9, STEEL, n=8, r1=0.3)
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

MODELS_DEF = {
    'v_bcplace': (m_bcplace, 'BC Place', 2011, 'the 2011 roof on the 1983 stadium (the roof as it stands today)'),
    'v_rogers': (m_rogers, 'Rogers Arena', 1995, 'opened 1995 as General Motors Place'),
    'v_canadaplace': (m_canadaplace, 'Canada Place', 1986, 'the Canada pavilion of Expo 86, then the convention centre and cruise terminal'),
    'v_harbourctr': (m_harbourctr, 'Harbour Centre', 1977, 'office tower and Lookout, opened 1977'),
    'v_vanhouse': (m_vanhouse, 'Vancouver House', 2019, 'completed 2019-20'),
}

def models():
    skip = {'by_landmark': {}, 'built': {}, 'note': 'city_places.py models: the engine records each model replaces'}
    for key, (fn, name, built, note) in MODELS_DEF.items():
        K, datum, z0, clear, gids = fn()
        save(K, key, name, built, datum, z0, clear, gids, note)
        skip['by_landmark'][key] = gids; skip['built'][key] = built
    skip['gids'] = sorted({g for v in skip['by_landmark'].values() for g in v})
    json.dump(skip, open(C.work('landmarks', 'skip_gids.json'), 'w'), indent=0)
    return set(skip['gids'])

if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    mg = set()
    if what in ('all', 'lakes'): lakes()
    if what in ('all', 'models'): mg = models()
    if what in ('all', 'big'):
        if not mg and os.path.exists(C.work('landmarks', 'skip_gids.json')): mg = set(json.load(open(C.work('landmarks', 'skip_gids.json')))['gids'])
        big(mg)
