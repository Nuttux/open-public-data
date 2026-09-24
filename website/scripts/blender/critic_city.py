"""Test harness for the render critic, city pass: runs hq_city.py in pyramid
mode for ONE frame (ONLY=i:j) but renders only CROPS of it, so a look test on
the city camera costs one region build plus a few small borders.

blender -b -P critic_city.py -- city <out_prefix> <spp> 5120 3072
env: as hq_city.py (MODE=pyramid Z=7 ONLY=i:j), plus
  CROPS=name:x0,y0,x1,y1;…   crops in PIXELS of the 5120x3072 frame (y from the top)
  PATCH=<file>               in-memory edits of hq_city.py for a test, blocks
                             'old\n>>>>\nnew' separated by '\n====\n'
"""
import os, sys
HERE = os.environ.get('HQ_DIR') or os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'hq_city.py')).read()
if os.environ.get('PATCH'):
    for blk in open(os.environ['PATCH']).read().split('\n====\n'):
        if not blk.strip(): continue
        old, new = blk.split('\n>>>>\n')
        assert old in src, 'patch does not apply: ' + old[:80]
        src = src.replace(old, new)
head, pyr = src.split("if E('MODE') == 'pyramid':\n    Z, sz")
pyr = pyr.replace("bpy.ops.render.render(write_still=True)", "_crops()", 1)
src = head + "if E('MODE') == 'pyramid':\n    Z, sz" + pyr
def _crops():
    import bpy
    sc = bpy.context.scene; W, H = sc.render.resolution_x, sc.render.resolution_y; fn0 = sc.render.filepath
    # ROADV=0.62,0.8,0.9: the street asphalt's value (road_mat's Hue/Saturation
    # node) varied on the one built scene, a set of crops per value
    rv = [v for v in os.environ.get('ROADV', '').split(',') if v.strip()] or [None]
    # ROADK=1,1.35,1.6: the whole street albedo (road_mat's 'road_k' multiply, warm)
    rk = [v for v in os.environ.get('ROADK', '').split(',') if v.strip()] or [None]
    for v_ in rv:
        for k_ in rk:
            fn = fn0
            for m in bpy.data.materials:
                if m.name.split('.')[0] != 'asphalt' or not m.node_tree: continue
                for n in m.node_tree.nodes:
                    if v_ is not None and n.type == 'HUE_SAT': n.inputs['Value'].default_value = float(v_)
                    if k_ is not None and n.name == 'road_k':
                        k = float(k_); n.inputs[7].default_value = (1.0, 1.0, 1.0, 1.0) if k == 1.0 else (k * 1.03, k, k * 0.94, 1.0)
            if v_ is not None: fn = fn.rsplit('.', 1)[0] + f'_rv{v_}.png'
            if k_ is not None: fn = fn.rsplit('.', 1)[0] + f'_rk{k_}.png'
            _crop_set(sc, W, H, fn)
def _crop_set(sc, W, H, fn):
    import bpy
    for spec in [c for c in os.environ.get('CROPS', '').split(';') if c.strip()]:
        name, box = spec.split(':'); x0, y0, x1, y1 = [float(v) for v in box.split(',')]
        sc.render.use_border = True; sc.render.use_crop_to_border = True
        sc.render.border_min_x, sc.render.border_max_x = x0 / W, x1 / W
        sc.render.border_min_y, sc.render.border_max_y = 1 - y1 / H, 1 - y0 / H
        sc.render.filepath = fn.rsplit('.', 1)[0] + f'_{name}.png'
        import time; t = time.time(); bpy.ops.render.render(write_still=True)
        print(f'crop {name} {time.time() - t:.1f}s', flush=True)
g = {'__name__': '__main__', '__file__': os.path.join(HERE, 'hq_city.py'), '_crops': _crops, '_crop_set': _crop_set}
exec(compile(src, 'hq_city.py', 'exec'), g)
