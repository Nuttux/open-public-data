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
import look_preset   # the default look as env defaults, before any E(): LOOK=V5 clear midday (default), LOOK=B golden hour
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
    _pad = (450, 700, 450, 150)
    if E('BORDER') and len(ONLY) == 1:
        # A CROP TEST NEEDS ONLY ITS CROP: the frame's sub-rectangle (BORDER is
        # fractions, y from the image bottom = the frame's low world y), with a
        # tighter margin (shadows ~450 m for 200 m towers at 24 deg, towers to
        # the south rising into view). A whole-frame scene for a crop cost
        # 35-45 GB and 30-50 s of build; this is a fraction (24/09, parallel tests)
        bx_ = [float(v) for v in E('BORDER').split(',')]
        f0 = fr_[0]; fw_, fh_ = f0[2] - f0[0], f0[3] - f0[1]
        fr_ = [(f0[0] + bx_[0] * fw_, f0[1] + bx_[2] * fh_, f0[0] + bx_[1] * fw_, f0[1] + bx_[3] * fh_)]
        _pad = tuple(float(v) for v in E('BOXPAD', '300,500,300,120').split(','))
    BOX = [min(f[0] for f in fr_) - _pad[0], min(f[1] for f in fr_) - _pad[1], max(f[2] for f in fr_) + _pad[2], max(f[3] for f in fr_) + _pad[3]]
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
        # (25/09) + a dated pier not yet built: its deck is in the 3DEP ground (a mound in the water, Pier 7 1973-90)
        if k_ not in _wc: _wc[k_] = EA.water_then(TP[i], TP[i+1], ERA) or EA.dated_absent(TP[i], TP[i+1], ERA, pad=10.0)
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
bvh_s = None
if len(SP_):
    for i in range(2, len(SP_), 3): SP_[i] = SP_[i] * 0.5 - 0.3
    _sur = mesh_from('surround', SP_, bpy.data.materials['ground'], smooth=True, cols=SC_)
    bvh_s = BVHTree.FromObject(_sur, bpy.context.evaluated_depsgraph_get())
def ground_s(x, y):
    # beyond the county line (Daly City, Brisbane: ground_hq's generic
    # buildings and OSM streets) the surround is the ground
    g_ = ground(x, y)
    if g_ is not None or bvh_s is None: return g_
    h_ = bvh_s.ray_cast(Vector((x, y, 2000)), Vector((0, 0, -1)))
    return h_[0].z if h_[0] else None

# ── the year shown: the records that stood, open land, the streets of the day ──
log('buildings: records')
HG = city_data.hero_gids()
# NEVER BUILT, though the roll records them: Oceanwide Center Tower I, 50 First
# St (gid 137672, 259 m, "1917" on the roll) — begun 2016-17, halted 2019-20,
# still a hole (Wikipedia 'Oceanwide Center'); the orchestrator's PHANTOMS
PHANTOMS = {137672}
HG |= PHANTOMS
# and the footprints a landmarks_hq model replaces (lm_prep.py writes the list;
# a pass reads the copy frozen in its snapshot, a test the live one)
_sk = [q for q in (os.path.join(HERE, 'skip_gids.json'), '/Users/daniel/code/qipu-render-work/landmarks/skip_gids.json') if os.path.exists(q)]
if _sk:     # a landmark replaces its footprints only once it's built (ERA None = today)
    _skj = json.load(open(_sk[0])); _skb = _skj.get('built', {})
    HG |= {int(g) for k_, v_ in _skj['by_landmark'].items() if ERA is None or ERA >= _skb.get(k_, 0) for g in v_}
_allb0 = [b for b in city_data.buildings(-9000, -9000, 9000, 9000) if in_box(b['cx'], b['cy'], 80)]
_allb = [b for b in EA.fix_records(_allb0, ERA) if b['gid'] not in HG]
recs = [b for b in (EA.place_record(dict(b), ERA) for b in _allb if in_box(b['cx'], b['cy'])) if b]
recs += [b for b in EA.landmark_sites(_allb0, ERA) if in_box(b['cx'], b['cy'])]     # a landmark going up, or what stood before it
_sbr = [b for b in EA.sanborn_records(ERA) if in_box(b['cx'], b['cy'], 80)] if E('SANBORN', '1') == '1' else []
if _sbr:
    _nc = len(recs); recs = [b for b in recs if not EA.sanborn_contradicted(b, ERA)]
    log('Sanborn lost buildings standing', len(_sbr), '; contradicted records hidden', _nc - len(recs))
    recs += [b for b in (EA.place_record(dict(b), ERA) for b in _sbr if in_box(b['cx'], b['cy'])) if b]
if ERA is not None and E('INFILL', '1') == '1':
    _inf = [b for b in EA.infill(_allb, ERA, {b['gid'] for b in recs}) if in_box(b['cx'], b['cy'])]
    if _sbr:      # no guess on ground a lost building of the year stands on
        _skd = EA.sanborn_index(_sbr); _n0 = len(_inf)
        _inf = [b for b in _inf if _skd.find((b['cx'], b['cy'], 0))[2] > 8.0]
        log('infill stand-ins on Sanborn ground dropped', _n0 - len(_inf))
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
    EA.lots_mesh(bpy, LOTS, ground, {'paved': ph_mat('worn_asphalt', 7.0, name='lot_paved', value=float(E('LOT_PV', 1.0)), rough_add=0.2),
                                     'dirt': ph_mat('withered_grass', 5.0, name='lot_dirt', value=float(E('LOT_DV', 0.85)))}, log)
else:
    LOTS, LI = [], None
    def open_at(x, y, grid=None): return 0.0
    def street_stands(x, y): return True

log('streets')
SP, MP, DP, DL = array.array('f'), array.array('f'), array.array('f'), array.array('f')
SA_ = array.array('f')
for m in d['meshes']:
    if m.get('instanced'): continue
    if m['layer'] == 'streets':
        p_ = f32(m['pos'])
        if ERA is not None or BOX is not None:
            q_ = array.array('f')
            for t in range(len(p_) // 9):
                a = t * 9
                if not in_box(p_[a], p_[a+1], 60): continue
                if ERA is None or (street_stands((p_[a] + p_[a+3] + p_[a+6]) / 3, (p_[a+1] + p_[a+4] + p_[a+7]) / 3) and not EA.dated_absent((p_[a] + p_[a+3] + p_[a+6]) / 3, (p_[a+1] + p_[a+4] + p_[a+7]) / 3, ERA, pad=14.0)): q_.extend(p_[a:a+9])
            p_ = q_
        (SA_ if (m.get('color') or [1])[0] < 0.2 and E('ST_MERGE', '1') == '1' else SP).extend(p_)
    elif m['layer'] == 'street-markings' and (ERA is None or EA.P('marks', ERA) >= 0.5):
        p = f32(m['pos'])
        for t in range(len(p) // 9):
            a = t * 9
            if abs((p[a+3]-p[a])*(p[a+7]-p[a+1]) - (p[a+4]-p[a+1])*(p[a+6]-p[a])) / 2 < 6.0 and in_box(p[a], p[a+1], 60):
                # no paint where the street itself is not yet built (it floated over the yards)
                if ERA is None or (street_stands((p[a] + p[a+3] + p[a+6]) / 3, (p[a+1] + p[a+4] + p[a+7]) / 3) and not EA.dated_absent(p[a], p[a+1], ERA, pad=14.0)): MP.extend(p[a:a+9])
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
                if in_box(p[t*9], p[t*9+1], 60) and not EA.dated_absent(p[t*9], p[t*9+1], ERA, pad=14.0): tgt.extend(p[t*9:t*9+9])
# (25/09) THE CRUMPLED LOTS (Mission Rock, the Golden Gateway garages, Pier
# 48): the casing and the asphalt, two big surfaces of different
# triangulations each draped by terrain_hq on its own corners, cut through
# each other on uneven ground in dark faceted shards. The casing wholly under
# the asphalt goes (hq_scene's fix, never ported here). ST_MERGE=0: as before
ABV = None; VG = array.array('f')
if len(SA_):
    _nA = len(SA_); SP, ABV = merge_street_layers(SP, SA_)
    # (25/09) THE SIDEWALK UP TO THE LOT LINE. The casing left beyond the
    # asphalt (the kerb to the property line: sidewalk, a planting strip) was
    # drawn as asphalt, a dark band between the 3 m sidewalk and the house
    # fronts on every street. It is paving: cut from the street mesh (the
    # streets are the asphalt alone, so the kerbs, the cars and the walkers
    # follow the real kerb) and laid as sidewalk at kerb height; a casing
    # triangle straddling the kerb is split until its pieces lie on one side
    # (or within the kerb's sidewalk band).
    # VERGE=0: as before
    if E('VERGE', '1') == '1':
        _cs = SP[_nA:]; SP = SP[:_nA]
        def _on(x, y, z):
            h = ABV.ray_cast(Vector((x, y, z + 3.0)), Vector((0, 0, -1)), 6.0)
            return h[0] is not None and abs(h[0].z - z) < 1.0
        def _verge(V, depth=0):
            c = [sum(v[k] for v in V) / 3 for k in range(3)]
            on = [_on(*c)] + [_on(v[0] + (c[0] - v[0]) * 0.05, v[1] + (c[1] - v[1]) * 0.05, v[2]) for v in V]
            if all(on): return
            L = max(math.dist(V[i][:2], V[(i + 1) % 3][:2]) for i in range(3))
            if not any(on):
                for v in V: VG.extend((v[0], v[1], v[2] + 0.16))
                return
            # a small piece across the kerb lies within the 3 m sidewalk band
            # drawn from the kerb: laid just under the asphalt, whose edge
            # then draws the kerb line (no sawtooth into the roadway)
            if L < 2.5 or depth > 6:
                for v in V: VG.extend((v[0], v[1], v[2] - 0.03))
                return
            m = [tuple((V[i][k] + V[(i + 1) % 3][k]) / 2 for k in range(3)) for i in range(3)]
            for T in ((V[0], m[0], m[2]), (m[0], V[1], m[1]), (m[2], m[1], V[2]), (m[0], m[1], m[2])): _verge(T, depth + 1)
        for t in range(len(_cs) // 9):
            a_ = t * 9; _verge([(_cs[a_ + k * 3], _cs[a_ + k * 3 + 1], _cs[a_ + k * 3 + 2]) for k in range(3)])
        log(f'verges: {len(_cs) // 9} casing triangles beyond the asphalt -> {len(VG) // 9} sidewalk pieces')
SP, _ = drop_footway_streets(SP, BOX)          # footpaths the engine drew as streets (hq_scene)
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
MP = keep_on_streets(MP, sbv)                  # paint of a dropped footpath-street goes with it (hq_scene)
for i in range(0, len(MP), 3):
    h_ = sbv.ray_cast(Vector((MP[i], MP[i+1], MP[i+2] + 3)), Vector((0, 0, -1)))
    if h_[0] is not None: MP[i+2] = h_[0].z + 0.012
if len(MP): mesh_from('markings', MP, M['paint'])
if len(VG):
    mesh_from('verges', VG, M['sidewalk'], weld=0.02)
for i in range(2, len(DP), 3): DP[i] += 0.04
for i in range(2, len(DL), 3): DL[i] += 0.03
if len(DP): mesh_from('paths', DP, M['path'])
try:     # the streets beyond the county line (OSM, draped on the surround: ground_hq)
    import ground_hq as _gh
    _ssp = _gh.south_streets(ground_s, lambda x, y: ground(x, y) is not None, BOX)
    if _ssp: mesh_from('streets_south', _ssp, M['asphalt']); log('south streets', len(_ssp) // 18, 'quads')
except Exception as ex: log('south streets failed:', ex)
_pp = park_paths(BOX, ground0)                 # every footpath, stairway and trail, narrow and light (hq_scene)
if _pp: mesh_from('parkpaths', _pp[0], M['parkpath'], cols=_pp[1])
pass   # the parks: painted by hill_ground (hq_scene's materials block)

bm = bmesh.new(); bm.from_mesh(streets.data); bm.edges.ensure_lookup_table()
SE = []
for e in bm.edges:
    if len(e.link_faces) != 1: continue
    a, b = e.verts[0].co.copy(), e.verts[1].co.copy()
    inward = e.link_faces[0].calc_center_median() - (a + b) / 2; inward.z = 0
    v = b - a; outv = Vector((-v.y, v.x, 0)).normalized()
    if outv.dot(inward) > 0: outv = -outv
    # (25/09) a kerb only where no asphalt lies beyond the edge (hq_scene's
    # kerb_edge): the edges of the casing left round a dropped piece — the
    # slivers the merge leaves across a roadway — drew their 3 m sidewalk
    # band over the asphalt, pale diagonal wedges along the Sunset's streets
    if not kerb_edge(ABV, a, b, outv): continue
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
# the winding follows each street edge's direction: half the tops faced down and
# half the kerbs faced the sidewalk (n.z = -1 at Davis St, gg_street_diag). Tops up,
# kerbs towards the street.
for f in me.polygons:
    o_ = SE[f.index // 2][2]
    if (f.index % 2 == 0 and f.normal.z < 0) or (f.index % 2 == 1 and f.normal.dot(o_) > 0): f.flip()
me.update()
ob = bpy.data.objects.new('sidewalks', me); sc.collection.objects.link(ob); me.materials.append(M['sidewalk'])
if os.environ.get('GROUND_V2', '1') == '1' and ERA is None:
    # [GROUND_V2, assets_ground 28/09] THE GUTTER: SF's 0.6 m concrete gutter
    # pan along every kerb, a pale band with a darker grime line at the
    # kerb's foot. It frames each carriageway (a street, not a canal: the
    # dark bluish asphalt near the bay read as water to the AI, #54 / #55)
    Pg, Fg = [], []
    for a, b, outv in SE:
        dz = Vector((0, 0, 0.012)); ia, ib = a - outv * 0.6, b - outv * 0.6
        k = len(Pg); Pg += [tuple(a + dz), tuple(ia + dz), tuple(ib + dz), tuple(b + dz)]; Fg.append((k, k + 1, k + 2, k + 3))
    mg = bpy.data.meshes.new('gutters'); mg.from_pydata(Pg, [], Fg); mg.update()
    for f in mg.polygons:
        if f.normal.z < 0: f.flip()
    mg.update()
    M['gutter'] = ph_mat('concrete_pavement', 1.8, name='gutter', value=0.78)
    _deblue(M['gutter'], PAVE_GAIN)
    og = bpy.data.objects.new('gutters', mg); sc.collection.objects.link(og); mg.materials.append(M['gutter'])
    print(f'gutters: {len(Fg)} kerb edges')
    # [GROUND_V2] courts, fields, tracks, playgrounds, dirt lots, lawn strips from OSM (ground_osm.py)
    try:
        import ground_osm; ground_osm.build(sc, M, ground0, streets, BOX, log)
        import port_containers; port_containers.build(sc, ground0, BOX, log)
    except Exception as ex:
        import traceback; traceback.print_exc(); log(f'ground_osm: failed ({ex})')
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
if os.environ.get('BRUSH', '1') == '1': hill_brush(ground_s, BOX)     # the brush beyond the county line stands on the surround

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
if E('GID_PASS') == '1':   # every face a building draws carries its gid as colour (24 bit), for the ID pass only
    _poly0 = G.Out.poly
    def _poly_gid(self, mat, pts, col=(1, 1, 1)):
        g_ = getattr(G, '_GID', 0); _poly0(self, mat, pts, ((g_ >> 16) / 255, ((g_ >> 8) & 255) / 255, (g_ & 255) / 255))
    G.Out.poly = _poly_gid
CH = 6000; nfaces = 0; _bfail = []
for c0 in range(0, len(recs), CH):
    out = G.Out()
    for b in recs[c0:c0 + CH]:
        if E('GID_PASS') == '1': G._GID = int(b['gid'])   # AI layer: building-ID pass (see _ai_passes)
        try: G.building(b, ground_s, out)     # (DataSF's own footprints reach ~300 m past the county line, onto the surround: they were skipped)
        except Exception as ex:     # a broken building used to draw half and say nothing: log the first ones
            _bfail.append(b.get('gid'))
            if len(_bfail) <= 5: import traceback; log('building failed:', b.get('gid'), repr(ex)); traceback.print_exc()
    objs = G.emit(bpy, out, M, name=f'b{c0 // CH}')
    nfaces += sum(len(o.data.polygons) for o in objs); del out
    log('chunk', c0 // CH, 'faces so far', nfaces)

if _bfail: log('buildings failed:', len(_bfail), 'e.g.', _bfail[:10])
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
    # Collection Info (Separate Children) hands the children over SORTED BY NAME,
    # not in link order: 'fir…' and 'tree_small…' came before 'veg_…', and every
    # kind drew a proto five places off (Sutro's blue gums as small Poly Haven
    # trees; trees agent, 24/09). Each proto goes in a wrapper named by its index.
    root = bpy.data.collections.new(f'{name}_protos')
    for i, c in enumerate(protos):
        w = bpy.data.collections.new(f'{name}_k{i:04d}'); w.children.link(c); root.children.link(w)
    me = bpy.data.meshes.new(name); me.vertices.add(len(pts))
    me.vertices.foreach_set('co', [v for p in pts for v in p[:3]])
    for nm, k, tp in (('s', 3, 'FLOAT'), ('r', 4, 'FLOAT'), ('kind', 5, 'INT')):
        at = me.attributes.new(nm, tp, 'POINT'); at.data.foreach_set('value', [p[k] for p in pts])
    # a stable id by place: the instances' random (tree tint, car paint) then
    # stays with the place from one year of the film to the next
    # (only for a past year: today keeps the render branch's instancing exactly; the film's last frame is ERA=2026)
    if ERA is not None:
        at = me.attributes.new('id', 'INT', 'POINT')
        at.data.foreach_set('value', [int(EA.hash01(p[0], p[1], 31) * 2147483000) for p in pts])
    # 'crand': the instance's own random, BY PLACE. A shader's Object Info >
    # Random follows the instance's index, which shifts with the region: a
    # parked car kept its place across a frame seam but changed colour (life
    # agent, 24/09). place_random() points the protos' materials at this.
    at = me.attributes.new('crand', 'FLOAT', 'POINT'); at.data.foreach_set('value', [hp(p[0], p[1], 7) for p in pts])
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
# SPECIES (veg_hq.py, the vegetation agent; VEG=0 = the generic kit below):
# each register tree drawn as its species in the DataSF Street Tree List
# (nearest listed tree within 2.3 m, its crown from its DBH), each canopy mass
# as the species of the place it stands in (the Presidio's forest, Golden Gate
# Park's windbreaks, Sutro's blue gums …), with procedural eucalyptus, Monterey
# cypress and pine, palms and street kinds. Draws by place, as below.
VEG = E('VEG', '1') == '1'
if VEG:
    import veg_hq
    VK = veg_hq.Kinds(bpy, load_collection, log, box=BOX)
    # IN THE CARRIAGEWAY = over the street mesh AND more than 1.2 m inside the
    # kerb: listed trees stand at the kerb, on the mesh's edge (a plain
    # 'over the mesh' test dropped 40 % of them, 24/09)
    _kp = []
    for a_, b_, _o in SE:
        n_ = max(1, int((b_ - a_).length)); _kp.extend(a_ + (b_ - a_) * (t_ / n_) for t_ in range(n_ + 1))
    _kk = KDTree(max(1, len(_kp)))
    for i_, q_ in enumerate(_kp): _kk.insert((q_.x, q_.y, 0.0), i_)
    _kk.balance()
    def on_street(x, y):
        if sbv.ray_cast(Vector((x, y, 3000.0)), Vector((0, 0, -1)))[0] is None: return False
        return not _kp or _kk.find((x, y, 0.0))[2] > 1.2
    protos, widths, heights, TALL, HMAX = VK.protos, VK.widths, VK.heights, VK.tall, VK.hmax
else:
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
# EVERY DRAW BY PLACE, NEVER BY ORDER. A generator stepped through the region's
# own list gives the same tree or kerb a different draw in two adjacent frames'
# builds (their regions differ), so cars and trees were cut or doubled along
# frame seams (life agent, 24/09). hp(x, y, salt) in [0, 1) depends on the place.
def hp(x, y, salt):
    h = (int(round(x * 10)) * 73856093) ^ (int(round(y * 10)) * 19349663) ^ (salt * 83492791)
    h = (h ^ (h >> 13)) * 0x5bd1e995 & 0xffffffff
    return ((h ^ (h >> 15)) & 0xffffff) / float(0x1000000)
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
        ox_, oy_ = x, y                 # the engine's own point: the species join reads it
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
        if VEG:
            kc_ = VK.street(ox_, oy_, x, y, park, crown, on_street, roofed)
            if kc_ is None: continue            # the list says stump, an empty site, or only roadway around
            kind, crown, x, y = kc_
            # the Embarcadero's Canary Island date palms: 'when the freeway came down, 222 Canary Island date palms went
            # up' (SF Public Works, 'Canary Island date palms on the Embarcadero', 2014; CBS SF). Undated in the tree list:
            # they stand from the new roadway's years, 1995 (CONVENTION inside the SOURCED window 1991-2000), within
            # 60 m of the old freeway's line
            if ERA is not None and ERA < EA.EMB_PALMS_FROM and 'phoenix' in VK.names[kind] and EA.near_embarcadero(x, y, 60.0): continue
        else:
            # parks: mostly broadleaf, some Monterey pine; firs only now and then
            # (render's own draws by place: today stays the render branch's, and a place keeps its tree through the film)
            kind = (K_BROAD + int(hp(x, y, 2) * len(BROAD)) if hp(x, y, 3) < 0.8 else K_PINE + int(hp(x, y, 2) * len(PINE))) if park else int(hp(x, y, 2) * NS)
        gz_ = ground(x, y)
        if gz_ is None: continue
        pts.append((x, y, gz_ - 0.1, tree_scale(kind, crown) * (0.85 + 0.3 * hp(x, y, 4)), 6.283 * hp(x, y, 5), kind))
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
    crown = max(4.0, float(E("CANOPY_K", 3.0)) * rad)
    if VEG:
        kc_ = VK.mass(x, y, crown, on_street, roofed)
        if kc_ is None: continue
        kind, crown, x, y = kc_
        gz_ = ground(x, y)
        if gz_ is None: continue
    else: kind = K_BROAD + int(hp(x, y, 2) * len(BROAD)) if hp(x, y, 3) < 0.85 else K_PINE + int(hp(x, y, 2) * len(PINE))
    seen.add((round(x / 2.5), round(y / 2.5)))
    pts.append((x, y, gz_ - 0.1, tree_scale(kind, crown) * (0.85 + 0.3 * hp(x, y, 4)), 6.283 * hp(x, y, 5), kind))
# THE REAL CANOPY (veg_canopy.py, the vegetation agent): with CANOPY=1 every
# crown the LiDAR and NAIP agree on (yards, block interiors, hills), planted at
# its measured height and width; veg_hq then plants no canopy masses above
_nc = 0
# (eras, 25/09: in a past year the measured crowns stand where the year's gates let a canopy mass stand: not on the
# open land or the dunes of the year, not under water, not on a vacant lot, not where a later building's site or park
# was (era.canopy_stands); without it a past year lost every yard and hill tree of today's CANOPY=1 render)
if VEG and getattr(VK, 'canopy_on', False):
    for (x, y, kind, s_, r_) in VK.canopy(seen):
        if roofed(x, y): continue
        if ERA is not None:
            if open_at(x, y) > 0.5 and OL.at(x, y, OL.park) < 0.5: continue
            if EA.water_then(x, y, ERA): continue
            if LI is not None and LI.inside(x, y): continue
            if not EA.canopy_stands(x, y, ERA, _allb, kd): continue
        gz_ = ground(x, y)
        if gz_ is None: continue
        pts.append((x, y, gz_ - 0.1, s_, r_, kind)); _nc += 1
log('trees: register', nreg, 'canopy masses', len(pts) - nreg - _nc, 'of', len(MASS), 'measured crowns', _nc)
instancer('trees', pts, protos)
if VEG: VK.report(log)

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
    occ = float(E('KERB_OCC', '0.20')) * (1.0 if ERA is None else EA.car_occupancy(ERA) / EA.car_occupancy(None))   # the era table is relative to today's kerb
    for i in range(int((L_ - 3) // 6.2)):
        p = a + v * ((1.5 + 3.1 + i * 6.2) / L_) - outv * 1.25
        if hp(p.x, p.y, 11) > occ: continue            # by kerb slot (the render branch's own draw: today identical, no flicker between years)
        if not in_box(p.x, p.y) or open_at(p.x, p.y) > 0.3: continue
        if _fp and kdw.find((p.x, p.y, 0.0))[2] > 18.0: continue      # a car parks near a door
        if carfree_at(p.x, p.y, BOX): continue     # JFK Promenade, Twin Peaks' closed loop, busways
        cpts.append((p.x, p.y, p.z + 0.02, 1.0, ang + (math.pi if hp(p.x, p.y, 12) < 0.5 else 0), car_pick(hp(p.x, p.y, 13))))
# the parking lots of the year, their stalls filled by their own draws
for L_ in LOTS:
    for (x_, y_, h_, u_) in L_['cars']:
        gz_ = ground(x_, y_)
        if gz_ is not None and gz_ >= 0.8 and in_box(x_, y_) and not EA.water_then(x_, y_, ERA): cpts.append((x_, y_, gz_ + 0.11, 1.0, h_, car_pick(u_)))
instancer('cars', cpts, car_colls)
def place_random(colls):
    """in every material of these protos, Object Info > Random -> the
    instance's 'crand' attribute (by place, the same in every frame)"""
    seen_ = set()
    for c_ in colls:
        for o_ in c_.all_objects:
            for sl_ in getattr(o_, 'material_slots', []):
                m_ = sl_.material
                if m_ is None or m_.name in seen_ or not m_.node_tree: continue
                seen_.add(m_.name); nt_ = m_.node_tree
                for oi_ in [n_ for n_ in nt_.nodes if n_.bl_idname == 'ShaderNodeObjectInfo']:
                    links_ = [l_ for l_ in nt_.links if l_.from_node == oi_ and l_.from_socket.name == 'Random']
                    if not links_: continue
                    at_ = nt_.nodes.new('ShaderNodeAttribute'); at_.attribute_type = 'INSTANCER'; at_.attribute_name = 'crand'
                    for l_ in links_:
                        to_ = l_.to_socket; nt_.links.remove(l_); nt_.links.new(at_.outputs['Fac'], to_)
    log('place_random: materials re-pointed', len(seen_))
place_random(car_colls)

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

# ── WATER (water2_hq.py, the water agent): the sea coloured by depth and turbidity, wind and current, beaches and surf; WATER2=0 skips
if E('WATER2', '1') == '1':
    try: import water2_hq; water2_hq.build(bpy, sc, M, ground, (BOX or [-9000, -9000, 9000, 9000]), d, log, ERA)
    except Exception as ex:
        import traceback; traceback.print_exc(); log('water2_hq: not built:', ex)
# ── TRANSIT (transit_hq.py, the transit agent): track, overhead, platforms, vehicles; TRANSIT=0 skips
if E('TRANSIT', '1') == '1':
    try: import transit_hq; transit_hq.build(bpy, sc, M, ground, (BOX or [-9000, -9000, 9000, 9000]), d, log, ERA)
    except Exception as ex: log('transit_hq: not built:', ex)
# ── LIFE (life_hq.py, the life agent): boats and wakes on the bay, traffic in the streets; LIFE=0 skips
if E('LIFE', '1') == '1':
    try: import life_hq; life_hq.build(bpy, sc, M, ground, (BOX or [-9000, -9000, 9000, 9000]), d, log, ERA)
    except Exception as ex: log('life_hq: not built:', ex)
# ── FREEWAYS (freeways_hq.py, the freeways agent): the viaducts on LiDAR-measured decks, bents, the ground under them; FREEWAYS=0 skips
if E('FREEWAYS', '1') == '1':
    import freeways_hq; freeways_hq.build(bpy, sc, M, ground, (BOX or [-9000, -9000, 9000, 9000]), d, log, ERA, keep=EA.freeway_keep(ERA))    # a past year: the ways already open (era.freeway_keep)

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

# BUILDING COLOUR SPREAD (the global look pass, 24/09; off by default): the city
# read as one beige because every building's face colour sits near the same
# mean. Walls' and roofs' 'bcol' is pushed away from its material's mean,
# mean + k·(c − mean), k = BCOL_SPREAD (or a look's spread=), 1.0 = unchanged.
# Hue kept, value only: c·(lum/lum_mean)^(k−1), k = BCOL_VSPREAD (vspread=);
# and a plain value scale on roofs (ROOF_VALUE, roofk=), brick (BRICK_VALUE, brickk=) and other walls (WALL_VALUE, wallk=).
_SPREAD = []; _VSP = []; _VK = []
if any(E(k_) for k_ in ('BCOL_SPREAD', 'BCOL_VSPREAD', 'ROOF_VALUE', 'WALL_VALUE', 'BRICK_VALUE')) or any(k_ in (E('LOOKS') or '') for k_ in ('spread=', 'roofk=', 'wallk=', 'brickk=')):
    _sm = {'siding', 'shingle', 'stucco', 'brick', 'concrete_wall', 'trim', 'roof_flat', 'roof_big', 'roof_shingle'}   # (roof_tile's bcol is a tint multiplier, mean > 1: left alone)
    _acc = {}
    for o_ in sc.objects:
        if o_.type != 'MESH' or o_.data.attributes.get('bcol') is None: continue   # a FACE colour: in attributes, not color_attributes
        ms_ = [s_.material.name.split('.')[0] for s_ in o_.material_slots if s_.material]
        if not any(m_ in _sm for m_ in ms_): continue
        ca_ = o_.data.attributes['bcol']; a_ = np.empty(len(ca_.data) * 4, np.float32); ca_.data.foreach_get('color', a_)
        a_ = a_.reshape(-1, 4)[:, :3]
        for m_ in set(ms_) & _sm: _acc.setdefault(m_, []).append(a_.mean(0) if len(a_) else None)
    for mat_ in bpy.data.materials:
        mn_ = mat_.name.split('.')[0]
        if mn_ not in _sm or not mat_.node_tree: continue
        mv_ = [v for v in _acc.get(mn_, []) if v is not None]
        mean_ = np.mean(mv_, 0) if mv_ else np.array([0.5, 0.45, 0.4])
        nt_ = mat_.node_tree
        for at_ in [n for n in nt_.nodes if n.type == 'ATTRIBUTE' and n.attribute_name == 'bcol']:
            outs_ = [l.to_socket for l in at_.outputs['Color'].links]
            if not outs_: continue
            mx_ = nt_.nodes.new('ShaderNodeMix'); mx_.data_type = 'RGBA'; mx_.clamp_factor = False; mx_.clamp_result = False   # no clamp: some bcol are multipliers > 1
            mx_.inputs[0].default_value = float(E('BCOL_SPREAD', 1.0))
            mx_.inputs[6].default_value = (*[float(v) for v in mean_], 1.0)
            nt_.links.new(at_.outputs['Color'], mx_.inputs[7])
            bw_ = nt_.nodes.new('ShaderNodeRGBToBW'); nt_.links.new(mx_.outputs[2], bw_.inputs[0])
            dv_ = nt_.nodes.new('ShaderNodeMath'); dv_.operation = 'DIVIDE'; nt_.links.new(bw_.outputs[0], dv_.inputs[0])
            dv_.inputs[1].default_value = max(1e-3, float(mean_ @ np.array([0.2126, 0.7152, 0.0722])))
            m0_ = nt_.nodes.new('ShaderNodeMath'); m0_.operation = 'MAXIMUM'; m0_.inputs[1].default_value = 0.05; nt_.links.new(dv_.outputs[0], m0_.inputs[0])
            pw_ = nt_.nodes.new('ShaderNodeMath'); pw_.operation = 'POWER'; nt_.links.new(m0_.outputs[0], pw_.inputs[0])
            pw_.inputs[1].default_value = float(E('BCOL_VSPREAD', 1.0)) - 1
            vk_ = nt_.nodes.new('ShaderNodeMath'); vk_.operation = 'MULTIPLY'; nt_.links.new(pw_.outputs[0], vk_.inputs[0])
            roof_ = 'roof' if mn_.startswith('roof') else 'brick' if mn_ == 'brick' else 'wall'
            vk_.inputs[1].default_value = float(E({'roof': 'ROOF_VALUE', 'brick': 'BRICK_VALUE', 'wall': 'WALL_VALUE'}[roof_], 1.0))
            sc_ = nt_.nodes.new('ShaderNodeVectorMath'); sc_.operation = 'SCALE'; nt_.links.new(mx_.outputs[2], sc_.inputs[0]); nt_.links.new(vk_.outputs[0], sc_.inputs['Scale'])
            mn2_ = nt_.nodes.new('ShaderNodeVectorMath'); mn2_.operation = 'MAXIMUM'; mn2_.inputs[1].default_value = (0.0, 0.0, 0.0); nt_.links.new(sc_.outputs[0], mn2_.inputs[0])
            for t_ in outs_: nt_.links.new(mn2_.outputs[0], t_)
            _SPREAD.append(mx_); _VSP.append(pw_); _VK.append((vk_, roof_))
        log(f'bcol spread: {mat_.name} mean {np.round(mean_, 3).tolist()}')

# ── CAMPATH: many camera positions from one built scene (the film) ──────────
# CAMPATH=<file.json>: [{"tx": x, "ty": y, "ortho": metres across, "out": path.png}, ...]
# (tx, ty) the world point at the frame's centre (z = 0 plane); the camera is
# the pyramid's true orthographic one (the site's look). One year's scene is
# built once and every film frame of that year rendered from it.
if E('CAMPATH'):
    _cp = json.load(open(E('CAMPATH')))
    _CA, _SA = math.cos(math.radians(30)), 0.42
    _KX, _KY = math.sqrt(2) * _CA, math.sqrt(2) * _SA; _ZT = math.sqrt(2 * (_CA ** 2 - _SA ** 2))
    _up = Vector((0, _KY, _ZT)).normalized(); _fw = Vector((0, _ZT, -_KY)).normalized()
    cam.rotation_euler = Matrix((Vector((1, 0, 0)), _up, -_fw)).transposed().to_euler()
    sc.render.resolution_x, sc.render.resolution_y = W, H; sc.render.resolution_percentage = 100
    sc.render.use_border = False; sc.render.use_persistent_data = True
    for _k, _c in enumerate(_cp):
        if os.path.exists(_c['out']): continue
        # the frame's centre on the ground plane z = 0, seen along _fw
        cam.location = Vector((_c['tx'], _c['ty'], 0.0)) - _fw * 20000
        cam_d.ortho_scale = _c['ortho']
        sc.render.filepath = _c['out']
        t1 = time.time(); bpy.ops.render.render(write_still=True)
        log(f"campath {_k + 1}/{len(_cp)}: {time.time() - t1:.1f}s")
    log('CAMPATH done'); sys.exit(0)

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
    if E('CLAY') == '1':   # massing input for the AI photo layer: walls light grey, roofs mid grey, glass dark, roof gear hidden
        def _clay(nm_, v_):
            m_ = bpy.data.materials.get(nm_) or bpy.data.materials.new(nm_); m_.use_nodes = True
            b_ = m_.node_tree.nodes.get('Principled BSDF'); b_.inputs['Base Color'].default_value = (v_, v_, v_, 1); b_.inputs['Roughness'].default_value = 0.8
            return m_
        _cw, _cr, _cg = _clay('clay_wall', 0.55), _clay('clay_roof', 0.25), _clay('clay_glass', 0.03); _ck = {}
        for o_ in list(bpy.data.objects):
            mt_ = __import__('re').match(r'^(b\d+|gen)\.(.+)$', o_.name)
            if not mt_ or o_.type != 'MESH': continue
            k_ = mt_.group(2).split('.')[0]; _ck[k_] = _ck.get(k_, 0) + 1
            if any(t_ in k_ for t_ in ('equip', 'gear', 'hvac', 'vent', 'tank', 'solar', 'chimney')): o_.hide_render = True; continue
            m_ = _cg if any(t_ in k_ for t_ in ('glass', 'win', 'curtain')) else _cr if 'roof' in k_ else _cw
            for s_ in range(len(o_.data.materials)): o_.data.materials[s_] = m_
        log('CLAY building keys:', sorted(_ck))
    # MASK_PASS=1|only (AI photo layer, 24/09): a flat ID map next to each frame, <frame>.mask.png, same camera:
    # red = landmark models (lm.* from landmarks_hq, the engine's 'landmarks'), blue = water (sea, ocean, lakes), green = buildings (b<chunk>.*, gen.*, far), black = the rest.
    # Workbench, flat, no AA, Standard view; the Cycles settings are put back after. 'only' skips the Cycles frame.
    def _ai_passes(base):
        re_ = __import__('re'); sh_ = sc.display.shading
        sv_ = (sc.render.engine, sh_.light, sh_.color_type, sc.display.render_aa, sc.view_settings.view_transform, sc.view_settings.look,
               sc.view_settings.exposure, sc.view_settings.gamma, sc.render.use_compositing, sc.render.film_transparent, sc.render.filepath)
        col_ = {o_.name: tuple(o_.color) for o_ in bpy.data.objects}; hid_ = {o_.name: o_.hide_render for o_ in bpy.data.objects}
        bld_ = lambda n: re_.match(r'^(b\d+|gen)\.', n) is not None or n.split('.')[0] == 'far'
        sc.render.engine = 'BLENDER_WORKBENCH'; sh_.light = 'FLAT'; sh_.show_shadows = False; sh_.show_cavity = False; sh_.show_object_outline = False
        sc.display.render_aa = 'OFF'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0; sc.view_settings.gamma = 1; sc.render.use_compositing = False
        is_ = sc.render.image_settings; ff_, cd_, cm_ = is_.file_format, is_.color_depth, is_.color_mode
        if E('CLASS_PASS') == '1':
            sh_.color_type = 'OBJECT'; sc.view_settings.view_transform = 'Standard'; sc.render.film_transparent = False
            for o_ in bpy.data.objects:
                n_ = o_.name.lower(); cs_ = ' '.join(c_.name.lower() for c_ in o_.users_collection)
                water_ = o_.name in ('sea', 'ocean') or o_.name.startswith('lm.lm_lake')
                if water_: c_ = (0, 0, 1)
                elif (o_.name.startswith('lm.') or n_.split('.')[0] == 'landmarks'): c_ = (1, 0, 0)
                elif bld_(o_.name): c_ = (0, 1, 0) if 'roof' in n_ else (1, 1, 0)
                elif n_.startswith(('carp', 'cars', 'life.cars', 'pcar')) or 'car_protos' in cs_: c_ = (1, 0.5, 0)     # cars: their own class (the eras' change mask regenerates them)
                elif any(t_ in n_ for t_ in ('street', 'sidewalk', 'gutter', 'road', 'freeway', 'fw', 'lane', 'track', 'bridge')): c_ = (1, 0, 1)
                elif any(t_ in (n_ + ' ' + cs_).replace('street', '') for t_ in ('tree', 'veg', 'bush', 'brush', 'palm', 'plant')): c_ = (0, 1, 1)
                elif any(t_ in n_ for t_ in ('ground', 'terrain', 'lawn', 'far', 'shore', 'beach', 'park')): c_ = (0, 0, 0)
                else: c_ = (1, 1, 1)
                o_.color = (*c_, 1)
            sc.render.filepath = base + '.class.png'; bpy.ops.render.render(write_still=True)
        for o_ in bpy.data.objects: o_.color = col_.get(o_.name, (1, 1, 1, 1))
        (sc.render.engine, sh_.light, sh_.color_type, sc.display.render_aa, sc.view_settings.view_transform, sc.view_settings.look,
         sc.view_settings.exposure, sc.view_settings.gamma, sc.render.use_compositing, sc.render.film_transparent, sc.render.filepath) = sv_
        if E('GUIDE_PASS') == '1' or E('GID_PASS') == '1':   # ONE Cycles render, 1 sample, no pixel filter, Raw: combined = building gid
            # (emission of the face colour, 24 bit, other meshes black), + depth (Z) + normal passes, multilayer 32-bit EXR
            def _em(nm_, attr_):
                m_ = bpy.data.materials.get(nm_) or bpy.data.materials.new(nm_); m_.use_nodes = True; nt_ = m_.node_tree; nt_.nodes.clear()
                o_ = nt_.nodes.new('ShaderNodeOutputMaterial'); e_ = nt_.nodes.new('ShaderNodeEmission'); e_.inputs['Strength'].default_value = 1
                if attr_: at_ = nt_.nodes.new('ShaderNodeAttribute'); at_.attribute_name = attr_; nt_.links.new(at_.outputs['Color'], e_.inputs['Color'])
                else: e_.inputs['Color'].default_value = (0, 0, 0, 1)
                nt_.links.new(e_.outputs[0], o_.inputs['Surface']); return m_
            gm_, bm_ = _em('ai_gid', 'bcol'), _em('ai_black', None); mats_ = {}
            for o_ in bpy.data.objects:
                if o_.type != 'MESH' or not o_.data.materials: continue
                # keyed by the MESH (26/09): objects sharing a mesh (instances) saw the ID material the first had put on it,
                # and the restore put it back -> every frame after the first of a multi-frame run came out in ID colours
                if o_.data.name not in mats_: mats_[o_.data.name] = list(o_.data.materials)
                w_ = gm_ if bld_(o_.name) else bm_
                for s_ in range(len(o_.data.materials)): o_.data.materials[s_] = w_
            vl_ = bpy.context.view_layer; sp_, z_, nm_, dn_, fw_ = sc.cycles.samples, vl_.use_pass_z, vl_.use_pass_normal, sc.cycles.use_denoising, sc.cycles.filter_width
            wb_ = sc.world; sc.world = None; sc.render.engine = 'CYCLES'; sc.view_settings.view_transform = 'Raw'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0
            sc.cycles.samples = 1; vl_.use_pass_z = True; vl_.use_pass_normal = True; sc.cycles.use_denoising = False; sc.cycles.filter_width = 0.01
            is_.file_format = 'OPEN_EXR'; is_.color_depth = '32'
            if hasattr(is_, 'media_type'): is_.media_type = 'MULTI_LAYER_IMAGE'   # Blender 5: multilayer is a media type of OPEN_EXR
            sc.render.filepath = base + '.guide.exr'; bpy.ops.render.render(write_still=True)
            log('guide passes:', [p_.name for p_ in bpy.data.images['Render Result'].render_slots[0].name and [] or []] if False else 'written')
            for n_, ms_ in mats_.items():
                me_ = bpy.data.meshes[n_]
                for s_, m_ in enumerate(ms_): me_.materials[s_] = m_
            sc.world = wb_; sc.cycles.samples, vl_.use_pass_z, vl_.use_pass_normal, sc.cycles.use_denoising, sc.cycles.filter_width = sp_, z_, nm_, dn_, fw_
            (sc.render.engine, sc.view_settings.view_transform, sc.view_settings.look, sc.view_settings.exposure) = sv_[0], sv_[4], sv_[5], sv_[6]
        if hasattr(is_, 'media_type'): is_.media_type = 'IMAGE'
        is_.file_format, is_.color_depth, is_.color_mode = ff_, cd_, cm_; sc.render.filepath = sv_[-1]
    def _ai_mask(path):
        sv_ = (sc.render.engine, sc.display.shading.light, sc.display.shading.color_type, sc.display.render_aa, sc.view_settings.view_transform,
               sc.view_settings.look, sc.view_settings.exposure, sc.view_settings.gamma, sc.render.use_compositing, sc.render.film_transparent, sc.render.filepath)
        col_ = {}
        for o_ in bpy.data.objects:
            n_ = o_.name.split('.')[0] if not o_.name.startswith('lm.') else o_.name
            water_ = o_.name in ('sea', 'ocean') or o_.name.startswith('lm.lm_lake')
            lm_ = (o_.name.startswith('lm.') and not water_) or n_ == 'landmarks'
            bl_ = __import__('re').match(r'^(b\d+|gen)\.', o_.name) is not None or n_ == 'far'
            col_[o_.name] = tuple(o_.color); o_.color = (0, 0, 1, 1) if water_ else (1, 0, 0, 1) if lm_ else (0, 1, 0, 1) if bl_ else (0, 0, 0, 1)
        sc.render.engine = 'BLENDER_WORKBENCH'; sh_ = sc.display.shading
        sh_.light = 'FLAT'; sh_.color_type = 'OBJECT'; sh_.show_shadows = False; sh_.show_cavity = False; sh_.show_object_outline = False
        sc.display.render_aa = 'OFF'; sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
        sc.view_settings.exposure = 0; sc.view_settings.gamma = 1; sc.render.use_compositing = False; sc.render.film_transparent = False
        sc.render.filepath = path; bpy.ops.render.render(write_still=True)
        for o_ in bpy.data.objects: o_.color = col_.get(o_.name, (1, 1, 1, 1))
        (sc.render.engine, sh_.light, sh_.color_type, sc.display.render_aa, sc.view_settings.view_transform, sc.view_settings.look,
         sc.view_settings.exposure, sc.view_settings.gamma, sc.render.use_compositing, sc.render.film_transparent, sc.render.filepath) = sv_
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
            # 'tag:el,sun,sky,expo[,key=val…];…' — optional keys (the global look pass, 24/09):
            # az= (sun azimuth), rgb=r/g/b (sun colour), ssat= (sky fill saturation), gloss= (sky in reflections),
            # agx= (AgX look name), spread= vspread= roofk= wallk= (building colour, see BCOL_SPREAD);
            # a key left out takes the build's default. LOOK_EXR=1 also writes each look's
            # scene-linear EXR (re-toned in post, look/look_post.py)
            for lk_ in (E('LOOKS').split(';') if E('LOOKS') else ['']):
                fn = f'{OUT}_z{Z}_{i}_{j}.png' if not lk_ else f"{OUT}_{lk_.split(':')[0]}_z{Z}_{i}_{j}.png"
                if os.path.exists(fn if E('MASK_PASS') != 'only' else fn[:-4] + '.mask.png'): continue
                if lk_:
                    f_ = lk_.split(':', 1)[1].split(',')
                    el_, sk_, bk_, ex_ = (float(v) for v in f_[:4])
                    kv_ = dict(t.split('=', 1) for t in f_[4:])
                    a_, e_ = math.radians(float(kv_.get('az', E('SUN_AZ', 215)))), math.radians(el_)
                    sky.sun_rotation = a_
                    sun.rotation_euler = (-Vector((math.sin(a_) * math.cos(e_), math.cos(a_) * math.cos(e_), math.sin(e_)))).to_track_quat('-Z', 'Y').to_euler()
                    sky.sun_elevation = e_; sun_d.energy = sk_; bg.inputs['Strength'].default_value = bk_; sc.view_settings.exposure = ex_
                    sun_d.color = tuple(float(v) for v in kv_.get('rgb', E('SUN_RGB', '1.0/0.80/0.58').replace(',', '/')).split('/'))
                    if 'hs_' in globals(): hs_.inputs['Saturation'].default_value = float(kv_.get('ssat', E('SKY_SAT', 0.7)))
                    bg2.inputs['Strength'].default_value = float(kv_.get('gloss', E('GLOSS_K', 0.9)))
                    sc.view_settings.look = kv_.get('agx', E('AGX_LOOK', 'AgX - Punchy'))
                    for n_ in _SPREAD: n_.inputs[0].default_value = float(kv_.get('spread', E('BCOL_SPREAD', 1.0)))
                    for n_ in _VSP: n_.inputs[1].default_value = float(kv_.get('vspread', E('BCOL_VSPREAD', 1.0))) - 1
                    for n_, r_ in _VK: n_.inputs[1].default_value = float(kv_.get(r_ + 'k', E(r_.upper() + '_VALUE', 1.0)))
                sc.render.filepath = fn
                t1 = time.time()
                if E('MASK_PASS') != 'only': bpy.ops.render.render(write_still=True)
                if E('LOOK_EXR') == '1' and E('MASK_PASS') != 'only':
                    is_ = sc.render.image_settings; ff_, cd_ = is_.file_format, is_.color_depth
                    is_.file_format = 'OPEN_EXR'; is_.color_depth = '16'; is_.exr_codec = 'ZIP'
                    bpy.data.images['Render Result'].save_render(fn[:-4] + '.exr', scene=sc)
                    is_.file_format = ff_; is_.color_depth = cd_
                if E('MASK_PASS'): _ai_mask(fn[:-4] + '.mask.png'); sc.render.filepath = fn   # after the EXR: the mask render replaces 'Render Result'
                if E('CLASS_PASS') == '1' or E('GID_PASS') == '1' or E('GUIDE_PASS') == '1': _ai_passes(fn[:-4]); sc.render.filepath = fn
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
