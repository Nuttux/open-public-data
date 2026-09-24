"""What is at a pixel of a pyramid frame? Casts the camera's own rays at
frame pixels (LM_PROBE='u,v;u,v;...', 5120 x 3072 frame pixels, y from the
top) once the scene stands, and logs the object, material and hit point of
each, then exits without rendering (the landmarks agent's diagnostics,
through lm_run.py LM_PROBE=...)."""
import os

def probe(bpy, sc, log, spec):
    from mathutils import Vector
    bpy.context.view_layer.update()          # the camera was just moved: refresh matrix_world
    cam = sc.camera; cd = cam.data
    W, H = sc.render.resolution_x, sc.render.resolution_y
    M = cam.matrix_world; R = M.to_3x3()
    right = (R @ Vector((1, 0, 0))).normalized(); up = (R @ Vector((0, 1, 0))).normalized(); fwd = (R @ Vector((0, 0, -1))).normalized()
    wd = cd.ortho_scale; ht = wd * H / W
    dg = bpy.context.evaluated_depsgraph_get()
    for tok in spec.split(';'):
        if not tok.strip(): continue
        u, v = (float(t) for t in tok.split(','))
        o = M.translation + right * ((u / W - 0.5) * wd) + up * ((0.5 - v / H) * ht)
        seen = []
        oo = o.copy()
        for _ in range(4):           # the first surfaces along the ray, transparent or not
            hit, loc, nor, idx, ob, _m = sc.ray_cast(dg, oo, fwd)
            if not hit: break
            mat = '-'
            try:
                me = ob.data
                if hasattr(me, 'polygons') and idx < len(me.polygons):
                    mi = me.polygons[idx].material_index
                    mat = me.materials[mi].name if mi < len(me.materials) and me.materials[mi] else '-'
            except Exception: pass
            seen.append(f'{ob.name}[{mat}] ({loc.x:.1f}, {loc.y:.1f}, {loc.z:.2f}) n.z={nor.z:.2f}')
            oo = loc + fwd * 0.02
        log(f'PROBE {u:.0f},{v:.0f}: ' + ' | '.join(seen or ['nothing']))
