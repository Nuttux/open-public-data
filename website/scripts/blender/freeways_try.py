"""Test runs of freeways_hq without touching hq_city.py (the orchestrator's):
hq_city's own source, run with the freeways hook put in after the life hook.
    blender -b -P freeways_try.py -- <hq_city's arguments>
env FW_AB=1: each frame is rendered twice from one built scene, the new
picture <out>_z7_i_j.png and the old one <out>_z7_i_j_old.png (ab_swap)."""
import os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
src = open(os.path.join(HERE, 'hq_city.py')).read()
if 'import freeways_hq' not in src:
    a = src.index('# ── camera, light, render in tiles')
    src = src[:a] + ("if E('FREEWAYS', '1') == '1':\n"
                     "    import freeways_hq; freeways_hq.build(bpy, sc, M, ground, (BOX or [-9000, -9000, 9000, 9000]), d, log, ERA)\n\n") + src[a:]
old = "                t1 = time.time(); bpy.ops.render.render(write_still=True)\n"
assert old in src
src = src.replace(old, old + ("                if E('FW_AB'):\n"
                              "                    import freeways_hq as _fw; _fw.ab_swap(sc); sc.render.filepath = fn[:-4] + '_old.png'\n"
                              "                    bpy.ops.render.render(write_still=True); _fw.ab_swap(sc); log('old picture', fn[:-4] + '_old.png')\n"))
g = {'__name__': '__main__', '__file__': os.path.join(HERE, 'hq_city.py')}
exec(compile(src, os.path.join(HERE, 'hq_city.py'), 'exec'), g)
