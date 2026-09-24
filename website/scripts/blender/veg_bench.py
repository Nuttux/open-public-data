"""THE TREE BENCH (vegetation agent): the kit's protos on a strip of lawn and
pavement, under the city's own light and camera (hq_scene's world, sun, AgX,
the frame's 30.7 deg oblique looking north), at 2x the pyramid's 37 cm/px. A
few seconds of GPU per look, so a crown's shading is judged before a city crop.
Always through the queue:
  sh gpuq.sh vbench env BORDER=0 blender -b -P veg_bench.py -- out.png [spp] [W] [H]
Row 1 (front): the street kinds on pavement, 14 m apart. Row 2: eucalyptus,
cypress, pine, alone. Behind: a forest stand (blue gum, cypress, pine) at the
spacing of the city's canopy masses.
"""
import bpy, math, os, sys, time
import numpy as np
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import veg_protos as VP
argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]; SPP = int(argv[1]) if len(argv) > 1 else 16
W = int(argv[2]) if len(argv) > 2 else 1600; H = int(argv[3]) if len(argv) > 3 else 900
E = os.environ.get; T0 = time.time()
def log(*a): print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def hp(x, y, salt):
    h = (int(round(x * 10)) * 73856093) ^ (int(round(y * 10)) * 19349663) ^ (salt * 83492791)
    h = (h ^ (h >> 13)) * 0x5bd1e995 & 0xffffffff
    return ((h ^ (h >> 15)) & 0xffffff) / float(0x1000000)

def flat(name, rgb, verts):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']; p.inputs['Base Color'].default_value = (*rgb, 1); p.inputs['Roughness'].default_value = 0.9
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], [(0, 1, 2, 3)]); me.materials.append(m)
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob)

flat('lawn', VP.hex_lin('#6b6a44'), [(-200, -60, 0), (260, -60, 0), (260, 260, 0), (-200, 260, 0)])
flat('pave', VP.hex_lin('#8f8a84'), [(-200, -12, 0.02), (260, -12, 0.02), (260, 8, 0.02), (-200, 8, 0.02)])

import importlib, veg_geom
def clear():
    for o in list(bpy.data.objects):
        if o.name.startswith('veg_') or o.name == 'trees': bpy.data.objects.remove(o)
    for c in list(bpy.data.collections): bpy.data.collections.remove(c)
    for m in list(bpy.data.meshes):
        if m.name.startswith('veg_') or m.name == 'trees': bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials):
        if m.name.startswith('veg_'): bpy.data.materials.remove(m)
    for g in list(bpy.data.node_groups): bpy.data.node_groups.remove(g)
def build():
    global VP
    importlib.reload(veg_geom); VP = importlib.reload(VP)
    K = VP.kit(); names = sorted(K); protos, widths, heights = [], [], []
    t0 = time.time(); nf = {}
    for nm in names:
        b, ramp, t_, h_ = K[nm]
        c, w, h, n_ = VP.to_blender(bpy, f'veg_{nm}', b(), ramp); protos.append(c); widths.append(w); heights.append(h); nf[nm] = n_
    log('protos built', round(time.time() - t0, 1), 's', nf)
    ki = {n: i for i, n in enumerate(names)}
    pts = []
    street = ['plane_a', 'plane_b', 'round_a', 'round_b', 'pohu', 'column', 'cherry', 'plum', 'olive', 'phoenix', 'washy', 'queen', 'fanpalm']
    crowns = {'plane_a': 10, 'plane_b': 9, 'round_a': 7, 'round_b': 6, 'pohu': 8, 'column': 3.5, 'cherry': 5, 'plum': 5, 'olive': 5}
    for i, nm in enumerate(street):
        k = ki[nm]; s = crowns.get(nm, widths[k]) / widths[k]
        pts.append((-175 + i * 15.0, 5.0, 0.0, s, 6.283 * hp(i, 0, 5), k))
    for i, nm in enumerate(['euc_a', 'euc_b', 'euc_c', 'cyp_a', 'cyp_b', 'pine_a', 'pine_b']):
        pts.append((-175 + i * 30.0, 40.0, 0.0, 1.0, 6.283 * hp(i, 1, 5), ki[nm]))
    # the stand: jittered grid, 11 m, species by blocks
    FOR = {'euc': ['euc_a', 'euc_b', 'euc_c'], 'cyp': ['cyp_a', 'cyp_b'], 'pine': ['pine_a', 'pine_b']}
    for gx in range(-16, 10):
        for gy in range(0, 9):
            x, y = gx * 11.0 + 6 * (hp(gx, gy, 1) - .5), 90 + gy * 11.0 + 6 * (hp(gx, gy, 2) - .5)
            sp = 'euc' if gx < -7 else 'cyp' if gx < 1 else 'pine'
            if hp(gx, gy, 3) < 0.12: continue                     # a gap
            ks = FOR[sp]; k = ki[ks[int(hp(gx, gy, 4) * len(ks))]]
            pts.append((x, y, 0.0, 0.85 + 0.3 * hp(gx, gy, 6), 6.283 * hp(gx, gy, 5), k))

    # the instancer, as hq_city's (the per-tree 'crand' by place)
    root = bpy.data.collections.new('trees_protos')
    for c in protos: root.children.link(c)
    me = bpy.data.meshes.new('trees'); me.vertices.add(len(pts))
    me.vertices.foreach_set('co', [v for p in pts for v in p[:3]])
    for nm, k, tp in (('s', 3, 'FLOAT'), ('r', 4, 'FLOAT'), ('kind', 5, 'INT')):
        at = me.attributes.new(nm, tp, 'POINT'); at.data.foreach_set('value', [p[k] for p in pts])
    at = me.attributes.new('crand', 'FLOAT', 'POINT'); at.data.foreach_set('value', [hp(p[0], p[1], 7) for p in pts])
    ob = bpy.data.objects.new('trees', me); sc.collection.objects.link(ob)
    ng = bpy.data.node_groups.new('trees', 'GeometryNodeTree')
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
    ob.modifiers.new('trees', 'NODES').node_group = ng
    log('trees', len(pts))


# camera: the frame's own (forward from city/scene.json), ortho, 2x 37.4 cm/px
fwd = Vector((0.0, 0.8597718124511361, -0.5106784022400873))
cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam_d.type = 'ORTHO'; cam_d.ortho_scale = W * float(E('MPP', 0.187)); cam_d.clip_start = 1; cam_d.clip_end = 5000
cam.location = Vector((-40.0, 62.0, 0.0)) - fwd * 1500
cam.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()
_ls = open(os.path.join(HERE, 'hq_scene.py')).read()
_ls = _ls[_ls.index("world = bpy.data.worlds.new('w')"):_ls.index("sc.render.filepath = OUT")]
exec(_ls)
sc.cycles.samples = SPP
sc.render.image_settings.file_format = 'PNG'
# VARIANTS='tag:K=V,K=V;tag2:…' — one render per variant (env set, kit rebuilt), OUT_<tag>.png
for spec in (E('VARIANTS') or 'base:').split(';'):
    tag, kv = spec.split(':', 1)
    for a_ in [a_ for a_ in kv.split(',') if a_]:
        k_, v_ = a_.split('='); os.environ[k_] = v_
    clear(); build()
    sc.render.filepath = OUT.replace('.png', f'_{tag}.png'); bpy.ops.render.render(write_still=True)
    log('BENCH done', sc.render.filepath)
    for a_ in [a_ for a_ in kv.split(',') if a_]: os.environ.pop(a_.split('=')[0], None)
