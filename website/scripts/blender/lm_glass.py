"""GLASS v2 for the landmark towers (assets_trees_glass, 27/09): a real CURTAIN
WALL instead of a tinted mirror.

Why: the AI pass read our tower glass as SEE-THROUGH (555 California, the
towers around 181 Fremont). The v1 'curtain_wall' material is one smooth tinted
mirror per face: from our 29 deg camera it mirrors the street, the trees and the
towers across, and a pane full of trees reads as a hole through the building.
A real curtain wall from above is a GRID: aluminium mullions every ~1.5 m, a
transom and an opaque SPANDREL band at each floor (the slab edge, painted or
fritted back glass), vision glass between them that is tinted, dark-bodied and
only softly reflective (every pane a little out of plane, so the reflection
breaks pane by pane), blinds drawn in some panes.

What this module does (GLASS_V2=1, default; 0 = everything as before):
  materials(bpy, mats)  adds 'lm_curtain' (mullions + transoms + spandrels +
      vision glass) and 'lm_glazing' (the same glass and mullions, no spandrel:
      for punched windows and ribbon bands, which already have their wall)
  remap(K)  before the landmark Kit is emitted, moves every 'curtain_wall' face
      to one of them: a small quad (punched window, <= 2.4 m wide) or a ribbon
      band (<= 4.6 m tall) whose tint alpha is fam's window 0.5 -> lm_glazing;
      every other vertical glass face -> lm_curtain; sloped / flat glass stays.
The tint (rgb) and coating (alpha: how mirror-like) come from the face colour
('bcol'), as before, so every tower keeps its own glass.
The sky term (BAR 24/09: a soft sky gradient, warm toward the sun's side, pale
blue-grey away, weighted by Fresnel, never a flat paint) is kept on the vision
glass only, over the city's real (now softer) reflection.
Knobs (env): GLASS_MU mullion module m (1.52), GLASS_FH floor m (3.95),
GLASS_SPAN spandrel height m (1.15), GLASS_REFL reflection gain (1.0),
GLASS_BLIND share of panes with blinds (0.22), GLASS_SKYK sky term (0.34)."""
import math, os

E = lambda k, d: float(os.environ.get(k, d))
ON = os.environ.get('GLASS_V2', '1') == '1'


def remap(K):
    """move the Kit's 'curtain_wall' faces to lm_curtain / lm_glazing (in place)"""
    if not ON or 'curtain_wall' not in K.m: return {}
    V, F, C, S = K.m.pop('curtain_wall')
    n = {'lm_curtain': 0, 'lm_glazing': 0, 'curtain_wall': 0}
    for f, c, s in zip(F, C, S):
        P = [V[i] for i in f]
        zs = [p[2] for p in P]; dz = max(zs) - min(zs)
        # the face normal (Newell)
        nx = ny = nz = 0.0
        for i in range(len(P)):
            a, b = P[i], P[(i + 1) % len(P)]
            nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1])
        ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
        if abs(nz / ln) > 0.5 or dz < 0.2:
            key = 'curtain_wall'
        else:
            wh = max(math.hypot(p[0] - q[0], p[1] - q[1]) for p in P for q in P)
            win = abs(c[3] - 0.5) < 0.011 and ((len(f) == 4 and wh <= 2.4 and dz <= 4.6) or dz <= 4.6)
            key = 'lm_glazing' if win else 'lm_curtain'
        g = K._g(key); k0 = len(g[0]); g[0].extend(P); g[1].append(tuple(range(k0, k0 + len(P)))); g[2].append(c); g[3].append(s)
        n[key] += 1
    return n


def _sky(nt, pr, k, rnd, mask, mat):
    """the soft sky gradient on panes whose mirror ray points down (as
    hq_scene.sky_term), times `mask` (vision glass only)"""
    def N(t, **kw):
        n_ = nt.nodes.new(t)
        for a, v in kw.items(): setattr(n_, a, v)
        return n_
    L = nt.links.new
    geo = N('ShaderNodeNewGeometry')
    neg = N('ShaderNodeVectorMath', operation='SCALE'); L(geo.outputs['Incoming'], neg.inputs[0]); neg.inputs['Scale'].default_value = -1.0
    rf = N('ShaderNodeVectorMath', operation='REFLECT'); L(neg.outputs[0], rf.inputs[0]); L(geo.outputs['Normal'], rf.inputs[1])
    sp = N('ShaderNodeSeparateXYZ'); L(rf.outputs[0], sp.inputs[0])
    # how far down the mirror ray points: a gradient, not a switch (a steeper
    # ray sees a paler, bluer sky high up; a grazing one the warm horizon)
    dn = N('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP'); L(sp.outputs[2], dn.inputs[0])
    dn.inputs[1].default_value = 0.05; dn.inputs[2].default_value = -0.6; dn.inputs[3].default_value = 0.0; dn.inputs[4].default_value = 1.0
    hz = N('ShaderNodeCombineXYZ'); L(sp.outputs[0], hz.inputs[0]); L(sp.outputs[1], hz.inputs[1])
    hn = N('ShaderNodeVectorMath', operation='NORMALIZE'); L(hz.outputs[0], hn.inputs[0])
    a_ = math.radians(215.0)
    dt = N('ShaderNodeVectorMath', operation='DOT_PRODUCT'); L(hn.outputs[0], dt.inputs[0]); dt.inputs[1].default_value = (math.sin(a_), math.cos(a_), 0.0)
    wm = N('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP'); L(dt.outputs['Value'], wm.inputs[0]); wm.inputs[1].default_value = -0.2; wm.inputs[2].default_value = 1.0
    col = N('ShaderNodeMix', data_type='RGBA'); L(wm.outputs[0], col.inputs[0])
    col.inputs[6].default_value = (0.56, 0.65, 0.78, 1.0); col.inputs[7].default_value = (0.98, 0.84, 0.66, 1.0)
    # up the pane: a touch bluer and paler (the zenith), down: the warm haze
    lw = N('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
    m1 = N('ShaderNodeMath', operation='MULTIPLY'); L(dn.outputs[0], m1.inputs[0]); L(lw.outputs['Fresnel'], m1.inputs[1])
    m2 = N('ShaderNodeMath', operation='MULTIPLY'); L(m1.outputs[0], m2.inputs[0]); m2.inputs[1].default_value = k
    rr = N('ShaderNodeMapRange'); L(rnd, rr.inputs[0]); rr.inputs[3].default_value = 0.6; rr.inputs[4].default_value = 1.4
    m3 = N('ShaderNodeMath', operation='MULTIPLY'); L(m2.outputs[0], m3.inputs[0]); L(rr.outputs[0], m3.inputs[1])
    m4 = N('ShaderNodeMath', operation='MULTIPLY'); L(m3.outputs[0], m4.inputs[0]); L(mask, m4.inputs[1])
    L(col.outputs[2], pr.inputs['Emission Color']); L(m4.outputs[0], pr.inputs['Emission Strength'])
    try: mat.cycles.emission_sampling = 'NONE'
    except Exception: pass


def _material(bpy, name, spandrel=True):
    m = bpy.data.materials.get(name)
    if m is not None: return m
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; Nn = nt.nodes; L = nt.links.new
    pr = Nn.get('Principled BSDF')
    def N(t, **kw):
        n_ = Nn.new(t)
        for a, v in kw.items(): setattr(n_, a, v)
        return n_
    def M(op, a, b=None, clamp=False):
        n_ = N('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n_.inputs[i].default_value = v
            else: L(v, n_.inputs[i])
        return n_.outputs[0]
    def MIX(f, a, b):
        n_ = N('ShaderNodeMix', data_type='RGBA')
        for i, v in ((0, f), (6, a), (7, b)):
            if isinstance(v, (int, float)): n_.inputs[i].default_value = v
            elif isinstance(v, tuple): n_.inputs[i].default_value = v if len(v) == 4 else (*v, 1.0)
            else: L(v, n_.inputs[i])
        return n_.outputs[2]
    def MIXF(f, a, b):
        n_ = N('ShaderNodeMix', data_type='FLOAT')
        for i, v in ((0, f), (2, a), (3, b)):
            if isinstance(v, (int, float)): n_.inputs[i].default_value = v
            else: L(v, n_.inputs[i])
        return n_.outputs[0]
    MU, FH, SPN = E('GLASS_MU', 1.52), E('GLASS_FH', 3.95), E('GLASS_SPAN', 1.15)
    at = N('ShaderNodeAttribute', attribute_name='bcol'); tint = at.outputs['Color']; coat = at.outputs['Alpha']
    geo = N('ShaderNodeNewGeometry')
    pos = N('ShaderNodeSeparateXYZ'); L(geo.outputs['Position'], pos.inputs[0])
    tn = N('ShaderNodeSeparateXYZ'); L(geo.outputs['True Normal'], tn.inputs[0])
    ax = M('ABSOLUTE', tn.outputs[0]); ay = M('ABSOLUTE', tn.outputs[1])
    h = M('SQRT', M('ADD', M('MULTIPLY', ax, ax), M('MULTIPLY', ay, ay)))
    sel = M('GREATER_THAN', ay, ax)          # the face runs mostly along x
    ux = M('DIVIDE', M('MULTIPLY', pos.outputs[0], h), M('MAXIMUM', ay, 0.05))
    uy = M('DIVIDE', M('MULTIPLY', pos.outputs[1], h), M('MAXIMUM', ax, 0.05))
    u = MIXF(sel, uy, ux)                    # metres along the face
    z = pos.outputs[2]
    cu = M('DIVIDE', u, MU); cv = M('DIVIDE', z, FH)
    fu = M('FRACT', cu); fv = M('FRACT', cv)
    # the pane id: its column and floor -> a draw per pane
    pid = N('ShaderNodeCombineXYZ'); L(M('FLOOR', cu), pid.inputs[0]); L(M('FLOOR', cv), pid.inputs[1])
    wn = N('ShaderNodeTexWhiteNoise', noise_dimensions='3D'); L(pid.outputs[0], wn.inputs['Vector'])
    rnd = wn.outputs['Value']; rv = wn.outputs['Color']
    rs = N('ShaderNodeSeparateXYZ'); L(rv, rs.inputs[0])
    # mullions (7 cm caps) and transoms: a thin line at each module and floor
    mw = 0.036 / MU
    mull = M('MAXIMUM', M('LESS_THAN', fu, mw), M('GREATER_THAN', fu, 1 - mw))
    tw = 0.045 / FH
    trans = M('MAXIMUM', M('LESS_THAN', fv, tw), M('GREATER_THAN', fv, 1 - tw))
    if spandrel:
        sp_top = SPN / FH
        span = M('LESS_THAN', fv, sp_top)
        trans = M('MAXIMUM', trans, M('MULTIPLY', M('GREATER_THAN', fv, sp_top - tw * 0.8), M('LESS_THAN', fv, sp_top + tw * 0.8)))
    else:
        span = M('MULTIPLY', fv, 0.0)
    frame = M('MAXIMUM', mull, trans)                       # aluminium
    vis = M('MULTIPLY', M('SUBTRACT', 1.0, frame), M('SUBTRACT', 1.0, span))    # vision glass
    # colours. Vision glass: the tint, dark-bodied (the room behind absorbs),
    # each pane a shade lighter or darker; a blind in some panes (a pale, matte
    # band in the pane's upper part, like an occupied office from outside)
    pv = N('ShaderNodeMapRange'); L(rnd, pv.inputs[0]); pv.inputs[3].default_value = 0.78; pv.inputs[4].default_value = 1.18
    body = N('ShaderNodeVectorMath', operation='SCALE'); L(tint, body.inputs[0]); L(pv.outputs[0], body.inputs['Scale'])
    body_c = MIX(0.0, body.outputs[0], body.outputs[0])
    bl_on = M('LESS_THAN', rs.outputs[1], E('GLASS_BLIND', 0.22))
    bl_lo = M('ADD', M('MULTIPLY', rs.outputs[2], 0.45), 0.35)       # the blind drawn down to 35-80 % of the pane
    pane_v = M('DIVIDE', M('SUBTRACT', fv, SPN / FH if spandrel else 0.0), 1.0 - (SPN / FH if spandrel else 0.0))
    blind = M('MULTIPLY', bl_on, M('GREATER_THAN', pane_v, bl_lo))
    blind_c = MIX(0.55, body_c, (0.46, 0.45, 0.42))
    vis_c = MIX(blind, body_c, blind_c)
    # spandrel: opaque painted back glass, the tint greyed and a little lighter, matte-ish
    span_c = MIX(0.45, tint, (0.30, 0.31, 0.32))
    # the frame: anodised aluminium, a mid grey leaning to the glass
    frame_c = MIX(0.7, tint, (0.42, 0.43, 0.44))
    c1 = MIX(span, vis_c, span_c)
    base = MIX(frame, c1, frame_c)
    L(base, pr.inputs['Base Color'])
    # how mirror-like: the coating (alpha) on the vision glass, less on the
    # spandrel, the frame a satin metal
    gk = E('GLASS_REFL', 1.0)
    met_v = M('MINIMUM', M('ADD', 0.08, M('MULTIPLY', coat, 0.55 * gk)), 0.75)
    met_s = M('MULTIPLY', met_v, 0.55)
    met = MIXF(frame, MIXF(span, met_v, met_s), 0.65)
    L(met, pr.inputs['Metallic'])
    # roughness: soft reflections that break pane by pane (a pane full of sharp
    # trees read as a hole through the tower)
    rgh_v = M('ADD', 0.07, M('MULTIPLY', rs.outputs[0], 0.14))
    rgh = MIXF(frame, MIXF(span, rgh_v, 0.32), 0.38)
    L(rgh, pr.inputs['Roughness'])
    try: pr.inputs['Specular IOR Level'].default_value = 1.0
    except KeyError: pass
    try: pr.inputs['Coat Weight'].default_value = 0.0
    except KeyError: pass
    # every pane a little out of plane (oil canning), the frame proud of the glass
    off = N('ShaderNodeVectorMath', operation='SUBTRACT'); L(rv, off.inputs[0]); off.inputs[1].default_value = (0.5, 0.5, 0.5)
    sc_ = N('ShaderNodeVectorMath', operation='SCALE'); L(off.outputs[0], sc_.inputs[0]); sc_.inputs['Scale'].default_value = 0.09
    ad = N('ShaderNodeVectorMath', operation='ADD'); L(geo.outputs['Normal'], ad.inputs[0]); L(sc_.outputs[0], ad.inputs[1])
    nz_ = N('ShaderNodeVectorMath', operation='NORMALIZE'); L(ad.outputs[0], nz_.inputs[0])
    bp = N('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.6; bp.inputs['Distance'].default_value = 0.04
    L(frame, bp.inputs['Height']); L(nz_.outputs[0], bp.inputs['Normal'])
    L(bp.outputs['Normal'], pr.inputs['Normal'])
    if os.environ.get('GLASS_SKY', '1') == '1':
        _sky(nt, pr, E('GLASS_SKYK', 0.34), rnd, vis, m)
    return m


def materials(bpy, mats):
    if not ON: return
    mats['lm_curtain'] = _material(bpy, 'lm_curtain', spandrel=True)
    mats['lm_glazing'] = _material(bpy, 'lm_glazing', spandrel=False)
