"""v3 rail vehicles (27/09, live assets agent): the bodies transit_cars.PROTOS
hands to transit_hq (placement untouched: same keys, same LENGTH, same local
frame: x along the car, +x the front, y across, z up from the rail top; the
right-hand side, -y, carries the doors). LIVE_V3=0 = the bodies before.

At z9 native (9.4 cm/px) and 29 degrees the side of a car is ~30 px tall and
its roof ~15 px, so what reads is: the livery's bands and the individual
windows with their pillars (the old cars), the doors, the trucks with their
wheels under the body, the roof's own colour with the gear grouped on it,
the trolley pole (a dark line up to the wire) and, on a cable car, the open
grip section with its riders on the running boards.

SOURCES (reference only, assets_live/SOURCES.md): Powell car 27 ft / 10'3",
California car 30'5" (cable-car-guy.com roster); maroon with sky-blue trim,
cream sashes (streetcar.org car 7); PCC liveries (streetcar.org); Milan
Ventotto orange (streetcar.org); S200 SF 22.86 x 2.65 m, red and silver
(Wikipedia Siemens S200). CONVENTION: roof colours of the cable cars and
PCCs, the gear's layout, the riders.
"""
import math, os, random
from transit_cars import VB, body, srgb, PAINT, GLASS, ROOF, DARK, METAL, UNDER
import live_kit as LK

WIN = srgb('#0f1216'); POLE = srgb('#242526'); TRUCK = srgb('#202122')


def truck(vb, x, hw=1.0, wb=1.9, r=0.34, z_top=0.42, col=TRUCK):
    """a two-axle truck (bogie): the frame between the wheels, the wheels as discs on its sides"""
    LK.box(vb, x - wb / 2 - 0.35, x + wb / 2 + 0.35, -hw * 0.82, hw * 0.82, 0.12, z_top, col, DARK)
    for xa in (x - wb / 2, x + wb / 2):
        for s in (-1, 1):
            LK.disc(vb, xa, s * hw * 0.84, r, r, srgb('#2b2c2e'), DARK, 10, s=s)
            LK.disc(vb, xa, s * hw * 0.86, r, r * 0.45, srgb('#55585b'), METAL, 8, s=s)


def trolley_pole(vb, xb, zb, up=True, length=4.6, wire=5.7, back=1):
    """one trolley pole: its base on the roof at xb, raised to the wire (trailing
    toward -x when back=1) or stowed flat on the roof under its hook"""
    LK.chbox(vb, xb - 0.35, xb + 0.35, -0.3, 0.3, zb, zb + 0.16, srgb('#3a3c3e'), DARK, ch=0.05)
    if up:
        dz = max(0.3, wire - zb - 0.16); dx = math.sqrt(max(0.5, length ** 2 - dz ** 2))
        LK.rod(vb, (xb, 0.0, zb + 0.16), (xb - back * dx, 0.0, zb + 0.16 + dz), 0.08, POLE, DARK)
        LK.box(vb, xb - back * dx - 0.12, xb - back * dx + 0.12, -0.05, 0.05, zb + dz + 0.1, zb + dz + 0.24, POLE, DARK)   # the shoe
    else:
        LK.rod(vb, (xb, 0.0, zb + 0.2), (xb - back * length, 0.0, zb + 0.3), 0.08, POLE, DARK)


riders = LK.riders


# ── cable cars ─────────────────────────────────────────────────────────────
CC_MAROON, CC_BLUE, CC_CREAM, CC_ROOF = srgb('#761d22'), srgb('#5f8fc6'), srgb('#eadfc4'), srgb('#c5bfae')
CC_WOOD = srgb('#8a6440'); CC_INT = srgb('#2a1c16')


def _cc_open(vb, x0, x1, hw, zf, sd):
    """an open grip section between x0 and x1: the outward-facing benches along
    both sides, the posts holding the roof, the dark interior, riders"""
    LK.box(vb, x0, x1, -hw + 0.05, hw - 0.05, 0.4, zf, CC_MAROON, PAINT, top=CC_WOOD)           # floor / sill
    LK.side(vb, x0, x1, 0.4, zf, hw - 0.05, CC_MAROON, PAINT)
    LK.side(vb, x0, x1, 0.42, 0.5, hw - 0.05, CC_BLUE, PAINT, eps=0.03)                          # the blue rocker trim
    LK.box(vb, x0 + 0.1, x1 - 0.1, -0.35, 0.35, zf, zf + 1.05, CC_INT, DARK)                      # the back-to-back seat spine
    for s in (-1, 1):
        LK.box(vb, x0 + 0.1, x1 - 0.1, s * 0.35 - 0.2, s * 0.35 + 0.2, zf + 0.42, zf + 0.5, CC_WOOD, PAINT)   # bench
    n = max(2, int((x1 - x0) / 0.95))
    for k in range(n + 1):
        x = x0 + k * (x1 - x0) / n
        for s in (-1, 1): LK.box(vb, x - 0.04, x + 0.04, s * (hw - 0.1) - 0.04, s * (hw - 0.1) + 0.04, zf, 2.62, CC_CREAM, PAINT)
    # the running boards
    LK.box(vb, x0, x1, hw, hw + 0.28, 0.42, 0.5, CC_WOOD, PAINT); LK.box(vb, x0, x1, -hw - 0.28, -hw, 0.42, 0.5, CC_WOOD, PAINT)
    r = random.Random(sd); pts = []
    for s in (-1, 1):
        x = x0 + 0.35
        while x < x1 - 0.3:
            if r.random() < 0.75: pts.append((x, s * (hw - 0.3), zf + 0.05, True))           # seated / standing on the edge
            if r.random() < 0.55: pts.append((x + 0.2, s * (hw + 0.14), 0.5, True))          # on the running board
            x += 0.62
    riders(vb, pts, sd)


def _cc_cabin(vb, x0, x1, hw, zf):
    """the closed cabin: maroon lower panels, the blue trim, the cream sashes
    of its windows, the letter board"""
    LK.box(vb, x0, x1, -hw, hw, 0.4, zf, CC_MAROON, PAINT)
    LK.box(vb, x0, x1, -hw, hw, zf, zf + 0.62, CC_MAROON, PAINT)
    LK.side(vb, x0, x1, zf + 0.5, zf + 0.6, hw, CC_BLUE, PAINT)
    LK.box(vb, x0, x1, -hw, hw, zf + 0.62, 2.35, WIN, GLASS)
    LK.ladder_windows(vb, x0, x1, zf + 0.62, 2.35, hw, 0.52, 0.09, CC_CREAM)
    LK.side(vb, x0, x1, zf + 0.62, zf + 0.7, hw, CC_CREAM, PAINT, eps=0.02)
    LK.box(vb, x0, x1, -hw, hw, 2.35, 2.62, CC_CREAM, PAINT)                                    # letter board
    for x in (x0, x1): LK.end(vb, x, -hw, hw, 0.4, 2.62, CC_MAROON, PAINT, front=x == x1, eps=0.005)
    LK.end(vb, x1, -0.5, 0.5, zf + 0.7, 2.25, WIN, GLASS, eps=0.02); LK.end(vb, x0, -0.5, 0.5, zf + 0.7, 2.25, WIN, GLASS, front=False, eps=0.02)


def _cc_roof(vb, x0, x1, hw, cl0, cl1):
    """the roof over the whole car (it overhangs the open sections), the
    clerestory with its small eyebrow windows over the cabin"""
    oh = 0.12; z0, z1 = 2.62, 2.86
    LK.chbox(vb, x0, x1, -hw - oh, hw + oh, z0, z1, CC_ROOF, ROOF, ch=0.22)
    LK.side(vb, x0, x1, z0, z0 + 0.1, hw + oh - 0.01, CC_MAROON, PAINT, eps=0.012)              # the roof's edge fascia
    LK.box(vb, cl0, cl1, -0.62, 0.62, z1 - 0.02, z1 + 0.2, srgb('#2a2622'), GLASS)              # the clerestory's windows
    LK.chbox(vb, cl0 - 0.05, cl1 + 0.05, -0.7, 0.7, z1 + 0.2, z1 + 0.3, CC_ROOF, ROOF, ch=0.08)
    for x in (x0 + 0.12, x1 - 0.12):                                                             # route boards on the ends
        LK.box(vb, x - 0.05, x + 0.05, -0.75, 0.75, z1, z1 + 0.28, CC_CREAM, PAINT)


def cable_car_v3(L=8.3):
    vb = VB(); W = 2.44; hw = W / 2; zf = 0.82; e = L / 2
    cal = L > 8.8
    if cal:   # California: double-ended, open sections both ends, the cabin between
        cab0, cab1 = -1.75, 1.75
        _cc_open(vb, -e + 0.75, cab0, hw, zf, 11); _cc_open(vb, cab1, e - 0.75, hw, zf, 12)
        _cc_cabin(vb, cab0, cab1, hw, zf)
        for x in (-e, e - 0.75): LK.box(vb, x, x + 0.75, -hw + 0.1, hw - 0.1, 0.4, zf, CC_MAROON, PAINT, top=CC_WOOD)   # end platforms
        for x, fr in ((e, True), (-e, False)):
            LK.box(vb, x - 0.12 if fr else x, x if fr else x + 0.12, -hw + 0.15, hw - 0.15, 0.4, zf + 0.45, CC_MAROON, PAINT)   # dash
            LK.end(vb, x, -0.14, 0.14, zf + 0.12, zf + 0.34, LK.LAMP, METAL, front=fr)
        _cc_roof(vb, -e + 0.1, e - 0.1, hw, cab0, cab1)
    else:     # Powell: the open grip section in front, the closed cabin, the open rear platform
        g1 = e - 0.7; g0 = g1 - 2.7; c0 = -e + 1.05
        _cc_open(vb, g0, g1, hw, zf, 7)
        _cc_cabin(vb, c0, g0, hw, zf)
        LK.box(vb, g1, e, -hw + 0.15, hw - 0.15, 0.4, zf, CC_MAROON, PAINT, top=CC_WOOD)        # front platform
        LK.box(vb, e - 0.12, e, -hw + 0.15, hw - 0.15, 0.4, zf + 0.45, CC_MAROON, PAINT)        # dash
        LK.end(vb, e, -0.14, 0.14, zf + 0.12, zf + 0.34, LK.LAMP, METAL)
        LK.box(vb, -e, c0, -hw + 0.1, hw - 0.1, 0.4, zf, CC_MAROON, PAINT, top=CC_WOOD)          # rear platform
        LK.box(vb, -e, -e + 0.08, -hw + 0.1, hw - 0.1, zf, zf + 1.0, CC_MAROON, PAINT)           # its rail
        riders(vb, [(-e + 0.45, -0.6, zf, True), (-e + 0.5, 0.5, zf, True)], 9)
        _cc_roof(vb, -e + 0.05, e - 0.1, hw, c0 + 0.2, g0 - 0.2)
    for x in (-e + 1.8, e - 1.8): truck(vb, x, hw=0.75, wb=1.2, r=0.3, z_top=0.4)
    return vb


# ── F-line: PCCs and the Milan Peter Witt ─────────────────────────────────
def pcc_v3(lv):
    lower, belt, upper, roof = (srgb(c) for c in lv)
    vb = VB(); L, W = 15.2, 2.74; hw = W / 2; e = L / 2
    body(vb, L, W, 3.08, 0.38, [(0.98, lower, PAINT), (1.2, belt, PAINT), (2.2, WIN, GLASS), (2.62, upper, PAINT)],
         roof, lower, front=((0.0, 0.62), (0.6, 0.84), (1.6, 0.97), (2.4, 1.0)), glass_z=(1.25, 2.3), shoulder=0.45)
    xs0, xs1 = -e + 2.4, e - 2.4                       # the straight side (the plan is full width only here)
    doors = [(e - 2.35, e - 1.35), (-0.4, 0.8)]
    LK.ladder_windows(vb, xs0, xs1, 1.2, 2.2, hw, 1.12, 0.16, upper, skip=doors)
    LK.side(vb, xs0, xs1, 1.18, 1.24, hw, belt, PAINT, eps=0.02)
    for a, b in doors: LK.door(vb, a, b, 0.42, 2.22, hw, lower)
    for s in (-1, 1): LK.side(vb, xs0, xs1, 0.38, 0.46, hw, srgb('#2a2b2c'), DARK, eps=0.015)         # the skirt's shadow line
    for x in (-e + 3.2, e - 3.2): truck(vb, x, hw=1.05, wb=1.95, r=0.33, z_top=0.38)
    LK.end(vb, e, -0.9, 0.9, 2.35, 2.6, LK.SIGN, DARK, eps=0.03)                                     # destination sign
    LK.end(vb, e, -0.13, 0.13, 0.62, 0.8, LK.LAMP, METAL, eps=0.03)                                  # headlamp
    LK.end(vb, e, -1.0, 1.0, 0.4, 0.52, srgb('#2a2b2c'), DARK, eps=0.03)                             # anticlimber
    LK.end(vb, -e, -1.0, 1.0, 0.4, 0.52, srgb('#2a2b2c'), DARK, front=False, eps=0.03)
    # the roof: the fan housing and the resistor grids grouped at centre, the pole at the rear
    LK.chbox(vb, -1.6, 1.4, -0.55, 0.55, 3.02, 3.24, LK.mix(roof, (0.3, 0.3, 0.3), 0.35), ROOF, ch=0.08)
    LK.box(vb, -3.6, -1.9, -0.45, 0.45, 3.02, 3.14, srgb('#3a3c3e'), DARK)
    trolley_pole(vb, -e + 4.2, 3.06)
    LK.box(vb, -e - 0.12, -e + 0.02, -0.2, 0.2, 1.4, 2.0, srgb('#1c1d1e'), DARK)                      # the retriever
    return vb


PW_ORANGE, PW_CREAM = srgb('#e2782a'), srgb('#efe3c4')


def peter_witt_v3():
    """Milan 1928 'Ventotto' (F line), boxy, orange; many windows; a monitor roof"""
    vb = VB(); L, W = 14.9, 2.35; hw = W / 2; e = L / 2; z0 = 0.78
    body(vb, L, W, 3.12, z0, [(1.1, PW_ORANGE, PAINT), (1.2, PW_CREAM, PAINT), (2.2, WIN, GLASS), (2.62, PW_ORANGE, PAINT)],
         srgb('#77766f'), PW_ORANGE, front=((0.0, 0.84), (0.4, 0.96), (0.8, 1.0)), glass_z=(1.25, 2.25), shoulder=0.22)
    xs0, xs1 = -e + 0.8, e - 0.8
    doors = [(e - 1.75, e - 0.85), (-0.9, 0.45)]
    LK.ladder_windows(vb, xs0, xs1, 1.2, 2.2, hw, 0.95, 0.14, PW_ORANGE, skip=doors)
    for a, b in doors: LK.door(vb, a, b, 0.42, 2.24, hw, PW_ORANGE)
    LK.side(vb, xs0, xs1, z0, z0 + 0.08, hw, srgb('#2a2b2c'), DARK)
    for x in (-e + 3.0, e - 3.0): truck(vb, x, hw=0.95, wb=1.8, r=0.4, z_top=0.78)
    LK.chbox(vb, -e + 1.3, e - 1.3, -0.62, 0.62, 3.05, 3.36, srgb('#6e6d67'), ROOF, ch=0.06)            # the monitor
    LK.side(vb, -e + 1.4, e - 1.4, 3.1, 3.28, 0.62, srgb('#1e1f22'), GLASS, eps=0.01)                   # its vent lights
    LK.end(vb, e, -0.75, 0.75, 2.3, 2.55, LK.SIGN, DARK, eps=0.03)
    LK.end(vb, e, -0.12, 0.12, 0.95, 1.1, LK.LAMP, METAL, eps=0.03)
    trolley_pole(vb, -e + 4.0, 3.36)
    return vb


# ── Muni Metro: Siemens S200 SF (LRV4) ────────────────────────────────────
def lrv4_v3():
    vb = VB(); L, W = 22.86, 2.64; hw = W / 2; e = L / 2
    silver, red, roofc = srgb('#c3c6c9'), srgb('#b3202a'), srgb('#b9bcbe')
    nose = ((0.0, 0.72), (0.7, 0.9), (1.8, 1.0))
    for x0, x1, fr, bk in ((0.25, e, True, False), (-e, -0.25, False, True)):
        sub = VB(); Ls = x1 - x0
        body(sub, Ls, W, 3.38, 0.42, [(0.98, red, PAINT), (1.18, silver, METAL), (2.32, WIN, GLASS), (2.95, silver, METAL)],
             roofc, silver, front=nose if fr else ((0.0, 1.0), (0.1, 1.0)), back=nose if bk else ((0.0, 1.0), (0.1, 1.0)),
             glass_z=(1.2, 2.5) if (fr or bk) else None, front_col=red if fr else silver, shoulder=0.32)
        if bk:   # the back end's face is red too (the car is double-ended)
            sub.face([(-Ls / 2 - 0.03, 1.0, 0.5), (-Ls / 2 - 0.03, -1.0, 0.5), (-Ls / 2 - 0.03, -1.0, 1.1), (-Ls / 2 - 0.03, 1.0, 1.1)], red, PAINT)
        LK.merge(vb, sub, (x0 + x1) / 2)
    LK.box(vb, -0.3, 0.3, -1.2, 1.2, 0.5, 3.2, srgb('#1c1d1e'), DARK)                                 # the articulation
    for d in (e - 3.3, e - 8.0, -e + 8.0, -e + 3.3):                                                   # four double doors a side
        LK.door(vb, d - 0.65, d + 0.65, 0.44, 2.4, hw, silver)
        LK.door(vb, d - 0.65, d + 0.65, 0.44, 2.4, hw, silver, sides=(1,))
    for x in (-e + 5.6, 0.0, e - 5.6): truck(vb, x, hw=1.05, wb=1.8, r=0.34, z_top=0.42)
    # roof: HVAC over each end, the traction gear, the pantograph folded
    for a, b in ((e - 8.4, e - 5.0), (-(e - 5.0), -(e - 8.4))):
        LK.chbox(vb, a, b, -0.98, 0.98, 3.3, 3.72, LK.GEAR_L, ROOF, ch=0.14)
    LK.chbox(vb, -4.2, -1.0, -0.75, 0.75, 3.3, 3.55, LK.GEAR, ROOF, ch=0.1)
    LK.box(vb, 1.5, 3.6, -0.9, 0.9, 3.36, 3.44, LK.GEAR_D, DARK)
    for y in (-0.7, 0.7): LK.rod(vb, (1.7, y, 3.5), (3.4, y * 0.3, 3.62), 0.07, POLE, DARK)
    LK.box(vb, 3.1, 3.5, -0.8, 0.8, 3.6, 3.66, POLE, DARK)
    return vb


# ── Caltrain ───────────────────────────────────────────────────────────────
def kiss_v3(cab_front=False, cab_back=False, panto=False):
    vb = VB(); L, W = 26.0, 2.99; hw = W / 2; e = L / 2
    white, red, grey, dgrey = srgb('#e4e5e3'), srgb('#c11f2b'), srgb('#9a9d9f'), srgb('#56595c')
    nose = ((0.0, 0.62), (0.9, 0.82), (2.2, 0.96), (3.2, 1.0))
    flat = ((0.0, 0.93), (0.4, 1.0))
    body(vb, L, W, 4.42, 0.42, [(0.92, red, PAINT), (1.32, white, PAINT), (2.2, WIN, GLASS), (2.9, white, PAINT),
                                (3.72, WIN, GLASS), (3.98, white, PAINT)],
         grey, white, front=nose if cab_front else flat, back=nose if cab_back else flat,
         front_col=red if cab_front else white, glass_z=(2.3, 3.5) if cab_front else None, shoulder=0.55)
    xs0 = -e + (3.4 if cab_back else 0.6); xs1 = e - (3.4 if cab_front else 0.6)
    doors = [(e - 5.4, e - 4.1), (-e + 4.1, -e + 5.4)]
    LK.ladder_windows(vb, xs0, xs1, 1.32, 2.2, hw, 1.85, 0.2, white, skip=doors)
    LK.ladder_windows(vb, xs0, xs1, 2.9, 3.72, hw, 1.85, 0.2, white)
    for a, b in doors:
        LK.door(vb, a, b, 0.45, 2.45, hw, red); LK.door(vb, a, b, 0.45, 2.45, hw, red, sides=(1,))
    for x in (-e + 2.8, e - 2.8): truck(vb, x, hw=1.2, wb=2.5, r=0.42, z_top=0.42)
    # roof: grouped HVAC, the pantograph on its car
    LK.chbox(vb, -e + 3.5, -e + 6.5, -1.0, 1.0, 4.35, 4.62, LK.GEAR_L, ROOF, ch=0.12)
    LK.chbox(vb, e - 6.5, e - 3.5, -1.0, 1.0, 4.35, 4.62, LK.GEAR_L, ROOF, ch=0.12)
    if panto:
        LK.chbox(vb, -2.5, 2.5, -0.95, 0.95, 4.35, 4.55, LK.GEAR, ROOF, ch=0.08)
        LK.box(vb, -1.4, 1.4, -0.85, 0.85, 4.55, 4.6, dgrey, DARK)
        for y in (-0.8, 0.8): LK.rod(vb, (-1.2, y, 4.6), (0.9, y * 0.4, 5.6), 0.07, POLE, DARK)
        LK.box(vb, 0.7, 1.1, -0.9, 0.9, 5.55, 5.62, POLE, DARK)
    if cab_front:
        LK.end(vb, e, -0.9, 0.9, 3.65, 3.9, LK.SIGN, DARK, eps=0.03)
        for s in (-1, 1): LK.end(vb, e, s * 1.0, s * 0.7, 1.1, 1.3, LK.LAMP, METAL, eps=0.03)
    return vb


def gallery_v3(cab=False):
    vb = VB(); L, W = 25.9, 3.2; hw = W / 2; e = L / 2
    steel, red = srgb('#b9bdc0'), srgb('#b3262c')
    body(vb, L, W, 4.75, 0.5, [(1.05, steel, METAL), (1.35, red, PAINT), (1.62, steel, METAL), (2.35, WIN, GLASS),
                               (3.05, steel, METAL), (3.72, WIN, GLASS), (4.25, steel, METAL)],
         srgb('#9a9ea1'), steel, front=((0.0, 0.95), (0.3, 1.0)), front_col=red if cab else steel, shoulder=0.5)
    doors = [(-0.8, 0.8)]
    LK.ladder_windows(vb, -e + 1.2, e - 1.2, 1.62, 2.35, hw, 1.6, 0.22, steel, skip=doors)
    LK.ladder_windows(vb, -e + 1.2, e - 1.2, 3.05, 3.72, hw, 1.6, 0.22, steel)
    for a, b in doors:
        LK.door(vb, a, b, 0.55, 2.4, hw, steel); LK.door(vb, a, b, 0.55, 2.4, hw, steel, sides=(1,))
    for x in (-e + 2.8, e - 2.8): truck(vb, x, hw=1.2, wb=2.6, r=0.45, z_top=0.5)
    for x in (-e + 3.0, e - 5.0): LK.chbox(vb, x, x + 2.0, -0.9, 0.9, 4.7, 4.9, LK.GEAR, ROOF, ch=0.1)
    return vb


def loco_v3():
    vb = VB(); L, W = 17.7, 3.1; hw = W / 2; e = L / 2
    grey, red, dark = srgb('#8d9195'), srgb('#b3262c'), srgb('#3a3c3e')
    body(vb, L, W, 4.4, 0.95, [(1.35, red, PAINT), (4.0, grey, PAINT)], dark, grey,
         front=((0.0, 0.8), (1.5, 0.9), (2.4, 1.0)), back=((0.0, 0.95), (0.4, 1.0)), front_col=red, glass_z=(3.0, 3.7), shoulder=0.45)
    LK.side(vb, e - 3.2, e - 1.6, 3.0, 3.7, hw * 0.98, WIN, GLASS)                                        # cab side windows
    for x in (-e + 1.5, -e + 5.5): LK.side(vb, x, x + 3.0, 1.6, 3.6, hw, srgb('#6d7175'), METAL)          # engine-room doors
    for x in (-5.0, -2.0, 1.0):
        LK.box(vb, x - 1.0, x + 1.0, -0.9, 0.9, 4.35, 4.45, srgb('#222222'), DARK)
    for x in (-e + 3.3, e - 3.3): truck(vb, x, hw=1.25, wb=3.2, r=0.52, z_top=0.95)
    LK.box(vb, -e + 1.0, e - 1.0, -hw + 0.1, hw - 0.1, 0.7, 0.95, srgb('#1e1f20'), DARK)                  # the fuel tank / frame
    return vb
