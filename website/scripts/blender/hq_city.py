"""The whole city, modelled from its records, in one path-traced frame.

blender -b -P hq_city.py -- <city_scene_dir> <out_prefix> <spp> <W> <H>
env: TILES=4 (the frame is rendered as TILES x TILES borders and stitched) ·
     ORTHO (width of the view, m) · TX,TY · LOD=2 · MAXB (cap, for tests) ·
     BOX=x0,y0,x1,y1 (buildings only inside, for tests)
"""
import bpy, bmesh, json, base64, array, math, os, sys, glob, random, time
import numpy as np
from mathutils import Vector, Matrix
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

# ── the pyramid's geometry (see PYRAMID MODE below) ──
CA_ = math.cos(math.radians(30)); SA_ = 0.42
KX = math.sqrt(2) * CA_; KY = math.sqrt(2) * SA_; ZT = math.sqrt(2 * (CA_ ** 2 - SA_ ** 2))
REF = dict(cx=241.427019126574, cy=707.0567508859249, scale=2 ** (round(math.log2(0.06898352692062097) * 24) / 24))
PZ = int(E('Z', 7)); FW, FH = int(E('FW', 5120)), int(E('FH', 3072))
_f = 2 ** (PZ - 3); SZ = REF['scale'] * _f; PCW, PCH = round(2560 * _f), round(1536 * _f)
ONLY = [tuple(int(v) for v in t.split(':')) for t in E('ONLY', '').split(',') if t]
def frame_world(i, j):
    # the ground (z = 0) rectangle a frame covers, world metres
    px0 = REF['cx'] + (i * FW / 2 - PCW / 4) / SZ; px1 = REF['cx'] + ((i + 1) * FW / 2 - PCW / 4) / SZ
    py1 = REF['cy'] - (j * FH / 2 - PCH / 4) / SZ; py0 = REF['cy'] - ((j + 1) * FH / 2 - PCH / 4) / SZ
    return px0 / KX, py0 / KY, px1 / KX, py1 / KY
if E('MODE') == 'pyramid' and ONLY and BOX is None:
    # ONE REGION, NOT THE CITY: only what can be seen in these frames, plus
    # what casts a shadow into them (sun from the south-west) and what stands
    # south of them and rises into view (300 m of tower or hill = ~540 m of y)
    fr_ = [frame_world(i, j) for i, j in ONLY]
    BOX = [min(f[0] for f in fr_) - 450, min(f[1] for f in fr_) - 700, max(f[2] for f in fr_) + 450, max(f[3] for f in fr_) + 150]
    print('region box', [round(v) for v in BOX], flush=True)
def in_box(x, y, pad=0.0):
    return BOX is None or (BOX[0] - pad <= x <= BOX[2] + pad and BOX[1] - pad <= y <= BOX[3] + pad)

# THE TRUE GROUND. The engine's terrain is squeezed north-south 1.2649x (its
# 3DEP request asked a square image of a bbox that is not square in degrees):
# at Coit Tower it reads 0 m, the hill drawn 700 m south. terrain_hq rebuilds
# the ground from 3DEP and moves what stands on it (terrain_hq.py, landmarks agent).
import terrain_hq; terrain_hq.correct_scene(d, log, box=BOX, sd=SD)

def f32(b):
    a = array.array('f'); a.frombytes(base64.b64decode(b)); return a

ERA = EA.era_from_env(E('ERA'))
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
    # backyards: mostly lawn, a few paved patios — and none at all where the
    # engine's ground says park (the blotches read as mould on the lawns)
    paving = (0.30, 0.29, 0.26, 1)
    yard = mixc(mth('GREATER_THAN', n3.outputs['Fac'], 0.64), lawn, paving)
    flatc = mixc(mth('MINIMUM', mth('MULTIPLY', green, 3.0), 1.0), yard, lawn)
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
    # made land not yet made: under the water of the year, just below its
    # surface; the land's last vertices at the water drop to a low bank (a
    # 4 m drop at every then-shore read as a pale cliff round the whole bay)
    _wc = {}
    def _wet(i):
        k_ = (round(TP[i] * 10), round(TP[i+1] * 10))
        if k_ not in _wc: _wc[k_] = EA.water_then(TP[i], TP[i+1], ERA)
        return _wc[k_]
    _bank = set()
    for t in range(0, len(TP), 9):
        w3 = [_wet(t), _wet(t + 3), _wet(t + 6)]
        if any(w3) and not all(w3):
            for q_, w_ in zip((t, t + 3, t + 6), w3):
                if not w_: _bank.add((round(TP[q_] * 10), round(TP[q_+1] * 10)))
    for i in range(0, len(TP), 3):
        k_ = (round(TP[i] * 10), round(TP[i+1] * 10))
        # min, never set: over today's bay a made-land outline (Harbor View's
        # runs to y 5700) would RAISE the sea floor and stand a wall at its edge
        # (1890 z5 0:0, 2026-09-24); the bank just under the water's surface
        # (0.12), or an outline's rim stood above it (Treasure Island, 1890)
        if _wc.get(k_): TP[i+2] = min(TP[i+2], -0.7)
        elif k_ in _bank: TP[i+2] = min(TP[i+2], 0.05)
    log('terrain under the water of the year:', sum(1 for v in _wc.values() if v), 'vertices; bank', len(_bank))
terrain = mesh_from('terrain', TP, hill_ground(d, BOX), smooth=True, weld=0.05, cols=TC)
bvh_t = BVHTree.FromObject(terrain, bpy.context.evaluated_depsgraph_get())
def ground(x, y):
    # None off the terrain: a building there is outside the city (the
    # generator raises on it and the chunk loop skips it)
    h_ = bvh_t.ray_cast(Vector((x, y, 2000)), Vector((0, 0, -1)))
    return h_[0].z if h_[0] else None
def ground0(x, y, _ground=ground):
    # bound to THIS ground: the sea's slice runs with ground = ground0, and a
    # ground0 reading the global name then called itself (RecursionError, 1960)
    g_ = _ground(x, y); return 0.0 if g_ is None else g_
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
# and the footprints a landmarks_hq model replaces (lm_prep.py writes the list;
# a pass reads the copy frozen in its snapshot, a test the live one)
_sk = [q for q in (os.path.join(HERE, 'skip_gids.json'), '/Users/daniel/code/qipu-render-work/landmarks/skip_gids.json') if os.path.exists(q)]
if _sk:     # a landmark replaces its footprints only once it's built (ERA None = today)
    _skj = json.load(open(_sk[0])); _skb = _skj.get('built', {})
    HG |= {int(g) for k_, v_ in _skj['by_landmark'].items() if ERA is None or ERA >= _skb.get(k_, 0) for g in v_}
_allb0 = [b for b in city_data.buildings(-9000, -9000, 9000, 9000) if in_box(b['cx'], b['cy'], 80)]
_allb = [b for b in _allb0 if b['gid'] not in HG]
recs = [b for b in (EA.place_record(dict(b), ERA) for b in _allb if in_box(b['cx'], b['cy'])) if b]
recs += [b for b in EA.landmark_sites(_allb0, ERA) if in_box(b['cx'], b['cy'])]     # a landmark going up, or what stood before it
if ERA is not None and E('INFILL', '1') == '1':
    _inf = [b for b in EA.infill(_allb, ERA, {b['gid'] for b in recs}) if in_box(b['cx'], b['cy'])]
    log('lost buildings stood in for (era.infill)', len(_inf)); recs += _inf
if E('MAXB'): recs = recs[:int(E('MAXB'))]
log('buildings', len(recs))
CBOX = BOX or d['box']
if ERA is not None:
    OL = EA.OpenLand(recs, CBOX, float(E('OPEN_RES', 8.0)), ground, 80.0, ERA)
    def open_at(x, y, grid=None): return OL.at(x, y, grid)
    SG = EA.StreetGate(CBOX, ERA, open_at)
    _sgc = {}
    def street_stands(x, y):
        k_ = (int(x // 5), int(y // 5))
        if k_ not in _sgc: _sgc[k_] = SG.stands(x, y)
        return _sgc[k_]
    log('open land', round(sum(OL.open) / len(OL.open), 3), 'sand', round(sum(OL.sand) / len(OL.sand), 3))
    # the ground of open land that is not dune sand: summer-dry grass (the
    # hills and the unbuilt ground of the period), as hq_scene does. A colour
    # attribute on the terrain (OpenDry), read by the ground material: an
    # image mask sampled nothing in the city pass (e04, 2026-09-24)
    import numpy as _np
    _tm = terrain.data; _nv = len(_tm.vertices)
    _co0 = _np.empty(_nv * 3, _np.float32); _tm.vertices.foreach_get('co', _co0); _co0 = _co0.reshape(-1, 3)
    _dk = _np.zeros(_nv, _np.float32)
    for k_ in range(_nv):
        x_, y_ = float(_co0[k_, 0]), float(_co0[k_, 1])
        o_ = OL.at(x_, y_)
        # the sand's own ground dries too: where the dune mesh thins out by a
        # graded street the terrain showed as a green fringe (e08)
        if o_ > 0 and EA.in_city(x_, y_): _dk[k_] = o_ * (1.0 - OL.at(x_, y_, OL.park))
    _ca = _tm.color_attributes.new('OpenDry', 'FLOAT_COLOR', 'POINT')
    _ca.data.foreach_set('color', _np.repeat(_dk, 4).tolist())
    _lt = bpy.data.materials['ground'].node_tree; _lp = next(n for n in _lt.nodes if n.type == 'BSDF_PRINCIPLED')
    _src = _lp.inputs['Base Color'].links[0].from_socket
    _at = _lt.nodes.new('ShaderNodeAttribute'); _at.attribute_name = 'OpenDry'
    _bw = _lt.nodes.new('ShaderNodeRGBToBW'); _lt.links.new(_src, _bw.inputs[0])
    # the grass's own light and shade, lifted to straw (a lawn's luminance is
    # ~0.17: x3.2 makes the golden (0.62, 0.40, 0.13) a linear ~(0.33, 0.22,
    # 0.07), California's summer-dry grass; the plain multiply read as mud)
    _bk = _lt.nodes.new('ShaderNodeMath'); _bk.operation = 'MULTIPLY'; _bk.inputs[1].default_value = float(E('DRY_K', 3.2))
    _lt.links.new(_bw.outputs[0], _bk.inputs[0])
    _dry = _lt.nodes.new('ShaderNodeMix'); _dry.data_type = 'RGBA'; _dry.blend_type = 'MULTIPLY'; _dry.inputs[0].default_value = 1.0
    _dry.inputs[6].default_value = (0.56, 0.45, 0.19, 1)          # straw with olive: the dry-season grass (the first golden read peach, e11)
    _lt.links.new(_bk.outputs[0], _dry.inputs[7])
    _mx = _lt.nodes.new('ShaderNodeMix'); _mx.data_type = 'RGBA'; _lt.links.new(_at.outputs['Fac'], _mx.inputs[0])
    _lt.links.new(_src, _mx.inputs[6]); _lt.links.new(_dry.outputs[2], _mx.inputs[7])
    _lt.links.new(_mx.outputs[2], _lp.inputs['Base Color'])
    log('open land dried:', int((_dk > 0.5).sum()), 'of', _nv, 'terrain vertices')
    # the lots of buildings not yet built: parking or bare earth, not lawn (era.vacant_lots)
    LOTS = EA.vacant_lots(_allb, {b['gid'] for b in recs}, ERA, open_at, CBOX) if E('LOTS', '1') == '1' else []
    # nothing of a lot on the water: a footprint over the bay or the year's
    # water, or whose ground is under 0.8 m (the critic's props floated where
    # 'works' polygons reach over the water, 2026-09-24)
    def _lot_dry(L_):
        zs_ = [ground(p_[0], p_[1]) for p_ in L_['ring']]
        return all(z_ is not None and z_ >= 0.8 for z_ in zs_) and not any(EA.water_then(p_[0], p_[1], ERA) for p_ in L_['ring'])
    LOTS = [L_ for L_ in LOTS if _lot_dry(L_)]
    LI = EA.LotIndex(LOTS)
    EA.lots_mesh(bpy, LOTS, ground, {'paved': ph_mat('worn_asphalt', 7.0, name='lot_paved', value=float(E('LOT_PV', 1.35)), rough_add=0.2),
                                     'dirt': ph_mat('withered_grass', 5.0, name='lot_dirt', value=float(E('LOT_DV', 0.85)))}, log)
else:
    LOTS, LI = [], None
    def open_at(x, y, grid=None): return 0.0
    def street_stands(x, y): return True

log('streets')
SP, MP, DP, DL = array.array('f'), array.array('f'), array.array('f'), array.array('f')
for m in d['meshes']:
    if m.get('instanced'): continue
    if m['layer'] == 'streets':
        p_ = f32(m['pos'])
        if ERA is not None or BOX is not None:
            q_ = array.array('f')
            for t in range(len(p_) // 9):
                a = t * 9
                if not in_box(p_[a], p_[a+1], 60): continue
                if ERA is None or street_stands((p_[a] + p_[a+3] + p_[a+6]) / 3, (p_[a+1] + p_[a+4] + p_[a+7]) / 3): q_.extend(p_[a:a+9])
            p_ = q_
        SP.extend(p_)
    elif m['layer'] == 'street-markings' and (ERA is None or EA.P('marks', ERA) >= 0.5):
        p = f32(m['pos'])
        for t in range(len(p) // 9):
            a = t * 9
            if abs((p[a+3]-p[a])*(p[a+7]-p[a+1]) - (p[a+4]-p[a+1])*(p[a+6]-p[a])) / 2 < 6.0 and in_box(p[a], p[a+1], 60):
                # no paint where the street itself is not yet built (it floated over the yards)
                if ERA is None or street_stands((p[a] + p[a+3] + p[a+6]) / 3, (p[a+1] + p[a+4] + p[a+7]) / 3): MP.extend(p[a:a+9])
    elif m['layer'] == 'ground-detail':
        # not ground: the engine's translucent overlays (pier plates .2, their
        # dark drop shadows offset south-west .35 — the grey 'ghost piers' on
        # the bay — the lakes' glaze .42) and its opaque blue lakes (landmarks_hq
        # draws the lakes from OSM): white vertex colours sent them to 'paths'
        if m.get('opacity', 1) < 0.45 or (m.get('color') or [1])[0] < 0.3: continue
        c = f32(m['col']); p = f32(m['pos'])
        tgt = DP if (c and c[2] > 0.8) else DL
        if BOX is None: tgt.extend(p)
        else:
            for t in range(len(p) // 9):
                if in_box(p[t*9], p[t*9+1], 60): tgt.extend(p[t*9:t*9+9])
for i in range(2, len(SP), 3): SP[i] += 0.02
streets = mesh_from('streets', SP, M['asphalt'], weld=0.05)
_PAVE2 = None
if ERA is not None and EA.pavement(ERA, 0, 0) in ('basalt', 'dirt'):
    # before 1910 the paving changes with the place (era.pavement): the
    # materials slice gave the whole city one, from the scene's centre
    _PAVE2 = {'basalt': bpy.data.materials.get('basalt') or ph_mat('cobblestone_floor_05', 2.2, value=0.62, name='basalt'),
              'dirt': bpy.data.materials.get('dirt') or ph_mat('brown_mud_dry', 3.0, value=1.05, name='dirt')}
    _sm = streets.data; _sm.materials.clear(); _sm.materials.append(_PAVE2['dirt']); _sm.materials.append(_PAVE2['basalt'])
    import numpy as _np
    _cen = _np.empty(len(_sm.polygons) * 3, _np.float32); _sm.polygons.foreach_get('center', _cen); _cen = _cen.reshape(-1, 3)
    _mi = [1 if EA.pavement(ERA, float(c_[0]), float(c_[1])) == 'basalt' else 0 for c_ in _cen]
    _sm.polygons.foreach_set('material_index', _mi); _sm.update()
    log('streets paved with basalt block', sum(_mi), 'of', len(_mi), 'faces; earth elsewhere')
sbv = BVHTree.FromObject(streets, bpy.context.evaluated_depsgraph_get())
for i in range(0, len(MP), 3):
    h_ = sbv.ray_cast(Vector((MP[i], MP[i+1], MP[i+2] + 3)), Vector((0, 0, -1)))
    if h_[0] is not None: MP[i+2] = h_[0].z + 0.012
if len(MP): mesh_from('markings', MP, M['paint'])
for i in range(2, len(DP), 3): DP[i] += 0.04
for i in range(2, len(DL), 3): DL[i] += 0.03
if len(DP): mesh_from('paths', DP, M['path'])
pass   # the parks: painted by hill_ground (hq_scene's materials block)

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
if _PAVE2 is not None:
    # no concrete footway where the carriageway was graded earth (CONVENTION:
    # plank and earth walks beyond the paved core before 1910)
    me.materials.append(_PAVE2['dirt'])
    _mi = [1 if EA.pavement(ERA, float(f_.center.x), float(f_.center.y)) == 'dirt' else 0 for f_ in me.polygons]
    me.polygons.foreach_set('material_index', _mi); me.update()
log('street edges', len(SE))
if ERA is not None and E('SMOOTH_OPEN', '1') == '1':
    # OPEN LAND ON THE LAND'S OWN SHAPE: today's ground carries the city's cut
    # and fill — street benches, house pads, retaining walls — which on the
    # open hills of an early year read as pale terraces (1890, 2026-09-24).
    # Where the year's ground is open (not a park, not within 10 m of a street
    # standing then) the terrain is eased toward its shape smoothed over ~20 m,
    # as far as it is open. CONVENTION (the dunes do the same, era.dune_height).
    import numpy as _np
    _tm = terrain.data; _nv = len(_tm.vertices)
    _co = _np.empty(_nv * 3, _np.float32); _tm.vertices.foreach_get('co', _co); _co = _co.reshape(-1, 3)
    _R = 8.0; _gx0, _gy0 = _co[:, 0].min() - _R, _co[:, 1].min() - _R
    _gi = ((_co[:, 0] - _gx0) / _R).astype(int); _gj = ((_co[:, 1] - _gy0) / _R).astype(int)
    _GW, _GH = _gi.max() + 2, _gj.max() + 2
    _sum = _np.zeros((_GH, _GW)); _cnt = _np.zeros((_GH, _GW))
    _np.add.at(_sum, (_gj, _gi), _co[:, 2]); _np.add.at(_cnt, (_gj, _gi), 1)
    def _box(a_, r_):
        for ax_ in (0, 1):
            c_ = _np.cumsum(_np.pad(a_, [(r_ + 1, r_) if k_ == ax_ else (0, 0) for k_ in (0, 1)], mode='edge'), axis=ax_)
            a_ = (_np.take(c_, range(2 * r_ + 1, c_.shape[ax_]), axis=ax_) - _np.take(c_, range(0, c_.shape[ax_] - 2 * r_ - 1), axis=ax_)) / (2 * r_ + 1)
        return a_
    _s = _box(_box(_sum, 3), 3); _c = _box(_box(_cnt, 3), 3)
    _zs = _np.where(_c > 1e-6, _s / _np.maximum(_c, 1e-6), 0.0)
    _fx = (_co[:, 0] - _gx0) / _R - 0.5; _fy = (_co[:, 1] - _gy0) / _R - 0.5
    _i0 = _np.clip(_np.floor(_fx).astype(int), 0, _GW - 2); _j0 = _np.clip(_np.floor(_fy).astype(int), 0, _GH - 2)
    _tx = _np.clip(_fx - _i0, 0, 1); _ty = _np.clip(_fy - _j0, 0, 1)
    _zb = (_zs[_j0, _i0] * (1 - _tx) * (1 - _ty) + _zs[_j0, _i0 + 1] * _tx * (1 - _ty) + _zs[_j0 + 1, _i0] * (1 - _tx) * _ty + _zs[_j0 + 1, _i0 + 1] * _tx * _ty)
    _w = _np.zeros(_nv, _np.float32); _nm = 0
    for k_ in range(_nv):
        x_, y_, z_ = _co[k_]
        if z_ < 0.5: continue                                   # the shore and the water of the year stay put
        o_ = OL.at(x_, y_)
        if o_ <= 0.02 or OL.at(x_, y_, OL.park) > 0.5 or not EA.in_city(x_, y_): continue
        if len(streets.data.polygons) and sbv.find_nearest(Vector((x_, y_, z_)), 10.0)[0] is not None: continue
        _w[k_] = o_; _nm += 1
    _co[:, 2] = _co[:, 2] + (_np.maximum(_zb, 0.4) - _co[:, 2]) * _w
    _tm.vertices.foreach_set('co', _co.ravel()); _tm.update()
    bvh_t = BVHTree.FromObject(terrain, bpy.context.evaluated_depsgraph_get())
    log('open land eased to the land\'s own shape:', _nm, 'of', _nv, 'terrain vertices')
if ERA is not None and len(streets.data.polygons):
    # the rails of the year and the cars on them (hq_scene's block)
    _rs = _HQSRC[_HQSRC.index("    _rb = BVHTree.FromObject(streets"):_HQSRC.index("                   simple('cableslot'")]
    _rs = '\n'.join(l[4:] if l.startswith('    ') else l for l in _rs.split('\n'))
    bx0, by0, bx1, by1 = CBOX
    exec(_rs + "\n                   simple('cableslot', (0.02, 0.02, 0.02), rough=0.9), _bm, log)".replace('\n                   ', '\n               '))
if os.environ.get('BRUSH', '1') == '1': hill_brush(ground, BOX)

# ── landmarks the engine models by hand (Coit Tower, the Transamerica...) ──
HP, HC = array.array('f'), array.array('f')
for m in d['meshes']:
    # heroes only: the engine's 'caps' crown generic towers the generator now models itself
    if m['layer'] == 'heroes' and not m.get('instanced'):
        _f = EA.hero_mesh_filter(f32(m['pos']), f32(m['col']), ERA)
        if _f is not None: HP.extend(_f[0]); HC.extend(_f[1])
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
    """the asset's trees, ONE PROTO PER TREE. pine_tree_01 and fir_tree_01 hold
    three trees side by side (a, b, c): instanced whole, every 'pine' was three
    pines spread over 8 m, some of them on the neighbours' roofs (2026-09-24).
    Returns [(collection, crown width, height)], based at each tree's own foot."""
    path = glob.glob(f'{PH}/{asset}/*.blend')[0]
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.collections = [c for c in src.collections if c == f'{asset}_LOD0'] or [c for c in src.collections if c.endswith('LOD0')][:1]
    c = dst.collections[0]
    out = []
    for o in [o for o in c.all_objects if o.type == 'MESH']:
        mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
        vs_ = o.data.vertices
        for i_ in range(0, len(vs_), 7):
            p = o.matrix_world @ vs_[i_].co
            mn = Vector((min(mn.x, p.x), min(mn.y, p.y), min(mn.z, p.z))); mx = Vector((max(mx.x, p.x), max(mx.y, p.y), max(mx.z, p.z)))
        one = bpy.data.collections.new(f'{o.name}_one'); one.objects.link(o)
        one.instance_offset = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
        out.append((one, max(mx.x - mn.x, mx.y - mn.y), mx.z - mn.z))
    return out

def instancer(name, pts, protos):
    """pts: (x, y, z, scale, rot, kind); protos: collections, one per kind"""
    root = bpy.data.collections.new(f'{name}_protos')
    for c in protos: root.children.link(c)
    me = bpy.data.meshes.new(name); me.vertices.add(len(pts))
    me.vertices.foreach_set('co', [v for p in pts for v in p[:3]])
    for nm, k, tp in (('s', 3, 'FLOAT'), ('r', 4, 'FLOAT'), ('kind', 5, 'INT')):
        at = me.attributes.new(nm, tp, 'POINT'); at.data.foreach_set('value', [p[k] for p in pts])
    # a stable id by place: the instances' random (tree tint, car paint) then
    # stays with the place from one year of the film to the next
    at = me.attributes.new('id', 'INT', 'POINT')
    at.data.foreach_set('value', [int(EA.hash01(p[0], p[1], 31) * 2147483000) for p in pts])
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
# NO TRUNK OUT OF A ROOF. The measured canopy sees crowns that overhang houses
# (it is an aerial survey), so a mass's centre can fall on a roof, and the trunk
# planted there came out of the roof: "trees that are like a trunk starting
# midair" (Daniel, 2026-09-24). Every footprint, filled on a 1 m grid.
def _occupancy(recs_, pad=60):
    xs = [p[0] for b in recs_ for p in b['ring']]; ys = [p[1] for b in recs_ for p in b['ring']]
    if not xs: return None
    ox, oy = int(min(xs)) - pad, int(min(ys)) - pad
    g = np.zeros((int(max(ys)) - oy + pad, int(max(xs)) - ox + pad), dtype=bool)
    for b in recs_:
        rg = [(x - ox, y - oy) for x, y in b['ring']]
        if len(rg) < 3: continue
        y0_, y1_ = int(min(y for _, y in rg)), int(max(y for _, y in rg)) + 1
        for row in range(max(0, y0_), min(g.shape[0], y1_)):
            yc = row + 0.5; xi = []
            for (xa, ya), (xb, yb) in zip(rg, rg[1:] + rg[:1]):
                if (ya <= yc < yb) or (yb <= yc < ya): xi.append(xa + (yc - ya) * (xb - xa) / (yb - ya))
            xi.sort()
            for a_, b_ in zip(xi[0::2], xi[1::2]):
                g[row, max(0, int(a_ + 0.5)):max(0, int(b_ + 0.5))] = True
    return g, ox, oy
_OCC = _occupancy(recs)
def roofed(x, y):
    if _OCC is None: return False
    g, ox, oy = _OCC; r_, c_ = int(y - oy), int(x - ox)
    return 0 <= r_ < g.shape[0] and 0 <= c_ < g.shape[1] and bool(g[r_, c_])
def open_foot(x, y, reach):
    """where the trunk can stand: the point itself if it is open ground, else
    the nearest open ground within the crown's reach (a mass centred over a roof
    is a yard tree whose crown overhangs the house — moved, not dropped: dropping
    them stripped the neighbourhoods of their green, 2026-09-24)"""
    if not roofed(x, y): return x, y
    d = 1.5
    while d <= max(2.5, reach):
        for a in range(12):
            t_ = a * math.pi / 6; nx, ny = x + d * math.cos(t_), y + d * math.sin(t_)
            if not roofed(nx, ny): return nx, ny
        d += 1.5
    return None
kd = KDTree(len(recs)); [kd.insert((b['cx'], b['cy'], 0), i) for i, b in enumerate(recs)]; kd.balance()
# park or street is the tree's own nature: read against today's buildings, or
# every street tree beside a lot not yet built passed for a park tree (kept in
# every year) — South Beach wooded in 1960 (2026-09-23)
if ERA is not None:
    kd = KDTree(len(_allb)); [kd.insert((b['cx'], b['cy'], 0), i) for i, b in enumerate(_allb)]; kd.balance()
STREET = [t for a in ('island_tree_01', 'island_tree_02', 'island_tree_03', 'tree_small_02', 'jacaranda_tree') for t in load_collection(a)]
PINE = load_collection('pine_tree_01'); FIR = load_collection('fir_tree_01')
BROAD = [t for a in ('island_tree_02', 'island_tree_01') for t in load_collection(a)]
PARK = PINE + FIR + BROAD
NS, K_PINE = len(STREET), len(STREET)                      # kinds: street 0…, pines, firs, broadleaf
K_FIR = K_PINE + len(PINE); K_BROAD = K_FIR + len(FIR)
protos = [c for c, _, _ in STREET + PARK]; widths = [w for _, w, _ in STREET + PARK]; heights = [h for _, _, h in STREET + PARK]
log('tree protos (w, h):', [(round(w, 1), round(h, 1)) for w, h in zip(widths, heights)])
# A proto is scaled to the crown's WIDTH, but not past a height: a narrow pine
# scaled to an 8 m crown stood 30-40 m tall, a stick (2026-09-23). Broadleaf
# crowns stand at most 1.4 widths tall, pines and firs 2.
TALL = [1.4] * NS + [2.0] * (len(PINE) + len(FIR)) + [1.4] * len(BROAD)
# and an absolute height: Monterey pines and cypress here stand 15-25 m, street
# broadleaf 6-15 m. Canopy crowns 3x the disc made Pioneer Park's pines 23-32 m
# and swallowed Coit Tower (landmarks agent, measured 24/09).
HMAX = [15.0] * NS + [24.0] * (len(PINE) + len(FIR)) + [18.0] * len(BROAD)
def tree_scale(kind, crown):
    return min(crown / max(0.5, widths[kind]), TALL[kind] * crown / max(0.5, heights[kind]),
               HMAX[kind] / max(0.5, heights[kind]))
pts = []; seen = set(); r = random.Random(3)
_TKD = None
if ERA is not None:
    _tl = city_data.trees(*(CBOX[0] - 50, CBOX[1] - 50, CBOX[2] + 50, CBOX[3] + 50))
    if _tl:
        _TKD = KDTree(len(_tl)); _TY = [t_[2] for t_ in _tl]
        for i_, t_ in enumerate(_tl): _TKD.insert((t_[0], t_[1], 0), i_)
        _TKD.balance()
# WHAT THE ENGINE'S 'trees' LAYER HOLDS. Only the Lambert meshes are trees
# (the register, 195,310 crowns, listed once per zoom band). The Basic meshes
# are the dark CONTACT DISCS painted under them (layers/canopy-shadow.ts): one
# under each register tree, four under each measured canopy mass at the fine
# band, one per mass at the coarse band. Planting a tree on every disc put
# ~450,000 extra pines in the city and turned Alamo Square and Dolores Park into
# forest (2026-09-23). The fine-band discs are kept for what they are: where
# the measured canopy is, and how wide (the coarse band's one disc per mass
# spills over lawns and thins real forest, Sutro's); each gets one crown.
MASS = []
for t in d['trees']:
    lam = t.get('mat') == 'MeshLambertMaterial'
    if not lam:
        if t['visible'] and len(t['pos']) // 9 == 192: MASS.extend(t['inst'])
        continue
    for (x, y, z, sxz, sy, rot, *_rest) in t['inst']:
        # the engine lists a tree once per zoom band, a few centimetres apart
        k = (round(x / 2.5), round(y / 2.5))
        if k in seen or not in_box(x, y, 50): continue
        seen.add(k)
        f_ = open_foot(x, y, 3.0)
        if f_ is None: continue
        x, y = f_
        park = kd.find((x, y, 0))[2] > 28 if len(recs) else True
        crown = max(3.0, 2.0 * sxz)
        if ERA is not None:
            # dated street trees from their planting year (DataSF Street Tree
            # List), crowns grown to their age; undated ones by era.TABLE `trees`
            pt_ = _TKD.find((x, y, 0)) if _TKD else None
            py_ = _TY[pt_[1]] if (pt_ and pt_[2] < 2.5) else None
            if py_ is not None:
                if py_ > ERA: continue
                crown = max(1.6, crown * min(1.0, ((ERA - py_ + 3) / (2025 - py_ + 3)) ** 0.7))
            elif not park and EA.hash01(x, y, 11) > EA.street_tree_keep(ERA): continue
            if park and not EA.canopy_stands(x, y, ERA, _allb, kd): continue     # a park or plaza of later years
            if open_at(x, y) > 0.5 and OL.at(x, y, OL.park) < 0.5 and EA.hash01(x, y, 12) > 0.04: continue
            if EA.water_then(x, y, ERA): continue
            if LI is not None and LI.inside(x, y): continue          # a vacant lot of the year
        # parks: mostly broadleaf, some Monterey pine; firs only now and then
        # (every draw by place: a tree keeps its kind, size and turn from one
        # year of the film to the next)
        u_ = EA.hash01(x, y, 14)
        kind = ((K_BROAD + int(EA.hash01(x, y, 17) * len(BROAD)) if u_ < 0.8 else K_PINE + int(EA.hash01(x, y, 18) * len(PINE)))
                if park else int(u_ * NS))
        gz_ = ground(x, y)
        if gz_ is None: continue
        pts.append((x, y, gz_ - 0.1, tree_scale(kind, crown) * (0.85 + 0.3 * EA.hash01(x, y, 15)), EA.hash01(x, y, 13) * 6.283, kind))
nreg = len(pts)
# the measured canopy: one crown per mass, as wide as the mass, unless the
# register already has a tree there
for (x, y, z, rad, *_rest) in MASS:
    if not in_box(x, y, 50) or (round(x / 2.5), round(y / 2.5)) in seen: continue
    f_ = open_foot(x, y, 1.2 * rad)
    if f_ is None: continue
    x, y = f_
    if any((round(x / 2.5) + a, round(y / 2.5) + b) in seen for a in (-1, 0, 1) for b in (-1, 0, 1)): continue
    if ERA is not None:
        # today's canopy on ground that was then dune or open grass (outside
        # the parks, which were planted from their founding: era.in_park), or
        # under water, did not stand yet
        if open_at(x, y) > 0.5 and OL.at(x, y, OL.park) < 0.5: continue
        if EA.water_then(x, y, ERA): continue
        if LI is not None and LI.inside(x, y): continue
        if not EA.canopy_stands(x, y, ERA, _allb, kd): continue
    gz_ = ground(x, y)
    if gz_ is None: continue
    # canopy: crowns a little wider than the disc, so a mass reads as one clump
    kind = K_BROAD + int(EA.hash01(x, y, 17) * len(BROAD)) if EA.hash01(x, y, 14) < 0.85 else K_PINE + int(EA.hash01(x, y, 18) * len(PINE))
    crown = max(4.0, float(E("CANOPY_K", 3.0)) * rad)
    seen.add((round(x / 2.5), round(y / 2.5)))
    pts.append((x, y, gz_ - 0.1, tree_scale(kind, crown) * (0.85 + 0.3 * EA.hash01(x, y, 15)), EA.hash01(x, y, 13) * 6.283, kind))
log('trees: register', nreg, 'canopy masses', len(pts) - nreg, 'of', len(MASS))
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
# a car parks where there is a door to park at: the building walls, sampled
# every 8 m; a curb with no wall within 18 m is a park drive, a hill road, a
# freeway's edge (Twin Peaks Boulevard was a traffic jam)
_fp = []
for b_ in recs:
    rg_ = b_['ring']
    for q_ in range(len(rg_)):
        x0_, y0_ = rg_[q_]; x1_, y1_ = rg_[(q_ + 1) % len(rg_)]; n_ = max(1, int(math.hypot(x1_ - x0_, y1_ - y0_) / 8.0))
        _fp.extend((x0_ + (x1_ - x0_) * t_ / n_, y0_ + (y1_ - y0_) * t_ / n_, 0.0) for t_ in range(n_))
kdw = KDTree(max(1, len(_fp)))
for i_, q_ in enumerate(_fp): kdw.insert(q_, i_)
kdw.balance()
for a, b, outv in SE:
    v = b - a; L_ = v.length
    if L_ < 7: continue
    ang = math.atan2(v.y, v.x)
    occ = EA.car_occupancy(ERA)
    for i in range(int((L_ - 3) // 6.2)):
        p = a + v * ((1.5 + 3.1 + i * 6.2) / L_) - outv * 1.25
        if EA.hash01(p.x, p.y, 21) > occ: continue            # by kerb slot: no flicker between years
        if not in_box(p.x, p.y) or open_at(p.x, p.y) > 0.3: continue
        if _fp and kdw.find((p.x, p.y, 0.0))[2] > 18.0: continue      # a car parks near a door
        cpts.append((p.x, p.y, p.z + 0.02, 1.0, ang + (math.pi if EA.hash01(p.x, p.y, 25) < 0.5 else 0), car_pick(EA.hash01(p.x, p.y, 24))))
# the parking lots of the year, their stalls filled by their own draws
for L_ in LOTS:
    for (x_, y_, h_, u_) in L_['cars']:
        gz_ = ground(x_, y_)
        if gz_ is not None and gz_ >= 0.8 and in_box(x_, y_) and not EA.water_then(x_, y_, ERA): cpts.append((x_, y_, gz_ + 0.11, 1.0, h_, car_pick(u_)))
instancer('cars', cpts, car_colls)

# ── open ground of the year: dunes, the 1906 ash (hq_scene's block, city-sized) ──
if ERA is not None:
    bx0, by0, bx1, by1 = CBOX; OPAD = 80.0; ox0, oy0 = OL.x0, OL.y0; SAND = OL.sand; OPEN = OL.open
    if 'DUNE_RES' not in os.environ: os.environ['DUNE_RES'] = '10.0'
    _ds = _HQSRC[_HQSRC.index("# ── open land: dunes where the Outside Lands"):_HQSRC.index("# ── the sea: the water mask")]
    _g = dict(globals()); _g['ground'] = ground0; exec(_ds, _g)

# ── the sea ──────────────────────────────────────────────────────────────────
_ss = _HQSRC[_HQSRC.index("def sea():"):_HQSRC.index("# ── camera and light")]
# the district script's own landmarks hook sits in that slice; the city calls
# landmarks_hq itself (below), with its own box — cut the district's out
_ss = _ss.split("# ── LANDMARKS, TERRAIN AND WATER DETAIL")[0]
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
        landmarks_hq.build(bpy, sc, M, ground0, (BOX or [-9000, -9000, 9000, 9000]), d, log, ERA)

# ── TRANSIT (transit_hq.py, the transit agent): track, overhead, platforms, vehicles; TRANSIT=0 skips
if E('TRANSIT', '1') == '1':
    try: import transit_hq; transit_hq.build(bpy, sc, M, ground, (BOX or [-9000, -9000, 9000, 9000]), d, log, ERA)
    except Exception as ex: log('transit_hq: not built:', ex)
# ── LIFE (life_hq.py, the life agent): boats and wakes on the bay, traffic in the streets; LIFE=0 skips
if E('LIFE', '1') == '1':
    try: import life_hq; life_hq.build(bpy, sc, M, ground, (BOX or [-9000, -9000, 9000, 9000]), d, log, ERA)
    except Exception as ex: log('life_hq: not built:', ex)

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

# ── PYRAMID MODE: the site's own tile grid, exactly ──────────────────────────
# `scripts/render-city-tiles.mjs` and `lib/citygl/tile-plane.ts` define the
# pyramid: level z is a canvas of 2560·2^(z-3) x 1536·2^(z-3) device px (dpr 2)
# centred on REF, at REF.scale·2^(z-3) CSS px per plane unit. The engine's
# plane is linear in the world at its 315° bearing:
#     px = √2·cos30·x = 1.2247·x        py = √2·sA·y + z·zex   (sA 0.42)
# and it is a TRUE orthographic camera exactly when zex = √(2(cos²30 − sA²))
# = 1.0711 — the rows are orthogonal and of equal length. So the render uses
# that camera (true proportions, 29.0° elevation) and the pyramid's index.json
# says zex = zexb = 1.0711, which the tile map's overlay then uses: labels and
# taps land on the rendered buildings, hills included.
if E('MODE') == 'pyramid':
    Z, sz, cw, ch = PZ, SZ, PCW, PCH
    nfx, nfy = math.ceil(cw / FW), math.ceil(ch / FH)
    up = Vector((0, KY, ZT)).normalized(); fw_ = Vector((0, ZT, -KY)).normalized()
    cam_d.ortho_scale = (FW / 2) / sz / KX                           # metres across the frame
    sc.render.resolution_x, sc.render.resolution_y = FW, FH
    sc.render.resolution_percentage = int(E('PCT', 100))          # tests: the same frame, smaller
    sc.render.use_border = False; sc.render.use_persistent_data = True
    if E('BORDER'):   # a crop of the frame, for fast look tests (fractions, y from the bottom)
        bx_ = [float(v) for v in E('BORDER').split(',')]
        sc.render.use_border = True; sc.render.use_crop_to_border = True
        sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = bx_
    rot = Matrix((Vector((1, 0, 0)), up, -fw_)).transposed().to_euler()
    log(f'pyramid level {Z}: canvas {cw}x{ch}, {nfx}x{nfy} frames of {FW}x{FH}, {1 / (sz * 2 * KX) * 100:.1f} cm/px')
    for j in range(nfy):
        for i in range(nfx):
            if ONLY and (i, j) not in ONLY: continue
            # the frame's centre in the level canvas (device px) -> CSS -> plane -> world at z = 0
            ccx, ccy = (i + 0.5) * FW / 2, (j + 0.5) * FH / 2
            px_ = REF['cx'] + (ccx - cw / 4) / sz; py_ = REF['cy'] - (ccy - ch / 4) / sz
            wp = Vector((px_ / KX, py_ / KY, 0.0))
            cam.location = wp - fw_ * 20000; cam.rotation_euler = rot
            # LOOKS (look tests): several lights on one built scene, one file each;
            # 'tag:el,sun,sky,expo;…'
            for lk_ in (E('LOOKS').split(';') if E('LOOKS') else ['']):
                fn = f'{OUT}_z{Z}_{i}_{j}.png' if not lk_ else f"{OUT}_{lk_.split(':')[0]}_z{Z}_{i}_{j}.png"
                if os.path.exists(fn): continue
                if lk_:
                    el_, sk_, bk_, ex_ = (float(v) for v in lk_.split(':')[1].split(','))
                    a_, e_ = math.radians(float(E('SUN_AZ', 215))), math.radians(el_)
                    sun.rotation_euler = (-Vector((math.sin(a_) * math.cos(e_), math.cos(a_) * math.cos(e_), math.sin(e_)))).to_track_quat('-Z', 'Y').to_euler()
                    sky.sun_elevation = e_; sun_d.energy = sk_; bg.inputs['Strength'].default_value = bk_; sc.view_settings.exposure = ex_
                sc.render.filepath = fn
                t1 = time.time(); bpy.ops.render.render(write_still=True)
                log(f'frame {i},{j}{" " + lk_ if lk_ else ""}: {time.time() - t1:.1f}s')
    log('PYRAMID done'); sys.exit(0)

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
