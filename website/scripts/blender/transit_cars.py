"""The vehicles on San Francisco's rail, as low-poly bodies for a 37 cm/px
axonometric (transit_hq.py places them). Local frame: x along the vehicle
(+x = front), y across, z up from the top of the rail.

What reads at that scale is the plan (length, width, the tapered ends), the
roof (colour, the equipment on it) and, at the camera's 29 degrees, the side:
the livery's bands and the dark window band. Dimensions are published ones:
  Siemens S200 SF (Muni LRV4): 22.86 m (75 ft) x 2.64 m, roof ~3.4 m; Muni
    runs them singly and coupled in twos. Livery: silver, red lower band,
    black window band.
  PCC (F Market & Wharves): ~15.2 m x 2.74 m, in the liveries of the cities
    that ran them (Muni's own green and cream, Philadelphia, Boston, Kansas
    City, Los Angeles, Brooklyn, Baltimore ...).
  Milan "Peter Witt" 1928 (F line): 14.9 m x 2.35 m, orange and cream.
  Cable car: Powell 8.3 m x 2.44 m, California 9.1 m; maroon, cream, blue trim,
    light roof with a clerestory.
  Caltrain Stadler KISS EMU (2024): seven cars, ~26 m each, 3.0 m wide,
    bilevel (~4.4 m); white, red lower band, red cab ends, two window bands.
  Caltrain gallery cars (Nippon Sharyo/Bombardier gallery set): stainless,
    red stripe, 25.9 m; with a grey MP36/F40 locomotive.
"""
import math

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)

PAINT, GLASS, ROOF, DARK, METAL = range(5)
UNDER = srgb('#1a1a1a')


class VB:
    def __init__(self): self.V, self.F, self.C, self.MI = [], [], [], []
    def face(self, pts, col, mi):
        k = len(self.V); self.V += [tuple(p) for p in pts]; self.F.append(tuple(range(k, k + len(pts)))); self.C.append(col); self.MI.append(mi)
    def box(self, x0, x1, y0, y1, z0, z1, col, mi, bottom=False):
        self.face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], col, mi)
        self.face([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], col, mi)
        self.face([(x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)], col, mi)
        self.face([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], col, mi)
        self.face([(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)], col, mi)
        if bottom: self.face([(x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0)], col, mi)


def body(vb, L, W, H, z0, bands, roof, end_col, front=((0.0, 0.85), (1.2, 1.0)), back=None,
         shoulder=0.32, glass_z=None, glass_col=None, front_col=None):
    """a lofted body: `bands` [(z_top, colour, material)] up the sides from z0;
    the roof from the last band's top to H across the shoulder. front/back:
    the plan of the ends [(distance from the end, width scale)], ascending."""
    back = back or front
    w = W / 2; n = len(bands)
    ring = [(-w, z0), (w, z0)]; seg = [(UNDER, DARK)]
    for zt, c, mi in bands: ring.append((w, zt)); seg.append((c, mi))
    seg.append((roof, ROOF)); ring.append((w - shoulder, H)); seg.append((roof, ROOF)); ring.append((-(w - shoulder), H)); seg.append((roof, ROOF))
    for k in range(n - 1, -1, -1):
        ring.append((-w, bands[k][0])); seg.append((bands[k][1], bands[k][2]))
    # ring: (-w,z0),(w,z0),(w,z1..zn),(w-sh,H),(-(w-sh),H),(-w,zn..z1); segment i: ring[i] -> ring[i+1],
    # the last one closing down the left side to ring[0] in band 0's colour
    assert len(seg) == len(ring)
    secs = [(-L / 2 + d, s) for d, s in back] + [(L / 2 - d, s) for d, s in reversed(front)]
    rings = []
    for x, s in secs:
        rings.append([(x, y * s, z) for y, z in ring])
    N = len(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(N):
            j = (i + 1) % N
            vb.face([a[i], b[i], b[j], a[j]], seg[i][0], seg[i][1])
    vb.face(list(reversed(rings[0])), end_col, PAINT)
    vb.face(rings[-1], front_col or end_col, PAINT)
    if glass_z:
        g0, g1 = glass_z; sf = front[0][1] * w * 0.8; sb = back[0][1] * w * 0.8
        vb.face([(L / 2 + 0.02, -sf, g0), (L / 2 + 0.02, sf, g0), (L / 2 + 0.02, sf, g1), (L / 2 + 0.02, -sf, g1)], glass_col or srgb('#101418'), GLASS)
        vb.face([(-L / 2 - 0.02, sb, g0), (-L / 2 - 0.02, -sb, g0), (-L / 2 - 0.02, -sb, g1), (-L / 2 - 0.02, sb, g1)], glass_col or srgb('#101418'), GLASS)


def lrv4():
    vb = VB(); L, W = 22.86, 2.64
    silver, red, grey = srgb('#c3c6c9'), srgb('#b3202a'), srgb('#9ea1a4')
    body(vb, L, W, 3.38, 0.42, [(0.98, red, PAINT), (1.18, silver, METAL), (2.32, srgb('#0d1013'), GLASS), (2.95, silver, METAL)],
         srgb('#a7aaad'), silver, front=((0.0, 0.72), (0.7, 0.9), (1.8, 1.0)), glass_z=(1.2, 2.5))
    vb.box(-8.2, -5.0, -0.95, 0.95, 3.3, 3.72, grey, ROOF)           # HVAC
    vb.box(5.0, 8.2, -0.95, 0.95, 3.3, 3.72, grey, ROOF)
    vb.box(-2.4, 1.6, -0.7, 0.7, 3.3, 3.5, srgb('#6d7073'), ROOF)    # traction gear
    vb.box(2.0, 3.6, -0.8, 0.8, 3.72, 3.8, srgb('#2a2a2a'), DARK)     # pantograph, folded frame
    vb.box(-L / 2 + 3.2, -L / 2 + 5.0, -1.2, 1.2, 0.05, 0.42, UNDER, DARK)   # bogies
    vb.box(L / 2 - 5.0, L / 2 - 3.2, -1.2, 1.2, 0.05, 0.42, UNDER, DARK)
    return vb

PCC_LIVERIES = [   # lower, belt, upper, roof   (F-line PCCs keep the liveries of the cities that ran them)
    ('#2f6b45', '#e9dfc1', '#e9dfc1', '#7d8378'),   # Muni 1950s "Wings" green and cream
    ('#1e5a3c', '#b8322a', '#e3dcc0', '#707a70'),   # Philadelphia
    ('#d96a24', '#f0e2c2', '#f0e2c2', '#8a8780'),   # Boston
    ('#8f1d1f', '#eadcbc', '#eadcbc', '#7b7670'),   # Kansas City
    ('#e2b43b', '#2c5b3a', '#e2b43b', '#7a7a70'),   # Los Angeles Transit Lines
    ('#264f33', '#e6d9b8', '#264f33', '#5f6660'),   # Brooklyn
    ('#d9c56a', '#3c3f45', '#d9c56a', '#77777a'),   # Baltimore
    ('#3d5d8c', '#e8e4dc', '#e8e4dc', '#80858c'),   # Louisville / Cincinnati blues
]

def pcc(lv):
    lower, belt, upper, roof = (srgb(c) for c in lv)
    vb = VB(); L, W = 15.2, 2.74
    body(vb, L, W, 3.08, 0.38, [(0.98, lower, PAINT), (1.2, belt, PAINT), (2.2, srgb('#0e1114'), GLASS), (2.62, upper, PAINT)],
         roof, lower, front=((0.0, 0.62), (0.6, 0.84), (1.6, 0.97), (2.4, 1.0)), glass_z=(1.25, 2.3), shoulder=0.45)
    vb.box(-1.5, 1.5, -0.55, 0.55, 3.0, 3.22, srgb('#55585a'), ROOF)          # roof equipment
    return vb

def peter_witt():
    vb = VB(); L, W = 14.9, 2.35
    orange, cream = srgb('#e58a2a'), srgb('#efe3c4')
    body(vb, L, W, 3.2, 0.42, [(1.02, orange, PAINT), (1.18, cream, PAINT), (2.22, srgb('#0e1114'), GLASS), (2.7, orange, PAINT)],
         srgb('#8b8a84'), orange, front=((0.0, 0.86), (0.7, 1.0)), glass_z=(1.25, 2.3), shoulder=0.3)
    vb.box(-L / 2 + 1.2, L / 2 - 1.2, -0.55, 0.55, 3.15, 3.38, srgb('#7d7c76'), ROOF)   # monitor roof
    return vb

def cable_car(L=8.3):
    vb = VB(); W = 2.44
    maroon, cream, blue, roof = srgb('#6f1a1d'), srgb('#e8dfc6'), srgb('#2e4f84'), srgb('#e2dccb')
    body(vb, L, W, 3.15, 0.32, [(0.92, maroon, PAINT), (1.08, blue, PAINT), (2.18, srgb('#1a1612'), GLASS), (2.62, cream, PAINT)],
         roof, maroon, front=((0.0, 0.94), (0.35, 1.0)), shoulder=0.28)
    vb.box(-L / 2 + 1.1, L / 2 - 1.1, -0.55, 0.55, 3.08, 3.3, srgb('#d6cfbb'), ROOF)    # clerestory
    vb.box(-L / 2 - 0.15, -L / 2 + 0.2, -0.4, 0.4, 0.5, 2.9, maroon, PAINT)              # end posts / dash
    vb.box(L / 2 - 0.2, L / 2 + 0.15, -0.4, 0.4, 0.5, 2.9, maroon, PAINT)
    return vb

def kiss_car(cab_front=False, cab_back=False, panto=False):
    vb = VB(); L, W = 26.0, 2.99
    white, red, grey = srgb('#e4e5e3'), srgb('#c11f2b'), srgb('#8e9193')
    nose = ((0.0, 0.62), (0.9, 0.82), (2.2, 0.96), (3.2, 1.0))
    flat = ((0.0, 0.93), (0.4, 1.0))
    body(vb, L, W, 4.42, 0.42, [(0.92, red, PAINT), (1.32, white, PAINT), (2.2, srgb('#0d1013'), GLASS), (2.9, white, PAINT),
                                (3.72, srgb('#0d1013'), GLASS), (3.98, white, PAINT)],
         grey, white, front=nose if cab_front else flat, back=nose if cab_back else flat,
         front_col=red if cab_front else white, glass_z=(2.3, 3.5) if cab_front else None, shoulder=0.55)
    if panto:
        vb.box(-2.5, 2.5, -0.9, 0.9, 4.3, 4.55, srgb('#6a6d70'), ROOF)
        vb.box(-1.4, 1.4, -0.8, 0.8, 4.55, 4.62, srgb('#262626'), DARK)
    vb.box(-L / 2 + 2.0, -L / 2 + 4.2, -1.2, 1.2, 0.05, 0.42, UNDER, DARK)
    vb.box(L / 2 - 4.2, L / 2 - 2.0, -1.2, 1.2, 0.05, 0.42, UNDER, DARK)
    return vb

def gallery_car(cab=False):
    vb = VB(); L, W = 25.9, 3.2
    steel, red = srgb('#b9bdc0'), srgb('#b3262c')
    body(vb, L, W, 4.75, 0.5, [(1.05, steel, METAL), (1.35, red, PAINT), (1.62, steel, METAL), (2.35, srgb('#0d1013'), GLASS),
                               (3.05, steel, METAL), (3.72, srgb('#0d1013'), GLASS), (4.25, steel, METAL)],
         srgb('#9a9ea1'), steel, front=((0.0, 0.95), (0.3, 1.0)), front_col=red if cab else steel, shoulder=0.5)
    return vb

def loco():
    vb = VB(); L, W = 17.7, 3.1
    grey, red, dark = srgb('#8d9195'), srgb('#b3262c'), srgb('#3a3c3e')
    body(vb, L, W, 4.4, 0.55, [(1.2, red, PAINT), (4.0, grey, PAINT)], dark, grey,
         front=((0.0, 0.8), (1.5, 0.9), (2.4, 1.0)), back=((0.0, 0.95), (0.4, 1.0)), front_col=red, glass_z=(3.0, 3.7), shoulder=0.45)
    for x in (-5.0, -2.0, 1.0):
        vb.box(x - 1.0, x + 1.0, -0.9, 0.9, 4.35, 4.45, srgb('#222222'), DARK)                  # radiator fans
    return vb

PROTOS = {
    'lrv4': lrv4, 'pw': peter_witt, 'cable': cable_car, 'cable_cal': lambda: cable_car(9.1),
    'kiss_cab': lambda: kiss_car(cab_front=True), 'kiss_mid': kiss_car, 'kiss_panto': lambda: kiss_car(panto=True),
    'gal': gallery_car, 'gal_cab': lambda: gallery_car(cab=True), 'loco': loco,
}
for _i, _lv in enumerate(PCC_LIVERIES):
    PROTOS[f'pcc{_i}'] = (lambda lv=_lv: pcc(lv))

LENGTH = {'lrv4': 22.86, 'pw': 14.9, 'cable': 8.3, 'cable_cal': 9.1, 'kiss_cab': 26.0, 'kiss_mid': 26.0, 'kiss_panto': 26.0,
          'gal': 25.9, 'gal_cab': 25.9, 'loco': 17.7, **{f'pcc{i}': 15.2 for i in range(len(PCC_LIVERIES))}}

# v3 bodies (27/09, live assets agent, live_rail.py): same keys and lengths; LIVE_V3=0 keeps the ones above.
# (imported when a body is built, so live_rail may import this module first)
import live_kit as _LK
if _LK.on():
    def _v3(fn, *a, **k):
        def f():
            import live_rail as _LR
            return getattr(_LR, fn)(*a, **k)
        return f
    PROTOS.update({'lrv4': _v3('lrv4_v3'), 'pw': _v3('peter_witt_v3'), 'cable': _v3('cable_car_v3'), 'cable_cal': _v3('cable_car_v3', 9.1),
                   'kiss_cab': _v3('kiss_v3', cab_front=True), 'kiss_mid': _v3('kiss_v3'), 'kiss_panto': _v3('kiss_v3', panto=True),
                   'gal': _v3('gallery_v3'), 'gal_cab': _v3('gallery_v3', cab=True), 'loco': _v3('loco_v3')})
    for _i, _lv in enumerate(PCC_LIVERIES):
        PROTOS[f'pcc{_i}'] = _v3('pcc_v3', _lv)
