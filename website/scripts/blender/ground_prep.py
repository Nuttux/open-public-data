"""GROUND COVER FROM THE AIR: what every open patch of ground in San Francisco
is (sand, watered lawn, dry grass, scrub, trees, bare earth, asphalt,
concrete, gravel, marsh, water), classified from USDA NAIP 2022 (public
domain, 60 cm, R G B + near infrared), on a 1 m grid in the engine frame.

  python3 ground_prep.py build            # -> qipu-render-work/ground/ground_cls.npy + ground_meta.json
  python3 ground_prep.py probe X0 Y0 X1 Y1 out.jpg   # NAIP | classes, top down, 1 m
  python3 ground_prep.py refine [RAW OUT]  # shadow 'water' filled, Ocean Beach's lower beach -> wet sand
  python3 ground_prep.py tone             # -> ground_tone.npy: the photo's own detail, 0.5 m
The render reads both through ground_hq.py (hill_ground, hq_scene.py).

Imagery and its reprojection: roofs_prep.py (roofs/README.txt). Each pixel
is read from the quarter quad it lies deepest in, turned into linear albedo
with that quad's calibration (roofs/calib.json: street asphalt -> 0.11,
the brightest roofs -> 0.75), and classified with NDVI, lightness, hue and
the NIR's roughness over 3 m. Buildings (their footprints swept along their
measured lean: NAIP leans east, a roof lands a few metres off its footprint)
are cut out and the ground behind them filled from the nearest open ground.
Memory: 1 km blocks at 0.5 m (a few hundred MB at most).
"""
import json, os, sys, math, time
import numpy as np
import roofs_prep as rp

OUT = os.environ.get('GROUND_DIR', '/Users/daniel/code/qipu-render-work/ground')
RES = 1.0                        # the stored grid (m)
SUB = 0.5                        # the classification grid (m)
BLK = 1000.0                     # a block (m)
# the class codes (uint8); 0 = no data (outside NAIP, or a building)
CLS = ['none', 'sand', 'lawn', 'drygrass', 'scrub', 'tree', 'soil', 'asphalt', 'concrete', 'gravel', 'marsh', 'water', 'wetsand']
CI = {n: k for k, n in enumerate(CLS)}
COL = {'none': (0, 0, 0), 'sand': (240, 220, 160), 'lawn': (60, 200, 60), 'drygrass': (205, 170, 90), 'scrub': (110, 120, 50),
       'tree': (20, 80, 30), 'soil': (150, 95, 60), 'asphalt': (60, 60, 65), 'concrete': (200, 200, 205), 'gravel': (150, 140, 150),
       'marsh': (80, 140, 120), 'water': (40, 80, 170), 'wetsand': (170, 150, 110)}

_CAL = None
def calib():
    global _CAL
    if _CAL is None: _CAL = json.load(open(f'{rp.W}/calib.json'))['calib']
    return _CAL

def _curves(name):
    c = calib()[name]; dL = np.mean(c['asphalt']) - c['darkL']
    F = [rp.curve(c['asphalt'][k] - dL, c['asphalt'][k], c['white'][k], rp.ANCH[1] * rp.ASPH_TINT[k]) for k in range(3)]
    off = [c['asphalt'][k] - dL for k in range(3)]
    return F, off, dL

def patch(x0, y0, x1, y1, res=SUB):
    """NAIP on the engine grid (row 0 = SOUTH, like the render's images):
    DN (4, ny, nx) float32, linear albedo (3, ny, nx), NDVI and a valid mask.
    Each pixel from the quad it lies deepest in (one flight date per quad)."""
    from scipy.ndimage import map_coordinates
    nx, ny = int(round((x1 - x0) / res)), int(round((y1 - y0) / res))
    X, Y = np.meshgrid(x0 + (np.arange(nx) + 0.5) * res, y0 + (np.arange(ny) + 0.5) * res)
    ux, uy = rp.eng_to_utm(X.ravel(), Y.ravel()); ux = np.asarray(ux); uy = np.asarray(uy)
    its = rp.item_index()
    depth = np.stack([np.minimum(np.minimum(ux - it['b'][0], it['b'][2] - ux), np.minimum(uy - it['b'][1], it['b'][3] - uy)) for it in its])
    own = depth.argmax(0); ok = depth.max(0) > 2.0
    DN = np.zeros((4, nx * ny), np.float32); AL = np.zeros((3, nx * ny), np.float32); NIRn = np.zeros(nx * ny, np.float32)
    for k, it in enumerate(its):
        m = ok & (own == k)
        if not m.any(): continue
        a, c0, r0 = rp.read_utm(it, ux[m].min() - 3, uy[m].min() - 3, ux[m].max() + 3, uy[m].max() + 3)
        tr = it['tr']; col = (ux[m] - tr.c) / tr.a - 0.5 - c0; row = (uy[m] - tr.f) / tr.e - 0.5 - r0
        for b in range(4): DN[b, m] = map_coordinates(a[b].astype(np.float32), [row, col], order=1, mode='nearest')
        del a
        F, off, dL = _curves(os.path.basename(it['path'])[:-4])
        for b in range(3): AL[b, m] = F[b](DN[b, m])
        # NIR: the same haze offset below the band's own asphalt level (~ the red's)
        NIRn[m] = np.clip((DN[3, m] - (calib()[os.path.basename(it['path'])[:-4]]['asphalt'][0] - dL)), 1, None)
    Rn = np.clip(DN[0] - np.array([_curves(os.path.basename(its[k]['path'])[:-4])[1][0] for k in range(len(its))])[own], 1, None)
    ndvi = (NIRn - Rn) / (NIRn + Rn)
    sh = (ny, nx)
    return DN.reshape((4,) + sh), AL.reshape((3,) + sh), ndvi.reshape(sh).astype(np.float32), ok.reshape(sh)

# ── buildings, swept along their lean ───────────────────────────────────────
_B = None
def _buildings():
    global _B
    if _B is None:
        import city_data, glob
        raw = {}
        for q in glob.glob(f'{rp.W}/raw/*.json'):
            for r in json.load(open(q))['rows']: raw[r['gid']] = (r['sx'], r['sy'])
        BB = city_data.buildings(-12000, -12000, 12000, 12000)
        _B = [(np.asarray(b['ring'], np.float64), raw.get(b['gid'], (0.0, 0.0)), b['h']) for b in BB]
        _B = [(r, s, h, r[:, 0].min(), r[:, 1].min(), r[:, 0].max(), r[:, 1].max()) for r, s, h in _B]
    return _B

def bmask(x0, y0, x1, y1, res=SUB, sweep=True):
    """1 where a building (or its roof as the photo leans it) covers the grid"""
    from PIL import Image, ImageDraw
    nx, ny = int(round((x1 - x0) / res)), int(round((y1 - y0) / res))
    im = Image.new('L', (nx, ny), 0); d = ImageDraw.Draw(im)
    for r, (sx, sy), h, a, b, c, e in _buildings():
        if c < x0 - 60 or a > x1 + 60 or e < y0 - 60 or b > y1 + 60: continue
        ts = (0.0,) if not sweep or math.hypot(sx, sy) < 0.3 else np.linspace(0, 1, max(2, int(math.hypot(sx, sy) / 0.5) + 1))
        for t in ts:
            d.polygon([((x - x0 + t * sx) / res, (y - y0 + t * sy) / res) for x, y in r], fill=1)
    return np.asarray(im, np.uint8)         # row 0 = south (y0)

# ── OpenStreetMap hints (ground/osm/landcover.json, Overpass 2026-09-24) ─────
OSM = f'{OUT}/osm/landcover.json'
def _osm_cat(t):
    n, lu, le = t.get('natural'), t.get('landuse'), t.get('leisure')
    if n in ('beach', 'sand'): return 'beach'
    if n == 'wetland': return 'wetland'
    if n == 'water' or lu in ('reservoir', 'basin'): return 'water'
    if t.get('amenity') == 'parking' and t.get('parking', 'surface') == 'surface': return 'parking'
    if t.get('golf') in ('fairway', 'green', 'tee', 'driving_range') or le in ('pitch', 'golf_course') or lu in ('grass', 'village_green', 'recreation_ground', 'cemetery'):
        return 'lawn'
    if n == 'wood' or lu == 'forest': return 'wood'
    if n in ('scrub', 'heath', 'grassland'): return 'wild'
    return None

def _stitch(segs):
    """a relation's member ways -> closed rings"""
    segs = [list(s) for s in segs if len(s) >= 2]; rings = []
    while segs:
        r = segs.pop(0)
        while r[0] != r[-1]:
            for k, s_ in enumerate(segs):
                if s_[0] == r[-1]: r += s_[1:]; break
                if s_[-1] == r[-1]: r += s_[::-1][1:]; break
                if s_[-1] == r[0]: r = s_[:-1] + r; break
                if s_[0] == r[0]: r = s_[::-1][:-1] + r; break
            else: break
            segs.pop(k)
        if len(r) >= 4: rings.append(r)
    return rings

_OP = None
def _osm_polys():
    """[(cat, outer rings, inner rings)] in engine metres"""
    global _OP
    if _OP is None:
        _OP = []
        if not os.path.exists(OSM): return _OP
        E = lambda g: [tuple(rp.lonlat_to_eng(p['lon'], p['lat'])) for p in g]
        for e in json.load(open(OSM))['elements']:
            cat = _osm_cat(e.get('tags', {}))
            if cat is None: continue
            if e['type'] == 'way' and e.get('geometry') and len(e['geometry']) >= 4:
                g_ = E(e['geometry'])
                if g_[0] == g_[-1] or math.dist(g_[0], g_[-1]) < 1: _OP.append((cat, [g_], []))
            elif e['type'] == 'relation':
                O = _stitch([[(round(p['lon'], 7), round(p['lat'], 7)) for p in m['geometry']] for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')])
                I = _stitch([[(round(p['lon'], 7), round(p['lat'], 7)) for p in m['geometry']] for m in e.get('members', []) if m.get('role') == 'inner' and m.get('geometry')])
                cv = lambda R: [[tuple(rp.lonlat_to_eng(x, y)) for x, y in r] for r in R]
                if O: _OP.append((cat, cv(O), cv(I)))
        _OP = [(c, [np.asarray(r) for r in O], [np.asarray(r) for r in I]) for c, O, I in _OP]
    return _OP

def osm_masks(x0, y0, x1, y1, res=SUB):
    from PIL import Image, ImageDraw
    nx, ny = int(round((x1 - x0) / res)), int(round((y1 - y0) / res))
    ims = {}
    for cat, O, I in _osm_polys():
        if all(r[:, 0].max() < x0 or r[:, 0].min() > x1 or r[:, 1].max() < y0 or r[:, 1].min() > y1 for r in O): continue
        if cat not in ims: ims[cat] = Image.new('L', (nx, ny), 0)
        d = ImageDraw.Draw(ims[cat])
        for r in O: d.polygon([((x - x0) / res, (y - y0) / res) for x, y in r], fill=1)
        for r in I: d.polygon([((x - x0) / res, (y - y0) / res) for x, y in r], fill=0)
    return {k: np.asarray(v, bool) for k, v in ims.items()}

# ── the classes ─────────────────────────────────────────────────────────────
def _box(a, r):
    from scipy.ndimage import uniform_filter
    return uniform_filter(a.astype(np.float32), size=2 * r + 1, mode='nearest')

def classify(DN, AL, ok, res=SUB, osm=None):
    """the class of each pixel (uint8, CLS) before the buildings are cut out,
    and the photo's own shade (filled later from the neighbours).
    Hazy 8-bit NAIP: dry sand and concrete are the same neutral pale grey
    (Crissy beach DN 174/174/171, the Doyle Drive deck 179/178/178), so the
    beaches come from OSM; the rest from NDVI, the NIR's level and roughness,
    lightness (the roofs' calibration) and the raw DN's warmth.
    Late September: May's green, unwatered grass is cured straw by then, so
    only a bright, smooth, high-NIR green (a watered lawn) stays green."""
    osm = osm or {}
    R, G, B = AL
    L = 0.2126 * R + 0.7152 * G + 0.0722 * B
    N = DN[3]; Vis = DN[:3].mean(0)
    warm = (DN[0] - DN[2]) / np.maximum(Vis, 1)               # raw DN: concrete ~0, cured grass/soil ~0.15-0.25
    nd = (N - DN[0]) / np.maximum(N + DN[0], 1)               # NDVI on the raw DN
    k3 = max(1, int(round(1.5 / res)))
    nstd = np.sqrt(np.maximum(_box(N * N, k3) - _box(N, k3) ** 2, 0))    # canopy is rough in the NIR
    Lb = _box(L, k3); lstd = np.sqrt(np.maximum(_box(L * L, k3) - Lb ** 2, 0)) / np.maximum(Lb, 1e-3)
    nds = _box(nd, 1); Ns = _box(N, 1); ws = _box(warm, 1)
    # (street asphalt, from the roadway polygons: NDVI -0.11, warmth -0.14,
    # NIR/visible 0.75; the bay 0.46)
    c = np.full(L.shape, CI['concrete'], np.uint8)
    c[L < 0.15] = CI['asphalt']
    c[(L >= 0.13) & (L < 0.21) & (lstd > 0.09)] = CI['gravel']
    c[(ws > -0.04) & (nds > -0.04) & (L >= 0.07)] = CI['soil']
    dry = (nds > 0.02) & (ws > -0.06) & (L >= 0.035)
    c[dry] = CI['drygrass']
    veg = nds > 0.14
    c[veg] = CI['drygrass']
    c[veg & ((nstd > 11) | (L < 0.036))] = CI['scrub']
    lawnh = osm.get('lawn', np.zeros(L.shape, bool))
    c[veg & (((Ns > 172) & (G > 0.062)) | (lawnh & (Ns > 150))) & (nstd < 14)] = CI['lawn']
    woodh = osm.get('wood', np.zeros(L.shape, bool))
    c[veg & (nds > 0.24) & ((nstd > 13) | (L < 0.045) | woodh) & ~((Ns > 185) & (nstd < 10))] = CI['tree']
    water = (N < 0.56 * Vis) & (N < 95)
    c[water] = CI['water']
    shade = (L < 0.028) & ~water & ~(veg & (nds > 0.2))
    # dark, bare-looking pixels in the middle of the wild ground (the shaded
    # side of the scrub, a burnt patch) are not a parking lot: where ~80 % of
    # the 25 m round is growing, they go with the growth
    vs = _box((nds > 0.02).astype(np.float32), int(12 / res))
    inwild = (c == CI['asphalt']) & (vs > 0.8) & (nds > -0.06)
    c[inwild & (L < 0.045)] = CI['scrub']; c[inwild & (L >= 0.045)] = CI['drygrass']
    if 'beach' in osm:
        bch = osm['beach'] & ~(veg & (nds > 0.2))
        c[bch] = CI['sand']; c[bch & (water | (L < 0.085))] = CI['wetsand']
        # the lower beach (the OSM polygon stops at the dry sand): dark, bare,
        # within 90 m of it, not the sea
        from scipy.ndimage import binary_dilation
        near = binary_dilation(osm['beach'], iterations=int(90 / res)) & ~osm['beach']
        c[near & (nds < 0.0) & ~water & (L < 0.15)] = CI['wetsand']
    if 'wetland' in osm: c[osm['wetland'] & (nds > 0.05)] = CI['marsh']
    if 'water' in osm: c[osm['water'] & (nds < 0.1) & (L < 0.12)] = CI['water']
    if 'parking' in osm: c[osm['parking'] & ~veg & (c != CI['water'])] = CI['asphalt']
    c[~ok] = 0
    return c, shade, dict(L=L, warm=ws, nstd=nstd, lstd=lstd, ndvi=nds, N=Ns)

def fill(c, hole):
    """holes (buildings, shade) take the class of the nearest open pixel"""
    from scipy.ndimage import distance_transform_edt
    if not hole.any() or hole.all(): return c
    _, (ii, jj) = distance_transform_edt(hole, return_indices=True)
    return c[ii, jj]

def block(x0, y0, x1, y1, res=SUB):
    DN, AL, ndvi, ok = patch(x0, y0, x1, y1, res)
    c, shade, f = classify(DN, AL, ok, res, osm_masks(x0, y0, x1, y1, res))
    bm = bmask(x0, y0, x1, y1, res)
    return c, bm, AL, f, shade

def block_final(x0, y0, x1, y1, res=SUB):
    """a block's classes with the buildings and the photo's shade filled in"""
    c, bm, AL, f, shade = block(x0, y0, x1, y1, res)
    ok = c > 0
    c = fill(c, ((bm > 0) | shade) & ok)
    c[~ok] = 0
    return c

def _mode2(c, k):
    """the most common class in each k x k cell"""
    h, w = c.shape[0] // k, c.shape[1] // k
    v = c[:h * k, :w * k].reshape(h, k, w, k).transpose(0, 2, 1, 3).reshape(h, w, k * k)
    cnt = np.stack([(v == j).sum(-1) for j in range(len(CLS))], -1)
    cnt[..., 0] = np.where(cnt[..., 0] == k * k, 99, 0)       # 'none' only where nothing else is
    return cnt.argmax(-1).astype(np.uint8)

GX0, GY0, GX1, GY1 = -6950.0, -6500.0, 7550.0, 8400.0      # NAIP's reach (roofs_prep.BBOX) in engine metres

def _one(args):
    bx, by = args
    M = 50.0
    t = time.time()
    c = block_final(bx - M, by - M, bx + BLK + M, by + BLK + M)
    k = int(round(M / SUB)); c = c[k:-k, k:-k]
    return bx, by, _mode2(c, int(round(RES / SUB))), time.time() - t

def build(workers=3):
    from multiprocessing import Pool
    os.makedirs(OUT, exist_ok=True)
    nx, ny = int((GX1 - GX0) / RES), int((GY1 - GY0) / RES)
    G = np.zeros((ny, nx), np.uint8)
    jobs = [(GX0 + i * BLK, GY0 + j * BLK) for j in range(int(math.ceil((GY1 - GY0) / BLK))) for i in range(int(math.ceil((GX1 - GX0) / BLK)))]
    _buildings(); _osm_polys()                     # loaded once, forked
    n = int(BLK / RES)
    with Pool(workers) as P:
        for k, (bx, by, c, dt) in enumerate(P.imap_unordered(_one, jobs)):
            i0, j0 = int((bx - GX0) / RES), int((by - GY0) / RES)
            h, w = min(n, ny - j0), min(n, nx - i0)
            G[j0:j0 + h, i0:i0 + w] = c[:h, :w]
            print(f'{k + 1}/{len(jobs)} block {bx:.0f},{by:.0f} {dt:.1f}s', flush=True)
    np.save(f'{OUT}/ground_cls.npy', G)
    fr = {n_: round(float((G == j).sum()) / max(1, int((G > 0).sum())) * 100, 2) for j, n_ in enumerate(CLS) if j}
    meta = dict(x0=GX0, y0=GY0, res=RES, shape=list(G.shape), row0='south (y0)', classes=CLS, colours={k_: list(v) for k_, v in COL.items()},
                share_pct=fr, source='USDA NAIP 2022 (public domain) via roofs_prep; OSM landcover hints (ODbL) ground/osm/landcover.json; ground_prep.py',
                built=time.strftime('%Y-%m-%d %H:%M'))
    json.dump(meta, open(f'{OUT}/ground_meta.json', 'w'), indent=1)
    from PIL import Image
    Image.fromarray(_rgb(G[::-8, ::8])).save(f'{OUT}/ground_cls_preview.png')
    print('done', G.shape, fr)

def refine(src=None, dst=None, M=100):
    """the stored map made ready for the render, in 1 km blocks (100 m margin):
      * 'water' on land that is not a body of water (a building's shadow on
        its north side, a dark roof edge: under 400 m²) takes the class of the
        nearest other ground;
      * the lower beach: dark, bare ground within 200 m of an OSM beach and
        30 m of the sea (Ocean Beach's wet sand read as asphalt: its OSM
        polygon stops at the dry sand) is wet sand."""
    from scipy.ndimage import label, distance_transform_edt, binary_dilation
    src = src or f'{OUT}/ground_cls.npy'; dst = dst or src
    G = np.load(src); ny, nx = G.shape; O = G.copy()
    W, A, C, GR, SO = CI['water'], CI['asphalt'], CI['concrete'], CI['gravel'], CI['soil']
    n = int(BLK / RES); nfill = nwet = 0
    for j0 in range(0, ny, n):
        for i0 in range(0, nx, n):
            a0, b0 = max(0, i0 - M), max(0, j0 - M); a1, b1 = min(nx, i0 + n + M), min(ny, j0 + n + M)
            c = G[b0:b1, a0:a1].copy()
            lab, k = label(c == W)
            if k:
                sz = np.bincount(lab.ravel()); small = (sz < 400 / RES ** 2); small[0] = False
                hole = small[lab]
                if hole.any() and not (hole | (c == 0) | (c == W)).all():
                    bad = hole | (c == 0) | (c == W)
                    _, (ii, jj) = distance_transform_edt(bad, return_indices=True)
                    c[hole] = c[ii[hole], jj[hole]]; nfill += int(hole.sum())
            x0_, y0_ = GX0 + a0 * RES, GY0 + b0 * RES
            om = osm_masks(x0_, y0_, x0_ + (a1 - a0) * RES, y0_ + (b1 - b0) * RES, RES)
            if 'beach' in om:
                bch = om['beach'][:c.shape[0], :c.shape[1]]
                if bch.any():
                    sea = (c == W) & (lab > 0) & ~small[lab] if k else np.zeros(c.shape, bool)
                    near = binary_dilation(bch, iterations=int(200 / RES)) & binary_dilation(sea, iterations=int(30 / RES))
                    m_ = near & np.isin(c, [A, C, GR, SO])
                    c[m_] = CI['wetsand']; nwet += int(m_.sum())
            O[j0:j0 + n, i0:i0 + n] = c[j0 - b0:j0 - b0 + n, i0 - a0:i0 - a0 + n]
    np.save(dst, O)
    fr = {n_: round(float((O == j).sum()) / max(1, int((O > 0).sum())) * 100, 2) for j, n_ in enumerate(CLS) if j}
    mp = f'{OUT}/ground_meta.json'; meta = json.load(open(mp)); meta.update(share_pct=fr, refined=time.strftime('%Y-%m-%d %H:%M'))
    json.dump(meta, open(mp, 'w'), indent=1)
    from PIL import Image
    Image.fromarray(_rgb(O[::-8, ::8])).save(f'{OUT}/ground_cls_preview.png')
    print('refined', nfill, 'shadow pixels filled,', nwet, 'wet sand', fr)

# ── the photo's own detail: a tone map at 0.5 m ────────────────────────────
TONE_RES = SUB
def tone_block(x0, y0, x1, y1, res=SUB):
    """the photo's luminance over its 12 m mean, log2, clipped to +-1, as
    uint8 (128 = the mean): worn paths, tyre marks, stains, patchy grass —
    the ground's detail as it really is. Buildings (swept, grown 1 m) and the
    photo's deep shade are neutral (their shadows are not the render's)."""
    from scipy.ndimage import binary_dilation, uniform_filter
    DN, AL, ndvi, ok = patch(x0, y0, x1, y1, res)
    c, shade, f = classify(DN, AL, ok, res, osm_masks(x0, y0, x1, y1, res))
    bm = binary_dilation(bmask(x0, y0, x1, y1, res) > 0, iterations=int(round(1.5 / res)))
    L = 0.2126 * AL[0] + 0.7152 * AL[1] + 0.0722 * AL[2]
    v = (ok & ~bm & ~shade & (c != CI['water'])).astype(np.float32)
    r = int(round(12.0 / res))
    # the mean of the pixel's own kind of ground (growing / paved / sand):
    # a bright road beside the grass must not print a dark halo on it (the
    # classes' own colours are the materials')
    x = np.zeros(L.shape, np.float32)
    for grp in (('lawn', 'drygrass', 'scrub', 'tree', 'soil', 'marsh'), ('asphalt', 'concrete', 'gravel'), ('sand', 'wetsand')):
        ing = np.isin(c, [CI[n] for n in grp]); vg = v * ing
        den = uniform_filter(vg, 2 * r + 1, mode='nearest')
        m = uniform_filter(L * vg, 2 * r + 1, mode='nearest') / np.maximum(den, 1e-3)
        x[ing] = (np.clip(np.log2(np.maximum(L, 1e-4) / np.maximum(m, 1e-4)), -1, 1) * (den > 0.03))[ing]
    # the edge of a masked area eases to neutral over a metre
    w = uniform_filter(v, int(round(2.0 / res)) * 2 + 1, mode='nearest')
    x = x * v * np.clip((w - 0.5) * 2, 0, 1)
    return np.round(128 + 127 * x).astype(np.uint8)

def _tone_one(args):
    bx, by = args; M = 50.0; t = time.time()
    a = tone_block(bx - M, by - M, bx + BLK + M, by + BLK + M)
    k = int(round(M / TONE_RES))
    return bx, by, a[k:-k, k:-k], time.time() - t

def build_tone(workers=2):
    """-> ground/ground_tone.npy (uint8, 0.5 m, row 0 = south, same origin as the classes)"""
    from multiprocessing import Pool
    nx, ny = int((GX1 - GX0) / TONE_RES), int((GY1 - GY0) / TONE_RES)
    T = np.lib.format.open_memmap(f'{OUT}/ground_tone.npy', mode='w+', dtype=np.uint8, shape=(ny, nx)); T[:] = 128
    jobs = [(GX0 + i * BLK, GY0 + j * BLK) for j in range(int(math.ceil((GY1 - GY0) / BLK))) for i in range(int(math.ceil((GX1 - GX0) / BLK)))]
    _buildings(); _osm_polys()
    n = int(BLK / TONE_RES)
    with Pool(workers) as P:
        for k, (bx, by, a, dt) in enumerate(P.imap_unordered(_tone_one, jobs)):
            i0, j0 = int(round((bx - GX0) / TONE_RES)), int(round((by - GY0) / TONE_RES))
            h, w = min(n, ny - j0), min(n, nx - i0)
            T[j0:j0 + h, i0:i0 + w] = a[:h, :w]
            print(f'{k + 1}/{len(jobs)} tone {bx:.0f},{by:.0f} {dt:.1f}s', flush=True)
    T.flush(); del T
    mp = f'{OUT}/ground_meta.json'; meta = json.load(open(mp)); meta.update(tone=dict(file='ground_tone.npy', res=TONE_RES, x0=GX0, y0=GY0, shape=[ny, nx],
        encoding='uint8 = 128 + 127 * clip(log2(L / L_12m_mean), -1, 1); 128 under buildings and deep shade', built=time.strftime('%Y-%m-%d %H:%M')))
    json.dump(meta, open(mp, 'w'), indent=1)
    print('tone done', ny, nx)

def _rgb(c):
    lut = np.array([COL[n] for n in CLS], np.uint8); return lut[c]

def probe(x0, y0, x1, y1, out):
    from PIL import Image
    x0, y0, x1, y1 = map(float, (x0, y0, x1, y1))
    c, bm, AL, f, shade = block(x0, y0, x1, y1)
    A = np.clip(255 * (np.clip(AL.transpose(1, 2, 0), 0, 1) * 1.4) ** (1 / 2.2), 0, 255).astype(np.uint8)[::-1]
    Cc = _rgb(c); Cc[shade] = (255, 0, 255); Cc[bm > 0] = (Cc[bm > 0] * 0.35).astype(np.uint8); Cc = Cc[::-1]
    S = np.concatenate([A, np.full((A.shape[0], 8, 3), 255, np.uint8), Cc], 1)
    Image.fromarray(S).save(out, quality=88)
    fr = {n: round(float((c == k).mean()) * 100, 1) for k, n in enumerate(CLS)}
    print(out, S.shape, fr)
    for k in ('L', 'warm', 'nstd', 'lstd', 'ndvi', 'N'):
        print(k, np.percentile(f[k][bm == 0], [5, 25, 50, 75, 95]).round(3))

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'probe': probe(*sys.argv[2:7])
    if cmd == 'build': build(int(sys.argv[2]) if len(sys.argv) > 2 else 3)
    if cmd == 'refine': refine(*sys.argv[2:4])
    if cmd == 'tone': build_tone(int(sys.argv[2]) if len(sys.argv) > 2 else 2)
