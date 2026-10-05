"""Another city's bridges standing today, as data for era.build_structures (hq_city CITY_STRUCTURES=1 + CITY_BRIDGES=<json>).

CITY=vancouver python3 bridges_city.py [lidar_grid_dir]
  in : cities/<city>/critic/osm/highways.json (Overpass, ODbL: every way with bridge=*), the city's era structures (already drawn:
       the Georgia/Dunsmuir viaducts), LidarBC 2025 DSM + DEM on the engine world grid (dsm.npy / dem.npy, 1 m, x0 -7250, y0 -6750,
       15500 x 13500, north up; made by the QA's mosaic code, see B3_FIX_LOG.md), the drawn building records (city_data, today).
  out: cities/<city>/landmarks/bridges.json  [ {k, kind, y0, y1, w, decks, zabs, path, hag, bent, bent_w, pylons, src}, ... ]
       places/overrides.json 'today' entries {gid: {skip: true, why}} for building records that are bridge piers (a footprint under
       a deck (60 % of it), over the water or as tall as the deck +-4 m (1,500 m2 at most): Burrard Bridge's two piers stood in False
       Creek as houses).
Rules (SOURCED = measured; CONVENTION = chosen):
  ways: car classes (motorway .. service) of 30 m or more; foot/cycle bridges only standing alone (not alongside a car deck), plus
    the Canada Line's North Arm Bridge (its bikeway is the only OSM way on it; deck 12 m wide, CONVENTION).
  deck top: the DSM's 25th percentile within +-2 m of the centreline every 4 m, then a running median over 7 samples (cars, lamp
    posts, a truss overhead read higher) (SOURCED: LidarBC 2025); gaps interpolated, an end outside the LiDAR rests on the DEM.
  under trees: dropped where the DSM within +-1 m of the centreline ranges over 3 m (foot/cycle) or 4 m (cars) (the canopy).
  a way stays only if its deck stands 4 m or more over the DEM somewhere, or over the water (no DEM / DEM < 1 m) 3 m or more.
  width: lanes x 3.5 m + 3 m with sidewalks (1 m without); lanes from OSM, else 2 (1 for a oneway link or service) (CONVENTION).
  piers: two-column bents every 30 m over land, 70 m over the water, none under a deck 50 m or more over the water (suspension and
    cantilever spans: Lions Gate, Second Narrows) (CONVENTION).
  over the deck (DSM 97th percentile within the deck's width): a through truss where a run 8 m or more over it is 60 m or longer
    and mostly over the water (Burrard's centre span, Second Narrows: side trusses of that height); pylons where it is 15 m or more
    over the water or within 40 m of it, outside a truss (Lions Gate's towers, the Canada Line's), one per run, 40 m apart at least
    (SOURCED; the LiDAR leaves thin tops empty, so pylons may stand low). Burrard's towers at its truss ends: CONVENTION.
"""
import os, sys, json, math, re
import numpy as np
os.environ.setdefault('CITY', 'vancouver')
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import cityconf as C

GRID = sys.argv[1] if len(sys.argv) > 1 else C.work('lidar', 'grid')
X0, Y0, NX, NY = -7250.0, -6750.0, 15500, 13500
DSM = np.load(os.path.join(GRID, 'dsm.npy'), mmap_mode='r'); DEM = np.load(os.path.join(GRID, 'dem.npy'), mmap_mode='r')
CAR = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link',
       'tertiary_link', 'unclassified', 'residential', 'service', 'living_street'}
# CONVENTION (photos): Burrard Bridge's concrete towers stand at both ends of its centre truss, ~4 m over it
PYLON_AT_TRUSS_ENDS = {'Burrard Street Bridge': 4.0}
SLOW = {'cycleway', 'footway', 'path', 'bridleway', 'pedestrian', 'track'}


def win(A, x, y, r):
    c, rr = int(round(x - X0)), int(round(Y0 + NY - y))
    if not (r <= c < NX - r and r <= rr < NY - r): return None
    a = np.asarray(A[rr - r:rr + r + 1, c - r:c + r + 1]); a = a[np.isfinite(a)]
    return a if a.size else None


def resample(P, step):
    out = [P[0]]
    for a, b in zip(P, P[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(round(L / step)))
        out += [(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n) for k in range(1, n + 1)]
    return out


def arclen(P): return np.r_[0, np.cumsum([math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(P, P[1:])])]


def fill(v):
    v = np.array(v, float); ok = np.isfinite(v)
    if not ok.any(): return v
    i = np.arange(len(v)); return np.interp(i, i[ok], v[ok])


def runmed(v, k=7):
    h = k // 2; return np.array([np.median(v[max(0, i - h):i + h + 1]) for i in range(len(v))])


def width(t, hw):
    if hw in SLOW: return 4.0
    one = t.get('oneway') == 'yes'
    try: lanes = int(str(t.get('lanes', '')).split(';')[0])
    except ValueError: lanes = 1 if (one and hw.endswith('_link')) or hw == 'service' else 2
    side = 1.0 if t.get('sidewalk') in ('no', 'none') or hw.startswith('motorway') else 3.0
    return max(6.0, lanes * 3.5 + side)


def main():
    H = json.load(open(C.work('critic', 'osm', 'highways.json')))['elements']
    cfg = json.load(open(C.work('city.json')))
    stf = cfg.get('eras', {}).get('era_py', {}).get('structures')
    have = [np.array(s['path'], float) for s in (json.load(open(stf)) if stf and os.path.exists(stf) else []) if s.get('y1', 0) > 2026]
    from scipy.spatial import cKDTree
    KH = cKDTree(np.concatenate([np.array(resample([tuple(q) for q in p], 4.0)) for p in have])) if have else None
    def near_have(x, y, d):
        return KH is not None and KH.query((x, y))[0] < d
    cand = []
    for e in H:
        t = e.get('tags', {}); hw = t.get('highway')
        if t.get('bridge') in (None, 'no') or 'geometry' not in e or (hw not in CAR and hw not in SLOW): continue
        P = [C.proj(q['lon'], q['lat']) for q in e['geometry']]
        if arclen(P)[-1] < 30: continue
        cand.append((e['id'], t, hw, P))
    KC = cKDTree(np.concatenate([np.array(resample(P, 4.0)) for _, t, hw, P in cand if hw in CAR]))
    def beside_car(P, w):
        Q = np.array(resample(P, 8.0)); return (KC.query(Q)[0] < 18.0).sum() >= 0.6 * len(Q)
    out, log = [], []
    for wid, t, hw, P in cand:
        name = t.get('bridge:name') or t.get('name') or ''
        canada_line = 'North Arm Bridge' in name
        if hw in SLOW and not canada_line and beside_car(P, 4.0): continue
        Q = resample(P, 4.0)
        if sum(1 for q in Q[::3] if near_have(q[0], q[1], 10.0)) >= 0.5 * len(Q[::3]): continue     # a viaduct the era structures draw
        w = 12.0 if canada_line else width(t, hw)
        dk, gd = [], []
        for x, y in Q:
            a = win(DSM, x, y, 2); g = win(DEM, x, y, 2)
            dk.append(float(np.percentile(a, 25)) if a is not None else np.nan)
            gd.append(float(np.median(g)) if g is not None else np.nan)
        dk = np.array(dk); gd = np.array(gd); meas = int(np.isfinite(dk).sum())
        if meas < 3: log.append((wid, name, hw, 'no LiDAR')); continue
        # under trees the DSM is the canopy, not a deck: a deck is flat within +-1 m of its centreline (median range 0.1-1.7 m on
        # the real ones), a crown is not (Camosun Bog's boardwalk read 72-96 m) (SOURCED: LidarBC 2025; thresholds CONVENTION)
        rg = [float(np.ptp(a)) for x, y in Q for a in [win(DSM, x, y, 1)] if a is not None]
        if not canada_line and rg and np.median(rg) > (3.0 if hw in SLOW else 4.0):
            log.append((wid, name, hw, f'under trees (DSM range {np.median(rg):.1f} m)')); continue
        wet = ~np.isfinite(gd) | (gd < 1.0)
        # an end outside the LiDAR rests on the ground beside it (DEM), else the nearest measured deck
        if not np.isfinite(dk[0]) and np.isfinite(gd[0]): dk[0] = gd[0] + 0.3
        if not np.isfinite(dk[-1]) and np.isfinite(gd[-1]): dk[-1] = gd[-1] + 0.3
        dk = runmed(fill(dk)); g0 = fill(np.where(wet, np.nan, gd)) if (~wet).any() else np.zeros(len(gd))
        hag = np.where(wet, dk, dk - g0)
        if not ((~wet & (hag >= 4.0)).any() or (wet & (dk >= 3.0)).any()):
            log.append((wid, name, hw, 'at grade')); continue
        S = arclen(Q)
        high_water = bool((wet & (dk >= 50.0)).any())
        # what stands over the deck within its width (DSM 97th percentile - deck): a through truss (a run 8 m or more over the
        # deck, 60 m or longer, mostly over the water: Burrard's centre span, Second Narrows) and pylons (15 m or more, over the
        # water or within 40 m of it, outside a truss: Lions Gate's towers, the Canada Line's)
        py, tr = [], []
        if S[-1] >= 100:
            up = []
            for (x, y), z in zip(Q, dk):
                a = win(DSM, x, y, int(w / 2) + 2); up.append(float(np.percentile(a, 97)) - z if a is not None else 0.0)
            up = np.array(up)
            def runs(m):
                i = 0
                while i < len(m):
                    if not m[i]: i += 1; continue
                    j = i
                    while j + 1 < len(m) and (m[j + 1] or (j + 2 < len(m) and m[j + 2])): j += 1
                    yield i, j; i = j + 1
            trh = np.zeros(len(up))       # the truss height over each sample (0 = none)
            for i, j in runs(up >= 8.0):
                # a truss is flat-topped; a run that peaks 5 m over its median is stay cables to a pylon (the Canada Line's)
                if S[j] - S[i] >= 60.0 and wet[i:j + 1].mean() >= 0.5 and up[i:j + 1].max() - np.median(up[i:j + 1]) < 5.0:
                    h_ = float(np.clip(np.median(up[i:j + 1]), 6.0, 25.0)); trh[i:j + 1] = h_
                    # a suspension span's cables and hangers read as a 'truss' near its towers: none drawn there
                    if not high_water: tr.append([round(float(S[i]), 1), round(float(S[j]), 1), round(h_, 1)])
            nearw = np.array([bool(wet[(np.abs(S - S[k]) <= 40.0)].any()) for k in range(len(S))])
            for i, j in runs((up >= 15.0) & (up >= trh + 8.0) & nearw):
                k = i + int(np.argmax(up[i:j + 1]))
                if not py or S[k] - py[-1][0] >= 40.0: py.append([round(float(S[k]), 1), round(float(min(up[k], 80.0)), 1)])
            if len(py) > 4: py = []          # a run of tall things all along: trees or towers beside it, not pylons
            for a_, b_, h_ in tr:
                if PYLON_AT_TRUSS_ENDS.get(name): py += [[a_, h_ + PYLON_AT_TRUSS_ENDS[name]], [b_, h_ + PYLON_AT_TRUSS_ENDS[name]]]
        st = dict(k=f'bridge_{wid}', kind='viaduct1', y0=0.0, y1=9999.0, w=round(w, 1), decks=[0.0], zabs=True,
                  path=[[round(x, 1), round(y, 1)] for x, y in Q], hag=[[round(float(s), 1), round(float(z), 2)] for s, z in zip(S, dk)],
                  bent=30.0, bent_w=1e9 if high_water else 70.0, pylons=py, truss=tr,
                  src=f'OSM way {wid} ({hw}{", " + name if name else ""}; ODbL); deck = LidarBC 2025 DSM ({meas}/{len(Q)} samples measured)')
        out.append(st)
        log.append((wid, name, hw, f'L {S[-1]:.0f} w {w:.0f} deck {dk.min():.1f}-{dk.max():.1f} hag max {hag.max():.1f} wet {int(wet.sum())} pylons {py} truss {tr}'))
    json.dump(out, open(C.work('landmarks', 'bridges.json'), 'w'), indent=0)
    for r in log:
        if 'at grade' not in r[3]: print(*r)
    print('bridges', len(out), 'of', len(cand), 'candidate ways;', sum(1 for r in log if r[3] == 'at grade'), 'at grade,', sum(1 for r in log if r[3] == 'no LiDAR'), 'no LiDAR,', sum(1 for r in log if r[3].startswith('under trees')), 'under trees')
    return out


def piers(out, recs_pkl=None):
    """building records under a deck: over the water (no DEM / DEM < 1 m) or no taller than the deck over ground"""
    from shapely.geometry import LineString, Polygon
    from shapely.strtree import STRtree
    import pickle
    if recs_pkl: recs = pickle.load(open(recs_pkl, 'rb'))
    else:
        os.environ.update(NEWB='1', HEIGHTS='1', TOWERS='1', PLACES_OV='1', SOUTH='0', FRESH='0')
        import city_data
        # this script's own earlier skips are not applied: a rerun must find the same piers again (it wrote 0 the 2nd time)
        j = json.load(open(city_data.OV_FILE)) if os.path.exists(city_data.OV_FILE) else {}
        ov = {int(k): v for k, v in j.get('gids', {}).items()}
        for k, v in j.get('today', {}).items():
            if not v.get('why', '').startswith('bridges_city'): ov.setdefault(int(k), v)
        city_data._OV, city_data._OV_ADD = ov, list(j.get('add', [])) + list(j.get('today_add', []))
        recs = city_data.buildings(-1e6, -1e6, 1e6, 1e6)
    polys = []; keep = []
    for b in recs:
        try: p = Polygon(b['ring']).buffer(0)
        except Exception: continue
        if p.is_empty: continue
        polys.append(p); keep.append(b)
    tree = STRtree(polys); hit = {}
    for st in out:
        L = LineString(st['path']); D = L.buffer(st['w'] / 2 + 3.0, cap_style=2)
        for i in tree.query(D):
            p = polys[i]; b = keep[i]
            if p.area > 4000 or p.intersection(D).area < 0.6 * p.area: continue
            g = win(DEM, p.centroid.x, p.centroid.y, 2); gz = float(np.median(g)) if g is not None else None
            zd = st['hag'][min(range(len(st['hag'])), key=lambda k: abs(st['hag'][k][0] - L.project(p.centroid)))][1]
            wet = gz is None or gz < 1.0
            if wet or ((b.get("h") or 0) >= 6.0 and abs((b.get("h") or 0) - (zd - gz)) <= 4.0 and p.area <= 1500):     # a pier reaches the deck; a low building under it stays
                hit[b['gid']] = (round(b.get('h') or 0, 1), round(p.area), st['k'], 'water' if wet else 'reaches the deck')
    return hit


if __name__ == '__main__':
    out = main()
    hit = piers(out, os.environ.get('RECS_PKL'))
    path = C.work('places', 'overrides.json'); j = json.load(open(path))
    td = {k: v for k, v in j.get('today', {}).items() if not v.get('why', '').startswith('bridges_city')}
    for g, (h, a, k, why) in hit.items():
        td[str(g)] = dict(skip=True, why=f'bridges_city: a pier of {k} drawn as a building ({why}, {h} m, {a} m2)')
    j['today'] = td; json.dump(j, open(path, 'w'), indent=0)
    print('piers drawn as buildings, skipped:', len(hit), sorted(hit.items())[:20])
