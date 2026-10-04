"""C1 step: the area's dated structures for era.py (city.json eras.era_py.structures -> era.STRUCTURES), engine world metres.
  georgia_viaduct_1915: the first Georgia Street viaduct. Built 1913-1915 (SOURCED: Wikipedia 'Georgia Viaduct'), closed and replaced
    1971-72 (SOURCED, same); y1 = 1972.02 (Dunsmuir phase open, 9 Jan 1972) with a demolition window 1971.49 -> 1972.02 (CONVENTION:
    torn down span by span once the new Georgia phase carried the traffic, 28 Jun 1971; the 1972 mosaic shows it gone). PATH TRACED on the
    1950 and 1959 mosaics (deck + north-side shadow template, 40 m stations, both years agree within 2 m; c1/offsets.py frame), Main St end
    from 1959; west of the box (x < 1440) extrapolated straight (CONVENTION). Deck 16 m (photo band 14-18 m); height above the smoothed
    ground 7 m over the yards, ramping to 0 over the last 85 m at Main St (CONVENTION: one deck over the CPR tracks).
  georgia_viaduct_1971 / dunsmuir_viaduct_1972: today's viaducts, as OpenStreetMap draws them (ODbL; ways in c1/osm_rail_bridges.json),
    from 28 Jun 1971 / 9 Jan 1972 (SOURCED: Wikipedia 'Georgia Viaduct'), standing to today (demolition voted 2015, never done: SOURCED).
    Deck height = LidarBC 2025 DSM - DEM (1 m, median within 2 m of the centreline) every ~10 m (SOURCED measurement); width 3 lanes
    11 m / 2 lanes 8 m / 1 lane 5 m + 1 m (CONVENTION from OSM lanes).
    NOTE: the present-day Vancouver env has FREEWAYS=0 and freeways_hq reads SF's freeways.json, so no TODAY render draws these yet; era
    renders draw them from 1971.49 / 1972.02 through era.build_structures (hq_scene) -> the today key needs them too (present-day agent)."""
import json, glob, numpy as np, rasterio
import common as c, cityconf as C
OSM = {e['id']: e for e in json.load(open(f'{c.OUT}/osm_rail_bridges.json'))['elements']}
def chain(ids):
    P = []
    for i in ids:
        Q = [C.proj(q['lon'], q['lat']) for q in OSM[i]['geometry']]
        P += Q if not P else Q[1:]
    return P
def resample(P, step=10.0):
    out = [P[0]]
    for a, b in zip(P, P[1:]):
        L = np.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(L / step))
        out += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(1, n + 1)]
    return out
TILES = []
for kind in ('dsm', 'dem'):
    for f in glob.glob(f'{c.W}/lidar/bc2025/{kind}/*.tif'):
        with rasterio.open(f) as r: TILES.append((kind, f, r.bounds))
def sample(kind, e, n):
    for k, f, b in TILES:
        if k == kind and b.left + 3 <= e <= b.right - 3 and b.bottom + 3 <= n <= b.top - 3:
            with rasterio.open(f) as r:
                a = r.read(1, window=rasterio.windows.from_bounds(e - 2, n - 2, e + 2, n + 2, r.transform)).astype(float)
                a = a[(a > -50) & (a < 500)]
                return float(np.median(a)) if a.size else None
    return None
def hag_of(P):
    H = []
    for x, y in P:
        e, n = c.w2utm(x, y); s, d = sample('dsm', e, n), sample('dem', e, n)
        H.append(round(max(0.0, s - d), 1) if s is not None and d is not None else None)
    # gaps: nearest measured
    m = [i for i, h in enumerate(H) if h is not None]
    return [H[i] if H[i] is not None else H[min(m, key=lambda k: abs(k - i))] for i in range(len(H))] if m else [7.0] * len(H)
def width(ids):
    l = max(int(OSM[i]['tags'].get('lanes') or 2) for i in ids); return {1: 6.0, 2: 9.0, 3: 12.0}.get(l, 15.0)
ST = []
old = [(1380, 2488.5), (1440, 2486.5), (1800, 2472.5), (2120, 2464.0), (2205, 2466.0)]
oldP = resample(old)
L = np.r_[0, np.cumsum([np.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(oldP, oldP[1:])])]
oh = [round(float(min(7.0, 7.0 * (L[-1] - s) / 85.0)), 1) for s in L]
ST.append(dict(k='georgia_viaduct_1915', kind='viaduct1', y0=1915.0, y1=1972.02, dem=[1971.49, 1972.02], w=16.0, decks=[0.0], path=[[round(x, 1), round(y, 1)] for x, y in oldP], hag=[[round(float(s), 1), h] for s, h in zip(L, oh)],
               src='SOURCED dates (Wikipedia Georgia Viaduct); path traced on NAPL 1950/1959; height CONVENTION'))
for k, y0, ids in (('georgia_viaduct_1971', 1971.49, [507910545, 4645645, 35354254, 35354258]), ('georgia_viaduct_1971_union', 1971.49, [36767234]),
                   ('dunsmuir_viaduct_1972', 1972.02, [1285852098, 36767233, 35354253, 35354252]), ('dunsmuir_viaduct_1972_prior', 1972.02, [26378384, 720982741, 720982742])):
    P = resample(chain(ids)); h = hag_of(P)
    S_ = np.r_[0, np.cumsum([np.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(P, P[1:])])]
    ST.append(dict(k=k, kind='viaduct1', y0=y0, y1=9999.0, w=width(ids), decks=[0.0], path=[[round(x, 1), round(y, 1)] for x, y in P], hag=[[round(float(a), 1), b] for a, b in zip(S_, h)],
                   src=f'SOURCED: opening date Wikipedia Georgia Viaduct; path OSM ways {ids} (ODbL); height LidarBC 2025 DSM-DEM'))
    print(k, len(P), 'pts, hag', min(h), '-', max(h), 'w', width(ids))
json.dump(ST, open(f'{c.OUT}/structures.json', 'w'), indent=0)
print('old viaduct', len(oldP), 'pts', round(float(L[-1])), 'm')
