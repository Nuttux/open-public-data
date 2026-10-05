"""THE PACIFIC NORTHWEST TREE KIT (V-VEG, 05/10): Vancouver's own species as
procedural protos, grown with veg_v4's branch builder (decurrent / excurrent),
for veg_hq when VEG_KIT=pnw (another city's switch; San Francisco never imports
this module, so SF's kit, ramps and gains are untouched).

Why: van_vp1/vp1b drew Vancouver with San Francisco's kit (its 'plane' and
'round' street kinds, its Monterey pine and cypress, and Poly Haven's
fir_tree_01 scaled up as the 'redwood' of Stanley Park): the city read as
California. The City's street-tree register names genus, species and cultivar
for 184,508 trees (Acer 42 k, Prunus 30 k, Quercus 9 k, Fraxinus 8 k, Tilia 7 k,
Carpinus 6.7 k, Thuja 6.2 k, Fagus 6.2 k, Magnolia 4.6 k ...); the woods are
Douglas-fir, western redcedar and western hemlock with bigleaf maple and red
alder.

Forms are a CONVENTION after each species' usual habit (not measured), in summer
foliage (the render's season). Sizes per proto (H, W in m) are the builder's
targets; veg_hq picks the proto nearest a tree's own height and scales it.

  archetype   drawn after                                     protos
  v_dfir      Pseudotsuga menziesii: tall, narrow, a long      v_dfir_a 46 m, _b 30 m, _y 13 m
              clear bole in a stand, slightly drooping then
              upturned limbs, dense dark blue-green tufts,
              an irregular pointed top
  v_cedar     Thuja plicata: a broad-based cone, low limbs     v_cedar_a 34 m, _b 21 m, _y 9 m
              drooping then J-curved up, hanging lacy flat
              sprays, a nodding leader, yellower green
  v_hemlock   Tsuga heterophylla: narrow, a nodding leader,    v_hemlock_a 36 m, _b 18 m
              fine feathery drooping sprays, dark green
  v_maple     Acer platanoides / rubrum / x freemanii /        v_maple_x 20 m, _a 14 m, _b 10 m, _y 6.5 m
              pseudoplatanus / macrophyllum, Platanus,
              Aesculus, Liriodendron: a dense round-oval head
  v_purple    Prunus cerasifera 'Atropurpurea' / 'Nigra',      v_purple_a 7.5 m, _b 4.8 m
              Acer 'Crimson King', copper beech: dark
              purple-red leaves
  v_cherry    Prunus serrulata 'Kwanzan', P. x yedoensis       v_cherry_a 7 m, _b 4.6 m
              'Akebono': a vase spreading to a flat broad top
              (green in summer)
  v_oak       Quercus palustris / rubra / robur, Liquidambar,  v_oak_a 17 m, _b 9 m
              Nyssa: an upright oval, dark glossy green
  v_ash       Fraxinus, Gleditsia, Robinia, Betula, red alder, v_ash_a 15 m, _b 8 m
              cottonwood: an open airy crown of fine leaves,
              light green
  v_linden    Tilia, Carpinus (round forms): a dense upright   v_linden_a 14 m, _b 8 m
              oval, mid green
  v_beech     Fagus sylvatica: a dense broad dome, dark        v_beech_a 15 m, _b 8 m
              glossy green
  v_orn       Magnolia, Malus, Crataegus, Cornus, Styrax,      v_orn_a 6.5 m, _b 4.2 m
              Syringa, Parrotia, Cercidiphyllum, Amelanchier,
              Sorbus, Acer campestre / palmatum: small rounds
  v_elm       Ulmus, Zelkova: a tall vase                      v_elm_a 18 m, _b 10 m
  v_column    fastigiate cultivars (Dawyck beech, columnar     v_column_a 13 m, _b 7 m
              maples, Carpinus 'Fastigiata', Quercus robur
              'Fastigiata', Pyrus 'Chanticleer'), Ginkgo,
              Lombardy poplar
(Pinus keeps SF's 'pine' archetype.)
"""
import math, os
import numpy as np

# the archetype -> its protos (smallest last; veg_hq picks by size)
PROTO_OF = {
    'v_dfir': ['v_dfir_a', 'v_dfir_b', 'v_dfir_y'], 'v_cedar': ['v_cedar_a', 'v_cedar_b', 'v_cedar_y'],
    'v_hemlock': ['v_hemlock_a', 'v_hemlock_b'],
    'v_maple': ['v_maple_x', 'v_maple_a', 'v_maple_b', 'v_maple_y'], 'v_purple': ['v_purple_a', 'v_purple_b'],
    'v_cherry': ['v_cherry_a', 'v_cherry_b'], 'v_oak': ['v_oak_a', 'v_oak_b'], 'v_ash': ['v_ash_a', 'v_ash_b'],
    'v_linden': ['v_linden_a', 'v_linden_b'], 'v_beech': ['v_beech_a', 'v_beech_b'], 'v_orn': ['v_orn_a', 'v_orn_b'],
    'v_elm': ['v_elm_a', 'v_elm_b'], 'v_column': ['v_column_a', 'v_column_b'],
}
ARCHS = tuple(PROTO_OF)
CONIFERS = ('v_dfir', 'v_cedar', 'v_hemlock', 'pine')
# the old archetypes another city's data may still carry -> this kit's (veg_hq maps them when VEG_KIT=pnw)
ALIAS = {'redwood': 'v_dfir', 'plane': 'v_maple', 'round': 'v_linden', 'cherry': 'v_cherry', 'plum': 'v_purple',
         'ornamental': 'v_orn', 'column': 'v_column', 'cypress': 'v_cedar', 'euc': 'v_ash', 'olive': 'v_orn',
         'pohu': 'v_orn', 'jacaranda': 'v_orn', 'ficus': 'v_linden', 'vbox': 'v_orn', 'bbox': 'v_oak', 'oak': 'v_oak',
         'small_palm': 'v_orn', 'date_palm': 'v_orn', 'fan_palm': 'v_orn', 'queen_palm': 'v_orn'}

# ramps: bark dark, bark light, leaf dark, leaf light, accent (sRGB). The leaf
# stops are lifted in veg_protos._material like every v4 kind (LEAF_LIFT x the
# gain below): these sit darker and bluer than SF's broadleaf (a rain-forest
# conifer reads near-black blue-green from the air; the street kinds a deep,
# healthy summer green, never olive)
RAMPS = {
    'v_dfir':    ('#4a3a2e', '#6e5a48', '#16291d', '#33553a', '#33553a'),
    'v_cedar':   ('#5a3d2c', '#8a6248', '#24401f', '#557a36', '#557a36'),
    'v_hemlock': ('#4a3d34', '#6d5d50', '#182c1f', '#36593c', '#36593c'),
    'v_maple':   ('#4f463c', '#766a5c', '#29501f', '#5e8f36', '#5e8f36'),
    'v_purple':  ('#3d302c', '#5e4a44', '#2e1419', '#64293a', '#64293a'),
    'v_cherry':  ('#4d3a33', '#6f564b', '#2f4f22', '#68903e', '#68903e'),
    'v_oak':     ('#4a4038', '#6b5f52', '#22411d', '#4f7a33', '#4f7a33'),
    'v_ash':     ('#5d554b', '#857a6c', '#355a24', '#74a046', '#74a046'),
    'v_linden':  ('#4f463c', '#766a5c', '#2c5322', '#64953c', '#64953c'),
    'v_beech':   ('#5f5d58', '#86847c', '#203f1b', '#4b7630', '#4b7630'),
    'v_orn':     ('#4d3f38', '#6d5b50', '#2f5224', '#68963f', '#68963f'),
    'v_elm':     ('#4f463c', '#766a5c', '#2a4f20', '#5d8c37', '#5d8c37'),
    'v_column':  ('#4f463c', '#766a5c', '#2d5422', '#66983e', '#66983e'),
}
# the v4 leaf gain (veg_protos._material: leaf stops x V4_GAIN x this); SF's
# conifers take 1.35-1.5, its broadleaf 1.1-1.45
GAINS = {'v_dfir': 1.35, 'v_cedar': 1.35, 'v_hemlock': 1.35, 'v_maple': 1.25, 'v_purple': 1.2, 'v_cherry': 1.25,
         'v_oak': 1.3, 'v_ash': 1.2, 'v_linden': 1.25, 'v_beech': 1.3, 'v_orn': 1.25, 'v_elm': 1.25, 'v_column': 1.25}

# envelope profiles (t = 0 crown base .. 1 top) added to veg_v4.PROF
PROF = {
    # Douglas-fir: a narrow spire, near-straight sides, the widest a fifth of the way up
    'dfir':   lambda t: max(0.05, min(1.0, 0.75 + t * 1.5) * (1 - t) ** 0.8),
    # redcedar: a broad flared base, concave sides to a narrow nodding top
    'cedar':  lambda t: max(0.04, (1 - t) ** 1.25 * (1.0 if t > 0.08 else 0.85 + 2 * t)),
    # hemlock: narrow, soft, a slender drooping top
    'hemlock': lambda t: max(0.04, min(1.0, 0.8 + t * 2) * (1 - t) ** 1.0),
}

_CON = dict(omax=3, nk=[0, 3, 3, 2], ang=[0, 50, 50, 50], lr=[0, 0.5, 0.5, 0.5], t0=[0, 0.3, 0.3, 0.3],
            up=[0, 0.1, 0.1, 0.1], bend=0.25, taper=0.35, rr=0.55, lmin=0.5, along=1.0)
SP = {
    'v_dfir': dict(_CON, fill=0.9, bole=0.3, shape='dfir', lobes=0.14, whorls=13, per_whorl=5, el0=-6, el_up=0.5, lead=0.97,
                   r0k=0.022, trop=[0.1, 0.12, 0.2, 0.15],
                   fol=dict(leaf=0.09, stretch=2.2, dens=2.0, size=1.25, flat=0.55, up=0.6, jt=0.17, surf=0.4)),
    'v_cedar': dict(_CON, fill=0.9, bole=0.1, shape='cedar', lobes=0.12, whorls=12, per_whorl=5, el0=-22, el_up=1.1, lead=0.93, nod=1.2,
                    r0k=0.03, trop=[0.1, 0.35, -0.25, -0.3], nk=[0, 4, 3, 2],
                    fol=dict(leaf=0.12, stretch=1.6, dens=1.9, size=1.45, flat=0.8, hang=0.3, up=0.6, jt=0.14, surf=0.4)),
    'v_hemlock': dict(_CON, fill=0.9, bole=0.22, shape='hemlock', lobes=0.12, whorls=13, per_whorl=5, el0=-12, el_up=0.6, lead=0.95, nod=1.5,
                      r0k=0.02, trop=[0.05, -0.05, -0.2, -0.2],
                      fol=dict(leaf=0.08, stretch=1.8, dens=2.0, size=1.15, flat=0.65, hang=0.22, up=0.6, jt=0.15, surf=0.4)),
}
_BROAD = dict(bole=0.28, shape='oval', lobes=0.16, scaf=4, ang0=38, omax=4, nk=[0, 4, 4, 3, 3], ang=[0, 40, 45, 50, 50],
              lr=[0, 0.8, 0.7, 0.6, 0.6], t0=[0, 0.3, 0.25, 0.2, 0.2], up=[0, 0.15, 0.1, 0.05, 0.0], trop=[0.3, 0.2, 0.0, -0.2, -0.2],
              bend=0.35, taper=0.4, rr=0.6, lmin=0.6)
SP.update({
    'v_maple': dict(_BROAD, fill=0.85, shape='round', lobes=0.13, scaf=5, nk=[0, 4, 4, 3, 3],
                    fol=dict(leaf=0.16, stretch=1.2, dens=1.6, size=1.25, flat=0.45, up=0.55, jt=0.13, surf=0.5)),
    'v_purple': dict(_BROAD, fill=0.7, shape='round', lobes=0.15, scaf=4, ang0=42, nk=[0, 4, 3, 3, 3],
                     fol=dict(leaf=0.12, stretch=1.3, dens=1.5, size=0.95, flat=0.45, up=0.55, jt=0.12, surf=0.5)),
    'v_cherry': dict(_BROAD, fill=0.6, shape='vase', lobes=0.18, scaf=5, bole=0.22, ang0=55, nk=[0, 4, 3, 3, 3],
                     trop=[0.3, 0.25, 0.05, -0.1, -0.15],
                     fol=dict(leaf=0.13, stretch=1.3, dens=1.35, size=1.0, flat=0.55, up=0.55, jt=0.15, surf=0.55)),
    'v_oak': dict(_BROAD, fill=0.75, shape='oval', lobes=0.17, scaf=5, leader=1, ang0=40, nk=[0, 4, 4, 3, 3],
                  fol=dict(leaf=0.13, stretch=1.3, dens=1.5, size=1.2, flat=0.5, up=0.5, jt=0.14, surf=0.5)),
    'v_ash': dict(_BROAD, fill=0.4, shape='oval', lobes=0.2, scaf=4, ang0=35, nk=[0, 4, 3, 3, 3],
                  fol=dict(leaf=0.11, stretch=1.8, dens=1.15, size=1.3, flat=0.5, up=0.6, jt=0.17, surf=0.6)),
    'v_linden': dict(_BROAD, fill=0.9, shape='oval', lobes=0.11, scaf=5, leader=1, ang0=32, nk=[0, 4, 4, 3, 3],
                     fol=dict(leaf=0.15, stretch=1.2, dens=1.7, size=1.15, flat=0.45, up=0.55, jt=0.12, surf=0.45)),
    'v_beech': dict(_BROAD, fill=0.95, shape='dome', lobes=0.12, scaf=5, bole=0.18, ang0=50, nk=[0, 5, 4, 3, 3],
                    fol=dict(leaf=0.13, stretch=1.3, dens=1.8, size=1.2, flat=0.6, up=0.5, jt=0.12, surf=0.45)),
    'v_orn': dict(_BROAD, fill=0.65, shape='round', lobes=0.16, scaf=4, ang0=45, nk=[0, 4, 3, 3, 3],
                  fol=dict(leaf=0.13, stretch=1.3, dens=1.4, size=0.95, flat=0.45, up=0.55, jt=0.14, surf=0.55)),
    'v_elm': dict(_BROAD, fill=0.6, shape='vase', lobes=0.18, scaf=4, bole=0.3, ang0=25, nk=[0, 4, 4, 3, 3],
                  trop=[0.35, 0.25, 0.0, -0.25, -0.3],
                  fol=dict(leaf=0.13, stretch=1.4, dens=1.4, size=1.25, flat=0.45, up=0.55, jt=0.15, surf=0.55)),
    'v_column': dict(_BROAD, fill=0.9, shape='column', lobes=0.08, scaf=6, bole=0.1, ang0=14, leader=1, nk=[0, 4, 3, 3, 2],
                     ang=[0, 25, 35, 40, 45],
                     fol=dict(leaf=0.14, stretch=1.3, dens=1.6, size=0.9, flat=0.3, up=0.45, jt=0.12, surf=0.5)),
})

# name: (archetype, seed, H, W, TALL, HMAX). TALL = the instancer's height/width cap (generous: veg_hq sizes
# these by the tree's own height), HMAX = the tallest a tree of the proto is drawn
KIT = {
    'v_dfir_a': ('v_dfir', 501, 46.0, 11.0, 6.0, 62.0), 'v_dfir_b': ('v_dfir', 502, 30.0, 8.5, 6.0, 62.0),
    'v_dfir_y': ('v_dfir', 503, 13.0, 5.2, 6.0, 62.0),
    'v_cedar_a': ('v_cedar', 511, 34.0, 13.0, 5.0, 50.0), 'v_cedar_b': ('v_cedar', 512, 21.0, 9.0, 5.0, 50.0),
    'v_cedar_y': ('v_cedar', 513, 9.0, 4.6, 5.0, 50.0),
    'v_hemlock_a': ('v_hemlock', 521, 36.0, 9.5, 6.0, 52.0), 'v_hemlock_b': ('v_hemlock', 522, 18.0, 6.0, 6.0, 52.0),
    'v_maple_x': ('v_maple', 531, 20.0, 17.0, 2.0, 30.0), 'v_maple_a': ('v_maple', 532, 14.0, 12.0, 2.0, 30.0),
    'v_maple_b': ('v_maple', 533, 10.0, 8.5, 2.0, 30.0), 'v_maple_y': ('v_maple', 534, 6.5, 5.0, 2.0, 30.0),
    'v_purple_a': ('v_purple', 541, 7.5, 7.0, 1.6, 11.0), 'v_purple_b': ('v_purple', 542, 4.8, 4.2, 1.6, 11.0),
    'v_cherry_a': ('v_cherry', 551, 7.0, 8.5, 1.4, 11.0), 'v_cherry_b': ('v_cherry', 552, 4.6, 5.0, 1.4, 11.0),
    'v_oak_a': ('v_oak', 561, 17.0, 13.0, 2.2, 28.0), 'v_oak_b': ('v_oak', 562, 9.0, 7.0, 2.2, 28.0),
    'v_ash_a': ('v_ash', 571, 15.0, 11.0, 2.2, 28.0), 'v_ash_b': ('v_ash', 572, 8.0, 6.0, 2.2, 28.0),
    'v_linden_a': ('v_linden', 581, 14.0, 9.5, 2.4, 25.0), 'v_linden_b': ('v_linden', 582, 8.0, 5.5, 2.4, 25.0),
    'v_beech_a': ('v_beech', 591, 15.0, 14.0, 1.8, 26.0), 'v_beech_b': ('v_beech', 592, 8.0, 7.0, 1.8, 26.0),
    'v_orn_a': ('v_orn', 601, 6.5, 6.2, 1.6, 12.0), 'v_orn_b': ('v_orn', 602, 4.2, 3.8, 1.6, 12.0),
    'v_elm_a': ('v_elm', 611, 18.0, 15.0, 2.0, 28.0), 'v_elm_b': ('v_elm', 612, 10.0, 8.0, 2.0, 28.0),
    'v_column_a': ('v_column', 621, 13.0, 4.6, 4.0, 22.0), 'v_column_b': ('v_column', 622, 7.0, 2.8, 4.0, 22.0),
}


def conifer(seed, H, W, sp):
    """a PNW conifer: veg_v4.excurrent's whorls, but on a STRAIGHT stem with the
    envelope measured from the axis (excurrent's leaning trunk left the narrow
    top of a 46 m spire outside its own envelope: no branch above ~30 m), a
    dense tuft of sprays up the last metres of the leader, and a nodding tip
    (sp['nod'] m: redcedar, hemlock)"""
    import veg_v4 as V4, veg_geom as G
    T = V4.Tree(seed, sp); rng = T.rng
    z0 = H * sp['bole']
    T.E = V4.Env(rng, z0 * 0.9, H, W, sp['shape'], sp.get('lobes', 0.12))
    r0 = sp.get('r0k', 0.022) * H
    ht = H * sp.get('lead', 0.96)
    P = G.branch_path(np.zeros(3), (rng.normal(0, 0.006), rng.normal(0, 0.006), 1.0), ht, 0.004, 14, rng)
    nod = sp.get('nod', 0.0)
    if nod > 0:      # the leader's last stretch bends over
        a_ = rng.uniform(0, 2 * math.pi); k0 = int(len(P) * 0.82)
        for i in range(k0, len(P)):
            f = (i - k0 + 1) / (len(P) - k0); P[i, 0] += nod * f * f * math.cos(a_); P[i, 1] += nod * f * f * math.sin(a_)
    G.tube(T.M, P, np.linspace(r0 * 1.2, r0 * 0.12, len(P)), 9, np.linspace(0.04, 0.07, len(P)))
    zs = P[:, 2]
    def on_stem(z):
        i = int(np.clip(np.searchsorted(zs, z), 1, len(P) - 1)); t = (z - zs[i - 1]) / max(1e-6, zs[i] - zs[i - 1])
        return P[i - 1] + (P[i] - P[i - 1]) * t
    nw = sp['whorls']; nw = int(rng.integers(nw - 1, nw + 2))
    for w in range(nw):
        z = z0 + (ht - z0) * (w + rng.uniform(0.2, 0.8)) / nw
        q = on_stem(z); ax = np.array([0.0, 0.0, z])
        k = int(rng.integers(sp['per_whorl'] - 1, sp['per_whorl'] + 2)); a0 = rng.uniform(0, 2 * math.pi)
        for j in range(k):
            az = a0 + 2 * math.pi * j / k + rng.normal(0, 0.4)
            el = math.radians(sp['el0'] + rng.normal(0, 9) + 25 * (w / max(1, nw - 1)) * sp.get('el_up', 1.0))
            d = np.array([math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)])
            L = T.E.dist(ax, d) * rng.uniform(0.75, 1.0)
            if L < 0.3: continue
            T.branch(q, d, L, max(0.015, r0 * 0.38 * (1 - 0.6 * w / nw)), 1)
    # the leader's own tuft: sprays up its last fifth, smaller toward the tip
    for z in np.linspace(ht * 0.8, ht, 7):
        q = on_stem(z); f = 0.55 + 0.45 * (ht - z) / max(0.1, ht * 0.2)
        for _ in range(3):
            T.sprays.append((q + rng.normal(0, 0.12, 3), V4.nz(np.array([rng.normal(0, 0.6), rng.normal(0, 0.6), 0.6])), 0.6 * f))
    T.sprays.append((P[-1], V4.UP, 0.5))
    T.infill(sp.get('fill', 0.5), sp['fol']['size'])
    T.foliage(**sp['fol'])
    T.M.v3 = True
    return T.M


def build(name):
    """the proto's mesh (veg_geom Mesh, v4: M.v3 True, M.sfx '_v4'), numpy only"""
    import veg_v4 as V4
    for k, f in PROF.items(): V4.PROF.setdefault(k, f)
    a, seed, H, W, _, _ = KIT[name]
    sp = dict(SP[a]); sp['fol'] = dict(sp['fol'])
    if a in ('v_dfir', 'v_cedar', 'v_hemlock'):
        M = conifer(seed, H, W, sp)
    else:
        M = V4.decurrent(seed, H, W, sp)
    M.sfx = '_v4'
    return M


def install(VP):
    """register the kit's ramps and gains in veg_protos (its _material reads them by ramp name)"""
    for k, r in RAMPS.items():
        VP.RAMPS.setdefault(k, r)
        VP.RAMPS4_LEAF.setdefault(k, (r[2], r[3]))
        VP.V4_GAINS.setdefault(k, GAINS[k])


def kit(VP):
    """{name: (builder, ramp, TALL, HMAX)} in veg_protos.kit()'s shape"""
    install(VP)
    return {nm: ((lambda nm=nm: build(nm)), a, t_, h_) for nm, (a, _, _, _, t_, h_) in KIT.items()}


# ── the register: genus / species / cultivar -> archetype (first match wins) ───
import re
RULES = [
    (r'^(planting|stump)', 'none'), (r'^(unidentified|unknown|species)', 'unknown'),
    # fastigiate cultivars of any genus
    (r'(dawyck|fastigiat|columnar|columnare|crimson sentry|armstrong|frans fontaine|chanticleer|bowhall|red rocket|italica|upright|pyramidal|beacon|spire|sentry|skyrocket)', 'v_column'),
    # purple leaves
    (r'^prunus (cerasifera|x blireana|x cistena|virginiana)', 'v_purple'),
    (r'^acer platanoides (crimson king|royal red|faassen|schwedleri)', 'v_purple'),
    (r'^fagus sylvatica (purpurea|riversii|atropunicea|purple|rohanii|tricolor)', 'v_purple'),
    (r'^prunus', 'v_cherry'), (r'^(malus|pyrus)', 'v_orn'),
    (r'^pseudotsuga', 'v_dfir'), (r'^thuja', 'v_cedar'), (r'^tsuga', 'v_hemlock'),
    (r'^(picea|abies|sequoiadendron|sequoia|metasequoia|larix|taxodium|cryptomeria|araucaria)', 'v_dfir'),
    (r'^(chamaecyparis|callitropsis|cupressocyparis|x cupressocyparis|cupressus|cedrus|calocedrus|taxus|juniperus|thujopsis)', 'v_cedar'),
    (r'^pinus', 'pine'),
    (r'^acer (campestre|palmatum|griseum|ginnala|tataricum|circinatum|japonicum|buergerianum|davidii|capillipes|triflorum|negundo)', 'v_orn'),
    (r'^(acer|platanus|aesculus|liriodendron|catalpa|juglans|paulownia|castanea|tilia tomentosa|pterocarya|gymnocladus|ailanthus)', 'v_maple'),
    (r'^(quercus|liquidambar|nyssa|ostrya|sassafras)', 'v_oak'),
    (r'^(fraxinus|gleditsia|robinia|betula|alnus|populus|salix|sophora|styphnolobium|koelreuteria|cladrastis|maackia|phellodendron|eucommia)', 'v_ash'),
    (r'^(tilia|carpinus|celtis|corylus)', 'v_linden'),
    (r'^fagus', 'v_beech'),
    (r'^(ulmus|zelkova)', 'v_elm'),
    (r'^ginkgo', 'v_column'),
    (r'^(magnolia|crataegus|cornus|styrax|syringa|parrotia|cercidiphyllum|amelanchier|sorbus|cercis|halesia|stewartia|laburnum|'
     r'davidia|hibiscus|rhododendron|rhus|heptacodium|arbutus|ilex|cotinus|oxydendrum|chionanthus|lagerstroemia|aralia|'
     r'koelreuteria|morus|ficus|mespilus|cydonia|eriobotrya|photinia|trachycarpus|embothrium|ptelea|albizia|idesia|tetradium|'
     r'euodia|elaeagnus|ligustrum|viburnum|acca|prunus|carya|diospyros|pseudocydonia)', 'v_orn'),
]
_RX = [(re.compile(r), a) for r, a in RULES]


def arch_of(genus, species='', cultivar=''):
    s = ' '.join(v.strip().lower() for v in (genus, species, cultivar) if v and v.strip().lower() not in ('none', ''))
    s = re.sub(r'\s+', ' ', s)
    for rx, a in _RX:
        if rx.search(s): return a
    return 'unknown'
