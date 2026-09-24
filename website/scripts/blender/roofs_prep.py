"""ROOFS FROM THE AIR: every building's real roof colour and roof class,
measured from USDA NAIP (public domain, 60 cm/px, RGB + near infrared).

  python3 roofs_prep.py fetch      # NAIP 2022 over SF -> qipu-render-work/roofs/naip/*.tif
  python3 roofs_prep.py measure    # -> qipu-render-work/roofs/roofs.json (+ calib.json)
  python3 roofs_prep.py top X0 Y0 X1 Y1 out.jpg   # a top-down check: NAIP | procedural | measured

Source: Microsoft Planetary Computer STAC, collection "naip" (USDA FSA
National Agriculture Imagery Program, public domain), California 2022
(flown 2022-05-18/19), anonymous SAS token. See roofs/README.txt.
Memory: one quarter-quad window at a time, read in strips (< ~1.5 GB).
"""
import json, os, sys, math, time, urllib.request
import numpy as np
W = '/Users/daniel/code/qipu-render-work/roofs'
NAIP = f'{W}/naip'
STAC = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
SAS = 'https://planetarycomputer.microsoft.com/api/sas/v1/token/naipeuwest/naip'
LON0, LAT0, MPD, COSL = -122.438, 37.76, 111320.0, 0.790582709628753
BBOX = (-122.5165, 37.7020, -122.3530, 37.8350)          # SF's buildings + ~100 m
YEAR = os.environ.get('NAIP_YEAR', '2022')

def eng_to_lonlat(x, y): return np.asarray(x) / (MPD * COSL) + LON0, np.asarray(y) / MPD + LAT0
def lonlat_to_eng(lon, lat): return (np.asarray(lon) - LON0) * MPD * COSL, (np.asarray(lat) - LAT0) * MPD

# ── the city's own records ──────────────────────────────────────────────────
CITY = '/Users/daniel/code/opd-render/website/public/data/us/sf/city'
def roadways():
    """the roadway polygons (curb to curb) of the street chunks, world metres"""
    import glob, qc
    out = []
    for p in sorted(glob.glob(f'{CITY}/strt/*.qc')):
        f = qc.read(p)[1]; o = 0
        for n in f.get('rdLen', []):
            n = int(n); out.append(np.stack([f['rdX'][o:o + n], f['rdY'][o:o + n]], 1).astype(np.float64)); o += n
    return out

def roof_forms():
    """gid -> pitched (the engine's measured roof form, roof/*.qc flags & 1)"""
    import glob, qc
    out = {}
    for p in glob.glob(f'{CITY}/roof/*.qc'):
        f = qc.read(p)[1]
        for g, fl in zip(f['gid'], f['flags']): out[int(g)] = bool(fl & 1)
    return out

# ── the imagery, in the engine's frame ──────────────────────────────────────
_T = {}
def _tr(epsg=26910):
    from pyproj import Transformer
    if epsg not in _T: _T[epsg] = Transformer.from_crs(4326, epsg, always_xy=True)
    return _T[epsg]

def eng_to_utm(x, y):
    lon, lat = eng_to_lonlat(x, y); return _tr().transform(lon, lat)

_IT = None
def item_index():
    """the downloaded quarter-quad windows: path, UTM bounds, affine"""
    global _IT
    if _IT is None:
        import rasterio, glob
        _IT = []
        for p in sorted(glob.glob(f'{NAIP}/*.tif')):
            with rasterio.open(p) as s: _IT.append(dict(path=p, b=tuple(s.bounds), tr=s.transform, w=s.width, h=s.height))
    return _IT

def pick_item(ux, uy):
    """the window in which the point lies deepest (NAIP quarter quads overlap
    by ~300 m; the deepest one is the point's own quad, one flight date)"""
    best, bd = None, -1e9
    for it in item_index():
        b = it['b']; d = min(ux - b[0], b[2] - ux, uy - b[1], b[3] - uy)
        if d > bd: best, bd = it, d
    return best if bd > 0 else None

def read_utm(it, ux0, uy0, ux1, uy1):
    """RGBN uint8 (4, h, w) of a UTM box in one window, and its pixel origin"""
    import rasterio
    from rasterio.windows import Window
    tr = it['tr']; c0 = int(math.floor((ux0 - tr.c) / tr.a)); r0 = int(math.floor((uy1 - tr.f) / tr.e))
    c1 = int(math.ceil((ux1 - tr.c) / tr.a)); r1 = int(math.ceil((uy0 - tr.f) / tr.e))
    c0, r0 = max(0, c0), max(0, r0); c1, r1 = min(it['w'], c1), min(it['h'], r1)
    with rasterio.open(it['path']) as s: a = s.read(window=Window(c0, r0, max(1, c1 - c0), max(1, r1 - r0)))
    return a, c0, r0

def naip_patch(x0, y0, x1, y1, res=0.3, it=None):
    """NAIP resampled onto the engine frame (x east, y north; row 0 = north),
    bilinear. RGBN float32 0..255"""
    from scipy.ndimage import map_coordinates
    nx, ny = int(round((x1 - x0) / res)), int(round((y1 - y0) / res))
    X, Y = np.meshgrid(x0 + (np.arange(nx) + 0.5) * res, y1 - (np.arange(ny) + 0.5) * res)
    ux, uy = eng_to_utm(X.ravel(), Y.ravel())
    it = it or pick_item(float(np.mean(ux)), float(np.mean(uy)))
    pad = 30
    a, c0, r0 = read_utm(it, ux.min() - pad, uy.min() - pad, ux.max() + pad, uy.max() + pad)
    tr = it['tr']; col = (ux - tr.c) / tr.a - 0.5 - c0; row = (uy - tr.f) / tr.e - 0.5 - r0
    out = np.stack([map_coordinates(a[k].astype(np.float32), [row, col], order=1, mode='nearest') for k in range(a.shape[0])])
    return out.reshape(a.shape[0], ny, nx)

# ── measuring ───────────────────────────────────────────────────────────────
BLK = 1024                       # a block of imagery (px, 614 m) and its margin
MARG = 96                        # (58 m: the lean of a 200 m tower is inside)

def _shrunk(ring, d=1.0):
    """the footprint, shrunk so walls, eaves and neighbours stay out"""
    from shapely.geometry import Polygon
    from shapely.validation import make_valid
    p = Polygon(ring)
    if not p.is_valid: p = make_valid(p)
    for dd in (d, d * 0.6, d * 0.3):
        q = p.buffer(-dd, join_style='mitre')
        if not q.is_empty and q.area > 4.0: break
    else: return []
    geoms = getattr(q, 'geoms', [q])
    return [np.asarray(g.exterior.coords) for g in geoms if g.geom_type == 'Polygon' and g.area > 1.0]

def _to_px(it, x, y):
    ux, uy = eng_to_utm(x, y); tr = it['tr']
    return (ux - tr.c) / tr.a, (uy - tr.f) / tr.e          # col, row (pixel edges at integers)

def _owner(B):
    its = item_index()
    ux, uy = eng_to_utm(np.array([b['cx'] for b in B]), np.array([b['cy'] for b in B]))
    D = np.stack([np.minimum.reduce([ux - it['b'][0], it['b'][2] - ux, uy - it['b'][1], it['b'][3] - uy]) for it in its], 1)
    own = D.argmax(1); own[D.max(1) <= 0] = -1
    return own

CELL = 256.0                     # the lean field's cell (m)

def _outline_pts(ring, step=0.3):
    r = np.vstack([ring, ring[:1]]); out = []
    for a, c in zip(r[:-1], r[1:]):
        n = max(1, int(np.hypot(*(c - a)) / step)); t = (np.arange(n) / n)[:, None]; out.append(a + (c - a) * t)
    return np.concatenate(out)

class Block:
    """one window of one quarter quad: RGBN, luminance gradient, the local
    engine-metre -> pixel Jacobian"""
    def __init__(self, it, c0, r0, c1, r1):
        import rasterio
        from rasterio.windows import Window
        from scipy.ndimage import sobel, gaussian_filter
        c0, r0 = max(0, c0), max(0, r0); c1, r1 = min(it['w'], c1), min(it['h'], r1)
        with rasterio.open(it['path']) as s: self.a = s.read(window=Window(c0, r0, c1 - c0, r1 - r0)).astype(np.float32)
        self.it, self.c0, self.r0 = it, c0, r0
        L = gaussian_filter(self.a[:3].mean(0), 0.6)
        self.G = np.hypot(sobel(L, 0), sobel(L, 1))
    def px(self, x, y):
        c, r = _to_px(self.it, x, y); return c - self.c0, r - self.r0
    def sample(self, img, c, r):
        from scipy.ndimage import map_coordinates
        return map_coordinates(img, [r - 0.5, c - 0.5], order=1, mode='constant', cval=0.0)

def _jac(it, x, y):
    c0, r0 = _to_px(it, x, y); c1, r1 = _to_px(it, x + 10.0, y); c2, r2 = _to_px(it, x, y + 10.0)
    return np.array([[(c1 - c0) / 10, (c2 - c0) / 10], [(r1 - r0) / 10, (r2 - r0) / 10]])

def lean_field(B, own, k, it):
    """per 256 m cell of this quad, the relief displacement per metre of
    height: the roofs are where the outlines of the footprints, each moved
    by h·v, meet the photo's edges best (lean only, the ground itself sits
    where the footprints say: checked in four districts, a lean-only model
    beats a constant shift in each). NAIP 2022 over SF leans east: the
    strips run north-south, ~0 on a flight line, ~0.45 m/m 2 km off it"""
    idx = np.where(own == k)[0]
    cells = {}
    for i in idx: cells.setdefault((int(B[i]['cx'] // CELL), int(B[i]['cy'] // CELL)), []).append(i)
    V = {}
    vx_c, vy_c = np.arange(-0.8, 0.801, 0.05), np.arange(-0.4, 0.401, 0.05)
    for key, ii in cells.items():
        if len(ii) < 6: continue
        P, Hh = [], []
        for i in ii:
            o = _outline_pts(np.asarray(B[i]['ring']), 0.4); P.append(o); Hh.append(np.full(len(o), B[i]['h']))
        P = np.concatenate(P); Hh = np.concatenate(Hh)
        if len(P) > 12000:
            sel = np.random.default_rng(abs(key[0] * 1000 + key[1])).choice(len(P), 12000, replace=False); P, Hh = P[sel], Hh[sel]
        cx, cy = (key[0] + 0.5) * CELL, (key[1] + 0.5) * CELL
        J = _jac(it, cx, cy); hmax = float(Hh.max())
        pc, pr = _to_px(it, P[:, 0], P[:, 1])
        m = int(0.8 * hmax / 0.6) + 12
        blk = Block(it, int(pc.min()) - m, int(pr.min()) - m, int(pc.max()) + m, int(pr.max()) + m)
        pc, pr = pc - blk.c0, pr - blk.r0
        def sc(vx, vy):
            dc = Hh * (J[0, 0] * vx + J[0, 1] * vy); dr = Hh * (J[1, 0] * vx + J[1, 1] * vy)
            return blk.sample(blk.G, pc + dc, pr + dr).mean()
        S = np.array([[sc(a, b) for a in vx_c] for b in vy_c]); j, i = np.unravel_index(S.argmax(), S.shape)
        bx, by = vx_c[i], vy_c[j]
        fx, fy = np.arange(bx - 0.05, bx + 0.051, 0.01), np.arange(by - 0.05, by + 0.051, 0.01)
        S2 = np.array([[sc(a, b) for a in fx] for b in fy]); j2, i2 = np.unravel_index(S2.argmax(), S2.shape)
        s0 = sc(0.0, 0.0)
        V[key] = (float(fx[i2]), float(fy[j2]), float(S2.max() / max(s0, 1e-6)), len(ii), float(np.median([B[i]['h'] for i in ii])))
    # cells with little to go on take their neighbours' (same strip: nearest in x first)
    good = {k_: v for k_, v in V.items() if v[2] > 1.03 and v[3] >= 12}
    out = {}
    for key in set(cells) | set(V):
        if key in good: out[key] = good[key][:2]; continue
        near = sorted(good, key=lambda q: abs(q[0] - key[0]) * 1.0 + abs(q[1] - key[1]) * 0.5)[:4]
        out[key] = (float(np.median([good[q][0] for q in near])), float(np.median([good[q][1] for q in near]))) if near else (0.0, 0.0)
    return out, V

def asphalt_ref(it, B_idx=None, n_max=400):
    """the item's street asphalt in DN: the median of the roadway polygons
    (curb to curb, shrunk 1.5 m off the parked cars), no vegetation. The
    neutral the white balance leans on, and the dark anchor of the albedo scale"""
    from shapely.geometry import Polygon
    from PIL import Image, ImageDraw
    rw = roadways(); rng = np.random.default_rng(1)
    b = it['b']; vals = []
    cand = []
    for r in rw:
        ux, uy = eng_to_utm(r[:, 0].mean(), r[:, 1].mean())
        if b[0] + 400 < ux < b[2] - 400 and b[1] + 400 < uy < b[3] - 400: cand.append(r)
    if not cand: return None
    for j in rng.permutation(len(cand))[:n_max]:
        r = cand[j]
        q = Polygon(r).buffer(-1.5)
        if q.is_empty or q.area < 20: continue
        ring = np.asarray(getattr(q, 'geoms', [q])[0].exterior.coords)
        c, rr = _to_px(it, ring[:, 0], ring[:, 1])
        c0, r0 = int(c.min()) - 2, int(rr.min()) - 2; c1, r1 = int(c.max()) + 3, int(rr.max()) + 3
        if c1 - c0 > 800 or r1 - r0 > 800: continue
        blk = Block.__new__(Block)
        import rasterio
        from rasterio.windows import Window
        with rasterio.open(it['path']) as s: a = s.read(window=Window(c0, r0, c1 - c0, r1 - r0)).astype(np.float32)
        im = Image.new('L', (c1 - c0, r1 - r0), 0)
        ImageDraw.Draw(im).polygon([(x - c0 - 0.5, y - r0 - 0.5) for x, y in zip(c, rr)], fill=1)
        m = np.asarray(im, bool)
        if m.shape != a.shape[1:]: continue
        px_ = a[:, m]
        nd = (px_[3] - px_[0]) / np.maximum(px_[3] + px_[0], 1)
        vals.append(px_[:, nd < 0.1])
    v = np.concatenate(vals, 1)
    return dict(median=np.median(v, 1).tolist(), p10=np.percentile(v, 10, 1).tolist(), p90=np.percentile(v, 90, 1).tolist(), n=int(v.shape[1]))

def measure_item(B, own, k, it, lf, asp=None, dL=0.0):
    """every building this quad owns: its roof found (lean), its pixels
    drawn tall-last, their robust colour. Raw DN out; calibrated in finish()"""
    from PIL import Image, ImageDraw
    idx = np.where(own == k)[0]
    ucx, ucy = _to_px(it, np.array([B[i]['cx'] for i in idx]), np.array([B[i]['cy'] for i in idx]))
    blocks = {}
    for i, c, r in zip(idx, ucx, ucy): blocks.setdefault((int(c // BLK), int(r // BLK)), []).append(i)
    rows = []
    for (bc, br), ii in sorted(blocks.items()):
        hmax = max(B[i]['h'] for i in ii); M_ = int(min(400, 0.7 * hmax / 0.6 + 40))
        blk = Block(it, bc * BLK - M_, br * BLK - M_, (bc + 1) * BLK + M_, (br + 1) * BLK + M_)
        Hh, Wd = blk.a.shape[1:]
        J = _jac(it, (bc + 0.5) * BLK * 0 + B[ii[0]]['cx'], B[ii[0]]['cy'])
        # ── where each roof is ──
        shift = {}
        for i in ii:
            b = B[i]; key = (int(b['cx'] // CELL), int(b['cy'] // CELL)); h = b['h']
            vs = {lf.get(key, (0.0, 0.0))}
            for dk in (-1, 1):
                q = lf.get((key[0] + dk, key[1]))
                if q is not None and abs(q[0] - lf.get(key, (0, 0))[0]) > 0.08: vs.add(q)
            o = _outline_pts(np.asarray(b['ring']), 0.3); pc, pr = blk.px(o[:, 0], o[:, 1])
            best = (-1, 0.0, 0.0); s_prior = None
            rad = min(8.0, 0.45 + 0.05 * h); st = 0.3 if rad < 3 else 0.6
            g = np.arange(-rad, rad + 1e-6, st)
            for v in vs:
                sx0, sy0 = h * v[0], h * v[1]
                if s_prior is None: s_prior = (sx0, sy0)
                for dy in g:
                    for dx in g:
                        sx, sy = sx0 + dx, sy0 + dy
                        s_ = blk.sample(blk.G, pc + J[0, 0] * sx + J[0, 1] * sy, pr + J[1, 0] * sx + J[1, 1] * sy).mean()
                        if s_ > best[0]: best = (s_, sx, sy)
            sp = blk.sample(blk.G, pc + J[0, 0] * s_prior[0] + J[0, 1] * s_prior[1], pr + J[1, 0] * s_prior[0] + J[1, 1] * s_prior[1]).mean()
            shift[i] = (best[1], best[2], float(best[0]), float(sp))
        # ── the label raster, lowest first; every building's leaning body hides what it stands in front of ──
        lab = Image.new('I', (Wd, Hh), 0); d = ImageDraw.Draw(lab)
        for i in sorted(ii, key=lambda i: B[i]['h']):
            b = B[i]; sx, sy = shift[i][:2]
            r = np.asarray(b['ring']); c, rr = blk.px(r[:, 0], r[:, 1]); c -= 0.5; rr -= 0.5
            dc, dr = J[0, 0] * sx + J[0, 1] * sy, J[1, 0] * sx + J[1, 1] * sy
            n = len(c)
            for e in range(n):
                f = (e + 1) % n
                d.polygon([(c[e], rr[e]), (c[f], rr[f]), (c[f] + dc, rr[f] + dr), (c[e] + dc, rr[e] + dr)], fill=0)
            for sh in _shrunk(r, 1.0):
                sc_, sr_ = blk.px(sh[:, 0] + sx, sh[:, 1] + sy)
                d.polygon(list(zip(sc_ - 0.5, sr_ - 0.5)), fill=int(i) + 1)
        L_ = np.asarray(lab, np.int64).ravel()
        order = np.argsort(L_, kind='stable'); Ls = L_[order]
        A = blk.a.reshape(4, -1)
        for i in ii:
            lo, hi = np.searchsorted(Ls, i + 1), np.searchsorted(Ls, i + 2)
            px_ = A[:, order[lo:hi]]
            npx = px_.shape[1]
            sx, sy, sc_best, sc_prior = shift[i]
            row = dict(i=int(i), npx=npx, sx=sx, sy=sy, gain=sc_best / max(sc_prior, 1e-6), edge=sc_best)
            if npx >= 4:
                R_, G_, B_, N_ = px_
                L = (R_ + G_ + B_) / 3; nd = (N_ - R_) / np.maximum(N_ + R_, 1)
                veg = nd > 0.2
                nv = ~veg
                p75 = np.percentile(L[nv], 75) if nv.sum() >= 3 else 0.0
                # shade: under half the lit roof's light ABOVE THE HAZE (NAIP's
                # offset is ~65 DN: a shaded half of a 150 roof reads ~86, not 60)
                shadow = nv & ((L - dL) < 0.5 * (p75 - dL))
                good = nv & ~shadow
                row.update(fveg=float(veg.mean()), fsh=float(shadow.mean()), ngood=int(good.sum()), p75=float(p75))
                if good.sum() >= 3:
                    g_ = px_[:, good]
                    row['med'] = np.median(g_, 1).round(1).tolist()
                    row['q'] = np.percentile(L[good], [10, 25, 75, 90]).round(1).tolist()
                    if asp is not None:     # solar panels: darker than the street, bluer than its neutral, little near infrared
                        aR, aG, aB, aN = asp; La = (aR + aG + aB) / 3
                        Lg = (g_[0] + g_[1] + g_[2]) / 3
                        sol = (Lg < La - 45) & (g_[2] - g_[0] > aB - aR + 12) & (g_[3] < aN - 30)
                        row['blue'] = float(np.mean(sol))
                        if (~sol).sum() >= 3: row['med_ns'] = np.median(g_[:, ~sol], 1).round(1).tolist()   # the roof between the panels
                    row['all'] = np.median(px_, 1).round(1).tolist()
            rows.append(row)
        print(f"  block {bc},{br}: {len(ii)} buildings", flush=True)
    return rows

def measure(*only):
    import city_data
    B = city_data.buildings(-9000, -9000, 9000, 9000)
    own = _owner(B); its = item_index()
    os.makedirs(f'{W}/raw', exist_ok=True)
    for k, it in enumerate(its):
        name = os.path.basename(it['path'])[:-4]
        if only and not any(o in name for o in only): continue
        out = f'{W}/raw/{name}.json'
        if os.path.exists(out): continue
        t0 = time.time()
        lf, V = lean_field(B, own, k, it)
        asp = asphalt_ref(it)
        print(name, 'lean cells', len(V), 'asphalt', asp and [round(v) for v in asp['median']], f'{time.time() - t0:.0f}s', flush=True)
        rows = measure_item(B, own, k, it, lf, asp and asp['median'], 0.9 * band_stats(it['path']))
        for r in rows: r['gid'] = B[r.pop('i')]['gid']
        json.dump(dict(item=name, asphalt=asp, lean={f'{a},{b}': v for (a, b), v in V.items()}, rows=rows), open(out, 'w'))
        print(name, len(rows), 'roofs', f'{time.time() - t0:.0f}s', flush=True)

# ── from DN to albedo, and to a class ───────────────────────────────────────
# NAIP's 8 bits are neither radiance nor sRGB: a hazy, compressed product
# (SF 2022: deep shade ~60 (blue-lit), street asphalt ~145, a white membrane
# ~215, clipping at ~220). So the mapping is, per band and per quarter quad,
# the usual sensor model — a haze offset and a power law —
#     albedo = 0.75 * ((DN - d) / (DNwhite - d)) ** gamma
# pinned on three things whose albedo is known well enough:
#     d        the darkest 1% of the bare land (canyon shade), set the
#              same DN distance below the asphalt in every band (shade is
#              blue-lit: each band's own darkest 1% would tint dark roofs)
#     DNwhite  the brightest roofs (99th pct of the roof medians) -> 0.75
#     gamma    so the street asphalt (roadway polygons, median)   -> 0.11
# Asphalt and white roofs are neutral, so the same curve white-balances (the
# haze is blue: asphalt reads 142/149/154). Check: sunlit concrete sidewalks
# come out ~0.22 (real aged concrete 0.2-0.3); a log-linear curve through the
# same anchors gave 0.16 and roofs too dark. Below the asphalt a gentle log
# slope to 0.03 at the shade level (tar, dark shingle: 0.05-0.1). Colours are LINEAR albedo.
ANCH = (0.0, 0.11, 0.75)
# aged asphalt is a warm grey (oxidised binder, the aggregate showing): the
# street is the white balance's neutral only up to this tint (R, G, B)
ASPH_TINT = tuple(float(v) for v in os.environ.get('ASPH_TINT', '1.10,1.02,0.88').split(','))

def band_stats(path):
    import rasterio
    with rasterio.open(path) as s:
        a = s.read(out_shape=(4, s.height // 4, s.width // 4)).reshape(4, -1).astype(np.float32)
    L = a[:3].mean(0); nd = (a[3] - a[0]) / np.maximum(a[3] + a[0], 1)
    m = (L > 0) & (nd < 0.05)          # no vegetation
    return float(np.percentile(L[m], 1))

def curve(dark, asph, white, a_alb=None):
    """above the asphalt the power law; below it a gentle log slope down to
    0.03 at the shade level (the power law, pinned at a haze offset that high,
    would call a DN-110 roof black: 0.014, where tar and dark shingle are 0.05-0.1)"""
    d, a, w = float(dark), float(asph), float(white); A1 = a_alb or ANCH[1]
    g = math.log(A1 / ANCH[2]) / math.log((a - d) / (w - d))
    k = math.log(A1 / 0.03) / (a - d)
    def f(v):
        v = np.asarray(v, float)
        hi = ANCH[2] * np.clip((v - d) / (w - d), 1e-4, None) ** g
        lo = A1 * np.exp((v - a) * k)
        return np.where(v >= a, hi, lo)
    return f

def rgb2hsv(c):
    import colorsys
    return colorsys.rgb_to_hsv(*[max(0.0, min(1.0, v)) for v in c])

def classify(a, row, pitched, asph=None, h=0.0):
    """a: linear albedo RGB. -> (class, confidence 0..1)"""
    r, g, b = a; L = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if asph is not None:        # a roof in a tower's shade: darker than the street and lit blue by the sky
        m = row['med']; La = sum(asph[:3]) / 3
        if sum(m[:3]) / 3 < La - 20 and (m[2] - m[0]) > (asph[2] - asph[0]) + 14 and row.get('blue', 0) < 0.35:
            return 'shadow', 0.0
    mx, mn = max(a), min(a); sat = (mx - mn) / max(mx, 1e-4)
    npx, ngood = row['npx'], row.get('ngood', 0)
    conf = 1.0
    conf *= min(1.0, ngood / 25.0)                                   # enough roof to judge
    conf *= min(1.0, max(0.0, (ngood / max(npx, 1) - 0.25) / 0.35))  # not mostly tree or shadow
    q = row.get('q')
    if q: conf *= min(1.0, max(0.2, 1.4 - (q[3] - q[0]) / 60.0))       # a roof of one colour, not a patchwork
    if row.get('gain', 1) < 1.0: conf *= 0.6
    if row.get('fsh', 0) > 0.4: conf *= 0.6          # much of it in shade: what is left may be the dimmer part
    if h > 30:                  # a tower's roof is far from its footprint in the photo: trust it only where it was clearly found
        conf *= min(1.0, max(0.0, (row.get('gain', 1) - 1.05) / 0.2))
    if row.get('fveg', 0) > 0.5: return 'tree', 0.0
    if L < 0.045: return 'shadow', 0.0                                  # too dark for a roof: in shadow
    if r > g * 1.25 and r > b * 1.7 and sat > 0.35 and L > 0.07: cls = 'tile'
    elif g > r * 1.08 and g > b * 1.05 and sat > 0.2: cls = 'green'
    elif row.get('blue', 0) > 0.35: cls = 'solar'
    elif L >= 0.42 and sat < 0.25: cls = 'white'
    elif pitched and L < 0.2: cls = 'shingle'
    elif L < 0.11: cls = 'tar'
    elif r > b * 1.18 and sat < 0.45: cls = 'gravel'
    elif b > r * 1.04 and L > 0.2 and sat < 0.25: cls = 'metal'
    else: cls = 'cap'
    return cls, round(float(conf), 2)

# ── from the measurement to the colour the renderer gets ───────────────────
# What NAIP says reliably at 37 cm/px: each roof's LIGHTNESS, its CLASS, and
# its hue only where the roof really is chromatic (clay tile, a green roof,
# paint). A neutral roof's measured hue is mostly haze and white balance, so
# a neutral class takes its lightness from the photo and its warmth from a
# small palette of real roofing greys, picked per roof: by the measured warmth
# where there is one, by the gid (deterministic) where there is not.
NEUTRAL_TINTS = {    # centred on a warm grey: roofing greys are warm on average (weathered
                     # shingle, mineral cap sheet, tan gravel), and the golden hour's blue
                     # sky fill turns a strict neutral slate-blue from above
    'tar':     [(1.0, 1.0, 1.0), (1.05, 1.0, 0.93), (1.10, 1.01, 0.87), (1.15, 1.02, 0.82)],
    'cap':     [(0.99, 1.0, 1.01), (1.05, 1.0, 0.93), (1.09, 1.01, 0.88), (1.13, 1.02, 0.84), (1.18, 1.04, 0.80)],
    'gravel':  [(1.08, 1.01, 0.89), (1.13, 1.03, 0.84), (1.18, 1.04, 0.80), (1.23, 1.05, 0.76)],
    'shingle': [(0.99, 1.0, 1.01), (1.05, 0.99, 0.94), (1.10, 1.0, 0.88), (1.16, 1.0, 0.82), (1.22, 1.01, 0.77), (1.02, 1.04, 0.92)],
    'white':   [(1.01, 1.0, 0.99), (1.03, 1.0, 0.96), (1.05, 1.01, 0.93)],
    'metal':   [(0.98, 1.0, 1.02), (1.02, 1.0, 0.98)],
    'solar':   [(1.03, 1.0, 0.96), (1.08, 1.0, 0.90)],
}

WARM = tuple(float(v) for v in os.environ.get('ROOF_WARM', '1.09,1.0,0.88').split(','))   # the whole palette a shade warmer (the render's own concrete and gravel are warm)

def _lum3(a): return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]

def render_colour(a, cls, gid, w_med=0.0):
    L = max(_lum3(a), 1e-4)
    mx, mn = max(a), min(a); sat = (mx - mn) / max(mx, 1e-4)
    if cls in ('tile', 'green') or sat > 0.33:
        # chromatic: the photo's own hue, a little more saturated (the haze took some)
        return [max(0.0, L + 1.25 * (v - L)) for v in a]
    pal = NEUTRAL_TINTS.get(cls, NEUTRAL_TINTS['cap'])
    pal = sorted(pal, key=lambda t: t[0] - t[2])                 # cool -> warm
    w = (a[0] - a[2]) / L                                         # the measured warmth
    h = ((gid * 2654435761) >> 7) % 1000 / 1000.0                  # a fixed per-roof draw
    pos = min(max((w - w_med) / 0.16 + 0.5, 0.0), 1.0) * 0.35 + h * 0.65 # warmer or cooler than the city's median roof, and a draw
    t = pal[min(len(pal) - 1, int(pos * len(pal)))]
    t = [t[0] * WARM[0], t[1] * WARM[1], t[2] * WARM[2]]
    tl = _lum3(t)
    # neighbours differ: +-12 % in value, a second fixed draw per roof (rows
    # of the same roofing measure alike from 60 cm, and read as one slab)
    j = 1.0 + 0.24 * (((gid * 40503 + 12345) >> 5) % 1000 / 1000.0 - 0.5)
    return [min(0.85, L * j * c / tl) for c in t]

def proc_flat_L(paint):
    """the albedo tonight's procedural flat roof has on average for this paint
    tone (gen_buildings.flat_roof: kind odds by the engine's aerial tone,
    base greys, lightness k; x the roof_flat textures and dirt) — the floor a
    big flat roof is held to"""
    t = paint / 31.0
    if t >= 0.85: odds = {2: 0.45, 3: 0.25, 1: 0.30}
    elif t >= 0.60: odds = {1: 0.55, 3: 0.20, 0: 0.25}
    elif t >= 0.30: odds = {1: 0.5, 0: 0.5}
    else: odds = {0: 0.6, 1: 0.4}
    base = {0: ((0.50, 0.48, 0.45), (0.44, 0.44, 0.44), (0.55, 0.50, 0.44), (0.38, 0.37, 0.36)),
            1: ((0.60, 0.60, 0.58), (0.52, 0.56, 0.52), (0.62, 0.58, 0.52), (0.50, 0.52, 0.56), (0.45, 0.45, 0.46), (0.58, 0.52, 0.46)),
            2: ((0.86, 0.86, 0.84), (0.80, 0.81, 0.80), (0.84, 0.82, 0.78)), 3: ((0.72, 0.73, 0.74), (0.66, 0.67, 0.69))}
    T = {0: (1.215, 1.068, 0.881), 1: (1.238, 1.078, 0.960), 2: (1.05, 1.017, 1.0), 3: (1.05, 1.017, 1.0)}
    Ls = 0.0
    for kind, p in odds.items():
        k = 0.90 + 0.08 * t if kind >= 2 else 0.70 + 0.35 * t
        for bc in base[kind]:
            lin = [min(1.0, c * k) ** 2.2 * T[kind][i] * 0.92 for i, c in enumerate(bc)]
            Ls += p / len(base[kind]) * _lum3(lin)
    return Ls

def lit_membrane(a, row, cls, area, c, F, pitched, paint=16):
    """a patchwork roof (units, walkways, ducts, patches of shade) reads from
    the air darker than the membrane it is: its median sits between. On a
    roof of many values its lightness is taken halfway to its upper quartile;
    a LARGE flat roof (>= 250 m2: commercial, institutional, apartments) is
    never darker than a mid cap sheet (0.18) unless the photo clearly shows
    tar — dark, even, not in shade. SF's big flat roofs are light membranes
    and gravel, and a dark slate reading was mostly their clutter and shade"""
    q = row.get('q')
    if not q or pitched or cls in ('tile', 'green', 'solar', 'white'): return a, False
    L = max(_lum3(a), 1e-4)
    La = float(np.mean(c['asphalt'])); dL = La - c['darkL']
    lumF = curve(La - dL, La, float(np.mean(c['white'])), ANCH[1] * _lum3(ASPH_TINT))
    spread = q[3] - q[0]
    L2 = L
    if spread > 40: L2 = max(L, float(lumF(0.5 * (sum(row['med'][:3]) / 3 + q[2]))))
    clearly_tar = spread < 30 and sum(row['med'][:3]) / 3 < La - 5 and row.get('fsh', 0) < 0.2 and row.get('ngood', 0) >= 80
    # and not darker than tonight's procedural roof for the same aerial tone (the coordinator's rule, 05:00)
    if area >= 250 and not clearly_tar: L2 = max(L2, 0.18, 0.95 * proc_flat_L(paint))
    return [v * L2 / L for v in a], clearly_tar

def finish(out=None):
    import glob
    import city_data
    forms = roof_forms()
    BB = city_data.buildings(-9000, -9000, 9000, 9000)
    HB = {b['gid']: b['h'] for b in BB}
    def _area(r):
        r = np.asarray(r); x, y = r[:, 0], r[:, 1]
        return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))
    AB = {b['gid']: _area(b['ring']) for b in BB}
    PB = {b['gid']: b.get('paint', 16) for b in BB}
    raws = sorted(glob.glob(f'{W}/raw/*.json'))
    cal = {}; roofs = {}
    counts = {}
    for p in raws:
        d = json.load(open(p)); name = d['item']
        path = f'{NAIP}/{name}.tif'
        dark = band_stats(path)
        asph = np.array(d['asphalt']['median'][:3]) if d.get('asphalt') else None
        meds = np.array([r['med'][:3] for r in d['rows'] if 'med' in r and r.get('ngood', 0) >= 25])
        white = np.percentile(meds, 99, 0) if len(meds) > 200 else None
        cal[name] = dict(darkL=round(dark, 1), asphalt=None if asph is None else asph.tolist(),
                         white=None if white is None else white.round(1).tolist(), n=len(meds))
    # quads with too few roofs or streets borrow the others' anchors
    def pool(k):
        v = [np.array(c[k]) for c in cal.values() if c[k] is not None and c['n'] > 2000]
        return np.median(v, 0)
    gA, gW = pool('asphalt'), pool('white')
    for name, c in cal.items():
        if c['asphalt'] is None or c['n'] <= 2000: c['asphalt'] = gA.round(1).tolist(); c['borrowed'] = True
        if c['white'] is None or c['n'] <= 2000: c['white'] = gW.round(1).tolist(); c['borrowed'] = True
    for p in raws:
        d = json.load(open(p)); c = cal[d['item']]
        # the dark anchor sits as far below the asphalt in every band (shade is
        # blue-lit, so each band's own darkest 1% would tint the dark roofs)
        dL = np.mean(c['asphalt']) - c['darkL']
        F = [curve(c['asphalt'][k] - dL, c['asphalt'][k], c['white'][k], ANCH[1] * ASPH_TINT[k]) for k in range(3)]
        for row in d['rows']:
            if 'med' not in row: continue
            a = [float(F[k](row['med'][k])) for k in range(3)]
            # the survey's pitched flag is noise on big footprints (its slopes are the edge cells): a house's only
            pitched = forms.get(row['gid'], False) and AB.get(row['gid'], 0.0) < 250
            cls, conf = classify(a, row, pitched, c['asphalt'], HB.get(row['gid'], 0.0))
            if cls == 'solar' and row.get('med_ns'):      # the roof between the panels
                a = [float(F[k](row['med_ns'][k])) for k in range(3)]
            a, tar = lit_membrane(a, row, cls, AB.get(row['gid'], 0.0), c, F, pitched, PB.get(row['gid'], 16))
            counts[cls] = counts.get(cls, 0) + 1
            roofs[str(row['gid'])] = [a[0], a[1], a[2], cls, conf, int(tar)]
    # the city's median warmth of its neutral roofs: each roof's tint says warmer or cooler than that
    ws = [(v[0] - v[2]) / max(_lum3(v[:3]), 1e-4) for v in roofs.values() if v[3] in NEUTRAL_TINTS and v[4] >= 0.5]
    w_med = float(np.median(ws)) if ws else 0.0
    for g, v in roofs.items():
        a = render_colour(v[:3], v[3], int(g), w_med) if os.environ.get('ROOF_TINTS', '1') == '1' else v[:3]
        # FLAT: a light membrane the survey does not call pitched — a flat roof
        # (behind a false front, most of them), whatever form the generator drew
        flat = int(v[3] in ('white', 'cap', 'metal', 'gravel') and _lum3(v[:3]) >= 0.28 and not forms.get(int(g), False))
        # 7th: the photo clearly shows tar (dark, even, not in shade): the one case a big flat roof may be darker than the procedural one
        roofs[g] = [round(a[0], 3), round(a[1], 3), round(a[2], 3), v[3], v[4], flat, v[5]]
    meta = dict(source='USDA NAIP 2022 (public domain), Planetary Computer STAC collection naip; see roofs/README.txt',
                colour='linear albedo; per band/quad 0.75*((DN-d)/(DNwhite-d))^gamma, d = 1% bare land shade, asphalt -> 0.11, 99% roofs -> 0.75; below asphalt log slope to 0.03 at d',
                render='neutral classes: measured lightness x a roofing-grey tint (warmer/cooler than the median roof + gid); chromatic (tile, green, sat>0.3): measured hue, saturation x1.25',
                classes=counts, n=len(roofs))
    meta['asphalt_tint'] = ASPH_TINT
    json.dump(dict(meta=meta, calib=cal), open(f'{W}/calib.json' if not out else out.replace('.json', '_calib.json'), 'w'), indent=1)
    out = out or f'{W}/roofs.json'
    json.dump(dict(meta=meta, roofs=roofs), open(out, 'w'), separators=(',', ':'))
    print(json.dumps(counts), len(roofs), f'{os.path.getsize(out) / 1e6:.1f} MB')

CLS_COL = dict(white=(250, 250, 250), cap=(150, 150, 150), tar=(40, 40, 40), gravel=(190, 160, 110), shingle=(90, 70, 150), tile=(220, 70, 30), green=(40, 200, 40), solar=(20, 60, 255), metal=(120, 200, 230), shadow=(255, 0, 255), tree=(0, 110, 0))

def top(x0, y0, x1, y1, out, res=0.3, mode='albedo'):
    """a top-down check: NAIP | each roof's measured median (found roof,
    outline moved by its lean) | the albedo the renderer gets (sRGB of 1.4x)"""
    import city_data
    from PIL import Image, ImageDraw, ImageFont
    x0, y0, x1, y1, res = float(x0), float(y0), float(x1), float(y1), float(res)
    p = naip_patch(x0, y0, x1, y1, res)
    A = Image.fromarray(np.clip(p[:3].transpose(1, 2, 0), 0, 255).astype(np.uint8))
    raw = {}
    import glob
    for q in glob.glob(f'{W}/raw/*.json'):
        for r in json.load(open(q))['rows']: raw[r['gid']] = r
    rf_ = os.environ.get('ROOFS_FILE', f'{W}/roofs.json'); roofs = json.load(open(rf_))['roofs'] if os.path.exists(rf_) else {}
    Bm = A.copy(); Cm = Image.new('RGB', A.size, (70, 70, 70)); db, dc = ImageDraw.Draw(Bm), ImageDraw.Draw(Cm)
    Bs = sorted(city_data.buildings(x0 - 60, y0 - 60, x1 + 60, y1 + 60), key=lambda b: b['h'])
    for b in Bs:
        r = raw.get(b['gid']); sx, sy = (r['sx'], r['sy']) if r else (0, 0)
        pts = [((x + sx - x0) / res, (y1 - y - sy) / res) for x, y in b['ring']]
        if r and 'med' in r:
            db.polygon(pts, fill=tuple(int(v) for v in r['med'][:3]))
        rf = roofs.get(str(b['gid']))
        if rf:
            col = tuple(int(255 * min(1, (1.4 * v) ** (1 / 2.2))) for v in rf[:3]) if mode == 'albedo' else CLS_COL.get(rf[3], (255, 255, 0))
            dc.polygon(pts, fill=col, outline=(255, 0, 0) if rf[4] < 0.5 else None)
    W_, H_ = A.size; S = Image.new('RGB', (W_ * 3 + 20, H_ + 40), 'white'); d = ImageDraw.Draw(S)
    F = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 22)
    for k, (lab, im) in enumerate((('NAIP 2022', A), ('measured median (lean-corrected)', Bm), ('albedo to the renderer (red = low conf.)', Cm))):
        S.paste(im, (k * (W_ + 10), 40)); d.text((k * (W_ + 10) + 6, 8), lab, font=F, fill=(20, 20, 20))
    S.save(out, quality=90); print(out, S.size)

# ── NAIP seen by the render's camera (the reference column of a sheet) ─────
_CA, _SA = math.cos(math.radians(30)), 0.42
KX, KY = math.sqrt(2) * _CA, math.sqrt(2) * _SA; ZT = math.sqrt(2 * (_CA ** 2 - _SA ** 2))
REF = dict(cx=241.427019126574, cy=707.0567508859249, scale=2 ** (round(math.log2(0.06898352692062097) * 24) / 24))

def view(i, j, bx0, bx1, by0, by1, out, Z=7, FW=5120, FH=3072):
    """the NAIP photo draped over the city as hq_city's pyramid camera sees
    frame i:j cropped to BORDER (fractions, y from the bottom): every pixel's
    ray meets the ground or a roof (3DEP + the footprints' heights), and a
    roof takes the photo where that roof really is (its measured lean)"""
    import city_data, terrain_hq, glob
    from PIL import Image, ImageDraw
    i, j, Z, FW, FH = int(i), int(j), int(Z), int(FW), int(FH); bx0, bx1, by0, by1 = map(float, (bx0, bx1, by0, by1))
    f = 2 ** (Z - 3); sz = REF['scale'] * f; cw, ch = 2560 * f, 1536 * f
    u0, u1 = round(bx0 * FW), round(bx1 * FW); v0, v1 = round((1 - by1) * FH), round((1 - by0) * FH)
    U, V = np.meshgrid(np.arange(u0, u1) + 0.5, np.arange(v0, v1) + 0.5)
    PX = REF['cx'] + (i * FW / 2 + U / 2 - cw / 4) / sz; PY = REF['cy'] - (j * FH / 2 + V / 2 - ch / 4) / sz
    X = PX / KX
    # a surface over the crop's reach: ground + roofs (0.5 m), and each cell's lean
    res = 0.5; zmax = 340.0
    x0, x1 = X.min() - 5, X.max() + 5; y0, y1 = (PY.min() - ZT * zmax) / KY - 5, PY.max() / KY + 5
    nx, ny = int((x1 - x0) / res) + 1, int((y1 - y0) / res) + 1
    gx, gy = np.meshgrid(x0 + np.arange(nx) * res, y0 + np.arange(ny) * res)
    G = terrain_hq.true_ground(gx.ravel(), gy.ravel()).reshape(ny, nx).astype(np.float32)
    raw = {}
    for q in glob.glob(f'{W}/raw/*.json'):
        for r in json.load(open(q))['rows']: raw[r['gid']] = (r['sx'], r['sy'])
    Bs = sorted(city_data.buildings(x0 - 30, y0 - 30, x1 + 30, y1 + 30), key=lambda b: b['h'])
    top = Image.new('F', (nx, ny), -1e4); dt = ImageDraw.Draw(top)
    idim = Image.new('I', (nx, ny), 0); di = ImageDraw.Draw(idim)
    SX = {0: (0.0, 0.0)}
    for k, b in enumerate(Bs, 1):
        r = np.asarray(b['ring']); zg = float(terrain_hq.true_ground(r[:, 0], r[:, 1]).mean())
        pts = list(zip((r[:, 0] - x0) / res, (r[:, 1] - y0) / res))
        dt.polygon(pts, fill=zg + max(3.0, b['h'])); di.polygon(pts, fill=k); SX[k] = raw.get(b['gid'], (0.0, 0.0))
    T = np.maximum(np.asarray(top), G)
    Id = np.asarray(idim)
    # march each ray down from zmax: the first cell whose surface reaches the ray
    hit = np.full(X.shape, np.nan, np.float32); yy = np.zeros(X.shape); kk = np.zeros(X.shape, np.int64); wall = np.zeros(X.shape, bool)
    ci = np.clip(((X - x0) / res).round().astype(int), 0, nx - 1)
    for z in np.arange(float(T.max()) + 0.5, -20.0, -0.5):
        Yz = (PY - ZT * z) / KY
        ri = np.clip(((Yz - y0) / res).round().astype(int), 0, ny - 1)
        m = np.isnan(hit) & (T[ri, ci] >= z)
        hit[m] = z; yy[m] = Yz[m]; kk[m] = Id[ri[m], ci[m]]; wall[m] = T[ri[m], ci[m]] > z + 1.0
    yy[np.isnan(hit)] = ((PY - ZT * 0) / KY)[np.isnan(hit)]
    s = np.array([SX.get(k, (0.0, 0.0)) for k in range(len(Bs) + 1)])
    Xs = X + s[kk, 0]; Ys = yy + s[kk, 1]
    # sample NAIP there (one quarter quad for the crop)
    from scipy.ndimage import map_coordinates
    ux, uy = eng_to_utm(Xs.ravel(), Ys.ravel())
    it = pick_item(float(np.median(ux)), float(np.median(uy)))
    a, c0, r0 = read_utm(it, ux.min() - 5, uy.min() - 5, ux.max() + 5, uy.max() + 5)
    tr = it['tr']; col = (ux - tr.c) / tr.a - 0.5 - c0; row = (uy - tr.f) / tr.e - 0.5 - r0
    img = np.stack([map_coordinates(a[c].astype(np.float32), [row, col], order=1, mode='nearest') for c in range(3)], -1)
    img = img.reshape(X.shape + (3,)); img[wall] *= 0.62          # walls: the photo has none, so shade them
    np.savez_compressed(out.rsplit('.', 1)[0] + '_mask.npz', roof=(kk > 0) & ~wall, gid=np.array([0] + [b['gid'] for b in Bs])[kk])
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(out)
    print(out, X.shape[::-1])

def _json(url, body=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None,
                                 headers={'Content-Type': 'application/json'} if body else {})
    return json.load(urllib.request.urlopen(req, timeout=60))

def items():
    d = _json(STAC, {'collections': ['naip'], 'bbox': list(BBOX), 'datetime': f'{YEAR}-01-01/{YEAR}-12-31', 'limit': 100})
    return [f for f in d['features'] if f['properties'].get('naip:year') == YEAR]

def fetch(*only):
    import rasterio
    from rasterio.windows import Window
    from pyproj import Transformer
    os.makedirs(NAIP, exist_ok=True)
    its = items(); print(len(its), 'NAIP', YEAR, 'items over SF')
    meta = []
    for f in its:
        out = f"{NAIP}/{f['id']}.tif"
        if only and not any(o in f['id'] for o in only): continue
        if os.path.exists(out + '.part') and time.time() - os.path.getmtime(out + '.part') < 120: continue   # another fetcher has it
        meta.append(dict(id=f['id'], datetime=f['properties']['datetime'], href=f['assets']['image']['href'], bbox=f['bbox'], epsg=f['properties']['proj:epsg']))
        if os.path.exists(out): continue
        tok = _json(SAS)['token']
        with rasterio.open(f['assets']['image']['href'] + '?' + tok) as src:
            tr = Transformer.from_crs(4326, src.crs, always_xy=True)
            xs, ys = tr.transform([BBOX[0], BBOX[2], BBOX[0], BBOX[2]], [BBOX[1], BBOX[1], BBOX[3], BBOX[3]])
            r0, c0 = src.index(min(xs), max(ys)); r1, c1 = src.index(max(xs), min(ys))
            r0, c0 = max(0, r0), max(0, c0); r1, c1 = min(src.height, r1 + 1), min(src.width, c1 + 1)
            if r1 <= r0 or c1 <= c0: continue
            win = Window(c0, r0, c1 - c0, r1 - r0)
            prof = src.profile.copy()
            prof.update(driver='GTiff', width=win.width, height=win.height, transform=src.window_transform(win),
                        tiled=True, blockxsize=512, blockysize=512, compress='deflate', predictor=2, interleave='pixel', BIGTIFF='IF_SAFER')
            for k in ('photometric', 'jpeg_quality', 'jpegtablesmode'): prof.pop(k, None)
            tmp = out + '.part'
            with rasterio.open(tmp, 'w', **prof) as dst:
                for rr in range(0, win.height, 1024):
                    h_ = min(1024, win.height - rr)
                    for attempt in range(4):
                        try:
                            a = src.read(window=Window(c0, r0 + rr, win.width, h_)); break
                        except Exception as ex:
                            print('retry', ex); time.sleep(5)
                    dst.write(a, window=Window(0, rr, win.width, h_))
            os.rename(tmp, out)
            print(f['id'], win.width, 'x', win.height, f'{os.path.getsize(out) / 1e6:.0f} MB', flush=True)
    if not only: json.dump(meta, open(f'{NAIP}/items.json', 'w'), indent=1)

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'measure'
    globals()[cmd](*sys.argv[2:])
