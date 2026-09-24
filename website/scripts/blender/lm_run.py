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
# probing: LM_PROBE='u,v;...' logs what the camera sees at those frame pixels, no render (lm_probe.py)
if os.environ.get('LM_PROBE'):
    import re
    src, n_ = re.subn(r"(\n( +))t1 = time\.time\(\); bpy\.ops\.render\.render\(write_still=True\)(?=\n\2log\(f'frame)",
                      r"\1import lm_probe; lm_probe.probe(bpy, sc, log, os.environ['LM_PROBE']); sys.exit(0)", src, count=1)
    assert n_ == 1, 'pyramid render line not found'
# LM_PCT=25: render at that per cent of the frame (a level-5 look at a level-7 frame's cost of path tracing)
if os.environ.get('LM_PCT'):
    a_ = "sc.cycles.samples = SPP\n"; assert a_ in src, 'samples line not found'
    src = src.replace(a_, a_ + f"sc.render.resolution_percentage = {int(os.environ['LM_PCT'])}\n", 1)
# LM_NOGHOST=1: the engine's ground-detail overlays are not ground — translucent
# pier plates (cream, opacity .2) and their dark drop shadows offset south-west
# (.35: the grey 'ghost piers' on the bay), the lakes' light glaze (.42) and the
# opaque blue lakes (colour r .21) all went into hq_city's 'paths' (their vertex
# colour is white) and drew as grey paving. Skip them (the proposed hq_city fix).
if os.environ.get('LM_NOGHOST') == '1':
    a_ = "        tgt = DP if (c and c[2] > 0.8) else DL\n"
    if a_ in src:
        src = src.replace(a_, "        if m.get('opacity', 1) < 0.45 or (m.get('color') or [1])[0] < 0.3: continue\n" + a_, 1)
    else: print('lm_run: LM_NOGHOST: ground-detail line not found', flush=True)
os.environ.setdefault('LM_ALL', '1')                 # the landmarks agent's tests see every model
# the footprints the tested models replace (LM_KEYS, or all of them with LM_ALL=1)
# go into this snapshot's own skip_gids.json, as a pass would have them once enabled:
# the generator's building must not stand under a model under test (Oracle Park's
# 11.6 m block covered the ballpark in a test, 2026-09-24)
try:
    import json as _j
    _live = '/Users/daniel/code/qipu-render-work/landmarks/skip_gids.json'
    if os.path.exists(_live) and os.path.abspath(HERE) != '/Users/daniel/code/opd-render/website/scripts/blender':
        _s = _j.load(open(_live))
        _keys = set(_s.get('all_by_landmark', {})) if os.environ.get('LM_ALL') == '1' else {k for k in os.environ.get('LM_KEYS', '').split(',') if k}
        for _k in _keys:
            if _k in _s.get('all_by_landmark', {}):
                _s['by_landmark'][_k] = _s['all_by_landmark'][_k]; _s.setdefault('built', {})[_k] = _s['all_built'].get(_k)
        _j.dump(_s, open(os.path.join(HERE, 'skip_gids.json'), 'w'))
except Exception as _ex:
    print('lm_run: skip list for the tested models not written', _ex, flush=True)
g = {'__name__': '__main__', '__file__': path}
exec(compile(src, path, 'exec'), g)
