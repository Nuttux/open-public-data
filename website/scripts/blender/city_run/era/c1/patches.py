"""C1 step: the land no record covers today (>= 3 m from every footprint; not today's street right-of-way, except in the 80 m viaduct
corridor), in patches >= 250 m2 -> eras/c1/patches.json (world rings) + per-year built share (built p >= 0.5) of each patch.
These patches are where a lost building can only come from the photos: everywhere else era.infill puts a stand-in on the later record."""
import json, numpy as np, cv2
import common as c
e0, n1, Wd, Hd = c.grid()
recs = c.records(200)
def poly_px(r): return np.array([c.to_px(*c.w2utm(x, y)) for x, y in r], np.int32)
def ll_px(r): return np.array([c.to_px(*c.ll2utm(lo, la)) for lo, la in r], np.int32)
fp = np.zeros((Hd, Wd), np.uint8)
for b in recs: cv2.fillPoly(fp, [poly_px(b['ring'])], 1)
par = np.zeros((Hd, Wd), np.uint8)
for f in json.load(open(f'{c.OUT}/parcels.geojson'))['features']:
    g = f['geometry']
    for p in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]): cv2.fillPoly(par, [ll_px(p[0])], 1)
via = np.zeros((Hd, Wd), np.uint8)
for e in json.load(open(f'{c.OUT}/osm_rail_bridges.json'))['elements']:
    if 'Viaduct' in (e['tags'].get('name') or ''): cv2.polylines(via, [ll_px([(q['lon'], q['lat']) for q in e['geometry']])], False, 1, 160)
row = cv2.dilate(par, np.ones((3, 3), np.uint8)) == 0
land = ((cv2.dilate(fp, np.ones((7, 7), np.uint8)) == 0) & (~row | (via > 0))).astype(np.uint8)
land = cv2.morphologyEx(land, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(land)
P = {Y: np.load(f'{c.OUT}/built_{Y}.npz')['p'].astype(np.float32) for Y in (1950, 1959, 1967, 1972, 1978, 1982)}
out = []
for k in range(1, n):
    if st[k, 4] < 250: continue
    cs, _ = cv2.findContours((lab == k).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnt = max(cs, key=cv2.contourArea); cnt = cv2.approxPolyDP(cnt, 1.5, True)[:, 0]
    ring = [list(map(lambda v: round(float(v), 1), c.utm2w(e0 + i, n1 - j))) for i, j in cnt]
    cx = sum(p[0] for p in ring) / len(ring); cy = sum(p[1] for p in ring) / len(ring)
    if not c.in_box(cx, cy): continue
    sel = lab == k
    out.append(dict(id=len(out), ring=ring, area=int(st[k, 4]), cx=round(cx), cy=round(cy), corridor=bool(via[sel].mean() > 0.5),
                    share={Y: round(float((P[Y][sel] >= 0.5).mean()), 2) for Y in P}))
json.dump(out, open(f'{c.OUT}/patches.json', 'w'), indent=0)
print(len(out), 'patches', sum(p['area'] for p in out), 'm2; corridor', sum(p['corridor'] for p in out))
