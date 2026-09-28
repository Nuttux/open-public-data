"""tree_edge_prep.py — TREES IN THE ROAD (street_edge agent [bugs], 28/09). Daniel: a tree stays on the roadway only when it
really stands on a median; the others go to the sidewalk on their side, or away.

For every listed street tree (veg.npz, the DataSF Street Tree List, st_site from its qSiteInfo: 1 sidewalk, 2 median, 3 yard) whose
point lies more than KERB (1.2 m) inside the roadway polygon (city_data.streets, h8n7-e4ns ROW minus the closed kerb rings):
  keep   st_site == 2 (the list says median) AND the data has a median there: two centrelines of the same street, one on each side
         of the tree within 18 m (the city's centreline network carries a divided street as two carriageways; SFMTA 4g86-grxu,
         PDDL), or no OSM carriageway within 5 m, or >= 8 m from both kerbs and >= 2.5 m from a carriageway line (a wide
         median: the Embarcadero's palms; no strip laid, the median strip only under the divided-street runs).
  stay   any other tree more than 6 m from every OSM carriageway: a promenade or plaza the roadway polygon takes in. The roadway polygon has no island there (else the tree would not be on it): hq_city lays a planted median strip under
         the kept run (medians: the tree's neighbours along the street within 16 m, 1.8 m wide, 15 cm kerb).
  snap   otherwise: to the nearest roadway edge, 0.9 m beyond it (1.5 m if that is under a footprint): the sidewalk on its side.
  drop   no such spot within 14 m of the tree, or the spot is under a building.
-> tree_edge.json {'moves': {listed index: [x, y] | null (drop)}, 'keep': [indices that stay put], 'medians': [[x0, y0, x1, y1], ...], stats}
veg_hq (TREE_EDGE=1) applies it to the listed trees (by the index its species join already finds); a canopy mass left in the
carriageway is dropped. python3 tree_edge_prep.py [x0 y0 x1 y1]"""
import sys, os, json, math, time, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import city_data, roofs_prep, shapely
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union, nearest_points
from shapely.strtree import STRtree
VEG = '/Users/daniel/code/qipu-render-work/veg'
SW_FILE = os.environ.get('SE_SW', '/Volumes/DANI-SD-DRIVE2/street_edge/sidewalk_widths_4g86.geojson')
OUT = os.path.join(HERE, 'tree_edge.json'); KERB = 1.2
args = [a for a in sys.argv[1:]]; BOX = [float(v) for v in args[:4]] if len(args) >= 4 else [-1e7, -1e7, 1e7, 1e7]
t0 = time.time()
D = np.load(f'{VEG}/veg.npz'); X, Y, S = D['st_x'].astype(np.float64), D['st_y'].astype(np.float64), D['st_site']
inb = (X >= BOX[0]) & (X <= BOX[2]) & (Y >= BOX[1]) & (Y <= BOX[3])
bx = (max(BOX[0], X[inb].min()) - 60, max(BOX[1], Y[inb].min()) - 60, min(BOX[2], X[inb].max()) + 60, min(BOX[3], Y[inb].max()) + 60)
rw = [Polygon(r) for rings, *_ in city_data.streets(*bx) for r in rings if len(r) >= 3]
RW = unary_union([p if p.is_valid else p.buffer(0) for p in rw]); shapely.prepare(RW); RB = RW.boundary
FP = [Polygon(b['ring']) for b in city_data.buildings(*bx) if len(b['ring']) >= 3]
FP = [p if p.is_valid else p.buffer(0) for p in FP]; FT = STRtree(FP)
def roofed(x, y): return any(FP[i].contains(Point(x, y)) for i in FT.query(Point(x, y)))
CL, CN = [], []
for f in json.load(open(SW_FILE))['features']:
    g = f.get('geometry')
    if not g or g['type'] != 'LineString': continue
    c = np.array(g['coordinates'], np.float64); x, y = roofs_prep.lonlat_to_eng(c[:, 0], c[:, 1])
    CL.append(LineString(np.c_[x, y])); CN.append(f['properties'].get('street'))
CT = STRtree(CL)
# the OSM carriageways (ways_v2.json 'car', the lines hq_scene's footway test reads): a tree far from every one of them stands on a
# promenade, a plaza or a wide median the roadway polygon takes in (the Embarcadero), not in a lane
WJ = json.load(open(os.environ.get('OSM_WAYS', '/Users/daniel/code/qipu-render-work/critic/osm/ways_v2.json')))
CW = []
for w in WJ['car']:
    P = np.array(w, np.float64).reshape(-1, 2)
    if len(P) >= 2 and P[:, 0].max() > bx[0] and P[:, 0].min() < bx[2] and P[:, 1].max() > bx[1] and P[:, 1].min() < bx[3]: CW.append(LineString(P))
CWT = STRtree(CW)
def d_car(x, y):
    p = Point(x, y); c = [CW[i].distance(p) for i in CWT.query(p.buffer(30.0))]
    return min(c) if c else 99.0
CAR_MED, CAR_SIDE = 5.0, 6.0
print(f'{inb.sum()} listed trees, {len(rw)} roadway polygons, {len(FP)} footprints, {len(CL)} centrelines ({time.time() - t0:.0f} s)', flush=True)

def dual(x, y):
    """two centrelines of one street on both sides of the point, within 18 m"""
    p = Point(x, y); near = [i for i in CT.query(p.buffer(18.0)) if CL[i].distance(p) <= 18.0]
    by = {}
    for i in near: by.setdefault(CN[i], []).append(i)
    for nm, ids in by.items():
        if len(ids) < 2: continue
        L0 = CL[ids[0]]; a = np.array(L0.coords[0]); b = np.array(L0.coords[-1]); t = (b - a) / (np.linalg.norm(b - a) + 1e-9)
        sides = set()
        for i in ids:
            q = nearest_points(CL[i], p)[0]; v = np.array([q.x - x, q.y - y])
            if np.linalg.norm(v) < 0.3: continue
            sides.add(np.sign(t[0] * v[1] - t[1] * v[0]))
        if len(sides) == 2: return True
    return False

idx = np.nonzero(inb)[0]; on = shapely.contains_xy(RW, X[idx], Y[idx])
moves, keep, dualk = {}, [], []; st = dict(on_roadway=0, at_kerb=0, kept_median=0, median_site_no_median=0, snapped=0, dropped=0)
for i in idx[on]:
    x, y = X[i], Y[i]; p = Point(x, y); d = RB.distance(p)
    st['on_roadway'] += 1
    if d < KERB: st['at_kerb'] += 1; continue                         # at the kerb: hq_city/veg_hq's own nudge handles it
    dc = d_car(x, y)
    if S[i] == 2:
        if dual(x, y): keep.append(int(i)); dualk.append(int(i)); st['kept_median'] += 1; continue
        if dc > CAR_MED or (d >= 8.0 and dc >= 2.5): keep.append(int(i)); st['kept_median'] += 1; continue   # a wide median
        st['median_site_no_median'] += 1
    elif dc > CAR_SIDE: keep.append(int(i)); st['kept_off_lanes'] = st.get('kept_off_lanes', 0) + 1; continue     # a promenade / plaza tree: stays
    q = nearest_points(RB, p)[0]; n = np.array([q.x - x, q.y - y]); n /= (np.linalg.norm(n) + 1e-9)
    new = None
    if d <= 14.0:
        for off in (0.9, 1.5):
            c = (q.x + n[0] * off, q.y + n[1] * off)
            if not shapely.contains_xy(RW, *c) and not roofed(*c): new = [round(c[0], 2), round(c[1], 2)]; break
    moves[int(i)] = new; st['snapped' if new else 'dropped'] += 1
# the medians under the kept runs: each kept tree joined to its kept neighbours within 16 m (a pad alone)
K = np.array([[X[i], Y[i]] for i in dualk]) if dualk else np.zeros((0, 2)); med = []
for a in range(len(K)):
    dd = np.hypot(K[:, 0] - K[a, 0], K[:, 1] - K[a, 1]); nb = [b for b in np.nonzero((dd > 0.5) & (dd <= 16.0))[0] if b > a]
    if nb:
        for b in nb: med.append([round(float(v), 2) for v in (*K[a], *K[b])])
    elif not ((dd > 0.5) & (dd <= 16.0)).any(): med.append([round(float(v), 2) for v in (*K[a], *K[a])])
json.dump(dict(what='tree_edge: listed street trees in the carriageway (veg.npz index): moves (null = drop), kept medians, median strips',
               src='DataSF Street Tree List (qSiteInfo), h8n7-e4ns roadway; median evidence: SFMTA 4g86-grxu centrelines (PDDL)',
               box=BOX, stats=st, moves=moves, keep=keep, medians=med), open(OUT, 'w'), separators=(',', ':'))
print(f'-> {OUT} ({os.path.getsize(OUT) / 1e6:.1f} MB) {st}, {len(med)} median links, {time.time() - t0:.0f} s', flush=True)
