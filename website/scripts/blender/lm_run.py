"""Test driver for the landmarks agent: runs hq_scene.py (or hq_city.py)
unchanged, except that terrain_hq.correct_scene is called on the exported
scene right after it is loaded — the one hook the render scripts need for the
true ground (see terrain_hq.py). TERRAIN_FIX=0 runs the scripts as they are.

blender -b -P lm_run.py -- <scene_dir> <out.png> <spp> <w> <h>   (as hq_scene)
env LM_SCRIPT=hq_city.py to drive the city script instead.
"""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
script = os.environ.get('LM_SCRIPT', 'hq_scene.py')
path = os.path.join(HERE, script)
src = open(path).read()
anchor = "d = json.load(open(os.path.join(SD, 'scene.json')))\n"
if os.environ.get('TERRAIN_FIX', '1') == '0': os.environ['TERRAIN_HQ'] = '0'     # also off where the script calls it itself
if os.environ.get('TERRAIN_FIX', '1') == '1' and 'terrain_hq.correct_scene' not in src:
    assert anchor in src, 'scene load line not found'
    box_expr = ("([float(v) for v in E('BOX').split(',')] if E('BOX') else d['box'])" if script == 'hq_scene.py'
                else "([float(v) for v in E('BOX').split(',')] if E('BOX') else None)")
    src = src.replace(anchor, anchor + f"import terrain_hq; terrain_hq.correct_scene(d, log, box={box_expr}, sd=SD)\n", 1)
# profiling: LM_PROF=1 renders the pyramid frame as variants at RES_PCT (lm_prof.py)
if os.environ.get('LM_PROF') == '1':
    import re
    src, n_ = re.subn(r"(\n( +))t1 = time\.time\(\); bpy\.ops\.render\.render\(write_still=True\)(?=\n\2log\(f'frame)",
                      r"\1import lm_prof; lm_prof.variants(bpy, sc, log, fn); sys.exit(0)", src, count=1)
    assert n_ == 1, 'pyramid render line not found'
os.environ.setdefault('LM_ALL', '1')                 # the landmarks agent's tests see every model
g = {'__name__': '__main__', '__file__': path}
exec(compile(src, path, 'exec'), g)
