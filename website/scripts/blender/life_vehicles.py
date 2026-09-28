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
        vb.box(-L / 2 + 1.0, -L / 2 + 4.0, -0.95, 0.95, 3.0, 3.3, srgb('#5e6164'), ROOF)       # the hybrid's battery pod
        vb.box(0.5, 3.0, -0.9, 0.9, 3.0, 3.25, srgb('#6e7174'), ROOF)                          # HVAC
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
    vb.box(L / 2 - Lf + 1.0, L / 2 - Lf + 4.0, -0.95, 0.95, 3.0, 3.3, srgb('#5e6164'), ROOF)
    vb.box(L / 2 - 4.0, L / 2 - 1.5, -0.9, 0.9, 3.0, 3.25, srgb('#6e7174'), ROOF)
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


# ── v3 (27/09, live assets agent; LIVE_V3=0 = the bodies above) ────────────
# New Flyer Xcelsior as Muni runs it: XDE40 / XDE60 diesel-electric hybrids
# (the energy-storage pod on the front roof, the HVAC at the rear) and XT40 /
# XT60 trolleybuses (a long traction fairing, the two trolley poles from
# mid-roof back past the tail under their retainer hooks). Dimensions:
# 12.5 m / 18.3 m x 2.59 m, 7.24 m wheelbase (40 ft), doors front and centre
# (40 ft) and front, centre, rear (60 ft) on the kerb side. The livery: silver
# with the red skirt and the black window band (SOURCES.md, cptdb XT60), the
# roof light grey, its gear mid grey and grouped (BAR 24/09). Pole length and
# the gear's exact layout: CONVENTION (typical North American trolleybus).
import live_kit as LK

B_SILVER, B_RED, B_ROOF, B_WIN = srgb('#c9ccce'), srgb('#b3202a'), srgb('#cdd0d0'), srgb('#0e1115')
POLE = srgb('#262728')


def _xcel_section(vb, L, x0, front, back, doors, axles, twin_axles=()):
    """one rigid Xcelsior body section of length L centred at x0: the lofted
    shell, the doors (kerb side, -y), the wheels"""
    W = 2.59; hw = W / 2; sub = VB()
    fr = ((0.0, 0.9), (0.22, 0.97), (0.5, 1.0)) if front else ((0.0, 1.0), (0.2, 1.0))
    bk = ((0.0, 0.93), (0.3, 1.0)) if back else ((0.0, 1.0), (0.2, 1.0))
    body(sub, L, W, 3.08, 0.32, [(0.9, B_RED, PAINT), (1.12, B_SILVER, PAINT), (2.46, B_WIN, GLASS), (2.86, B_SILVER, PAINT)],
         B_ROOF, B_SILVER, front=fr, back=bk, shoulder=0.26)
    for a, b in doors:
        LK.door(sub, a, b, 0.34, 2.5, hw, B_SILVER)
    LK.wheels(sub, [x for x in axles], hw, r=0.5)
    for x in twin_axles: LK.disc(sub, x, -(hw + 0.08), 0.5, 0.2, srgb('#3a3c3e'), DARK, 8, s=-1); LK.disc(sub, x, hw + 0.08, 0.5, 0.2, srgb('#3a3c3e'), DARK, 8, s=1)
    if front:
        e = L / 2
        LK.end(sub, e, -1.12, 1.12, 0.98, 2.68, B_WIN, GLASS)                 # the big windscreen
        LK.end(sub, e, -1.05, 1.05, 2.72, 2.96, LK.SIGN, DARK)                # the destination sign
        LK.end(sub, e + 0.01, -0.8, 0.8, 2.79, 2.88, LK.SIGN_LIT, PAINT)      # its amber text line
        for s in (-1, 1):
            LK.end(sub, e, s * 1.12, s * 0.86, 0.55, 0.72, LK.LAMP, METAL)     # headlamps
            LK.rod(sub, (e - 0.1, s * 1.2, 2.45), (e + 0.25, s * 1.45, 2.4), 0.06, UNDER, DARK)   # mirror arm
            LK.box(sub, e + 0.2, e + 0.3, s * 1.38 - 0.08, s * 1.38 + 0.08, 1.9, 2.4, UNDER, DARK) # mirror
        LK.box(sub, e, e + 0.32, -0.95, 0.95, 0.45, 0.52, UNDER, DARK)        # the bike rack, folded
        LK.box(sub, e + 0.25, e + 0.32, -0.95, 0.95, 0.52, 0.95, UNDER, DARK)
    if back:
        e = -L / 2
        LK.end(sub, e, -1.0, 1.0, 0.42, 1.15, srgb('#2a2c2e'), DARK, front=False)   # engine grille / bumper
        LK.end(sub, e, -0.9, 0.9, 1.35, 2.4, B_WIN, GLASS, front=False)             # rear window / black panel
        for s in (-1, 1): LK.end(sub, e, s * 1.2, s * 1.0, 0.7, 1.4, LK.TAIL, PAINT, front=False)
    merge(vb, sub, x0)


def merge(dst, src, dx=0.0):
    k = len(dst.V)
    dst.V += [(x + dx, y, z) for x, y, z in src.V]; dst.F += [tuple(i + k for i in f) for f in src.F]; dst.C += src.C; dst.MI += src.MI


def _poles(vb, xb, xe, zb):
    """the trolley poles: a base, two poles from xb back to xe (past the tail), their retainer hooks"""
    LK.chbox(vb, xb - 0.45, xb + 0.45, -0.55, 0.55, zb, zb + 0.14, LK.GEAR_D, DARK, ch=0.05)
    for y in (-0.3, 0.3):
        LK.rod(vb, (xb, y, zb + 0.18), (xe, y * 1.05, zb + 0.32), 0.09, POLE, DARK)
        LK.box(vb, xe + 0.9, xe + 1.1, y - 0.09, y + 0.09, 3.08, zb + 0.34, POLE, DARK)     # retainer hook post


def bus_v3(L=12.5, artic=False, trolley=False):
    vb = VB()
    if not artic:
        e = L / 2
        _xcel_section(vb, L, 0.0, True, True, [(e - 1.65, e - 0.45), (e - 7.55, e - 6.35)], [e - 2.6, e - 9.84], twin_axles=[e - 9.84])
        if trolley:
            LK.chbox(vb, e - 7.8, e - 1.2, -1.02, 1.02, 3.02, 3.36, LK.GEAR_L, ROOF, ch=0.16)      # traction fairing
            LK.chbox(vb, -e + 0.7, -e + 3.0, -1.0, 1.0, 3.02, 3.32, LK.GEAR, ROOF, ch=0.12)        # HVAC
            for x in (-e + 1.3, -e + 2.4): LK.box(vb, x - 0.3, x + 0.3, -0.3, 0.3, 3.32, 3.33, LK.GEAR_D, DARK)
            _poles(vb, e - 4.6, -e - 0.7, 3.36)
        else:
            LK.chbox(vb, e - 5.2, e - 1.3, -0.98, 0.98, 3.02, 3.4, LK.GEAR_L, ROOF, ch=0.16)       # energy storage pod
            LK.chbox(vb, -e + 0.6, -e + 3.2, -1.02, 1.02, 3.02, 3.36, LK.GEAR, ROOF, ch=0.12)      # HVAC over the engine
            for x in (-e + 1.25, -e + 2.55): LK.box(vb, x - 0.32, x + 0.32, -0.32, 0.32, 3.36, 3.37, LK.GEAR_D, DARK)
            LK.box(vb, 0.2, 0.9, -0.35, 0.35, 3.02, 3.1, LK.GEAR_D, ROOF)                          # roof hatch
        return vb
    Lf, Lb = 11.2, 6.4; xf = L / 2 - Lf / 2; xr = -L / 2 + Lb / 2; ef = L / 2
    hf, hb = Lf / 2, Lb / 2
    _xcel_section(vb, Lf, xf, True, False, [(hf - 1.65, hf - 0.45), (hf - 7.0, hf - 5.8)], [hf - 2.6, -hf + 1.9])
    _xcel_section(vb, Lb, xr, False, True, [(hb - 2.3, hb - 1.1)], [-hb + 2.7], twin_axles=[-hb + 2.7])
    bx0, bx1 = L / 2 - Lf - 0.7, L / 2 - Lf          # the bellows between the sections
    for k in range(5):
        a = bx0 + k * (bx1 - bx0) / 5; b = a + (bx1 - bx0) / 5
        LK.box(vb, a, b, -1.22, 1.22, 0.45, 2.95, srgb('#1b1c1d') if k % 2 else srgb('#2c2d2f'), DARK)
    if trolley:
        LK.chbox(vb, ef - 8.8, ef - 1.2, -1.02, 1.02, 3.02, 3.36, LK.GEAR_L, ROOF, ch=0.16)
        LK.chbox(vb, -L / 2 + 0.6, -L / 2 + 2.6, -1.0, 1.0, 3.02, 3.3, LK.GEAR, ROOF, ch=0.12)
        _poles(vb, bx0 - 0.9, -L / 2 - 0.7, 3.1)
        LK.box(vb, bx0 - 0.9 - 0.5, bx0 - 0.9 + 0.5, -0.6, 0.6, 3.02, 3.12, LK.GEAR_D, ROOF)
    else:
        LK.chbox(vb, ef - 5.2, ef - 1.3, -0.98, 0.98, 3.02, 3.4, LK.GEAR_L, ROOF, ch=0.16)
        LK.chbox(vb, ef - 10.6, ef - 8.2, -1.0, 1.0, 3.02, 3.33, LK.GEAR, ROOF, ch=0.12)
        LK.chbox(vb, -L / 2 + 0.6, -L / 2 + 3.0, -1.02, 1.02, 3.02, 3.36, LK.GEAR, ROOF, ch=0.12)
    return vb


def _lamps(vb, xf, xr, W, zl=(0.55, 0.72), tail=(0.6, 0.95)):
    hw = W / 2
    for s_ in (-1, 1):
        LK.end(vb, xf, s_ * (hw - 0.08), s_ * (hw - 0.34), zl[0], zl[1], LK.LAMP, METAL, eps=0.02)
        LK.end(vb, xr, s_ * (hw - 0.05), s_ * (hw - 0.22), tail[0], tail[1], LK.TAIL, PAINT, front=False, eps=0.02)


def van_v3(seed=0):
    """a high-roof delivery van (Sprinter / Transit), 5.9 m: the cargo box with no side windows, the
    sloped windscreen over a short hood, the cab door windows, a sliding door seam, roof racks on a few"""
    r = random.Random(seed); vb = VB(); W = 2.02; hw = W / 2
    c = srgb(r.choice(('#e8e8e4', '#e8e8e4', '#e8e8e4', '#2a3a55', '#8a8f94', '#1c2a44')))
    LK.loft(vb, W, 0.34, [(-2.95, 2.58, 0.96), (-2.85, 2.66, 1.0), (0.95, 2.66, 1.0, B_WIN, GLASS), (1.85, 1.42, 0.98), (2.7, 1.2, 0.95), (2.95, 0.95, 0.86)],
            [(0.62, c, PAINT), (2.66, c, PAINT)], c, shoulder=0.14, end_cols=(c, c))
    LK.side(vb, 1.0, 1.72, 1.38, 1.95, hw, B_WIN, GLASS)                         # cab door windows
    LK.side(vb, -0.35, -0.31, 0.45, 2.3, hw, srgb('#3a3c3e'), DARK, sides=(-1,))  # the sliding door's seam
    LK.side(vb, -2.95, 2.95, 0.34, 0.5, hw, srgb('#2a2b2d'), DARK)                # the rubbing strip
    LK.end(vb, 2.95, -0.95, 0.95, 0.36, 0.62, srgb('#2a2b2d'), DARK, eps=0.03)     # bumper / grille
    LK.end(vb, 2.95, -0.55, 0.55, 0.64, 0.86, srgb('#1c1d1e'), DARK, eps=0.02)
    LK.end(vb, -2.95, -0.95, 0.95, 0.36, 0.55, srgb('#2a2b2d'), DARK, front=False, eps=0.03)
    LK.end(vb, -2.95, -0.02, 0.02, 0.6, 2.45, srgb('#3a3c3e'), DARK, front=False, eps=0.02)    # the rear doors' split
    _lamps(vb, 2.95, -2.95, W, zl=(0.72, 0.86), tail=(0.7, 1.5))
    LK.wheels(vb, [1.85, -1.75], hw, r=0.36)
    if r.random() < 0.3:     # a tradesman's roof rack and ladder
        for y in (-0.8, 0.8): LK.rod(vb, (-2.6, y, 2.78), (0.8, y, 2.78), 0.05, srgb('#8e9295'), METAL)
        for x in (-2.4, -1.2, 0.0, 0.7): LK.rod(vb, (x, -0.85, 2.78), (x, 0.85, 2.78), 0.05, srgb('#8e9295'), METAL)
        LK.box(vb, -2.7, 0.9, -0.28, 0.2, 2.82, 2.86, srgb('#a9a48e'), PAINT)
    return vb


UHAUL_O = srgb('#e8702a')


def box_truck_v3(kind='white', seed=0):
    """a cab-forward box truck (Isuzu N-series type, 8.3 m) or the brown parcel car (7.2 m)"""
    r = random.Random(seed); vb = VB()
    if kind == 'parcel':
        c = srgb('#4b3526'); W = 2.3; hw = W / 2
        LK.loft(vb, W, 0.4, [(-3.6, 3.0, 0.97), (-3.5, 3.08, 1.0), (2.1, 3.08, 1.0), (2.6, 2.95, 0.98, B_WIN, GLASS), (3.2, 1.55, 0.95), (3.6, 1.3, 0.88)],
                [(3.08, c, PAINT)], c, shoulder=0.2, end_cols=(c, c))
        for s_ in (-1, 1): LK.side(vb, 1.9, 2.75, 0.5, 2.3, hw * 0.99, srgb('#15120f'), DARK, sides=(s_,))   # the open doorways
        LK.side(vb, -3.6, 1.8, 0.4, 0.55, hw, srgb('#2a2b2d'), DARK)
        LK.side(vb, -1.2, -0.5, 2.1, 2.6, hw, srgb('#b88d3c'), PAINT)                                            # the shield
        LK.end(vb, 3.6, -1.0, 1.0, 0.4, 0.66, srgb('#2a2b2d'), DARK, eps=0.03)
        _lamps(vb, 3.6, -3.6, W, zl=(0.8, 0.95), tail=(0.7, 1.3))
        LK.wheels(vb, [2.5, -1.6], hw, r=0.42)
        return vb
    cab = r.choice((srgb('#e8e8e4'), srgb('#e8e8e4'), srgb('#b8202a'), srgb('#1d3a6b'), srgb('#2a2c2e')))
    uhaul = r.random() < 0.3
    box = srgb('#eeeeea') if (uhaul or r.random() < 0.8) else srgb(r.choice(('#d8c86a', '#c8d0d6', '#e0a040')))
    if uhaul: cab = srgb('#eeeeea')
    W = 2.42; hw = W / 2; wc = 2.02 / W
    LK.loft(vb, W, 0.55, [(2.3, 2.45, wc), (3.75, 2.45, wc, B_WIN, GLASS), (3.98, 1.55, wc * 0.99), (4.15, 1.3, wc * 0.94)],
            [(1.25, cab, PAINT), (1.55, cab, PAINT), (2.1, B_WIN, GLASS), (2.45, cab, PAINT)], cab, shoulder=0.12, end_cols=(cab, cab))
    LK.chbox(vb, -4.15, 2.2, -1.21, 1.21, 0.95, 3.5, box, PAINT, ch=0.05)
    LK.box(vb, -4.1, 2.1, -1.1, 1.1, 0.55, 0.95, UNDER, DARK)
    if uhaul:
        LK.side(vb, -4.15, 2.2, 0.95, 1.55, 1.21, UHAUL_O, PAINT)
        LK.side(vb, -3.2, 0.8, 1.9, 3.2, 1.21, srgb(r.choice(('#3f6e9a', '#6a8f3a', '#c98f3a', '#8a4a6a'))), PAINT)   # the state graphic
        LK.chbox(vb, 2.2, 3.3, -1.12, 1.12, 2.45, 3.45, box, PAINT, ch=0.25)                                     # the attic over the cab
    for z in (1.4, 1.9, 2.4, 2.9): LK.end(vb, -4.15, -1.15, 1.15, z, z + 0.03, srgb('#b9b9b4'), PAINT, front=False, eps=0.02)   # roll-up door ribs
    LK.end(vb, 4.15, -1.0, 1.0, 0.55, 0.85, srgb('#2a2b2d'), DARK, eps=0.03)
    _lamps(vb, 4.15, -4.15, 2.02, zl=(0.9, 1.05), tail=(1.0, 1.3))
    LK.wheels(vb, [3.35, -1.9], hw * wc, r=0.45, z_body=0.55)
    LK.wheels(vb, [-1.9], hw, r=0.45, z_body=0.95)
    return vb


def semi_v3(seed=0):
    """a conventional tractor (sleeper, long hood, stacks) and a 53 ft trailer with side skirts; 21 m"""
    r = random.Random(seed); vb = VB()
    cab = srgb(r.choice(('#e8e8e4', '#b8202a', '#1d3a6b', '#2a2c2e', '#6a7076', '#1f4a2f')))
    trl = srgb(r.choice(('#e6e6e2', '#e6e6e2', '#c8ccd0', '#9aa0a6', '#d8d4c8')))
    Wt = 2.5
    LK.box(vb, 4.2, 10.3, -0.5, 0.5, 0.6, 1.1, UNDER, DARK)                                                        # frame
    LK.loft(vb, Wt, 0.9, [(5.3, 3.85, 1.0), (7.8, 3.85, 1.0), (8.1, 3.2, 1.0, B_WIN, GLASS), (8.75, 2.3, 0.98), (10.25, 1.8, 0.86), (10.5, 1.55, 0.8)],
            [(1.3, cab, PAINT), (3.85, cab, PAINT)], cab, shoulder=0.25, end_cols=(cab, cab))
    LK.side(vb, 7.95, 8.6, 2.2, 2.95, Wt / 2, B_WIN, GLASS)
    for y in (-1.2, 1.2): LK.rod(vb, (7.7, y, 1.4), (7.7, y, 4.15), 0.13, srgb('#b8bcc0'), METAL)                  # exhaust stacks
    LK.end(vb, 10.5, -0.8, 0.8, 0.95, 1.5, srgb('#8e9296'), METAL, eps=0.03)                                        # grille
    LK.end(vb, 10.5, -1.15, 1.15, 0.55, 0.85, srgb('#b8bcc0'), METAL, eps=0.05)                                     # bumper
    LK.wheels(vb, [9.6], Wt / 2 * 0.86, r=0.52, z_body=0.9)
    LK.wheels(vb, [5.0, 6.35], Wt / 2 * 0.95, r=0.52, z_body=0.9)
    # the trailer
    LK.chbox(vb, -10.5, 5.7, -1.3, 1.3, 1.25, 4.1, trl, PAINT, ch=0.04)
    for x in range(-10, 6, 1): LK.box(vb, x - 0.03, x + 0.03, -1.27, 1.27, 4.1, 4.105, LK.mix(trl, (0.3, 0.3, 0.3), 0.15), PAINT)   # roof bows
    LK.side(vb, -6.8, 2.2, 0.5, 1.25, 1.25, srgb('#3a3d40'), DARK)                                                  # side skirts
    LK.end(vb, -10.5, -0.02, 0.02, 1.3, 4.0, srgb('#6a6d70'), DARK, front=False, eps=0.02)
    LK.box(vb, -10.4, -7.0, -1.0, 1.0, 0.95, 1.25, UNDER, DARK)
    LK.wheels(vb, [-8.2, -9.45], 1.25, r=0.5, z_body=1.25)
    return vb


def bus_kind(way_id, x, y, vk):
    """the model of a Muni bus on OSM way `way_id`: a trolleybus with the share
    of the way's route relations that are trolleybus routes (OSM bus_osm.json,
    ODbL); the draw is a hash of the place, so placement is untouched"""
    if not LK.on(): return vk
    r = _trolley_share().get(int(way_id), 0.0)
    u = ((int(round(x * 10)) * 73856093) ^ (int(round(y * 10)) * 19349663) ^ 0x5bd1e995) & 0xffff
    return ('trol60' if vk == 'bus60' else 'trol40') if u / 65536.0 < r else vk


_TS = None
def _trolley_share():
    global _TS
    if _TS is not None: return _TS
    _TS = {}
    import json, os
    for p in (os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bus_osm.json'), '/Users/daniel/code/qipu-render-work/life/bus_osm.json'):
        if not os.path.exists(p): continue
        n, t = {}, {}
        for e in json.load(open(p))['elements']:
            if e.get('type') != 'relation': continue
            tb = e.get('tags', {}).get('route') == 'trolleybus'
            for m in e.get('members', []):
                if m.get('type') != 'way': continue
                n[m['ref']] = n.get(m['ref'], 0) + 1; t[m['ref']] = t.get(m['ref'], 0) + (1 if tb else 0)
        _TS = {k: t[k] / n[k] for k in n}
        break
    return _TS


PROTOS = {'bus40': lambda: bus(12.5), 'bus60': lambda: bus(18.3, True), 'parcel': lambda: box_truck('parcel'),
          **{f'box{i}': (lambda i=i: box_truck('white', i)) for i in range(5)},
          **{f'van{i}': (lambda i=i: van(i)) for i in range(5)},
          **{f'semi{i}': (lambda i=i: semi(i)) for i in range(4)}}
if LK.on():
    PROTOS.update({'bus40': lambda: bus_v3(12.5), 'bus60': lambda: bus_v3(18.3, True),
                   'trol40': lambda: bus_v3(12.5, trolley=True), 'trol60': lambda: bus_v3(18.3, True, trolley=True),
                   'parcel': lambda: box_truck_v3('parcel'), **{f'box{i}': (lambda i=i: box_truck_v3('white', i)) for i in range(5)},
                   **{f'van{i}': (lambda i=i: van_v3(i)) for i in range(5)}, **{f'semi{i}': (lambda i=i: semi_v3(i)) for i in range(4)}})
LENGTH = {'bus40': 12.5, 'bus60': 18.3, 'trol40': 12.5, 'trol60': 18.3, 'parcel': 7.2, **{f'box{i}': 8.3 for i in range(5)}, **{f'van{i}': 5.9 for i in range(5)},
          **{f'semi{i}': 21.0 for i in range(4)}}
