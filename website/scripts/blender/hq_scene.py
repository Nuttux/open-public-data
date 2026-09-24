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
# the true ground (USGS 3DEP) under everything, before anything is built on it
# (terrain_hq.py, landmarks agent: the engine's relief is squeezed N-S 1.2649x)
import terrain_hq; terrain_hq.correct_scene(d, log, box=([float(v) for v in E('BOX').split(',')] if E('BOX') else d['box']), sd=SD)
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
    # (24/09) a pane in five or so catching more of the sky or a lit room: a
    # row of windows is not a stamped row of identical dark holes
    ramp.color_ramp.elements[1].position = 0.78
    _e = ramp.color_ramp.elements.new(1.0); _e.color = (0.15, 0.145, 0.14, 1)
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
M['glass'] = glass_mat()
M['door'] = simple('door', None, rough=0.4, attr=True)
M['metal'] = simple('metal', None, rough=0.35, metal=0.8, attr=True)
M['stair'] = ph_mat('concrete_pavement', 2.0, tint=True, name='stair')
M['shopglass'] = glass_mat()
M['awning'] = simple('awning', None, rough=0.7, attr=True)
M['curtain'] = simple('curtain', None, rough=0.9, attr=True)
class NB:
    """a small node builder for the procedural surfaces below"""
    def __init__(self, name):
        self.m = bpy.data.materials.new(name); self.m.use_nodes = True; self.nt = self.m.node_tree
        self.pr = self.nt.nodes['Principled BSDF']; self.pos = self.nt.nodes.new('ShaderNodeNewGeometry').outputs['Position']
    def n(self, kind, **kw):
        n_ = self.nt.nodes.new(kind)
        for k, v in kw.items(): setattr(n_, k, v)
        return n_
    def put(self, sock, v):
        if isinstance(v, (int, float)): sock.default_value = v
        elif isinstance(v, tuple): sock.default_value = v if len(v) == len(sock.default_value) else (*v, 1.0)
        else: self.nt.links.new(v, sock)
    def math(self, op, a, b=None, c=None, clamp=False):
        n_ = self.n('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b, c)):
            if v is not None: self.put(n_.inputs[i], v)
        return n_.outputs[0]
    def mix(self, f, a, b, blend='MIX'):
        n_ = self.n('ShaderNodeMix', data_type='RGBA', blend_type=blend)
        self.put(n_.inputs[0], f); self.put(n_.inputs[6], a); self.put(n_.inputs[7], b); return n_.outputs[2]
    def vmap(self, scale=1.0, rot=0.0, loc=(0, 0, 0), vec=None):
        n_ = self.n('ShaderNodeMapping'); self.put(n_.inputs['Vector'], vec or self.pos)
        n_.inputs['Location'].default_value = loc; n_.inputs['Rotation'].default_value = (0, 0, rot)
        n_.inputs['Scale'].default_value = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
        return n_.outputs[0]
    def img(self, path, vec, noncolor=False, proj='FLAT'):
        n_ = self.n('ShaderNodeTexImage'); n_.image = bpy.data.images.load(path, check_existing=True); n_.projection = proj
        if proj == 'BOX': n_.projection_blend = 0.25
        if noncolor: n_.image.colorspace_settings.name = 'Non-Color'
        self.put(n_.inputs['Vector'], vec); return n_.outputs['Color']
    def noise(self, scale, detail=4.0, vec=None, rough=0.5, out='Fac'):
        n_ = self.n('ShaderNodeTexNoise'); n_.inputs['Scale'].default_value = scale; n_.inputs['Detail'].default_value = detail
        n_.inputs['Roughness'].default_value = rough; self.put(n_.inputs['Vector'], vec or self.pos); return n_.outputs[out]
    def voronoi(self, scale, vec=None, feature='F1', metric='EUCLIDEAN', out='Distance'):
        n_ = self.n('ShaderNodeTexVoronoi', feature=feature, distance=metric); n_.inputs['Scale'].default_value = scale
        self.put(n_.inputs['Vector'], vec or self.pos); return n_.outputs[out]
    def ramp(self, f, a, b, pa=0.0, pb=1.0):
        """a smoothstep of f from pa to pb, as a 0..1 factor"""
        n_ = self.n('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP'); self.put(n_.inputs[0], f)
        n_.inputs[1].default_value = pa; n_.inputs[2].default_value = pb; n_.inputs[3].default_value = a; n_.inputs[4].default_value = b
        return n_.outputs[0]
    def bw(self, c):
        n_ = self.n('ShaderNodeRGBToBW'); self.put(n_.inputs[0], c); return n_.outputs[0]
    def bump(self, h, strength=0.5, dist=0.01, normal=None):
        n_ = self.n('ShaderNodeBump'); n_.inputs['Strength'].default_value = strength; n_.inputs['Distance'].default_value = dist
        self.put(n_.inputs['Height'], h)
        if normal is not None: self.put(n_.inputs['Normal'], normal)
        return n_.outputs[0]

def PHT(asset, kind):
    return glob.glob(f'{PH}/{asset}/textures/*_{kind}_*')[0]

def road_mat():
    """street asphalt without a visible repeat: the aerial scan (30 m of real
    road, tyre marks and stains) read twice at different turns and blended
    by a broad noise; darker and lighter stretches of resurfacing; crack
    sealant ('tar snakes') in places; the fine aggregate for the close view"""
    b = NB('asphalt'); P = b.pos
    va = b.vmap(1 / 30.0); vb = b.vmap(1 / 26.0, rot=1.9, loc=(0.37, 0.61, 0))
    ca = b.img(PHT('aerial_asphalt_01', 'diff'), va); cb = b.img(PHT('aerial_asphalt_01', 'diff'), vb)
    f = b.ramp(b.noise(0.035, 3.0), 0.0, 1.0, 0.42, 0.58)
    c = b.mix(f, ca, cb)
    fine = b.img(PHT('asphalt_02', 'diff'), b.vmap(1 / 3.0, rot=0.7))
    c = b.mix(0.5, c, fine, 'OVERLAY')
    hs = b.n('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = 0.55; hs.inputs['Value'].default_value = 0.62
    b.put(hs.inputs['Color'], c); c = hs.outputs[0]
    # resurfaced stretches: fresh (darker, cooler) and old (lighter, warmer)
    age = b.noise(0.012, 2.0)
    c = b.mix(b.ramp(age, 0.0, 0.45, 0.55, 0.7), c, (0.035, 0.037, 0.042), 'MIX')
    c = b.mix(b.ramp(age, 0.45, 0.0, 0.25, 0.4), c, (0.15, 0.14, 0.125))
    c = b.mix(b.ramp(b.noise(0.12, 5.0), 0.0, 0.25), c, (0.55, 0.55, 0.55), 'MULTIPLY')
    # tar snakes: meandering sealed cracks, dark and a little glossy
    warp = b.n('ShaderNodeVectorMath', operation='ADD'); b.put(warp.inputs[0], P)
    b.put(warp.inputs[1], b.noise(0.6, 3.0, out='Color'))
    edge = b.voronoi(0.28, vec=warp.outputs[0], feature='DISTANCE_TO_EDGE')
    snake = b.math('MULTIPLY', b.math('LESS_THAN', edge, 0.008), b.math('GREATER_THAN', b.noise(0.05, 2.0), 0.6))
    c = b.mix(b.math('MULTIPLY', snake, 0.8), c, (0.008, 0.008, 0.009))
    # manhole and utility covers: one in every 25 m cell, where it falls on the street
    mh = b.voronoi(1 / 25.0)
    cover = b.math('LESS_THAN', mh, 0.34 / 25.0)
    rim = b.math('MULTIPLY', cover, b.math('GREATER_THAN', mh, 0.28 / 25.0))
    c = b.mix(cover, c, (0.028, 0.027, 0.025)); c = b.mix(rim, c, (0.07, 0.068, 0.064))
    # the whole street's albedo in one knob (node 'road_k', env ROAD_K): its
    # value times a warm tint, so a brighter street never turns blue-grey
    k_ = float(E('ROAD_K', 1.0)); c = b.mix(1.0, c, (1.0, 1.0, 1.0) if k_ == 1.0 else (k_ * 1.03, k_, k_ * 0.94), 'MULTIPLY'); c.node.name = 'road_k'
    b.put(b.pr.inputs['Base Color'], c)
    b.put(b.pr.inputs['Roughness'], b.math('SUBTRACT', 0.86, b.math('MULTIPLY', cover, 0.3)))
    b.put(b.pr.inputs['Metallic'], b.math('MULTIPLY', cover, 0.5))
    b.put(b.pr.inputs['Normal'], b.bump(b.bw(fine), 0.35, 0.01))
    return b.m

def roof_flat_mat():
    """flat-roof membranes, per building from the face attribute (see
    gen_buildings.flat_roof): tar and gravel, a mineral cap sheet laid in
    rolls along the building, white elastomeric coating, aluminium paint.
    Rolls and seams turn with the building; dirt gathers where the air is
    still (along the parapets, round the kit) and in ponding stains"""
    b = NB('roof_flat'); at = b.n('ShaderNodeAttribute', attribute_name='bcol')
    t4 = b.math('MULTIPLY', at.outputs['Alpha'], 4.0)
    kind = b.math('FLOOR', t4)
    turn = b.math('MULTIPLY', b.math('DIVIDE', b.math('SUBTRACT', b.math('FRACT', t4), 0.1), 0.8), -math.pi / 2)
    rv = b.n('ShaderNodeCombineXYZ'); b.put(rv.inputs[2], turn)
    mp = b.n('ShaderNodeMapping'); b.put(mp.inputs['Vector'], b.pos); b.put(mp.inputs['Rotation'], rv.outputs[0])
    rolls = b.vmap((1 / 20.0, 1 / 20.0, 1.0), vec=mp.outputs[0])
    bit = b.img(PHT('bitumen', 'diff'), rolls, proj='FLAT')
    bitn = b.mix(1.0, bit, (1 / 0.0348, 1 / 0.0348, 1 / 0.0348), 'MULTIPLY')
    grav = b.img(PHT('tarred_gravel', 'diff'), b.vmap(1 / 2.2), proj='FLAT')
    gravn = b.mix(1.0, grav, (1 / 0.0428, 1 / 0.0428, 1 / 0.0428), 'MULTIPLY')
    paint = at.outputs['Color']
    c0 = b.mix(1.0, gravn, paint, 'MULTIPLY')
    c1 = b.mix(1.0, b.mix(0.35, bitn, gravn), paint, 'MULTIPLY')
    white = b.mix(0.8, bitn, (1, 1, 1))
    c2 = b.mix(1.0, white, paint, 'MULTIPLY')
    def eq(k): return b.math('COMPARE', kind, float(k), 0.5)
    c = b.mix(eq(1), c0, c1); c = b.mix(eq(2), c, c2); c = b.mix(eq(3), c, c2)
    # dirt: still air along the parapets and round the kit, ponding stains
    ao = b.n('ShaderNodeAmbientOcclusion', samples=4); ao.inputs['Distance'].default_value = 1.2
    dirt = b.math('MULTIPLY', b.math('SUBTRACT', 1.0, ao.outputs['AO']), 0.9, clamp=True)
    stain = b.ramp(b.noise(0.16, 2.0), 0.0, 1.0, 0.56, 0.68)
    light = b.math('GREATER_THAN', kind, 1.5)
    dirt = b.math('ADD', dirt, b.math('MULTIPLY', b.math('MULTIPLY', stain, 0.22), b.math('ADD', 0.35, b.math('MULTIPLY', light, 0.65))))
    dirt = b.math('ADD', dirt, b.math('MULTIPLY', b.ramp(b.noise(0.07, 4.0), 0.0, 0.3, 0.45, 0.8), light))
    # (24/09) a roof is patched and recoated piece by piece, and a cap sheet
    # shows its lap seams a roll apart: patches of 2-6 m a shade lighter or
    # darker, the seams as dark lines along the rolls — no flat slab
    cell = b.bw(b.voronoi(0.28, vec=mp.outputs[0], out='Color'))
    pk = b.ramp(cell, 0.66, 1.12)
    # tar repairs: dark irregular blots over about a tenth of a roof, and the
    # recoats' lighter sheets (24/09, the roofs' contrast from the air)
    tar = b.ramp(b.noise(0.45, 3.0, vec=mp.outputs[0]), 0.0, 1.0, 0.58, 0.63)
    pk = b.math('MULTIPLY', pk, b.math('SUBTRACT', 1.0, b.math('MULTIPLY', tar, 0.6)))
    sx = b.n('ShaderNodeSeparateXYZ'); b.put(sx.inputs[0], mp.outputs[0])
    seam = b.math('LESS_THAN', b.math('FRACT', b.math('DIVIDE', sx.outputs[1], 0.92)), 0.06)
    pk = b.math('MULTIPLY', pk, b.math('SUBTRACT', 1.0, b.math('MULTIPLY', seam, b.math('MULTIPLY', b.math('GREATER_THAN', kind, 0.5), 0.2))))
    pkc = b.n('ShaderNodeCombineColor')
    for i_ in range(3): b.put(pkc.inputs[i_], pk)
    c = b.mix(1.0, c, pkc.outputs[0], 'MULTIPLY')
    c = b.mix(b.math('MINIMUM', dirt, 0.85), c, (0.10, 0.09, 0.075), 'MULTIPLY')
    b.put(b.pr.inputs['Base Color'], c)
    b.put(b.pr.inputs['Roughness'], b.math('SUBTRACT', 0.9, b.math('MULTIPLY', eq(3), 0.35)))
    b.put(b.pr.inputs['Metallic'], b.math('MULTIPLY', eq(3), 0.35))
    b.put(b.pr.inputs['Normal'], b.bump(b.bw(b.mix(eq(0), bit, grav)), 0.4, 0.02))
    return b.m
M['roof_flat'] = roof_flat_mat()
M['equip'] = simple('equip', None, rough=0.45, attr=True)
def solar_mat():
    b = NB('solar'); pr = b.pr
    pr.inputs['Base Color'].default_value = (0.010, 0.014, 0.032, 1); pr.inputs['Roughness'].default_value = 0.12
    pr.inputs['Coat Weight'].default_value = 0.6; pr.inputs['Specular IOR Level'].default_value = 0.6
    # the cell grid, faintly: 16 cm cells, silver bus lines
    g_ = b.voronoi(1 / 0.156, metric='CHEBYCHEV', feature='DISTANCE_TO_EDGE'); g_.node.inputs['Randomness'].default_value = 0.0
    b.put(pr.inputs['Base Color'], b.mix(b.math('LESS_THAN', g_, 0.03), (0.010, 0.014, 0.032), (0.06, 0.07, 0.09)))
    return b.m
M['solar'] = solar_mat()
def curtain_wall_mat():
    """tinted curtain-wall glass: the tint from the face colour, how mirror-
    like the coating is from its alpha; every panel (1.5 m by a floor) a
    hair out of plane, so the reflections break panel by panel as they do
    on a real tower"""
    b = NB('curtain_wall'); at = b.n('ShaderNodeAttribute', attribute_name='bcol')
    # (the tint as is: darkening the body made the towers heavy and barely
    # changed a thing at 0.85 — from this camera a vertical pane mirrors the
    # street below, never the sky, so its lightness is the tint's)
    b.put(b.pr.inputs['Base Color'], at.outputs['Color'])
    b.put(b.pr.inputs['Metallic'], at.outputs['Alpha']); b.pr.inputs['Roughness'].default_value = 0.035
    # a little more Fresnel sheen: the sunlit city below mirrored in the glass
    b.pr.inputs['Specular IOR Level'].default_value = 1.15; b.pr.inputs['Coat Weight'].default_value = 0.45
    snap = b.n('ShaderNodeVectorMath', operation='SNAP'); b.put(snap.inputs[0], b.pos); snap.inputs[1].default_value = (1.5, 1.5, 3.9)
    wn = b.n('ShaderNodeTexWhiteNoise', noise_dimensions='3D'); b.put(wn.inputs['Vector'], snap.outputs[0])
    off = b.n('ShaderNodeVectorMath', operation='SUBTRACT'); b.put(off.inputs[0], wn.outputs['Color']); off.inputs[1].default_value = (0.5, 0.5, 0.5)
    sc_ = b.n('ShaderNodeVectorMath', operation='SCALE'); b.put(sc_.inputs[0], off.outputs[0]); sc_.inputs['Scale'].default_value = 0.035
    geo = b.n('ShaderNodeNewGeometry'); ad = b.n('ShaderNodeVectorMath', operation='ADD'); b.put(ad.inputs[0], geo.outputs['Normal']); b.put(ad.inputs[1], sc_.outputs[0])
    nz = b.n('ShaderNodeVectorMath', operation='NORMALIZE'); b.put(nz.inputs[0], ad.outputs[0])
    b.put(b.pr.inputs['Normal'], nz.outputs[0])
    return b.m
M['curtain_wall'] = curtain_wall_mat()
def weather(m, k=1.0, streaks=1.0):
    """weathering over a wall's paint: rain streaks down the face, grime in
    the corners and under every ledge (ambient occlusion), a slow unevenness
    of the paint across the wall — so a stucco front is a surface, not a
    plastic sheet"""
    nt = m.node_tree; pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    src_ = pr.inputs['Base Color'].links[0].from_socket
    b = NB.__new__(NB); b.m = m; b.nt = nt; b.pr = pr; b.pos = nt.nodes.new('ShaderNodeNewGeometry').outputs['Position']
    streak = b.noise(1.0, 3.0, vec=b.vmap((3.5, 3.5, 0.22)))
    streak = b.math('MULTIPLY', b.ramp(streak, 0.0, 1.0, 0.52, 0.75), b.ramp(b.noise(0.15, 2.0), 0.0, 1.0, 0.4, 0.7))
    ao = b.n('ShaderNodeAmbientOcclusion', samples=4); ao.inputs['Distance'].default_value = 0.5
    occ = b.math('MULTIPLY', b.math('SUBTRACT', 1.0, ao.outputs['AO']), 0.55 * k, clamp=True)
    g_ = b.math('ADD', b.math('MULTIPLY', streak, 0.32 * k * streaks), occ)          # (24/09: 0.22 did not show from the air)
    c = b.mix(b.math('MINIMUM', g_, 0.7), src_, (0.30, 0.27, 0.22), 'MULTIPLY')
    macro = b.ramp(b.noise(0.09, 3.0), 0.89, 1.07, 0.3, 0.7)
    # (24/09) and the render's own unevenness at a metre or two: patched and
    # re-skimmed stucco, boards repainted piece by piece, sun-faded panels —
    # about ±8 %, so a wall is a surface and not a plastic sheet
    mot = b.ramp(b.noise(0.55, 2.0, rough=0.55), 0.86, 1.10, 0.3, 0.7)
    mot2 = b.ramp(b.bw(b.voronoi(0.42, out='Color')), 0.95, 1.04)
    macro = b.math('MULTIPLY', b.math('MULTIPLY', macro, mot), mot2)
    cc = b.n('ShaderNodeHueSaturation'); b.put(cc.inputs['Color'], c); b.put(cc.inputs['Value'], macro)
    nt.links.new(cc.outputs[0], pr.inputs['Base Color'])
for _k, _w in (('stucco', 1.0), ('siding', 0.8), ('concrete', 1.0), ('brick', 0.7), ('shingle', 0.5)):
    weather(M[_k], _w, 0.4 if _k in ('siding', 'shingle') else 1.0)
def pitched_mat(name, asset, tile, value=1.0, bump=0.6):
    """a pitched roof's covering laid the way it is laid: the texture turned
    with each face — courses along the ridge, tile columns down the slope —
    read in slope length (not its plan), tinted by the face colour, the
    relief from the scan's height map"""
    b = NB(name); geo = b.n('ShaderNodeNewGeometry'); P = b.pos
    sn = b.n('ShaderNodeSeparateXYZ'); b.put(sn.inputs[0], geo.outputs['Normal'])
    hz = b.n('ShaderNodeCombineXYZ'); b.put(hz.inputs[0], b.math('ADD', sn.outputs[0], 1e-3)); b.put(hz.inputs[1], sn.outputs[1])
    nh = b.n('ShaderNodeVectorMath', operation='NORMALIZE'); b.put(nh.inputs[0], hz.outputs[0])
    sh = b.n('ShaderNodeSeparateXYZ'); b.put(sh.inputs[0], nh.outputs[0])
    dn = b.n('ShaderNodeVectorMath', operation='DOT_PRODUCT'); b.put(dn.inputs[0], P); b.put(dn.inputs[1], nh.outputs[0])
    al = b.n('ShaderNodeCombineXYZ'); b.put(al.inputs[0], b.math('MULTIPLY', sh.outputs[1], -1.0)); b.put(al.inputs[1], sh.outputs[0])
    da = b.n('ShaderNodeVectorMath', operation='DOT_PRODUCT'); b.put(da.inputs[0], P); b.put(da.inputs[1], al.outputs[0])
    down = b.math('DIVIDE', dn.outputs['Value'], b.math('MAXIMUM', sn.outputs[2], 0.3))
    uv = b.n('ShaderNodeCombineXYZ'); b.put(uv.inputs[0], b.math('DIVIDE', da.outputs['Value'], tile)); b.put(uv.inputs[1], b.math('DIVIDE', down, tile))
    tex = b.img(PHT(asset, 'diff'), uv.outputs[0])
    at = b.n('ShaderNodeAttribute', attribute_name='bcol')
    c = b.mix(1.0, tex, at.outputs['Color'], 'MULTIPLY')
    if value != 1.0: c = b.mix(1.0, c, (value, value, value), 'MULTIPLY')
    b.put(b.pr.inputs['Base Color'], c); b.pr.inputs['Roughness'].default_value = 0.8
    h = b.img(PHT(asset, 'disp'), uv.outputs[0], noncolor=True)
    b.put(b.pr.inputs['Normal'], b.bump(b.bw(h), bump, 0.03))
    return b.m
M['roof_shingle'] = pitched_mat('roof_shingle', 'grey_roof_01', 3.2)
M['roof_tile'] = pitched_mat('roof_tile', 'clay_roof_tiles_02', 2.5, value=1.1, bump=0.8)
M['asphalt'] = road_mat()
if E('ERA') and int(E('ERA')) < 1950:
    M['asphalt'] = ph_mat('concrete_pavement', 4.0, value=0.72, name='oldpave') if int(E('ERA')) >= 1910 else ph_mat('pavement_03', 1.6, value=0.55, name='basalt')
M['sidewalk'] = ph_mat('concrete_pavement', 3.6, value=0.95)
M['lawn'] = ph_mat('leafy_grass', 3.0, name='lawn')
M['paint'] = ph_mat('asphalt_02', 5.0, name='paint')
_pn = M['paint'].node_tree; _pp = next(n for n in _pn.nodes if n.type == 'BSDF_PRINCIPLED')
_src = _pp.inputs['Base Color'].links[0].from_socket
_wm = _pn.nodes.new('ShaderNodeMix'); _wm.data_type = 'RGBA'; _wm.inputs[0].default_value = 0.78   # worn paint: the asphalt shows through
_pn.links.new(_src, _wm.inputs[6]); _wm.inputs[7].default_value = (0.78, 0.77, 0.72, 1); _pn.links.new(_wm.outputs[2], _pp.inputs['Base Color'])
M['path'] = ph_mat('pavement_03', 3.0, name='path')
M['chimney'] = ph_mat('red_brick_plaster_patch_02', 1.6, name='chimney')
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

# ── the open ground: hills in late September ─────────────────────────────────
# What the city stands on between its buildings and streets, for the district
# scene and the city pass alike (hq_city runs this block): hill_ground(d, box)
# is the terrain's material. It reads two maps made here from the scene:
#   A (0.5–3 m a pixel): R = a published park ring (the engine's park wash,
#     'ground-detail'), G = within a few metres of a building (a yard);
#   B (4–8 m): R = topographic position (ridge > 0.5 > hollow, over 30 m),
#     G = how hilly the ground is over 40 m, degrees / 20 (a park on a hill is grassland,
#     not lawn: Twin Peaks, Corona Heights, Bernal Hill average 17–31°, the
#     watered parks — Dolores, Alamo Square, Duboce — under 8°).
# Open ground is cured annual grass, golden; coyote brush in dark clumped
# patches, more on the north faces and in the hollows; Franciscan chert
# showing on the steepest faces and the ridges. Lawn green only on the parks
# the engine publishes, and only where they are not hillside. The engine's
# own ground colour is NOT used: it carries its baked hillshade, and its
# 40 m cells drew the camouflage polygons.
def _box_mean(a, r):
    """mean over a (2r+1)² window, edges held (cumulative sums, numpy only)"""
    import numpy as np
    if r < 1: return a
    for ax in (0, 1):
        pw = [(0, 0), (0, 0)]; pw[ax] = (r + 1, r)
        c = np.cumsum(np.pad(a, pw, mode='edge'), ax, dtype=np.float64)
        n = a.shape[ax]
        a = ((c.take(range(2 * r + 1, 2 * r + 1 + n), ax) - c.take(range(0, n), ax)) / (2 * r + 1)).astype(np.float32)
    return a

def _fill_tris(T, x0, y0, res, nx, ny, out):
    """T (n,3,2): set out[j, i] = 1 at every pixel centre inside a triangle"""
    import numpy as np
    X, Y = T[:, :, 0], T[:, :, 1]
    i0 = np.clip(np.ceil((X.min(1) - x0) / res - 0.5), 0, nx).astype(np.int64); i1 = np.clip(np.floor((X.max(1) - x0) / res - 0.5), -1, nx - 1).astype(np.int64)
    j0 = np.clip(np.ceil((Y.min(1) - y0) / res - 0.5), 0, ny).astype(np.int64); j1 = np.clip(np.floor((Y.max(1) - y0) / res - 0.5), -1, ny - 1).astype(np.int64)
    w = i1 - i0 + 1; h = j1 - j0 + 1; ok = (w > 0) & (h > 0)
    def inside(s, I, J, m):
        px = x0 + (I + 0.5) * res; py = y0 + (J + 0.5) * res
        ax_, ay_, bx_, by_, cx_, cy_ = X[s, 0, None], Y[s, 0, None], X[s, 1, None], Y[s, 1, None], X[s, 2, None], Y[s, 2, None]
        e1 = (bx_ - ax_) * (py - ay_) - (by_ - ay_) * (px - ax_)
        e2 = (cx_ - bx_) * (py - by_) - (cy_ - by_) * (px - bx_)
        e3 = (ax_ - cx_) * (py - cy_) - (ay_ - cy_) * (px - cx_)
        m &= ((e1 >= 0) & (e2 >= 0) & (e3 >= 0)) | ((e1 <= 0) & (e2 <= 0) & (e3 <= 0))
        out[J[m], I[m]] = 1.0
    # small triangles in batches, by stencil size (next power of two per axis)
    idx = np.nonzero(ok & (w * h <= 65536))[0]
    if len(idx):
        bw = 1 << np.ceil(np.log2(np.maximum(w[idx], 1))).astype(np.int64); bh = 1 << np.ceil(np.log2(np.maximum(h[idx], 1))).astype(np.int64)
        for sw, sh in set(zip(bw.tolist(), bh.tolist())):
            sel = idx[(bw == sw) & (bh == sh)]; per = max(1, int(2e6 // (sw * sh)))
            di, dj = np.meshgrid(np.arange(sw), np.arange(sh)); di = di.ravel(); dj = dj.ravel()
            for c0 in range(0, len(sel), per):
                s = sel[c0:c0 + per]
                I = i0[s, None] + di[None, :]; J = j0[s, None] + dj[None, :]
                inside(s, I, J, (I <= i1[s, None]) & (J <= j1[s, None]))
    # a long sliver across a park: one at a time, in bands of rows
    for t in np.nonzero(ok & (w * h > 65536))[0]:
        s = np.array([t]); cols = np.arange(i0[t], i1[t] + 1)
        blk = max(1, int(1e6 // len(cols)))
        for jb in range(j0[t], j1[t] + 1, blk):
            J, I = np.meshgrid(np.arange(jb, min(jb + blk, j1[t] + 1)), cols, indexing='ij')
            I = I.reshape(1, -1); J = J.reshape(1, -1)
            inside(s, I, J, np.ones_like(I, bool))
    return out

_GM = {}      # ground_maps' arrays, for hill_brush

def _vn_hash(ix, iy, seed):
    """a hash of integer lattice points to [0, 1): the same everywhere, always"""
    import numpy as np
    h = (np.asarray(ix, np.int64) * 374761393 + np.asarray(iy, np.int64) * 668265263 + seed * 2147483647) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFF).astype(np.float32) / float(0xFFFFFF)

def _fbm(X, Y, scale, octaves, seed, gain=0.5):
    """smooth value noise summed over octaves, a pure function of the world
    position: every frame's region computes the same field, so tiles meet"""
    import numpy as np
    t = np.zeros(X.shape, np.float32); amp = 1.0; norm = 0.0; sc_ = scale
    for o in range(octaves):
        x = X / sc_; y = Y / sc_; ix = np.floor(x); iy = np.floor(y)
        fx = (x - ix).astype(np.float32); fy = (y - iy).astype(np.float32); ix = ix.astype(np.int64); iy = iy.astype(np.int64)
        sx = fx * fx * (3 - 2 * fx); sy = fy * fy * (3 - 2 * fy); sd = seed + o * 17
        a = _vn_hash(ix, iy, sd); b_ = _vn_hash(ix + 1, iy, sd); c = _vn_hash(ix, iy + 1, sd); d_ = _vn_hash(ix + 1, iy + 1, sd)
        t += amp * ((a + (b_ - a) * sx) * (1 - sy) + (c + (d_ - c) * sx) * sy); norm += amp; amp *= gain; sc_ /= 2.03
    return t / norm

def _ss(e0, e1, x):
    import numpy as np
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3 - 2 * t)

def _bilerp(A_, x0, y0, st, X, Y):
    """A_ sampled at cell centres x0 + (i + 0.5) st, bilinear, edges held"""
    import numpy as np
    u = np.clip((X - x0) / st - 0.5, 0, A_.shape[1] - 1.001); v = np.clip((Y - y0) / st - 0.5, 0, A_.shape[0] - 1.001)
    i = u.astype(np.int64); j = v.astype(np.int64); fu = (u - i).astype(np.float32); fv = (v - j).astype(np.float32)
    return (A_[j, i] * (1 - fu) + A_[j, i + 1] * fu) * (1 - fv) + (A_[j + 1, i] * (1 - fu) + A_[j + 1, i + 1] * fu) * fv

BRUSH_T = 0.568     # the patch threshold on the 38 m field: about a third of neutral ground

def ground_maps(d, box=None, pad=300.0):
    """the two maps hill_ground reads (see above): (imgA, frameA, imgB, frameB),
    a frame being (x0, y0, width, height) in metres"""
    import numpy as np, base64
    import terrain_hq as _th
    f_ = lambda s: np.frombuffer(base64.b64decode(s), np.float32)
    if box is None:
        tp = np.concatenate([f_(m['pos']) for m in d['meshes'] if m['layer'] == 'terrain' and not m.get('instanced')]).reshape(-1, 3)
        x0, y0, x1, y1 = float(tp[:, 0].min()), float(tp[:, 1].min()), float(tp[:, 0].max()), float(tp[:, 1].max())
    else:
        x0, y0, x1, y1 = box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad
    res = max(0.5, max(x1 - x0, y1 - y0) / 4000.0)
    nx, ny = int(math.ceil((x1 - x0) / res)), int(math.ceil((y1 - y0) / res))
    park = np.zeros((ny, nx), np.float32)
    for m in d['meshes']:
        if m['layer'] != 'ground-detail' or m.get('instanced'): continue
        if m.get('opacity', 1) < 0.45 or (m.get('color') or [1])[0] < 0.3: continue     # piers' plates and shadows, lakes
        c = f_(m['col'])
        if not len(c) or c[2] > 0.8: continue                 # white: paved paths, not a park
        T = f_(m['pos']).reshape(-1, 3, 3)[:, :, :2].astype(np.float64)
        T = T[(T[:, :, 0].max(1) > x0) & (T[:, :, 0].min(1) < x1) & (T[:, :, 1].max(1) > y0) & (T[:, :, 1].min(1) < y1)]
        _fill_tris(T, x0, y0, res, nx, ny, park)
    # the rail lines (the engine's 'rail' layer), grown 5 m: no container on a track
    railm = np.zeros((ny, nx), np.float32)
    for m in d['meshes']:
        if m['layer'] != 'rail' or m.get('instanced'): continue
        T = f_(m['pos']).reshape(-1, 3, 3)[:, :, :2].astype(np.float64)
        T = T[(T[:, :, 0].max(1) > x0) & (T[:, :, 0].min(1) < x1) & (T[:, :, 1].max(1) > y0) & (T[:, :, 1].min(1) < y1)]
        if len(T): _fill_tris(T, x0, y0, res, nx, ny, railm)
    # and every track OpenStreetMap has (yard ladders, Muni's depots: the engine
    # draws the main lines only), from the transit agent's fetch
    try:
        rp_ = os.environ.get('OSM_RAIL', '/Users/daniel/code/qipu-render-work/transit/rail_osm.json')
        if os.path.exists(rp_):
            KXo = 111320 * 0.790582709628753
            for e_ in json.load(open(rp_))['elements']:
                t_ = e_.get('tags', {}); g_ = e_.get('geometry') or []
                if e_.get('type') != 'way' or t_.get('railway') not in ('rail', 'light_rail', 'tram', 'narrow_gauge', 'siding') or t_.get('tunnel') or len(g_) < 2: continue
                Q = np.array([((p_['lon'] + 122.438) * KXo, (p_['lat'] - 37.76) * 111320) for p_ in g_], np.float64)
                if Q[:, 0].max() < x0 or Q[:, 0].min() > x1 or Q[:, 1].max() < y0 or Q[:, 1].min() > y1: continue
                for a_, b_ in zip(Q[:-1], Q[1:]):
                    n_ = max(2, int(np.hypot(*(b_ - a_)) / res) + 1); tt = np.linspace(0, 1, n_)[:, None]
                    S_ = a_ + (b_ - a_) * tt; ii = ((S_[:, 0] - x0) / res).astype(np.int64); jj = ((S_[:, 1] - y0) / res).astype(np.int64)
                    ok = (ii >= 0) & (ii < nx) & (jj >= 0) & (jj < ny); railm[jj[ok], ii[ok]] = 1.0
    except Exception as ex:
        print('ground_maps: no OSM rails:', ex)
    railm = (_box_mean(railm, int(round(5.0 / res))) > 1e-6).astype(np.uint8)
    # yards: every building's outline sampled at the map's pixel, grown 7 m;
    # a house's yard is a garden, a warehouse's, a shop's or an office's is
    # paved (SoMa's lots read as lawns, 2026-09-24)
    nearH = np.zeros((ny, nx), np.float32); nearP = np.zeros((ny, nx), np.float32)
    try:
        EH, EP = ([], []), ([], [])
        IND = []                      # (x, y, length, industrial?) of every wall, for the works map below
        for b_ in city_data.buildings(x0, y0, x1, y1):
            r_ = b_['ring']
            if len(r_) < 2: continue
            paved_ = b_['ty'] in ('RETAIL', 'OFFICE', 'INDUSTRIAL', 'GARAGE') or b_['use'] in ('retail', 'office', 'industrial')
            works_ = b_['ty'] in ('INDUSTRIAL', 'GARAGE') or b_['use'] == 'industrial'
            E_ = EP if paved_ else EH
            E_[0].extend(r_); E_[1].extend(r_[1:] + r_[:1])
            for (ax_, ay_), (bx_, by_) in zip(r_, r_[1:] + r_[:1]):
                IND.append(((ax_ + bx_) / 2, (ay_ + by_) / 2, math.hypot(bx_ - ax_, by_ - ay_), 1.0 if works_ else 0.0,
                            math.atan2(by_ - ay_, bx_ - ax_)))
        for (E0, E1), tgt in ((EH, nearH), (EP, nearP)):
            if not E0: continue
            E0 = np.asarray(E0, np.float64); E1 = np.asarray(E1, np.float64)
            n_ = np.maximum(1, np.ceil(np.hypot(*(E1 - E0).T) / res)).astype(np.int64) + 1
            k_ = np.repeat(np.arange(len(n_)), n_); t_ = (np.arange(n_.sum()) - np.repeat(np.cumsum(n_) - n_, n_)) / np.repeat(n_ - 1, n_)
            P_ = E0[k_] + (E1[k_] - E0[k_]) * t_[:, None]
            ii = ((P_[:, 0] - x0) / res).astype(np.int64); jj = ((P_[:, 1] - y0) / res).astype(np.int64)
            ok = (ii >= 0) & (ii < nx) & (jj >= 0) & (jj < ny); tgt[jj[ok], ii[ok]] = 1.0
            del E0, E1, n_, k_, t_, P_, ii, jj, ok
    except Exception as ex:
        print('ground_maps: no buildings for the yards:', ex)
    nearH = (_box_mean(nearH, int(round(7.0 / res))) > 1e-6).astype(np.float32)
    nearP = (_box_mean(nearP, int(round(9.0 / res))) > 1e-6).astype(np.float32)
    yard = np.clip(_box_mean(np.maximum(nearH, nearP), int(round(2.0 / res))), 0, 1)
    paved = np.clip(_box_mean(nearP * (1.0 - 0.6 * nearH), int(round(3.0 / res))), 0, 1)
    del nearH, nearP
    # B: the land's form, on a coarser grid from the true ground
    st = max(4.0, max(x1 - x0, y1 - y0) / 2000.0)
    mx_, my_ = int(math.ceil((x1 - x0) / st)) + 1, int(math.ceil((y1 - y0) / st)) + 1
    X, Y = np.meshgrid(x0 + (np.arange(mx_) + 0.5) * st, y0 + (np.arange(my_) + 0.5) * st)
    Z = np.nan_to_num(_th.true_ground(X, Y).astype(np.float32))
    tpi = Z - _box_mean(Z, int(round(30.0 / st)))
    gy, gx = np.gradient(Z, st)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
    hilly = _box_mean(slope, int(round(40.0 / st)))
    # the engine's own word on green ground (its land cover: watered grounds
    # round the housing blocks, school fields), blurred over ~25 m so its
    # 40 m cells never show: it only chooses, on flat open ground outside the
    # parks, between kept grounds and a dry lot
    egs = np.zeros((my_, mx_), np.float64); egn = np.zeros((my_, mx_), np.float64)
    for m in d['meshes']:
        if m['layer'] != 'terrain' or m.get('instanced') or not m.get('col'): continue
        P_ = f_(m['pos']).reshape(-1, 3); K_ = f_(m['col']).reshape(-1, 3)
        ii = ((P_[:, 0] - x0) / st).astype(np.int64); jj = ((P_[:, 1] - y0) / st).astype(np.int64)
        ok = (ii >= 0) & (ii < mx_) & (jj >= 0) & (jj < my_)
        np.add.at(egs, (jj[ok], ii[ok]), np.clip((K_[ok, 1] - K_[ok, 0]) * 10.0, 0, 1)); np.add.at(egn, (jj[ok], ii[ok]), 1.0)
    # WORKS: open ground among warehouses and yards is not a lawn but a paved
    # or gravel yard (Dogpatch, Islais Creek, Bayview, Hunters Point read as
    # green fields, 2026-09-24): the share of industrial walls in all walls
    # within ~60 m; and the grid's own angle there (the walls' 4θ averaged),
    # so containers line up with the street grid
    works = np.zeros((my_, mx_), np.float32); ang = np.zeros((my_, mx_), np.float32)
    try:
        if IND:
            I_ = np.asarray(IND, np.float64)
            ii = ((I_[:, 0] - x0) / st).astype(np.int64); jj = ((I_[:, 1] - y0) / st).astype(np.int64)
            ok = (ii >= 0) & (ii < mx_) & (jj >= 0) & (jj < my_)
            wa = np.zeros((my_, mx_), np.float64); wi = np.zeros((my_, mx_), np.float64); c4 = np.zeros((my_, mx_), np.float64); s4 = np.zeros((my_, mx_), np.float64)
            np.add.at(wa, (jj[ok], ii[ok]), I_[ok, 2]); np.add.at(wi, (jj[ok], ii[ok]), I_[ok, 2] * I_[ok, 3])
            np.add.at(c4, (jj[ok], ii[ok]), I_[ok, 2] * np.cos(4 * I_[ok, 4])); np.add.at(s4, (jj[ok], ii[ok]), I_[ok, 2] * np.sin(4 * I_[ok, 4]))
            rw = int(round(60.0 / st))
            wa_ = _box_mean(wa.astype(np.float32), rw); wi_ = _box_mean(wi.astype(np.float32), rw)
            works = (np.clip((wi_ / np.maximum(wa_, 1e-6) - 0.45) / 0.3, 0, 1) * (wa_ > 1e-4)).astype(np.float32)
            ang = (np.arctan2(_box_mean(s4.astype(np.float32), rw), _box_mean(c4.astype(np.float32), rw)) / 4.0).astype(np.float32)
            del I_, wa, wi, c4, s4, wa_, wi_
    except Exception as ex:
        print('ground_maps: no works map:', ex)
    r_ = int(round(12.0 / st))
    eg = (_box_mean(_box_mean(egs.astype(np.float32), r_), r_) / np.maximum(_box_mean(_box_mean(egn.astype(np.float32), r_), r_), 1e-3)).astype(np.float32)
    # C: the coyote brush's patches at ~1.2 m, a pure function of the world
    # position (a frame's region box must not move a bush: the tiles meet): a
    # 38 m field, pushed up on the north faces and in the hollows, down on
    # the ridges and the south faces. hill_ground darkens the ground under
    # it, hill_brush plants the bushes on it.
    rb = max(1.2, res)
    cx_, cy_ = int(math.ceil((x1 - x0) / rb)), int(math.ceil((y1 - y0) / rb))
    XB, YB = np.meshgrid(x0 + (np.arange(cx_) + 0.5) * rb, y0 + (np.arange(cy_) + 0.5) * rb)
    north = (-gy / np.sqrt(1 + gx * gx + gy * gy)).astype(np.float32)
    tpin = np.clip(0.5 + tpi / 10.0, 0, 1)
    nb_, tb_ = _bilerp(north, x0, y0, st, XB, YB), _bilerp(tpin, x0, y0, st, XB, YB)
    bias = 0.22 * _ss(0.03, 0.32, nb_) + 0.20 * _ss(0.5, 0.22, tb_) - 0.14 * _ss(0.55, 0.8, tb_) - 0.08 * _ss(0.03, 0.32, -nb_)
    del nb_, tb_
    brush = _ss(BRUSH_T - 0.006, BRUSH_T + 0.006, _fbm(XB, YB, 38.0, 5, 11, gain=0.62) + bias).astype(np.float32)
    # THE GROUND FROM THE AIR (ground_hq.py): where the NAIP class map has
    # data, the brush patches are the photo's scrub, not a noise field
    gw = None
    try:
        import ground_hq as _gh
        gw = _gh.weights(x0, y0, x1, y1)
        if gw is not None: brush = _gh.brush_field(gw, XB, YB, brush, _fbm, _ss, _bilerp)
    except Exception as ex:
        print('ground_maps: no class map:', ex); gw = None
    del XB, YB
    _GM.clear(); _GM.update(x0=x0, y0=y0, res=res, park=park, yard=yard, st=st, hilly=hilly, slope=slope, rb=rb, brush=brush, bias=bias.astype(np.float32), works=works, ang=ang, rail=railm, gw=gw)
    def img(name, R, G, ext, B_=None):
        # 8-bit (a float image of the park mask alone was 360 MB, and Cycles
        # keeps its own copy: the Mac fell over at 00:10, 2026-09-24)
        h_, w_ = R.shape
        im = bpy.data.images.new(name, w_, h_, alpha=False, float_buffer=False)
        im.colorspace_settings.name = 'Non-Color'
        px = np.empty((h_, w_, 4), np.float32); px[..., 0] = R; px[..., 1] = G; px[..., 2] = 0.0 if B_ is None else B_; px[..., 3] = 1.0
        im.pixels.foreach_set(px.ravel()); del px; im.update()
        return im
    A = img('ground_A', park, yard, 'CLIP', paved)
    B = img('ground_B', np.clip(0.5 + tpi / 10.0, 0, 1), np.clip(hilly / 20.0, 0, 1), 'EXTEND', np.clip(eg, 0, 1))
    C = img('ground_C', brush, np.clip(bias + 0.5, 0, 1), 'CLIP')
    D = img('ground_D', works, np.zeros_like(works), 'EXTEND')
    log(f'ground maps: {nx}x{ny} at {res:.2f} m (park {park.mean() * 100:.1f}%, yard {yard.mean() * 100:.0f}%), form {mx_}x{my_} at {st:g} m')
    return A, (x0, y0, nx * res, ny * res), B, (x0, y0, mx_ * st, my_ * st), C, (x0, y0, cx_ * rb, cy_ * rb), D

def hill_ground(d, box=None, name='ground', geom=None):
    """the terrain's material (see the maps above): the 'lawn' material copied
    (so the district's mown stripes come along) and the hills built round it.
    geom (default: env BRUSH, on): the brush is planted as bushes by
    hill_brush, and the ground only darkens under it; off, the shader alone
    draws the clumps, their shadows and the lone bushes"""
    if geom is None: geom = os.environ.get('BRUSH', '1') == '1'
    A, fa, B, fb, C, fc, D = ground_maps(d, box)
    m = bpy.data.materials['lawn'].copy(); m.name = name; nt = m.node_tree
    pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    lawn = pr.inputs['Base Color'].links[0].from_socket
    lawn_n = pr.inputs['Normal'].links[0].from_socket if pr.inputs['Normal'].links else None
    b = NB.__new__(NB); b.m = m; b.nt = nt; b.pr = pr
    geo = b.n('ShaderNodeNewGeometry'); b.pos = geo.outputs['Position']
    def sample(im, fr, ext, vec=None):
        mp = b.n('ShaderNodeMapping'); b.put(mp.inputs['Vector'], vec or b.pos)
        mp.inputs['Scale'].default_value = (1 / fr[2], 1 / fr[3], 0.0); mp.inputs['Location'].default_value = (-fr[0] / fr[2], -fr[1] / fr[3], 0.0)
        t_ = b.n('ShaderNodeTexImage', extension=ext, interpolation='Linear'); t_.image = im
        b.put(t_.inputs['Vector'], mp.outputs[0])
        s_ = b.n('ShaderNodeSeparateColor'); b.put(s_.inputs[0], t_.outputs['Color']); return s_.outputs
    sa = sample(A, fa, 'CLIP'); sb_ = sample(B, fb, 'EXTEND')
    park, yard, paved, tpi, hilly, eg = sa[0], sa[1], sa[2], sb_[0], sb_[1], sb_[2]
    works = sample(D, fb, 'EXTEND')[0]
    nn = b.n('ShaderNodeSeparateXYZ'); b.put(nn.inputs[0], geo.outputs['Normal'])
    nz, north = nn.outputs[2], nn.outputs[1]                     # +y is north
    slope = b.math('SUBTRACT', 1.0, nz)                          # 1 - cos: 0.03 at 14°, 0.13 at 30°, 0.23 at 40°
    nf = b.ramp(north, 0.0, 1.0, 0.03, 0.32)                     # a north face
    sf = b.ramp(b.math('MULTIPLY', north, -1.0), 0.0, 1.0, 0.03, 0.32)
    hollow = b.ramp(tpi, 0.0, 1.0, 0.5, 0.22); ridge = b.ramp(tpi, 0.0, 1.0, 0.55, 0.8)
    def cramp(f, stops):
        n_ = b.n('ShaderNodeValToRGB'); el = n_.color_ramp.elements
        while len(el) < len(stops): el.new(0.5)
        for e_, (p_, c_) in zip(el, stops): e_.position = p_; e_.color = (*c_, 1.0)
        b.put(n_.inputs[0], f); return n_.outputs[0]
    # cured grass: tawny to straw over 40–60 m, a 12 m mottle, darker in the
    # swales, the scan's blades; the colour is deep: under the warm low sun a
    # pale straw reads as sand
    g = cramp(b.noise(1 / 55.0, 3.0, rough=0.55), [(0.28, (0.23, 0.135, 0.040)), (0.5, (0.38, 0.24, 0.068)), (0.72, (0.50, 0.335, 0.108))])
    g = b.mix(b.math('MULTIPLY', nf, 0.55), g, (0.17, 0.135, 0.050))           # north faces: duller, olive
    g = b.mix(b.math('MULTIPLY', sf, 0.30), g, (0.46, 0.31, 0.10))            # south faces: bleached straw
    g = b.mix(b.math('MULTIPLY', hollow, 0.5), g, (0.16, 0.14, 0.05))        # swales hold a little green
    g = b.mix(b.ramp(b.noise(1 / 12.0, 4.0, rough=0.6), 0.0, 1.0, 0.25, 0.75), g, (0.70, 0.66, 0.62), 'MULTIPLY')
    # tussocks and bare soil between them, 1–4 m: strong enough to survive the
    # denoiser (at 0.25 the slopes rendered as smooth felt)
    g = b.mix(b.ramp(b.noise(1 / 3.0, 3.0, rough=0.6), 0.0, 0.5, 0.3, 0.8), g, (0.74, 0.72, 0.70), 'MULTIPLY')
    g = b.mix(b.ramp(b.noise(1 / 1.3, 2.0), 0.0, 0.35, 0.45, 0.75), g, (1.25, 1.2, 1.1), 'MULTIPLY')
    tx = b.img(PHT('withered_grass', 'diff'), b.vmap(1 / 2.6, rot=0.4), proj='FLAT')
    g = b.mix(0.6, g, b.mix(1.0, g, b.mix(1.0, tx, (1 / 0.43, 1 / 0.309, 1 / 0.206), 'MULTIPLY'), 'MULTIPLY'))
    # coyote brush: patches with a crisp, scalloped edge (a 35–45 m noise,
    # biased to the north faces and the hollows, away from the ridges), and
    # single bushes; inside, irregular clumps of 2–4 m, domed, dark gaps.
    # The low sun (from 215°) throws each clump's shadow north-east over the
    # next: the height field is read again a few metres toward the sun, and
    # where it stands higher there, this point is in its shadow
    bias = b.math('ADD', b.math('MULTIPLY', nf, 0.22), b.math('MULTIPLY', hollow, 0.20))
    bias = b.math('SUBTRACT', bias, b.math('ADD', b.math('MULTIPLY', ridge, 0.14), b.math('MULTIPLY', sf, 0.08)))
    _az = math.radians(215.0); toS = (math.sin(_az), math.cos(_az))
    def brush(dist):
        vec = b.pos if dist == 0 else b.vmap(1.0, loc=(toS[0] * dist, toS[1] * dist, 0.0))
        wv = b.n('ShaderNodeVectorMath', operation='ADD'); b.put(wv.inputs[0], vec); b.put(wv.inputs[1], b.noise(1 / 6.0, 2.0, vec=vec, out='Color'))
        dome = b.ramp(b.noise(1 / 2.6, 2.0, vec=wv.outputs[0], rough=0.45), 0.0, 1.0, 0.40, 0.62)
        patch = sample(C, fc, 'CLIP', vec)[0]                    # ground_maps' field (hill_brush plants on it)
        if geom: return patch, None, dome, wv
        cell = b.n('ShaderNodeTexVoronoi'); cell.inputs['Scale'].default_value = 1 / 6.0; b.put(cell.inputs['Vector'], vec)
        lone = b.math('MULTIPLY', b.math('GREATER_THAN', b.math('ADD', b.bw(cell.outputs['Color']), b.math('MULTIPLY', bias, 0.5)), 0.92),
                      b.ramp(cell.outputs['Distance'], 1.0, 0.0, 0.22, 0.28))
        scrub = b.math('MAXIMUM', patch, lone)
        # a bush's height: the patch's clumps domed, a lone bush a dome of its own
        ht = b.math('MAXIMUM', b.math('MULTIPLY', patch, b.math('ADD', 0.45, b.math('MULTIPLY', dome, 0.55))),
                    b.math('MULTIPLY', lone, b.ramp(cell.outputs['Distance'], 1.0, 0.45, 0.0, 0.26)))
        return scrub, ht, dome, wv
    scrub, ht0, dome, wv = brush(0.0)
    if not geom:
        _, ht1, _, _ = brush(1.4)
        _, ht2, _, _ = brush(3.0)
        cast = b.math('MAXIMUM', b.ramp(b.math('SUBTRACT', ht1, ht0), 0.0, 1.0, 0.10, 0.35),
                      b.math('MULTIPLY', b.ramp(b.math('SUBTRACT', ht2, ht0), 0.0, 1.0, 0.25, 0.55), 0.8))
    cl = b.n('ShaderNodeTexVoronoi'); cl.inputs['Scale'].default_value = 1 / 3.0; b.put(cl.inputs['Vector'], wv.outputs[0])
    sc_ = cramp(b.math('ADD', b.math('MULTIPLY', dome, 0.7), b.math('MULTIPLY', b.bw(cl.outputs['Color']), 0.3)),
                [(0.0, (0.030, 0.027, 0.009)), (0.4, (0.080, 0.078, 0.024)), (1.0, (0.19, 0.17, 0.050))])
    # rock: Franciscan chert on the steepest faces (≈30–42°) and the crests —
    # broken blocks a couple of metres across with grass between them (a
    # solid patch read as a stain), rust-brown weathering to buff, dark joints
    rk = b.math('ADD', b.math('MULTIPLY', b.ramp(slope, 0.0, 1.0, 0.13, 0.26), 0.75), b.math('MULTIPLY', ridge, 0.25))
    rk = b.math('ADD', rk, b.math('MULTIPLY', b.math('SUBTRACT', b.noise(1 / 22.0, 3.0), 0.5), 0.6))
    blk = b.n('ShaderNodeTexVoronoi'); blk.inputs['Scale'].default_value = 1 / 3.2; b.put(blk.inputs['Vector'], b.vmap((1.0, 1.0, 2.0)))
    joint = b.voronoi(1 / 3.2, vec=b.vmap((1.0, 1.0, 2.0)), feature='DISTANCE_TO_EDGE')
    core = b.ramp(rk, 0.0, 1.0, 0.60, 0.80)
    rock = b.math('MULTIPLY', b.ramp(rk, 0.0, 1.0, 0.58, 0.62),
                  b.ramp(b.math('SUBTRACT', b.bw(blk.outputs['Color']), b.math('ADD', 0.22, b.math('MULTIPLY', core, 0.7))), 1.0, 0.0, -0.03, 0.03))
    rc = cramp(b.math('ADD', b.math('MULTIPLY', b.noise(1 / 16.0, 3.0), 0.7), b.math('MULTIPLY', b.bw(blk.outputs['Color']), 0.3)),
               [(0.3, (0.19, 0.105, 0.065)), (0.55, (0.29, 0.20, 0.14)), (0.8, (0.37, 0.31, 0.24))])
    rt = b.bw(b.img(PHT('aerial_rocks_02', 'diff'), b.vmap(1 / 9.0, rot=1.1), proj='FLAT'))
    rc = b.mix(1.0, rc, b.math('ADD', 0.85, b.math('MULTIPLY', rt, 1.1)), 'MULTIPLY')
    rc = b.mix(b.math('MULTIPLY', b.ramp(joint, 1.0, 0.0, 0.012, 0.035), 0.7), rc, (0.07, 0.05, 0.04))
    hill = b.mix(rock, g, rc)
    scrub = b.math('MULTIPLY', scrub, b.math('SUBTRACT', 1.0, rock))
    hill = b.mix(scrub, hill, sc_)
    if not geom: hill = b.mix(b.math('MULTIPLY', cast, 0.62), hill, (0.0, 0.0, 0.0), 'MULTIPLY')
    # yards: a garden — deep green lawn and shrubs, dry patches, a patio here and there
    garden = b.mix(1.0, lawn, (0.62, 0.72, 0.50), 'MULTIPLY')
    yd = b.mix(b.ramp(b.noise(1 / 7.0, 3.0), 0.0, 1.0, 0.58, 0.70), garden, b.mix(0.5, g, garden))
    yd = b.mix(b.ramp(b.noise(1 / 5.0, 3.0, vec=b.vmap(1.0, loc=(31.7, 12.3, 0))), 0.0, 1.0, 0.56, 0.60), yd, (0.035, 0.05, 0.018))
    yd = b.mix(b.ramp(b.noise(1 / 6.0, 2.0, vec=b.vmap(1.0, loc=(-9.1, 44.2, 0))), 0.0, 1.0, 0.68, 0.70), yd, (0.285, 0.29, 0.172))
    # a paved yard: old concrete and asphalt in pours of different age, oil
    # stains, weeds in the cracks, a planted strip now and then
    pv = cramp(b.noise(1 / 14.0, 3.0, vec=b.vmap(1.0, loc=(5.5, 71.0, 0))), [(0.35, (0.13, 0.125, 0.12)), (0.5, (0.21, 0.205, 0.19)), (0.65, (0.29, 0.28, 0.26))])
    pv = b.mix(b.ramp(b.noise(1 / 2.5, 3.0), 0.0, 0.45, 0.62, 0.72), pv, (0.07, 0.068, 0.065))
    pv = b.mix(b.ramp(b.noise(1 / 4.0, 3.0, vec=b.vmap(1.0, loc=(-3.3, 8.8, 0))), 0.0, 0.8, 0.66, 0.70), pv, b.mix(0.5, g, garden))
    yd = b.mix(b.ramp(paved, 0.0, 1.0, 0.3, 0.7), yd, b.mix(1.0, pv, (0.95, 1.0, 0.66), 'MULTIPLY'))
    # the park lawn, where the park is not hillside (a wavy line where it
    # turns): watered, a deeper green than the lime the scan turns into here
    jit = b.math('MULTIPLY', b.math('SUBTRACT', b.noise(1 / 14.0, 3.0), 0.5), 0.12)
    wild = b.ramp(b.math('ADD', hilly, jit), 0.0, 1.0, 0.47, 0.67)            # a park over ≈ 9.5–13.5°
    lawnf = b.math('MULTIPLY', park, b.math('SUBTRACT', 1.0, wild))
    yardf = b.math('MULTIPLY', yard, b.math('SUBTRACT', 1.0, park))
    # open ground that is flat (under ≈ 5–8°) and no park is a city lot — a
    # schoolyard, a vacant lot, a church's ground: weedy dry grass and paving,
    # not a hillside
    lotf = b.math('MULTIPLY', b.math('SUBTRACT', 1.0, b.math('MAXIMUM', park, yard)), b.ramp(b.math('ADD', hilly, jit), 1.0, 0.0, 0.25, 0.40))
    # (a dry lot: weedy grass, paving in a few broad soft patches — at 9 m and
    # a hard edge they read as camouflage; where the engine says green, the
    # kept grounds of a housing block or a school: a garden's green)
    lot = b.mix(b.ramp(b.noise(1 / 16.0, 3.0, vec=b.vmap(1.0, loc=(17.3, -5.1, 0))), 0.0, 0.8, 0.60, 0.72), b.mix(0.35, yd, g), (0.228, 0.23, 0.139))
    lot = b.mix(b.ramp(eg, 0.0, 1.0, 0.18, 0.5), lot, yd)
    # the watered lawn in late September: a tired green, yellower in broad
    # patches, worn to earth here and there, a gang mower's 4 m stripes
    # (the scan's green, a little of its saturation taken off and warmed: the
    # watered-lime carpet was the loudest thing in a city frame)
    tired = b.mix(b.ramp(b.noise(1 / 32.0, 3.0), 0.0, 1.0, 0.35, 0.7), (0.78, 0.84, 0.56), (0.98, 0.88, 0.50))
    lw = b.mix(1.0, lawn, tired, 'MULTIPLY')
    hs_ = b.n('ShaderNodeHueSaturation'); b.put(hs_.inputs['Color'], lw)
    hs_.inputs['Hue'].default_value = 0.49; hs_.inputs['Saturation'].default_value = 0.9; lw = hs_.outputs[0]
    spx = b.n('ShaderNodeSeparateXYZ'); b.put(spx.inputs[0], b.pos)
    uu = b.math('ADD', b.math('MULTIPLY', spx.outputs[0], math.cos(0.14)), b.math('MULTIPLY', spx.outputs[1], math.sin(0.14)))
    stripe = b.ramp(b.math('SINE', b.math('MULTIPLY', uu, math.pi / 4.0)), 0.0, 1.0, -0.3, 0.3)
    lw = b.mix(1.0, lw, b.math('ADD', 0.97, b.math('MULTIPLY', stripe, 0.06)), 'MULTIPLY')
    # dry where the sprinklers miss: soft drifts where the green turns to
    # straw (a tint of the lawn itself, not a paler colour laid over it: that
    # greyed the whole park), never a hard blot (hard earth blots at 11 m read
    # as camouflage); bare earth only in the middle of the driest of them
    dry = b.ramp(b.noise(1 / 18.0, 3.0, vec=b.vmap(1.0, loc=(-23.0, 7.7, 0))), 0.0, 0.8, 0.52, 0.78)
    lw = b.mix(dry, lw, b.mix(1.0, lw, (1.45, 1.08, 0.55), 'MULTIPLY'))
    bare = b.math('MULTIPLY', b.ramp(b.noise(1 / 5.0, 3.0, vec=b.vmap(1.0, loc=(4.1, -8.3, 0))), 0.0, 1.0, 0.58, 0.70), b.ramp(dry, 0.0, 0.7, 0.35, 0.6))
    lw = b.mix(bare, lw, (0.105, 0.085, 0.05))
    # a works yard (mostly one worn asphalt, warm grey, its tone drifting gently over
    # 50 m; dusty gravel in a few soft patches; the fine wear of tyres and
    # oil; weeds in the cracks — the Voronoi patchwork read as crazy paving,
    # the 24 m noise as camouflage)
    wy = b.mix(b.ramp(b.noise(1 / 50.0, 2.0, vec=b.vmap(1.0, loc=(-41.0, 13.0, 0))), 0.0, 1.0, 0.3, 0.7), (0.105, 0.098, 0.088), (0.15, 0.14, 0.125))
    wy = b.mix(b.math('MULTIPLY', b.ramp(b.noise(1 / 20.0, 3.0, vec=b.vmap(1.0, loc=(8.0, 51.0, 0))), 0.0, 1.0, 0.60, 0.72), 0.75), wy, (0.21, 0.19, 0.16))
    wy = b.mix(b.ramp(b.noise(1 / 2.5, 3.0), 0.0, 0.35, 0.58, 0.72), wy, b.mix(1.0, wy, (0.70, 0.68, 0.66), 'MULTIPLY'))
    wy = b.mix(b.ramp(b.noise(1 / 0.7, 2.0), 0.0, 0.25, 0.5, 0.8), wy, b.mix(1.0, wy, (1.12, 1.1, 1.06), 'MULTIPLY'))
    wy = b.mix(b.math('MULTIPLY', b.ramp(b.noise(1 / 2.2, 3.0, vec=b.vmap(1.0, loc=(3.0, -7.0, 0))), 0.0, 1.0, 0.70, 0.75), 0.7), wy, b.mix(0.5, g, (0.10, 0.10, 0.04)))
    # PAVING UNDER THIS LIGHT: an orange sun and a blue sky fill both lift red
    # and blue over green, so a neutral grey renders mauve-pink (the Pier 27
    # apron, SoMa's yards, 2026-09-24: sRGB 128,121,148). The paving's albedo
    # carries the opposite bias — blue cut by a third, red a touch — and
    # renders a warm-neutral grey beside the street asphalt
    NEU = (0.95, 1.0, 0.66)
    wy = b.mix(1.0, wy, NEU, 'MULTIPLY')
    wk = b.ramp(works, 0.0, 1.0, 0.25, 0.7)
    lot = b.mix(wk, lot, wy); yd = b.mix(wk, yd, wy)
    c = b.mix(yardf, hill, yd)
    c = b.mix(lotf, c, lot)
    c = b.mix(lawnf, c, lw)
    wetf = None
    if _GM.get('gw') is not None:
        # what the photo says each patch of open ground is (ground_hq.py)
        import ground_hq as _gh
        c, wetf, wildc, hv = _gh.shade(b, sample, _GM['gw'], c, hill, lw, g, NEU)
    b.put(pr.inputs['Base Color'], c)
    # relief: the brush's domes, the rock's blocks and the grass's tussocks
    # catch the low sun
    wildf = b.math('SUBTRACT', 1.0, b.math('MAXIMUM', b.math('MAXIMUM', lawnf, yardf), lotf))
    if wetf is not None: wildf = b.mix(hv, wildf, wildc)
    rh = b.math('ADD', b.math('MULTIPLY', b.bw(blk.outputs['Color']), 0.35), b.ramp(joint, 0.0, 0.3, 0.0, 0.08))
    h_ = b.math('ADD', b.math('MULTIPLY', b.math('MULTIPLY', scrub, dome), 0.7), b.math('MULTIPLY', rock, rh))
    h_ = b.math('ADD', h_, b.math('MULTIPLY', b.noise(1 / 1.6, 3.0), 0.12))
    b.put(pr.inputs['Normal'], b.bump(b.math('MULTIPLY', h_, wildf), 1.0, 0.6, normal=lawn_n))
    ro = b.math('SUBTRACT', 0.95, b.math('MULTIPLY', rock, 0.12))
    if wetf is not None: ro = b.math('SUBTRACT', ro, b.math('MULTIPLY', wetf, 0.5))
    b.put(pr.inputs['Roughness'], ro)
    pr.inputs['Specular IOR Level'].default_value = 0.35
    return m

def _brush_protos():
    """the Poly Haven shrubs (shrub_02, shrub_04), ONE PROTO PER BUSH (their
    LOD collections hold four bushes side by side), at LOD1, foot at the
    origin, as [(collection, (dx, dy, dz))]; the leaves tinted to coyote
    brush: a dark olive, a sage now and then (the instance's own random),
    matte, little light through them"""
    out = []
    for asset in ('shrub_02', 'shrub_04'):
        path = glob.glob(f'{PH}/{asset}/*.blend')[0]
        with bpy.data.libraries.load(path, link=False) as (src, dst):
            dst.collections = [c for c in src.collections if c == f'{asset}_LOD1'] or [c for c in src.collections if c.endswith('LOD1')] or src.collections[:1]
        c = dst.collections[0]
        for o in [o for o in c.all_objects if o.type == 'MESH']:
            mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9)); vs_ = o.data.vertices
            for i_ in range(0, len(vs_), 3):
                p = o.matrix_world @ vs_[i_].co
                mn = Vector((min(mn.x, p.x), min(mn.y, p.y), min(mn.z, p.z))); mx = Vector((max(mx.x, p.x), max(mx.y, p.y), max(mx.z, p.z)))
            for sl in o.material_slots:
                m = sl.material
                if m is None or m.get('brush_tint'): continue
                m['brush_tint'] = 1; nt = m.node_tree
                grp = next((n for n in nt.nodes if n.type == 'GROUP' and 'Diffuse' in n.inputs), None)
                if grp is None or not grp.inputs['Diffuse'].links: continue
                src_ = grp.inputs['Diffuse'].links[0].from_socket
                # the bush's tone by its PLACE (the point's 'crand', a world
                # hash), not Object Info > Random: that follows the instance
                # index, which shifts with a frame's region, and a bush
                # changed colour across a tile seam
                oi = nt.nodes.new('ShaderNodeAttribute'); oi.attribute_type = 'INSTANCER'; oi.attribute_name = 'crand'
                hs = nt.nodes.new('ShaderNodeHueSaturation'); nt.links.new(src_, hs.inputs['Color'])
                hs.inputs['Hue'].default_value = 0.47; hs.inputs['Saturation'].default_value = 0.85
                mv = nt.nodes.new('ShaderNodeMapRange'); nt.links.new(oi.outputs['Fac'], mv.inputs[0])
                mv.inputs[3].default_value = 0.30; mv.inputs[4].default_value = 0.52; nt.links.new(mv.outputs[0], hs.inputs['Value'])
                nt.links.new(hs.outputs['Color'], grp.inputs['Diffuse'])
                if 'Translucency' in grp.inputs and grp.inputs['Translucency'].links:
                    tl = grp.inputs['Translucency'].links[0].from_socket
                    mt = nt.nodes.new('ShaderNodeMath'); mt.operation = 'MULTIPLY'; mt.inputs[1].default_value = 0.3
                    nt.links.new(tl, mt.inputs[0]); nt.links.new(mt.outputs[0], grp.inputs['Translucency'])
                if 'Rough' in grp.inputs:
                    for l_ in list(grp.inputs['Rough'].links): nt.links.remove(l_)
                    grp.inputs['Rough'].default_value = (0.9, 0.9, 0.9, 1.0) if hasattr(grp.inputs['Rough'].default_value, '__len__') else 0.9
            one = bpy.data.collections.new(f'{o.name}_one'); one.objects.link(o)
            one.instance_offset = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
            out.append((one, (mx.x - mn.x, mx.y - mn.y, mx.z - mn.z)))
    return out

CONTAINER_COLS = [(0.30, 0.07, 0.04), (0.30, 0.07, 0.04), (0.05, 0.12, 0.25), (0.06, 0.15, 0.08), (0.36, 0.37, 0.37),
                  (0.62, 0.62, 0.60), (0.45, 0.15, 0.03), (0.17, 0.05, 0.05), (0.05, 0.18, 0.19), (0.24, 0.20, 0.14)]
def yard_props(ground_fn, box, bvs, seed=9):
    """what stands in a works yard: rows of shipping containers (one or two
    high) and parked semi-trailers, lined up with the local street grid, on
    open flat ground of the works map, clear of buildings, streets and parks.
    A 16 m lattice fixed in the world; a sparse few."""
    import numpy as np
    g = _GM
    if not g or 'works' not in g: return 0
    x0, y0 = g['x0'], g['y0']
    bx0, by0, bx1, by1 = box if box is not None else (x0, y0, x0 + g['park'].shape[1] * g['res'], y0 + g['park'].shape[0] * g['res'])
    cs = 16.0
    I, J = np.meshgrid(np.arange(math.floor(bx0 / cs), math.ceil(bx1 / cs)), np.arange(math.floor(by0 / cs), math.ceil(by1 / cs)))
    I = I.ravel(); J = J.ravel(); h = [_vn_hash(I, J, seed * 100 + k) for k in range(6)]
    X = (I + 0.3 + 0.4 * h[0]) * cs; Y = (J + 0.3 + 0.4 * h[1]) * cs
    def at(a, res_, xx, yy):
        i = np.clip(((xx - x0) / res_).astype(np.int64), 0, a.shape[1] - 1); j = np.clip(((yy - y0) / res_).astype(np.int64), 0, a.shape[0] - 1)
        return a[j, i]
    cand = (at(g['works'], g['st'], X, Y) > 0.7) & (at(g['hilly'], g['st'], X, Y) < 5.0) & (h[2] < 0.22)
    V, F, C = [], [], []
    def box3(o, u, v, L, W, z0, H, col):
        k = len(V)
        for (a, b_) in ((0, 0), (L, 0), (L, W), (0, W)):
            p = o + u * a + v * b_; V.append((p.x, p.y, z0))
        for (a, b_) in ((0, 0), (L, 0), (L, W), (0, W)):
            p = o + u * a + v * b_; V.append((p.x, p.y, z0 + H))
        for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            F.append(tuple(k + i for i in f)); C.append(col)
    groups = 0
    for q in np.nonzero(cand)[0].tolist():
        x, y = float(X[q]), float(Y[q])
        a_ = float(at(g['ang'], g['st'], np.array([x]), np.array([y]))[0]) + (math.pi / 2 if h[3][q] < 0.5 else 0.0)
        u = Vector((math.cos(a_), math.sin(a_), 0)); v = Vector((-u.y, u.x, 0))
        trailers = h[4][q] < 0.35
        n = 1 + int(h[5][q] * (4 if trailers else 5))
        L, W, H, gap = (14.6, 2.6, 2.9, 1.3) if trailers else ((12.2 if h[4][q] < 0.8 else 6.1), 2.44, 2.6, 0.25)
        o = Vector((x, y, 0)) - u * (L / 2) - v * (n * (W + gap) / 2)
        # the whole group's footprint must be open works ground
        cx_ = [o + u * a + v * b_ for a in (0, L / 2, L) for b_ in (0, n * (W + gap) / 2, n * (W + gap))]
        xs_ = np.array([p.x for p in cx_]); ys_ = np.array([p.y for p in cx_])
        if (at(g['yard'], g['res'], xs_, ys_) > 0.2).any() or (at(g['park'], g['res'], xs_, ys_) > 0.3).any() or (at(g['works'], g['st'], xs_, ys_) < 0.6).any(): continue
        if (at(g['rail'], g['res'], xs_, ys_) > 0).any(): continue
        if any(bv.find_nearest(Vector((p.x, p.y, ground_fn(p.x, p.y) or 0.0)), dd + 1.5)[0] is not None for p in cx_ for bv, dd in bvs): continue
        zs = [ground_fn(p.x, p.y) for p in cx_]
        # never on the water: the Port's works polygons reach over the bay,
        # where the ground is the flat sea (a pier apron stands at ~2.3 m)
        if any(z_ is None or z_ < 0.8 for z_ in zs) or max(zs) - min(zs) > 1.5: continue
        z0 = min(zs) - 0.05
        rr = random.Random(int(I[q]) * 7919 + int(J[q]))
        for k in range(n):
            ok_ = o + v * (k * (W + gap)) + u * rr.uniform(-0.4, 0.4)
            if trailers:
                col = rr.choice(((0.62, 0.62, 0.60), (0.55, 0.55, 0.54), (0.66, 0.65, 0.61), (0.40, 0.40, 0.40), (0.28, 0.08, 0.05)))
                box3(ok_, u, v, L, W, z0 + 1.1, H, col)                       # the box, on its wheels
                box3(ok_ + u * 1.0 + v * 0.3, u, v, 2.4, W - 0.6, z0, 1.1, (0.03, 0.03, 0.03))   # the bogie in its shadow
            else:
                for lv in range(1 if rr.random() < 0.55 else 2):
                    box3(ok_, u, v, L, W, z0 + lv * H, H - 0.02, rr.choice(CONTAINER_COLS))
        groups += 1
    if not F: return 0
    me = bpy.data.meshes.new('yardprops'); me.from_pydata(V, [], F)
    at_ = me.color_attributes.new('bcol', 'FLOAT_COLOR', 'FACE')
    at_.data.foreach_set('color', [c for col in C for c in (*col, 1.0)])
    me.update()
    mat = bpy.data.materials.get('yardbox')
    if mat is None:
        b = NB('yardbox'); atn = b.n('ShaderNodeAttribute', attribute_name='bcol')
        # painted steel, weathered: rust and grime blotches, the corrugation a fine bump
        cc = b.mix(b.ramp(b.noise(1 / 1.5, 4.0), 0.0, 0.45, 0.55, 0.8), atn.outputs['Color'], (0.16, 0.08, 0.05))
        b.put(b.pr.inputs['Base Color'], cc); b.pr.inputs['Roughness'].default_value = 0.6; b.pr.inputs['Metallic'].default_value = 0.25
        sp_ = b.n('ShaderNodeSeparateXYZ'); b.put(sp_.inputs[0], b.pos)
        b.put(b.pr.inputs['Normal'], b.bump(b.math('SINE', b.math('MULTIPLY', b.math('ADD', sp_.outputs[0], sp_.outputs[1]), 20.0)), 0.15, 0.02))
        mat = b.m
    me.materials.append(mat)
    ob = bpy.data.objects.new('yardprops', me); bpy.context.scene.collection.objects.link(ob)
    log(f'yard props: {groups} groups of containers and trailers, {len(F) // 6} boxes')
    return groups

def hill_brush(ground_fn, box=None, avoid=(('streets', 4.2), ('sidewalks', 1.4), ('paths', 1.4), ('parkpaths', 1.2)), seed=5):
    """THE BUSHES of the brush patches that hill_ground's field draws, and lone
    bushes out in the grass: points on a 2 m lattice fixed in the world (a
    frame's region never moves one), only on wild ground (no lawn, yard, lot,
    rock face), off the streets and paths; low lumpy domes, instanced.
    Call after the streets exist. Returns the number planted."""
    import numpy as np
    if not _GM: return 0
    g = _GM; x0, y0 = g['x0'], g['y0']
    bx0, by0, bx1, by1 = box if box is not None else (x0, y0, x0 + g['park'].shape[1] * g['res'], y0 + g['park'].shape[0] * g['res'])
    cs = 2.0
    I, J = np.meshgrid(np.arange(math.floor(bx0 / cs), math.ceil(bx1 / cs)), np.arange(math.floor(by0 / cs), math.ceil(by1 / cs)))
    I = I.ravel(); J = J.ravel()
    h = [_vn_hash(I, J, seed * 100 + k) for k in range(6)]
    X = (I + 0.15 + 0.7 * h[0]) * cs; Y = (J + 0.15 + 0.7 * h[1]) * cs
    def at(a, res_):
        i = np.clip(((X - x0) / res_).astype(np.int64), 0, a.shape[1] - 1); j = np.clip(((Y - y0) / res_).astype(np.int64), 0, a.shape[0] - 1)
        return a[j, i]
    br = at(g['brush'], g['rb']); bias = at(g['bias'], g['rb'])
    park = at(g['park'], g['res']); yard = at(g['yard'], g['res'])
    hl = at(g['hilly'], g['st']) / 20.0; sl = at(g['slope'], g['st'])
    lawnf = park * (1 - _ss(0.47, 0.67, hl)); yardf = yard * (1 - park); lotf = (1 - np.maximum(park, yard)) * (1 - _ss(0.25, 0.40, hl))
    wild = 1 - np.maximum(np.maximum(lawnf, yardf), lotf)
    if g.get('gw') is not None:
        # where the photo classified the ground: bushes on its brush and cured
        # grass only, never on a lawn, a lot, a beach (ground_hq.py)
        import ground_hq as _gh
        wc, hv_ = _gh.at(g['gw'], X, Y, ('scrub', 'tree', 'drygrass'))
        wild = np.where(hv_, wc.astype(np.float32), wild)
    ok = (wild > 0.8) & (sl < 34.0)
    dense = ok & (br > 0.5)
    lone = ok & (br < 0.2) & (h[2] < 0.010 * (1 + 3 * np.clip(bias, 0, 1)))
    sel = np.nonzero(dense | lone)[0]
    W = np.where(dense, 2.8 + 1.8 * h[3], 2.4 + 1.4 * h[3]); H = np.where(dense, 1.0 + 0.7 * h[4] + 0.4 * h[3], 1.2 + 1.0 * h[4])
    bvs = []
    for nm, dist in avoid:
        ob = bpy.data.objects.get(nm)
        if ob is not None and ob.type == 'MESH' and len(ob.data.polygons): bvs.append((BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get()), dist))
    pts = []
    for q in sel.tolist():
        x, y = float(X[q]), float(Y[q])
        z = ground_fn(x, y)
        if z is None or z < 2.5: continue
        p_ = Vector((x, y, z))
        if any(bv.find_nearest(p_, dd + 0.5 * float(W[q]))[0] is not None for bv, dd in bvs): continue
        pts.append((x, y, z, float(W[q]), float(W[q]) * (0.8 + 0.4 * float(h[5][q])), float(H[q]), float(h[5][q]) * 6.283, int(h[4][q] * 7.999), float(h[3][q] * 0.61803 + h[2][q]) % 1.0))
    try: yard_props(ground_fn, box, bvs)
    except Exception as ex: log('yard props failed:', ex)
    _GM.clear()                                             # the maps' arrays: done with
    if not pts: return 0
    protos = _brush_protos()
    root = bpy.data.collections.new('brush_protos')
    for c, _ in protos: root.children.link(c)
    # a point's scale in the proto's own units: W across, H tall
    pts = [(x, y, z, w / protos[k % len(protos)][1][0], w2 / protos[k % len(protos)][1][1], h / protos[k % len(protos)][1][2], r_, k % len(protos), cr_)
           for (x, y, z, w, w2, h, r_, k, cr_) in pts]
    me = bpy.data.meshes.new('brush'); me.vertices.add(len(pts))
    me.vertices.foreach_set('co', [v for p in pts for v in p[:3]])
    at_ = me.attributes.new('sc', 'FLOAT_VECTOR', 'POINT'); at_.data.foreach_set('vector', [v for p in pts for v in p[3:6]])
    at_ = me.attributes.new('r', 'FLOAT', 'POINT'); at_.data.foreach_set('value', [p[6] for p in pts])
    at_ = me.attributes.new('kind', 'INT', 'POINT'); at_.data.foreach_set('value', [p[7] for p in pts])
    at_ = me.attributes.new('crand', 'FLOAT', 'POINT'); at_.data.foreach_set('value', [p[8] for p in pts])
    ob = bpy.data.objects.new('brush', me); bpy.context.scene.collection.objects.link(ob)
    ng = bpy.data.node_groups.new('brush', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    n = ng.nodes; lk = ng.links.new
    gi = n.new('NodeGroupInput'); go = n.new('NodeGroupOutput')
    ci = n.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = root
    ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = True
    def attr(nm, tp):
        a_ = n.new('GeometryNodeInputNamedAttribute'); a_.data_type = tp; a_.inputs['Name'].default_value = nm; return a_.outputs[0]
    rot = n.new('ShaderNodeCombineXYZ'); lk(attr('r', 'FLOAT'), rot.inputs[2])
    ii = n.new('GeometryNodeInstanceOnPoints'); lk(gi.outputs[0], ii.inputs['Points']); lk(ci.outputs[0], ii.inputs['Instance'])
    ii.inputs['Pick Instance'].default_value = True; lk(attr('kind', 'INT'), ii.inputs['Instance Index'])
    lk(rot.outputs[0], ii.inputs['Rotation']); lk(attr('sc', 'FLOAT_VECTOR'), ii.inputs['Scale'])
    lk(ii.outputs[0], go.inputs[0])
    ob.modifiers.new('brush', 'NODES').node_group = ng
    log(f'brush: {len(pts)} bushes ({int(dense.sum())} patch and {int(lone.sum())} lone places, before the streets)')
    return len(pts)

# ── footpaths, and the roads closed to cars (OpenStreetMap, ways_prep.py) ──
# The engine's street layer draws some footpaths as full streets (the path
# across Dolores Park on the 19th Street line had asphalt, lane paint and
# parked cars, 2026-09-24) and knows nothing of the car-free roads (JFK
# Promenade, the upper loop of Twin Peaks Boulevard). With the ways:
# drop_footway_streets takes the street triangles that lie on a footpath and
# on no road; park_paths lays every footpath, stairway and trail as a narrow
# light ribbon on the ground; carfree_at keeps parked cars off the roads
# closed to them. No ways file = all three do nothing.
WAYS_JSON = os.environ.get('OSM_WAYS', '/Users/daniel/code/qipu-render-work/critic/osm/ways_v2.json')   # v2: with the highway kind
_WAYS = {}
def _ways_kd(kind, box, step=2.0, pad=80.0):
    """a KDTree over the ways of one kind, sampled every `step` m, in box"""
    from mathutils.kdtree import KDTree
    key = (kind, tuple(round(v) for v in box) if box else None)
    if key in _WAYS: return _WAYS[key]
    if 'data' not in _WAYS:
        _WAYS['data'] = json.load(open(WAYS_JSON)) if os.path.exists(WAYS_JSON) else None
    W_ = _WAYS['data']; pts = []
    if W_:
        for w in W_[kind]:
            P = w[0] if kind == 'foot' else w
            for i in range(0, len(P) - 2, 2):
                x0, y0, x1, y1 = P[i], P[i + 1], P[i + 2], P[i + 3]
                if box and (max(x0, x1) < box[0] - pad or min(x0, x1) > box[2] + pad or max(y0, y1) < box[1] - pad or min(y0, y1) > box[3] + pad): continue
                n = max(1, int(math.hypot(x1 - x0, y1 - y0) / step))
                pts.extend((x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n) for k in range(n + 1))
    kd = KDTree(max(1, len(pts)))
    for i, (x, y) in enumerate(pts): kd.insert((x, y, 0.0), i)
    kd.balance(); _WAYS[key] = (kd, len(pts)); return _WAYS[key]

def drop_footway_streets(P, box=None, near=8.0, far=12.0):
    """P: street triangles (flat x, y, z). Returns (kept, dropped): a triangle
    whose centre is `far` m from every road (open or closed to cars) and
    either in a park or within `near` m of a footpath is not a road — a
    footpath, a park's paper street — that the engine drew as one"""
    kf, nf = _ways_kd('foot', box); kc, nc = _ways_kd('car', box); kr, nr = _ways_kd('free', box)
    if not nc: return P, 0
    park = _GM.get('park'); x0_, y0_, r_ = _GM.get('x0', 0), _GM.get('y0', 0), _GM.get('res', 1)
    def in_park(x, y):
        if park is None: return False
        i, j = int((x - x0_) / r_), int((y - y0_) / r_)
        return 0 <= j < park.shape[0] and 0 <= i < park.shape[1] and park[j, i] > 0.5
    out = array.array('f'); dropped = 0
    for t in range(len(P) // 9):
        a = t * 9; cx = (P[a] + P[a + 3] + P[a + 6]) / 3; cy = (P[a + 1] + P[a + 4] + P[a + 7]) / 3; c = (cx, cy, 0.0)
        if kc.find(c)[2] > far and (not nr or kr.find(c)[2] > far) and (in_park(cx, cy) or (nf and kf.find(c)[2] < near)):
            dropped += 1; continue
        out.extend(P[a:a + 9])
    log(f'footpaths drawn as streets by the engine: {dropped} triangles dropped')
    return out, dropped

def merge_street_layers(SC, SA):
    """the engine draws every street twice: a wide 'casing' (sidewalk colour,
    the property line to the property line) and the asphalt on it, 13 cm up.
    Where the casing lies wholly under the asphalt it is dropped: two big
    surfaces of different triangulations, draped each on its own corners,
    cut through each other on uneven ground — the Pier 48 lot on Terry
    Francois Blvd was a mass of dark jagged shards (2026-09-24). Returns
    (the merged triangles, a BVH of the asphalt alone for kerb_edge)."""
    nA = len(SA) // 3
    abv = BVHTree.FromPolygons([(SA[i * 3], SA[i * 3 + 1], SA[i * 3 + 2]) for i in range(nA)], [(t * 3, t * 3 + 1, t * 3 + 2) for t in range(nA // 3)]) if nA else None
    out = array.array('f', SA); drop = 0
    def over(x, y, z):
        h = abv.ray_cast(Vector((x, y, z + 3.0)), Vector((0, 0, -1)), 6.0)
        return h[0] is not None and abs(h[0].z - z) < 1.0
    for t in range(len(SC) // 9):
        a = t * 9; V = [(SC[a + k * 3], SC[a + k * 3 + 1], SC[a + k * 3 + 2]) for k in range(3)]
        if abv is not None:
            cx, cy, cz = [(V[0][k] + V[1][k] + V[2][k]) / 3 for k in range(3)]
            # the corners pulled a little toward the centre: a corner ON the
            # asphalt's edge must not count as off it
            if over(cx, cy, cz) and all(over(v[0] + (cx - v[0]) * 0.05, v[1] + (cy - v[1]) * 0.05, v[2]) for v in V):
                drop += 1; continue
        out.extend(SC[a:a + 9])
    log(f'street casing under the asphalt: {drop} of {len(SC) // 9} triangles dropped')
    return out, abv

def kerb_edge(bvh, a, b, outv):
    """a street's boundary edge is a kerb only if there is no ASPHALT on its
    outer side too (bvh: merge_street_layers' asphalt). The asphalt's own edge,
    with only the casing beyond it, stays a kerb; an edge inside the asphalt
    — overlapping lot and aisle polygons, a dropped casing's hole — does not"""
    if bvh is None: return True
    m = (a + b) / 2
    for d_ in (0.8, 2.0):
        p = m + outv * d_
        h = bvh.ray_cast(Vector((p.x, p.y, m.z + 4.0)), Vector((0, 0, -1)), 8.0)
        if h[0] is not None and abs(h[0].z - m.z) < 1.2: return False
    return True

def keep_on_streets(MP, bvh):
    """street paint whose triangle no longer lies on a street (its street was
    a footpath, dropped above) is dropped with it"""
    out = array.array('f')
    for t in range(len(MP) // 9):
        a = t * 9; cx = (MP[a] + MP[a + 3] + MP[a + 6]) / 3; cy = (MP[a + 1] + MP[a + 4] + MP[a + 7]) / 3; cz = (MP[a + 2] + MP[a + 5] + MP[a + 8]) / 3
        if bvh.ray_cast(Vector((cx, cy, cz + 3.0)), Vector((0, 0, -1)), 6.0)[0] is not None: out.extend(MP[a:a + 9])
    return out

def carfree_at(x, y, box=None):
    """a parked car here would stand on a road closed to cars: the nearest
    road is a closed one"""
    kr, nr = _ways_kd('free', box)
    if not nr: return False
    dr = kr.find((x, y, 0.0))[2]
    if dr > 8.0: return False
    kc, nc = _ways_kd('car', box)
    return not nc or dr < kc.find((x, y, 0.0))[2]

def _dp(L, tol):
    """Douglas-Peucker: the polyline with every vertex closer than tol to the
    chord dropped (OSM's garden paths come in 1 m stair-steps)"""
    if len(L) < 3: return L
    (ax, ay), (bx, by) = L[0], L[-1]; dx, dy = bx - ax, by - ay; n = math.hypot(dx, dy) or 1e-9
    k, dm = 0, -1.0
    for i in range(1, len(L) - 1):
        d_ = abs((L[i][0] - ax) * dy - (L[i][1] - ay) * dx) / n
        if d_ > dm: k, dm = i, d_
    if dm <= tol: return [L[0], L[-1]]
    return _dp(L[:k + 1], tol)[:-1] + _dp(L[k:], tol)

def _chaikin(L, it=2, cmax=3.0):
    """corner cutting, a cut of at most cmax m: no right-angle corner survives"""
    for _ in range(it):
        if len(L) < 3: return L
        out = [L[0]]
        for i in range(len(L) - 1):
            (x0, y0), (x1, y1) = L[i], L[i + 1]; d = math.hypot(x1 - x0, y1 - y0) or 1e-9; f = min(0.25, cmax / d)
            if i > 0: out.append((x0 + (x1 - x0) * f, y0 + (y1 - y0) * f))
            if i < len(L) - 2: out.append((x1 - (x1 - x0) * f, y1 - (y1 - y0) * f))
        out.append(L[-1]); L = out
    return L

PATH_COL = {'concrete': (0.42, 0.41, 0.38), 'dirt': (0.27, 0.215, 0.145), 'asphalt': (0.24, 0.24, 0.24), 'wood': (0.36, 0.29, 0.21)}
def park_paths(box, ground_fn, lift=0.06):
    """every footpath, stairway and trail in box as a ribbon of its width on
    the ground: (positions, vertex colours) as flat arrays, or None"""
    _ways_kd('foot', box); W_ = _WAYS.get('data')
    if not W_: return None
    # a footway that crosses a street stays under the asphalt, not on it
    st_ = bpy.data.objects.get('streets')
    bv_ = BVHTree.FromObject(st_, bpy.context.evaluated_depsgraph_get()) if st_ is not None and st_.type == 'MESH' else None
    P = array.array('f'); C = array.array('f'); n_ = 0
    for rec in W_['foot']:
        pts, w, sf = rec[0], rec[1], rec[2]; hw = rec[3] if len(rec) > 3 else ''
        if hw == 'steps': continue                  # a flight of stairs: short, and drawn as a zigzag
        xs, ys = pts[0::2], pts[1::2]
        if box and (max(xs) < box[0] or min(xs) > box[2] or max(ys) < box[1] or min(ys) > box[3]): continue
        # simplified, the stair-steps gone, the corners rounded; a stub under 8 m dropped
        Lw = _chaikin(_dp(list(zip(xs, ys)), 1.2), it=3, cmax=7.0)     # a garden's right-angle corner becomes a curve
        if sum(math.hypot(Lw[i + 1][0] - Lw[i][0], Lw[i + 1][1] - Lw[i][1]) for i in range(len(Lw) - 1)) < 8.0: continue
        xs, ys = [p[0] for p in Lw], [p[1] for p in Lw]
        if sf == 'unknown':
            # no surface in the record: a trail of bare earth out on the hills,
            # concrete in a park or among the houses
            mx_, my_ = xs[len(xs) // 2], ys[len(ys) // 2]; wild_ = True
            if _GM:
                i_, j_ = int((mx_ - _GM['x0']) / _GM['res']), int((my_ - _GM['y0']) / _GM['res'])
                if 0 <= j_ < _GM['park'].shape[0] and 0 <= i_ < _GM['park'].shape[1]:
                    hl_ = _GM['hilly'][min(_GM['hilly'].shape[0] - 1, int((my_ - _GM['y0']) / _GM['st'])), min(_GM['hilly'].shape[1] - 1, int((mx_ - _GM['x0']) / _GM['st']))]
                    wild_ = _GM['yard'][j_, i_] < 0.5 and (_GM['park'][j_, i_] < 0.5 or hl_ > 11.0)
            sf = 'dirt' if wild_ else 'concrete'
            if sf == 'dirt': w = min(w, 1.4)
        col = PATH_COL.get(sf, PATH_COL['concrete']); h = w / 2
        # densified every 2.5 m so the ribbon follows the ground
        L = [(xs[0], ys[0])]
        for i in range(1, len(xs)):
            x0, y0 = L[-1]; x1, y1 = xs[i], ys[i]; n = max(1, int(math.hypot(x1 - x0, y1 - y0) / 2.5))
            L.extend((x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n) for k in range(1, n + 1))
        for i in range(len(L) - 1):
            (x0, y0), (x1, y1) = L[i], L[i + 1]
            dx, dy = x1 - x0, y1 - y0; d = math.hypot(dx, dy)
            if d < 1e-3: continue
            nx, ny = -dy / d * h, dx / d * h
            z0, z1 = ground_fn(x0, y0), ground_fn(x1, y1)
            if z0 is None or z1 is None: continue
            if bv_ is not None and bv_.ray_cast(Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2 + 3.0)), Vector((0, 0, -1)), 3.5)[0] is not None: continue
            q = [(x0 + nx, y0 + ny, z0 + lift), (x0 - nx, y0 - ny, z0 + lift), (x1 - nx, y1 - ny, z1 + lift), (x1 + nx, y1 + ny, z1 + lift)]
            for tri in ((0, 1, 2), (0, 2, 3)):
                for k in tri: P.extend(q[k]); C.extend(col)
            n_ += 1
    if not n_: return None
    log(f'park paths: {n_} ribbon quads')
    return P, C

def path_mat():
    """a footpath seen from above: its own surface colour (vertex 'Col'),
    worn lighter along the middle, grit, a little dirt at the edges"""
    b = NB('parkpath'); at = b.n('ShaderNodeAttribute', attribute_name='Col')
    c = b.mix(1.0, at.outputs['Color'], b.math('ADD', 0.86, b.math('MULTIPLY', b.noise(1 / 0.5, 3.0), 0.28)), 'MULTIPLY')
    c = b.mix(b.ramp(b.noise(1 / 6.0, 3.0), 0.0, 0.3, 0.55, 0.75), c, b.mix(1.0, c, (0.72, 0.70, 0.66), 'MULTIPLY'))
    b.put(b.pr.inputs['Base Color'], c); b.pr.inputs['Roughness'].default_value = 0.9
    b.pr.inputs['Specular IOR Level'].default_value = 0.3
    return b.m
M['parkpath'] = path_mat()

# ── terrain ──────────────────────────────────────────────────────────────────
log('terrain')
def park_lawn(m):
    """the district's lawns, close up: mowing stripes a mower's width apart,
    the grain of the blades, worn and dry patches, clover. (Here only: the
    city-wide frame keeps the plain lawn — stripes would alias at its scale.)"""
    nt = m.node_tree; pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    src_ = pr.inputs['Base Color'].links[0].from_socket
    b = NB.__new__(NB); b.m = m; b.nt = nt; b.pr = pr; b.pos = nt.nodes.new('ShaderNodeNewGeometry').outputs['Position']
    sp = b.n('ShaderNodeSeparateXYZ'); b.put(sp.inputs[0], b.pos)
    u = b.math('ADD', b.math('MULTIPLY', sp.outputs[0], math.cos(0.45)), b.math('MULTIPLY', sp.outputs[1], math.sin(0.45)))
    band = b.ramp(b.math('SINE', b.math('MULTIPLY', u, math.pi / 0.95)), 0.0, 1.0, -0.25, 0.25)
    blades = b.noise(28.0, 2.0)
    val = b.math('MULTIPLY', b.math('ADD', 0.90, b.math('MULTIPLY', band, 0.16)), b.math('ADD', 0.93, b.math('MULTIPLY', blades, 0.14)))
    hs = b.n('ShaderNodeHueSaturation'); b.put(hs.inputs['Color'], src_); b.put(hs.inputs['Value'], val)
    b.put(hs.inputs['Hue'], b.math('ADD', 0.497, b.math('MULTIPLY', band, -0.010))); hs.inputs['Saturation'].default_value = 1.12
    c = hs.outputs[0]
    clover = b.ramp(b.noise(0.7, 3.0), 0.0, 0.3, 0.58, 0.68)
    c = b.mix(clover, c, (0.55, 0.62, 0.50), 'MULTIPLY')
    worn = b.ramp(b.noise(0.22, 4.0), 0.0, 0.55, 0.64, 0.74)
    c = b.mix(worn, c, (0.20, 0.155, 0.075))
    nt.links.new(c, pr.inputs['Base Color'])
park_lawn(M['lawn'])
TP = array.array('f')
for m in d['meshes']:
    if m['layer'] == 'terrain' and not m.get('instanced'): TP.extend(f32(m['pos']))
for i in range(2, len(TP), 3): TP[i] *= 0.5                     # the export's ground is at zex 2
M['ground'] = hill_ground(d, (bx0, by0, bx1, by1))           # golden hills, parks, yards (above)
terrain = mesh_from('terrain', TP, M['ground'], smooth=True, weld=0.05)
bvh_t = BVHTree.FromObject(terrain, bpy.context.evaluated_depsgraph_get())
def ground(x, y):
    hit = bvh_t.ray_cast(Vector((x, y, 2000)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] else 0.0

# ── streets, markings, sidewalks ─────────────────────────────────────────────
log('streets')
SP, MP, DP = array.array('f'), array.array('f'), array.array('f')
SA_ = array.array('f')
for m in d['meshes']:
    if m.get('instanced'): continue
    if m['layer'] == 'streets': (SA_ if (m.get('color') or [1])[0] < 0.2 else SP).extend(f32(m['pos']))
    if m['layer'] == 'street-markings':
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
        # the engine's overlays are not all ground: pier plates (opacity 0.2),
        # their drop shadows (0.35), the lakes (opaque blue) and their glaze
        # (0.42) all carry white vertex colours and were paved grey here —
        # the lakes come from landmarks_hq (water_hq.lakes); the green lawns
        # (0.46) are hill_ground's park map
        if m.get('opacity', 1) < 0.45 or (m.get('color') or [1])[0] < 0.3: continue
        c = f32(m['col'])
        if c and c[2] > 0.8: DP.extend(f32(m['pos']))          # the white pieces: paved paths
def lift(P, dz):
    for i in range(2, len(P), 3): P[i] += dz
    return P
SP, ABV = merge_street_layers(SP, SA_)
SP, _ = drop_footway_streets(SP, (bx0, by0, bx1, by1))
streets = mesh_from('streets', lift(SP, 0.02), M['asphalt'], weld=0.05)
if len(MP):
    # paint lies ON the asphalt: dropped onto the street surface below it
    sbv = BVHTree.FromObject(streets, bpy.context.evaluated_depsgraph_get())
    MP = keep_on_streets(MP, sbv)
    for i in range(0, len(MP), 3):
        h_ = sbv.ray_cast(Vector((MP[i], MP[i+1], MP[i+2] + 3)), Vector((0, 0, -1)))
        if h_[0] is not None: MP[i+2] = h_[0].z + 0.012
    if len(MP): mesh_from('markings', MP, M['paint'])
if len(DP):
    sb = BVHTree.FromObject(streets, bpy.context.evaluated_depsgraph_get())
    keep = array.array('f')
    for t in range(len(DP) // 9):
        cx_ = sum(DP[t*9+k*3] for k in range(3)) / 3; cy_ = sum(DP[t*9+k*3+1] for k in range(3)) / 3
        if sb.ray_cast(Vector((cx_, cy_, 2000)), Vector((0, 0, -1)))[0] is None: keep.extend(DP[t*9:t*9+9])
    if len(keep): mesh_from('paths', keep, M['path'])
_pp = park_paths((bx0, by0, bx1, by1), ground)
if _pp:
    _po = mesh_from('parkpaths', _pp[0], M['parkpath'])
    _ca = _po.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    _ca.data.foreach_set('color', [v for i in range(len(_pp[1]) // 3) for v in (_pp[1][i * 3], _pp[1][i * 3 + 1], _pp[1][i * 3 + 2], 1.0)])
if os.environ.get('BRUSH', '1') == '1': hill_brush(ground, (bx0, by0, bx1, by1))

def street_edges():
    bm = bmesh.new(); bm.from_mesh(streets.data); bm.edges.ensure_lookup_table()
    bv_ = ABV
    E_ = []
    for e in bm.edges:
        if len(e.link_faces) != 1: continue
        a, b = e.verts[0].co.copy(), e.verts[1].co.copy()
        inward = e.link_faces[0].calc_center_median() - (a + b) / 2; inward.z = 0
        v = b - a; outv = Vector((-v.y, v.x, 0)).normalized()
        if outv.dot(inward) > 0: outv = -outv
        if not kerb_edge(bv_, a, b, outv): continue
        E_.append((a, b, outv))
    bm.free(); return E_
SE = street_edges()
def sidewalk_uv_mat():
    """poured concrete sidewalks as San Francisco lays them: panels scored
    every 1.5 m square to the curb, each pour its own tone (a few replaced
    lighter), runoff grime along the curb, the curb itself sometimes painted"""
    b = NB('sidewalk_uv'); uvn = b.n('ShaderNodeUVMap', uv_map='UVMap'); sp = b.n('ShaderNodeSeparateXYZ'); b.put(sp.inputs[0], uvn.outputs[0])
    u, v = sp.outputs[0], sp.outputs[1]
    tex = b.img(PHT('concrete_floor_worn_001', 'diff'), b.vmap(1 / 3.0, vec=uvn.outputs[0]))
    c = b.mix(1.0, tex, (2.6, 2.5, 2.3), 'MULTIPLY')
    cu = b.math('FLOOR', b.math('DIVIDE', u, 1.5)); cv = b.math('FLOOR', b.math('DIVIDE', b.math('MAXIMUM', v, 0.0), 1.5))
    cid = b.n('ShaderNodeCombineXYZ'); b.put(cid.inputs[0], cu); b.put(cid.inputs[1], cv)
    wn = b.n('ShaderNodeTexWhiteNoise', noise_dimensions='3D'); b.put(wn.inputs['Vector'], cid.outputs[0])
    rnd = wn.outputs['Value']
    tone = b.math('ADD', 0.90, b.math('MULTIPLY', rnd, 0.16))
    tone = b.math('ADD', tone, b.math('MULTIPLY', b.math('GREATER_THAN', rnd, 0.93), 0.18))
    hs = b.n('ShaderNodeHueSaturation'); b.put(hs.inputs['Color'], c); b.put(hs.inputs['Value'], tone); c = hs.outputs[0]
    ju = b.math('MINIMUM', b.math('FRACT', b.math('DIVIDE', u, 1.5)), b.math('SUBTRACT', 1.0, b.math('FRACT', b.math('DIVIDE', u, 1.5))))
    jv = b.math('ABSOLUTE', b.math('SUBTRACT', v, 1.5))
    joint = b.math('MAXIMUM', b.math('LESS_THAN', ju, 0.006), b.math('LESS_THAN', jv, 0.008))
    joint = b.math('MULTIPLY', joint, b.math('GREATER_THAN', v, 0.0))
    runoff = b.math('MULTIPLY', b.ramp(v, 1.0, 0.0, 0.0, 0.7), 0.25)
    grime = b.math('ADD', runoff, b.math('MULTIPLY', b.ramp(b.noise(0.5, 4.0), 0.0, 1.0, 0.55, 0.75), 0.18))
    c = b.mix(grime, c, (0.45, 0.42, 0.38), 'MULTIPLY')
    c = b.mix(b.math('MULTIPLY', joint, 0.7), c, (0.05, 0.05, 0.05))
    at = b.n('ShaderNodeAttribute', attribute_name='scol')
    curb = b.math('MULTIPLY', at.outputs['Alpha'], b.math('LESS_THAN', v, 0.16))
    c = b.mix(b.math('MULTIPLY', curb, 0.85), c, at.outputs['Color'])
    b.put(b.pr.inputs['Base Color'], c); b.put(b.pr.inputs['Roughness'], 0.8)
    b.put(b.pr.inputs['Normal'], b.bump(b.math('SUBTRACT', 1.0, joint), 0.6, 0.01))
    return b.m

# sidewalks and curbs
Ps, Fs = [], []
for a, b, outv in SE:
    up = Vector((0, 0, 0.15))
    # the far edge of the pavement follows the ground, never floats over it
    fa, fb = a + outv * 3.0, b + outv * 3.0
    fa.z = max(ground(fa.x, fa.y) + 0.06, a.z + 0.15 - 0.6); fb.z = max(ground(fb.x, fb.y) + 0.06, b.z + 0.15 - 0.6)
    k = len(Ps); Ps += [a + up, b + up, fb, fa]; Fs.append((k, k+1, k+2, k+3))
    k = len(Ps); Ps += [a, b, b + up, a + up]; Fs.append((k, k+1, k+2, k+3))
me = bpy.data.meshes.new('sidewalks'); me.from_pydata([tuple(p) for p in Ps], [], Fs)
# the pavement in its own frame: u along the curb, v across it (m), so the
# scored joints run square to the street; a painted curb here and there
_r = random.Random(17); _uv = me.uv_layers.new(name='UVMap'); _sc = me.color_attributes.new('scol', 'FLOAT_COLOR', 'FACE')
_cc = []
for i, (a, b, outv) in enumerate(SE):
    L_ = (b - a).length; s0 = _r.uniform(0, 1.5)
    for j, (u_, v_) in enumerate(((s0, 0.0), (s0 + L_, 0.0), (s0 + L_, 3.0), (s0, 3.0))): _uv.data[i * 8 + j].uv = (u_, v_)
    for j, (u_, v_) in enumerate(((s0, -0.16), (s0 + L_, -0.16), (s0 + L_, 0.0), (s0, 0.0))): _uv.data[i * 8 + 4 + j].uv = (u_, v_)
    # (painted curbs: the street edges come in arbitrary pieces, so a painted
    # run could not be kept to the few metres by a corner — left unpainted)
    col = (1, 1, 1, 0.0)
    _cc += [*col, *col]
_sc.data.foreach_set('color', _cc)
me.update()
ob = bpy.data.objects.new('sidewalks', me); sc.collection.objects.link(ob); me.materials.append(sidewalk_uv_mat())

# ── buildings ────────────────────────────────────────────────────────────────
log('buildings: reading records')
HG = city_data.hero_gids()
# footprints a hand-modelled landmark replaces (landmarks agent's skip list)
_sk = [q for q in (os.path.join(os.path.dirname(os.path.abspath(__file__)), 'skip_gids.json'), '/Users/daniel/code/qipu-render-work/landmarks/skip_gids.json') if os.path.exists(q)]
if _sk: HG |= {int(g) for v in json.load(open(_sk[0]))['by_landmark'].values() for g in v}
ERA = int(E('ERA')) if E('ERA') else None
G.ERA = ERA
G.LOD = int(E('LOD', 0))
# the city as it stood: a building shows from its recorded year (a record with
# no year is taken as standing; what was demolished before today is not in
# the record at all, so an old checkpoint is today's survivors, not all it had)
recs = [b for b in city_data.buildings(bx0, by0, bx1, by1) if b['gid'] not in HG and (ERA is None or (b['year'] or 0) <= ERA)]
# the landmarks themselves: the engine's own hand-built forms, in their colours
_HP, _HC = array.array('f'), array.array('f')
for m in d['meshes']:
    if m['layer'] == 'heroes' and not m.get('instanced'): _HP.extend(f32(m['pos'])); _HC.extend(f32(m['col']))
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
for m in FAR_MESHES:
    if m['layer'] != 'buildings' or m.get('instanced') or not m.get('cen'): continue
    p, c, e = f32(m['pos']), f32(m['col']), f32(m['cen'])
    for t in range(len(p) // 9):
        if in_box(e[t*6], e[t*6+1], 4): continue
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
kd = KDTree(len(recs)); [kd.insert((b['cx'], b['cy'], 0), i) for i, b in enumerate(recs)]; kd.balance()
park_pts, street_pts = [], []
seen = set(); rnd = random.Random(3)
for t in d['trees']:
    for (x, y, z, sxz, sy, rot, r_, g_, b_) in t['inst']:
        k = (round(x), round(y))
        if k in seen or not in_box(x, y, 40): continue
        seen.add(k)
        zz = ground(x, y)
        crown = max(3.0, 2.4 * sxz)
        far = kd.find((x, y, 0))[2] > 28 if len(recs) else True
        if ERA is not None and not far:
            keep_p = 0.12 if ERA < 1945 else 0.22 if ERA < 1965 else 0.45 if ERA < 1985 else 1.0
            if rnd.random() > keep_p: continue
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
    lk(gi.outputs[0], dist.inputs['Mesh']); dist.inputs['Density'].default_value = float(E('GRASS_DENSITY', 14.0))
    j = n.new('GeometryNodeJoinGeometry')
    for o in sc.objects:
        if o.type == 'MESH' and o.name != 'terrain':
            oi = n.new('GeometryNodeObjectInfo'); oi.inputs['Object'].default_value = o; oi.transform_space = 'RELATIVE'; lk(oi.outputs['Geometry'], j.inputs[0])
    rc = n.new('GeometryNodeRaycast'); lk(j.outputs[0], rc.inputs['Target Geometry']); rc.inputs['Ray Direction'].default_value = (0, 0, 1); rc.inputs['Ray Length'].default_value = 400
    pz = n.new('GeometryNodeInputPosition'); pzs = n.new('ShaderNodeSeparateXYZ'); lk(pz.outputs[0], pzs.inputs[0])
    wet = n.new('FunctionNodeCompare'); wet.data_type = 'FLOAT'; wet.operation = 'LESS_THAN'; lk(pzs.outputs[2], wet.inputs[0]); wet.inputs[1].default_value = 1.0
    orr = n.new('FunctionNodeBooleanMath'); orr.operation = 'OR'; lk(rc.outputs['Is Hit'], orr.inputs[0]); lk(wet.outputs[0], orr.inputs[1])
    # only over the modelled box (and a margin): beyond it nobody sees a blade
    for axis, lim, op in ((0, bx0 - 30, 'LESS_THAN'), (0, bx1 + 30, 'GREATER_THAN'), (1, by0 - 30, 'LESS_THAN'), (1, by1 + 30, 'GREATER_THAN')):
        cmp_ = n.new('FunctionNodeCompare'); cmp_.data_type = 'FLOAT'; cmp_.operation = op; lk(pzs.outputs[axis], cmp_.inputs[0]); cmp_.inputs[1].default_value = lim
        o2 = n.new('FunctionNodeBooleanMath'); o2.operation = 'OR'; lk(orr.outputs[0], o2.inputs[0]); lk(cmp_.outputs[0], o2.inputs[1]); orr = o2
    dl = n.new('GeometryNodeDeleteGeometry'); dl.domain = 'POINT'; lk(dist.outputs['Points'], dl.inputs['Geometry']); lk(orr.outputs[0], dl.inputs['Selection'])
    ci = n.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = GR[0]
    ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = False
    rv = n.new('FunctionNodeRandomValue'); rv.data_type = 'INT'
    live = [s for s in rv.inputs if s.name in ('Min', 'Max') and s.type == 'INT']; live[0].default_value = 0; live[1].default_value = max(0, len(GR[0].objects) - 1)
    rz = n.new('FunctionNodeRandomValue'); rz.data_type = 'FLOAT'
    live = [s for s in rz.inputs if s.name in ('Min', 'Max') and s.type == 'VALUE']; live[0].default_value = 0; live[1].default_value = 6.283
    rot = n.new('ShaderNodeCombineXYZ'); lk([o for o in rz.outputs if o.type == 'VALUE'][0], rot.inputs[2])
    scl = n.new('FunctionNodeRandomValue'); scl.data_type = 'FLOAT'; scl.inputs['Seed'].default_value = 4
    # a kept lawn: small clumps, mown flat (the scan is a meadow tuft)
    live = [s for s in scl.inputs if s.name in ('Min', 'Max') and s.type == 'VALUE']; live[0].default_value = float(E('GRASS_S0', 0.35)); live[1].default_value = float(E('GRASS_S1', 0.6))
    sxyz = n.new('ShaderNodeCombineXYZ'); _sv = [o for o in scl.outputs if o.type == 'VALUE'][0]
    lk(_sv, sxyz.inputs[0]); lk(_sv, sxyz.inputs[1]); _mz = n.new('ShaderNodeMath'); _mz.operation = 'MULTIPLY'; _mz.inputs[1].default_value = 0.55
    lk(_sv, _mz.inputs[0]); lk(_mz.outputs[0], sxyz.inputs[2])
    for m_ in bpy.data.materials:
        if m_.name.startswith('grass_medium_01') and m_.node_tree:
            pr_ = next((n for n in m_.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if pr_ and pr_.inputs['Base Color'].links:
                s_ = pr_.inputs['Base Color'].links[0].from_socket
                hs_ = m_.node_tree.nodes.new('ShaderNodeHueSaturation'); hs_.inputs['Value'].default_value = 1.5; hs_.inputs['Saturation'].default_value = 1.1
                m_.node_tree.links.new(s_, hs_.inputs['Color']); m_.node_tree.links.new(hs_.outputs['Color'], pr_.inputs['Base Color'])
    ii = n.new('GeometryNodeInstanceOnPoints'); lk(dl.outputs[0], ii.inputs['Points']); lk(ci.outputs[0], ii.inputs['Instance'])
    ii.inputs['Pick Instance'].default_value = True; lk([o for o in rv.outputs if o.type == 'INT'][0], ii.inputs['Instance Index'])
    lk(rot.outputs[0], ii.inputs['Rotation']); lk(sxyz.outputs[0], ii.inputs['Scale'])
    jj = n.new('GeometryNodeJoinGeometry'); lk(gi.outputs[0], jj.inputs[0]); lk(ii.outputs[0], jj.inputs[0]); lk(jj.outputs[0], go.inputs[0])
    terrain.modifiers.new('grass', 'NODES').node_group = ng

# ── props: street lamps, hydrants, parked cars ───────────────────────────────
if E('PROPS', '1') == '1':
    log('props')
    LAMP = load_collection('street_lamp_01'); HYD = load_collection('fire_hydrant')
    for c, _ in (LAMP, HYD):
        if c.name in sc.collection.children: sc.collection.children.unlink(c)
    root = bpy.data.collections.new('props'); sc.collection.children.link(root)
    acc = 0.0; k = 0
    for a, b, outv in SE:
        L_ = (b - a).length; acc += L_
        if acc < 32 or L_ < 4: continue
        acc = 0.0; p = (a + b) / 2 + outv * 0.5; p.z = a.z + 0.15
        if not in_box(p.x, p.y): continue
        s = 5.2 / max(1.0, LAMP[1][2])
        o = bpy.data.objects.new(f'lamp{k}', None); o.instance_type = 'COLLECTION'; o.instance_collection = LAMP[0]
        o.location = p; o.scale = (s, s, s); o.rotation_euler.z = math.atan2(-outv.x, outv.y); root.objects.link(o); k += 1
        if k % 3 == 0:
            q = p + (b - a).normalized() * 3.0
            s2 = 0.8 / max(0.2, HYD[1][2])
            o = bpy.data.objects.new(f'hyd{k}', None); o.instance_type = 'COLLECTION'; o.instance_collection = HYD[0]
            o.location = q; o.scale = (s2, s2, s2); root.objects.link(o)
    log('lamps', k)

if E('CARS', '1') == '1' and not (ERA is not None and ERA < 1908):
    log('cars')
    def car_mesh(name, L, Wd, prof):
        """a car lofted from cross-sections along its length. `prof`: the side
        silhouette 'sil' (x -1 rear .. 1 front, top z in metres), the belt
        line, the cabin's x range, wheel radius and overhangs. The plan is
        rounded at the ends, the wheels sit in arches, the glass is dark and
        the lamps are lamps. Materials: 0 paint · 1 glass · 2 tyre ·
        3 headlamp · 4 black trim · 5 tail lamp · 6 rim"""
        sil, belt, cab = prof['sil'], prof['belt'], prof['cab']
        wr, fo, ro = prof.get('wr', 0.33), prof.get('fo', 0.9), prof.get('ro', 1.0)
        hl = L / 2
        xw = (hl - fo, -(hl - ro))                                  # axle positions, metres
        def top(xn):
            for (x0, z0), (x1, z1) in zip(sil, sil[1:]):
                if x0 <= xn <= x1: return z0 + (z1 - z0) * ((xn - x0) / max(1e-6, x1 - x0))
            return sil[0][1] if xn < sil[0][0] else sil[-1][1]
        xb_ = (cab[0] + cab[1]) / 2 + 0.06                          # the B pillar
        st = set(round(i / 16 - 1, 4) for i in range(33)) | set(p[0] for p in sil)
        for X in xw:
            for k in range(-6, 7): st.add(round((X + k * 0.075) / hl, 4))
        st |= {round(xb_ - 0.035, 4), round(xb_ + 0.035, 4)}
        st = sorted(x for x in st if -1 <= x <= 1)
        secs = []
        for xn in st:
            X = xn * hl; t = abs(xn)
            zb = 0.24 + 0.12 * max(0.0, (t - 0.86) / 0.14) ** 2
            for Xw in xw:
                ra = wr + 0.07
                if abs(X - Xw) < ra: zb = max(zb, wr + 0.02 + math.sqrt(ra * ra - (X - Xw) ** 2) * 0.93)
            w = Wd / 2 * (1 - 0.075 * max(0.0, (t - 0.70) / 0.30) ** 2)
            zt = top(xn); zbl = min(belt, zt); h = max(0.0, zt - zbl); g = min(1.0, h / 0.3)
            zbl = max(zbl, zb + 0.2)
            half = [(0.0, zb), (0.86, zb), (0.975, min(zb + 0.14, zbl - 0.14)), (1.0, zbl - 0.14), (0.98, zbl),
                    (0.935 - 0.05 * g, zbl + 0.03 + 0.02 * g), (0.915 - 0.15 * g, zbl + 0.035 + h * 0.88),
                    (0.85 - 0.19 * g, zbl + 0.04 + h * 0.975), (0.0, zbl + 0.06 + h)]
            secs.append((xn, X, w, zbl, g, cab[0] - 1e-3 <= xn <= cab[1] + 1e-3, half))
        bm = bmesh.new()
        ring = []
        for xn, X, w, zbl, g, inc, half in secs:
            pts = [(X, -w * f, z) for f, z in half] + [(X, w * f, z) for f, z in half[-2:0:-1]]
            ring.append([bm.verts.new(p) for p in pts])
        nh = len(secs[0][6]); npt = len(ring[0])
        def hidx(j): return j if j < nh else npt - j                # ring index -> half-section index
        faces = []
        for i in range(len(secs) - 1):
            A, B = ring[i], ring[i + 1]; sa, sb = secs[i], secs[i + 1]
            slope = abs((sb[6][-1][1] - sa[6][-1][1]) / max(1e-6, sb[1] - sa[1]))
            for j in range(npt):
                jn = (j + 1) % npt
                f = bm.faces.new((A[j], B[j], B[jn], A[jn]))
                sg = min(hidx(j), hidx(jn))
                cabin = sa[5] and sb[5]
                if sg == 0: mi = 4
                elif sg == 1 and prof.get('clad'): mi = 4
                elif sg == 5 and cabin and min(sa[4], sb[4]) > 0.35:
                    mi = 4 if (sa[0] >= xb_ - 0.036 and sb[0] <= xb_ + 0.036) else 1
                elif sg in (6, 7) and cabin and slope > 0.33: mi = 1
                elif sg == 7 and cabin and prof.get('glassroof'): mi = 1
                else: mi = 0
                f.material_index = mi
        for idx, rev in ((0, True), (len(secs) - 1, False)):       # the end caps: body below the belt, glass above
            R = ring[idx]; g = secs[idx][4]
            lo = [R[j] for j in range(0, 5)] + [R[npt - j] for j in range(4, 0, -1)]
            up = [R[j] for j in range(4, nh)] + [R[npt - j] for j in range(nh - 2, 3, -1)]
            for poly, mi in ((lo, 0), (up, 1 if g > 0.35 else 0)):
                f = bm.faces.new(poly[::-1] if rev else poly); f.material_index = mi
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        # lamps, grille, mirrors, wheels
        def quad(p0, p1, p2, p3, mi):
            f = bm.faces.new([bm.verts.new(p) for p in (p0, p1, p2, p3)]); f.material_index = mi
        xf, wf, zf = secs[-1][1], secs[-1][2], secs[-1][3]
        xr, wrr, zr = secs[0][1], secs[0][2], secs[0][3]
        for s_ in (-1, 1):
            quad((xf + 0.012, s_ * wf * 0.55, zf - 0.17), (xf + 0.012, s_ * wf * 0.93, zf - 0.17), (xf + 0.012, s_ * wf * 0.93, zf - 0.05), (xf + 0.012, s_ * wf * 0.55, zf - 0.05), 3)
            quad((xr - 0.012, s_ * wrr * 0.62, zr - 0.16), (xr - 0.012, s_ * wrr * 0.95, zr - 0.16), (xr - 0.012, s_ * wrr * 0.95, zr - 0.03), (xr - 0.012, s_ * wrr * 0.62, zr - 0.03), 5)
        quad((xf + 0.01, -wf * 0.45, zf - 0.40), (xf + 0.01, wf * 0.45, zf - 0.40), (xf + 0.01, wf * 0.45, zf - 0.20), (xf + 0.01, -wf * 0.45, zf - 0.20), 4)
        xa = cab[1] * hl - 0.18
        for s_ in (-1, 1):
            r_ = bmesh.ops.create_cube(bm, size=1.0)
            for v in r_['verts']: v.co = Vector((xa + v.co.x * 0.08, s_ * (Wd / 2 + 0.035) + v.co.y * 0.10, belt + 0.07 + v.co.z * 0.085))
        for Xw in xw:
            for s_ in (-1, 1):
                yc = s_ * (Wd / 2 - 0.13)
                r_ = bmesh.ops.create_cone(bm, cap_ends=True, segments=18, radius1=wr, radius2=wr, depth=0.21)
                for v in r_['verts']:
                    y_ = v.co.z; v.co.z = v.co.y; v.co.y = y_
                    v.co += Vector((Xw, yc, wr))
                wf_ = list({f for v in r_['verts'] for f in v.link_faces})
                for f in wf_: f.material_index = 2
                bmesh.ops.recalc_face_normals(bm, faces=wf_)
                c_ = bmesh.ops.create_circle(bm, cap_ends=True, segments=14, radius=wr * 0.62)
                for v in c_['verts']:
                    y_ = v.co.z; v.co.z = v.co.y; v.co.y = y_
                    v.co += Vector((Xw, yc + s_ * 0.108, wr))
                for f in {f for v in c_['verts'] for f in v.link_faces}: f.material_index = 6
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for f in me.polygons:
            c = f.center
            if f.material_index == 6 and (f.normal.y > 0) != (c.y > 0): f.flip()
        me.shade_smooth()
        try: me.set_sharp_from_angle(angle=math.radians(40))
        except Exception: pass
        return me
    # x in -1..1 (rear..front), top z in metres
    SEDAN = dict(sil=[(-1, 0.80), (-0.97, 0.93), (-0.82, 0.99), (-0.56, 1.02), (-0.32, 1.37), (-0.20, 1.43), (0.10, 1.44), (0.21, 1.40), (0.43, 1.00), (0.80, 0.92), (0.97, 0.80), (1, 0.70)],
                 belt=1.0, cab=(-0.57, 0.44), fo=0.95, ro=1.05)
    FASTBACK = dict(sil=[(-1, 0.84), (-0.96, 0.97), (-0.78, 1.02), (-0.58, 1.12), (-0.25, 1.40), (0.08, 1.43), (0.20, 1.38), (0.44, 0.98), (0.82, 0.90), (0.97, 0.78), (1, 0.68)],
                    belt=0.99, cab=(-0.78, 0.45), fo=0.92, ro=1.0, glassroof=True)
    HATCH = dict(sil=[(-1, 0.96), (-0.985, 1.12), (-0.93, 1.40), (-0.80, 1.47), (0.10, 1.48), (0.20, 1.44), (0.46, 1.00), (0.80, 0.92), (0.97, 0.80), (1, 0.70)],
                 belt=1.0, cab=(-0.99, 0.47), fo=0.85, ro=0.72)
    SUV = dict(sil=[(-1, 1.12), (-0.985, 1.30), (-0.95, 1.60), (-0.86, 1.69), (0.15, 1.70), (0.27, 1.63), (0.50, 1.13), (0.85, 1.06), (0.98, 0.93), (1, 0.82)],
               belt=1.12, cab=(-0.99, 0.51), wr=0.37, fo=0.95, ro=0.95, clad=True)
    MINIVAN = dict(sil=[(-1, 1.08), (-0.985, 1.20), (-0.95, 1.66), (-0.85, 1.76), (0.26, 1.77), (0.37, 1.66), (0.62, 1.12), (0.88, 1.02), (0.98, 0.90), (1, 0.78)],
                   belt=1.12, cab=(-0.99, 0.63), wr=0.35, fo=0.95, ro=1.0)
    SMALL = dict(sil=[(-1, 0.92), (-0.985, 1.06), (-0.92, 1.38), (-0.80, 1.47), (0.05, 1.49), (0.18, 1.44), (0.42, 1.00), (0.80, 0.93), (0.97, 0.82), (1, 0.72)],
                 belt=0.98, cab=(-0.98, 0.44), wr=0.30, fo=0.62, ro=0.55)
    # paint by the colour shares of cars on the road (white, black, greys and
    # silver most; then blue, red; a few greens, browns and brights) — a
    # convention, per car, never data
    paint = simple('carpaint', (0.5, 0.5, 0.5), rough=0.25, attr=False)
    pn = paint.node_tree; pb = pn.nodes['Principled BSDF']; ai = pn.nodes.new('ShaderNodeObjectInfo')
    CC = [(0.24, (0.87, 0.87, 0.86), 0.0), (0.04, (0.80, 0.78, 0.72), 0.3), (0.20, (0.018, 0.018, 0.022), 0.0),
          (0.10, (0.13, 0.135, 0.145), 0.7), (0.08, (0.34, 0.35, 0.37), 0.8), (0.11, (0.64, 0.65, 0.66), 0.9),
          (0.06, (0.03, 0.07, 0.19), 0.6), (0.03, (0.12, 0.26, 0.50), 0.6), (0.06, (0.50, 0.035, 0.035), 0.3),
          (0.02, (0.22, 0.02, 0.035), 0.5), (0.02, (0.05, 0.14, 0.08), 0.5), (0.02, (0.44, 0.36, 0.26), 0.6),
          (0.01, (0.88, 0.48, 0.06), 0.2)]
    if ERA is not None and ERA < 1960:
        CC = [(0.35, (0.02, 0.02, 0.02), 0.0), (0.10, (0.08, 0.10, 0.08), 0.0), (0.10, (0.12, 0.10, 0.08), 0.0), (0.15, (0.30, 0.30, 0.28), 0.0),
              (0.10, (0.05, 0.06, 0.10), 0.0), (0.10, (0.22, 0.18, 0.12), 0.0), (0.10, (0.55, 0.52, 0.45), 0.0)]
    ramp = pn.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    rmet = pn.nodes.new('ShaderNodeValToRGB'); rmet.color_ramp.interpolation = 'CONSTANT'
    acc_ = 0.0; tot_ = sum(c[0] for c in CC)
    for i, (sh_, col_, met_) in enumerate(CC):
        for rp, v in ((ramp, (*[c ** 2.2 for c in col_], 1)), (rmet, (met_, met_, met_, 1))):
            e_ = rp.color_ramp.elements[0] if i == 0 else rp.color_ramp.elements.new(acc_ / tot_)
            if i == 0: e_.position = 0.0
            e_.color = v
        acc_ += sh_
    for rp in (ramp, rmet):
        while len(rp.color_ramp.elements) > len(CC): rp.color_ramp.elements.remove(rp.color_ramp.elements[-1])
        pn.links.new(ai.outputs['Random'], rp.inputs[0])
    pn.links.new(ramp.outputs[0], pb.inputs['Base Color'])
    pn.links.new(rmet.outputs[0], pb.inputs['Metallic'])
    pb.inputs['Coat Weight'].default_value = 1.0; pb.inputs['Coat Roughness'].default_value = 0.03
    cglass = simple('carglass', (0.012, 0.014, 0.018), rough=0.04, spec=0.5)
    tyre = simple('tyre', (0.025, 0.025, 0.025), rough=0.85)
    lamp_m = simple('carlamp', (0.85, 0.85, 0.82), rough=0.08, spec=1.0)
    trim_m = simple('cartrim', (0.03, 0.03, 0.032), rough=0.6)
    tail_m = simple('taillamp', (0.55, 0.02, 0.02), rough=0.15, spec=0.8)
    rim_m = simple('rim', (0.55, 0.56, 0.58), rough=0.3, metal=1.0)
    CARS = []
    for i, (L_, W_, pf) in enumerate(((4.75, 1.83, SEDAN), (4.6, 1.86, SUV), (4.28, 1.79, HATCH), (5.1, 1.99, MINIVAN),
                                      (4.7, 1.85, FASTBACK), (4.5, 1.84, SUV), (3.7, 1.72, SMALL), (4.85, 1.85, SEDAN))):
        me = car_mesh(f'car{i}', L_, W_, pf)
        for mm in (paint, cglass, tyre, lamp_m, trim_m, tail_m, rim_m): me.materials.append(mm)
        CARS.append(me)
    r = random.Random(21); k = 0
    for a, b, outv in SE:
        v = b - a; L_ = v.length
        if L_ < 7: continue
        ang = math.atan2(v.y, v.x)
        occ = 0.62 if (ERA is None or ERA >= 1970) else 0.10 if ERA < 1930 else 0.25 if ERA < 1950 else 0.45
        # parked with the traffic of their side (the curb on the car's right),
        # never quite in line: a few centimetres off the curb, a degree askew
        fwd_ = math.atan2(outv.x, -outv.y)
        for i in range(int((L_ - 3) // 6.2)):
            if r.random() > occ: continue
            p = a + v * ((1.5 + 3.1 + i * 6.2 + r.uniform(-0.5, 0.5)) / L_) - outv * r.uniform(1.08, 1.3)
            if not in_box(p.x, p.y) or carfree_at(p.x, p.y, (bx0, by0, bx1, by1)): continue
            o = bpy.data.objects.new(f'pcar{k}', CARS[r.randrange(len(CARS))]); sc.collection.objects.link(o)
            o.location = (p.x, p.y, p.z + 0.02); o.rotation_euler.z = fwd_ + math.radians(r.uniform(-1.5, 1.5)); k += 1
    log('cars', k)

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

# ── LANDMARKS, TERRAIN AND WATER DETAIL (landmarks_hq.py, owned by the
#    landmarks agent): called once the scene stands, before camera and light.
#    build(bpy, scene, mats, ground, box, scene_json, log, era) may add objects,
#    replace the engine's crude 'landmarks' mesh piece by piece, refine the
#    terrain, the shore and the water. Missing module = nothing happens.
if os.environ.get('LANDMARKS', '1') == '1':
    try:
        import landmarks_hq
    except ModuleNotFoundError:
        landmarks_hq = None
    if landmarks_hq is not None:
        landmarks_hq.build(bpy, sc, M, ground, (bx0, by0, bx1, by1), d, log, (int(E('ERA')) if E('ERA') else None))

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
