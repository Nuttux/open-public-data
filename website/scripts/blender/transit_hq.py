"""San Francisco's rail, above ground, for the path-traced city (hq_city.py).

hq_city.py calls, once the scene stands (after landmarks_hq), before camera
and light:
    transit_hq.build(bpy, scene, mats, ground, box, scene_json, log, era)
ground(x, y) is the terrain's top (None off the terrain); `box` the region
built. build() never raises.

WHAT IS DRAWN, AND WHY. At 37 cm a pixel a rail (7 cm) is a fifth of a pixel,
so what says "tram street" or "rail yard" from the air is:
  - the track's BED: the light concrete slab a street track is set in, or the
    raised band of ballast with the darker band of the ties on a private way,
    a yard, Caltrain;
  - the RAILS as a pair of lines: flush polished heads with their dark
    flangeway groove in the street, raised steel with a shadow on ballast;
    the cable cars' slot between their rails (drawn 2.5x wide, a convention:
    the real slot is 3 cm);
  - Caltrain's catenary poles with their cantilevers (they read in the yard;
    the contact wires and Muni's kerb poles do not, and are off by default);
  - platforms (their yellow edge along the track), the cable-car turntables;
  - the VEHICLES, placed sparsely and plausibly (transit_cars.py): Muni LRV4
    singly and in twos, PCCs and the Milan tram on the F, cable cars on the
    three lines and at the Powell and Hyde turntables, LRVs parked in Muni
    Metro East and Green Division, Caltrain's electric KISS sets (and a gallery
    set) at the 4th & King platforms.
Placement is a function of the whole network, not of the region built, so
every frame of the pyramid agrees where a train stands.

DATA. transit.json (transit_prep.py): OpenStreetMap, ODbL, (c) OpenStreetMap
contributors. Tunnels are dropped (the Market St subway, Twin Peaks, Sunset
and Central Subway tunnels, BART under Market and Mission, Caltrain's four).

ERA. The network is today's. With `era` set nothing is built: the history
agent's era.py owns the cable lines of 1873-1890 and whatever came after.

env: TRANSIT_VEH=0 (no vehicles) · TRANSIT_WIRE=rail (default: Caltrain's poles only) | 1 (all
     the overhead: contact wires, Muni kerb poles and spans) | 0 ·
     TRANSIT_ONLY=cable,tram,... (classes)
"""
import json, math, os, random, sys, time, traceback
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
import transit_geom as TG
import transit_cars as TC

DATA = [os.path.join(HERE, 'transit.json'), '/Users/daniel/code/qipu-render-work/transit/transit.json']
E = os.environ.get
STEP = 1.5                 # track sampling, m
C = lambda *c: (*c, 1.0)

# colours (linear) ────────────────────────────────────────────────────────────
SLAB = C(0.74, 0.72, 0.68)          # multiplies the concrete texture (lighter than the asphalt, as from the air)
SLAB_CABLE = C(0.70, 0.68, 0.64)
BALLAST = C(0.125, 0.112, 0.094)      # grey-brown, dusty (it read as concrete at 0.2)
BALLAST_WEEDY = C(0.095, 0.098, 0.060)
TIES_TIMBER = C(0.070, 0.055, 0.044)
TIES_CONCRETE = C(0.215, 0.205, 0.190)
RUST = C(0.110, 0.060, 0.035)
GROOVE = C(0.018, 0.017, 0.016)
SLOT_STEEL = C(0.10, 0.095, 0.09)
GRIME = C(0.06, 0.057, 0.052)
POLE_MUNI = C(0.040, 0.050, 0.045)
POLE_CALTRAIN = C(0.22, 0.23, 0.24)
PLATFORM = C(0.86, 0.85, 0.82)
TACTILE = C(0.80, 0.50, 0.02)
WOOD = C(0.16, 0.115, 0.080)
DECK = C(0.62, 0.61, 0.58)


def build(bpy, sc, M, ground, box, d=None, log=print, era=None):
    t0 = time.time()
    if era is not None:
        log(f'transit_hq: era {era}: the present-day network is not built (the history agent owns the past)'); return
    try:
        _build(bpy, sc, M, ground, box, log, t0)
    except Exception as ex:
        traceback.print_exc(); log('transit_hq: FAILED, scene left as it was:', ex)


def _load():
    for p in DATA:
        if os.path.exists(p): return json.load(open(p))
    raise FileNotFoundError('transit.json (run transit_prep.py)')


# ── materials ────────────────────────────────────────────────────────────────
def _mats(bpy, M):
    def principled(name, col=None, rough=0.5, metal=0.0, spec=0.5, coat=0.0, noise=None):
        m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
        p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
        p.inputs['Specular IOR Level'].default_value = spec
        if coat: p.inputs['Coat Weight'].default_value = coat
        if col is not None:
            p.inputs['Base Color'].default_value = col if len(col) == 4 else (*col, 1.0); return m
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'bcol'; src = at.outputs['Color']
        if noise:
            geo = nt.nodes.new('ShaderNodeNewGeometry'); nz = nt.nodes.new('ShaderNodeTexNoise')
            nz.inputs['Scale'].default_value = noise[0]; nz.inputs['Detail'].default_value = 6.0
            nt.links.new(geo.outputs['Position'], nz.inputs['Vector'])
            mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 1 - noise[1]; mr.inputs['To Max'].default_value = 1 + noise[1]
            nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
            mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1.0
            nt.links.new(src, mx.inputs[6]); nt.links.new(mr.outputs[0], mx.inputs[7]); src = mx.outputs[2]
        nt.links.new(src, p.inputs['Base Color'])
        return m

    def tinted(src, name):
        """a copy of a scene material (the concrete of the sidewalks), multiplied by bcol"""
        if src is None: return principled(name, rough=0.8, noise=(0.8, 0.15))
        m = src.copy(); m.name = name; nt = m.node_tree
        p = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        at = nt.nodes.new('ShaderNodeAttribute'); at.attribute_name = 'bcol'
        lk = p.inputs['Base Color'].links
        if lk:
            s_ = lk[0].from_socket
            mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs[0].default_value = 1.0
            nt.links.new(s_, mx.inputs[6]); nt.links.new(at.outputs['Color'], mx.inputs[7]); nt.links.new(mx.outputs[2], p.inputs['Base Color'])
        else:
            nt.links.new(at.outputs['Color'], p.inputs['Base Color'])
        return m

    T = {}
    T['slab'] = tinted(M.get('sidewalk'), 'tr_slab')
    T['plat'] = tinted(M.get('sidewalk'), 'tr_plat')
    # stones: no sheen (at 0.5 specular the low sky lit the yard pale blue, 2026-09-24)
    T['ballast'] = principled('tr_ballast', rough=1.0, spec=0.12, noise=(1.3, 0.28))
    # worn rail heads: they shine, but a yard of them read as a line drawing at 0.34 (MME, 2026-09-24)
    T['steel'] = principled('tr_steel', (0.30, 0.285, 0.27), rough=0.46, metal=1.0)
    T['rust'] = principled('tr_rust', rough=0.85, spec=0.25)
    T['dark'] = principled('tr_dark', rough=0.9, spec=0.3)
    T['wire'] = principled('tr_wire', (0.025, 0.025, 0.025), rough=0.45, metal=0.6)
    T['pole'] = principled('tr_pole', rough=0.55)
    T['wood'] = principled('tr_wood', rough=0.85, noise=(3.0, 0.25))
    T['deck'] = tinted(M.get('sidewalk'), 'tr_deck')
    T['v_paint'] = principled('tr_v_paint', rough=0.32, coat=0.4)
    T['v_glass'] = M.get('glass') or principled('tr_v_glass', (0.02, 0.022, 0.026), rough=0.04, spec=0.9)
    T['v_roof'] = principled('tr_v_roof', rough=0.6)
    T['v_dark'] = principled('tr_v_dark', rough=0.8)
    T['v_metal'] = principled('tr_v_metal', rough=0.3, metal=0.8)
    return T


# ── the surface a track lies on ──────────────────────────────────────────────
class Surface:
    """the top of the street where there is one (the street mesh is draped on
    the true ground), else the terrain"""
    def __init__(self, bpy, sc, ground):
        from mathutils import Vector
        from mathutils.bvhtree import BVHTree
        self.V = Vector; self.ground = ground; self.down = Vector((0, 0, -1))
        so = sc.objects.get('streets')
        self.sb = BVHTree.FromObject(so, bpy.context.evaluated_depsgraph_get()) if so is not None and len(so.data.polygons) else None

    def at(self, x, y):
        """(z, on_street) or (None, False) off the terrain"""
        g = self.ground(float(x), float(y))
        if g is None: return None, False
        if self.sb is not None:
            h = self.sb.ray_cast(self.V((float(x), float(y), g + 25.0)), self.down, 40.0)
            if h[0] is not None and -0.8 < h[0].z - g < 2.5: return max(h[0].z, g), True
        return g, False

    def street(self, x, y):
        if self.sb is None: return False
        g = self.ground(float(x), float(y))
        if g is None: return False
        h = self.sb.ray_cast(self.V((float(x), float(y), g + 25.0)), self.down, 40.0)
        return h[0] is not None and -0.8 < h[0].z - g < 2.5


# ── per class: how the track is laid ─────────────────────────────────────────
def style_of(t, onst):
    """'embedded' (set in the street), 'ballast' or 'deck' (a bridge)"""
    if t['bridge']: return 'deck'
    if t['cls'] in ('cable', 'tram'): return 'embedded'
    if t.get('embedded') or onst: return 'embedded'
    return 'ballast'

# heights over the surface: the camera is 20 km away, so a ray's t is good to
# ~2 mm; layers that overlap are kept a centimetre apart
EMB_LIFT, EMB_SLOT, EMB_GROOVE, EMB_RAIL = 0.05, 0.06, 0.07, 0.08
BAL_BED, BAL_TIE, BAL_RAIL = 0.20, 0.215, 0.38

def rail_top_lift(style):
    return EMB_RAIL if style in ('embedded', 'deck') else BAL_RAIL


def _build(bpy, sc, M, ground, box, log, t0):
    D = _load()
    only = set(E('TRANSIT_ONLY').split(',')) if E('TRANSIT_ONLY') else None
    bx0, by0, bx1, by1 = box
    PAD = 150.0
    def inb(x, y, pad=PAD): return bx0 - pad <= x <= bx1 + pad and by0 - pad <= y <= by1 + pad
    T = _mats(bpy, M)
    coll = bpy.data.collections.new('transit'); sc.collection.children.link(coll)
    surf = Surface(bpy, sc, ground)
    bank = TG.Bank()
    tracks = [t for t in D['tracks'] if (only is None or t['cls'] in only)]
    # bridge ends that meet a track at grade (an abutment: the deck comes down there)
    grade_nodes = set()
    for t in tracks:
        if not t['bridge']:
            for p in (t['pts'][0], t['pts'][-1]): grade_nodes.add((round(p[0], 1), round(p[1], 1)))
    all_samples = []                # (x, y, gauge) of every track in the region, for platforms, poles
    geo = []
    for t in tracks:
        if not any(inb(*p) for p in t['pts']): continue
        r = TG.resample(t['pts'], STEP)
        if r is None: continue
        X, Y, S, TX, TY, NX, NY = r
        n = len(X); g = t['gauge']
        inside = np.array([inb(x, y) for x, y in zip(X, Y)])
        zc = np.full(n, np.nan); onst = np.zeros(n, bool)
        for i in range(n):
            if not inside[i]: continue
            z, s_ = surf.at(X[i], Y[i])
            if z is not None: zc[i] = z; onst[i] = s_
        ok = ~np.isnan(zc)
        if not ok.any(): continue
        onst = TG.smooth_bool(onst, 5)
        geo.append(dict(t=t, X=X, Y=Y, S=S, NX=NX, NY=NY, zc=zc, ok=ok, onst=onst))
        all_samples.append(np.stack([X[ok], Y[ok], np.full(ok.sum(), g)], 1))
    AS = np.concatenate(all_samples) if all_samples else np.zeros((0, 3))
    from mathutils.kdtree import KDTree
    kd = KDTree(len(AS))
    for k, (x, y, _) in enumerate(AS): kd.insert((x, y, 0.0), k)
    kd.balance()
    log(f'transit_hq: {len(geo)} tracks in the region, {len(AS)} samples ({time.time() - t0:.1f}s)')

    try: _clear_cars(bpy, sc, kd, log)
    except Exception as ex: traceback.print_exc(); log('transit_hq: clearing cars failed', ex)
    nw = 0
    for G in geo:
        try: _lay(bank, G, surf, grade_nodes)
        except Exception as ex: traceback.print_exc(); log('transit_hq: track', G['t']['id'], 'failed', ex)
    log(f'transit_hq: track beds and rails, {bank.nfaces()} faces ({time.time() - t0:.1f}s)')
    # THE OVERHEAD at 37 cm/px (Judah St, 2026-09-24, sheets 05): a contact
    # wire's shadow does not show at all, and the kerb poles are faint ticks
    # across the facades - noise. Caltrain's poles in the yard do read. So by
    # default: Caltrain's poles and cantilevers only ('rail'); '1' = all of it
    wmode = E('TRANSIT_WIRE', 'rail')
    if wmode != '0':
        try: nw = _overhead(bank, geo, surf, kd, AS, wmode)
        except Exception as ex: traceback.print_exc(); log('transit_hq: overhead failed', ex)
    try: npf = _platforms(bank, D['platforms'], surf, kd, AS, inb)
    except Exception as ex: traceback.print_exc(); log('transit_hq: platforms failed', ex); npf = 0
    try: ntt = _turntables(bank, D['turntables'], surf, geo, inb)
    except Exception as ex: traceback.print_exc(); log('transit_hq: turntables failed', ex); ntt = 0
    mats = {'slab': T['slab'], 'ballast': T['ballast'], 'steel': T['steel'], 'rust': T['rust'], 'dark': T['dark'],
            'wire': T['wire'], 'pole': T['pole'], 'plat': T['plat'], 'wood': T['wood'], 'deck': T['deck']}
    nf = bank.nfaces()
    bank.emit(bpy, coll, mats, 'transit')
    log(f'transit_hq: {nf} faces (poles {nw}, platforms {npf}, turntables {ntt}) ({time.time() - t0:.1f}s)')
    if E('TRANSIT_AB') == '1':
        # look tests: a LOOKS entry named 'base' is rendered without the transit,
        # one named 'nowire' without the overhead (wires, poles). ONE look per
        # run: a second render re-syncs the scene and doubled the memory (50 GB,
        # memguard, 2026-09-24)
        def _ab(scene, *a, coll=coll):
            fn = os.path.basename(scene.render.filepath)
            coll.hide_render = '_base_' in fn
            for o in coll.objects:
                if o.name.startswith(('transit.wire', 'transit.pole')): o.hide_render = '_nowire_' in fn
        bpy.app.handlers.render_pre.append(_ab)
    if E('TRANSIT_VEH', '1') == '1':
        try:
            nv = _vehicles(bpy, coll, T, D, tracks, surf, inb, log)
            log(f'transit_hq: {nv} vehicles ({time.time() - t0:.1f}s)')
        except Exception as ex: traceback.print_exc(); log('transit_hq: vehicles failed', ex)


# ── no parked car on a track ─────────────────────────────────────────────────
def _clear_cars(bpy, sc, kd, log):
    """hq_city parks cars along every kerb edge of the street mesh, and a
    median or a track lane has kerb edges too: a car whose centre is within
    2.3 m of a track's centre (half a slab + half a car) stands on the track.
    Its point is removed from the 'cars' instancer."""
    import bmesh
    ob = sc.objects.get('cars')
    if ob is None or ob.type != 'MESH' or not len(ob.data.vertices): return
    bm = bmesh.new(); bm.from_mesh(ob.data)
    kill = [v for v in bm.verts if kd.find_range((v.co.x, v.co.y, 0.0), 2.3)]
    if kill:
        bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(ob.data); ob.data.update()
    bm.free()
    log(f'transit_hq: {len(kill)} parked cars stood on a track, removed')


# ── the track itself ─────────────────────────────────────────────────────────
def _lay(bank, G, surf, grade_nodes):
    t = G['t']; X, Y, S, NX, NY, zc, ok, onst = G['X'], G['Y'], G['S'], G['NX'], G['NY'], G['zc'], G['ok'], G['onst']
    g = t['gauge']; cls = t['cls']; n = len(X)
    if t['covered']: return
    if t['bridge']:
        _bridge(bank, G, surf, grade_nodes); return
    styles = np.array([style_of(t, o) for o in onst])
    # disused track only where it is set in a street (the Belt Railroad's old
    # rails in the pavement): off the street it lies on the pier aprons, whose
    # ground is not the deck the landmarks agent builds, and came out as dark
    # wavy ballast beside the pier sheds (Embarcadero, 2026-09-24)
    if cls == 'disused': styles[styles == 'ballast'] = 'none'
    for sty in ('embedded', 'ballast'):
        m = ok & (styles == sty)
        for i0, i1 in TG.runs(m):
            idx = np.arange(i0, i1); idx = idx[ok[idx]]
            if len(idx) < 2: continue
            if sty == 'embedded': _embedded(bank, t, X[idx], Y[idx], NX[idx], NY[idx], zc[idx], surf)
            else: _ballasted(bank, t, X[idx], Y[idx], NX[idx], NY[idx], zc[idx], surf)


def _lateral(X, Y, NX, NY, zc, surf, offs):
    """the surface's height at lateral offsets `offs` (ascending, 0 included:
    zc), per sample: (n, len(offs))"""
    Z = np.zeros((len(X), len(offs)))
    for j, o in enumerate(offs):
        if o == 0: Z[:, j] = zc; continue
        for i in range(len(X)):
            z, _ = surf.at(X[i] + NX[i] * o, Y[i] + NY[i] * o)
            Z[i, j] = zc[i] if z is None else z
    return Z

def _zat(Z, offs, o):
    offs = np.asarray(offs, float)
    if o <= offs[0]: return Z[:, 0]
    if o >= offs[-1]: return Z[:, -1]
    j = int(np.searchsorted(offs, o)) - 1; f = (o - offs[j]) / (offs[j + 1] - offs[j])
    return Z[:, j] * (1 - f) + Z[:, j + 1] * f

def _edge(X, Y, NX, NY, z, o):
    return np.stack([X + NX * o, Y + NY * o, z], 1)

def _band(bank, key, X, Y, NX, NY, Z, offs, o_lo, o_hi, lift, col):
    """a flat band between two lateral offsets, `lift` over the surface"""
    A = _edge(X, Y, NX, NY, _zat(Z, offs, o_hi) + lift, o_hi)
    B = _edge(X, Y, NX, NY, _zat(Z, offs, o_lo) + lift, o_lo)
    bank.strip(key, A, B, col)

def _wall(bank, key, X, Y, NX, NY, Z, offs, o, lo, hi, col):
    A = _edge(X, Y, NX, NY, _zat(Z, offs, o) + hi, o)
    B = _edge(X, Y, NX, NY, _zat(Z, offs, o) + lo, o)
    bank.strip(key, A, B, col)


def _embedded(bank, t, X, Y, NX, NY, zc, surf):
    g = t['gauge']; cls = t['cls']
    hw = g / 2 + (0.58 if cls == 'cable' else 0.72)
    offs = [-hw, 0.0, hw]
    Z = _lateral(X, Y, NX, NY, zc, surf, offs)
    disused = cls == 'disused'
    _band(bank, 'slab', X, Y, NX, NY, Z, offs, -hw, hw, EMB_LIFT, SLAB_CABLE if cls == 'cable' else C(0.62, 0.60, 0.56) if disused else SLAB)
    for sg in (1, -1):
        oc = sg * (g / 2 + 0.036)
        # rail head (flush, worn steel) and the flangeway on its inner side, with
        # the grime either side of them: drawn 8 + 14 + 6 cm, a convention (the
        # steel is 7 cm), so the pair reads as two lines at 37 cm/px
        _band(bank, 'rust' if disused else 'steel', X, Y, NX, NY, Z, offs, oc - 0.04, oc + 0.04, EMB_RAIL, RUST)
        gi = oc - sg * 0.04
        _band(bank, 'dark', X, Y, NX, NY, Z, offs, min(gi, gi - sg * 0.14), max(gi, gi - sg * 0.14), EMB_GROOVE, GROOVE)
        go = oc + sg * 0.04
        _band(bank, 'dark', X, Y, NX, NY, Z, offs, min(go, go + sg * 0.06), max(go, go + sg * 0.06), EMB_GROOVE, GRIME)
    if cls == 'cable':
        # the slot rails (steel, flush) and the slot the grip reaches the cable through
        _band(bank, 'dark', X, Y, NX, NY, Z, offs, -0.2, 0.2, EMB_SLOT, SLOT_STEEL)
        _band(bank, 'dark', X, Y, NX, NY, Z, offs, -0.06, 0.06, EMB_GROOVE, GROOVE)


def _ballasted(bank, t, X, Y, NX, NY, zc, surf):
    g = t['gauge']; cls = t['cls']
    # in a yard, and on Caltrain's right of way (4th & King's tracks are mostly
    # tagged main line), the shoulders run on until they meet the next track's
    hw = g / 2 + 1.05; ft = hw + (2.3 if (t['yard'] or cls == 'rail') else 1.0); tw = g / 2 + 0.55
    offs = [-ft, -hw, 0.0, hw, ft]
    Z = _lateral(X, Y, NX, NY, zc, surf, offs)
    weedy = cls == 'disused' or t.get('usage') == 'industrial' or t['service'] in ('spur',)
    bed = BALLAST_WEEDY if weedy else BALLAST
    ties = TIES_CONCRETE if (cls in ('rail', 'bart') and t['service'] == '' and not weedy) else TIES_TIMBER
    # shoulders down to the ground, the bed, the ties' band
    bank.strip('ballast', _edge(X, Y, NX, NY, _zat(Z, offs, -hw) + BAL_BED, -hw), _edge(X, Y, NX, NY, Z[:, 0] - 0.04, -ft), bed)
    bank.strip('ballast', _edge(X, Y, NX, NY, Z[:, -1] - 0.04, ft), _edge(X, Y, NX, NY, _zat(Z, offs, hw) + BAL_BED, hw), bed)
    _band(bank, 'ballast', X, Y, NX, NY, Z, offs, -hw, hw, BAL_BED, bed)
    _band(bank, 'ballast', X, Y, NX, NY, Z, offs, -tw, tw, BAL_TIE, ties)
    for sg in (1, -1):
        oc = sg * (g / 2 + 0.036)
        _band(bank, 'rust' if weedy else 'steel', X, Y, NX, NY, Z, offs, oc - 0.05, oc + 0.05, BAL_RAIL, RUST)
        for o in (oc - 0.05, oc + 0.05):
            _wall(bank, 'rust', X, Y, NX, NY, Z, offs, o, BAL_TIE, BAL_RAIL, RUST)
    if cls == 'bart':
        # the third rail under its cover board, beside the running rails
        o = g / 2 + 0.75
        _band(bank, 'ballast', X, Y, NX, NY, Z, offs, o - 0.14, o + 0.14, BAL_RAIL + 0.1, C(0.55, 0.52, 0.46))


def _bridge(bank, G, surf, grade_nodes):
    """a deck: at an abutment end (the bridge meets track at grade) the deck
    comes down to the ground over 40 m; between bridge ways it stays up"""
    t = G['t']; X, Y, S, NX, NY, zc, ok = G['X'], G['Y'], G['S'], G['NX'], G['NY'], G['zc'], G['ok']
    if not ok.any(): return
    if not ok.all():
        ii = np.arange(len(zc)); zc = np.interp(ii, ii[ok], zc[ok])
    L = S[-1]; lay = max(1, t.get('layer') or 1)
    H = {1: 6.5, 2: 11.0}.get(lay, 6.5 + 4.5 * (lay - 1))
    p0, p1 = t['pts'][0], t['pts'][-1]
    a0 = (round(p0[0], 1), round(p0[1], 1)) in grade_nodes; a1 = (round(p1[0], 1), round(p1[1], 1)) in grade_nodes
    ramp = np.ones(len(X))
    if a0: ramp = np.minimum(ramp, S / 45.0)
    if a1: ramp = np.minimum(ramp, (L - S) / 45.0)
    if L < 60 and a0 and a1:
        # a short bridge over a street or a creek: straight between its ends
        zd = zc[0] + (zc[-1] - zc[0]) * S / max(L, 1e-6) + 0.2
        zd = np.maximum(zd, zc + 0.2)
    else:
        zd = zc + 0.2 + (H - 0.2) * np.clip(ramp, 0, 1)
    g = t['gauge']; hw = g / 2 + 1.4
    Z = np.stack([zd, zd, zd], 1); offs = [-hw, 0.0, hw]
    _band(bank, 'deck', X, Y, NX, NY, Z, offs, -hw, hw, 0.0, DECK)
    for o in (-hw, hw):
        _wall(bank, 'deck', X, Y, NX, NY, Z, offs, o, -1.1, 0.35, DECK)
    for sg in (1, -1):
        oc = sg * (g / 2 + 0.036)
        _band(bank, 'steel', X, Y, NX, NY, Z, offs, oc - 0.05, oc + 0.05, 0.18, RUST)
        for o in (oc - 0.05, oc + 0.05): _wall(bank, 'rust', X, Y, NX, NY, Z, offs, o, 0.0, 0.18, RUST)
    # columns where the deck stands clear of the ground
    for s in np.arange(15.0, L - 5.0, 26.0):
        i = int(np.searchsorted(S, s)); i = min(i, len(X) - 1)
        if zd[i] - zc[i] < 3.0: continue
        _box(bank, 'deck', X[i], Y[i], 0.8, 0.8, zc[i] - 0.3, zd[i] - 1.1, DECK)


def _box(bank, key, x, y, hx, hy, z0, z1, col, ang=0.0):
    c, s = math.cos(ang), math.sin(ang)
    P = [(x + u * c - v * s, y + u * s + v * c) for u, v in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy))]
    V = [(p[0], p[1], z0) for p in P] + [(p[0], p[1], z1) for p in P]
    F = [(4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    bank.quads(key, V, F, col)

def _cyl(bank, key, p0, p1, r, col, n=6):
    p0 = np.asarray(p0, float); p1 = np.asarray(p1, float); d = p1 - p0; L = np.linalg.norm(d)
    if L < 1e-6: return
    d /= L; a = np.array([1.0, 0, 0]) if abs(d[0]) < 0.9 else np.array([0, 1.0, 0])
    s = np.cross(d, a); s /= np.linalg.norm(s); u = np.cross(d, s)
    ang = np.arange(n) * 2 * math.pi / n
    ring = np.cos(ang)[:, None] * s + np.sin(ang)[:, None] * u
    V = np.vstack([p0 + r * ring, p1 + r * ring]); i = np.arange(n)
    bank.quads(key, V, np.stack([i, (i + 1) % n, n + (i + 1) % n, n + i], 1), col)

def _wire(bank, P, r, col):
    """a thin triangular tube along a 3D polyline"""
    P = np.asarray(P, float)
    if len(P) < 2: return
    d = np.gradient(P, axis=0); d /= np.linalg.norm(d, axis=1)[:, None] + 1e-12
    side = np.stack([-d[:, 1], d[:, 0], np.zeros(len(P))], 1); side /= np.linalg.norm(side, axis=1)[:, None] + 1e-12
    up = np.cross(side, d)
    rings = [P + r * (math.cos(a) * side + math.sin(a) * up) for a in (math.pi / 2, math.pi / 2 + 2.094, math.pi / 2 + 4.189)]
    for k in range(3):
        bank.strip('wire', rings[k], rings[(k + 1) % 3], col)


# ── the overhead ─────────────────────────────────────────────────────────────
def _overhead(bank, geo, surf, kd, AS, mode='1'):
    poles = []                      # (x, y) placed, to keep one pole where two tracks would each want one
    def near_pole(x, y, r):
        return any((x - px) ** 2 + (y - py) ** 2 < r * r for px, py in poles[-400:])
    npole = 0
    for G in geo:
        t = G['t']
        if not t['elec'] or t['covered'] or t['cls'] not in ('tram', 'lrv', 'rail'): continue
        if mode == 'rail' and t['cls'] != 'rail': continue
        X, Y, S, NX, NY, zc, ok, onst = G['X'], G['Y'], G['S'], G['NX'], G['NY'], G['zc'], G['ok'], G['onst']
        rail = t['cls'] == 'rail'; g = t['gauge']
        hwire = 6.1 if rail else 5.6
        # the contact wire, over the track, every 4th sample (6 m)
        for i0, i1 in (TG.runs(ok) if mode == '1' else []):
            idx = np.arange(i0, i1, 4)
            if idx[-1] != i1 - 1: idx = np.r_[idx, i1 - 1]
            idx = idx[ok[idx]]
            if len(idx) < 2: continue
            zr = np.array([zc[i] + (BAL_RAIL if (not onst[i] and not t['bridge'] and t['cls'] != 'tram') else EMB_RAIL) for i in idx])
            if t['bridge']: zr = zr + 6.3
            P = np.stack([X[idx], Y[idx], zr + hwire], 1)
            _wire(bank, P, 0.035, C(0.02, 0.02, 0.02))
            if rail:
                _wire(bank, P + np.array([0, 0, 1.1]), 0.03, C(0.02, 0.02, 0.02))     # the messenger
        if t['yard'] or t['bridge']: continue
        sp = 55.0 if rail else 36.0
        for s in np.arange(sp * 0.5 + (t['id'] % 7) * 3.0, S[-1] - 5.0, sp):
            i = int(np.searchsorted(S, s)); i = min(i, len(X) - 1)
            if not ok[i]: continue
            x, y = X[i], Y[i]
            if near_pole(x, y, 14.0 if not rail else 20.0): continue
            zr = zc[i]
            if onst[i] and not rail:
                # a street track: poles at both kerbs, a span wire across
                ends = []
                for sg in (1, -1):
                    o = 1.5; kerb = None
                    while o <= 16.0:
                        if not surf.street(x + NX[i] * sg * o, y + NY[i] * sg * o): kerb = o; break
                        o += 0.75
                    if kerb is None: continue
                    px, py = x + NX[i] * sg * (kerb + 0.35), y + NY[i] * sg * (kerb + 0.35)
                    pz, _ = surf.at(px, py)
                    if pz is None: continue
                    _cyl(bank, 'pole', (px, py, pz - 0.2), (px, py, pz + 8.6), 0.14, POLE_MUNI)
                    ends.append((px, py, pz + 7.0)); poles.append((px, py)); npole += 1
                if len(ends) == 2:
                    _wire(bank, [ends[0], ((ends[0][0] + ends[1][0]) / 2, (ends[0][1] + ends[1][1]) / 2, zr + hwire + 0.35), ends[1]], 0.02, C(0.02, 0.02, 0.02))
                poles.append((x, y))
            else:
                # a private way: a side pole where no other track is, and a cantilever
                for sg in (1, -1):
                    o = g / 2 + (2.4 if rail else 2.0)
                    qx, qy = x + NX[i] * sg * o, y + NY[i] * sg * o
                    if kd.find_range((qx, qy, 0.0), 1.9): continue
                    pz, _ = surf.at(qx, qy)
                    if pz is None: continue
                    top = pz + hwire + (2.2 if rail else 1.3)
                    if rail: _box(bank, 'pole', qx, qy, 0.16, 0.16, pz - 0.2, top, POLE_CALTRAIN, math.atan2(NY[i], NX[i]))
                    else: _cyl(bank, 'pole', (qx, qy, pz - 0.2), (qx, qy, top), 0.12, POLE_MUNI)
                    arm_z = zr + BAL_RAIL + hwire + (1.1 if rail else 0.4)
                    _cyl(bank, 'pole', (qx, qy, arm_z), (x - NX[i] * sg * 0.4, y - NY[i] * sg * 0.4, arm_z), 0.05, POLE_CALTRAIN if rail else POLE_MUNI, n=4)
                    poles.append((qx, qy)); npole += 1
                    break
    return npole


# ── platforms and turntables ─────────────────────────────────────────────────
def _platforms(bank, plats, surf, kd, AS, inb):
    from mathutils import Vector
    from mathutils.geometry import tessellate_polygon
    n = 0
    for p in plats:
        ring = p.get('ring')
        if not ring or not any(inb(x, y, 20) for x, y in ring): continue
        zs = [surf.at(x, y)[0] for x, y in ring]
        if any(z is None for z in zs): continue
        # a platform is by a track: skip the ones the region's tracks don't reach (underground ones mis-tagged)
        cx = sum(x for x, _ in ring) / len(ring); cy = sum(y for _, y in ring) / len(ring)
        if not kd.find_range((cx, cy, 0.0), 12.0): continue
        h = p['h']; top = max(zs) + h; bot = min(zs) - 0.05
        a2 = sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))
        if a2 < 0: ring = ring[::-1]
        V = [(x, y, top) for x, y in ring]
        tris = tessellate_polygon([[Vector(v) for v in V]])
        bank.tris('plat', V, [t for t in tris], PLATFORM)
        m = len(ring)
        W = [(x, y, bot) for x, y in ring] + [(x, y, top) for x, y in ring]
        bank.quads('plat', W, [(i, (i + 1) % m, m + (i + 1) % m, m + i) for i in range(m)], C(0.62, 0.61, 0.58))
        # the yellow edge along a track
        cal = p['net'] == 'caltrain'; wstrip = 0.6 if cal else 0.35
        for i in range(m):
            (x1, y1), (x2, y2) = ring[i], ring[(i + 1) % m]
            L = math.hypot(x2 - x1, y2 - y1)
            if L < 3.0: continue
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            ix, iy = -(y2 - y1) / L, (x2 - x1) / L          # inward (ccw ring)
            if not kd.find_range((mx - ix * 1.9, my - iy * 1.9, 0.0), 1.4): continue
            z = top + 0.012
            bank.quads('plat', [(x1, y1, z), (x2, y2, z), (x2 + ix * wstrip, y2 + iy * wstrip, z), (x1 + ix * wstrip, y1 + iy * wstrip, z)], [(0, 1, 2, 3)], TACTILE)
        n += 1
    return n


def _turntables(bank, tts, surf, geo, inb):
    n = 0
    for tt in tts:
        cx, cy = tt['cx'], tt['cy']
        if not inb(cx, cy, 20): continue
        z, _ = surf.at(cx, cy)
        if z is None: continue
        # OSM draws them ~5.5 m across; a turntable takes a whole 8.3 m car
        r = max(tt['r'], 4.45); zt = z + EMB_LIFT + 0.01
        # the direction of the track that runs onto it
        best = None
        for G in geo:
            if G['t']['cls'] != 'cable': continue
            d2 = (G['X'] - cx) ** 2 + (G['Y'] - cy) ** 2; i = int(np.argmin(d2))
            if d2[i] < 15 ** 2 and (best is None or d2[i] < best[0]):
                best = (d2[i], math.atan2(G['NX'][i], -G['NY'][i]))
        ang = best[1] if best else 0.0
        k = 40; a = np.arange(k) * 2 * math.pi / k
        def ringp(rr, zz): return [(cx + rr * math.cos(q), cy + rr * math.sin(q), zz) for q in a]
        disc = ringp(r, zt)
        bank.tris('wood', [(cx, cy, zt)] + disc, [(0, 1 + i, 1 + (i + 1) % k) for i in range(k)], WOOD)
        outer = ringp(r + 0.3, zt - 0.005)
        V = disc + outer
        bank.quads('dark', V, [(i, (i + 1) % k, k + (i + 1) % k, k + i) for i in range(k)], GROOVE)
        rim = ringp(r - 0.18, zt + 0.012)
        bank.quads('steel', rim + [(x, y, zt + 0.012) for x, y, _ in disc], [(i, (i + 1) % k, k + (i + 1) % k, k + i) for i in range(k)], RUST)
        ca, sa = math.cos(ang), math.sin(ang)
        for sg in (1, -1):
            o = sg * (1.067 / 2 + 0.036)
            px, py = -sa * o, ca * o
            bank.quads('steel', [(cx - ca * r + px - sa * 0.05, cy - sa * r + py + ca * 0.05, zt + 0.024), (cx + ca * r + px - sa * 0.05, cy + sa * r + py + ca * 0.05, zt + 0.024),
                                 (cx + ca * r + px + sa * 0.05, cy + sa * r + py - ca * 0.05, zt + 0.024), (cx - ca * r + px + sa * 0.05, cy - sa * r + py - ca * 0.05, zt + 0.024)], [(0, 1, 2, 3)], RUST)
        tt['_ang'] = ang; tt['_z'] = zt; tt['_r'] = r
        n += 1
    return n


# ── vehicles ─────────────────────────────────────────────────────────────────
def _chains(items):
    """join tracks end to end where exactly two of them meet (a switch or a
    crossing breaks a chain): [(k, reversed)] per chain"""
    def key(p): return (round(p[0], 1), round(p[1], 1))
    ends = {}
    for k, it in enumerate(items):
        ends.setdefault(key(it['pts'][0]), []).append((k, 0)); ends.setdefault(key(it['pts'][-1]), []).append((k, 1))
    used = set(); out = []
    for k in range(len(items)):
        if k in used: continue
        used.add(k); seq = [(k, False)]
        for fwd in (True, False):
            cur, rev = k, False
            while True:
                pts = items[cur]['pts']
                node = key(pts[-1] if (fwd != rev) else pts[0])
                lst = ends.get(node, [])
                if len(lst) != 2: break
                nk, ne = next((e for e in lst if e[0] != cur), (None, None))
                if nk is None or nk in used: break
                nrev = (ne == 1) if fwd else (ne == 0)
                used.add(nk)
                if fwd: seq.append((nk, nrev))
                else: seq.insert(0, (nk, nrev))
                cur, rev = nk, nrev
        out.append(seq)
    return out


def _path(items, seq, step=2.0):
    pts = []; fwd = 0
    for j, (k, rev) in enumerate(seq):
        p = items[k]['pts'][::-1] if rev else items[k]['pts']
        pts.extend(p if j == 0 else p[1:])
        f = items[k].get('fwd')
        if j == 0 and f in ('forward', 'backward'): fwd = (1 if f == 'forward' else -1) * (-1 if rev else 1)
    r = TG.resample(pts, step)
    return (r, fwd) if r is not None else (None, 0)


def _vehicles(bpy, coll, T, D, tracks, surf, inb, log):
    mats = [T['v_paint'], T['v_glass'], T['v_roof'], T['v_dark'], T['v_metal']]
    protos = {}
    def proto(name):
        if name not in protos:
            vb = TC.PROTOS[name]()
            protos[name] = TG.mesh_multi(bpy, f'tv_{name}', vb.V, vb.F, vb.C, vb.MI, mats)
        return protos[name]
    grid = {}             # occupancy points of every placed car (whole network), 5 m cells
    placed_obj = []       # ((name, cx, cy, fx, fy, bx, by, yaw), cls)
    class _P:
        def extend(self, pts):
            for x, y in pts: grid.setdefault((int(x // 5), int(y // 5)), []).append((x, y))
    placed = _P()
    def conflict(pts):
        for x, y in pts:
            gx, gy = int(x // 5), int(y // 5)
            for a in (-1, 0, 1):
                for b in (-1, 0, 1):
                    for px, py in grid.get((gx + a, gy + b), ()):
                        if (x - px) ** 2 + (y - py) ** 2 < 2.3 ** 2: return True
        return False

    def put(path, s0, consist, direction, cls):
        """consist: [(proto, flipped)] from the front; placed from s0 toward -s
        if direction > 0 (it travels +s), else toward +s"""
        X, Y, S = path[0], path[1], path[2]
        cars = []; s = s0; occ = []
        for name, flip in consist:
            L = TC.LENGTH[name]; b = L / 2 - 0.19 * L
            sm = s - direction * L / 2
            sf, sb = sm + direction * b, sm - direction * b
            if min(sf, sb) < 3.0 or max(sf, sb) > S[-1] - 3.0: return False
            fx, fy = np.interp(sf, S, X), np.interp(sf, S, Y); bx, by = np.interp(sb, S, X), np.interp(sb, S, Y)
            yaw = math.atan2(fy - by, fx - bx) + (math.pi if flip else 0.0)
            cx, cy = (fx + bx) / 2, (fy + by) / 2
            # a car on a sharp curve looks wrong as a rigid body: not there
            mx, my = np.interp(sm, S, X), np.interp(sm, S, Y)
            if math.hypot(mx - cx, my - cy) > 0.35: return False
            for u in np.linspace(-L / 2 + 1, L / 2 - 1, max(2, int(L / 2.5))):
                occ.append((cx + u * math.cos(yaw), cy + u * math.sin(yaw)))
            cars.append((name, cx, cy, fx, fy, bx, by, yaw))
            s = s - direction * (L + 0.6)
        if conflict(occ): return False
        placed.extend(occ)
        for c in cars: placed_obj.append((c, cls))
        return True

    items = [t for t in D['tracks'] if t['service'] in ('', 'yard') and not t['covered'] and not t['bridge']
             and t['cls'] in ('cable', 'tram', 'lrv', 'rail')]
    groups = {}
    for t in items:
        kind = t['cls'] + ('_yard' if t['yard'] else '')
        if t['cls'] == 'rail' and t.get('usage') == 'industrial': continue
        groups.setdefault(kind, []).append(t)
    # the turntables first: a cable car on each, and cars queued at Powell & Market
    cab = groups.get('cable', [])
    n_tt = 0
    for tt in D['turntables']:
        # the car on the turntable itself (placed as a one-sample path through the centre)
        ang = tt.get('_ang')
        if ang is None:
            continue
        L = TC.LENGTH['cable']; ca, sa = math.cos(ang), math.sin(ang)
        c = ('cable', tt['cx'], tt['cy'], tt['cx'] + ca * 2.7, tt['cy'] + sa * 2.7, tt['cx'] - ca * 2.7, tt['cy'] - sa * 2.7, ang)
        placed.extend([(tt['cx'] + u * ca, tt['cy'] + u * sa) for u in (-3, 0, 3)]); placed_obj.append((c, 'cable_tt')); n_tt += 1
    rnd = random.Random(1873)
    chains_by = {}
    for kind, its in sorted(groups.items()):
        seqs = _chains(its)
        paths = []
        for seq in seqs:
            (r, fwd) = _path(its, seq)
            if r is None: continue
            paths.append((min(its[k]['id'] for k, _ in seq), r, fwd, [its[k] for k, _ in seq]))
        paths.sort(key=lambda p: p[0])
        chains_by[kind] = paths
    # cable cars queued on the Powell St tracks north of the Powell & Market turntable
    for tt in D['turntables']:
        if tt.get('_ang') is None: continue
        # one track of the two waits (the one leaving the turntable); the first found
        for cid, r, fwd, its in chains_by.get('cable', []):
            X, Y, S = r[0], r[1], r[2]
            d0 = math.hypot(X[0] - tt['cx'], Y[0] - tt['cy']); d1 = math.hypot(X[-1] - tt['cx'], Y[-1] - tt['cy'])
            if min(d0, d1) > 14.0: continue
            nq = 2 if tt['id'] == 197974389 else 1
            for q in range(nq):
                if d0 <= d1: put(r, 6.0 + 10.0 * q + 8.3, [('cable', False)], 1, 'cable')
                else: put(r, S[-1] - 6.0 - 10.0 * q - 8.3, [('cable', False)], -1, 'cable')
            break
    # A WEEKDAY AT 5 PM. Muni's published peak headways and the speeds the cars
    # make with their stops give the spacing along each track (one direction):
    # cable cars ~every 7 min per line at ~8 km/h (both Powell lines share the
    # trunk), the F ~every 12 min at ~11 km/h, Muni Metro ~every 8 min at
    # ~13 km/h on the surface (N Judah in two-car trains), Caltrain ~every
    # 20 min per direction (most of them stand at 4th & King).
    SPACING = {'cable': 700.0, 'tram': 1600.0, 'lrv': 1600.0, 'rail': 4200.0}
    for kind in ('cable', 'tram', 'lrv', 'rail'):
        for cid, r, fwd, its in chains_by.get(kind, []):
            X, Y, S = r[0], r[1], r[2]
            rr = random.Random(cid)
            s = rr.uniform(0.25, 1.0) * SPACING[kind]
            routes = set(x for t in its for x in t.get('routes', []))
            while s < S[-1] - 20:
                direction = fwd if fwd else (1 if rr.random() < 0.5 else -1)
                if kind == 'cable':
                    consist = [('cable_cal' if any(x.endswith(':C') for x in routes) else 'cable', False)]
                elif kind == 'tram':
                    consist = [('pw' if rr.random() < 0.22 else f'pcc{rr.randrange(len(TC.PCC_LIVERIES))}', False)]
                elif kind == 'lrv':
                    consist = [('lrv4', False)] * (2 if rr.random() < 0.6 else 1)
                else:
                    consist = [('kiss_cab', False), ('kiss_mid', False), ('kiss_panto', False), ('kiss_mid', False),
                               ('kiss_panto', False), ('kiss_mid', False), ('kiss_cab', True)]
                ss = s if direction > 0 else s   # the head at s
                for tries in range(4):
                    if put(r, ss, consist, direction, kind): break
                    ss += 9.0
                s += SPACING[kind] * rr.uniform(0.6, 1.4)
    # yards: LRVs parked in rows (Muni Metro East, Green Division)
    for cid, r, fwd, its in chains_by.get('lrv_yard', []):
        X, Y, S = r[0], r[1], r[2]; rr = random.Random(cid)
        s = 14.0
        while s < S[-1] - 14.0:
            # at the evening peak most of the fleet is out: a third of the berths taken
            if rr.random() < 0.36: put(r, s + 23.2, [('lrv4', False)], 1, 'lrv_yard')
            s += 23.5
    # Caltrain at 4th & King: a set at most of the platforms, a few more on the yard's tracks
    cal = [p for p in D['platforms'] if p['net'] == 'caltrain' and p.get('ring')]
    ngal = [0]
    for cid, r, fwd, its in chains_by.get('rail_yard', []) + chains_by.get('rail', []):
        X, Y, S = r[0], r[1], r[2]; rr = random.Random(cid + 7)
        if S[-1] < 120: continue
        # the stretch of this track beside a Caltrain platform
        best = None
        for p in cal:
            ring = np.asarray(p['ring']); cx, cy = ring[:, 0].mean(), ring[:, 1].mean()
            d2 = (X - cx) ** 2 + (Y - cy) ** 2; i = int(np.argmin(d2))
            if d2[i] < 12.0 ** 2 and (best is None or d2[i] < best[0]): best = (d2[i], i, ring)
        yard = any(t['yard'] for t in its)
        if best is None and not yard: continue
        if rr.random() > (0.8 if best is not None else 0.3): continue
        # the diesel gallery sets kept after electrification (2024): one at most
        gal = not ngal[0] and rr.random() < 0.3
        ngal[0] += gal
        ncar = 5 if gal else 7
        consist = ([('loco', False)] + [('gal', False)] * (ncar - 2) + [('gal_cab', True)]) if gal else \
                  [('kiss_cab', False), ('kiss_mid', False), ('kiss_panto', False), ('kiss_mid', False), ('kiss_panto', False), ('kiss_mid', False), ('kiss_cab', True)]
        tot = sum(TC.LENGTH[c] + 0.6 for c, _ in consist)
        if best is not None:
            i = best[1]; head = min(S[-1] - 4.0, S[i] + tot / 2)
        else:
            head = min(S[-1] - 4.0, rr.uniform(tot + 5, max(tot + 6, S[-1])))
        put(r, head, consist, 1, 'rail_yard')
    _vehicles.last = placed_obj
    # into the scene: the ones in the region
    n = 0
    vcol = bpy.data.collections.new('transit_vehicles'); coll.children.link(vcol)
    for (name, cx, cy, fx, fy, bx, by, yaw), cls in placed_obj:
        if not inb(cx, cy, 60): continue
        zf, sf = surf.at(fx, fy); zb, sb = surf.at(bx, by); zc_, sc_ = surf.at(cx, cy)
        if zf is None or zb is None or zc_ is None: continue
        emb = cls in ('cable', 'cable_tt', 'tram') or (cls in ('lrv',) and sc_)
        lift = EMB_RAIL if emb else BAL_RAIL
        if cls == 'cable_tt': lift = EMB_LIFT + 0.03
        hz = math.hypot(fx - bx, fy - by)
        pitch = math.atan2(zf - zb, hz) if hz > 0.1 else 0.0
        if cls == 'cable_tt': pitch = 0.0
        ob = bpy.data.objects.new(f'tv.{name}.{n}', proto(name))
        ob.location = (cx, cy, (zf + zb) / 2 + lift if cls != 'cable_tt' else zc_ + lift)
        ob.rotation_euler = (0.0, -pitch, yaw)
        vcol.objects.link(ob); n += 1
    log(f'transit_hq: vehicles placed on the network {len(placed_obj)} (turntables {n_tt}), in the region {n}')
    return n
