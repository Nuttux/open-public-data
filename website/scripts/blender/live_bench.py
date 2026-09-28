"""THE LIVE-ASSET BENCH (27/09, live assets agent): the city's moving and parked
life (buses, trucks, vans, rail cars, cars, boats, the past eras' horses and
wagons) laid out in rows on asphalt / water under the city's own world, sun
and camera (hq_scene's light slice), orthographic at MPP m/px (0.094 = z9
native). Run the SAME script from two checkouts (before / after) and put the
two PNGs side by side: the slots are fixed, so a model missing on one side
leaves its slot empty. Cloud only (BAR 25/09):
  env CYCLES_DEVICE=OPTIX MPP=0.094 PART=road blender -b -P live_bench.py -- out.png [spp] [W] [H]
PART: road (buses, trucks, trams, cable cars) · rail (Caltrain) · cars · boats · ships · era
YAW: the vehicles' heading in degrees (0 = side on, the camera looks north).
"""
import bpy, math, os, sys, time
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import look_preset  # noqa: F401  (the look as env defaults)
argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]; SPP = int(argv[1]) if len(argv) > 1 else 64
W = int(argv[2]) if len(argv) > 2 else 2400; H = int(argv[3]) if len(argv) > 3 else 560
E = os.environ.get; T0 = time.time(); ERA = int(E('ERA')) if E('ERA') else None
PART = E('PART', 'road'); YAW = math.radians(float(E('YAW', 0)))
def log(*a): print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
_HQ = open(os.path.join(HERE, 'hq_scene.py')).read()
exec(_HQ[_HQ.index("def simple("):_HQ.index("def sky_term(")])


def hexl(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def flat(name, rgb, x0, y0, x1, y1, z=0.0, rough=0.8):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = (*rgb, 1); p.inputs['Roughness'].default_value = rough
    me = bpy.data.meshes.new(name); me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [(0, 1, 2, 3)]); me.materials.append(m)
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)


import transit_geom as TG
MPP = float(E('MPP', 0.094)); WM, HM = W * MPP, H * MPP / 0.5107       # ground metres across / deep (29 deg: y foreshortened)
X0 = -WM / 2 + 3.0
if PART in ('boats', 'ships'):
    flat('water', (0.012, 0.03, 0.035), -WM, -40, WM, HM + 40, rough=0.08)
else:
    flat('asphalt', hexl('#4a4a4c'), -WM, -40, WM, HM + 40, rough=0.85)
    for k in range(12):   # lane lines every 7 m of depth: a scale reference
        flat(f'line{k}', hexl('#d8d8d0'), -WM, 3.2 + k * 7.0, WM, 3.32 + k * 7.0, z=0.005)


def mats_life():
    import life_hq as LH
    T = LH._mats(bpy, None); return T, [T['paint'], T['glass'], T['matte'], T['matte'], T['metal']]


def mats_transit():
    import transit_hq as TH
    T = TH._mats(bpy, {}); return T, [T['v_paint'], T['v_glass'], T['v_roof'], T['v_dark'], T['v_metal']]


def place(me, x, y, yaw=YAW, z=0.0):
    o = bpy.data.objects.new(me.name, me); sc.collection.objects.link(o)
    o.location = (x, y, z); o.rotation_euler.z = yaw; return o


def row(items, y, gap=3.0, yaw=YAW):
    """items: (key, length, builder|None, mats); fixed slots from the left"""
    x = X0
    for key, L, b, mats in items:
        ext = abs(math.cos(yaw)) * L + abs(math.sin(yaw)) * 3.0
        if b is not None:
            try:
                vb = b(); me = TG.mesh_multi(bpy, f'b_{key}', vb.V, vb.F, vb.C, vb.MI, mats); place(me, x + ext / 2, y, yaw)
            except Exception as ex: log('failed', key, ex)
        else: log('missing', key)
        x += ext + gap


def reg(mod, key):
    return getattr(mod, 'PROTOS', {}).get(key)


if PART == 'road':
    import life_vehicles as LV, transit_cars as TC
    _, ML = mats_life(); _, MT = mats_transit()
    L_ = lambda m, k, d: (k, getattr(m, 'LENGTH', {}).get(k, d), reg(m, k), ML if m is LV else MT)
    row([L_(LV, 'bus40', 12.5), L_(LV, 'bus60', 18.3), L_(LV, 'trol40', 12.5), L_(LV, 'trol60', 18.3), L_(LV, 'bat40', 12.5),
         L_(LV, 'parcel', 7.2), L_(LV, 'box0', 8.3), L_(LV, 'box1', 8.3), L_(LV, 'van0', 5.9), L_(LV, 'van3', 5.9)], 6.0)
    row([L_(TC, 'lrv4', 22.86), L_(TC, 'cable', 8.3), L_(TC, 'cable_cal', 9.1), L_(TC, 'pw', 14.9), L_(TC, 'pcc0', 15.2), L_(TC, 'pcc1', 15.2),
         L_(TC, 'pcc2', 15.2), L_(TC, 'pcc3', 15.2), L_(TC, 'pcc4', 15.2)], 20.0)
    row([L_(LV, 'semi0', 21.0), L_(LV, 'semi1', 21.0), L_(TC, 'pcc5', 15.2), L_(TC, 'pcc6', 15.2), L_(TC, 'pcc7', 15.2), L_(TC, 'boat', 12.0),
         L_(LV, 'box2', 8.3), L_(LV, 'van1', 5.9), L_(LV, 'van2', 5.9)], 34.0)
elif PART == 'rail':
    import transit_cars as TC
    _, MT = mats_transit()
    L_ = lambda k: (k, TC.LENGTH.get(k, 26.0), reg(TC, k), MT)
    row([L_('kiss_cab'), L_('kiss_mid'), L_('kiss_panto'), L_('kiss_mid'), L_('kiss_cab')], 6.0, gap=0.8)
    row([L_('loco'), L_('gal'), L_('gal'), L_('gal_cab')], 20.0, gap=0.8)
    row([L_('lrv4'), L_('lrv4'), L_('cable'), L_('cable_cal')], 34.0, gap=0.8)
elif PART == 'cars':
    _cs = _HQ[_HQ.index("    def car_mesh(name, L, Wd, prof):"):_HQ.index("    r = random.Random(21); k = 0")]
    _cs = '\n'.join(l[4:] if l.startswith('    ') else l for l in _cs.split('\n'))
    import random, bmesh, era as EA  # noqa: F401  (names the slice uses)
    from mathutils import Matrix  # noqa: F401
    g_ = dict(globals()); exec(_cs, g_); CARS = g_['CARS']
    log('cars', len(CARS))
    for rr, yaw in ((0, 0.0), (1, math.pi / 2), (2, math.radians(35))):
        x = X0
        for i, me in enumerate(CARS):
            for c_ in range(3):
                o = bpy.data.objects.new(f'car{rr}_{i}_{c_}', me); sc.collection.objects.link(o)
                o.location = (x + 2.6, 5.0 + rr * 9.0 + c_ * 0.05, 0.03); o.rotation_euler.z = yaw + 0.03 * c_
                x += 5.4 if yaw == 0.0 else 3.2
elif PART in ('boats', 'ships'):
    import life_boats as LB, life_hq as LH
    T_ = LH._mats(bpy, None); mats = [T_['paint'], T_['glass'], T_['matte'], T_['sail'], T_['metal']]
    SPEC = ([('sailboat', dict(L=9, seed=3)), ('sailboat', dict(L=12, seed=7)), ('sailboat', dict(L=11, seed=5, sails=(0.35, 0.25, False), heel=0.12)),
             ('sailboat', dict(L=10, seed=11, sails=None)), ('motorboat', dict(L=10, seed=2)), ('motorboat', dict(L=15, seed=4, flybridge=True)),
             ('fishing', dict(L=14, B=4.4, seed=1)), ('kayak', dict(seed=1))],
            [('tug', {}), ('small_ferry', {}), ('ferry_cat', {}), ('ferry_mono', {})]) if PART == 'boats' else \
           ([('barge', {}), ('bulk_carrier', dict(L=120.0, B=22.0))], [('container_ship', dict(L=150.0, B=24.0))])
    for j, spec in enumerate(SPEC):
        x = X0
        for i, (b_, a_) in enumerate(spec):
            f = getattr(LB, b_, None)
            if f is None: log('missing', b_); continue
            vb = f(**a_); me = TG.mesh_multi(bpy, f'boat{j}_{i}', vb.V, vb.F, vb.C, vb.MI, mats)
            Lb = max(v[0] for v in vb.V) - min(v[0] for v in vb.V); Bb = max(v[1] for v in vb.V) - min(v[1] for v in vb.V)
            ext = abs(math.cos(YAW)) * Lb + abs(math.sin(YAW)) * Bb
            place(me, x + ext / 2, 8.0 + j * (26.0 if PART == 'boats' else 40.0)); x += ext + 3.0
elif PART == 'era':
    import era_life as EL
    _, ML = mats_life()
    for j, keys in enumerate(EL.BENCH_ROWS):
        row([(k, EL.LENGTH[k], EL.PROTOS[k], ML) for k in keys], 6.0 + j * 12.0)

# camera: the frame's own forward, ortho, MPP m/px, framing the rows
fwd = Vector((0.0, 0.8597718124511361, -0.5106784022400873))
cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam_d.type = 'ORTHO'; cam_d.ortho_scale = W * MPP; cam_d.clip_start = 1; cam_d.clip_end = 5000
cy = float(E('CY', 20.0 if PART != 'ships' else 30.0))
cam.location = Vector((0.0, cy, 0.0)) - fwd * 1500
cam.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()
_ls = _HQ[_HQ.index("world = bpy.data.worlds.new('w')"):_HQ.index("sc.render.filepath = OUT")]
exec(_ls)
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.cycles.samples = SPP
sc.render.image_settings.file_format = 'PNG'
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
log('BENCH done', OUT)
