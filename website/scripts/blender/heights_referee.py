"""Which survey is right where two LiDAR surveys disagree: OpenStreetMap's own
heights as the referee (ODbL, (c) OpenStreetMap contributors).

    CITY=vancouver python3 heights_referee.py <measured.json> <heights.json> [classes]

For the city's records of a class (default tall-drop,void,split,canopy — the
ones heights_accept left to a referee or decided on a rule), the OSM
outlines (buildings and building:parts, newbuildings/osm/*.json) covering at
least half of the record's area and carrying `height` (m) or
`building:levels` (× LEVEL_M, flagged) give the reference: the TALLEST such
covering part (a record is one extrusion; its roof line is its tallest part).
Printed per class: how often the old survey's height, the new survey's
median and its p90 is closest to OSM, and their median absolute errors."""
import glob, json, os, sys, collections
import numpy as np
import shapely
from shapely.geometry import Polygon
os.environ.update(NEWB='0', FRESH='0', SOUTH='0', PLACES_OV='0')
import city_data
import cityconf as C

LEVEL_M = 3.2
M = json.load(open(sys.argv[1]))['h']; A = json.load(open(sys.argv[2]))
CLS = (sys.argv[3] if len(sys.argv) > 3 else 'tall-drop,void,split,canopy').split(',')

def num(v):
    try: return float(str(v).replace('m', '').strip().split(';')[0])
    except ValueError: return None

polys, hs, srcs = [], [], []
seen = set()
for f in sorted(glob.glob(C.work('newbuildings', 'osm', '[bp]_*.json'))):
    for el in json.load(open(f))['elements']:
        t = el.get('tags', {}); k = (el['type'], el['id'])
        if k in seen or el['type'] != 'way' or not el.get('geometry'): continue
        seen.add(k)
        h = num(t.get('height')); src = 'height'
        if h is None and num(t.get('building:levels')) is not None:
            h = num(t['building:levels']) * LEVEL_M; src = 'levels'
        if h is None or h <= 0: continue
        g = Polygon([C.proj(p['lon'], p['lat']) for p in el['geometry']])
        if not g.is_valid: g = g.buffer(0)
        if g.is_empty or g.area < 4: continue
        polys.append(g); hs.append(h); srcs.append(src)
tree = shapely.STRtree(polys)
print('OSM outlines with a height', len(polys), dict(collections.Counter(srcs)), flush=True)

B = {b['gid']: b for b in city_data.buildings(-1e6, -1e6, 1e6, 1e6)}
rows = collections.defaultdict(list)
for k, c in A['cls'].items():
    if c not in CLS or k not in M: continue
    b = B[int(k)]; r = Polygon(b['ring'])
    if not r.is_valid: r = r.buffer(0)
    if r.is_empty or r.area < 4: continue
    ref = None
    for i in tree.query(r):
        ov = polys[i].intersection(r).area
        if ov >= 0.5 * r.area or ov >= 0.5 * polys[i].area:
            if ref is None or hs[i] > ref[0]: ref = (hs[i], srcs[i])
    if ref is None: continue
    h, p90 = M[k][0], M[k][1]
    rows[c].append((ref[0], b['h'], h, p90, ref[1]))

print(f'{"class":<10} {"n":>5} {"old closest":>12} {"med closest":>12} {"p90 closest":>12}   MAE old / med / p90 (m)')
for c in CLS:
    R = np.array([r[:4] for r in rows[c]], float)
    if not len(R): print(c, 'no OSM heights'); continue
    E = np.abs(R[:, 1:] - R[:, :1]); win = np.argmin(E, 1)
    print(f'{c:<10} {len(R):>5} {np.mean(win == 0):>12.2f} {np.mean(win == 1):>12.2f} {np.mean(win == 2):>12.2f}   '
          + ' / '.join(f'{v:.1f}' for v in np.median(E, 0)))
