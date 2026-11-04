"""Render pyramid frames from scene .blend files that hq_city.py saved (SAVE_BLEND=...): no scene build on the GPU card.

blender -b [<scene.blend>] -P render_blend.py -- <hq_city.py> <queue file>
queue file, one line each:
  @ <scene.blend>                                   load this scene (the jobs below render from it)
  <out prefix> <i:j[,i:j...]> <BORDER x0,x1,y0,y1 | -> [KEY=VAL ...]
                                                    one hq_city MODE=pyramid job: frames ONLY=i:j, crop BORDER, the job's
                                                    render-time env (Z, pass flags MASK_PASS / CLASS_PASS / GID_PASS ...)
  END                                               stop (R10X_FOLLOW=1: the file is followed as it grows until END)
Every job runs hq_city's OWN pyramid code (frame camera, border, beauty, passes; sliced from hq_city.py, so frame maths
and passes live in one place) on the loaded scene. One Blender process serves the whole queue (a persistent worker):
Blender start, device setup and the kernels are paid once per card, the BVH once per scene (use_persistent_data).
A scene built with GID_ATTR=1 holds beauty AND the ID pass: put its beauty jobs first, its pass jobs after.
Device from CYCLES_DEVICE (OPTIX | CUDA | CPU). Logs 'R10X LOADED <scene> <s>', 'R10X JOB <prefix> <s>', 'R10X DONE'.
Refuses a scene whose in-memory images (ground maps) do not match their build hash, or whose texture files are not under
R10X_ROOT ('R10X IMAGE MISMATCH').
"""
import bpy, os, sys, time, math, json, hashlib
import numpy as np
from mathutils import Vector, Matrix
T0 = time.time()
def log(*a): print(f'[{time.time() - T0:7.1f}s]', *a, flush=True)
argv = sys.argv[sys.argv.index('--') + 1:]
HQ, QUEUE = os.path.abspath(argv[0]), argv[1]
SRC = open(HQ).read()
sys.path.insert(0, os.path.dirname(HQ))
E = os.environ.get
for ln in SRC.splitlines():   # the snapshot's city defaults (CITY_REF ...), set before anything else as in hq_city
    if ln.startswith('_os_city.environ.setdefault('): exec(ln, {'_os_city': os})
import look_preset   # noqa: F401  (env defaults only)
def cut(a, b, incl=False):
    i = SRC.index(a); j = SRC.index(b, i); return SRC[i:j + (len(b) if incl else 0)]
GEOM = cut("CA_ = math.cos(math.radians(30))", "if E('MODE') == 'pyramid' and ONLY and BOX is None:")
PYR = cut("if E('MODE') == 'pyramid':", "log('PYRAMID done'); sys.exit(0)", incl=True)
DEV = E('CYCLES_DEVICE', 'OPTIX')

def setup_scene():
    """device + image check on the scene just loaded; returns (scene, extra env)"""
    sc = bpy.context.scene
    if DEV != 'CPU':
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = DEV; prefs.get_devices()
        for dv in prefs.devices: dv.use = dv.type != 'CPU'
        sc.cycles.device = 'GPU'
    else:
        sc.cycles.device = 'CPU'
        if E('DN_CPU', '1') == '1': sc.cycles.denoising_use_gpu = False
    bad = []
    for n_, h_ in json.loads(sc.get('r10x_images', '{}')).items():
        im_ = bpy.data.images.get(n_)
        if im_ is None: bad.append(n_ + ' missing'); continue
        a_ = np.empty(im_.size[0] * im_.size[1] * im_.channels, np.float32); im_.pixels.foreach_get(a_)
        if hashlib.sha1(a_.tobytes()).hexdigest() != h_: bad.append(n_)
    root = E('R10X_ROOT', '')
    for n_, rel_ in json.loads(sc.get('r10x_files', '{}')).items():   # the texture files of an unpacked scene: this card's copy
        im_ = bpy.data.images.get(n_); p_ = os.path.join(root, rel_)
        if im_ is None or not root or not os.path.isfile(p_): bad.append(f'{n_} file {p_}'); continue
        im_.filepath = p_
    if bad or 'r10x_images' not in sc:
        sys.exit(f'R10X IMAGE MISMATCH {bad or "no r10x_images record (old .blend)"} in {bpy.data.filepath}: not rendering')
    return sc, ({'GID_ATTR': '1'} if sc.get('r10x_gid_attr') else {})

def lines():
    """the queue's lines; R10X_FOLLOW=1 waits for more until END"""
    f = open(QUEUE); buf = ''
    while True:
        s = f.readline()
        if s:
            buf += s
            if not buf.endswith('\n'): continue
            ln, buf = buf.strip(), ''
            if ln == 'END': return
            if ln and not ln.startswith('#'): yield ln
            continue
        if E('R10X_FOLLOW') != '1': return
        time.sleep(1)

base_env = dict(os.environ)
sc = extra = None
if bpy.data.filepath:
    t1 = time.time(); sc, extra = setup_scene(); log('R10X LOADED', bpy.data.filepath, f'{time.time() - t1:.1f}', 'device', DEV)
for ln in lines():
    f = ln.split()
    if f[0] == '@':
        t1 = time.time(); bpy.ops.wm.open_mainfile(filepath=f[1], load_ui=False)
        sc, extra = setup_scene(); log('R10X LOADED', f[1], f'{time.time() - t1:.1f}', 'device', DEV); continue
    if sc is None: sys.exit('R10X: a job before any scene (@ <scene.blend>)')
    out, only, border, kv = f[0], f[1], f[2], f[3:]
    os.environ.clear(); os.environ.update(base_env); os.environ.update(extra); os.environ.update(MODE='pyramid', ONLY=only)
    if border != '-': os.environ['BORDER'] = border
    else: os.environ.pop('BORDER', None)
    for k in kv:
        a, b = k.split('=', 1); os.environ[a] = b
    if any(k in os.environ for k in ('LOOKS', 'CAMPATH')) or E('CLAY') == '1': sys.exit('render_blend: LOOKS / CAMPATH / CLAY jobs are not supported')
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    t1 = time.time(); cam = sc.camera
    g = dict(bpy=bpy, os=os, sys=sys, time=time, math=math, json=json, Vector=Vector, Matrix=Matrix, E=os.environ.get,
             sc=sc, cam=cam, cam_d=cam.data, OUT=out, log=log, __name__='hq_city_pyramid')
    exec(GEOM, g)
    try: exec(PYR, g)
    except SystemExit: pass
    log('R10X JOB', os.path.basename(out), f'{time.time() - t1:.1f}')
os.environ.clear(); os.environ.update(base_env)
log('R10X DONE')
