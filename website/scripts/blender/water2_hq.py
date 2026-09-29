"""The water of the city render: the sea's own colour, its wind, and the shore.

The sea was one saturated swimming-pool blue with the same fine ripple from the
Pacific to the south bay, and a white foam line against every seawall. Here:

sea: the body colour comes from the depth and the turbidity (sea_col.png,
  water2_prep.py: USGS 3DEP topobathy, turbid green-grey bay, browner over its
  shallows and mudflats, slate blue-green Pacific), the roughness and the
  ripples from a km-scale wind field (sea_fld.png R: fetch of the afternoon
  westerly, gusts, cat's paws; G: current lines along the depth contours in
  the Gate and round Alcatraz; B: Pacific). Water IOR 1.333. A long swell
  from the west in the Pacific. No foam against the bay's walls. The same
  shader on the mask's sheet (cut by its land) and on the open ocean plane.
shore: an overlay mesh (shore.npz: OSM natural=beach, mudflats and marsh,
  the OSM coastline's signed distance) laid a few cm over the ground or the
  water: dry sand, a wet-sand band at the waterline, the swash, and on the
  exposed beaches (Ocean Beach to Fort Funston, Baker and China, the Marin
  headlands) three to four breaker lines with their whitewater, fading to a
  thin wash line on the bay's beaches (Crissy Field, Aquatic Park). Its water
  is the sea's own shader, so it hides the lobed 3DEP beach that poked out of
  the sea without a seam. Mudflats and marsh edges at Heron's Head, India
  Basin, Candlestick and the Crissy lagoon, kept subtle.

build(bpy, sc, M, ground, box, d, log, era) — called by hq_city after the
landmarks; WATER2=0 skips it. Data: /Users/daniel/code/qipu-render-work/water
(water2_prep.py). Dry and wet sand match ground_hq's classes 1 and 12.
"""
import json, math, os, time
import numpy as np

WD = os.environ.get('WATER_DIR') or '/Users/daniel/code/qipu-render-work/water'     # WATER_DIR: a work-in-progress set of maps
SEA_Z = 0.12            # the mask's sheet (hq_scene sea()); the open ocean plane is at -0.5

def E(k, v=None): return os.environ.get(k, v)
def F(k, v): return float(os.environ.get(k, v))

class _N:
    """a small node-tree writer"""
    def __init__(self, nt):
        self.nt = nt; self.L = nt.links.new
    def n(self, kind, **kw):
        n_ = self.nt.nodes.new(kind)
        for k, v in kw.items():
            if k.startswith('i_'): self.inp(n_.inputs[k[2:].replace('_', ' ')], v)
            else: setattr(n_, k, v)
        return n_
    def inp(self, sock, v):
        if isinstance(v, (int, float)): sock.default_value = v
        elif isinstance(v, tuple): sock.default_value = v if len(v) == len(sock.default_value) else (*v, 1.0)
        else: self.L(v, sock)
    def m(self, op, a, b=None, c=None, clamp=False):
        n_ = self.nt.nodes.new('ShaderNodeMath'); n_.operation = op; n_.use_clamp = clamp
        for i, v in enumerate((a, b, c)):
            if v is not None: self.inp(n_.inputs[i], v)
        return n_.outputs[0]
    def smooth(self, e0, e1, x):
        """smoothstep (e0 > e1 allowed)"""
        t = self.m('DIVIDE', self.m('SUBTRACT', x, e0), e1 - e0, clamp=True)
        return self.m('MULTIPLY', self.m('MULTIPLY', t, t), self.m('SUBTRACT', 3.0, self.m('MULTIPLY', t, 2.0)))
    def mix(self, fac, a, b):
        n_ = self.nt.nodes.new('ShaderNodeMix'); n_.data_type = 'RGBA'; n_.clamp_factor = True
        self.inp(n_.inputs[0], fac); self.inp(n_.inputs[6], a); self.inp(n_.inputs[7], b)
        return n_.outputs[2]
    def lerp(self, t, a, b):
        return self.m('ADD', a, self.m('MULTIPLY', t, self.m('SUBTRACT', b, a)))
    def vmath(self, op, a, b):
        n_ = self.nt.nodes.new('ShaderNodeVectorMath'); n_.operation = op
        self.inp(n_.inputs[0], a); self.inp(n_.inputs[1], b)
        return n_.outputs[0]
    def noise(self, vec, scale, detail=2.0, rough=0.5, dist=0.0):
        n_ = self.n('ShaderNodeTexNoise', i_Scale=scale, i_Detail=detail, i_Roughness=rough, i_Distortion=dist)
        self.L(vec, n_.inputs['Vector']); return n_.outputs['Fac']
    def mapping(self, vec, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        mp = self.nt.nodes.new('ShaderNodeMapping'); mp.vector_type = 'POINT'
        mp.inputs['Location'].default_value = loc; mp.inputs['Rotation'].default_value = rot; mp.inputs['Scale'].default_value = scale
        self.L(vec, mp.inputs[0]); return mp.outputs[0]
    def attr(self, name):
        a = self.n('ShaderNodeAttribute', attribute_name=name); return a.outputs['Fac']

_IMG = {}
def _img(bpy, name):
    if name not in _IMG:
        im = bpy.data.images.load(os.path.join(WD, name), check_existing=True)
        im.colorspace_settings.name = 'Non-Color'; _IMG[name] = im
    return _IMG[name]

def shore_dist(bpy, N, pos):
    """metres from the OSM coastline on the water side (0 on land), from
    shore_sd.png; None without it"""
    sj = os.path.join(WD, 'shore_sd.json')
    if not os.path.exists(sj): return None
    q = json.load(open(sj)); ww, hh = q['nx'] * q['res'], q['ny'] * q['res']
    sm_ = N.mapping(pos, loc=(-q['x0'] / ww, -(q['y1'] - hh) / hh, 0), scale=(1 / ww, 1 / hh, 1))
    ti = N.n('ShaderNodeTexImage', image=_img(bpy, 'shore_sd.png'), extension='EXTEND', interpolation='Linear'); N.L(sm_, ti.inputs[0])
    sx_ = N.n('ShaderNodeSeparateColor'); N.L(ti.outputs['Color'], sx_.inputs[0])
    return N.m('MULTIPLY', sx_.outputs[0], q['vmax'])

def water(bpy, N, pos, extra=None, flat=None):
    """the sea surface's BSDF at world position `pos`; returns (shader, dict of
    sockets: wind, cur, pac, col). extra(N, parts) may alter the parts first."""
    if E('WATER_V5', '0') == '1':      # water v5 (water_v5.py, 29/09): large-scale wind / slick field, turbid body, Fresnel, contact foam; default off
        import water_v5; return water_v5.water(bpy, N, pos, extra, flat, _img, shore_dist, WD)
    if E('WATER_V4', '0') == '1':      # water v4 (water_v4.py, 29/09): physical wave spectrum, Fresnel, depth / shore colour; default off
        import water_v4; return water_v4.water(bpy, N, pos, extra, flat, _img, shore_dist, WD)
    g = json.load(open(os.path.join(WD, 'sea.json')))
    w_, h_ = g['x1'] - g['x0'], g['y1'] - g['y0']
    uv = N.mapping(pos, loc=(-g['x0'] / w_, -g['y0'] / h_, 0), scale=(1 / w_, 1 / h_, 1))
    tc = N.n('ShaderNodeTexImage', image=_img(bpy, 'sea_col.png'), extension='EXTEND', interpolation='Cubic'); N.L(uv, tc.inputs[0])
    tf = N.n('ShaderNodeTexImage', image=_img(bpy, 'sea_fld.png'), extension='EXTEND', interpolation='Cubic'); N.L(uv, tf.inputs[0])
    sp = N.n('ShaderNodeSeparateColor'); N.L(tf.outputs['Color'], sp.inputs[0])
    wind, cur, pac = sp.outputs[0], sp.outputs[1], sp.outputs[2]
    # sea_col holds the final albedo (water2_prep's ramps); SEA_COL_K and
    # SEA_WB stay as test knobs only
    k = g['alb_k'] * F('SEA_COL_K', 1.0)
    # the bay's body pulled green (the ramps' blue read teal-blue under this
    # sky, wat31); the Pacific keeps its blue (wb fades out with exposure)
    wb = [float(v) for v in E('SEA_WB', '1.05,1.05,0.6').split(',')]
    wbv = N.mix(N.smooth(0.3, 0.9, pac), tuple(wb), (1.0, 1.0, 1.0))
    col = N.vmath('MULTIPLY', N.vmath('MULTIPLY', tc.outputs['Color'], (k, k, k)), wbv)
    # desaturate toward the grey the sediment gives (SEA_SAT 1 = the map as is)
    sat = F('SEA_SAT', 1.0)
    if abs(sat - 1.0) > 1e-3:
        bw = N.n('ShaderNodeRGBToBW'); N.L(col, bw.inputs[0])
        cb = N.n('ShaderNodeCombineColor'); [N.L(bw.outputs[0], cb.inputs[i]) for i in range(3)]
        col = N.mix(1.0 - sat, col, cb.outputs[0])
    # the wind frame: u downwind, v across (wind to ~ESE, from ~290°)
    wt = g.get('wind_to', [0.94, -0.34]); ang = -math.atan2(wt[1], wt[0])
    rot = N.mapping(pos, rot=(0, 0, ang))
    # ripples and chop: crests across the wind, 1-4 m, a 12-25 m ruffle over them
    chop = N.mapping(rot, scale=(0.55, 0.20, 0.3))
    h1 = N.noise(chop, 1.0, detail=6.0, rough=0.55)
    h2 = N.noise(N.mapping(rot, scale=(0.06, 0.025, 0.06)), 1.0, detail=3.0, rough=0.5)
    slick = N.m('MULTIPLY', cur, F('SEA_SLICK', 0.65))
    calm = N.m('SUBTRACT', 1.0, slick)
    paw = N.smooth(0.35, 0.65, N.noise(N.mapping(rot, loc=(91.0, 57.0, 0), scale=(0.6, 1.0, 1.0)), 1 / 110.0, detail=3.0, rough=0.6))
    wind = N.m('MULTIPLY', wind, N.m('ADD', 1.0 - F('SEA_PAW', 0.2), N.m('MULTIPLY', paw, F('SEA_PAW', 0.2))))
    wk = N.m('MULTIPLY', N.m('ADD', 0.35, N.m('MULTIPLY', wind, 0.65)), calm)      # a ripple everywhere (the bay read dead flat)
    bm1 = N.n('ShaderNodeBump', i_Distance=F('SEA_CHOP_D', 0.25))
    if flat is not None: N.L(flat, bm1.inputs['Normal'])
    N.L(N.m('ADD', h1, N.m('MULTIPLY', h2, 1.5)), bm1.inputs['Height'])
    N.L(N.m('MULTIPLY', wk, F('SEA_CHOP', 1.1)), bm1.inputs['Strength'])
    # the Pacific's swell from the west, ~150 m crests running N-S, bent by noise
    # (a sine of x bent by noise: the Wave texture drew a dark line along y = 0, wat3)
    sx = N.n('ShaderNodeSeparateXYZ'); N.L(pos, sx.inputs[0])
    phs = N.m('ADD', N.m('MULTIPLY', sx.outputs[0], 2 * math.pi / 150.0),
              N.m('MULTIPLY', N.noise(N.mapping(pos, loc=(311.0, 173.0, 0)), 0.0012, detail=2.0), 14.0))
    bm2 = N.n('ShaderNodeBump', i_Distance=F('SEA_SWELL_D', 2.0))
    N.L(N.m('MULTIPLY', N.m('ADD', N.m('SINE', phs), 1.0), 0.5), bm2.inputs['Height']); N.L(N.m('MULTIPLY', pac, F('SEA_SWELL', 1.0)), bm2.inputs['Strength'])
    N.L(bm1.outputs[0], bm2.inputs['Normal'])
    rough = N.m('MULTIPLY', N.m('ADD', F('SEA_R0', 0.02), N.m('MULTIPLY', wind, F('SEA_R1', 0.06))), calm)
    parts = dict(wind=wind, cur=cur, pac=pac, col=col, rough=rough, normal=bm2.outputs[0], rot=rot)
    if extra: extra(N, parts)
    b = N.n('ShaderNodeBsdfPrincipled', i_IOR=1.333, i_Specular_IOR_Level=F('SEA_SPEC', 0.24))
    N.L(parts['col'], b.inputs['Base Color']); N.L(parts['rough'], b.inputs['Roughness']); N.L(parts['normal'], b.inputs['Normal'])
    b.inputs['Specular Tint'].default_value = (*[float(v) for v in E('SEA_TINT', '0.65,0.78,0.5').split(',')], 1.0)
    sh = b.outputs[0]
    # whitecaps where the westerly blows hardest (the Gate, the central bay,
    # the open Pacific): small streaks, clustered in gusts; WHITECAP=0 none
    wc = F('WHITECAP', 1.0)
    if wc > 0:
        # one whitecap per Voronoi cell (~34 m downwind x 22 m across) at most,
        # drawn with a probability that grows with the wind and with how open
        # the water is (sea_fld B: the Pacific, the Gate's channel; few in the
        # central bay, none in the sheltered south bay); each a streak along
        # the wind, a soft head and a long faint tail, torn by fine noise
        # (round dots everywhere read as confetti, wat13/14)
        vm = N.mapping(rot, scale=(1 / 34.0, 1 / 22.0, 1.0))
        vo = N.n('ShaderNodeTexVoronoi', feature='F1', distance='EUCLIDEAN', i_Scale=1.0, i_Randomness=0.9); N.L(vm, vo.inputs['Vector'])
        rnd = N.n('ShaderNodeSeparateColor'); N.L(vo.outputs['Color'], rnd.inputs[0])
        p_ = N.m('MULTIPLY', N.m('MULTIPLY', N.smooth(0.6, 0.97, wind), N.smooth(0.12, 0.85, pac)), F('WHITECAP_P', 0.07))
        on = N.m('LESS_THAN', rnd.outputs[0], p_)
        # the patch in the cell's own frame (u downwind, v across, in cells):
        # a short bright head at the crest, foam trailing upwind behind it
        rel = N.vmath('SUBTRACT', vm, vo.outputs['Position'])
        rx = N.n('ShaderNodeSeparateXYZ'); N.L(rel, rx.inputs[0]); du, dv = rx.outputs[0], rx.outputs[1]
        sz = N.m('ADD', 0.5, rnd.outputs[1])                        # 0.5 .. 1.5
        wv = N.m('MULTIPLY', sz, 0.045)                             # half width, cells (x 22 m)
        q_ = N.m('DIVIDE', dv, wv); acr = N.m('EXPONENT', N.m('MULTIPLY', N.m('MULTIPLY', q_, q_), -1.0))
        hd = N.m('MULTIPLY', sz, 0.04)                              # the head, cells (x 34 m)
        tail = N.m('MULTIPLY', sz, N.m('ADD', 0.10, N.m('MULTIPLY', rnd.outputs[2], 0.18)))
        r_ = N.m('DIVIDE', N.m('MAXIMUM', du, 0.0), hd); fwd = N.m('EXPONENT', N.m('MULTIPLY', N.m('MULTIPLY', r_, r_), -1.0))
        bwd = N.m('EXPONENT', N.m('DIVIDE', N.m('MINIMUM', du, 0.0), tail))
        along = N.m('MULTIPLY', fwd, bwd)
        tear = N.noise(N.mapping(rot, scale=(0.9, 2.2, 1.0)), 1.0, detail=4.0, rough=0.65)
        # thin toward the tail: a threshold rising along it
        thr_ = N.m('ADD', 0.30, N.m('MULTIPLY', N.m('SUBTRACT', 1.0, along), 0.35))
        head = N.m('MULTIPLY', N.m('MULTIPLY', acr, along), N.smooth(0.0, 0.12, N.m('SUBTRACT', tear, thr_)))
        head = N.m('MULTIPLY', head, 0.9, clamp=True)
        cap = N.m('MULTIPLY', N.m('MULTIPLY', head, on), calm)
        fb = N.n('ShaderNodeBsdfPrincipled', i_Base_Color=(0.62, 0.64, 0.62), i_Roughness=0.9)
        mx = N.n('ShaderNodeMixShader'); N.L(N.m('MULTIPLY', cap, 0.8 * wc), mx.inputs[0]); N.L(sh, mx.inputs[1]); N.L(fb.outputs[0], mx.inputs[2])
        sh = mx.outputs[0]
    # along walls, piers and rocks (the OSM coastline, piers included): a
    # dark wet line at the foot, and a soft broken wash of old foam a few
    # metres out — in the bay only (the surf has its own)
    dsh = shore_dist(bpy, N, pos)
    if dsh is not None and F('WASH', 1.0) > 0:
        bay = N.m('SUBTRACT', 1.0, N.smooth(0.3, 0.8, pac))
        wl = N.m('MULTIPLY', N.smooth(1.6, 0.3, dsh), bay)
        dk = N.n('ShaderNodeBsdfPrincipled', i_Base_Color=(0.012, 0.022, 0.018), i_Roughness=0.2, i_Specular_IOR_Level=0.3)
        m1 = N.n('ShaderNodeMixShader'); N.L(N.m('MULTIPLY', wl, 0.55), m1.inputs[0]); N.L(sh, m1.inputs[1]); N.L(dk.outputs[0], m1.inputs[2]); sh = m1.outputs[0]
        lace = N.noise(N.mapping(pos, scale=(1.0, 1.0, 1.0)), 0.35, detail=5.0, rough=0.65)
        wz = N.m('MULTIPLY', N.m('MULTIPLY', N.smooth(6.0, 1.0, dsh), N.smooth(0.3, 1.2, dsh)), bay)
        wf_ = N.m('MULTIPLY', N.m('MULTIPLY', N.smooth(0.56, 0.68, lace), wz), 0.35 * F('WASH', 1.0))
        fw = N.n('ShaderNodeBsdfPrincipled', i_Base_Color=(0.55, 0.58, 0.55), i_Roughness=0.9)
        m2 = N.n('ShaderNodeMixShader'); N.L(wf_, m2.inputs[0]); N.L(sh, m2.inputs[1]); N.L(fw.outputs[0], m2.inputs[2]); sh = m2.outputs[0]
    return sh, parts

def sea_mats(bpy, log):
    """a new sea: the mask's sheet ('sea' objects at z 0.12, cut by the land) and
    the open ocean plane get the same water"""
    old = bpy.data.materials.get('sea')
    cut_img, cut_map = None, None
    if old is not None:
        # the mask's image and the mapping that feeds IT (the old material has
        # a second mapping, for its ripples: taking that one cut the sea by
        # the mask's edge pixels — a slab of land in the Gate, wat11)
        for n_ in old.node_tree.nodes:
            if n_.type == 'TEX_IMAGE' and n_.inputs[0].is_linked:
                mp_ = n_.inputs[0].links[0].from_node
                if mp_.type == 'MAPPING':
                    cut_img = n_.image
                    cut_map = (tuple(mp_.inputs['Location'].default_value), tuple(mp_.inputs['Scale'].default_value))
    mats = {}
    for name, cut in (('sea2', True), ('ocean2', False)):
        m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); N = _N(nt)
        o = N.n('ShaderNodeOutputMaterial'); geo = N.n('ShaderNodeNewGeometry'); pos = geo.outputs['Position']
        sh, _ = water(bpy, N, pos)
        if cut and cut_img is not None:
            mp = N.mapping(pos, loc=cut_map[0], scale=cut_map[1])
            ti = N.n('ShaderNodeTexImage', image=cut_img, extension='EXTEND'); N.L(mp, ti.inputs[0])
            sp = N.n('ShaderNodeSeparateColor'); N.L(ti.outputs['Color'], sp.inputs[0])
            land = N.m('LESS_THAN', sp.outputs[0], 0.5)
            # the engine's mask calls some water land (Horseshoe Bay inside its
            # breakwater, the cove...): cut only where the OSM coast agrees,
            # or the ground shows through as a pale blob (wat33)
            ds_ = shore_dist(bpy, N, pos)
            if ds_ is not None:
                land = N.m('MULTIPLY', land, N.m('LESS_THAN', ds_, 1.0))
            tr = N.n('ShaderNodeBsdfTransparent'); cm = N.n('ShaderNodeMixShader')
            N.L(land, cm.inputs[0]); N.L(sh, cm.inputs[1]); N.L(tr.outputs[0], cm.inputs[2]); sh = cm.outputs[0]
        N.L(sh, o.inputs[0]); mats[name] = m
    n = 0
    for ob in bpy.data.objects:
        if ob.type != 'MESH' or not ob.data.materials: continue
        mn = ob.data.materials[0].name if ob.data.materials[0] else ''
        if ob.name.startswith('sea') and mn == 'sea':
            ob.data.materials[0] = mats['sea2']; n += 1
        elif ob.name.startswith('ocean') and mn.startswith('ocean'):
            ob.data.materials[0] = mats['ocean2']; n += 1
        else: continue
        # water casts no shadow (the sheet's edge drew a dark line on the ocean
        # plane under it); the sheet is not seen by reflected or bounced rays
        # either: through its cuts (a stray 'land' row of the mask at y = 0,
        # wat6) the ocean plane mirrored its dark underside. Rays from
        # anywhere else find the ocean plane 0.6 m below: the same water.
        ks = ('visible_shadow',) if ob.name.startswith('ocean') else ('visible_shadow', 'visible_glossy', 'visible_diffuse', 'visible_transmission')
        for k_ in ks:
            try: setattr(ob, k_, False)
            except Exception: pass
    log(f'water2_hq: sea material on {n} sheets')
    return n

# ── the shore ────────────────────────────────────────────────────────────────
DRY = ((0.40, 0.305, 0.135), (0.50, 0.38, 0.17))      # ground_hq class 1 (682b70869)
WET = ((0.18, 0.14, 0.078), (0.24, 0.19, 0.105))     # wet tan (ground_hq class 12, a touch warmer)
MUD = (0.105, 0.092, 0.068); MARSH = ((0.085, 0.092, 0.042), (0.13, 0.12, 0.06))
FOAM = (0.80, 0.82, 0.80)
# breaker lines on a fully exposed beach: distance from the waterline (m),
# whitewater length landward (m), strength
BREAKERS = [(14.0, 8.0, 0.95), (52.0, 24.0, 0.95), (112.0, 30.0, 0.85), (190.0, 24.0, 0.6)]

def shore_mat(bpy):
    m = bpy.data.materials.new('shore2'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); N = _N(nt)
    try: m.blend_method = 'HASHED'
    except Exception: pass
    o = N.n('ShaderNodeOutputMaterial'); geo = N.n('ShaderNodeNewGeometry'); pos = geo.outputs['Position']
    sd, vis, sand, mud, marsh, surf = (N.attr('ws_' + k) for k in ('sd', 'vis', 'sand', 'mud', 'marsh', 'surf'))
    # the waterline wanders a little along the beach; everything is measured from it
    jit = N.m('MULTIPLY', N.m('SUBTRACT', N.noise(pos, 0.012, detail=2.0), 0.5), 10.0)
    sdj = N.m('ADD', sd, N.m('MULTIPLY', jit, N.m('ADD', 0.2, surf)))
    s = N.m('MULTIPLY', sdj, -1.0)                               # metres seaward of the waterline
    # widths by exposure (surf 0 bay .. 1 Ocean Beach)
    wetw = N.m('ADD', 4.0, N.m('MULTIPLY', surf, 16.0))          # wet sand above the waterline
    swash = N.m('ADD', 1.5, N.m('MULTIPLY', surf, 9.0))          # the thin sheet of the last wave
    # ── land: dry sand, the wrack line, wet sand
    n18 = N.noise(pos, 1 / 18.0, detail=3.0)
    dry = N.mix(n18, DRY[0], DRY[1])
    rip = N.noise(N.mapping(pos, rot=(0, 0, 0.35), scale=(1.4, 0.35, 1.0)), 1.0, detail=2.0)
    dry = N.mix(N.m('MULTIPLY', N.smooth(0.45, 0.75, rip), 0.12), dry, (0.0, 0.0, 0.0))
    n10 = N.noise(pos, 1 / 10.0, detail=3.0)
    wet = N.mix(n10, WET[0], WET[1])
    # the wet sand is not flat: damp patches (sine arcs of the receding waves
    # read as paving, wat16)
    wtex = N.m('ADD', 0.84, N.m('MULTIPLY', N.noise(N.mapping(pos, scale=(1.0, 0.45, 1.0)), 0.3, detail=5.0, rough=0.6), 0.32))
    wv_ = N.n('ShaderNodeCombineXYZ'); [N.L(wtex, wv_.inputs[i]) for i in range(3)]
    wet = N.vmath('MULTIPLY', wet, wv_.outputs[0])
    edge = N.m('ADD', wetw, N.m('MULTIPLY', N.m('SUBTRACT', N.noise(pos, 0.25, detail=3.0), 0.5), 3.0))
    wetf = N.smooth(0.5, -1.0, N.m('SUBTRACT', sdj, edge))        # 1 below the wet line
    sandc = N.mix(wetf, dry, wet)
    # the wrack line: kelp and drift just above the wet sand, broken
    wr = N.m('MULTIPLY', N.smooth(1.2, 0.0, N.m('ABSOLUTE', N.m('SUBTRACT', sdj, N.m('ADD', edge, 2.5)))),
             N.smooth(0.55, 0.7, N.noise(pos, 0.08, detail=2.0)))
    sandc = N.mix(N.m('MULTIPLY', wr, N.m('MULTIPLY', surf, 0.7)), sandc, (0.05, 0.045, 0.03))
    sandr = N.m('ADD', 0.95, N.m('MULTIPLY', wetf, -0.4))      # wet 0.55 (glossier mirrored the grey sky: a concrete strip)
    # mud and marsh
    mud_a = N.m('MULTIPLY', N.smooth(-2.0, 8.0, mud), F('MUD_K', 0.8))
    msh_a = N.m('MULTIPLY', N.smooth(-2.0, 6.0, marsh), 0.9)
    msh_c = N.mix(N.noise(pos, 0.15, detail=4.0), MARSH[0], MARSH[1])
    landc = N.mix(mud_a, sandc, MUD); landc = N.mix(msh_a, landc, msh_c)
    landr = N.lerp(mud_a, sandr, 0.35); landr = N.lerp(msh_a, landr, 0.85)
    lb = N.n('ShaderNodeBsdfPrincipled', i_Specular_IOR_Level=0.2); N.L(landc, lb.inputs['Base Color']); N.L(landr, lb.inputs['Roughness'])
    # ── water: the sea's own, lighter and sandier in the surf zone
    def surfwater(N_, p):
        stir = N_.m('MULTIPLY', surf, N_.smooth(260.0, 20.0, s))
        # sand in suspension: a lighter olive-tan (in the warmed, x1.8 albedo space of water())
        p['col'] = N_.mix(N_.m('MULTIPLY', stir, F('SURF_STIR', 0.5)), p['col'], (0.075, 0.105, 0.075))
    up = N.n('ShaderNodeCombineXYZ', i_X=0.0, i_Y=0.0, i_Z=1.0).outputs[0]
    wsh, parts = water(bpy, N, pos, extra=surfwater, flat=up)
    for b_ in (lb, ):
        N.L(up, b_.inputs['Normal'])
    # the swash: water thinning to nothing over the wet sand
    sw_t = N.smooth(0.0, 1.0, N.m('DIVIDE', s, swash))            # 0 at the waterline, 1 beyond the swash
    # whitewater: each breaker line is a crisp, dense front with its foam
    # pushed landward, solid for a few metres, then torn into streaks and
    # lace as it spreads; sections of a line break, the rest is a dark
    # unbroken swell face. Between the lines: thin scum lines of old foam.
    lace_n = N.noise(N.mapping(pos, rot=(0, 0, 0.1), scale=(0.30, 0.10, 0.3)), 1.0, detail=6.0, rough=0.62)
    fine_n = N.noise(pos, 0.9, detail=4.0, rough=0.6)
    lace_v = N.m('ADD', N.m('MULTIPLY', lace_n, 0.7), N.m('MULTIPLY', fine_n, 0.3))
    fm = None
    for k, (d0, ln, st) in enumerate(BREAKERS):
        dk = N.m('ADD', N.m('MULTIPLY', d0, N.m('ADD', 0.3, N.m('MULTIPLY', surf, 0.7))),
                 N.m('ADD', N.m('MULTIPLY', N.m('SUBTRACT', N.noise(N.mapping(pos, loc=(37.0 * k, 11.0 * k, 0)), 0.004, detail=2.0), 0.5), 16.0 + 8 * k),
                        N.m('MULTIPLY', N.m('SUBTRACT', N.noise(N.mapping(pos, loc=(13.0 * k, 71.0 * k, 0)), 0.045, detail=3.0), 0.5), 7.0)))
        t = N.m('SUBTRACT', dk, s)                               # metres landward of the break
        front = N.smooth(-0.8, 0.4, t)
        tl = N.m('DIVIDE', N.m('MAXIMUM', t, 0.0), ln)          # 0 at the front .. 1 at ln metres
        # the foam thins with distance from the front: a rising threshold on the lace
        thr = N.m('ADD', 0.34, N.m('MULTIPLY', tl, 0.26))
        torn = N.smooth(0.0, 0.10, N.m('SUBTRACT', lace_v, thr))
        dens = N.m('EXPONENT', N.m('MULTIPLY', tl, -0.9))
        core = N.smooth(2.0 + 1.5 * min(k, 2), 0.0, t)           # the solid front, 2-5 m
        body = N.m('MAXIMUM', core, N.m('MULTIPLY', torn, dens))
        sec = N.smooth(0.34 + 0.05 * k, 0.56 + 0.04 * k, N.noise(N.mapping(pos, loc=(0, 0, 5.0 * k)), 0.0035, detail=2.0))
        # fewer lines on less exposed shores: the shorebreak everywhere, the
        # outer bars only at Ocean Beach (on the Marin cliffs the rings drew
        # the coves' contours, wat10)
        ex = N.smooth(0.2 + 0.25 * k, 0.45 + 0.25 * k, surf)
        f = N.m('MULTIPLY', N.m('MULTIPLY', front, body), N.m('MULTIPLY', N.m('MULTIPLY', sec, ex), st))
        fm = f if fm is None else N.m('MAXIMUM', fm, f)
    # scum lines: old foam drawn into thin sinuous lines parallel to the shore
    # (regular sine scum lines read as a pattern, wat4: a mottle of old foam instead)
    old_ = N.smooth(0.70, 0.78, N.m('ADD', lace_v, N.m('MULTIPLY', N.noise(pos, 0.03, detail=2.0), 0.2)))
    fm = N.m('MAXIMUM', fm, N.m('MULTIPLY', old_, N.m('MULTIPLY', N.smooth(230.0, 120.0, s), 0.28)))
    # the uprush's lace at the waterline, the last wave's edge
    xs = N.m('DIVIDE', s, swash)
    upr = N.m('MULTIPLY', N.smooth(-0.05, 0.06, xs), N.smooth(0.3, 0.1, xs))
    fm = N.m('MAXIMUM', fm, N.m('MULTIPLY', upr, N.smooth(0.35, 0.5, lace_v)))
    fm = N.m('MULTIPLY', fm, surf)
    fm = N.m('MULTIPLY', fm, F('SURF_K', 1.0), clamp=True)
    fshade = N.m('ADD', 0.72, N.m('MULTIPLY', N.noise(pos, 0.35, detail=5.0, rough=0.65), 0.5))
    fb = N.n('ShaderNodeBsdfPrincipled', i_Roughness=0.85)
    fcol = N.mix(N.m('MULTIPLY', N.m('SUBTRACT', 1.0, fshade), 2.0, clamp=True), FOAM, (0.40, 0.43, 0.41))
    N.L(fcol, fb.inputs['Base Color']); N.L(up, fb.inputs['Normal'])
    wf = N.n('ShaderNodeMixShader'); N.L(fm, wf.inputs[0]); N.L(wsh, wf.inputs[1]); N.L(fb.outputs[0], wf.inputs[2])
    # the swash over the wet sand: the sand shows through the thin sheet
    ws = N.n('ShaderNodeMixShader'); N.L(N.m('ADD', 0.15, N.m('MULTIPLY', sw_t, 0.85)), ws.inputs[0])
    # the backwash's sheen: wet sand under a film of water
    wb = N.n('ShaderNodeBsdfPrincipled', i_Roughness=0.3, i_IOR=1.333, i_Specular_IOR_Level=0.25); N.L(wet, wb.inputs['Base Color']); N.L(up, wb.inputs['Normal'])
    N.L(wb.outputs[0], ws.inputs[1]); N.L(wf.outputs[0], ws.inputs[2])
    # land or water: the waterline, except on mud and marsh (always land)
    iswater = N.m('MULTIPLY', N.smooth(-0.3, 0.3, s), N.m('SUBTRACT', 1.0, N.m('MAXIMUM', mud_a, msh_a)))
    lw = N.n('ShaderNodeMixShader'); N.L(iswater, lw.inputs[0]); N.L(lb.outputs[0], lw.inputs[1]); N.L(ws.outputs[0], lw.inputs[2])
    # thin lacy foam on the swash and the wet sand: filaments of old bubbles
    fil = N.m('MULTIPLY', N.smooth(0.012, 0.0, N.m('ABSOLUTE', N.m('SUBTRACT', lace_v, 0.5))),
              N.m('MULTIPLY', N.smooth(-0.5, 0.2, N.m('DIVIDE', s, wetw)), N.smooth(1.6, 0.9, xs)))
    fl = N.n('ShaderNodeMixShader'); N.L(N.m('MULTIPLY', fil, N.m('MULTIPLY', surf, 0.55)), fl.inputs[0]); N.L(lw.outputs[0], fl.inputs[1]); N.L(fb.outputs[0], fl.inputs[2])
    lw = fl
    # alpha: the mesh's own visibility; mud and marsh fade in by themselves
    tr = N.n('ShaderNodeBsdfTransparent')
    # alpha: the polygons' own soft edges and the coast band's landward edge
    # (b1 m over the coastline), from the signed distances — smooth lines, not
    # the 3 m grid's steps the per-vertex visibility drew
    b1 = N.attr('ws_b1')
    # the dry sand is the ground's (ground_hq: NAIP classes and the photo's
    # own grain); this overlay stops at the wet line, fading over 3 m
    bandA = N.m('MULTIPLY', N.smooth(1.5, -1.5, N.m('SUBTRACT', sd, b1)), N.m('MULTIPLY', vis, 20.0, clamp=True))
    # ... except where the ground lies under the sea sheet (ws_low): there
    # the overlay's own dry sand, or the sea would show through the beach
    low = N.attr('ws_low')
    beachA = N.m('MULTIPLY', N.m('MAXIMUM', N.smooth(-1.0, 1.0, sand), bandA),
                 N.m('MAXIMUM', N.smooth(3.0, -0.5, N.m('SUBTRACT', sdj, edge)), N.smooth(0.3, 0.7, low)))
    polyA = N.m('MAXIMUM', beachA, N.m('MAXIMUM', N.smooth(-1.0, 1.0, mud), N.smooth(-1.0, 1.0, marsh)))
    cm = N.n('ShaderNodeMixShader'); N.L(polyA, cm.inputs[0]); N.L(tr.outputs[0], cm.inputs[1]); N.L(lw.outputs[0], cm.inputs[2])
    N.L(cm.outputs[0], o.inputs[0])
    return m

def shore(bpy, sc, ground, box, log):
    z = np.load(os.path.join(WD, 'shore.npz'))
    xy, T, A = z['xy'], z['tris'], z['attr']; names = [str(v) for v in z['attr_names']]
    pad = 400.0
    inb = (xy[:, 0] > box[0] - pad) & (xy[:, 0] < box[2] + pad) & (xy[:, 1] > box[1] - pad) & (xy[:, 1] < box[3] + pad)
    keep = inb[T].all(1)
    if not keep.any(): log('water2_hq: no shore in the box'); return 0
    T = T[keep]; used = np.unique(T); remap = np.full(len(xy), -1, np.int64); remap[used] = np.arange(len(used))
    T = remap[T]; xy = xy[used]; A = A[used]
    at = {k: A[:, i] for i, k in enumerate(names)}
    # heights: over the ground (terrain, else the surround) and over the water
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    trees = [BVHTree.FromObject(o_, dg) for o_ in bpy.data.objects if o_.type == 'MESH' and o_.name.split('.')[0] in ('terrain', 'surround')]
    try:
        g_ = json.load(open(os.path.join(os.path.dirname(WD), 'city', 'sea.json')))
        sq = (g_['ox'], g_['oy'], g_['ox'] + g_['w'], g_['oy'] + g_['h'])
    except Exception:
        sq = (-7353, -6360, 7747, 8740)
    Z = np.empty(len(xy), np.float32); dn = Vector((0, 0, -1))
    for i, (x, y) in enumerate(xy):
        h = None
        for tr in trees:
            hit = tr.ray_cast(Vector((float(x), float(y), 2000.0)), dn)
            if hit[0] is not None: h = hit[0].z if h is None else max(h, hit[0].z)
        Z[i] = -50.0 if h is None else h
    seaz = np.where((xy[:, 0] >= sq[0]) & (xy[:, 0] <= sq[2]) & (xy[:, 1] >= sq[1]) & (xy[:, 1] <= sq[3]), SEA_Z, -0.5)
    land = at['sd'] > 0
    at['low'] = (Z < seaz + 0.25).astype(np.float32)
    # on the water side the sheet follows the ground up at most 0.6 m (the
    # lobed 3DEP beach), then lies on the water
    Z = np.where(land, np.maximum(Z, seaz) + 0.05, seaz + 0.04 + np.clip(Z + 0.01 - seaz, 0, 0.6)).astype(np.float32)
    # the steps of the ground under it (the sunk sea's edge, walls) are
    # shaded flat by the material (a flat normal): lit sand-coloured 'posts'
    # along the surf line otherwise (wat24-26, gnd25); dropping them opened a
    # stepped slit onto the sea (wat27). Only cliffs over 3 m are dropped
    zt = Z[T]; T = T[(zt.max(1) - zt.min(1)) < 3.0]
    me = bpy.data.meshes.new('shore2')
    me.vertices.add(len(xy)); me.vertices.foreach_set('co', np.column_stack([xy, Z]).astype(np.float32).ravel())
    me.loops.add(len(T) * 3); me.loops.foreach_set('vertex_index', T.astype(np.int32).ravel())
    me.polygons.add(len(T)); me.polygons.foreach_set('loop_start', (np.arange(len(T)) * 3).astype(np.int32))
    try: me.polygons.foreach_set('loop_total', np.full(len(T), 3, np.int32))
    except Exception: pass
    me.update(calc_edges=True)
    # the band's landward edge, m over the coastline: 12 at Ocean Beach, 0 elsewhere (water2_prep ZONES)
    at['b1'] = np.where((xy[:, 0] > -7300) & (xy[:, 0] < -5000) & (xy[:, 1] > -9800) & (xy[:, 1] < 1990), 12.0, 0.0)
    for k in ('sd', 'vis', 'sand', 'mud', 'marsh', 'surf', 'b1', 'low'):
        a_ = me.attributes.new('ws_' + k, 'FLOAT', 'POINT'); a_.data.foreach_set('value', at[k].astype(np.float32))
    me.materials.append(shore_mat(bpy))
    ob = bpy.data.objects.new('shore2', me); sc.collection.objects.link(ob)
    # seen by the camera only: the sea under its half-transparent edge must not
    # mirror its underside (a dark stepped line along the band's edge, wat1)
    for k in ('visible_shadow', 'visible_glossy', 'visible_diffuse', 'visible_transmission', 'visible_volume_scatter'):
        try: setattr(ob, k, False)
        except Exception: pass
    log(f'water2_hq: shore {len(xy)} vertices, {len(T)} triangles')
    return len(T)

def build(bpy, sc, M, ground, box, d, log, era=None):
    t0 = time.time()
    if not os.path.exists(os.path.join(WD, 'sea.json')):
        log('water2_hq: no data in', WD); return
    sea_mats(bpy, log)
    if E('WATER2_SHORE', '1') == '1' and (era is None or era >= 2001):
        shore(bpy, sc, ground, box, log)
    log(f'water2_hq: {time.time() - t0:.1f}s')
