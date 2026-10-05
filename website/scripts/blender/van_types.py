"""VANCOUVER'S BUILDING TYPES (V-TYPES, 05/10): record -> type, front wall, party walls. CPU only, no Blender.

    CITY=vancouver python3 van_types.py            -> <work>/lidar/types.json, counts, 30-record spot check

gen_buildings (CITY!=sf, VAN_TYPES=1) reads the file and draws each record as its type instead of San Francisco's
Victorians / Edwardians / Sunset stucco. SF never reads it (no file, no switch).

Inputs (all already in the city's folder):
- the render's own records (city_data.buildings with the city.json env: NEWB, HEIGHTS, TOWERS, PLACES_OV, TODAY_LIDAR),
  so the rings and gids are exactly the ones gen_buildings draws; height = LidarBC 2025, year = the tax roll
- newbuildings/permits/parcels.geojson + tax.csv: City of Vancouver "Property parcel polygons" and "Property tax
  report" 2026 (OGL-Vancouver): the parcel's zoning district (the City's zoning by-law district, e.g. R1-1, RT-7,
  RM-5A, C-2, HA-1A, CD-1, I-2), legal type (LAND / STRATA), strata unit count, civic street name
- lidar/roofs_lidar_city.json: the LiDAR roof form (flat / gable / hip + pitch; 'shed' among the refused fits)
- engine street centrelines (cls 0-3 named streets, cls 4 = lanes) and local-area rings (hood-rings.json)

Output per gid: [type, roles, roof_hint] — roles a digit per ring edge in RECORD order (1 front: faces its street,
0 back: faces the lane, 3 side, 2 party: touches the next footprint), only when the record carries no roles.
The type rules are CONVENTION on the period / zoning / height bands (documented in TYPE_RULES), the inputs SOURCED."""
import os, sys, json, csv, math, random, collections, time
os.environ.setdefault('CITY', 'vancouver')
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import cityconf as CC
if CC.SF: sys.exit('van_types: CITY=sf has no types (San Francisco keeps its own styles)')
for k, v in CC.CFG.get('env', {}).items():
    if k in ('NEWB', 'HEIGHTS', 'TOWERS', 'PLACES_OV', 'SOUTH', 'FRESH', 'TODAY_LIDAR'): os.environ.setdefault(k, str(int(v)) if isinstance(v, (int, float)) and not isinstance(v, bool) else str(v))
import numpy as np
import shapely
from shapely.geometry import Polygon, Point, LineString
from shapely.strtree import STRtree
import city_data as C, qc

T0 = time.time()
def log(*a): print(f'[van_types {time.time() - T0:5.1f}s]', *a, flush=True)
W = CC.WORK
OUT = os.environ.get('VT_OUT') or CC.work('lidar', 'types.json')

TYPES = ['character_house', 'vancouver_special', 'postwar_bungalow', 'modern_infill', 'laneway_house', 'west_end_walkup',
         'concrete_tower', 'point_tower', 'podium', 'stucco_lowrise', 'heritage_brick', 'chinatown_society', 'townhouse',
         'institutional', 'industrial_shed', 'granville_island_shed', 'stucco_house', 'accessory']

# ── the records the render draws ──
R = C.buildings(-1e7, -1e7, 1e7, 1e7)
log(len(R), 'records')
polys = []
for b in R:
    try:
        p = Polygon(b['ring'])
        if not p.is_valid: p = p.buffer(0)
    except Exception: p = Point(b['cx'], b['cy']).buffer(1.0)
    polys.append(p)
AREA = np.array([abs(p.area) for p in polys])
FT = STRtree(polys)

# ── parcels + tax roll ──
P_ = W + '/newbuildings/permits'
TAX = {}
for r in csv.DictReader(open(f'{P_}/tax.csv', encoding='utf-8-sig')):
    k = r['land_coordinate']; t = TAX.setdefault(k, dict(n=0, zone=collections.Counter(), legal=collections.Counter(), yb=collections.Counter()))
    t['n'] += 1; t['zone'][(r['zoning_district'] or '').strip()] += 1; t['legal'][r['legal_type']] += 1
    if r['year_built'].strip().isdigit(): t['yb'][int(r['year_built'])] += 1
PAR, PKEY, PST = [], [], []
for f in json.load(open(f'{P_}/parcels.geojson'))['features']:
    g = f['geometry']
    if not g: continue
    rings = g['coordinates'] if g['type'] == 'Polygon' else [q[0] for q in g['coordinates']]
    q = rings[0] if g['type'] == 'Polygon' else max(rings, key=len)
    try:
        pp = Polygon([CC.proj(x, y) for x, y in q])
        if not pp.is_valid: pp = pp.buffer(0)
    except Exception: continue
    PAR.append(pp); PKEY.append(f['properties'].get('tax_coord')); PST.append((f['properties'].get('streetname') or '').upper())
PT = STRtree(PAR)
log(len(PAR), 'parcels', len(TAX), 'tax coords')
cent = shapely.points(np.array([[b['cx'], b['cy']] for b in R]))
pi_, ri_ = PT.query(cent, predicate='within')
PARCEL = np.full(len(R), -1); PARCEL[pi_] = ri_            # (one parcel per centre; a duplicate hit keeps the last)
# a centre that falls between parcels (a footprint over two lots, a lane): the nearest parcel within 6 m
miss = np.where(PARCEL < 0)[0]
if len(miss):
    a_, b_ = PT.query_nearest(cent[miss], max_distance=6.0, return_distance=False)
    PARCEL[miss[a_]] = b_

# ── LiDAR roof forms ──
LR = json.load(open(CC.work('lidar', 'roofs_lidar_city.json')))
LRU = LR.pop('_unknown', {}); LR.pop('_meta', None); LR.pop('_tiles', None)

# ── streets (named) and lanes ──
names = C.street_names(); segs, sname, lanes = [], [], []
for fn in ('base/street-lines.qc', 'strt/street-lines-2.qc'):
    _, d = qc.read(f'{C.CITY}/{fn}'); k = 0
    for i in range(len(d['fid'])):
        n = int(d['len'][i]); xs = d['x'][k:k + n].tolist(); ys = d['y'][k:k + n].tolist(); k += n
        if n < 2: continue
        ls = LineString(list(zip(xs, ys)))
        if int(d['cls'][i]) == 4: lanes.append(ls)
        else: segs.append(ls); nm = int(d['nm'][i]); sname.append(names[nm] if nm < len(names) else '')
ST = STRtree(segs); LT = STRtree(lanes)
log(len(segs), 'street lines', len(lanes), 'lanes')

# ── local areas ──
H = json.load(open(C.CITY + '/base/hood-rings.json'))
HP = [Polygon([(p[k], p[k + 1]) for k in range(0, len(p), 3)]).buffer(0) for p in (q[0] if isinstance(q[0], list) else q for q in H['parts'])]   # each area's largest part
HN = list(H['names'])
HT = STRtree(HP); hi_, hr_ = HT.query(cent, predicate='within'); HOOD = [''] * len(R)
for a, c in zip(hi_, hr_): HOOD[a] = HN[c] if c < len(HN) else ''
GI = Polygon([CC.proj(*p) for p in ((-123.1408, 49.2688), (-123.1290, 49.2688), (-123.1290, 49.2738), (-123.1408, 49.2738))])   # Granville Island


def zone_of(t):
    z = t['zone'].most_common(1)[0][0] if t else ''
    return z.split(' ')[0] if z.startswith('CD-1') else z


def rect_fill(p):
    try:
        m = p.minimum_rotated_rectangle; return p.area / max(m.area, 1e-6)
    except Exception: return 1.0


def depth_width(ring, front):
    """(width along the front, depth into the lot)"""
    n = len(ring); a, c = ring[front], ring[(front + 1) % n]
    ux, uy = c[0] - a[0], c[1] - a[1]; L = math.hypot(ux, uy) or 1.0; ux, uy = ux / L, uy / L
    us = [x * ux + y * uy for x, y in ring]; vs = [-x * uy + y * ux for x, y in ring]
    return max(us) - min(us), max(vs) - min(vs)


# ── type rules (CONVENTION on the bands; README in TYPE_RULES) ──
LOWRES = ('R1-', 'RS-', 'RT-', 'R3-', 'R4-', 'R5-', 'RA-', 'FSD', 'FM-', 'R2-')
TYPE_RULES = """first match wins:
 1 tower_split's podium -> podium; its tower -> point_tower (year >= 1990 or none) / concrete_tower
 2 inside Granville Island -> granville_island_shed (h < 16) / industrial_shed
 3 h >= 32 m (about 10+ storeys) -> point_tower (year >= 1990 or none) / concrete_tower
 4 zone I-*, M-*, IC-* or use industrial, footprint >= 150 m2 -> industrial_shed
 5 zone HA-1 / HA-1A (Chinatown), built before 1940, h >= 9 -> chinatown_society; HA-* / DEOD before 1940 -> heritage_brick
 6 footprint < 30 m2 or h < 3.2 -> accessory; < 90 m2, h <= 8.5 and not the parcel's main building: h >= 4.8 (no tree
   over it) -> laneway_house, else accessory
 7 use hotel / institutional, or a low-density residential zone with a footprint >= 700 m2 not multi-family -> institutional
 8 single family / two-family (or a low-density zone, footprint < 450 m2): built < 1946 character_house; 1946-64
   postwar_bungalow; 1965-85 vancouver_special when two storeys (LiDAR median h 5.5-10), a near-rectangular box (fill >= 0.84) >= 100 m2 and a
   flat or low (<= 30 deg) roof, else postwar_bungalow; 1986-2004 stucco_house; 2005+ modern_infill
 9 multi-family / strata: < 1946 heritage_brick (flat roof, h >= 8) or character_house; 1946-79 west_end_walkup
   (h 7.5-17) / concrete_tower (h >= 17) / postwar_bungalow; 1980-2005 townhouse (h < 10.5 pitched), stucco_lowrise
   (h < 22), concrete_tower / point_tower (1990+); 2006+ townhouse (h < 10.5 pitched), modern_infill (h < 22), point_tower
10 retail / office / mixed: < 1940 heritage_brick; 1940-79 podium (h < 12) / concrete_tower; 1980-2005 podium (h < 9) /
   stucco_lowrise; 2006+ podium (h < 9) / modern_infill"""


def classify(i, b, main):
    y = b.get('year'); h = b['h']; A = AREA[i]; use = b.get('use') or ''
    k = PARCEL[i]; t = TAX.get(PKEY[k]) if k >= 0 else None
    z = zone_of(t); n_u = t['n'] if t else 0; strata = bool(t and t['legal'].get('STRATA', 0) > 0)
    lr = LR.get(str(b['gid'])); form = lr[0] if lr else ('shed' if LRU.get(str(b['gid'])) == 'shed' else None)
    pitch = lr[2] if lr else 0.0
    why = []
    if b.get('h_src') == 'podium': return 'podium', 'tower_split podium'
    if b.get('src') == 'tower': return ('point_tower' if (y or 2000) >= 1990 else 'concrete_tower'), f'tower_split tower, year {y}'
    if GI.contains(Point(b['cx'], b['cy'])): return ('granville_island_shed' if h < 16 else 'industrial_shed'), f'Granville Island, h {h:.0f}'
    if h >= 32: return ('point_tower' if (y or 2000) >= 1990 else 'concrete_tower'), f'h {h:.0f} >= 32, year {y}'
    if (z.startswith(('I-', 'M-', 'IC-')) or use == 'industrial') and A >= 150: return 'industrial_shed', f'zone {z}, use {use}, {A:.0f} m2'
    if z.startswith('HA-1') and (y or 9999) < 1940 and h >= 9: return 'chinatown_society', f'zone {z} (Chinatown), year {y}, h {h:.0f}'
    if (z.startswith('HA-') or z == 'DEOD') and (y or 9999) < 1940 and h >= 5: return 'heritage_brick', f'zone {z}, year {y}'
    if A < 30 or h < 3.2: return 'accessory', f'{A:.0f} m2, h {h:.1f}'
    hint = (lr[0] if lr else LRU.get(str(b['gid']))) or ''
    if A < 90 and not main and h <= 8.5:
        lw = 4.8 <= h and hint != 'tree'          # (a crown over a garage reads tall: not a laneway house)
        return ('laneway_house' if lw else 'accessory'), f'{A:.0f} m2 behind the parcel main building, h {h:.1f}, roof {hint}'
    low = z.startswith(LOWRES)
    if use == 'hotel / institutional' or (low and A >= 700 and use != 'multi-family'): return 'institutional', f'use {use}, zone {z}, {A:.0f} m2'
    yy = y if y else (1925 if (form in ('gable', 'hip') and pitch >= 35) else 1975)
    if not y: why.append(f'no year: {yy} from the roof ({form} {pitch:.0f})')
    if use == 'single family' or (low and A < 450 and use not in ('retail', 'office', 'multi-family')) or (low and use == 'multi-family' and n_u <= 3 and A < 300):
        if yy < 1946: return 'character_house', f'house, year {yy}, zone {z} ' + ' '.join(why)
        if yy < 1965: return 'postwar_bungalow', f'house, year {yy}, zone {z} ' + ' '.join(why)
        if yy < 1986:
            if 5.5 <= h <= 10 and A >= 100 and rect_fill(polys[i]) >= 0.84 and (form in (None, 'flat') or pitch <= 30):
                return 'vancouver_special', f'house {yy}, 2 storeys (h {h:.1f}), box fill {rect_fill(polys[i]):.2f}, roof {form} {pitch:.0f}'
            return 'postwar_bungalow', f'house {yy}, h {h:.1f}, roof {form} {pitch:.0f} (not a Special box)'
        if yy < 2005: return 'stucco_house', f'house, year {yy}, zone {z}'
        return 'modern_infill', f'house, year {yy}, zone {z}'
    if use in ('retail', 'office', 'mixed or not stated') and not (use == 'mixed or not stated' and strata and n_u >= 3):
        if yy < 1940: return 'heritage_brick', f'{use}, year {yy}, zone {z}'
        if yy < 1980: return ('podium' if h < 12 else 'concrete_tower'), f'{use}, year {yy}, h {h:.0f}'
        if yy < 2006: return ('podium' if h < 9 else 'stucco_lowrise'), f'{use}, year {yy}, h {h:.0f}'
        return ('podium' if h < 9 else 'modern_infill'), f'{use}, year {yy}, h {h:.0f}'
    pitched = form in ('gable', 'hip') and pitch >= 15
    if yy < 1946:
        return (('heritage_brick' if (form in (None, 'flat') and h >= 8) else 'character_house'), f'multi-family {yy}, h {h:.0f}, roof {form}')
    if yy < 1980:
        if h >= 17: return 'concrete_tower', f'multi-family {yy}, h {h:.0f}'
        if h >= 7.5: return 'west_end_walkup', f'multi-family {yy}, h {h:.0f}, zone {z}'
        return 'postwar_bungalow', f'multi-family {yy}, low h {h:.0f}'
    if yy < 2006:
        if h < 10.5 and pitched: return 'townhouse', f'multi-family {yy}, h {h:.0f}, pitched {form}'
        if h < 22: return 'stucco_lowrise', f'multi-family {yy}, h {h:.0f}'
        return ('point_tower' if yy >= 1990 else 'concrete_tower'), f'multi-family {yy}, h {h:.0f}'
    if h < 10.5 and (pitched or A < 600): return 'townhouse', f'multi-family {yy}, h {h:.0f}, roof {form}'
    if h < 22: return 'modern_infill', f'multi-family mid-rise {yy}, h {h:.0f}'
    return 'point_tower', f'multi-family {yy}, h {h:.0f}'


# the parcel's main building: its largest footprint
by_par = collections.defaultdict(list)
for i in range(len(R)):
    if PARCEL[i] >= 0: by_par[PARCEL[i]].append(i)
MAIN = np.ones(len(R), bool)
for k, ii in by_par.items():
    if len(ii) > 1:
        m = max(ii, key=lambda j: AREA[j])
        for j in ii:
            if j != m: MAIN[j] = False
log('parcels with several buildings', sum(1 for v in by_par.values() if len(v) > 1))

# party walls, in bulk: an edge whose outside (0.7 m out, at its 1/4, 1/2, 3/4 points) is inside another footprint at 2+ points
def _party():
    pts, own = [], []
    for i, b in enumerate(R):
        ring = [tuple(p) for p in b['ring']]; n = len(ring)
        if n < 3 or any(b.get('roles') or []): continue
        s = 1.0 if sum(ring[k][0] * ring[(k + 1) % n][1] - ring[(k + 1) % n][0] * ring[k][1] for k in range(n)) > 0 else -1.0
        for k in range(n):
            (x0, y0), (x1, y1) = ring[k], ring[(k + 1) % n]; L = math.hypot(x1 - x0, y1 - y0)
            if L < 1.5: continue
            nx, ny = s * (y1 - y0) / L, -s * (x1 - x0) / L
            for t_ in (0.25, 0.5, 0.75):
                pts.append((x0 + (x1 - x0) * t_ + nx * 0.7, y0 + (y1 - y0) * t_ + ny * 0.7)); own.append((i, k))
    P = shapely.points(np.array(pts)); a, c = FT.query(P, predicate='within')
    hit = collections.Counter()
    seen = set()
    for a_, c_ in zip(a.tolist(), c.tolist()):
        i, k = own[a_]
        if c_ != i and a_ not in seen: seen.add(a_); hit[(i, k)] += 1
    return {e for e, v in hit.items() if v >= 2}
PARTY = _party()
log('party edges', len(PARTY))


# ── roles: front (street), back (lane), side, party ──
def roles_of(i, b):
    ring = [tuple(p) for p in b['ring']]; n = len(ring)
    if n < 3: return None
    s = 1.0 if sum(ring[k][0] * ring[(k + 1) % n][1] - ring[(k + 1) % n][0] * ring[k][1] for k in range(n)) > 0 else -1.0
    E = []
    for k in range(n):
        (x0, y0), (x1, y1) = ring[k], ring[(k + 1) % n]; L = math.hypot(x1 - x0, y1 - y0) or 1e-9
        E.append(((x0 + x1) / 2, (y0 + y1) / 2, s * (y1 - y0) / L, -s * (x1 - x0) / L, L))
    c = Point(b['cx'], b['cy'])
    # the street: the parcel's own street (its civic address) if a centreline of that name runs within 60 m
    k_ = PARCEL[i]; want = PST[k_] if k_ >= 0 else ''
    cand = ST.query(c.buffer(70.0))
    best = None
    for j in cand:
        d = segs[j].distance(c)
        if d > 70: continue
        pri = 0 if (want and sname[j] == want) else 1
        if best is None or (pri, d) < best[0]: best = ((pri, d), j)
    roles = [3] * n
    if best is not None:
        q = segs[best[1]].interpolate(segs[best[1]].project(c))
        sc = []
        for k, (mx, my, nx, ny, L) in enumerate(E):
            if L < 2.0: continue
            dx, dy = q.x - mx, q.y - my; dl = math.hypot(dx, dy) or 1.0
            sc.append((nx * dx / dl + ny * dy / dl, L, k))
        good = [x for x in sc if x[0] > 0.6]
        if good: roles[max(good, key=lambda x: (min(x[1], 8.0) * x[0], x[1]))[2]] = 1
        elif sc: roles[max(sc)[2]] = 1
    lc = LT.query(c.buffer(45.0))
    if len(lc):
        j = min(lc, key=lambda j: lanes[j].distance(c))
        q = lanes[j].interpolate(lanes[j].project(c))
        for k, (mx, my, nx, ny, L) in enumerate(E):
            if roles[k] == 1: continue
            dx, dy = q.x - mx, q.y - my; dl = math.hypot(dx, dy) or 1.0
            if nx * dx / dl + ny * dy / dl > 0.7: roles[k] = 0
    for k in range(n):
        if (i, k) in PARTY: roles[k] = 2
    if 1 not in roles:
        free = [k for k in range(n) if roles[k] != 2 and E[k][4] >= 2.0]
        if free: roles[max(free, key=lambda k: E[k][4])] = 1
    return ''.join(str(v) for v in roles)


out = {}; cnt = collections.Counter(); hood_cnt = collections.defaultdict(collections.Counter); WHY = {}
for i, b in enumerate(R):
    ty, why = classify(i, b, MAIN[i])
    rl = roles_of(i, b) if not any(b.get('roles') or []) else None
    lr = LR.get(str(b['gid'])); hint = lr[0] if lr else (LRU.get(str(b['gid'])) or '')
    out[str(b['gid'])] = [ty, rl or '', hint]
    cnt[ty] += 1; hood_cnt[HOOD[i]][ty] += 1; WHY[i] = why
    if i % 20000 == 0: log(i, '/', len(R))

meta = dict(what='Vancouver building types per gid (van_types.py, V-TYPES 05/10): [type, roles (digit per ring edge in record order: '
                 '1 front 0 back 3 side 2 party; empty = keep the record\'s), lidar roof hint]',
            rules=TYPE_RULES, built=time.strftime('%Y-%m-%d %H:%M'), counts=dict(cnt.most_common()), n=len(R),
            sources=['City of Vancouver Building Footprints 2015, Property parcel polygons, Property tax report 2026 '
                     '(zoning district, legal type, year built) - Open Government Licence - Vancouver',
                     'LidarBC 2025 (heights, roof forms) - Open Government Licence - British Columbia',
                     'OpenStreetMap buildings (ODbL)'])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(dict(_meta=meta, t=out), open(OUT, 'w'), separators=(',', ':'))
log('wrote', OUT, os.path.getsize(OUT) // 1024, 'kB')
print('COUNTS', json.dumps(dict(cnt.most_common())))
for hd in ('Kitsilano', 'West End', 'Downtown', 'Strathcona', 'Mount Pleasant', 'Grandview-Woodland', 'Sunset', 'Shaughnessy'):
    print('HOOD', hd, dict(hood_cnt[hd].most_common(7)))
# the spot check: 30 records drawn with a fixed seed BEFORE anyone looks at them
rs = random.Random(20261005); pick = rs.sample(range(len(R)), 30)
SP = []
for i in pick:
    b = R[i]; lon, lat = CC.unproj(b['cx'], b['cy']); k = PARCEL[i]
    addr = (PST[k] and f"parcel on {PST[k]}") if k >= 0 else 'no parcel'
    SP.append(dict(gid=b['gid'], lat=round(lat, 6), lon=round(lon, 6), hood=HOOD[i], addr=addr, type=out[str(b['gid'])][0],
                   roles=out[str(b['gid'])][1], year=b.get('year'), h=round(b['h'], 1), area=round(float(AREA[i])), use=b.get('use'),
                   zone=zone_of(TAX.get(PKEY[k])) if k >= 0 else '', roof=out[str(b['gid'])][2], why=WHY[i]))
json.dump(SP, open(os.environ.get('VT_SPOT') or CC.work('assets', 'types_spotcheck.json'), 'w'), indent=1)
log('spot check written')
