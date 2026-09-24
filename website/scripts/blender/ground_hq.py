"""THE GROUND FROM THE AIR, in the render: the class map ground_prep.py made
from USDA NAIP 2022 (public domain, R G B + near infrared; 1 m, engine frame,
row 0 = south) read for a frame's region and handed to hill_ground as soft
class weights, so the terrain's material paints what each patch of open
ground really is: sand, wet sand, watered lawn, cured grass, coyote brush,
the litter under trees, bare earth, asphalt, concrete, gravel, marsh.

  weights(x0, y0, x1, y1) -> dict or None (outside the map, or GROUND_CLS=0)

Five 8-bit maps at 1 m (the classes' majority over 5 x 5 m, then a 3 x 3 box:
crisp shapes with an edge soft over ~2 m, no speckle):
  E1 = sand, wet sand, lawn
  E2 = asphalt, concrete, gravel
  E3 = bare soil, scrub, marsh
  E4 = cured grass, tree canopy, data (1 where the photo classified the ground)
  E5 = water the render's sea does not cover (shore mud), artificial turf
"""
import os, json, math
import numpy as np

CLS_PATH = '/Users/daniel/code/qipu-render-work/ground/ground_cls.npy'
META_PATH = '/Users/daniel/code/qipu-render-work/ground/ground_meta.json'
TONE_PATH = '/Users/daniel/code/qipu-render-work/ground/ground_tone.npy'
TONE_K = float(os.environ.get('GROUND_TONE', '1.1'))   # how much of the photo's detail (log2 of the ratio per unit)
CLS = ['none', 'sand', 'lawn', 'drygrass', 'scrub', 'tree', 'soil', 'asphalt', 'concrete', 'gravel', 'marsh', 'water', 'wetsand', 'turf']
CI = {n: k for k, n in enumerate(CLS)}
PACK = [(('sand',), ('wetsand',), ('lawn',)),
        (('asphalt',), ('concrete',), ('gravel',)),
        (('soil',), ('scrub',), ('marsh',)),
        (('drygrass',), ('tree',), None),
        (('water',), ('turf',), ())]
BLUR = 2          # the box over the classes (5 x 5 m): a 1 m class map is speckled, and speckle sharpened reads as camouflage

def _box(a, r):
    """mean over a (2r+1)² window, edges held (cumulative sums, numpy only)"""
    if r < 1: return a.astype(np.float32)
    a = a.astype(np.float32)
    for ax in (0, 1):
        pw = [(0, 0), (0, 0)]; pw[ax] = (r + 1, r)
        c = np.cumsum(np.pad(a, pw, mode='edge'), ax, dtype=np.float64)
        n = a.shape[ax]
        a = ((c.take(range(2 * r + 1, 2 * r + 1 + n), ax) - c.take(range(0, n), ax)) / (2 * r + 1)).astype(np.float32)
    return a

def crop(x0, y0, x1, y1):
    """the class map over the box (uint8, row 0 = south) and its frame
    (x0, y0, res), or None"""
    if os.environ.get('GROUND_CLS', '1') == '0' or not os.path.exists(CLS_PATH): return None
    M = json.load(open(META_PATH)); r = M['res']
    G = np.load(CLS_PATH, mmap_mode='r'); ny, nx = G.shape
    i0 = int(math.floor((x0 - M['x0']) / r)); j0 = int(math.floor((y0 - M['y0']) / r))
    i1 = int(math.ceil((x1 - M['x0']) / r)); j1 = int(math.ceil((y1 - M['y0']) / r))
    a0, b0, a1, b1 = max(0, i0), max(0, j0), min(nx, i1), min(ny, j1)
    if a1 <= a0 or b1 <= b0: return None
    c = np.zeros((j1 - j0, i1 - i0), np.uint8)
    c[b0 - j0:b1 - j0, a0 - i0:a1 - i0] = G[b0:b1, a0:a1]
    if not c.any(): return None
    return c, (M['x0'] + i0 * r, M['y0'] + j0 * r, r)

def weights(x0, y0, x1, y1):
    """{'maps': [(R, G, B) float32 0..1] x 4, 'frame': (x0, y0, w, h),
    'cls', 'cframe'} for hill_ground, or None"""
    cc = crop(x0, y0, x1, y1)
    if cc is None: return None
    c, (fx, fy, r) = cc
    # a majority over 5 x 5 m first (the class map is speckled at 1 m, and
    # speckle blurred and re-sharpened read as soft camouflage blobs, gnd2),
    # then a 3 x 3 box: crisp shapes, a soft edge of a metre or two
    cnt = np.stack([_box((c == k).astype(np.float32), BLUR) for k in range(len(CLS))])
    cnt[0] *= 0.5                                                  # 'none' only where nothing else is
    c = np.where(c > 0, cnt.argmax(0).astype(np.uint8), 0).astype(np.uint8); del cnt
    maps = []
    for grp in PACK:
        ch = []
        for g_ in grp:
            if g_ == (): ch.append(np.zeros(c.shape, np.float32)); continue
            if g_ is None: ch.append(_box((c > 0).astype(np.float32), 1)); continue
            m = np.zeros(c.shape, np.float32)
            for n in g_: m += (c == CI[n])
            ch.append(_box(m, 1))
        maps.append(tuple(ch))
    return dict(maps=maps, frame=(fx, fy, c.shape[1] * r, c.shape[0] * r), cls=c, cframe=(fx, fy, r))

def at(W, X, Y, names):
    """the summed share of the classes `names` at world points (nearest 1 m
    cell, after the 3 x 3 box: the scrub a bush may stand on), and whether the
    map has data there"""
    c = W['cls']; fx, fy, r = W['cframe']
    i = np.clip(((X - fx) / r).astype(np.int64), 0, c.shape[1] - 1); j = np.clip(((Y - fy) / r).astype(np.int64), 0, c.shape[0] - 1)
    v = c[j, i]
    return np.isin(v, [CI[n] for n in names]), v > 0

def tone_image(fr):
    """the photo's detail (ground_prep.build_tone: 0.5 m, 128 = the local
    mean) over the frame fr = (x0, y0, w, h), as an 8-bit image, and its
    frame; None without the file"""
    if TONE_K <= 0 or not os.path.exists(TONE_PATH): return None
    import bpy
    M = json.load(open(META_PATH)).get('tone')
    if not M: return None
    r = M['res']; T = np.load(TONE_PATH, mmap_mode='r'); ny, nx = T.shape
    i0 = int(math.floor((fr[0] - M['x0']) / r)); j0 = int(math.floor((fr[1] - M['y0']) / r))
    i1 = int(math.ceil((fr[0] + fr[2] - M['x0']) / r)); j1 = int(math.ceil((fr[1] + fr[3] - M['y0']) / r))
    a0, b0, a1, b1 = max(0, i0), max(0, j0), min(nx, i1), min(ny, j1)
    if a1 <= a0 or b1 <= b0: return None
    h_, w_ = j1 - j0, i1 - i0
    im = bpy.data.images.new('ground_T', w_, h_, alpha=False, float_buffer=False)
    im.colorspace_settings.name = 'Non-Color'
    px = np.full((h_, w_, 4), 128 / 255.0, np.float32); px[..., 3] = 1.0
    px[b0 - j0:b1 - j0, a0 - i0:a1 - i0, 0] = T[b0:b1, a0:a1] / np.float32(255.0)
    px[..., 1] = px[..., 0]; px[..., 2] = px[..., 0]
    im.pixels.foreach_set(px.ravel()); del px; im.update()
    return im, (M['x0'] + i0 * r, M['y0'] + j0 * r, w_ * r, h_ * r)

def images(W):
    """the four maps as 8-bit Non-Color images (Cycles keeps its own copy:
    8-bit, not float)"""
    import bpy
    out = []
    for k, (R, G, B) in enumerate(W['maps']):
        h_, w_ = R.shape
        im = bpy.data.images.new(f'ground_E{k + 1}', w_, h_, alpha=False, float_buffer=False)
        im.colorspace_settings.name = 'Non-Color'
        px = np.empty((h_, w_, 4), np.float32); px[..., 0] = R; px[..., 1] = G; px[..., 2] = B; px[..., 3] = 1.0
        im.pixels.foreach_set(px.ravel()); del px; im.update()
        out.append(im)
    return out

def shade(b, sample, W, old, hill, lw, g, NEU, yd=None, yardf=None, scan=None):
    """the ground's colour where the photo says what it is: the class
    materials laid over hill_ground's own composition `old` by their soft
    shares (the hills — golden grass, coyote brush, chert — stay the wild
    ground's material). Returns (colour, wet, wild): wet for the roughness,
    wild (cured grass, brush, bare earth) for the relief."""
    ims = images(W); fr = W['frame']
    S = [sample(im, fr, 'EXTEND') for im in ims]
    sand, wet, lawn = S[0][0], S[0][1], S[0][2]
    asph, conc, grav = S[1][0], S[1][1], S[1][2]
    soil, scrub, marsh = S[2][0], S[2][1], S[2][2]
    dry, tree, have = S[3][0], S[3][1], S[3][2]
    water, turf = S[4][0], S[4][1]
    # an edge between classes wanders a metre or two (a straight 1 m step
    # reads as pixels), and a share is sharpened so a mixed pixel is one or
    # the other, not a muddy average
    jit = b.math('MULTIPLY', b.math('SUBTRACT', b.noise(1 / 2.2, 3.0, vec=b.vmap(1.0, loc=(13.1, -4.7, 0))), 0.5), 0.5)
    def sh(w, lo=0.30, hi=0.62):
        return b.ramp(b.math('ADD', w, b.math('MULTIPLY', jit, w)), 0.0, 1.0, lo, hi)
    # BARE EARTH: a warm brown, trodden paler in patches, a few weeds
    # (in late September most of what the May photo shows bare is cured
    # grass gone thin: straw over earth, not a ploughed field)
    so = b.mix(b.ramp(b.noise(1 / 9.0, 3.0, vec=b.vmap(1.0, loc=(7.7, 3.1, 0))), 0.0, 1.0, 0.35, 0.7), (0.19, 0.14, 0.07), (0.27, 0.20, 0.10))
    so = b.mix(b.ramp(b.noise(1 / 1.6, 2.0), 0.0, 0.4, 0.55, 0.75), so, b.mix(1.0, so, (0.8, 0.78, 0.76), 'MULTIPLY'))
    so = b.mix(b.ramp(b.noise(1 / 4.0, 3.0, vec=b.vmap(1.0, loc=(-2.2, 9.4, 0))), 0.0, 0.85, 0.40, 0.62), so, b.mix(0.3, g, so))
    # UNDER TREES: litter and shaded grass, dark olive-brown
    du = b.mix(b.ramp(b.noise(1 / 5.0, 3.0, vec=b.vmap(1.0, loc=(1.3, 22.0, 0))), 0.0, 1.0, 0.4, 0.7), (0.10, 0.085, 0.034), (0.145, 0.125, 0.045))
    # ASPHALT (a lot, a yard, a playground): worn warm grey, its tone
    # drifting over 40 m, oil and tyre wear, a crack's weeds now and then
    ap = b.mix(b.ramp(b.noise(1 / 40.0, 2.0, vec=b.vmap(1.0, loc=(-41.0, 13.0, 0))), 0.0, 1.0, 0.3, 0.7), (0.085, 0.082, 0.076), (0.13, 0.125, 0.115))
    ap = b.mix(b.ramp(b.noise(1 / 2.5, 3.0), 0.0, 0.35, 0.58, 0.72), ap, b.mix(1.0, ap, (0.72, 0.70, 0.68), 'MULTIPLY'))
    ap = b.mix(b.ramp(b.noise(1 / 0.7, 2.0), 0.0, 0.25, 0.5, 0.8), ap, b.mix(1.0, ap, (1.12, 1.1, 1.06), 'MULTIPLY'))
    # CONCRETE and light paving: pale, slabs of slightly different pours
    slab = b.voronoi(1 / 4.5, vec=b.vmap((1.0, 1.0, 1.0)), metric='CHEBYCHEV', out='Color')
    co = b.mix(b.ramp(b.noise(1 / 25.0, 2.0, vec=b.vmap(1.0, loc=(5.5, 71.0, 0))), 0.0, 1.0, 0.3, 0.7), (0.24, 0.235, 0.22), (0.33, 0.32, 0.30))
    co = b.mix(0.35, co, b.mix(1.0, co, b.math('ADD', 0.88, b.math('MULTIPLY', b.bw(slab), 0.24)), 'MULTIPLY'))
    co = b.mix(b.ramp(b.noise(1 / 3.0, 3.0), 0.0, 0.4, 0.62, 0.74), co, b.mix(1.0, co, (0.78, 0.76, 0.74), 'MULTIPLY'))
    # GRAVEL: dusty buff grey, fine grain
    gv = b.mix(b.ramp(b.noise(1 / 0.35, 2.0), 0.0, 1.0, 0.3, 0.7), (0.16, 0.15, 0.13), (0.23, 0.215, 0.19))
    gv = b.mix(b.ramp(b.noise(1 / 12.0, 2.0, vec=b.vmap(1.0, loc=(8.0, 51.0, 0))), 0.0, 0.5, 0.5, 0.7), gv, b.mix(1.0, gv, (0.85, 0.83, 0.8), 'MULTIPLY'))
    # (paving under this light: the de-mauve bias, see hill_ground's NEU)
    # measured on gnd1 (a lot rendered sRGB 142,140,143 — lilac beside the
    # golden grass): the light here gives blue ~1.6x, so a lot needs a
    # yellow-looking albedo to render the warm grey of sunlit concrete
    WARM = (1.2, 1.03, 0.78)
    for_ = lambda x_: b.mix(1.0, b.mix(1.0, x_, NEU, 'MULTIPLY'), WARM, 'MULTIPLY')
    ap = for_(ap); co = for_(co); gv = for_(gv)
    # SAND: Ocean Beach's pale buff, wind ripples, darker drifts (a buff-grey
    # albedo rendered lilac-white at Crissy, gnd8/9, and pink-white under
    # the harder sun of 53c5109c5 (integ1: sRGB 205,190,180): the albedo
    # leans hard to yellow, green and blue both cut);
    # WET SAND and mud: darker, smoother, a sheen (the roughness)
    rip = b.math('SINE', b.math('MULTIPLY', b.math('ADD', b.bw(b.vmap(1.0)), b.math('MULTIPLY', b.noise(1 / 3.0, 2.0), 1.2)), 2 * math.pi / 0.7))
    sd = b.mix(b.ramp(b.noise(1 / 18.0, 3.0, vec=b.vmap(1.0, loc=(3.3, 7.1, 0))), 0.0, 1.0, 0.3, 0.7), (0.37, 0.265, 0.085), (0.47, 0.335, 0.11))
    sd = b.mix(b.math('MULTIPLY', b.ramp(rip, 0.0, 1.0, -1.0, 1.0), 0.12), sd, b.mix(1.0, sd, (0.8, 0.8, 0.8), 'MULTIPLY'))
    ws = b.mix(b.ramp(b.noise(1 / 10.0, 3.0), 0.0, 1.0, 0.3, 0.7), (0.15, 0.113, 0.048), (0.20, 0.15, 0.062))
    # MARSH: pickleweed, olive with its September red, mud in the channels
    mh = b.mix(b.ramp(b.noise(1 / 6.0, 3.0, vec=b.vmap(1.0, loc=(-6.0, 2.0, 0))), 0.0, 1.0, 0.45, 0.65), (0.085, 0.09, 0.04), (0.15, 0.075, 0.05))
    mh = b.mix(b.ramp(b.noise(1 / 14.0, 3.0), 0.0, 1.0, 0.66, 0.72), mh, (0.07, 0.065, 0.05))
    # WATER the render's sea does not cover (its coast and the photo's differ
    # by a few metres, more at India Basin): the shore's dark mud, matte
    # (smooth, it mirrored the sky as a lilac band, gnd1)
    md = b.mix(b.ramp(b.noise(1 / 8.0, 3.0), 0.0, 1.0, 0.3, 0.7), (0.075, 0.074, 0.048), (0.105, 0.10, 0.062))
    # (tidal mud: olive-grey, the drainage runnels darker; not warmed — a warm
    # mud read pink-mauve, gnd6)
    md = b.mix(b.math('MULTIPLY', b.ramp(b.noise(1 / 25.0, 4.0, vec=b.vmap((1.0, 3.0, 1.0))), 0.0, 1.0, 0.62, 0.66), 0.7), md, (0.05, 0.05, 0.035))
    # the wild ground (cured grass, brush, rock: hill_ground's hills), then
    # each class over it by its share
    x = hill
    # a house's yard is a garden and a patio, not a vacant lot: bare earth
    # (and half the cured grass) within a few metres of a house takes
    # hill_ground's garden (integ1: Alamo's and Twin Peaks' backyards read as
    # dirt lots)
    if yd is not None and yardf is not None:
        so = b.mix(yardf, so, yd)
        hill = b.mix(b.math('MULTIPLY', yardf, 0.5), hill, yd); x = hill
    # CURED GRASS glows gold in the low sun, not khaki: warmer and richer
    # where the photo finds dry grass (Twin Peaks, Bernal, San Bruno)
    x = b.mix(b.math('MULTIPLY', sh(dry), 0.85), x, b.mix(1.0, x, (1.24, 1.05, 0.56), 'MULTIPLY'))
    # THE WATERED LAWN the photo finds (a park's, a garden's, a playing
    # field): an even, clean green with a mower's stripes, not hill_ground's
    # tired lawn with its dry drifts and bare earth (Alamo Square read patchy
    # olive and brown, 24/09: real aerials show it bright and even)
    if scan is not None:
        # a lush irrigated green (the beauty bar: a flight simulator's
        # parks, not the photo's olive) with a third of the scan's own tint
        lush = b.mix(b.ramp(b.noise(1 / 25.0, 2.0, vec=b.vmap(1.0, loc=(2.0, 11.0, 0))), 0.0, 1.0, 0.3, 0.7), (0.086, 0.146, 0.019), (0.104, 0.166, 0.024))
        lw = b.mix(0.25, lush, b.mix(1.0, scan, (0.80, 0.90, 0.58), 'MULTIPLY'))
        lw = b.mix(b.ramp(b.noise(1 / 40.0, 2.0, vec=b.vmap(1.0, loc=(9.0, 3.0, 0))), 0.0, 0.35, 0.4, 0.75), lw, b.mix(1.0, lw, (1.1, 1.04, 0.85), 'MULTIPLY'))
        sp_ = b.n('ShaderNodeSeparateXYZ'); b.put(sp_.inputs[0], b.pos)
        uu = b.math('ADD', b.math('MULTIPLY', sp_.outputs[0], math.cos(0.14)), b.math('MULTIPLY', sp_.outputs[1], math.sin(0.14)))
        lw = b.mix(1.0, lw, b.math('ADD', 0.96, b.math('MULTIPLY', b.ramp(b.math('SINE', b.math('MULTIPLY', uu, math.pi / 4.0)), 0.0, 1.0, -0.3, 0.3), 0.08)), 'MULTIPLY')
    # ARTIFICIAL TURF (OSM surface=artificial_turf): an even deep green, a
    # faint cool cast, a stripe of the roller
    tu = b.mix(b.ramp(b.noise(1 / 30.0, 2.0), 0.0, 1.0, 0.3, 0.7), (0.030, 0.085, 0.040), (0.036, 0.098, 0.046))
    L_ = [(tree, du), (soil, so), (marsh, mh), (water, md), (lawn, lw), (turf, tu), (grav, gv), (asph, ap), (conc, co)]
    if os.environ.get('GROUND_SAND', '1') == '1': L_ += [(sand, sd), (wet, ws)]      # the beaches (the water agent may own them)
    for w_, col_ in L_:
        x = b.mix(sh(w_), x, col_)
    # A HOUSE'S YARD IS A GARDEN: lawn and shrubs under the yard trees, a
    # paved patio where the photo finds concrete. Earth, cured grass, gravel,
    # brush and the photo's canopy (the render grows its own yard trees)
    # within the yard band take it (Castro's and the Sunset's block interiors
    # read as brown dirt, 24/09; real ones are green gardens)
    if yd is not None and yardf is not None:
        gw_ = b.math('MINIMUM', b.math('ADD', b.math('ADD', b.math('ADD', soil, dry), b.math('ADD', grav, scrub)), tree), 1.0)
        shrub = b.mix(b.ramp(b.noise(1 / 6.0, 3.0, vec=b.vmap(1.0, loc=(5.0, 1.0, 0))), 0.0, 1.0, 0.35, 0.65), (0.030, 0.058, 0.018), (0.042, 0.074, 0.022))
        garden = b.mix(b.ramp(b.noise(1 / 4.0, 3.0, vec=b.vmap(1.0, loc=(-3.0, 8.0, 0))), 0.0, 1.0, 0.42, 0.58), lw, shrub)
        x = b.mix(b.math('MULTIPLY', b.ramp(yardf, 0.0, 1.0, 0.2, 0.6), sh(gw_)), x, garden)
    # THE PHOTO'S DETAIL: the ground's own light and dark within each kind of
    # ground (trails through the grass, worn lawn, stains and tyre marks in a
    # lot, the brush's texture), multiplied in: 2^(k·d), d the log2 ratio
    ti = tone_image(fr)
    if ti is not None:
        t_ = sample(ti[0], ti[1], 'EXTEND')[0]
        d_ = b.math('SUBTRACT', b.math('MULTIPLY', t_, 255.0 / 127.0), 128.0 / 127.0)
        # a watered lawn keeps its light patches but not its dark ones (the
        # photo's tree shadows lay dark streaks across Dolores Park, integ1)
        lk_ = b.math('SUBTRACT', 1.0, b.math('MULTIPLY', b.math('MINIMUM', b.math('ADD', sh(lawn), sh(turf)), 1.0), 0.8))       # a lawn keeps a fifth of the photo's grain
        dn = b.math('MULTIPLY', b.math('MINIMUM', d_, 0.0), lk_)
        dp = b.math('MULTIPLY', b.math('MAXIMUM', d_, 0.0), b.math('ADD', 0.4, b.math('MULTIPLY', lk_, 0.6)))
        # darker ground is warmer, not bluer (damp earth, trodden grass): the
        # dark share cuts blue more than red (a plain multiply turned the
        # beach's damp patches lilac-grey, integ1)
        cx_ = b.n('ShaderNodeCombineXYZ')
        for k_, w_ in enumerate((1.0, 1.12, 1.35)):
            b.put(cx_.inputs[k_], b.math('POWER', 2.0, b.math('MULTIPLY', b.math('ADD', dp, b.math('MULTIPLY', dn, w_)), TONE_K)))
        x = b.mix(1.0, x, cx_.outputs[0], 'MULTIPLY')
    hv = b.ramp(have, 0.0, 1.0, 0.2, 0.8)
    col = b.mix(hv, old, x)
    wetf = b.math('MULTIPLY', b.math('MULTIPLY', hv, sh(wet)), 0.3)     # (0.7: the sky's sheen turned wet sand lilac-grey)
    wildf = b.math('MULTIPLY', hv, b.math('MINIMUM', b.math('ADD', b.math('ADD', dry, scrub), soil), 1.0))
    return col, wetf, wildf, hv

def brush_field(W, XB, YB, old, fbm, ss, bilerp):
    """hill_ground's brush patches (hill_brush plants its bushes on them) from
    the photo's scrub where the map has data: the scrub share over ~5 m,
    its edge scalloped by a 6 m noise; the old noise field elsewhere"""
    c = W['cls']; fx, fy, r = W['cframe']
    # (NAIP's 'tree' on open ground is mostly coyote-brush thicket — Twin
    # Peaks is 16 % 'tree', 4 % 'scrub' — and under a real canopy the bushes
    # are its understory)
    sc = _box(((c == CI['scrub']) | (c == CI['tree'])).astype(np.float32), 2)
    hv = _box((c > 0).astype(np.float32), 2)
    s_ = bilerp(sc, fx, fy, r, XB, YB); h_ = bilerp(hv, fx, fy, r, XB, YB)
    new = ss(0.40, 0.55, s_ + 0.35 * (fbm(XB, YB, 6.0, 3, 23) - 0.5))
    return (h_ * new + (1 - h_) * old).astype(np.float32)

# ── beyond the county line: OSM streets over the surround ──────────────────
SOUTH_R = '/Users/daniel/code/qipu-render-work/ground/osm/r_south.json'
ROAD_W = {'motorway': 13.0, 'trunk': 12.0, 'primary': 11.0, 'secondary': 9.5, 'tertiary': 8.5, 'unclassified': 7.0, 'residential': 7.5,
          'living_street': 6.0, 'service': 4.5, 'motorway_link': 6.5, 'trunk_link': 6.5, 'primary_link': 6.0, 'secondary_link': 6.0, 'tertiary_link': 6.0}
def south_streets(ground_s, in_city, box, step=6.0, lift=0.12):
    """the streets of Daly City, Colma and Brisbane (OpenStreetMap, ODbL) as
    flat ribbons draped on the surround: a flat array of triangle vertices
    (x, y, z), or None. A point the city's own ground covers is left to the
    city's streets; `box` (x0, y0, x1, y1) bounds the work"""
    if os.environ.get('SOUTH', '1') == '0' or not os.path.exists(SOUTH_R): return None
    KX_ = 111320 * 0.790582709628753
    P = []
    for e in json.load(open(SOUTH_R))['elements']:
        t = e.get('tags', {}); g = e.get('geometry') or []
        w = ROAD_W.get(t.get('highway'))
        if w is None or len(g) < 2 or t.get('tunnel') in ('yes',) or t.get('bridge') == 'yes' and t.get('highway') in ('motorway', 'trunk'): continue
        if t.get('service') in ('parking_aisle', 'driveway', 'drive-through'): continue      # (a lot's aisles read as a dark grid, gnd11: the lot's photo carries them)
        Q = np.array([((p['lon'] + 122.438) * KX_, (p['lat'] - 37.76) * 111320) for p in g])
        if box is not None and (Q[:, 0].max() < box[0] or Q[:, 0].min() > box[2] or Q[:, 1].max() < box[1] or Q[:, 1].min() > box[3]): continue
        # densified, so the ribbon follows the hills
        pts = [Q[0]]
        for a, b in zip(Q[:-1], Q[1:]):
            n = max(1, int(math.ceil(np.hypot(*(b - a)) / step)))
            pts += [a + (b - a) * (k / n) for k in range(1, n + 1)]
        pts = np.array(pts)
        d = np.gradient(pts, axis=0); d /= np.maximum(np.hypot(d[:, 0], d[:, 1])[:, None], 1e-6)
        nrm = np.stack([-d[:, 1], d[:, 0]], 1) * (w / 2)
        L_, R_ = pts + nrm, pts - nrm
        z = []
        for (x, y) in pts:
            if in_city(float(x), float(y)): z.append(None); continue
            z.append(ground_s(float(x), float(y)))
        for k in range(len(pts) - 1):
            if z[k] is None or z[k + 1] is None: continue
            a0, b0, a1, b1 = L_[k], R_[k], L_[k + 1], R_[k + 1]
            za, zb = z[k] + lift, z[k + 1] + lift
            P += [a0[0], a0[1], za, b0[0], b0[1], za, a1[0], a1[1], zb, b0[0], b0[1], za, b1[0], b1[1], zb, a1[0], a1[1], zb]
    return P or None
