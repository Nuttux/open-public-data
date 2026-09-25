"""Heights for the buildings newb_prep added (OSM outlines the city's records
lack), from the same LiDAR survey, merged into the file city_data HEIGHTS=1 reads:

    CITY=vancouver python3 newb_heights.py <measured_newb.json> <records.json> <heights.json>

measured_newb.json = lidar_heights.py over records.json. newb_prep's heights are
OSM's (height / levels / parts) or guesses (neighbours, default). Per record:
  lidar      ≥ MIN_PX pixels, void under VOID: the survey's median
  osm-void   mostly void (LidarBC 2025 empties tall tops): OSM's own height when
             OSM gave one, else the median when it is higher than the guess
  kept       too few pixels / not measured: newb_prep's height stays
Classes are counted in heights.json meta `newb`; heights go in `h` by gid (the
records' gids never collide with the city's: newb_prep draws them apart)."""
import json, sys, collections

MIN_PX, VOID = 12, 0.15
M = json.load(open(sys.argv[1]))['h']; R = json.load(open(sys.argv[2])); OUT = sys.argv[3]
H = json.load(open(OUT))
OSM_SRC = {'osm height', 'osm levels', 'osm parts'}
cls = collections.Counter(); set_ = {}
for r in R['records'] + R.get('lm_records', []):
    k = str(r['gid']); m = M.get(k); src = r.get('h_src', '')
    if m is None or m[2] < MIN_PX: cls['kept'] += 1; continue
    h, p90, n, vd = m[0], m[1], m[2], (m[3] if len(m) > 3 else 0)
    if vd <= VOID * (n + vd): set_[k] = round(h, 2); cls['lidar'] += 1
    elif src in OSM_SRC: cls['osm-void'] += 1
    elif h > r['h']: set_[k] = round(h, 2); cls['lidar-void-rise'] += 1
    else: cls['kept'] += 1
assert not (set(set_) & set(H['h'])), 'gid collision between the city records and the added ones'
H['h'].update(set_)
H['meta']['newb'] = dict(source=sys.argv[1], records=sys.argv[2], classes=dict(cls), rules=__doc__.split('Per record:')[1].split('Classes')[0].strip())
json.dump(H, open(OUT, 'w'), separators=(',', ':'))
print(dict(cls), '→', len(set_), 'added-building heights merged into', OUT)
