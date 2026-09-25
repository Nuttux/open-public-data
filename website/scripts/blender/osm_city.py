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

def get(path, q):
    if os.path.exists(path) and os.path.getsize(path) > 0: print('kept', path); return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not fetch(q, path): sys.exit(f'failed {path}')
    time.sleep(5)

if 'buildings' in WHAT:
    for t in C.tiles():
        b = '({},{},{},{})'.format(*t); n = '_'.join(f'{v:.3f}' for v in t).replace('.', '_').replace('-', '_')
        get(C.work('newbuildings', 'osm', f'b_{n}.json'), f'[out:json][timeout:600];(way["building"]{b};relation["building"]{b};);out tags geom;')
        get(C.work('newbuildings', 'osm', f'p_{n}.json'), f'[out:json][timeout:600];(way["building:part"]{b};relation["building:part"]{b};);out tags geom;')
if 'roads' in WHAT:
    get(C.work('life', 'roads_osm.json'), '[out:json][timeout:300];\nway["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link'
        f'|tertiary|tertiary_link|residential|unclassified|living_street|busway)$"]{BOX};\nout geom tags;')
if 'ways' in WHAT:
    get(C.work('critic', 'osm', 'highways.json'), f'[out:json][timeout:300];(way["highway"]["footway"!~"sidewalk|crossing|traffic_island"]["area"!="yes"]{BOX};);out tags geom;')
print('done', WHAT)
