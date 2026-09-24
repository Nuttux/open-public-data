"""ways_prep.py <overpass highways.json> <out ways_v2.json> — OpenStreetMap
(ODbL, (c) OpenStreetMap contributors) ways in the render's world frame
(x = (lon + 122.438) * 111320 * cos 37.76°, y = (lat - 37.76) * 111320),
sorted for hq_scene's park paths and car rules:
  car  — roads cars drive and park on
  free — road surfaces closed to private cars (JFK Promenade, the car-free
         loop of Twin Peaks Boulevard, busways): asphalt, no parked cars
  foot — footways, paths, steps, cycleways, tracks: [points, width m, surface, highway]
         (sidewalks and crossings are not fetched)
fetch: osm_fetch.py highways.json '[out:json][timeout:240];(way["highway"]
  ["footway"!~"sidewalk|crossing|traffic_island"]["area"!="yes"]
  (37.70,-122.52,37.84,-122.35););out tags geom;'"""
import sys, json
KX = 111320 * 0.790582709628753; KY = 111320
CAR = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service',
       'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'road'}
FOOT = {'footway': 2.0, 'path': 1.6, 'steps': 2.0, 'cycleway': 2.4, 'bridleway': 2.0, 'track': 3.0}
DIRT = {'dirt', 'ground', 'earth', 'gravel', 'fine_gravel', 'compacted', 'unpaved', 'sand', 'grass', 'woodchips', 'mud', 'pebblestone'}
def surf(t):
    s = t.get('surface', '')
    if s in DIRT: return 'dirt'
    if s in ('asphalt',): return 'asphalt'
    if s in ('wood',): return 'wood'
    if s in ('concrete', 'paving_stones', 'sett', 'concrete:plates', 'paved', 'bricks', 'stone'): return 'concrete'
    return 'dirt' if t['highway'] in ('path', 'track', 'bridleway') else 'unknown'     # hq_scene decides by the ground
out = dict(car=[], free=[], foot=[])
for e in json.load(open(sys.argv[1]))['elements']:
    t = e.get('tags', {}); hw = t.get('highway'); g = e.get('geometry') or []
    if len(g) < 2 or t.get('indoor') == 'yes' or t.get('tunnel') in ('yes', 'building_passage') or t.get('layer', '0').startswith('-'): continue
    P = [round(v, 1) for p in g for v in ((p['lon'] + 122.438) * KX, (p['lat'] - 37.76) * KY)]
    mv = t.get('motor_vehicle', t.get('motorcar', t.get('access', 'yes')))
    closed = mv in ('no', 'bus', 'psv', 'private', 'emergency') or t.get('access') == 'no'
    if hw in CAR and not closed: out['car'].append(P)
    elif hw in CAR or hw in ('pedestrian', 'busway') or (hw == 'construction' and closed):
        out['free'].append(P)
    elif hw in FOOT:
        try: w = float(str(t.get('width', '')).replace('m', '').strip())
        except ValueError: w = FOOT[hw]
        out['foot'].append([P, round(min(max(w, 1.0), 6.0), 1), surf(t), hw])
json.dump(out, open(sys.argv[2], 'w'), separators=(',', ':'))
print({k: len(v) for k, v in out.items()})
