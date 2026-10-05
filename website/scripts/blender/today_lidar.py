"""What stands TODAY in another city, by its newest LiDAR (B3 fix 3): the records city_data draws come
from an older survey (Vancouver: 2015 footprints + OSM additions that newb_prep keeps only off those
footprints), so rebuilt lots keep their old outline: new towers missing, demolished buildings drawn.
LiDAR 2025 wins:

  ADD   a tall structure (LiDAR height >= TALL m) with no drawn building near its height (drawn p90 below
        LiDAR - max(8 m, 20 %)) is drawn: from its OSM outline (building or building:part ways; ODbL,
        (c) OpenStreetMap contributors), or, where the tall part covers < 60 % of that outline, from the tall
        part of the LiDAR inside it; where OSM has no outline, from the LiDAR blob (>= 40 m, >= 300 m2, mostly
        flat roof — trees are rough — and away from bridges). Height = LiDAR p90; where the top is a void
        (LidarBC 2025 leaves tall towers' tops EMPTY: a void is not ground) OSM height / levels x 3.2 m, else
        the highest valid return. The records it stands on (>= 50 % of their area inside it, lower than it)
        are dropped.
  DROP  a drawn record whose (1 m eroded) footprint is >= 70 % valid LiDAR with DSM - DEM < 2 m (bare ground
        or low vegetation; void pixels count AGAINST dropping) AND whose DSM sits on the ground around it
        (median DSM inside - median DEM in a 5-15 m ring outside < 2.5 m, so a big flat roof the ground filter
        took for ground is kept) — demolished.
  else  unchanged.

    CITY=vancouver python3 today_lidar.py [grid_dir] [out.json]
      grid_dir: dsm.npy / dem.npy on the engine world grid (x0 -7250, y0 -6750, 15500 x 13500, 1 m, north up;
                /Volumes/QIPU-SSD/tmp/vf1, made by its mk_dsm.py from lidar/bc2025)
      out.json: places/today_lidar.json {meta, today: {gid: {skip, why}}, today_add: [records]}
city_data.overrides reads it when TODAY_LIDAR=<out.json> (city.json env); unset (SF) = nothing.
Proof tables (adds.csv, drops.csv, missing_*.csv) go beside out.json's dir in PROOF_DIR (default: no tables)."""
import glob, json, os, sys, csv, zlib, collections
import numpy as np
os.environ.update(NEWB='1', HEIGHTS='1', TOWERS='1', PLACES_OV='1', SOUTH='0', FRESH='0')
os.environ.pop('TODAY_LIDAR', None); os.environ.pop('ERA', None)
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import shapely
from shapely.geometry import Polygon, shape, LineString
from rasterio import features
from rasterio.transform import from_origin
from scipy import ndimage
import city_data, cityconf as CC
assert not CC.SF, 'today_lidar.py is for another city (CITY=...)'

GRID = sys.argv[1] if len(sys.argv) > 1 else '/Volumes/QIPU-SSD/tmp/vf1'
OUT = sys.argv[2] if len(sys.argv) > 2 else CC.work('places', 'today_lidar.json')
PROOF = os.environ.get('PROOF_DIR')
X0, Y0, NX, NY = -7250.0, -6750.0, 15500, 13500
T = from_origin(X0, Y0 + NY, 1, 1)
TALL, GID0, LEVEL_M = 25.0, 2_100_000_000, 3.2
SKIP_T = {'roof', 'carport', 'bridge', 'houseboat', 'ship', 'boat', 'tent', 'transformer_tower', 'no', 'demolished', 'razed', 'ruins', 'collapsed'}
LIDAR_ONLY_T = {'construction', 'proposed', 'abandoned', 'disused'}     # exists only if the LiDAR itself measures it
TY = {}
for k in ('house', 'detached', 'semidetached_house', 'bungalow'): TY[k] = 'HOUSE'
for k in ('terrace', 'townhouse'): TY[k] = 'FLATS'
for k in ('residential', 'apartments', 'dormitory', 'condominium'): TY[k] = 'APARTMENT'
for k in ('commercial', 'office'): TY[k] = 'OFFICE'
for k in ('retail', 'supermarket', 'shop', 'mall'): TY[k] = 'RETAIL'
for k in ('industrial', 'warehouse', 'hangar', 'service', 'storage', 'silo', 'storage_tank', 'utility', 'power'): TY[k] = 'INDUSTRIAL'
for k in ('hospital', 'university', 'school', 'college', 'public', 'civic', 'government', 'church', 'stadium', 'train_station', 'transportation'): TY[k] = 'INSTITUTION'
TY['hotel'] = 'HOTEL'
for k in ('parking', 'garage', 'garages'): TY[k] = 'GARAGE'
USE = {'HOUSE': 'single family', 'FLATS': 'multi-family', 'APARTMENT': 'multi-family', 'OFFICE': 'office', 'RETAIL': 'retail',
       'INDUSTRIAL': 'industrial', 'INSTITUTION': 'hotel / institutional', 'HOTEL': 'hotel / institutional', 'GARAGE': 'mixed or not stated',
       'UNCLASSED': 'mixed or not stated'}

def num(v):
    try: return float(str(v).lower().replace('m', '').strip().split(';')[0])
    except (ValueError, TypeError): return None

def log(*a): print('[today_lidar]', *a, flush=True)

def window(g, pad=0):
    b = g.bounds
    c0 = max(0, int(np.floor(b[0] - X0)) - pad); c1 = min(NX, int(np.ceil(b[2] - X0)) + pad)
    r0 = max(0, int(np.floor(Y0 + NY - b[3])) - pad); r1 = min(NY, int(np.ceil(Y0 + NY - b[1])) + pad)
    return r0, r1, c0, c1

def mask_in(g, r0, r1, c0, c1):
    if r1 <= r0 or c1 <= c0: return None
    return features.geometry_mask([g], (r1 - r0, c1 - c0), from_origin(X0 + c0, Y0 + NY - r0, 1, 1), invert=True, all_touched=False)

def drawn_raster(recs):
    """max drawn height per 1 m cell"""
    out = np.zeros((NY, NX), np.float32)
    shp = []
    for b in sorted(recs, key=lambda b: b['h']):
        g = Polygon(b['ring'])
        if not g.is_valid: g = g.buffer(0)
        if not g.is_empty: shp.append((g, float(b['h'])))
    for i in range(0, len(shp), 20000):
        features.rasterize(shp[i:i + 20000], out=out, transform=T, merge_alg=features.MergeAlg.replace)
    return out

def missing_blobs(ndsm, drawn, onosm, planar, bridges_m, hmin=40.0):
    """tall LiDAR structures not drawn: cells >= hmin with drawn < LiDAR - 15 m, components >= 100 m2, on an OSM
    outline or mostly flat; the same test before and after"""
    m = (ndsm >= hmin) & (drawn < ndsm - 15) & ~bridges_m
    lab, n = ndimage.label(m)
    out = []
    if not n: return out
    idx = np.arange(1, n + 1)
    area = ndimage.sum(m, lab, idx); osm = ndimage.sum(onosm, lab, idx); fl = ndimage.sum(planar, lab, idx)
    sl = ndimage.find_objects(lab)
    for i in range(n):
        if area[i] < 100: continue
        if osm[i] < 0.5 * area[i] and fl[i] < 0.5 * area[i]: continue
        s = sl[i]; sub = lab[s] == i + 1
        rr, cc = np.nonzero(sub); r = rr.mean() + s[0].start; c = cc.mean() + s[1].start
        out.append(dict(m2=int(area[i]), p90=float(np.percentile(ndsm[s][sub], 90)), drawn=float(np.median(drawn[s][sub])),
                        x=X0 + c + 0.5, y=Y0 + NY - r - 0.5))
    return out

def main():
    recs = city_data.buildings(-1e6, -1e6, 1e6, 1e6)
    log('drawn records today (before)', len(recs))
    dsm = np.load(f'{GRID}/dsm.npy', mmap_mode='r'); dem = np.load(f'{GRID}/dem.npy', mmap_mode='r')
    ndsm = np.asarray(dsm, np.float32) - np.asarray(dem, np.float32)
    void = ~np.isfinite(ndsm)
    log('ndsm ready, void frac', round(float(void[::10, ::10].mean()), 3))
    drawn = drawn_raster(recs); log('drawn raster ready')
    # flat roofs: 3x3 range < 1.5 m (tree crowns are rough)
    nz = np.where(void, -999, ndsm)
    planar = (ndimage.maximum_filter(nz, 3) - ndimage.minimum_filter(np.where(void, 999, ndsm), 3)) < 1.5
    del nz
    # bridges (their decks and pylons are era.build_structures', never buildings)
    bridges_m = np.zeros((NY, NX), np.uint8)
    bp = os.environ.get('CITY_BRIDGES') or CC.work('landmarks', 'bridges.json')
    if os.path.exists(bp):
        bl = [LineString(d['path']).buffer(d.get('w', 10) / 2 + 15) for d in json.load(open(bp)) if len(d['path']) > 1]
        features.rasterize([(g, 1) for g in bl], out=bridges_m, transform=T)
    bridges_m = bridges_m.astype(bool)
    # OSM outlines
    polys = []; seen = set()
    for f in sorted(glob.glob(CC.work('newbuildings', 'osm', '[bp]_*.json'))):
        for el in json.load(open(f))['elements']:
            k = (el['type'], el['id'])
            if el['type'] != 'way' or k in seen or not el.get('geometry') or len(el['geometry']) < 4: continue
            seen.add(k); t = el.get('tags', {})
            bt = t.get('building') or t.get('building:part') or ''
            if bt in SKIP_T or num(t.get('min_height')) or num(t.get('building:min_level')): continue
            g = Polygon([CC.proj(p['lon'], p['lat']) for p in el['geometry']])
            if not g.is_valid: g = g.buffer(0)
            if g.is_empty or g.area < 50: continue
            h = num(t.get('height')); hs = 'osm height'
            if h is None and num(t.get('building:levels')): h = num(t['building:levels']) * LEVEL_M; hs = 'osm levels'
            polys.append(dict(id=el['id'], g=g, t=t, bt=bt, oh=h, ohs=hs))
    log('OSM outlines', len(polys))
    onosm = np.zeros((NY, NX), np.uint8)
    features.rasterize([(p['g'], 1) for p in polys], out=onosm, transform=T); onosm = onosm.astype(bool)
    before = missing_blobs(ndsm, drawn, onosm, planar, bridges_m)
    log('tall (>=40 m) LiDAR structures missing BEFORE', len(before), 'm2', sum(b['m2'] for b in before))

    # ---- ADD: tall OSM outlines with no drawn building near their height
    cands = []
    for p in polys:
        g = p['g']; r0, r1, c0, c1 = window(g)
        mk = mask_in(g, r0, r1, c0, c1)
        if mk is None or mk.sum() < 30: continue
        nd = ndsm[r0:r1, c0:c1][mk]; vo = ~np.isfinite(nd); vf = vo.mean(); val = nd[~vo]
        if vf >= 0.4:
            if p['bt'] in LIDAR_ONLY_T: continue
            if p['oh']: H, hs = max(p['oh'], np.percentile(val, 90) if len(val) else 0), p['ohs'] + ' (LiDAR top void)'
            elif len(val) >= 10: H, hs = float(np.percentile(val, 98)), 'lidar highest valid (top void)'
            else: continue
        else:
            H, hs = float(np.percentile(val, 90)), 'lidar p90'
        if H < TALL: continue
        dr = drawn[r0:r1, c0:c1][mk]; D = float(np.percentile(dr, 90))
        # undrawn: no drawn building near its height over it (p90), or most of its tall part undrawn (a tower ring
        # too small for the LiDAR tower: tower_split's rings, the 2015 outline of a rebuilt lot)
        tv = np.isfinite(nd) & (nd >= 0.6 * H); und = tv & (dr < nd - 15)
        uf = und.sum() / max(1, tv.sum())
        if D >= H - max(8.0, 0.2 * H) and not (uf >= 0.5 and und.sum() >= 100): continue
        tallm = mk & ((ndsm[r0:r1, c0:c1] >= 0.6 * H) | ~np.isfinite(ndsm[r0:r1, c0:c1]))
        tf = tallm.sum() / mk.sum()
        geo = g
        if tf < 0.6:
            tallm = ndimage.binary_opening(tallm, iterations=2)
            sh = [shape(s) for s, v in features.shapes(tallm.astype(np.uint8), mask=tallm, transform=from_origin(X0 + c0, Y0 + NY - r0, 1, 1)) if v]
            sh = [s.simplify(1.0).buffer(0) for s in sh if s.area >= 60]
            if not sh: continue
            geo = shapely.union_all(sh).intersection(g)
            hs += ' on the LiDAR tall part'
        cands.append(dict(H=float(H), hs=hs, D=D, geo=geo, osm=p, vf=float(vf), tf=float(tf), uf=float(uf)))
    log('OSM tall candidates', len(cands))
    # greedy, tallest first
    cands.sort(key=lambda c: -c['H']); acc = []
    for c in cands:
        if c['geo'].is_empty or c['geo'].area < 50: continue
        # the same structure: >= 50 % of it under accepted ones of about its height or taller (an outline and its tower
        # part); a LOWER part a taller one stands on (OSM's stepped parts) is kept: the boxes stack into the massing
        cov = [a['geo'] for a in acc if a['H'] >= c['H'] - max(4.0, 0.1 * c['H']) and a['geo'].intersects(c['geo'])]
        if cov and shapely.union_all(cov).intersection(c['geo']).area >= 0.5 * c['geo'].area: continue
        acc.append(c)
    # ---- ADD: what is still undrawn, as the LiDAR blob outline (>= 40 m): where OSM has no outline (>= 300 m2, mostly flat
    # roof: trees are rough), or where the drawn outline misses part of the tower (>= 150 m2, mostly on an OSM outline)
    dmid = drawn.copy()
    features.rasterize([(a['geo'], a['H']) for a in sorted(acc, key=lambda a: a['H'])], out=dmid, transform=T, merge_alg=features.MergeAlg.replace)
    dmid = np.maximum(dmid, drawn)
    m = (ndsm >= 40) & (dmid < ndsm - 15) & ~bridges_m
    del dmid
    lab, n = ndimage.label(m); sl = ndimage.find_objects(lab); nb = 0
    for i in range(n):
        s = sl[i]; sub = lab[s] == i + 1; a = sub.sum()
        if a < 150: continue
        on = onosm[s][sub].mean() >= 0.5
        if not (on or (a >= 300 and planar[s][sub].mean() >= 0.5)): continue
        H = float(np.percentile(ndsm[s][sub], 90))
        sub = ndimage.binary_closing(np.pad(sub, 2), iterations=2)[2:-2, 2:-2]
        sh = [shape(q) for q, v in features.shapes(sub.astype(np.uint8), mask=sub, transform=from_origin(X0 + s[1].start, Y0 + NY - s[0].start, 1, 1)) if v]
        geo = shapely.union_all([q.simplify(1.0).buffer(0) for q in sh])
        if geo.is_empty or geo.area < 100: continue
        acc.append(dict(H=H, hs='lidar p90 (LiDAR blob outline' + (', part of an OSM outline drawn too small)' if on else ', no OSM outline)'),
                        D=0.0, geo=geo, osm=None, vf=0.0, tf=1.0, uf=1.0)); nb += 1
    log('LiDAR blob adds', nb)
    log('accepted adds', len(acc))
    paints = [b.get('paint', 0) for b in recs if (b.get('year') or 0) >= 2005] or [0]
    adds = []
    for c in acc:
        geo = c['geo']
        parts = [geo] if geo.geom_type == 'Polygon' else [q for q in geo.geoms if q.geom_type == 'Polygon' and q.area >= 30]
        o = c['osm']; t = o['t'] if o else {}
        ty = TY.get(o['bt'] if o else '', 'UNCLASSED' if o is None else 'APARTMENT' if c['H'] >= 40 else 'UNCLASSED')
        lv = num(t.get('building:levels'))
        key = f"osm{o['id']}" if o else f"blob{int(geo.centroid.x)}_{int(geo.centroid.y)}"
        for j, q in enumerate(parts):
            ring = [(round(x, 2), round(y, 2)) for x, y in list(q.exterior.coords)[:-1]]
            gid = GID0 + zlib.crc32(f'{key}/{j}'.encode()) % 90_000_000
            yr = num(str(t.get('start_date', ''))[:4])
            adds.append(dict(gid=gid, ring=ring, cx=sum(p[0] for p in ring) / len(ring), cy=sum(p[1] for p in ring) / len(ring),
                             h=round(c['H'], 1), year=int(yr) if yr and 1850 < yr < 2027 else 2024, use=USE[ty],
                             st=int(lv) if lv else max(1, int(round(c['H'] / 3.2))), ty=ty, shop=False, roles=[1] * len(ring),
                             paint=int(paints[zlib.crc32(key.encode()) % len(paints)]), src='today_lidar', h_src=c['hs'],
                             why=f"today_lidar: {key} LiDAR 2025 {c['H']:.0f} m, drawn p90 {c['D']:.0f} m, {c['uf']:.0%} of its tall part undrawn (void {c['vf']:.0%})"))
    # replaced: records >= 50 % inside an add and lower than it
    tree = shapely.STRtree([Polygon(b['ring']).buffer(0) for b in recs]); RG = tree.geometries
    skip = {}
    for a in adds:
        ag = Polygon(a['ring']).buffer(0)
        for i in tree.query(ag):
            b = recs[i]; rg = RG[i]
            if rg.area > 0 and b['h'] < a['h'] + 5 and rg.intersection(ag).area >= 0.5 * rg.area:
                skip[b['gid']] = dict(skip=True, why=f"today_lidar: replaced by {a['gid']} ({a['h']:.0f} m), drawn {b['h']:.0f} m")
    log('records replaced by adds', len(skip))
    # ---- DROP: demolished
    nd_ = 0
    for i, b in enumerate(recs):
        if b['gid'] in skip: continue
        rg = RG[i]
        if rg.is_empty: continue
        e = rg.buffer(-1.0) if rg.area > 40 else rg
        if e.is_empty or e.area < 8: e = rg
        r0, r1, c0, c1 = window(rg, 16)
        mk = mask_in(e, r0, r1, c0, c1)
        if mk is None or mk.sum() < 8: continue
        nd = ndsm[r0:r1, c0:c1][mk]
        low = (np.isfinite(nd) & (nd < 2.0)).mean()
        if low < 0.7: continue
        ring = mask_in(rg.buffer(15).difference(rg.buffer(5)), r0, r1, c0, c1)
        dg = dem[r0:r1, c0:c1][ring]; dg = dg[np.isfinite(dg)]
        ds = dsm[r0:r1, c0:c1][mk]; ds = ds[np.isfinite(ds)]
        if len(dg) < 20 or not len(ds): continue
        lift = float(np.median(ds) - np.median(dg))
        if lift >= 2.5: continue
        skip[b['gid']] = dict(skip=True, why=f"today_lidar: gone in LiDAR 2025 ({low:.0%} of it < 2 m above ground, DSM {lift:+.1f} m over the ground around), drawn {b['h']:.0f} m")
        nd_ += 1
    log('demolished records dropped', nd_)
    j = dict(meta=dict(by='today_lidar.py (B3 fix 3)', grid=GRID, tall=TALL, adds=len(adds), replaced=len(skip) - nd_, demolished=nd_,
                       src='LidarBC 2025 DSM/DEM; OSM outlines (ODbL, (c) OpenStreetMap contributors)'),
             today=skip, today_add=adds)
    json.dump(j, open(OUT, 'w')); log('wrote', OUT)
    # after: the drawn raster with the changes
    after = [b for b in recs if b['gid'] not in skip] + adds
    drawn2 = drawn_raster(after)
    aft = missing_blobs(ndsm, drawn2, onosm, planar, bridges_m)
    log('tall (>=40 m) LiDAR structures missing AFTER', len(aft), 'm2', sum(b['m2'] for b in aft), '| drawn records', len(recs), '->', len(after))
    if PROOF:
        os.makedirs(PROOF, exist_ok=True)
        for name, rows in (('missing_before', before), ('missing_after', aft)):
            with open(f'{PROOF}/{name}.csv', 'w') as f:
                w = csv.writer(f); w.writerow(['m2', 'p90', 'drawn', 'lat', 'lon'])
                for r in rows: w.writerow([r['m2'], round(r['p90'], 1), round(r['drawn'], 1), *[round(v, 5) for v in CC.unproj(r['x'], r['y'])[::-1]]])
        with open(f'{PROOF}/adds.csv', 'w') as f:
            w = csv.writer(f); w.writerow(['gid', 'h', 'h_src', 'm2', 'lat', 'lon', 'why'])
            for a in adds:
                lon, lat = CC.unproj(a['cx'], a['cy']); w.writerow([a['gid'], a['h'], a['h_src'], int(Polygon(a['ring']).area), round(lat, 5), round(lon, 5), a['why']])
        B = {b['gid']: b for b in recs}
        with open(f'{PROOF}/drops.csv', 'w') as f:
            w = csv.writer(f); w.writerow(['gid', 'h', 'src', 'm2', 'lat', 'lon', 'why'])
            for g, v in skip.items():
                b = B[g]; lon, lat = CC.unproj(b['cx'], b['cy'])
                w.writerow([g, round(b['h'], 1), b.get('src', 'base'), int(Polygon(b['ring']).buffer(0).area), round(lat, 5), round(lon, 5), v['why']])

if __name__ == '__main__':
    main()
