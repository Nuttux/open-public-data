"""THE PROTO BENCH (25/09, trees v3 + cars v2): every tree kind of the v2 kit
beside its v3 rebuild (v2 left, v3 right of each pair), and the kerb cars
before (CARS_V2=0) and after, on a strip of lawn and asphalt, under the city's
own world, sun and camera (hq_scene's light slice, LOOK as set), at MPP metres
per pixel (0.09 = level 9, 0.187 = level 8, 0.374 = level 7). Seconds of GPU
per look, so a crown is judged before a city crop. Cloud only (BAR 25/09):
  env LOOK=B CYCLES_DEVICE=OPTIX MPP=0.09 blender -b -P proto_bench.py -- out.png [spp] [W] [H]
PART=trees|cars|all (default all); ONLY=name,name (tree kinds).
"""
import bpy, bmesh, math, os, sys, time, random
import numpy as np
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import look_preset  # noqa: F401  (the look as env defaults)
import veg_protos as VP
argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]; SPP = int(argv[1]) if len(argv) > 1 else 32
W = int(argv[2]) if len(argv) > 2 else 2400; H = int(argv[3]) if len(argv) > 3 else 1400
E = os.environ.get; T0 = time.time(); ERA = None
def log(*a): print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
PART = E('PART', 'all')

def hp(x, y, salt):
    h = (int(round(x * 10)) * 73856093) ^ (int(round(y * 10)) * 19349663) ^ (salt * 83492791)
    h = (h ^ (h >> 13)) * 0x5bd1e995 & 0xffffffff
    return ((h ^ (h >> 15)) & 0xffffff) / float(0x1000000)

def flat(name, rgb, verts, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = (*rgb, 1); p.inputs['Roughness'].default_value = rough
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], [(0, 1, 2, 3)]); me.materials.append(m)
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)

flat('lawn', VP.hex_lin(E('LAWN', '#6b6a44')), [(-300, -40, 0), (300, -40, 0), (300, 300, 0), (-300, 300, 0)])
flat('asphalt', VP.hex_lin('#4a4a4c'), [(-300, -40, 0.02), (300, -40, 0.02), (300, -14, 0.02), (-300, -14, 0.02)], 0.8)

_HQ = open(os.path.join(HERE, 'hq_scene.py')).read()


def instancer(name, pts, protos):
    root = bpy.data.collections.new(f'{name}_protos')
    for i, c in enumerate(protos):
        w = bpy.data.collections.new(f'{name}_k{i:04d}'); w.children.link(c); root.children.link(w)
    me = bpy.data.meshes.new(name); me.vertices.add(len(pts))
    me.vertices.foreach_set('co', [v for p in pts for v in p[:3]])
    for nm, k, tp in (('s', 3, 'FLOAT'), ('r', 4, 'FLOAT'), ('kind', 5, 'INT')):
        at = me.attributes.new(nm, tp, 'POINT'); at.data.foreach_set('value', [p[k] for p in pts])
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


# ── trees: v2 | v3 pairs ─────────────────────────────────────────────────────
if PART in ('trees', 'all'):
    VP.V3_ON = False; K2 = VP.kit(); VP.V3_ON = True; K3 = VP.kit()
    protos, pts = [], []; stats = {}
    def build(K, nm, tag):
        b, ramp, t_, h_ = K[nm]; t0 = time.time()
        c, w, h, nf = VP.to_blender(bpy, f'veg{tag}_{nm}', b(), ramp)
        protos.append(c); stats[f'{tag}{nm}'] = (nf, round(time.time() - t0, 1)); return len(protos) - 1, w, h
    only = [s for s in (E('ONLY') or '').split(',') if s]
    # rows back to front (tall kinds behind): (names, y, spacing)
    ROWS = [(['euc_a', 'euc_b', 'euc_c', 'euc_y', 'pine_a', 'pine_b', 'pine_y'], 80.0, 34.0),
            (['cyp_a', 'cyp_b', 'cyp_y', 'oak_a', 'oak_b', 'bbox_a', 'bbox_b', 'washy', 'washy_b'], 45.0, 30.0),
            (['plane_a', 'plane_b', 'plane_y', 'round_a', 'round_b', 'ficus_a', 'ficus_b', 'vbox_a', 'vbox_b'], 18.0, 26.0),
            (['pohu', 'pohu_b', 'column', 'cherry', 'plum', 'olive', 'phoenix', 'phoenix_b', 'queen', 'fanpalm'], -4.0, 21.0)]
    for names, y, sp in ROWS:
        names = [n for n in names if not only or n in only]
        x = -len(names) * sp / 2
        for nm in names:
            base = nm if nm in K2 else {'euc_y': 'euc_b', 'cyp_y': 'cyp_b', 'pine_y': 'pine_b', 'plane_y': 'plane_b', 'ficus_a': 'round_a', 'ficus_b': 'round_b',
                                        'vbox_a': 'round_a', 'vbox_b': 'round_b', 'bbox_a': 'round_b', 'bbox_b': 'round_b', 'oak_a': 'round_a', 'oak_b': 'round_b',
                                        'pohu_b': 'pohu', 'phoenix_b': 'phoenix', 'washy_b': 'washy'}.get(nm)
            k3, w3, h3 = build(K3, nm, '3')
            if base:
                k2, w2, h2 = build(K2, base, '2') if f'2{base}' not in stats else (next(i for i, c in enumerate(protos) if c.name == f'veg2_{base}_one'), None, None)
                pts.append((x - sp * 0.22, y, 0.0, 1.0 if w2 is None else min(1.0, w3 / max(0.5, w2)), 0.7, k2))
            pts.append((x + sp * 0.22, y, 0.0, 1.0, 0.7, k3))
            x += sp
    instancer('trees', pts, protos)
    log('tree protos (faces, s):', stats)

# ── cars: before (front row) | after (second row) ───────────────────────────
if PART in ('cars', 'all'):
    _simple = _HQ[_HQ.index("def simple("):_HQ.index("def sky_term(")]
    exec(_simple)
    _cs = _HQ[_HQ.index("    def car_mesh(name, L, Wd, prof):"):_HQ.index("    r = random.Random(21); k = 0")]
    _cs = '\n'.join(l[4:] if l.startswith('    ') else l for l in _cs.split('\n'))
    rows = []
    for v_ in ('0', '1'):
        os.environ['CARS_V2'] = v_
        for m in list(bpy.data.materials):
            if m.name.startswith(('carpaint', 'carglass', 'tyre', 'carlamp', 'cartrim', 'taillamp', 'rim')): m.name = m.name + f'_old{v_}'
        g_ = dict(globals()); exec(_cs, g_); rows.append(g_['CARS'])
    for j, CARS in enumerate(rows):
        y = -30.0 + j * 7.5; x = -len(CARS) * 3.2 / 2 * 1.0; cyaw = E('CAR_YAW')
        for i, me in enumerate(CARS):
            for c_ in range(3):      # three paints each
                o = bpy.data.objects.new(f'car{j}_{i}_{c_}', me); sc.collection.objects.link(o)
                if cyaw is None:
                    o.location = (x + c_ * 2.4, y + (c_ % 2) * 0.1, 0.03); o.rotation_euler.z = math.pi / 2 + 0.02 * c_
                else:        # parked along a kerb: nose to tail, 6.2 m slots
                    o.location = (-60.0 + (i * 3 + c_) * 6.4, y, 0.03); o.rotation_euler.z = float(cyaw) + 0.02 * c_
            x += 8.2
    log('cars: before', len(rows[0]), 'after', len(rows[1]))

# ── boats: before (BOATS_V2=0, front) | after (behind), on water ─────────────
if PART == 'boats':
    import life_boats as LB, life_hq as LH, transit_geom as TG
    bpy.data.objects.remove(bpy.data.objects['asphalt'])
    lw = bpy.data.objects['lawn'].data.materials[0].node_tree.nodes['Principled BSDF']
    lw.inputs['Base Color'].default_value = (0.012, 0.03, 0.035, 1); lw.inputs['Roughness'].default_value = 0.08
    T_ = LH._mats(bpy, None); mats = [T_['paint'], T_['glass'], T_['matte'], T_['sail'], T_['metal']]
    SPEC = [('sailboat', dict(L=9, seed=3)), ('sailboat', dict(L=12, seed=7)), ('sailboat', dict(L=11, seed=5, sails=(0.35, 0.25, False), heel=0.12)),
            ('motorboat', dict(L=10, seed=2)), ('motorboat', dict(L=15, seed=4, flybridge=True)), ('fishing', dict(L=14, B=4.4, seed=1)),
            ('tug', {}), ('small_ferry', {}), ('ferry_cat', {}), ('ferry_mono', {})]
    for j, v_ in enumerate(('0', '1')):
        os.environ['BOATS_V2'] = v_; x = -70.0
        for i, (b_, a_) in enumerate(SPEC):
            vb = getattr(LB, b_)(**a_)
            me = TG.mesh_multi(bpy, f'boat{j}_{i}', vb.V, vb.F, vb.C, vb.MI, mats)
            o = bpy.data.objects.new(f'boat{j}_{i}', me); sc.collection.objects.link(o)
            Lb = max(v[0] for v in vb.V) - min(v[0] for v in vb.V); Bb = max(v[1] for v in vb.V) - min(v[1] for v in vb.V)
            yaw_ = float(E('BOAT_YAW', 1.5708)); o.rotation_euler.z = yaw_
            ext_ = abs(math.cos(yaw_)) * Lb + abs(math.sin(yaw_)) * Bb
            o.location = (x + ext_ / 2, j * 55.0, 0.0)
            x += ext_ + 4.0
    log('boats: built')

# camera: the frame's own forward, ortho, MPP m/px
fwd = Vector((0.0, 0.8597718124511361, -0.5106784022400873))
cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam_d.type = 'ORTHO'; cam_d.ortho_scale = W * float(E('MPP', 0.09)); cam_d.clip_start = 1; cam_d.clip_end = 5000
cx, cy = float(E('CX', 0.0)), float(E('CY', 20.0))
cam.location = Vector((cx, cy, 0.0)) - fwd * 1500
cam.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()
_ls = _HQ[_HQ.index("world = bpy.data.worlds.new('w')"):_HQ.index("sc.render.filepath = OUT")]
exec(_ls)
sc.cycles.samples = SPP
sc.render.image_settings.file_format = 'PNG'
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
log('BENCH done', OUT)
