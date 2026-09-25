"""Cut a small district scene out of a bigger exported one (the whole city):
every mesh keeps the triangles whose centre falls inside the box (plus a pad),
every tree list the instances inside it. The engine's own export is only
re-selected, nothing is re-drawn, so a test render of a place no district
export covers (the Outer Sunset, the Richmond) costs seconds, not the whole
city in memory.

usage: python3 crop_scene.py <src_dir> <dst_dir> x0,y0,x1,y1 [pad=250]
then:  python3 water_mask.py <dst_dir>
"""
import array, base64, json, os, shutil, sys

src, dst = sys.argv[1], sys.argv[2]
x0, y0, x1, y1 = [float(v) for v in sys.argv[3].split(',')]
pad = float(sys.argv[4]) if len(sys.argv) > 4 else 250.0
d = json.load(open(os.path.join(src, 'scene.json')))


def f32(b):
    a = array.array('f'); a.frombytes(base64.b64decode(b)); return a


def enc(a): return base64.b64encode(a.tobytes()).decode()


def inside(x, y): return x0 - pad <= x <= x1 + pad and y0 - pad <= y <= y1 + pad


meshes = []
for m in d['meshes']:
    if m.get('instanced') or not m.get('pos'):
        continue
    p = f32(m['pos']); nt = len(p) // 9
    per = {k: f32(m[k]) for k in ('col', 'uv', 'cen') if m.get(k)}
    # floats per vertex of each attribute, measured against the position count
    stride = {k: len(v) // (nt * 3) for k, v in per.items() if nt}
    keep = [t for t in range(nt) if inside((p[t*9] + p[t*9+3] + p[t*9+6]) / 3, (p[t*9+1] + p[t*9+4] + p[t*9+7]) / 3)]
    if not keep:
        continue
    q = array.array('f'); outs = {k: array.array('f') for k in per}
    for t in keep:
        q.extend(p[t*9:t*9+9])
        for k, v in per.items():
            s = stride[k] * 3; outs[k].extend(v[t*s:t*s+s])
    m2 = dict(m); m2['pos'] = enc(q); m2['nv'] = len(q) // 3
    for k, v in outs.items(): m2[k] = enc(v)
    meshes.append(m2)
trees = []
for t in d['trees']:
    inst = [i for i in t['inst'] if inside(i[0], i[1])]
    if inst:
        t2 = dict(t); t2['inst'] = inst; trees.append(t2)
out = {k: v for k, v in d.items() if k not in ('meshes', 'trees')}
out['box'] = [x0, y0, x1, y1]; out['meshes'] = meshes; out['trees'] = trees
os.makedirs(dst, exist_ok=True)
json.dump(out, open(os.path.join(dst, 'scene.json'), 'w'))
for f in os.listdir(src):
    if f.startswith('tex') and f.endswith('.png') and not os.path.exists(os.path.join(dst, f)):
        shutil.copy(os.path.join(src, f), os.path.join(dst, f))
print(dst, 'meshes', len(meshes), 'triangles', sum(len(base64.b64decode(m['pos'])) // 36 for m in meshes),
      'trees', sum(len(t['inst']) for t in trees))
