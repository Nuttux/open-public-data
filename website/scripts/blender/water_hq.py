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
under it (USGS 3DEP topobathy where the tiles reach, 2 m): sand-green in the
shallows, dark teal over the flats, navy in the Golden Gate's channel.
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

def sea_depth(C, res=8.0):
    """recolour the render's 'sea' material by the depth under the water"""
    bpy = C.bpy
    m = bpy.data.materials.get('sea')
    if m is None: return False
    nt = m.node_tree
    img = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None)
    mp = next((n for n in nt.nodes if n.type == 'MAPPING'), None)
    wat = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED' and n.inputs['Roughness'].default_value < 0.1), None)
    if img is None or mp is None or wat is None: return False
    import lm_dem
    if not lm_dem.available(): return False
    # the mask's own frame: Location = (-ox/w, -oy/h), Scale = (1/w, 1/h)
    sx, sy = mp.inputs['Scale'].default_value[0], mp.inputs['Scale'].default_value[1]
    lx, ly = mp.inputs['Location'].default_value[0], mp.inputs['Location'].default_value[1]
    w_, h_ = 1.0 / sx, 1.0 / sy; ox, oy = -lx * w_, -ly * h_
    nx, ny = int(w_ / res), int(h_ / res)
    if nx * ny > 6e6: res = math.sqrt(w_ * h_ / 6e6); nx, ny = int(w_ / res), int(h_ / res)
    X, Y = np.meshgrid(ox + (np.arange(nx) + 0.5) * res, oy + (np.arange(ny) + 0.5) * res)
    Z = lm_dem.sample_arr(X, Y)
    depth = np.where(np.isnan(Z), 40.0, np.clip(-Z, 0.0, 120.0)).astype(np.float32)
    # a gentle blur so the colour flows (3 passes of a 3x3 box)
    for _ in range(3):
        p = np.pad(depth, 1, mode='edge')
        depth = (p[:-2, :-2] + p[:-2, 1:-1] + p[:-2, 2:] + p[1:-1, :-2] + p[1:-1, 1:-1] + p[1:-1, 2:] + p[2:, :-2] + p[2:, 1:-1] + p[2:, 2:]) / 9
    v = np.sqrt(np.clip(depth / 120.0, 0, 1)).astype(np.float32)          # more resolution in the shallows
    im = bpy.data.images.new('lm_depth', nx, ny, alpha=False, float_buffer=True)
    px = np.zeros((ny, nx, 4), np.float32); px[..., 0] = v; px[..., 3] = 1.0
    im.pixels.foreach_set(px.ravel()); im.colorspace_settings.name = 'Non-Color'
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = im; tn.extension = 'EXTEND'; tn.interpolation = 'Linear'
    nt.links.new(mp.outputs[0], tn.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); cr = ramp.color_ramp
    stops = [(0.0, (0.105, 0.105, 0.075)), (0.09, (0.045, 0.075, 0.060)), (0.18, (0.020, 0.050, 0.050)),
             (0.30, (0.010, 0.032, 0.040)), (0.50, (0.006, 0.022, 0.032)), (1.0, (0.003, 0.012, 0.024))]
    cr.elements[0].position, cr.elements[0].color = stops[0][0], (*stops[0][1], 1)
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*stops[-1][1], 1)
    for pos, col in stops[1:-1]:
        e = cr.elements.new(pos); e.color = (*col, 1)
    nt.links.new(tn.outputs['Color'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], wat.inputs['Base Color'])
    return True
