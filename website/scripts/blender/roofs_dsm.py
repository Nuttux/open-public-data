"""A building's ROOF FORM from a 1 m LiDAR DSM − DEM pair (no point cloud):

    CITY=vancouver python3 roofs_dsm.py <dsm dir> <dem dir> <out.json> [--box x0,y0,x1,y1] [--tiles k0:k1]
    CITY=vancouver python3 roofs_dsm.py --merge <out.json> <part.json> ...

Writes gen_buildings' LIDAR_ROOFS file (SF's roofs_lidar_city.json contract, made
there by qipu-render-work/lidar/roofs_lidar.py from the USGS point cloud):
    {gid: [form, ridge_az_deg, pitch_deg, eave_m, ridge_m, n, conf]}
    form      'flat' | 'gable' | 'hip'
    ridge_az  the ridge's direction, engine frame, degrees from +x, mod 180 (0 for flat)
    pitch     the median slope of the pitched pixels, degrees (0 for flat)
    eave_m, ridge_m  the 10th / 95th percentile of the DSM over the footprint, above its ground (DEM median)
    n         pixels read; conf: the share of level (flat) or pitched (gable/hip) pixels
plus '_meta' (sources, method, licence) and '_unknown' {gid: reason} for the footprints it
refuses to call (gen_buildings reads only gid keys: those keep the generator's convention).

Method, per footprint (city_data records with the city's env: NEWB, HEIGHTS, TOWERS): the
footprint drawn INSET m in, over the DSM of its map tile (+ MARGIN m of the neighbours).
The DSM's slope and downslope aspect per pixel (central differences, 1 m); a pixel whose
3x3 has a step (edge, parapet, ridge line, a tree) is dropped (|z − mean of 8| ≥ 0.45 m).
FLAT OR PITCHED, and the PITCH: SF's rule (roofs_lidar.classify, there on a 0.8 m grid of
first returns): flat if ≥ 45 % of the kept pixels are level (< 9°) or < 45 % pitched
(14-62°); the pitch is the median slope of the pitched pixels.
GABLE OR HIP, and the RIDGE: at 1 m a house's facets are 3-5 px wide and the pixel-aspect
share SF uses to call a hip agrees with a model fit on only ~60 % of houses (25/09 validation),
so the pitched DSM is fitted with three models on the footprint's minimum rotated
rectangle, z = eave + k·d(p) (robust least squares, the ridge let slide ±1 m): a gable along
the long side, a gable across it, a hip (d = distance to the nearest eave). A hip must beat
the better gable's median |residual| by HIP_R (0.85); the ridge is the winning model's axis
(the long side for a hip). One plane fitting better than all three (x0.8) is a shed.
LOW PITCH: a roof the slope rule calls flat with < 60 % level pixels is pitched when the best
model fits it 2x better than a level plane (LOW_R 0.5) at >= 8° (its pitch then: the fit's).
conf: flat → the level share; pitched → the pitched share (SF's field 6).
Refused ('_unknown'): < 20 pixels; the DSM void over > 35 % of it (LidarBC empties some
tall tops); the land cover (tree) or LiDAR crowns (veg/canopy_trees.npz) over > 30 % of it,
 counted only where the DSM is rough too (the April 2025 survey sees roofs
through bare deciduous crowns the 2020 land cover calls tree); < 10 kept pixels; a shed
(SF's format has none: listed in _unknown as 'shed'). _unknown and '_meta' are not gids.
Tower records (src 'tower', TOWERS=1) and the podiums below them are written flat, unfitted."""
import glob, json, math, os, re, sys, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import cityconf as C

INSET, MARGIN = float(os.environ.get('INSET', 0.5)), float(os.environ.get('MARGIN', 40))
VOID_MAX, TREE_MAX, LAP = 0.35, 0.30, 0.45
T0 = time.time()

def records():
    for k, v in C.CFG.get('env', {}).items(): os.environ.setdefault(k, str(v))
    import city_data
    return city_data.buildings(-1e6, -1e6, 1e6, 1e6)

def key(p):
    b = os.path.basename(p); m = re.match(r'bc_(\d{3}[a-z]\d{3}(?:_\d)+)_', b)
    return m.group(1) if m else re.sub(r'_(dsm|dem)\.tif$', '', b)

def classify(z, g, sl, asp, ok, void, tree):
    """z the DSM over the footprint's pixels (nan: void), g its ground, sl/asp slope and
    aspect per pixel, ok the kept pixels; → a record or ('unknown', reason)"""
    n = len(z)
    if n < 20: return 'small'
    if void > VOID_MAX: return 'void'
    if tree > TREE_MAX: return 'tree'
    if ok.sum() < 10: return 'rough'
    s, a = sl[ok], asp[ok]
    zt = float(np.nanpercentile(z, 95)) - g; ze = float(np.nanpercentile(z, 10)) - g
    flat_f = float(np.mean(s < 9)); pit = (s >= 14) & (s <= 62); pit_f = float(np.mean(pit))
    if pit_f < 0.45 or flat_f > 0.45:
        return ['flat', 0.0, 0.0, round(zt, 2), round(zt, 2), int(ok.sum()), round(flat_f, 2)], 0.0
    ap = a[pit]
    if pit_f >= 0.6 and math.hypot(np.mean(np.cos(ap)), np.mean(np.sin(ap))) > 0.75: return 'shed'
    cx, cy = np.mean(np.cos(2 * ap)), np.mean(np.sin(2 * ap)); axis = 0.5 * math.atan2(cy, cx)
    d_ = np.abs(((ap - axis + math.pi / 2) % math.pi) - math.pi / 2)
    across = float(np.mean(d_ > math.radians(55)))
    form = 'hip' if across > 0.22 else 'gable'
    return [form, round((math.degrees(axis) + 90.0) % 180, 1), round(float(np.median(s[pit])), 1),
            round(ze, 2), round(zt, 2), int(ok.sum()), round(pit_f, 2)], across

def _fit(A, z):
    keep = np.ones(len(z), bool)
    for _ in range(3):
        if keep.sum() < 8: return None
        sol, *_ = np.linalg.lstsq(A[keep], z[keep], rcond=None)
        r = z - A @ sol; s = max(0.2, 2.5 * np.sqrt(np.mean(r[keep] ** 2))); keep = np.abs(r) < s
    return sol, float(np.median(np.abs(z - A @ sol)))

def fitform(u, v, z, rect):
    """the footprint's oriented rectangle (cx, cy, theta of the long side, half long, half short);
    z = eave + k * d(p), d the distance to the eave line of a gable along the long side
    ('gable_l'), across it ('gable_s'), or to the nearest eave (a hip, equal pitches), the ridge
    let slide +-1 m (footprints and survey ten years apart); flat: z = c.
    -> {model: (median |residual| m, k, offset)}"""
    cx, cy, th, hl, hw = rect
    a = (u - cx) * math.cos(th) + (v - cy) * math.sin(th); b = -(u - cx) * math.sin(th) + (v - cy) * math.cos(th)
    one = np.ones_like(z); out = {'flat': (float(np.median(np.abs(z - np.median(z)))), 0.0, 0.0)}
    f = _fit(np.stack([one, a, b], 1), z)                        # one plane, any direction: a shed
    if f: out['plane'] = (f[1], float(math.hypot(f[0][1], f[0][2])), 0.0)
    offs = (-1.0, -0.5, 0.0, 0.5, 1.0)
    for m in ('gable_l', 'gable_s', 'hip'):
        best = None
        for o1 in offs:
            for o2 in (offs if m == 'hip' else (0.0,)):
                if m == 'gable_l': d = hw - np.abs(b - o1)
                elif m == 'gable_s': d = hl - np.abs(a - o1)
                else: d = np.minimum(hw - np.abs(b - o1), hl - np.abs(a - o2))
                f = _fit(np.stack([one, d], 1), z)
                if f and f[0][1] > 0 and (best is None or f[1] < best[0]): best = (f[1], float(f[0][1]), (o1, o2))
        if best: out[m] = best
    return out

HIP_R = 0.85
LOW_FLAT, LOW_R, LOW_DEG = 0.6, 0.5, 8.0
def decide(F, th):
    """the form from fitform's residuals: pitched when its best model halves the flat
    residual (x PITCH_R) at >= 10 deg; a hip when it beats the better gable by HIP_R;
    a shed when one plane fits better than either -> (form, ridge_az in the raster frame, pitch)"""
    P = [m for m in ('gable_l', 'gable_s', 'hip') if m in F]
    t10 = math.tan(math.radians(10))
    if not P: return ('keep', 0.0, 0.0)
    pm = min(P, key=lambda m: F[m][0])
    if 'plane' in F and F['plane'][1] > t10 and F['plane'][0] < 0.8 * F[pm][0]: return ('shed', 0.0, 0.0)
    G = [m for m in ('gable_l', 'gable_s') if m in F]
    m = 'hip' if ('hip' in F and (not G or F['hip'][0] < HIP_R * min(F[g][0] for g in G))) else min(G, key=lambda g: F[g][0])
    az = th + (math.pi / 2 if m == 'gable_s' else 0.0)
    return ('hip' if m == 'hip' else 'gable', az, math.degrees(math.atan(F[m][1])))

def run(dsm_dir, dem_dir, box=None, trange=None):
    import rasterio
    from rasterio.merge import merge
    from rasterio.features import rasterize
    from rasterio.transform import rowcol
    from pyproj import Transformer
    from shapely.geometry import Polygon
    recs = records(); print('records', len(recs), f'{time.time() - T0:.0f}s', flush=True)
    if box: recs = [b for b in recs if box[0] <= b['cx'] <= box[2] and box[1] <= b['cy'] <= box[3]]
    R, U, X = {}, {}, {}
    fit = []
    for b in recs:
        if b.get('src') == 'tower' or b.get('h_src') == 'podium':
            R[str(b['gid'])] = ['flat', 0.0, 0.0, round(b['h'], 2), round(b['h'], 2), 0, 1.0]
        elif len(b['ring']) >= 3: fit.append(b)
    dsm = {key(p): p for p in glob.glob(os.path.join(dsm_dir, '*.tif'))}
    dem = {key(p): p for p in glob.glob(os.path.join(dem_dir, '*.tif'))}
    pairs = sorted(set(dsm) & set(dem))
    if trange: pairs = pairs[trange[0]:trange[1]]
    src0 = rasterio.open(dsm[pairs[0]]); crs = src0.crs
    tr = Transformer.from_crs('EPSG:4326', crs, always_xy=True); bk = Transformer.from_crs(crs, 'EPSG:4326', always_xy=True)
    TB = {k: rasterio.open(dsm[k]).bounds for k in pairs}
    ALLB = {key(p): rasterio.open(p).bounds for p in dsm.values()}
    # the footprints in the raster CRS, each to the tile holding its centroid
    polys = {}
    for b in fit:
        a = np.asarray(b['ring'], np.float64); lon, lat = C.unproj(a[:, 0], a[:, 1]); u, v = tr.transform(lon, lat)
        p = Polygon(np.column_stack([u, v]))
        if not p.is_valid: p = p.buffer(0)
        if p.is_empty: continue
        q = p.buffer(-INSET); mr = np.asarray(p.minimum_rotated_rectangle.exterior.coords)[:4]
        e1, e2 = mr[1] - mr[0], mr[2] - mr[1]; l1, l2 = np.hypot(*e1), np.hypot(*e2)
        th = math.atan2(*(e1 if l1 >= l2 else e2)[::-1]); cc = mr.mean(0)
        polys[b['gid']] = (q if (not q.is_empty and q.area > 4) else p, p.centroid.x, p.centroid.y, (cc[0], cc[1], th, max(l1, l2) / 2, min(l1, l2) / 2))
    # the land cover (engine grid, 1 m, row 0 south) and the LiDAR crowns
    gm = json.load(open(C.work('ground', 'ground_meta.json'))); GC = np.load(C.work('ground', 'ground_cls.npy'), mmap_mode='r')
    TREE = gm['classes'].index('tree')
    ct = np.load(C.work('veg', 'canopy_trees.npz')); CX, CY, CR = ct['x'], ct['y'], ct['crown']
    for k in pairs:
        bd = TB[k]; mine = [g for g, (q, x, y, _r) in polys.items() if bd.left <= x < bd.right and bd.bottom <= y < bd.top]
        if not mine: continue
        wb = (bd.left - MARGIN, bd.bottom - MARGIN, bd.right + MARGIN, bd.top + MARGIN)
        near = [q for q, e in ALLB.items() if e.left < wb[2] and e.right > wb[0] and e.bottom < wb[3] and e.top > wb[1]]
        S, T = merge([dsm[q] for q in near], bounds=wb, res=1.0, nodata=-32767)
        Dm = [dem[q] for q in near if q in dem]
        E, _ = merge(Dm, bounds=wb, res=1.0, nodata=-32767)
        S = S[0].astype(np.float64); E = E[0].astype(np.float64)
        S[S < -1000] = np.nan; E[E < -1000] = np.nan
        H, W = S.shape
        # the window's pixel centres in the engine frame: the grid's tilt and the land cover
        cols = np.arange(W) + 0.5; rows = np.arange(H) + 0.5
        uu = T.c + cols * T.a; vv = T.f + rows * T.e
        lon, lat = bk.transform(np.array([uu[0], uu[-1], uu[0]]), np.array([vv[-1], vv[-1], vv[0]]))
        ex, ey = C.proj(np.asarray(lon), np.asarray(lat))
        # the raster's +u (east) and +v (north: rows up) in the engine frame
        rot = math.atan2(ey[1] - ey[0], ex[1] - ex[0])
        # slope / aspect in the raster frame (v up)
        Z = S[::-1]                                                  # row 0 = south now
        gy, gx = np.gradient(Z, 1.0)
        nb = np.stack([np.roll(np.roll(Z, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx])
        with np.errstate(invalid='ignore'):
            lap = np.abs(Z - np.nanmean(nb, 0))
        del nb
        okm = ~np.isnan(gx) & ~np.isnan(gy) & (np.nan_to_num(lap, nan=9) < LAP)
        slope = np.degrees(np.arctan(np.hypot(np.nan_to_num(gx), np.nan_to_num(gy))))
        aspect = np.arctan2(-gy, -gx) + rot                           # downslope, engine frame
        Z_E = E[::-1]
        # the footprints burnt in (south-up grid): an index per pixel
        Tn = rasterio.transform.from_origin(wb[0], wb[3], 1.0, 1.0)
        lab = rasterize(((polys[g][0], i + 1) for i, g in enumerate(mine)), out_shape=(H, W), transform=T, fill=0, dtype='int32')[::-1]
        # engine coords of the south-up grid, coarsely (the tilt is < 0.2°: bilinear on the corners)
        ll = np.array(bk.transform(np.array([wb[0], wb[2], wb[0]]), np.array([wb[1], wb[1], wb[3]])))
        e0 = np.array(C.proj(ll[0], ll[1]))                           # (2, 3): SW, SE, NW
        fi, fj = np.nonzero(lab)
        px = e0[0, 0] + (fj + 0.5) / W * (e0[0, 1] - e0[0, 0]) + (fi + 0.5) / H * (e0[0, 2] - e0[0, 0])
        py = e0[1, 0] + (fj + 0.5) / W * (e0[1, 1] - e0[1, 0]) + (fi + 0.5) / H * (e0[1, 2] - e0[1, 0])
        gi = ((py - gm['y0']) / gm['res']).astype(int); gj = ((px - gm['x0']) / gm['res']).astype(int)
        inside = (gi >= 0) & (gi < GC.shape[0]) & (gj >= 0) & (gj < GC.shape[1])
        tr_px = np.zeros(len(fi), bool); tr_px[inside] = GC[gi[inside], gj[inside]] == TREE
        # the crowns over the window, as discs on the pixels
        cw = (CX > px.min() - 15) & (CX < px.max() + 15) & (CY > py.min() - 15) & (CY < py.max() + 15) if len(px) else np.zeros(len(CX), bool)
        crown = np.zeros(len(fi), bool)
        if cw.any():
            from scipy.spatial import cKDTree
            kd = cKDTree(np.column_stack([px, py]))
            for x_, y_, r_ in zip(CX[cw], CY[cw], CR[cw]):
                for j in kd.query_ball_point((x_, y_), max(0.5, float(r_))): crown[j] = True
        L_ = lab[fi, fj]; order = np.argsort(L_, kind='stable'); L_s = L_[order]
        cuts = np.searchsorted(L_s, np.arange(1, len(mine) + 2))
        nk0 = len(R)
        for i, g in enumerate(mine):
            sel = order[cuts[i]:cuts[i + 1]]
            if len(sel) == 0: U[str(g)] = 'small'; continue
            a_, b_ = fi[sel], fj[sel]
            z = Z[a_, b_]; e = Z_E[a_, b_]
            void = float(np.mean(np.isnan(z))); rough_ = ~okm[a_, b_]
            tree = float(np.mean((tr_px[sel] | crown[sel]) & rough_))      # a tree where the DSM is rough too (the April survey sees roofs through bare crowns)
            g0 = float(np.nanmedian(e)) if np.any(~np.isnan(e)) else float('nan')
            if np.isnan(g0): U[str(g)] = 'void'; continue
            r = classify(z, g0, slope[a_, b_], aspect[a_, b_], okm[a_, b_] & ~np.isnan(z), void, tree)
            X[str(g)] = [round(r[1], 3) if not isinstance(r, str) else None, round(void, 2), round(float(np.mean(tr_px[sel])), 2), round(float(np.mean(crown[sel])), 2), len(sel), round(float(np.mean(okm[a_, b_])), 2), round(float(np.mean(tr_px[sel] & ~okm[a_, b_])), 2)]
            vz = ~np.isnan(z)
            if vz.sum() >= 20:
                F = fitform(T.c + b_[vz] + 0.5, T.f - (H - 1 - a_[vz]) - 0.5, z[vz], polys[g][3])
                X[str(g)].append({m: [round(w[0], 3), round(w[1], 3)] for m, w in F.items()})
                X[str(g)].append(round(math.degrees(polys[g][3][2] + rot) % 180, 1))
                X[str(g)].append(r[0][:3] if not isinstance(r, str) else r)      # the aspect rule's call, for comparison
                if not isinstance(r, str) and r[0][0] == 'flat' and r[0][6] < LOW_FLAT:
                    # a low pitch (the 1960s-80s houses' 3-4:12) reads mostly under SF's 14°: pitched
                    # when a roof model fits it LOW_R x better than a level one, at >= LOW_DEG
                    P_ = [m for m in ('gable_l', 'gable_s', 'hip') if m in F]
                    if P_:
                        pm_ = min(P_, key=lambda m: F[m][0])
                        if F[pm_][0] < LOW_R * F['flat'][0] and F[pm_][1] > math.tan(math.radians(LOW_DEG)):
                            f_, az_, pt_ = decide(F, polys[g][3][2])
                            if f_ in ('gable', 'hip'): r = ([f_, round(math.degrees(az_ + rot) % 180, 1), round(pt_, 1), r[0][3], r[0][4], r[0][5], round(1 - r[0][6], 2)], 0)
                elif not isinstance(r, str) and r[0][0] != 'flat':
                    # flat / pitched: the aspect rule (SF's); gable or hip and the ridge's axis: the fits
                    f_, az_, pt_ = decide(F, polys[g][3][2])
                    if f_ == 'shed': r = 'shed'
                    elif f_ != 'keep':
                        r = ([f_, round(math.degrees(az_ + rot) % 180, 1)] + r[0][2:], 0)
            elif not isinstance(r, str): r = 'small'
            if isinstance(r, str): U[str(g)] = r
            else: R[str(g)] = r[0]
        print(f'tile {k}: {len(mine)} footprints, {len(R) - nk0} classified, {time.time() - T0:.0f}s', flush=True)
    return R, U, X

META = dict(
    what='roof forms per footprint (gen_buildings LIDAR_ROOFS): {gid: [form, ridge_az_deg (engine frame, from +x, mod 180), pitch_deg, eave_m, ridge_m, n_px, conf]}',
    method='roofs_dsm.py: 1 m DSM over each footprint (inset 0.5 m): flat vs pitched and the pitch by the slope rules of SF roofs_lidar.classify (step pixels dropped); gable vs hip and the ridge axis by robust fits of gable-long / gable-across / hip models on the footprint rectangle (hip must beat the best gable residual x0.85); towers (TOWERS=1) and their podiums flat by convention (unfitted)', caveat='hip vs gable at 1 m is the weakest call: stable to 85 % under a 0.5 m inset change, but it agrees only ~60 % with the pixel-aspect rule; flat/pitched 99 % and ridge axis ~90 % stable',
    refused='_unknown {gid: small | void | tree | rough | shed}: the render keeps its convention there',
    sources=['LidarBC 2025 DSM + DEM 1 m (Open Government Licence - British Columbia)',
             'Metro Vancouver Land Cover Classification 2020 (Open Government Licence - Metro Vancouver), tree check',
             'veg/canopy_trees.npz LiDAR crowns, tree check',
             'City of Vancouver building footprints 2015 (Open Government Licence - Vancouver) + OpenStreetMap buildings (ODbL)'],
    licence='derived from OGL-BC LiDAR; footprints OGL-Vancouver / ODbL')

if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == '--merge':
        out, parts = a[1], a[2:]; R, U = {}, {}
        for p in parts:
            d = json.load(open(p)); U.update(d.pop('_unknown', {})); d.pop('_meta', None); d.pop('_across', None); R.update(d)
        for g in R: U.pop(g, None)
        import collections
        cnt = collections.Counter(v[0] for v in R.values()); cu = collections.Counter(U.values())
        json.dump(dict(R, _meta=dict(META, built=time.strftime('%Y-%m-%d %H:%M'), counts=dict(cnt), unknown=dict(cu)), _unknown=U),
                  open(out, 'w'), separators=(',', ':'))
        print(len(R), dict(cnt), 'unknown', dict(cu)); sys.exit()
    box = trange = None
    if '--box' in a: i = a.index('--box'); box = [float(v) for v in a[i + 1].split(',')]; del a[i:i + 2]
    if '--tiles' in a: i = a.index('--tiles'); trange = [int(v) for v in a[i + 1].split(':')]; del a[i:i + 2]
    R, U, X = run(a[0], a[1], box, trange)
    import collections
    print(len(R), collections.Counter(v[0] for v in R.values()), 'unknown', collections.Counter(U.values()), flush=True)
    json.dump(dict(R, _unknown=U, _across=X), open(a[2], 'w'), separators=(',', ':'))
