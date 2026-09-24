"""Buses and trucks for the streets (life_traffic.py places them; the cars are
hq_scene's own eight bodies, instanced). Local frame: x along the vehicle
(+x = front), y across, z up from the road. Built with transit_cars.body (the
lofted rail bodies), material slots PAINT, GLASS, ROOF, DARK, METAL.
  Muni's New Flyer Xcelsior buses: 40 ft (12.5 m) and 60 ft articulated
    (18.3 m) x 2.6 m, 3.3 m to the roof pods; silver with the red skirt band
    and the dark window band (a convention of the fleet's look, not a record).
  a parcel van / box truck 7-8 m; a Sprinter-type van 6 m; a tractor-trailer
    21 m on the freeways.
"""
import random
from transit_cars import VB, body, srgb, PAINT, GLASS, ROOF, DARK, METAL, UNDER

SILVER, RED, WIN = srgb('#c3c6c9'), srgb('#b3202a'), srgb('#0d1013')


def bus(L=12.5, artic=False):
    vb = VB(); W = 2.59
    if not artic:
        body(vb, L, W, 3.05, 0.35, [(0.95, RED, PAINT), (1.1, SILVER, PAINT), (2.4, WIN, GLASS), (2.8, SILVER, PAINT)],
             srgb('#e2e4e5'), SILVER, front=((0.0, 0.93), (0.35, 1.0)), glass_z=(1.0, 2.6), shoulder=0.3)
        vb.box(-L / 2 + 1.0, -L / 2 + 4.0, -0.95, 0.95, 3.0, 3.3, srgb('#8a8d90'), ROOF)       # the hybrid's battery pod
        vb.box(0.5, 3.0, -0.9, 0.9, 3.0, 3.25, srgb('#9a9d9f'), ROOF)                          # HVAC
        return vb
    # articulated: front section, the bellows, the trailer section
    Lf, Lb = 11.2, 6.6
    for x0, Ls, frt in ((L / 2 - Lf / 2, Lf, True), (-L / 2 + Lb / 2, Lb, False)):
        sub = VB()
        body(sub, Ls, W, 3.05, 0.35, [(0.95, RED, PAINT), (1.1, SILVER, PAINT), (2.4, WIN, GLASS), (2.8, SILVER, PAINT)],
             srgb('#e2e4e5'), SILVER, front=((0.0, 0.93), (0.35, 1.0)) if frt else ((0.0, 1.0), (0.2, 1.0)),
             back=((0.0, 1.0), (0.2, 1.0)) if frt else ((0.0, 0.95), (0.3, 1.0)), glass_z=(1.0, 2.6) if frt else None, shoulder=0.3)
        k = len(vb.V)
        vb.V += [(x + x0, y, z) for x, y, z in sub.V]; vb.F += [tuple(i + k for i in f) for f in sub.F]; vb.C += sub.C; vb.MI += sub.MI
    bx = L / 2 - Lf - 0.25
    vb.box(bx - 0.3, bx + 0.55, -1.2, 1.2, 0.4, 2.95, srgb('#1b1c1d'), DARK)                    # bellows
    vb.box(L / 2 - Lf + 1.0, L / 2 - Lf + 4.0, -0.95, 0.95, 3.0, 3.3, srgb('#8a8d90'), ROOF)
    vb.box(L / 2 - 4.0, L / 2 - 1.5, -0.9, 0.9, 3.0, 3.25, srgb('#9a9d9f'), ROOF)
    return vb


def box_truck(kind='white', seed=0):
    """a cab and a box: rental / delivery white, the brown parcel van"""
    r = random.Random(seed); vb = VB()
    if kind == 'parcel':
        c = srgb('#4b3526'); L, W, H = 7.2, 2.3, 3.1
        body(vb, L, W, H, 0.4, [(1.05, c, PAINT), (1.4, c, PAINT), (2.1, WIN, GLASS), (H - 0.1, c, PAINT)], c, c,
             front=((0.0, 0.85), (0.6, 1.0)), glass_z=(1.5, 2.2), shoulder=0.1)
        return vb
    cab = r.choice((srgb('#e8e8e4'), srgb('#e8e8e4'), srgb('#b8202a'), srgb('#1d3a6b'), srgb('#2a2c2e')))
    box = srgb('#eeeeea') if r.random() < 0.8 else srgb(r.choice(('#d8c86a', '#c8d0d6', '#e0a040')))
    Lc, Lb, W = 2.4, 5.6, 2.4
    sub = VB()
    body(sub, Lc, W, 2.6, 0.45, [(1.2, cab, PAINT), (1.5, cab, PAINT), (2.2, WIN, GLASS)], cab, cab,
         front=((0.0, 0.9), (0.5, 1.0)), back=((0.0, 1.0), (0.1, 1.0)), glass_z=(1.5, 2.2), shoulder=0.2)
    k = len(vb.V); x0 = (Lb + 0.3) / 2
    vb.V += [(x + x0, y, z) for x, y, z in sub.V]; vb.F += [tuple(i + k for i in f) for f in sub.F]; vb.C += sub.C; vb.MI += sub.MI
    xb = -Lc / 2 - 0.15
    vb.box(xb - Lb / 2 - 0.1, xb + Lb / 2 - 0.1, -1.25, 1.25, 0.8, 3.5, box, PAINT)
    vb.box(xb - Lb / 2, xb + Lb / 2 - 0.2, -1.1, 1.1, 0.2, 0.8, UNDER, DARK)
    return vb


def van(seed=0):
    """a high-roof delivery van (Sprinter / Transit), 6 m"""
    r = random.Random(seed); vb = VB()
    c = srgb(r.choice(('#e8e8e4', '#e8e8e4', '#e8e8e4', '#2a3a55', '#8a8f94', '#1c2a44')))
    body(vb, 5.9, 2.0, 2.7, 0.35, [(1.0, c, PAINT), (1.3, c, PAINT), (1.95, WIN, GLASS), (2.6, c, PAINT)], c, c,
         front=((0.0, 0.8), (0.7, 0.92), (1.1, 1.0)), glass_z=(1.2, 1.9), shoulder=0.15)
    return vb


def semi(seed=0):
    """a tractor and a 53 ft trailer (the trailer's roof is what shows)"""
    r = random.Random(seed); vb = VB()
    cab = srgb(r.choice(('#e8e8e4', '#b8202a', '#1d3a6b', '#2a2c2e', '#6a7076', '#1f4a2f')))
    trl = srgb(r.choice(('#e6e6e2', '#e6e6e2', '#c8ccd0', '#9aa0a6', '#d8d4c8')))
    sub = VB()
    body(sub, 5.8, 2.5, 3.6, 0.5, [(1.4, cab, PAINT), (2.1, cab, PAINT), (2.8, WIN, GLASS), (3.5, cab, PAINT)], cab, cab,
         front=((0.0, 0.85), (1.0, 1.0)), glass_z=(2.1, 2.8), shoulder=0.35)
    k = len(vb.V); x0 = 21.0 / 2 - 5.8 / 2
    vb.V += [(x + x0, y, z) for x, y, z in sub.V]; vb.F += [tuple(i + k for i in f) for f in sub.F]; vb.C += sub.C; vb.MI += sub.MI
    vb.box(-21.0 / 2, 21.0 / 2 - 5.2, -1.3, 1.3, 1.2, 4.1, trl, PAINT)
    vb.box(-21.0 / 2 + 0.8, 21.0 / 2 - 5.8, -1.1, 1.1, 0.25, 1.2, UNDER, DARK)
    return vb


PROTOS = {'bus40': lambda: bus(12.5), 'bus60': lambda: bus(18.3, True), 'parcel': lambda: box_truck('parcel'),
          **{f'box{i}': (lambda i=i: box_truck('white', i)) for i in range(5)},
          **{f'van{i}': (lambda i=i: van(i)) for i in range(5)},
          **{f'semi{i}': (lambda i=i: semi(i)) for i in range(4)}}
LENGTH = {'bus40': 12.5, 'bus60': 18.3, 'parcel': 7.2, **{f'box{i}': 8.3 for i in range(5)}, **{f'van{i}': 5.9 for i in range(5)},
          **{f'semi{i}': 21.0 for i in range(4)}}
