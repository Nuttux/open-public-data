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
  void-rise  mostly void but the new median well ABOVE the record: a void only lowers a
             reading, so the rise is real → new (towers finished 2016-2025)
  tower-podium new lower on a record of TALL m or more but p90 ≥ 0.8 × the record: the
             tower stands, the median reads its podium → the record stays (90 towers
             were cut to their podium before this rule, e.g. gid 57674 112 m → 9 m)
  tall-drop  new lower on a record of TALL m or more (a sliver) → new median (TALL_DROP=keep: the
             record). REFEREED 25/09 by OSM heights (heights_referee.py, 405 records
             with an OSM height): median absolute error 2016 9.8 m, 2025 median 2.2 m,
             p90 6.7 m — the 2016 heights of these were wrong (slivers between towers
             read the towers). `void` stays with the record (2.7 vs 2.8 m: a tie)
  canopy     new much lower, the record's height is not a building's (a
             footprint under 150 m² read over 12 m, or p90 under 60 % of the
             old height): the older survey read the trees over a house → new
  low        new median under 2 m: gone or a vacant lot by the survey's date;
             NOT hidden here (the record stays): listed for the gap step
  split      new median much lower, p90 near the old height → new median
             (refereed: MAE 2016 1.7 / median 1.4 / p90 1.9 m on 120 records)
  rebuilt    new much higher and the record's year is at/after the old survey:
             a new building on the old outline → new; rebuilt-mixed when p90 is far
             above the median (a tower on part of the old lot): the record stays,
             the OSM outline (newb_prep) brings the tower
  grew       new much higher, older year: an addition, or trees → new when
             p90 − median < 4 m (a flat top like a roof); grew-tall when the new
             median is ≥ TALL and over twice the record (a tower) → new; else the record stays
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
out, cls, ex, cg = {}, collections.Counter(), collections.defaultdict(list), {}
VOID = 0.15
TALL = 12.0
for k, (h, p90, n, *vd) in H.items():
    vd = vd[0] if vd else 0
    b = B.get(int(k))
    if b is None: continue          # a record from another file (OSM): its own step
    old = b['h']; d = h - old
    area = 0.5 * abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(b['ring'], b['ring'][1:] + b['ring'][:1])))
    if n < MIN_PX: c = 'few'; v = None
    elif vd > VOID * (n + vd) and d > max(1.5, 0.15 * old): c = 'void-rise'; v = h   # a void only pulls a reading DOWN: a rise is real (The Stack, 2016 lot 35 m → 154 m)
    elif vd > VOID * (n + vd): c = 'void'; v = None
    elif abs(d) <= max(1.5, 0.15 * old): c = 'same'; v = h
    elif h < 2.0: c = 'low'; v = None
    elif d < 0 and old >= TALL and p90 >= 0.8 * old: c = 'tower-podium'; v = None   # the tower still stands (p90), the median reads the podium
    elif d < 0 and old >= TALL: c = 'tall-drop'; v = None if os.environ.get('TALL_DROP', 'accept') == 'keep' else h   # refereed: see below
    elif d < 0 and ((area < 150 and old > 12) or p90 < 0.6 * old): c = 'canopy'; v = h
    elif d < 0: c = 'split'; v = h
    elif (b['year'] or 0) >= OLD_SURVEY and p90 - h > max(8.0, 0.3 * h): c = 'rebuilt-mixed'; v = None   # a new tower on the old lot's outline: its own outline comes from OSM (newb_prep)
    elif (b['year'] or 0) >= OLD_SURVEY: c = 'rebuilt'; v = h
    elif p90 - h < 4: c = 'grew'; v = h
    elif h >= TALL and h > 2 * old: c = 'grew-tall'; v = h   # a house lot become a tower is not a tree
    else: c = 'grew-tree'; v = None
    cls[c] += 1
    if c != 'same': cg[k] = c
    if v is not None: out[k] = round(v, 2)
    if len(ex[c]) < 5 and c not in ('same', 'few'): ex[c].append(dict(gid=int(k), old=round(old, 1), new=h, p90=p90, n=n, year=b['year'], xy=[round(b['cx']), round(b['cy'])]))
meta = dict(source=M, old_survey=OLD_SURVEY, classes=dict(cls), examples=ex, rules=__doc__.split('the rules')[1].strip())
json.dump(dict(meta=meta, h=out, cls=cg), open(OUT, 'w'), separators=(',', ':'))   # cls: every footprint not 'same', by gid
print(dict(cls), '→', len(out), 'heights', OUT)
for c, e in ex.items(): print(c, e[:3])
