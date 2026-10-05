"""ROOF COLOUR PER BUILDING FROM A CITY'S OWN ORTHOPHOTO (Vancouver: Metro Vancouver Ortho Imagery 2025, OGL-Metro Vancouver,
7.5 cm RGBA MrSID, 116 tiles of 1.5 km, EPSG:3157) -> a roofs.json in SF's schema, read by gen_buildings with
    ROOFS=1 ROOFS_FILE=<work>/assets/roofs/roofs_ortho2025.json ROOFS_CONF=0.5
(the same path SF's NAIP roofs take: measured_pitched / measured_flat, after VAN_COLOUR's per-type roof; a measured roof wins).

Plain Python (numpy, rasterio, pyproj, shapely; no Blender), < 4 GB: one tile decoded at a time, at 1/4 resolution (30 cm,
5000 x 5000 RGBA, ~100 MB), sampled, deleted.

  CITY=vancouver python3 van_roof_ortho.py index  <zip or dir of .sid/.sdw | GeoTIFFs>       # tile bounds -> index.json
  CITY=vancouver python3 van_roof_ortho.py decode [--level 2] [--tiles a,b]                  # .sid -> GeoTIFF (mrsiddecode or GDAL)
  CITY=vancouver python3 van_roof_ortho.py sample [--box x0,y0,x1,y1]                        # footprints x tiles -> samples.npz
  CITY=vancouver python3 van_roof_ortho.py finish                                            # calibration, classes -> roofs json
  CITY=vancouver python3 van_roof_ortho.py preview [--box ...]                               # check image: roofs in their colour
  CITY=vancouver python3 van_roof_ortho.py all <zip>                                         # the four in order (decode streams)

Decoders (not installed by this script): `mrsiddecode` (Extensis MrSID Decode SDK command line) or a GDAL build with the MrSID
driver (`gdal_translate`; `gdalinfo --formats | grep MrSID`). ORTHO_DECODER=mrsid|gdal forces one; MRSID_EXTRA adds args.
GeoTIFF inputs (any open ortho, e.g. the NAPL mosaics; the test) need no decoder.

Per footprint (engine ring -> lon/lat -> the ortho's CRS), inset 0.5 m: pixels with alpha 0 dropped; registration = the shift
(per tile, +-2.4 m) that puts the most image gradient on the footprints' outlines, plus a per-building search for tall
buildings (the ortho is not a true ortho: a tower's roof leans away from the camera, up to h x 0.12 m); vegetation (excess
green, hue) and shadow (L < 0.6 x the roof's median) dropped; the colour = per-channel median in linear light.
Calibration (as SF's NAIP: roofs_prep): DN -> linear, minus the 1 % dark (haze) d, scaled so the city's 99th-percentile roof
reads 0.75 albedo; per-tile gain toward the city's (clipped 0.85-1.15) for the 16-month, two-season flight.
Classes (SF's names, which gen_buildings knows): shingle (pitched), tile, white, metal, cap, gravel, tar, green, solar,
tree (mostly vegetation over a pitched roof: not used), shadow (too few lit pixels: not used)."""
import glob, json, math, os, re, shutil, subprocess, sys, tempfile, time, zipfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cityconf as C

OUT = os.environ.get('ORTHO_OUT') or C.work('assets', 'roofs')
WORK = os.environ.get('ORTHO_WORK', '/Volumes/QIPU-SSD/qipu-vancouver-ortho2025/work')
INSET, VEG_EXG, SHADOW = 0.5, 0.06, 0.6
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.0f}s]', *a, flush=True)
def s2l(a): a = np.asarray(a, np.float32) / 255.0; return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


# ── 1. index ──
def world(txt):
    a, d, b, e, c, f = [float(x) for x in txt.split()[:6]]
    return dict(a=a, b=b, c=c, d=d, e=e, f=f)          # x = a*col + b*row + c (pixel centre), y = d*col + e*row + f

def index(src):
    T = {}
    if zipfile.is_zipfile(src):
        z = zipfile.ZipFile(src); names = z.namelist()
        for n in names:
            if n.lower().endswith('.sid'):
                k = os.path.splitext(os.path.basename(n))[0]; w = n[:-4] + '.sdw'
                W = world(z.read(w).decode()) if w in names else None
                T[k] = dict(src=src, member=n, world=W, kind='sid')
    else:
        for p in sorted(glob.glob(os.path.join(src, '*.sid')) + glob.glob(os.path.join(src, '*.tif'))):
            k = os.path.splitext(os.path.basename(p))[0]; w = p[:-4] + '.sdw'
            T[k] = dict(src=p, member=None, world=world(open(w).read()) if os.path.exists(w) else None,
                        kind='sid' if p.lower().endswith('.sid') else 'tif')
    for k, t in T.items():
        if t['world']:      # Metro Van: 1.5 km tiles named by their lower-left corner, 0.075 m
            W = t['world']; m = re.match(r'(\d+)_(\d+)$', k); size = 1500.0 if m else None
            x0 = W['c'] - W['a'] / 2; y1 = W['f'] - W['e'] / 2
            t['bounds'] = [x0, y1 - size, x0 + size, y1] if size else None
        elif t['kind'] == 'tif':
            import rasterio
            with rasterio.open(t['src']) as s: t['bounds'] = list(s.bounds); t['crs'] = str(s.crs)
    os.makedirs(WORK, exist_ok=True)
    json.dump(dict(src=src, crs=os.environ.get('ORTHO_CRS', 'EPSG:3157'), tiles=T), open(f'{WORK}/index.json', 'w'), indent=0)
    log('index', len(T), 'tiles ->', f'{WORK}/index.json')


# ── 2. decode ──
def decoder():
    f = os.environ.get('ORTHO_DECODER')
    if f in (None, 'mrsid') and shutil.which('mrsiddecode'): return 'mrsid'
    if f in (None, 'gdal') and shutil.which('gdal_translate'):
        r = subprocess.run(['gdalinfo', '--formats'], capture_output=True, text=True)
        if 'MrSID' in r.stdout: return 'gdal'
    return None

def decode_one(k, t, level):
    out = f'{WORK}/dec/{k}_L{level}.tif'
    if os.path.exists(out): return out
    if t['kind'] == 'tif': return t['src']
    dec = decoder()
    if dec is None: raise SystemExit('no MrSID decoder: install mrsiddecode (Extensis MrSID Decode SDK) or a GDAL with the MrSID driver')
    os.makedirs(f'{WORK}/dec', exist_ok=True); tmp = tempfile.mkdtemp(dir=WORK)
    try:
        sid = t['src']
        if t['member']:
            z = zipfile.ZipFile(t['src']); sid = os.path.join(tmp, os.path.basename(t['member']))
            with z.open(t['member']) as a, open(sid, 'wb') as b: shutil.copyfileobj(a, b, 1 << 22)
        part = out + '.part.tif'
        if dec == 'mrsid':
            cmd = ['mrsiddecode', '-i', sid, '-o', part, '-of', 'tifg', '-s', str(level)] + os.environ.get('MRSID_EXTRA', '').split()
        else:
            pc = 100.0 / (2 ** level)
            cmd = ['gdal_translate', '-q', '-of', 'GTiff', '-outsize', f'{pc}%', f'{pc}%', '-r', 'average', '-co', 'COMPRESS=DEFLATE',
                   '-co', 'TILED=YES', sid, part]
        subprocess.run([c for c in cmd if c], check=True)
        _georef(part, t, level)
        os.replace(part, out)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return out

def _georef(p, t, level):
    """a decoded tile with no georeference (plain tif): the .sdw world file at the decoded scale"""
    import rasterio
    from rasterio.transform import Affine
    with rasterio.open(p, 'r+') as s:
        if s.crs is None and t['world']:
            W = t['world']; k = 2 ** level
            s.transform = Affine(W['a'] * k, W['b'] * k, W['c'] - W['a'] / 2, W['d'] * k, W['e'] * k, W['f'] - W['e'] / 2)
            s.crs = os.environ.get('ORTHO_CRS', 'EPSG:3157')


# ── 3. sample ──
def footprints(box=None):
    """{gid: (polygon in the ortho CRS, height, pitched?)} from the city's records (cached per box)"""
    import city_data
    from pyproj import Transformer
    from shapely.geometry import Polygon
    crs = json.load(open(f'{WORK}/index.json'))['crs']
    tr = Transformer.from_crs('EPSG:4326', crs, always_xy=True)
    R = city_data.buildings(*(box or (-1e6, -1e6, 1e6, 1e6)))
    lid = {}
    try:
        lid = json.load(open(C.work('lidar', 'roofs_lidar_city.json')))
    except Exception: pass
    F = {}
    for b in R:
        if len(b['ring']) < 3: continue
        a = np.asarray(b['ring'], np.float64); lon, lat = C.unproj(a[:, 0], a[:, 1]); u, v = tr.transform(lon, lat)
        p = Polygon(np.column_stack([u, v]))
        if not p.is_valid: p = p.buffer(0)
        if p.is_empty or p.area < 6: continue
        q = p.buffer(-INSET)
        L = lid.get(str(b['gid']))
        F[b['gid']] = (q if (not q.is_empty and q.area > 3) else p, float(b['h']), bool(L and L[0] in ('gable', 'hip')))
    log('footprints', len(F))
    return F

def _grad(rgb):
    g = rgb.mean(-1)
    gy, gx = np.gradient(g)
    return np.hypot(gx, gy)

def _register(G, outl, rng_px):
    """the (dy, dx) that puts the most gradient on the outlines"""
    best = (-1.0, 0, 0)
    ys, xs = np.nonzero(outl)
    if len(ys) < 50: return 0, 0
    H, W = G.shape
    for dy in range(-rng_px, rng_px + 1):
        for dx in range(-rng_px, rng_px + 1):
            yy, xx = ys + dy, xs + dx; ok = (yy >= 0) & (yy < H) & (xx >= 0) & (xx < W)
            s = float(G[yy[ok], xx[ok]].mean()) if ok.any() else 0.0
            if s > best[0]: best = (s, dy, dx)
    return best[1], best[2]

def sample(box=None, level=2):
    import rasterio
    from rasterio.features import rasterize
    from shapely.geometry import box as sbox
    I = json.load(open(f'{WORK}/index.json')); F = footprints(box)
    gids = np.array(sorted(F), np.int64); bnd = {g: F[g][0].bounds for g in gids}
    MAXPX = 300; acc = {}                 # gid -> list of (tile, linear rgb Nx3 sample, n_valid, n_veg, n_all)
    tiles_used = {}
    for k, t in sorted(I['tiles'].items()):
        tb = t.get('bounds')
        mine = [g for g in gids if tb is None or (bnd[g][0] < tb[2] and bnd[g][2] > tb[0] and bnd[g][1] < tb[3] and bnd[g][3] > tb[1])]
        if not mine: continue
        try: p = decode_one(k, t, level)
        except SystemExit as e: log(str(e)); return
        with rasterio.open(p) as s:
            T = s.transform
            if box is not None or tb is None:   # read only the window the footprints need
                xs = [bnd[g][0] for g in mine] + [bnd[g][2] for g in mine]; ys = [bnd[g][1] for g in mine] + [bnd[g][3] for g in mine]
                win = rasterio.windows.from_bounds(min(xs) - 10, min(ys) - 10, max(xs) + 10, max(ys) + 10, T).round_offsets().round_lengths()
                win = win.intersection(rasterio.windows.Window(0, 0, s.width, s.height))
            else: win = rasterio.windows.Window(0, 0, s.width, s.height)
            A = s.read(window=win); T = s.window_transform(win)
        if A.shape[0] == 1: A = np.repeat(A, 3, 0)                              # a greyscale test mosaic
        alpha = A[3] > 0 if A.shape[0] >= 4 else np.ones(A.shape[1:], bool)
        rgb = np.moveaxis(A[:3], 0, -1); H, W = alpha.shape; px = abs(T.a)
        sub = [g for g in mine if sbox(*bnd[g]).intersects(sbox(T.c, T.f + T.e * H, T.c + T.a * W, T.f))]
        if not sub: continue
        lab = rasterize(((F[g][0], i + 1) for i, g in enumerate(sub)), out_shape=(H, W), transform=T, fill=0, dtype='int32')
        outl = rasterize(((F[g][0].boundary, 1) for g in sub if F[g][1] < 15), out_shape=(H, W), transform=T, fill=0, dtype='uint8') > 0
        G = _grad(rgb.astype(np.float32))
        dy, dx = _register(G, outl, max(1, int(round(2.4 / px))))
        tiles_used[k] = dict(px=px, shift_px=[dy, dx], n=len(sub))
        lin = s2l(rgb)
        from scipy import ndimage as nd
        obj = nd.find_objects(lab)
        for i, g in enumerate(sub):
            sl = obj[i] if i < len(obj) else None
            if sl is None: continue
            m = lab[sl] == i + 1
            ddy, ddx = dy, dx
            if F[g][1] >= 15:     # a tall building's roof leans in the photo: its own shift, up to h x 0.12 m
                r_ = max(1, min(int(F[g][1] * 0.12 / px), 60))
                y0, x0 = max(0, sl[0].start - r_), max(0, sl[1].start - r_)
                Gw = G[y0:sl[0].stop + r_, x0:sl[1].stop + r_]
                ol = np.zeros(Gw.shape, bool); mm = np.pad(m, 1); edge = (mm[1:-1, 1:-1] & ~(mm[:-2, 1:-1] & mm[2:, 1:-1] & mm[1:-1, :-2] & mm[1:-1, 2:]))
                oy, ox = sl[0].start - y0, sl[1].start - x0; ol[oy:oy + m.shape[0], ox:ox + m.shape[1]] = edge
                ddy, ddx = _register(Gw, ol, r_)
            ys, xs = np.nonzero(m); ys = ys + sl[0].start + ddy; xs = xs + sl[1].start + ddx
            ok = (ys >= 0) & (ys < H) & (xs >= 0) & (xs < W)
            ys, xs = ys[ok], xs[ok]; ok = alpha[ys, xs]; ys, xs = ys[ok], xs[ok]
            if len(ys) < 4: continue
            c = lin[ys, xs]; d = rgb[ys, xs].astype(np.float32) / 255.0
            exg = 2 * d[:, 1] - d[:, 0] - d[:, 2]; veg = (exg > VEG_EXG) & (d[:, 1] > d[:, 2])
            keep = ~veg; Lc = c @ np.array([0.2126, 0.7152, 0.0722], np.float32)
            if keep.sum() >= 4:
                med = np.median(Lc[keep]); keep &= (Lc >= SHADOW * med) & (Lc <= np.percentile(Lc[keep], 97))
            cs = c[keep]
            if len(cs) > MAXPX: cs = cs[np.random.RandomState(g % 100003).choice(len(cs), MAXPX, replace=False)]
            acc.setdefault(int(g), []).append((k, cs.astype(np.float16), int(keep.sum()), int(veg.sum()), int(len(c))))
        log('tile', k, 'bldg', len(sub), 'shift px', (dy, dx), 'px', round(px, 3))
        if t['kind'] == 'sid' and os.environ.get('ORTHO_KEEP', '0') != '1' and p.startswith(f'{WORK}/dec/'): os.remove(p)
    # one row per building: per-tile medians kept for the per-tile gain in finish
    G_, M_, N_, V_, A_, K_ = [], [], [], [], [], []
    for g, L in acc.items():
        allc = np.concatenate([x[1] for x in L]).astype(np.float32)
        G_.append(g); M_.append(np.median(allc, 0) if len(allc) else np.zeros(3)); N_.append(sum(x[2] for x in L))
        V_.append(sum(x[3] for x in L)); A_.append(sum(x[4] for x in L)); K_.append(max(L, key=lambda x: x[4])[0])
    os.makedirs(OUT, exist_ok=True)
    np.savez_compressed(f'{WORK}/samples.npz', gid=np.array(G_), med=np.array(M_, np.float32), n=np.array(N_), veg=np.array(V_),
                        all=np.array(A_), tile=np.array(K_), pitched=np.array([F[g][2] for g in G_]), h=np.array([F[g][1] for g in G_]))
    json.dump(dict(tiles=tiles_used, level=level, box=box), open(f'{WORK}/sample_meta.json', 'w'), indent=0)
    log('sampled', len(G_), 'buildings ->', f'{WORK}/samples.npz')


# ── 4. finish ──
def classify(a, pitched, vegfrac, n):
    L = 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; mx, mn = max(a), min(a); sat = (mx - mn) / max(mx, 1e-4)
    if n < 8: return 'shadow'
    if vegfrac > 0.55: return 'tree' if pitched else 'green'
    if a[0] > 1.3 * a[1] and a[0] > 1.6 * a[2] and 0.05 < L < 0.35: return 'tile'
    if pitched: return 'shingle'
    if L < 0.07 and a[2] > a[0]: return 'solar'
    if L > 0.42 and sat < 0.25: return 'white'
    if L > 0.26 and sat < 0.12: return 'metal'
    if L > 0.12: return 'cap'
    if L > 0.075: return 'gravel'
    return 'tar'

def finish(name='roofs_ortho2025.json'):
    S = np.load(f'{WORK}/samples.npz'); med = S['med'].astype(np.float64); ok = S['n'] >= 8
    Lm = med @ np.array([0.2126, 0.7152, 0.0722])
    d = float(np.percentile(Lm[ok], 1)) * 0.9 if ok.any() else 0.0
    w = float(np.percentile(Lm[ok], 99)) if ok.any() else 1.0
    k = 0.75 / max(w - d, 1e-4)
    # per tile: its roofs' median toward the city's, clipped (two seasons, sixteen months of flights)
    city_med = float(np.median(Lm[ok])) if ok.any() else 1.0; tg = {}
    for t in np.unique(S['tile']):
        s_ = ok & (S['tile'] == t)
        tg[str(t)] = float(np.clip(city_med / max(float(np.median(Lm[s_])), 1e-4), 0.85, 1.15)) if s_.sum() >= 30 else 1.0
    R = {}; cnt = {}
    for i, g in enumerate(S['gid']):
        a = np.clip((med[i] * tg[str(S['tile'][i])] - d) * k, 0.005, 1.0)
        vf = S['veg'][i] / max(1, S['all'][i])
        cls = classify(a, bool(S['pitched'][i]), vf, int(S['n'][i]))
        conf = min(1.0, S['n'][i] / 40.0) * (1.0 - min(0.6, vf))
        R[str(int(g))] = [round(float(a[0]), 4), round(float(a[1]), 4), round(float(a[2]), 4), cls, round(float(conf), 2), 0,
                          1 if cls == 'tar' else 0]
        cnt[cls] = cnt.get(cls, 0) + 1
    meta = dict(source=f"{json.load(open(f'{WORK}/index.json'))['src']} (Metro Vancouver Ortho Imagery 2025, Open Government Licence - Metro Vancouver)",
                method='van_roof_ortho.py: footprint inset 0.5 m, registered (outline gradient), vegetation + shadow dropped, median linear',
                colour=f'linear albedo = (DN_lin x tile_gain - d) x k, d={d:.4f} (1% dark x 0.9), 99% roof -> 0.75 (k={k:.3f}); tile gain clipped 0.85-1.15',
                classes=cnt, n=len(R), render='ROOFS=1 ROOFS_FILE=<this> ROOFS_CONF=0.5 (gen_buildings measured_pitched / measured_flat)')
    os.makedirs(OUT, exist_ok=True)
    json.dump(dict(meta=meta, roofs=R), open(os.path.join(OUT, name), 'w'))
    log('roofs', len(R), cnt, '->', os.path.join(OUT, name))


# ── 5. preview ──
def preview(box, name='roofs_ortho2025.json', out=None, scale=1.0):
    """the footprints painted in their measured roof colour (display), engine frame, north up"""
    from PIL import Image, ImageDraw
    import city_data
    R = json.load(open(os.path.join(OUT, name)))['roofs']
    x0, y0, x1, y1 = box; W, H = int((x1 - x0) * scale), int((y1 - y0) * scale)
    im = Image.new('RGB', (W, H), (40, 40, 40)); d = ImageDraw.Draw(im)
    for b in city_data.buildings(x0, y0, x1, y1):
        m = R.get(str(b['gid']))
        col = (255, 0, 255) if not m else tuple(int(255 * max(0.0, min(1.0, v)) ** (1 / 2.2)) for v in m[:3])
        d.polygon([((x - x0) * scale, (y1 - y) * scale) for x, y in b['ring']], fill=col)
    out = out or os.path.join(OUT, 'preview.png'); im.save(out); log('preview', out)


if __name__ == '__main__':
    a = sys.argv[1:]
    opt = lambda k, dflt=None: (a[a.index(k) + 1] if k in a else dflt)
    box = [float(v) for v in opt('--box').split(',')] if opt('--box') else None
    lvl = int(opt('--level', 2))
    if a[0] == 'index': index(a[1])
    elif a[0] == 'decode':
        I = json.load(open(f'{WORK}/index.json')); want = opt('--tiles')
        for k, t in sorted(I['tiles'].items()):
            if want and k not in want.split(','): continue
            log('decoded', decode_one(k, t, lvl))
    elif a[0] == 'sample': sample(box, lvl)
    elif a[0] == 'finish': finish(opt('--name', 'roofs_ortho2025.json'))
    elif a[0] == 'preview': preview(box, opt('--name', 'roofs_ortho2025.json'), opt('--out'), float(opt('--scale', 1.0)))
    elif a[0] == 'all': index(a[1]); sample(box, lvl); finish(); preview(box or [-800, -800, 800, 800])
