"""The whole city, modelled from its records, in one path-traced frame.

blender -b -P hq_city.py -- <city_scene_dir> <out_prefix> <spp> <W> <H>
env: TILES=4 (the frame is rendered as TILES x TILES borders and stitched) ·
     ORTHO (width of the view, m) · TX,TY · LOD=2 · MAXB (cap, for tests) ·
     BOX=x0,y0,x1,y1 (buildings only inside, for tests)
"""
import bpy, bmesh, json, base64, array, math, os, sys, glob, random, time
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import gen_buildings as G
import city_data
import era as EA

argv = sys.argv[sys.argv.index('--') + 1:]
SD, OUT, SPP, W, H = argv[0], argv[1], int(argv[2]), int(argv[3]), int(argv[4])
E = os.environ.get
PH = os.path.expanduser('~/code/qipu-assets/polyhaven')
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:7.1f}s]', *a, flush=True)
d = json.load(open(os.path.join(SD, 'scene.json')))
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
BOX = [float(v) for v in E('BOX').split(',')] if E('BOX') else None
def in_box(x, y, pad=0.0):
    return BOX is None or (BOX[0] - pad <= x <= BOX[2] + pad and BOX[1] - pad <= y <= BOX[3] + pad)

def f32(b):
    a = array.array('f'); a.frombytes(base64.b64decode(b)); return a

ERA = int(E('ERA')) if E('ERA') else None
G.ERA = ERA
# the materials are hq_scene.py's own, run from its source so the two never drift
_HQSRC = open(os.path.join(HERE, 'hq_scene.py')).read()
exec(_HQSRC[_HQSRC.index('# ── materials'):_HQSRC.index('# ── terrain')])

def mesh_from(name, P, mat, smooth=False, weld=0.0, cols=None):
    nv = len(P) // 3
    me = bpy.data.meshes.new(name)
    me.from_pydata([(P[i*3], P[i*3+1], P[i*3+2]) for i in range(nv)], [], [(t*3, t*3+1, t*3+2) for t in range(nv // 3)])
    if cols is not None:
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        ca.data.foreach_set('color', [x for i in range(nv) for x in (cols[i*3], cols[i*3+1], cols[i*3+2], 1.0)])
    if weld:
        bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld); bm.to_mesh(me); bm.free()
    for f in me.polygons:
        if f.normal.z < 0: f.flip()
    me.update()
    if smooth: me.shade_smooth()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    if mat: me.materials.append(mat)
    return ob

def ground_mat():
    """lawn where the engine's ground colour is green, golden grass on the
    slopes, yards of patchy lawn and paving on the flat"""
    m = bpy.data.materials.get('lawn').copy(); m.name = 'ground'; nt = m.node_tree
    pr = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    lawn = pr.inputs['Base Color'].links[0].from_socket
    geo = nt.nodes.new('ShaderNodeNewGeometry'); vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    sp = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(vc.outputs['Color'], sp.inputs[0])
    def mth(op, a, b=None, clamp=False):
        n_ = nt.nodes.new('ShaderNodeMath'); n_.operation = op; n_.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n_.inputs[i].default_value = v
            else: nt.links.new(v, n_.inputs[i])
        return n_.outputs[0]
    green = mth('MULTIPLY', mth('SUBTRACT', sp.outputs[1], sp.outputs[0]), 10.0, clamp=True)
    sn = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(geo.outputs['Normal'], sn.inputs[0])
    steep = mth('MULTIPLY', mth('SUBTRACT', 0.985, sn.outputs[2]), 12.0, clamp=True)
    n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 0.04; n1.inputs['Detail'].default_value = 6; nt.links.new(geo.outputs['Position'], n1.inputs['Vector'])
    n3 = nt.nodes.new('ShaderNodeTexNoise'); n3.inputs['Scale'].default_value = 0.09; n3.inputs['Detail'].default_value = 4; nt.links.new(geo.outputs['Position'], n3.inputs['Vector'])
    def mixc(f, a, b):
        m_ = nt.nodes.new('ShaderNodeMix'); m_.data_type = 'RGBA'
        for sock, v in ((m_.inputs[0], f), (m_.inputs[6], a), (m_.inputs[7], b)):
            if isinstance(v, (int, float)): sock.default_value = v
            elif isinstance(v, tuple): sock.default_value = v
            else: nt.links.new(v, sock)
        return m_.outputs[2]
    dry = mixc(n1.outputs['Fac'], (0.40, 0.29, 0.13, 1), (0.56, 0.44, 0.23, 1))
    paving = (0.24, 0.23, 0.21, 1)
    yard = mixc(mth('GREATER_THAN', n3.outputs['Fac'], 0.42), paving, lawn)
    flatc = mixc(green, yard, lawn)
    c = mixc(steep, flatc, dry)
    nt.links.new(c, pr.inputs['Base Color'])
    return m

# ── terrain, streets, markings, detail ──────────────────────────────────────
log('terrain')
TP, TC = array.array('f'), array.array('f')
for m in d['meshes']:
    if m['layer'] == 'terrain' and not m.get('instanced'): TP.extend(f32(m['pos'])); TC.extend(f32(m['col']))
for i in range(2, len(TP), 3): TP[i] *= 0.5
if ERA is not None:
    for i in range(0, len(TP), 3):
        if EA.water_then(TP[i], TP[i+1], ERA): TP[i+2] = -4.0      # made land not yet made
terrain = mesh_from('terrain', TP, ground_mat(), smooth=True, weld=0.05, cols=TC)
bvh_t = BVHTree.FromObject(terrain, bpy.context.evaluated_depsgraph_get())
def ground(x, y):
    # None off the terrain: a building there is outside the city (the
    # generator raises on it and the chunk loop skips it)
    h_ = bvh_t.ray_cast(Vector((x, y, 2000)), Vector((0, 0, -1)))
    return h_[0].z if h_[0] else None
def ground0(x, y):
    g_ = ground(x, y); return 0.0 if g_ is None else g_
# the land around the city (Daly City, Marin): the engine's surround, so the
# terrain does not end in a cliff at the county line
SP_, SC_ = array.array('f'), array.array('f')
for m in d['meshes']:
    if m['layer'] == 'surround' and not m.get('instanced'): SP_.extend(f32(m['pos'])); SC_.extend(f32(m['col']))
if len(SP_):
    for i in range(2, len(SP_), 3): SP_[i] = SP_[i] * 0.5 - 0.3
    mesh_from('surround', SP_, bpy.data.materials['ground'], smooth=True, cols=SC_)

# ── the year shown: the records that stood, open land, the streets of the day ──
log('buildings: records')
HG = city_data.hero_gids()
_allb = [b for b in city_data.buildings(-9000, -9000, 9000, 9000) if in_box(b['cx'], b['cy'], 80) and b['gid'] not in HG]
recs = [b for b in (EA.place_record(dict(b), ERA) for b in _allb if in_box(b['cx'], b['cy'])) if b]
if ERA is not None and E('INFILL', '1') == '1':
    _inf = [b for b in EA.infill(_allb, ERA, {b['gid'] for b in recs}) if in_box(b['cx'], b['cy'])]
    log('lost buildings stood in for (era.infill)', len(_inf)); recs += _inf
if E('MAXB'): recs = recs[:int(E('MAXB'))]
log('buildings', len(recs))
CBOX = BOX or d['box']
if ERA is not None:
    OL = EA.OpenLand(recs, CBOX, float(E('OPEN_RES', 8.0)), ground)
    def open_at(x, y, grid=None): return OL.at(x, y, grid)
    SG = EA.StreetGate(CBOX, ERA, open_at)
    _sgc = {}
    def street_stands(x, y):
        k_ = (int(x // 5), int(y // 5))
        if k_ not in _sgc: _sgc[k_] = SG.stands(x, y)
        return _sgc[k_]
    log('open land', round(sum(OL.open) / len(OL.open), 3), 'sand', round(sum(OL.sand) / len(OL.sand), 3))
else:
    def open_at(x, y, grid=None): return 0.0
    def street_stands(x, y): return True

log('streets')
SP, MP, DP, DL = array.array('f'), array.array('f'), array.array('f'), array.array('f')
for m in d['meshes']:
    if m.get('instanced'): continue
    if m['layer'] == 'streets':
        p_ = f32(m['pos'])
        if ERA is not None:
            q_ = array.array('f')
            for t in range(len(p_) // 9):
                a = t * 9
                if street_stands((p_[a] + p_[a+3] + p_[a+6]) / 3, (p_[a+1] + p_[a+4] + p_[a+7]) / 3): q_.extend(p_[a:a+9])
            p_ = q_
        SP.extend(p_)
    elif m['layer'] == 'street-markings' and (ERA is None or EA.P('marks', ERA) >= 0.5):
        p = f32(m['pos'])
        for t in range(len(p) // 9):
            a = t * 9
            if abs((p[a+3]-p[a])*(p[a+7]-p[a+1]) - (p[a+4]-p[a+1])*(p[a+6]-p[a])) / 2 < 6.0: MP.extend(p[a:a+9])
    elif m['layer'] == 'ground-detail':
        c = f32(m['col']); p = f32(m['pos'])
        (DP if (c and c[2] > 0.8) else DL).extend(p)
for i in range(2, len(SP), 3): SP[i] += 0.02
streets = mesh_from('streets', SP, M['asphalt'], weld=0.05)
sbv = BVHTree.FromObject(streets, bpy.context.evaluated_depsgraph_get())
for i in range(0, len(MP), 3):
    h_ = sbv.ray_cast(Vector((MP[i], MP[i+1], MP[i+2] + 3)), Vector((0, 0, -1)))
    if h_[0] is not None: MP[i+2] = h_[0].z + 0.012
if len(MP): mesh_from('markings', MP, M['paint'])
for i in range(2, len(DP), 3): DP[i] += 0.04
for i in range(2, len(DL), 3): DL[i] += 0.03
if len(DP): mesh_from('paths', DP, M['path'])
if len(DL): mesh_from('lawns', DL, M['lawn'])

bm = bmesh.new(); bm.from_mesh(streets.data); bm.edges.ensure_lookup_table()
SE = []
for e in bm.edges:
    if len(e.link_faces) != 1: continue
    a, b = e.verts[0].co.copy(), e.verts[1].co.copy()
    inward = e.link_faces[0].calc_center_median() - (a + b) / 2; inward.z = 0
    v = b - a; outv = Vector((-v.y, v.x, 0)).normalized()
    if outv.dot(inward) > 0: outv = -outv
    SE.append((a, b, outv))
bm.free()
Ps, Fs = [], []
for a, b, outv in SE:
    up = Vector((0, 0, 0.15))
    fa, fb = a + outv * 3.0, b + outv * 3.0
    fa.z = max(ground0(fa.x, fa.y) + 0.06, a.z - 0.45); fb.z = max(ground0(fb.x, fb.y) + 0.06, b.z - 0.45)
    k = len(Ps); Ps += [tuple(a + up), tuple(b + up), tuple(fb), tuple(fa)]; Fs.append((k, k+1, k+2, k+3))
    k = len(Ps); Ps += [tuple(a), tuple(b), tuple(b + up), tuple(a + up)]; Fs.append((k, k+1, k+2, k+3))
me = bpy.data.meshes.new('sidewalks'); me.from_pydata(Ps, [], Fs); me.update()
ob = bpy.data.objects.new('sidewalks', me); sc.collection.objects.link(ob); me.materials.append(M['sidewalk'])
log('street edges', len(SE))
if ERA is not None and len(streets.data.polygons):
    # the rails of the year and the cars on them (hq_scene's block)
    _rs = _HQSRC[_HQSRC.index("    _rb = BVHTree.FromObject(streets"):_HQSRC.index("                   simple('cableslot'")]
    _rs = '\n'.join(l[4:] if l.startswith('    ') else l for l in _rs.split('\n'))
    bx0, by0, bx1, by1 = CBOX
    exec(_rs + "\n                   simple('cableslot', (0.02, 0.02, 0.02), rough=0.9), _bm, log)".replace('\n                   ', '\n               '))

# ── landmarks the engine models by hand (Coit Tower, the Transamerica...) ──
HP, HC = array.array('f'), array.array('f')
for m in d['meshes']:
    # heroes only: the engine's 'caps' crown generic towers the generator now models itself
    if m['layer'] == 'heroes' and not m.get('instanced'):
        _p = f32(m['pos'])
        if EA.hero_mesh_stands(_p, ERA): HP.extend(_p); HC.extend(f32(m['col']))
if len(HP):
    ho = mesh_from('landmarks', HP, None, cols=HC)
    lm = simple('landmark', (0.8, 0.8, 0.8), rough=0.6)
    vcn = lm.node_tree.nodes.new('ShaderNodeVertexColor'); vcn.layer_name = 'Col'
    lm.node_tree.links.new(vcn.outputs['Color'], lm.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    ho.data.materials.append(lm)

# ── the city's buildings, modelled, in chunks ────────────────────────────────
G.LOD = int(E('LOD', 2))
recs.sort(key=lambda b: (int(b['cx'] // 700), int(b['cy'] // 700)))
CH = 6000; nfaces = 0
for c0 in range(0, len(recs), CH):
    out = G.Out()
    for b in recs[c0:c0 + CH]:
        try: G.building(b, ground, out)
        except Exception as ex: pass
    objs = G.emit(bpy, out, M, name=f'b{c0 // CH}')
    nfaces += sum(len(o.data.polygons) for o in objs); del out
    log('chunk', c0 // CH, 'faces so far', nfaces)

# ── trees: one point per recorded tree, instanced ────────────────────────────
def load_collection(asset):
    path = glob.glob(f'{PH}/{asset}/*.blend')[0]
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.collections = [c for c in src.collections if c == f'{asset}_LOD0'] or [c for c in src.collections if c.endswith('LOD0')][:1]
    c = dst.collections[0]
    mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
    for o in c.all_objects:
        if o.type != 'MESH': continue
        vs_ = o.data.vertices
        for i_ in range(0, len(vs_), 7):
            v = vs_[i_]
            p = o.matrix_world @ v.co
            mn = Vector((min(mn.x, p.x), min(mn.y, p.y), min(mn.z, p.z))); mx = Vector((max(mx.x, p.x), max(mx.y, p.y), max(mx.z, p.z)))
    c.instance_offset = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    return c, max(mx.x - mn.x, mx.y - mn.y)

def instancer(name, pts, protos):
    """pts: (x, y, z, scale, rot, kind); protos: collections, one per kind"""
    root = bpy.data.collections.new(f'{name}_protos')
    for c in protos: root.children.link(c)
    me = bpy.data.meshes.new(name); me.vertices.add(len(pts))
    me.vertices.foreach_set('co', [v for p in pts for v in p[:3]])
    for nm, k, tp in (('s', 3, 'FLOAT'), ('r', 4, 'FLOAT'), ('kind', 5, 'INT')):
        at = me.attributes.new(nm, tp, 'POINT'); at.data.foreach_set('value', [p[k] for p in pts])
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)
    ng = bpy.data.node_groups.new(name, 'GeometryNodeTree')
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
    lk(rot.outputs[0], ii.inputs['Rotation']); lk(attr('s', 'FLOAT'), ii.inputs['Scale'])
    lk(ii.outputs[0], go.inputs[0])
    ob.modifiers.new(name, 'NODES').node_group = ng
    log(name, len(pts))

log('trees')
kd = KDTree(len(recs)); [kd.insert((b['cx'], b['cy'], 0), i) for i, b in enumerate(recs)]; kd.balance()
STREET = [load_collection(a) for a in ('island_tree_01', 'island_tree_02', 'island_tree_03', 'tree_small_02', 'jacaranda_tree')]
PARK = [load_collection(a) for a in ('pine_tree_01', 'fir_tree_01', 'island_tree_02', 'island_tree_01')]
protos = [c for c, _ in STREET + PARK]; widths = [w for _, w in STREET + PARK]
pts = []; seen = set(); r = random.Random(3)
_TKD = None
if ERA is not None:
    _tl = city_data.trees(*(CBOX[0] - 50, CBOX[1] - 50, CBOX[2] + 50, CBOX[3] + 50))
    if _tl:
        _TKD = KDTree(len(_tl)); _TY = [t_[2] for t_ in _tl]
        for i_, t_ in enumerate(_tl): _TKD.insert((t_[0], t_[1], 0), i_)
        _TKD.balance()
for t in d['trees']:
    for (x, y, z, sxz, sy, rot, *_rest) in t['inst']:
        # the engine lists a tree once per zoom band, a few centimetres apart
        k = (round(x / 2.5), round(y / 2.5))
        if k in seen or not in_box(x, y, 50): continue
        seen.add(k)
        park = kd.find((x, y, 0))[2] > 28 if len(recs) else True
        crown = max(3.0, 2.4 * sxz)
        if ERA is not None:
            # dated street trees from their planting year (DataSF Street Tree
            # List), crowns grown to their age; undated ones by era.TABLE `trees`
            pt_ = _TKD.find((x, y, 0)) if _TKD else None
            py_ = _TY[pt_[1]] if (pt_ and pt_[2] < 2.5) else None
            if py_ is not None:
                if py_ > ERA: continue
                crown = max(1.6, crown * min(1.0, ((ERA - py_ + 3) / (2025 - py_ + 3)) ** 0.7))
            elif not park and r.random() > EA.street_tree_keep(ERA): continue
            if open_at(x, y) > 0.5 and OL.at(x, y, OL.park) < 0.5 and r.random() > 0.04: continue
            if EA.water_then(x, y, ERA): continue
        kind = (5 + r.randrange(4)) if park else r.randrange(5)
        gz_ = ground(x, y)
        if gz_ is None: continue
        pts.append((x, y, gz_ - 0.1, crown / max(0.5, widths[kind]) * r.uniform(0.85, 1.15), r.uniform(0, 6.283), kind))
instancer('trees', pts, protos)

# ── parked cars along every curb ─────────────────────────────────────────────
log('cars')
_cs = _HQSRC[_HQSRC.index("    def car_mesh(name, L, Wd, prof):"):_HQSRC.index("    r = random.Random(21); k = 0")]
exec('\n'.join(l[4:] if l.startswith('    ') else l for l in _cs.split('\n')))
cc = bpy.data.collections.new('car_protos_src')
car_colls = []
for i, me_ in enumerate(CARS):
    c = bpy.data.collections.new(f'carp{i}'); o = bpy.data.objects.new(f'carp{i}', me_); c.objects.link(o); car_colls.append(c)
cpts = []; r = random.Random(21)
for a, b, outv in SE:
    v = b - a; L_ = v.length
    if L_ < 7: continue
    ang = math.atan2(v.y, v.x)
    occ = EA.car_occupancy(ERA)
    for i in range(int((L_ - 3) // 6.2)):
        if r.random() > occ: continue
        p = a + v * ((1.5 + 3.1 + i * 6.2) / L_) - outv * 1.25
        if not in_box(p.x, p.y) or open_at(p.x, p.y) > 0.3: continue
        cpts.append((p.x, p.y, p.z + 0.02, 1.0, ang + (math.pi if r.random() < 0.5 else 0), car_pick(r)))
instancer('cars', cpts, car_colls)

# ── open ground of the year: dunes, the 1906 ash (hq_scene's block, city-sized) ──
if ERA is not None:
    bx0, by0, bx1, by1 = CBOX; OPAD = 80.0; ox0, oy0 = OL.x0, OL.y0; SAND = OL.sand
    if 'DUNE_RES' not in os.environ: os.environ['DUNE_RES'] = '10.0'
    _ds = _HQSRC[_HQSRC.index("# ── open land: dunes where the Outside Lands"):_HQSRC.index("# ── the sea: the water mask")]
    _g = dict(globals()); _g['ground'] = ground0; exec(_ds, _g)

# ── the sea ──────────────────────────────────────────────────────────────────
_ss = _HQSRC[_HQSRC.index("def sea():"):_HQSRC.index("# ── camera and light")]
# the era blocks of that slice read the box and the open-land raster by name
bx0, by0, bx1, by1 = CBOX
OPEN = OL.open if ERA is not None else None
_ground_keep = ground; ground = ground0
exec(_ss)
ground = _ground_keep
# open water beyond the mask's own sheet, so the frame never runs into the void
_oc = simple('ocean', (0.006, 0.026, 0.040), rough=0.06, spec=0.5)
_on = _oc.node_tree; _og = _on.nodes.new('ShaderNodeNewGeometry'); _ow = _on.nodes.new('ShaderNodeTexNoise')
_ow.inputs['Scale'].default_value = 0.04; _ow.inputs['Detail'].default_value = 8; _on.links.new(_og.outputs['Position'], _ow.inputs['Vector'])
_ob_ = _on.nodes.new('ShaderNodeBump'); _ob_.inputs['Strength'].default_value = 0.4; _on.links.new(_ow.outputs['Fac'], _ob_.inputs['Height'])
_on.links.new(_ob_.outputs[0], _on.nodes['Principled BSDF'].inputs['Normal'])
_g = 60000; _me = bpy.data.meshes.new('ocean'); _me.from_pydata([(-_g, -_g, -0.5), (_g, -_g, -0.5), (_g, _g, -0.5), (-_g, _g, -0.5)], [], [(0, 1, 2, 3)])
_oo = bpy.data.objects.new('ocean', _me); sc.collection.objects.link(_oo); _me.materials.append(_oc)

# ── camera, light, render in tiles ───────────────────────────────────────────
fwd = Vector(d['camForward']).normalized()
cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
tx, ty = float(E('TX', 197)), float(E('TY', 1190))
cam_d.type = 'ORTHO'; cam_d.ortho_scale = float(E('ORTHO', 13600)); cam_d.clip_start = 1; cam_d.clip_end = 40000
cam.location = Vector((tx, ty, ground0(tx, ty))) - fwd * 15000
cam.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()
_ls = _HQSRC[_HQSRC.index("world = bpy.data.worlds.new('w')"):_HQSRC.index("sc.render.filepath = OUT")]
exec(_ls)
sc.cycles.samples = SPP
T = int(E('TILES', 1))
sc.render.use_border = T > 1; sc.render.use_crop_to_border = True
sc.render.use_persistent_data = True          # one BVH for all the tiles
log('scene ready; rendering', W, H, SPP, 'spp in', T * T, 'tiles')
for ty_ in range(T):
    for tx_ in range(T):
        f_ = f'{OUT}_{ty_}_{tx_}.png'
        if os.path.exists(f_): continue
        if T > 1:
            sc.render.border_min_x, sc.render.border_max_x = tx_ / T, (tx_ + 1) / T
            sc.render.border_min_y, sc.render.border_max_y = 1 - (ty_ + 1) / T, 1 - ty_ / T
        sc.render.filepath = f_
        t1 = time.time(); bpy.ops.render.render(write_still=True)
        log(f'tile {ty_},{tx_}: {time.time() - t1:.1f}s')
log('RENDER done')
