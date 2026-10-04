"""C1 step: the area's LOST buildings -> eras/lost_buildings.geojson (era.py's SANBORN hook, engine world metres).
Only on land no record covers today (c1/patches.py: >= 3 m from every 2015 footprint, not today's street right-of-way except the
viaduct corridor). Everywhere else a lost building sits under a later record, and era.infill draws a stand-in there.
HOUSES (east of Main St, the East End grid): one candidate slot per 25-ft lot (7.6 m, CONVENTION) along both sides of each east-west
street, 6.5 x 11 m, front 14 m from the centreline (10 m half right-of-way + 4 m setback, CONVENTION), not within 12 m of a north-south
street. A slot is BUILT in a mosaic year when its mean built p (c1/built.py) >= HOUSE_P and the block-level share (eras/masks
napl<Y> G) >= 0.45 (in the Hogan's Alley block the block-level share alone); it must lie >= 70 % on free land.
BIG buildings (anywhere in the box): components of built p >= 0.65 on free land, >= 200 m2, solid (area / min rectangle >= 0.65) ->
the minimum rotated rectangle; the same building across years = IoU >= 0.3.
A building is kept when built in >= 2 consecutive mosaic years (noise filter, CONVENTION); a HOUSE needs them up to 1967 (houses first
seen 1972+ on free land were lawns / cleared lots in the 04/10 random sample) or, in the Hogan's Alley block, any mosaic up to 1967
(the clearance is dated by the event, not by the photos). Gaps between seen years are filled.
DATES (era.py: y0, gone_by):
  first seen 1950 -> y0 = median SOURCED roll year of today's records within 120 m, capped 1949 (CONVENTION, record_years' undated rule)
  else y0 = midpoint between the mosaic it is absent from and the first it is seen in (SOURCED bracket, midpoint CONVENTION)
  gone_by = midpoint between its last mosaic and the next (SOURCED bracket) except
    Hogan's Alley block (Union St to Prior St, Main St to Jackson Ave) and the 1972 viaduct corridor, last seen 1967 or earlier but
    standing through 1967 by event: 1970.0 (Wikipedia 'Hogan's Alley, Vancouver': 'destroyed circa 1970'; 'Viaduct construction
    lasted from 1967-1971'), inside the 1967-1972 bracket the mosaics give
    last seen 1982 -> 1984.0 (CONVENTION: the last photo; the 2015 footprints prove it gone)
No lost building under a structure's deck in a year the structure stands (viaduct ramps read as roofs): CONVENTION.
HEIGHT: house 2 storeys 7.5 m frame, commercial 2 storeys 8 m brick, industrial 1 storey 6 m: CONVENTION by kind (no flight date, so no
sun angle for shadow lengths)."""
import json, math, collections, numpy as np, cv2
import common as c, cityconf as C, city_data as CD
from shapely.geometry import Polygon
from shapely.strtree import STRtree
YEARS = [1950, 1959, 1967, 1972, 1978, 1982]
NEXT = dict(zip(YEARS, YEARS[1:] + [None])); PREV = dict(zip(YEARS[1:], YEARS))
HOUSE_P = 0.5
e0, n1, Wd, Hd = c.grid()
recs = c.records(200)
def w2px(x, y): return c.to_px(*c.w2utm(x, y))
def poly_px(r): return np.array([w2px(x, y) for x, y in r], np.int32)
def px2w(i, j): return c.utm2w(e0 + i, n1 - j)
patches = json.load(open(f'{c.OUT}/patches.json'))
free = np.zeros((Hd, Wd), np.uint8)
for p in patches: cv2.fillPoly(free, [poly_px(p['ring'])], 1)
MAINX = 2215.0; HA = (MAINX, 2252.0, 2678.0, 2356.0)          # Hogan's Alley block: Main to Jackson, Prior to Union (street lines)
def in_ha(x, y): return HA[0] <= x <= HA[2] and HA[1] <= y <= HA[3]
L = CD.named_lines()
EW = {}; NS = []
for nm, pls in L.items():
    for pl in pls:
        if not any(c.in_box(x, y, 50) for x, y in pl): continue
        (x0, y0), (x1, y1) = pl[0], pl[-1]; ang = math.degrees(math.atan2(y1 - y0, x1 - x0)) % 180
        if 'VIADUCT' in nm: continue
        if ang < 8 or ang > 172: EW.setdefault(nm, []).append(pl)
        elif 80 < ang < 100: NS.extend(pl)
NSX = np.array([p[0] for p in NS]); NSY = np.array([p[1] for p in NS])
def near_ns(x, y):
    d = np.hypot(NSX - x, NSY - y); k = d < 70
    return k.any() and np.min(np.abs(NSX[k] - x)) < 12
slots = []
for nm, pls in EW.items():
    segs = [(p, q) for pl in pls for p, q in zip(pl, pl[1:])]
    for x in np.arange(MAINX + 10, max(max(p[0], q[0]) for p, q in segs), 7.6):   # one global 25-ft lattice: no duplicates where two
        hit = [(p, q) for p, q in segs if min(p[0], q[0]) <= x + 3.25 <= max(p[0], q[0])]   # centreline files overlap
        if not hit: continue
        (ax, ay), (bx, by) = hit[0]; y = ay + (by - ay) * (x + 3.25 - ax) / ((bx - ax) or 1)
        for side in (1, -1):
            yf = y + side * 14; yb = yf + side * 11
            if near_ns(x + 3.25, (yf + yb) / 2): continue
            slots.append(dict(street=nm, ring=[(x, min(yf, yb)), (x + 6.5, min(yf, yb)), (x + 6.5, max(yf, yb)), (x, max(yf, yb))]))
def mean_in(arr, q):
    i0, j0 = np.maximum(q.min(0), 0); i1, j1 = np.minimum(q.max(0) + 1, [Wd, Hd])
    if i1 <= i0 or j1 <= j0: return 0.0
    mm = np.zeros((j1 - j0, i1 - i0), np.uint8); cv2.fillPoly(mm, [q - [i0, j0]], 1)
    return float(arr[j0:j1, i0:i1][mm > 0].mean())
for s in slots: s['q'] = poly_px(s['ring']); s['free'] = mean_in(free, s['q'])
slots = [s for s in slots if s['free'] >= 0.7 and c.in_box(s['ring'][0][0], s['ring'][0][1])]
GM = {}
for Y in YEARS:
    m = json.load(open(f'{c.ERAS}/masks/napl{Y}.json')); a = cv2.imread(f'{c.ERAS}/masks/napl{Y}.png')[..., ::-1]
    GM[Y] = (m, a[..., 1].astype(np.float32) / 255)
def gshare(Y, x, y):
    m, g = GM[Y]; i = int((x - m['x0']) / m['res']); j = int((m['y1'] - y) / m['res'])
    return float(g[j, i]) if 0 <= i < m['w'] and 0 <= j < m['h'] else 0.0
# no lost building under a deck that stood that year (the photo reads a viaduct ramp as a roof): CONVENTION, structures.json
from shapely.geometry import LineString
STR = [(st_['y0'], st_['y1'], LineString(st_['path']).buffer(st_['w'] / 2 + 3)) for st_ in json.load(open(f'{c.OUT}/structures.json'))]
def under_deck(ring, Y): return any(a <= Y + 0.5 < b and g.intersects(Polygon(ring)) for a, b, g in STR)
seen = collections.defaultdict(list); big = []
for Y in YEARS:
    P = np.load(f'{c.OUT}/built_{Y}.npz')['p'].astype(np.float32)
    for k, s in enumerate(slots):
        cx = s['ring'][0][0] + 3.25; cy = (s['ring'][0][1] + s['ring'][2][1]) / 2
        # in the Hogan's Alley block (all of it free land since the viaduct) the block-level share alone decides (houses stood on every
        # lot of a built block face: CONVENTION); elsewhere the slot's own built p must agree
        if gshare(Y, cx, cy) >= 0.45 and (in_ha(cx, cy) or mean_in(P, s['q']) >= HOUSE_P) and not under_deck(s['ring'], Y): seen[k].append(Y)
    m = ((P >= 0.65) & (free > 0)).astype(np.uint8); m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    for k in range(1, n):
        if st[k, 4] < 200: continue
        ys, xs = np.nonzero(lab[st[k, 1]:st[k, 1] + st[k, 3], st[k, 0]:st[k, 0] + st[k, 2]] == k)
        pts = np.c_[xs + st[k, 0], ys + st[k, 1]].astype(np.float32); rect = cv2.minAreaRect(pts)
        if st[k, 4] / max(rect[1][0] * rect[1][1], 1) < 0.65: continue
        ring = [px2w(*p) for p in cv2.boxPoints(rect)]
        if under_deck(ring, Y): continue
        big.append(dict(Y=Y, ring=ring, area=float(st[k, 4])))
# identity of big buildings across years
B = []
for Y in YEARS:
    tree = STRtree([b['poly'] for b in B]) if B else None
    for o in [b for b in big if b['Y'] == Y]:
        po = Polygon(o['ring']); hit = None
        if tree is not None:
            for ii in tree.query(po):
                q = B[int(ii)]
                if po.intersection(q['poly']).area / po.union(q['poly']).area >= 0.3: hit = q; break
        if hit is None: B.append(dict(poly=po, ring=o['ring'], area=o['area'], seen=[Y]))
        elif Y not in hit['seen']: hit['seen'].append(Y)
srcY = np.array([[b['cx'], b['cy'], b['from']] for b in recs if str(b['from_src']).startswith('sourced')])
def consec(s): return any(YEARS.index(b) == YEARS.index(a) + 1 for a, b in zip(s, s[1:]))
feats = []; drop = collections.Counter()
def add(ring, kind, s, ha):
    s = sorted(s); f, l = s[0], s[-1]
    cx = sum(p[0] for p in ring) / 4; cy = sum(p[1] for p in ring) / 4
    if ha and l < 1967: l = 1967                                    # the block stood to the viaduct clearance (event)
    if f == 1950 or ha:                                             # Hogan's Alley's houses predate the photos (CONVENTION)
        dd = np.hypot(srcY[:, 0] - cx, srcY[:, 1] - cy); yy = srcY[dd < 120, 2]
        y0 = float(min(1949, np.median(yy))) if len(yy) >= 3 else 1910.0; y0s = 'CONVENTION: median sourced roll year within 120 m, capped 1949'
    else:
        y0 = (PREV[f] + f) / 2 + 0.5; y0s = f'SOURCED bracket: absent {PREV[f]}, seen {f} (midpoint CONVENTION)'
    if ha and l == 1967: gone, gs = 1970.0, "SOURCED: Hogan's Alley cleared for the viaduct 'circa 1970' (Wikipedia 'Hogan's Alley, Vancouver'), inside the 1967-1972 photo bracket"
    elif l == 1982: gone, gs = 1984.0, 'CONVENTION: seen 1982 (last photo); gone by the 2015 footprints'
    else: gone, gs = (l + NEXT[l]) / 2 + 0.5, f'SOURCED bracket: seen {l}, absent {NEXT[l]} (midpoint CONVENTION)'
    st, h, mat = {'house': (2, 7.5, 'frame'), 'commercial': (2, 8.0, 'brick'), 'industrial': (1, 6.0, 'concrete')}[kind]
    feats.append(dict(type='Feature', geometry=dict(type='Polygon', coordinates=[[list(map(lambda v: round(float(v), 2), p)) for p in ring + [ring[0]]]]),
                      properties=dict(id=f'va1L{len(feats):04d}', kind=kind, seen=s, y0=round(y0, 2), y0_src=y0s, gone_by=gone, gone_src=gs, material=mat,
                                      storeys=st, height_m=h, height_src='CONVENTION by kind', area='va1', hogans_alley=bool(ha))))
for k, s in seen.items():
    r = slots[k]['ring']; cx = r[0][0] + 3.25; cy = (r[0][1] + r[2][1]) / 2; ha = in_ha(cx, cy)
    # a house must be seen in two consecutive mosaics up to 1967 (the random-sample check of 04/10: houses first seen in 1972-1982
    # on free land were lawns of the new estates and cleared lots, 7 of 7 false), then it keeps its later consecutive sightings
    e = sorted(y for y in s if y <= 1967)
    if ha and e: add([tuple(p) for p in r], 'house', s, ha)
    elif consec(e):
        run = [e[0]]
        for y in YEARS[YEARS.index(e[0]) + 1:]:
            if y in s: run.append(y)
            else: break
        add([tuple(p) for p in r], 'house', run, ha)
    else: drop['house_not_two_photos_to_1967'] += 1
for b in B:
    cx, cy = b['poly'].centroid.x, b['poly'].centroid.y
    if not c.in_box(cx, cy): continue
    if not consec(sorted(b['seen'])): drop['big_single_year'] += 1; continue
    add([tuple(p) for p in b['ring']], 'industrial' if b['poly'].area >= 600 else 'commercial', b['seen'], in_ha(cx, cy))
json.dump(dict(type='FeatureCollection', meta=dict(made_by='city_run/era/c1/lost.py', frame='engine world metres (cityconf.proj)', house_p=HOUSE_P,
               source='NRCan NAPL Salish mosaics 1950-1982 (OGL-Canada 2.0) via c1/built.py + c1/offsets.py; dates per feature', dropped=dict(drop)), features=feats),
          open(f'{c.ERAS}/lost_buildings.geojson', 'w'))
st_ = {Y: sum(1 for f in feats if f['properties']['y0'] <= Y + 0.5 < f['properties']['gone_by']) for Y in YEARS}
print('slots', len(slots), 'lost', len(feats), collections.Counter(f['properties']['kind'] for f in feats), 'hogan', sum(f['properties']['hogans_alley'] for f in feats), 'dropped', dict(drop))
print('standing', st_)
json.dump(dict(n=len(feats), kinds=collections.Counter(f['properties']['kind'] for f in feats), hogans_alley=sum(f['properties']['hogans_alley'] for f in feats), standing=st_, dropped=dict(drop)), open(f'{c.OUT}/lost_stats.json', 'w'), indent=1)
