"""The OpenStreetMap layers the prep scripts read (ODbL, (c) OpenStreetMap
contributors), for any city: CITY=vancouver python3 osm_city.py [what…]

  buildings  newbuildings/osm/b_<tile>.json, p_<tile>.json   (newb_prep.py)
  roads      life/roads_osm.json                               (newb_prep roles, life_prep)
  ways       critic/osm/highways.json → ways_prep.py → ways_v2.json (hq_scene: paths, car-free roads)

Tiles are the city box (city.json `bbox`) cut 2 x 3; a file already there is kept.
San Francisco's were fetched by hand (newbuildings/fetch_all.sh, life_prep.py)."""
import os, sys, time
import cityconf as C
from osm_fetch import fetch

WHAT = sys.argv[1:] or ['buildings', 'roads', 'ways']
BOX = '({},{},{},{})'.format(*C.BBOX)

def get(path, q, tries=8):
    if os.path.exists(path) and os.path.getsize(path) > 0: print('kept', path); return True
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ok = fetch(q, path, tries)
    time.sleep(5)
    return ok

def bldg(t, depth=0):
    """a tile's buildings and parts; a tile the servers keep timing out on
    (downtown's) is fetched as its four quarters (newb_prep dedups by OSM id)"""
    b = '({},{},{},{})'.format(*t); n = '_'.join(f'{v:.3f}' for v in t).replace('.', '_').replace('-', '_')
    for pre, tag in (('b', 'building'), ('p', 'building:part')):
        path = C.work('newbuildings', 'osm', f'{pre}_{n}.json')
        if get(path, f'[out:json][timeout:600];(way["{tag}"]{b};relation["{tag}"]{b};);out tags geom;', tries=3 if depth < 2 else 8): continue
        s_, w_, n_, e_ = t; ms, mw = round((s_ + n_) / 2, 4), round((w_ + e_) / 2, 4)
        print('split', n, flush=True)
        for q in ((s_, w_, ms, mw), (s_, mw, ms, e_), (ms, w_, n_, mw), (ms, mw, n_, e_)): bldg(q, depth + 1)
        return

if 'buildings' in WHAT:
    for t in C.tiles(): bldg(t)
if 'roads' in WHAT:
    get(C.work('life', 'roads_osm.json'), '[out:json][timeout:300];\nway["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link'
        f'|tertiary|tertiary_link|residential|unclassified|living_street|busway)$"]{BOX};\nout geom tags;')
if 'ways' in WHAT:
    get(C.work('critic', 'osm', 'highways.json'), f'[out:json][timeout:300];(way["highway"]["footway"!~"sidewalk|crossing|traffic_island"]["area"!="yes"]{BOX};);out tags geom;')
print('done', WHAT)
