"""se_prep.py — THE STREET EDGE (street_edge agent, 28/09): a sidewalk in front of every wall that meets a street.

The render's asphalt is the engine's roadway = DataSF h8n7-e4ns right of way minus the CLOSED kerb rings; where a kerb
ring does not close, the roadway runs to the property line. And DataSF's building footprints sit ~1.6 m off the right of
way (fit over North Beach: 3,092 fronts, mean wall-to-roadway gap 0.8 m, offset 1.65 m). So a third of the fronts stand
ON the asphalt: no sidewalk, no kerb, the stoops end in the carriageway, the gutter's pale pan lies at the wall's foot
(render + AI: "doorsteps / staircases going directly onto the street, a yellow patch but no curb", Daniel 28/09).

This writes, per roadway edge that has walls along it, an APRON: the strip by which the kerb must come in so that the
walls get the street's sidewalk width (the 60th percentile of the walls' distances, sampled every metre), a straight kerb
parallel to the published one. hq_city (SE_APRON=1) cuts the aprons out of the asphalt and lays them as sidewalk; the
kerb, its 15 cm step, the gutter and the kerb cars then follow the new kerb.
  width: the SFMTA Sidewalk Widths file (DataSF 4g86-grxu, 2014 AECOM study, `sidewalk_f` in feet, nearest parallel
         centreline within 30 m), Open Data Commons PDDL 1.0; unknown (0) or varying (<0): 10 ft, the Better Streets
         residential minimum. Clamped to 1.0-5.5 m.
  cap:   never more than 35 % of the roadway's own width along the wall's normal (alleys, narrow lanes keep a carriageway).
  skip:  an edge whose walls already have their width (the kerb would move < 0.25 m); an edge with walls along < 30 %.

python3 se_prep.py [x0 y0 x1 y1 (world m)] [--out se_aprons.json]
  input: city_data.buildings / city_data.streets (as the render reads them), SE_SW=<4g86 geojson>
  (default /Volumes/DANI-SD-DRIVE2/street_edge/sidewalk_widths_4g86.geojson)."""
import sys, os, json, math, time, numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import city_data, roofs_prep
import shapely
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from shapely.strtree import STRtree

FT = 0.3048
SW_FILE = os.environ.get('SE_SW', '/Volumes/DANI-SD-DRIVE2/street_edge/sidewalk_widths_4g86.geojson')
args = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(HERE, 'se_aprons.json')
if '--out' in sys.argv: args.remove(OUT)
BOX = [float(v) for v in args[:4]] if len(args) >= 4 else [-1e7, -1e7, 1e7, 1e7]
t0 = time.time()

# the sidewalk widths, in the engine frame
SWL, SWW = [], []
for f in json.load(open(SW_FILE))['features']:
    g = f.get('geometry')
    if not g or g['type'] != 'LineString': continue
    c = np.array(g['coordinates'], np.float64); x, y = roofs_prep.lonlat_to_eng(c[:, 0], c[:, 1])
    if x.max() < BOX[0] - 60 or x.min() > BOX[2] + 60 or y.max() < BOX[1] - 60 or y.min() > BOX[3] + 60: continue
    try: w = float(f['properties'].get('sidewalk_f') or 0)
    except ValueError: w = 0.0
    SWL.append(LineString(np.c_[x, y])); SWW.append(w * FT if w > 0 else None)
SWT = STRtree(SWL)
print(f'sidewalk widths: {len(SWL)} centrelines ({sum(1 for w in SWW if w)} with a width)', flush=True)

def sw_width(m, t):
    """the nearest centreline within 30 m running with the wall (within 35 deg): its sidewalk width, else 10 ft"""
    best = None
    for i in SWT.query(Point(*m).buffer(30.0)):
        L = SWL[i]; d = L.distance(Point(*m))
        if d > 30.0: continue
        p = L.project(Point(*m)); a = np.array(L.interpolate(max(p - 1, 0)).coords[0]); b = np.array(L.interpolate(min(p + 1, L.length)).coords[0])
        v = b - a; n = np.linalg.norm(v)
        if n < 1e-6 or abs(v @ t) / n < math.cos(math.radians(35)): continue
        if best is None or d < best[0]: best = (d, SWW[i])
    w = best[1] if best is not None and best[1] else 10 * FT
    return min(max(w, 1.0), 5.5)

bx = (BOX[0] - 40, BOX[1] - 40, BOX[2] + 40, BOX[3] + 40)
recs = city_data.buildings(*bx)
rw = []
for rings, yr, w_, cls in city_data.streets(*bx):
    for r in rings:
        if len(r) >= 3:
            p = Polygon(r); rw.append(p if p.is_valid else p.buffer(0))
RW = unary_union(rw); shapely.prepare(RW)
print(f'{len(recs)} buildings, {len(rw)} roadway polygons ({time.time() - t0:.0f} s)', flush=True)

# the walls: one union of the footprints
BU = unary_union([(Polygon(b['ring']) if Polygon(b['ring']).is_valid else Polygon(b['ring']).buffer(0)) for b in recs if len(b['ring']) >= 3])
shapely.prepare(BU)
H = np.arange(-2.5, 8.01, 0.1)
Q = []; stats = dict(edges=0, fronted=0, has_sidewalk=0, apron=0, capped=0)
for poly in (RW.geoms if hasattr(RW, 'geoms') else [RW]):
    for ring in [poly.exterior] + list(poly.interiors):
        C = np.array(ring.coords, np.float64)
        for i in range(len(C) - 1):
            a, c = C[i], C[i + 1]; L = float(np.linalg.norm(c - a))
            if L < 2.0: continue
            stats['edges'] += 1
            t = (c - a) / L; out = np.array([-t[1], t[0]]); m = (a + c) / 2
            if shapely.contains_xy(RW, *(m + out * 0.3)): out = -out
            if shapely.contains_xy(RW, *(m + out * 0.3)): continue          # a seam between two roadway pieces
            # the walls along this kerb (or right-of-way) edge: signed distance from the edge to the first wall outward
            # (negative: the building stands on the roadway)
            hs = []
            for u in np.arange(0.5, L, 1.0):
                p = a + t * u; on = shapely.contains_xy(BU, p[0] + out[0] * H, p[1] + out[1] * H)
                if on.any(): hs.append(float(H[int(np.argmax(on))]))
            if len(hs) < max(2, 0.3 * L): continue
            stats['fronted'] += 1
            W = sw_width(m, t)
            s = W - float(np.percentile(hs, 60))                             # how far the kerb must come in
            if s < 0.25: stats['has_sidewalk'] += 1; continue
            # the roadway's own width inward from this edge: keep 65 % of it
            ds = np.arange(0.1, 40.0, 0.25); on = shapely.contains_xy(RW, m[0] - out[0] * ds, m[1] - out[1] * ds)
            R = float(ds[np.argmin(on)]) if not on.all() else 40.0
            if s > 0.35 * R: s = 0.35 * R; stats['capped'] += 1
            if s < 0.25: continue
            q = Polygon([a, c, c - out * s, a - out * s]).intersection(poly)
            if q.is_empty or q.area < 0.2: continue
            stats['apron'] += 1
            parts = [q] if q.geom_type == 'Polygon' else [g for g in getattr(q, 'geoms', []) if g.geom_type == 'Polygon']
            for pg in parts:
                cv = pg.convex_hull
                if abs(cv.area - pg.area) < 0.01 * pg.area + 0.02 and len(cv.exterior.coords) - 1 <= 8:
                    Q.append(list(cv.exterior.coords)[:-1])
                else:
                    for tri in shapely.constrained_delaunay_triangles(pg).geoms: Q.append(list(tri.exterior.coords)[:-1])

def ccw(q):
    q = [tuple(round(float(v), 2) for v in p) for p in q]; n = len(q)
    s = sum(q[i][0] * q[(i + 1) % n][1] - q[(i + 1) % n][0] * q[i][1] for i in range(n))
    return q if s > 0 else q[::-1]
Q = [ccw(q) for q in Q]
Q = [q for q in Q if Polygon(q).is_valid and Polygon(q).area > 0.2]
json.dump(dict(what='street_edge aprons: convex polygons (world m, CCW, flat x,y list) cut from the asphalt and laid as sidewalk (hq_city SE_APRON=1)',
               src='DataSF building footprints + h8n7-e4ns right of way (city_data); widths SFMTA Sidewalk Widths 4g86-grxu (2014 AECOM), '
                   'Open Data Commons PDDL 1.0',
               box=BOX, stats=stats, quads=[[c for p in q for c in p] for q in Q]), open(OUT, 'w'), separators=(',', ':'))
print(f'{len(Q)} apron quads -> {OUT} ({os.path.getsize(OUT) / 1e6:.1f} MB), {stats}, {time.time() - t0:.0f} s', flush=True)
