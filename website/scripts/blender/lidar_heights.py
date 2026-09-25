"""A building's height from a LiDAR survey, per footprint:

    CITY=vancouver python3 lidar_heights.py <dsm dir> <dem dir> <out.json> [records.json]

nDSM = DSM − DEM (the top of what stands minus bare earth, 1 m rasters of the
SAME survey: their vertical datum cancels). Each footprint — the city's own
records (city_data, NEWB/FRESH off), or the rings of a records file in
city_data's schema (newb_prep's osm_records.json) — is burned into every tile
it touches, drawn 1 m in from its outline (the wall line and the eaves read
half ground), and the pixels inside give:
    h    the median nDSM (m): the height the engine publishes is a median too
    p90  the 90th percentile: the tower above a podium, the ridge of a roof
    n    how many 1 m pixels were read (a footprint under ~6 px keeps its record)
Tiles: every *.tif in the two folders, paired by map tile (LidarBC's
bc_<maptile>_…; else the name up to _dsm/_dem). No data (−32767, water, a gap between surveys) is skipped.
out.json {"meta": …, "h": {gid: [h, p90, n]}}"""
import glob, json, os, re, sys, time
import numpy as np
import rasterio
from rasterio.features import rasterize
from pyproj import Transformer
from shapely.geometry import Polygon
import cityconf as C

DSM, DEM, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
REC = sys.argv[4] if len(sys.argv) > 4 else None
INSET = float(os.environ.get('INSET', 1.0))
T0 = time.time()

def records():
    if REC:
        j = json.load(open(REC))
        return [(int(r['gid']), r['ring']) for r in j['records'] + j.get('lm_records', [])]
    os.environ.update(NEWB='0', FRESH='0', SOUTH='0', PLACES_OV='0')
    import city_data
    return [(b['gid'], b['ring']) for b in city_data.buildings(-1e6, -1e6, 1e6, 1e6)]

def key(p):
    # the map tile (LidarBC: bc_092g025_1_2_3_…, its DEM files carry no _dem suffix), else the name without _dsm/_dem
    b = os.path.basename(p); m = re.match(r'bc_(\d{3}[a-z]\d{3}(?:_\d)+)_', b)
    return m.group(1) if m else re.sub(r'_(dsm|dem)\.tif$', '', b)

def main():
    recs = records(); print('footprints', len(recs), f'{time.time() - T0:.0f}s', flush=True)
    dsm = {key(p): p for p in glob.glob(os.path.join(DSM, '*.tif'))}
    dem = {key(p): p for p in glob.glob(os.path.join(DEM, '*.tif'))}
    pairs = sorted(set(dsm) & set(dem)); print('tile pairs', len(pairs), 'unpaired', len(set(dsm) ^ set(dem)), flush=True)
    crs = rasterio.open(dsm[pairs[0]]).crs
    tr = Transformer.from_crs('EPSG:4326', crs, always_xy=True)
    # the footprints in the rasters' CRS, drawn INSET m in (kept whole when that leaves nothing)
    polys = []
    for gid, ring in recs:
        if len(ring) < 3: continue
        a = np.asarray(ring, np.float64); lon, lat = C.unproj(a[:, 0], a[:, 1])
        u, v = tr.transform(lon, lat)
        p = Polygon(np.column_stack([u, v]))
        if not p.is_valid: p = p.buffer(0)
        if p.is_empty: continue
        q = p.buffer(-INSET)
        polys.append((gid, q if q.area >= 4 else p))
    bounds = np.array([p.bounds for _, p in polys])
    vals = {}
    for k, t in enumerate(pairs):
        with rasterio.open(dsm[t]) as a, rasterio.open(dem[t]) as b:
            if a.transform != b.transform or a.shape != b.shape:
                print('skip (grids differ)', t, flush=True); continue
            A = a.read(1).astype(np.float32); B = b.read(1).astype(np.float32)
            nd = (A == a.nodata) | (B == b.nodata) | (A < -500) | (B < -500)
            H = np.where(nd, np.nan, A - B)
            l, bt, r, tp = a.bounds
            sel = np.nonzero((bounds[:, 2] > l) & (bounds[:, 0] < r) & (bounds[:, 3] > bt) & (bounds[:, 1] < tp))[0]
            if not len(sel): continue
            lab = rasterize(((polys[i][1], i + 1) for i in sel), out_shape=A.shape, transform=a.transform, fill=0, dtype='int32')
            m = (lab > 0) & ~np.isnan(H)
            L = lab[m] - 1; V = H[m]
            o = np.argsort(L, kind='stable'); L = L[o]; V = V[o]
            cut = np.nonzero(np.diff(L))[0] + 1
            for idx, chunk in zip(L[np.r_[0, cut]], np.split(V, cut)):
                vals.setdefault(int(idx), []).append(chunk)
        if (k + 1) % 10 == 0: print('tiles', k + 1, '/', len(pairs), 'buildings seen', len(vals), f'{time.time() - T0:.0f}s', flush=True)
    out = {}
    for i, chunks in vals.items():
        v = np.concatenate(chunks)
        if len(v) == 0: continue
        out[str(polys[i][0])] = [round(float(np.median(v)), 2), round(float(np.percentile(v, 90)), 2), int(len(v))]
    meta = dict(what='per-footprint LiDAR height: median / 90th percentile of DSM − DEM inside the outline drawn '
                     f'{INSET:g} m in, n = 1 m pixels read', dsm=DSM, dem=DEM, records=REC or f'city_data ({C.CITY})',
                footprints=len(polys), measured=len(out), tiles=len(pairs))
    json.dump(dict(meta=meta, h=out), open(OUT, 'w'), separators=(',', ':'))
    print('measured', len(out), 'of', len(polys), '->', OUT, f'{time.time() - T0:.0f}s', flush=True)

if __name__ == '__main__':
    main()
