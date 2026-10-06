"""ANOTHER CITY'S GROUND, GREEN WHERE IT IS GREEN (V-VEG 05/10, Vancouver; SF never runs this).

    CITY=vancouver python3 ground_city.py build     # -> veg/ground_pnw.npy + veg/ground_pnw.json, veg/shore_pnw.npz
    CITY=vancouver python3 ground_city.py stats     # class shares before / after, in the city and in 4 test boxes

Why: ground_cls.npy (ground_landcover.py + ground_smooth.py) is Metro Vancouver's LCC 2020 at 5 m. Its imagery is
August 2020 PlanetScope at 5 m: a front yard, a boulevard (the grass strip between sidewalk and kerb, on nearly
every residential street), a lane's verges are mixed pixels it calls 'Paved' (Mount Pleasant: 48 % Paved, 0.8 % grass;
Kitsilano 24 % / 1.6 %), and its Buildings / Shadow cells are 'none', where the renderer falls back to San Francisco's
hill ground (cured grass, the dry lot's olive and beige). The render read as dry California dirt between houses.

What this does (each rule a CONVENTION, from open data only):
  1  none (LCC Buildings / Shadow / Snow) takes its nearest classified neighbour within 64 m (else rule 2's answer)
  2  in a residential or park area (OSM landuse=residential | leisure=park/garden/pitch/golf_course/playground/
     dog_park | landuse=grass/meadow/recreation_ground/village_green/cemetery/allotments; 2b: or a block OSM leaves
     unmapped that has >= 4 % vegetation and < 50 % buildings in its 60 m window), 'Paved' (asphalt),
     barren (gravel), bare soil and dry/natural grass cells that are NOT on a road (OSM highway centrelines buffered to
     a carriageway width), a lane (service=alley, 6 m), a driveway (3 m), a parking lot or aisle, a sidewalk or a
     path are LAWN (the yards, boulevards and verges; the renderer's yard shader adds the shrubs and patios)
  3  sidewalks (OSM footway=sidewalk, 1.8 m) in those areas are CONCRETE (the pale strip that frames each boulevard)
  4  bare soil stays only on OSM landuse=construction/brownfield or in patches >= 300 m2 (real cleared lots)
  5  sand only on the real beaches: OSM natural=beach, surface sand or untagged, named or >= 2000 m2 (English Bay,
     Sunset, Second and Third, Kitsilano, Jericho, Locarno, Spanish Banks...; Stanley Park's gravel foreshore strips are
     not beaches) (+3 m); a beach's cells LCC calls paved/gravel/grass/none are sand
  6  the seawall's PROMENADE: OSM ways named '*Seawall*' buffered to 7 m are concrete, and so is the strip from the
     OSM coastline to 3 m inland where no beach is (the wall's coping); seaward of the coastline the class is water
  7  nothing changes outside the city box, on industrial / commercial / retail / railway / port land, or under a road
  10 (VT3 06/10) THE WOODS' FLOOR: in the closed woods (veg_city zones stanley, forest, garden: WOODS_ZONES), a cell the
     land cover sees under canopy or in its shadow (LCC Conifer, Deciduous, Shadow, Conifer/Paved, Deciduous/Paved) that
     rules 1-2 made lawn / asphalt / gravel / dry grass / soil, off every OSM road, path, parking, sidewalk, promenade and
     beach, is 'tree' (the shaded fern-and-duff floor; veg_hq VEG_GAPFILL plants its crowns): rule 2 had turned LCC's
     tree-over-paved mixed pixels (a trail under the firs) into mown lawn, 5.7 % of Stanley Park's forest; 10b: a lawn
     rule 2 made there of LCC Paved / Other built / Soil / Shrub off the OSM ways is scrub (the understorey)
shore_pnw.npz (quay_wall.py, QW_LINE=osm): the OSM coastline (natural=coastline, land on its left) as segments with a
beach flag, and its signed distance (+ land) on a 2 m grid, 1 m steps, +-127 m.
Sources: Metro Vancouver LCC 2020 (OGL-MV) via ground_cls.npy; OpenStreetMap (ODbL), fetched 05/10 into
ground/osm_veg/{osm,coast}.json (q.txt there); critic/osm/highways.json (ODbL, 25/09)."""
import json, math, os, sys, time, collections
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import cityconf as C
if C.SF: sys.exit('ground_city.py is for other cities (CITY=...)')

GRD = C.work('ground'); OUTD = C.work('veg'); OSM = C.work('ground', 'osm_veg')
CLS = ['none', 'sand', 'lawn', 'drygrass', 'scrub', 'tree', 'soil', 'asphalt', 'concrete', 'gravel', 'marsh', 'water', 'wetsand', 'turf']
CI = {n: k for k, n in enumerate(CLS)}
# carriageway width (m, kerb to kerb) by OSM highway class: a CONVENTION after Vancouver's usual streets
ROAD_W = {'motorway': 14.0, 'trunk': 14.0, 'primary': 13.0, 'secondary': 12.0, 'tertiary': 11.0, 'unclassified': 9.0,
          'residential': 9.0, 'living_street': 7.0, 'motorway_link': 7.0, 'trunk_link': 7.0, 'primary_link': 7.0,
          'secondary_link': 7.0, 'tertiary_link': 7.0, 'pedestrian': 6.0, 'busway': 7.0}
SERVICE_W = {'alley': 6.0, 'driveway': 3.0, 'parking_aisle': 6.0, 'drive-through': 4.0}
RES_LANDUSE = ('residential',)
GREEN_LANDUSE = ('grass', 'meadow', 'recreation_ground', 'village_green', 'cemetery', 'allotments', 'greenery')
GREEN_LEISURE = ('park', 'garden', 'pitch', 'golf_course', 'playground', 'dog_park')
AUTO_VEG = 0.04
UNIT = 1.0          # shore_pnw.npz sd2 step (m): int8 -> +-127 m (0.5 m saturated at 63 m: Coal Harbour's flats lie further out)
GREY_LANDUSE = ('industrial', 'commercial', 'retail', 'railway', 'construction', 'brownfield', 'port')


def _meta():
    return json.load(open(os.path.join(GRD, 'ground_meta.json')))


class Canvas:
    """PIL 'L' images on the class map's 1 m grid (col = x - x0, row = y - y0: row 0 south, as the .npy)"""
    def __init__(self, M):
        from PIL import Image, ImageDraw
        self.Image, self.ImageDraw = Image, ImageDraw
        self.x0, self.y0 = M['x0'], M['y0']; self.ny, self.nx = M['shape']
    def new(self):
        im = self.Image.new('L', (self.nx, self.ny), 0); return im, self.ImageDraw.Draw(im)
    def pts(self, geom):
        lon = np.array([p['lon'] for p in geom]); lat = np.array([p['lat'] for p in geom])
        x, y = C.proj(lon, lat)
        return list(zip((x - self.x0).tolist(), (y - self.y0).tolist()))


def _ways(j):
    """(tags, [geometry]) per way and per relation outer member (closed rings for areas)"""
    for e in j['elements']:
        t = e.get('tags', {})
        if e['type'] == 'way' and e.get('geometry'):
            yield t, [e['geometry']], e['type']
        elif e['type'] == 'relation':
            g = [m['geometry'] for m in e.get('members', []) if m.get('geometry') and m.get('role', 'outer') in ('outer', '')]
            if g: yield t, g, 'relation'


BIT = {'paved': 1, 'side': 2, 'res': 4, 'green': 8, 'grey': 16, 'beach': 32, 'soilok': 64, 'prom': 128}

def _area(gs):
    tot = 0.0
    for g in gs:
        x, y = C.proj(np.array([p['lon'] for p in g]), np.array([p['lat'] for p in g]))
        tot += abs(0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y))
    return tot


def masks(M):
    """one uint8 bit field (BIT) on the class map's grid, layer by layer (one 1 m image at a time: < 1 GB)"""
    cv = Canvas(M)
    osm = json.load(open(os.path.join(OSM, 'osm.json'))); hw = json.load(open(C.work('critic', 'osm', 'highways.json')))
    B = np.zeros((cv.ny, cv.nx), np.uint8); n = collections.Counter()
    jobs = collections.defaultdict(list)          # key -> [(kind, pts, width)]
    for t, gs, typ in _ways(osm):
        lu, le, na = t.get('landuse'), t.get('leisure'), t.get('natural')
        closed = all(len(g) > 2 and g[0] == g[-1] for g in gs) or typ == 'relation'
        if closed:
            if lu in RES_LANDUSE: jobs['res'] += [('a', g, 0) for g in gs]
            if lu in GREEN_LANDUSE or le in GREEN_LEISURE: jobs['green'] += [('a', g, 0) for g in gs]
            if lu in GREY_LANDUSE or t.get('amenity') == 'parking': jobs['grey'] += [('a', g, 0) for g in gs]
            if t.get('amenity') == 'parking': jobs['paved'] += [('a', g, 0) for g in gs]
            if na == 'beach' and t.get('surface') in (None, 'sand') and (t.get('name') or _area(gs) >= 2000): jobs['beach'] += [('a', g, 0) for g in gs]
            if lu in ('construction', 'brownfield'): jobs['soilok'] += [('a', g, 0) for g in gs]
        if t.get('footway') == 'sidewalk': jobs['side'] += [('l', g, 1.8) for g in gs]
        if 'seawall' in t.get('name', '').lower() and t.get('highway'): jobs['prom'] += [('l', g, 7.0) for g in gs]
        if t.get('highway') in ('footway', 'path', 'cycleway', 'pedestrian') and t.get('footway') != 'sidewalk':
            jobs['paved'] += [('l', g, 2.5) for g in gs]
    for e in hw['elements']:
        t = e.get('tags', {}); g = e.get('geometry')
        if not g or e['type'] != 'way': continue
        h = t.get('highway')
        if t.get('tunnel') == 'yes' or t.get('bridge') == 'yes': continue
        w = SERVICE_W.get(t.get('service'), 4.5) if h == 'service' else ROAD_W.get(h)
        if w is None: continue
        jobs['paved'].append(('l', g, w))
    for key, js in jobs.items():
        im, dr = cv.new()
        for kind, g, w in js:
            p = cv.pts(g)
            if kind == 'a' and len(p) >= 3: dr.polygon(p, fill=1); n[key] += 1
            elif kind == 'l' and len(p) >= 2: dr.line(p, fill=1, width=max(1, int(round(w)))); n[key] += 1
        a = np.asarray(im, dtype=np.uint8); B |= (a * BIT[key]).astype(np.uint8); del a, im, dr
    print('osm drawn', dict(n))
    return B


def nn_fill(G, todo, pad=64, T=2048):
    """cells in todo take the class of the nearest cell not in todo (within pad m), tile by tile"""
    from scipy import ndimage as nd
    ny, nx = G.shape; out = G.copy(); left = 0
    for r0 in range(0, ny, T):
        for c0 in range(0, nx, T):
            r1, c1 = min(ny, r0 + T), min(nx, c0 + T)
            if not todo[r0:r1, c0:c1].any(): continue
            a0, b0, a1, b1 = max(0, r0 - pad), max(0, c0 - pad), min(ny, r1 + pad), min(nx, c1 + pad)
            m = todo[a0:a1, b0:b1]
            if m.all(): left += int(todo[r0:r1, c0:c1].sum()); continue
            d, (ii, jj) = nd.distance_transform_edt(m, return_indices=True)
            sub = G[a0:a1, b0:b1][ii, jj]
            far = d > pad; sub[far] = 0
            out[r0:r1, c0:c1] = np.where(todo[r0:r1, c0:c1], sub[r0 - a0:r1 - a0, c0 - b0:c1 - b0], G[r0:r1, c0:c1])
            left += int((todo[r0:r1, c0:c1] & far[r0 - a0:r1 - a0, c0 - b0:c1 - b0]).sum())
    return out, left


def shore(M, B, G0=None):
    """the OSM coastline: segments (x0 y0 x1 y1, land on the left), a beach flag, its signed distance on a 2 m grid
    (int8, 0.5 m steps, + land); returns it"""
    from scipy import ndimage as nd
    from PIL import Image, ImageDraw
    j = json.load(open(os.path.join(OSM, 'coast.json')))
    S = []; WAY = []; WAY_N = []
    # the ways chained end to start (OSM splits the coastline into ways; a join between two is a bend like any other)
    G_ = [[(p['lon'], p['lat']) for p in (e.get('geometry') or [])] for e in j['elements']]
    G_ = [g for g in G_ if len(g) >= 2]
    st = {}
    for i, g in enumerate(G_): st.setdefault((round(g[0][0], 7), round(g[0][1], 7)), i)
    ends = {(round(g[-1][0], 7), round(g[-1][1], 7)) for g in G_}
    used = set(); chains = []
    order = [i for i, g in enumerate(G_) if (round(g[0][0], 7), round(g[0][1], 7)) not in ends] + list(range(len(G_)))
    for i in order:
        if i in used: continue
        ch = []; k = i
        while k is not None and k not in used:
            used.add(k); ch += G_[k] if not ch else G_[k][1:]
            k = st.get((round(G_[k][-1][0], 7), round(G_[k][-1][1], 7)))
        chains.append(ch)
    for g in chains:
        x, y = C.proj(np.array([p[0] for p in g]), np.array([p[1] for p in g]))
        S += [(x[i], y[i], x[i + 1], y[i + 1]) for i in range(len(g) - 1)]
        WAY += [len(WAY_N)] * (len(g) - 1); WAY_N.append(len(g))
    S = np.array(S, np.float64); WAYA = np.array(WAY, np.int64)
    R = 2.0; X0, Y0 = M['x0'], M['y0']; ny, nx = M['shape']; W_, H_ = int(nx / R), int(ny / R)
    im = Image.new('I', (W_, H_), 0); dr = ImageDraw.Draw(im)
    for k, (a, b, c, d) in enumerate(S):
        dr.line([((a - X0) / R, (b - Y0) / R), ((c - X0) / R, (d - Y0) / R)], fill=k + 1, width=1)
    ID = np.asarray(im, np.int32); del im, dr                             # row 0 = south
    dist, (ii, jj) = nd.distance_transform_edt(ID == 0, return_indices=True)
    sd8 = np.zeros((H_, W_), np.int8)
    gx = X0 + (np.arange(W_) + 0.5) * R
    for r0 in range(0, H_, 512):
        r1 = min(H_, r0 + 512)
        k = ID[ii[r0:r1], jj[r0:r1]] - 1; gy = Y0 + (np.arange(r0, r1) + 0.5) * R
        a, b, c, d = S[k, 0], S[k, 1], S[k, 2], S[k, 3]
        # THE SIDE, robustly: the nearest of the segment and its two neighbours on the same way, and where that nearest point
        # is a shared vertex, the side of the two segments' summed normals (the 'pseudo-normal'); one segment's own side
        # alone flips a wedge beyond every bend (a 100 m strip of downtown read as sea, north of False Creek)
        PX = np.broadcast_to(gx[None, :], k.shape); PY = np.broadcast_to(gy[:, None], k.shape)
        best = np.full(k.shape, np.inf); side = np.zeros(k.shape)
        for o in (-1, 0, 1):
            kk = np.clip(k + o, 0, len(S) - 1); same = WAYA[kk] == WAYA[k]
            a, b, c, d = S[kk, 0], S[kk, 1], S[kk, 2], S[kk, 3]
            dx, dy = c - a, d - b; L2 = np.maximum(dx * dx + dy * dy, 1e-12)
            t = np.clip(((PX - a) * dx + (PY - b) * dy) / L2, 0, 1)
            qx, qy = a + t * dx, b + t * dy; dd = (PX - qx) ** 2 + (PY - qy) ** 2
            nx_, ny_ = -dy, dx                                                # left normal (land side)
            # at a shared end vertex: the neighbour's normal added
            kp = np.clip(kk - 1, 0, len(S) - 1); kn = np.clip(kk + 1, 0, len(S) - 1)
            at0 = (t <= 1e-9) & (WAYA[kp] == WAYA[kk]) & (kp != kk); at1 = (t >= 1 - 1e-9) & (WAYA[kn] == WAYA[kk]) & (kn != kk)
            nx_ = nx_ + np.where(at0, -(S[kp, 3] - S[kp, 1]), 0) + np.where(at1, -(S[kn, 3] - S[kn, 1]), 0)
            ny_ = ny_ + np.where(at0, S[kp, 2] - S[kp, 0], 0) + np.where(at1, S[kn, 2] - S[kn, 0], 0)
            sg = np.sign((PX - qx) * nx_ + (PY - qy) * ny_)
            upd = same & (dd < best - 1e-9)
            best = np.where(upd, dd, best); side = np.where(upd, sg, side)
        side[side == 0] = 1
        sd8[r0:r1] = np.clip(np.round(side * np.sqrt(best) / UNIT), -127, 127).astype(np.int8)
    del dist, ii, jj, ID
    # beach flag per segment: OSM beach / sand within 15 m of its midpoint
    bi = (B[::2, ::2][:H_, :W_] & BIT['beach']) > 0
    bb = nd.maximum_filter(bi.astype(np.uint8), size=15) > 0
    mx, my = (S[:, 0] + S[:, 2]) / 2, (S[:, 1] + S[:, 3]) / 2
    ci = np.clip(((mx - X0) / R).astype(int), 0, W_ - 1); ri = np.clip(((my - Y0) / R).astype(int), 0, H_ - 1)
    fl = bb[ri, ci].astype(np.uint8)
    # where quay_wall QW_SINK may put the terrain under the sea: seaward of the coastline, within 30 m of it or where the
    # land cover sees water, mud, sand or bare ground (not the port's paved terminals OSM leaves seaward of its line),
    # inside the city limits (+40 m)
    sink = (sd8.astype(np.float32) * UNIT < -0.5)
    if G0 is not None:
        g2 = G0[::2, ::2][:H_, :W_]
        wet = np.isin(g2, [CI[n] for n in ('water', 'gravel', 'sand', 'wetsand', 'marsh', 'soil', 'drygrass')])
        # (+ OSM marinas and piers: Coal Harbour's floating docks are paved to the land cover, solid land to the engine's
        # mask; the render drew them as flat grey mud islands in the harbour)
        im = Image.new('L', (W_, H_), 0); dr = ImageDraw.Draw(im)
        for t, gs, typ in _ways(json.load(open(os.path.join(OSM, 'osm.json')))):
            if t.get('leisure') == 'marina' or t.get('man_made') == 'pier':
                for g in gs:
                    x, y = C.proj(np.array([p['lon'] for p in g]), np.array([p['lat'] for p in g]))
                    pts = list(zip(((x - X0) / R).tolist(), ((y - Y0) / R).tolist()))
                    if len(g) > 3 and g[0] == g[-1]: dr.polygon(pts, fill=1)
                    elif len(pts) >= 2: dr.line(pts, fill=1, width=3)
        mar = np.asarray(im, np.uint8) > 0; del im, dr
        sink &= (sd8.astype(np.float32) * UNIT > -30.0) | wet | mar; del g2, wet, mar
        if os.environ.get('SHORE_FLOATS', '1') == '1': sink |= float_fields(sink, sd8, X0, Y0, R, G0)[0]      # (VT3 06/10)
    lim = (C.CFG.get('block') or {}).get('limits')
    if lim and os.path.exists(lim):
        gj = json.load(open(lim))['geometry']; polys = gj['coordinates'] if gj['type'] == 'MultiPolygon' else [gj['coordinates']]
        im = Image.new('L', (W_, H_), 0); dr = ImageDraw.Draw(im)
        for poly in polys:
            x, y = C.proj(np.array([p[0] for p in poly[0]]), np.array([p[1] for p in poly[0]]))
            dr.polygon(list(zip(((x - X0) / R).tolist(), ((y - Y0) / R).tolist())), fill=1)
        inl = nd.binary_dilation(np.asarray(im, np.uint8) > 0, iterations=20); sink &= inl; del im, dr
    print('shore: sink cells', int(sink.sum()), f'({int(sink.sum()) * R * R / 1e6:.2f} km2)')
    np.savez_compressed(os.path.join(OUTD, 'shore_pnw.npz'), sd2=sd8, unit=UNIT, sink=sink.astype(np.uint8), x0=X0, y0=Y0, res=R, seg=S.astype(np.float32), beach=fl,
                        beach_grid=bb.astype(np.uint8), source='OSM natural=coastline (ODbL, 05/10), land left; beach = ground_city rule 5 beaches within 15 m')
    print('shore: segments', len(S), 'beach segments', int(fl.sum()), 'grid', sd8.shape)
    return sd8, R, sink


def build():
    from scipy import ndimage as nd
    t0 = time.time(); M = _meta()
    G0 = np.load(os.path.join(GRD, 'ground_cls.npy'))
    B = masks(M); print('masks', f'{time.time() - t0:.0f}s', flush=True)
    sd8, R, sink2 = shore(M, B, G0); print('shore', f'{time.time() - t0:.0f}s', flush=True)
    G, left = nn_fill(G0, G0 == 0); print('none filled', int((G0 == 0).sum()), 'left', left, f'{time.time() - t0:.0f}s', flush=True)
    ny, nx = G.shape; ci = (np.arange(nx) / R).astype(int).clip(0, sd8.shape[1] - 1)
    # rule 2b: a block OSM has no landuse for counts as residential where it LOOKS like one on the land cover: some
    # vegetation within 30 m (tree, lawn, scrub, grass >= AUTO_VEG of the 60 m window) and buildings (LCC Buildings /
    # Shadow) under half of it (not a tower core); on a 4 m grid
    G4 = G0[::4, ::4]
    v4 = nd.uniform_filter(np.isin(G4, [CI['lawn'], CI['tree'], CI['scrub'], CI['drygrass']]).astype(np.float32), 15)
    b4 = nd.uniform_filter((G4 == 0).astype(np.float32), 15)
    auto4 = (v4 >= AUTO_VEG) & (b4 < 0.5); del v4, b4, G4
    ci4 = (np.arange(nx) // 4).clip(0, auto4.shape[1] - 1)
    for r0 in range(0, ny, 2048):         # row blocks (the whole map at once is several GB of masks)
        r1 = min(ny, r0 + 2048); g = G[r0:r1]; b = B[r0:r1]; g0 = G0[r0:r1]
        auto = auto4[(np.arange(r0, r1) // 4).clip(0, auto4.shape[0] - 1)][:, ci4]
        soft = (((b & (BIT['res'] | BIT['green'])) > 0) | auto) & ((b & BIT['grey']) == 0)
        road = (b & BIT['paved']) > 0; side = (b & BIT['side']) > 0
        bch = (b & BIT['beach']) > 0; bch3 = nd.binary_dilation(bch, iterations=3)
        g[(g == 0) & soft] = CI['lawn']
        # rule 4: soil only on construction land or in patches >= 300 m2 (patches measured within the block)
        so = g == CI['soil']; lab, nl = nd.label(so); sz = nd.sum(so, lab, np.arange(1, nl + 1))
        big = np.zeros(nl + 1, bool); big[1:] = sz >= 300
        keep_soil = big[lab] | ((b & BIT['soilok']) > 0); del lab
        # rule 2: the yards, boulevards, verges
        conv = soft & ~road & ~side & np.isin(g, [CI['asphalt'], CI['gravel'], CI['drygrass'], CI['concrete']])
        conv |= soft & ~road & so & ~keep_soil
        g[conv] = CI['lawn']
        g[(g == CI['soil']) & ~keep_soil & ~soft] = CI['gravel']
        # rule 3: sidewalks
        g[soft & side & ~road] = CI['concrete']
        # rule 5: sand on the beaches only
        g[(g == CI['sand']) & ~bch3] = CI['gravel']
        g[bch & np.isin(g, [CI['asphalt'], CI['gravel'], CI['concrete'], CI['lawn'], CI['drygrass'], CI['none'], CI['wetsand'], CI['scrub']])] = CI['sand']
        # rule 6: the shore line, the promenade
        s_ = sd8[(np.arange(r0, r1) / R).astype(int).clip(0, sd8.shape[0] - 1)][:, ci].astype(np.float32) * UNIT
        g[(s_ >= 0) & (s_ < 3.0) & ~bch3 & (g != CI['water'])] = CI['concrete']
        k_ = sink2[(np.arange(r0, r1) / R).astype(int).clip(0, sink2.shape[0] - 1)][:, ci]
        g[(s_ < -1.0) & k_ & ~bch & (g != CI['sand'])] = CI['water']
        g[((b & BIT['prom']) > 0) & ~bch & (g != CI['water'])] = CI['concrete']
        g[(g == 0)] = CI['asphalt']
        print(f'rows {r0}-{r1}', f'{time.time() - t0:.0f}s', flush=True)
    if os.environ.get('GROUND_POST', '1') == '1':     # (VT2 06/10) rules 8, 9, 4b
        BB = masks2(M); print('post', dict(post_rules(G, G0, B, BB, auto4)), flush=True); del BB
    if os.environ.get('GROUND_WOODS', '1') == '1':    # (VT3 06/10) rule 10
        print('woods', woods_rule(G, B), flush=True)
    np.save(os.path.join(OUTD, 'ground_pnw.npy'), G)
    share = {CLS[k]: round(float(v) / G.size * 100, 2) for k, v in zip(*np.unique(G, return_counts=True))}
    share0 = {CLS[k]: round(float(v) / G0.size * 100, 2) for k, v in zip(*np.unique(G0, return_counts=True))}
    M2 = dict(M, built=time.strftime('%Y-%m-%d %H:%M'), script='ground_city.py build', share_pct=share, share_pct_before=share0,
              changed_share=round(float((G != G0).mean()), 4),
              rules='see ground_city.py docstring (V-VEG 05/10)', source=M.get('source', '') + '; OpenStreetMap (ODbL) 05/10')
    json.dump(M2, open(os.path.join(OUTD, 'ground_pnw.json'), 'w'), indent=1)
    print('before', share0); print('after ', share); print('changed', M2['changed_share'], f'{time.time() - t0:.0f}s')



# ---- (VT2 06/10) rules 8, 9, 4b on the built map: `ground_city.py post` (idempotent; build() runs it too) ----
# vt1 (06/10) showed: the CPR / Waterfront / False Creek Flats yards as a pale beige plain (their LCC cells are Paved / Other
# built = asphalt / concrete, drawn as a lot), which the AI painted as an invented park; arterials and downtown streets as
# full right-of-way asphalt (commercial land is not 'soft', so rule 2 never gave their sidewalks back: secondary lanes=4
# median 34.8 m of asphalt across); bare 'soil' patches >= 300 m2 in parks.
#   8  RAIL: OSM railway=rail (any service: main, yard, siding, spur, crossover; not in a tunnel / building passage /
#      covered, not on a bridge) buffered to BALLAST_W are gravel (= ballast; ground_hq GROUND_PNW shades gravel as
#      ballast); inside OSM landuse=railway, asphalt / concrete / soil / grass / sand cells off the street right of way and
#      off parking are gravel too (the yard between the tracks)
#   9  RIGHT OF WAY: the scene's street mesh (STREETS_FROM layers, the City's whole right of way) rasterised; inside it and
#      off the carriageway (OSM centreline buffered to its width: the OSM width tag, else lanes x LANE_W + 1 m gutters, never
#      under the class width of ROAD_W for a two-way street; service ways and cycle tracks as rule 2), the cells are the
#      boulevard: in residential / park areas lawn (OSM sidewalks concrete), elsewhere concrete (the commercial sidewalk);
#      inside the carriageway a cell rule 2 made lawn where the land cover saw Paved is asphalt again
#   4b soil in a park (OSM green land) is lawn unless on a pitch (the ball diamonds' real infields) or construction land
RAIL_OSM = C.work('transit', 'rail_osm.json')   # Overpass 06/10 (ODbL), cities/vancouver/transit/rail_q.txt
BALLAST_W = 4.4
LANE_W = 3.3
B2 = {'row': 1, 'car': 2, 'track': 4, 'yard': 8, 'pitch': 16, 'parking': 32}


def carriageway_w(t):
    """kerb-to-kerb width (m) of an OSM highway way, None = not a road"""
    h = t.get('highway')
    if h == 'service': return SERVICE_W.get(t.get('service'), 4.5)
    w0 = ROAD_W.get(h)
    if w0 is None: return None
    try: wt = float(str(t.get('width', '')).replace('m', '').split(';')[0])
    except ValueError: wt = 0.0
    if 3.0 <= wt <= 40.0: return wt
    try: n = int(str(t.get('lanes', '')).split(';')[0])
    except ValueError: n = 0
    if n <= 0: return w0
    w = n * LANE_W + 1.0
    return w if t.get('oneway') in ('yes', '-1', 'true') else max(w, w0)


def row_mask(M):
    """the street mesh's right of way on the class grid (bool), cached packed in veg/row_pnw.npz"""
    ny, nx = M['shape']; cache = os.path.join(OUTD, 'row_pnw.npz')
    if os.path.exists(cache):
        z = np.load(cache); return np.unpackbits(z['m'], count=ny * nx).reshape(ny, nx).astype(bool)
    import base64
    from PIL import Image, ImageDraw
    lays = [l for l in os.environ.get('STREETS_FROM', 'street-uncovered').split(',') if l] + ['streets']
    d = json.load(open(C.work('city', 'scene.json'))); im = Image.new('L', (nx, ny), 0); dr = ImageDraw.Draw(im); nt = 0
    for m in d['meshes']:
        if m.get('layer') not in lays or m.get('instanced'): continue
        T = np.frombuffer(base64.b64decode(m['pos']), np.float32).reshape(-1, 3, 3)[:, :, :2].astype(np.float64)
        T[:, :, 0] -= M['x0']; T[:, :, 1] -= M['y0']
        for t in T.tolist(): dr.polygon([tuple(p) for p in t], fill=1)
        nt += len(T)
    del d
    a = np.asarray(im, np.uint8) > 0; del im, dr
    np.savez_compressed(cache, m=np.packbits(a.ravel()), shape=np.array([ny, nx]), layers=','.join(lays), tris=nt)
    print('row mask: triangles', nt, 'cells', int(a.sum()), flush=True)
    return a


def masks2(M):
    """B2 bit field: right of way, carriageway (lanes widths), rail tracks, rail yards, pitches, parking"""
    cv = Canvas(M); B = np.zeros((cv.ny, cv.nx), np.uint8); n = collections.Counter()
    B[row_mask(M)] |= B2['row']
    hw = json.load(open(C.work('critic', 'osm', 'highways.json'))); osm = json.load(open(os.path.join(OSM, 'osm.json')))
    rl = json.load(open(RAIL_OSM)) if os.path.exists(RAIL_OSM) else {'elements': []}
    jobs = collections.defaultdict(list)
    for e in hw['elements']:
        t = e.get('tags', {}); g = e.get('geometry')
        if not g or e['type'] != 'way' or t.get('tunnel') == 'yes' or t.get('bridge') == 'yes': continue
        w = carriageway_w(t)
        if w is not None: jobs['car'].append(('l', g, w))
        elif t.get('highway') == 'cycleway': jobs['car'].append(('l', g, 2.5))
    for t, gs, typ in _ways(rl):
        if t.get('railway') == 'rail' and t.get('tunnel') in (None, 'no') and t.get('bridge') in (None, 'no') and t.get('covered') in (None, 'no'):
            jobs['track'] += [('l', g, BALLAST_W) for g in gs]
        if t.get('landuse') == 'railway' and (typ == 'relation' or all(len(g) > 2 and g[0] == g[-1] for g in gs)):
            jobs['yard'] += [('a', g, 0) for g in gs]
    for t, gs, typ in _ways(osm):
        closed = typ == 'relation' or all(len(g) > 2 and g[0] == g[-1] for g in gs)
        if closed and t.get('leisure') == 'pitch': jobs['pitch'] += [('a', g, 0) for g in gs]
        if closed and t.get('amenity') == 'parking': jobs['parking'] += [('a', g, 0) for g in gs]
    for key, js in jobs.items():
        im, dr = cv.new()
        for kind, g, w in js:
            p = cv.pts(g)
            if kind == 'a' and len(p) >= 3: dr.polygon(p, fill=1); n[key] += 1
            elif kind == 'l' and len(p) >= 2: dr.line(p, fill=1, width=max(1, int(round(w)))); n[key] += 1
        a = np.asarray(im, dtype=np.uint8); B |= (a * B2[key]).astype(np.uint8); del a, im, dr
    print('osm drawn (post)', dict(n), flush=True)
    return B


def post_rules(G, G0, B, BB, auto4=None):
    """rules 8, 9, 4b on G in place (row blocks); returns a Counter of changed cells per rule"""
    ny, nx = G.shape; ch = collections.Counter(); ci4 = None
    if auto4 is not None: ci4 = (np.arange(nx) // 4).clip(0, auto4.shape[1] - 1)
    for r0 in range(0, ny, 2048):
        r1 = min(ny, r0 + 2048); g = G[r0:r1]; b = B[r0:r1]; bb = BB[r0:r1]; g0 = G0[r0:r1]
        auto = auto4[(np.arange(r0, r1) // 4).clip(0, auto4.shape[0] - 1)][:, ci4] if auto4 is not None else False
        soft = (((b & (BIT['res'] | BIT['green'])) > 0) | auto) & ((b & BIT['grey']) == 0)
        row = (bb & B2['row']) > 0; car = (bb & B2['car']) > 0; side = (b & BIT['side']) > 0
        trk = (bb & B2['track']) > 0; yard = (bb & B2['yard']) > 0; park_ = (bb & B2['parking']) > 0
        water = g == CI['water']
        # rule 9: the right of way
        off = row & ~car & ~trk
        m_ = off & soft & ~side & np.isin(g, [CI['asphalt'], CI['gravel'], CI['drygrass'], CI['tree'], CI['none'], CI['soil'], CI['sand']])
        g[m_] = CI['lawn']; ch['9 row boulevard lawn'] += int(m_.sum())
        m_ = off & soft & side & (g != CI['concrete']) & ~water; g[m_] = CI['concrete']; ch['9 row sidewalk (soft)'] += int(m_.sum())
        m_ = off & ~soft & np.isin(g, [CI['asphalt'], CI['gravel'], CI['drygrass'], CI['tree'], CI['none'], CI['soil'], CI['sand']])
        g[m_] = CI['concrete']; ch['9 row sidewalk'] += int(m_.sum())
        m_ = row & car & (g == CI['lawn']) & (g0 == CI['asphalt']); g[m_] = CI['asphalt']; ch['9 carriageway asphalt again'] += int(m_.sum())
        # rule 8: rail
        m_ = trk & ~water & (g != CI['gravel']); g[m_] = CI['gravel']; ch['8 track ballast'] += int(m_.sum())
        m_ = yard & ~row & ~park_ & np.isin(g, [CI['asphalt'], CI['concrete'], CI['soil'], CI['drygrass'], CI['sand'], CI['none']])
        g[m_] = CI['gravel']; ch['8 yard ballast'] += int(m_.sum())
        # rule 4b: no bare soil in a park but on a pitch or construction land
        m_ = (g == CI['soil']) & ((b & BIT['green']) > 0) & ((bb & B2['pitch']) == 0) & ((b & BIT['soilok']) == 0)
        g[m_] = CI['lawn']; ch['4b park soil lawn'] += int(m_.sum())
    return ch


def _auto4(G0):
    from scipy import ndimage as nd
    G4 = np.asarray(G0[::4, ::4])
    v4 = nd.uniform_filter(np.isin(G4, [CI['lawn'], CI['tree'], CI['scrub'], CI['drygrass']]).astype(np.float32), 15)
    b4 = nd.uniform_filter((G4 == 0).astype(np.float32), 15)
    return (v4 >= AUTO_VEG) & (b4 < 0.5)


def post():
    """rules 8, 9, 4b on the existing veg/ground_pnw.npy (the old map kept as ground_pnw.npy.pre_post on first run)"""
    t0 = time.time(); M = _meta(); P = os.path.join(OUTD, 'ground_pnw.npy'); J = os.path.join(OUTD, 'ground_pnw.json')
    G0 = np.load(os.path.join(GRD, 'ground_cls.npy'), mmap_mode='r')
    G = np.load(P); before = np.bincount(G.ravel(), minlength=len(CLS))
    B = masks(M); print('masks', f'{time.time() - t0:.0f}s', flush=True)
    BB = masks2(M); print('masks2', f'{time.time() - t0:.0f}s', flush=True)
    ch = post_rules(G, G0, B, BB, _auto4(G0)); del B, BB
    after = np.bincount(G.ravel(), minlength=len(CLS))
    keep = os.environ.get('POST_KEEP', '')
    if keep and not os.path.exists(keep): os.replace(P, keep); print('old map ->', keep)
    np.save(P + '.tmp.npy', G); os.replace(P + '.tmp.npy', P)
    J_ = json.load(open(J)); J_['post'] = dict(script='ground_city.py post (VT2 06/10)', at=time.strftime('%Y-%m-%d %H:%M'), changed=dict(ch),
                                             rules='8 rail ballast, 9 right of way boulevards / sidewalks (lanes widths), 4b park soil',
                                             source='OSM railway / landuse=railway (Overpass 06/10, ODbL); scene street mesh (City right of way)')
    J_['share_pct'] = {CLS[k]: round(float(v) / G.size * 100, 2) for k, v in enumerate(after) if v}
    json.dump(J_, open(J, 'w'), indent=1)
    print('changed', dict(ch)); print('share before', {CLS[k]: round(float(v) / G.size * 100, 2) for k, v in enumerate(before) if v})
    print('share after ', J_['share_pct'], f'{time.time() - t0:.0f}s')


# (VT3 06/10) THE FLOAT FIELDS: a marina's floats and its moored boats, packed, are 'Paved' to LCC 2020 at 5 m, land to the
# engine's sea mask and a 1-2 m plateau to the 2016 DTM; seaward of the OSM coastline but more than 30 m out and not LCC
# water, so the sink rule kept them, and the render drew False Creek Fishermen's Wharf (crop 15_13) as a floating grey
# slab of raw terrain, cut by the float lines that WERE sunk (3,424 m2 above the sea sheet). A piece of that kept seaward
# land (its pieces merged across a 2 m sunk line) up to FLOAT_MAX m2, touching an OSM floating pier or marina within 6 m,
# with buildings (LCC Buildings / Shadow) on less than 30 % and an OSM fixed pier / breakwater on less than 15 % of it,
# goes under the sea too. Port terminals (no floats,
# tens of ha) and Canada Place (buildings) stay.
FLOAT_MAX = float(os.environ.get('FLOAT_MAX', '20000'))

def float_fields(sink, sd8, X0, Y0, R, G0=None):
    """(cells to add to the sink grid, [(m2, x, y)] of the pieces) on shore_pnw's grid"""
    from scipy import ndimage as nd
    from PIL import Image, ImageDraw
    H_, W_ = sink.shape
    keep = (sd8.astype(np.float32) * UNIT < -0.5) & ~sink
    im = Image.new('L', (W_, H_), 0); dr = ImageDraw.Draw(im)
    for t, gs, typ in _ways(json.load(open(os.path.join(OSM, 'osm.json')))):
        if t.get('leisure') == 'marina' or (t.get('man_made') == 'pier' and t.get('floating') == 'yes'):
            for g in gs:
                x, y = C.proj(np.array([p['lon'] for p in g]), np.array([p['lat'] for p in g]))
                pts = list(zip(((x - X0) / R).tolist(), ((y - Y0) / R).tolist()))
                if len(g) > 3 and g[0] == g[-1] and t.get('leisure') == 'marina': dr.polygon(pts, fill=1)
                elif len(pts) >= 2: dr.line(pts, fill=1, width=3)
    flt = nd.binary_dilation(np.asarray(im, np.uint8) > 0, iterations=3); del im, dr
    im = Image.new('L', (W_, H_), 0); dr = ImageDraw.Draw(im)        # the fixed piers and breakwaters (real decks: kept)
    for t, gs, typ in _ways(json.load(open(os.path.join(OSM, 'osm.json')))):
        if t.get('man_made') in ('pier', 'breakwater', 'groyne') and t.get('floating') != 'yes':
            for g in gs:
                x, y = C.proj(np.array([p['lon'] for p in g]), np.array([p['lat'] for p in g]))
                pts = list(zip(((x - X0) / R).tolist(), ((y - Y0) / R).tolist()))
                if len(g) > 3 and g[0] == g[-1]: dr.polygon(pts, fill=1)
                elif len(pts) >= 2: dr.line(pts, fill=1, width=4)
    fix = np.asarray(im, np.uint8) > 0; del im, dr
    lab, n = nd.label(nd.binary_dilation(keep, iterations=1))
    add = np.zeros_like(sink); pieces = []
    for i, sl in enumerate(nd.find_objects(lab), 1):
        m = (lab[sl] == i) & keep[sl]; a = float(m.sum()) * R * R
        if a == 0 or a > FLOAT_MAX or not (flt[sl] & m).any() or float(fix[sl][m].mean()) >= 0.15: continue
        if G0 is not None:
            r_ = np.arange(sl[0].start, sl[0].stop) * int(round(R)); c_ = np.arange(sl[1].start, sl[1].stop) * int(round(R))
            ok_r = r_ < G0.shape[0]; ok_c = c_ < G0.shape[1]
            g_ = np.asarray(G0[r_[ok_r]][:, c_[ok_c]]); mm = m[np.ix_(ok_r, ok_c)]
            if mm.any() and float((g_[mm] == CI['none']).mean()) >= 0.3: continue
        add[sl] |= m; jj, ii = np.nonzero(m)
        pieces.append((int(a), round(X0 + (ii.mean() + sl[1].start + 0.5) * R), round(Y0 + (jj.mean() + sl[0].start + 0.5) * R)))
    return add, pieces


def floats():
    """the float-field rule on the existing veg/shore_pnw.npz (idempotent): its sink grid gains the float fields"""
    P = os.path.join(OUTD, 'shore_pnw.npz'); S = dict(np.load(P))
    G0 = np.load(os.path.join(GRD, 'ground_cls.npy'), mmap_mode='r')
    sink = S['sink'].astype(bool); X0, Y0, R = float(S['x0']), float(S['y0']), float(S['res'])
    add, pieces = float_fields(sink, S['sd2'], X0, Y0, R, G0)
    new = add & ~sink
    S['sink'] = (sink | add).astype(S['sink'].dtype)
    np.savez_compressed(P + '.tmp.npz', **S); os.replace(P + '.tmp.npz', P)
    print('float fields:', len(pieces), 'pieces,', int(new.sum()), 'cells added', f'({int(new.sum()) * R * R:.0f} m2)'); print(sorted(pieces, key=lambda p: -p[0]))
    # and their ground class water (rule 6 on the build's sink grid), on the 1 m class map
    GP = os.path.join(OUTD, 'ground_pnw.npy'); G = np.load(GP); k = int(round(R))
    wet = np.repeat(np.repeat(new & (S['sd2'].astype(np.float32) * UNIT < -1.0), k, 0), k, 1)[:G.shape[0], :G.shape[1]]
    wet = wet & ~np.isin(G[:wet.shape[0], :wet.shape[1]], [CI['water'], CI['sand']])
    G[:wet.shape[0], :wet.shape[1]][wet] = CI['water']; np.save(GP + '.tmp.npy', G); os.replace(GP + '.tmp.npy', GP)
    print('ground_pnw cells -> water', int(wet.sum()))


WOODS_ZONES = tuple(z for z in os.environ.get('WOODS_ZONES', 'stanley,forest,garden').split(',') if z)
LCC_UNDER = (6, 7, 13, 15, 16)       # LCC 2020: Conifer, Deciduous, Shadow, Conifer/Paved, Deciduous/Paved
LCC_OPEN_UNDER = (2, 3, 5, 8)        # LCC 2020: Paved, Other built, Soil, Shrub (10b)

def woods_rule(G, B):
    """rule 10 on G in place: {cells changed by class}; B = masks(M) (roads, paths, parking, sidewalks, promenade, beaches)"""
    from scipy import ndimage as nd
    import veg_city as VC, rasterio
    M = _meta(); x0, y0 = M['x0'], M['y0']
    D = np.load(os.path.join(OUTD, 'veg_pnw.npz')); Z, (zx0, zy1, zr) = D['zone'], D['zone_origin']
    names = [z['name'] for z in json.load(open(os.path.join(OUTD, 'veg_zones_pnw.json')))['zones']]
    W4 = np.isin(Z, [i for i, n in enumerate(names) if n in WOODS_ZONES])
    with rasterio.open(VC.LCC) as s_: lwkt = s_.crs.to_wkt()
    src = [CI[n] for n in ('lawn', 'asphalt', 'gravel', 'drygrass', 'soil')]
    keep = BIT['paved'] | BIT['side'] | BIT['prom'] | BIT['beach']
    lab, nl = nd.label(nd.binary_dilation(W4, iterations=2)); ch = collections.Counter()
    for sl in nd.find_objects(lab):
        # the component's box on the 1 m class grid (zone row 0 = north at zy1; class row 0 = south at y0)
        X0, X1 = zx0 + sl[1].start * zr, zx0 + sl[1].stop * zr; Ytop, Ybot = zy1 - sl[0].start * zr, zy1 - sl[0].stop * zr
        c0, c1 = max(0, int(X0 - x0)), min(G.shape[1], int(math.ceil(X1 - x0))); r0, r1 = max(0, int(Ybot - y0)), min(G.shape[0], int(math.ceil(Ytop - y0)))
        if c0 >= c1 or r0 >= r1: continue
        g = G[r0:r1, c0:c1]; b = B[r0:r1, c0:c1]
        xs = x0 + np.arange(c0, c1) + 0.5; ys = y0 + np.arange(r0, r1) + 0.5
        zc = ((xs - zx0) / zr).astype(int).clip(0, Z.shape[1] - 1); zrow = ((zy1 - ys) / zr).astype(int).clip(0, Z.shape[0] - 1)
        inw = W4[zrow][:, zc]
        cand = inw & np.isin(g, src) & ((b & keep) == 0)
        if not cand.any(): continue
        ii, jj = np.nonzero(cand)
        U, V = VC._to(lwkt, xs[jj], ys[ii])
        L = np.nan_to_num(VC._sample([(VC.LCC, (-1e12, -1e12, 1e12, 1e12))], np.asarray(U), np.asarray(V)), nan=0).astype(np.uint8)
        hit = np.isin(L, LCC_UNDER)
        for k in src: ch[CLS[k]] += int((hit & (g[ii, jj] == k)).sum())
        # 10b: a 'lawn' rule 2 made of the woods' open Paved / Other built / Soil / Shrub cells (a trail or clearing OSM has
        # no way for, 8 ha in Stanley Park) is the understorey (scrub), not a mown lawn; LCC's own grass stays lawn
        und = (g[ii, jj] == CI['lawn']) & np.isin(L, LCC_OPEN_UNDER)
        ch['lawn -> scrub'] += int(und.sum())
        g[ii[hit], jj[hit]] = CI['tree']; g[ii[und], jj[und]] = CI['scrub']
    return dict(ch)


def woods():
    """rule 10 on the existing veg/ground_pnw.npy (idempotent; WOODS_KEEP=path keeps the old map there on first run)"""
    t0 = time.time(); M = _meta(); P = os.path.join(OUTD, 'ground_pnw.npy'); J = os.path.join(OUTD, 'ground_pnw.json')
    G = np.load(P); before = np.bincount(G.ravel(), minlength=len(CLS))
    B = masks(M); print('masks', f'{time.time() - t0:.0f}s', flush=True)
    ch = woods_rule(G, B); del B
    after = np.bincount(G.ravel(), minlength=len(CLS))
    keep = os.environ.get('WOODS_KEEP', '')
    if keep and not os.path.exists(keep): os.replace(P, keep); print('old map ->', keep)
    np.save(P + '.tmp.npy', G); os.replace(P + '.tmp.npy', P)
    J_ = json.load(open(J)); J_['woods'] = dict(script='ground_city.py woods (VT3 06/10)', at=time.strftime('%Y-%m-%d %H:%M'), changed=ch,
                                              zones=list(WOODS_ZONES), lcc_under=list(LCC_UNDER),
                                              rule='10: in the closed woods, LCC canopy/shadow cells rules 1-2 made lawn/asphalt/gravel/drygrass/soil, off OSM roads/paths/parking/sidewalks/promenade/beaches -> tree; 10b: lawn there on LCC Paved/Other built/Soil/Shrub -> scrub')
    J_['share_pct'] = {CLS[k]: round(float(v) / G.size * 100, 2) for k, v in enumerate(after) if v}
    json.dump(J_, open(J, 'w'), indent=1)
    print('changed', ch, f'{time.time() - t0:.0f}s')


BOXES = {'stanley': (-123.1440, 49.3020), 'kits': (-123.1640, 49.2680), 'mtpleasant': (-123.1000, 49.2600),
         'westend': (-123.1360, 49.2860), 'kits_point': (-123.1470, 49.2760)}

def stats():
    M = _meta(); G0 = np.load(os.path.join(GRD, 'ground_cls.npy'), mmap_mode='r'); G = np.load(os.path.join(OUTD, 'ground_pnw.npy'), mmap_mode='r')
    for nm, (lo, la) in BOXES.items():
        x, y = C.proj(lo, la); i, j = int(x - M['x0']), int(y - M['y0'])
        out = []
        for A in (G0, G):
            a = np.asarray(A[j - 300:j + 300, i - 300:i + 300]); u, c = np.unique(a, return_counts=True)
            out.append({CLS[k]: round(v / a.size * 100, 1) for k, v in zip(u, c) if v / a.size >= 0.002})
        print(nm, 'before', out[0]); print(nm, 'after ', out[1])


if __name__ == '__main__':
    {'build': build, 'stats': stats, 'post': post, 'woods': woods, 'floats': floats}[sys.argv[1]]()
