# blender -b -P build_render.py -- <scene_dir> <look: photo|model|hybrid> <out.png> [samples] [w] [h]
import bpy, json, base64, array, math, sys, os, time, random
from mathutils import Vector
import builtins as _b
_T0 = __import__('time').time()
def print(*a, **k):
    _b.print(f'[{__import__("time").time() - _T0:6.1f}s]', *a, flush=True, **k)
argv = sys.argv[sys.argv.index('--') + 1:]
SD, LOOK, OUT = argv[0], argv[1], argv[2]
SAMPLES = int(argv[3]) if len(argv) > 3 else 128
W = int(argv[4]) if len(argv) > 4 else 1600
H = int(argv[5]) if len(argv) > 5 else 1000
TERRAIN_ZEX = 2.0
VARIETY = os.environ.get('VARIETY', '1') == '1'
d = json.load(open(os.path.join(SD, 'scene.json')))
CAMF = d['camForward']
t0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def f32(b):
    a = array.array('f'); a.frombytes(base64.b64decode(b)); return a

# ── materials ───────────────────────────────────────────────────────────
def mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial'); return m, nt, o

def N(nt, t, **kw):
    n = nt.nodes.new(t)
    for k, v in kw.items():
        if k in n.inputs.keys() if hasattr(n.inputs, 'keys') else False: n.inputs[k].default_value = v
        else: setattr(n, k, v)
    return n

def L(nt, a, b): nt.links.new(a, b)

def math_node(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
    for i, v in enumerate([a, b]):
        if v is None: continue
        if isinstance(v, (int, float)): n.inputs[i].default_value = v
        else: L(nt, v, n.inputs[i])
    return n.outputs[0]

def vcol(nt):
    a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'; return a.outputs['Color']

def mix_rgb(nt, fac, a, b, blend='MIX'):
    n = nt.nodes.new('ShaderNodeMix'); n.data_type = 'RGBA'; n.blend_type = blend
    for sock, v in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
        if isinstance(v, (int, float)): sock.default_value = v
        elif isinstance(v, tuple): sock.default_value = v
        else: L(nt, v, sock)
    return n.outputs[2]

def principled(nt, base=None, rough=0.8, spec=0.5, metal=0.0, coat=0.0):
    p = nt.nodes.new('ShaderNodeBsdfPrincipled')
    if isinstance(base, tuple): p.inputs['Base Color'].default_value = base
    elif base is not None: L(nt, base, p.inputs['Base Color'])
    if isinstance(rough, (int, float)): p.inputs['Roughness'].default_value = rough
    else: L(nt, rough, p.inputs['Roughness'])
    p.inputs['Specular IOR Level'].default_value = spec
    p.inputs['Metallic'].default_value = metal
    p.inputs['Coat Weight'].default_value = coat
    return p

def facade_mat(name, look, curtain=False):
    """walls get a window grid in world space, roofs stay plain; one material, split by the normal"""
    m, nt, o = mat(name)
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L(nt, geo.outputs['Position'], sep.inputs[0])
    sn = nt.nodes.new('ShaderNodeSeparateXYZ'); L(nt, geo.outputs['True Normal'], sn.inputs[0])
    nz = math_node(nt, 'ABSOLUTE', sn.outputs[2])
    isroof = math_node(nt, 'GREATER_THAN', nz, 0.6)
    # horizontal coordinate along the wall: x*(-ny) + y*nx
    a1 = math_node(nt, 'MULTIPLY', sep.outputs[0], math_node(nt, 'MULTIPLY', sn.outputs[1], -1.0))
    a2 = math_node(nt, 'MULTIPLY', sep.outputs[1], sn.outputs[0])
    u = math_node(nt, 'ADD', a1, a2)
    bay, floor = (1.55, 3.9) if curtain else (2.6, 3.4)
    uc = math_node(nt, 'DIVIDE', u, bay); vc = math_node(nt, 'DIVIDE', sep.outputs[2], floor)
    uf = math_node(nt, 'FRACT', uc); vf = math_node(nt, 'FRACT', vc)
    if curtain: ulo, uhi, vlo, vhi = 0.05, 0.95, 0.10, 0.93
    else: ulo, uhi, vlo, vhi = 0.22, 0.78, 0.28, 0.86
    wu = math_node(nt, 'MULTIPLY', math_node(nt, 'GREATER_THAN', uf, ulo), math_node(nt, 'LESS_THAN', uf, uhi))
    wv = math_node(nt, 'MULTIPLY', math_node(nt, 'GREATER_THAN', vf, vlo), math_node(nt, 'LESS_THAN', vf, vhi))
    above = math_node(nt, 'GREATER_THAN', sep.outputs[2], 4.5)  # no windows in the first metres
    win = math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', wu, wv), above)
    win = math_node(nt, 'MULTIPLY', win, math_node(nt, 'SUBTRACT', 1.0, isroof))
    # per-window random: floor(uc), floor(vc)
    cc = nt.nodes.new('ShaderNodeCombineXYZ')
    L(nt, math_node(nt, 'FLOOR', uc), cc.inputs[0]); L(nt, math_node(nt, 'FLOOR', vc), cc.inputs[1])
    L(nt, math_node(nt, 'FLOOR', math_node(nt, 'DIVIDE', sep.outputs[0], 400.0)), cc.inputs[2])
    wn = nt.nodes.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; L(nt, cc.outputs[0], wn.inputs['Vector'])
    rnd = wn.outputs['Value']
    base = vcol(nt)
    # large-scale grime / variation so walls are not flat paint
    nz_t = nt.nodes.new('ShaderNodeTexNoise'); nz_t.inputs['Scale'].default_value = 0.08; nz_t.inputs['Detail'].default_value = 6
    L(nt, geo.outputs['Position'], nz_t.inputs['Vector'])
    vary = math_node(nt, 'ADD', 0.88, math_node(nt, 'MULTIPLY', nz_t.outputs['Fac'], 0.24))
    if look == 'model':
        wall = mix_rgb(nt, 0.85, base, (0.80, 0.76, 0.70, 1))
        wallb = principled(nt, mix_rgb(nt, vary, (0, 0, 0, 1), wall, 'MULTIPLY') if False else wall, rough=0.9, spec=0.3)
        glass_col = mix_rgb(nt, rnd, (0.55, 0.60, 0.64, 1), (0.66, 0.70, 0.74, 1))
        glass = principled(nt, glass_col, rough=0.35, spec=0.6)
    else:
        wallc = mix_rgb(nt, 1.0, base, mix_rgb(nt, 0.0, (1, 1, 1, 1), (1, 1, 1, 1)), 'MIX')
        vm = nt.nodes.new('ShaderNodeMix'); vm.data_type = 'RGBA'; vm.blend_type = 'MULTIPLY'; vm.inputs[0].default_value = 1.0
        L(nt, base, vm.inputs[6]); cr = nt.nodes.new('ShaderNodeCombineColor'); L(nt, vary, cr.inputs[0]); L(nt, vary, cr.inputs[1]); L(nt, vary, cr.inputs[2]); L(nt, cr.outputs[0], vm.inputs[7])
        wallcol = vm.outputs[2]
        if look == 'hybrid': wallcol = mix_rgb(nt, 0.2, wallcol, (0.86, 0.80, 0.72, 1))
        wallb = principled(nt, wallcol, rough=0.78 if not curtain else 0.35, spec=0.4, metal=0.0 if not curtain else 0.4)
        glass_col = mix_rgb(nt, rnd, (0.015, 0.022, 0.03, 1), (0.07, 0.09, 0.11, 1))
        grough = math_node(nt, 'ADD', 0.02, math_node(nt, 'MULTIPLY', rnd, 0.12))
        glass = principled(nt, glass_col, rough=grough, spec=0.9, coat=0.3)
        if curtain:
            # a curtain wall is a mirror with a tint: the sky and the towers
            # opposite are what it shows, pane by pane a little off-true
            glass = principled(nt, mix_rgb(nt, rnd, (0.07, 0.10, 0.12, 1), (0.13, 0.17, 0.19, 1)),
                               rough=math_node(nt, 'ADD', 0.008, math_node(nt, 'MULTIPLY', rnd, 0.035)), spec=1.0, metal=0.55)
            wallb = principled(nt, (0.30, 0.32, 0.34, 1), rough=0.3, spec=0.5, metal=0.85)
    mx = nt.nodes.new('ShaderNodeMixShader'); L(nt, win, mx.inputs[0]); L(nt, wallb.outputs[0], mx.inputs[1]); L(nt, glass.outputs[0], mx.inputs[2])
    # roofs: plain, a bit rougher, lightened for the model look
    if look == 'model': rcol = mix_rgb(nt, 0.85, base, (0.86, 0.83, 0.78, 1))
    elif look == 'hybrid': rcol = mix_rgb(nt, 0.3, base, (0.9, 0.88, 0.84, 1))
    else: rcol = base
    roof = principled(nt, rcol, rough=0.85, spec=0.3)
    mr = nt.nodes.new('ShaderNodeMixShader'); L(nt, isroof, mr.inputs[0]); L(nt, mx.outputs[0], mr.inputs[1]); L(nt, roof.outputs[0], mr.inputs[2])
    L(nt, mr.outputs[0], o.inputs[0])
    # window reveal: pushes glass back visually via bump
    if look != 'model':
        bmp = nt.nodes.new('ShaderNodeBump'); bmp.inputs['Strength'].default_value = 0.6; bmp.inputs['Distance'].default_value = 0.15
        L(nt, math_node(nt, 'SUBTRACT', 1.0, win), bmp.inputs['Height'])
        for s in (wallb, glass): L(nt, bmp.outputs[0], s.inputs['Normal'])
    return m


def set_ramp(cr, pal):
    """constant ramp, one stop per colour — stops are created at their final
    position, because the list re-sorts itself on every change of position"""
    cr.elements[0].position = 0.0
    while len(cr.elements) > 1: cr.elements.remove(cr.elements[-1])
    for i in range(1, len(pal)): cr.elements.new(i / len(pal))
    for e, c in zip(sorted(cr.elements, key=lambda e: e.position), pal): e.color = (*[x ** 2.2 for x in c], 1)

def facade_var(name, look):
    """one material, every building its own: palette, window rhythm, floor height, glass, roof"""
    m, nt, o = mat(name)
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    cen = nt.nodes.new('ShaderNodeAttribute'); cen.attribute_name = 'cen'
    # MEASURED: the centroid, identical at a building's three corners, comes
    # out of the barycentric interpolation a few ulps apart from pixel to
    # pixel — and a hash of a float turns that into a new colour per pixel,
    # which the samples then average to one beige for the whole city. Snapped
    # to a 2 m grid first, a building hashes to ONE value.
    cen_q = nt.nodes.new('ShaderNodeVectorMath'); cen_q.operation = 'SCALE'; cen_q.inputs['Scale'].default_value = 0.5
    L(nt, cen.outputs['Vector'], cen_q.inputs[0])
    cen_s = nt.nodes.new('ShaderNodeVectorMath'); cen_s.operation = 'FLOOR'
    L(nt, cen_q.outputs['Vector'], cen_s.inputs[0])
    def rnd(w):
        n = nt.nodes.new('ShaderNodeTexWhiteNoise'); n.noise_dimensions = '4D'
        L(nt, cen_s.outputs['Vector'], n.inputs['Vector']); n.inputs['W'].default_value = w
        return n.outputs['Value']
    r_pal, r_bay, r_flr, r_ww, r_wh, r_gl, r_roof, r_mix = (rnd(w) for w in (1.1, 2.3, 3.7, 4.1, 5.9, 6.3, 7.7, 8.2))
    def lerp(t, a, b): return math_node(nt, 'ADD', a, math_node(nt, 'MULTIPLY', t, b - a))
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L(nt, geo.outputs['Position'], sep.inputs[0])
    sn = nt.nodes.new('ShaderNodeSeparateXYZ'); L(nt, geo.outputs['True Normal'], sn.inputs[0])
    nz = math_node(nt, 'ABSOLUTE', sn.outputs[2])
    isroof = math_node(nt, 'GREATER_THAN', nz, 0.45)
    pitched = math_node(nt, 'MULTIPLY', isroof, math_node(nt, 'LESS_THAN', nz, 0.97))
    u = math_node(nt, 'ADD', math_node(nt, 'MULTIPLY', sep.outputs[0], math_node(nt, 'MULTIPLY', sn.outputs[1], -1.0)),
                  math_node(nt, 'MULTIPLY', sep.outputs[1], sn.outputs[0]))
    bay = lerp(r_bay, 1.7, 3.4); flr = lerp(r_flr, 2.9, 3.9)
    uc = math_node(nt, 'DIVIDE', u, bay); vc = math_node(nt, 'DIVIDE', sep.outputs[2], flr)
    uf = math_node(nt, 'FRACT', uc); vf = math_node(nt, 'FRACT', vc)
    ww0 = lerp(r_ww, 0.18, 0.36); wh0 = lerp(r_wh, 0.22, 0.34)
    # ── A TOWER IS NOT A HOUSE WITH MORE FLOORS ──
    # above 35 m a building takes one of four modern facade systems: punched
    # windows (the house rule), ribbon windows, vertical piers, or a curtain
    # wall with thin mullions — and its glass turns to tinted mirror
    bha = nt.nodes.new('ShaderNodeAttribute'); bha.attribute_name = 'bh'
    tower = math_node(nt, 'GREATER_THAN', bha.outputs['Fac'], 35.0)
    # 45 % punched stone, 20 % ribbon, 17 % piers, 18 % curtain wall
    km = math_node(nt, 'ADD', math_node(nt, 'ADD', math_node(nt, 'GREATER_THAN', r_mix, 0.45), math_node(nt, 'GREATER_THAN', r_mix, 0.65)), math_node(nt, 'GREATER_THAN', r_mix, 0.82))
    kind = math_node(nt, 'MULTIPLY', km, tower)
    def eq(i): return math_node(nt, 'SUBTRACT', 1.0, math_node(nt, 'GREATER_THAN', math_node(nt, 'ABSOLUTE', math_node(nt, 'SUBTRACT', kind, float(i))), 0.5))
    def pick(v0, v1, v2, v3):
        acc = math_node(nt, 'MULTIPLY', eq(0), v0)
        for i, v in ((1, v1), (2, v2), (3, v3)): acc = math_node(nt, 'ADD', acc, math_node(nt, 'MULTIPLY', eq(i), v))
        return acc
    ww = pick(ww0, 0.51, 0.36, 0.47); wh = pick(wh0, 0.30, 0.47, 0.46)
    wu = math_node(nt, 'LESS_THAN', math_node(nt, 'ABSOLUTE', math_node(nt, 'SUBTRACT', uf, 0.5)), ww)
    wv = math_node(nt, 'LESS_THAN', math_node(nt, 'ABSOLUTE', math_node(nt, 'SUBTRACT', vf, 0.55)), wh)
    win = math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', wu, wv), math_node(nt, 'SUBTRACT', 1.0, isroof))
    # the trim: the same opening 0.12 m larger all round, minus the glass
    tu = math_node(nt, 'LESS_THAN', math_node(nt, 'ABSOLUTE', math_node(nt, 'SUBTRACT', uf, 0.5)), math_node(nt, 'ADD', ww, math_node(nt, 'DIVIDE', 0.12, bay)))
    tv = math_node(nt, 'LESS_THAN', math_node(nt, 'ABSOLUTE', math_node(nt, 'SUBTRACT', vf, 0.55)), math_node(nt, 'ADD', wh, math_node(nt, 'DIVIDE', 0.14, flr)))
    trim = math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', tu, tv), math_node(nt, 'SUBTRACT', 1.0, win)), math_node(nt, 'SUBTRACT', 1.0, isroof))
    # a string course under each floor's windows, on about half the buildings
    band = math_node(nt, 'MULTIPLY', math_node(nt, 'LESS_THAN', vf, 0.07), math_node(nt, 'GREATER_THAN', r_mix, 0.5))
    # palette: San Francisco's own — stucco whites, creams, pastels, brick, sandstone, concrete
    ramp = nt.nodes.new('ShaderNodeValToRGB'); cr = ramp.color_ramp; cr.interpolation = 'CONSTANT'
    PAL = [(0.92, 0.91, 0.87), (0.93, 0.87, 0.72), (0.62, 0.74, 0.82), (0.93, 0.84, 0.52), (0.66, 0.78, 0.64),
           (0.88, 0.66, 0.62), (0.55, 0.26, 0.20), (0.80, 0.72, 0.60), (0.58, 0.60, 0.63), (0.95, 0.94, 0.92),
           (0.46, 0.55, 0.66), (0.84, 0.80, 0.86), (0.72, 0.52, 0.36), (0.36, 0.40, 0.38)]
    set_ramp(cr, PAL)
    L(nt, r_pal, ramp.inputs[0])
    wallc = mix_rgb(nt, 0.12, ramp.outputs[0], vcol(nt))
    stone = nt.nodes.new('ShaderNodeValToRGB'); stone.color_ramp.interpolation = 'CONSTANT'
    set_ramp(stone.color_ramp, [(0.84, 0.78, 0.66), (0.72, 0.60, 0.50), (0.90, 0.89, 0.86), (0.62, 0.58, 0.54),
                                (0.78, 0.70, 0.62), (0.48, 0.42, 0.38), (0.86, 0.82, 0.74), (0.68, 0.66, 0.64)])
    L(nt, r_pal, stone.inputs[0])
    wallc = mix_rgb(nt, tower, wallc, stone.outputs[0])
    grime = nt.nodes.new('ShaderNodeTexNoise'); grime.inputs['Scale'].default_value = 0.15; grime.inputs['Detail'].default_value = 8
    L(nt, geo.outputs['Position'], grime.inputs['Vector'])
    gm = nt.nodes.new('ShaderNodeMix'); gm.data_type = 'RGBA'; gm.blend_type = 'MULTIPLY'
    L(nt, math_node(nt, 'MULTIPLY', grime.outputs['Fac'], 0.35), gm.inputs[0]); L(nt, wallc, gm.inputs[6]); gm.inputs[7].default_value = (0.55, 0.52, 0.48, 1)
    wallc = mix_rgb(nt, band, gm.outputs[2], (0.9, 0.88, 0.84, 1))
    # trim colour: white on most, a darker accent on some (SF's painted trim)
    trimc = mix_rgb(nt, math_node(nt, 'GREATER_THAN', r_wh, 0.7), (0.86, 0.85, 0.82, 1), (0.22, 0.24, 0.28, 1))
    wallc = mix_rgb(nt, trim, wallc, trimc)
    # ── THE TOP AND THE FOOT OF A WALL ──
    # a cornice band under every flat roofline; storefronts along the ground
    # floor of mid-size buildings; a garage door per bay on houses
    bta = nt.nodes.new('ShaderNodeAttribute'); bta.attribute_name = 'btop'
    bfa = nt.nodes.new('ShaderNodeAttribute'); bfa.attribute_name = 'bfoot'
    wall_ = math_node(nt, 'SUBTRACT', 1.0, isroof)
    below_top = math_node(nt, 'SUBTRACT', bta.outputs['Fac'], sep.outputs[2])
    above_foot = math_node(nt, 'SUBTRACT', sep.outputs[2], bfa.outputs['Fac'])
    corn_h = lerp(r_bay, 0.45, 1.1)
    cornice = math_node(nt, 'MULTIPLY', math_node(nt, 'LESS_THAN', below_top, corn_h), wall_)
    cornice = math_node(nt, 'MULTIPLY', cornice, math_node(nt, 'GREATER_THAN', bha.outputs['Fac'], 5.0))
    cornc = mix_rgb(nt, math_node(nt, 'GREATER_THAN', r_ww, 0.5), (0.90, 0.89, 0.85, 1), (0.30, 0.30, 0.31, 1))
    mid = math_node(nt, 'MULTIPLY', math_node(nt, 'GREATER_THAN', bha.outputs['Fac'], 9.0), math_node(nt, 'LESS_THAN', bha.outputs['Fac'], 40.0))
    shop_b = math_node(nt, 'MULTIPLY', mid, math_node(nt, 'GREATER_THAN', r_flr, 0.45))
    ground = math_node(nt, 'MULTIPLY', math_node(nt, 'LESS_THAN', above_foot, 4.2), wall_)
    shopfront = math_node(nt, 'MULTIPLY', ground, shop_b)
    # a shopfront is mostly glass between thin dark piers, under a sign band
    sfu = math_node(nt, 'FRACT', math_node(nt, 'DIVIDE', u, 3.6))
    pier = math_node(nt, 'LESS_THAN', sfu, 0.08)
    sign = math_node(nt, 'GREATER_THAN', above_foot, 3.3)
    shop_glass = math_node(nt, 'MULTIPLY', shopfront, math_node(nt, 'MULTIPLY', math_node(nt, 'SUBTRACT', 1.0, pier), math_node(nt, 'SUBTRACT', 1.0, sign)))
    signc = nt.nodes.new('ShaderNodeValToRGB'); signc.color_ramp.interpolation = 'CONSTANT'
    set_ramp(signc.color_ramp, [(0.12, 0.13, 0.15), (0.36, 0.14, 0.12), (0.12, 0.20, 0.17), (0.72, 0.70, 0.64), (0.18, 0.17, 0.24), (0.44, 0.34, 0.18)])
    L(nt, r_gl, signc.inputs[0])
    wallc = mix_rgb(nt, math_node(nt, 'MULTIPLY', shopfront, math_node(nt, 'MAXIMUM', pier, sign)), wallc, signc.outputs[0])
    wallc = mix_rgb(nt, cornice, wallc, cornc)
    # garage doors: houses, one per bay, 2.4 m high
    house = math_node(nt, 'LESS_THAN', bha.outputs['Fac'], 13.0)
    gu = math_node(nt, 'FRACT', math_node(nt, 'DIVIDE', u, 4.2))
    garage = math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', house, math_node(nt, 'LESS_THAN', above_foot, 2.4)),
                       math_node(nt, 'MULTIPLY', math_node(nt, 'GREATER_THAN', gu, 0.22), math_node(nt, 'LESS_THAN', gu, 0.78)))
    garage = math_node(nt, 'MULTIPLY', garage, math_node(nt, 'MULTIPLY', wall_, math_node(nt, 'GREATER_THAN', r_mix, 0.3)))
    wallc = mix_rgb(nt, garage, wallc, mix_rgb(nt, r_wh, (0.78, 0.77, 0.74, 1), (0.36, 0.36, 0.37, 1)))
    # rain streaks under the sills: a darker trail below each window, fading
    below = math_node(nt, 'MULTIPLY', math_node(nt, 'MULTIPLY', wu, math_node(nt, 'LESS_THAN', vf, math_node(nt, 'SUBTRACT', 0.55, wh))), math_node(nt, 'SUBTRACT', 1.0, isroof))
    streak_n = nt.nodes.new('ShaderNodeTexNoise'); streak_n.inputs['Scale'].default_value = 3.0
    sm = nt.nodes.new('ShaderNodeMapping'); sm.inputs['Scale'].default_value = (4.0, 4.0, 0.25); L(nt, geo.outputs['Position'], sm.inputs[0]); L(nt, sm.outputs[0], streak_n.inputs['Vector'])
    streak = math_node(nt, 'MULTIPLY', below, math_node(nt, 'MULTIPLY', math_node(nt, 'SUBTRACT', streak_n.outputs['Fac'], 0.35, clamp=True), 0.55))
    ws_ = nt.nodes.new('ShaderNodeMix'); ws_.data_type = 'RGBA'; ws_.blend_type = 'MULTIPLY'; L(nt, streak, ws_.inputs[0]); L(nt, wallc, ws_.inputs[6]); ws_.inputs[7].default_value = (0.62, 0.60, 0.58, 1)
    wallc = ws_.outputs[2]
    wall = principled(nt, wallc, rough=0.82, spec=0.35)
    gl = mix_rgb(nt, r_gl, (0.035, 0.045, 0.055, 1), (0.10, 0.11, 0.115, 1))
    cell = nt.nodes.new('ShaderNodeCombineXYZ'); L(nt, math_node(nt, 'FLOOR', uc), cell.inputs[0]); L(nt, math_node(nt, 'FLOOR', vc), cell.inputs[1]); L(nt, r_pal, cell.inputs[2])
    wn = nt.nodes.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'; L(nt, cell.outputs[0], wn.inputs['Vector'])
    # some panes have blinds or curtains: lighter, rougher
    blind = math_node(nt, 'GREATER_THAN', wn.outputs['Value'], 0.72)
    glc = mix_rgb(nt, blind, gl, (0.45, 0.42, 0.36, 1))
    glass = principled(nt, glc, rough=math_node(nt, 'ADD', 0.03, math_node(nt, 'MULTIPLY', blind, 0.6)), spec=0.9, coat=0.3)
    tint = nt.nodes.new('ShaderNodeValToRGB'); tint.color_ramp.interpolation = 'CONSTANT'
    set_ramp(tint.color_ramp, [(0.20, 0.26, 0.30), (0.26, 0.30, 0.28), (0.30, 0.28, 0.24), (0.18, 0.20, 0.24), (0.32, 0.36, 0.40)])
    L(nt, r_gl, tint.inputs[0])
    tglass = principled(nt, mix_rgb(nt, math_node(nt, 'MULTIPLY', wn.outputs['Value'], 0.25), tint.outputs[0], (0.5, 0.52, 0.55, 1)),
                        rough=math_node(nt, 'ADD', 0.01, math_node(nt, 'MULTIPLY', wn.outputs['Value'], 0.04)), spec=1.0, metal=0.6)
    mirror = math_node(nt, 'MULTIPLY', tower, math_node(nt, 'GREATER_THAN', kind, 0.5))
    # the zones drawn above own their pixels: no punched window in a cornice,
    # a garage door or a shopfront; a shopfront's glass is glass
    nowin = math_node(nt, 'MAXIMUM', math_node(nt, 'MAXIMUM', cornice, garage), shopfront)
    win = math_node(nt, 'MAXIMUM', math_node(nt, 'MULTIPLY', win, math_node(nt, 'SUBTRACT', 1.0, nowin)), shop_glass)
    gsel = nt.nodes.new('ShaderNodeMixShader'); L(nt, mirror, gsel.inputs[0]); L(nt, glass.outputs[0], gsel.inputs[1]); L(nt, tglass.outputs[0], gsel.inputs[2])
    mx = nt.nodes.new('ShaderNodeMixShader'); L(nt, win, mx.inputs[0]); L(nt, wall.outputs[0], mx.inputs[1]); L(nt, gsel.outputs[0], mx.inputs[2])
    # ── ROOFS: shingle rows on the pitched, gravel/membrane/coating on the flat ──
    # rows of shingles are horizontal on any pitch, so they are bands of world z
    rowz = math_node(nt, 'DIVIDE', sep.outputs[2], 0.34)
    rowf = math_node(nt, 'FRACT', rowz)
    sh = nt.nodes.new('ShaderNodeCombineXYZ'); L(nt, math_node(nt, 'FLOOR', rowz), sh.inputs[0])
    L(nt, math_node(nt, 'FLOOR', math_node(nt, 'DIVIDE', u, 0.9)), sh.inputs[1]); L(nt, r_roof, sh.inputs[2])
    shn = nt.nodes.new('ShaderNodeTexWhiteNoise'); shn.noise_dimensions = '3D'; L(nt, sh.outputs[0], shn.inputs['Vector'])
    pr_ramp = nt.nodes.new('ShaderNodeValToRGB'); pr_ramp.color_ramp.interpolation = 'CONSTANT'
    set_ramp(pr_ramp.color_ramp, [(0.27, 0.27, 0.28), (0.36, 0.38, 0.42), (0.38, 0.30, 0.24), (0.50, 0.49, 0.47),
                                  (0.34, 0.38, 0.34), (0.30, 0.29, 0.28), (0.44, 0.42, 0.39), (0.32, 0.25, 0.20)])
    L(nt, r_roof, pr_ramp.inputs[0])
    tone = math_node(nt, 'ADD', 0.86, math_node(nt, 'MULTIPLY', shn.outputs['Value'], 0.28))
    pcol = nt.nodes.new('ShaderNodeMix'); pcol.data_type = 'RGBA'; pcol.blend_type = 'MULTIPLY'; pcol.inputs[0].default_value = 1.0
    L(nt, pr_ramp.outputs[0], pcol.inputs[6]); tc3 = nt.nodes.new('ShaderNodeCombineColor')
    for k in range(3): L(nt, tone, tc3.inputs[k])
    L(nt, tc3.outputs[0], pcol.inputs[7])
    fl_ramp = nt.nodes.new('ShaderNodeValToRGB'); fl_ramp.color_ramp.interpolation = 'CONSTANT'
    set_ramp(fl_ramp.color_ramp, [(0.52, 0.51, 0.49), (0.80, 0.80, 0.78), (0.30, 0.30, 0.31), (0.62, 0.59, 0.54), (0.45, 0.46, 0.47)])
    L(nt, r_roof, fl_ramp.inputs[0])
    grav = nt.nodes.new('ShaderNodeTexNoise'); grav.inputs['Scale'].default_value = 7.0; grav.inputs['Detail'].default_value = 12
    L(nt, geo.outputs['Position'], grav.inputs['Vector'])
    fcol = nt.nodes.new('ShaderNodeMix'); fcol.data_type = 'RGBA'; fcol.blend_type = 'MULTIPLY'
    L(nt, math_node(nt, 'MULTIPLY', grav.outputs['Fac'], 0.35), fcol.inputs[0]); L(nt, fl_ramp.outputs[0], fcol.inputs[6]); fcol.inputs[7].default_value = (0.55, 0.55, 0.55, 1)
    rc = mix_rgb(nt, pitched, fcol.outputs[2], pcol.outputs[2])
    # weathering: broad streaks and patches, darker, on everything
    wn2 = nt.nodes.new('ShaderNodeTexNoise'); wn2.inputs['Scale'].default_value = 0.35; wn2.inputs['Detail'].default_value = 8
    L(nt, geo.outputs['Position'], wn2.inputs['Vector'])
    rm = nt.nodes.new('ShaderNodeMix'); rm.data_type = 'RGBA'; rm.blend_type = 'MULTIPLY'
    L(nt, math_node(nt, 'MULTIPLY', math_node(nt, 'SUBTRACT', wn2.outputs['Fac'], 0.35, clamp=True), 0.9), rm.inputs[0]); L(nt, rc, rm.inputs[6]); rm.inputs[7].default_value = (0.62, 0.62, 0.60, 1)
    roof = principled(nt, rm.outputs[2], rough=0.88, spec=0.3)
    # shingle relief: the lower edge of each row stands proud
    rb = nt.nodes.new('ShaderNodeBump'); rb.inputs['Strength'].default_value = 0.45; rb.inputs['Distance'].default_value = 0.04
    L(nt, math_node(nt, 'MULTIPLY', rowf, pitched), rb.inputs['Height']); L(nt, rb.outputs[0], roof.inputs['Normal'])
    mr = nt.nodes.new('ShaderNodeMixShader'); L(nt, isroof, mr.inputs[0]); L(nt, mx.outputs[0], mr.inputs[1]); L(nt, roof.outputs[0], mr.inputs[2])
    L(nt, mr.outputs[0], o.inputs[0])
    bmp = nt.nodes.new('ShaderNodeBump'); bmp.inputs['Strength'].default_value = 0.7; bmp.inputs['Distance'].default_value = 0.2
    # the cornice stands proud of the wall, the glass sits back in it
    L(nt, math_node(nt, 'ADD', math_node(nt, 'SUBTRACT', 1.0, win), math_node(nt, 'MULTIPLY', cornice, 0.8)), bmp.inputs['Height'])
    for sh in (wall, glass): L(nt, bmp.outputs[0], sh.inputs['Normal'])
    return m

def ground_mat(name, texpath=None):
    """lawn where the engine's baked ground map is green, dry golden grass
    where it is tan (San Francisco's hills from June to November), soil and
    scrub patches through both, and a slope term: steep ground goes drier"""
    m, nt, o = mat(name)
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    if texpath and os.path.exists(texpath):
        uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'
        img = nt.nodes.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(texpath); img.interpolation = 'Cubic'
        L(nt, uvn.outputs[0], img.inputs[0]); low = img.outputs['Color']
    else:
        low = vcol(nt)
    sp = nt.nodes.new('ShaderNodeSeparateColor'); L(nt, low, sp.inputs[0])
    greenness = math_node(nt, 'MULTIPLY', math_node(nt, 'SUBTRACT', sp.outputs[1], sp.outputs[0]), 8.0, clamp=True)
    sn = nt.nodes.new('ShaderNodeSeparateXYZ'); L(nt, geo.outputs['True Normal'], sn.inputs[0])
    steep = math_node(nt, 'MULTIPLY', math_node(nt, 'SUBTRACT', 0.985, sn.outputs[2]), 12.0, clamp=True)
    lawnness = math_node(nt, 'MULTIPLY', greenness, math_node(nt, 'SUBTRACT', 1.0, math_node(nt, 'MULTIPLY', steep, 0.6)))
    n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 0.04; n1.inputs['Detail'].default_value = 6; L(nt, geo.outputs['Position'], n1.inputs['Vector'])
    n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 0.6; n2.inputs['Detail'].default_value = 10; L(nt, geo.outputs['Position'], n2.inputs['Vector'])
    lawn = mix_rgb(nt, n1.outputs['Fac'], (0.06, 0.16, 0.03, 1), (0.13, 0.24, 0.05, 1))
    dry = mix_rgb(nt, n1.outputs['Fac'], (0.42, 0.30, 0.13, 1), (0.60, 0.47, 0.24, 1))
    scrub = (0.13, 0.15, 0.06, 1)
    dry = mix_rgb(nt, math_node(nt, 'MULTIPLY', math_node(nt, 'SUBTRACT', n2.outputs['Fac'], 0.55), 4.0, clamp=True), dry, scrub)
    # flat ground that is not a park is a backyard: patches of lawn and of
    # paving, never the golden grass of a hillside
    n3 = nt.nodes.new('ShaderNodeTexNoise'); n3.inputs['Scale'].default_value = 0.09; n3.inputs['Detail'].default_value = 4; L(nt, geo.outputs['Position'], n3.inputs['Vector'])
    flat_ = math_node(nt, 'SUBTRACT', 1.0, steep)
    yard_lawn = math_node(nt, 'MULTIPLY', math_node(nt, 'GREATER_THAN', n3.outputs['Fac'], 0.40), flat_)
    paving = mix_rgb(nt, n2.outputs['Fac'], (0.22, 0.21, 0.19, 1), (0.30, 0.28, 0.25, 1))
    dry = mix_rgb(nt, math_node(nt, 'MULTIPLY', flat_, math_node(nt, 'SUBTRACT', 1.0, yard_lawn)), dry, paving)
    lawnness = math_node(nt, 'MAXIMUM', lawnness, yard_lawn)
    c = mix_rgb(nt, lawnness, dry, lawn)
    # mowing stripes and wear, faint, on the lawns
    wear = math_node(nt, 'MULTIPLY', math_node(nt, 'SUBTRACT', n2.outputs['Fac'], 0.4), 0.5, clamp=True)
    c = mix_rgb(nt, math_node(nt, 'MULTIPLY', wear, 0.12), c, (0.25, 0.26, 0.12, 1))
    p = principled(nt, c, rough=0.95, spec=0.2)
    bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = 0.4; bm.inputs['Distance'].default_value = 0.3
    L(nt, n2.outputs['Fac'], bm.inputs['Height']); L(nt, bm.outputs[0], p.inputs['Normal'])
    L(nt, p.outputs[0], o.inputs[0]); return m

def sidewalk_mat():
    m, nt, o = mat('sidewalk')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 0.8; n.inputs['Detail'].default_value = 8; L(nt, geo.outputs['Position'], n.inputs['Vector'])
    c = mix_rgb(nt, n.outputs['Fac'], (0.40, 0.39, 0.36, 1), (0.60, 0.58, 0.54, 1))
    p = principled(nt, c, rough=0.9, spec=0.25); L(nt, p.outputs[0], o.inputs[0]); return m

def sea_mat(maskpath, ox, oy, w, h):
    """deep blue to shallow green over the first 60 m from land, a broken line
    of foam along the shore, two scales of wave for the glitter — and fully
    transparent wherever the mask says land"""
    m, nt, o = mat('sea')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    mp = nt.nodes.new('ShaderNodeMapping'); mp.vector_type = 'POINT'
    mp.inputs['Location'].default_value = (-ox / w, -oy / h, 0); mp.inputs['Scale'].default_value = (1 / w, 1 / h, 1)
    L(nt, geo.outputs['Position'], mp.inputs[0])
    img = nt.nodes.new('ShaderNodeTexImage'); img.image = bpy.data.images.load(maskpath); img.image.colorspace_settings.name = 'Non-Color'
    img.extension = 'EXTEND'; img.interpolation = 'Linear'; L(nt, mp.outputs[0], img.inputs[0])
    sp = nt.nodes.new('ShaderNodeSeparateColor'); L(nt, img.outputs['Color'], sp.inputs[0])
    water_m, d = sp.outputs[0], math_node(nt, 'MULTIPLY', sp.outputs[1], 127.5)
    shallow = math_node(nt, 'SUBTRACT', 1.0, math_node(nt, 'DIVIDE', d, 60.0, clamp=True))
    col = mix_rgb(nt, math_node(nt, 'POWER', shallow, 2.0), (0.003, 0.014, 0.020, 1), (0.018, 0.070, 0.070, 1))
    fn = nt.nodes.new('ShaderNodeTexNoise'); fn.inputs['Scale'].default_value = 0.35; fn.inputs['Detail'].default_value = 12; L(nt, geo.outputs['Position'], fn.inputs['Vector'])
    band = math_node(nt, 'SUBTRACT', 1.0, math_node(nt, 'DIVIDE', d, 5.0, clamp=True))
    foam = math_node(nt, 'GREATER_THAN', math_node(nt, 'MULTIPLY', band, math_node(nt, 'ADD', fn.outputs['Fac'], 0.3)), 0.5)
    water = principled(nt, col, rough=0.05, spec=0.32)
    fp = principled(nt, (0.82, 0.84, 0.82, 1), rough=0.8, spec=0.3)
    mx = nt.nodes.new('ShaderNodeMixShader'); L(nt, foam, mx.inputs[0]); L(nt, water.outputs[0], mx.inputs[1]); L(nt, fp.outputs[0], mx.inputs[2])
    mpw = nt.nodes.new('ShaderNodeMapping'); mpw.inputs['Scale'].default_value = (0.6, 1.8, 1); L(nt, geo.outputs['Position'], mpw.inputs[0])
    w1 = nt.nodes.new('ShaderNodeTexNoise'); w1.inputs['Scale'].default_value = 0.05; w1.inputs['Detail'].default_value = 6; w1.inputs['Roughness'].default_value = 0.6; L(nt, mpw.outputs[0], w1.inputs['Vector'])
    w2 = nt.nodes.new('ShaderNodeTexNoise'); w2.inputs['Scale'].default_value = 1.2; w2.inputs['Detail'].default_value = 8; L(nt, geo.outputs['Position'], w2.inputs['Vector'])
    hgt = math_node(nt, 'ADD', w1.outputs['Fac'], math_node(nt, 'MULTIPLY', w2.outputs['Fac'], 0.3))
    bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = float(os.environ.get('WAVE_K', 0.7)); bm.inputs['Distance'].default_value = 0.35
    L(nt, hgt, bm.inputs['Height']); L(nt, bm.outputs[0], water.inputs['Normal'])
    # wind lanes: long bands where the surface is rougher, so the sky it
    # mirrors goes dull in streaks — how open water reads from the air
    mps = nt.nodes.new('ShaderNodeMapping'); mps.inputs['Scale'].default_value = (0.12, 1.6, 1); mps.inputs['Rotation'].default_value = (0, 0, 0.35)
    L(nt, geo.outputs['Position'], mps.inputs[0])
    ws = nt.nodes.new('ShaderNodeTexNoise'); ws.inputs['Scale'].default_value = 0.05; ws.inputs['Detail'].default_value = 3; L(nt, mps.outputs[0], ws.inputs['Vector'])
    L(nt, math_node(nt, 'ADD', 0.02, math_node(nt, 'MULTIPLY', math_node(nt, 'SUBTRACT', ws.outputs['Fac'], 0.4, clamp=True), 0.5)), water.inputs['Roughness'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    cut = nt.nodes.new('ShaderNodeMixShader'); L(nt, math_node(nt, 'GREATER_THAN', water_m, 0.5), cut.inputs[0])
    L(nt, tr.outputs[0], cut.inputs[1]); L(nt, mx.outputs[0], cut.inputs[2])
    L(nt, cut.outputs[0], o.inputs[0]); return m

def detail_mat():
    """the engine's ground detail: white pieces are paved (piers, jetties,
    plazas) and get weathered concrete; the olive ones are lawns"""
    m, nt, o = mat('detail')
    geo = nt.nodes.new('ShaderNodeNewGeometry'); vc = vcol(nt)
    sep = nt.nodes.new('ShaderNodeSeparateColor'); L(nt, vc, sep.inputs[0])
    white = math_node(nt, 'GREATER_THAN', sep.outputs[2], 0.8)
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 0.5; n.inputs['Detail'].default_value = 10; L(nt, geo.outputs['Position'], n.inputs['Vector'])
    conc = mix_rgb(nt, n.outputs['Fac'], (0.24, 0.235, 0.22, 1), (0.40, 0.39, 0.36, 1))
    n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 0.12; n2.inputs['Detail'].default_value = 8; L(nt, geo.outputs['Position'], n2.inputs['Vector'])
    lawn = mix_rgb(nt, math_node(nt, 'MULTIPLY', math_node(nt, 'SUBTRACT', n2.outputs['Fac'], 0.3), 1.6, clamp=True), (0.09, 0.19, 0.05, 1), (0.20, 0.27, 0.09, 1))
    lawn = mix_rgb(nt, math_node(nt, 'MULTIPLY', n.outputs['Fac'], 0.25), lawn, (0.30, 0.30, 0.14, 1))
    c = mix_rgb(nt, white, lawn, conc)
    p = principled(nt, c, rough=0.92, spec=0.25)
    bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = 0.3; bm.inputs['Distance'].default_value = 0.05
    L(nt, n.outputs['Fac'], bm.inputs['Height']); L(nt, bm.outputs[0], p.inputs['Normal'])
    L(nt, p.outputs[0], o.inputs[0]); return m

def asphalt_mat():
    """asphalt that has been driven on: a warm grey, repair patches of fresher
    and older tar, wheel-worn lighter bands, fine grain, faint cracks"""
    m, nt, o = mat('asphalt')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    base = (0.060, 0.058, 0.056, 1)
    n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 0.08; n1.inputs['Detail'].default_value = 4; L(nt, geo.outputs['Position'], n1.inputs['Vector'])
    # patches: cells of a Voronoi, a third of them re-laid darker, some lighter
    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 0.09; L(nt, geo.outputs['Position'], vo.inputs['Vector'])
    pr = vo.outputs['Color']; sp = nt.nodes.new('ShaderNodeSeparateColor'); L(nt, pr, sp.inputs[0])
    dark = math_node(nt, 'GREATER_THAN', sp.outputs[0], 0.72); light = math_node(nt, 'LESS_THAN', sp.outputs[0], 0.12)
    c = mix_rgb(nt, dark, base, (0.030, 0.030, 0.032, 1))
    c = mix_rgb(nt, light, c, (0.095, 0.092, 0.086, 1))
    c = mix_rgb(nt, math_node(nt, 'MULTIPLY', n1.outputs['Fac'], 0.5), c, (0.085, 0.080, 0.074, 1))
    g = nt.nodes.new('ShaderNodeTexNoise'); g.inputs['Scale'].default_value = 6.0; g.inputs['Detail'].default_value = 10; L(nt, geo.outputs['Position'], g.inputs['Vector'])
    gm = nt.nodes.new('ShaderNodeMix'); gm.data_type = 'RGBA'; gm.blend_type = 'MULTIPLY'
    L(nt, math_node(nt, 'MULTIPLY', g.outputs['Fac'], 0.5), gm.inputs[0]); L(nt, c, gm.inputs[6]); gm.inputs[7].default_value = (0.7, 0.7, 0.7, 1)
    # cracks: the thin edges of a second Voronoi
    vc = nt.nodes.new('ShaderNodeTexVoronoi'); vc.feature = 'DISTANCE_TO_EDGE'; vc.inputs['Scale'].default_value = 0.35; L(nt, geo.outputs['Position'], vc.inputs['Vector'])
    crack = math_node(nt, 'LESS_THAN', vc.outputs['Distance'], 0.015)
    cc = mix_rgb(nt, math_node(nt, 'MULTIPLY', crack, 0.6), gm.outputs[2], (0.02, 0.02, 0.02, 1))
    p = principled(nt, cc, rough=math_node(nt, 'ADD', 0.62, math_node(nt, 'MULTIPLY', g.outputs['Fac'], 0.25)), spec=0.35)
    bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = 0.25; bm.inputs['Distance'].default_value = 0.02
    L(nt, g.outputs['Fac'], bm.inputs['Height']); L(nt, bm.outputs[0], p.inputs['Normal'])
    L(nt, p.outputs[0], o.inputs[0]); return m

def plain_mat(name, look, tint=None, rough=0.9, lighten=0.0, spec=0.3):
    m, nt, o = mat(name)
    c = vcol(nt) if tint is None else tint
    if lighten > 0: c = mix_rgb(nt, lighten, c, (0.74, 0.71, 0.65, 1) if look == 'model' else (0.9, 0.89, 0.86, 1))
    p = principled(nt, c, rough=rough, spec=spec); L(nt, p.outputs[0], o.inputs[0]); return m

def water_mat(look):
    m, nt, o = mat('water')
    col = {'photo': (0.02, 0.07, 0.10, 1), 'hybrid': (0.03, 0.11, 0.15, 1), 'model': (0.16, 0.32, 0.40, 1)}[look]
    p = principled(nt, col, rough=0.06 if look != 'model' else 0.3, spec=0.8)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    wv = nt.nodes.new('ShaderNodeTexNoise'); wv.inputs['Scale'].default_value = 0.35; wv.inputs['Detail'].default_value = 8
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1, 3, 1); L(nt, tc.outputs['Object'], mp.inputs[0]); L(nt, mp.outputs[0], wv.inputs['Vector'])
    bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = 0.25 if look != 'model' else 0.08; bm.inputs['Distance'].default_value = 0.3
    L(nt, wv.outputs['Fac'], bm.inputs['Height']); L(nt, bm.outputs[0], p.inputs['Normal'])
    L(nt, p.outputs[0], o.inputs[0]); return m

def foliage_mat(look):
    m, nt, o = mat('foliage')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    ns = nt.nodes.new('ShaderNodeTexNoise'); ns.inputs['Scale'].default_value = 0.9; ns.inputs['Detail'].default_value = 4
    L(nt, geo.outputs['Position'], ns.inputs['Vector'])
    ob = nt.nodes.new('ShaderNodeObjectInfo')
    if look == 'model': a, b = (0.46, 0.55, 0.42, 1), (0.60, 0.67, 0.55, 1)
    else: a, b = (0.035, 0.09, 0.025, 1), (0.12, 0.20, 0.05, 1)
    mixf = math_node(nt, 'ADD', math_node(nt, 'MULTIPLY', ns.outputs['Fac'], 0.6), math_node(nt, 'MULTIPLY', ob.outputs['Random'], 0.5))
    c = mix_rgb(nt, mixf, a, b)
    p = principled(nt, c, rough=0.7, spec=0.3)
    p.inputs['Subsurface Weight'].default_value = 0.0 if look == 'model' else 0.15
    L(nt, p.outputs[0], o.inputs[0]); return m

# ── geometry ────────────────────────────────────────────────────────────
def build(name, pos, col, material, zscale=1.0, zoff=0.0, cen=None, uv=None, smooth=False):
    nv = len(pos) // 3
    me = bpy.data.meshes.new(name)
    me.vertices.add(nv)
    pos = array.array('f', pos)
    if zscale != 1.0 or zoff:
        for i in range(2, len(pos), 3): pos[i] = pos[i] * zscale + zoff
    nt = nv // 3
    me.loops.add(nv); me.polygons.add(nt)
    # one fixed camera: every triangle turns its front to it (the engine's
    # buffers mix both windings, and a back face under the sun renders black)
    li = array.array('i', [0]) * nv
    vx, vy, vz = -CAMF[0], -CAMF[1], -CAMF[2]
    for t in range(nt):
        a = t * 9
        ux, uy, uz = pos[a+3]-pos[a], pos[a+4]-pos[a+1], pos[a+5]-pos[a+2]
        wx, wy, wz = pos[a+6]-pos[a], pos[a+7]-pos[a+1], pos[a+8]-pos[a+2]
        nx, ny, nz = uy*wz-uz*wy, uz*wx-ux*wz, ux*wy-uy*wx
        if nx*vx + ny*vy + nz*vz >= 0: li[t*3], li[t*3+1], li[t*3+2] = t*3, t*3+1, t*3+2
        else:
            li[t*3], li[t*3+1], li[t*3+2] = t*3, t*3+2, t*3+1
            nx, ny, nz = -nx, -ny, -nz
        # overlapping coplanar faces (street polygons at a crossing, a deck on
        # its roof) occlude each other totally in a path tracer; a few random
        # centimetres along the face's own normal puts one of them on top
        ln = math.sqrt(nx*nx + ny*ny + nz*nz)
        if ln > 0 and not smooth:
            j = (0.01 + 0.05 * (((t * 2654435761) & 0xffff) / 65535.0)) / ln
            for k in range(3):
                pos[a+k*3] += nx*j; pos[a+k*3+1] += ny*j; pos[a+k*3+2] += nz*j
    me.vertices.foreach_set('co', pos)
    me.loops.foreach_set('vertex_index', li)
    me.polygons.foreach_set('loop_start', array.array('i', range(0, nv, 3)))
    me.polygons.foreach_set('loop_total', array.array('i', [3]) * nt)
    # the UV layer only once the polygons exist: created before, Blender reads
    # uninitialised loop starts and corrupts its heap (crashed 2026-09-23)
    if uv is not None and len(uv) == nv * 2:
        ul = me.uv_layers.new(name='UVMap'); luv = array.array('f', [0.0]) * (nv * 2)
        for k in range(nv): luv[k*2], luv[k*2+1] = uv[li[k]*2], uv[li[k]*2+1]
        ul.data.foreach_set('uv', luv)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    rgba = array.array('f', [1.0]) * (nv * 4)
    for i in range(nv): rgba[i*4], rgba[i*4+1], rgba[i*4+2] = col[i*3], col[i*3+1], col[i*3+2]
    ca.data.foreach_set('color', rgba)
    if cen is not None and len(cen) == nv * 2 and name.startswith(('buildings', 'heroes', 'caps')):
        # the building's own height (top minus foot), for facade choices
        top, foot = {}, {}
        for i in range(nv):
            k = (round(cen[i*2], 1), round(cen[i*2+1], 1)); z = pos[i*3+2]
            if z > top.get(k, -1e9): top[k] = z
            if z < foot.get(k, 1e9): foot[k] = z
        keys = [(round(cen[i*2], 1), round(cen[i*2+1], 1)) for i in range(nv)]
        bh = me.attributes.new('bh', 'FLOAT', 'POINT'); bh.data.foreach_set('value', [top[k] - foot[k] for k in keys])
        bt = me.attributes.new('btop', 'FLOAT', 'POINT'); bt.data.foreach_set('value', [top[k] for k in keys])
        bf = me.attributes.new('bfoot', 'FLOAT', 'POINT'); bf.data.foreach_set('value', [foot[k] for k in keys])
    if cen is not None and len(cen) == nv * 2:
        at = me.attributes.new('cen', 'FLOAT_VECTOR', 'POINT')
        v3 = array.array('f', [0.0]) * (nv * 3)
        for i in range(nv): v3[i*3], v3[i*3+1] = cen[i*2], cen[i*2+1]
        at.data.foreach_set('vector', v3)
    me.update(); me.validate(clean_customdata=False)
    if smooth:
        # the ground is a height field: welded and smooth-shaded it reads as
        # terrain, left as a triangle soup every DEM facet shows
        import bmesh
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.02)
        bm.to_mesh(me); bm.free(); me.shade_smooth()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    me.materials.append(material)
    return ob

mats = {
    'fac': facade_var('facade', LOOK) if VARIETY else facade_mat('facade', LOOK), 'curtain': facade_mat('curtain', LOOK, curtain=True),
    'ground': plain_mat('ground', LOOK, lighten={'model': 0.7, 'hybrid': 0.25, 'photo': 0.0}[LOOK]),
    'street': asphalt_mat() if LOOK == 'photo' else plain_mat('street', LOOK, tint={'model': (0.60, 0.58, 0.55, 1), 'hybrid': (0.13, 0.13, 0.135, 1), 'photo': (0.045, 0.045, 0.05, 1)}[LOOK], rough=0.75),
    'mark': plain_mat('mark', LOOK, rough=0.6, lighten={'model': 0.6, 'hybrid': 0.1, 'photo': 0}[LOOK]),
    'paint': plain_mat('paint', LOOK, tint=(0.62, 0.61, 0.58, 1), rough=0.55),
    'hero': facade_var('hero', LOOK) if VARIETY else facade_mat('hero', LOOK),
    'water': water_mat(LOOK), 'leaf': foliage_mat(LOOK),
    'sidewalk': sidewalk_mat(), 'detail': detail_mat(),
}
SKIP = {'bikeways', 'street-uncovered'}

def median_tri_area(pp):
    ar = []
    for t in range(0, len(pp) // 9, max(1, len(pp) // 9 // 400)):
        a = t * 9
        ux, uy = pp[a+3] - pp[a], pp[a+4] - pp[a+1]; wx, wy = pp[a+6] - pp[a], pp[a+7] - pp[a+1]
        ar.append(abs(ux * wy - uy * wx) / 2)
    ar.sort(); return ar[len(ar) // 2] if ar else 0
groups = {}
STREET_RAW = array.array('f'); TERRAIN_TEX = None
for m in d['meshes']:
    if m.get('instanced') or m['layer'] in SKIP: continue
    lay = m['layer']
    if lay == 'water': continue  # the engine's 8 m water raster draws staircases; the sea sheet below replaces it
    if lay == 'buildings': key = 'curtain' if m['mat'] == 'MeshPhongMaterial' else 'fac'
    elif lay in ('heroes', 'caps'): key = 'hero'
    elif lay == 'terrain': key = 'ground'
    elif lay in ('streets', 'rail'): key = 'street'
    elif lay in ('street-markings', 'street-detail'):
        # the engine's paint: thousands of small triangles. The same layer
        # also carries large dark fills (80-220 m² a triangle) that are not
        # paint and that black the street out — kept out by size.
        _ma = median_tri_area(f32(m['pos']))
        if os.environ.get('MARK_DEBUG'):
            print('MARK', lay, round(_ma, 2), len(m['pos']))
            if _ma > float(os.environ['MARK_DEBUG']): continue
        elif _ma > (20 if lay == 'street-markings' else 1.0): continue
        key = 'paint'
    elif lay == 'ground-detail': key = 'detail'
    elif lay == 'water': key = 'water'
    else: key = 'ground'
    zs = 1.0 / TERRAIN_ZEX if lay == 'terrain' else 1.0
    # layers the engine stacks on ONE plane (caps on roofs, detail on the
    # ground, two terrain meshes) shadow each other completely in a path
    # tracer — every layer gets its own few centimetres
    zo = {'streets': 0.06, 'rail': 0.1, 'ground-detail': 0.14, 'caps': 0.12, 'heroes': 0.05, 'street-markings': 0.16, 'street-detail': 0.18}.get(lay, 0.0)
    if lay == 'terrain' and not m.get('tex'): zo = 0.03
    lay = lay + ('.a' if lay == 'terrain' and m.get('tex') else '')
    groups.setdefault((key, lay, zs, zo), ([], [], [], []))
    P, C, E, U = groups[(key, lay, zs, zo)]
    mp, mc = f32(m['pos']), f32(m['col'])
    mu = f32(m['uv']) if (lay == 'terrain.a' and m.get('uv')) else None
    P.extend(mp); C.extend(mc)
    if mu is not None: U.extend(mu); TERRAIN_TEX = m.get('tex')
    if lay == 'streets': STREET_RAW.extend(f32(m['pos']))
    if m.get('cen') and not lay.startswith('terrain'): E.extend(f32(m['cen']))
    else:  # no identity: key on the triangle's own first vertex, rounded to a 30 m cell
        pp = mp
        for t in range(len(pp) // 9):
            cx, cy = round(pp[t*9] / 30) * 30, round(pp[t*9+1] / 30) * 30
            E.extend([cx, cy] * 3)
def dedupe(P, C):
    # the engine stores some triangles twice (a building on two chunks); two
    # coincident faces occlude each other completely under a path tracer
    seen = set(); P2 = array.array('f'); C2 = array.array('f'); drop = 0
    for t in range(len(P) // 9):
        a = t * 9
        vs = sorted((round(P[a+k*3], 1), round(P[a+k*3+1], 1), round(P[a+k*3+2], 1)) for k in range(3))
        key = tuple(vs)
        if key in seen: drop += 1; continue
        seen.add(key); P2.extend(P[a:a+9]); C2.extend(C[a:a+9])
    return P2, C2, drop
if LOOK == 'photo':
    mats['ground'] = ground_mat('ground')
    mats['ground_tex'] = ground_mat('ground_tex', os.path.join(SD, f'{TERRAIN_TEX}.png') if TERRAIN_TEX else None)
else:
    mats['ground_tex'] = mats['ground']
def drop_slivers(P, C, E):
    # a "building" 3 m across and tens of metres tall standing in the bay is a
    # mast or a pole in the footprint record; rendered, it is a white stick
    ext = {}
    for i in range(len(P) // 3):
        k = (round(E[i*2], 1), round(E[i*2+1], 1)); x, y, z = P[i*3], P[i*3+1], P[i*3+2]
        e = ext.get(k)
        if e is None: ext[k] = [x, x, y, y, z, z]
        else:
            if x < e[0]: e[0] = x
            if x > e[1]: e[1] = x
            if y < e[2]: e[2] = y
            if y > e[3]: e[3] = y
            if z < e[4]: e[4] = z
            if z > e[5]: e[5] = z
    bad = {k for k, e in ext.items() if max(e[1] - e[0], e[3] - e[2]) < 3.0 and e[5] - e[4] > 10}
    if not bad: return P, C, E, 0
    P2, C2, E2 = array.array('f'), array.array('f'), array.array('f')
    for t in range(len(P) // 9):
        k = (round(E[t*6], 1), round(E[t*6+1], 1))
        if k in bad: continue
        P2.extend(P[t*9:t*9+9]); C2.extend(C[t*9:t*9+9]); E2.extend(E[t*6:t*6+6])
    return P2, C2, E2, len(bad)
def split_flat(P, C, E):
    # the flat-roof triangles, apart: they get a parapet (see below)
    Pa, Ca, Ea, Pb, Cb, Eb = (array.array('f') for _ in range(6))
    for t in range(len(P) // 9):
        a = t * 9
        ux, uy, uz = P[a+3]-P[a], P[a+4]-P[a+1], P[a+5]-P[a+2]
        wx, wy, wz = P[a+6]-P[a], P[a+7]-P[a+1], P[a+8]-P[a+2]
        nx, ny, nz = uy*wz-uz*wy, uz*wx-ux*wz, ux*wy-uy*wx
        ln = math.sqrt(nx*nx + ny*ny + nz*nz) or 1
        flat = abs(nz) / ln > 0.995 and min(P[a+2], P[a+5], P[a+8]) > 1.0
        (Pb if flat else Pa).extend(P[a:a+9]); (Cb if flat else Ca).extend(C[a:a+9]); (Eb if flat else Ea).extend(E[t*6:t*6+6])
    return (Pa, Ca, Ea), (Pb, Cb, Eb)

def parapet(ob, thick=0.32, depth=0.75):
    # a flat roof is a tray: the rim stays at the roof line, the deck drops
    # behind it, and the rim's inner face catches a line of shadow
    import bmesh
    me = ob.data; bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.08)
    for f in bm.faces:
        if f.normal.z < 0: f.normal_flip()
    # use_even_offset keeps the rim's width true on a corner by dividing by
    # the corner's sine — on a sliver triangle that is kilometres (it drew a
    # wall across the whole frame). Plain offset, and any vertex the inset
    # still threw more than 2 m sideways is put back where it came from.
    # keyed on the vertex itself: after remove_doubles the index numbers are
    # stale, and keying on them "restored" 43 480 vertices to other vertices'
    # places and tore the roofs apart
    orig = {v: v.co.copy() for v in bm.verts}
    res = bmesh.ops.inset_region(bm, faces=list(bm.faces), thickness=thick, depth=-depth, use_even_offset=False, use_boundary=True)
    bm.verts.ensure_lookup_table()
    moved = 0
    for v in bm.verts:
        o_ = orig.get(v)
        if o_ is not None and (Vector((v.co.x - o_.x, v.co.y - o_.y)).length > 2.0):
            v.co.x, v.co.y = o_.x, o_.y; moved += 1
    if moved: print('parapet: pulled back', moved)
    bm.to_mesh(me); bm.free(); me.update()

def close_roofs(P, C, E):
    # 3-5 % of buildings reach the export with walls and no roof (a gap in the
    # engine's own data; measured 149-208 a district). From above that is a
    # hollow box. The top edges of their walls are chained into loops and
    # filled — scanfill keeps a courtyard's hole a hole.
    import bmesh
    walls, roofed, top = {}, set(), {}
    for t in range(len(P) // 9):
        a = t * 9
        ux, uy, uz = P[a+3]-P[a], P[a+4]-P[a+1], P[a+5]-P[a+2]
        wx, wy, wz = P[a+6]-P[a], P[a+7]-P[a+1], P[a+8]-P[a+2]
        nx, ny, nz = uy*wz-uz*wy, uz*wx-ux*wz, ux*wy-uy*wx
        ln = math.sqrt(nx*nx + ny*ny + nz*nz) or 1
        k = (round(E[t*6], 1), round(E[t*6+1], 1))
        if abs(nz) / ln > 0.3: roofed.add(k)
        else:
            walls.setdefault(k, []).append(t)
            top[k] = max(top.get(k, -1e9), P[a+2], P[a+5], P[a+8])
    added = 0
    for k, ts in walls.items():
        if k in roofed: continue
        zt = top[k]; bm = bmesh.new(); vmap = {}
        def V(x, y):
            kk = (round(x, 2), round(y, 2))
            if kk not in vmap: vmap[kk] = bm.verts.new((x, y, zt))
            return vmap[kk]
        for t in ts:
            a = t * 9
            up = [i for i in range(3) if abs(P[a+i*3+2] - zt) < 0.05]
            if len(up) == 2:
                i, j = up
                va, vb = V(P[a+i*3], P[a+i*3+1]), V(P[a+j*3], P[a+j*3+1])
                if va is not vb and bm.edges.get((va, vb)) is None: bm.edges.new((va, vb))
        if len(bm.edges) >= 3:
            res = bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=list(bm.edges))
            col = C[ts[0]*9:ts[0]*9+3]
            for f in [g for g in res['geom'] if isinstance(g, bmesh.types.BMFace)]:
                vs = [v.co for v in f.verts]
                if len(vs) != 3: continue
                for v in vs: P.extend((v.x, v.y, v.z)); C.extend(col); E.extend(k)
                added += 1
        bm.free()
    return added

FLAT_ROOFS = []
for (key, lay, zs, zo), (P, C, E, U) in groups.items():
    if lay == 'buildings' and len(E) == len(P) // 3 * 2 and LOOK == 'photo':
        nr = close_roofs(P, C, E)
        if nr: print('roofs closed', nr, 'triangles')
    if lay == 'buildings' and len(E) == len(P) // 3 * 2:
        P, C, E, nb = drop_slivers(P, C, E)
        if nb: print('slivers dropped', nb)
        if LOOK == 'photo' and os.environ.get('PARAPET', '1') == '1':
            (P, C, E), (Pf, Cf, Ef) = split_flat(P, C, E)
            if len(Pf): FLAT_ROOFS.append(build(f'{lay}.{key}.flat', Pf, Cf, mats[key], zs, zo, Ef))
    if key == 'ground' and U: key = 'ground_tex'
    build(f'{lay}.{key}', P, C, mats[key], zs, zo, E, U or None, smooth=lay.startswith('terrain'))
for ob in FLAT_ROOFS:
    parapet(ob); print('parapets on', ob.name, len(ob.data.polygons))
# ── THE SEA: one sheet just above sea-level ground, cut by the water mask ──
# `water_mask.py` wrote sea.png (R = water, G = metres to shore x2) from the
# engine's own water polygons. The engine's ground runs on under the bay at
# elevation 0, so the sheet sits 12 cm above it and is transparent on land.
def sea_sheet():
    mp_ = os.path.join(SD, 'sea.png'); mj = os.path.join(SD, 'sea.json')
    if not (os.path.exists(mp_) and os.path.exists(mj)): return
    g = json.load(open(mj))
    if g.get('water_share', 0) < 0.001: return
    ox, oy, w, h = g['ox'], g['oy'], g['w'], g['h']
    z = 0.12
    me = bpy.data.meshes.new('sea')
    me.from_pydata([(ox, oy, z), (ox + w, oy, z), (ox + w, oy + h, z), (ox, oy + h, z)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new('sea', me); sc.collection.objects.link(ob)
    me.materials.append(sea_mat(mp_, ox, oy, w, h))
    # and a floor of deep water under everything: a gap the engine left
    # between its ground and its water reads as sea, never as the void
    fl = bpy.data.meshes.new('seafloor')
    fl.from_pydata([(ox, oy, -1.0), (ox + w, oy, -1.0), (ox + w, oy + h, -1.0), (ox, oy + h, -1.0)], [], [(0, 1, 2, 3)])
    fo = bpy.data.objects.new('seafloor', fl); sc.collection.objects.link(fo)
    fm = bpy.data.materials.new('seafloor'); fm.use_nodes = True
    b_ = fm.node_tree.nodes['Principled BSDF']; b_.inputs['Base Color'].default_value = (0.012, 0.05, 0.075, 1); b_.inputs['Roughness'].default_value = 0.08
    fl.materials.append(fm)
sea_sheet()
print('meshes', round(time.time() - t0, 1), 's')


# ── BAY WINDOWS: San Francisco's own signature, on the street side of houses ─
# A canted box, 2.8 m at the wall and 1.6 m at the front, 0.75 m deep, from
# above the garage floor to under the cornice. Only on a wall with nothing
# within 3 m in front of it — a party wall, or a wall turned away from the
# camera (build() faces every triangle to it, so those normals point inward
# and their ray meets the building's own far side), never gets one.
def bay_proto():
    V = [(-1.4, 0, 0), (1.4, 0, 0), (0.8, 0.75, 0), (-0.8, 0.75, 0),
         (-1.4, 0, 1), (1.4, 0, 1), (0.8, 0.75, 1), (-0.8, 0.75, 1)]
    F = [(0, 3, 2, 1), (4, 5, 6, 7), (3, 7, 6, 2), (0, 4, 7, 3), (1, 2, 6, 5)]
    me = bpy.data.meshes.new('bay'); me.from_pydata(V, [], F); me.update()
    ob = bpy.data.objects.new('bay', me); me.materials.append(mats['fac'])
    bc = bpy.data.collections.new('bay'); sc.collection.children.link(bc); bc.objects.link(ob)
    return bc

def bay_scatter(obj, bc):
    ng = bpy.data.node_groups.new('bays', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    n = ng.nodes; lk = ng.links.new
    gi = n.new('NodeGroupInput'); go = n.new('NodeGroupOutput')
    def mth(op, a, b=None):
        m_ = n.new('ShaderNodeMath'); m_.operation = op
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): m_.inputs[i].default_value = v
            else: lk(v, m_.inputs[i])
        return m_.outputs[0]
    def attr(name):
        a_ = n.new('GeometryNodeInputNamedAttribute'); a_.data_type = 'FLOAT'; a_.inputs['Name'].default_value = name; return a_.outputs[0]
    def band(a_, b_):
        m_ = n.new('FunctionNodeBooleanMath'); m_.operation = 'AND'; lk(a_, m_.inputs[0]); lk(b_, m_.inputs[1]); return m_.outputs[0]
    def cmp(val, op, k):
        c_ = n.new('FunctionNodeCompare'); c_.data_type = 'FLOAT'; c_.operation = op; lk(val, c_.inputs[0]); c_.inputs[1].default_value = k; return c_.outputs[0]
    nrm = n.new('GeometryNodeInputNormal'); ns = n.new('ShaderNodeSeparateXYZ'); lk(nrm.outputs[0], ns.inputs[0])
    vertical = cmp(mth('ABSOLUTE', ns.outputs[2]), 'LESS_THAN', 0.08)
    house = band(cmp(attr('bh'), 'LESS_THAN', 16.0), cmp(attr('bh'), 'GREATER_THAN', 6.5))
    dist = n.new('GeometryNodeDistributePointsOnFaces'); dist.distribute_method = 'POISSON'
    lk(gi.outputs[0], dist.inputs['Mesh']); lk(band(vertical, house), dist.inputs['Selection'])
    dist.inputs['Density Max'].default_value = 0.12; dist.inputs['Distance Min'].default_value = 5.5; dist.inputs['Seed'].default_value = 31
    # the normal, captured at each point as the distribution sampled it
    dn = dist.outputs['Normal']; dns = n.new('ShaderNodeSeparateXYZ'); lk(dn, dns.inputs[0])
    # sit the point at the first floor, and measure the bay's height
    foot, top = attr('bfoot'), attr('btop')
    z0 = mth('ADD', foot, 3.0)
    hgt = mth('MINIMUM', mth('SUBTRACT', mth('SUBTRACT', top, 1.1), z0), 7.0)
    pos = n.new('GeometryNodeInputPosition'); ps = n.new('ShaderNodeSeparateXYZ'); lk(pos.outputs[0], ps.inputs[0])
    np_ = n.new('ShaderNodeCombineXYZ'); lk(ps.outputs[0], np_.inputs[0]); lk(ps.outputs[1], np_.inputs[1]); lk(z0, np_.inputs[2])
    # the point's own normal, stored before anything moves it
    stn = n.new('GeometryNodeStoreNamedAttribute'); stn.data_type = 'FLOAT_VECTOR'; stn.domain = 'POINT'; stn.inputs['Name'].default_value = 'bay_n'
    lk(dist.outputs['Points'], stn.inputs['Geometry']); lk(dn, stn.inputs['Value'])
    sth = n.new('GeometryNodeStoreNamedAttribute'); sth.data_type = 'FLOAT'; sth.domain = 'POINT'; sth.inputs['Name'].default_value = 'bay_h'
    lk(stn.outputs[0], sth.inputs['Geometry']); lk(hgt, sth.inputs['Value'])
    sp = n.new('GeometryNodeSetPosition'); lk(sth.outputs[0], sp.inputs['Geometry']); lk(np_.outputs[0], sp.inputs['Position'])
    # party wall test: a ray out of the wall, 3 m, must meet nothing
    bn = n.new('GeometryNodeInputNamedAttribute'); bn.data_type = 'FLOAT_VECTOR'; bn.inputs['Name'].default_value = 'bay_n'
    p2 = n.new('GeometryNodeInputPosition')
    src = n.new('ShaderNodeVectorMath'); src.operation = 'MULTIPLY_ADD'; lk(bn.outputs[0], src.inputs[0]); src.inputs[1].default_value = (0.25, 0.25, 0.25); lk(p2.outputs[0], src.inputs[2])
    rc = n.new('GeometryNodeRaycast'); lk(gi.outputs[0], rc.inputs['Target Geometry']); lk(src.outputs[0], rc.inputs['Source Position'])
    lk(bn.outputs[0], rc.inputs['Ray Direction']); rc.inputs['Ray Length'].default_value = 3.0
    bh_ = n.new('GeometryNodeInputNamedAttribute'); bh_.data_type = 'FLOAT'; bh_.inputs['Name'].default_value = 'bay_h'
    short = cmp(bh_.outputs[0], 'LESS_THAN', 2.6)
    drop = n.new('FunctionNodeBooleanMath'); drop.operation = 'OR'; lk(rc.outputs['Is Hit'], drop.inputs[0]); lk(short, drop.inputs[1])
    dl = n.new('GeometryNodeDeleteGeometry'); dl.domain = 'POINT'; lk(sp.outputs[0], dl.inputs['Geometry']); lk(drop.outputs[0], dl.inputs['Selection'])
    # turn the prototype's +Y onto the wall normal: yaw = atan2(-nx, ny)
    bns = n.new('ShaderNodeSeparateXYZ'); lk(bn.outputs[0], bns.inputs[0])
    yaw = mth('ARCTAN2', mth('MULTIPLY', bns.outputs[0], -1.0), bns.outputs[1])
    rot = n.new('ShaderNodeCombineXYZ'); lk(yaw, rot.inputs[2])
    scl = n.new('ShaderNodeCombineXYZ'); scl.inputs[0].default_value = 1.0; scl.inputs[1].default_value = 1.0; lk(bh_.outputs[0], scl.inputs[2])
    ci = n.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = bc
    ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = True
    ii = n.new('GeometryNodeInstanceOnPoints'); lk(dl.outputs[0], ii.inputs['Points']); lk(ci.outputs[0], ii.inputs['Instance'])
    ii.inputs['Pick Instance'].default_value = True
    lk(rot.outputs[0], ii.inputs['Rotation']); lk(scl.outputs[0], ii.inputs['Scale'])
    # realized, so the house's own attributes (cen, bh, Col…) reach the shader
    rl = n.new('GeometryNodeRealizeInstances'); lk(ii.outputs[0], rl.inputs[0])
    j = n.new('GeometryNodeJoinGeometry'); lk(gi.outputs[0], j.inputs[0]); lk(rl.outputs[0], j.inputs[0]); lk(j.outputs[0], go.inputs[0])
    obj.modifiers.new('bays', 'NODES').node_group = ng

if os.environ.get('BAYS', '1') == '1' and LOOK == 'photo':
    _bc = bay_proto()
    for o in list(sc.objects):
        if o.name == 'buildings.fac': bay_scatter(o, _bc)
    for o in _bc.objects: o.location.z -= 9000

# ── ROOFTOP LIFE: a Geometry Nodes scatter over every flat roof ─────────────
# The record gives footprints and heights, not what stands on a roof. What
# stands on San Francisco's flat roofs is generic and well known — condenser
# boxes, water tanks, stair and elevator penthouses, skylights — so they are
# scattered procedurally, per roof, never placed as if they were data.
def roof_props():
    pc = bpy.data.collections.new('roof_props'); sc.collection.children.link(pc)
    metal = bpy.data.materials.new('prop_metal'); metal.use_nodes = True
    b = metal.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.55, 0.56, 0.57, 1); b.inputs['Roughness'].default_value = 0.45; b.inputs['Metallic'].default_value = 0.6
    white = bpy.data.materials.new('prop_white'); white.use_nodes = True
    b = white.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.78, 0.77, 0.74, 1); b.inputs['Roughness'].default_value = 0.8
    wood = bpy.data.materials.new('prop_wood'); wood.use_nodes = True
    b = wood.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.30, 0.20, 0.13, 1); b.inputs['Roughness'].default_value = 0.85
    glass = bpy.data.materials.new('prop_glass'); glass.use_nodes = True
    b = glass.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.2, 0.28, 0.32, 1); b.inputs['Roughness'].default_value = 0.08
    def add(name, fn, m):
        fn(); o = bpy.context.active_object; o.name = name
        for c in list(o.users_collection): c.objects.unlink(o)
        pc.objects.link(o); o.data.materials.append(m); return o
    add('hvac', lambda: bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.6), scale=(1.6, 1.1, 0.6)), metal)
    add('hvac_big', lambda: bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.9), scale=(3.0, 1.8, 0.9)), metal)
    add('penthouse', lambda: bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.4), scale=(2.4, 2.0, 1.4)), white)
    t = add('tank', lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=1.4, depth=2.6, location=(0, 0, 3.3)), wood)
    add('tank_legs', lambda: bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.0), scale=(1.1, 1.1, 1.0)), metal)
    add('skylight', lambda: bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.25), scale=(1.8, 1.2, 0.25)), glass)
    for o in pc.objects: o.location.z -= 0; o.hide_render = False
    pc.hide_render = False
    return pc

def roof_scatter(obj, props, density=0.011):
    ng = bpy.data.node_groups.new('roof_scatter', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    n = ng.nodes; lk = ng.links.new
    gi = n.new('NodeGroupInput'); go = n.new('NodeGroupOutput')
    nrm = n.new('GeometryNodeInputNormal'); sx = n.new('ShaderNodeSeparateXYZ'); lk(nrm.outputs[0], sx.inputs[0])
    cmp = n.new('FunctionNodeCompare'); cmp.data_type = 'FLOAT'; cmp.operation = 'GREATER_THAN'
    lk(sx.outputs[2], cmp.inputs[0]); cmp.inputs[1].default_value = 0.985
    # not on the ground-level plazas: only roofs above 6 m
    pos = n.new('GeometryNodeInputPosition'); sp = n.new('ShaderNodeSeparateXYZ'); lk(pos.outputs[0], sp.inputs[0])
    hi = n.new('FunctionNodeCompare'); hi.data_type = 'FLOAT'; hi.operation = 'GREATER_THAN'; lk(sp.outputs[2], hi.inputs[0]); hi.inputs[1].default_value = 6.0
    both = n.new('FunctionNodeBooleanMath'); both.operation = 'AND'; lk(cmp.outputs[0], both.inputs[0]); lk(hi.outputs[0], both.inputs[1])
    dist = n.new('GeometryNodeDistributePointsOnFaces'); dist.distribute_method = 'POISSON'
    lk(gi.outputs[0], dist.inputs['Mesh']); lk(both.outputs[0], dist.inputs['Selection'])
    dist.inputs['Density Max'].default_value = density; dist.inputs['Distance Min'].default_value = 5.0
    ci = n.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = props
    ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = True
    def rnd(dtype, lo, hi, seed):
        r = n.new('FunctionNodeRandomValue'); r.data_type = dtype
        live = [s for s in r.inputs if s.name in ('Min', 'Max') and s.type == {'INT': 'INT', 'FLOAT': 'VALUE'}[dtype]]
        live[0].default_value = lo; live[1].default_value = hi
        r.inputs['Seed'].default_value = seed
        return [o for o in r.outputs if o.type == {'INT': 'INT', 'FLOAT': 'VALUE'}[dtype]][0]
    idx = rnd('INT', 0, len(props.objects) - 1, 3)
    quarter = n.new('ShaderNodeMath'); quarter.operation = 'MULTIPLY'; lk(rnd('INT', 0, 3, 5), quarter.inputs[0]); quarter.inputs[1].default_value = math.pi / 2
    rot = n.new('ShaderNodeCombineXYZ'); lk(quarter.outputs[0], rot.inputs[2])
    sca = rnd('FLOAT', 0.7, 1.35, 9)
    inst = n.new('GeometryNodeInstanceOnPoints')
    lk(dist.outputs['Points'], inst.inputs['Points']); lk(ci.outputs[0], inst.inputs['Instance'])
    inst.inputs['Pick Instance'].default_value = True; lk(idx, inst.inputs['Instance Index'])
    lk(rot.outputs[0], inst.inputs['Rotation']); lk(sca, inst.inputs['Scale'])
    j = n.new('GeometryNodeJoinGeometry'); lk(gi.outputs[0], j.inputs[0]); lk(inst.outputs[0], j.inputs[0])
    lk(j.outputs[0], go.inputs[0])
    md = obj.modifiers.new('roof_scatter', 'NODES'); md.node_group = ng

if os.environ.get('ROOF_LIFE', '1') == '1':
    props = roof_props()
    for o in list(sc.objects):
        if o.name.startswith('buildings.'): roof_scatter(o, props)
    # the prototypes themselves sit at the origin: park them out of frame
    for o in props.objects: o.location.z -= 9000


# ── CHIMNEYS on pitched roofs: brick, stucco, a metal flue ──────────────────
def chimney_protos():
    cc = bpy.data.collections.new('chimneys'); sc.collection.children.link(cc)
    def m_(name, col, rough, metal=0.0):
        m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal; return m
    brick, stucco, flue = m_('ch_brick', (0.30, 0.12, 0.08), 0.85), m_('ch_stucco', (0.62, 0.58, 0.52), 0.9), m_('ch_flue', (0.45, 0.46, 0.47), 0.4, 0.8)
    for name, fn, mt in (('ch_b', lambda: bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.2), scale=(0.7, 0.55, 2.4)), brick),
                         ('ch_b2', lambda: bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.1), scale=(1.1, 0.6, 2.2)), brick),
                         ('ch_s', lambda: bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.1), scale=(0.8, 0.8, 2.2)), stucco),
                         ('ch_f', lambda: bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.16, depth=2.2, location=(0, 0, 0.3)), flue)):
        fn(); o = bpy.context.active_object; o.name = name
        for c in list(o.users_collection): c.objects.unlink(o)
        cc.objects.link(o); o.data.materials.append(mt)
    return cc

def chimney_scatter(obj, cc):
    ng = bpy.data.node_groups.new('chimneys', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    n = ng.nodes; lk = ng.links.new
    gi = n.new('NodeGroupInput'); go = n.new('NodeGroupOutput')
    nrm = n.new('GeometryNodeInputNormal'); sx = n.new('ShaderNodeSeparateXYZ'); lk(nrm.outputs[0], sx.inputs[0])
    lo = n.new('FunctionNodeCompare'); lo.data_type = 'FLOAT'; lo.operation = 'GREATER_THAN'; lk(sx.outputs[2], lo.inputs[0]); lo.inputs[1].default_value = 0.45
    hi = n.new('FunctionNodeCompare'); hi.data_type = 'FLOAT'; hi.operation = 'LESS_THAN'; lk(sx.outputs[2], hi.inputs[0]); hi.inputs[1].default_value = 0.96
    both = n.new('FunctionNodeBooleanMath'); both.operation = 'AND'; lk(lo.outputs[0], both.inputs[0]); lk(hi.outputs[0], both.inputs[1])
    dist = n.new('GeometryNodeDistributePointsOnFaces'); dist.distribute_method = 'POISSON'
    lk(gi.outputs[0], dist.inputs['Mesh']); lk(both.outputs[0], dist.inputs['Selection'])
    dist.inputs['Density Max'].default_value = 0.03; dist.inputs['Distance Min'].default_value = 6.5; dist.inputs['Seed'].default_value = 17
    ci = n.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = cc
    ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = True
    rv = n.new('FunctionNodeRandomValue'); rv.data_type = 'INT'
    live = [x for x in rv.inputs if x.name in ('Min', 'Max') and x.type == 'INT']; live[0].default_value = 0; live[1].default_value = len(cc.objects) - 1
    rz = n.new('FunctionNodeRandomValue'); rz.data_type = 'FLOAT'
    live = [x for x in rz.inputs if x.name in ('Min', 'Max') and x.type == 'VALUE']; live[0].default_value = 0; live[1].default_value = 6.283
    rot = n.new('ShaderNodeCombineXYZ'); lk([o for o in rz.outputs if o.type == 'VALUE'][0], rot.inputs[2])
    ii = n.new('GeometryNodeInstanceOnPoints')
    lk(dist.outputs['Points'], ii.inputs['Points']); lk(ci.outputs[0], ii.inputs['Instance'])
    ii.inputs['Pick Instance'].default_value = True; lk([o for o in rv.outputs if o.type == 'INT'][0], ii.inputs['Instance Index'])
    lk(rot.outputs[0], ii.inputs['Rotation'])
    j = n.new('GeometryNodeJoinGeometry'); lk(gi.outputs[0], j.inputs[0]); lk(ii.outputs[0], j.inputs[0]); lk(j.outputs[0], go.inputs[0])
    obj.modifiers.new('chimneys', 'NODES').node_group = ng

if os.environ.get('CHIMNEYS', '1') == '1' and LOOK == 'photo':
    ccol = chimney_protos()
    for o in list(sc.objects):
        if o.name == 'buildings.fac': chimney_scatter(o, ccol)
    for o in ccol.objects: o.location.z -= 9000

# ── SOLAR ARRAYS on about one flat roof in five ─────────────────────────────
def solar_proto():
    m = bpy.data.materials.new('pv'); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    br = nt.nodes.new('ShaderNodeTexBrick'); br.inputs['Scale'].default_value = 1.0
    br.inputs['Color1'].default_value = (0.006, 0.010, 0.028, 1); br.inputs['Color2'].default_value = (0.009, 0.014, 0.036, 1)
    br.inputs['Mortar'].default_value = (0.55, 0.57, 0.6, 1); br.inputs['Mortar Size'].default_value = 0.02
    br.inputs['Brick Width'].default_value = 0.16; br.inputs['Row Height'].default_value = 0.16; br.offset = 0.0
    tc = nt.nodes.new('ShaderNodeTexCoord'); nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
    nt.links.new(br.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.32; b.inputs['Metallic'].default_value = 0.1; b.inputs['Coat Weight'].default_value = 0.15
    frame = bpy.data.materials.new('pv_frame'); frame.use_nodes = True
    frame.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.6, 0.6, 0.62, 1)
    parts = []
    for r in range(2):
        for c in range(3):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(c * 1.75 - 1.75, r * 2.4 - 1.2, 0.35), scale=(1.65, 2.0, 0.05))
            o = bpy.context.active_object; o.rotation_euler.x = math.radians(10); o.data.materials.append(m); parts.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
    arr = parts[0]; arr.name = 'pv_array'; bpy.ops.object.transform_apply(rotation=True)
    for c in list(arr.users_collection): c.objects.unlink(arr)
    pc = bpy.data.collections.new('pv'); sc.collection.children.link(pc); pc.objects.link(arr)
    return pc

def solar_scatter(obj, pc, share=0.2):
    ng = bpy.data.node_groups.new('solar', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    n = ng.nodes; lk = ng.links.new
    gi = n.new('NodeGroupInput'); go = n.new('NodeGroupOutput')
    nrm = n.new('GeometryNodeInputNormal'); sx = n.new('ShaderNodeSeparateXYZ'); lk(nrm.outputs[0], sx.inputs[0])
    flat = n.new('FunctionNodeCompare'); flat.data_type = 'FLOAT'; flat.operation = 'GREATER_THAN'; lk(sx.outputs[2], flat.inputs[0]); flat.inputs[1].default_value = 0.985
    # one draw per BUILDING: the centroid, snapped, as the random ID
    ca = n.new('GeometryNodeInputNamedAttribute'); ca.data_type = 'FLOAT_VECTOR'; ca.inputs['Name'].default_value = 'cen'
    cs = n.new('ShaderNodeSeparateXYZ'); lk(ca.outputs[0], cs.inputs[0])
    def mth(op, a, b=None):
        m_ = n.new('ShaderNodeMath'); m_.operation = op
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): m_.inputs[i].default_value = v
            else: lk(v, m_.inputs[i])
        return m_.outputs[0]
    idf = mth('ADD', mth('MULTIPLY', mth('FLOOR', mth('MULTIPLY', cs.outputs[0], 0.5)), 7919.0), mth('FLOOR', mth('MULTIPLY', cs.outputs[1], 0.5)))
    idi = n.new('FunctionNodeFloatToInt'); lk(idf, idi.inputs[0])
    rv = n.new('FunctionNodeRandomValue'); rv.data_type = 'FLOAT'; rv.inputs['Seed'].default_value = 77; lk(idi.outputs[0], rv.inputs['ID'])
    live = [x for x in rv.inputs if x.name in ('Min', 'Max') and x.type == 'VALUE']; live[0].default_value = 0; live[1].default_value = 1
    pick = n.new('FunctionNodeCompare'); pick.data_type = 'FLOAT'; pick.operation = 'LESS_THAN'; lk([o for o in rv.outputs if o.type == 'VALUE'][0], pick.inputs[0]); pick.inputs[1].default_value = share
    pos = n.new('GeometryNodeInputPosition'); ps = n.new('ShaderNodeSeparateXYZ'); lk(pos.outputs[0], ps.inputs[0])
    high = n.new('FunctionNodeCompare'); high.data_type = 'FLOAT'; high.operation = 'GREATER_THAN'; lk(ps.outputs[2], high.inputs[0]); high.inputs[1].default_value = 5.0
    a1 = n.new('FunctionNodeBooleanMath'); a1.operation = 'AND'; lk(flat.outputs[0], a1.inputs[0]); lk(pick.outputs[0], a1.inputs[1])
    a2 = n.new('FunctionNodeBooleanMath'); a2.operation = 'AND'; lk(a1.outputs[0], a2.inputs[0]); lk(high.outputs[0], a2.inputs[1])
    dist = n.new('GeometryNodeDistributePointsOnFaces'); dist.distribute_method = 'POISSON'
    lk(gi.outputs[0], dist.inputs['Mesh']); lk(a2.outputs[0], dist.inputs['Selection'])
    dist.inputs['Density Max'].default_value = 0.05; dist.inputs['Distance Min'].default_value = 6.0; dist.inputs['Seed'].default_value = 5
    ci = n.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = pc
    # Reset Children only acts on separated children: a whole-collection
    # instance keeps the prototype's parking offset (-9 km) and lands nowhere
    ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = True
    # an array sits wholly on its roof: from each of its four corners a ray
    # down must find the roof within 1 m, or the point is dropped
    pts = dist.outputs['Points']
    pp = n.new('GeometryNodeInputPosition')
    keep = None
    for dx, dy in ((-3.2, -2.8), (3.2, -2.8), (3.2, 2.8), (-3.2, 2.8)):
        off = n.new('ShaderNodeVectorMath'); off.operation = 'ADD'; lk(pp.outputs[0], off.inputs[0]); off.inputs[1].default_value = (dx, dy, 0.8)
        rc = n.new('GeometryNodeRaycast'); lk(gi.outputs[0], rc.inputs['Target Geometry']); lk(off.outputs[0], rc.inputs['Source Position'])
        rc.inputs['Ray Direction'].default_value = (0, 0, -1); rc.inputs['Ray Length'].default_value = 1.8
        if keep is None: keep = rc.outputs['Is Hit']
        else:
            both = n.new('FunctionNodeBooleanMath'); both.operation = 'AND'
            lk(keep, both.inputs[0]); lk(rc.outputs['Is Hit'], both.inputs[1]); keep = both.outputs[0]
    nk = n.new('FunctionNodeBooleanMath'); nk.operation = 'NOT'; lk(keep, nk.inputs[0])
    dl = n.new('GeometryNodeDeleteGeometry'); dl.domain = 'POINT'; lk(pts, dl.inputs['Geometry']); lk(nk.outputs[0], dl.inputs['Selection'])
    ii = n.new('GeometryNodeInstanceOnPoints'); lk(dl.outputs[0], ii.inputs['Points']); lk(ci.outputs[0], ii.inputs['Instance'])
    ii.inputs['Pick Instance'].default_value = True
    j = n.new('GeometryNodeJoinGeometry'); lk(gi.outputs[0], j.inputs[0]); lk(ii.outputs[0], j.inputs[0]); lk(j.outputs[0], go.inputs[0])
    obj.modifiers.new('solar', 'NODES').node_group = ng

if os.environ.get('SOLAR', '1') == '1' and LOOK == 'photo':
    pvc = solar_proto()
    for o in list(sc.objects):
        if o.name in ('buildings.fac', 'buildings.fac.flat'): solar_scatter(o, pvc)
    for o in pvc.objects: o.location.z -= 9000

# ── PARKED CARS along every curb ─────────────────────────────────────────────
# The curb is the street mesh's own boundary: welded, every edge with a single
# face is where the roadway meets the sidewalk. A car every ~6.5 m on about
# two thirds of the slots, turned to the curb, set 1.3 m in. Generic life, like
# the rooftops — the record has no parked cars.
def car_protos():
    cc = bpy.data.collections.new('cars'); sc.collection.children.link(cc)
    paint = bpy.data.materials.new('car_paint'); paint.use_nodes = True; nt = paint.node_tree
    bs = nt.nodes['Principled BSDF']; at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_type = 'INSTANCER'; at.attribute_name = 'carcol'
    nt.links.new(at.outputs['Color'], bs.inputs['Base Color']); bs.inputs['Roughness'].default_value = 0.25; bs.inputs['Coat Weight'].default_value = 0.8
    win = bpy.data.materials.new('car_glass'); win.use_nodes = True
    b = win.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value = (0.02, 0.025, 0.03, 1); b.inputs['Roughness'].default_value = 0.05
    for i, (L, W, H) in enumerate(((4.5, 1.8, 0.75), (4.9, 1.95, 0.95), (4.2, 1.75, 0.7))):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.2 + H / 2), scale=(L, W, H))
        body = bpy.context.active_object; body.data.materials.append(paint)
        bpy.ops.object.modifier_add(type='BEVEL'); body.modifiers['Bevel'].width = 0.18; body.modifiers['Bevel'].segments = 2
        bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.2, 0, 0.2 + H + 0.28), scale=(L * 0.55, W * 0.9, 0.56))
        cab = bpy.context.active_object; cab.data.materials.append(win)
        bpy.ops.object.modifier_add(type='BEVEL'); cab.modifiers['Bevel'].width = 0.15; cab.modifiers['Bevel'].segments = 2
        bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); cab.select_set(True)
        bpy.context.view_layer.objects.active = body; bpy.ops.object.convert(target='MESH'); bpy.ops.object.join()
        body.name = f'car{i}'
        for c in list(body.users_collection): c.objects.unlink(body)
        cc.objects.link(body)
    return cc

def street_bmesh():
    import bmesh
    bm = bmesh.new(); P = STREET_RAW
    vs = [bm.verts.new((P[i], P[i+1], P[i+2] + 0.06)) for i in range(0, len(P), 3)]
    for t in range(0, len(vs) - 2, 3):
        try: bm.faces.new((vs[t], vs[t+1], vs[t+2]))
        except ValueError: pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.05)
    bm.edges.ensure_lookup_table(); return bm

def sidewalks(bm, width=2.8, curb=0.15):
    # the band of pavement on the far side of every curb, and the curb face
    P, F = [], []
    for e in bm.edges:
        if len(e.link_faces) != 1: continue
        a, b = e.verts[0].co.copy(), e.verts[1].co.copy()
        v = b - a; Lh = math.hypot(v.x, v.y)
        if Lh < 0.3: continue
        inward = e.link_faces[0].calc_center_median() - (a + b) / 2; inward.z = 0
        out = Vector((-v.y, v.x, 0)).normalized()
        if out.dot(inward) > 0: out = -out
        up = Vector((0, 0, curb))
        q = [a + up, b + up, b + up + out * width, a + up + out * width]
        k = len(P); P += q; F.append((k, k+1, k+2, k+3))
        k = len(P); P += [a, b, b + up, a + up]; F.append((k, k+1, k+2, k+3))
    me = bpy.data.meshes.new('sidewalks'); me.from_pydata([tuple(p) for p in P], [], F); me.update()
    ob = bpy.data.objects.new('sidewalks', me); sc.collection.objects.link(ob); me.materials.append(mats['sidewalk'])
    print('sidewalk quads', len(F))

def parked_cars(bm, cc):
    import random as R
    R.seed(11)
    pts, rots, cols = [], [], []
    PAL = [(0.9, 0.9, 0.9)] * 5 + [(0.02, 0.02, 0.025)] * 5 + [(0.55, 0.56, 0.58)] * 4 + [(0.25, 0.26, 0.28)] * 3 + [(0.05, 0.12, 0.3), (0.45, 0.04, 0.04), (0.1, 0.25, 0.15), (0.6, 0.5, 0.35)]
    for e in bm.edges:
        if len(e.link_faces) != 1: continue
        a, b = e.verts[0].co.copy(), e.verts[1].co.copy()
        v = b - a; Lh = math.hypot(v.x, v.y)
        if Lh < 7 or abs(v.z) / Lh > 0.25: continue
        f = e.link_faces[0]; inward = (f.calc_center_median() - (a + b) / 2); inward.z = 0
        nrm = Vector((-v.y, v.x, 0)).normalized()
        if nrm.dot(inward) < 0: nrm = -nrm
        ang = math.atan2(v.y, v.x); k = int((Lh - 3) // 6.5)
        for i in range(k):
            if R.random() > 0.68: continue
            t = (1.5 + 3.25 + i * 6.5) / Lh
            p = a + v * t + nrm * 1.3; p.z += 0.08
            pts.append(p); rots.append(ang + (math.pi if R.random() < 0.5 else 0) + R.uniform(-0.03, 0.03)); cols.append(R.choice(PAL))
    me = bpy.data.meshes.new('car_points'); me.vertices.add(len(pts))
    me.vertices.foreach_set('co', [c for p in pts for c in p])
    ra = me.attributes.new('rot', 'FLOAT', 'POINT'); ra.data.foreach_set('value', rots)
    ca = me.attributes.new('carcol', 'FLOAT_COLOR', 'POINT'); ca.data.foreach_set('color', [x for c in cols for x in (*c, 1.0)])
    ob = bpy.data.objects.new('cars', me); sc.collection.objects.link(ob)
    ng = bpy.data.node_groups.new('cars', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    n = ng.nodes; lk = ng.links.new
    gi = n.new('NodeGroupInput'); go = n.new('NodeGroupOutput')
    ci = n.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = cc
    ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = True
    rn = n.new('GeometryNodeInputNamedAttribute'); rn.data_type = 'FLOAT'; rn.inputs['Name'].default_value = 'rot'
    cx = n.new('ShaderNodeCombineXYZ'); lk(rn.outputs[0], cx.inputs[2])
    rv = n.new('FunctionNodeRandomValue'); rv.data_type = 'INT'
    live = [s2 for s2 in rv.inputs if s2.name in ('Min', 'Max') and s2.type == 'INT']; live[0].default_value = 0; live[1].default_value = len(cc.objects) - 1
    ii = n.new('GeometryNodeInstanceOnPoints')
    lk(gi.outputs[0], ii.inputs['Points']); lk(ci.outputs[0], ii.inputs['Instance'])
    ii.inputs['Pick Instance'].default_value = True; lk([o for o in rv.outputs if o.type == 'INT'][0], ii.inputs['Instance Index'])
    lk(cx.outputs[0], ii.inputs['Rotation'])
    lk(ii.outputs[0], go.inputs[0])
    ob.modifiers.new('cars', 'NODES').node_group = ng
    for o in cc.objects: o.location.z -= 9000
    print('cars', len(pts))

SB = street_bmesh() if len(STREET_RAW) else None
if SB is not None and LOOK == 'photo': sidewalks(SB)
if SB is not None and os.environ.get('CARS', '1') == '1':
    parked_cars(SB, car_protos())

# ── trees: one procedural crown, instanced ─────────────────────────────
seen = set(); pts = []
for t in d['trees']:
    for (x, y, z, sxz, sy, rot, r, g, b) in t['inst']:
        k = (round(x), round(y))
        if k in seen: continue
        seen.add(k); pts.append((x, y, z, max(1.6, 1.22 * sxz)))
def crown(name, seed, kind):
    """a canopy of clumps, not a ball: 8-14 displaced spheres packed into an
    ellipsoid, and a trunk. kind 0 round, 1 columnar, 2 spreading"""
    random.seed(seed)
    sx, sz = {0: (1.0, 0.9), 1: (0.72, 1.35), 2: (1.25, 0.7)}[kind]
    parts = []
    for i in range(random.randint(16, 24)):
        while True:
            p = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1)))
            if p.length <= 1: break
        rr = random.uniform(0.26, 0.44)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=rr, location=(p.x * (sx - rr * 0.6), p.y * (sx - rr * 0.6), p.z * (sz - rr * 0.6)))
        parts.append(bpy.context.active_object)
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.07, depth=1.2, location=(0, 0, -sz * 0.9))
    trunk = bpy.context.active_object
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
    c = parts[0]; c.name = name
    tex = bpy.data.textures.new(name + '_clouds', 'CLOUDS'); tex.noise_scale = 0.28
    md = c.modifiers.new('disp', 'DISPLACE'); md.texture = tex; md.strength = 0.24; md.mid_level = 0.5
    bpy.context.view_layer.objects.active = c; bpy.ops.object.modifier_apply(modifier='disp')
    bpy.ops.object.shade_smooth()
    # ── LEAF CARDS: the canopy's surface is leaves, not a skin ──
    # ~1 200 small quads over the displaced core, each tilted off the surface
    # normal and turned at random: the silhouette frays, the sun gets in
    import bmesh
    bm = bmesh.new(); bm.from_mesh(c.data); bm.faces.ensure_lookup_table()
    areas = [f.calc_area() for f in bm.faces]; tot = sum(areas)
    cum, acc = [], 0.0
    for a_ in areas: acc += a_; cum.append(acc)
    import bisect
    verts, faces = [], []
    for k in range(int(os.environ.get('LEAF_CARDS', 2600))):
        f = bm.faces[min(len(areas) - 1, bisect.bisect_left(cum, random.random() * tot))]
        vs = [v.co for v in f.verts]
        a1, a2 = random.random(), random.random()
        if a1 + a2 > 1: a1, a2 = 1 - a1, 1 - a2
        p0 = vs[0] + (vs[1] - vs[0]) * a1 + (vs[2] - vs[0]) * a2
        nrm = f.normal.copy(); jit = Vector((random.gauss(0, 0.6), random.gauss(0, 0.6), random.gauss(0, 0.6)))
        nn = (nrm + jit).normalized(); p0 = p0 + nrm * random.uniform(-0.02, 0.09)
        t1 = nn.orthogonal().normalized(); t2 = nn.cross(t1)
        ang = random.uniform(0, 6.283); u_ = t1 * math.cos(ang) + t2 * math.sin(ang); v_ = nn.cross(u_)
        sz = random.uniform(0.06, 0.11)
        base = len(verts)
        # a leaf, not a square: pointed at both ends, widest a third along
        verts += [tuple(p0 + (u_ * sx_ + v_ * sy_) * sz) for sx_, sy_ in ((-1.0, 0.0), (-0.3, -0.45), (0.5, -0.3), (1.0, 0.0), (0.5, 0.3), (-0.3, 0.45))]
        faces.append((base, base + 1, base + 2, base + 3, base + 4, base + 5))
    bm.free()
    lm = bpy.data.meshes.new(name + '_leaves'); lm.from_pydata(verts, [], faces); lm.update()
    lo = bpy.data.objects.new(name + '_leaves', lm); sc.collection.objects.link(lo); lm.materials.append(mats['leaf'])
    for v in c.data.vertices: v.co *= 0.94                      # the core sits just inside the leaves
    c.data.materials.append(mats['leaf_core'])
    bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True); c.select_set(True)
    bpy.context.view_layer.objects.active = c; bpy.ops.object.join()
    trunk.data.materials.append(mats['bark'])
    bpy.ops.object.select_all(action='DESELECT'); trunk.select_set(True); c.select_set(True)
    bpy.context.view_layer.objects.active = c; bpy.ops.object.join()
    c.hide_render = True
    return c, sz

def bark_mat():
    m, nt, o = mat('bark'); p = principled(nt, (0.10, 0.08, 0.06, 1), rough=0.9); L(nt, p.outputs[0], o.inputs[0]); return m

def foliage_v2():
    """leaf-scale grain in the normal (the canopy stops reading as a smooth
    ball), a green that varies per tree, and some light through the leaves"""
    m, nt, o = mat('foliage')
    geo = nt.nodes.new('ShaderNodeNewGeometry'); ob = nt.nodes.new('ShaderNodeObjectInfo')
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'LINEAR'
    set_ramp(ramp.color_ramp, [(0.15, 0.28, 0.07), (0.21, 0.35, 0.09), (0.29, 0.40, 0.12), (0.17, 0.26, 0.10), (0.34, 0.38, 0.15), (0.38, 0.45, 0.17)])
    ramp.color_ramp.interpolation = 'LINEAR'
    L(nt, ob.outputs['Random'], ramp.inputs[0])
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 2.2; n.inputs['Detail'].default_value = 6; L(nt, geo.outputs['Position'], n.inputs['Vector'])
    c = nt.nodes.new('ShaderNodeMix'); c.data_type = 'RGBA'; c.blend_type = 'MULTIPLY'
    L(nt, math_node(nt, 'MULTIPLY', n.outputs['Fac'], 0.6), c.inputs[0]); L(nt, ramp.outputs[0], c.inputs[6]); c.inputs[7].default_value = (0.62, 0.68, 0.55, 1)
    p = principled(nt, c.outputs[2], rough=0.62, spec=0.35)
    p.inputs['Subsurface Weight'].default_value = 0.0
    tl = nt.nodes.new('ShaderNodeBsdfTranslucent'); L(nt, c.outputs[2], tl.inputs['Color'])
    mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs[0].default_value = 0.22; L(nt, p.outputs[0], mx.inputs[1]); L(nt, tl.outputs[0], mx.inputs[2])
    leaf = nt.nodes.new('ShaderNodeTexVoronoi'); leaf.inputs['Scale'].default_value = 9.0; L(nt, geo.outputs['Position'], leaf.inputs['Vector'])
    bm = nt.nodes.new('ShaderNodeBump'); bm.inputs['Strength'].default_value = 0.85; bm.inputs['Distance'].default_value = 0.08
    L(nt, leaf.outputs['Distance'], bm.inputs['Height']); L(nt, bm.outputs[0], p.inputs['Normal']); L(nt, bm.outputs[0], tl.inputs['Normal'])
    L(nt, mx.outputs[0], o.inputs[0]); return m

if LOOK == 'photo': mats['leaf'] = foliage_v2()
# what shows between the leaves is the inside of the crown: shade, not a skin
_core = bpy.data.materials.new('leaf_core'); _core.use_nodes = True
_cb = _core.node_tree.nodes['Principled BSDF']; _cb.inputs['Base Color'].default_value = (0.025, 0.045, 0.015, 1); _cb.inputs['Roughness'].default_value = 0.9
mats['leaf_core'] = _core
mats['bark'] = bark_mat()
protos = [crown(f'crown{i}', 100 + i, (0, 0, 0, 0, 1, 1, 2, 2)[i]) for i in range(8)]
tcoll = bpy.data.collections.new('trees'); sc.collection.children.link(tcoll)
random.seed(5)
for i, (x, y, z, r) in enumerate(pts):
    # street trees mostly round; a columnar or spreading one now and then
    k = random.choice((0, 0, 0, 1, 2, 3, 4, 5, 6, 7) if r > 2.2 else (0, 1, 2, 3, 4, 5))
    p, sz = protos[k]
    o = bpy.data.objects.new(f't{i}', p.data); tcoll.objects.link(o)
    s_ = r * random.uniform(0.9, 1.1)
    o.location = (x, y, z + s_ * sz * 1.05 + 0.4); o.scale = (s_, s_, s_ * random.uniform(0.9, 1.15)); o.rotation_euler.z = random.uniform(0, 6.283)
print('trees', len(pts))

# ── BACKYARDS: shrubs and small trees on every piece of open ground ────────
# From the air a San Francisco block is green inside. The record has street
# and park trees, not gardens, so the gardens are scattered procedurally —
# only where nothing covers the ground: a ray cast straight up from each
# candidate point must hit no roof, street, pavement or lawn.
def shrub(name, seed):
    random.seed(seed); parts = []
    for i in range(random.randint(5, 9)):
        p = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(0, 1)))
        rr = random.uniform(0.35, 0.6)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=rr, location=(p.x * 0.7, p.y * 0.7, 0.35 + p.z * 0.45))
        parts.append(bpy.context.active_object)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]; bpy.ops.object.join()
    c = parts[0]; c.name = name
    tex = bpy.data.textures.new(name + '_c', 'CLOUDS'); tex.noise_scale = 0.25
    md = c.modifiers.new('d', 'DISPLACE'); md.texture = tex; md.strength = 0.2
    bpy.ops.object.modifier_apply(modifier='d'); bpy.ops.object.shade_smooth()
    c.data.materials.append(mats['leaf']); return c

def yard_protos():
    yc = bpy.data.collections.new('yard'); sc.collection.children.link(yc)
    objs = [shrub(f'shrub{i}', 300 + i) for i in range(5)]
    for i, (p, sz) in enumerate(protos[:3]):
        o = p.copy(); o.data = p.data.copy(); o.name = f'ytree{i}'
        me = o.data
        for v in me.vertices:                                 # trunk foot at the origin, 2x, in the mesh
            v.co.z += sz * 0.9 + 0.6; v.co *= 2.0
        sc.collection.objects.link(o); objs.append(o)
    for o in objs:
        for c in list(o.users_collection): c.objects.unlink(o)
        yc.objects.link(o); o.hide_render = False
    return yc

def yard_scatter(obj, yc, covers):
    ng = bpy.data.node_groups.new('yard', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    n = ng.nodes; lk = ng.links.new
    gi = n.new('NodeGroupInput'); go = n.new('NodeGroupOutput')
    dist = n.new('GeometryNodeDistributePointsOnFaces'); dist.distribute_method = 'POISSON'
    lk(gi.outputs[0], dist.inputs['Mesh']); dist.inputs['Density Max'].default_value = 0.09; dist.inputs['Distance Min'].default_value = 2.2; dist.inputs['Seed'].default_value = 23
    j = n.new('GeometryNodeJoinGeometry')
    for o in covers:
        oi = n.new('GeometryNodeObjectInfo'); oi.inputs['Object'].default_value = o; oi.transform_space = 'RELATIVE'
        rl = n.new('GeometryNodeRealizeInstances'); lk(oi.outputs['Geometry'], rl.inputs[0]); lk(rl.outputs[0], j.inputs[0])
    rc = n.new('GeometryNodeRaycast')
    lk(j.outputs[0], rc.inputs['Target Geometry']); rc.inputs['Ray Direction'].default_value = (0, 0, 1); rc.inputs['Ray Length'].default_value = 400
    # gardens live behind houses: full density within 25 m of a building,
    # one point in ten further out (scrub on a hillside, never a lawn full of bushes)
    jb = n.new('GeometryNodeJoinGeometry')
    for o in covers:
        if o.name.startswith('buildings.'):
            ob_ = n.new('GeometryNodeObjectInfo'); ob_.inputs['Object'].default_value = o; ob_.transform_space = 'RELATIVE'
            lk(ob_.outputs['Geometry'], jb.inputs[0])
    px = n.new('GeometryNodeProximity'); px.target_element = 'FACES'; lk(jb.outputs[0], px.inputs[0])
    far = n.new('FunctionNodeCompare'); far.data_type = 'FLOAT'; far.operation = 'GREATER_THAN'; lk(px.outputs['Distance'], far.inputs[0]); far.inputs[1].default_value = 25.0
    rk = n.new('FunctionNodeRandomValue'); rk.data_type = 'FLOAT'; rk.inputs['Seed'].default_value = 41
    live = [x for x in rk.inputs if x.name in ('Min', 'Max') and x.type == 'VALUE']; live[0].default_value = 0; live[1].default_value = 1
    thin = n.new('FunctionNodeCompare'); thin.data_type = 'FLOAT'; thin.operation = 'GREATER_THAN'; lk([o for o in rk.outputs if o.type == 'VALUE'][0], thin.inputs[0]); thin.inputs[1].default_value = 0.10
    drop_far = n.new('FunctionNodeBooleanMath'); drop_far.operation = 'AND'; lk(far.outputs[0], drop_far.inputs[0]); lk(thin.outputs[0], drop_far.inputs[1])
    drop = n.new('FunctionNodeBooleanMath'); drop.operation = 'OR'; lk(rc.outputs['Is Hit'], drop.inputs[0]); lk(drop_far.outputs[0], drop.inputs[1])
    # the engine's ground runs on under the bay at 0 m: nothing grows there
    pz = n.new('GeometryNodeInputPosition'); pzs = n.new('ShaderNodeSeparateXYZ'); lk(pz.outputs[0], pzs.inputs[0])
    wet = n.new('FunctionNodeCompare'); wet.data_type = 'FLOAT'; wet.operation = 'LESS_THAN'; lk(pzs.outputs[2], wet.inputs[0]); wet.inputs[1].default_value = 0.9
    drop2 = n.new('FunctionNodeBooleanMath'); drop2.operation = 'OR'; lk(drop.outputs[0], drop2.inputs[0]); lk(wet.outputs[0], drop2.inputs[1]); drop = drop2
    dl = n.new('GeometryNodeDeleteGeometry'); dl.domain = 'POINT'
    lk(dist.outputs['Points'], dl.inputs['Geometry']); lk(drop.outputs[0], dl.inputs['Selection'])
    ci = n.new('GeometryNodeCollectionInfo'); ci.inputs['Collection'].default_value = yc
    ci.inputs['Separate Children'].default_value = True; ci.inputs['Reset Children'].default_value = True
    # 5 shrubs, 3 small trees: a tree about one point in six
    rv = n.new('FunctionNodeRandomValue'); rv.data_type = 'FLOAT'
    live = [x for x in rv.inputs if x.name in ('Min', 'Max') and x.type == 'VALUE']; live[0].default_value = 0; live[1].default_value = 1
    rvv = [o for o in rv.outputs if o.type == 'VALUE'][0]
    sh_i = n.new('FunctionNodeRandomValue'); sh_i.data_type = 'INT'
    live = [x for x in sh_i.inputs if x.name in ('Min', 'Max') and x.type == 'INT']; live[0].default_value = 0; live[1].default_value = 4
    tr_i = n.new('FunctionNodeRandomValue'); tr_i.data_type = 'INT'
    live = [x for x in tr_i.inputs if x.name in ('Min', 'Max') and x.type == 'INT']; live[0].default_value = 5; live[1].default_value = 7
    tr_i.inputs['Seed'].default_value = 7
    istree = n.new('FunctionNodeCompare'); istree.data_type = 'FLOAT'; istree.operation = 'LESS_THAN'; lk(rvv, istree.inputs[0]); istree.inputs[1].default_value = 0.17
    sw = n.new('GeometryNodeSwitch'); sw.input_type = 'INT'
    lk(istree.outputs[0], sw.inputs['Switch']); lk([o for o in sh_i.outputs if o.type == 'INT'][0], sw.inputs['False']); lk([o for o in tr_i.outputs if o.type == 'INT'][0], sw.inputs['True'])
    rz = n.new('FunctionNodeRandomValue'); rz.data_type = 'FLOAT'; rz.inputs['Seed'].default_value = 3
    live = [x for x in rz.inputs if x.name in ('Min', 'Max') and x.type == 'VALUE']; live[0].default_value = 0; live[1].default_value = 6.283
    rot = n.new('ShaderNodeCombineXYZ'); lk([o for o in rz.outputs if o.type == 'VALUE'][0], rot.inputs[2])
    scl = n.new('FunctionNodeRandomValue'); scl.data_type = 'FLOAT'; scl.inputs['Seed'].default_value = 9
    live = [x for x in scl.inputs if x.name in ('Min', 'Max') and x.type == 'VALUE']; live[0].default_value = 0.7; live[1].default_value = 1.4
    ii = n.new('GeometryNodeInstanceOnPoints')
    lk(dl.outputs[0], ii.inputs['Points']); lk(ci.outputs[0], ii.inputs['Instance'])
    ii.inputs['Pick Instance'].default_value = True; lk(sw.outputs[0], ii.inputs['Instance Index'])
    lk(rot.outputs[0], ii.inputs['Rotation']); lk([o for o in scl.outputs if o.type == 'VALUE'][0], ii.inputs['Scale'])
    jj = n.new('GeometryNodeJoinGeometry'); lk(gi.outputs[0], jj.inputs[0]); lk(ii.outputs[0], jj.inputs[0]); lk(jj.outputs[0], go.inputs[0])
    obj.modifiers.new('yard', 'NODES').node_group = ng

if os.environ.get('YARDS', '1') == '1' and LOOK == 'photo':
    yc = yard_protos()
    covers = [o for o in sc.objects if o.type == 'MESH' and o.name.split('.')[0] in
              ('buildings', 'heroes', 'caps', 'streets', 'sidewalks', 'ground-detail', 'rail', 'street-markings')]
    for o in list(sc.objects):
        if o.name.startswith('terrain.') and o.type == 'MESH' and len(o.data.polygons): yard_scatter(o, yc, covers)
    for o in yc.objects: o.location.z -= 9000


# ── camera: the engine's own axonometric direction ─────────────────────
fx, fy, fz = d['camForward']
fwd = Vector((fx, fy, fz)).normalized()
x0, y0, x1, y1 = d['box']
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'
cam_d.ortho_scale = float(os.environ.get('ORTHO', (x1 - x0) * 0.62)); cam_d.clip_start = 1; cam_d.clip_end = 20000
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam)
# aim at the ground's own height: at Twin Peaks the ground is 250 m up and an
# aim at 40 m slides the whole frame down the slope
tz = []
for o in sc.objects:
    if o.name.startswith('terrain.') and o.type == 'MESH':
        vs = o.data.vertices; step = max(1, len(vs) // 3000)
        tz += [vs[i].co.z for i in range(0, len(vs), step)
               if abs(vs[i].co.x - cx) < (x1 - x0) / 4 and abs(vs[i].co.y - cy) < (y1 - y0) / 4]
tz.sort(); gz = tz[len(tz) // 2] if tz else 0.0
# the frame's top edge looks furthest north: with the target at the box's own
# centre and a 0.62 frame, it stays inside what was exported (no void band)
target = Vector((float(os.environ.get('TX', cx)), float(os.environ.get('TY', cy - 0.04 * (y1 - y0))), gz + 20))
cam.location = target - fwd * 5000
cam.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()
sc.camera = cam

# ── light ───────────────────────────────────────────────────────────────
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
wn = world.node_tree; wn.nodes.clear(); wo = wn.nodes.new('ShaderNodeOutputWorld')
sky = wn.nodes.new('ShaderNodeTexSky'); bg = wn.nodes.new('ShaderNodeBackground')
LOOKS = {  # sun elevation, azimuth (deg from north, clockwise), sun strength, sky strength, sun colour
    'photo': (float(os.environ.get('SUN_EL', 17)), float(os.environ.get('SUN_AZ', 215)), float(os.environ.get('SUN_K', 6.0)), 0.7, tuple(float(x) for x in os.environ.get('SUN_RGB', '1.0,0.76,0.50').split(','))),
    'hybrid': (22, 210, 5.2, 0.7, (1.0, 0.83, 0.62)),
    'model': (34, 205, 4.6, 0.5, (1.0, 0.93, 0.84)),
}
el, az, sstr, kstr, scol = LOOKS[LOOK]
try: sky.sky_type = 'NISHITA'
except Exception: pass
try:
    sky.sun_disc = False; sky.sun_elevation = math.radians(el); sky.sun_rotation = math.radians(az)
    sky.air_density = 1.0
except Exception as e: print('sky', e)
bg.inputs['Strength'].default_value = kstr * (0.25 if LOOK == 'model' else float(os.environ.get('SKY_K', 0.28)))
# what glass and water mirror is the sky itself, brighter than the light it
# spreads into the shadows — a dark mirror of a dim dome reads as grey paint
lp = wn.nodes.new('ShaderNodeLightPath')
bg2 = wn.nodes.new('ShaderNodeBackground'); bg2.inputs['Strength'].default_value = kstr * float(os.environ.get('GLOSS_K', 0.9))
L(wn, sky.outputs[0], bg.inputs[0]); L(wn, sky.outputs[0], bg2.inputs[0])
wm = wn.nodes.new('ShaderNodeMixShader'); L(wn, lp.outputs['Is Glossy Ray'], wm.inputs[0])
L(wn, bg.outputs[0], wm.inputs[1]); L(wn, bg2.outputs[0], wm.inputs[2]); L(wn, wm.outputs[0], wo.inputs[0])
sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = sstr; sun_d.angle = math.radians(0.6 if LOOK != 'model' else 1.2); sun_d.color = scol
sun = bpy.data.objects.new('sun', sun_d); sc.collection.objects.link(sun)
azr, elr = math.radians(az), math.radians(el)
to_sun = Vector((math.sin(azr) * math.cos(elr), math.cos(azr) * math.cos(elr), math.sin(elr)))
sun.rotation_euler = (-to_sun).to_track_quat('-Z', 'Y').to_euler()

# ── render ──────────────────────────────────────────────────────────────
sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'METAL'; prefs.get_devices()
    for dv in prefs.devices: dv.use = True
    sc.cycles.device = 'GPU'
except Exception as e: print('gpu', e)
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.cycles.max_bounces = 6
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.view_settings.view_transform = 'AgX'
try: sc.view_settings.look = {'photo': os.environ.get('AGX_LOOK', 'AgX - Punchy'), 'hybrid': 'AgX - Medium High Contrast', 'model': 'AgX - Base Contrast'}[LOOK]
except Exception as e: print('look', e)
sc.view_settings.exposure = {'photo': float(os.environ.get('EXPO', 0.3)), 'hybrid': -0.3, 'model': -0.75}[LOOK]
sc.render.filepath = OUT
t1 = time.time(); bpy.ops.render.render(write_still=True)
print(f'RENDER {LOOK} {W}x{H} {SAMPLES}spp: {time.time() - t1:.1f}s (scene build {t1 - t0:.1f}s)')
bpy.ops.wm.save_as_mainfile(filepath=OUT.replace('.png', '.blend'))
