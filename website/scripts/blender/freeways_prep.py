"""The elevated freeways' decks, measured: OpenStreetMap for where each
carriageway runs, the USGS 3DEP LiDAR for how high it runs.

    <venv python> freeways_prep.py [osm|lidar|profile|all]     (default all)

The venv (qipu-render-work/fwsrc/venv) carries laspy + lazrs to read the
LiDAR tiles; everything else is numpy/scipy. The sources and the tile cache
live in qipu-render-work/fwsrc; the render reads only freeways/freeways.json
(what mksnap.sh freezes with a pass).

SOURCES
  * OpenStreetMap (ODbL, (c) OpenStreetMap contributors), Overpass: every
    motorway / trunk / busway way in the city's box with its tags and node
    ids (fw_osm.json). A way is a STRUCTURE (viaduct, ramp on columns) when it
    carries bridge=* (not 'no') or layer >= 1, and is not a tunnel.
  * USGS 3DEP LiDAR, CA_SanFrancisco_1_B23 (public domain), read from the
    Entwine Point Tile copy on AWS (usgs-lidar-public): the points classified
    17, BRIDGE DECK, within 2.5 m of each carriageway's centre line give the
    deck's elevation; class 2 (ground) and the 3DEP bare-earth DEM
    (lm_dem.py: bridges removed, embankments kept) give the ground under it.
    Deck height = the measured deck, never a guess, wherever the LiDAR sees
    it. Where it does not (a lower deck under an upper one, a gap in the
    classification) the height is interpolated along the way between measured
    samples; a way with no measurement at all gets a default by class (OSM
    layer x 6.5 m, a ramp's end at grade) - logged, and rare.
  * The two great bridges are the landmarks agent's (lm_bridges.py): the
    Golden Gate ways and every way on the Bay Bridge's axis east of its
    Rincon Hill landing are left out.

WRITES qipu-render-work/fwsrc/
  fw_osm.json      the Overpass answer
  ept/*.laz        the LiDAR tiles read (cache)
  lidar_pts.npz    the points within 3.5 m of a structure's centre line
                   (engine x, y; z NAVD88 m; class)
and qipu-render-work/freeways/
  freeways.json    {ways: [{id, hw, name, ref, layer, lanes, oneway, width,
                    pts: [[x, y, z]...] every ~3 m, hag: [...], meas: [...],
                    ends: [a0, a1]}], nodes, src}
                   z is the deck's top (NAVD88 m, the render's own z, the
                   DEM's datum); hag its height over the bare earth; meas 1
                   where a LiDAR sample was used within 6 m; ends: 1 where the
                   way's end touches down at grade (the deck meets the ground).
                   surface: the surface streets within 80 m of a deck
                   [[class, half width, [[x, y]...]]] (critic/osm/highways.json,
                   OSM), where a pier must not stand across a street.
"""
import json, math, os, sys, time, io, urllib.request
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
W = '/Users/daniel/code/qipu-render-work/fwsrc'
OUT = '/Users/daniel/code/qipu-render-work/freeways'
HIGHWAYS = '/Users/daniel/code/qipu-render-work/critic/osm/highways.json'
EPT = 'https://s3-us-west-2.amazonaws.com/usgs-lidar-public/CA_SanFrancisco_1_B23/'
KX = 111320 * 0.790582709628753; KY = 111320.0          # life_prep's engine metres
R_M = 6378137.0
FW_HW = ('motorway', 'motorway_link', 'trunk', 'trunk_link', 'busway')
# the landmarks agent's bridges (lm_bridges.py): the Golden Gate's south
# approach viaduct ways, and the Bay Bridge's axis from its Rincon Hill landing
GG_WAYS = {537838948, 595194543}
BAY_W2 = (4592.0, 3423.4); BAY_ANG = math.radians(49.7475); BAY_V0 = -705.0
# the joint with the landmarks' Bay Bridge at v = BAY_V0 (lm_bridges, from this LiDAR): roadway tops
JOINT_UP, JOINT_LO, JOINT_L = 43.7, 35.0, 60.0
DEPTH = int(os.environ.get('FW_DEPTH', 7))
APPROACH = 300.0


def xy(lon, lat): return ((lon + 122.438) * KX, (lat - 37.76) * KY)
def lonlat(x, y): return (x / KX - 122.438, y / KY + 37.76)
def merc(lon, lat): return R_M * np.radians(lon), R_M * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))
def unmerc(X, Y): return np.degrees(X / R_M), np.degrees(2 * np.arctan(np.exp(Y / R_M)) - np.pi / 2)


def _layer(t):
    v = str(t.get('layer', '0')).split(';')[0].strip()
    try: return int(float(v))
    except ValueError: return 0


def on_bay_bridge(x, y):
    """on the landmarks agent's Bay Bridge (its deck from the Rincon Hill landing east)"""
    dx, dy = x - BAY_W2[0], y - BAY_W2[1]
    ux, uy = math.cos(BAY_ANG), math.sin(BAY_ANG)
    v = dx * ux + dy * uy; u = -dx * uy + dy * ux
    return v > BAY_V0 and abs(u) < 16


def lanes_of(t, hw):
    try: n = int(str(t.get('lanes', '')).split(';')[0])
    except ValueError: n = 0
    if n <= 0: n = {'motorway': 3, 'trunk': 2}.get(hw, 1)
    if t.get('oneway') not in ('yes', '-1', '1') and hw not in ('motorway',) and 'lanes' in t: n = max(1, n)   # two-way: lanes is the total
    return n


def width_of(t, hw, n):
    """carriageway deck width, kerb to kerb (m): 12 ft lanes (Caltrans), inside
    and outside shoulders on the mainline (Caltrans HDM 302.1: 5 ft / 10 ft
    on urban freeways, narrower on the old viaducts: 2 / 6 ft here), 2 + 4 ft
    on ramps; the width tag when OSM has one"""
    try: return float(str(t.get('width')).replace('m', '').strip())
    except (TypeError, ValueError): pass
    if hw == 'busway': return n * 3.66 + 1.8
    if hw.endswith('_link'): return n * 3.66 + 1.8
    return n * 3.66 + 2.4


# ── 1. OSM ───────────────────────────────────────────────────────────────────
def osm():
    p = f'{W}/fw_osm.json'
    if not os.path.exists(p):
        import osm_fetch
        osm_fetch.fetch('[out:json][timeout:170];(way["highway"~"^(motorway|motorway_link|trunk|trunk_link|busway)$"]'
                        '(37.700,-122.530,37.860,-122.340););out body geom;', p)
    E = json.load(open(p))['elements']
    ways = []
    for e in E:
        t = e.get('tags', {}); hw = t.get('highway')
        if hw not in FW_HW or 'geometry' not in e: continue
        ly = _layer(t); br = t.get('bridge', 'no') not in ('no',)
        if t.get('tunnel', 'no') not in ('no',) or ly < 0: continue
        pts = [xy(g['lon'], g['lat']) for g in e['geometry']]
        ways.append(dict(id=e['id'], hw=hw, name=t.get('name', ''), ref=t.get('ref', ''), layer=ly, bridge=br,
                         nodes=e['nodes'], pts=[[round(a, 2), round(b, 2)] for a, b in pts],
                         lanes=lanes_of(t, hw), oneway=t.get('oneway', 'yes' if hw.startswith('motorway') else 'no'), t=t))
    return ways


def _vu(x, y):
    dx, dy = x - BAY_W2[0], y - BAY_W2[1]
    return dx * math.cos(BAY_ANG) + dy * math.sin(BAY_ANG), -dx * math.sin(BAY_ANG) + dy * math.cos(BAY_ANG)


def _off_bridges(x, y): return not on_bay_bridge(x, y) and x < 5200     # x > 5200: Yerba Buena Island


def clip_bay(w):
    """the way's part off the landmarks' bridges, with a vertex added exactly on
    the boundary; a cut end at v = BAY_V0 on the axis is a JOINT with the
    landmarks' deck (lm_bridges: upper roadway 43.7 m, lower 35.0 m there,
    u -9.2..9.2): the last JOINT_L m of the way are bent onto the axis"""
    pts = w['pts']; n = len(pts)
    keep = [_off_bridges(x, y) for x, y in pts]
    if all(keep): return w
    if not any(keep): return None
    runs, i = [], 0
    while i < n:
        if keep[i]:
            j = i
            while j + 1 < n and keep[j + 1]: j += 1
            runs.append((i, j)); i = j + 1
        else: i += 1
    P_ = np.asarray(pts, float); sf = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(P_, axis=0).T))])
    a, b = max(runs, key=lambda r: sf[r[1]] - sf[r[0]] + 0.01 * (r[1] - r[0]))
    def edge(p_in, p_out):
        lo, hi = 0.0, 1.0           # lo: p_in side (kept)
        for _ in range(30):
            m = (lo + hi) / 2; q = (p_in[0] + (p_out[0] - p_in[0]) * m, p_in[1] + (p_out[1] - p_in[1]) * m)
            if _off_bridges(*q): lo = m
            else: hi = m
        return [round(p_in[0] + (p_out[0] - p_in[0]) * lo, 2), round(p_in[1] + (p_out[1] - p_in[1]) * lo, 2)]
    P = [list(q) for q in pts[a:b + 1]]; N = list(w['nodes'][a:b + 1]); cuts = []; s0 = float(sf[a])
    if a > 0:
        q = edge(pts[a], pts[a - 1]); s0 -= math.hypot(q[0] - pts[a][0], q[1] - pts[a][1])
        P = [q] + P; N = [-(w['id'] * 10)] + N; cuts.append(0)
    if b < n - 1:
        q = edge(pts[b], pts[b + 1]); P = P + [q]; N = N + [-(w['id'] * 10 + 1)]; cuts.append(1)
    joints = []
    for e in cuts:
        v, u = _vu(*P[0 if e == 0 else -1])
        if abs(v - BAY_V0) < 1.0 and abs(u) < 16: joints.append(e)
    # bend the last JOINT_L m onto the axis (u -> 0 at the joint)
    for e in joints:
        Q = np.asarray(P, float); sq = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(Q, axis=0).T))])
        d = sq if e == 0 else sq[-1] - sq
        _, u0 = _vu(*P[0 if e == 0 else -1])
        f = np.clip(1 - d / JOINT_L, 0, 1); f = f * f * (3 - 2 * f)
        nx, ny = -math.sin(BAY_ANG), math.cos(BAY_ANG)
        P = [[round(x - nx * u0 * fk, 2), round(y - ny * u0 * fk, 2)] for (x, y), fk in zip(P, f)]
    return dict(w, pts=P, nodes=N, s0=round(s0, 2), cut_ends=cuts, joints=joints)


def structures(ways):
    """the elevated ways, cut where they reach the landmarks' bridges"""
    S = []
    for w in ways:
        if not (w['bridge'] or w['layer'] >= 1): continue
        if w['id'] in GG_WAYS or 'Golden Gate Bridge' in w['name']: continue
        w = clip_bay(w)
        if w is None or len(w['pts']) < 2: continue
        w['width'] = round(width_of(w['t'], w['hw'], w['lanes']), 2)
        S.append(w)
    # THE APPROACHES: the motorway ways that continue an elevated one without a
    # bridge tag, up to APPROACH m on from it. OSM splits a viaduct into bridge
    # ways and ways between them (an abutment, a gap in the tagging, the bus
    # ramps' untagged links); the LiDAR says which parts of these are still up
    # in the air, and where the road really comes down to the ground.
    sid = {w['id'] for w in S}
    byn = {}
    for w in ways:
        for nd in (w['nodes'][0], w['nodes'][-1]): byn.setdefault(nd, []).append(w)
    front = [(nd, 0.0) for w in S for nd in (w['nodes'][0], w['nodes'][-1])]
    seen = set(sid); A = []
    while front:
        nd, d0 = front.pop()
        for w in byn.get(nd, []):
            if w['id'] in seen or w['id'] in GG_WAYS or 'Golden Gate Bridge' in w['name']: continue
            w = clip_bay(w)
            if w is None or len(w['pts']) < 2: continue
            seen.add(w['id'])
            L = float(np.hypot(*np.diff(np.asarray(w['pts']), axis=0).T).sum())
            w = dict(w, approach=True, width=round(width_of(w['t'], w['hw'], w['lanes']), 2)); A.append(w)
            if d0 + L < APPROACH:
                for n2 in (w['nodes'][0], w['nodes'][-1]):
                    if n2 != nd: front.append((n2, d0 + L))
    # AT GRADE: every other motorway carriageway (the engine's street file does
    # not have them; hq_city drew them as lawn with lane dashes). Paved, draped
    # on the ground, no LiDAR needed.
    have = {w['id'] for w in S + A}
    G = [dict(w, grade=True, width=round(width_of(w['t'], w['hw'], w['lanes']), 2)) for w in ways
         if w['id'] not in have and w['hw'] in ('motorway', 'motorway_link') and w['id'] not in GG_WAYS
         and 'Golden Gate Bridge' not in w['name'] and not any(on_bay_bridge(x, y) or x >= 5200 for x, y in w['pts'])]
    # (a motorway way partly on the bridge is an approach or a structure, clipped above)
    return S + A + G


def resample(P, step):
    P = np.asarray(P, float)
    s = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))])
    n = max(2, int(math.ceil(s[-1] / step)) + 1)
    u = np.linspace(0, s[-1], n)
    return np.stack([np.interp(u, s, P[:, 0]), np.interp(u, s, P[:, 1])], 1), u, s


# ── 2. LiDAR ─────────────────────────────────────────────────────────────────
def _get(url, dst=None, tries=5):
    if dst and os.path.exists(dst): return open(dst, 'rb').read()
    for a in range(tries):
        try:
            b = urllib.request.urlopen(url, timeout=60).read()
            if dst: open(dst + '.part', 'wb').write(b); os.replace(dst + '.part', dst)
            return b
        except Exception as ex:
            if a == tries - 1: raise
            time.sleep(2 + 3 * a)


def lidar(S, out_name='lidar_pts.npz'):
    from concurrent.futures import ThreadPoolExecutor
    from scipy.spatial import cKDTree
    import laspy
    os.makedirs(f'{W}/ept', exist_ok=True)
    meta = json.loads(_get(EPT + 'ept.json', f'{W}/ept/ept.json'))
    b = meta['bounds']; side = b[3] - b[0]
    samp = np.concatenate([resample(w['pts'], 2.0)[0] for w in S])
    lon, lat = lonlat(samp[:, 0], samp[:, 1]); MX, MY = merc(lon, lat)
    kd = cKDTree(samp)
    # the depth-DEPTH cells the corridor touches (5 m margin), and their ancestors
    s = side / 2 ** DEPTH; m = 6.0
    cells = set()
    for dx in (-m, 0, m):
        for dy in (-m, 0, m):
            cells |= set(zip(((MX + dx - b[0]) // s).astype(int).tolist(), ((MY + dy - b[1]) // s).astype(int).tolist()))
    want = {(d, i >> (DEPTH - d), j >> (DEPTH - d)) for (i, j) in cells for d in range(DEPTH + 1)}
    H = json.loads(_get(EPT + 'ept-hierarchy/0-0-0-0.json', f'{W}/ept/h_0-0-0-0.json'))
    # the sub-hierarchies under the depth-6 nodes on the corridor
    subs = [k for k, v in H.items() if v == -1 and (int(k.split('-')[0]), int(k.split('-')[1]), int(k.split('-')[2])) in want]
    with ThreadPoolExecutor(8) as ex:
        for k, hb in zip(subs, ex.map(lambda k: _get(EPT + f'ept-hierarchy/{k}.json', f'{W}/ept/h_{k}.json'), subs)):
            H.update({kk: vv for kk, vv in json.loads(hb).items() if vv != -1 or kk not in H})
    def zr(d, k):
        sz = side / 2 ** d; return b[2] + k * sz, b[2] + (k + 1) * sz
    keys = []
    for kk, v in H.items():
        d, i, j, k = (int(q) for q in kk.split('-'))
        if d > DEPTH or v <= 0 or (d, i, j) not in want: continue
        z0, z1 = zr(d, k)
        if z1 < -40 or z0 > 160: continue
        keys.append(kk)
    print(f'lidar: {len(S)} ways, {len(samp)} samples, {len(keys)} EPT nodes (depth <= {DEPTH})', flush=True)
    out = []
    def one(kk):
        raw = _get(EPT + f'ept-data/{kk}.laz', f'{W}/ept/{kk}.laz')
        las = laspy.read(io.BytesIO(raw))
        X = np.asarray(las.x); Y = np.asarray(las.y); Z = np.asarray(las.z, np.float32); C = np.asarray(las.classification, np.uint8)
        lo, la = unmerc(X, Y); x, y = xy(lo, la)
        dd, _ = kd.query(np.stack([x, y], 1), distance_upper_bound=3.5)
        k = np.isfinite(dd)
        return np.stack([x[k], y[k]], 1).astype(np.float32), Z[k], C[k]
    t0 = time.time()
    with ThreadPoolExecutor(8) as ex:
        for n, r in enumerate(ex.map(one, keys)):
            out.append(r)
            if n % 50 == 0: print(f'  {n}/{len(keys)} nodes, {time.time() - t0:.0f}s', flush=True)
    P = np.concatenate([o[0] for o in out]); Z = np.concatenate([o[1] for o in out]); C = np.concatenate([o[2] for o in out])
    np.savez_compressed(f'{W}/{out_name}', xy=P, z=Z, c=C)
    import collections
    print('lidar points kept', len(Z), collections.Counter(C.tolist()).most_common(8))


def bay_axis():
    """the Bay Bridge's west approach, measured for the landmarks agent: the
    deck levels along the bridge axis from Rincon Hill to the W1 cable bent"""
    ux, uy = math.cos(BAY_ANG), math.sin(BAY_ANG)
    lines = [dict(pts=[[BAY_W2[0] + v * ux - u * uy, BAY_W2[1] + v * uy + u * ux] for v in (-950.0, -250.0)])
             for u in np.arange(-14.0, 14.1, 3.5)]
    lidar(lines, 'lidar_bay.npz')
    L = np.load(f'{W}/lidar_bay.npz'); P, Z, C = L['xy'].astype(float), L['z'], L['c']
    import lm_dem
    dx, dy = P[:, 0] - BAY_W2[0], P[:, 1] - BAY_W2[1]; v = dx * ux + dy * uy; u = -dx * uy + dy * ux
    rows = []
    for v0 in np.arange(-950.0, -250.0, 10.0):
        s = (v >= v0) & (v < v0 + 10) & (np.abs(u) < 13)
        d = s & (C == 17); g = s & (C == 2)
        x, y = BAY_W2[0] + (v0 + 5) * ux, BAY_W2[1] + (v0 + 5) * uy
        lv = []
        if d.sum() >= 5:
            zz = np.sort(Z[d]); cut = np.where(np.diff(zz) > 1.5)[0]
            lv = [round(float(np.median(c)), 2) for c in np.split(zz, cut + 1) if len(c) >= 5]
        rows.append(dict(v=float(v0 + 5), deck_levels=lv, ground_lidar=round(float(np.median(Z[g])), 2) if g.sum() >= 3 else None,
                         dem=round(float(lm_dem.sample(x, y) or 0), 2)))
    json.dump(dict(src='USGS 3DEP LiDAR CA_SanFrancisco_1_B23, class 17 (bridge deck) within |u| < 13 m of the axis; '
                   'v = m along the Bay Bridge axis from W2 (lm_bridges BAY_W2, BAY_ANG); levels = medians of the height clusters '
                   '(the top one is what the scanner saw from above)', rows=rows), open(f'{OUT}/bay_approach_lidar.json', 'w'), indent=0)
    for r in rows: print(r)


if __name__ == '__main__':
    step = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if step == 'bay': bay_axis(); sys.exit(0)
    ways = osm(); S = structures(ways)
    print(f'osm: {len(ways)} ways, {sum(not w.get("approach") and not w.get("grade") for w in S)} structures + {sum(bool(w.get("approach")) for w in S)} approaches '
          f'+ {sum(bool(w.get("grade")) for w in S)} at grade, '
          f'{sum(resample(w["pts"], 2)[1][-1] for w in S) / 1000:.1f} km')
    if step in ('lidar', 'all'): lidar([w for w in S if not w.get('grade')])
    if step in ('profile', 'all'):
        import freeways_profile; freeways_profile.run(ways, S, W, OUT, HIGHWAYS)
