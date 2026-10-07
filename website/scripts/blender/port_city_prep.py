"""port_city_prep.py (FIX4 07/10, another city; CPU, < 2 GB): the port terminals as data - container stacks, ship-to-shore
gantry cranes, bulk piles and silos - from the 2025 LiDAR, for port_city.py (PORT_CITY=1). SF never runs this (its yards:
port_containers.py from its own port_detect).

Why (map audit 07/10, sheet 03): Centerm and Vanterm rendered as flat mottled grey planes (the engine has no yard objects),
where the LiDAR shows rows of container stacks and the quay's STS cranes; the AI then painted warehouses on them.

Where: OSM (ODbL, Overpass 07/10 -> port/osm_port.json, q.txt) industrial=port|stockpile|bulk_storage|transloading areas
touching the city limits (+400 m): Centerm, GCT Vanterm, Alliance Grain, Pacific Terminal, Cascadia, CN CargoFlo...
What, from LidarBC 2025 (1 m DSM - DEM = nDSM; OGL-BC), off every building (engine records + OSM buildings, +2 m):
  cranes   cells > 28 m in lattice blobs (filled < 70 % of their rectangle: not a silo, not a tower), peak >= 40 m,
           20-95 m x 8-50 m, within 140 m of open water (the LiDAR's no-return): centre, boom axis pointing to the water,
           span, peak. (The 2025 flight caught every Centerm / Vanterm crane with its boom raised.)
  boxes    smooth-topped cells 1.9-16.5 m in blobs: each blob's rectangle (its own axis; the terminal's main axis when it
           is squat) filled with 40 ft slots (12.19 x 2.44 m; 20 ft where the blob is shorter than 9 m), 0.4 / 0.2 m apart;
           a slot holds a stack when >= 4 of its 6 probes are in the band; tiers = median height / 2.59 m (1-6).
           Colours: CONVENTION, a shipping-line palette (the hues seen on Commons photos of Centerm / Vanterm: refs
           port-terminals, viewing only), the same line along a row run, hashed.
  piles    blobs >= 400 m2, 2.5-40 m, whose surface slopes like a heap (>= 45 % of cells 7-45 deg): the nDSM itself at 2 m
           (the measured heap), its colour the Sentinel-2 2025-08-12 true colour median over it (10 m).
  silos    OSM man_made=silo|storage_tank or building=silo|storage_tank inside the zones that no engine record covers:
           a cylinder, LiDAR p90 height (>= 4 m).
Output port/port_city.json (+ port/piles.npz). Counts printed and in the json ('counts').
  CITY=vancouver python3 port_city_prep.py"""
import os, sys, json, math, glob
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cityconf as C
if C.CITY == 'sf': sys.exit('SF: port_containers.py has its own data')
import lidar_city as LC
from shapely.geometry import Polygon, LineString, Point, shape, box as sbox
from shapely.ops import polygonize, unary_union
from shapely import affinity

OUT = C.work('port'); OSMF = os.path.join(OUT, 'osm_port.json')
HB = 2.59
PAL = [  # (hex, weight): CONVENTION, the boxes seen in the yards' photos (rust red and blue lead, then white / grey leasing boxes)
    ('#9c3b2a', 14), ('#b4442c', 8), ('#2f5f8a', 10), ('#1f3f6e', 7), ('#6aa7c8', 6), ('#d9d8d2', 9), ('#8f9396', 9),
    ('#c9a24a', 4), ('#2f6b4a', 5), ('#d06a2a', 5), ('#7a2f5a', 3), ('#5e5a52', 6), ('#b8b2a2', 5), ('#e6e3da', 3)]
PW = np.cumsum([w for _, w in PAL]) / sum(w for _, w in PAL)

def h01(*k):
    v = 2166136261
    for a in k: v = ((v ^ (int(a) & 0xffffffff)) * 16777619) & 0xffffffff
    v ^= v >> 13; v = (v * 1274126177) & 0xffffffff; v ^= v >> 16
    return v / 4294967296.0

def colour(*k):
    return PAL[int(np.searchsorted(PW, h01(*k)))][0]

def geom(e):
    if e['type'] == 'way':
        g = e.get('geometry') or []
        p = [C.proj(q['lon'], q['lat']) for q in g]
        if len(p) > 3 and g[0] == g[-1]: return Polygon(p).buffer(0)
        return None
    if e['type'] == 'relation':
        ls = [LineString([C.proj(q['lon'], q['lat']) for q in m['geometry']]) for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
        if not ls: return None
        return unary_union(list(polygonize(unary_union(ls)))).buffer(0)

def limits():
    g = json.load(open(C.CFG['block']['limits'])); g = g.get('geometry', g)
    lim = shape(g); return Polygon([C.proj(x, y) for x, y in lim.exterior.coords])

def zones(E, lim):
    Z = []
    for e in E:
        t = e.get('tags', {})
        if t.get('industrial') in ('port', 'stockpile', 'bulk_storage', 'transloading', 'container_terminal'):
            g = geom(e)
            if g is not None and not g.is_empty and g.intersects(lim.buffer(400)): Z.append((e['id'], t.get('name', ''), g))
    # + landuse=industrial|port land touching a port zone (Centerm's 2020s expansion is mapped as plain industrial land)
    zu = unary_union([g for _, _, g in Z]).buffer(60)
    for e in E:
        t = e.get('tags', {})
        if t.get('landuse') in ('industrial', 'port') and not t.get('industrial'):
            g = geom(e)
            if g is not None and not g.is_empty and g.area < 6e5 and g.intersects(zu) and g.intersects(lim.buffer(400)): Z.append((e['id'], t.get('name', '') or 'industrial', g))
    return Z

def lines_mask(x0, y1, W, H):
    """OSM highways (critic/osm/highways.json: carriageways 7 m either side, others 4 m) and railway=rail (3.5 m): no box there
    (the yard's viaducts and the rail yard's tracks, where rail_city draws its own cars)"""
    m = np.zeros((H, W), np.uint8)
    srcs = [(C.work('critic', 'osm', 'highways.json'), 'highway'), (C.work('transit', 'rail_osm.json'), 'railway')]
    for f, key in srcs:
        if not os.path.exists(f): continue
        d = json.load(open(f)); E = d['elements'] if isinstance(d, dict) else d
        for e in E:
            g = e.get('geometry'); t = e.get('tags', {})
            if not g or e.get('type') != 'way': continue
            if key == 'railway' and t.get('railway') != 'rail': continue
            if key == 'highway' and t.get('highway') in ('footway', 'path', 'cycleway', 'steps', 'pedestrian'): continue
            xy = np.array([C.proj(q['lon'], q['lat']) for q in g]); px = np.stack([xy[:, 0] - x0, y1 - xy[:, 1]], 1)
            if px[:, 0].max() < 0 or px[:, 0].min() > W or px[:, 1].max() < 0 or px[:, 1].min() > H: continue
            w = 3.5 if key == 'railway' else (7 if t.get('highway') in ('motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link') else 4)
            cv2.polylines(m, [px.round().astype(np.int32)], False, 1, int(2 * w))
    return m > 0

def building_polys(bx):
    import city_data
    P = [Polygon(b['ring']).buffer(0) for b in city_data.buildings(*bx) if len(b['ring']) >= 3]
    for f in glob.glob(C.work('newbuildings', 'osm', '*.json')):
        for e in json.load(open(f)).get('elements', []):
            g = e.get('geometry') or []
            if e.get('type') != 'way' or len(g) < 4 or 'building' not in e.get('tags', {}): continue
            xs = [C.proj(q['lon'], q['lat']) for q in g]
            if not any(bx[0] <= x <= bx[2] and bx[1] <= y <= bx[3] for x, y in xs): continue
            try: P.append(Polygon(xs).buffer(0))
            except Exception: pass
    return [p for p in P if p.is_valid and not p.is_empty]

def raster(polys, x0, y1, W, H, res=1.0, grow=0):
    m = np.zeros((H, W), np.uint8)
    for p in polys:
        for g in getattr(p, 'geoms', [p]):
            if g.geom_type != 'Polygon': continue
            r = np.array(g.exterior.coords); pts = np.stack([(r[:, 0] - x0) / res, (y1 - r[:, 1]) / res], 1).round().astype(np.int32)
            cv2.fillPoly(m, [pts], 1)
    if grow: m = cv2.dilate(m, np.ones((2 * grow + 1, 2 * grow + 1), np.uint8))
    return m > 0

def s2_colour(xs, ys):
    import rasterio
    from rasterio.windows import from_bounds
    from pyproj import Transformer
    U = 'https://e84-earth-search-sentinel-data.s3.us-west-2.amazonaws.com/sentinel-2-c1-l2a/10/U/DV/2025/8/S2C_T10UDV_20250812T191308_L2A/TCI.tif'
    lon, lat = C.unproj(np.asarray(xs), np.asarray(ys))
    try:
        with rasterio.open(U) as r:
            E, N = Transformer.from_crs('EPSG:4326', r.crs, always_xy=True).transform(lon, lat)
            win = from_bounds(E.min() - 20, N.min() - 20, E.max() + 20, N.max() + 20, r.transform); A = r.read(window=win, boundless=True); tr = r.window_transform(win)
        c = np.clip(((E - tr.c) / tr.a).astype(int), 0, A.shape[2] - 1); rr = np.clip(((N - tr.f) / tr.e).astype(int), 0, A.shape[1] - 1)
        v = np.median(np.stack([A[k][rr, c] for k in range(3)], -1), 0)
        return '#%02x%02x%02x' % tuple(int(x) for x in v)
    except Exception as ex:
        print('s2 colour unavailable:', ex); return '#8d8676'

def main():
    E = json.load(open(OSMF))['elements']; lim = limits(); Z = zones(E, lim)
    print('zones', len(Z), [n or i for i, n, _ in Z])
    zu = unary_union([g for _, _, g in Z]).buffer(25)
    cranes, boxes, piles, silos = [], [], [], []; pile_h = {}
    parts = list(getattr(zu, 'geoms', [zu]))
    for zi, zg in enumerate(parts):
        x0, y0, x1, y1 = [math.floor(v) for v in zg.bounds[:2]] + [math.ceil(v) for v in zg.bounds[2:]]
        X, Y, S, D = LC.grid((x0 - 150, y0 - 150, x1 + 150, y1 + 150), 1.0)    # 150 m round: the water the quay faces
        gx0, gy1 = x0 - 150, y1 + 150; H_, W_ = X.shape
        h = S - D; water = np.isnan(S)
        zm = raster([zg], gx0, gy1, W_, H_)
        bld = raster(building_polys((gx0, y0 - 150, x1 + 150, gy1)), gx0, gy1, W_, H_, grow=2)
        lns = lines_mask(gx0, gy1, W_, H_)
        hz = np.nan_to_num(h, nan=0.0); dwat = cv2.distanceTransform((~water).astype(np.uint8), cv2.DIST_L2, 5)
        # -- cranes
        tall = (hz > 28) & ~bld & zm
        lab_n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(tall.astype(np.uint8), np.ones((7, 7), np.uint8)), connectivity=8)
        cmask = np.zeros_like(tall)
        for k in range(1, lab_n):
            sel = (lab == k) & tall; n = int(sel.sum())
            if n < 40: continue
            yy, xx = np.nonzero(sel); pk = float(np.percentile(hz[sel], 99))
            (cx, cy), (rw, rh), ang = cv2.minAreaRect(np.stack([xx, yy], 1).astype(np.float32))
            L, Wd = max(rw, rh), min(rw, rh); fill = n / max(1.0, rw * rh)
            if pk < 40 or not (20 <= L <= 95 and 8 <= Wd <= 64) or fill > 0.7 or dwat[int(cy), int(cx)] > 140: continue
            a = math.radians(ang) if rw >= rh else math.radians(ang + 90)            # long axis, image frame (x right, y down)
            u = np.array([math.cos(a), -math.sin(a)])                                # -> world frame (y up)
            wx, wy = gx0 + cx + 0.5, gy1 - cy - 0.5
            # seaward: the side of the long axis with water closer
            def wd(s):
                px, py = int(round(cx + s * u[0] * L)), int(round(cy - s * u[1] * L))
                return dwat[min(max(py, 0), H_ - 1), min(max(px, 0), W_ - 1)]
            if wd(1) > wd(-1): u = -u
            nsplit = 2 if (Wd > 44 and pk >= 55) else 1                                # two STS cranes parked leg to leg
            v = np.array([-u[1], u[0]])
            for q in range(nsplit):
                off = (q - (nsplit - 1) / 2) * Wd / nsplit
                cranes.append(dict(x=round(wx + v[0] * off, 2), y=round(wy + v[1] * off, 2), a=round(math.atan2(u[1], u[0]), 4), L=round(L, 1),
                                   W=round(Wd / nsplit, 1), h=round(pk, 1), h50=round(float(np.median(hz[sel])), 1), fill=round(fill, 2), zone=zi,
                                   kind='sts' if pk >= 55 else 'loader'))
            cmask |= cv2.dilate((lab == k).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
        zc = [c for c in cranes if c['zone'] == zi and c['kind'] == 'sts']
        if len(zc) >= 3:                                   # one quay: every boom to the water side the most of them point to
            m_ = math.atan2(np.mean([math.sin(c['a']) for c in zc]), np.mean([math.cos(c['a']) for c in zc]))
            for c in zc:
                if math.cos(c['a'] - m_) < 0: c['a'] = round(math.atan2(-math.sin(c['a']), -math.cos(c['a'])), 4)
        # -- piles and boxes: blobs of the 1.9-40 m band
        gy_, gx_ = np.gradient(hz); slope = np.hypot(gx_, gy_)
        mx = cv2.dilate(hz.astype(np.float32), np.ones((3, 3), np.uint8)); mn = cv2.erode(hz.astype(np.float32), np.ones((3, 3), np.uint8))
        band = (hz > 1.9) & (hz < 40) & ~bld & zm & ~cmask & ~water & ~lns
        n_, lab2, st2, _ = cv2.connectedComponentsWithStats(cv2.morphologyEx(band.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), connectivity=4)
        heap = np.zeros(n_, bool); boxl = []
        for k in range(1, n_):
            if st2[k, 4] < 20: continue
            x_, y_, w_, hh_ = st2[k, :4]; sub = lab2[y_:y_ + hh_, x_:x_ + w_] == k; hs = hz[y_:y_ + hh_, x_:x_ + w_][sub]; sl = slope[y_:y_ + hh_, x_:x_ + w_][sub]
            hf = float(((sl > 0.12) & (sl < 1.0)).mean())
            if st2[k, 4] >= 400 and hf >= 0.45 and hs.max() >= 2.5:
                heap[k] = True; continue
            if np.percentile(hs, 50) < 16.5: boxl.append(k)
        # piles: the measured heap at 2 m
        for k in np.nonzero(heap)[0]:
            x_, y_, w_, hh_ = st2[k, :4]; sub = cv2.dilate((lab2[y_:y_ + hh_, x_:x_ + w_] == k).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
            hp = np.where(sub, np.clip(hz[y_:y_ + hh_, x_:x_ + w_], 0, 40), 0)[::2, ::2]
            px0, py1 = gx0 + x_, gy1 - y_
            yy, xx = np.nonzero(sub[::2, ::2]); col = s2_colour(px0 + xx[::7] * 2 + 1, py1 - yy[::7] * 2 - 1)
            key = f'p{len(piles)}'; pile_h[key] = np.round(hp * 100).astype(np.uint16)
            piles.append(dict(key=key, x0=float(px0), y1=float(py1), res=2.0, area=int(st2[k, 4]), peak=round(float(hp.max()), 1), col=col, zone=zi))
        # boxes: every non-heap blob of the band, slot by slot
        lab_ok = np.zeros(n_, bool); lab_ok[boxl] = True; nrej = [0]
        print(f'  zone {zi}: band blobs {n_ - 1}, heaps {int(heap.sum())}, box blobs {len(boxl)}', flush=True)
        ang_list = []
        rects = {}
        for k in boxl:
            yy, xx = np.nonzero(lab2[st2[k, 1]:st2[k, 1] + st2[k, 3], st2[k, 0]:st2[k, 0] + st2[k, 2]] == k); yy, xx = yy + st2[k, 1], xx + st2[k, 0]
            r = cv2.minAreaRect(np.stack([xx, yy], 1).astype(np.float32)); rects[k] = r
            (cx, cy), (rw, rh), ang = r
            if max(rw, rh) > 1.8 * min(rw, rh) and max(rw, rh) > 20: ang_list.append((math.radians(ang if rw >= rh else ang + 90)) % math.pi)
        main_a = float(np.median(ang_list)) if ang_list else 0.0
        inb = (hz > 1.9) & (hz < 16.5) & ~bld & ~cmask
        for k in boxl:
            (cx, cy), (rw, rh), ang = rects[k]
            a = math.radians(ang) if rw >= rh else math.radians(ang + 90); L, Wd = max(rw, rh), min(rw, rh)
            if L < 1.8 * Wd: a = main_a; L = Wd = max(rw, rh) * 1.15
            ux, uy = math.cos(a), math.sin(a); vx, vy = -uy, ux                      # image frame
            sl_ = 12.19 if L >= 9 else 6.06; pu, pv = sl_ + 0.4, 2.44 + 0.2
            nu, nv = max(1, int(L // pu) + 1), max(1, int(Wd // pv) + 1)
            for i in range(nu):
                for j in range(nv):
                    su = (i - (nu - 1) / 2) * pu; sv = (j - (nv - 1) / 2) * pv
                    sx, sy = cx + ux * su + vx * sv, cy + uy * su + vy * sv
                    pr = [(sx + ux * du + vx * dv, sy + uy * du + vy * dv) for du in (-sl_ * 0.35, 0, sl_ * 0.35) for dv in (-0.6, 0.6)]
                    vals = []
                    for (qx, qy) in pr:
                        qi, qj = int(round(qy)), int(round(qx))
                        if 0 <= qi < H_ and 0 <= qj < W_ and lab2[qi, qj] == k and inb[qi, qj]: vals.append(hz[qi, qj])
                    if len(vals) < 4: nrej[0] += 1; continue
                    t = int(np.clip(round(float(np.median(vals)) / HB), 1, 6))
                    wx, wy = gx0 + sx + 0.5, gy1 - sy - 0.5; aw = -a                    # world angle (y up)
                    run = int(i // 3)
                    boxes.append(dict(x=round(wx, 2), y=round(wy, 2), a=round(aw, 4), L=sl_, t=t,
                                      c=[colour(zi, k, j, run, q) if h01(zi, k, j, i, q, 9) < 0.55 else colour(zi, k, j, i, q) for q in range(t)], src=f'z{zi}'))
        print(f'zone {zi} {zg.area / 1e4:.1f} ha: cranes {sum(c["zone"] == zi for c in cranes)}, piles {sum(p["zone"] == zi for p in piles)}, '
              f'stacks {sum(b["src"] == f"z{zi}" for b in boxes)} (slots rejected {nrej[0]})', flush=True)
    # silos: OSM silo / tank outlines in the zones that no engine record covers
    import city_data
    recs = city_data.buildings(*zu.bounds)
    from shapely.strtree import STRtree
    RP = [Polygon(b['ring']).buffer(0) for b in recs if len(b['ring']) >= 3]; tree = STRtree(RP)
    for e in E:
        t = e.get('tags', {})
        if not (t.get('man_made') in ('silo', 'storage_tank') or t.get('building') in ('silo', 'storage_tank')): continue
        g = geom(e)
        if g is None or g.is_empty or not zu.contains(g.centroid): continue
        if any(RP[i].contains(g.centroid) for i in tree.query(g.centroid)): continue
        c = g.centroid; r = math.sqrt(g.area / math.pi)
        if r < 1.5: continue
        XX, YY = np.meshgrid(np.arange(c.x - r, c.x + r, 1.0), np.arange(c.y - r, c.y + r, 1.0))
        ins = np.hypot(XX - c.x, YY - c.y) < r * 0.85
        hh = LC.sample('dsm', XX[ins], YY[ins]) - LC.sample('dem', XX[ins], YY[ins]); hh = hh[np.isfinite(hh)]
        if len(hh) < 3 or np.percentile(hh, 90) < 4: continue
        silos.append(dict(osm=e['id'], x=round(c.x, 2), y=round(c.y, 2), r=round(r, 2), h=round(float(np.percentile(hh, 90)), 1),
                          kind='tank' if (t.get('man_made') == 'storage_tank' or t.get('building') == 'storage_tank') else 'silo'))
    counts = dict(cranes=len(cranes), stacks=len(boxes), boxes=int(sum(b['t'] for b in boxes)), piles=len(piles), silos=len(silos),
                  zones=[n or str(i) for i, n, _ in Z])
    json.dump(dict(source='LidarBC 2025 nDSM (OGL-BC); OSM port areas / silos (ODbL, Overpass 07/10); Sentinel-2 L2A 2025-08-12 TCI for pile colours; '
                          'box colours: CONVENTION palette', counts=counts, cranes=cranes, containers=boxes, piles=piles, silos=silos),
              open(os.path.join(OUT, 'port_city.json'), 'w'))
    np.savez_compressed(os.path.join(OUT, 'piles.npz'), **pile_h)
    print('COUNTS', counts)

if __name__ == '__main__':
    main()
