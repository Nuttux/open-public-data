"""LIVE KIT (27/09, live assets agent): shared low-poly pieces for the city's
vehicles, so a bus, a tram, a cable car or a van reads as the real thing at
z9 native (9.4 cm/px: a bus ~130 px long, a car ~45 px, a person ~5 px) from
the pyramid's 29 degree oblique camera. At that camera the SIDE is the biggest
thing a vehicle shows (cos 29 = 0.87 of its height), then the roof (sin 29 =
0.49 of its width): so livery bands, the dark glass, doors, wheels in their
arches, bumpers and lamps on the side and ends; grouped mid-grey roof gear with
chamfered edges (no white confetti, BAR 24/09) on top.

Every builder writes into a VB (transit_cars.VB / life_boats.VB: faces with an
rgba colour and a material slot). Slots are the callers' own five: 0 PAINT,
1 GLASS, 2 ROOF (life: matte), 3 DARK (life: matte), 4 METAL.

LIVE_V3=0 switches every v3 body off (the bodies before, for A/B).
"""
import math, os

PAINT, GLASS, ROOF, DARK, METAL = range(5)


def on():
    return os.environ.get('LIVE_V3', '1') == '1'


def srgb(h, a=1.0):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (a,)


def mix(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3)) + (1.0,)


TYRE = srgb('#1b1b1c'); HUB = srgb('#8c9094'); ARCH = srgb('#0c0c0d'); UNDER = srgb('#1a1a1a')
LAMP = srgb('#f2efe2'); TAIL = srgb('#9a1a18'); AMBER = srgb('#d8901e'); SIGN = srgb('#161616'); SIGN_LIT = srgb('#e0a030')
GEAR = srgb('#8e9194'); GEAR_D = srgb('#6c6f72'); GEAR_L = srgb('#a9acae')      # roof gear: mid greys (no white confetti)


def quad(vb, a, b, c, d, col, mi):
    vb.face([a, b, c, d], col, mi)


def chbox(vb, x0, x1, y0, y1, z0, z1, col, mi, ch=0.12, top=None):
    """a box whose top edges are chamfered by `ch` (a roof pod, a fairing, a
    cab roof): the sloped faces catch the sky and the sun differently from the
    flat top, which is what makes a small box read as a moulded housing"""
    ch = min(ch, (x1 - x0) / 3, (y1 - y0) / 3, (z1 - z0) * 0.8)
    tc = top or col; zc = z1 - ch
    X0, X1, Y0, Y1 = x0 + ch, x1 - ch, y0 + ch, y1 - ch
    vb.face([(X0, Y0, z1), (X1, Y0, z1), (X1, Y1, z1), (X0, Y1, z1)], tc, mi)
    vb.face([(x0, y0, zc), (x1, y0, zc), (X1, Y0, z1), (X0, Y0, z1)], col, mi)
    vb.face([(x1, y1, zc), (x0, y1, zc), (X0, Y1, z1), (X1, Y1, z1)], col, mi)
    vb.face([(x1, y0, zc), (x1, y1, zc), (X1, Y1, z1), (X1, Y0, z1)], col, mi)
    vb.face([(x0, y1, zc), (x0, y0, zc), (X0, Y0, z1), (X0, Y1, z1)], col, mi)
    if zc > z0 + 1e-3:
        vb.face([(x0, y0, z0), (x1, y0, z0), (x1, y0, zc), (x0, y0, zc)], col, mi)
        vb.face([(x1, y1, z0), (x0, y1, z0), (x0, y1, zc), (x1, y1, zc)], col, mi)
        vb.face([(x1, y0, z0), (x1, y1, z0), (x1, y1, zc), (x1, y0, zc)], col, mi)
        vb.face([(x0, y1, z0), (x0, y0, z0), (x0, y0, zc), (x0, y1, zc)], col, mi)


def box(vb, x0, x1, y0, y1, z0, z1, col, mi, top=None):
    chbox(vb, x0, x1, y0, y1, z0, z1, col, mi, ch=0.0001, top=top)


def rod(vb, a, b, w, col, mi=METAL):
    """a thin square bar from a to b, w wide (a pole, a rail, a stay)"""
    ax, ay, az = a; bx, by, bz = b
    dx, dy, dz = bx - ax, by - ay, bz - az; L = math.sqrt(dx * dx + dy * dy + dz * dz) or 1e-6
    ux, uy, uz = dx / L, dy / L, dz / L
    px, py, pz = (-uy, ux, 0.0) if abs(uz) < 0.9 else (1.0, 0.0, 0.0)
    n = math.sqrt(px * px + py * py + pz * pz); px, py, pz = px / n * w / 2, py / n * w / 2, pz / n * w / 2
    qx, qy, qz = uy * pz - uz * py, uz * px - ux * pz, ux * py - uy * px
    ring = lambda o: [(o[0] + sx * px + sy * qx, o[1] + sx * py + sy * qy, o[2] + sx * pz + sy * qz) for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
    A, B = ring(a), ring(b)
    for i in range(4):
        j = (i + 1) % 4
        vb.face([A[i], A[j], B[j], B[i]], col, mi)


def side(vb, x0, x1, z0, z1, hw, col, mi, sides=(-1, 1), eps=0.015):
    """a flat panel laid on the body's side plane (a door, a stripe, a grille)"""
    for s in sides:
        y = s * (hw + eps)
        p = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]
        vb.face(p if s < 0 else p[::-1], col, mi)


def end(vb, x, y0, y1, z0, z1, col, mi, front=True, eps=0.015):
    """a flat panel on an end face at x (a windscreen, a sign, a grille, lamps)"""
    xx = x + (eps if front else -eps)
    p = [(xx, y0, z0), (xx, y1, z0), (xx, y1, z1), (xx, y0, z1)]
    vb.face(p if front else p[::-1], col, mi)


def disc(vb, x, y, z, r, col, mi, n=10, axis='y', s=1):
    """a flat n-gon facing +-y (axis 'y') or +-x (axis 'x')"""
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        if axis == 'y': pts.append((x + r * math.cos(a), y, z + r * math.sin(a)))
        else: pts.append((x, y + r * math.cos(a), z + r * math.sin(a)))
    vb.face(pts if s < 0 else pts[::-1], col, mi)


def wheels(vb, xs, hw, r=0.5, arch=None, z_body=0.35, tyre=TYRE, hub=HUB, eps=0.02, twin=False):
    """the wheels in their arches, both sides: a dark arch cut into the skirt
    (from the body's bottom z_body up to ~1.15 r above the axle), the tyre as
    a disc in it, the hub (and a second, inset tyre for twin rear wheels)"""
    arch = arch or r * 1.18
    for x in xs:
        for s in (-1, 1):
            y = s * (hw + eps)
            # the arch: a half n-gon from z_body up, laid on the side (dark: the wheel well's shadow)
            pts = [(x + arch, y, 0.02)]
            for k in range(9):
                a = math.pi * k / 8
                pts.append((x + arch * math.cos(a), y, max(0.02, r + arch * math.sin(a))))
            pts.append((x - arch, y, 0.02))
            vb.face(pts if s < 0 else pts[::-1], ARCH, DARK)
            disc(vb, x, s * (hw + eps * 2), r, r, tyre, DARK, 12, s=s)
            disc(vb, x, s * (hw + eps * 3), r, r * 0.52, hub, METAL, 10, s=s)
            if twin: disc(vb, x, s * (hw + eps * 4), r, r * 0.22, srgb('#3a3c3e'), DARK, 8, s=s)


def ladder_windows(vb, x0, x1, z0, z1, hw, pitch, pw, col, mi=PAINT, skip=(), sides=(-1, 1)):
    """window pillars (col, pw wide) every `pitch` across a glass band, and a
    frame line at its top and bottom; `skip` x ranges (doors) left alone"""
    n = max(1, round((x1 - x0) / pitch)); p = (x1 - x0) / n
    for k in range(n + 1):
        x = x0 + k * p
        if any(a - 0.05 <= x <= b + 0.05 for a, b in skip): continue
        side(vb, x - pw / 2, x + pw / 2, z0, z1, hw, col, mi, sides, eps=0.018)


def door(vb, x0, x1, z0, z1, hw, frame, glass_col=None, sides=(-1,), split=True):
    """a door on the kerb side (y < 0 = the right side, right-hand traffic,
    +x forward): its frame and two dark glazed leaves"""
    g = glass_col or srgb('#101318')
    side(vb, x0, x1, z0, z1, hw, frame, PAINT, sides, eps=0.02)
    fw = 0.07
    if split:
        xm = (x0 + x1) / 2
        side(vb, x0 + fw, xm - fw / 2, z0 + 0.12, z1 - fw, hw, g, GLASS, sides, eps=0.03)
        side(vb, xm + fw / 2, x1 - fw, z0 + 0.12, z1 - fw, hw, g, GLASS, sides, eps=0.03)
    else:
        side(vb, x0 + fw, x1 - fw, z0 + 0.12, z1 - fw, hw, g, GLASS, sides, eps=0.03)


def merge(dst, src, dx=0.0, dy=0.0, dz=0.0):
    k = len(dst.V)
    dst.V += [(x + dx, y + dy, z + dz) for x, y, z in src.V]
    dst.F += [tuple(i + k for i in f) for f in src.F]; dst.C += src.C; dst.MI += src.MI
