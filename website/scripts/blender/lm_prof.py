"""Where does a pyramid frame's render time go? Renders the frame the pyramid
loop was about to render as variants, at RES_PCT per cent, and logs each
time split into its phases (scene sync / BVH, path tracing, denoising) from
Cycles' own status line (the landmarks agent's profiling, through lm_run.py
LM_PROF=1).

The pyramid keeps persistent data, so only the FIRST render pays the scene's
sync and BVH: compare the variants with 'warm' (the base again), not 'base'.
Variants (LM_VARIANTS, comma list): base, warm, coarse (terrain decimated
1/10), nosurround, noterrain, flatground (terrain in a plain diffuse),
noadapt, nolm (the landmarks hidden), notrees."""
import os, time

class Phases:
    """timestamps of the phase changes in Cycles' status line"""
    def __init__(self): self.ev = []
    def __call__(self, s, *a):
        try:
            txt = s if isinstance(s, str) else str(s)
            ph = ('denoise' if 'enois' in txt else 'sample' if 'Sample' in txt else
                  'bvh' if 'BVH' in txt else 'sync' if ('Synchron' in txt or 'Updating' in txt or 'Loading' in txt) else None)
            if ph and (not self.ev or self.ev[-1][1] != ph): self.ev.append((time.time(), ph, txt[-60:]))
        except Exception:
            pass
    def split(self, t0, t1):
        out = {}
        ev = [(t0, 'start', '')] + self.ev + [(t1, 'end', '')]
        for (a, pa, _), (b, _, _) in zip(ev, ev[1:]): out[pa] = out.get(pa, 0.0) + (b - a)
        return {k: round(v, 1) for k, v in out.items()}

def variants(bpy, sc, log, fn):
    E = os.environ.get
    sc.render.resolution_percentage = int(E('RES_PCT', 50))
    todo = [v for v in E('LM_VARIANTS', 'base,warm,flatground,nosurround,noterrain').split(',') if v]
    ter = sc.objects.get('terrain'); sur = sc.objects.get('surround')
    log('prof: terrain faces', len(ter.data.polygons) if ter else None, 'surround faces', len(sur.data.polygons) if sur else None,
        'objects', len(sc.objects))
    P = Phases()
    try: bpy.app.handlers.render_stats.append(P)
    except Exception as ex: log('prof: no render_stats handler', ex)
    def run(tag):
        sc.render.filepath = fn.replace('.png', f'_{tag}.png')
        P.ev = []
        t1 = time.time(); bpy.ops.render.render(write_still=True); t2 = time.time()
        log(f'PROF {tag}: {t2 - t1:.1f}s at {sc.render.resolution_percentage}%  phases {P.split(t1, t2)}')
    for v in todo:
        undo = []
        def hide(obs):
            obs = [o for o in obs if o is not None and not o.hide_render]
            for o in obs: o.hide_render = True
            undo.append(lambda obs=obs: [setattr(o, 'hide_render', False) for o in obs])
        if v == 'coarse' and ter is not None:
            m = ter.modifiers.new('dec', 'DECIMATE'); m.ratio = 0.1; undo.append(lambda m=m: ter.modifiers.remove(m))
        if v == 'nosurround': hide([sur])
        if v == 'noterrain': hide([ter, sur])
        if v == 'notrees': hide([o for o in sc.objects if o.name == 'trees' or o.name.startswith('lmtree')])
        if v == 'nolm': hide([o for o in sc.objects if o.name.startswith('lm.')])
        if v == 'flatground' and ter is not None:
            old = ter.data.materials[0]
            fm = bpy.data.materials.new('flat'); fm.use_nodes = True
            fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.2, 0.25, 0.12, 1)
            ter.data.materials[0] = fm; undo.append(lambda old=old: ter.data.materials.__setitem__(0, old))
        if v == 'noadapt':
            sc.cycles.use_adaptive_sampling = False; undo.append(lambda: setattr(sc.cycles, 'use_adaptive_sampling', True))
        run(v)
        for u in undo: u()
