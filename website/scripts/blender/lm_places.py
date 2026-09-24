"""THE SIGNATURE PLACES (places agent): the places people point at from above,
modelled offline (plain python3 + shapely) under
qipu-render-work/places/models/<key>_prep.py into <key>.npz — faces per
material in world metres, z from the place's own datum — and emitted here
through lm_kit, raised onto the true ground. landmarks_hq registers them like
any landmark (skip_gids, clear regions, `built` year, ENABLED).

Sources per model in its prep script's docstring; the ranked list and the
state of each place in places/SIGNATURE.md."""
import math, os
import numpy as np

MODELS = '/Users/daniel/code/qipu-render-work/places/models'

def load_into(K, key, dz):
    """append places/models/<key>.npz to the kit, raised by dz; False when absent"""
    p = os.path.join(MODELS, key + '.npz')
    if not os.path.exists(p): return False
    z = np.load(p)
    for m in sorted({k.split('|')[0] for k in z.files}):
        V = z[f'{m}|V'].astype(np.float64); V[:, 2] += dz
        I = z[f'{m}|I']; N = z[f'{m}|N']; C = z[f'{m}|C']; S = z[f'{m}|S']
        g = K._g(m); k0 = len(g[0])
        g[0].extend(map(tuple, V.tolist()))
        off = np.concatenate([[0], np.cumsum(N)])
        Ik = (I + k0).tolist()
        g[1].extend(tuple(Ik[off[i]:off[i + 1]]) for i in range(len(N)))
        g[2].extend(map(tuple, C.tolist())); g[3].extend(S.tolist())
        K.nf += len(N)
    return True

# ── materials the models use (added to the scene's `mats`) ───────────────────
def materials(bpy, mats):
    def new(name):
        m = bpy.data.materials.get(name)
        if m is not None: return m, None
        m = bpy.data.materials.new(name); m.use_nodes = True
        return m, m.node_tree
    def surface(name, rough, scales, lo, hi, ao=0.0, bump=0.0, sheen=0.0):
        """bcol x a product of value noises (scale per metre, lo..hi), AO grime, optional bump"""
        m, nt = new(name)
        if nt is None: return m
        pr = nt.nodes['Principled BSDF']; pr.inputs['Roughness'].default_value = rough
        a = nt.nodes.new('ShaderNodeAttribute'); a.attribute_name = 'bcol'
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        val = None
        for sc_, l_, h_ in scales:
            n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = sc_; n.inputs['Detail'].default_value = 3.0
            nt.links.new(geo.outputs['Position'], n.inputs['Vector'])
            r = nt.nodes.new('ShaderNodeMapRange'); r.interpolation_type = 'SMOOTHSTEP'
            nt.links.new(n.outputs['Fac'], r.inputs[0]); r.inputs[1].default_value = 0.3; r.inputs[2].default_value = 0.7
            r.inputs[3].default_value = l_; r.inputs[4].default_value = h_
            if val is None: val = r.outputs[0]
            else:
                mm = nt.nodes.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'
                nt.links.new(val, mm.inputs[0]); nt.links.new(r.outputs[0], mm.inputs[1]); val = mm.outputs[0]
        hs = nt.nodes.new('ShaderNodeHueSaturation'); nt.links.new(a.outputs['Color'], hs.inputs['Color'])
        if val is not None: nt.links.new(val, hs.inputs['Value'])
        col = hs.outputs[0]
        if ao > 0:
            aon = nt.nodes.new('ShaderNodeAmbientOcclusion'); aon.samples = 4; aon.inputs['Distance'].default_value = 1.0
            inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
            nt.links.new(aon.outputs['AO'], inv.inputs[1])
            f = nt.nodes.new('ShaderNodeMath'); f.operation = 'MULTIPLY'; f.inputs[1].default_value = ao
            nt.links.new(inv.outputs[0], f.inputs[0])
            mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'
            nt.links.new(f.outputs[0], mx.inputs[0]); nt.links.new(col, mx.inputs[6]); mx.inputs[7].default_value = (0.35, 0.32, 0.28, 1)
            col = mx.outputs[2]
        nt.links.new(col, pr.inputs['Base Color'])
        if bump > 0:
            n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 40.0; n.inputs['Detail'].default_value = 2.0
            nt.links.new(geo.outputs['Position'], n.inputs['Vector'])
            b = nt.nodes.new('ShaderNodeBump'); b.inputs['Strength'].default_value = bump; b.inputs['Distance'].default_value = 0.02
            nt.links.new(n.outputs['Fac'], b.inputs['Height']); nt.links.new(b.outputs['Normal'], pr.inputs['Normal'])
        if sheen > 0 and 'Sheen Weight' in pr.inputs:
            pr.inputs['Sheen Weight'].default_value = sheen
        return m
    # a kept ballpark lawn: the mowing pattern is in the face colours; fine and broad variation here
    mats['pl_turf'] = surface('pl_turf', 0.85, [(0.35, 0.94, 1.05), (4.0, 0.95, 1.04)], 0, 0, ao=0.0, bump=0.25, sheen=0.3)
    mats['pl_dirt'] = surface('pl_dirt', 0.95, [(0.25, 0.92, 1.06), (3.0, 0.94, 1.05)], 0, 0, bump=0.3)
    mats['pl_seat'] = surface('pl_seat', 0.42, [(0.05, 0.93, 1.05)], 0, 0, ao=0.35)
    mats['pl_conc'] = surface('pl_conc', 0.85, [(0.06, 0.86, 1.05), (0.9, 0.95, 1.03)], 0, 0, ao=0.45)
    mats['pl_chalk'] = surface('pl_chalk', 0.9, [(2.0, 0.92, 1.0)], 0, 0)
    return mats

# ── the models ────────────────────────────────────────────────────────────────
ORACLE_HOME = (4233.6, 2045.0)          # home plate (NAIP 2022); models/oracle_prep.py

def oracle(C):
    """Oracle Park (2000), the offline model (places/models/oracle_prep.py);
    lm_civic.oracle (the first sketch) if the model file is missing"""
    if C.era is not None and C.era < 2000: return
    dz = C.tg(*ORACLE_HOME) + 0.30              # above the engine's ground overlays (+0.14 … +0.18)
    if not load_into(C.K, 'oracle', dz):
        import lm_civic
        lm_civic.oracle(C)


def sidecar(key):
    """places/models/<key>.json: the model's site ring, ground samples, replaced gids"""
    import json
    p = os.path.join(MODELS, key + '.json')
    return json.load(open(p)) if os.path.exists(p) else None

def ring(key):
    j = sidecar(key)
    return [tuple(q) for q in j['ring']] if j else None

def rings(key, fields=('ring', 'house')):
    j = sidecar(key)
    return [[tuple(q) for q in j[f]] for f in fields if j and f in j]

def deck_dz(C, samples):
    """a pier deck's level as water_hq sets one: the ground's median inside,
    never under a spike more than a metre over it, + 0.10"""
    s = np.array([C.tg(x, y) for x, y in samples], float)
    med = float(np.median(s))
    return float(np.clip(min(s.max(), med + 1.0) + 0.10, 0.6, 6.5))

def pier39(C):
    """Pier 39 (1978): the timber village, its deck, rail, flags (models/pier39_prep.py)"""
    if C.era is not None and C.era < 1978: return
    j = sidecar('pier39')
    if not j: return
    load_into(C.K, 'pier39', deck_dz(C, j['samples']))
    load_into(C.K, 'pier39_lions', 0.0)          # on K-Dock's floats (water_hq, z 0.55)

def leftyodoul(C):
    """Lefty O'Doul Bridge (1933): leaf trusses, counterweight frame, operator's house (models/leftyodoul_prep.py)"""
    if C.era is not None and C.era < 1933: return
    j = sidecar('leftyodoul')
    if not j: return
    load_into(C.K, 'leftyodoul', C.tg(*j['datum']) + 0.20)

def fourthst(C):
    """4th Street Bridge (1917): pony trusses, the counterweight, the operator's tower (models/fourthst_prep.py)"""
    if C.era is not None and C.era < 1917: return
    j = sidecar('fourthst')
    if not j: return
    load_into(C.K, 'fourthst', C.tg(*j['datum']) + 0.20)
