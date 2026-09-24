"""ROOFS TEXTURED FROM THE AIR (experiment, switch ROOF_NAIP=1): every roof's
real surface — its patches, panels, units, skylights, decks — from USDA NAIP
2022 (public domain, 60 cm/px, RGB + near infrared), baked top-down into one
city-wide mosaic in the engine frame (x east, y north), so a roof face takes
its photo by its world XY (NAIP is an orthophoto: a planar projection is
exact on the ground; each roof is read where it really is in the photo, its
relief displacement measured per building by roofs_prep.measure).

  python3 roof_naip_prep.py bake [item …]      # -> RN_DIR/mosaic.u8 (+ .json)
  python3 roof_naip_prep.py crop X0 Y0 X1 Y1 out.png [res]   # the render's image
  python3 roof_naip_prep.py top X0 Y0 X1 Y1 out.jpg          # NAIP | baked, top-down

The mosaic: uint8 sRGB-encoded linear albedo + alpha (255 = photo roof), 0.3 m,
a sparse raw file on the SD card (~9.7 GB addressable, only roofs written).
Cleaning, per roof (all in the roof's own pixels):
  a. trees over the roof (NDVI > 0.12) and whatever a taller neighbour's
     leaning body hides are filled from the roof's own nearby colour;
  b. baked shade (parapets, neighbours) is relit by the roof's lit/shade
     ratio, and the photo's broad light is flattened (half for a flat roof,
     whole for a pitched one: NAIP's noon sun shaded its slopes, ours does);
  c. the colour is the measured roof's (roofs_v8.json, the render's current
     colours: calibrated, neutral), the photo giving only the variation
     around it (chroma variation x0.8, no blue cast);
  d. a mild unsharp mask (0.6 m -> 0.3 m); the shader adds fine grain.
Only buildings under 25 m, or up to 60 m where the lean was clearly found.
"""
import json, os, sys, math, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import roofs_prep as RP

RES = 0.3
X0, X1, Y0, Y1 = -7000.0, 7600.0, -6500.0, 8400.0
GW, GH = int(round((X1 - X0) / RES)), int(round((Y1 - Y0) / RES))
DIR = os.environ.get('RN_DIR', '/Volumes/DANI-SD-DRIVE2/qipu-roofnaip')
# RN_MODE=ratio (variant B): flat roofs only, the photo as a MODULATION of the
# procedural roof (its patches, recoats, panel arrays, decks >= 1.5 m; the
# small dark and bright blots — units and their shade — removed), linear,
# 0.5 = the roof's median; the procedural texture, kit and colour stay
RATIO = os.environ.get('RN_MODE', 'photo') == 'ratio'
MM = f'{DIR}/mosaic_ratio.u8' if RATIO else f'{DIR}/mosaic.u8'
RW = '/Users/daniel/code/qipu-render-work'
ROOFS_FILE = os.environ.get('RN_ROOFS', f'{RW}/roofs/roofs_v8.json')
LIDAR_FILE = f'{RW}/lidar/roofs_lidar_city.json'
HMAX = float(os.environ.get('RN_HMAX', 25.0))

def mosaic(mode='r'):
    if mode == 'w+' and not os.path.exists(MM):
        os.makedirs(DIR, exist_ok=True)
        with open(MM, 'wb') as f: f.truncate(GW * GH * 4)          # sparse
        json.dump(dict(x0=X0, x1=X1, y0=Y0, y1=Y1, res=RES, w=GW, h=GH, layout='rows north->south, RGBA uint8, RGB = sRGB(linear albedo)'),
                  open(MM + '.json', 'w'))
        mode = 'r+'
    return np.memmap(MM, np.uint8, mode, shape=(GH, GW, 4))

def _lum(a): return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]

def _normconv(img, w, sig):
    from scipy.ndimage import gaussian_filter
    num = gaussian_filter(img * w, sig, mode='nearest'); den = gaussian_filter(w.astype(np.float32), sig, mode='nearest')
    return num / np.maximum(den, 1e-6), den

def _target(m, pitched):
    """the colour the render's measured roof has (gen_buildings.measured_pitched /
    measured_flat, what the texture multiplies back to): the photo is held to it"""
    a, cls = list(m[:3]), m[3]
    L = max(_lum(a), 1e-4)
    if pitched and cls != 'tile': L2 = min(0.22, 0.05 + 0.5 * max(0.0, L - 0.05)) if L > 0.05 else L
    elif cls == 'tile': L2 = min(L, 0.45)
    else: L2 = L
    return np.array([v * L2 / L for v in a], np.float32)

# ── one quarter quad ───────────────────────────────────────────────────────
_G = {}
def _load():
    if _G: return _G
    import city_data
    B = city_data.buildings(-9000, -9000, 9000, 9000)
    _G['B'] = B; _G['own'] = RP._owner(B); _G['its'] = RP.item_index()
    _G['RJ'] = json.load(open(ROOFS_FILE))['roofs']
    _G['LJ'] = json.load(open(LIDAR_FILE)) if os.path.exists(LIDAR_FILE) else {}
    _G['cal'] = json.load(open(ROOFS_FILE.replace('.json', '_calib.json')))['calib'] if os.path.exists(ROOFS_FILE.replace('.json', '_calib.json')) else json.load(open(f'{RW}/roofs/calib.json'))['calib']
    return _G

def bake_item(k):
    import rasterio
    from rasterio.windows import Window
    from PIL import Image, ImageDraw
    from scipy.ndimage import map_coordinates, gaussian_filter, binary_dilation, binary_erosion
    g = _load(); B, own, it = g['B'], g['own'], g['its'][k]
    name = os.path.basename(it['path'])[:-4]
    raw = json.load(open(f'{RW}/roofs/raw/{name}.json'))
    SH = {r['gid']: r for r in raw['rows']}
    c = g['cal'][name]; dLa = np.mean(c['asphalt']) - c['darkL']
    F = [RP.curve(c['asphalt'][q] - dLa, c['asphalt'][q], c['white'][q], RP.ANCH[1] * RP.ASPH_TINT[q]) for q in range(3)]
    dark = 0.9 * c['darkL']
    M = mosaic('r+')
    idx = np.where(own == k)[0]
    if os.environ.get('RN_BOX'):          # a partial bake (tests)
        bx = [float(v) for v in os.environ['RN_BOX'].split(',')]
        idx = np.array([i for i in idx if bx[0] <= B[i]['cx'] <= bx[2] and bx[1] <= B[i]['cy'] <= bx[3]], int)
    ucx, ucy = RP._to_px(it, np.array([B[i]['cx'] for i in idx]), np.array([B[i]['cy'] for i in idx]))
    blocks = {}
    for i, cc, rr in zip(idx, ucx, ucy): blocks.setdefault((int(cc // RP.BLK), int(rr // RP.BLK)), []).append(i)
    n_ok = n_skip = 0; t0 = time.time()
    for (bc, br), ii in sorted(blocks.items()):
        ii = [i for i in ii if B[i]['gid'] in SH]
        if not ii: continue
        hmax = max(B[i]['h'] for i in ii); M_ = int(min(400, 0.7 * hmax / 0.6 + 40))
        c0, r0 = max(0, bc * RP.BLK - M_), max(0, br * RP.BLK - M_)
        c1, r1 = min(it['w'], (bc + 1) * RP.BLK + M_), min(it['h'], (br + 1) * RP.BLK + M_)
        with rasterio.open(it['path']) as s: A4 = s.read(window=Window(c0, r0, c1 - c0, r1 - r0)).astype(np.float32)
        Hh, Wd = A4.shape[1:]
        # the label raster: which roof each photo pixel shows (bodies lean and hide, lowest first)
        lab = Image.new('I', (Wd, Hh), 0); d = ImageDraw.Draw(lab)
        for i in sorted(ii, key=lambda i: B[i]['h']):
            b = B[i]; sh = SH[b['gid']]; sx, sy = sh['sx'], sh['sy']
            r = np.asarray(b['ring']); cc, rr = RP._to_px(it, r[:, 0], r[:, 1]); cc -= c0 + 0.5; rr -= r0 + 0.5
            c2, r2 = RP._to_px(it, r[:, 0] + sx, r[:, 1] + sy); c2 -= c0 + 0.5; r2 -= r0 + 0.5
            n = len(cc)
            for e in range(n):
                f = (e + 1) % n
                d.polygon([(cc[e], rr[e]), (cc[f], rr[f]), (c2[f], r2[f]), (c2[e], r2[e])], fill=0)
            d.polygon(list(zip(c2, r2)), fill=int(i) + 1)
        LAB = np.asarray(lab, np.int64)
        for i in sorted(ii, key=lambda i: B[i]['h']):
            b = B[i]; gid = b['gid']; sh = SH[gid]; h = b['h']
            if h > 60 or (h > HMAX and sh.get('gain', 1.0) < 1.1): n_skip += 1; continue
            m = g['RJ'].get(str(gid))
            if m is not None and m[3] in ('shadow', 'tree'): m = None
            lf = g['LJ'].get(str(gid))
            pitched = (lf is not None and lf[0] != 'flat') or (m is not None and m[3] in ('shingle', 'tile') and not (len(m) > 5 and m[5] == 1))
            ring = np.asarray(b['ring'], np.float64)
            bx0, by0 = ring.min(0) - 1.2; bx1, by1 = ring.max(0) + 1.2
            gx0, gx1 = int(math.floor((bx0 - X0) / RES)), int(math.ceil((bx1 - X0) / RES))
            gy0, gy1 = int(math.floor((Y1 - by1) / RES)), int(math.ceil((Y1 - by0) / RES))
            if gx0 < 0 or gy0 < 0 or gx1 > GW or gy1 > GH: n_skip += 1; continue
            w, hh = gx1 - gx0, gy1 - gy0
            def rast(rg, img=None):
                im = Image.new('L', (w, hh), 0)
                ImageDraw.Draw(im).polygon([((x - X0) / RES - gx0, (Y1 - y) / RES - gy0) for x, y in rg], fill=1)
                return np.asarray(im, bool)
            inside = rast(ring)
            if inside.sum() < 30: n_skip += 1; continue
            from shapely.geometry import Polygon
            buf = np.zeros_like(inside)
            try:
                pb = Polygon(ring).buffer(1.0, join_style='mitre')
                for gg in getattr(pb, 'geoms', [pb]): buf |= rast(np.asarray(gg.exterior.coords))
            except Exception: buf = inside.copy()
            inner = binary_erosion(inside, iterations=2)
            if inner.sum() < 20: inner = inside
            # where each engine pixel's roof is in the photo (local affine, exact to mm over a building)
            X = X0 + (gx0 + np.arange(w) + 0.5) * RES; Y = Y1 - (gy0 + np.arange(hh) + 0.5) * RES
            XX, YY = np.meshgrid(X, Y)
            cx, cy = float(ring[:, 0].mean()), float(ring[:, 1].mean())
            pc0, pr0 = RP._to_px(it, cx + sh['sx'], cy + sh['sy']); J = RP._jac(it, cx, cy)
            pc = pc0 + J[0, 0] * (XX - cx) + J[0, 1] * (YY - cy) - c0
            pr = pr0 + J[1, 0] * (XX - cx) + J[1, 1] * (YY - cy) - r0
            if pc.min() < 1 or pr.min() < 1 or pc.max() > Wd - 2 or pr.max() > Hh - 2: n_skip += 1; continue
            DN = np.stack([map_coordinates(A4[q], [pr - 0.5, pc - 0.5], order=1, mode='nearest') for q in range(4)])
            L_ = LAB[np.clip(pr.astype(int), 0, Hh - 1), np.clip(pc.astype(int), 0, Wd - 1)]
            R_, G_, B_, N_ = DN
            nd = (N_ - R_) / np.maximum(N_ + R_, 1)
            veg = binary_dilation(nd > 0.12, iterations=1)
            seen = inside & (L_ == i + 1)
            st = seen & inner & ~veg
            if st.sum() < max(20, 0.35 * inner.sum()): n_skip += 1; continue
            Ldn = (R_ + G_ + B_) / 3
            p75 = np.percentile(Ldn[st], 75)
            shadow = st & ((Ldn - dark) < 0.5 * (p75 - dark))
            lit = st & ~shadow
            if lit.sum() < 15: n_skip += 1; continue
            A = np.stack([F[q](DN[q]).astype(np.float32) for q in range(3)])
            # b. baked shade relit by the roof's own lit/shade ratio (soft edge)
            if shadow.sum() >= 6:
                ratio = np.clip(np.median(A[:, lit], 1) / np.maximum(np.median(A[:, shadow], 1), 1e-3), 1.0, 8.0)
                sm = gaussian_filter(shadow.astype(np.float32), 1.0) * st
                A = A * (1.0 + sm[None] * (ratio[:, None, None] - 1.0))
            # a. trees and hidden parts: the roof's own colour nearby (then extrapolated past the eaves)
            Af = np.stack([_normconv(A[q], st, 2.0 / RES)[0] for q in range(3)])
            A = np.where(st[None], A, Af)
            Y_ = _lum(A); Ym = float(np.median(Y_[st]))
            # b'. the photo's broad light flattened (noon sun on the slopes; vignetting, haze)
            sig, k_ = (1.0 / RES, 1.0) if pitched else (2.5 / RES, 0.5)
            Yb = _normconv(Y_, buf, sig)[0]
            A = A * np.clip((Ym / np.maximum(Yb, 1e-4)) ** k_, 0.6, 1.8)[None]
            # d. a mild unsharp mask (0.6 m photo on a 0.3 m grid)
            Y_ = _lum(A); A = A * np.clip((Y_ / np.maximum(gaussian_filter(Y_, 0.6 / RES, mode='nearest'), 1e-4)) ** 0.6, 0.7, 1.4)[None]
            # c. the colour: chroma variation softened; the roof's measured colour as its median
            Y_ = np.maximum(_lum(A), 1e-4); med = np.median(A[:, st], 1); mc = med / max(_lum(med), 1e-4)
            A = Y_[None] * (mc[:, None, None] + 0.8 * (A / Y_[None] - mc[:, None, None]))
            if RATIO:
                from scipy.ndimage import grey_opening, grey_closing
                if pitched: n_skip += 1; continue
                med = np.maximum(np.median(A[:, st], 1), 1e-4); Rt = A / med[:, None, None]
                Yr = np.maximum(_lum(Rt), 1e-4); Yc = grey_closing(grey_opening(Yr, size=5), size=5)
                Rt = gaussian_filter(Rt * (Yc / Yr)[None], (0, 1.0, 1.0), mode='nearest')
                Yr = np.maximum(_lum(Rt), 1e-4); Rt = Yr[None] * (1.0 + 0.6 * (Rt / Yr[None] - 1.0))
                out = np.empty((hh, w, 4), np.uint8)
                out[..., :3] = (np.clip(0.5 * Rt, 0, 1).transpose(1, 2, 0) * 255 + 0.5).astype(np.uint8); out[..., 3] = 255
                win = M[gy0:gy1, gx0:gx1]; wr = inside | (buf & (win[..., 3] == 0)); win[wr] = out[wr]
                n_ok += 1; continue
            if m is not None:
                tg = _target(m, pitched); med = np.maximum(np.median(A[:, st], 1), 1e-4)
                A = A * np.clip(tg / med, 0.35, 3.0)[:, None, None]
            out = np.empty((hh, w, 4), np.uint8)
            out[..., :3] = (np.clip(A, 0, 1).transpose(1, 2, 0) ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)
            out[..., 3] = 255
            win = M[gy0:gy1, gx0:gx1]
            wr = inside | (buf & (win[..., 3] == 0))
            win[wr] = out[wr]
            n_ok += 1
        print(f'  {name} block {bc},{br}: {len(ii)} ({time.time() - t0:.0f}s)', flush=True)
    M.flush()
    print(name, 'baked', n_ok, 'skipped', n_skip, f'{time.time() - t0:.0f}s', flush=True)
    return name, n_ok, n_skip

def bake(*only):
    from multiprocessing import get_context
    g = _load(); mosaic('w+')
    ks = [k for k, it in enumerate(g['its']) if not only or any(o in it['path'] for o in only)]
    with get_context('fork').Pool(int(os.environ.get('RN_PROCS', 4))) as p:
        for r in p.imap_unordered(bake_item, ks): print('done', r, flush=True)

def items_for(x0, y0, x1, y1):
    """the items owning buildings in a box (for a partial bake)"""
    g = _load(); B, own = g['B'], g['own']
    ks = {int(own[i]) for i, b in enumerate(B) if x0 <= b['cx'] <= x1 and y0 <= b['cy'] <= y1 and own[i] >= 0}
    return [os.path.basename(g['its'][k]['path'])[:-4] for k in sorted(ks)]

# ── a box of the mosaic ────────────────────────────────────────────────────
def window(x0, y0, x1, y1):
    M = mosaic('r')
    c0, c1 = int(math.floor((x0 - X0) / RES)), int(math.ceil((x1 - X0) / RES))
    r0, r1 = int(math.floor((Y1 - y1) / RES)), int(math.ceil((Y1 - y0) / RES))
    out = np.zeros((r1 - r0, c1 - c0, 4), np.uint8)
    a0, a1, b0, b1 = max(0, c0), min(GW, c1), max(0, r0), min(GH, r1)
    if a1 > a0 and b1 > b0: out[b0 - r0:b1 - r0, a0 - c0:a1 - c0] = M[b0:b1, a0:a1]
    return out, (X0 + c0 * RES, Y1 - r1 * RES, X0 + c1 * RES, Y1 - r0 * RES)

def crop(x0, y0, x1, y1, out, res=None):
    """the render's image of a box: rows north->south (Blender's v = 0 is the
    south edge), its exact world box in out.json. Over 16k px a side (Metal's
    texture limit) it is downsampled"""
    from PIL import Image
    x0, y0, x1, y1 = map(float, (x0, y0, x1, y1))
    a, bb = window(x0, y0, x1, y1)
    im = Image.fromarray(a, 'RGBA')
    s = max(a.shape[0], a.shape[1]) / 16000.0
    if s > 1: im = im.resize((int(a.shape[1] / s), int(a.shape[0] / s)), Image.BILINEAR)
    im.save(out, compress_level=1)
    json.dump(dict(box=bb, w=im.width, h=im.height, frac=float((a[..., 3] > 0).mean())), open(out + '.json', 'w'))
    print(out, im.size, bb, 'roof fraction', round(float((a[..., 3] > 0).mean()), 3))

def top(x0, y0, x1, y1, out):
    """NAIP (the same albedo curve, x1.4 like ground_prep.naip_rgb) | the bake over it"""
    from PIL import Image
    x0, y0, x1, y1 = map(float, (x0, y0, x1, y1))
    p = RP.naip_patch(x0, y0, x1, y1, RES)
    g = _load(); it = RP.pick_item(*RP.eng_to_utm((x0 + x1) / 2, (y0 + y1) / 2)); c = g['cal'][os.path.basename(it['path'])[:-4]]
    dLa = np.mean(c['asphalt']) - c['darkL']
    A = np.stack([RP.curve(c['asphalt'][q] - dLa, c['asphalt'][q], c['white'][q], RP.ANCH[1] * RP.ASPH_TINT[q])(p[q]) for q in range(3)]).transpose(1, 2, 0)
    nai = (np.clip(A * 1.4, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)
    a, _ = window(x0, y0, x1, y1); a = a[:nai.shape[0], :nai.shape[1]]
    al = (a[..., 3:4] > 0)
    bk = np.where(al, a[..., :3], (nai * 0.45).astype(np.uint8))
    # the bake shown at the same x1.4 exposure as the photo
    bk = np.where(al, (np.clip(((a[..., :3] / 255.0) ** 2.2) * 1.4, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8), bk)
    Image.fromarray(np.concatenate([nai, np.full((nai.shape[0], 6, 3), 255, np.uint8), bk], 1)).save(out, quality=90)
    print(out)

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'bake': bake(*sys.argv[2:])
    if cmd == 'items': print(' '.join(items_for(*map(float, sys.argv[2:6]))))
    if cmd == 'crop': crop(*sys.argv[2:8])
    if cmd == 'top': top(*sys.argv[2:7])
