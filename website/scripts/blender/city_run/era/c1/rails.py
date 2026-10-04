"""C1 step: the area's rails by year for era.py (eras.era_py.rail_years / rail_history), engine world metres.
rail_years: every base/rail.json segment within 300 m of the box, dated by the nearest OpenStreetMap railway way within 6 m (ODbL,
c1/osm_rail_bridges.json):
  railway=subway (SkyTrain Expo Line, OSM start_date 1986-01-03): 1986.0 (SOURCED, OSM tag)
  railway=rail (main, yard, spur, industrial, crossover): 1920.0 (CONVENTION: the East False Creek flats were filled in 1917 for the
    Canadian Northern yards, Wikipedia 'False Creek'; the CPR's Burrard Inlet tracks are older; individual tracks are not dated)
  no OSM way within 6 m: 1920.0 (CONVENTION, same)
Segments outside the 300 m stay undated (no era draws them: era.py rail_undated_from null).
rail_history: the lost streetcar line inside the box, on today's centreline: Hastings Street east of Main (BC Electric Railway; the last
  revenue streetcar ran on Hastings, Main to Kootenay Loop, ended 24 Apr 1955: SOURCED, TransLink Buzzer blog 'From Rails to Rubber',
  2017); opened 1900 (CONVENTION: the line predates every key year). Other 1950 lines (Main St, Pender/Keefer) are not sourced yet."""
import json, math, numpy as np
import common as c, cityconf as C, city_data as CD
R = json.load(open(f'{c.W}/engine/base/rail.json'))
osm = [e for e in json.load(open(f'{c.OUT}/osm_rail_bridges.json'))['elements'] if e['tags'].get('railway') in ('rail', 'subway')]
segs = []
for e in osm:
    P = [C.proj(q['lon'], q['lat']) for q in e['geometry']]
    for a, b in zip(P, P[1:]): segs.append((a, b, e['tags']['railway'], e['tags'].get('start_date')))
def dseg(p, a, b):
    ax, ay = a; bx, by = b; dx, dy = bx - ax, by - ay; L = dx * dx + dy * dy or 1
    t = max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L)); return math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)
years = {}; cnt = {}
for k, (x0, y0, x1, y1, kind, yr) in enumerate(R['segs']):
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    if not c.in_box(mx, my, 300): continue
    best = min(((dseg((mx, my), a, b), t, sd) for a, b, t, sd in segs), default=(99, None, None))
    if best[0] < 6 and best[1] == 'subway': y = 1986.0; lab = 'skytrain_1986'
    else: y = 1920.0; lab = 'rail_1920_convention'
    years[str(k)] = y; cnt[lab] = cnt.get(lab, 0) + 1
json.dump(dict(meta=dict(made_by='city_run/era/c1/rails.py', note=__doc__.split('rail_history:')[0].strip()), years=years), open(f'{c.OUT}/rail_years.json', 'w'))
L = CD.named_lines(); lines = []
for pl in L.get('E HASTINGS ST', []):
    if any(c.in_box(x, y, 300) for x, y in pl) and min(x for x, _ in pl) >= 2190: lines.append([[round(x, 1), round(y, 1)] for x, y in pl])
json.dump(dict(meta=dict(made_by='city_run/era/c1/rails.py'), routes=[dict(name='BCER Hastings East streetcar', kind='streetcar', year=1900, ended=1955.31,
          src='SOURCED end: TransLink Buzzer blog, From Rails to Rubber (2017); opening year CONVENTION', lines=lines)]), open(f'{c.OUT}/rail_history.json', 'w'))
print('rail segments dated', len(years), cnt, '| streetcar polylines', len(lines))
