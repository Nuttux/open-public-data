"""Water for the render: the lakes and ponds the engine draws as ground, the
tidal channels its sea mask misses, and the bay coloured by its depth.

lakes(C): every OpenStreetMap water polygon (ODbL, (c) OpenStreetMap
contributors; water.json from lm_prep.py) in the box, as a still water
surface at the lake's level (the median ground inside it: 3DEP is
hydro-flattened on water, so on the true ground that is the lake's own
surface), coloured by kind: Lake Merced blue-green, the Golden Gate Park
lakes olive, the lagoon at the Palace of Fine Arts green, the tidal creeks
the bay's own grey-green.
sea_depth(C): the render's sea material gets its colour from the depth
under it (bathy_8m.npy from tools/bathy.py: USGS 3DEP topobathy, its
hydro-flattened lidar patches filled from the measured bottom): olive-grey
over the flats, teal over the shoals, navy in the Golden Gate's channel.
"""
import json, math, os
import numpy as np
from lm_kit import hexc

WATER_JSON = '/Users/daniel/code/qipu-render-work/landmarks/water.json'
LAKE_COL = {'Lake Merced': '#2d4d4c', 'Blue Heron Lake': '#3c4a33', 'Spreckels Lake': '#46503a', 'Mountain Lake': '#374a36',
            'North Lake': '#3a4834', 'Middle Lake': '#3a4834', 'South Lake': '#3a4834', 'Laguna Honda': '#2b4556',
            'Pine Lake': '#394833', 'Lloyd Lake': '#3d4a35', 'Elk Glen Lake': '#3d4a35', 'Mallard Lake': '#3d4a35'}

def _mat(bpy):
    m = bpy.data.materials.get('lm_lake')
    if m is not None: return m
    m = bpy.data.materials.new('lm_lake'); m.use_nodes = True; nt = m.node_tree
    pr = nt.nodes['Principled BSDF']
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'bcol'; nt.links.new(at.outputs['Color'], pr.inputs['Base Color'])
    pr.inputs['Roughness'].default_value = 0.035; pr.inputs['Specular IOR Level'].default_value = 0.5
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 0.35; n1.inputs['Detail'].default_value = 6
    nt.links.new(geo.outputs['Position'], n1.inputs['Vector'])
    bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = 0.12; bm.inputs['Distance'].default_value = 0.05
    nt.links.new(n1.outputs['Fac'], bm.inputs['Height']); nt.links.new(bm.outputs[0], pr.inputs['Normal'])
    return m

def lakes(C):
    if not os.path.exists(WATER_JSON): return 0
    W = json.load(open(WATER_JSON))['water']
    bx0, by0, bx1, by1 = C.box
    n = 0
    for w in W:
        r = [tuple(p) for p in w['ring']]
        r = r[:-1] if r[0] == r[-1] else r
        xs = [p[0] for p in r]; ys = [p[1] for p in r]
        if max(xs) < bx0 - 300 or min(xs) > bx1 + 300 or max(ys) < by0 - 300 or min(ys) > by1 + 300: continue
        # the lake's level: the ground inside it (the median of a few points
        # pulled in from the shore towards the centroid)
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        samples = [C.tg(x + (cx - x) * t, y + (cy - y) * t) for (x, y) in r[::max(1, len(r) // 16)] for t in (0.25, 0.5)]
        samples.sort()
        z = samples[len(samples) // 3] + 0.12
        if w['kind'] == 'tidal': z = max(z, 0.10); col = hexc('#2c3d3c')
        elif w['kind'] == 'tank': col = hexc('#3a4540')
        else: col = hexc(LAKE_COL.get(w['name'] or '', '#394a39'))
        C.K.face_holes('lm_lake', r, [h[:-1] if h[0] == h[-1] else h for h in w.get('holes', [])], z, col)
        n += 1
    return n

BATHY = '/Users/daniel/code/qipu-render-work/landmarks/bathy_8m.npy'     # tools/bathy.py (3DEP, flattened patches filled)

def _depth_image(bpy, ox, oy, w_, h_):
    """the depth under the sea on the mask's frame, as a float image (R =
    sqrt(depth / 120 m), more resolution in the shallows); None if no data"""
    if os.path.exists(BATHY):
        dep = np.load(BATHY).astype(np.float32)                 # row 0 = north
        ny, nx = dep.shape
    else:
        import lm_dem
        if not lm_dem.available(): return None
        res = 8.0; nx, ny = int(w_ / res), int(h_ / res)
        X, Y = np.meshgrid(ox + (np.arange(nx) + 0.5) * res, oy + h_ - (np.arange(ny) + 0.5) * res)
        Z = lm_dem.sample_arr(X, Y)
        dep = np.where(np.isnan(Z), 40.0, np.clip(-Z, 0.0, 120.0)).astype(np.float32)
    v = np.sqrt(np.clip(dep / 120.0, 0, 1)).astype(np.float32)[::-1]     # bpy rows start at the bottom
    im = bpy.data.images.new('lm_depth', nx, ny, alpha=False, float_buffer=True)
    px = np.zeros((ny, nx, 4), np.float32); px[..., 0] = v; px[..., 3] = 1.0
    im.pixels.foreach_set(px.ravel()); im.colorspace_settings.name = 'Non-Color'
    return im

# the water's own colour (under the sky it reflects) by depth, sqrt(depth / 120 m):
# the bay is turbid — olive-grey over the flats and along the shore, teal
# over the shoals, the navy-teal the render had before only in the deep
# channel of the Golden Gate and offshore
DEPTH_STOPS = [(0.0, (0.070, 0.074, 0.052)), (0.10, (0.040, 0.060, 0.050)), (0.20, (0.020, 0.045, 0.046)),
               (0.32, (0.010, 0.030, 0.038)), (0.50, (0.006, 0.021, 0.031)), (1.0, (0.003, 0.012, 0.024))]

def sea_depth(C):
    """recolour the render's 'sea' material by the depth under the water"""
    bpy = C.bpy
    m = bpy.data.materials.get('sea')
    if m is None: return False
    nt = m.node_tree
    mp = next((n for n in nt.nodes if n.type == 'MAPPING'), None)
    wat = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED' and n.inputs['Roughness'].default_value < 0.1), None)
    if mp is None or wat is None: return False
    # the mask's own frame: Location = (-ox/w, -oy/h), Scale = (1/w, 1/h)
    sx, sy = mp.inputs['Scale'].default_value[0], mp.inputs['Scale'].default_value[1]
    lx, ly = mp.inputs['Location'].default_value[0], mp.inputs['Location'].default_value[1]
    w_, h_ = 1.0 / sx, 1.0 / sy; ox, oy = -lx * w_, -ly * h_
    im = _depth_image(bpy, ox, oy, w_, h_)
    if im is None: return False
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = im; tn.extension = 'EXTEND'; tn.interpolation = 'Cubic'
    nt.links.new(mp.outputs[0], tn.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); cr = ramp.color_ramp
    stops = DEPTH_STOPS
    cr.elements[0].position, cr.elements[0].color = stops[0][0], (*stops[0][1], 1)
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, col in stops[1:-1]:
        e = cr.elements.new(pos); e.color = (*col, 1)
    nt.links.new(tn.outputs['Color'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], wat.inputs['Base Color'])
    return True

def sea_wind(C, seed=0.0):
    """wind on the bay at city scale: the render's sea is one mirror of the
    sky, so it reads flat and uniform from far out. Wind lanes and slicks
    make its roughness vary over hundreds of metres to kilometres — calm
    water mirrors the bright sky near the horizon, ruffled water shows its
    own darker colour and scatters the sun. A low-frequency noise sets the
    roughness (0.03 slick .. 0.11 ruffled) and the ripples' bump strength."""
    bpy = C.bpy
    m = bpy.data.materials.get('sea')
    if m is None: return False
    nt = m.node_tree
    wat = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED' and n.inputs['Roughness'].default_value < 0.1), None)
    bm = next((n for n in nt.nodes if n.type == 'BUMP'), None)
    if wat is None: return False
    L_ = nt.links.new
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    # wind lanes: stretched along the prevailing westerly (x), 1.5-3 km
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.45, 1.0, 1.0)
    mp.inputs['Location'].default_value = (seed, 0.0, 0.0)
    L_(geo.outputs['Position'], mp.inputs[0])
    n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 0.0011; n1.inputs['Detail'].default_value = 3.0
    n1.inputs['Roughness'].default_value = 0.55
    L_(mp.outputs[0], n1.inputs['Vector'])
    # gusts: 150-400 m patches inside the lanes
    n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 0.006; n2.inputs['Detail'].default_value = 2.0
    L_(geo.outputs['Position'], n2.inputs['Vector'])
    def mth(op, a, b=None, clamp=False):
        n_ = nt.nodes.new('ShaderNodeMath'); n_.operation = op; n_.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n_.inputs[i].default_value = v
            else: L_(v, n_.inputs[i])
        return n_.outputs[0]
    w = mth('ADD', mth('MULTIPLY', n1.outputs['Fac'], 0.75), mth('MULTIPLY', n2.outputs['Fac'], 0.25))
    # 0 slick .. 1 ruffled, with soft edges
    wr = mth('MULTIPLY', mth('SUBTRACT', w, 0.44), 5.0, clamp=True)
    wr = mth('MULTIPLY', mth('MULTIPLY', wr, wr), mth('SUBTRACT', 3.0, mth('MULTIPLY', wr, 2.0)))
    L_(mth('ADD', 0.03, mth('MULTIPLY', wr, 0.08)), wat.inputs['Roughness'])
    if bm is not None:
        L_(mth('ADD', 0.25, mth('MULTIPLY', wr, 0.55)), bm.inputs['Strength'])
    return True

# ── piers and docks ──────────────────────────────────────────────────────────
PIERS_JSON = '/Users/daniel/code/qipu-render-work/landmarks/piers.json'
try:
    from terrain_hq import PIER_Z                  # the plateau terrain_hq stands the sheds on
except Exception:
    PIER_Z = 2.3
DECK = hexc('#8e8a82'); DECK_SIDE = hexc('#3e3a35'); FLOAT = hexc('#8b8272')

def _inside(x, y, r):
    ins = False
    for i in range(len(r)):
        (x1, y1), (x2, y2) = r[i], r[(i + 1) % len(r)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1: ins = not ins
    return ins

def piers(C):
    """the piers' decks and the marinas' docks (OpenStreetMap man_made=pier,
    piers.json from lm_prep.py), and the aprons round the pier sheds that
    terrain_hq stood on a plateau (d['_piers']). The ground under a pier is
    3DEP's (which has the decks in it) and takes the ground's lawn and dry
    grass; a deck is concrete. A fixed deck: a slab at the ground's level
    inside it (its median, never under a spike more than a metre over it),
    dark sides down into the water (the piles in shadow). A float: 0.55 m
    over the water, weathered timber. Returns the number built."""
    K, tg = C.K, C.tg
    bx0, by0, bx1, by1 = C.box
    def near(pts, pad=200.0):
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        return not (max(xs) < bx0 - pad or min(xs) > bx1 + pad or max(ys) < by0 - pad or min(ys) > by1 + pad)
    def deck_z(r):
        xs = [p[0] for p in r]; ys = [p[1] for p in r]
        s = []
        st = max(2.0, min(max(xs) - min(xs), max(ys) - min(ys)) / 12)
        x = min(xs) + st / 2
        while x < max(xs) and len(s) < 400:
            y = min(ys) + st / 2
            while y < max(ys):
                if _inside(x, y, r): s.append(tg(x, y))
                y += st
            x += st
        if not s: s = [tg(*p) for p in r]
        s = np.array(s, float); med = float(np.median(s))
        return float(np.clip(min(s.max(), med + 1.0) + 0.10, PIER_Z + 0.1, 6.5))
    n = 0
    decks = []
    if os.path.exists(PIERS_JSON):
        for p in json.load(open(PIERS_JSON))['piers']:
            pts = p.get('ring') or p.get('line')
            if not near(pts): continue
            if p['kind'] in ('deck', 'float'):
                decks.append((p['kind'], [tuple(q) for q in p['ring']]))
            else:
                # a dock or a finger: a plank strip along the line, over water only
                L_ = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
                mid = pts[len(pts) // 2]
                if tg(*mid) > 1.0: continue                    # on land or on a deck the ground already has
                fl = p['kind'] == 'float_line' or L_ < 80.0
                z = 0.55 if fl else 2.4
                w = p['width']
                for a, b in zip(pts, pts[1:]):
                    if math.hypot(b[0] - a[0], b[1] - a[1]) < 0.2: continue
                    K.beam('lm_matte', (a[0], a[1], z - 0.2), (b[0], b[1], z - 0.2), w, 0.4, FLOAT if fl else DECK)
                    if not fl: K.beam('lm_matte', (a[0], a[1], (z - 1.6) / 2), (b[0], b[1], (z - 1.6) / 2), w * 0.85, z + 1.2, DECK_SIDE, caps=False)
                n += 1
    for r in (C.d.get('_piers') or []) if isinstance(C.d, dict) else []:
        if near(r): decks.append(('apron', [tuple(q) for q in r]))
    for kind, r in decks:
        if len(r) < 3: continue
        if kind == 'float':
            K.prism('lm_matte', r, -0.3, 0.55, FLOAT); n += 1; continue
        z = deck_z(r)
        K.prism('lm_matte', r, -1.5, z - 0.02, DECK_SIDE, top=False)
        K.face_holes('sidewalk', r, [], z, DECK)
        n += 1
    return n
