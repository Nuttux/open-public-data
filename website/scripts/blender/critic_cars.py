"""Car line-up for the render critic: every car of hq_scene.py's car block,
side by side on asphalt, seen at the city camera's angle and from low, in
the same golden-hour light. blender -b -P critic_cars.py -- <out.png> <spp>"""
import bpy, bmesh, math, os, sys, glob, random
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:]
OUT, SPP = argv[0], int(argv[1])
E = os.environ.get
ERA = None
PH = os.path.expanduser('~/code/qipu-assets/polyhaven')
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
src = open(os.path.join(HERE, 'hq_scene.py')).read()
g = dict(bpy=bpy, bmesh=bmesh, math=math, Vector=Vector, ERA=ERA, E=E, sc=sc, glob=glob, PH=PH, os=os, random=random, W=1200, H=750, SPP=SPP)
exec(src[src.index('def ph_mat('):src.index("log('materials')")], g)
cs = src[src.index("    def car_mesh(name, L, Wd, prof):"):src.index("    r = random.Random(21); k = 0")]
exec('\n'.join(l[4:] if l.startswith('    ') else l for l in cs.split('\n')), g)
CARS = g['CARS']
asph = g['ph_mat']('asphalt_02', 5.0, value=0.55)
me = bpy.data.meshes.new('ground'); me.from_pydata([(-30, -30, 0), (30, -30, 0), (30, 30, 0), (-30, 30, 0)], [], [(0, 1, 2, 3)])
ob = bpy.data.objects.new('ground', me); sc.collection.objects.link(ob); me.materials.append(asph)
for row in range(2):
    for i, cm in enumerate(CARS):
        o = bpy.data.objects.new(f'c{row}{i}', cm); sc.collection.objects.link(o)
        o.location = (-10.5 + i * 3.0, row * 6.5 - 3.0, 0.0); o.rotation_euler.z = math.pi / 2 if row == 0 else -math.pi / 2 + 0.5
        o.pass_index = i
fwd = Vector((0, 0.8597718, -0.5106784)).normalized()
cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam_d.type = 'ORTHO'; cam_d.ortho_scale = float(E('ORTHO', 26)); cam.location = Vector((0, 0.5, 0)) - fwd * 100
cam.rotation_euler = fwd.to_track_quat('-Z', 'Y').to_euler()
exec(src[src.index("world = bpy.data.worlds.new('w')"):src.index("sc.render.filepath = OUT")], g)
sc.cycles.samples = SPP; sc.render.resolution_x, sc.render.resolution_y = 1200, 750
sc.render.filepath = OUT; bpy.ops.render.render(write_still=True)
