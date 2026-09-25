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

# When each water body was there, for the era renders (None = natural, always).
# OSM way/relation id -> (year it held water, source). Sources: SF Recreation
# and Parks and Wikipedia (Golden Gate Park; Blue Heron Lake Boathouse; Sutro
# Baths; Palace of Fine Arts), goldengatepark.com (Elk Glen).
LAKE_BUILT = {
    16650677: (None, 'Mountain Lake: natural'),
    16308125: (None, 'Lake Merced: natural lagoon (outline changed since; kept)'),
    31860201: (None, 'Pine Lake, Stern Grove: natural'),
    2165709: (None, 'North Lake: one of the natural dune lakes the park kept (Chain of Lakes)'),
    1439752: (None, 'Middle Lake: natural (Chain of Lakes)'),
    1439753: (None, 'South Lake: natural (Chain of Lakes)'),
    30969894: (None, 'Laguna Honda: the natural "deep lagoon", dammed as a reservoir'),
    427296593: (None, 'Yosemite Marsh: natural'),
    1127627007: (None, 'Islais Creek: the tidal creek, channelled'),
    12908: (1893, 'Blue Heron (Stow) Lake: dug 1893 for the 1894 Midwinter Fair (SF Rec & Park)'),
    16750564: (1904, 'Spreckels Lake: built 1902-04, first filled February 1904 (Wikipedia, Golden Gate Park)'),
    910257043: (1882, 'Alvord Lake: financed by William Alvord, 1882 (Wikipedia, Golden Gate Park)'),
    100844313: (1936, 'Elk Glen Lake: built 1936 (goldengatepark.com)'),
    100844604: (1909, 'Lloyd Lake: attested by 1909, when the Portals of the Past were set on its shore'),
    24308365: (1938, 'Fly Casting Pools: with the Anglers Lodge, 1938'),
    388991375: (1940, 'Dwarf Conifer Pond: Strybing Arboretum, opened 1940'),
    388991378: (1940, 'Bamboo Pond: Strybing Arboretum, opened 1940'),
    7471537: (1915, 'Palace of Fine Arts lagoon: the 1915 Exposition (before: the Harbor View marsh, the history agent\'s)'),
    32651841: (1915, 'pond by the Palace of Fine Arts: the 1915 Exposition grounds'),
    32776540: (1966, 'Sutro Baths: the pools lie open since the 1966 fire'),
    32776535: (1966, 'Sutro Baths: the pools lie open since the 1966 fire'),
}
GGPARK = (-6400.0, 480.0, -1350.0, 1400.0)      # Golden Gate Park (and its dune lakes), world m
LAKE_UNKNOWN_GGP = (1870, 'a pond in Golden Gate Park with no dated source: not before the park (1870)')
LAKE_UNKNOWN = (1950, 'no dated source: shown from 1950 on (a man-made pond or tank on made land would float on the old bay)')

def lake_built(w):
    """(year or None, why) for a water.json entry"""
    if w['id'] in LAKE_BUILT: return LAKE_BUILT[w['id']]
    xs = [p[0] for p in w['ring']]; ys = [p[1] for p in w['ring']]
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    if GGPARK[0] <= cx <= GGPARK[2] and GGPARK[1] <= cy <= GGPARK[3]: return LAKE_UNKNOWN_GGP
    return LAKE_UNKNOWN

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
    n = 0; polys = []
    for w in W:
        r = [tuple(p) for p in w['ring']]
        r = r[:-1] if r[0] == r[-1] else r
        xs = [p[0] for p in r]; ys = [p[1] for p in r]
        if max(xs) < bx0 - 300 or min(xs) > bx1 + 300 or max(ys) < by0 - 300 or min(ys) > by1 + 300: continue
        yb = lake_built(w)[0]
        if C.era is not None and yb is not None and C.era < yb: continue       # not dug yet
        # the lake's level: the ground inside it (the median of a few points
        # pulled in from the shore towards the centroid)
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        samples = [C.tg(x + (cx - x) * t, y + (cy - y) * t) for (x, y) in r[::max(1, len(r) // 16)] for t in (0.25, 0.5)]
        samples.sort()
        z = samples[len(samples) // 3] + 0.12
        if w['kind'] == 'tidal': z = max(z, 0.10); col = hexc('#2c3d3c')
        elif w['kind'] == 'tank': col = hexc('#3a4540')
        else: col = hexc(LAKE_COL.get(w['name'] or '', '#394a39'))
        hs = [h[:-1] if h[0] == h[-1] else h for h in w.get('holes', [])]
        C.K.face_holes('lm_lake', r, hs, z, col)
        polys.append((r, hs))
        n += 1
    try:
        nl, nt = _clear_water(C, polys)
        if nl or nt: C.log(f'water_hq: {nl} lawn faces over the lakes hidden, {nt} trees out of the water')
    except Exception as ex:
        C.log('water_hq: clearing over the lakes failed', ex)
    return n

def _inside_many(X, Y, polys):
    """points in any (ring, holes) polygon, even-odd, numpy"""
    out = np.zeros(X.shape, bool)
    for ring, holes in polys:
        R = np.asarray(ring, float)
        pre = (X >= R[:, 0].min()) & (X <= R[:, 0].max()) & (Y >= R[:, 1].min()) & (Y <= R[:, 1].max())
        if not pre.any(): continue
        x, y = X[pre], Y[pre]; ins = np.zeros(x.shape, bool)
        for q in [ring] + list(holes):
            Q = np.asarray(q, float); Q2 = np.roll(Q, -1, 0)
            for (x1, y1), (x2, y2) in zip(Q, Q2):
                c = ((y1 > y) != (y2 > y)) & (x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1e-12) + x1)
                ins ^= c
        out[np.nonzero(pre)[0][ins]] = True
    return out

def _clear_water(C, polys):
    """the engine's park lawns are coarse triangles draped at their corners:
    across a lake they span from bank to bank ABOVE the water (Lake Merced,
    the Palace of Fine Arts lagoon: khaki wedges on the water). A lawn face
    any of whose inner points is in a lake is hidden (the ground under it has
    the park's own grass); a tree whose trunk stands in a lake is dropped."""
    if not polys: return 0, 0
    bpy = C.bpy; nl = nt = 0
    for ob in list(C.sc.collection.all_objects):
        if ob.type != 'MESH': continue
        me = ob.data
        if ob.name in ('lawns', 'paths') and len(me.polygons):
            npg = len(me.polygons)
            co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
            lt = np.empty(npg, np.int32); me.polygons.foreach_get('loop_total', lt)
            if (lt != 3).any(): continue
            vi = np.empty(npg * 3, np.int32); me.polygons.foreach_get('vertices', vi); T = co[vi.reshape(-1, 3)][:, :, :2]
            cen = T.mean(1)
            # the centre, halfway to each corner, and along each edge (a long
            # sliver over the water has no inner point in it: hairlines)
            pts = [cen] + [(cen + T[:, k]) / 2 for k in range(3)]
            for k in range(3):
                a_, b_ = T[:, k], T[:, (k + 1) % 3]
                pts += [a_ + (b_ - a_) * t_ for t_ in (0.2, 0.5, 0.8)]
            hit = np.zeros(npg, bool)
            for P_ in pts: hit |= _inside_many(P_[:, 0].astype(float), P_[:, 1].astype(float), polys)
            if hit.any():
                import landmarks_hq
                hm = landmarks_hq._hidden(bpy)
                if hm.name not in [m_.name for m_ in me.materials if m_]: me.materials.append(hm)
                slot = [m_.name if m_ else None for m_ in me.materials].index(hm.name)
                mi = np.empty(npg, np.int32); me.polygons.foreach_get('material_index', mi)
                mi[hit] = slot; me.polygons.foreach_set('material_index', mi); me.update()
                nl += int(hit.sum())
        elif ob.name == 'trees' and len(me.vertices):
            co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
            X_, Y_ = co[:, 0].astype(float), co[:, 1].astype(float)
            wet = _inside_many(X_, Y_, polys)
            # and a tree whose crown hangs mostly over the water (the canopy
            # masses round Stow Lake closed over it): 3 of 8 points half-way out
            # to the crown's edge in the lake. Crown width = scale x the proto's
            try:
                sc_ = np.empty(len(me.vertices), np.float32); me.attributes['s'].data.foreach_get('value', sc_)
                kd_ = np.empty(len(me.vertices), np.int32); me.attributes['kind'].data.foreach_get('value', kd_)
                root = bpy.data.collections.get('trees_protos')
                wid = [max([max(o.dimensions.x, o.dimensions.y) for o in c.all_objects if o.type == 'MESH'] or [5.0]) for c in root.children] if root else [5.0]
                wid = np.array(wid, float)
                rad = 0.5 * sc_ * wid[np.clip(kd_, 0, len(wid) - 1)]
                cnt = np.zeros(len(X_), np.int32)
                for k in range(8):
                    a_ = 2 * math.pi * k / 8
                    cnt += _inside_many(X_ + 0.5 * rad * math.cos(a_), Y_ + 0.5 * rad * math.sin(a_), polys)
                wet |= cnt >= 3
            except Exception as ex:
                C.log('water_hq: crowns over the lakes not checked', ex)
            if wet.any():
                import bmesh
                bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
                bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(wet)[0]], context='VERTS')
                bm.to_mesh(me); bm.free(); me.update(); nt += int(wet.sum())
    return nl, nt

BATHY = '/Users/daniel/code/qipu-render-work/landmarks/bathy_8m.npy'     # tools/bathy.py (3DEP, flattened patches filled)

def _depth_image(bpy, ox, oy, w_, h_):
    """the depth under the sea on the mask's frame, as a float image (R =
    sqrt(depth / DEPTH_MAX), more resolution in the shallows); None if no data.
    The 16-bit PNG first: a generated float image (images.new + pixels) came
    out blank in the render — the whole sea took the shallow colour"""
    png = BATHY.replace('.npy', '_v60.png')
    if os.path.exists(png) and abs(DEPTH_MAX - 60.0) < 1e-6:
        im = bpy.data.images.load(png, check_existing=True)
        im.colorspace_settings.name = 'Non-Color'
        return im
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
    v = np.sqrt(np.clip(dep / DEPTH_MAX, 0, 1)).astype(np.float32)[::-1]     # bpy rows start at the bottom
    im = bpy.data.images.new('lm_depth', nx, ny, alpha=False, float_buffer=True)
    px = np.zeros((ny, nx, 4), np.float32); px[..., 0] = v; px[..., 3] = 1.0
    im.pixels.foreach_set(px.ravel()); im.colorspace_settings.name = 'Non-Color'
    return im

# the water's own colour (under the sky it reflects) by depth, v = sqrt(depth / 60 m):
# the bay is turbid — sand-olive in the shallows along the shore, grey-green
# over the flats (2-5 m), teal-grey over the bay floor (10-20 m), navy only in
# the channels (the Golden Gate's 40-110 m). A first ramp on sqrt(depth / 120)
# put everything from 2 m to 30 m in the same dark band: no variation showed
DEPTH_MAX = 60.0
DEPTH_STOPS = [(0.00, (0.100, 0.098, 0.068)), (0.18, (0.062, 0.078, 0.060)), (0.29, (0.036, 0.060, 0.056)),
               (0.41, (0.019, 0.043, 0.049)), (0.58, (0.010, 0.029, 0.039)), (0.82, (0.005, 0.016, 0.029)), (1.0, (0.003, 0.011, 0.024))]

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
    # roughness only 0.035-0.06: rougher water mirrors the pale sky near the
    # horizon and washed the whole sea out (2026-09-24); the ripples carry it
    L_(mth('ADD', 0.035, mth('MULTIPLY', wr, 0.025)), wat.inputs['Roughness'])
    if bm is not None:
        L_(mth('ADD', 0.25, mth('MULTIPLY', wr, 0.55)), bm.inputs['Strength'])
    return True

# ── piers and docks ──────────────────────────────────────────────────────────
PIERS_JSON = '/Users/daniel/code/qipu-render-work/landmarks/piers.json'
try:
    from terrain_hq import PIER_Z                  # the plateau terrain_hq stands the sheds on
except Exception:
    PIER_Z = 2.3
DECK = hexc('#a59d8f'); DECK_SIDE = hexc('#3e3a35'); FLOAT = hexc('#8b8272'); BOLLARD = hexc('#2b2d2e')

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
    # today's decks and docks (OSM): the present-day city only; the history
    # agent draws the waterfront of each era (its own piers)
    if C.era is not None and C.era < 1990: return 0
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
            if C.era is not None and (C.era < __import__('era').DATED_PIERS.get(p.get('name'), 0) or all(__import__('era').dated_absent(q[0], q[1], C.era, pad=14.0) for q in pts)): continue   # a pier not yet built (era.DATED_PIERS), named or not
            if p['kind'] in ('deck', 'float'):
                decks.append((p['kind'], [tuple(q) for q in p['ring']]))
            else:
                # a dock or a finger: a plank strip along the line, over water only
                L_ = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
                mid = pts[len(pts) // 2]
                if tg(*mid) > 1.0: continue                    # on land or on a deck the ground already has
                fl = p['kind'] == 'float_line' or L_ < 80.0
                z = 0.55 if fl else 2.4
                # widths: OSM's when tagged; else a marina finger ~1.0 m (under 45 m
                # long), a float walkway 2.4 m, a fixed dock 3.5 m (lm_prep's
                # blanket 3.5 / 2.4 ate the slips: no boat fitted between fingers)
                w = p['width'] if p.get('width_tagged') else (1.0 if (fl and L_ < 45.0) else 2.4 if fl else 3.5)
                for a, b in zip(pts, pts[1:]):
                    if math.hypot(b[0] - a[0], b[1] - a[1]) < 0.2: continue
                    K.beam('lm_matte', (a[0], a[1], z - 0.2), (b[0], b[1], z - 0.2), w, 0.4, FLOAT if fl else DECK)
                    if not fl: K.beam('lm_matte', (a[0], a[1], (z - 1.6) / 2), (b[0], b[1], (z - 1.6) / 2), w * 0.85, z + 1.2, DECK_SIDE, caps=False)
                n += 1
    # the aprons terrain_hq grew round the pier sheds, only where no OSM deck
    # already covers them: an apron on an OSM deck doubled it (its dark sides
    # 2-5 m outside the deck, a black end on Pier 7 and a black band on Pier 1)
    osm_polys = [(r_, []) for k_, r_ in decks]
    for r in (C.d.get('_piers') or []) if isinstance(C.d, dict) else []:
        if not near(r): continue
        # not under a modelled place that replaces its footprint (Oracle Park's
        # DataSF block on the cove read as a pier shed: an apron over the field)
        _c = np.asarray(r, float).mean(0)
        if any(bool(g_.inside(np.array([_c[0]]), np.array([_c[1]]))[0]) for g_ in getattr(C, 'lm_regions', [])): continue
        R = np.asarray(r, float)
        xs_ = np.linspace(R[:, 0].min(), R[:, 0].max(), 14); ys_ = np.linspace(R[:, 1].min(), R[:, 1].max(), 14)
        GX, GY = np.meshgrid(xs_, ys_); GX, GY = GX.ravel(), GY.ravel()
        ins = _inside_many(GX, GY, [(r, [])])
        if ins.sum() and osm_polys and _inside_many(GX[ins], GY[ins], osm_polys).mean() > 0.3: continue
        decks.append(('apron', [tuple(q) for q in r]))
    for kind, r in decks:
        if len(r) < 3: continue
        _c = np.asarray(r, float).mean(0)       # a modelled place draws its own deck (Pier 39)
        if any(bool(g_.inside(np.array([_c[0]]), np.array([_c[1]]))[0]) for g_ in getattr(C, 'lm_regions', [])): continue
        if kind == 'float':
            K.prism('lm_matte', r, -0.3, 0.55, FLOAT); n += 1; continue
        z = deck_z(r)
        K.prism('lm_matte', r, -1.5, z - 0.02, DECK_SIDE, top=False)
        K.face_holes('lm_apron', r, [], z, DECK)
        # bollards along the edges over water, ~22 m apart (a ship's lines)
        for i in range(len(r)):
            a_, b_ = r[i], r[(i + 1) % len(r)]
            L_ = math.hypot(b_[0] - a_[0], b_[1] - a_[1])
            if L_ < 15.0: continue
            ux, uy = (b_[0] - a_[0]) / L_, (b_[1] - a_[1]) / L_
            mx, my = (a_[0] + b_[0]) / 2, (a_[1] + b_[1]) / 2
            side = [s_ for s_ in (1, -1) if tg(mx - s_ * uy * 4.0, my + s_ * ux * 4.0) < 0.8]
            if len(side) != 1: continue
            nx, ny = -side[0] * uy, side[0] * ux              # outward, over the water
            for k_ in range(1, int(L_ // 22.0) + 1):
                t_ = k_ * L_ / (int(L_ // 22.0) + 1)
                bx, by = a_[0] + ux * t_ - nx * 0.7, a_[1] + uy * t_ - ny * 0.7
                K.cyl('lm_paint', (bx, by, z), (bx, by, z + 0.75), 0.28, BOLLARD, n=8, smooth=False)
        n += 1
    return n
