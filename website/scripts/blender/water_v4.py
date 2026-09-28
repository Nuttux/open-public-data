"""WATER v4 (WATER_V4=1, default off): the sea surface as physics, for z9 (9.4 cm a pixel).

Called by water2_hq.water() in place of its body when WATER_V4=1 (same signature, same parts dict, so the
shore overlay's surf water and every caller keep working). Everything is keyed on WORLD position, so it is
seamless across frames and tiles (no per-tile randomness anywhere).

surface  a wind-sea spectrum as a height field (metres) -> Bump (distance 1: the true slopes): 12 directional
         wave trains, wavelengths 0.55-9 m, directions spread +-50 deg around the afternoon westerly (sea.json
         wind_to, from ~290 deg), slope amplitude per train from V4_SLOPE (RMS resolved slope ~0.1, Cox-Munk for
         a ~5 m/s bay breeze puts ~0.17 in all scales; the unresolved rest goes into the roughness), crests bent
         by 2 world noises (no straight interference pattern), amplitude x the wind field (sea_fld R: fetch,
         gusts) and x (1 - slicks) (sea_fld G current lines), + a low swell through the Gate (18 / 31 m, from W),
         + capillary ruffle (noise bump, ~0.25 m) below the resolved band.
optics   Principled, IOR 1.333, Specular IOR Level 0.5 (= F0 0.02, the physical Fresnel of water, untinted), so the
         sky reflection is whatever the scene's sky gives at each facet's angle; the SUN GLINT is the scene's own sun
         lamp on these facets (no painted sparkle): with the map camera (~30 deg off vertical, looking north) and the
         sun at az 215 behind it, the specular lobe falls outside the frame, so glints appear only on the steepest
         crests facing the sun (physically consistent, identical in every tile).
colour   body albedo by DEPTH (v4_depth.png, water_v4_prep.py: USGS 3DEP topobathy, bathy_8m.npy) and DISTANCE TO THE
         SHORE (shore_sd.png): lighter turquoise in the shallows and within ~V4_SHORE_M m of walls / piers, deeper blue
         offshore; tuned toward the U7 reference (L* ~62-64, a* -9, b* -14 in the ungraded LOOK B render); a +-6 %
         km-scale variation (turbidity patches).
shore    a dark wet band at the foot of seawalls / piers and a thin broken foam lace a metre or two out (bay only).
Knobs (env): V4_DEEP, V4_SHAL (linear rgb), V4_K (albedo gain), V4_SHORE_M, V4_SLOPE, V4_R0, V4_R1, V4_CAP, V4_SWELL,
V4_SPEC, V4_WASH, V4_FOAM.
"""
import json, math, os

def E(k, v=None): return os.environ.get(k, v)
def F(k, v): return float(os.environ.get(k, v))
def T(k, v): return tuple(float(x) for x in os.environ.get(k, v).split(','))

# (wavelength m, direction offset from downwind deg, phase): a fixed, world-keyed short-crested spectrum, 0.9-12 m (shorter trains alias
# at 9.4 cm a pixel: they go into the capillary ruffle and the roughness)
TRAINS = [(12.0, -6.0, 0.3), (9.3, 24.0, 1.9), (7.4, -37.0, 4.1), (5.9, 11.0, 2.7), (4.8, -19.0, 5.3), (3.9, 47.0, 0.8),
          (3.2, -52.0, 3.6), (2.65, 4.0, 1.2), (2.2, 31.0, 4.8), (1.85, -27.0, 2.2), (1.55, 58.0, 5.9), (1.32, -8.0, 0.5),
          (1.13, 17.0, 3.3), (0.98, -43.0, 1.7), (0.9, 36.0, 4.4), (1.05, -61.0, 2.9)]


def depth(bpy, N, pos, WD, img):
    """metres of water under pos from v4_depth.png (R = sqrt(depth / 60)); None without the file"""
    j = os.path.join(WD, 'v4_depth.json')
    if not os.path.exists(j): return None
    q = json.load(open(j)); ww, hh = q['x1'] - q['x0'], q['y1'] - q['y0']
    mp = N.mapping(pos, loc=(-q['x0'] / ww, -q['y0'] / hh, 0), scale=(1 / ww, 1 / hh, 1))
    ti = N.n('ShaderNodeTexImage', image=img(bpy, 'v4_depth.png'), extension='EXTEND', interpolation='Linear'); N.L(mp, ti.inputs[0])
    sp = N.n('ShaderNodeSeparateColor'); N.L(ti.outputs['Color'], sp.inputs[0])
    return N.m('MULTIPLY', N.m('MULTIPLY', sp.outputs[0], sp.outputs[0]), q.get('dmax', 60.0))


def water(bpy, N, pos, extra, flat, img, shore_dist, WD):
    g = json.load(open(os.path.join(WD, 'sea.json')))
    w_, h_ = g['x1'] - g['x0'], g['y1'] - g['y0']
    uv = N.mapping(pos, loc=(-g['x0'] / w_, -g['y0'] / h_, 0), scale=(1 / w_, 1 / h_, 1))
    tf = N.n('ShaderNodeTexImage', image=img(bpy, 'sea_fld.png'), extension='EXTEND', interpolation='Cubic'); N.L(uv, tf.inputs[0])
    sp = N.n('ShaderNodeSeparateColor'); N.L(tf.outputs['Color'], sp.inputs[0])
    wind, cur, pac = sp.outputs[0], sp.outputs[1], sp.outputs[2]
    wt = g.get('wind_to', [0.94, -0.34]); wang = math.atan2(wt[1], wt[0])       # downwind direction (rad, from +x)
    rot = N.mapping(pos, rot=(0, 0, -wang))
    sx = N.n('ShaderNodeSeparateXYZ'); N.L(pos, sx.inputs[0]); X, Y = sx.outputs[0], sx.outputs[1]
    # ── the height field
    calm = N.m('SUBTRACT', 1.0, N.m('MULTIPLY', cur, F('V4_SLICK', 0.5)))
    amp = N.m('MULTIPLY', N.m('ADD', F('V4_W0', 0.6), N.m('MULTIPLY', wind, F('V4_W1', 0.6))), calm)
    # cat's paws and wind lanes (gusts over 40-250 m, streaked downwind): the chop and the roughness vary in patches, as on a real bay
    paw = N.noise(N.mapping(rot, loc=(211.0, 97.0, 0), scale=(0.45, 1.0, 1.0)), 1 / 70.0, detail=3.0, rough=0.6)
    lane = N.noise(N.mapping(rot, loc=(-57.0, 301.0, 0), scale=(0.25, 1.0, 1.0)), 1 / 240.0, detail=2.0, rough=0.5)
    gust = N.smooth(0.30, 0.72, N.m('ADD', N.m('MULTIPLY', paw, 0.6), N.m('MULTIPLY', lane, 0.4)))
    pk = F('V4_PAW', 0.6)
    amp = N.m('MULTIPLY', amp, N.m('ADD', 1.0 - 0.5 * pk, N.m('MULTIPLY', gust, 1.1 * pk)))
    warp1 = N.m('SUBTRACT', N.noise(N.mapping(pos, loc=(53.0, 17.0, 0)), 1 / 23.0, detail=2.0), 0.5)      # crests bent over ~20-40 m
    warp2 = N.m('SUBTRACT', N.noise(N.mapping(pos, loc=(-29.0, 71.0, 0)), 1 / 7.0, detail=2.0), 0.5)      # and over ~5-10 m
    grp = N.noise(N.mapping(rot, loc=(11.0, 5.0, 0), scale=(0.5, 1.0, 1.0)), 1 / 14.0, detail=1.0)       # wave groups
    s0 = F('V4_SLOPE', 0.042); h = None
    for i, (lam, dth, ph) in enumerate(TRAINS):
        th = wang + math.radians(dth); k = 2 * math.pi / lam
        arg = N.m('ADD', N.m('MULTIPLY', X, k * math.cos(th)), N.m('MULTIPLY', Y, k * math.sin(th)))
        # short crests: each train's phase bent and its amplitude broken by its own world noise at ~3-4 wavelengths
        nb = N.noise(N.mapping(pos, loc=(17.0 * i + 3.0, 29.0 * i + 7.0, 0)), 1.0 / (3.5 * lam), detail=1.5)
        na = N.noise(N.mapping(pos, loc=(41.0 * i + 11.0, 13.0 * i + 5.0, 0)), 1.0 / (4.0 * lam), detail=1.0)
        arg = N.m('ADD', arg, N.m('ADD', ph, N.m('ADD', N.m('MULTIPLY', N.m('SUBTRACT', nb, 0.5), 7.0), N.m('MULTIPLY', warp1, 6.0 * (1 if i % 2 else -1)))))
        am = N.m('MULTIPLY', N.smooth(0.3, 0.75, na), 1.6)
        if lam > 3.0: am = N.m('MULTIPLY', am, N.m('ADD', 0.55, N.m('MULTIPLY', grp, 0.9)))
        term = N.m('MULTIPLY', N.m('SINE', arg), N.m('MULTIPLY', am, s0 * lam / (2 * math.pi)))
        h = term if h is None else N.m('ADD', h, term)
    h = N.m('MULTIPLY', h, amp)
    # a low swell through the Gate, from the west (bay: small)
    for lam, dth, a in ((31.0, 0.0, 0.05), (18.0, 14.0, 0.03)):
        th = math.radians(dth); k = 2 * math.pi / lam
        arg = N.m('ADD', N.m('MULTIPLY', X, k * math.cos(th)), N.m('MULTIPLY', Y, k * math.sin(th)))
        arg = N.m('ADD', arg, N.m('MULTIPLY', warp1, 4.0))
        h = N.m('ADD', h, N.m('MULTIPLY', N.m('SINE', arg), a * F('V4_SWELL', 1.0)))
    bm = N.n('ShaderNodeBump', i_Distance=1.0, i_Strength=1.0)
    if flat is not None: N.L(flat, bm.inputs['Normal'])
    N.L(h, bm.inputs['Height'])
    # capillary ruffle below the resolved trains, stretched across the wind
    cap = N.noise(N.mapping(rot, scale=(1.0, 0.6, 1.0)), 2.2, detail=3.0, rough=0.5)
    bm2 = N.n('ShaderNodeBump', i_Distance=0.02)
    N.L(cap, bm2.inputs['Height']); N.L(N.m('MULTIPLY', amp, F('V4_CAP', 0.25)), bm2.inputs['Strength']); N.L(bm.outputs[0], bm2.inputs['Normal'])
    normal = bm2.outputs[0]
    rough = N.m('MULTIPLY', N.m('ADD', F('V4_R0', 0.06), N.m('ADD', N.m('MULTIPLY', wind, F('V4_R1', 0.03)), N.m('MULTIPLY', gust, F('V4_RG', 0.04)))), calm)
    # ── the body colour by depth and distance to the shore
    deep, shal = T('V4_DEEP', '0.018,0.056,0.085'), T('V4_SHAL', '0.030,0.108,0.118'); kk = F('V4_K', 2.2)
    dep = depth(bpy, N, pos, WD, img); dsh = shore_dist(bpy, N, pos)
    f = None
    if dep is not None: f = N.smooth(14.0, 2.0, dep)
    if dsh is not None:
        fs = N.m('MULTIPLY', N.smooth(F('V4_SHORE_M', 70.0), 4.0, dsh), 0.75)
        f = fs if f is None else N.m('MAXIMUM', f, fs)
    col = N.mix(f if f is not None else 0.0, deep, shal)
    var = N.m('ADD', 1.0 - 0.06, N.m('MULTIPLY', N.noise(N.mapping(pos, loc=(401.0, 233.0, 0)), 1 / 450.0, detail=2.0), 0.12))
    col = N.vmath('MULTIPLY', col, N.n('ShaderNodeCombineXYZ', i_X=kk, i_Y=kk, i_Z=kk).outputs[0])
    varv = N.n('ShaderNodeCombineXYZ'); [N.L(var, varv.inputs[i]) for i in range(3)]
    col = N.vmath('MULTIPLY', col, varv.outputs[0])
    parts = dict(wind=wind, cur=cur, pac=pac, col=col, rough=rough, normal=normal, rot=rot)
    if extra: extra(N, parts)
    # optics: the BODY colour is light scattered up from inside the water, it does not shade like a solid with the ripples: it gets a
    # mostly flat normal (V4_DIFFN of the wave normal); the surface REFLECTION (Fresnel, IOR 1.333, untinted, the sky and the sun lamp)
    # gets the full wave normal. Transmitted share = 1 - F.
    upn = N.n('ShaderNodeCombineXYZ', i_X=0.0, i_Y=0.0, i_Z=1.0).outputs[0] if flat is None else flat
    mixn = N.nt.nodes.new('ShaderNodeMix'); mixn.data_type = 'VECTOR'; mixn.inputs[0].default_value = F('V4_DIFFN', 0.3)
    N.L(upn, mixn.inputs[4]); N.L(parts['normal'], mixn.inputs[5])
    nrm = N.nt.nodes.new('ShaderNodeVectorMath'); nrm.operation = 'NORMALIZE'; N.L(mixn.outputs[1], nrm.inputs[0])
    dif = N.n('ShaderNodeBsdfDiffuse'); N.L(parts['col'], dif.inputs['Color']); N.L(nrm.outputs[0], dif.inputs['Normal'])
    gl = N.n('ShaderNodeBsdfGlossy', distribution='GGX'); gl.inputs['Color'].default_value = (1, 1, 1, 1)
    N.L(parts['rough'], gl.inputs['Roughness']); N.L(parts['normal'], gl.inputs['Normal'])
    fr = N.n('ShaderNodeFresnel', i_IOR=1.333); N.L(parts['normal'], fr.inputs['Normal'])
    frk = N.m('MULTIPLY', fr.outputs[0], F('V4_SPEC', 0.5) / 0.5)
    b = N.n('ShaderNodeMixShader'); N.L(frk, b.inputs[0]); N.L(dif.outputs[0], b.inputs[1]); N.L(gl.outputs[0], b.inputs[2])
    sh = b.outputs[0]
    # ── the shore: a dark wet band at the foot of walls / piers, a thin broken foam lace a metre or two out (bay only)
    if dsh is not None and F('V4_WASH', 1.0) > 0:
        bay = N.m('SUBTRACT', 1.0, N.smooth(0.3, 0.8, pac))
        wl = N.m('MULTIPLY', N.smooth(1.2, 0.2, dsh), bay)
        dk = N.n('ShaderNodeBsdfPrincipled', i_Base_Color=(0.010, 0.020, 0.022), i_Roughness=0.15, i_Specular_IOR_Level=0.5)
        m1 = N.n('ShaderNodeMixShader'); N.L(N.m('MULTIPLY', wl, 0.6 * F('V4_WASH', 1.0)), m1.inputs[0]); N.L(sh, m1.inputs[1]); N.L(dk.outputs[0], m1.inputs[2]); sh = m1.outputs[0]
        lace = N.noise(N.mapping(rot, scale=(0.7, 1.4, 1.0)), 0.8, detail=6.0, rough=0.65)
        wz = N.m('MULTIPLY', N.m('MULTIPLY', N.smooth(3.5, 0.8, dsh), N.smooth(0.2, 0.8, dsh)), bay)
        wf_ = N.m('MULTIPLY', N.m('MULTIPLY', N.smooth(0.58, 0.70, lace), wz), F('V4_FOAM', 0.45))
        fw = N.n('ShaderNodeBsdfPrincipled', i_Base_Color=(0.62, 0.66, 0.66), i_Roughness=0.9)
        m2 = N.n('ShaderNodeMixShader'); N.L(wf_, m2.inputs[0]); N.L(sh, m2.inputs[1]); N.L(fw.outputs[0], m2.inputs[2]); sh = m2.outputs[0]
    return sh, parts
