"""Data for water2_hq.py: the sea's own colour, its wind, and the shore.

The render's sea was one saturated blue: a near-black body under a 4 % sky
mirror (IOR 1.5), the same fine ripple everywhere. What the bay really is,
seen from above on a September afternoon: a turbid green-grey, lighter and
browner over its shallows and mudflats, a dark slate-teal in the Golden
Gate's channel, and west of the Gate a deeper slate blue-green Pacific; wind
lanes and calm lees, current lines through the Gate and round Alcatraz; a
wide pale beach with breakers from the Cliff House to Fort Funston.

Outputs (under /Users/daniel/code/qipu-render-work/water/, read by
water2_hq.py, frozen by mksnap.sh):
  sea_col.png  16-bit RGB, linear albedo of the water body / ALB_K, on the
               grid of sea.json (EXT, 8 m, row 0 = north). From the depth
               (bathy_8m.npy: USGS 3DEP topobathy) and where the water is
               (bay or Pacific), with km-scale turbidity plumes;
  sea_fld.png  16-bit RGB on the same grid: R wind (0 calm .. 1 ruffled,
               from the fetch upwind of the afternoon westerly, with gusts),
               G current lines (line-integral convolution along the depth
               contours where the tide runs), B exposure (1 the open
               Pacific, ~0.8 in the Golden Gate's channel, fading into the
               central bay, ~0 in the sheltered south bay): the swell and
               the whitecaps follow it;
  sea.json     the grid;
  shore.npz    the shore mesh: vertices, triangles and per-vertex fields
               (signed distance to the OSM coastline, beach polygons, surf
               exposure) for the beaches, the surf zone and the flats.
Sources: USGS 3DEP (public domain); OpenStreetMap natural=coastline,
beach, sand, wetland (ODbL, (c) OpenStreetMap contributors), fetched to
water/src/shore_osm.json.
usage: python3 water2_prep.py
"""
import json, math, os, struct, zlib
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

W_ = '/Users/daniel/code/qipu-render-work'
OUT = os.environ.get('WATER_OUT', f'{W_}/water')     # work in progress: WATER_OUT=<side folder>
LM = f'{W_}/landmarks'
KX = 111320 * 0.790582709628753; KY = 111320.0
def proj(lon, lat): return (lon + 122.438) * KX, (lat - 37.76) * KY

EXT = (-13000.0, -11000.0, 13000.0, 15000.0); RES = 8.0
NX = int((EXT[2] - EXT[0]) / RES); NY = int((EXT[3] - EXT[1]) / RES)
ALB_K = 0.25                  # sea_col stores albedo / ALB_K
WIND_TO = np.array([0.94, -0.34]); WIND_TO /= np.linalg.norm(WIND_TO)   # the afternoon westerly, from ~290°

def png16(path, rgb):
    """16-bit RGB PNG (PIL cannot write one); rgb float 0..1, (h, w, 3)"""
    a = (np.clip(rgb, 0, 1) * 65535 + 0.5).astype('>u2')
    h, w, _ = a.shape
    raw = b''.join(b'\x00' + a[r].tobytes() for r in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 16, 2, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

RNG = np.random.default_rng(924)
def grf(sig_m, shape=(NY, NX), res=RES, down=8, aniso=(1.0, 1.0)):
    """a smooth gaussian random field, std 1, features ~sig_m metres
    (made on a coarse grid, upsampled); aniso = (y, x) stretch"""
    cy, cx = math.ceil(shape[0] / down) + 2, math.ceil(shape[1] / down) + 2
    n = RNG.standard_normal((cy, cx)).astype(np.float32)
    s = sig_m / (res * down)
    n = ndi.gaussian_filter(n, (s * aniso[0], s * aniso[1]), mode='wrap')
    n = ndi.zoom(n, down, order=3)[:shape[0], :shape[1]]
    return (n - n.mean()) / (n.std() + 1e-9)

def grid():
    xs = EXT[0] + (np.arange(NX) + 0.5) * RES; ys = EXT[3] - (np.arange(NY) + 0.5) * RES
    return np.meshgrid(xs.astype(np.float32), ys.astype(np.float32))

def sample_rows(A, x0, y1, res, X, Y, fill=np.nan, order=1):
    """sample a north-up raster A (x0 west edge, y1 north edge, res m) at world X, Y"""
    c = (X - x0) / res - 0.5; r = (y1 - Y) / res - 0.5
    ok = (c >= -0.5) & (c <= A.shape[1] - 0.5) & (r >= -0.5) & (r <= A.shape[0] - 0.5)
    out = ndi.map_coordinates(A, [np.clip(r, 0, A.shape[0] - 1), np.clip(c, 0, A.shape[1] - 1)], order=order, mode='nearest')
    return np.where(ok, out, fill).astype(np.float32)

# ── the land/water mask on the grid ──────────────────────────────────────────
def land_mask(X, Y):
    """1 land, 0 water: the OSM coastline (coast_land.npz, 4 m) wherever it
    reaches, the render's own mask (sea.png) only beyond it. (sea.png as the
    first word made the cove, China Basin and the slips 'land' at 8 m, and
    the whole Pacific south of y -5785, where the engine's mask is wrong:
    they took the colour of a shallow shore, brown — 24/09)"""
    L = np.zeros(X.shape, np.float32)
    z = np.load(f'{LM}/coast_land.npz')
    M = np.unpackbits(z['land'], axis=1)[:, :int(z['nx'])].astype(np.float32)
    cl = sample_rows(M, float(z['x0']), float(z['y1']), float(z['res']), X, Y, fill=np.nan, order=0)
    L = np.where(np.isnan(cl), 0.0, cl)
    g = json.load(open(f'{W_}/city/sea.json'))
    sp = np.asarray(Image.open(f'{W_}/city/sea.png'))[..., 0].astype(np.float32) / 255
    sm = sample_rows(sp, g['ox'], g['oy'] + g['h'], g['w'] / sp.shape[1], X, Y, fill=np.nan, order=1)
    L = np.where(np.isnan(cl), np.where(np.isnan(sm), 0.0, (sm < 0.5).astype(np.float32)), L)
    g['_sea_land'] = np.nan_to_num(sm, nan=1.0) < 0.5        # where the engine's mask says land
    return L, g

def depth(X, Y, L, g):
    b = json.load(open(f'{LM}/bathy_8m.json')); B = np.load(f'{LM}/bathy_8m.npy').astype(np.float32)
    Db = sample_rows(B, b['x0'], b['y1'], b['res'], X, Y, fill=np.nan)
    water = L < 0.5
    dist = ndi.distance_transform_edt(water) * RES
    # outside the bathymetry: the Pacific west of Point Bonita, Richardson
    # Bay (shallow) north of the square — blended, no seam (x < -3000 cut
    # Richardson Bay in two, 24/09)
    pw = smooth(-5500, -7000, X)
    Dh = pw * np.minimum(60, 2 + dist * 0.02) + (1 - pw) * np.minimum(8, 1 + dist * 0.006)
    # the bathymetry's own edge carried outward, blended into the heuristic
    # over 1.5 km, so the square's edge does not show in the colour
    Bc = ndi.gaussian_filter(np.nan_to_num(B), 4)
    De = sample_rows(Bc, b['x0'], b['y1'], b['res'], np.clip(X, b['x0'] + 8, b['x0'] + b['nx'] * 8 - 8),
                     np.clip(Y, b['y1'] - b['ny'] * 8 + 8, b['y1'] - 8))
    dx = np.maximum(np.maximum(b['x0'] - X, X - (b['x0'] + b['nx'] * 8)), 0)
    dy = np.maximum(np.maximum((b['y1'] - b['ny'] * 8) - Y, Y - b['y1']), 0)
    w = np.clip(1 - np.hypot(dx, dy) / 1500, 0, 1)
    Do = w * De + (1 - w) * Dh
    # the bathymetry reads 0 m wherever the engine's mask said land (it was
    # made to meet that shore): no data there, the OSM coast decides
    # and it sinks to 0 toward that false shore for a few hundred metres:
    # blended out over 400 m round it
    bad = g['_sea_land'] & (L < 0.5)
    wb_ = np.clip(ndi.gaussian_filter(ndi.binary_dilation(bad, iterations=40).astype(np.float32), 12) * 1.5, 0, 1)
    D0 = np.where(np.isnan(Db), Do, Db)
    # filled from the good bathymetry round it (normalised convolution), not
    # from a slope rule (that drew a darker slab, prev_col)
    ok_ = (wb_ < 0.05) & (L < 0.5)
    Df = ndi.gaussian_filter(np.where(ok_, D0, 0), 45) / np.maximum(ndi.gaussian_filter(ok_.astype(np.float32), 45), 1e-4)
    Df = np.where(ndi.gaussian_filter(ok_.astype(np.float32), 45) > 1e-3, Df, Dh)
    D = wb_ * Df + (1 - wb_) * D0
    return np.where(water, D, 0).astype(np.float32), dist

# the water's own colour (linear albedo of the body, under a 2 % sky mirror)
# by depth, m. The bay: turbid, sediment-laden (remote-sensing reflectance of
# SF Bay peaks in the green-yellow): tan-olive over the flats, olive-grey
# over the shoals, green-grey over the bay floor, slate in the channels.
# The Pacific off the city: clearer, green-blue, darker offshore.
# FINAL linear albedos (the shader no longer re-tints them; 25/09 beauty
# pass). The bay: teal-green over its shallows (never tan: that read as mud),
# a clear green-grey over its floor, deep blue-green in the channels and the
# Gate. The Pacific: deeper and bluer offshore.
BAY = [(0.0, (0.062, 0.108, 0.074)), (2.0, (0.054, 0.098, 0.066)), (4.0, (0.048, 0.088, 0.058)),
       (8.0, (0.041, 0.077, 0.050)), (15.0, (0.032, 0.064, 0.047)), (30.0, (0.021, 0.050, 0.046)), (60.0, (0.013, 0.038, 0.044))]
PAC = [(0.0, (0.052, 0.094, 0.072)), (5.0, (0.032, 0.068, 0.066)), (15.0, (0.019, 0.050, 0.063)),
       (30.0, (0.012, 0.038, 0.060)), (60.0, (0.008, 0.029, 0.056))]
def ramp(D, stops):
    xs = [s[0] for s in stops]
    return np.stack([np.interp(D, xs, [s[1][k] for s in stops]) for k in range(3)], -1).astype(np.float32)

def colour(X, Y, D, dist, L):
    P = smooth(-2300, -5200, X + 450 * grf(1500)).astype(np.float32)
    A = ramp(D, BAY) * (1 - P[..., None]) + ramp(D, PAC) * P[..., None]
    # turbidity: plumes 0.3-2 km, stronger in the bay and over its shallows
    t = 0.75 * grf(900) + 0.45 * grf(250)
    tb = (1 - P) * (0.6 + 0.4 * smooth(20, 3, D))
    A *= (1 + 0.09 * t * (0.08 + 0.92 * tb))[..., None]      # (little in the Pacific: its mottle read as haze)
    A += (np.clip(t, 0, None) * tb * 0.2)[..., None] * np.array([0.008, 0.012, 0.004], np.float32)
    # the south-east shallows and flats (India Basin, Heron's Head, Hunters
    # Point, Candlestick): browner, the mud showing through
    se = smooth(1500, 3500, X) * smooth(-500, -2000, Y)
    mud = se * smooth(2.5, 0.2, D) * (0.55 + 0.25 * grf(200))
    A = A * (1 - mud[..., None]) + mud[..., None] * np.array([0.080, 0.088, 0.052], np.float32)   # olive, subtle
    # the Pacific's surf-stirred band: sand in suspension along the beaches
    # (along the beaches only: on the Marin and Lands End cliffs it drew a halo)
    sb = P * np.exp(-dist / 180) * 0.55 * ndi.gaussian_filter(((X > -7400) & (X < -5600) & (Y < 1990)).astype(np.float32), 20)
    A = A * (1 - sb[..., None]) + sb[..., None] * np.array([0.066, 0.100, 0.074], np.float32)
    return A, P

def fill_land(F, L):
    """land cells take the nearest water cell's value (no dark bleed at the shore)"""
    idx = ndi.distance_transform_edt(L >= 0.5, return_distances=False, return_indices=True)
    return F[tuple(idx)]

def wind(X, Y, L, D, P):
    # fetch upwind of the westerly, on a 32 m grid
    k = 4; Lc = L[::k, ::k] >= 0.5; ny, nx = Lc.shape; st = RES * k
    fetch = np.zeros(Lc.shape, np.float32); alive = ~Lc
    rr, cc = np.mgrid[0:ny, 0:nx].astype(np.float32)
    up = -WIND_TO
    for s in range(1, 160):
        r_ = np.clip(np.round(rr - up[1] * s), 0, ny - 1).astype(int); c_ = np.clip(np.round(cc + up[0] * s), 0, nx - 1).astype(int)
        out = (rr - up[1] * s < 0) | (cc + up[0] * s < 0) | (rr - up[1] * s > ny - 1) | (cc + up[0] * s > nx - 1)
        alive &= out | ~Lc[r_, c_]
        fetch += alive * st
    fetch = ndi.gaussian_filter(fetch, 1.5)
    Wf = ndi.zoom(1 - np.exp(-fetch / 1100), k, order=1)[:NY, :NX]
    gust = grf(650, aniso=(0.45, 1.0)); paws = grf(140)
    Wd = np.clip(Wf * (0.66 + 0.24 * gust + 0.14 * paws), 0, 1)
    return Wd.astype(np.float32)

def currents(X, Y, D, L):
    """current lines: a line-integral convolution of noise along the depth
    contours (the tide runs along them), where the tide runs hard: the
    Golden Gate, round Alcatraz, the central bay"""
    S = smooth(4, 22, D) * smooth(3000, 4200, Y) * smooth(-7400, -6800, X) * smooth(7800, 7000, X)
    rows = np.nonzero(S.max(1) > 0)[0]; cols = np.nonzero(S.max(0) > 0)[0]
    out = np.zeros(D.shape, np.float32)
    if not len(rows): return out
    r0, r1, c0, c1 = rows[0], rows[-1] + 1, cols[0], cols[-1] + 1
    Dz = ndi.gaussian_filter(D[r0:r1, c0:c1], 12)
    gy, gx = np.gradient(Dz)                                   # rows, cols
    tx, ty = -gy, gx                                           # along the contours (col, row)
    n = np.hypot(tx, ty) + 1e-6; tx /= n; ty /= n
    # where the bottom is flat the flow follows the channel's axis (east-west)
    a = smooth(0.0005, 0.004, n)
    tx = a * tx + (1 - a) * 1.0; ty = a * ty; n = np.hypot(tx, ty) + 1e-6; tx /= n; ty /= n
    h, w = Dz.shape
    noise = ndi.zoom(RNG.standard_normal((h // 3 + 2, w // 3 + 2)).astype(np.float32), 3, order=1)[:h, :w]
    acc = np.zeros((h, w), np.float32); wsum = 0.0
    rr, cc = np.mgrid[0:h, 0:w].astype(np.float32)
    for sgn in (1, -1):
        pr, pc = rr.copy(), cc.copy()
        for s in range(28):
            vr = ndi.map_coordinates(ty, [pr, pc], order=1, mode='nearest'); vc = ndi.map_coordinates(tx, [pr, pc], order=1, mode='nearest')
            pr += sgn * 1.4 * vr; pc += sgn * 1.4 * vc
            wk = math.exp(-(s / 20.0) ** 2)
            acc += wk * ndi.map_coordinates(noise, [pr, pc], order=1, mode='nearest'); wsum += wk
    lic = acc / wsum; lic = (lic - lic.mean()) / (lic.std() + 1e-9)
    lines = smooth(0.9, 1.8, lic) * S[r0:r1, c0:c1]
    out[r0:r1, c0:c1] = lines
    return out

# ── the shore mesh ───────────────────────────────────────────────────────────
OSM = f'{OUT}/src/shore_osm.json'
def rings():
    d = json.load(open(OSM)); out = []
    for e in d['elements']:
        t = e.get('tags', {})
        if e['type'] == 'way' and e.get('geometry'):
            rs = [[proj(p['lon'], p['lat']) for p in e['geometry']]]
        elif e['type'] == 'relation':
            rs = [[proj(p['lon'], p['lat']) for p in m['geometry']] for m in e.get('members', []) if m.get('geometry') and m.get('role') in ('outer', '')]
            # outer ways of a multipolygon come in pieces: join them end to end
            rs = join(rs)
        else: continue
        out.append((e['id'], t, [r for r in rs if len(r) >= 3]))
    return out

def join(parts):
    parts = [list(p) for p in parts]; out = []
    while parts:
        cur = parts.pop(0)
        grew = True
        while grew and math.dist(cur[0], cur[-1]) > 0.5:
            grew = False
            for i, p in enumerate(parts):
                if math.dist(cur[-1], p[0]) < 0.5: cur += p[1:]; parts.pop(i); grew = True; break
                if math.dist(cur[-1], p[-1]) < 0.5: cur += p[::-1][1:]; parts.pop(i); grew = True; break
        out.append(cur)
    return out

def area(r):
    x = np.array([p[0] for p in r]); y = np.array([p[1] for p in r])
    return 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))

# zones: bbox, the coast band (sd from .. to, m), surf exposure 0..1
ZONES = [
    dict(name='ocean_beach', box=(-7300, -9800, -5000, 1990), band=(-280, 12), expo=1.0),
    dict(name='baker_china', box=(-4800, 3050, -3600, 4800), band=(-110, 0), expo=0.55),
    dict(name='crissy', box=(-3000, 4900, -900, 5500), band=(-40, 0), expo=0.15),
    dict(name='aquatic_park', box=(1100, 5150, 1550, 5450), band=(-12, 0), expo=0.04),
    dict(name='marin', box=(-7000, 6900, -3700, 7500), band=(-100, 0), expo=0.6),
    dict(name='flats_se', box=(4500, -4300, 6300, -2250), band=None, expo=0.0),
    dict(name='flats_crissy', box=(-2000, 4750, -1200, 5100), band=None, expo=0.0),
]
MUD_IDS = {16613457, 958745402, 934490103, 12622483}
MARSH_IDS = {19097243, 711887739, 711887740, 1291176426, 1291185205}
STEP = 3.0

def coast_sd():
    z = np.load(f'{LM}/coast_land.npz')
    return z['sd_dm'].astype(np.float32) / 10.0, float(z['x0']), float(z['y1']), float(z['res'])

def shore():
    SD, sx0, sy1, sres = coast_sd()
    feats = rings()
    V, T, A = [], [], []; nv = 0
    for Z in ZONES:
        x0, y0, x1, y1 = Z['box']
        # polygons of this zone: beaches, big sand (not golf bunkers), flats, marsh
        polys = {'sand': [], 'mud': [], 'marsh': []}
        for oid, t, rs in feats:
            nat = t.get('natural')
            for r in rs:
                xs = [p[0] for p in r]; ys = [p[1] for p in r]
                if max(xs) < x0 or min(xs) > x1 or max(ys) < y0 or min(ys) > y1: continue
                if oid in MUD_IDS: polys['mud'].append(r)
                elif oid in MARSH_IDS: polys['marsh'].append(r)
                elif nat == 'beach' or (nat == 'sand' and area(r) > 15000): polys['sand'].append(r)
        # 1 m rasters of the polygons -> signed distance fields (m, + inside)
        pad = 10
        rw, rh = int(x1 - x0) + 2 * pad, int(y1 - y0) + 2 * pad
        sdf = {}
        for k, rs in polys.items():
            if not rs: sdf[k] = None; continue
            im = Image.new('L', (rw, rh), 0); dr = ImageDraw.Draw(im)
            for r in rs: dr.polygon([(p[0] - x0 + pad, y1 + pad - p[1]) for p in r], fill=1)
            m = np.asarray(im).astype(bool)
            sdf[k] = (ndi.distance_transform_edt(m) - ndi.distance_transform_edt(~m)).astype(np.float32)
        nx = int((x1 - x0) / STEP) + 1; ny = int((y1 - y0) / STEP) + 1
        xs = x0 + np.arange(nx) * STEP; ys = y0 + np.arange(ny) * STEP
        X, Y = np.meshgrid(xs, ys)
        sd = sample_rows(SD, sx0, sy1, sres, X, Y, fill=np.nan)
        # the distance transform of the 4 m coast raster zigzags along a
        # slanting shore (the surf lines drew its 4 m steps, wat4): smoothed
        # over ~10 m; a distance field stays one where it is straight
        ok_ = ~np.isnan(sd)
        if ok_.any():
            num = ndi.gaussian_filter(np.where(ok_, sd, 0.0), 3.5); den = ndi.gaussian_filter(ok_.astype(np.float32), 3.5)
            sd = np.where(ok_, num / np.maximum(den, 1e-6), np.nan).astype(np.float32)
        def at(F):
            if F is None: return np.full(X.shape, -30.0, np.float32)
            return sample_rows(F, x0 - pad, y1 + pad, 1.0, X, Y, fill=-30.0)
        ps, pm, pk = at(sdf['sand']), at(sdf['mud']), at(sdf['marsh'])
        poly = np.maximum(np.maximum(ps, pm), pk)
        if Z['band'] is not None:
            b0, b1 = Z['band']
            sdn = np.nan_to_num(sd, nan=1e4)
            band = np.clip((b1 - sdn) / 3.0 + 0.5, 0, 1) * (sdn > b0 - 2 * STEP)
            # the band's lateral ends and seaward edge: no foam there
            lat = np.minimum(np.minimum(X - x0, x1 - X), np.minimum(Y - y0, y1 - Y))
            fade = smooth(0, 200, lat) * smooth(b0, b0 * 0.65, sdn)
        else:
            band = np.zeros(X.shape, np.float32); fade = np.zeros(X.shape, np.float32); sdn = np.nan_to_num(sd, nan=0.0)
        vis = np.maximum(np.clip(poly / 1.5 + 0.5, 0, 1), band)
        keep_n = vis > 0.0
        kc = keep_n[:-1, :-1] | keep_n[:-1, 1:] | keep_n[1:, :-1] | keep_n[1:, 1:]
        if not kc.any(): continue
        used = np.zeros(X.shape, bool)
        used[:-1, :-1] |= kc; used[:-1, 1:] |= kc; used[1:, :-1] |= kc; used[1:, 1:] |= kc
        idx = np.full(X.shape, -1, np.int64); idx[used] = np.arange(used.sum()) + nv
        jj, ii = np.nonzero(kc)
        a, b_, c, d_ = idx[jj, ii], idx[jj, ii + 1], idx[jj + 1, ii + 1], idx[jj + 1, ii]
        T.append(np.concatenate([np.stack([a, b_, c], 1), np.stack([a, c, d_], 1)]))
        V.append(np.stack([X[used], Y[used]], 1))
        # attributes: sd (coast, m), vis (0..1 alpha), sand/mud/marsh (poly sdf, m), band (0..1), expo*fade
        A.append(np.stack([sdn[used], vis[used], ps[used], pm[used], pk[used], band[used], (Z['expo'] * fade)[used]], 1))
        print(f"shore {Z['name']}: {used.sum()} vertices, {2 * len(jj)} triangles, polys {[len(v) for v in polys.values()]}", flush=True)
        nv += int(used.sum())
    V = np.concatenate(V).astype(np.float32); T = np.concatenate(T).astype(np.int32); A = np.concatenate(A).astype(np.float32)
    np.savez_compressed(f'{OUT}/shore.npz', xy=V, tris=T, attr=A,
                        attr_names=np.array(['sd', 'vis', 'sand', 'mud', 'marsh', 'band', 'surf']))
    print('shore.npz', len(V), 'vertices', len(T), 'triangles', flush=True)

GATE = proj(-122.478, 37.8105)          # the Golden Gate's narrows
def exposure(X, Y, D, P):
    """how open the water is to the ocean's swell and the full westerly"""
    dg = np.hypot(X - GATE[0], Y - GATE[1])
    ch = smooth(6, 22, D) * np.exp(-dg / 3500.0) * 0.85
    cb = smooth(4, 14, D) * np.exp(-dg / 8000.0) * 0.4
    return np.clip(np.maximum(P, np.maximum(ch, cb)), 0, 1).astype(np.float32)

def shore_sd():
    """shore_sd.png: 16-bit grey on coast_land's own 4 m grid (json in
    shore_sd.json): metres from the OSM coastline on the water side, 0..64
    (the piers are land there, unlike the engine's mask): the soft wash and
    the dark wet line along the walls"""
    z = np.load(f'{LM}/coast_land.npz'); SD = z['sd_dm'].astype(np.float32) / 10.0
    v = np.clip(-SD, 0, 64) / 64.0
    png16(f'{OUT}/shore_sd.png', np.repeat(v[..., None], 3, -1))
    json.dump(dict(x0=float(z['x0']), y1=float(z['y1']), res=float(z['res']), nx=int(SD.shape[1]), ny=int(SD.shape[0]), vmax=64.0),
              open(f'{OUT}/shore_sd.json', 'w'))

def main():
    os.makedirs(OUT, exist_ok=True)
    X, Y = grid()
    L, g = land_mask(X, Y); print('land share', float(L.mean()), flush=True)
    D, dist = depth(X, Y, L, g); print('depth', np.percentile(D[L < 0.5], [5, 50, 95]), flush=True)
    # the bathymetry is forced to 0 m at the render's shore: along every
    # seawall and pier that drew a tan 'mudflat' halo (Yerba Buena, the
    # Embarcadero, wat18). The colour takes the depth found 30 m out instead;
    # real flats stay shallow there, walls get their 8-12 m.
    far = (dist >= 30.0) | (L >= 0.5)
    idx = ndi.distance_transform_edt(~far, return_distances=False, return_indices=True)
    Dc = np.where(L < 0.5, np.maximum(D, D[tuple(idx)]), D)
    # basins, the cove, channels and the open sea never read as shallow
    # sand: 4 m at least, except where the shallows are real — the south-east
    # flats, Crissy Field, Aquatic Park, Ocean Beach, Richardson Bay
    real = np.zeros(X.shape, bool)
    for bx in ((4300, -6400, 8000, -2000), (-2000, 4700, -900, 5200), (1100, 5150, 1550, 5450),
               (-7300, -9800, -5000, 1990), (-4000, 8740, 13000, 15000)):
        real |= (X > bx[0]) & (X < bx[2]) & (Y > bx[1]) & (Y < bx[3])
    real = ndi.gaussian_filter(real.astype(np.float32), 25) > 0.5
    Dc = np.where(real, Dc, np.maximum(Dc, 6.0))
    A, P = colour(X, Y, Dc, dist, L)
    Wd = wind(X, Y, L, D, P); print('wind', np.percentile(Wd[L < 0.5], [5, 50, 95]), flush=True)
    Cu = currents(X, Y, D, L); print('current lines share', float((Cu > 0.3).mean()), flush=True)
    Ex = exposure(X, Y, D, P); print('exposure', np.percentile(Ex[L < 0.5], [5, 50, 95]), flush=True)
    A = fill_land(A, L); F = fill_land(np.stack([Wd, Cu, Ex], -1), L)
    png16(f'{OUT}/sea_col.png', A / ALB_K)
    png16(f'{OUT}/sea_fld.png', F)
    json.dump(dict(x0=EXT[0], y0=EXT[1], x1=EXT[2], y1=EXT[3], res=RES, nx=NX, ny=NY, alb_k=ALB_K,
                   wind_to=WIND_TO.tolist()), open(f'{OUT}/sea.json', 'w'))
    # previews (small): the albedo x4 in sRGB, the fields
    s = 6
    prev = np.clip(A[::s, ::s] * 4, 0, 1) ** (1 / 2.2)
    prev[L[::s, ::s] >= 0.5] = (0.35, 0.33, 0.28)
    Image.fromarray((prev * 255).astype(np.uint8)).save(f'{OUT}/prev_col.jpg', quality=85)
    Image.fromarray((np.clip(F[::s, ::s], 0, 1) * 255).astype(np.uint8)).save(f'{OUT}/prev_fld.jpg', quality=85)
    print('sea maps written', flush=True)
    shore_sd()
    shore()

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == 'shore': shore()
    else: main()
