"""Podium and tower, split from a LiDAR survey (city-agnostic):

    CITY=vancouver python3 tower_split.py [out.json]      (default <work>/lidar/towers.json)

One footprint record often holds a low podium AND a tall tower: extruded as one
volume, one height is wrong either way (Vancouver House: median 22 m, p90 152 m).
This finds the tower inside the footprint on the 1 m nDSM (DSM − DEM, the tiles
lidar_heights.py reads) and writes it as its own ring and height; city_data
(TOWERS=1) then lowers the record to its podium and adds the towers as records.

Candidates (measured_city.json / measured_newb.json, [median, p90, n, void]):
  footprint ≥ MIN_AREA m², and p90 ≥ max(25 m, 1.8 × median), or void ≥ 10 % of
  the pixels with median < 40 m, or heights.json cls tower-podium / rebuilt-mixed.
The tower: pixels above max((median + p90) / 2, median + MIN_RISE), plus the void
pieces 4-connected to them whose rim (the non-void footprint pixels round the
piece) is ≥ VOID_RING tall pixels (LidarBC 2025 leaves the tops of tall towers
EMPTY, a little past their walls; a void over a low roof is not a tower); every
4-connected blob ≥ MIN_BLOB m² is a tower (a podium can carry two); polygonised,
simplified SIMP m, opened by 1 m (drops spikes), clipped to the footprint drawn
EDGE m in (a tower wall flush with the podium's would z-fight: convention).
Height: the tallest OSM way with height / building:levels (× 3.2 m, flagged)
covering ≥ 50 % of the blob, unless the LiDAR reads the blob well above it (a
podium part); else the p90 of the blob's non-void pixels (flagged lidar-p90, with
the blob's void share: a void top reads LOW); a void top under a record that is
itself tall (h ≥ max(40 m, 2 × median): the older survey or OSM read the tower)
keeps the record's height ('record'); a blob over VOID_MAX void with neither is
left alone. A void piece also counts as tower where a tall OSM way covers half of
it, or anywhere on such a tall record. Podium: the median of the
footprint's non-void pixels outside the blob (drawn 1 m in, as lidar_heights).
Not split: blob ≥ WHOLE of the footprint (the record is the tower), tower under
podium + MIN_RISE, or too few podium pixels.
out {"meta", "towers": {gid: {podium_h, towers: [{gid, ring, h, h_src, area, void}]}}, "cand": {gid: outcome}}
Tower gids: GID0 + its ordinal (sorted parent gid, then area): above every
record gid (city < 910,000,000, OSM 910,000,000-999,000,000), inside int32."""
import glob, json, os, re, sys, time
import numpy as np
import rasterio
from rasterio.features import rasterize, shapes
from rasterio.transform import from_origin
from rasterio.windows import from_bounds
from scipy import ndimage
from pyproj import Transformer
from shapely.geometry import Polygon, shape, MultiPolygon
from shapely.strtree import STRtree
from shapely.ops import transform as stransform
import cityconf as C

W = C.work
OUT = sys.argv[1] if len(sys.argv) > 1 else W('lidar', 'towers.json')
DSM, DEM = W('lidar', 'bc2025', 'dsm'), W('lidar', 'bc2025', 'dem')
MIN_AREA, MIN_BLOB, WHOLE, MIN_RISE, SIMP, EDGE, LEVEL_M = 150.0, 60, 0.85, 8.0, 1.25, 0.3, 3.2
GID0 = 2_000_000_000
VOID_RING = 0.3
VOID_MAX = 0.5          # a blob more void than this has no LiDAR height worth a tower
T0 = time.time()

def key(p):
    b = os.path.basename(p); m = re.match(r'bc_(\d{3}[a-z]\d{3}(?:_\d)+)_', b)
    return m.group(1) if m else re.sub(r'_(dsm|dem)\.tif$', '', b)

def osm_h(t):
    """(height m, src) from OSM tags, or None"""
    h = t.get('height')
    if h:
        m = re.match(r'\s*([\d.]+)\s*(m|ft|\')?', h)
        if m:
            try:
                v = float(m.group(1)) * (0.3048 if m.group(2) in ('ft', "'") else 1.0)
                if 2 < v < 700: return v, 'osm-height'
            except ValueError: pass
    lv = t.get('building:levels')
    if lv:
        try:
            v = float(lv.split(';')[0])
            if 0 < v < 200: return v * LEVEL_M, 'osm-levels'
        except ValueError: pass
    return None

def main():
    tr = None
    dsm = {key(p): p for p in glob.glob(os.path.join(DSM, '*.tif'))}
    dem = {key(p): p for p in glob.glob(os.path.join(DEM, '*.tif'))}
    pairs = sorted(set(dsm) & set(dem))
    TIL = []
    for t in pairs:
        a, b = rasterio.open(dsm[t]), rasterio.open(dem[t])
        if a.transform != b.transform or a.shape != b.shape: continue
        TIL.append((a.bounds, a, b))
    crs = TIL[0][1].crs
    fwd = Transformer.from_crs('EPSG:4326', crs, always_xy=True)
    inv = Transformer.from_crs(crs, 'EPSG:4326', always_xy=True)
    def to_utm(ring):
        a = np.asarray(ring, np.float64); lon, lat = C.unproj(a[:, 0], a[:, 1])
        u, v = fwd.transform(lon, lat); return Polygon(np.column_stack([u, v]))
    def to_eng(poly):
        u, v = np.asarray(poly.exterior.coords)[:-1].T
        lon, lat = inv.transform(u, v); x, y = C.proj(lon, lat)
        return [(round(float(p), 2), round(float(q), 2)) for p, q in zip(x, y)]

    # records: the city's (as the render reads them today, NEWB off) and the added ones
    os.environ.update(NEWB='0', FRESH='0', SOUTH='0', PLACES_OV='0', HEIGHTS='1', TOWERS='0')
    os.environ.pop('ERA', None)
    import city_data
    recs = [(b['gid'], b['ring'], b['h']) for b in city_data.buildings(-1e6, -1e6, 1e6, 1e6)]
    j = json.load(open(W('newbuildings', 'osm_records.json')))
    recs += [(int(r['gid']), r['ring'], r['h']) for r in j['records'] + j.get('lm_records', [])]
    M = json.load(open(W('lidar', 'measured_city.json')))['h']
    M.update(json.load(open(W('lidar', 'measured_newb.json')))['h'])
    CLS = json.load(open(W('lidar', 'heights.json'))).get('cls', {})
    print('records', len(recs), 'measured', len(M), f'{time.time() - T0:.0f}s', flush=True)

    # OSM ways with a height (building and building:part)
    OP, OH = [], []
    seen = set()
    for f in sorted(glob.glob(W('newbuildings', 'osm', '[pb]_*.json'))):
        for e in json.load(open(f))['elements']:
            if e['type'] != 'way' or e['id'] in seen or 'geometry' not in e: continue
            seen.add(e['id']); hh = osm_h(e.get('tags', {}))
            if not hh or len(e['geometry']) < 4: continue
            u, v = fwd.transform([g['lon'] for g in e['geometry']], [g['lat'] for g in e['geometry']])
            p = Polygon(np.column_stack([u, v])).buffer(0)
            if p.is_empty or p.area < 10: continue
            OP.append(p); OH.append((hh[0], hh[1], e['id'], 'building:part' in e.get('tags', {})))
    OT = STRtree(OP)
    print('osm ways with a height', len(OP), f'{time.time() - T0:.0f}s', flush=True)

    towers, cand, stats = {}, {}, {}
    for gid, ring, h_now in recs:
        m = M.get(str(gid))
        if not m or len(ring) < 3: continue
        med, p90, n, void = m
        fp = to_utm(ring)
        if not fp.is_valid: fp = fp.buffer(0)
        if fp.is_empty or fp.area < MIN_AREA: continue
        vs = void / max(1, n + void)
        if not (p90 >= max(25.0, 1.8 * med) or (vs >= 0.10 and med < 40) or CLS.get(str(gid)) in ('tower-podium', 'rebuilt-mixed')):
            continue
        # the nDSM under it, on the tiles' 1 m grid
        x0, y0, x1, y1 = fp.bounds
        x0, y0, x1, y1 = np.floor(x0) - 2, np.floor(y0) - 2, np.ceil(x1) + 2, np.ceil(y1) + 2
        nx, ny = int(x1 - x0), int(y1 - y0)
        H = np.full((ny, nx), np.nan, np.float32); cov = np.zeros((ny, nx), bool)
        for (l, bt, r, tp), a, b in TIL:
            if r <= x0 or l >= x1 or tp <= y0 or bt >= y1: continue
            ix0, ix1 = int(max(l, x0)), int(min(r, x1)); iy0, iy1 = int(max(bt, y0)), int(min(tp, y1))
            win = from_bounds(ix0, iy0, ix1, iy1, a.transform).round_offsets().round_lengths()
            A = a.read(1, window=win); B = b.read(1, window=win)
            nd = (A == a.nodata) | (B == b.nodata) | (A < -500) | (B < -500)
            sl = (slice(int(y1 - iy1), int(y1 - iy1) + A.shape[0]), slice(int(ix0 - x0), int(ix0 - x0) + A.shape[1]))
            H[sl] = np.where(nd, np.nan, A - B); cov[sl] = True
        T = from_origin(x0, y1, 1.0, 1.0)
        F = rasterize([(fp, 1)], out_shape=H.shape, transform=T, fill=0, dtype='uint8').astype(bool)
        ins = fp.buffer(-1.0)
        I = rasterize([(ins, 1)], out_shape=H.shape, transform=T, fill=0, dtype='uint8').astype(bool) if ins.area >= 4 else F
        valid = F & ~np.isnan(H); vd = F & np.isnan(H) & cov
        thr = max((med + p90) / 2, med + MIN_RISE)
        seed = valid & (H > thr)
        # where another source says a tower stands: an OSM way with a height well above the median, or the
        # record itself tall (the older survey / OSM read one): a void piece there is the tower's top
        tall_osm = [OP[i] for i in OT.query(fp) if OH[i][0] >= med + 2 * MIN_RISE and OP[i].intersects(fp)]
        TO = rasterize([(g, 1) for g in tall_osm], out_shape=H.shape, transform=T, fill=0, dtype='uint8').astype(bool) if tall_osm else np.zeros_like(F)
        rec_tall = h_now >= max(40.0, 2 * med)
        # the void pieces a tower's top left empty: 4-connected to its tall pixels, and ringed mostly by them
        # (VOID_RING of the non-void footprint pixels round the piece; a void over a low roof is not a tower)
        vlab, nv = ndimage.label(vd)
        acc = np.zeros_like(vd)
        if nv:
            ring_ = ndimage.binary_dilation(vd) & ~vd & valid
            for i, sl in enumerate(ndimage.find_objects(vlab), 1):
                sl = tuple(slice(max(0, a.start - 1), a.stop + 1) for a in sl)
                pc = vlab[sl] == i; rim = ndimage.binary_dilation(pc) & ring_[sl]
                if (rim.any() and (seed[sl] & rim).sum() >= VOID_RING * rim.sum()) or \
                   (pc.sum() >= MIN_BLOB and (rec_tall or (TO[sl] & pc).sum() >= 0.5 * pc.sum())): acc[sl] |= pc
        if not (seed.any() or acc.any()): cand[gid] = 'no-seed'; continue
        tw = seed | acc
        lab2, k2 = ndimage.label(tw)
        sizes = ndimage.sum(tw, lab2, range(1, k2 + 1))
        blobs = [i + 1 for i in np.argsort(-sizes) if sizes[i] >= MIN_BLOB]
        if not blobs: cand[gid] = 'small-blob'; continue
        allb = np.isin(lab2, blobs)
        if (allb & I).sum() >= WHOLE * I.sum(): cand[gid] = 'whole'; continue      # (drawn 1 m in: the wall line reads ground)
        out_px = valid & I & ~ndimage.binary_dilation(allb)
        if out_px.sum() < 20: cand[gid] = 'no-podium'; continue
        pod = float(np.median(H[out_px]))
        tws, why = [], None
        for bi in blobs:
            blob = lab2 == bi
            # polygonise, simplify, open (spikes), clip to the footprint drawn EDGE m in
            ps = [shape(g) for g, v in shapes(blob.astype('uint8'), mask=blob, transform=T) if v == 1]
            P = MultiPolygon(ps).buffer(0) if len(ps) > 1 else ps[0]
            P = P.simplify(SIMP).buffer(-1.0, join_style=2).buffer(1.0, join_style=2)
            P = P.intersection(fp.buffer(-EDGE, join_style=2)).buffer(0)
            if isinstance(P, MultiPolygon): P = max(P.geoms, key=lambda g: g.area)
            if P.is_empty or P.geom_type != 'Polygon' or P.area < MIN_BLOB: why = 'small-poly'; continue
            P = Polygon(P.exterior)                          # no courtyards in a tower
            bv = H[blob & valid]; bvoid = float((blob & vd).sum()) / blob.sum()
            # the tower's height: OSM (tallest way covering >= 50 % of it), else LiDAR p90
            best = None
            for i in OT.query(P):
                if OP[i].intersection(P).area >= 0.5 * P.area and (best is None or OH[i][0] > best[0]): best = OH[i]
            lid = float(np.percentile(bv, 90)) if len(bv) >= 10 else None
            if best and not (len(bv) >= 20 and best[0] < 0.8 * float(np.median(bv))):
                th, src = best[0], best[1]
            elif bvoid >= 0.3 and rec_tall and (lid is None or h_now > lid):
                th, src = float(h_now), 'record'           # the top is void: the record's own (older survey / OSM) height
            elif lid is not None and bvoid < VOID_MAX:
                th, src = lid, 'lidar-p90' + ('-void' if bvoid >= 0.3 else '')
            else: why = 'no-height'; continue
            if th < pod + MIN_RISE or th < 1.3 * pod: why = 'low-tower'; continue
            tws.append(dict(ring=to_eng(P), h=round(th, 2), h_src=src, area=round(P.area, 1), void=round(bvoid, 2),
                            osm=best[2] if best and src.startswith('osm') else None))
        if not tws: cand[gid] = why; continue
        towers[gid] = dict(podium_h=round(max(pod, 2.5), 2), h_was=round(float(h_now), 2), towers=tws)
        cand[gid] = 'split'
        if len(cand) % 500 == 0: print('candidates', len(cand), 'split', len(towers), f'{time.time() - T0:.0f}s', flush=True)
    k = 0
    for g in sorted(towers):
        for t in towers[g]['towers']: t['gid'] = GID0 + k; k += 1
    oc = {}
    for v in cand.values(): oc[v] = oc.get(v, 0) + 1
    meta = dict(what='podium / tower split of footprint records from the LiDAR nDSM (tower_split.py)', dsm=DSM, dem=DEM,
                osm='OpenStreetMap ways with height / building:levels (ODbL, (c) OpenStreetMap contributors); levels x %.1f m is a convention' % LEVEL_M,
                lidar='LidarBC 2025 (Open Government Licence - British Columbia)',
                rules=dict(void_ring=VOID_RING, void_max=VOID_MAX, min_area=MIN_AREA, min_blob=MIN_BLOB, whole=WHOLE, min_rise=MIN_RISE, simplify=SIMP, edge_inset=EDGE, gid0=GID0),
                candidates=len(cand), outcomes=oc, split=len(towers))
    json.dump(dict(meta=meta, towers={str(g): v for g, v in towers.items()}, cand={str(g): v for g, v in cand.items()}),
              open(OUT, 'w'), separators=(',', ':'))
    print('candidates', len(cand), oc, '->', OUT, f'{time.time() - T0:.0f}s', flush=True)

if __name__ == '__main__':
    main()
