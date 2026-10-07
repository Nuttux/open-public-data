"""VEG-EXTEND (Vancouver only, 07/10): the ground classes and the veg zone grid over the WHOLE render grid
(city.json dem.extent), so the surroundings (North Shore mountains, Richmond/Delta, the far columns) get
forest, fields and towns instead of the terrain's bare tan grass.

    CITY=vancouver python3 veg_extend.py zones     # -> $VEGEXT_OUT/veg_pnw.npz, veg_zones_pnw.json
    CITY=vancouver python3 veg_extend.py ground    # -> $VEGEXT_OUT/ground_pnw.npy, ground_pnw.json
    CITY=vancouver python3 veg_extend.py report 14_3 14_27 2_15   # class / zone shares per crop, old vs new

Source outside the city's data: Metro Vancouver Land Cover Classification 2020 (5 m, Open Government Licence -
Metro Vancouver), which covers the whole extent (sampled at 100 m: no nodata), mapped exactly as
ground_landcover.py (+ its sand rule). Inside the old extents the city's own files are copied cell for cell:
ground_pnw (LCC + OSM + ground_city rules) and the 4 m zone grid (veg_city.py). Outside the old zone grid a cell
is zone 'wild' (closed woodland: LCC conifer+deciduous >= WILD_FRAC over a WILD_WIN cell window), else 'town'
(the urban mix; both gapfilled, as the LiDAR crowns stop short of them);
the wild mix = the forest zone's species split at the conifer share measured on LCC over the new wild cells.
LidarBC 2025 crowns stop at y ~ 9 km, so beyond them veg_hq's VEG_GAPFILL plants the stand on its own (see
VEG_GAPFILL_H there). Files go to $VEGEXT_OUT (the SSD); installing them in veg/ is a separate, logged step."""
import json, os, sys, time
import numpy as np
import rasterio
from pyproj import Transformer
from scipy.ndimage import distance_transform_edt, uniform_filter
import cityconf as C

assert C.CITY == 'vancouver', 'veg_extend.py is Vancouver only'
SRC = C.work('ground', 'src', 'LCC2020', 'LCC2020.tif')
VEG = C.work('veg'); BASE = os.environ.get('VEGEXT_BASE', VEG); OUT = os.environ.get('VEGEXT_OUT', '/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/vegext')
EXT = json.load(open(C.work('city.json')))['dem']['extent']          # [x0, y0, x1, y1] engine metres
SAND_M, WILD_WIN, WILD_FRAC = 60.0, 25, 0.3                            # 25 cells of 4 m = 100 m
CLS = ['none', 'sand', 'lawn', 'drygrass', 'scrub', 'tree', 'soil', 'asphalt', 'concrete', 'gravel', 'marsh', 'water', 'wetsand', 'turf']
CI = {n: k for k, n in enumerate(CLS)}
MAP = {1: 'none', 2: 'asphalt', 3: 'concrete', 4: 'gravel', 5: 'soil', 6: 'tree', 7: 'tree', 8: 'scrub', 9: 'lawn',
       10: 'drygrass', 11: 'drygrass', 12: 'water', 13: 'none', 14: 'none', 15: 'asphalt', 16: 'asphalt'}   # = ground_landcover.MAP
LUT = np.zeros(256, np.uint8)
for k_, v_ in MAP.items(): LUT[k_] = CI[v_]
T0 = time.time()


def log(*a):
    print(f'[{time.time() - T0:5.0f}s]', *a, flush=True)


class LCC:
    """the source window under the extent, read once; sample(X, Y) -> raw class, mapped(X, Y) -> ground class"""
    def __init__(self):
        ds = rasterio.open(SRC); self.tr = Transformer.from_crs('EPSG:4326', ds.crs, always_xy=True)
        x0, y0, x1, y1 = EXT
        lo, la = C.unproj(np.array([x0, x1, x0, x1], float), np.array([y0, y0, y1, y1], float))
        U, V = self.tr.transform(lo, la)
        win = rasterio.windows.from_bounds(min(U) - 100, min(V) - 100, max(U) + 100, max(V) + 100, ds.transform).round_offsets().round_lengths()
        self.A = ds.read(1, window=win, boundless=True, fill_value=0); self.WT = ds.window_transform(win)
        near = distance_transform_edt(self.A != 12) * abs(self.WT.a) <= SAND_M
        self.A2 = LUT[self.A]; self.A2[(self.A == 4) & near] = CI['sand']; del near
        log('LCC window', self.A.shape)

    def _rc(self, X, Y):
        lon, lat = C.unproj(X, Y); u, v = self.tr.transform(lon, lat)
        c = np.floor((u - self.WT.c) / self.WT.a).astype(np.int64); r = np.floor((v - self.WT.f) / self.WT.e).astype(np.int64)
        ok = (c >= 0) & (c < self.A.shape[1]) & (r >= 0) & (r < self.A.shape[0])
        return r, c, ok

    def sample(self, X, Y, mapped=False):
        r, c, ok = self._rc(X, Y); src = self.A2 if mapped else self.A
        out = np.zeros(X.shape, np.uint8); out[ok] = src[r[ok], c[ok]]
        return out


def zones():
    os.makedirs(OUT, exist_ok=True)
    D = dict(np.load(os.path.join(BASE, 'veg_pnw.npz'))); J = json.load(open(os.path.join(BASE, 'veg_zones_pnw.json')))
    assert 'wild' not in [z['name'] for z in J['zones']], 'already extended'
    Z0 = D['zone']; ox0, oy1, res = (float(v) for v in D['zone_origin'])
    # the new grid on the old one's lattice: whole cells, the old grid pasted cell for cell
    kc = int(np.ceil((ox0 - EXT[0]) / res)); kr = int(np.ceil((EXT[3] - oy1) / res))
    zx0, zy1 = ox0 - kc * res, oy1 + kr * res
    nc = int(np.ceil((EXT[2] - zx0) / res)); nr = int(np.ceil((zy1 - EXT[1]) / res))
    L = LCC(); R = np.zeros((nr, nc), np.uint8)
    xs = zx0 + (np.arange(nc) + 0.5) * res
    for r0 in range(0, nr, 500):
        ys = zy1 - (np.arange(r0, min(nr, r0 + 500)) + 0.5) * res
        X, Y = np.meshgrid(xs, ys); R[r0:r0 + len(ys)] = L.sample(X, Y)
    log('zone grid sampled', R.shape)
    tree = (R == 6) | (R == 7)
    frac = uniform_filter(tree.astype(np.float32), WILD_WIN, mode='nearest')
    wi = len(J['zones']); ti = wi + 1; Z = np.full((nr, nc), ti, np.uint8); Z[frac >= WILD_FRAC] = wi
    inside = np.zeros((nr, nc), bool); inside[kr:kr + Z0.shape[0], kc:kc + Z0.shape[1]] = True
    Z[inside] = Z0.ravel()
    sel = (Z == wi) & ~inside & tree
    con = float((R[sel] == 6).mean()) if sel.any() else 0.0
    fm = next(z for z in J['zones'] if z['name'] == 'forest')['mix']
    conifers = ('v_dfir', 'v_cedar', 'v_hemlock', 'pine')
    cw = {a: w for a, w in fm.items() if a in conifers}; bw = {a: w for a, w in fm.items() if a not in conifers}
    mix = {a: round(con * w / sum(cw.values()), 4) for a, w in cw.items()}
    mix.update({a: round((1 - con) * w / sum(bw.values()), 4) for a, w in bw.items()})
    J['zones'].append(dict(name='wild', mix=mix, stand=35))
    uz = next(z for z in J['zones'] if z['name'] == 'urban'); J['zones'].append(dict(uz, name='town'))   # the towns and fields: the city's urban mix
    m = J.setdefault('meta', {})
    m.setdefault('zone_measures', {})['wild'] = dict(conifer_share=round(con, 3), tree_cells=int(sel.sum()), cells=int(((Z == wi) & ~inside).sum()))
    m['zone_measures']['town'] = dict(tree_cells=int(((Z == ti) & tree).sum()), cells=int((Z == ti).sum()))
    m['extend'] = dict(date=time.strftime('%Y-%m-%d %H:%M'), script='veg_extend.py zones',
                       note=f'zone grid extended to city.json dem.extent {EXT}; the old grid {list(Z0.shape)} at {[ox0, oy1, res]} copied cell for cell '
                            f'at row {kr}, col {kc}; outside it: wild where LCC 2020 conifer+deciduous >= {WILD_FRAC} over {WILD_WIN * res:g} m, else town (the urban mix, gapfilled)',
                       source='Metro Vancouver Land Cover Classification 2020 (Open Government Licence - Metro Vancouver)')
    D['zone'] = Z; D['zone_origin'] = np.array([zx0, zy1, res])
    np.savez_compressed(os.path.join(OUT, 'veg_pnw.npz'), **D)
    json.dump(J, open(os.path.join(OUT, 'veg_zones_pnw.json'), 'w'), indent=1)
    log('zones', Z.shape, 'origin', (zx0, zy1, res), 'wild cells outside', int(((Z == wi) & ~inside).sum()),
        'town cells', int((Z == ti).sum()), 'conifer share', round(con, 3), 'mix', mix)


def ground():
    os.makedirs(OUT, exist_ok=True)
    M0 = json.load(open(os.path.join(BASE, 'ground_pnw.json'))); G0 = np.load(os.path.join(BASE, 'ground_pnw.npy'), mmap_mode='r')
    assert M0['res'] == 1.0 and M0['classes'] == CLS and not M0.get('extend'), 'unexpected ground_pnw'
    x0, y0, x1, y1 = (float(v) for v in EXT); nx, ny = int(x1 - x0), int(y1 - y0)
    ox, oy = int(M0['x0'] - x0), int(M0['y0'] - y0); assert ox == M0['x0'] - x0 and oy == M0['y0'] - y0
    L = LCC()
    G = np.lib.format.open_memmap(os.path.join(OUT, 'ground_pnw.npy'), 'w+', np.uint8, (ny, nx))
    xs = x0 + np.arange(nx) + 0.5
    for j0 in range(0, ny, 250):
        ys = y0 + np.arange(j0, min(ny, j0 + 250)) + 0.5
        X, Y = np.meshgrid(xs, ys); G[j0:j0 + len(ys)] = L.sample(X, Y, mapped=True)
        if j0 % 5000 == 0: log('ground rows', j0, '/', ny)
    for j0 in range(0, G0.shape[0], 2000):
        G[oy + j0:oy + min(G0.shape[0], j0 + 2000), ox:ox + G0.shape[1]] = G0[j0:j0 + 2000]
    G.flush()
    S = np.asarray(G[::7, ::7])
    M = dict(M0); M.update(x0=x0, y0=y0, shape=[ny, nx])
    M['share_pct'] = {CLS[k]: round(100 * float((S == k).mean()), 2) for k in range(1, len(CLS)) if (S == k).any()}
    M['extend'] = dict(date=time.strftime('%Y-%m-%d %H:%M'), script='veg_extend.py ground',
                       inside=f"the old map (x0 {M0['x0']}, y0 {M0['y0']}, shape {M0['shape']}) copied cell for cell",
                       outside='Metro Vancouver Land Cover Classification 2020, 5 m (Open Government Licence - Metro Vancouver), '
                               f'mapping as above, Barren within {SAND_M:g} m of Water = sand; nearest class at 1 m',
                       old_share_pct=M0.get('share_pct'))
    json.dump(M, open(os.path.join(OUT, 'ground_pnw.json'), 'w'), indent=1)
    log('ground', (ny, nx), M['share_pct'])


def crop_box(name):
    """engine-metre box of an L9 crop i_j"""
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'city_run')); import citycfg as CC
    i, j = map(int, name.split('_'))
    X = np.array([i * CC.CW, (i + 1) * CC.CW], float); Y = np.array([j * CC.CH, (j + 1) * CC.CH], float)
    X9, Y9 = np.meshgrid(X, Y); lon, lat = CC.lonlat_of_l9(X9, Y9); x, y = C.proj(lon, lat)
    return float(np.min(x)), float(np.min(y)), float(np.max(x)), float(np.max(y))


def report(names):
    for nm in names:
        b = crop_box(nm); out = {'box': [round(v) for v in b]}
        for tag, d in (('old', VEG), ('new', OUT)):
            M = json.load(open(os.path.join(d, 'ground_pnw.json'))); G = np.load(os.path.join(d, 'ground_pnw.npy'), mmap_mode='r')
            xs = np.arange(b[0], b[2], 4.0); ys = np.arange(b[1], b[3], 4.0); X, Y = np.meshgrid(xs, ys)
            gi, gj = (Y - M['y0']).astype(int), (X - M['x0']).astype(int)
            ok = (gi >= 0) & (gi < G.shape[0]) & (gj >= 0) & (gj < G.shape[1])
            v = np.full(X.shape, 255, np.uint8); v[ok] = np.asarray(G)[gi[ok], gj[ok]]
            sh = {('no data' if k == 255 else CLS[k]): round(100 * float((v == k).mean()), 1) for k in np.unique(v)}
            D = np.load(os.path.join(d, 'veg_pnw.npz')); J = json.load(open(os.path.join(d, 'veg_zones_pnw.json')))
            zx0, zy1, zr = D['zone_origin']; Z = D['zone']
            r, c = ((zy1 - Y) / zr).astype(int), ((X - zx0) / zr).astype(int)
            zok = (r >= 0) & (r < Z.shape[0]) & (c >= 0) & (c < Z.shape[1]); zi = np.zeros(X.shape, int); zi[zok] = Z[r[zok], c[zok]]
            zs = {J['zones'][k]['name']: round(100 * float((zi == k).mean()), 1) for k in np.unique(zi)}
            out[tag] = dict(ground=dict(sorted(sh.items(), key=lambda t: -t[1])), zones=zs)
        print(nm, json.dumps(out), flush=True)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'zones': zones()
    elif cmd == 'ground': ground()
    elif cmd == 'report': report(sys.argv[2:])
