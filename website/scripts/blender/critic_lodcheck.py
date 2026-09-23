"""Generator smoke test for the render critic: runs gen_buildings over every
record of a box at the city's LOD (2) and at LOD 0, flat ground, no scene,
no render, and reports exceptions and face counts per material — so a
committed generator never silently drops buildings in hq_city.py (which
skips a building whose generation raises).
blender -b -P critic_lodcheck.py -- x0,y0,x1,y1 [lod,lod]"""
import os, sys, time, traceback, collections
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
if os.environ.get("GEN_DIR"): sys.path.insert(0, os.environ["GEN_DIR"])
import gen_buildings as G
import city_data
argv = sys.argv[sys.argv.index('--') + 1:]
x0, y0, x1, y1 = [float(v) for v in argv[0].split(',')]
lods = [int(v) for v in (argv[1] if len(argv) > 1 else '2,0').split(',')]
recs = city_data.buildings(x0, y0, x1, y1)
print('records', len(recs), flush=True)
for lod in lods:
    G.LOD = lod; t = time.time(); out = G.Out(); errs = collections.Counter(); ex1 = {}
    for b in recs:
        try: G.building(b, lambda x, y: 0.0, out)
        except Exception as ex:
            k = f'{type(ex).__name__}: {ex}'; errs[k] += 1
            if k not in ex1: ex1[k] = traceback.format_exc()
    faces = {k: len(v[1]) for k, v in out.m.items() if v[1]}
    bad = [k for k, v in out.m.items() if v[1] and k not in G.MATS]
    print(f'LOD {lod}: {time.time() - t:.1f}s faces {sum(faces.values())} errors {sum(errs.values())}', flush=True)
    print('  per material', faces)
    for k, n in errs.most_common(8): print(f'  {n} x {k}\n{ex1[k]}')
    # every colour must be RGB or RGBA
    for k, (V, F, C) in out.m.items():
        badc = [c for c in C if len(c) not in (3, 4)]
        if badc: print('  BAD COLOURS in', k, badc[:3])
