"""WATER v5 (WATER_V5=1, default off): the bay as it reads in real aerials, deterministic, no AI. 29/09, water2 agent [blender].

Why v4f read flat (Daniel 29/09): one uniform saturated blue body bright enough to drown the reflections; nothing varied over
hundreds of metres. With the map camera (orthographic, looking north 30.7 deg below the horizon) every water point sees the SAME sky
direction, so all large-scale variation must come from the water itself:
  large scale  world-keyed fields: wind lanes (0.5-2 km, streaked downwind), cat's paws (~100 m gusts), narrow slicks along the wind,
               the current lines of sea_fld (G): they set the wave amplitude AND the GGX roughness, so rough patches mirror a wider,
               brighter sky and glitter, slicks mirror the darker sky smoothly: the patches you see from far on a real bay.
  reflection   Fresnel (IOR 1.333) on the wave normal: ~5.6 % at this view angle, sky + the scene (piers, hulls, sheds), made
               visible by a darker, turbid body (the body is what drowned them in v4f).
  colour       turbid bay body by depth (v4_depth) and distance to shore: blue-grey offshore, greener over the shallows, darker and
               greener near walls; km-scale turbidity patches (hue and value); lit on a flat normal.
  shadows      v4f's shadowed water (AO turned to the sun): darker and neutral under piers / in the lee of walls (murky).
  contact foam a thin broken foam line where the water meets anything standing in it (walls, pilings, hulls): a short-range AO.
  glint        NOT painted: the scene's sun (az 215, el 50 in LOOK V6) is behind this camera; a glint needs ~48 deg facets (6 sigma of
               a 6 m/s bay chop), so physically there is no glint band in this view; the renderer places the rare sparkles itself.
  haze         none: an orthographic camera puts every point at the same distance (a distance haze would not be consistent across tiles).
Wakes: untouched (life_wake / life_hq, another agent). Reuses water_v4 (FFT wave tiles, depth map, shadow code knobs).
Knobs: V5_DEEP, V5_SHAL, V5_SHORE (linear rgb), V5_K, V5_TURB, V5_LANE, V5_PAW, V5_SLICK, V5_R0, V5_R1, V5_AMP0, V5_AMP1, V5_REFL,
V5_FOAM, V5_FOAM_D, V4_SHADE / V4_SHADE_D / V4_SHADE_K (shadows), V4_FSLOPE (wave slope).
"""
import json, math, os

def E(k, v=None): return os.environ.get(k, v)
def F(k, v): return float(os.environ.get(k, v))
def T(k, v): return tuple(float(x) for x in os.environ.get(k, v).split(','))


def water(bpy, N, pos, extra, flat, img, shore_dist, WD):
    import water_v4 as V4
    g = json.load(open(os.path.join(WD, 'sea.json')))
    w_, h_ = g['x1'] - g['x0'], g['y1'] - g['y0']
    uv = N.mapping(pos, loc=(-g['x0'] / w_, -g['y0'] / h_, 0), scale=(1 / w_, 1 / h_, 1))
    tf = N.n('ShaderNodeTexImage', image=img(bpy, 'sea_fld.png'), extension='EXTEND', interpolation='Cubic'); N.L(uv, tf.inputs[0])
    sp = N.n('ShaderNodeSeparateColor'); N.L(tf.outputs['Color'], sp.inputs[0])
    wind, cur, pac = sp.outputs[0], sp.outputs[1], sp.outputs[2]
    wt = g.get('wind_to', [0.94, -0.34]); wang = math.atan2(wt[1], wt[0])
    rot = N.mapping(pos, rot=(0, 0, -wang))
    sx = N.n('ShaderNodeSeparateXYZ'); N.L(pos, sx.inputs[0]); X, Y = sx.outputs[0], sx.outputs[1]
    # ── the large-scale wind field (0 slick .. ~1.3 rough), world-keyed
    lane = N.noise(N.mapping(rot, loc=(-517.0, 3301.0, 0), scale=(0.3, 1.0, 1.0)), 1 / 900.0, detail=3.0, rough=0.55)
    paw = N.noise(N.mapping(rot, loc=(211.0, 97.0, 0), scale=(0.5, 1.0, 1.0)), 1 / 120.0, detail=3.0, rough=0.6)
    sl_n = N.noise(N.mapping(rot, loc=(1733.0, -419.0, 0), scale=(0.35, 1.0, 1.0)), 1 / 260.0, detail=3.0, rough=0.55, dist=0.6)
    slick = N.m('MULTIPLY', N.smooth(F('V5_SLW', 0.09), 0.02, N.m('ABSOLUTE', N.m('SUBTRACT', sl_n, 0.5))), F('V5_SLICK', 0.55))   # meandering slick bands (~10-30 m), soft
    slick = N.m('MAXIMUM', slick, N.m('MULTIPLY', cur, 0.7))                                                       # + the current lines
    gust = N.smooth(0.30, 0.75, N.m('ADD', N.m('MULTIPLY', lane, F('V5_LANE', 0.6)), N.m('MULTIPLY', paw, F('V5_PAW', 0.4))))
    Wf = N.m('MULTIPLY', N.m('ADD', F('V5_W0', 0.2), N.m('MULTIPLY', gust, F('V5_W1', 1.3))), N.m('ADD', 0.6, N.m('MULTIPLY', wind, 0.6)))
    Wf = N.m('MULTIPLY', Wf, N.m('SUBTRACT', 1.0, N.m('MULTIPLY', slick, 0.8)))
    RL = None
    rj = os.path.join(WD, 'v5r.json')
    if E('V5_REAL', '0') == '1' and os.path.exists(rj):
        # approach A (29/09): the REAL bay's large-scale pattern (water_v5_s2_prep.py: Copernicus Sentinel-2 L2A, 10 m, boats / wakes
        # removed) drives the wind field and the body tone; faded out near the shore (mixed pixels at piers / walls)
        rq = json.load(open(rj)); rw, rh = rq['x1'] - rq['x0'], rq['y1'] - rq['y0']
        ruv = N.mapping(pos, loc=(-rq['x0'] / rw, -rq['y0'] / rh, 0), scale=(1 / rw, 1 / rh, 1))
        def rtex(nm):
            ti = N.n('ShaderNodeTexImage', image=img(bpy, nm), extension='EXTEND', interpolation='Cubic'); N.L(ruv, ti.inputs[0])
            sp_ = N.n('ShaderNodeSeparateColor'); N.L(ti.outputs['Color'], sp_.inputs[0]); return sp_.outputs[0]
        rro = rtex('v5r_rough.png'); rr, rg_, rb = (N.m('MULTIPLY', rtex('v5r_colr.png'), 2.0), N.m('MULTIPLY', rtex('v5r_colg.png'), 2.0), N.m('MULTIPLY', rtex('v5r_colb.png'), 2.0))
        ds0 = shore_dist(bpy, N, pos); wr = N.smooth(15.0, 60.0, ds0) if ds0 is not None else 1.0
        Wf = N.lerp(N.m('MULTIPLY', wr, F('V5R_ROUGH', 0.8)), Wf, N.m('ADD', 0.15, N.m('MULTIPLY', rro, 1.6)))
        RL = (rr, rg_, rb, wr)
    # ── the wave height field: water_v4's JONSWAP FFT tiles (one orientation), amplitude x the wind field; the low Gate swell
    wj = os.path.join(WD, 'v4_waves.json'); q = json.load(open(wj))['tiles']; h = None; fs = F('V4_FSLOPE', 0.085)
    for (name, t), off in zip(sorted(q.items()), ((0.37, 0.11), (0.71, 0.53))):
        mp = N.mapping(pos, loc=(off[0], off[1], 0), rot=(0, 0, -wang), scale=(1 / t['L'], 1 / t['L'], 1))
        ti = N.n('ShaderNodeTexImage', image=img(bpy, name + '.png'), extension='REPEAT', interpolation='Cubic'); N.L(mp, ti.inputs[0])
        sp_ = N.n('ShaderNodeSeparateColor'); N.L(ti.outputs['Color'], sp_.inputs[0])
        ht = N.m('MULTIPLY', N.m('ADD', t['lo'], N.m('MULTIPLY', sp_.outputs[0], t['hi'] - t['lo'])), fs)
        h = ht if h is None else N.m('ADD', h, ht)
    h = N.m('MULTIPLY', h, N.m('ADD', F('V5_AMP0', 0.25), N.m('MULTIPLY', Wf, F('V5_AMP1', 0.85))))
    warp1 = N.m('SUBTRACT', N.noise(N.mapping(pos, loc=(53.0, 17.0, 0)), 1 / 23.0, detail=2.0), 0.5)
    for lam, dth, a in ((31.0, 0.0, 0.05), (18.0, 14.0, 0.03)):
        th = math.radians(dth); k = 2 * math.pi / lam
        arg = N.m('ADD', N.m('ADD', N.m('MULTIPLY', X, k * math.cos(th)), N.m('MULTIPLY', Y, k * math.sin(th))), N.m('MULTIPLY', warp1, 4.0))
        h = N.m('ADD', h, N.m('MULTIPLY', N.m('SINE', arg), a))
    bm = N.n('ShaderNodeBump', i_Distance=1.0, i_Strength=1.0)
    if flat is not None: N.L(flat, bm.inputs['Normal'])
    N.L(h, bm.inputs['Height']); normal = bm.outputs[0]
    rough = N.m('ADD', F('V5_R0', 0.03), N.m('MULTIPLY', Wf, F('V5_R1', 0.2)))       # slick mirror .03 .. rough, silvery ~.2
    # ── the body colour: turbid bay by depth / shore / turbidity patches
    deep, shal, shore = T('V5_DEEP', '0.016,0.040,0.058'), T('V5_SHAL', '0.024,0.044,0.040'), T('V5_SHORE', '0.012,0.026,0.024')
    dep = V4.depth(bpy, N, pos, WD, img); dsh = shore_dist(bpy, N, pos)
    fsh = N.smooth(9.0, 2.0, dep) if dep is not None else 0.0
    col = N.mix(fsh, deep, shal)
    if dsh is not None: col = N.mix(N.m('MULTIPLY', N.smooth(F('V5_SHORE_M', 60.0), 3.0, dsh), 0.9), col, shore)
    tb = N.noise(N.mapping(pos, loc=(401.0, 233.0, 0)), 1 / 1400.0, detail=3.0, rough=0.55)
    tb = N.smooth(0.30, 0.70, tb)   # v5c: noise stretched to full contrast (Perlin fac sits near .5: +-6 % was invisible from far)
    tv = N.m('ADD', 1.0 - 0.5 * F('V5_TURB', 0.35), N.m('MULTIPLY', tb, F('V5_TURB', 0.35)))                    # value +-17 %
    green = N.n('ShaderNodeCombineXYZ', i_X=1.0, i_Y=1.0, i_Z=1.0); tg = N.m('SUBTRACT', 1.15, N.m('MULTIPLY', tb, 0.3))   # hue: greener where turbid
    N.L(N.m('MULTIPLY', tg, 0.93), green.inputs['X']); N.L(tg, green.inputs['Y']); N.L(N.m('SUBTRACT', 2.0, tg), green.inputs['Z'])
    col = N.vmath('MULTIPLY', col, green.outputs[0])
    tv = N.m('MULTIPLY', tv, N.m('SUBTRACT', 1.0, N.m('MULTIPLY', N.smooth(0.3, 1.3, Wf), F('V5_ROUGHDARK', 0.18))))
    kk = F('V5_K', 1.6); kv = N.n('ShaderNodeCombineXYZ'); [N.L(N.m('MULTIPLY', tv, kk), kv.inputs[i]) for i in range(3)]
    if RL is not None:   # the real tone (luminance pattern) and a share of its hue, x our palette
        rr, rg_, rb, wr = RL; lum = N.m('ADD', N.m('ADD', N.m('MULTIPLY', rr, 0.2126), N.m('MULTIPLY', rg_, 0.7152)), N.m('MULTIPLY', rb, 0.0722))
        hl = F('V5R_HUE', 0.35); lk = F('V5R_L', 0.8); rv = N.n('ShaderNodeCombineXYZ')
        for i_, ch in enumerate((rr, rg_, rb)):
            f_ = N.m('MULTIPLY', N.lerp(lk, 1.0, lum), N.lerp(hl, 1.0, N.m('DIVIDE', ch, N.m('MAXIMUM', lum, 0.05))))
            N.L(N.lerp(wr, 1.0, f_), rv.inputs[i_])
        col = N.vmath('MULTIPLY', col, rv.outputs[0])
    col = N.vmath('MULTIPLY', col, kv.outputs[0])
    # shadowed water (v4f): darker and neutral where the sun is blocked (under piers, in the lee of walls)
    if F('V4_SHADE', 0.7) > 0:
        az_, el_ = math.radians(F('SUN_AZ', 215)), math.radians(F('SUN_EL', 24))
        ts = (math.sin(az_) * math.cos(el_), math.cos(az_) * math.cos(el_), math.sin(el_))
        sa = N.n('ShaderNodeAmbientOcclusion', i_Distance=F('V4_SHADE_D', 60.0)); sa.samples = 16; sa.only_local = False
        N.L(N.n('ShaderNodeCombineXYZ', i_X=ts[0], i_Y=ts[1], i_Z=ts[2]).outputs[0], sa.inputs['Normal'])
        a0 = (1 + math.sin(el_)) / 2
        sh_ = N.m('MULTIPLY', N.smooth(a0 * 0.97, a0 * 0.70, sa.outputs['AO']), F('V4_SHADE', 0.7))
        bw = N.n('ShaderNodeRGBToBW'); N.L(col, bw.inputs[0])
        grey = N.n('ShaderNodeCombineXYZ'); [N.L(N.m('MULTIPLY', bw.outputs[0], F('V4_SHADE_K', 0.55)), grey.inputs[i]) for i in range(3)]
        col = N.mix(sh_, col, grey.outputs[0])
    parts = dict(wind=wind, cur=cur, pac=pac, col=col, rough=rough, normal=normal, rot=rot)
    if extra: extra(N, parts)
    # ── optics: body on a flat normal, Fresnel glossy (sky + scene) on the waves
    upn = N.n('ShaderNodeCombineXYZ', i_X=0.0, i_Y=0.0, i_Z=1.0).outputs[0] if flat is None else flat
    dif = N.n('ShaderNodeBsdfDiffuse'); N.L(parts['col'], dif.inputs['Color']); N.L(upn, dif.inputs['Normal'])
    gl = N.n('ShaderNodeBsdfGlossy', distribution='GGX'); gl.inputs['Color'].default_value = (1, 1, 1, 1)
    N.L(parts['rough'], gl.inputs['Roughness']); N.L(parts['normal'], gl.inputs['Normal'])
    fr = N.n('ShaderNodeFresnel', i_IOR=1.333); N.L(parts['normal'], fr.inputs['Normal'])
    sheen = N.m('ADD', 1.0, N.m('MULTIPLY', N.smooth(0.3, 1.3, Wf), F('V5_SHEEN', 1.6)))   # rough patches: facets tilted to grazing -> higher mean Fresnel
    b = N.n('ShaderNodeMixShader'); N.L(N.m('MULTIPLY', N.m('MULTIPLY', fr.outputs[0], sheen), F('V5_REFL', 1.0), clamp=True), b.inputs[0])
    N.L(dif.outputs[0], b.inputs[1]); N.L(gl.outputs[0], b.inputs[2]); sh = b.outputs[0]
    # ── contact foam: a thin broken line where the water meets anything standing in it (walls, pilings, hulls), bay only
    if F('V5_FOAM', 0.6) > 0:
        ca = N.n('ShaderNodeAmbientOcclusion', i_Distance=F('V5_FOAM_D', 1.0)); ca.samples = 8; ca.only_local = False; N.L(upn, ca.inputs['Normal'])
        near = N.smooth(0.93, 0.62, ca.outputs['AO'])
        lace = N.noise(N.mapping(rot, scale=(0.8, 1.6, 1.0)), 1.3, detail=5.0, rough=0.65)
        bay = N.m('SUBTRACT', 1.0, N.smooth(0.3, 0.8, pac))
        fo = N.m('MULTIPLY', N.m('MULTIPLY', near, N.smooth(0.42, 0.62, lace)), N.m('MULTIPLY', bay, F('V5_FOAM', 0.6)))
        fw = N.n('ShaderNodeBsdfPrincipled', i_Base_Color=(0.58, 0.62, 0.62), i_Roughness=0.9)
        m2 = N.n('ShaderNodeMixShader'); N.L(fo, m2.inputs[0]); N.L(sh, m2.inputs[1]); N.L(fw.outputs[0], m2.inputs[2]); sh = m2.outputs[0]
    return sh, parts
