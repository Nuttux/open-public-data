"""RECENT BUILDINGS DATED (Vancouver; CITY=vancouver): completion years for the
OSM-added records (newb_prep.py) from the City's issued building permits, the
parcels and the tax roll. A separate layer: newb_prep's output is not edited;
city_data.newb() applies newbuildings/dates.json when it exists (no-op for SF).

  in:  cities/vancouver/newbuildings/permits/
         permits.geojson  City of Vancouver "Issued building permits" (OGL-Vancouver),
                          typeofwork New Building + Demolition / Deconstruction,
                          2017-01 .. today (the dataset starts in 2017)
         parcels.geojson  "Property parcel polygons" (tax_coord)
         tax.csv          "Property tax report", report_year 2026 (year_built by land_coordinate)
       newbuildings/osm_records.json, lidar/measured_newb.json, lidar/heights.json
  out: newbuildings/dates.json
         dates       {gid: {year, year_src, permit_id, issued, how}}
         replaced    [{gid, until, by, kind, cls}]: 2015 city records on a parcel
                     with a new-building permit issued after 2016 that the 2025
                     LiDAR reads gone or rebuilt (heights cls low / rebuilt /
                     rebuilt-mixed); `until` = the lot's demolition permit issue,
                     else the new building's permit issue. For era use; not wired.
         lag         the measured issue -> year_built lags per class
Year rule, in order: (1) the tax roll's year_built of the record's parcel when it
is >= 2015 and the matched permit is not a laneway house (the roll's year is the
main building's); (2) a matched permit: issue year + the class lag (CONVENTION:
the median lag measured on 2017-2020 permits, see `lag`); then the 2025 LiDAR:
a record standing >= 2.5 m (and >= 60 % of the permit's storeys x 3 m) by the
August 2025 flight is capped at 2025, one lower than that is unfinished (>= 2026), one
reading bare ground (< 1.5 m, >= 20 px) is moved to >= 2026; a record standing
in 2025 ignores permits issued after 2025.0 (a later building on its lot).
The tax roll's year_built stops at 2021 (report_year 2026 has none later).
"""
import csv, json, os, re, sys, collections, statistics
import numpy as np
from shapely.geometry import Polygon, Point, shape
from shapely.strtree import STRtree
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
os.environ.setdefault('CITY', 'vancouver')
os.environ['NEWB'] = '0'; os.environ.pop('ERA', None); os.environ.pop('HEIGHTS', None); os.environ['TOWERS'] = '0'
import cityconf as CC
assert not CC.SF, 'Vancouver only'
import city_data
W = CC.WORK
P = f'{W}/newbuildings/permits'
OUT = f'{W}/newbuildings/dates.json'
LIDAR_T = 2025.65          # LidarBC flew the city in summer 2025 (downtown 2025-08-26)


def fy(s):
    import datetime
    d = datetime.date.fromisoformat(s[:10]); return round(d.year + (d.timetuple().tm_yday - 1) / 365.25, 3)


def storeys(desc):
    m = re.findall(r'(\d{1,2})[- ]?(?:storey|story|stories|storeys)', (desc or '').lower())
    return max(int(x) for x in m) if m else None


def klass(p):
    cat = ' '.join(p['specificusecategory'] or []).lower()
    if 'laneway' in cat: return 'laneway'
    if any(k in cat for k in ('single detached', 'duplex', 'infill')) and (p['projectvalue'] or 0) < 5e6: return 'house'
    st = storeys(p['projectdescription'])
    if (st and st >= 7) or (st is None and (p['projectvalue'] or 0) >= 2e7): return 'tower'
    return 'lowmid'


# --- parcels + tax roll ----------------------------------------------------
tax = collections.defaultdict(collections.Counter)
for r in csv.DictReader(open(f'{P}/tax.csv', encoding='utf-8-sig')):
    if r['year_built'].strip().isdigit(): tax[r['land_coordinate']][int(r['year_built'])] += 1
TAXY = {k: c.most_common(1)[0][0] for k, c in tax.items()}
par, pkey, paddr = [], [], []
for f in json.load(open(f'{P}/parcels.geojson'))['features']:
    g = f['geometry']
    if not g: continue
    s = shape(g)
    polys = list(s.geoms) if s.geom_type == 'MultiPolygon' else [s]
    for q in polys:
        par.append(Polygon([CC.proj(x, y) for x, y in q.exterior.coords])); pkey.append(f['properties']['tax_coord'])
        paddr.append(f"{f['properties']['civic_number'] or ''} {f['properties']['streetname'] or ''}".strip())
PT = STRtree(par)


def parcel_of(pt):
    for i in PT.query(pt):
        if par[i].contains(pt): return int(i)
    return None


# --- permits ----------------------------------------------------------------
NBP, DEM = [], collections.defaultdict(list)
for f in json.load(open(f'{P}/permits.geojson'))['features']:
    p = f['properties']
    if not f['geometry'] or not p['issuedate']: continue
    x, y = CC.proj(*f['geometry']['coordinates']); pt = Point(x, y); pi = parcel_of(pt)
    if p['typeofwork'] == 'New Building':
        NBP.append(dict(id=p['permitnumber'], t=fy(p['issuedate']), date=p['issuedate'][:10], pt=pt, parcel=pi,
                        k=klass(p), v=p['projectvalue'] or 0, addr=(p['address'] or '').split(', Vancouver')[0],
                        cat=p['specificusecategory'], st=storeys(p['projectdescription'])))
    elif pi is not None:
        DEM[pi].append((fy(p['issuedate']), p['permitnumber']))
print('permits: new', len(NBP), 'demolition parcels', len(DEM), 'parcels', len(par), 'tax coords', len(TAXY))
QT = STRtree([q['pt'] for q in NBP])
by_parcel = collections.defaultdict(list)
for q in NBP:
    if q['parcel'] is not None: by_parcel[q['parcel']].append(q)

# --- the lag: tax-roll year_built − issue year, per class, on 2017–2020 permits
lagd = collections.defaultdict(list)
for q in NBP:
    if q['parcel'] is None or q['k'] == 'laneway' or q['t'] >= 2021: continue
    yb = TAXY.get(pkey[q['parcel']])
    if yb is None or yb < int(q['t']) - 1: continue            # the roll's building is an older one
    lagd[q['k']].append(yb - int(q['t']))
LAG = {}
for k, v in lagd.items():
    c = collections.Counter(v); LAG[k] = dict(n=len(v), median=statistics.median(v), dist={str(a): c[a] for a in sorted(c)})
print('lag', json.dumps(LAG))
# CONVENTION (the roll's year_built stops at 2021, so its lags are censored at
# the top and its house lag of 0 reads like the start year; OSM start_date on
# 2017-2022 towers gives issue + 2..3, median 3): issue + 1 for a house or a
# laneway house, + 2 for a low/mid-rise, + 3 for a tower (>= 7 storeys, else >= $20 M)
LAGY = dict(house=1, laneway=1, lowmid=2, tower=3)

# --- the OSM-added records --------------------------------------------------
J = json.load(open(f'{W}/newbuildings/osm_records.json'))
MN = json.load(open(f'{W}/lidar/measured_newb.json'))['h']
dates, stats, examples = {}, collections.Counter(), []
for r in J['records']:
    src = r['year_src']
    if src not in ('convention', 'neighbours'): continue     # OSM's own dates stand
    poly = Polygon(r['ring']).buffer(0); area = poly.area
    pi = parcel_of(poly.representative_point())
    # permits: on the record's parcel, or a point inside / within 25 m of the outline
    cand = {id(q): q for q in (by_parcel.get(pi, []) if pi is not None else [])}
    for i in QT.query(poly.buffer(25)):
        if poly.distance(NBP[i]['pt']) <= 25: cand[id(NBP[i])] = NBP[i]
    m = MN.get(str(r['gid'])); standing = m and m[2] >= 20 and m[0] >= 2.5; bare = m and m[2] >= 20 and m[0] < 1.5
    # standing at the 2025 flight: a permit issued after 2025.0 is for a building not yet built there
    H = m[0] if m and m[2] >= 20 else (r['h'] if r['h_src'] != 'default' else None)     # the 2025 LiDAR, else OSM's height
    # a permit for a building much lower than the record (a 7-storey permit beside a 54 m tower) is another building
    cand = [q for q in cand.values() if not (standing and q['t'] > 2025.0) and not (H and q['st'] and H > q['st'] * 3.5 + 8)]
    rank = lambda z: (poly.contains(z['pt']), z['v'], z['t'])              # a point inside the outline first
    lane = [q for q in cand if q['k'] == 'laneway']; main = [q for q in cand if q['k'] != 'laneway']
    q = None
    if area < 120 and lane: q = max(lane, key=lambda z: z['t'])
    elif main: q = max(main, key=rank)
    elif lane and src == 'convention': q = max(lane, key=lambda z: z['t'])
    yb = TAXY.get(pkey[pi]) if pi is not None else None
    year = how = None
    if yb and yb >= 2015 and (q is None or q['k'] != 'laneway') and (q is None or yb >= int(q['t'])):
        year, ys, how = yb, 'tax_roll', f"parcel year_built {yb}" + (f", permit {q['id']}" if q else '')
    elif q and src == 'convention':
        year, ys, how = int(q['t']) + LAGY[q['k']], 'permit+lag', f"issue {q['date']} + {LAGY[q['k']]} ({q['k']}, CONVENTION)"
    if year is None: stats[f'{src}: no evidence'] += 1; continue
    if src == 'neighbours' and not (q and q['k'] != 'laneway' and ys == 'tax_roll' and year >= 2017 and area >= 60):
        stats['neighbours: kept (weak)'] += 1; continue          # a neighbours year only yields to a new house's permit + roll
    full = standing and (not (q and q['st'] and q['k'] in ('lowmid', 'tower')) or m[0] >= 0.6 * 3.0 * q['st'])   # at >= 60 % of the permit's storeys: finished by the flight
    if full and year > 2025: year, how = 2025, how + '; LiDAR 2025 standing -> 2025'; ys += '+lidar'
    if standing and not full and year <= 2025 and ys == 'permit+lag' and q['t'] >= 2023.0:   # (a low wing of an older permit's complex is not 'unfinished')
        year, how = 2026, how + f"; LiDAR 2025 {m[0]:.0f} m of {q['st']} storeys: unfinished -> 2026"; ys += '+lidar'
    if bare and year <= 2025 and ys == 'permit+lag': year, how = 2026, how + '; LiDAR 2025 bare -> 2026'; ys += '+lidar'
    dates[str(r['gid'])] = dict(year=year, year_src=ys, permit_id=q['id'] if q else None, issued=q['date'] if q else None, how=how)
    stats[f'{src} -> {ys}'] += 1
    if src == 'convention': examples.append(dict(gid=r['gid'], osm=r['osm'], name=r['name'], addr=(q['addr'] if q else paddr[pi]),
                                                 h=r['h'], area=round(area), issued=q['date'] if q else None, year=year, how=how))
print(json.dumps(stats, indent=0))

# --- start_date check: OSM-dated records vs their permits ------------------
chk = []
for r in J['records']:
    if r['year_src'] in ('convention', 'neighbours') or r['year'] < 2017: continue
    poly = Polygon(r['ring']).buffer(0)
    qs = [NBP[i] for i in QT.query(poly.buffer(25)) if NBP[i]['k'] != 'laneway' and poly.distance(NBP[i]['pt']) <= 25]
    if qs: q = max(qs, key=lambda z: z['v']); chk.append((r['osm'], r['name'], r['year'], q['date'], r['year'] - int(q['t'])))
print('start_date vs permit:', chk)

# --- the 2015 city records permits say were replaced -------------------------
HC = json.load(open(f'{W}/lidar/heights.json'))['cls']
B = city_data.buildings(-1e7, -1e7, 1e7, 1e7)
rep = []
for b in B:
    c = HC.get(str(b['gid']))
    if c not in ('low', 'rebuilt', 'rebuilt-mixed'): continue
    pi = parcel_of(Polygon(b['ring']).buffer(0).representative_point())
    qs = [q for q in by_parcel.get(pi, []) if q['k'] != 'laneway' or c == 'low'] if pi is not None else []
    if not qs: continue
    q = min(qs, key=lambda z: z['t'])
    d = [t for t, _ in DEM.get(pi, []) if t <= q['t'] + 1]
    rep.append(dict(gid=b['gid'], until=round(min(d), 3) if d else q['t'], by=q['id'], kind='demolition permit' if d else 'new-building permit issue',
                    cls=c, year_rec=b['year']))
print('replaced', len(rep), collections.Counter(x['cls'] for x in rep))

json.dump(dict(meta=dict(
    source='City of Vancouver open data (OGL-Vancouver): issued-building-permits (2017-01..2026-09, New Building + Demolition), '
           'property-parcel-polygons, property-tax-report report_year 2026; LidarBC 2025 (measured_newb.json, heights.json); '
           'OSM records newb_prep.py (ODbL, (c) OpenStreetMap contributors). Fetched 2026-09-25, User-Agent qipu-render/0.1.',
    rule=__doc__.split('Year rule, in order: ')[1].strip(), lag=LAG, lag_used=LAGY, counts=stats,
    note='the permits dataset starts 2017; no older permits dataset is published on opendata.vancouver.ca'),
    dates=dates, replaced=rep), open(OUT, 'w'), indent=0)
json.dump(examples, open(f'{P}/examples.json', 'w'), indent=0)
print('wrote', OUT, len(dates), 'dated,', len(rep), 'replaced')
