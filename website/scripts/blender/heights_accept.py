"""Which measured heights (lidar_heights.py) replace the records' heights:

    CITY=vancouver python3 heights_accept.py <measured.json> <out heights.json> [survey year]

city_data HEIGHTS=1 reads the output ({"h": {gid: h}}, today's city only).
Each footprint falls in ONE class, counted in the output's meta; the rules
(25/09, calibrated on the first Vancouver tiles: 2016 → 2025, median change
+0.06 m, 90 % within −0.6 / +1.9 m):
  few        under MIN_PX 1 m pixels read: the record stays
  void       over VOID of the footprint empty in the survey: the record stays
             (LidarBC 2025 dropped the tops of the tall towers: a median read at
             their edges came out ~41 m under the 2016 height for buildings over 60 m)
  same       |new − old| ≤ max(1.5 m, 15 %): the survey refines it → new
  tall-drop  new lower on a record of TALL m or more: the record stays (TALL_DROP=keep,
             the default) — LidarBC 2025's void around the towers spills past their
             footprints, and the 2016 heights of slivers between towers read the
             towers: which survey is right is for a referee (OSM heights) to say
  canopy     new much lower, the record's height is not a building's (a
             footprint under 150 m² read over 12 m, or p90 under 60 % of the
             old height): the older survey read the trees over a house → new
  low        new median under 2 m: gone or a vacant lot by the survey's date;
             NOT hidden here (the record stays): listed for the gap step
  split      new median much lower but p90 near the old height: a tower
             over a podium or part of the lot rebuilt → p90 when the old
             record says tall, else new median (the outline cannot say more)
  rebuilt    new much higher and the record's year is at/after the old survey:
             a new building on the old outline → new; rebuilt-mixed when p90 is far
             above the median (a tower on part of the old lot): the record stays,
             the OSM outline (newb_prep) brings the tower
  grew       new much higher, older year: an addition, or trees → new when
             p90 − median < 4 m (a flat top like a roof), else the record stays
The record's own height is the OLD survey's (the v1 engine: HRDEM 2016)."""
import json, sys, collections
import os
os.environ.update(NEWB='0', FRESH='0', SOUTH='0', PLACES_OV='0')
import city_data

MIN_PX = 12
M, OUT = sys.argv[1], sys.argv[2]
OLD_SURVEY = int(sys.argv[3]) if len(sys.argv) > 3 else 2016
H = json.load(open(M))['h']
B = {b['gid']: b for b in city_data.buildings(-1e6, -1e6, 1e6, 1e6)}
out, cls, ex = {}, collections.Counter(), collections.defaultdict(list)
VOID = 0.15
TALL = 12.0
for k, (h, p90, n, *vd) in H.items():
    vd = vd[0] if vd else 0
    b = B.get(int(k))
    if b is None: continue          # a record from another file (OSM): its own step
    old = b['h']; d = h - old
    area = 0.5 * abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(b['ring'], b['ring'][1:] + b['ring'][:1])))
    if n < MIN_PX: c = 'few'; v = None
    elif vd > VOID * (n + vd): c = 'void'; v = None
    elif abs(d) <= max(1.5, 0.15 * old): c = 'same'; v = h
    elif h < 2.0: c = 'low'; v = None
    elif d < 0 and old >= TALL and os.environ.get('TALL_DROP', 'keep') == 'keep': c = 'tall-drop'; v = None   # the survey's towers: see below
    elif d < 0 and ((area < 150 and old > 12) or p90 < 0.6 * old): c = 'canopy'; v = h
    elif d < 0: c = 'split'; v = p90 if old >= 12 else h
    elif (b['year'] or 0) >= OLD_SURVEY and p90 - h > max(8.0, 0.3 * h): c = 'rebuilt-mixed'; v = None   # a new tower on the old lot's outline: its own outline comes from OSM (newb_prep)
    elif (b['year'] or 0) >= OLD_SURVEY: c = 'rebuilt'; v = h
    elif p90 - h < 4: c = 'grew'; v = h
    else: c = 'grew-tree'; v = None
    cls[c] += 1
    if v is not None: out[k] = round(v, 2)
    if len(ex[c]) < 5 and c not in ('same', 'few'): ex[c].append(dict(gid=int(k), old=round(old, 1), new=h, p90=p90, n=n, year=b['year'], xy=[round(b['cx']), round(b['cy'])]))
meta = dict(source=M, old_survey=OLD_SURVEY, classes=dict(cls), examples=ex, rules=__doc__.split('the rules')[1].strip())
json.dump(dict(meta=meta, h=out), open(OUT, 'w'), separators=(',', ':'))
print(dict(cls), '→', len(out), 'heights', OUT)
for c, e in ex.items(): print(c, e[:3])
