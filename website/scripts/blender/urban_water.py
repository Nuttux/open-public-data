"""MARINAS, PIERS AND THE PIER 39 SEA LIONS AT z9 (27/09, assets_urban; MARINA_V2=1 default, 0 = before).

Called from water_hq.piers (today's OSM decks, floats and dock lines, landmarks/piers.json). Before: a float was a
plain slab, a dock line a plank strip, a fixed deck an edge with a bollard every 22 m. Now:
  - dock lines (walkways, fingers): the float's deck on a darker freeboard with a rub rail along both sides;
    guide piles (concrete, a cap) every ~14 m along a walkway and at both ends of a finger; dock boxes along the
    walkways; a GANGWAY (aluminium ramp, rails) from a walkway's end to the quay where the land is within 25 m;
  - float polygons: freeboard, rub rail, piles at two corners, weathered stains on the deck;
  - fixed decks: timber fender piles along the edges over the water (every 3.5 m), the dark row seen under a pier;
  - the SEA LIONS on K-Dock (Pier 39; piers.json floats 971, 1015-1056, as pier39_prep.py): bodies lofted with a
    head, a neck and flippers, lying in clumps (some heads up), tan when dry, dark brown when wet, 0-12 a float.
CONVENTION on the fittings' spacing, sizes and colours (common US marina practice); SOURCED on where the docks,
floats and decks are (OSM) and that K-Dock is the sea lions' (Pier 39, since 1990).
"""
import math

PILE = (0.46, 0.45, 0.42); PILE_CAP = (0.62, 0.62, 0.60); RUB = (0.16, 0.15, 0.14); FREEB = (0.30, 0.29, 0.27)
BOX = (0.55, 0.57, 0.58); ALU = (0.60, 0.61, 0.62); FENDER = (0.20, 0.17, 0.14); STAIN = (0.70, 0.69, 0.64)
LION_DRY = ((0.46, 0.34, 0.22), (0.54, 0.40, 0.26), (0.40, 0.29, 0.19)); LION_WET = ((0.18, 0.13, 0.10), (0.24, 0.18, 0.13))
LION_FLOATS = {971} | set(range(1015, 1057))


def _h(x, y, k):
    v = math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453
    return v - math.floor(v)


def dock_line(K, pts, z, w, fl, L_, tg, deck_col):
    """a floating walkway or finger (fl) or a fixed dock, in place of water_hq's plank strip"""
    for a, b in zip(pts, pts[1:]):
        if math.hypot(b[0] - a[0], b[1] - a[1]) < 0.2: continue
        if fl:
            K.beam('lm_matte', (a[0], a[1], z - 0.30), (b[0], b[1], z - 0.30), w - 0.1, 0.5, FREEB)          # the float body, darker
            K.beam('lm_matte', (a[0], a[1], z - 0.02), (b[0], b[1], z - 0.02), w - 0.12, 0.06, deck_col)     # its deck
            K.beam('lm_matte', (a[0], a[1], z - 0.12), (b[0], b[1], z - 0.12), w + 0.12, 0.16, RUB)          # the rub rail (whalers)
        else:
            K.beam('lm_matte', (a[0], a[1], z - 0.2), (b[0], b[1], z - 0.2), w, 0.4, deck_col)
    if not fl: return
    walk = L_ >= 45.0
    # guide piles: along a walkway every ~14 m, alternating sides; at both ends of a finger
    segs = [(a, b) for a, b in zip(pts, pts[1:]) if math.hypot(b[0] - a[0], b[1] - a[1]) >= 0.2]
    marks = []
    if walk:
        acc = 0.0; side = 1
        for a, b in segs:
            Ls = math.hypot(b[0] - a[0], b[1] - a[1]); ux, uy = (b[0] - a[0]) / Ls, (b[1] - a[1]) / Ls
            t = 7.0 - acc
            while t < Ls:
                marks.append((a[0] + ux * t, a[1] + uy * t, -uy * side, ux * side)); side = -side; t += 14.0
            acc = (acc + Ls) % 14.0
    else:
        for (p, q) in ((pts[0], pts[1]), (pts[-1], pts[-2])):
            Ls = math.hypot(q[0] - p[0], q[1] - p[1]) or 1.0; ux, uy = (q[0] - p[0]) / Ls, (q[1] - p[1]) / Ls
            marks.append((p[0] + ux * 0.4, p[1] + uy * 0.4, -uy, ux))
    for (x, y, nx, ny) in marks:
        px, py = x + nx * (w / 2 + 0.3), y + ny * (w / 2 + 0.3)
        top = 3.2 + 0.8 * _h(px, py, 3)
        K.cyl('lm_matte', (px, py, -1.0), (px, py, top), 0.22, PILE, n=8, smooth=False)
        K.cyl('lm_matte', (px, py, top), (px, py, top + 0.14), 0.24, PILE_CAP, n=8, caps=True, smooth=False)
    # dock boxes on a walkway, every ~20 m, at the edge (mid grey: no confetti)
    if walk:
        for i, (x, y, nx, ny) in enumerate(marks):
            if i % 2: continue
            bx, by = x - nx * (w / 2 - 0.45), y - ny * (w / 2 - 0.45)
            K.beam('lm_paint', (bx - ny * 0.6, by + nx * 0.6, z + 0.3), (bx + ny * 0.6, by - nx * 0.6, z + 0.3), 0.6, 0.6, BOX)


def gangway(K, pts, tg):
    """a walkway's end within 25 m of the quay: an aluminium ramp up to it, with its two rails"""
    if len(pts) < 2: return 0
    best = None
    for e, p in ((pts[0], pts[1]), (pts[-1], pts[-2])):
        L = math.hypot(e[0] - p[0], e[1] - p[1]) or 1.0; dx, dy = (e[0] - p[0]) / L, (e[1] - p[1]) / L
        for t in range(2, 26):
            g = tg(e[0] + dx * t, e[1] + dy * t)
            if g > 1.2:
                if best is None or t < best[0]: best = (t, e, dx, dy, g)
                break
    if not best: return 0
    t, e, dx, dy, g = best
    a = (e[0] - dx * 1.0, e[1] - dy * 1.0, 0.62); b = (e[0] + dx * (t + 0.8), e[1] + dy * (t + 0.8), g + 0.15)
    K.beam('lm_paint', a, b, 1.3, 0.12, ALU)
    for s in (-1, 1):
        o = (-dy * 0.62 * s, dx * 0.62 * s)
        K.beam('lm_paint', (a[0] + o[0], a[1] + o[1], a[2] + 0.95), (b[0] + o[0], b[1] + o[1], b[2] + 0.95), 0.06, 0.12, ALU)
        K.beam('lm_paint', (a[0] + o[0], a[1] + o[1], a[2] + 0.5), (b[0] + o[0], b[1] + o[1], b[2] + 0.5), 0.1, 0.9, (0.50, 0.51, 0.52))
    return 1


def float_poly(K, r, idx):
    """a float (polygon): freeboard, rub rail, a deck with stains, piles at two corners; sea lions on K-Dock's"""
    K.prism('lm_matte', r, -0.3, 0.42, FREEB, top=False)
    K.prism('lm_matte', r, 0.30, 0.44, RUB, top=False)
    K.prism('lm_matte', r, 0.44, 0.55, FREEB, top=True, top_col=(0.60, 0.57, 0.52))
    n = len(r); cx = sum(p[0] for p in r) / n; cy = sum(p[1] for p in r) / n
    for k in (0, n // 2):                                               # piles at two opposite corners, just outside
        px, py = r[k]; dx, dy = px - cx, py - cy; d = math.hypot(dx, dy) or 1.0
        px, py = px + dx / d * 0.35, py + dy / d * 0.35
        K.cyl('lm_matte', (px, py, -1.0), (px, py, 3.0 + _h(px, py, 5)), 0.22, (0.30, 0.27, 0.24), n=8, smooth=False)
    if idx in LION_FLOATS:
        for k in range(int(2 + 4 * _h(cx, cy, 9))):                   # the white guano stains
            sx, sy = cx + (_h(cx, cy, 20 + k) - 0.5) * 2.5, cy + (_h(cx, cy, 40 + k) - 0.5) * 2.5; s = 0.3 + 0.5 * _h(cx, cy, 60 + k)
            K.face('lm_matte', [(sx - s, sy - s * 0.7, 0.556), (sx + s, sy - s * 0.5, 0.556), (sx + s * 0.7, sy + s, 0.556), (sx - s * 0.8, sy + s * 0.6, 0.556)], STAIN)
        sea_lions(K, r, cx, cy)


def _in(x, y, r):
    k = False
    for i in range(len(r)):
        (x1, y1), (x2, y2) = r[i], r[(i + 1) % len(r)]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): k = not k
    return k


def sea_lions(K, r, cx, cy):
    """California sea lions hauled out on one float: 0-12, in one or two clumps, bodies nearly parallel in a clump"""
    xs = [p[0] for p in r]; ys = [p[1] for p in r]
    area = abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))) / 2
    busy = _h(cx, cy, 77)
    if busy < 0.1: return
    want = int(min(12, area * (0.12 + 0.28 * busy))); placed = []
    clumps = [(cx + (_h(cx, cy, 81 + c) - 0.5) * (max(xs) - min(xs)) * 0.5, cy + (_h(cx, cy, 91 + c) - 0.5) * (max(ys) - min(ys)) * 0.5,
               _h(cx, cy, 101 + c) * math.pi) for c in range(1 + (busy > 0.6))]
    tries = 0
    while len(placed) < want and tries < want * 12:
        tries += 1; k = tries * 7.13
        ccx, ccy, ca = clumps[tries % len(clumps)]
        x = ccx + (_h(cx, k, 1) - 0.5) * 3.2; y = ccy + (_h(cy, k, 2) - 0.5) * 3.2
        a = ca + (_h(x, y, 3) - 0.5) * 0.9 + (math.pi if _h(x, y, 4) < 0.5 else 0.0)
        l = 1.5 + 0.8 * _h(x, y, 5)
        hx, hy = math.cos(a) * l * 0.5, math.sin(a) * l * 0.5
        if not (_in(x + hx, y + hy, r) and _in(x - hx, y - hy, r) and _in(x, y, r)): continue
        if any(math.hypot(x - q[0], y - q[1]) < 0.75 for q in placed): continue
        placed.append((x, y)); lion(K, x, y, a, l, _h(x, y, 6), 0.555)


def lion(K, x, y, a, l, u, z0):
    """one sea lion: a lofted body (tail -> nose), fore and hind flippers; u picks the pose and the coat"""
    ca, sa = math.cos(a), math.sin(a); s = l / 1.9
    def P(t, dy, dz): return (x + ca * (t - 0.5) * l - sa * dy, y + sa * (t - 0.5) * l + ca * dy, z0 + dz)
    col = LION_WET[int(u * 7) % 2] if u < 0.35 else LION_DRY[int(u * 11) % 3]
    up = 0.0 if u < 0.7 else 0.35 * s                                          # 3 in 10 hold the head up
    ST = ((0.04, 0.05, 0.04), (0.18, 0.13, 0.10), (0.38, 0.19, 0.14), (0.58, 0.21, 0.15), (0.74, 0.17, 0.13), (0.84, 0.10, 0.09), (0.92, 0.08, 0.08), (1.0, 0.03, 0.04))
    rings = []
    for t, hw, hh in ST:
        lift = up * max(0.0, (t - 0.7) / 0.3) ** 1.2
        rings.append([P(t, math.cos(2 * math.pi * i / 8) * hw * s, hh * s + lift + math.sin(2 * math.pi * i / 8) * hh * s) for i in range(8)])
    K.loft('lm_matte', rings, col, cap_top=True, cap_bottom=True, smooth=True)
    for sd in (-1, 1):                                                          # fore flippers, swept back
        K.face('lm_matte', [P(0.72, sd * 0.16 * s, 0.03), P(0.66, sd * 0.42 * s, 0.02), P(0.56, sd * 0.40 * s, 0.02), P(0.62, sd * 0.14 * s, 0.03)], col)
        K.face('lm_matte', [P(0.06, sd * 0.03 * s, 0.03), P(-0.06, sd * 0.20 * s, 0.02), P(-0.02, sd * 0.05 * s, 0.02)], col)   # hind
