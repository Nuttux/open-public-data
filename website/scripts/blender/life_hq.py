"""The city's life at about 5 pm on a weekday in late September, golden hour,
for the path-traced city (hq_city.py): the boats on the bay with their wakes,
the traffic in the streets.

hq_city.py calls, once the scene stands (after transit_hq), before camera and
light:
    life_hq.build(bpy, scene, mats, ground, box, scene_json, log, era)
ground(x, y) is the terrain's top (None off the terrain); `box` the region
built. build() never raises.

WHAT IS DRAWN, AND WHY. At 37 cm a pixel (2.7 px a metre) a ferry is 110 px
long, a sailboat 30, a car 12; what makes a boat READ on the water is its
wake, so every moving vessel lays one (life_wake): the white boil at the
stern and the turbulent trail it leaves (lighter, churned water that fades
over a few hundred metres), and the two arms of the bow wave diverging at the
Kelvin angle. The water: life_water.py (ferries on their OpenStreetMap routes,
the marinas' berths, sailboats on the Cityfront, ships, tugs, kayaks). The
streets: life_traffic.py (cars in the travel lanes, Muni buses, delivery
trucks), from OpenStreetMap's highway ways and their lanes.
Placement is a function of the whole city, never of the region built, so
every frame of the pyramid agrees where a boat or a car is.

DATA. life.json and sea_4m.npy (life_prep.py): OpenStreetMap, ODbL, (c)
OpenStreetMap contributors, and the render's own sea mask.

ERA. All of it is today's. With `era` set nothing is built (the history
agent owns the past: see the note in life_water / life_traffic on what could
be dated - the ferries' routes and the Ferry Building's fleets since 1850, the
car's arrival).

env: LIFE_WATER=0 (no boats) · LIFE_STREETS=0 (no traffic) · LIFE_WAKE=0 (boats without
     wakes) · LIFE_KITES=1 (kiteboarders off Crissy Field, under test)
"""
import json, math, os, random, sys, time, traceback
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)

WORK = '/Users/daniel/code/qipu-render-work/life'
E = os.environ.get


def build(bpy, sc, M, ground, box, d=None, log=print, era=None):
    t0 = time.time()
    if era is not None:
        log(f'life_hq: era {era}: today\'s traffic and boats are not built (the history agent owns the past)'); return
    try:
        _build(bpy, sc, M, ground, box, log, t0)
    except Exception as ex:
        traceback.print_exc(); log('life_hq: FAILED, scene left as it was:', ex)


def _load():
    for p in (os.path.join(HERE, 'life.json'), os.path.join(WORK, 'life.json')):
        if os.path.exists(p): return json.load(open(p)), os.path.dirname(p)
    raise FileNotFoundError('life.json (run life_prep.py)')


# ── materials ────────────────────────────────────────────────────────────────
def _mats(bpy, M):
    def principled(name, rough=0.5, metal=0.0, spec=0.5, coat=0.0, col=None):
        m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
        p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
        p.inputs['Specular IOR Level'].default_value = spec
        if coat: p.inputs['Coat Weight'].default_value = coat
        if col is not None: p.inputs['Base Color'].default_value = col; return m
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'bcol'
        nt.links.new(at.outputs['Color'], p.inputs['Base Color'])
        return m
    T = {}
    T['paint'] = principled('lf_paint', rough=0.32, coat=0.35)
    T['glass'] = principled('lf_glass', rough=0.05, spec=0.9, col=(0.012, 0.014, 0.018, 1.0))
    T['matte'] = principled('lf_matte', rough=0.85, spec=0.3)
    T['metal'] = principled('lf_metal', rough=0.35, metal=0.8)
    # sailcloth: matte, and a little light through it (a sail against the low sun glows)
    s = principled('lf_sail', rough=0.7, spec=0.3); nt = s.node_tree; p = nt.nodes['Principled BSDF']
    tl = nt.nodes.new('ShaderNodeBsdfTranslucent'); nt.links.new(nt.nodes['Attribute'].outputs['Color'], tl.inputs['Color'])
    mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs[0].default_value = 0.25
    out = nt.nodes['Material Output']
    nt.links.new(p.outputs[0], mx.inputs[1]); nt.links.new(tl.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs['Surface'])
    T['sail'] = s
    return T


def wake_mat(bpy):
    """foam and churned water on a decal over the sea, from the decal's own
    attributes: wu (0 at the boat .. 1 at the trail's end), wv (-1..1 across),
    wk (the wake's strength), wt (0 the trail, 1 a bow-wave arm)"""
    m = bpy.data.materials.new('lf_wake'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    L_ = nt.links.new
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    def attr(n):
        a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = n; return a.outputs['Fac']
    def mth(op, a, b=None, clamp=False):
        n_ = nt.nodes.new('ShaderNodeMath'); n_.operation = op; n_.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n_.inputs[i].default_value = v
            else: L_(v, n_.inputs[i])
        return n_.outputs[0]
    u, v, k, t = attr('wu'), attr('wv'), attr('wk'), attr('wt')
    # along: the trail fades as a power of the distance; an arm faster
    along = mth('POWER', mth('SUBTRACT', 1.0, u, clamp=True), mth('ADD', 1.5, mth('MULTIPLY', t, 0.9)))
    # across: the trail full in the middle, soft at the edges; an arm a thin crest
    av = mth('ABSOLUTE', v)
    ac_tr = mth('SUBTRACT', 1.0, mth('MULTIPLY', v, v), clamp=True)
    ac_arm = mth('POWER', mth('SUBTRACT', 1.0, av, clamp=True), 2.0)
    mixf = nt.nodes.new('ShaderNodeMix'); mixf.data_type = 'FLOAT'; L_(t, mixf.inputs[0]); L_(ac_tr, mixf.inputs[2]); L_(ac_arm, mixf.inputs[3])
    I = mth('MULTIPLY', mth('MULTIPLY', k, along), mixf.outputs[0])
    # the boil at the stern: the first metres of the trail are white through
    boil = mth('MULTIPLY', mth('MULTIPLY', mth('SUBTRACT', 1.0, mth('DIVIDE', u, 0.07), clamp=True), mth('SUBTRACT', 1.0, t)), mth('MULTIPLY', k, 0.8))
    I = mth('ADD', I, boil)
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 0.22; n1.inputs['Detail'].default_value = 10; n1.inputs['Roughness'].default_value = 0.62
    L_(geo.outputs['Position'], n1.inputs['Vector'])
    n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 1.1; n2.inputs['Detail'].default_value = 4
    L_(geo.outputs['Position'], n2.inputs['Vector'])
    N = mth('ADD', mth('MULTIPLY', mth('SUBTRACT', n1.outputs['Fac'], 0.5), 1.2), mth('MULTIPLY', mth('SUBTRACT', n2.outputs['Fac'], 0.5), 0.5))
    foam = mth('MULTIPLY', mth('ADD', mth('SUBTRACT', mth('MULTIPLY', I, 1.25), 0.42), N), 3.2, clamp=True)
    if E('LIVE_V3', '1') == '1':
        # v3 (27/09, live assets agent): at z9 the foam read as one solid white slab. Real wake foam is torn
        # into streaks along the track: modulate it by an anisotropic noise in the decal's own (along, across)
        # coordinates (mean ~1, so the wake's weight at L7 is unchanged)
        cmb = nt.nodes.new('ShaderNodeCombineXYZ'); L_(mth('MULTIPLY', u, 90.0), cmb.inputs[0]); L_(mth('MULTIPLY', v, 7.0), cmb.inputs[1])
        L_(mth('MULTIPLY', t, 13.0), cmb.inputs[2])
        n3 = nt.nodes.new('ShaderNodeTexNoise'); n3.inputs['Scale'].default_value = 1.0; n3.inputs['Detail'].default_value = 6; n3.inputs['Roughness'].default_value = 0.7
        L_(cmb.outputs[0], n3.inputs['Vector'])
        st_ = mth('ADD', 0.5, mth('MULTIPLY', mth('SUBTRACT', n3.outputs['Fac'], 0.5), 2.6))
        foam = mth('MULTIPLY', foam, mth('ADD', 0.55, mth('MULTIPLY', st_, 0.9)), clamp=True)
    churn = mth('MULTIPLY', mth('MULTIPLY', I, 1.4, clamp=True), float(E('LIFE_CHURN', 0.55)))
    alpha = mth('MAXIMUM', foam, churn)
    col = nt.nodes.new('ShaderNodeMix'); col.data_type = 'RGBA'; L_(foam, col.inputs[0])
    col.inputs[6].default_value = (0.045, 0.10, 0.105, 1.0); col.inputs[7].default_value = (0.78, 0.80, 0.80, 1.0)
    pb = nt.nodes.new('ShaderNodeBsdfPrincipled'); L_(col.outputs[2], pb.inputs['Base Color'])
    rg = nt.nodes.new('ShaderNodeMapRange'); L_(foam, rg.inputs['Value']); rg.inputs['To Min'].default_value = 0.10; rg.inputs['To Max'].default_value = 0.75
    L_(rg.outputs[0], pb.inputs['Roughness']); pb.inputs['Specular IOR Level'].default_value = 0.5
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mx = nt.nodes.new('ShaderNodeMixShader'); L_(alpha, mx.inputs[0]); L_(tr.outputs[0], mx.inputs[1]); L_(pb.outputs[0], mx.inputs[2])
    L_(mx.outputs[0], out.inputs['Surface'])
    return m


def mesh_attrs(bpy, name, V, F, attrs, mat, coll):
    """a mesh from numpy arrays: V (n, 3), F (m, 4) quads, attrs {name: (n,) float}"""
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(V)); me.vertices.foreach_set('co', np.asarray(V, np.float32).ravel())
    F = np.asarray(F, np.int32)
    me.loops.add(F.size); me.loops.foreach_set('vertex_index', F.ravel())
    me.polygons.add(len(F)); me.polygons.foreach_set('loop_start', (np.arange(len(F)) * 4).astype(np.int32))
    try: me.polygons.foreach_set('loop_total', np.full(len(F), 4, np.int32))
    except Exception: pass
    me.update(calc_edges=True)
    for k, a in attrs.items():
        at = me.attributes.new(k, 'FLOAT', 'POINT'); at.data.foreach_set('value', np.asarray(a, np.float32))
    me.validate(clean_customdata=False)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    return ob


def _build(bpy, sc, M, ground, box, log, t0):
    D, ddir = _load()
    bx0, by0, bx1, by1 = box
    def inb(x, y, pad=0.0): return bx0 - pad <= x <= bx1 + pad and by0 - pad <= y <= by1 + pad
    T = _mats(bpy, M)
    coll = bpy.data.collections.new('life'); sc.collection.children.link(coll)
    if E('LIFE_WATER', '1') == '1':
        try: _water(bpy, coll, T, D, ddir, inb, log, t0)
        except Exception as ex: traceback.print_exc(); log('life_hq: water failed', ex)
    if E('LIFE_STREETS', '1') == '1':
        try:
            import life_traffic
            life_traffic.build(bpy, sc, coll, T, D, ground, inb, log, t0)
        except Exception as ex: traceback.print_exc(); log('life_hq: streets failed', ex)
    if E('LIFE_PEOPLE', '0') == '1':          # under test
        try:
            import life_people, life_water as LW
            sea = LW.Sea(D['sea'], os.path.join(ddir, 'sea_4m.npy'))
            life_people.build(bpy, sc, coll, T, D, ground, sea, inb, log, t0)
        except Exception as ex: traceback.print_exc(); log('life_hq: people failed', ex)


def _water(bpy, coll, T, D, ddir, inb, log, t0):
    import life_water as LW, life_boats as LB, transit_geom as TG
    sea = LW.Sea(D['sea'], os.path.join(ddir, 'sea_4m.npy'))
    V = LW.plan(D, sea)
    mats = [T['paint'], T['glass'], T['matte'], T['sail'], T['metal']]
    protos = {}
    wc = bpy.data.collections.new('life_boats'); coll.children.link(wc)
    n = 0
    for v in V:
        if not inb(v['x'], v['y'], 400.0): continue
        m_ = protos.get(v['k'])
        if m_ is None:
            vb = getattr(LB, v['b'])(**v['a'])
            m_ = protos[v['k']] = TG.mesh_multi(bpy, f"lf_{v['k']}", vb.V, vb.F, vb.C, vb.MI, mats)
        ob = bpy.data.objects.new(f"lf.{v['cls']}.{n}", m_)
        ob.location = (v['x'], v['y'], sea.z(v['x'], v['y']))
        ob.rotation_euler = (0.0, 0.0, v['yaw'])
        wc.objects.link(ob); n += 1
    log(f'life_hq: {len(V)} vessels on the bay, {n} in the region, {len(protos)} bodies ({time.time() - t0:.1f}s)')
    if E('LIFE_WAKE', '1') == '1':
        import life_wake
        nw = life_wake.build(bpy, coll, V, sea, inb, wake_mat(bpy), mesh_attrs)
        log(f'life_hq: {nw} wakes ({time.time() - t0:.1f}s)')
