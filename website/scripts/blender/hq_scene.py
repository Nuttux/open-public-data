"""High-quality district render: buildings modelled from their records,
scanned trees and plants, PBR surfaces (all CC0, Poly Haven), path-traced.

blender -b -P hq_scene.py -- <scene_dir> <out.png> <spp> <w> <h>
env: BOX=x0,y0,x1,y1 (buildings generated) · CAM=map|hero · ORTHO · TX,TY ·
     SUN_AZ, SUN_EL · GRASS=1 · SHRUBS=1 · CARS=1 · PROPS=1
"""
import bpy, bmesh, json, base64, array, math, os, sys, glob, random, time
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_buildings as G
import city_data

argv = sys.argv[sys.argv.index('--') + 1:]
SD, OUT, SPP, W, H = argv[0], argv[1], int(argv[2]), int(argv[3]), int(argv[4])
E = os.environ.get
PH = os.path.expanduser('~/code/qipu-assets/polyhaven')
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)

d = json.load(open(os.path.join(SD, 'scene.json')))
bx0, by0, bx1, by1 = [float(v) for v in E('BOX').split(',')] if E('BOX') else d['box']
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def f32(b):
    a = array.array('f'); a.frombytes(base64.b64decode(b)); return a

def mesh_from(name, P, mat, smooth=False, weld=0.0):
    nv = len(P) // 3
    me = bpy.data.meshes.new(name)
    me.from_pydata([(P[i*3], P[i*3+1], P[i*3+2]) for i in range(nv)], [], [(t*3, t*3+1, t*3+2) for t in range(nv // 3)])
    if weld:
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
        bm.to_mesh(me); bm.free()
    for f in me.polygons:
        if f.normal.z < 0: f.flip()
    me.update()
    if smooth: me.shade_smooth()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    if mat: me.materials.append(mat)
    return ob

def in_box(x, y, pad=0.0): return bx0 - pad <= x <= bx1 + pad and by0 - pad <= y <= by1 + pad

# ── materials ────────────────────────────────────────────────────────────────
def ph_mat(asset, tile, tint=False, rot=0.0, name=None, rough_add=0.0, tint_k=1.0, lift=0.0, value=1.0):
    """a Poly Haven material, re-mapped to world space (box projection, `tile`
    metres a repeat) so generated geometry needs no UVs; optionally multiplied
    by the face colour attribute `bcol` (the paint)"""
    path = glob.glob(f'{PH}/{asset}/*.blend')[0]
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.materials = [m for m in src.materials if m == asset] or src.materials[:1]
    m = dst.materials[0]; m.name = name or asset; nt = m.node_tree
    geo = nt.nodes.new('ShaderNodeNewGeometry'); mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / tile, 1 / tile, 1 / tile); mp.inputs['Rotation'].default_value = (0, 0, rot)
    nt.links.new(geo.outputs['Position'], mp.inputs['Vector'])
    for n in nt.nodes:
        if n.type == 'TEX_IMAGE':
            n.projection = 'BOX'; n.projection_blend = 0.25
            for l in list(n.inputs['Vector'].links): nt.links.remove(l)
            nt.links.new(mp.outputs['Vector'], n.inputs['Vector'])
    pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    if tint:
        src_ = pr.inputs['Base Color'].links[0].from_socket
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'bcol'
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = tint_k
        nt.links.new(src_, mx.inputs[6]); nt.links.new(at.outputs['Color'], mx.inputs[7])
        # the textures are near-white plank/stucco: lift them so paint reads as paint
        br = nt.nodes.new('ShaderNodeBrightContrast'); br.inputs['Bright'].default_value = lift
        nt.links.new(mx.outputs[2], br.inputs['Color']); nt.links.new(br.outputs['Color'], pr.inputs['Base Color'])
    if value != 1.0:
        s_ = pr.inputs['Base Color'].links[0].from_socket
        hv = nt.nodes.new('ShaderNodeHueSaturation'); hv.inputs['Value'].default_value = value
        nt.links.new(s_, hv.inputs['Color']); nt.links.new(hv.outputs['Color'], pr.inputs['Base Color'])
    if rough_add:
        rl = pr.inputs['Roughness'].links
        ad = nt.nodes.new('ShaderNodeMath'); ad.operation = 'ADD'; ad.use_clamp = True; ad.inputs[1].default_value = rough_add
        if rl: nt.links.new(rl[0].from_socket, ad.inputs[0])
        else: ad.inputs[0].default_value = pr.inputs['Roughness'].default_value
        nt.links.new(ad.outputs[0], pr.inputs['Roughness'])
    # drop true displacement: bump from the normal map is what reads at 4 cm a pixel
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    for l in list(out.inputs['Displacement'].links): nt.links.remove(l)
    return m

def simple(name, col, rough=0.5, metal=0.0, attr=False, transmission=0.0, spec=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    p.inputs['Specular IOR Level'].default_value = spec
    if attr:
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'bcol'; nt.links.new(at.outputs['Color'], p.inputs['Base Color'])
    else: p.inputs['Base Color'].default_value = (*col, 1)
    return m

def glass_mat():
    # window glass seen from outside: a dark room behind, the sky mirrored
    m = bpy.data.materials.new('glass'); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
    geo = nt.nodes.new('ShaderNodeNewGeometry'); wn = nt.nodes.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'
    sn = nt.nodes.new('ShaderNodeVectorMath'); sn.operation = 'SNAP'; sn.inputs[1].default_value = (1.3, 1.3, 1.3)
    nt.links.new(geo.outputs['Position'], sn.inputs[0]); nt.links.new(sn.outputs[0], wn.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(wn.outputs['Value'], ramp.inputs[0])
    ramp.color_ramp.elements[0].color = (0.010, 0.012, 0.016, 1); ramp.color_ramp.elements[1].color = (0.06, 0.055, 0.05, 1)
    nt.links.new(ramp.outputs[0], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.03; p.inputs['Specular IOR Level'].default_value = 0.9; p.inputs['Coat Weight'].default_value = 0.4
    return m

def lap_siding(mat):
    """lap siding: every board's lower edge stands proud — a sawtooth in world z"""
    nt = mat.node_tree; pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    geo = nt.nodes.new('ShaderNodeNewGeometry'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Position'], sp.inputs[0])
    m1 = nt.nodes.new('ShaderNodeMath'); m1.operation = 'DIVIDE'; m1.inputs[1].default_value = 0.14; nt.links.new(sp.outputs[2], m1.inputs[0])
    fr = nt.nodes.new('ShaderNodeMath'); fr.operation = 'FRACT'; nt.links.new(m1.outputs[0], fr.inputs[0])
    bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = 0.8; bm.inputs['Distance'].default_value = 0.02
    nt.links.new(fr.outputs[0], bm.inputs['Height'])
    if pr.inputs['Normal'].links: nt.links.new(pr.inputs['Normal'].links[0].from_socket, bm.inputs['Normal'])
    nt.links.new(bm.outputs[0], pr.inputs['Normal'])

def fishscale(mat):
    nt = mat.node_tree; pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    geo = nt.nodes.new('ShaderNodeNewGeometry'); vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 5.5
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 1, 1.8); nt.links.new(geo.outputs['Position'], mp.inputs[0]); nt.links.new(mp.outputs[0], vo.inputs['Vector'])
    bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = 0.9; bm.inputs['Distance'].default_value = 0.03
    nt.links.new(vo.outputs['Distance'], bm.inputs['Height']); nt.links.new(bm.outputs[0], pr.inputs['Normal'])

log('materials')
M = {}
def siding_mat():
    """painted lap siding: boards of 14 cm, a shadow line under each board's
    lip, the wood's grain faintly through the paint, weathering in patches"""
    m = bpy.data.materials.new('siding'); m.use_nodes = True; nt = m.node_tree; pr = nt.nodes['Principled BSDF']
    geo = nt.nodes.new('ShaderNodeNewGeometry'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Position'], sp.inputs[0])
    def mth(op, a, b=None):
        n_ = nt.nodes.new('ShaderNodeMath'); n_.operation = op
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n_.inputs[i].default_value = v
            else: nt.links.new(v, n_.inputs[i])
        return n_.outputs[0]
    fr = mth('FRACT', mth('DIVIDE', sp.outputs[2], 0.14))
    lip = mth('SUBTRACT', 1.0, mth('MULTIPLY', mth('LESS_THAN', fr, 0.10), mth('SUBTRACT', 1.0, mth('DIVIDE', fr, 0.10))))
    shade = mth('ADD', 0.62, mth('MULTIPLY', lip, 0.38))
    at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'bcol'
    gr = nt.nodes.new('ShaderNodeTexNoise'); gr.inputs['Scale'].default_value = 3.0; gr.inputs['Detail'].default_value = 8
    gm = nt.nodes.new('ShaderNodeMapping'); gm.inputs['Scale'].default_value = (0.3, 0.3, 12.0); nt.links.new(geo.outputs['Position'], gm.inputs[0]); nt.links.new(gm.outputs[0], gr.inputs['Vector'])
    wx = nt.nodes.new('ShaderNodeTexNoise'); wx.inputs['Scale'].default_value = 0.4; wx.inputs['Detail'].default_value = 6; nt.links.new(geo.outputs['Position'], wx.inputs['Vector'])
    k = mth('MULTIPLY', shade, mth('ADD', 0.92, mth('MULTIPLY', gr.outputs['Fac'], 0.14)))
    k = mth('MULTIPLY', k, mth('ADD', 0.9, mth('MULTIPLY', wx.outputs['Fac'], 0.2)))
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1.0
    nt.links.new(at.outputs['Color'], mx.inputs[6]); cc = nt.nodes.new('ShaderNodeCombineColor')
    for i in range(3): nt.links.new(k, cc.inputs[i])
    nt.links.new(cc.outputs[0], mx.inputs[7]); nt.links.new(mx.outputs[2], pr.inputs['Base Color'])
    pr.inputs['Roughness'].default_value = 0.62
    bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = 0.7; bm.inputs['Distance'].default_value = 0.015
    nt.links.new(fr, bm.inputs['Height']); nt.links.new(bm.outputs[0], pr.inputs['Normal'])
    return m
M['siding'] = siding_mat()
M['trim'] = simple('trim', None, rough=0.45, attr=True)
M['shingle'] = ph_mat('white_planks_clean', 2.4, tint=True, name='shingle', value=1.35); fishscale(M['shingle'])
M['stucco'] = ph_mat('white_stucco', 3.0, tint=True, name='stucco', value=1.15)
M['brick'] = ph_mat('red_brick_plaster_patch_02', 3.0, tint=True, name='brick', tint_k=0.5)
M['concrete'] = ph_mat('grey_plaster', 3.0, tint=True, name='concrete_wall')
M['concrete_struct'] = ph_mat('concrete_pavement', 4.0, name='concrete_struct', value=0.85)
M['solar'] = simple('solar', (0.02, 0.03, 0.06), rough=0.15, spec=0.8)
M['glass'] = glass_mat()
M['door'] = simple('door', None, rough=0.4, attr=True)
M['roof_shingle'] = ph_mat('grey_roof_01', 3.2, tint=True, name='roof_shingle', lift=0.0)
M['roof_flat'] = ph_mat('tarred_gravel', 2.5, tint=True, name='roof_flat', lift=0.0)
M['metal'] = simple('metal', None, rough=0.35, metal=0.8, attr=True)
M['stair'] = ph_mat('concrete_pavement', 2.0, tint=True, name='stair')
M['shopglass'] = glass_mat()
M['awning'] = simple('awning', None, rough=0.7, attr=True)
M['curtain'] = simple('curtain', (0.62, 0.58, 0.50), rough=0.9)
M['asphalt'] = ph_mat('asphalt_02', 5.0, value=0.55)
if E('ERA'):
    # the carriageway of the period (era.pavement: basalt block in the old
    # core before 1910, graded earth beyond it, early concrete to 1950)
    import era as _EA
    _pv = _EA.pavement(int(E('ERA')), (d['box'][0] + d['box'][2]) / 2, (d['box'][1] + d['box'][3]) / 2)
    if _pv == 'basalt': M['asphalt'] = ph_mat('cobblestone_floor_05', 2.2, value=0.62, name='basalt')
    elif _pv == 'dirt': M['asphalt'] = ph_mat('brown_mud_dry', 3.0, value=1.05, name='dirt')
    elif _pv == 'oldpave': M['asphalt'] = ph_mat('concrete_pavement', 4.0, value=0.72, name='oldpave')
# open ground of the period: dune sand, and ash for the burned city of 1906
M['sand'] = ph_mat('aerial_sand', 55.0, name='sand', value=1.0)
# 1906: ash and scorched brick (burned_ground_01, CC0)
M['ash'] = ph_mat('burned_ground_01', 9.0, tint=True, name='ash', tint_k=1.0, rough_add=0.35)
M['soot'] = ph_mat('red_brick_plaster_patch_02', 3.0, tint=True, name='soot', tint_k=1.0)
def sand_look(m):
    """dune sand: Ocean Beach's pale buff, wind ripples a few centimetres
    apart across the wind, broad tonal drift so a dune field is not a tile"""
    nt = m.node_tree; pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    src_ = pr.inputs['Base Color'].links[0].from_socket
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.02; nz.inputs['Detail'].default_value = 5
    nt.links.new(geo.outputs['Position'], nz.inputs['Vector'])
    # the scan's own grain as a grey detail map; the colour is set below
    hs = nt.nodes.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = 0.0; hs.inputs['Value'].default_value = 1.6
    nt.links.new(src_, hs.inputs['Color'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1.0
    nt.links.new(hs.outputs['Color'], mx.inputs[6])
    rp = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(nz.outputs['Fac'], rp.inputs[0])
    # linear albedo of dry dune sand, Ocean Beach buff (display ~0.50/0.43/0.33 .. 0.62/0.54/0.42)
    rp.color_ramp.elements[0].color = (0.21, 0.16, 0.09, 1); rp.color_ramp.elements[1].color = (0.34, 0.26, 0.15, 1)
    nt.links.new(rp.outputs[0], mx.inputs[7])
    # the dune scrub: dark clumps of lupine and coyote brush over ~12 % of the
    # sand, as the 1938 frames show (Ryker frame 148) — a tone, not geometry
    sn = nt.nodes.new('ShaderNodeTexNoise'); sn.inputs['Scale'].default_value = 0.045; sn.inputs['Detail'].default_value = 6; sn.inputs['Roughness'].default_value = 0.62
    nt.links.new(geo.outputs['Position'], sn.inputs['Vector'])
    sr = nt.nodes.new('ShaderNodeValToRGB'); nt.links.new(sn.outputs['Fac'], sr.inputs[0])
    sr.color_ramp.elements[0].position = 0.60; sr.color_ramp.elements[0].color = (0, 0, 0, 1)
    sr.color_ramp.elements[1].position = 0.66; sr.color_ramp.elements[1].color = (1, 1, 1, 1)
    sm = nt.nodes.new('ShaderNodeMix'); sm.data_type = 'RGBA'; nt.links.new(sr.outputs[0], sm.inputs[0])
    nt.links.new(mx.outputs[2], sm.inputs[6]); sm.inputs[7].default_value = (0.045, 0.040, 0.016, 1)
    nt.links.new(sm.outputs[2], pr.inputs['Base Color'])
    wv = nt.nodes.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.inputs['Scale'].default_value = 9.0
    wv.inputs['Distortion'].default_value = 6.0; wv.inputs['Detail'].default_value = 3
    mp_ = nt.nodes.new('ShaderNodeMapping'); mp_.inputs['Rotation'].default_value = (0, 0, math.radians(-20)); mp_.inputs['Scale'].default_value = (0.25, 0.25, 0.25)
    nt.links.new(geo.outputs['Position'], mp_.inputs[0]); nt.links.new(mp_.outputs[0], wv.inputs['Vector'])
    bm_ = nt.nodes.new('ShaderNodeBump'); bm_.inputs['Strength'].default_value = 0.25; bm_.inputs['Distance'].default_value = 0.02
    nt.links.new(wv.outputs['Fac'], bm_.inputs['Height'])
    if pr.inputs['Normal'].links: nt.links.new(pr.inputs['Normal'].links[0].from_socket, bm_.inputs['Normal'])
    nt.links.new(bm_.outputs[0], pr.inputs['Normal'])
    pr.inputs['Roughness'].default_value = 0.9
sand_look(M['sand'])
M['sidewalk'] = ph_mat('concrete_pavement', 3.6, value=0.95)
M['lawn'] = ph_mat('leafy_grass', 3.0, name='lawn')
M['paint'] = ph_mat('asphalt_02', 5.0, name='paint')
_pn = M['paint'].node_tree; _pp = next(n for n in _pn.nodes if n.type == 'BSDF_PRINCIPLED')
_src = _pp.inputs['Base Color'].links[0].from_socket
_wm = _pn.nodes.new('ShaderNodeMix'); _wm.data_type = 'RGBA'; _wm.inputs[0].default_value = 0.78   # worn paint: the asphalt shows through
_pn.links.new(_src, _wm.inputs[6]); _wm.inputs[7].default_value = (0.78, 0.77, 0.72, 1); _pn.links.new(_wm.outputs[2], _pp.inputs['Base Color'])
M['path'] = ph_mat('pavement_03', 3.0, name='path')
M['chimney'] = ph_mat('red_brick_plaster_patch_02', 1.6, name='chimney')
M['roof_tile'] = ph_mat('roof_tiles_14', 2.2, tint=True, name='roof_tile', value=1.25)
M['deck'] = ph_mat('white_planks_clean', 2.0, tint=True, name='deck')

# lawn: the scan's leaf litter greened into a kept lawn, with macro variation
def green_lawn(m, dry=False):
    nt = m.node_tree; pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    src_ = pr.inputs['Base Color'].links[0].from_socket
    hs = nt.nodes.new('ShaderNodeHueSaturation'); hs.inputs['Hue'].default_value = 0.56 if not dry else 0.48
    hs.inputs['Saturation'].default_value = 1.35 if not dry else 0.9; hs.inputs['Value'].default_value = 0.8
    nt.links.new(src_, hs.inputs['Color'])
    geo = nt.nodes.new('ShaderNodeNewGeometry'); nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 0.05; nz.inputs['Detail'].default_value = 4
    nt.links.new(geo.outputs['Position'], nz.inputs['Vector'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
    nt.links.new(nz.outputs['Fac'], mx.inputs[0]); nt.links.new(hs.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = (0.75, 0.85, 0.6, 1)
    nt.links.new(mx.outputs[2], pr.inputs['Base Color'])
green_lawn(M['lawn'])

# ── terrain ──────────────────────────────────────────────────────────────────
log('terrain')
TP = array.array('f')
for m in d['meshes']:
    if m['layer'] == 'terrain' and not m.get('instanced'): TP.extend(f32(m['pos']))
for i in range(2, len(TP), 3): TP[i] *= 0.5                     # the export's ground is at zex 2
if E('ERA'):
    import era as _EA0
    for i in range(0, len(TP), 3):
        # made land not yet made (era.MADE_LAND): the shoal under the water
        if _EA0.water_then(TP[i], TP[i+1], int(E('ERA'))): TP[i+2] = -4.0
terrain = mesh_from('terrain', TP, M['lawn'], smooth=True, weld=0.05)
bvh_t = BVHTree.FromObject(terrain, bpy.context.evaluated_depsgraph_get())
def ground(x, y):
    hit = bvh_t.ray_cast(Vector((x, y, 2000)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] else 0.0

# ── the year shown: what stood, and the ground where nothing stood yet ──────
import era as EA
ERA = int(E('ERA')) if E('ERA') else None
G.ERA = ERA
log('buildings: reading records')
HG = city_data.hero_gids()
# the city as it stood: a building shows from its recorded year (a record with
# no year is taken as standing); inside the 1906 burned district, before the
# fire, today's footprints carry the lost city's stand-ins (gen_buildings)
_allb = [b for b in city_data.buildings(bx0 - 80, by0 - 80, bx1 + 80, by1 + 80) if b['gid'] not in HG]
recs = [b for b in (EA.place_record(dict(b), ERA) for b in _allb if in_box(b['cx'], b['cy'])) if b]
if ERA is not None and E('INFILL', '1') == '1':
    _inf = [b for b in EA.infill(_allb, ERA, {b['gid'] for b in recs}) if in_box(b['cx'], b['cy'])]
    log('lost buildings stood in for (era.infill)', len(_inf)); recs += _inf
OPEN = None; SAND = None; OPAD = 80.0
if ERA is not None:
    _OL = EA.OpenLand(recs, (bx0, by0, bx1, by1), float(E('OPEN_RES', 2.0)), ground, OPAD, ERA)
    OPEN, SAND, ox0, oy0 = _OL.open, _OL.sand, _OL.x0, _OL.y0
    def open_at(x, y, grid=None): return _OL.at(x, y, grid)
    log('open land', round(sum(OPEN) / len(OPEN), 3), 'sand', round(sum(SAND) / len(SAND), 3))
    # the ground of open land that is not dune sand: summer-dry grass (the
    # hills and vacant lots of the period), through the lawn material
    _om = bpy.data.images.new('openmask', _OL.W, _OL.H, float_buffer=True)
    _px = [0.0] * (4 * _OL.W * _OL.H)
    for k_ in range(_OL.W * _OL.H):
        _px[4 * k_] = OPEN[k_] * (1.0 - SAND[k_]) * (1.0 - _OL.park[k_]); _px[4 * k_ + 3] = 1.0
    _om.pixels.foreach_set(_px); _om.colorspace_settings.name = 'Non-Color'
    _lt = M['lawn'].node_tree; _lp = next(n for n in _lt.nodes if n.type == 'BSDF_PRINCIPLED')
    _src = _lp.inputs['Base Color'].links[0].from_socket
    _g = _lt.nodes.new('ShaderNodeNewGeometry'); _mp = _lt.nodes.new('ShaderNodeMapping'); _mp.vector_type = 'POINT'
    _mp.inputs['Location'].default_value = (-_OL.x0 / (_OL.W * _OL.res), -_OL.y0 / (_OL.H * _OL.res), 0)
    _mp.inputs['Scale'].default_value = (1 / (_OL.W * _OL.res), 1 / (_OL.H * _OL.res), 1)
    _lt.links.new(_g.outputs['Position'], _mp.inputs[0])
    _ti = _lt.nodes.new('ShaderNodeTexImage'); _ti.image = _om; _ti.extension = 'EXTEND'; _lt.links.new(_mp.outputs[0], _ti.inputs[0])
    _sp = _lt.nodes.new('ShaderNodeSeparateColor'); _lt.links.new(_ti.outputs['Color'], _sp.inputs[0])
    _bw = _lt.nodes.new('ShaderNodeRGBToBW'); _lt.links.new(_src, _bw.inputs[0])
    _dry = _lt.nodes.new('ShaderNodeMix'); _dry.data_type = 'RGBA'; _dry.blend_type = 'MULTIPLY'; _dry.inputs[0].default_value = 1.0
    _dry.inputs[6].default_value = (0.62, 0.40, 0.13, 1)          # golden, the dry-season grass
    _lt.links.new(_bw.outputs[0], _dry.inputs[7])
    _mx = _lt.nodes.new('ShaderNodeMix'); _mx.data_type = 'RGBA'; _lt.links.new(_sp.outputs[0], _mx.inputs[0])
    _lt.links.new(_src, _mx.inputs[6]); _lt.links.new(_dry.outputs[2], _mx.inputs[7])
    _lt.links.new(_mx.outputs[2], _lp.inputs['Base Color'])
else:
    def open_at(x, y, grid=None): return 0.0

# ── which street surfaces stood in the year shown (era.StreetGate) ────────
if ERA is not None:
    _SG = EA.StreetGate((bx0, by0, bx1, by1), ERA, open_at, OPAD)
    street_stands = _SG.stands
else:
    def street_stands(x, y): return True

# ── streets, markings, sidewalks ─────────────────────────────────────────────
log('streets')
SP, MP, DP = array.array('f'), array.array('f'), array.array('f')
for m in d['meshes']:
    if m.get('instanced'): continue
    if m['layer'] == 'streets':
        p_ = f32(m['pos'])
        if ERA is not None:
            q_ = array.array('f'); nd_ = 0
            for t in range(len(p_) // 9):
                a = t * 9
                if street_stands((p_[a] + p_[a+3] + p_[a+6]) / 3, (p_[a+1] + p_[a+4] + p_[a+7]) / 3): q_.extend(p_[a:a+9])
                else: nd_ += 1
            p_ = q_; log('street triangles not yet built', nd_)
        SP.extend(p_)
    if m['layer'] == 'street-markings' and (ERA is None or EA.P('marks', ERA) >= 0.5):
        # era.TABLE `marks`: today's paint, from 1950 on
        p = f32(m['pos']); ar = []
        for t in range(0, len(p) // 9, max(1, len(p) // 9 // 300)):
            a = t * 9; ar.append(abs((p[a+3]-p[a])*(p[a+7]-p[a+1]) - (p[a+4]-p[a+1])*(p[a+6]-p[a])) / 2)
        ar.sort()
        if ar and ar[len(ar) // 2] < 20:
            # paint is thin lines and bars: any single triangle over 6 m² is a
            # fill the engine draws under its paint, not paint
            for t in range(len(p) // 9):
                a = t * 9
                if abs((p[a+3]-p[a])*(p[a+7]-p[a+1]) - (p[a+4]-p[a+1])*(p[a+6]-p[a])) / 2 < 6.0: MP.extend(p[a:a+9])
    if m['layer'] == 'ground-detail':
        c = f32(m['col'])
        if c and c[2] > 0.8: DP.extend(f32(m['pos']))          # the white pieces: paved paths
def lift(P, dz):
    for i in range(2, len(P), 3): P[i] += dz
    return P
streets = mesh_from('streets', lift(SP, 0.02), M['asphalt'], weld=0.05)
if len(MP):
    # paint lies ON the asphalt: dropped onto the street surface below it
    sbv = BVHTree.FromObject(streets, bpy.context.evaluated_depsgraph_get())
    for i in range(0, len(MP), 3):
        h_ = sbv.ray_cast(Vector((MP[i], MP[i+1], MP[i+2] + 3)), Vector((0, 0, -1)))
        if h_[0] is not None: MP[i+2] = h_[0].z + 0.012
    mesh_from('markings', MP, M['paint'])
if len(DP):
    sb = BVHTree.FromObject(streets, bpy.context.evaluated_depsgraph_get())
    keep = array.array('f')
    for t in range(len(DP) // 9):
        cx_ = sum(DP[t*9+k*3] for k in range(3)) / 3; cy_ = sum(DP[t*9+k*3+1] for k in range(3)) / 3
        if sb.ray_cast(Vector((cx_, cy_, 2000)), Vector((0, 0, -1)))[0] is None: keep.extend(DP[t*9:t*9+9])
    if len(keep): mesh_from('paths', keep, M['path'])

def street_edges():
    bm = bmesh.new(); bm.from_mesh(streets.data); bm.edges.ensure_lookup_table()
    E_ = []
    for e in bm.edges:
        if len(e.link_faces) != 1: continue
        a, b = e.verts[0].co.copy(), e.verts[1].co.copy()
        inward = e.link_faces[0].calc_center_median() - (a + b) / 2; inward.z = 0
        v = b - a; outv = Vector((-v.y, v.x, 0)).normalized()
        if outv.dot(inward) > 0: outv = -outv
        E_.append((a, b, outv))
    bm.free(); return E_
SE = street_edges()
# sidewalks and curbs
Ps, Fs = [], []
for a, b, outv in SE:
    up = Vector((0, 0, 0.15))
    if open_at((a.x + b.x) / 2 + outv.x * 1.5, (a.y + b.y) / 2 + outv.y * 1.5) > 0.5: continue   # no kerb along open land
    # the far edge of the pavement follows the ground, never floats over it
    fa, fb = a + outv * 3.0, b + outv * 3.0
    fa.z = max(ground(fa.x, fa.y) + 0.06, a.z + 0.15 - 0.6); fb.z = max(ground(fb.x, fb.y) + 0.06, b.z + 0.15 - 0.6)
    k = len(Ps); Ps += [a + up, b + up, fb, fa]; Fs.append((k, k+1, k+2, k+3))
    k = len(Ps); Ps += [a, b, b + up, a + up]; Fs.append((k, k+1, k+2, k+3))
me = bpy.data.meshes.new('sidewalks'); me.from_pydata([tuple(p) for p in Ps], [], Fs); me.update()
# the rails of the year and the cars on them (era.rails: DataSF 9exe-acju with
# the Board's build years, and the torn-up lines of rail-history.json)
if ERA is not None and len(streets.data.polygons):
    _rb = BVHTree.FromObject(streets, bpy.context.evaluated_depsgraph_get())
    def _street_z(x, y):
        h_ = _rb.ray_cast(Vector((x, y, 3000)), Vector((0, 0, -1)))
        return h_[0].z if h_[0] else None
    # CONVENTION on liveries: cable cars maroon, streetcars dark green before
    # 1945, Muni light rail silver-grey from the 1980s Boeing and Breda cars
    _bm = {'cable': simple('cablecar', (0.36, 0.07, 0.07), rough=0.45),
           'streetcar': simple('streetcar', (0.14, 0.24, 0.17) if ERA < 1945 else (0.62, 0.55, 0.32), rough=0.45),
           'metro': simple('lrv', (0.14, 0.24, 0.17) if ERA < 1945 else (0.62, 0.55, 0.32) if ERA < 1980 else (0.66, 0.67, 0.68), rough=0.4)}
    EA.build_rails(bpy, ERA, (bx0, by0, bx1, by1), _street_z, simple('railsteel', (0.55, 0.55, 0.56), rough=0.25, metal=1.0),
                   simple('cableslot', (0.02, 0.02, 0.02), rough=0.9), _bm, log)
ob = bpy.data.objects.new('sidewalks', me); sc.collection.objects.link(ob); me.materials.append(M['sidewalk'])

# ── buildings ────────────────────────────────────────────────────────────────
# the landmarks themselves: the engine's own hand-built forms, in their colours
_HP, _HC = array.array('f'), array.array('f')
for m in d['meshes']:
    if m['layer'] == 'heroes' and not m.get('instanced'):
        _p = f32(m['pos'])
        _cx = (min(_p[0::3]) + max(_p[0::3])) / 2; _cy = (min(_p[1::3]) + max(_p[1::3])) / 2
        if not EA.landmark_stands(_cx, _cy, ERA):
            log('landmark not yet built:', EA.landmark_for(_cx, _cy)[0]); continue
        _HP.extend(_p); _HC.extend(f32(m['col']))
if len(_HP):
    _nv = len(_HP) // 3
    _me = bpy.data.meshes.new('landmarks'); _me.from_pydata([(_HP[i*3], _HP[i*3+1], _HP[i*3+2]) for i in range(_nv)], [], [(t*3, t*3+1, t*3+2) for t in range(_nv // 3)])
    _ca = _me.color_attributes.new('bcol', 'FLOAT_COLOR', 'POINT'); _ca.data.foreach_set('color', [x for i in range(_nv) for x in (_HC[i*3], _HC[i*3+1], _HC[i*3+2], 1.0)])
    _me.update(); _ob = bpy.data.objects.new('landmarks', _me); sc.collection.objects.link(_ob); _me.materials.append(simple('landmark', None, rough=0.6, attr=True))
log('buildings:', len(recs))
out = G.Out(); nb = 0
for b in recs:
    try:
        G.building(b, ground, out); nb += 1
    except Exception as ex:
        print('building failed', b['gid'], ex)
objs = G.emit(bpy, out, M)
log('buildings generated', nb, 'meshes', len(objs), 'faces', sum(len(o.data.polygons) for o in objs))

# ── beyond the modelled box: the engine's own massing, plainly painted ──────
FP, FC = array.array('f'), array.array('f')
FAR_MESHES = list(d['meshes'])
for extra in [x for x in E('FAR_SCENES', '').split(',') if x]:
    FAR_MESHES += json.load(open(os.path.join(os.path.dirname(os.path.abspath(SD)), extra, 'scene.json')))['meshes']
_FAR_KD = None
if ERA is not None:
    # the engine's far massing carries no year: each piece takes the year of
    # the record whose footprint centre it was drawn round
    from mathutils.kdtree import KDTree as _KD2
    _sb = d['box']; _allr = city_data.buildings(_sb[0] - 600, _sb[1] - 600, _sb[2] + 600, _sb[3] + 600)
    _FAR_KD = _KD2(max(1, len(_allr)))
    for i_, b_ in enumerate(_allr): _FAR_KD.insert((b_['cx'], b_['cy'], 0), i_)
    _FAR_KD.balance()
    _far_ok = {}
for m in FAR_MESHES:
    if m['layer'] != 'buildings' or m.get('instanced') or not m.get('cen'): continue
    p, c, e = f32(m['pos']), f32(m['col']), f32(m['cen'])
    for t in range(len(p) // 9):
        if in_box(e[t*6], e[t*6+1], 4): continue
        if _FAR_KD is not None:
            k_ = (round(e[t*6], 1), round(e[t*6+1], 1))
            if k_ not in _far_ok:
                co_, i_, dd_ = _FAR_KD.find((e[t*6], e[t*6+1], 0))
                y_ = _allr[i_]['year'] if dd_ < 25 else None
                # a later building beyond the modelled box is not drawn at all
                # (its stand-in is only modelled inside the box)
                _far_ok[k_] = (y_ or 0) <= ERA and not EA.water_then(k_[0], k_[1], ERA) and not (ERA == 1906 and EA.burned(*k_))
            if not _far_ok[k_]: continue
        FP.extend(p[t*9:t*9+9]); FC.extend(c[t*9:t*9+9])
if E('FAR_GROUND'):
    # a plain ground under the distant city, so the horizon is land, not void
    g_ = 9000; zg_ = float(E('FAR_GROUND'))
    me = bpy.data.meshes.new('farground'); me.from_pydata([(-g_, -g_, zg_), (g_, -g_, zg_), (g_, g_, zg_), (-g_, g_, zg_)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new('farground', me); sc.collection.objects.link(ob); me.materials.append(simple('farground', (0.16, 0.16, 0.15), rough=0.9))
if len(FP):
    nv = len(FP) // 3
    me = bpy.data.meshes.new('far'); me.from_pydata([(FP[i*3], FP[i*3+1], FP[i*3+2]) for i in range(nv)], [], [(t*3, t*3+1, t*3+2) for t in range(nv // 3)])
    ca = me.color_attributes.new('bcol', 'FLOAT_COLOR', 'POINT')
    ca.data.foreach_set('color', [x for i in range(nv) for x in (FC[i*3], FC[i*3+1], FC[i*3+2], 1.0)])
    me.update(); ob = bpy.data.objects.new('far', me); sc.collection.objects.link(ob); me.materials.append(simple('far', None, rough=0.8, attr=True))
    log('far massing triangles', nv // 3)

# ── vegetation ───────────────────────────────────────────────────────────────
def load_collection(asset, coll_name=None):
    path = glob.glob(f'{PH}/{asset}/*.blend')[0]
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        want = [c for c in src.collections if c == (coll_name or f'{asset}_LOD0')] or [c for c in src.collections if c.endswith('LOD0')] or src.collections[:1]
        dst.collections = want
    c = dst.collections[0]
    # measure, and move the collection's content so its foot is at the origin
    mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
    for o in c.all_objects:
        if o.type != 'MESH': continue
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            mn = Vector((min(mn.x, p.x), min(mn.y, p.y), min(mn.z, p.z))); mx = Vector((max(mx.x, p.x), max(mx.y, p.y), max(mx.z, p.z)))
    c.instance_offset = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    return c, (mx.x - mn.x, mx.y - mn.y, mx.z - mn.z)

def scatter(name, points, colls, seed=1):
    """points: (x, y, z, scale, rot) ; one instance per point, collection picked at random"""
    root = bpy.data.collections.new(f'{name}_set'); sc.collection.children.link(root)
    rnd = random.Random(seed)
    for i, (x, y, z, s, r) in enumerate(points):
        c = colls[rnd.randrange(len(colls))] if not isinstance(colls[0], tuple) else None
        o = bpy.data.objects.new(f'{name}{i}', None); o.instance_type = 'COLLECTION'; o.instance_collection = c
        o.location = (x, y, z); o.scale = (s, s, s); o.rotation_euler.z = r
        root.objects.link(o)
    log(name, len(points))

log('vegetation')
TREE_STREET = [load_collection(a) for a in ('island_tree_01', 'island_tree_02', 'island_tree_03', 'tree_small_02', 'jacaranda_tree')]
TREE_PARK = [load_collection(a) for a in ('pine_tree_01', 'fir_tree_01', 'island_tree_02', 'island_tree_01')]
for c, _ in TREE_STREET + TREE_PARK:
    if c.name in sc.collection.children: sc.collection.children.unlink(c)
# the recorded trees: street trees on the sidewalks, the rest (parks, yards) as park trees
from mathutils.kdtree import KDTree
# a tree is a street/yard tree when a building's wall is near it, a park tree
# when none is (ring vertices, not centres: downtown footprints are big)
_rp = [p for b in recs for p in b['ring']]
kd = KDTree(max(1, len(_rp))); [kd.insert((p[0], p[1], 0), i) for i, p in enumerate(_rp)]; kd.balance()
park_pts, street_pts = [], []
seen = set(); rnd = random.Random(3)
_TKD = None
if ERA is not None:
    _tl = city_data.trees(bx0 - 50, by0 - 50, bx1 + 50, by1 + 50)
    if _tl:
        _TKD = KDTree(len(_tl)); _TY = [t_[2] for t_ in _tl]
        for i_, t_ in enumerate(_tl): _TKD.insert((t_[0], t_[1], 0), i_)
        _TKD.balance()
    log('published street trees', len(_tl), 'dated', sum(1 for t_ in _tl if t_[2]))
for t in d['trees']:
    for (x, y, z, sxz, sy, rot, r_, g_, b_) in t['inst']:
        k = (round(x), round(y))
        if k in seen or not in_box(x, y, 40): continue
        seen.add(k)
        zz = ground(x, y)
        crown = max(3.0, 2.4 * sxz)
        far = kd.find((x, y, 0))[2] > 28 if len(_rp) else True
        if ERA is not None:
            # a street tree the DataSF Street Tree List dates stands from its
            # planting year, its crown grown in proportion to its age then;
            # an undated one by the decade table's share (era.TABLE `trees`)
            pt_ = _TKD.find((x, y, 0)) if _TKD else None
            py_ = _TY[pt_[1]] if (pt_ and pt_[2] < 2.5) else None
            if py_ is not None:
                if py_ > ERA: continue
                crown *= min(1.0, ((ERA - py_ + 3) / (2025 - py_ + 3)) ** 0.7)
                crown = max(1.6, crown)
            elif not far and rnd.random() > EA.street_tree_keep(ERA): continue
            # no tree on open land that was not yet planted: dunes and grazing ground
            if open_at(x, y) > 0.5 and _OL.at(x, y, _OL.park) < 0.5 and rnd.random() > 0.04: continue
            if EA.water_then(x, y, ERA): continue
            if 1906 <= ERA <= 1908 and EA.burned(x, y): continue
            if EA.PPIE_YEARS[0] <= ERA <= EA.PPIE_YEARS[1] and EA.ppie_footprint(x, y): continue
        (park_pts if far else street_pts).append((x, y, zz, crown, rnd.uniform(0, 6.283)))
HERO_XY = [float(v) for v in E('HERO_FROM').split(',')[:2]] if E('HERO_FROM') else None
def place_trees(name, pts, kinds, seed):
    root = bpy.data.collections.new(f'{name}_set'); sc.collection.children.link(root)
    r = random.Random(seed)
    for i, (x, y, z, crown, rot) in enumerate(pts):
        if HERO_XY and math.hypot(x - HERO_XY[0], y - HERO_XY[1]) < crown * 0.6 + 4: continue
        c, dims = kinds[r.randrange(len(kinds))]
        s = crown / max(0.5, max(dims[0], dims[1])) * r.uniform(0.85, 1.15)
        o = bpy.data.objects.new(f'{name}{i}', None); o.instance_type = 'COLLECTION'; o.instance_collection = c
        o.location = (x, y, z - 0.1); o.scale = (s, s, s * r.uniform(0.9, 1.1)); o.rotation_euler.z = rot
        root.objects.link(o)
    log(name, len(pts))
place_trees('st_tree', street_pts, TREE_STREET, 5)
place_trees('pk_tree', park_pts, TREE_PARK, 7)

dg = bpy.context.evaluated_depsgraph_get()
def covered(x, y, z):
    hit, loc, nor, idx, ob, _ = sc.ray_cast(dg, Vector((x, y, z + 0.3)), Vector((0, 0, 1)), distance=300)
    return hit
def street_near(x, y, z, r=1.5):
    hit, loc, *_ = sc.ray_cast(dg, Vector((x, y, z + 5)), Vector((0, 0, -1)), distance=10)
    return hit and loc.z > z + 0.03

if E('SHRUBS', '1') == '1':
    # open ground by the houses: bushes (the one real bush, scaled), flower
    # plants at their own size, and now and then a small tree
    log('shrubs')
    BUSH = load_collection('shrub_02'); FLW = [load_collection(a) for a in ('shrub_01', 'shrub_03', 'shrub_04')]
    SMT = [load_collection(a) for a in ('tree_small_02', 'island_tree_03')]
    for c, _ in [BUSH] + FLW + SMT:
        if c.name in sc.collection.children: sc.collection.children.unlink(c)
    root = bpy.data.collections.new('shrub_set'); sc.collection.children.link(root)
    r = random.Random(11); nb_ = nf_ = nt_ = 0
    def put(c, x, y, z, k, rot):
        o = bpy.data.objects.new('veg', None); o.instance_type = 'COLLECTION'; o.instance_collection = c
        o.location = (x, y, z); o.scale = (k, k, k); o.rotation_euler.z = rot; root.objects.link(o)
    step = 1.8; x = bx0
    while x < bx1:
        y = by0
        while y < by1:
            px, py = x + r.uniform(-0.9, 0.9), y + r.uniform(-0.9, 0.9)
            z = ground(px, py)
            hit, loc, *_ = sc.ray_cast(dg, Vector((px, py, z + 400)), Vector((0, 0, -1)), distance=800)
            open_ = hit and abs(loc.z - z) < 0.25 and z > 1.0
            if open_ and len(recs) and kd.find((px, py, 0))[2] < 22:
                u = r.random()
                if u < 0.16: put(BUSH[0], px, py, z, r.uniform(0.45, 0.9), r.uniform(0, 6.283)); nb_ += 1
                elif u < 0.30:
                    c, _ = FLW[r.randrange(3)]
                    for j in range(r.randint(3, 7)):
                        put(c, px + r.uniform(-0.8, 0.8), py + r.uniform(-0.8, 0.8), z, r.uniform(1.2, 2.2), r.uniform(0, 6.283)); nf_ += 1
                elif u < 0.325:
                    c, dims = SMT[r.randrange(2)]; put(c, px, py, z, r.uniform(0.9, 1.4), r.uniform(0, 6.283)); nt_ += 1
            y += step
        x += step
    log('bushes', nb_, 'plants', nf_, 'small trees', nt_)

if E('GRASS', '1') == '1':
    # grass clumps over open ground: a lawn with a surface, not a flat texture
    log('grass')
    GR = load_collection('grass_medium_01')
    if GR[0].name in sc.collection.children: sc.collection.children.unlink(GR[0])
    ng = bpy.data.node_groups.new('grass', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    n = ng.nodes; lk = ng.links.new
    gi = n.new('NodeGroupInput'); go = n.new('NodeGroupOutput')
    dist = n.new('GeometryNodeDistributePointsOnFaces'); dist.distribute_method = 'RANDOM'
    lk(gi.outputs[0], dist.inputs['Mesh']); dist.inputs['Density'].default_value = float(E('GRASS_DENSITY', 6.0))
    j = n.new('GeometryNodeJoinGeometry')
    for o in sc.objects:
        if o.type == 'MESH' and o.name != 'terrain':
            oi = n.new('GeometryNodeObjectInfo'); oi.inputs['Object'].default_value = o; oi.transform_space = 'RELATIVE'; lk(oi.outputs['Geometry'], j.inputs[0])
    rc = n.new('GeometryNodeRaycast'); lk(j.outputs[0], rc.inputs['Target Geometry']); rc.inputs['Ray Direction'].default_value = (0, 0, 1); rc.inputs['Ray Length'].default_value = 400
    pz = n.new('GeometryNodeInputPosition'); pzs = n.new('ShaderNodeSeparateXYZ'); lk(pz.outputs[0], pzs.inputs[0])
    wet = n.new('FunctionNodeCompare'); wet.data_type = 'FLOAT'; wet.operation = 'LESS_THAN'; lk(pzs.outputs[2], wet.inputs[0]); wet.inputs[1].default_value = 1.0
    orr = n.new('FunctionNodeBooleanMath'); orr.operation = 'OR'; lk(rc.outputs['Is Hit'], orr.inputs[0]); lk(wet.outputs[0], orr.inputs[1])
    dl = n.new('GeometryNodeDeleteGeometry'); dl.domain = 'POINT'; lk(dist.outputs['Points'], dl.inputs['Geometry']); lk(orr.outputs[0], dl.inputs['Selection'])
    ci = n.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = GR[0]
    ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = False
    rv = n.new('FunctionNodeRandomValue'); rv.data_type = 'INT'
    live = [s for s in rv.inputs if s.name in ('Min', 'Max') and s.type == 'INT']; live[0].default_value = 0; live[1].default_value = max(0, len(GR[0].objects) - 1)
    rz = n.new('FunctionNodeRandomValue'); rz.data_type = 'FLOAT'
    live = [s for s in rz.inputs if s.name in ('Min', 'Max') and s.type == 'VALUE']; live[0].default_value = 0; live[1].default_value = 6.283
    rot = n.new('ShaderNodeCombineXYZ'); lk([o for o in rz.outputs if o.type == 'VALUE'][0], rot.inputs[2])
    scl = n.new('FunctionNodeRandomValue'); scl.data_type = 'FLOAT'; scl.inputs['Seed'].default_value = 4
    live = [s for s in scl.inputs if s.name in ('Min', 'Max') and s.type == 'VALUE']; live[0].default_value = 1.0; live[1].default_value = 1.8
    for m_ in bpy.data.materials:
        if m_.name.startswith('grass_medium_01') and m_.node_tree:
            pr_ = next((n for n in m_.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if pr_ and pr_.inputs['Base Color'].links:
                s_ = pr_.inputs['Base Color'].links[0].from_socket
                hs_ = m_.node_tree.nodes.new('ShaderNodeHueSaturation'); hs_.inputs['Value'].default_value = 1.5; hs_.inputs['Saturation'].default_value = 1.1
                m_.node_tree.links.new(s_, hs_.inputs['Color']); m_.node_tree.links.new(hs_.outputs['Color'], pr_.inputs['Base Color'])
    ii = n.new('GeometryNodeInstanceOnPoints'); lk(dl.outputs[0], ii.inputs['Points']); lk(ci.outputs[0], ii.inputs['Instance'])
    ii.inputs['Pick Instance'].default_value = True; lk([o for o in rv.outputs if o.type == 'INT'][0], ii.inputs['Instance Index'])
    lk(rot.outputs[0], ii.inputs['Rotation']); lk([o for o in scl.outputs if o.type == 'VALUE'][0], ii.inputs['Scale'])
    jj = n.new('GeometryNodeJoinGeometry'); lk(gi.outputs[0], jj.inputs[0]); lk(ii.outputs[0], jj.inputs[0]); lk(jj.outputs[0], go.inputs[0])
    terrain.modifiers.new('grass', 'NODES').node_group = ng

# ── props: street lamps, hydrants, parked cars ───────────────────────────────
if E('PROPS', '1') == '1':
    log('props')
    LAMP = load_collection('street_lamp_01'); HYD = load_collection('fire_hydrant')
    for c, _ in (LAMP, HYD):
        if c.name in sc.collection.children: sc.collection.children.unlink(c)
    _lk = EA.P('lamp', ERA) if ERA is not None else 'cobra'
    if _lk in ('gas', 'electrolier'):
        # the period's lamp standard, built here (era.TABLE `lamp`): a gas
        # lantern on a 3.3 m cast-iron post, or an ornamental electric
        # standard with a globe (Market Street's 'Path of Gold', 1916)
        _pb = bmesh.new()
        def _cyl(r0, r1, z0, z1, seg=10):
            g_ = bmesh.ops.create_cone(_pb, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=z1 - z0)
            for v in g_['verts']: v.co.z += (z0 + z1) / 2
        if _lk == 'gas':
            _cyl(0.14, 0.09, 0.0, 0.5); _cyl(0.06, 0.05, 0.5, 3.0); _cyl(0.12, 0.2, 3.0, 3.1, 4); _cyl(0.2, 0.14, 3.1, 3.55, 4); _cyl(0.2, 0.02, 3.55, 3.8, 4)
        else:
            _cyl(0.2, 0.14, 0.0, 0.8); _cyl(0.08, 0.07, 0.8, 4.2); _cyl(0.12, 0.12, 4.2, 4.35); _cyl(0.28, 0.28, 4.35, 4.9, 16)
        _lme = bpy.data.meshes.new('periodlamp'); _pb.to_mesh(_lme); _pb.free()
        _lme.materials.append(simple('lampiron', (0.05, 0.06, 0.05), rough=0.5, metal=0.6))
        _lc = bpy.data.collections.new('periodlamp_c'); _lc.objects.link(bpy.data.objects.new('periodlamp', _lme))
        LAMP = (_lc, (0.4, 0.4, 5.2))       # scale 1 below: 5.2 / 5.2
    root = bpy.data.collections.new('props'); sc.collection.children.link(root)
    acc = 0.0; k = 0
    for a, b, outv in SE:
        L_ = (b - a).length; acc += L_
        if acc < 32 or L_ < 4: continue
        acc = 0.0; p = (a + b) / 2 + outv * 0.5; p.z = a.z + 0.15
        if not in_box(p.x, p.y) or open_at(p.x, p.y) > 0.3: continue
        s = 5.2 / max(1.0, LAMP[1][2])
        o = bpy.data.objects.new(f'lamp{k}', None); o.instance_type = 'COLLECTION'; o.instance_collection = LAMP[0]
        o.location = p; o.scale = (s, s, s); o.rotation_euler.z = math.atan2(-outv.x, outv.y); root.objects.link(o); k += 1
        if k % 3 == 0 and (ERA is None or ERA >= 1910):
            q = p + (b - a).normalized() * 3.0
            s2 = 0.8 / max(0.2, HYD[1][2])
            o = bpy.data.objects.new(f'hyd{k}', None); o.instance_type = 'COLLECTION'; o.instance_collection = HYD[0]
            o.location = q; o.scale = (s2, s2, s2); root.objects.link(o)
    log('lamps', k)

if E('CARS', '1') == '1' and not (ERA is not None and ERA < 1908):
    log('cars')
    def car_mesh(name, L, Wd, prof):
        """a car from its side profile: (x, z) points around the silhouette,
        extruded to its width and rounded; glass above the belt line"""
        bm = bmesh.new()
        vs0 = [bm.verts.new((x * L / 2, -Wd / 2, z)) for x, z in prof]
        f = bm.faces.new(vs0)
        r_ = bmesh.ops.extrude_face_region(bm, geom=[f])
        for v in [g for g in r_['geom'] if isinstance(g, bmesh.types.BMVert)]: v.co.y += Wd
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        # narrow the cabin: glasshouse tumblehome
        for v in bm.verts:
            if v.co.z > prof_belt + 0.02: v.co.y *= 0.86
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=0.07, segments=3, affect='EDGES', clamp_overlap=True)
        wb = L / 2 - 0.85
        for sx in (-1, 1):
            for sy in (-1, 1):
                rr = bmesh.ops.create_cone(bm, cap_ends=True, segments=18, radius1=0.33, radius2=0.33, depth=0.24)
                for v in rr['verts']:
                    y_ = v.co.z; v.co.z = v.co.y; v.co.y = y_
                    v.co += Vector((sx * wb, sy * (Wd / 2 - 0.12), 0.33))
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for p in me.polygons:
            c = p.center
            if c.z < 0.68 and abs(abs(c.x) - wb) < 0.36 and abs(c.y) > Wd / 2 - 0.3: p.material_index = 2
            elif c.z > prof_belt + 0.03 and p.normal.z < 0.85 and abs(c.x) < L / 2 - 0.3: p.material_index = 1
            elif abs(c.x) > L / 2 - 0.08 and 0.55 < c.z < 0.8 and abs(c.y) > Wd / 2 - 0.45: p.material_index = 3
            else: p.material_index = 0
        return me
    prof_belt = 0.98
    # x in -1..1 (rear..front), z in metres
    SEDAN = [(-1, 0.32), (1, 0.32), (1.0, 0.72), (0.96, 0.84), (0.62, 0.95), (0.36, 0.98), (0.14, 1.40), (-0.34, 1.42), (-0.62, 1.00), (-0.96, 0.96), (-1.0, 0.72)]
    SUV = [(-1, 0.38), (1, 0.38), (1.0, 0.86), (0.93, 1.02), (0.62, 1.08), (0.42, 1.12), (0.24, 1.68), (-0.9, 1.70), (-0.98, 1.2), (-1.0, 0.86)]
    HATCH = [(-1, 0.32), (1, 0.32), (1.0, 0.72), (0.95, 0.86), (0.60, 0.96), (0.34, 1.0), (0.10, 1.44), (-0.72, 1.44), (-0.96, 1.02), (-1.0, 0.72)]
    VAN = [(-1, 0.38), (1, 0.38), (1.0, 0.9), (0.92, 1.05), (0.72, 1.35), (0.58, 1.95), (-0.98, 1.98), (-1.0, 0.9)]
    paint = simple('carpaint', (0.5, 0.5, 0.5), rough=0.2, attr=False)
    pn = paint.node_tree; pb = pn.nodes['Principled BSDF']; ai = pn.nodes.new('ShaderNodeObjectInfo')
    ramp = pn.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    # the kerb's paint by year (era.TABLE `carcol`, sourced there): a
    # constant ramp whose steps are as wide as each colour's share
    _cw = EA.car_colours(ERA); _ct = sum(w for _, w in _cw)
    CC = [c for c, _ in _cw]; CCP = []
    _acc = 0.0
    for c, w in _cw: CCP.append(_acc / _ct); _acc += w
    el = ramp.color_ramp.elements
    el[0].position = 0; el[0].color = (*[c ** 2.2 for c in CC[0]], 1)
    for i in range(1, len(CC)): e_ = el.new(CCP[i]); e_.color = (*[c ** 2.2 for c in CC[i]], 1)
    pn.links.new(ai.outputs['Random'], ramp.inputs[0]); pn.links.new(ramp.outputs[0], pb.inputs['Base Color'])
    # clear-coat is a 1980s finish; the lacquer and enamel before it, weathered
    # at the kerb, mirrored the sky far less (CONVENTION)
    _old = ERA is not None and ERA < 1980
    pb.inputs['Coat Weight'].default_value = 0.0 if _old else 1.0
    if _old: pb.inputs['Roughness'].default_value = 0.5; pb.inputs['Specular IOR Level'].default_value = 0.35
    cglass = simple('carglass', (0.02, 0.025, 0.03), rough=0.02, spec=1.0)
    tyre = simple('tyre', (0.02, 0.02, 0.02), rough=0.8)
    lamp_m = simple('carlamp', (0.9, 0.88, 0.8), rough=0.1, spec=1.0)
    # the fleet's body shapes by decade (era.TABLE `fleet`): side profiles
    # of each period's typical car, extruded like today's. CONVENTION on the
    # shapes: t20 the tall 1910s-20s body, r30 the rounded 1930s-40s, f50 the
    # long low 1950s, l60 the long flat 1960s-70s, b80 the boxy 1980s.
    T20 = [(-1, 0.40), (1, 0.40), (1.0, 0.95), (0.62, 1.00), (0.45, 1.02), (0.36, 1.85), (-0.80, 1.90), (-0.95, 1.80), (-1.0, 1.0)]
    R30 = [(-1, 0.36), (1, 0.36), (1.0, 0.78), (0.88, 0.98), (0.40, 1.06), (0.22, 1.58), (-0.32, 1.62), (-0.78, 1.30), (-1.0, 0.85)]
    F50 = [(-1, 0.32), (1, 0.32), (1.0, 0.76), (0.95, 0.88), (0.46, 0.92), (0.26, 1.40), (-0.36, 1.42), (-0.56, 0.96), (-0.98, 0.98), (-1.0, 0.80)]
    L60 = [(-1, 0.30), (1, 0.30), (1.0, 0.74), (0.98, 0.84), (0.46, 0.88), (0.22, 1.34), (-0.40, 1.36), (-0.62, 0.90), (-1.0, 0.88), (-1.0, 0.74)]
    B80 = [(-1, 0.30), (1, 0.30), (1.0, 0.74), (0.97, 0.86), (0.50, 0.92), (0.26, 1.36), (-0.50, 1.38), (-0.72, 0.96), (-1.0, 0.92), (-1.0, 0.74)]
    FAMS = {'t20': [(3.9, 1.68, T20, 1.05)], 'r30': [(4.7, 1.80, R30, 1.08)], 'f50': [(5.3, 2.0, F50, 0.94)],
            'l60': [(5.4, 2.0, L60, 0.90), (4.8, 1.85, L60, 0.90)], 'b80': [(4.5, 1.72, B80, 0.94)],
            'mod': [(4.6, 1.8, SEDAN, 0.98), (4.7, 1.9, SUV, 1.1), (4.1, 1.76, HATCH, 0.98), (5.0, 1.95, VAN, 1.1), (4.5, 1.8, SEDAN, 0.98), (4.3, 1.78, HATCH, 0.98)]}
    _fleet = EA.P('fleet', ERA) if ERA is not None else {'mod': 1.0}
    CARS, CAR_W = [], []
    for fam, share in sorted(_fleet.items()):
        for j_, (L_, W_, pf, belt_) in enumerate(FAMS[fam]):
            prof_belt = belt_
            me = car_mesh(f'car_{fam}{j_}', L_, W_, pf)
            for mm in (paint, cglass, tyre, lamp_m): me.materials.append(mm)
            CARS.append(me); CAR_W.append(share / len(FAMS[fam]))
    def car_pick(r):
        u = r.random() * sum(CAR_W); acc = 0.0
        for i_, w_ in enumerate(CAR_W):
            acc += w_
            if u < acc: return i_
        return len(CAR_W) - 1
    r = random.Random(21); k = 0
    for a, b, outv in SE:
        v = b - a; L_ = v.length
        if L_ < 7: continue
        ang = math.atan2(v.y, v.x)
        occ = EA.car_occupancy(ERA)
        for i in range(int((L_ - 3) // 6.2)):
            if r.random() > occ: continue
            p = a + v * ((1.5 + 3.1 + i * 6.2) / L_) - outv * 1.25
            if not in_box(p.x, p.y) or open_at(p.x, p.y) > 0.3: continue
            o = bpy.data.objects.new(f'pcar{k}', CARS[car_pick(r)]); sc.collection.objects.link(o)
            o.location = (p.x, p.y, p.z + 0.02); o.rotation_euler.z = ang + (math.pi if r.random() < 0.5 else 0); k += 1
    log('cars', k)

# ── open land: dunes where the Outside Lands were still sand; ash in 1906 ──
_YS = EA.yard_sand(ERA)
_ASH = ERA is not None and 1906 <= ERA <= 1908        # the burned district's ground until the rubble was cleared
if ERA is not None and OPEN is not None and (max(SAND) > 0.01 or _YS > 0 or _ASH):
    log('open ground')
    import mathutils.noise as _nz
    DRES = float(E('DUNE_RES', 2.0))
    s_bvh = BVHTree.FromObject(streets, bpy.context.evaluated_depsgraph_get()) if len(streets.data.polygons) else None
    nx_, ny_ = int((bx1 - bx0 + 2 * OPAD) / DRES) + 1, int((by1 - by0 + 2 * OPAD) / DRES) + 1
    _SEKD = None
    if SE:
        from mathutils.kdtree import KDTree as _KD4
        _sep = []
        for a__, b__, _o in SE:
            L__ = (b__ - a__).length
            for t__ in range(max(1, int(L__ / 3.0)) + 1): _sep.append(a__ + (b__ - a__) * (t__ / max(1, int(L__ / 3.0))))
        _SEKD = _KD4(len(_sep))
        for i__, q__ in enumerate(_sep): _SEKD.insert((q__.x, q__.y, 0), i__)
        _SEKD.balance()
    VS, VA, CS, CA = [], [], [], []
    for j in range(ny_):
        for i in range(nx_):
            x_, y_ = ox0 + i * DRES, oy0 + j * DRES
            g_ = ground(x_, y_)
            _s0 = open_at(x_, y_, SAND)
            if _s0 > 0.05:
                # open dunes stand on the land's own shape, not on today's
                # graded streets: the ground under them smoothed over ~50 m
                _gs = (g_ + ground(x_ + 25, y_) + ground(x_ - 25, y_) + ground(x_, y_ + 25) + ground(x_, y_ - 25)) / 5.0
                g_ = g_ + (_gs - g_) * _s0
            on_street = s_bvh is not None and s_bvh.ray_cast(Vector((x_, y_, g_ + 50)), Vector((0, 0, -1)), 60)[0] is not None
            s_ = open_at(x_, y_, SAND)
            cov_ = 0.0 if on_street else max(s_, _YS if EA.is_dune_ground(x_, y_, g_) else 0.0)
            # the dune relief dies down towards a graded street (a cut, not a cliff)
            if s_ > 0 and _SEKD is not None:
                sd_ = _SEKD.find((x_, y_, 0))[2]; tt_ = min(1.0, max(0.0, (sd_ - 3.0) / 22.0)); s_ *= tt_ * tt_ * (3 - 2 * tt_)
            VS.append((x_, y_, g_ + 0.06 + s_ * EA.dune_height(x_, y_, _nz) if cov_ > 0.02 else g_ - 0.6)); CS.append(cov_)
            ca_ = 1.0 if (_ASH and not on_street and EA.burned(x_, y_)) else 0.0
            VA.append((x_, y_, g_ + 0.05 + (0.25 * (_nz.noise(Vector((x_ / 6, y_ / 6, 3.0))) + 1)) if ca_ else g_ - 0.6)); CA.append(ca_)
    for name, V_, C_, mat in (('dunes', VS, CS, M['sand']), ('ashfield', VA, CA, M['ash'])):
        F_ = []
        for j in range(ny_ - 1):
            for i in range(nx_ - 1):
                a_ = j * nx_ + i; q_ = (a_, a_ + 1, a_ + nx_ + 1, a_ + nx_)
                if max(C_[k] for k in q_) > 0.02: F_.append(q_)
        if not F_: continue
        me = bpy.data.meshes.new(name); me.from_pydata(V_, [], F_); me.update(); me.shade_smooth()
        if name == 'ashfield':
            at = me.color_attributes.new('bcol', 'FLOAT_COLOR', 'CORNER'); at.data.foreach_set('color', [0.5] * (4 * len(me.loops)))
        ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); me.materials.append(mat)
        log(name, 'faces', len(F_))

# ── the sea: the water mask of water_mask.py, deep to shallow, foam at the shore ──
def sea():
    mp_, mj = os.path.join(SD, 'sea.png'), os.path.join(SD, 'sea.json')
    if not (os.path.exists(mp_) and os.path.exists(mj)): return
    g = json.load(open(mj))
    if g.get('water_share', 0) < 0.001: return
    ox, oy, w, h = g['ox'], g['oy'], g['w'], g['h']
    m = bpy.data.materials.new('sea'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); L_ = nt.links.new
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    mpn = nt.nodes.new('ShaderNodeMapping'); mpn.vector_type = 'POINT'
    mpn.inputs['Location'].default_value = (-ox / w, -oy / h, 0); mpn.inputs['Scale'].default_value = (1 / w, 1 / h, 1)
    L_(geo.outputs['Position'], mpn.inputs[0])
    img = nt.nodes.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(mp_); img.image.colorspace_settings.name = 'Non-Color'
    img.extension = 'EXTEND'; L_(mpn.outputs[0], img.inputs[0])
    sp = nt.nodes.new('ShaderNodeSeparateColor'); L_(img.outputs['Color'], sp.inputs[0])
    def mth(op, a, b=None, clamp=False):
        n_ = nt.nodes.new('ShaderNodeMath'); n_.operation = op; n_.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n_.inputs[i].default_value = v
            else: L_(v, n_.inputs[i])
        return n_.outputs[0]
    dist = mth('MULTIPLY', sp.outputs[1], 127.5)
    shallow = mth('POWER', mth('SUBTRACT', 1.0, mth('DIVIDE', dist, 60.0, clamp=True)), 2.0)
    mc = nt.nodes.new('ShaderNodeMix'); mc.data_type = 'RGBA'; L_(shallow, mc.inputs[0])
    mc.inputs[6].default_value = (0.004, 0.018, 0.028, 1); mc.inputs[7].default_value = (0.02, 0.08, 0.08, 1)
    wat = nt.nodes.new('ShaderNodeBsdfPrincipled'); L_(mc.outputs[2], wat.inputs['Base Color'])
    wat.inputs['Roughness'].default_value = 0.04; wat.inputs['Specular IOR Level'].default_value = 0.5
    wm = nt.nodes.new('ShaderNodeMapping'); wm.inputs['Scale'].default_value = (0.6, 1.8, 1); L_(geo.outputs['Position'], wm.inputs[0])
    w1 = nt.nodes.new('ShaderNodeTexNoise'); w1.inputs['Scale'].default_value = 0.05; w1.inputs['Detail'].default_value = 8; L_(wm.outputs[0], w1.inputs['Vector'])
    w2 = nt.nodes.new('ShaderNodeTexNoise'); w2.inputs['Scale'].default_value = 1.4; w2.inputs['Detail'].default_value = 8; L_(geo.outputs['Position'], w2.inputs['Vector'])
    bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = 0.6; bm.inputs['Distance'].default_value = 0.3
    L_(mth('ADD', w1.outputs['Fac'], mth('MULTIPLY', w2.outputs['Fac'], 0.35)), bm.inputs['Height']); L_(bm.outputs[0], wat.inputs['Normal'])
    fn = nt.nodes.new('ShaderNodeTexNoise'); fn.inputs['Scale'].default_value = 0.4; fn.inputs['Detail'].default_value = 12; L_(geo.outputs['Position'], fn.inputs['Vector'])
    foam = mth('GREATER_THAN', mth('MULTIPLY', mth('SUBTRACT', 1.0, mth('DIVIDE', dist, 5.0, clamp=True)), mth('ADD', fn.outputs['Fac'], 0.3)), 0.5)
    fp = nt.nodes.new('ShaderNodeBsdfPrincipled'); fp.inputs['Base Color'].default_value = (0.8, 0.82, 0.8, 1); fp.inputs['Roughness'].default_value = 0.8
    mx = nt.nodes.new('ShaderNodeMixShader'); L_(foam, mx.inputs[0]); L_(wat.outputs[0], mx.inputs[1]); L_(fp.outputs[0], mx.inputs[2])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    cut = nt.nodes.new('ShaderNodeMixShader'); L_(mth('GREATER_THAN', sp.outputs[0], 0.5), cut.inputs[0]); L_(tr.outputs[0], cut.inputs[1]); L_(mx.outputs[0], cut.inputs[2])
    L_(cut.outputs[0], o.inputs[0])
    for z_, mat_ in ((0.12, m), (-1.0, simple('seafloor', (0.004, 0.018, 0.028), rough=0.06))):
        me = bpy.data.meshes.new('sea'); me.from_pydata([(ox, oy, z_), (ox + w, oy, z_), (ox + w, oy + h, z_), (ox, oy + h, z_)], [], [(0, 1, 2, 3)])
        ob = bpy.data.objects.new('sea', me); sc.collection.objects.link(ob); me.materials.append(mat_)
    log('sea')
sea()
# 1915: the Exposition (era.build_ppie; the palaces' smoked ivory is the PPIE's own words)
if ERA is not None:
    EA.build_ppie(bpy, ERA, ground, {'ivory': simple('ppie_ivory', (0.80, 0.76, 0.66), rough=0.75),
                                     'roof': simple('ppie_roof', (0.62, 0.42, 0.30), rough=0.8),
                                     'dome': simple('ppie_dome', (0.36, 0.52, 0.44), rough=0.5),
                                     'jewel': simple('ppie_jewel', (0.85, 0.80, 0.70), rough=0.05, metal=0.6, spec=1.0),
                                     'glassh': simple('ppie_glass', (0.70, 0.74, 0.72), rough=0.08, spec=0.9),
                                     'shadow': simple('ppie_shadow', (0.03, 0.03, 0.035), rough=0.9),
                                     'garden': simple('ppie_garden', (0.16, 0.30, 0.10), rough=0.9)}, log)
# the Mission Bay rail yards, 1910-1998 (era.build_yards)
if ERA is not None and OPEN is not None:
    EA.build_yards(bpy, ERA, (bx0, by0, bx1, by1), ground, open_at, simple('yardrail', (0.45, 0.42, 0.40), rough=0.35, metal=0.9),
                   simple('ballast', (0.20, 0.18, 0.16), rough=0.95), log)
# the structures the record has lost (era.STRUCTURES: the freeways that came down)
if ERA is not None: EA.build_structures(bpy, ERA, ground, M['concrete'] if 'concrete_struct' not in M else M['concrete_struct'], (bx0, by0, bx1, by1) if 'bx0' in globals() else None, log)
def hist_water():
    """open water over made land not yet made (era.MADE_LAND)"""
    if ERA is None: return
    sb_ = d['box']; st_ = 12.0; V_, F_ = [], []
    x_ = sb_[0] - 400
    while x_ < sb_[2] + 400:
        y_ = sb_[1] - 400
        while y_ < sb_[3] + 400:
            if EA.water_then(x_ + st_ / 2, y_ + st_ / 2, ERA):
                k_ = len(V_); V_ += [(x_, y_, 0.12), (x_ + st_, y_, 0.12), (x_ + st_, y_ + st_, 0.12), (x_, y_ + st_, 0.12)]
                F_.append((k_, k_ + 1, k_ + 2, k_ + 3))
            y_ += st_
        x_ += st_
    if not F_: return
    m_ = simple('histwater', (0.006, 0.026, 0.040), rough=0.05, spec=0.5)
    nt_ = m_.node_tree; g_ = nt_.nodes.new('ShaderNodeNewGeometry'); w_ = nt_.nodes.new('ShaderNodeTexNoise')
    w_.inputs['Scale'].default_value = 0.05; w_.inputs['Detail'].default_value = 8; nt_.links.new(g_.outputs['Position'], w_.inputs['Vector'])
    b_ = nt_.nodes.new('ShaderNodeBump'); b_.inputs['Strength'].default_value = 0.4; nt_.links.new(w_.outputs['Fac'], b_.inputs['Height'])
    nt_.links.new(b_.outputs[0], nt_.nodes['Principled BSDF'].inputs['Normal'])
    me_ = bpy.data.meshes.new('histwater'); me_.from_pydata(V_, [], F_); me_.update()
    bm_ = bmesh.new(); bm_.from_mesh(me_); bmesh.ops.remove_doubles(bm_, verts=bm_.verts, dist=0.01); bm_.to_mesh(me_); bm_.free()
    ob_ = bpy.data.objects.new('histwater', me_); sc.collection.objects.link(ob_); me_.materials.append(m_)
    log('water over made land', len(F_))
hist_water()

# ── camera and light ─────────────────────────────────────────────────────────
fwd = Vector(d['camForward']).normalized()
cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
tx, ty = float(E('TX', (bx0 + bx1) / 2)), float(E('TY', (by0 + by1) / 2))
tz = ground(tx, ty)
if E('CAM', 'map') == 'map':
    cam_d.type = 'ORTHO'; cam_d.ortho_scale = float(E('ORTHO', (bx1 - bx0) * 0.6)); cam_d.clip_start = 1; cam_d.clip_end = 20000
    cam.location = Vector((tx, ty, tz)) - fwd * 3000
    cam.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()
else:
    # hero: a perspective view from a given point toward the target
    cx_, cy_, cz_ = [float(v) for v in E('HERO_FROM').split(',')]
    cam_d.type = 'PERSP'; cam_d.lens = float(E('LENS', 50)); cam_d.clip_start = 0.5; cam_d.clip_end = 20000
    cam.location = (cx_, cy_, ground(cx_, cy_) + cz_)
    dv = Vector((tx, ty, tz + float(E('HERO_TZ', 8)))) - cam.location
    cam.rotation_euler = dv.to_track_quat('-Z', 'Y').to_euler()

world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
wn = world.node_tree; wn.nodes.clear(); wo = wn.nodes.new('ShaderNodeOutputWorld')
sky = wn.nodes.new('ShaderNodeTexSky')
el_, az_ = float(E('SUN_EL', 24)), float(E('SUN_AZ', 215))
try: sky.sky_type = 'NISHITA'
except Exception: pass
sky.sun_disc = False; sky.sun_elevation = math.radians(el_); sky.sun_rotation = math.radians(az_)
bg = wn.nodes.new('ShaderNodeBackground'); bg.inputs['Strength'].default_value = float(E('SKY_K', 0.32))
lp = wn.nodes.new('ShaderNodeLightPath'); bg2 = wn.nodes.new('ShaderNodeBackground'); bg2.inputs['Strength'].default_value = float(E('GLOSS_K', 0.9))
wn.links.new(sky.outputs[0], bg.inputs[0]); wn.links.new(sky.outputs[0], bg2.inputs[0])
mix = wn.nodes.new('ShaderNodeMixShader'); wn.links.new(lp.outputs['Is Glossy Ray'], mix.inputs[0])
wn.links.new(bg.outputs[0], mix.inputs[1]); wn.links.new(bg2.outputs[0], mix.inputs[2]); wn.links.new(mix.outputs[0], wo.inputs[0])
sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = float(E('SUN_K', 5.5)); sun_d.angle = math.radians(0.8)
sun_d.color = tuple(float(v) for v in E('SUN_RGB', '1.0,0.80,0.58').split(','))
sun = bpy.data.objects.new('sun', sun_d); sc.collection.objects.link(sun)
a_, e_ = math.radians(az_), math.radians(el_)
to_sun = Vector((math.sin(a_) * math.cos(e_), math.cos(a_) * math.cos(e_), math.sin(e_)))
sun.rotation_euler = (-to_sun).to_track_quat('-Z', 'Y').to_euler()

sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'; prefs.get_devices()
for dv in prefs.devices: dv.use = True
sc.cycles.device = 'GPU'; sc.cycles.samples = SPP; sc.cycles.use_denoising = True; sc.cycles.use_adaptive_sampling = True
sc.cycles.max_bounces = 8; sc.cycles.transparent_max_bounces = 16
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = E('AGX_LOOK', 'AgX - Punchy'); sc.view_settings.exposure = float(E('EXPO', 0.3))
sc.render.filepath = OUT
if E('BORDER'):
    bx_ = [float(v) for v in E('BORDER').split(',')]
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = bx_
log('render', W, H, SPP)
t1 = time.time(); bpy.ops.render.render(write_still=True)
log(f'RENDER {W}x{H} {SPP}spp: {time.time() - t1:.1f}s')
if E('SAVE_BLEND'): bpy.ops.wm.save_as_mainfile(filepath=OUT.rsplit('.', 1)[0] + '.blend')
