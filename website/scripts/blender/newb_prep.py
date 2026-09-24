"""THE BUILDINGS DATASF DOES NOT HAVE. The records the city is built from
(city_data.buildings) come from DataSF's footprints, surveyed around 2016:
Mission Bay, the new Transbay/Rincon towers, the Shipyard, Candlestick,
Treasure Island's and Parkmerced's new blocks render as empty ground.

This adds them from OpenStreetMap (ODbL, (c) OpenStreetMap contributors), as
extra records in city_data's own schema, so gen_buildings models them exactly
like the others. city_data.buildings() appends them when NEWB=1.

    python3 newb_prep.py            (reads newbuildings/osm/*.json, cached Overpass tiles)

KEPT: an OSM building (or, where the building is mapped in parts with heights,
its parts) is added only when less than 30% of its area lies on any DataSF
footprint, it is at least 20 m2, it is not a landmark modelled by hand
(landmarks_hq's regions, every landmark, enabled or not: a landmark enabled
later must not find a generic box on its site) and it is not an open or
floating structure (roof, carport, construction site, houseboat, bridge, tank).

WHAT EACH FIELD IS, and what is a convention (flagged in the record):
  h     OSM height; else building:levels x 3.4 m (residential) / 4.2 m (office,
        commercial) / 3.8 m (other); else the tallest building:part inside it;
        else the median height of DataSF records of the same facade type built
        2000 or later ('h_src': 'default')
  st    building:levels; else h / storey height
  year  OSM start_date (or construction/opening date); else 2019 ('year_src':
        'convention') — "not in DataSF, so built after its survey": an era
        render (ERA < 2019) never shows it
  ty    the OSM building type mapped to the generator's facade types
  use   the DataSF use that type goes with
  shop  a shop, amenity or retail tag, or building=retail/commercial
  roles per edge: 2 (party) where another footprint touches it, 1 (front)
        where a street centreline (OSM, life/roads_osm.json) lies within 25 m
        out from it, 0 (back) otherwise
  paint roof lightness index: a draw (seeded by gid) from the DataSF records
        built 2005 or later ('paint' is not in OSM)
  gid   910000000 + a stable hash of the OSM id and part index (the history
        agent's synthetic landmark records sit at 900000000-900100000)
"""
import glob, json, math, os, re, sys, zlib, collections
import numpy as np
import shapely, shapely.affinity
from shapely.geometry import Polygon, LineString, MultiPolygon, Point
from shapely.ops import polygonize, unary_union, split
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import city_data

W = '/Users/daniel/code/qipu-render-work'
OSM = f'{W}/newbuildings/osm'
OUT = sys.argv[1] if len(sys.argv) > 1 else f'{W}/newbuildings/osm_records.json'
KX = 111320 * 0.790582709628753; KY = 111320.0
def proj(lon, lat): return ((lon + 122.438) * KX, (lat - 37.76) * KY)

SKIP_TYPES = {'roof', 'carport', 'construction', 'ruins', 'demolished', 'no', 'collapsed', 'bridge', 'houseboat',
              'storage_tank', 'silo', 'tent', 'ship', 'boat', 'container', 'abandoned', 'proposed', 'disused', 'razed',
              'shelter', 'kiosk', 'toilets', 'gazebo', 'pavilion', 'ger', 'static_caravan', 'transformer_tower', 'bunker'}
TY = {}
for k in ('house', 'detached', 'semidetached_house', 'bungalow', 'cabin', 'farm', 'villa'): TY[k] = 'HOUSE'
for k in ('terrace', 'townhouse'): TY[k] = 'FLATS'
for k in ('residential', 'apartments', 'dormitory', 'condominium'): TY[k] = 'APARTMENT'
for k in ('commercial', 'office'): TY[k] = 'OFFICE'
for k in ('retail', 'supermarket', 'shop', 'mall', 'restaurant'): TY[k] = 'RETAIL'
for k in ('industrial', 'warehouse', 'manufacture', 'hangar', 'service', 'storage', 'factory', 'shed', 'barn',
          'greenhouse', 'utility', 'power', 'pumping_station', 'substation', 'water_tower'): TY[k] = 'INDUSTRIAL'
for k in ('hospital', 'university', 'school', 'college', 'public', 'civic', 'government', 'church', 'religious',
          'cathedral', 'chapel', 'temple', 'mosque', 'synagogue', 'train_station', 'transportation', 'stadium',
          'sports_hall', 'sports_centre', 'museum', 'fire_station', 'kindergarten', 'library', 'police', 'grandstand',
          'clinic', 'research', 'laboratory', 'military', 'community_centre', 'courthouse'): TY[k] = 'INSTITUTION'
TY['hotel'] = 'HOTEL'
for k in ('parking', 'garage', 'garages'): TY[k] = 'GARAGE'
USE = {'HOUSE': 'single family', 'FLATS': 'multi-family', 'APARTMENT': 'multi-family', 'OFFICE': 'office',
       'RETAIL': 'retail', 'INDUSTRIAL': 'industrial', 'INSTITUTION': 'hotel / institutional', 'HOTEL': 'hotel / institutional',
       'GARAGE': 'mixed or not stated', 'UNCLASSED': 'mixed or not stated'}
RESID = {'HOUSE', 'FLATS', 'APARTMENT', 'HOTEL'}
OFFICE = {'OFFICE', 'RETAIL'}

def num(v, feet_ok=True):
    """'45', '45 m', '45.5m', "150'", '150 ft' -> metres"""
    if v is None: return None
    s = str(v).strip().lower().replace(',', '.')
    m = re.match(r"^(-?\d+(?:\.\d+)?)\s*(m|metres|meters|ft|feet|')?", s)
    if not m: return None
    x = float(m.group(1))
    if m.group(2) in ('ft', 'feet', "'"): x *= 0.3048
    return x

def year_of(t):
    for k in ('start_date', 'construction_date', 'building:start_date', 'opening_date', 'year_built', 'built'):
        v = t.get(k)
        if v:
            m = re.search(r'(1[89]\d\d|20[0-3]\d)', str(v))
            if m: return int(m.group(1)), k
    return None, None

def rings_of(el):
    """(outer polygons, as one shapely geometry) of a way or relation, or None"""
    if el['type'] == 'way':
        g = el.get('geometry') or []
        if len(g) < 4: return None
        pts = [proj(p['lon'], p['lat']) for p in g]
        if pts[0] != pts[-1]: return None
        p = Polygon(pts)
        return p if p.is_valid else p.buffer(0)
    outs, ins = [], []
    for m in el.get('members', []):
        if m.get('type') != 'way' or not m.get('geometry'): continue
        ls = LineString([proj(p['lon'], p['lat']) for p in m['geometry'] if p])
        (ins if m.get('role') == 'inner' else outs).append(ls)
    if not outs: return None
    po = unary_union(list(polygonize(outs)))
    if po.is_empty: return None
    if ins:
        pi = unary_union(list(polygonize(ins)))
        if not pi.is_empty: po = po.difference(pi)
    return po if po.is_valid else po.buffer(0)

def load(prefix):
    els = {}
    for f in sorted(glob.glob(f'{OSM}/{prefix}_*.json')):
        for el in json.load(open(f))['elements']:
            if 'tags' not in el: continue
            els[(el['type'], el['id'])] = el
    return els

def pieces(g):
    """simple polygons (no holes): a courtyard block is cut through each
    courtyard, the cut walls then read as party walls"""
    todo = [p for p in (g.geoms if hasattr(g, 'geoms') else [g]) if isinstance(p, Polygon) and not p.is_empty]
    out = []
    guard = 0
    while todo and guard < 200:
        guard += 1
        p = todo.pop()
        if not p.interiors: out.append(p); continue
        hole = Polygon(p.interiors[0]); c = hole.centroid
        x0, y0, x1, y1 = p.bounds
        # cut across the building's short dimension, through the courtyard
        mrr = p.minimum_rotated_rectangle; xy = list(mrr.exterior.coords)
        e1 = (xy[1][0] - xy[0][0], xy[1][1] - xy[0][1]); e2 = (xy[2][0] - xy[1][0], xy[2][1] - xy[1][1])
        d = e1 if math.hypot(*e1) < math.hypot(*e2) else e2; L_ = math.hypot(*d) or 1.0
        d = (d[0] / L_, d[1] / L_); R = (x1 - x0) + (y1 - y0)
        cut = LineString([(c.x - d[0] * R, c.y - d[1] * R), (c.x + d[0] * R, c.y + d[1] * R)])
        parts = [q for q in split(p, cut).geoms if isinstance(q, Polygon) and q.area > 1.0]
        if len(parts) < 2: out.append(Polygon(p.exterior)); continue
        todo.extend(parts)
    return out

def ring_of(p):
    p = p.simplify(0.3, preserve_topology=True)
    if not isinstance(p, Polygon) or p.is_empty: return None
    r = [(round(x, 2), round(y, 2)) for x, y in list(p.exterior.coords)[:-1]]
    return r if len(r) >= 3 else None

def gid_of(key, k=0):
    return 910000000 + (zlib.crc32(f"{key}#{k}".encode()) % 89000000)

ABINS = (0, 40, 80, 150, 300, 600, 1500, 4000, 1e12)
def abin(a): return next(i for i in range(len(ABINS) - 1) if ABINS[i] <= a < ABINS[i + 1])

def main():
    B = city_data.buildings(-9000, -9000, 9000, 9000)
    DP, DB = [], []
    for b in B:
        if len(b['ring']) < 3: continue
        q = Polygon(b['ring']); DP.append(q if q.is_valid else q.buffer(0)); DB.append(b)
    DA = [q.area for q in DP]
    DT = shapely.STRtree(DP); DC = shapely.STRtree([Point(b['cx'], b['cy']) for b in DB])
    print('datasf', len(DP), flush=True)
    # sourced defaults: DataSF medians by facade type and footprint size, built 1980+
    dh = collections.defaultdict(list); dha = collections.defaultdict(list)
    for b, a in zip(DB, DA):
        if (b['year'] or 0) >= 1980: dh[(b['ty'], abin(a))].append(b['h']); dha[abin(a)].append(b['h'])
    HDEF = {k: float(np.median(v)) for k, v in dh.items() if len(v) >= 20}
    HDEFA = {k: float(np.median(v)) for k, v in dha.items() if len(v) >= 5}
    def hdef(ty, a):
        k = abin(a); return HDEF.get((ty, k), HDEFA.get(k, 7.0))
    PAINT = sorted(b['paint'] for b in DB if (b['year'] or 0) >= 2005)
    # San Francisco: the union of its neighbourhoods (the assessor's blocks), 40 m out
    hr = json.load(open(f'{city_data.CITY}/base/hood-rings.json'))
    SF = unary_union([Polygon([(fl[i], fl[i + 1]) for i in range(0, len(fl), 3)]).buffer(0) for parts in hr['parts'] for fl in parts
                      if len(fl) >= 9]).buffer(40.0)
    shapely.prepare(SF); SFp = SF
    # landmarks modelled by hand: every one in the registry
    os.environ['LM_ALL'] = '1'
    import landmarks_hq
    LMR = []
    for l in landmarks_hq._registry():
        for r in l.regions:
            if r.ring is not None: LMR.append((l.key, Polygon(r.ring).buffer(0), None))
            else: LMR.append((l.key, None, r))
    fp = json.load(open(f'{W}/landmarks/footprints.json'))
    for k, v in fp.items():         # the OSM outlines the landmarks agent measured (Salesforce, Chase...)
        for r in v.get('outer', []):
            if len(r) >= 3: LMR.append((k, Polygon(r).buffer(0), None))
    def landmark_of(g):
        c = g.representative_point()
        for k, P, R in LMR:
            if P is not None:
                if P.intersects(g) and (P.contains(c) or P.intersection(g).area > 0.3 * g.area): return k
            elif bool(R.inside(np.array([c.x]), np.array([c.y]))[0]): return k
        return None
    # streets
    RD = []
    for el in json.load(open(f'{W}/life/roads_osm.json'))['elements']:
        hw = el.get('tags', {}).get('highway', '')
        if hw.startswith('motorway') or hw.startswith('trunk') or not el.get('geometry'): continue
        pts = [proj(p['lon'], p['lat']) for p in el['geometry']]
        if len(pts) >= 2: RD.append(LineString(pts))
    RT = shapely.STRtree(RD)
    print('roads', len(RD), flush=True)

    els = load('b'); parts = load('p')
    print('osm buildings', len(els), 'parts', len(parts), flush=True)
    PG = {}
    for key, el in parts.items():
        g = rings_of(el)
        if g is None or g.is_empty: continue
        t = el['tags']
        h = num(t.get('height'))
        if h is None and t.get('building:levels'): h = (num(t.get('building:levels')) or 0) * 3.8 or None
        PG[key] = (g, h, t)
    PGk = list(PG); PT = shapely.STRtree([PG[k][0] for k in PGk]) if PGk else None

    def type_of(t):
        bt = t.get('building', 'yes'); ty = TY.get(bt, 'UNCLASSED')
        if ty == 'UNCLASSED':
            bu = t.get('building:use', '') or t.get('amenity', '')
            if bu in TY: ty = TY[bu]
            elif t.get('amenity') in ('school', 'university', 'college', 'hospital', 'clinic', 'library', 'place_of_worship', 'fire_station', 'police', 'community_centre', 'kindergarten'): ty = 'INSTITUTION'
            elif t.get('tourism') == 'hotel': ty = 'HOTEL'
            elif t.get('amenity') == 'parking' or t.get('parking'): ty = 'GARAGE'
            elif t.get('office'): ty = 'OFFICE'
        return ty
    def parts_of(g):
        out = []
        if PT is not None:
            for j in PT.query(g):
                pg, ph, pt = PG[PGk[j]]
                if ph and pg.intersection(g).area > 0.8 * pg.area: out.append((PGk[j], pg, ph, pt))
        return out
    def measured_h(t, ty, my_parts):
        """the OSM height, or levels, or the tallest part: (h, source) or (None, None)"""
        h = num(t.get('height')); lv = num(t.get('building:levels'))
        # a height its own storeys cannot hold (93 m "of 4 levels") is not trusted
        if h is not None and h > 0 and not (lv and h / lv > 7.0): return h, 'osm height'
        if lv: return lv * (3.4 if ty in RESID else 4.2 if ty in OFFICE else 3.8), 'osm levels'
        if my_parts: return max(p[2] for p in my_parts), 'osm parts'
        return None, None

    # every outline: SF, type, size, landmark, DataSF
    geo = []; why = collections.Counter()
    for key, el in els.items():
        t = el['tags']; bt = t.get('building', 'yes')
        if bt in SKIP_TYPES or t.get('location') in ('underground', 'underwater') or t.get('layer', '0').startswith('-'):
            why['type ' + bt if bt in SKIP_TYPES else 'underground'] += 1; continue
        g = rings_of(el)
        if g is None or g.is_empty: why['no geometry'] += 1; continue
        if not SFp.contains(g.representative_point()): why['outside SF'] += 1; continue
        if g.area < 20.0: why['< 20 m2'] += 1; continue
        geo.append((key, el, g))
    geo.sort(key=lambda e: -e[2].area)             # outlines before what is drawn inside them
    # FIRST PASS: the DataSF records each OSM outline stands on (a record is
    # "claimed" by an outline covering 30% of it), and the local offset
    # between the two surveys, from the pairs that are one building (median
    # 1.2 m city-wide, up to 2-3 m in places): what is added is moved onto
    # DataSF's frame, so a filled gap meets its neighbours
    claim = collections.defaultdict(set); MX = []
    for n_, (key, el, g) in enumerate(geo):
        for j in DT.query(g):
            a = DP[j].intersection(g).area
            if a <= 0: continue
            if a >= 0.3 * DA[j]: claim[int(j)].add(n_)
            if a > 0.6 * g.area and a > 0.6 * DA[j]:
                c1 = g.centroid; c2 = DP[j].centroid; MX.append((c1.x, c1.y, c2.x - c1.x, c2.y - c1.y))
    MX = np.array(MX); MT = shapely.STRtree([Point(m[0], m[1]) for m in MX])
    print('matched pairs', len(MX), flush=True)
    def offset_at(x, y):
        k = MT.query(Point(x, y).buffer(150.0))
        if len(k) < 5: return 0.0, 0.0
        d = np.median(MX[k, 2:4], axis=0); return round(float(d[0]), 2), round(float(d[1]), 2)
    cand = []; acc = {}; accg = []
    alls = {}; allg = []
    for n_, (key, el, g) in enumerate(geo):
        c_ = g.centroid; dxy = offset_at(c_.x, c_.y)
        g = shapely.affinity.translate(g, *dxy)
        x0, y0, x1, y1 = g.bounds
        for c in [(i, j) for i in range(int(x0 // 100), int(x1 // 100) + 1) for j in range(int(y0 // 100), int(y1 // 100) + 1)]:
            alls.setdefault(c, []).append(len(allg))
        allg.append(g); me_ = len(allg) - 1
        t = el['tags']; ty = type_of(t); my_parts = parts_of(g)
        hm, hs = measured_h(t, ty, my_parts)
        hit = [(int(j), DP[j].intersection(g).area) for j in DT.query(g)]
        hit = [(j, a) for j, a in hit if a > 0]
        ov = sum(a for j, a in hit) / g.area
        # a tall DataSF record standing in this outline, even offset: already there
        if hm and any(DB[j]['h'] >= 0.6 * hm and (a >= 0.25 * DA[j] or a >= 0.15 * g.area) for j, a in hit):
            why['in DataSF (tall)'] += 1; continue
        rep = []; pod = None
        if ov > 0.30:
            # A TOWER WHERE DATASF HAS ONLY A LOW RECORD. OSM measures >= 30 m,
            # what DataSF has there is under 12 m. Either the lot before it
            # (DataSF's footprint predates the tower: the records mostly under
            # it cover most of it) — they are dropped from the tower's year on,
            # if DataSF's own year says the parcel was rebuilt (2000+) or OSM
            # counts its storeys (a bare OSM height over an old low building is
            # too often a proposal or a typo: 633 Howard "93 m") — or a podium
            # DataSF has without its tower: the tower is added over it.
            low = [(j, a) for j, a in hit if DB[j]['h'] < 12.0]
            if not (hm and hm >= 30.0 and g.area >= 200 and sum(a for j, a in low) >= 0.9 * sum(a for j, a in hit)):
                why['in DataSF'] += 1; continue
            inside = [j for j, a in low if a >= 0.5 * DA[j]]
            if sum(a for j, a in low if j in inside) >= 0.6 * g.area:
                if max((DB[j]['year'] or 0) for j in inside) >= 2000 or t.get('building:levels') or my_parts or year_of(t)[0]:
                    rep = inside
                else:
                    why['tall by OSM height alone, on an old low DataSF record'] += 1; continue
            else:
                pod = max(low, key=lambda ja: ja[1])[0]
        # on a hand-modelled landmark's site: kept, tagged with its key;
        # city_data drops it whenever that landmark is enabled (181 Fremont is
        # a generic tower until the landmarks agent's model is switched on)
        lk = landmark_of(g)
        if lk: why['landmark site (tagged) ' + lk] += 1
        if not rep and pod is None:
            # AN OFFSET DUPLICATE: a DataSF record of about its size within 8 m
            # that no other OSM outline stands on is this same building, drawn
            # a few metres off by one survey or the other (sheds, 2026-09-24)
            if any(0.5 <= DA[j] / g.area <= 2.0 and not (claim.get(int(j), set()) - {n_}) and DP[j].distance(g) <= 8.0
                   for j in DT.query(g.buffer(8.0))):
                why['offset duplicate of a DataSF record'] += 1; continue
        # already an OSM outline kept (a building drawn inside another, a part tagged building)
        # drawn inside another OSM outline: a building kept already (30%), or
        # any outline at all, kept or not (50%: a tower part tagged building
        # too, MIRA's, whose outline DataSF has)
        x0, y0, x1, y1 = g.bounds
        cells = [(i, j) for i in range(int(x0 // 100), int(x1 // 100) + 1) for j in range(int(y0 // 100), int(y1 // 100) + 1)]
        near = {k for c in cells for k in acc.get(c, ())}
        if sum(accg[k].intersection(g).area for k in near) > 0.3 * g.area: why['inside another OSM outline'] += 1; continue
        nall = {k for c in cells for k in alls.get(c, ())}
        if any(allg[k].intersection(g).area > 0.5 * g.area for k in nall if k != me_): why['inside a larger OSM outline'] += 1; continue
        for c in cells: acc.setdefault(c, []).append(len(accg))
        accg.append(g)
        cand.append((key, el, g, ov, hit, ty, my_parts, hm, hs, rep, pod, dxy, lk))
    print('kept outlines', len(cand), dict(why.most_common(40)), flush=True)

    recs = []; stats = collections.Counter(); REPL = []
    for key, el, g, ovf, hit, ty, my_parts, hm, hs, rep, pod, dxy, lk in cand:
        t = el['tags']; bt = t.get('building', 'yes')
        shop = bool(t.get('shop') or bt in ('retail', 'commercial', 'supermarket') or t.get('amenity') in ('restaurant', 'cafe', 'bar', 'fast_food', 'bank', 'pharmacy')
                    or 'retail' in (t.get('building:use', '') + t.get('building:use:ground_floor', '')))
        levels = num(t.get('building:levels'))
        yr, ys = year_of(t); ty_src = 'osm'
        # GAP FILL. A house-sized building in an established street whose
        # DataSF neighbours are there and it is not (whole rows are missing
        # from the published records in places, 2026-09-24): it takes its
        # street's median year, and its type and height where OSM has none
        nb = [DB[j] for j in DC.query(g.centroid.buffer(60.0))]
        nby = [b['year'] for b in nb if b['year']]
        gap = g.area < 400 and len(nby) >= 6 and float(np.median(nby)) < 1990 and yr is None and not rep and pod is None
        h, hsrc = hm, hs
        if gap:
            yr, ys = int(np.median(nby)), 'neighbours'
            if ty == 'UNCLASSED':
                ty = collections.Counter(b['ty'] for b in nb).most_common(1)[0][0]; ty_src = 'neighbours'
            if h is None:
                sim = [b['h'] for b in nb if b['ty'] == ty] or [b['h'] for b in nb]
                h, hsrc = float(np.median(sim)), 'neighbours'
        if h is None: h, hsrc = hdef(ty, g.area), 'default'
        h = max(3.0, h)
        if yr is None: yr, ys = 2019, 'convention'
        name = t.get('name') or (t.get('addr:housenumber', '') + ' ' + t.get('addr:street', ''))
        oid = f"{el['type'][0]}{el['id']}"
        for j in rep:
            REPL.append(dict(gid=DB[j]['gid'], by=oid, year=yr, h=round(DB[j]['h'], 1), lm=lk))
        # geometry: the parts when they tile the outline with their heights
        # (a podium and its tower), else the outline; no holes either way
        use_parts = len(my_parts) >= 2 and sum(p[1].area for p in my_parts) > 0.7 * g.area
        shapes = []
        if use_parts:
            for pk, pg, ph, pt in my_parts:
                for q in pieces(shapely.affinity.translate(pg, *dxy)): shapes.append((q, ph, f'{pk[0][0]}{pk[1]}', num(pt.get('building:levels'))))
        else:
            for q in pieces(g): shapes.append((q, h, None, levels))
        k_ = 0
        for q, hq, part, lv in shapes:
            r = ring_of(q)
            if r is None or Polygon(r).area < 6.0: continue
            gid = gid_of(oid, k_); k_ += 1
            st = int(round(lv)) if lv else max(1, int(round(hq / (3.4 if ty in RESID else 4.2 if ty in OFFICE else 3.8))))
            cx = sum(p[0] for p in r) / len(r); cy = sum(p[1] for p in r) / len(r)
            hsrc_ = 'osm parts' if part else hsrc
            recs.append(dict(gid=gid, ring=r, cx=round(cx, 2), cy=round(cy, 2), h=round(hq, 2), year=yr, use=USE[ty], st=st, ty=ty,
                             shop=shop, roles=None, paint=PAINT[(gid * 2654435761) % len(PAINT)] if PAINT else 16,
                             src='osm', osm=oid, part=part, name=name.strip() or None, btype=bt, h_src=hsrc_,
                             year_src=ys, ty_src=ty_src, ov=round(ovf, 3), shift=list(dxy), lm=lk, replaces=[DB[j]['gid'] for j in rep] or None))
            stats['h ' + hsrc_] += 1; stats['year ' + ys] += 1; stats['ty ' + ty] += 1
    # gids: unique, and never a DataSF gid
    gs = collections.Counter(r['gid'] for r in recs)
    assert max(gs.values()) == 1, 'gid collision'
    assert min(gs) > max(b['gid'] for b in DB)
    # roles, now that every footprint is known (a replaced DataSF record is no neighbour)
    gone = {x['gid'] for x in REPL}
    NP = [Polygon(r['ring']) for r in recs]
    keepD = [q for q, b in zip(DP, DB) if b['gid'] not in gone]
    ALLP = keepD + NP; AT = shapely.STRtree(ALLP); nD = len(keepD)
    for ri, r in enumerate(recs):
        ring = r['ring']; n = len(ring); roles = []
        for i in range(n):
            (ax, ay), (bx, by) = ring[i], ring[(i + 1) % n]
            L_ = math.hypot(bx - ax, by - ay) or 1e-9
            tx, ty_ = (bx - ax) / L_, (by - ay) / L_
            mx, my = (ax + bx) / 2, (ay + by) / 2
            nx, ny = ty_, -tx                       # outward: the side the polygon is not on
            if NP[ri].contains(Point(mx + nx * 0.3, my + ny * 0.3)): nx, ny = -nx, -ny
            pp = Point(mx + nx * 0.8, my + ny * 0.8)
            if any(ALLP[j].contains(pp) for j in AT.query(pp) if j != nD + ri): roles.append(2); continue
            probe = LineString([(mx + nx * 1.0, my + ny * 1.0), (mx + nx * 25.0, my + ny * 25.0)])
            roles.append(1 if any(RD[j].intersects(probe) for j in RT.query(probe)) else 0)
        r['roles'] = roles
    recs.sort(key=lambda r: r['gid'])
    meta = dict(source='OpenStreetMap buildings (ODbL, (c) OpenStreetMap contributors), Overpass extract of '
                + ', '.join(sorted({json.load(open(f))['osm3s']['timestamp_osm_base'] for f in glob.glob(f'{OSM}/b_*.json')})),
                rule='kept when < 30% of its area is on a DataSF footprint (or, >= 30 m tall by OSM, it stands on DataSF records under 12 m, which it replaces), '
                     'no DataSF record >= 0.6 of its height stands inside it, >= 20 m2, inside SF, not a hand-modelled landmark',
                year_convention="start_date; else, house-sized (< 400 m2) among >= 6 DataSF records within 60 m of median year < 1990: their median year "
                                "('neighbours', DataSF rows missing from the published records); else 2019 ('convention': not in DataSF, "
                                "surveyed ~2016, so taken as built after it; eras before 2019 never show it)",
                height_defaults={f'{k[0]}|{ABINS[k[1]]}': round(v, 2) for k, v in HDEF.items()},
                counts=dict(stats), skipped=dict(why))
    # what stands on a hand-modelled landmark's site goes in lists of its own:
    # a reader that does not know them (an older city_data) never draws it
    json.dump(dict(meta=meta, records=[r for r in recs if not r['lm']], replaces=[x for x in REPL if not x['lm']],
                   lm_records=[r for r in recs if r['lm']], lm_replaces=[x for x in REPL if x['lm']]),
              open(OUT, 'w'), separators=(',', ':'))
    print('records', len(recs), 'outlines', len(cand), 'replaced DataSF', len(REPL), dict(stats), '->', OUT, os.path.getsize(OUT) // 1024, 'KB', flush=True)

if __name__ == '__main__':
    main()
