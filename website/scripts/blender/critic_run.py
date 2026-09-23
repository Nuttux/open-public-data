"""Test harness for the render critic: builds a hq_scene.py scene ONCE, then
renders an overview and several crops of the same framing (the crops at the
full judgement resolution, via the render border), so a before/after costs
one scene build.

blender -b -P critic_run.py -- <scene> <out_prefix> <spp> <W> <H>
env: same as hq_scene.py, plus
  OV=1600x1000              overview size (0 = none)
  CROPS=name:x0,y0,x1,y1;…  crops in PIXELS of the W x H frame (y from the top)
"""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, 'hq_scene.py')).read()
src = src.replace("t1 = time.time(); bpy.ops.render.render(write_still=True)", "t1 = time.time()")
src = src.replace("if E('SAVE_BLEND'):", "if False:")
g = {'__name__': '__main__', '__file__': os.path.join(HERE, 'hq_scene.py')}
exec(compile(src, 'hq_scene.py', 'exec'), g)
bpy, sc, E, OUT, W, H, log = g['bpy'], g['sc'], g['E'], g['OUT'], g['W'], g['H'], g['log']
ov = E('OV', '1600x1000')
if ov and ov != '0':
    ow, oh = [int(v) for v in ov.split('x')]
    sc.render.use_border = False; sc.render.resolution_x, sc.render.resolution_y = ow, oh
    sc.render.filepath = f'{OUT}_ov.png'; t = time.time(); bpy.ops.render.render(write_still=True)
    log(f'overview {ow}x{oh} {time.time() - t:.1f}s')
for spec in [c for c in E('CROPS', '').split(';') if c]:
    name, box = spec.split(':'); x0, y0, x1, y1 = [float(v) for v in box.split(',')]
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x = x0 / W, x1 / W
    sc.render.border_min_y, sc.render.border_max_y = 1 - y1 / H, 1 - y0 / H
    sc.render.filepath = f'{OUT}_{name}.png'; t = time.time(); bpy.ops.render.render(write_still=True)
    log(f'crop {name} {time.time() - t:.1f}s')
