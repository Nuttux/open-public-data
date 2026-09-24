"""San Francisco's landmarks and public spaces, modelled by hand, for the
path-traced render (hq_scene.py districts, hq_city.py the whole city).

Both scripts call, once the scene stands and before camera and light:
    landmarks_hq.build(bpy, scene, mats, ground, box, scene_json, log, era)
build() adds each landmark whose extent meets `box` (padded: a tower or a
bridge is seen from far), standing in `era` (a year, None = today), and
removes the engine's crude stand-in for it (the 'landmarks' object) whether
or not the landmark stands in that year. It never raises: every landmark is
built in its own try, and a failure is logged and skipped.

THE GROUND. terrain_hq.correct_scene(d, ...) puts the scene on the true
ground (3DEP) — see terrain_hq.py for the engine's north-south squeeze it
undoes. When it has run, the scene carries d['_terrain_hq'] and landmarks
stand on the true ground; otherwise they stand on the scene's own ground().

Every landmark's dates are in LANDMARKS (built, gone) for the history pass.
Sources per landmark in its module (lm_bridges.py, lm_civic.py): published
dimensions (owners, HAER/HABS drawings at the Library of Congress,
Wikipedia), OpenStreetMap footprints and building parts (ODbL,
(c) OpenStreetMap contributors), USGS 3DEP. No Google data of any kind.
"""
import math, os, sys, time, traceback
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)

import numpy as np
import lm_kit
from lm_kit import Frame

# landmarks validated on a test frame through the GPU queue; the rest are
# built only when LM_ALL=1 (the landmarks agent's tests), so a city pass never
# gets a model nobody has looked at. A disabled landmark leaves the engine's
# stand-in (and the generator's building) in place.
ENABLED = {'salesforce', 'transit_center', 'transamerica', 'ferry', 'goldengate', 'baybridge', 'cityhall', 'pofa', 'pofa_colonnade', 'coit', 'chase', 'stmarys', 'deyoung', 'calacademy', 'conservatory', 'alcatraz', 'sutro', 'oracle', 'pier39', 'leftyodoul', 'fourthst', 'grace', 'legion', 'fremont181', 'fortpoint', 'lombard', 'sas', 'dolores', 'pofahall', 'maritime', 'ghirardelli', 'hydeships', 'wharf', 'embarcadero'}
WATER_ENABLED = {'lakes', 'piers'}   # + 'sea_depth', 'sea_wind' once validated

class Region:
    """where the engine's crude stand-in is cleared: a polygon, or a
    rectangle in a Frame (u0..u1, v0..v1)"""
    def __init__(self, ring=None, frame=None, uv=None):
        self.ring, self.frame, self.uv = ring, frame, uv
    def inside(self, X, Y):
        if self.frame is not None:
            dx, dy = X - self.frame.x, Y - self.frame.y
            u = dx * self.frame.cu + dy * self.frame.su; v = -dx * self.frame.su + dy * self.frame.cu
            u0, u1, v0, v1 = self.uv
            return (u >= u0) & (u <= u1) & (v >= v0) & (v <= v1)
        r = self.ring; inside = np.zeros(X.shape, bool)
        n = len(r)
        for i in range(n):
            (x1, y1), (x2, y2) = r[i], r[(i + 1) % n]
            c = ((y1 > Y) != (y2 > Y)) & (X < (x2 - x1) * (Y - y1) / ((y2 - y1) or 1e-12) + x1)
            inside ^= c
        return inside
    def bbox(self):
        if self.frame is not None:
            u0, u1, v0, v1 = self.uv
            pts = [self.frame.P(u, v)[:2] for u in (u0, u1) for v in (v0, v1)]
        else: pts = self.ring
        return (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))

class Landmark:
    def __init__(self, key, name, built, gone, builder, regions, pad=300.0, note='', replaces=False, streets=False, notree=None):
        self.key, self.name, self.built, self.gone, self.replaces = key, name, built, gone, replaces
        self.notree = notree or []  # where the scene's trees (and parked cars) give way: courts, lawns, terraces
        self.streets = streets      # a bridge: the engine's streets draped into the water under it go too
        self.builder, self.regions, self.pad, self.note = builder, regions, pad, note
    def bbox(self):
        bs = [r.bbox() for r in self.regions]
        return (min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs))
    def stands(self, era):
        # construction stages are the builder's business: it gets the year
        if era is None: return self.gone is None
        return (self.gone is None or era < self.gone)
    def complete(self, era):
        """built (opened) by `era` and not yet gone — when it replaces the
        generator's buildings on its site"""
        return self.stands(era) and (era is None or era >= self.built)

def _registry():
    import lm_bridges as B, lm_civic as V, lm_places as P
    gg = Frame(B.GG_S[0], B.GG_S[1], B.GG_ANG)
    bay = Frame(B.BAY_W2[0], B.BAY_W2[1], B.BAY_ANG - math.pi / 2)
    def ol(key, grow=0.0):
        rs = V.outer(key)
        if not rs: return []
        out = []
        for r in rs:
            if grow:
                cx, cy = V.centroid(r)
                r = [(cx + (x - cx) * (1 + grow), cy + (y - cy) * (1 + grow)) for x, y in r]
            out.append(Region(ring=r))
        return out
    def circ(c, r, n=16): return [(c[0] + r * math.cos(6.2832 * k / n), c[1] + r * math.sin(6.2832 * k / n)) for k in range(n)]
    def ds(key, gid):
        f = V.FP().get(key) or {}
        return [Region(ring=[tuple(p) for p in d['ring']]) for d in f.get('datasf', []) if d['gid'] == gid]
    L = [
        # key, name, built (opened), demolished, builder, clear regions
        Landmark('goldengate', 'Golden Gate Bridge', 1937, None, B.golden_gate,
                 [Region(frame=gg, uv=(-70, 70, -920, B.GG_L + 560))], pad=2500.0,
                 note='construction 1933 (piers, anchorages), towers 1935, cables 1936, opened 27 May 1937'),
        Landmark('baybridge', 'San Francisco-Oakland Bay Bridge (west spans)', 1936, None, B.bay_bridge,
                 [Region(frame=bay, uv=(-60, 60, -800, 2900))], pad=2500.0,
                 note='construction 1933-36, opened 12 Nov 1936; the east span: cantilever 1936-2013, self-anchored suspension from Sep 2013'),
        Landmark('sas', 'Bay Bridge east span (self-anchored suspension)', 2013, None, B.sas,
                 [Region(ring=[(6420, 5580), (7500, 6300), (7400, 6500), (6380, 5680)])], pad=2500.0,
                 note='opened 2 Sept 2013; the 1936 cantilever east span it replaced was taken down 2013-17'),
        Landmark('salesforce', 'Salesforce Tower', 2018, None, V.salesforce, ol('salesforce'), pad=3000.0,
                 note='topped out 2017, opened 2018; absent from the DataSF footprints the city is built from'),
        Landmark('fremont181', '181 Fremont', 2018, None, V.fremont181, [Region(ring=V.FREMONT181_RING)], pad=3000.0,
                 note='topped out 2017, opened 2018; not in DataSF (OSM way 445566153)'),
        Landmark('transit_center', 'Salesforce Transit Center and Park', 2018, None, V.transit_center, ol('transit_center'), pad=600.0,
                 note='opened Aug 2018 (closed for repairs to Jul 2019); the old Transbay Terminal stood 1939-2010', replaces=True),
        Landmark('transamerica', 'Transamerica Pyramid', 1972, None, V.transamerica, ol('transamerica', 0.08), pad=2500.0,
                 note='built 1969-72'),
        Landmark('coit', 'Coit Tower', 1933, None, V.coit, ol('coit', 0.15), pad=1500.0, note='dedicated Oct 1933'),
        Landmark('ferry', 'Ferry Building', 1898, None, V.ferry, ol('ferry', 0.06), pad=1200.0,
                 note='opened July 1898; the Embarcadero Freeway stood in front of it 1959-1991'),
        Landmark('cityhall', 'San Francisco City Hall', 1915, None, V.cityhall, ol('cityhall', 0.05), pad=1500.0,
                 note='built 1913-15 after the 1906 City Hall fell; the old City Hall (1872-1906) stood on the Civic Center site'),
        Landmark('sutro', 'Sutro Tower', 1973, None, V.sutro, [Region(ring=[(V.SUTRO_C[0] + 42 * math.cos(a / 12 * 6.283), V.SUTRO_C[1] + 42 * math.sin(a / 12 * 6.283)) for a in range(12)])],
                 pad=4000.0, note='built 1971-73, in service July 1973', replaces=True),
        Landmark('alcatraz', 'Alcatraz', 1859, None, V.alcatraz, ol('alcatraz'), pad=1500.0,
                 note='military fortress 1859, military prison 1907-33 (cellhouse 1912), federal penitentiary 1934-63, lighthouse 1909 (first 1854), water tower 1940; warden\'s house burned 1970'),
        Landmark('grace', 'Grace Cathedral', 1964, None, P.grace, ds('grace', 139401), pad=1200.0,
                 note='begun 1928, consecrated 1964 (the nave finished 1964; the towers 1941)', replaces=True),
        Landmark('stmarys', "St. Mary's Cathedral", 1971, None, V.stmarys, ds('stmarys', 149499), pad=1200.0,
                 note='1967-71, after the old cathedral on Van Ness burned in 1962', replaces=True),
        Landmark('conservatory', 'Conservatory of Flowers', 1879, None, V.conservatory, ol('conservatory', 0.08), pad=800.0,
                 note='built 1878, opened 1879'),
        Landmark('deyoung', 'de Young Museum', 2005, None, V.deyoung, ds('deyoung', 32875), pad=800.0,
                 note='opened Oct 2005; the earlier de Young (1895 Midwinter Fair, rebuilt 1919-25) stood here until 2002', replaces=True),
        Landmark('legion', 'Legion of Honor', 1924, None, P.legion, [Region(ring=r_) for r_ in P.rings('legion', ('ring',))] or ol('legion', 0.03), pad=800.0, note='opened Nov 1924',
                 replaces=True, notree=[Region(ring=r_) for r_ in P.rings('legion', ('notree',))]),
        Landmark('oracle', 'Oracle Park', 2000, None, P.oracle, ds('oracle', 143280), pad=1000.0,
                 note='opened April 2000 as Pacific Bell Park', replaces=True),
        Landmark('pier39', 'Pier 39', 1978, None, P.pier39, [Region(ring=P.ring('pier39'))] if P.ring('pier39') else [], pad=800.0,
                 note='opened Oct 1978 on the old cargo pier; the timber village of Buildings A-Q, the Aquarium of the Bay (1996)', replaces=True),
        Landmark('leftyodoul', "Lefty O'Doul Bridge", 1933, None, P.leftyodoul, [Region(ring=r_) for r_ in P.rings('leftyodoul')], pad=600.0,
                 note='Third Street Bridge, Strauss bascule, opened 1933; renamed for Lefty O\'Doul in 1980', replaces=True, streets=True),
        Landmark('fourthst', '4th Street Bridge', 1917, None, P.fourthst, [Region(ring=r_) for r_ in P.rings('fourthst')], pad=600.0,
                 note='Strauss bascule, opened 1917; named for Peter R. Maloney in 2006', replaces=True, streets=True),
        Landmark('chase', 'Chase Center', 2019, None, V.chase, ol('chase', 0.02), pad=800.0, note='opened Sept 2019'),
        Landmark('dutchmill', 'Dutch Windmill', 1903, None, V.dutchmill, [Region(ring=circ(V.WINDMILLS['dutchmill'][:2], 14))], pad=800.0,
                 note='built 1902-03, restored 1981; the sails turned until the 1930s'),
        Landmark('murphymill', 'Murphy Windmill', 1908, None, V.murphymill, [Region(ring=circ(V.WINDMILLS['murphymill'][:2], 16))], pad=800.0,
                 note='built 1905-08, sails restored 2011-12'),
        Landmark('davidson', 'Mount Davidson cross', 1934, None, V.davidson_cross, [Region(ring=circ(V.DAVIDSON, 10))], pad=1500.0,
                 note='dedicated Easter 1934 (earlier wooden crosses from 1923)'),
        Landmark('fortpoint', 'Fort Point', 1861, None, V.fortpoint, ol('fortpoint', 0.02), pad=800.0,
                 note='built 1853-61; lighthouse on top 1864-1934', replaces=True),
        Landmark('dewey', 'Dewey Monument, Union Square', 1903, None, V.dewey, [Region(ring=circ(V.DEWEY, 5))], pad=700.0,
                 note='dedicated 1903 (Union Square rebuilt over its garage 1942 and 2002)'),
        Landmark('tea_pagoda', 'Japanese Tea Garden pagoda', 1915, None, V.tea_pagoda, [Region(ring=circ(V.PAGODA, 6))], pad=500.0,
                 note='built for the 1915 PPIE, moved to the garden'),
        Landmark('calacademy', 'California Academy of Sciences', 2008, None, V.calacademy, ds('calacademy', 32880), pad=800.0,
                 note='opened Sept 2008; the old Academy buildings (1916-2004) stood on the site', replaces=True),
        Landmark('lombard', 'Lombard Street (crooked block)', 1922, None, V.lombard, ol('lombard'), pad=600.0,
                 note='the switchbacks built 1922; brick-paved'),
        Landmark('pofa', 'Palace of Fine Arts rotunda', 1915, None, V.pofa, ol('pofa', 0.05), pad=1000.0,
                 note='1915 Panama-Pacific Exposition; demolished and recast in concrete 1964-67 (the history pass may hide it 1964-66)'),
        Landmark('pofa_colonnade', 'Palace of Fine Arts colonnades', 1915, None, V.pofa_colonnade, ol('pofa_colonnade', 0.02), pad=800.0,
                 note='as the rotunda', replaces=True),
    ]
    # the places families (lm_places.auto_places): a sidecar-registered model, or a
    # new model for a landmark above (it then takes over the builder and the regions)
    have = {l.key: l for l in L}
    for key, j in P.auto_places():
        regs = [Region(ring=[tuple(q) for q in r]) for r in j.get('clear', []) if len(r) >= 3]
        nt = [Region(ring=[tuple(q) for q in r]) for r in j.get('notree', []) if len(r) >= 3]
        if key in have:
            l = have[key]; l.builder = P.auto_builder(key, j); l.regions = regs or l.regions; l.notree = nt or l.notree; l.replaces = True
        else:
            L.append(Landmark(key, j['name'], j['built'], j.get('gone'), P.auto_builder(key, j), regs, pad=j.get('pad', 800.0),
                              note=j.get('note', ''), replaces=True, streets=j.get('streets', False), notree=nt))
    every = os.environ.get('LM_ALL') == '1'
    return [l for l in L if l.regions and (every or l.key in ENABLED or l.key in _extra())]

def _extra():
    # LM_KEYS=a,b: build these too (the landmarks agent's A/B tests, one model at a time)
    return {k for k in os.environ.get('LM_KEYS', '').split(',') if k}
class Ctx:
    pass

STREET_OBJS = ('streets', 'markings', 'paths')
def _clear_points(bpy, sc, regions, names=('trees', 'cars')):
    """delete the instancer points (a tree, a parked car) standing in any region"""
    import bmesh
    n = 0
    for nm in names:
        ob = sc.objects.get(nm)
        if ob is None or ob.type != 'MESH' or not len(ob.data.vertices): continue
        me = ob.data; co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
        X, Y = co[:, 0], co[:, 1]; kill = np.zeros(len(co), bool)
        for r in regions:
            b = r.bbox(); pre = (X >= b[0]) & (X <= b[2]) & (Y >= b[1]) & (Y <= b[3])
            if pre.any(): idx = np.nonzero(pre)[0]; kill[idx] |= r.inside(X[idx], Y[idx])
        if not kill.any(): continue
        bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(kill)[0]], context='VERTS')
        bm.to_mesh(me); bm.free(); me.update(); n += int(kill.sum())
    return n
def _clear(bpy, sc, regions, log, names=None):
    """delete the engine stand-in's faces (or, with `names`, those objects')
    whose centre is in any region"""
    import bmesh
    n = 0
    for ob in list(sc.collection.all_objects):
        if names is not None:
            if ob.type != 'MESH' or ob.name.split('.')[0] not in names: continue
        elif ob.type != 'MESH' or not (ob.name == 'landmarks' or ob.name.startswith('landmarks.')): continue
        me = ob.data
        if not len(me.polygons): continue
        cen = np.empty(len(me.polygons) * 3, np.float32); me.polygons.foreach_get('center', cen); cen = cen.reshape(-1, 3)
        mw = ob.matrix_world
        X = cen[:, 0] + mw.translation.x; Y = cen[:, 1] + mw.translation.y
        kill = np.zeros(len(cen), bool)
        for r in regions:
            b = r.bbox()
            pre = (X >= b[0]) & (X <= b[2]) & (Y >= b[1]) & (Y <= b[3])
            if pre.any(): kill[pre] |= r.inside(X[pre], Y[pre])
        if not kill.any(): continue
        bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.faces[i] for i in np.nonzero(kill)[0]], context='FACES')
        bm.to_mesh(me); bm.free(); me.update(); n += int(kill.sum())
    return n

def _hidden(bpy):
    m = bpy.data.materials.get('lm_hidden')
    if m is None:
        m = bpy.data.materials.new('lm_hidden'); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
        o = nt.nodes.new('ShaderNodeOutputMaterial'); t = nt.nodes.new('ShaderNodeBsdfTransparent')
        nt.links.new(t.outputs[0], o.inputs[0])
    return m

def _clear_generated(bpy, sc, regions):
    """the building generator's (and the engine massing's) faces under a
    landmark that replaces DataSF footprints — a fallback until the
    orchestrator skips skip_gids.json. The faces are not deleted (a bmesh of
    a city chunk costs memory): they get an extra, fully transparent
    material slot"""
    import re
    n = 0
    for ob in list(sc.collection.all_objects):
        if ob.type != 'MESH' or not (ob.name.startswith('gen.') or re.match(r'^b\d+\.', ob.name) or ob.name == 'far'): continue
        me = ob.data
        np_ = len(me.polygons)
        if not np_: continue
        cen = np.empty(np_ * 3, np.float32); me.polygons.foreach_get('center', cen); cen = cen.reshape(-1, 3)
        X, Y = cen[:, 0], cen[:, 1]; kill = np.zeros(np_, bool)
        for r in regions:
            b = r.bbox(); pre = (X >= b[0]) & (X <= b[2]) & (Y >= b[1]) & (Y <= b[3])
            if pre.any():
                idx = np.nonzero(pre)[0]; kill[idx] |= r.inside(X[idx], Y[idx])
        if not kill.any(): continue
        hm = _hidden(bpy)
        slot = list(me.materials).index(hm) if hm.name in [m_.name for m_ in me.materials if m_] else None
        if slot is None: me.materials.append(hm); slot = len(me.materials) - 1
        mi = np.empty(np_, np.int32); me.polygons.foreach_get('material_index', mi)
        mi[kill] = slot; me.polygons.foreach_set('material_index', mi); me.update()
        n += int(kill.sum())
    return n

def _plant(C):
    """trees the landmarks ask for (C.trees: x, y, z, crown width), from the
    scanned trees the scene has already loaded"""
    if not C.trees: return 0
    bpy = C.bpy
    colls = [c for c in bpy.data.collections if c.name.endswith('LOD0') and len(c.all_objects)]
    if not colls: return 0
    dims = []
    for c in colls:
        w = max([max(o.dimensions.x, o.dimensions.y) for o in c.all_objects if o.type == 'MESH'] or [5.0])
        dims.append(max(0.5, w))
    root = bpy.data.collections.new('lm_trees'); C.sc.collection.children.link(root)
    rnd = np.random.default_rng(11)
    for i, (x, y, z, crown) in enumerate(C.trees):
        k = int(rnd.integers(len(colls)))
        o = bpy.data.objects.new(f'lmtree{i}', None); o.instance_type = 'COLLECTION'; o.instance_collection = colls[k]
        s = crown / dims[k]; o.location = (x, y, z - 0.1); o.scale = (s, s, s); o.rotation_euler.z = float(rnd.uniform(0, 6.283))
        root.objects.link(o)
    return len(C.trees)

def build(bpy, scene, mats, ground, box, scene_json, log=print, era=None):
    t0 = time.time()
    try:
        _build(bpy, scene, mats, ground, box, scene_json, log, era, t0)
    except Exception as ex:
        traceback.print_exc(); log('landmarks_hq: FAILED, scene left as it was:', ex)

def _build(bpy, sc, mats, ground, box, d, log, era, t0):
    lm_kit.materials(bpy, mats)
    try:
        import lm_places; lm_places.materials(bpy, mats)
    except Exception as ex:
        traceback.print_exc(); log('landmarks_hq: places materials failed', ex)
    C = Ctx(); C.bpy, C.sc, C.mats, C.ground, C.box, C.era, C.log, C.d = bpy, sc, mats, ground, box, era, log, d
    C.K = lm_kit.Kit(); C.no_bents = []; C.trees = []
    true = bool(d.get('_terrain_hq')) if isinstance(d, dict) else False
    if true:
        import terrain_hq
        C.tg = lambda x, y: float(terrain_hq.true_ground(np.array([x]), np.array([y]))[0])
    else:
        C.tg = lambda x, y: float(ground(x, y) or 0.0)
    # the top of the street surface (Lombard's switchbacks lie on it)
    C.street_z = C.tg
    try:
        from mathutils import Vector
        from mathutils.bvhtree import BVHTree
        so = sc.objects.get('streets')
        if so is not None and len(so.data.polygons):
            _sb = BVHTree.FromObject(so, bpy.context.evaluated_depsgraph_get())
            def _sz(x, y, _sb=_sb):
                h = _sb.ray_cast(Vector((x, y, 3000.0)), Vector((0, 0, -1)))
                return h[0].z if h[0] is not None else C.tg(x, y)
            C.street_z = _sz
    except Exception as ex:
        log('landmarks_hq: no street surface', ex)
    try: L = _registry()
    except Exception as ex:
        traceback.print_exc(); log('landmarks_hq: registry failed', ex); return
    bx0, by0, bx1, by1 = box
    todo, clear, gen = [], [], []
    for lm in L:
        a = lm.bbox()
        if a[2] < bx0 - lm.pad or a[0] > bx1 + lm.pad or a[3] < by0 - lm.pad or a[1] > by1 + lm.pad: continue
        clear += lm.regions
        if lm.stands(era):
            todo.append(lm)
            # the generator's buildings under it go only once the landmark is
            # built: in 1960 the Transbay Terminal's site keeps its buildings
            if lm.replaces and lm.complete(era): gen += lm.regions
    try:
        nc = _clear(bpy, sc, clear, log)
        if nc: log(f'landmarks_hq: cleared {nc} faces of the engine stand-ins')
    except Exception as ex:
        traceback.print_exc(); log('landmarks_hq: clearing failed', ex)
    try:
        tr = [r for lm in todo if lm.complete(era) for r in lm.notree]
        nt_ = _clear_points(bpy, sc, tr) if tr else 0
        if nt_: log(f'landmarks_hq: {nt_} trees / parked cars cleared from modelled places')
    except Exception as ex:
        traceback.print_exc(); log('landmarks_hq: clearing trees failed', ex)
    try:
        sr = [r for lm in todo if lm.streets and lm.complete(era) for r in lm.regions]
        ns = _clear(bpy, sc, sr, log, names=STREET_OBJS) if sr else 0
        if ns: log(f'landmarks_hq: cleared {ns} street faces under modelled bridges')
    except Exception as ex:
        traceback.print_exc(); log('landmarks_hq: clearing streets failed', ex)
    try:
        ng = _clear_generated(bpy, sc, gen) if gen else 0
        if ng: log(f'landmarks_hq: cleared {ng} generated faces under replaced footprints')
    except Exception as ex:
        traceback.print_exc(); log('landmarks_hq: clearing generated failed', ex)
    C.lm_regions = gen          # the sites modelled places take over (water_hq: no pier apron there)
    done = []
    for lm in todo:
        nf = C.K.nf
        try:
            if lm.key == 'goldengate': C.no_bents = [(-452.0, -345.0)]
            lm.builder(C); done.append(f'{lm.key}({C.K.nf - nf})')
        except Exception as ex:
            traceback.print_exc(); log(f'landmarks_hq: {lm.key} failed: {ex}')
    every = os.environ.get('LM_ALL') == '1'
    WATER_ENABLED_ = WATER_ENABLED | _extra()
    try:
        import water_hq
        mats['lm_lake'] = water_hq._mat(bpy)
        if every or 'lakes' in WATER_ENABLED_:
            nl = water_hq.lakes(C); log(f'landmarks_hq: {nl} lakes and ponds')
        if every or 'piers' in WATER_ENABLED_:
            npr = water_hq.piers(C); log(f'landmarks_hq: {npr} pier decks and docks')
        if every or 'sea_depth' in WATER_ENABLED_:
            if water_hq.sea_depth(C): log('landmarks_hq: sea coloured by depth')
        if every or 'sea_wind' in WATER_ENABLED_:
            if water_hq.sea_wind(C): log('landmarks_hq: wind lanes on the sea')
    except Exception as ex:
        traceback.print_exc(); log('landmarks_hq: water failed', ex)
    objs = C.K.emit(bpy, sc, mats, name='lm')
    try: nt = _plant(C)
    except Exception as ex:
        traceback.print_exc(); log('landmarks_hq: trees failed', ex); nt = 0
    if nt: log(f'landmarks_hq: {nt} trees')
    log(f'landmarks_hq: {", ".join(done) or "none"} — {len(objs)} meshes, {time.time() - t0:.1f}s')
