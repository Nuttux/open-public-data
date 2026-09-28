"""Buildings modelled from their records.

Each published footprint becomes a building in real geometry: walls with
recessed, framed, double-hung windows; a canted bay on the street wall of a
house; cornices on brackets, belt courses, corner boards; a front gable with
fish-scale shingles or a flat roof behind a parapet; a stoop up to a raised
first floor; a storefront where the record says there is a shop.

What decides the building is the record — footprint, height, storeys, year,
use, facade type, which wall faces the street (front), a neighbour (party) or
the yard (back). What is NOT in the record is generic and conventional (the
paint colours, the exact window rhythm) and is drawn from conventions per era,
never presented as data. Every draw is seeded by the building's gid, so a
building looks the same in every render.

Output: per-material lists of (verts, faces, face colour) — built into a few
big meshes by `emit()` so a district of thousands of buildings stays fast.
"""
import math, random
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

# ── materials the generator writes into ─────────────────────────────────────
# siding: lap boards (bump by world z) · trim: smooth painted wood · shingle:
# fish-scale gable · stucco · brick · concrete · glass · door · roof_shingle ·
# roof_flat (tar and gravel) · metal (flashing, rails) · stair (painted wood
# or concrete) · storefront glass · awning
MATS = ('siding', 'trim', 'shingle', 'stucco', 'brick', 'concrete', 'glass', 'door',
        'roof_shingle', 'roof_flat', 'metal', 'stair', 'shopglass', 'awning', 'curtain', 'chimney', 'roof_tile', 'deck',
        'equip', 'solar', 'curtain_wall', 'roof_big', 'ash', 'soot')

# paint conventions. Victorian palettes after the Painted Ladies' own era
# (body, trim, accent); later eras: stucco pastels and whites.
# paint conventions (body, trim, accent). SF from the air is the white city:
# most fronts white, cream, beige and pale grey, pastels a minority, the
# bright colorist Victorians a few in a row, lilac and purple rare (24/09:
# the old lists read cool blue-grey and violet from the air). Repeats weight.
VIC = [((0.95, 0.93, 0.87), (0.36, 0.44, 0.40), (0.72, 0.52, 0.22)),     # white, green trim
       ((0.56, 0.70, 0.72), (0.97, 0.96, 0.93), (0.62, 0.14, 0.12)),     # teal-blue
       ((0.94, 0.91, 0.82), (0.98, 0.97, 0.94), (0.30, 0.36, 0.30)),     # cream
       ((0.72, 0.80, 0.64), (0.98, 0.97, 0.93), (0.24, 0.30, 0.40)),     # celadon
       ((0.94, 0.89, 0.72), (0.98, 0.97, 0.93), (0.45, 0.16, 0.14)),     # butter
       ((0.94, 0.80, 0.56), (0.97, 0.96, 0.92), (0.20, 0.24, 0.30)),     # apricot
       ((0.72, 0.73, 0.72), (0.97, 0.96, 0.95), (0.62, 0.14, 0.12)),     # light grey
       ((0.64, 0.68, 0.56), (0.93, 0.90, 0.80), (0.45, 0.12, 0.14)),     # sage
       ((0.62, 0.71, 0.80), (0.97, 0.96, 0.93), (0.12, 0.20, 0.38)),     # blue
       ((0.90, 0.74, 0.71), (0.97, 0.95, 0.90), (0.14, 0.40, 0.42)),     # pink
       ((0.92, 0.82, 0.52), (0.97, 0.96, 0.90), (0.20, 0.36, 0.24)),     # yellow
       ((0.91, 0.77, 0.62), (0.96, 0.92, 0.82), (0.42, 0.26, 0.16)),     # peach
       ((0.82, 0.85, 0.72), (0.98, 0.97, 0.93), (0.30, 0.30, 0.34)),     # pale green
       ((0.63, 0.66, 0.67), (0.97, 0.96, 0.95), (0.62, 0.14, 0.12)),     # SF grey-blue
       ((0.76, 0.73, 0.80), (0.97, 0.96, 0.95), (0.36, 0.18, 0.40)),     # soft lilac, rare
       ((0.36, 0.40, 0.44), (0.92, 0.89, 0.80), (0.74, 0.40, 0.20)),     # slate
       ((0.28, 0.29, 0.29), (0.95, 0.94, 0.91), (0.72, 0.52, 0.22))]     # charcoal, the recent repaint
STUCCO = [(0.96, 0.95, 0.92), (0.97, 0.96, 0.94), (0.95, 0.91, 0.82), (0.93, 0.93, 0.91), (0.96, 0.94, 0.89),
          (0.90, 0.85, 0.75), (0.87, 0.80, 0.67), (0.95, 0.88, 0.66), (0.95, 0.83, 0.72), (0.95, 0.84, 0.82),
          (0.83, 0.89, 0.80), (0.82, 0.87, 0.91), (0.84, 0.84, 0.82), (0.79, 0.77, 0.71), (0.87, 0.89, 0.76),
          (0.78, 0.84, 0.86), (0.93, 0.80, 0.70), (0.90, 0.86, 0.62), (0.80, 0.86, 0.84), (0.92, 0.82, 0.80)]
NEUTRAL = [(0.95, 0.94, 0.91), (0.93, 0.93, 0.91), (0.96, 0.95, 0.93), (0.90, 0.89, 0.86), (0.86, 0.86, 0.84), (0.92, 0.89, 0.82),
           (0.88, 0.84, 0.76), (0.82, 0.82, 0.80), (0.94, 0.92, 0.87), (0.78, 0.78, 0.77), (0.90, 0.87, 0.80), (0.84, 0.83, 0.79)]
STONE = [(0.84, 0.81, 0.75), (0.78, 0.76, 0.72), (0.70, 0.68, 0.64), (0.88, 0.86, 0.82), (0.52, 0.50, 0.48), (0.80, 0.74, 0.64)]
# curtain-wall glass (display colour, and in alpha how mirror-like the coating is)
# (SF's downtown is mostly stone, bronze, grey and dark glass; blue is the
# exception — two of eleven, and the teal one greyed)
GLASS_TINTS = [(0.30, 0.36, 0.38, 0.12), (0.30, 0.32, 0.35, 0.1), (0.40, 0.33, 0.25, 0.35), (0.34, 0.29, 0.24, 0.3),
               (0.66, 0.68, 0.70, 0.75), (0.60, 0.58, 0.54, 0.6), (0.22, 0.24, 0.26, 0.25), (0.26, 0.26, 0.27, 0.2),
               (0.30, 0.28, 0.25, 0.25), (0.26, 0.36, 0.50, 0.3), (0.34, 0.42, 0.44, 0.2)]
# (25/09) the glass by the tower's decade: the 1960s-70s bronze, brown and
# near-black; the 1980s-2000s green-blue, grey and silver mirror; 2010 on the
# light blue-grey or clear low-e glass with light mullions (415 Natoma, 181
# Fremont, the Transbay towers), which the old draw painted 1970s brown
GLASS_BY_ERA = ((1980, [(0.40, 0.33, 0.25, 0.35), (0.34, 0.29, 0.24, 0.3), (0.30, 0.28, 0.25, 0.25), (0.22, 0.24, 0.26, 0.25),
                        (0.26, 0.26, 0.27, 0.2), (0.30, 0.32, 0.35, 0.1)]),
                (2010, [(0.30, 0.36, 0.38, 0.12), (0.34, 0.42, 0.44, 0.2), (0.26, 0.36, 0.50, 0.3), (0.66, 0.68, 0.70, 0.75),
                        (0.60, 0.58, 0.54, 0.6), (0.30, 0.32, 0.35, 0.1), (0.36, 0.44, 0.42, 0.2)]),
                (9999, [(0.50, 0.58, 0.64, 0.35), (0.56, 0.62, 0.67, 0.45), (0.46, 0.54, 0.60, 0.3), (0.62, 0.66, 0.69, 0.55),
                        (0.48, 0.57, 0.63, 0.25), (0.54, 0.60, 0.62, 0.4)]))
NEW_PANELS = [(0.90, 0.90, 0.88), (0.86, 0.87, 0.87), (0.80, 0.81, 0.82), (0.92, 0.91, 0.88), (0.74, 0.76, 0.78)]   # 2010+: white and light-grey metal or GFRC panels
def glass_for(yr, rng):
    return rng.choice(next(g for y, g in GLASS_BY_ERA if yr < y))
# generated towers the eye knows, by gid (the landmarks_hq towers are modelled apart)
# 555 California (Bank of America Center, 1969): carnelian granite, bronze glass
# in vertical bays up the serrated plan (the record's 42-sided ring gives the saw)
HERO = {137915: dict(fsys='piers', body=(0.29, 0.16, 0.13), gcol=(0.18, 0.14, 0.12, 0.35), pier=1.6, top='flat')}
BLINDS = [(0.93, 0.91, 0.86), (0.93, 0.91, 0.86), (0.86, 0.80, 0.68), (0.70, 0.66, 0.60), (0.52, 0.48, 0.44), (0.40, 0.33, 0.27), (0.70, 0.30, 0.24), (0.36, 0.44, 0.52)]
BLOCK = [(0.78, 0.72, 0.64), (0.62, 0.36, 0.28), (0.86, 0.84, 0.80), (0.70, 0.68, 0.64), (0.82, 0.76, 0.66),
         (0.93, 0.91, 0.86), (0.91, 0.87, 0.77), (0.88, 0.84, 0.76)]    # and the white and cream stucco blocks
# the works' painted concrete: white, cream, the greys, sage, a pale blue-grey,
# a dusty terracotta, ochre
WORKS = [(0.90, 0.89, 0.85), (0.86, 0.82, 0.72), (0.74, 0.74, 0.72), (0.64, 0.62, 0.58), (0.72, 0.76, 0.70),
         (0.68, 0.74, 0.80), (0.80, 0.64, 0.52), (0.58, 0.61, 0.63), (0.86, 0.78, 0.60), (0.90, 0.89, 0.85)]


ZG_ = 0.0        # the building being drawn: its ground (window draws are taken over it)
ZPRE_ = False    # ... and whether it is a pre-war apartment block (its windows' heads and sills)
LOD = 0          # 0: every opening modelled · 1: flat framed panes (city-wide)
ERA = None       # the year shown; None = today. Changes paint, not form.
# (25/09) FINE: the render's own pixel. At level 9 (9 cm/px, Z >= 8) a
# house front is 80-100 px and its stoop, window hoods, cornice brackets and
# garage-door panels read; at level 7 (37 cm/px) they are a pixel or two of
# noise, so the city's LOD leaves them out. From the pyramid level hq_city
# renders (env Z); GEN_FINE=0/1 forces it
import os as _os_f
FINE = int(_os_f.environ.get('GEN_FINE', '1' if int(_os_f.environ.get('Z', '7') or 7) >= 8 else '0'))
TRACT = _os_f.environ.get('TRACT', '1') == '1'   # (25/09) the tract builders' fronts and street entries; TRACT=0 = off

# ── paint by period: era.TABLE `paint` (Victorians) and `paint2` (the rest) ──
# The mixes and their sources live in era.py; these are the palettes each
# name stands for (display RGB: body, trim, accent). CONVENTION on the exact
# tints, SOURCED on the families.
import era as EA
import bk_kit as BK      # (27/09, assets_buildings) the ordinary building's kit v1: typology and skin
# 1870s Italianates in white, cream and stone tints, 'to resemble stone'
STONE_1875 = [((0.88, 0.85, 0.76), (0.74, 0.70, 0.60), (0.30, 0.26, 0.20)),
              ((0.82, 0.78, 0.68), (0.93, 0.90, 0.82), (0.36, 0.30, 0.22)),
              ((0.76, 0.74, 0.70), (0.90, 0.88, 0.82), (0.28, 0.28, 0.26))]
# the 1880s-90s polychrome: 'red, yellow, chocolate, orange ... uncouth panels
# of yellow and brown' (1885 critic, quoted in Wikipedia 'Painted ladies'),
# with the earth tones of the pattern books (olive, umber, Indian red)
VIC_1890 = [((0.42, 0.40, 0.26), (0.62, 0.52, 0.34), (0.45, 0.16, 0.12)),
            ((0.55, 0.42, 0.26), (0.36, 0.30, 0.20), (0.24, 0.30, 0.20)),
            ((0.46, 0.22, 0.16), (0.72, 0.62, 0.44), (0.20, 0.26, 0.18)),
            ((0.30, 0.34, 0.24), (0.64, 0.56, 0.38), (0.48, 0.20, 0.14)),
            ((0.78, 0.62, 0.30), (0.36, 0.22, 0.14), (0.52, 0.18, 0.12)),     # yellow body, chocolate trim
            ((0.58, 0.20, 0.14), (0.80, 0.66, 0.36), (0.30, 0.20, 0.12)),     # red body, yellow trim
            ((0.74, 0.46, 0.22), (0.40, 0.26, 0.16), (0.24, 0.30, 0.20)),     # orange-ochre
            ((0.62, 0.54, 0.40), (0.34, 0.26, 0.18), (0.40, 0.14, 0.10))]
PALE_1915 = [((0.93, 0.91, 0.86), (0.97, 0.96, 0.93), (0.30, 0.32, 0.30)),
             ((0.88, 0.85, 0.76), (0.96, 0.95, 0.90), (0.36, 0.30, 0.22)),
             ((0.80, 0.80, 0.76), (0.95, 0.94, 0.90), (0.28, 0.30, 0.34))]
# battleship grey 'with war-surplus Navy paint', and plain whites
GREY_1945 = [((0.62, 0.64, 0.66), (0.90, 0.90, 0.88), (0.30, 0.32, 0.34)),
             ((0.74, 0.75, 0.75), (0.93, 0.93, 0.91), (0.24, 0.26, 0.28)),
             ((0.52, 0.55, 0.58), (0.86, 0.86, 0.84), (0.20, 0.22, 0.26)),
             ((0.90, 0.89, 0.86), (0.96, 0.96, 0.94), (0.40, 0.40, 0.40))]
ERA_PALETTES = {'stone': STONE_1875, 'poly': VIC_1890, 'pale': PALE_1915, 'grey': GREY_1945}


# ── landmarks the generator dresses by hand ─────────────────────────────────
# Postcard Row, 710-722 Steiner Street: the seven Queen Anne houses facing
# Alamo Square (the seven narrow lots north of the Hayes Street corner). Their
# form stays the record's; what is set here is the row's look — steep front
# gables, the bay on the same side, the pastel-and-white of their modern
# paint jobs (the row's character, not each house's exact colours).
LANDMARK = {   # (24/09 places agent) the row's real paint, north to south from Commons photos (Rabich 2022, CC BY-SA 4.0; viewing only)
    58469: dict(paint=('#dcc9a0', '#f1ece0', '#7a4b33')),     # 710 cream, brown trim
    58530: dict(paint=('#9db6c9', '#f2efe8', '#2f3f5a')),     # 712 light blue
    58529: dict(paint=('#c8a57a', '#eadcc0', '#6a2e22')),     # 714 tan
    58528: dict(paint=('#dcc588', '#efe4c8', '#9a2b25')),     # 716 yellow, red accents
    58524: dict(paint=('#a9ad94', '#ece6d4', '#6b2d2d')),     # 718 sage grey-green
    58527: dict(paint=('#b3a676', '#ece4cc', '#3d4a30')),     # 720 olive khaki
    58525: dict(paint=('#2d3a58', '#eeeeea', '#b48a3c')),     # 722 navy, white trim
}
for _g in LANDMARK: LANDMARK[_g]['paint'] = tuple(tuple(int(c[i:i + 2], 16) / 255.0 for i in (1, 3, 5)) for c in LANDMARK[_g]['paint'])
for _g in LANDMARK: LANDMARK[_g].update(sub='queen', roof='gable', pitch=52, bay='slant', bay_left=True, turret=False, face=(-1.0, 0.0))


def era_paint(rng, style):
    """(body, trim, accent) for the year shown, or None for today's rules
    (which is also what the colorists' houses take: today's Painted-Lady
    palette is theirs)"""
    if ERA is None: return None
    k = EA.pick(EA.P('paint' if style == 'vic' else 'paint2', ERA), rng.random())
    if k in (None, 'today', 'color'): return None
    return rng.choice(ERA_PALETTES[k])


def clip_half(poly, n, c):
    """Sutherland-Hodgman against the half-plane n.p <= c; poly is a list of
    ((x, y), role of the edge that starts there); a cut edge is a party wall"""
    out = []; m = len(poly)
    for i in range(m):
        (P, r), (Q, _) = poly[i], poly[(i + 1) % m]
        dp = n[0] * P[0] + n[1] * P[1] - c; dq = n[0] * Q[0] + n[1] * Q[1] - c
        if dp <= 0: out.append((P, r))
        if (dp <= 0) != (dq <= 0):
            t = dp / (dp - dq); I = (P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t)
            out.append((I, 2 if dp <= 0 else r))
    return out


def split_lots(b):
    """today's merged footprint cut back into lots the width of the old city's
    (CONVENTION: the 25-ft / 7.6 m residential lot and its 2-4x commercial
    multiples of the 50-vara and 100-vara surveys; a deep lot is cut in two
    back to back). Returns sub-records; each keeps the parent's roles on its
    share of the outline and takes party walls on the cuts."""
    r = random.Random(b['gid'] * 17 + 1)
    ring = [tuple(p) for p in b['ring']]; roles = list(b['roles'])
    n = len(ring)
    if n < 3: return [b]
    # the axis: along the longest street wall (else the longest edge)
    def elen(i): return math.hypot(ring[(i + 1) % n][0] - ring[i][0], ring[(i + 1) % n][1] - ring[i][1])
    cand = [i for i in range(n) if roles[i] == 1] or list(range(n))
    i0 = max(cand, key=elen)
    ux, uy = ring[(i0 + 1) % n][0] - ring[i0][0], ring[(i0 + 1) % n][1] - ring[i0][1]
    L = math.hypot(ux, uy) or 1.0; ux, uy = ux / L, uy / L; vx, vy = -uy, ux
    us = [p[0] * ux + p[1] * uy for p in ring]; vs = [p[0] * vx + p[1] * vy for p in ring]
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    # lot widths along the street, drawn from the period's mix
    cuts = [u0]; u = u0
    while u1 - u > 11.0:
        u += r.choice((7.6, 7.6, 7.6, 10.4, 15.2, 15.2, 22.9)); cuts.append(min(u, u1))
    if cuts[-1] < u1: cuts.append(u1)
    if len(cuts) > 2 and cuts[-1] - cuts[-2] < 4.0: cuts.pop(-2)
    vcuts = [v0, v1] if v1 - v0 < 48 else [v0, (v0 + v1) / 2, v1]
    base = list(zip(ring, roles)); parts = []
    for a, c in zip(cuts, cuts[1:]):
        for va, vc in zip(vcuts, vcuts[1:]):
            poly = clip_half(base, (-ux, -uy), -a)
            poly = clip_half(poly, (ux, uy), c) if poly else poly
            poly = clip_half(poly, (-vx, -vy), -va) if poly else poly
            poly = clip_half(poly, (vx, vy), vc) if poly else poly
            if len(poly) < 3: continue
            pr = [p for p, _ in poly]
            area = abs(sum(pr[i][0] * pr[(i + 1) % len(pr)][1] - pr[(i + 1) % len(pr)][0] * pr[i][1] for i in range(len(pr)))) / 2
            if area < 12: continue
            sb = dict(b); sb['ring'] = pr; sb['roles'] = [q for _, q in poly]
            sb['gid'] = b['gid'] * 64 + len(parts) + 1
            sb['cx'] = sum(p[0] for p in pr) / len(pr); sb['cy'] = sum(p[1] for p in pr) / len(pr)
            parts.append(sb)
    return parts or [b]


def standin(b):
    """the lost city's stand-in on today's footprint (era.py: inside the 1906
    burned district before the fire, where the record's buildings are all
    later). CONVENTION, marked as such: a Victorian flat on a house-sized lot,
    a three-to-five storey brick or frame commercial block on a big one; the
    footprint is the record's, the form is the period's."""
    r = random.Random(b['gid'] * 131 + 5)
    ring = b['ring']
    area = abs(sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))) / 2
    b = dict(b)
    if b.get('nb_h') is not None:
        # a lost building outside the fire (era.infill): its neighbours' period and height
        b['year'] = b['nb_year']; b['h'] = max(4.0, b['nb_h'] * r.uniform(0.85, 1.12))
        b['st'] = max(1, round(b['h'] / 3.6)); b['shop'] = False
        b['ty'] = 'FLATS' if b['h'] < 16 else 'APARTMENT' if b['h'] < 24 else 'OFFICE'
        return b
    downtown = b.get('core', False)
    if b.get('rebuild'):
        # the post-fire rebuild, 1906-1915: brick and terracotta commercial
        # blocks downtown, Edwardian flats beyond (their record style)
        if downtown or area > 700:
            b['ty'] = 'OFFICE'; b['shop'] = True; b['st'] = r.choice((3, 4, 5, 6, 7) if downtown else (2, 3, 4)); b['h'] = b['st'] * 4.0
        else:
            b['ty'] = 'FLATS'; b['st'] = r.choice((2, 3, 3)); b['h'] = b['st'] * 3.4 + 1.0; b['shop'] = r.random() < 0.3
        b['year'] = r.choice((1907, 1908, 1909, 1911, 1913))
        return b
    if area > 700 or (downtown and area > 350 and r.random() < 0.5):
        # the brick commercial block: Italianate, three to six storeys
        b['ty'] = 'OFFICE'; b['shop'] = True; b['st'] = r.choice((3, 4, 4, 5, 6) if downtown else (2, 3, 3, 4)); b['h'] = b['st'] * 4.2
        b['year'] = r.choice((1878, 1885, 1892, 1900))
    else:
        # the frame building of a lot: flats over a shop downtown, a house beyond
        b['ty'] = 'FLATS'; b['st'] = r.choice((3, 3, 4) if downtown else (2, 2, 3, 3)); b['h'] = b['st'] * 3.6 + 1.2
        b['shop'] = downtown or r.random() < 0.2; b['year'] = r.choice((1875, 1882, 1888, 1895))
    return b


class Out:
    """per-material accumulators"""
    def __init__(self):
        self.m = {k: ([], [], []) for k in MATS}   # verts, faces, face colours

    def poly(self, mat, pts, col=(1, 1, 1)):
        V, F, C = self.m[mat]
        k = len(V); V.extend(tuple(p) for p in pts); F.append(tuple(range(k, k + len(pts)))); C.append(col)

    def box3(self, mat, o, a, b, c, col):
        """a box from corner o along edge vectors a, b, c"""
        p = [o, o + a, o + a + b, o + b, o + c, o + a + c, o + a + b + c, o + b + c]
        for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            self.poly(mat, [p[i] for i in f], col)


class Wall:
    """one edge of a footprint, in its own frame: u along the edge, z up,
    w outward (positive = out of the building)"""
    def __init__(self, a, b, out):
        self.a = Vector((a[0], a[1], 0)); self.b = Vector((b[0], b[1], 0))
        d = self.b - self.a; self.L = d.length; self.t = d / self.L if self.L else Vector((1, 0, 0))
        self.n = Vector((self.t.y, -self.t.x, 0))             # outward for a CCW ring
        self.o = out

    def P(self, u, z, w=0.0):
        p = self.a + self.t * u + self.n * w; p.z = z; return p

    def rect(self, mat, u0, u1, z0, z1, w=0.0, col=(1, 1, 1)):
        self.o.poly(mat, [self.P(u0, z0, w), self.P(u1, z0, w), self.P(u1, z1, w), self.P(u0, z1, w)], col)

    def box(self, mat, u0, u1, z0, z1, w0, w1, col):
        o = self.P(u0, z0, w0)
        self.o.box3(mat, o, self.t * (u1 - u0), self.n * (w1 - w0), Vector((0, 0, z1 - z0)), col)

    def wall_with_holes(self, mat, u0, u1, z0, z1, holes, col):
        """the wall rectangle minus the openings, as grid cells"""
        if LOD >= 1:                     # panes sit on the face: the wall stays whole
            self.rect(mat, u0, u1, z0, z1, 0.0, col); return
        us = sorted({u0, u1, *[h[0] for h in holes], *[h[1] for h in holes]})
        zs = sorted({z0, z1, *[h[2] for h in holes], *[h[3] for h in holes]})
        us = [u for u in us if u0 <= u <= u1]; zs = [z for z in zs if z0 <= z <= z1]
        for i in range(len(us) - 1):
            for j in range(len(zs) - 1):
                cu, cz = (us[i] + us[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
                if any(h[0] <= cu <= h[1] and h[2] <= cz <= h[3] for h in holes): continue
                self.rect(mat, us[i], us[i + 1], zs[j], zs[j + 1], 0.0, col)

    def opening(self, u0, u1, z0, z1, kind, trim, depth=0.2, rng=None, body=None, hood=None):
        """a recessed window or door: reveals, glass, casing, sill, sashes"""
        o = self.o
        if LOD >= 1:
            # the far city: a pane on the wall face with its frame and sill —
            # the proportions stay the record's, the modelling stops there
            if kind == 'door': self.rect('door', u0, u1, z0, z1, 0.02, body); return
            if kind == 'tw':    # a tower's punched window: reflective glass, no painted frame (the stone is the frame)
                self.rect('curtain_wall', u0, u1, z0, z1, 0.02, body); return
            # (24/09) each pane's own draw from its position — x, y and its
            # height over the building's ground, never the absolute z (the
            # ground's mesh differs by region: a frame and a crop drew
            # different panes) — its brightness rides in the face colour
            p_ = self.P(u0, z0); pr = random.Random(int(p_.x * 7.3) * 92821 + int(p_.y * 7.3) * 68917 + int(round((z0 - ZG_) * 2)))
            gk = pr.random() * 0.998
            self.rect('shopglass' if kind == 'shop' else 'glass', u0, u1, z0, z1, 0.03, (gk, gk, gk) if kind != 'shop' else (1, 1, 1))
            if (kind == 'dh' or (kind == 'tall' and trim is not None and ZPRE_)) and LOD >= 2:
                # a house window's head casing and sill, standing proud: the
                # low sun draws a shadow line over the pane, the sill a light
                # line under it — the window reads set into its wall. At level 9
                # (FINE) the casing of a painted house is its signature: wider
                # and deeper, a crisp light frame round every dark pane
                hc = 0.22 if FINE else 0.14
                self.box('trim', u0 - hc, u1 + hc, z1 + 0.02, z1 + (0.26 if FINE else 0.2), 0.0, 0.2 if FINE else 0.16, trim)
                self.box('trim', u0 - hc + 0.04, u1 + hc - 0.04, z0 - (0.16 if FINE else 0.12), z0 - 0.02, 0.0, 0.16 if FINE else 0.13, trim)
                if FINE and kind == 'dh' and hood == 'pediment':
                    # (25/09, level 9) the Italianate's hood: a pediment over
                    # the casing, its two slopes catching the sun
                    um, zb, a_, b_ = (u0 + u1) / 2, z1 + 0.26, u0 - 0.26, u1 + 0.26; pk = zb + 0.36
                    self.o.poly('trim', [self.P(a_, zb, 0.25), self.P(b_, zb, 0.25), self.P(um, pk, 0.25)], trim)
                    self.o.poly('trim', [self.P(a_, zb, 0.25), self.P(um, pk, 0.25), self.P(um, pk, 0.0), self.P(a_, zb, 0.0)], trim)
                    self.o.poly('trim', [self.P(um, pk, 0.25), self.P(b_, zb, 0.25), self.P(b_, zb, 0.0), self.P(um, pk, 0.0)], trim)
                elif FINE and kind == 'dh' and hood == 'cap':
                    # the Stick and Edwardian cap: a crown wider and deeper than the casing
                    self.box('trim', u0 - 0.28, u1 + 0.28, z1 + 0.26, z1 + 0.4, 0.0, 0.3, trim)
            if LOD >= 2:
                # the casing and sill as one painted quad behind the pane: at
                # 37 cm a pixel a window is a dark pane in a light frame, and
                # a painted front reads as windows, not as a coloured box
                if kind != 'shop' and trim is not None:
                    cw = 0.2 if (FINE and kind == 'dh') else 0.13
                    self.rect('trim', u0 - cw, u1 + cw, z0 - 0.12, z1 + 0.15, 0.015, trim)
                # a blind or a curtain drawn part way down about two panes in
                # five: a light patch at the pane's head, so a row of windows
                # is lived in, not a stamped grid of dark holes (drawn from the
                # pane's own position: the building's draw sequence stays)
                if kind != 'shop':
                    if pr.random() < 0.42:
                        c_ = pr.choice(BLINDS); k_ = pr.uniform(0.62, 0.85)
                        # (25/09, level 9) the blind is behind the glass: at 9 cm
                        # a red or blue one read as a painted shutter (the AI
                        # drew a Mediterranean village) — its colour mostly
                        # the room's warm white, seen dimmed through the pane
                        if FINE: c_ = mix(c_, (0.84, 0.81, 0.76), 0.65); k_ *= 0.74
                        self.rect('curtain', u0, u1, z1 - (z1 - z0) * pr.uniform(0.18, 0.85), z1, 0.035, tuple(v * k_ for v in c_))
                return
            self.box('trim', u0 - 0.1, u1 + 0.1, z0 - 0.08, z0, 0.0, 0.08, trim)
            self.box('trim', u0 - 0.1, u1 + 0.1, z1, z1 + 0.12, 0.0, 0.05, trim)
            return
        # reveals
        self.o.poly('trim', [self.P(u0, z0, 0), self.P(u0, z1, 0), self.P(u0, z1, -depth), self.P(u0, z0, -depth)], trim)
        self.o.poly('trim', [self.P(u1, z0, 0), self.P(u1, z0, -depth), self.P(u1, z1, -depth), self.P(u1, z1, 0)], trim)
        self.o.poly('trim', [self.P(u0, z1, 0), self.P(u1, z1, 0), self.P(u1, z1, -depth), self.P(u0, z1, -depth)], trim)
        self.o.poly('trim', [self.P(u0, z0, 0), self.P(u0, z0, -depth), self.P(u1, z0, -depth), self.P(u1, z0, 0)], trim)
        if kind == 'door':
            self.rect('door', u0, u1, z0, z1, -depth, body)
            self.box('trim', u0 - 0.12, u1 + 0.12, z1, z1 + 0.25, 0.0, 0.1, trim)          # head
            self.box('glass', u0 + 0.12, u1 - 0.12, z1 - 0.7, z1 - 0.12, -depth + 0.02, -depth + 0.04, (1, 1, 1))
            return
        mat = 'shopglass' if kind == 'shop' else 'glass'
        # a blind or a curtain behind about one pane in four
        if rng and rng.random() < 0.38 and kind != 'shop':
            self.rect('curtain', u0, u1, z0 + (z1 - z0) * rng.uniform(0.2, 0.85), z1, -depth - 0.02, rng.choice(BLINDS))
        self.rect(mat, u0, u1, z0, z1, -depth, (1, 1, 1))
        if kind == 'shop':
            for uu in frange(u0, u1, 1.6)[1:-1]: self.box('metal', uu - 0.03, uu + 0.03, z0, z1, -depth, -depth + 0.06, (0.1, 0.1, 0.1))
            return
        c = 0.11                                                             # casing
        self.box('trim', u0 - c, u0, z0 - 0.02, z1 + c, 0.0, 0.04, trim)
        self.box('trim', u1, u1 + c, z0 - 0.02, z1 + c, 0.0, 0.04, trim)
        if hood == 'pediment':
            hz = z1 + c + 0.06
            self.box('trim', u0 - c - 0.1, u1 + c + 0.1, z1, hz, 0.0, 0.14, trim)
            # a shallow triangular pediment, its face and its top slopes
            um = (u0 + u1) / 2; pk = hz + 0.32; a_, b_ = u0 - c - 0.12, u1 + c + 0.12
            self.o.poly('trim', [self.P(a_, hz, 0.15), self.P(b_, hz, 0.15), self.P(um, pk, 0.15)], trim)
            self.o.poly('trim', [self.P(a_, hz, 0.15), self.P(um, pk, 0.15), self.P(um, pk, 0.0), self.P(a_, hz, 0.0)], trim)
            self.o.poly('trim', [self.P(um, pk, 0.15), self.P(b_, hz, 0.15), self.P(b_, hz, 0.0), self.P(um, pk, 0.0)], trim)
        elif hood == 'cap':
            self.box('trim', u0 - c - 0.12, u1 + c + 0.12, z1, z1 + c + 0.16, 0.0, 0.16, trim)
            self.box('trim', u0 - c - 0.16, u1 + c + 0.16, z1 + c + 0.16, z1 + c + 0.24, 0.0, 0.22, trim)
        else:
            self.box('trim', u0 - c - 0.04, u1 + c + 0.04, z1, z1 + c + 0.06, 0.0, 0.07, trim)   # head
        self.box('trim', u0 - c - 0.02, u1 + c + 0.02, z0 - 0.07, z0, 0.0, 0.08, trim)        # sill
        # double-hung: a meeting rail and the sash frames
        zm = (z0 + z1) / 2; w0 = -depth + 0.02; w1 = -depth + 0.06
        self.box('trim', u0, u1, zm - 0.03, zm + 0.03, w0, w1, trim)
        for uu in (u0, u1 - 0.05): self.box('trim', uu, uu + 0.05, z0, z1, w0, w1, trim)
        if kind == 'tall' and u1 - u0 > 0.9:
            self.box('trim', (u0 + u1) / 2 - 0.02, (u0 + u1) / 2 + 0.02, z0, z1, w0, w1, trim)


def frange(a, b, step):
    n = max(1, int(round((b - a) / step))); return [a + (b - a) * i / n for i in range(n + 1)]


def ring_ccw(r):
    a = sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r)))
    return (r, False) if a > 0 else (r[::-1], True)


def offset_ring(r, d):
    """miter offset of a CCW ring, outward for d > 0 (clamped at sharp corners)"""
    n = len(r); out = []
    for i in range(n):
        p0, p1, p2 = Vector(r[i - 1]), Vector(r[i]), Vector(r[(i + 1) % n])
        e0 = (p1 - p0).normalized(); e1 = (p2 - p1).normalized()
        n0 = Vector((e0.y, -e0.x)); n1 = Vector((e1.y, -e1.x))
        m = (n0 + n1); ml = m.length
        if ml < 1e-6: m = n0; s = d
        else:
            m /= ml; cosh = max(0.35, m.dot(n1)); s = d / cosh
        q = p1 + m * s; out.append((q.x, q.y))
    return out


def split_tri(tri, f):
    """split a triangle (3 Vectors) along f(p) = 0; returns triangles"""
    s = [f(p) for p in tri]
    if all(x >= -1e-9 for x in s) or all(x <= 1e-9 for x in s): return [tri]
    for k in range(3):                     # find the vertex alone on its side
        a, b, c = tri[k], tri[(k + 1) % 3], tri[(k + 2) % 3]
        sa, sb, sc = s[k], s[(k + 1) % 3], s[(k + 2) % 3]
        if (sa > 0) != (sb > 0) and (sa > 0) != (sc > 0):
            pab = a + (b - a) * (sa / (sa - sb)); pac = a + (c - a) * (sa / (sa - sc))
            return [[a, pab, pac], [pab, b, c], [pab, c, pac]]
    return [tri]


# ── the building ─────────────────────────────────────────────────────────────

def style_of(b):
    y, ty, h = b['year'] or 1950, b['ty'], b['h']
    if ty in ('OFFICE', 'HOTEL', 'INSTITUTION') or h > 22: return 'block'
    if ty in ('HOUSE', 'FLATS', 'APARTMENT', 'UNCLASSED') and y < 1912 and h < 19: return 'vic'
    if ty in ('HOUSE', 'FLATS', 'APARTMENT', 'RETAIL', 'UNCLASSED') and y < 1945 and h < 20: return 'stucco'
    if ty in ('HOUSE', 'FLATS') and h < 12: return 'midcentury'
    # (25/09) the post-war flats (the 'Richmond special', 1945-85): two or
    # three floors of stucco flats over a row of garages — they were drawn
    # as pre-war apartment blocks (pilastered entry, brick, cornice)
    if ty in ('APARTMENT', 'FLATS') and 1945 <= y < 1985 and h < 14 and not b.get('shop'): return 'midcentury'
    return 'block'


def substyle(b, style, rng):
    """the era's own vocabulary, by the record's year; which variant a
    building takes within its era is a seeded draw"""
    y = b['year'] or 1950
    if style == 'vic':
        if y < 1880: return rng.choice('sub', ('italianate', 'italianate', 'stick'))
        if y < 1890: return rng.choice('sub', ('stick', 'stick', 'italianate', 'queen'))
        return rng.choice('sub', ('queen', 'queen', 'stick', 'italianate'))
    if style == 'stucco':
        return 'edwardian' if y < 1918 else 'med'
    if style == 'midcentury':
        if b['ty'] in ('APARTMENT', 'FLATS') and b['h'] >= 8.5 and y < 1985: return 'postwar'
        return 'sunset' if y < 1962 else 'modern'
    # the works: warehouses, shops and garages of SoMa, Dogpatch, the Bayview
    # (the roll's INDUSTRIAL and GARAGE; they were apartment houses before)
    if b['ty'] in ('INDUSTRIAL', 'GARAGE') and b['h'] < 24: return 'works'
    return 'tower' if b['h'] > 40 else ('commercial' if (b.get('shop') or b['ty'] in ('RETAIL', 'OFFICE')) else 'apartment')


def building(b, ground, out):
    """b: record from city_data.buildings; ground(x, y) -> z"""
    if b.get('rise') is not None: return construction(b, ground, out)
    if b.get('standin') and not b.get('_lot'):
        # the lost city stood on lots, not on today's merged footprints
        for sb in split_lots(b):
            sb['_lot'] = True
            try: building(sb, ground, out)
            except Exception as ex: print('stand-in lot failed', sb['gid'], ex)
        return
    if b.get('standin'): b = standin(b)
    if b.get('ruin'): return ruin(b, ground, out)
    rng = random.Random(b['gid'] * 7919 + 13)
    # (FAITHFUL, default off) the building as street photos / aerials saw it: typology, storeys, garage,
    # bays, facade / trim colour, material (qipu-render-work/faithful/fa_build.py -> FA_FILE)
    FA = _faithful().get(str(b['gid'])) if (ERA is None and not b.get('_bkpart') and b['gid'] not in LANDMARK) else None
    RP = ROW_G.get(b['gid']) if (b['gid'] not in LANDMARK and not b.get('places')) else None
    if RP and not b.get('_bkpart'): b = dict(b, h=RP[4], st=RP[5], year=RP[6])      # the run's one design: its height, storeys, year
    # (BK_MASS) the LiDAR's roof massing: the building drawn as its measured parts (lower wings, light wells cut out)
    _pp = None if b.get('_bkpart') else BK.parts_of(b, ground, 'stucco' if BK.fire_rebuilt(b, style_of(b), ERA) else style_of(b), ERA)
    if _pp:
        for sb in _pp: building(sb, ground, out)
        return
    RD = RowDraw(RP, rng)
    ring, flipped = ring_ccw(close_party([tuple(p) for p in b['ring']], None if b.get('_bkpart') else PARTY_G.get(str(b['gid']))))
    roles = b['roles'][::-1] if flipped else list(b['roles'])
    if flipped:  # roles are per edge i -> i+1; reversing the ring shifts them by one
        roles = roles[1:] + roles[:1]
    n = len(ring)
    if n < 3: return
    zs = [ground(x, y) for x, y in ring]
    zg = sum(zs) / n                       # the record's height stands on the mean ground
    if b.get('_zg') is not None: zg = b['_zg']          # (a measured part: its building's ground)
    global ZG_, ZPRE_; ZG_ = zg; ZPRE_ = (b['h'] < 30 and (b['year'] or 1950) < 1945 and b['ty'] in ('APARTMENT', 'FLATS'))
    zfoot = min(zs) - 0.6                  # walls run into the lowest ground
    style = b.get('_style') or style_of(b)
    if BK.fire_rebuilt(b, style, ERA): style = 'stucco'      # (BK_FIRE) the burned district's 'old' house: an Edwardian flat
    top = zg + max(3.0, b['h'])
    storeys = b['st'] or max(1, round(b['h'] / 3.4))
    # a storey count its height cannot hold (a 70 m tower "of 2 storeys"):
    # the record's height wins, at a storey of 3.9 m (3.6 m for a house)
    if b['h'] / storeys > 5.5: storeys = max(storeys, round(b['h'] / (3.9 if style == 'block' else 3.6)))
    if FA and FA.get('st'): storeys = max(1, min(int(FA['st']), round(b['h'] / 2.4)))      # (FAITHFUL) storeys counted on the photo
    walls = [Wall(ring[i], ring[(i + 1) % n], out) for i in range(n)]
    fronts = [i for i in range(n) if roles[i] == 1 and walls[i].L > 2.0]
    if not fronts:                         # no front measured: the longest non-party edge
        cand = [i for i in range(n) if roles[i] != 2] or list(range(n))
        fronts = [max(cand, key=lambda i: walls[i].L)]
    f0 = max(fronts, key=lambda i: walls[i].L)
    LM = LANDMARK.get(b['gid'], {})
    if LM.get('face'):                      # a landmark row faces where it is known to face
        fx, fy = LM['face']
        f0 = max((i for i in range(n) if walls[i].L > 2.0), key=lambda i: walls[i].n.x * fx + walls[i].n.y * fy)
        fronts = [f0]; roles = [1 if i == f0 else (2 if roles[i] == 1 else roles[i]) for i in range(n)]
    if FA and FA.get('fw') and not LM:
        # (FAITHFUL v2) the walls the street photos saw are FRONTS (the record called some of them backs: the map drew rear
        # porches where the photo shows the street front); matched on midpoint + outward normal (close_party / ccw safe)
        ph_ = []
        for mx_, my_, nx_, ny_ in (q_[:4] for q_ in FA['fw']):
            c_ = [(math.hypot((walls[i].a.x + walls[i].b.x) / 2 - mx_, (walls[i].a.y + walls[i].b.y) / 2 - my_), i) for i in range(n)
                  if walls[i].L > 2.0 and roles[i] != 2 and walls[i].n.x * nx_ + walls[i].n.y * ny_ > 0.8]
            c_ = [q_ for q_ in c_ if q_[0] < 3.0]
            if c_ and min(c_)[1] not in ph_: ph_.append(min(c_)[1])
        if ph_:
            roles = [1 if i in ph_ else roles[i] for i in range(n)]
            f0 = ph_[0]; fronts = sorted(set(fronts) | set(ph_))

    sub = substyle(b, style, RD)
    OV = b.get('places') if isinstance(b.get('places'), dict) else {}   # the places agent's per-building overrides (city_data)
    if FA: OV = dict(OV, **{k_: FA[k_] for k_ in ('style', 'roof_col') if FA.get(k_)})     # (FAITHFUL) typology / roof colour
    if OV.get('style') in STYLE_OF_SUB: style, sub = STYLE_OF_SUB[OV['style']], OV['style']
    elif OV.get('style') in ('vic', 'stucco', 'midcentury', 'block'): style = OV['style']
    PS = pier_shed(b)                                        # (24/09) a finger-pier shed of the port
    if PS is not None: style, sub = 'block', 'pier'
    if LM: style, sub = 'vic', LM['sub']
    corner = sum(1 for i in range(n) if roles[i] in (1, 3) and walls[i].L > 3.0) >= 2

    # ── roof form and eave ──
    if style == 'vic':
        roof = 'gable' if (sub == 'queen' and RD.random('roof') < 0.9) or (sub != 'queen' and RD.random('roof') < 0.15) else 'flat'
        if LM: roof = LM['roof']
    elif style == 'midcentury':
        roof = 'gable' if (sub == 'sunset' and RD.random('roof') < 0.4) else 'flat'
    elif sub == 'med':
        roof = 'gable' if RD.random('roof') < 0.25 else 'flat'
    else:
        roof = 'flat'
    if not LM: roof = measured_form(b, roof)                 # ROOFS: a light membrane seen from the air is a flat roof
    # (24/09) and the other way: a house whose roof the air reads as dark
    # shingle (or clay tile) is pitched — the Castro's, Noe's, the Haight's
    # gables, where the generator had drawn a flat roof behind a parapet
    if not LM and roof == 'flat' and style in ('vic', 'stucco', 'midcentury'):
        m_ = ROOF_M.get(b['gid'])
        if m_ and (m_[3] == 'shingle' or (m_[3] == 'tile' and sub in ('med', 'sunset'))) and b['h'] < 16 and abs(ring_area(ring)) < 350 and walls[f0].L <= 10.5: roof = 'gable'   # (a row house's width: wider, it drew barns)
    if OV.get('roof'): roof = {'gable': 'gable', 'hip': 'hip', 'flat': 'flat', 'mansard': 'flat', 'dome': 'flat'}.get(OV['roof'], roof)
    # (24/09) THE ROOF'S FORM FROM THE LIDAR — USGS 3DEP, CA_SanFrancisco_1_B23,
    # public domain (qipu-render-work/lidar/roofs_lidar.py): flat, a gable and
    # its ridge's direction, or a hip, with the measured pitch. It overrides
    # the conventions above wherever the footprint was measured
    LR = LIDAR_R.get(str(b['gid'])) if (not LM and not OV.get('roof') and sub not in ('works', 'pier', 'tower')) else None   # (eras: a standing building's roof form is its own in every year)
    if LR:
        if LR[0] == 'flat': roof = 'flat'
        elif abs(ring_area(ring)) < (800 if style != 'block' else 500) and b['h'] < 25: roof = LR[0]
        else: LR = None
    # a works shed of one or two storeys over a near-rectangular lot: a
    # sawtooth of north lights, or the bow-truss barrel of the 1910s-40s
    wrng = random.Random(b['gid'] * 577 + 3)                 # (its own draws: the main sequence stays)
    if sub == 'works' and roof == 'flat' and b['h'] < 13 and LOD >= 1:
        _a = abs(sum(ring[i][0] * ring[(i + 1) % n][1] - ring[(i + 1) % n][0] * ring[i][1] for i in range(n))) / 2
        _u = [x * walls[f0].t.x + y * walls[f0].t.y for x, y in ring]; _v = [x * walls[f0].n.x + y * walls[f0].n.y for x, y in ring]
        _fill = _a / max(1.0, (max(_u) - min(_u)) * (max(_v) - min(_v)))
        yr_w = b['year'] or 1950; x_ = wrng.random()
        if _a >= 280 and _fill >= 0.88 and min(max(_u) - min(_u), max(_v) - min(_v)) >= 9:
            if yr_w < 1950: roof = 'saw' if x_ < 0.28 else ('barrel' if x_ < 0.55 else roof)
            elif yr_w < 1975: roof = 'saw' if x_ < 0.18 else roof
    if b.get('_bkpart'): roof = 'flat'                        # (a measured part: the flat roof the LiDAR saw)
    roof_mat = 'roof_tile' if (sub == 'med' or (sub == 'sunset' and RD.random('rmat') < 0.5)) else 'roof_shingle'
    # the roof axis: u along the front, v into the lot
    ax_u = walls[f0].t.copy(); ax_v = -walls[f0].n.copy()
    if LR and roof == 'gable':
        # the measured ridge: along v (a front gable) or along u (a side gable)
        rd_ = Vector((math.cos(math.radians(LR[1])), math.sin(math.radians(LR[1])), 0))
        if abs(rd_.dot(ax_u)) > abs(rd_.dot(ax_v)): ax_u, ax_v = ax_v.copy(), -ax_u
    us = [Vector((x, y, 0)).dot(ax_u) for x, y in ring]
    vs = [Vector((x, y, 0)).dot(ax_v) for x, y in ring]
    umin, umax = min(us), max(us); uc = (umin + umax) / 2; hw = (umax - umin) / 2
    pitch = math.radians(LM.get('pitch') or {'vic': 50, 'med': 24, 'sunset': 26}.get(style if style == 'vic' else sub, 28))
    if LR and roof in ('gable', 'hip'): pitch = math.radians(min(55.0, max(16.0, LR[2])))
    vmin, vmax = min(vs), max(vs); vc = (vmin + vmax) / 2; hs_ = min(hw, (vmax - vmin) / 2)
    rise = min(hw * math.tan(pitch), 0.55 * (top - zg)) if roof == 'gable' else (min(hs_ * math.tan(pitch), 0.55 * (top - zg)) if roof == 'hip' else 0.0)
    eave = top - rise
    if roof == 'gable':
        def rz(p):  # roof height over a point
            return eave + max(0.0, hw - abs(p.dot(ax_u) - uc)) * math.tan(pitch) * (rise / (hw * math.tan(pitch)))
    elif roof == 'hip':
        kh_ = rise / max(hs_, 0.1)
        def rz(p):  # a hip: the height grows with the distance to the nearest eave
            u_, v_ = p.dot(ax_u), p.dot(ax_v)
            return eave + max(0.0, min(u_ - umin, umax - u_, v_ - vmin, vmax - v_)) * kh_
    else:
        def rz(p): return top

    # ── colours ──
    ep = era_paint(random.Random(b['gid'] * 31 + 7), style)
    if style == 'vic':
        body, trim, accent = rng.choice(VIC)
    elif style in ('stucco', 'midcentury'):
        body = rng.choice(STUCCO); x_ = rng.random()
        trim = (0.97, 0.96, 0.93) if x_ < 0.8 else ((0.33, 0.33, 0.32) if x_ < 0.9 else (0.46, 0.36, 0.26))
        accent = rng.choice(((0.45, 0.14, 0.12), (0.18, 0.28, 0.24), (0.20, 0.22, 0.30)))
        if sub == 'edwardian' and rng.random() < 0.45: body, trim, accent = rng.choice(VIC)
        _ec = BK.edw_paint(b, sub, body, STUCCO, VIC)          # (BK_EDWCOL) the Edwardian rows keep their colours
        if _ec: body, trim, accent = _ec
    else:
        body = rng.choice(BLOCK); trim = (0.88, 0.86, 0.82); accent = (0.2, 0.2, 0.22)
    if ep is not None: body, trim, accent = ep
    # (25/09) the Sunset, the Richmond, the Parkside, the Excelsior (1920s-80s
    # stucco): from the air rows of white, pale grey and beige with a coloured
    # front here and there (Richmond top-down, Parkside drone) — the pastel
    # draw read as a candy row. Seven in ten neutral, and less boosted below
    WHITE_ROW = ep is None and not LM and sub in ('med', 'sunset', 'postwar', 'modern')
    pal_ = None
    if not LM and ep is None and ERA is None and PS is None and not OV.get('facade_col') and sub not in ('works', 'pier'):
        pal_ = BK.paint(b, style, sub)                          # (BK_PAL) the fronts measured on street photos
        if pal_: body, trim = pal_
    if WHITE_ROW and random.Random(b['gid'] * 389 + 5).random() < 0.7: body = random.Random(b['gid'] * 389 + 6).choice(NEUTRAL)
    if LM and ERA is None: body, trim, accent = LM['paint']
    # paint that must still read at a distance: the painted styles a little
    # richer, more so at the city's scale where a front is a few pixels
    if style in ('vic', 'stucco', 'midcentury') and (ep is None or ERA is None or ERA >= 1960):
        body = saturate(body, 1.18 if LOD == 0 else (1.2 if (WHITE_ROW or pal_) else 1.5))
        body = unviolet(body)
    # (25/09, level 9) the painted house's signature is its light trim standing
    # out of a mid-tone body. A pale body under white trim read as a plain box
    # at 9 cm: there the body is taken a shade deeper (at most 20 %, its hue kept)
    if FINE and (style == 'vic' or sub == 'edwardian') and not LM and _lum(trim) > 0.6 and _lum(body) > _lum(trim) - 0.22:
        k_ = max(0.8, (_lum(trim) - 0.22) / max(0.05, _lum(body)))
        body = tuple(v * k_ for v in body)
    if OV.get('facade_col'): body = hexcol(OV['facade_col'])
    wall_mat = {'vic': 'siding', 'stucco': 'stucco', 'midcentury': 'stucco'}.get(style)
    # 'modernised': the mid-century remodel that stripped a Victorian's
    # millwork and covered its siding in stucco or asbestos shingle
    # (era.TABLE `strip`; sanfranciscostory.com 'Victorian Comeback II')
    stripped = (style == 'vic' and ERA is not None and not b.get('standin')
                and random.Random(b['gid'] * 211 + 9).random() < EA.P('strip', ERA))
    if stripped:
        wall_mat = 'stucco'
        body, trim, accent = random.Random(b['gid'] * 5 + 1).choice(PALE_1915 + GREY_1945)
    if sub == 'edwardian' and RD.random('clad') < 0.35: wall_mat = 'siding'
    if style == 'block':
        yr = b['year'] or 1960
        wall_mat = 'brick' if (yr < 1935 and rng.random() < 0.55) else ('stucco' if yr < 1960 else 'concrete')
    if PS is not None:
        # the port's sheds: painted concrete and corrugated sheet, pale —
        # cream, stone, a sea-green grey — the bulkhead in the cream stucco
        pr_ = random.Random(b['gid'] * 443 + 1)
        # (24/09, integration: the greens read olive-khaki under the low sun;
        # the real sheds are light grey and cream — and the grey plaster's own
        # tint went khaki in the shade over the bay: painted stucco, neutral)
        wall_mat = 'stucco'; body = PS.get('body') or pr_.choice(((0.88, 0.87, 0.84), (0.86, 0.84, 0.78), (0.83, 0.83, 0.81), (0.90, 0.88, 0.82)))
        trim = PS.get('trim') or pr_.choice(((0.93, 0.91, 0.86), (0.62, 0.64, 0.64), (0.93, 0.91, 0.86)))
        accent = pr_.choice(((0.38, 0.48, 0.44), (0.52, 0.54, 0.54), (0.46, 0.30, 0.24)))
    if sub == 'works' and ep is None and not LM:
        # painted board-formed concrete mostly, common brick before the 1930s;
        # roll-up doors in galvanised grey or a painted colour
        yr = b['year'] or 1950
        if yr < 1935 and wrng.random() < 0.5: wall_mat, body = 'brick', wrng.choice(((0.86, 0.70, 0.60), (0.80, 0.62, 0.52), (0.90, 0.78, 0.68)))
        else: wall_mat, body = 'concrete', wrng.choice(WORKS)
        trim = wrng.choice((mix(body, (0.0, 0.0, 0.0), 0.12), mix(body, (0.0, 0.0, 0.0), 0.12), (0.30, 0.31, 0.32), (0.92, 0.91, 0.88)))
        accent = wrng.choice(((0.62, 0.63, 0.62), (0.62, 0.63, 0.62), (0.48, 0.50, 0.51), (0.30, 0.40, 0.52), (0.58, 0.22, 0.17), (0.30, 0.38, 0.32), (0.86, 0.84, 0.80)))

    # ── BCOL_REAL (realcolour pilot, default off): the facade measured on
    # registered street photos (KartaView, CC BY-SA), or drawn from the
    # measured (neighbourhood x decade x type) pool; realcolour/rc_build_a.py ──
    import os as _os_rc
    if _os_rc.environ.get('BCOL_REAL', '0') == '1' and PS is None and not LM and ERA is None and sub not in ('works', 'pier'):
        RCB = _realcol().get(str(b['gid']))
        if RCB:
            body, trim = saturate(tuple(RCB['b']), float(_os_rc.environ.get('BCOL_SAT', 1.2))), tuple(RCB['t'])
            if RCB.get('m') == 'brick' and style == 'block': wall_mat = 'brick'
    if b.get('wall'): wall_mat = b['wall']            # a named lost building's own wall (era.LANDMARK_SITES)

    # ── floors ──
    raised = {'vic': RD.uniform('raised', 1.0, 1.6), 'stucco': RD.uniform('raised', 0.3, 2.6), 'midcentury': 0.2, 'block': 0.4}[style]
    if style == 'vic' and b.get('standin') and b.get('shop'): raised = 3.9      # flats over a shop
    if style == 'stucco' and raised > 1.5: raised = 2.6        # Edwardian over a garage level
    if sub == 'sunset': raised = 2.6                           # the Sunset house: garage below, living above
    # (25/09) the 1920s-40s house of the Sunset, the Richmond, the Excelsior
    # stands over its garage nine times in ten (the tract builders' plan);
    # the old half-and-half draw left half of them one tall storey of 5-6 m
    grng = random.Random(b['gid'] * 211 + 17)
    if sub == 'med' and b['ty'] in ('HOUSE', 'FLATS') and (b['year'] or 0) >= 1922 and b['h'] >= 5.3 and raised < 2.6 and RD.random('garage', grng) < 0.8: raised = 2.6
    if sub == 'postwar': raised = 2.7                          # the garage row at the street
    if FA and FA.get('garage') is not None and style in ('vic', 'stucco', 'midcentury'):   # (FAITHFUL) a garage at the street, or none
        raised = max(raised, 2.6) if FA['garage'] else min(raised, 1.5)
    first = zg + raised
    nfl = max(1, storeys if raised < 2 else max(1, storeys - 1))
    # the post-war flats: as many floors as the height holds (the roll counts
    # the garage level in some records, not in others)
    if sub == 'postwar': nfl = max(1, round((eave - first - 0.4) / 2.85))
    fh = max(2.6, (eave - first) / nfl)
    if first + fh > eave: first = zg + 0.3; fh = max(2.4, (eave - first) / nfl)
    hood = None if stripped else {'italianate': 'pediment', 'stick': 'cap', 'edwardian': 'cap'}.get(sub)
    # (25/09) THE TRACT BUILDER'S FRONT (1918-61: the Sunset, Parkside, the
    # Richmond, the Excelsior): a run shares its massing, garage and entry, but
    # its fronts take the builder's few designs in turn, never twice side by
    # side (the Doelger way): 'spanish' (tile pent, barrel or square bay,
    # arched tunnel entry), 'streamline' (plain parapet, eyebrow over the
    # windows, speed lines), 'provincial' (a shingle or tile pent across the
    # front), 'plain'. Own draws: the house's sequence stays
    SV = sunset_front(b, sub, RP) if (TRACT and sub in ('med', 'sunset') and not LM and not OV.get('style') and PS is None) else None
    bay_kind = {'italianate': 'slant', 'stick': 'square', 'queen': RD.choice('bay', ('slant', 'square')),
                'edwardian': 'square', 'med': 'square' if RD.random('bay') < 0.4 else None,
                'sunset': 'box', 'postwar': 'square' if RD.random('bay', grng) < 0.45 else None}.get(sub)
    if LM: bay_kind = LM['bay']
    if SV:
        x_sv = random.Random(b['gid'] * 709 + 3).random()
        bay_kind = {'spanish': 'barrel' if x_sv < 0.55 else 'square', 'streamline': None,
                    'provincial': 'box' if x_sv < 0.45 else None, 'plain': 'square' if x_sv < 0.3 else None}[SV]
    # the pre-war apartment house: bays stacked up the front, a fire escape
    yr_ = b['year'] or 1950
    if sub == 'apartment' and 1900 <= yr_ < 1945 and storeys >= 3 and rng.random() < 0.88: bay_kind = rng.choice(('square', 'slant', 'square'))
    # the office tower's skin, by its decade: punched stone (pre-war), ribbon
    # windows, glass between piers, or a curtain wall of tinted glass
    fsys = None; gcol = None
    if style == 'block' and (sub == 'tower' or (sub == 'commercial' and b['h'] > 18)):
        trng = random.Random(b['gid'] * 131 + 5); u_ = trng.random(); yr = b['year'] or 1960
        # (24/09: 'piers' was most towers' skin, the pinstripe the critic saw on
        # every one; now spandrel bands, a precast frame and punched stone share it)
        if yr < 1935: fsys = None
        elif yr < 1965: fsys = 'ribbon' if u_ < 0.45 else ('grid' if u_ < 0.7 else None)
        elif yr < 1990: fsys = 'piers' if u_ < 0.25 else ('ribbon' if u_ < 0.45 else ('grid' if u_ < 0.72 else ('curtain' if u_ < 0.87 else None)))
        else: fsys = 'curtain' if u_ < 0.5 else ('grid' if u_ < 0.7 else ('piers' if u_ < 0.85 else 'ribbon'))
        if fsys:
            wall_mat = 'concrete'; body = trng.choice(STONE); gcol = glass_for(yr, trng)
            if fsys == 'ribbon' and trng.random() < 0.35: body = trng.choice(((0.20, 0.21, 0.22), (0.30, 0.26, 0.22), (0.62, 0.64, 0.66)) if yr < 2010 else NEW_PANELS)   # dark or metal spandrels
            if yr >= 2010: body = trng.choice(NEW_PANELS)
        elif wall_mat == 'brick' and trng.random() < 0.5:
            wall_mat = 'concrete'; body = trng.choice(STONE)
        elif sub == 'tower' and trng.random() < 0.6:
            wall_mat = 'concrete'; body = trng.choice(STONE + [(0.74, 0.62, 0.50), (0.66, 0.50, 0.40)])     # punched granite, limestone, terracotta
        H_ = HERO.get(b['gid'])
        if H_: fsys, body, gcol, wall_mat = H_['fsys'], H_['body'], H_['gcol'], 'concrete'
    if FA:     # (FAITHFUL) the photo's colours and material have the last word; bays counted on the photo
        if FA.get('facade_col'): body = hexcol(FA['facade_col'])
        if FA.get('trim_col'): trim = hexcol(FA['trim_col'])
        if FA.get('mat') in ('brick', 'stucco', 'siding', 'concrete'): wall_mat = FA['mat']
        if FA.get('bays') is not None and style != 'block':
            bay_kind = None if int(FA['bays']) == 0 else (FA.get('bay_kind') or bay_kind or 'square')
    ctx = dict(style=style, sub=sub, first=first, fh=fh, nfl=nfl, eave=eave, zg=zg, trim=trim, body=body, nbay=(FA or {}).get('bays'),
               accent=accent, roof=roof, hood=hood, bay=bay_kind, wall_mat=wall_mat, bay_left=LM.get('bay_left'),
               fsys=fsys, gcol=gcol, rd=RD, ground=ground, sv=SV, year=b['year'] or 1950, mull=((0.80, 0.81, 0.82) if (fsys and (b['year'] or 1960) >= 2010) else None))

    # the house's side and back walls (24/09): in SF the street front is the
    # painted one; a party wall standing clear of its neighbour is plain grey
    # or beige stucco, or brown shingle on an old house, and the back is often
    # a plain white or grey — so a row reads as fronts, not as coloured boxes
    sr_ = random.Random(b['gid'] * 661 + 9)
    side_ = back_ = None
    if style in ('vic', 'stucco', 'midcentury') and not LM and sub != 'works':
        x_ = sr_.random()
        # (24/09, integration: plain side walls took the colour out of the
        # view, which looks north onto sides and backs) — the side walls stay
        # plain (no trim, no windows paint) but in the family of the front:
        # its colour 40 % greyer and 10 % darker; a quarter of houses in a
        # real stucco tone instead (beige, warm grey, pale sage, dusty pink)
        fam = tuple(v * 0.9 for v in saturate(body, 0.6))
        if x_ < 0.25:
            if style == 'vic' and sr_.random() < 0.3: side_ = ('siding', sr_.choice(((0.58, 0.48, 0.38), (0.66, 0.56, 0.44), (0.50, 0.42, 0.34))))
            else: side_ = ('stucco', sr_.choice(((0.86, 0.82, 0.72), (0.78, 0.76, 0.72), (0.78, 0.82, 0.74), (0.86, 0.76, 0.74))))
        else: side_ = (wall_mat if wall_mat != 'siding' or sr_.random() < 0.6 else 'stucco', fam)
        back_ = (wall_mat, fam if sr_.random() < 0.5 else body)
        sw_ = BK.side_walls(b, style, wall_mat, fam)          # (BK_SIDE) brown shingle and plain boards on the sides and backs
        if sw_: side_, back_ = sw_
        if FA and FA.get('facade_col'):     # (FAITHFUL) the street photos saw this building's exposed walls: they carry its real paint
            side_, back_ = (wall_mat, body), (wall_mat, body)
    if PS is not None and PS.get('bulkhead', 'beaux') != 'none': ctx['bulk_w'] = bulk_wall(walls)
    # ── walls ──
    for i, w in enumerate(walls):
        role = roles[i]
        if w.L < 0.05: continue
        holes = []
        if role != 2 and w.L > 1.4:
            holes = facade(w, (i == f0 or role == 1) and not b.get('_rear'), b, rng, ctx)
        wmat_, wcol_ = (side_ if (role == 2 and side_) else (back_ if (role == 0 and back_ and i != f0) else (wall_mat, body)))
        w.wall_with_holes(wmat_, 0.0, w.L, zfoot, eave, [h for h in holes if h[0] >= 0], wcol_)
        # corner boards (wood) or quoins (stucco blocks) and a water table
        if role != 2 and LOD >= 2 and wall_mat == 'siding' and FINE:
            w.box('trim', -0.02, 0.28, first - raised, eave, 0.0, 0.06, trim); w.box('trim', w.L - 0.28, w.L + 0.02, first - raised, eave, 0.0, 0.06, trim)
        elif role != 2 and LOD >= 2 and wall_mat == 'siding':
            w.rect('trim', 0.0, 0.2, first - raised, eave, 0.03, trim); w.rect('trim', w.L - 0.2, w.L, first - raised, eave, 0.03, trim)
        if role != 2 and LOD < 2:
            if wall_mat == 'siding':
                w.box('trim', 0.0, 0.16, first - raised, eave, 0.0, 0.05, trim)
                w.box('trim', w.L - 0.16, w.L, first - raised, eave, 0.0, 0.05, trim)
            w.box('trim' if wall_mat == 'siding' else 'concrete', -0.02, w.L + 0.02, zfoot, zg + 0.35, 0.0, 0.06, (0.55, 0.53, 0.50))
        # gable end: the wall above the eave follows the roof
        if roof in ('gable', 'hip'):
            pts = [0.0, w.L]
            ua, ub = w.a.dot(ax_u), w.b.dot(ax_u)
            if (ua - uc) * (ub - uc) < 0: pts.insert(1, w.L * (uc - ua) / (ub - ua))
            tops = [rz(w.P(u, 0)) for u in pts]
            if max(tops) > eave + 0.05:
                gmat = 'shingle' if (i == f0 and style == 'vic' and not stripped) else wmat_
                gp = [w.P(0.0, eave), w.P(w.L, eave)] + [w.P(u, t) for u, t in list(zip(pts, tops))[::-1]]
                # the gable's shingles in the accent on a narrow house; on a wide
                # one (a church, a hall) a whole triangle of it read as a paint
                # error from the air — there it is the body, a shade toward it
                gcol_ = (mix(body, accent, 0.18) if LM else (accent if w.L < 8.5 else mix(body, accent, 0.22)))
                out.poly(gmat, gp, gcol_ if gmat == 'shingle' else wcol_)
                if i == f0 and style == 'vic' and not stripped:
                    w.box('trim', -0.25, w.L + 0.25, eave - (0.2 if FINE else 0.1), eave + 0.18, 0.0, 0.42 if FINE else 0.35, trim)
                    apex = max(tops); um = pts[1] if len(pts) == 3 else w.L / 2
                    if FINE and len(pts) == 3 and apex - eave > 1.0:
                        # (25/09, level 9) the bargeboards: a broad light board
                        # down each rake of the front gable, under the roof's edge
                        for (ua, za), (ub, zb_) in (((pts[0], tops[0]), (pts[1], tops[1])), ((pts[1], tops[1]), (pts[2], tops[2]))):
                            sl = (zb_ - za) / (ub - ua) if abs(ub - ua) > 1e-6 else 0.0
                            if ua == pts[0]: ua, za = ua - 0.35, za - 0.35 * sl
                            if ub == pts[2]: ub, zb_ = ub + 0.35, zb_ + 0.35 * sl
                            out.poly('trim', [w.P(ua, za + 0.04, 0.34), w.P(ub, zb_ + 0.04, 0.34), w.P(ub, zb_ - 0.3, 0.34), w.P(ua, za - 0.3, 0.34)], trim)
                            out.poly('trim', [w.P(ua, za - 0.3, 0.34), w.P(ub, zb_ - 0.3, 0.34), w.P(ub, zb_ - 0.3, 0.1), w.P(ua, za - 0.3, 0.1)], mix(trim, (0.4, 0.4, 0.4), 0.25))
                    if apex - eave > 2.2:
                        w.box('glass', um - 0.4, um + 0.4, eave + 0.5, eave + 1.5, 0.02, 0.05, (1, 1, 1))
                        w.box('trim', um - 0.5, um + 0.5, eave + 0.4, eave + 0.5, 0.0, 0.1, trim)
                        w.box('trim', um - 0.5, um + 0.5, eave + 1.5, eave + 1.62, 0.0, 0.1, trim)
                        # a sunburst: thin boards fanning from the attic window's head,
                        # each one a slim strip in the gable plane, stopped short of the rake
                        zc = eave + 1.62
                        for k in range(9 if LOD < 2 else 0):
                            ang = math.radians(12 + k * 19.5)
                            ca, sa = math.cos(ang), math.sin(ang)
                            L_ = 1.25
                            while L_ > 0.4 and zc + sa * L_ > rz(w.P(um + ca * L_, 0)) - 0.25: L_ -= 0.1
                            if L_ <= 0.4: continue
                            r0, hw_ = 0.55, 0.035
                            p0 = (um + ca * r0, zc + sa * r0); p1 = (um + ca * L_, zc + sa * L_)
                            out.poly('trim', [w.P(p0[0] + sa * hw_, p0[1] - ca * hw_, 0.03), w.P(p1[0] + sa * hw_, p1[1] - ca * hw_, 0.03),
                                              w.P(p1[0] - sa * hw_, p1[1] + ca * hw_, 0.03), w.P(p0[0] - sa * hw_, p0[1] + ca * hw_, 0.03)], trim)
        else:
            w.rect(wall_mat, 0.0, w.L, eave, top + 0.05, 0.0, body)
        # the back of a house: a wooden deck and stair down to the yard
        if role == 0 and style in ('vic', 'stucco', 'midcentury') and w.L > 4.0 and LOD == 0 and rng.random() < 0.55 and first - zg > 0.8:
            rear_deck(w, rng.uniform(0.4, max(0.5, w.L - 3.6)), first, zg, trim, rng)
        # (24/09) the city's LOD: the backs were bare boxes; now stacked decks
        # and their stairs, or an enclosed back porch built out
        if role == 0 and i != f0 and style in ('vic', 'stucco', 'midcentury') and not LM and sub != 'works' and LOD >= 1 and w.L > 4.0:
            rear_kit(w, b, first, fh, nfl, eave, zg, trim, wmat_, wcol_)

    # ── the pier shed's bulkhead on the Embarcadero ──
    if PS is not None and ctx.get('bulk_w') is not None:
        bulkhead(ctx['bulk_w'], PS, zg, top, ctx)

    # ── the corner turret of a Queen Anne ──
    if sub == 'queen' and corner and rng.random() < 0.65 and LM.get('turret', True):
        others = [i for i in range(n) if i != f0 and roles[i] in (1, 3) and walls[i].L > 3.0]
        j = others[0]
        # the corner shared by the front and that street wall
        cpt = walls[f0].a if (walls[j].b - walls[f0].a).length < 0.5 else walls[f0].b
        turret(cpt, (walls[f0].n + walls[j].n).normalized(), first, eave, top, trim, body, accent, rng, out)

    # ── cornice on the street wall ──
    wf = walls[f0]
    if roof == 'flat' and not b.get('_rear'):
        proj = {'vic': 0.75, 'stucco': 0.4, 'block': 0.5, 'midcentury': 0.2}[style]
        if sub == 'works': proj = 0.12                      # a plain coping on a works parapet
        ctop = top + (1.0 if style == 'vic' else 0.3)          # a false front rises past the roof
        # (25/09, level 9) the Italianate false front: a taller screen that hides
        # the roof from the street, its bracketed cornice over a light frieze
        if style == 'vic' and FINE: ctop = top + 1.6; proj = 0.9
        if style == 'vic': wf.rect('siding', 0.0, wf.L, top, ctop, 0.0, body)
        if style == 'vic' and FINE:
            wf.rect('trim', 0.0, wf.L, ctop - 1.75, ctop - 1.15, 0.03, trim)          # the frieze
            wf.box('trim', -0.05, wf.L + 0.05, ctop - 1.85, ctop - 1.75, 0.0, 0.14, trim)   # its bed moulding
        # (25/09) the tiled coping on a third of the 1920s-40s fronts, not on
        # every one: from the air the Sunset's rows are white and grey
        # parapets with a red tile pent here and there (drone, Parkside 2018),
        # not a red line down every avenue; the rest a plain stucco coping
        med_tile = sub == 'med' and RD.random('coping', random.Random(b['gid'] * 613 + 29)) < 0.33
        if SV: med_tile = SV == 'spanish'
        if SV == 'streamline':
            # the eyebrow over the living-room windows and the speed lines under the parapet
            zeb = first + fh - 0.3
            wf.box('trim', 0.25, wf.L - 0.25, zeb, zeb + 0.09, 0.0, 0.6, trim)
            for zz in (top - 0.45, top - 0.7): wf.rect('trim', 0.0, wf.L, zz, zz + 0.07, 0.012, mix(body, (0.3, 0.3, 0.3), 0.25))
        if SV == 'provincial':
            pr_ = random.Random(b['gid'] * 811 + 5)
            front_pent(wf, top, trim, body, out, pr_)
        elif (sub == 'med' or SV) and not med_tile:
            wf.box('trim', -0.06, wf.L + 0.06, top - 0.05, ctop, 0.0, 0.16, trim)
        elif sub == 'med' or SV:
            # a tiled coping over the parapet, pitched out
            a0, a1 = wf.P(-0.2, top + 0.1, 0.45), wf.P(wf.L + 0.2, top + 0.1, 0.45)
            b0, b1 = wf.P(-0.2, top + 0.55, -0.15), wf.P(wf.L + 0.2, top + 0.55, -0.15)
            out.poly('roof_tile', [a0, a1, b1, b0], (1, 1, 1))
        elif style != 'midcentury':
            wf.box('trim', -0.1, wf.L + 0.1, ctop - 0.45, ctop, 0.0, proj, trim)
            wf.box('trim', -0.05, wf.L + 0.05, ctop - 0.62, ctop - 0.45, 0.0, proj * 0.5, trim)
            # (24/09) the pre-war apartment block's cornice, heavy and wrapping
            # every street wall: a deep crown over a frieze, the low sun's
            # longest shadow line on the block
            if style == 'block' and sub in ('apartment', 'commercial') and (b['year'] or 1950) < 1940 and LOD >= 1 and not fsys:
                for j_ in fronts:
                    wj = walls[j_]
                    if wj.L < 2.0: continue
                    wj.box('trim', -0.3, wj.L + 0.3, ctop - 0.5, ctop + 0.05, 0.0, 0.95, trim)
                    wj.box('trim', -0.05, wj.L + 0.05, ctop - 1.35, ctop - 0.5, 0.0, 0.14, mix(trim, body, 0.35))
            if (style == 'vic' or sub == 'edwardian') and (LOD < 2 or FINE) and not stripped:
                # brackets (at level 9 too: their row of shadows under the crown
                # is the flat-front Victorian's signature, ~8-11 px apart)
                for uu in frange(0.2, wf.L - 0.2, 0.7 if sub == 'italianate' else 1.0):
                    bw_ = 0.1 if FINE else 0.08
                    wf.box('trim', uu - bw_, uu + bw_, ctop - 1.15, ctop - 0.45, 0.0, proj * 0.8, trim)
                # dentils under the cornice (22 cm apart: below level 9's pixel, left out there)
                if sub in ('italianate', 'edwardian') and LOD < 2:
                    for uu in frange(0.1, wf.L - 0.1, 0.22):
                        wf.box('trim', uu - 0.05, uu + 0.05, ctop - 0.75, ctop - 0.62, 0.0, 0.12, trim)
    elif style == 'vic':
        wf.box('trim', -0.1, wf.L + 0.1, eave - 0.35, eave - 0.1, 0.0, 0.22, trim)

    # ── roof ──
    if roof in ('gable', 'hip'):
        oring = offset_ring(ring, 0.35)
        pts2 = [Vector((x, y, 0)) for x, y in oring]
        tris = tessellate_polygon([pts2])
        f = lambda p: p.dot(ax_u) - uc
        if roof == 'hip':
            # the hip's creases: four diagonals from the corners, and the ridge
            fs_ = [lambda p: (p.dot(ax_u) - umin) - (p.dot(ax_v) - vmin), lambda p: (p.dot(ax_u) - umin) - (vmax - p.dot(ax_v)),
                   lambda p: (umax - p.dot(ax_u)) - (p.dot(ax_v) - vmin), lambda p: (umax - p.dot(ax_u)) - (vmax - p.dot(ax_v)),
                   (lambda p: p.dot(ax_v) - vc) if (umax - umin) >= (vmax - vmin) else (lambda p: p.dot(ax_u) - uc)]
            def split_all(tri):
                parts = [tri]
                for g_ in fs_: parts = [q for t_ in parts for q in split_tri(t_, g_)]
                return parts
        rc_ = roof_colour(b, rng) if roof_mat == 'roof_shingle' else rng.choice(TILE_TINTS)
        roof_mat, rc_ = measured_pitched(b, roof_mat, rc_)     # ROOFS: the measured roof, if any
        if OV.get('roof_col'): rc_ = hexcol(OV['roof_col'])
        for t in tris:
            for tri in (split_tri([pts2[k].copy() for k in t], f) if roof == 'gable' else split_all([pts2[k].copy() for k in t])):
                top_ = [Vector((p.x, p.y, rz(p) + 0.05)) for p in tri]
                out.poly(roof_mat, top_, rc_)
        # the ridge cap along the top
        ovs = [Vector((x, y, 0)).dot(ax_v) for x, y in oring]
        r0 = ax_u * uc + ax_v * min(ovs); r1 = ax_u * uc + ax_v * max(ovs)
        zr = rz(r0) + 0.05
        o_ = Vector((r0.x, r0.y, zr)) - ax_u * 0.14
        if roof == 'gable': out.box3(roof_mat, o_, ax_v * (max(ovs) - min(ovs)), ax_u * 0.28, Vector((0, 0, 0.12)), tuple(c * 0.85 for c in rc_))
        if style == 'vic' and rng.random() < 0.8:
            vpos = min(vs) + (max(vs) - min(vs)) * rng.uniform(0.3, 0.7)
            upos = uc + (hw * 0.55) * (1 if rng.random() < 0.5 else -1)
            base = ax_u * upos + ax_v * vpos
            zc = rz(base) + rng.uniform(0.8, 1.4)
            o = Vector((base.x, base.y, eave)) - ax_u * 0.35 - ax_v * 0.45
            out.box3('chimney', o, ax_u * 0.7, ax_v * 0.9, Vector((0, 0, zc - eave)), (1, 1, 1))
            out.box3('trim', o - ax_u * 0.06 - ax_v * 0.06 + Vector((0, 0, zc - eave - 0.15)), ax_u * 0.82, ax_v * 1.02, Vector((0, 0, 0.18)), (0.55, 0.52, 0.48))
        for i in range(len(oring)):
            a, c = Vector((*oring[i], 0)), Vector((*oring[(i + 1) % len(oring)], 0))
            za, zc = rz(a) + 0.05, rz(c) + 0.05
            out.poly('trim', [Vector((a.x, a.y, za - 0.22)), Vector((c.x, c.y, zc - 0.22)), Vector((c.x, c.y, zc)), Vector((a.x, a.y, za))], trim)
    elif roof in ('saw', 'barrel'):
        rc_ = measured_flat(b, flat_roof(b, rng, ax_u))
        works_roof(roof, ring, top, ax_u, ax_v, rc_, ctx, out)
    else:
        deck = top - 0.55
        inner = offset_ring(ring, -0.28)
        # a big flat roof (a shed, a block) reads as an even membrane from the
        # air, a few large repairs: its own material, the patches halved
        rmat_ = 'roof_big' if abs(ring_area(ring)) > 1500 else 'roof_flat'
        pts2 = [Vector((x, y, deck)) for x, y in inner]
        rc_ = flat_roof(b, rng, ax_u)
        rc_ = measured_flat(b, rc_)                            # ROOFS: the measured roof, if any
        if OV.get('roof_col'): rc_ = (*hexcol(OV['roof_col']), rc_[3] if len(rc_) > 3 else 0.5)
        for t in tessellate_polygon([pts2]):
            out.poly(rmat_, [pts2[k] for k in t], rc_)
        # the parapet: its inner face flashed with the roof's own membrane, a
        # coping on top (sheet metal; painted wood on a Victorian)
        cap_mat, cap_col = ('trim', trim) if style == 'vic' else ('metal', rng.choice(((0.50, 0.50, 0.49), (0.58, 0.57, 0.55), (0.42, 0.42, 0.42))))
        for i in range(n):
            a, c = Vector((*ring[i], 0)), Vector((*ring[(i + 1) % n], 0))
            ia, ic = Vector((*inner[i], 0)), Vector((*inner[(i + 1) % n], 0))
            out.poly(rmat_, [Vector((ic.x, ic.y, deck)), Vector((ia.x, ia.y, deck)), Vector((ia.x, ia.y, top - 0.02)), Vector((ic.x, ic.y, top - 0.02))], rc_)
            # (BK_CAP) on the side and back walls the roof's coating wraps over the parapet: no light outline
            cm_, cc_ = (cap_mat, cap_col) if (not BK.CAP or roles[i] in (1, 3) or style == 'block' and roles[i] != 2) else (rmat_, rc_)
            out.poly(cm_, [Vector((a.x, a.y, top + 0.05)), Vector((c.x, c.y, top + 0.05)), Vector((ic.x, ic.y, top + 0.05)), Vector((ia.x, ia.y, top + 0.05))], cc_)
            out.poly(cm_, [Vector((ic.x, ic.y, top - 0.02)), Vector((ia.x, ia.y, top - 0.02)), Vector((ia.x, ia.y, top + 0.05)), Vector((ic.x, ic.y, top + 0.05))], cc_)
        roof_kit(ring, inner, deck, top, b, rng, out, dict(ctx, rc=rc_, roles=roles, storeys=storeys, ax_u=ax_u, ax_v=ax_v))
        # a roof deck on about one flat-roofed house in five (at the city's LOD roof_kit lays it)
        if style in ('vic', 'stucco', 'midcentury') and rng.random() < 0.2 * EA.rel('deck', ERA) and LOD == 0:
            cx = sum(p[0] for p in ring) / n; cy = sum(p[1] for p in ring) / n
            d0 = Vector((cx, cy, deck + 0.12)) - ax_u * 1.6 - ax_v * 1.6
            out.box3('deck', d0, ax_u * 3.2, ax_v * 3.2, Vector((0, 0, 0.12)), (0.62, 0.48, 0.34))
            for (du, dv, lu, lv) in ((0, 0, 3.2, 0.05), (0, 3.15, 3.2, 0.05), (0, 0, 0.05, 3.2), (3.15, 0, 0.05, 3.2)):
                if LOD >= 1: continue
                out.box3('metal', d0 + ax_u * du + ax_v * dv + Vector((0, 0, 1.12)), ax_u * lu, ax_v * lv, Vector((0, 0, 0.05)), (0.15, 0.15, 0.16))
                for k in range(5):
                    t_ = k / 4
                    out.box3('metal', d0 + ax_u * (du + lu * t_ * (lu > 1)) + ax_v * (dv + lv * t_ * (lv > 1)) + Vector((0, 0, 0.12)), ax_u * 0.05, ax_v * 0.05, Vector((0, 0, 1.0)), (0.15, 0.15, 0.16))


# (25/09) THE ROWS' SHARED WALLS: DataSF footprints of a row stand 0.1-1.5 m
# apart where the houses touch; the slots drew each house as a separate box.
# qipu-render-work/rows/party_gaps.py gives, per low-rise house, the edges
# facing a neighbour and the outward offset that closes the slot
PARTY_FILE = '/Users/daniel/code/qipu-render-work/rows/party_gaps.json'
def _load_party():
    import os, json
    if os.environ.get('PARTY_CLOSE', '1') != '1' or not os.path.exists(PARTY_FILE): return {}
    return json.load(open(PARTY_FILE))['gaps']
PARTY_G = _load_party()


# (25/09) THE BUILDERS' ROWS: SF's houses went up in runs — a builder put the
# same house on several lots (the 1880s-90s speculators, the Doelgers and
# Gallis of the Sunset and Parkside, the Richmond and Excelsior tract builders).
# qipu-render-work/rows/builder_rows.py finds them (next-door, same year +-1,
# same height +-1 m, same frontage and lot width, LiDAR tops alike): per gid
# [row, idx, n, kind, h, st, year]. A run shares its massing (the run's
# median height, storeys and year), its variant, roof, bay (kind and side),
# raised floor and garage, entry side, cladding and cornice; each house keeps
# its own paint, trim, door and window draws. ROWS=0 = each house on its own.
ROWS_FILE = '/Users/daniel/code/qipu-render-work/rows/builder_rows.json'
def _load_rows():
    import os, json
    if os.environ.get('ROWS', '1') != '1' or not os.path.exists(ROWS_FILE): return {}
    return {int(g): v for g, v in json.load(open(ROWS_FILE))['rows'].items() if len(v) >= 7}
ROW_G = _load_rows()


class RowDraw:
    """the draws a builder's run shares: each keyed draw comes from the run's
    own seed. The house's own rng is still drawn, the same way, and the value
    thrown away: its paint, trim, door, window and blind draws stay exactly
    the ones it had on its own (the run changes the plan, not the paint job).
    A house outside a run draws from its own rng as it always did."""
    MIRROR = {'v': 0.2, 'e': 0.25, 'm': 0.5, 'p': 0.5}   # runs built in mirrored pairs: the tract builders' paired garages
    def __init__(self, rp, rng):
        self.rp, self.rng = rp, rng
        self.k = {}
    def _u(self, key):
        if key not in self.k: self.k[key] = random.Random(f'{self.rp[0]}:{key}').random()
        return self.k[key]
    def random(self, key, rng=None):
        v = (rng or self.rng).random()
        return self._u(key) if self.rp else v
    def choice(self, key, seq, rng=None):
        v = (rng or self.rng).choice(seq)
        return seq[min(len(seq) - 1, int(self._u(key) * len(seq)))] if self.rp else v
    def uniform(self, key, a, b, rng=None):
        v = (rng or self.rng).uniform(a, b)
        return a + (b - a) * self._u(key) if self.rp else v
    def side(self, key, rng=None):
        """a left/right choice: the run's, mirrored house by house on a run
        built in mirrored pairs (half the tract rows, a fifth of the older ones)"""
        v = (rng or self.rng).random() < 0.5
        if not self.rp: return v
        v = self._u(key) < 0.5
        return (not v) if (self._u('mirror') < self.MIRROR.get(self.rp[3], 0.25) and self.rp[1] % 2) else v
def close_party(r, offs):
    """the ring (record order) with its facing edges pushed out by their offsets"""
    if not offs: return r
    n = len(r); a2 = sum(r[k][0] * r[(k + 1) % n][1] - r[(k + 1) % n][0] * r[k][1] for k in range(n)); s = 1.0 if a2 > 0 else -1.0
    nm = []
    for k in range(n):
        (x0, y0), (x1, y1) = r[k], r[(k + 1) % n]; L = math.hypot(x1 - x0, y1 - y0) or 1.0
        nm.append((s * (y1 - y0) / L, -s * (x1 - x0) / L))
    off = {int(k): o for k, o in offs if int(k) < n}
    out = []
    for v in range(n):
        e0, e1 = (v - 1) % n, v
        o0, o1 = off.get(e0, 0.0), off.get(e1, 0.0)
        if nm[e0][0] * nm[e1][0] + nm[e0][1] * nm[e1][1] > 0.9:     # a straight run split in two: one move
            o = max(o0, o1); out.append((r[v][0] + nm[e1][0] * o, r[v][1] + nm[e1][1] * o)); continue
        out.append((r[v][0] + nm[e0][0] * o0 + nm[e1][0] * o1, r[v][1] + nm[e0][1] * o0 + nm[e1][1] * o1))
    return out


def ring_area(r):
    n = len(r); return sum(r[i][0] * r[(i + 1) % n][1] - r[(i + 1) % n][0] * r[i][1] for i in range(n)) / 2


def inset_ok(r, q):
    """an inset ring still the plan's shape: every edge runs the way its
    original ran, no edge collapsed, and some area left"""
    n = len(r)
    for i in range(n):
        e0 = Vector(r[(i + 1) % n]) - Vector(r[i]); e1 = Vector(q[(i + 1) % n]) - Vector(q[i])
        if e0.length > 0.3 and e0.dot(e1) <= 0.05 * e0.length ** 2: return False
    return ring_area(q) > 0.12 * ring_area(r)


def prism(out, mat, q, z0, z1, col, cap=None, capcol=None):
    """walls round ring q from z0 to z1, and a flat cap (cap: its material)"""
    n = len(q)
    for i in range(n):
        a, c_ = q[i], q[(i + 1) % n]
        out.poly(mat, [Vector((a[0], a[1], z0)), Vector((c_[0], c_[1], z0)), Vector((c_[0], c_[1], z1)), Vector((a[0], a[1], z1))], col)
    if cap:
        pts = [Vector((x, y, z1)) for x, y in q]
        for t in tessellate_polygon([pts]): out.poly(cap, [pts[k] for k in t], capcol)


def tower_top(kind, ring, deck, top, b, r, out, c):
    """a tower's top that follows its plan. False when the plan will not take
    it (a caller then draws one of the old kinds)"""
    wm, body, rc = c['wall_mat'] or 'concrete', c['body'], c['rc']
    gc = c.get('gcol') or (0.22, 0.24, 0.26, 0.3); fh = c.get('fh', 3.8)
    n = len(ring); dark = r.choice(((0.46, 0.46, 0.45), (0.56, 0.56, 0.54), (0.64, 0.64, 0.62), mix(body, (0.5, 0.5, 0.5), 0.3)))
    if kind == 'setback':
        # one to three tiers, each set in from the one below, a glass band
        # round each, the last carrying a louvred screen
        z = top; q = ring; d_ = 0.0
        for t in range(r.choice((1, 2, 2, 3))):
            d_ += r.uniform(1.6, 3.2); q2 = offset_ring(ring, -d_)
            if not inset_ok(ring, q2): break
            h = fh * r.choice((1, 1, 2))
            prism(out, wm, q2, deck, z + h, body, cap='roof_flat', capcol=rc)
            prism(out, 'curtain_wall', offset_ring(q2, 0.03), z + h * 0.25, z + h * 0.8, gc)
            q = q2; z = z + h
        if q is ring: return False
        q3 = offset_ring(ring, -(d_ + r.uniform(1.2, 2.5)))
        if inset_ok(ring, q3): prism(out, 'metal', q3, z, z + r.uniform(2.6, 3.8), dark, cap='equip', capcol=(0.62, 0.62, 0.60))
        return True
    if kind == 'ring':
        # a louvred screen round the plan, set in: the mechanical floor's
        # band on so many 1960s-80s towers; inside, the cooling cells
        q = offset_ring(ring, -r.uniform(1.0, 2.6))
        if not inset_ok(ring, q): return False
        h = r.uniform(3.8, 6.0)
        dark = r.choice((mix(body, (0.5, 0.5, 0.5), 0.3), (0.62, 0.62, 0.60), (0.56, 0.56, 0.54), body))   # louvres: light metal or the wall's own tone
        prism(out, 'metal', q, deck, top + h, dark)
        prism(out, 'metal', offset_ring(q, -0.15)[::-1], deck, top + h, mix(dark, (0, 0, 0), 0.12))
        return 'more'
    if kind == 'glass':
        # the wall's glass run up past the roof, an open crown
        h = r.uniform(2.5, 5.0)
        prism(out, 'curtain_wall', offset_ring(ring, 0.02), top - 0.6, top + h, gc)
        prism(out, 'metal', offset_ring(ring, -0.25)[::-1], deck, top + h, (0.62, 0.62, 0.60))     # its back: light framing, not a black band
        prism(out, 'metal', offset_ring(ring, 0.02), top + h, top + h + 0.08, (0.66, 0.66, 0.64))
        return 'more'
    # 'stepped' and 'pyramid' need a plan close to its rectangle
    ax = Vector((ring[1][0] - ring[0][0], ring[1][1] - ring[0][1]))
    best = None
    for i in range(n):
        e = Vector((ring[(i + 1) % n][0] - ring[i][0], ring[(i + 1) % n][1] - ring[i][1]))
        if best is None or e.length > best.length: best = e
    au = best.normalized(); av = Vector((-au.y, au.x))
    us = [x * au.x + y * au.y for x, y in ring]; vs = [x * av.x + y * av.y for x, y in ring]
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    if ring_area(ring) < 0.85 * (u1 - u0) * (v1 - v0): return False
    P = lambda u, v, z: Vector((au.x * u + av.x * v, au.y * u + av.y * v, z))
    if kind == 'stepped':
        # a ziggurat of three to five steps, each a storey-ish, set in fast
        ns = r.randint(3, 5); d0 = r.uniform(1.2, 2.2); z = top
        for k in range(ns):
            dd = d0 * (k + 1); hh = r.uniform(2.2, 3.6)
            if u1 - u0 - 2 * dd < 3 or v1 - v0 - 2 * dd < 3: break
            q = [(p.x, p.y) for p in (P(u0 + dd, v0 + dd, 0), P(u1 - dd, v0 + dd, 0), P(u1 - dd, v1 - dd, 0), P(u0 + dd, v1 - dd, 0))]
            prism(out, wm, q, deck, z + hh, body, cap='roof_flat', capcol=rc)
            if k == 0: prism(out, 'curtain_wall', offset_ring(q, 0.03), z + hh * 0.3, z + hh * 0.8, gc)
            z += hh
        return True
    # 'pyramid': a hipped cap over the plan's rectangle, set in a little, of
    # dark standing-seam metal, verdigris copper now and then, or glass
    dd = r.uniform(0.6, 1.4); ua, ub, va, vb = u0 + dd, u1 - dd, v0 + dd, v1 - dd
    if ub - ua < 6 or vb - va < 6: return False
    prism(out, wm, [(p.x, p.y) for p in (P(ua, va, 0), P(ub, va, 0), P(ub, vb, 0), P(ua, vb, 0))], deck, top + 0.8, body)
    rise = min(ub - ua, vb - va) * r.uniform(0.32, 0.6); z0 = top + 0.8
    x_ = r.random(); col = (0.42, 0.56, 0.50) if x_ < 0.2 else ((0.22, 0.22, 0.23) if x_ < 0.7 else (0.52, 0.50, 0.47))
    mat = 'curtain_wall' if r.random() < 0.2 else 'metal'
    if mat == 'curtain_wall': col = gc
    half = min(ub - ua, vb - va) / 2; rl = (ub - ua) / 2 - half      # a ridge along the long side
    rv = (vb - va) / 2 - half
    um, vm = (ua + ub) / 2, (va + vb) / 2; zt = z0 + rise
    A, B_ = P(um - rl, vm - rv, zt), P(um + rl, vm + rv, zt)
    c0, c1, c2, c3 = P(ua, va, z0), P(ub, va, z0), P(ub, vb, z0), P(ua, vb, z0)
    if rl >= rv: F_ = ([c0, c1, B_, A], [c1, c2, B_], [c2, c3, A, B_], [c3, c0, A])
    else: F_ = ([c0, c1, A], [c1, c2, B_, A], [c2, c3, B_], [c3, c0, A, B_])
    for f_ in F_: out.poly(mat, [v for k_, v in enumerate(f_) if k_ == 0 or (v - f_[k_ - 1]).length > 1e-3], col)
    return True
def construction(b, ground, out):
    """a building going up (era.rising, era.construction_stage): the site and
    its foundation, then the frame — floor slabs on columns round a core that
    leads it — rising to the record's height, the cladding a few floors
    behind, a tower crane on the core. CONVENTION on the form (the period's
    usual sequence); the footprint, height and completion year are the
    record's. Steel frames before 1960, concrete frames after (CONVENTION)."""
    rng = random.Random(b['gid'] * 613 + 5)
    ring, _ = ring_ccw([tuple(p) for p in b['ring']])
    n = len(ring)
    if n < 3: return
    zs = [ground(x, y) for x, y in ring]; zg = sum(zs) / n; zfoot = min(zs) - 0.6
    fr, cl = EA.construction_stage(b['rise'])
    H = max(4.0, b['h']); hf = H * fr; hc = min(hf - 8.0, H * cl) if fr > 0 else 0.0
    cx = sum(p[0] for p in ring) / n; cy = sum(p[1] for p in ring) / n
    X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    yr = b.get('year') or 1970
    steel = yr < 1960
    fcol = (0.42, 0.30, 0.22) if steel else (0.62, 0.61, 0.58)          # red-primed steel / raw concrete
    # (25/09 eras2: one grammar for every size) under 20 m the SHORT FORM: a
    # light wood frame (pale timber, platform framing floor by floor, studs
    # every ~1.2 m drawn as posts every 2.4 m), then plywood sheathing
    # following it, no core, no crane (CONVENTION on the form and colours)
    small = b['h'] < 20.0
    if small: fcol = (0.80, 0.68, 0.48)
    # the site: excavated ground, the foundation mat
    pts = [Vector((x, y, zg + 0.05)) for x, y in offset_ring(ring, -0.2)]
    for t in tessellate_polygon([pts]): out.poly('concrete', [pts[k] for k in t], (0.46, 0.42, 0.36) if fr <= 0 else (0.58, 0.57, 0.54))
    # a site fence along the lot line
    for i in range(n):
        a_, c_ = Vector((*ring[i], zfoot)), Vector((*ring[(i + 1) % n], zfoot))
        out.poly('metal', [a_, c_, c_ + Z * (zg - zfoot + 2.4), a_ + Z * (zg - zfoot + 2.4)], (0.30, 0.34, 0.30))
    if hf > 0.5:
        inner = offset_ring(ring, -0.6)
        fh = 3.9 if b['h'] > 30 else (3.0 if small else 3.4)
        z = zg + fh
        while z <= zg + hf + 0.01:
            P0 = [Vector((x, y, z - 0.3)) for x, y in inner]; P1 = [Vector((x, y, z)) for x, y in inner]
            for t in tessellate_polygon([P1]): out.poly('concrete', [P1[k] for k in t], fcol)
            for i in range(len(inner)):
                j = (i + 1) % len(inner)
                out.poly('concrete', [P0[i], P0[j], P1[j], P1[i]], tuple(c * 0.8 for c in fcol))
            z += fh
        # columns along the edge, every ~8 m
        for i in range(len(inner)):
            A, C = Vector((*inner[i], 0)), Vector((*inner[(i + 1) % len(inner)], 0))
            L_ = (C - A).length
            sp_, cw_ = (2.4, 0.18) if small else (8.0, 0.4)
            for k in range(max(1, int(L_ / sp_))):
                q = A + (C - A) * (k / max(1, int(L_ / sp_)))
                out.box3('concrete', Vector((q.x - cw_, q.y - cw_, zg)), X * 2 * cw_, Y * 2 * cw_, Z * hf, fcol)
        # the core, a storey or two ahead of the floors
        area = abs(sum(ring[i][0] * ring[(i + 1) % n][1] - ring[(i + 1) % n][0] * ring[i][1] for i in range(n))) / 2
        cs = max(5.0, min(16.0, math.sqrt(area) * 0.3))
        if not small: out.box3('concrete', Vector((cx - cs / 2, cy - cs / 2, zg)), X * cs, Y * cs, Z * min(H, hf + 6.0), (0.66, 0.65, 0.62))
        # the cladding, following the frame
        if small: hc = H * cl                                      # the sheathing follows the frame closely
        if hc > 1.0:
            gcol = rng.choice(GLASS_TINTS) if yr >= 1985 else rng.choice(STONE)
            mat = 'curtain_wall' if yr >= 1985 else 'concrete'
            if small: gcol, mat = (0.72, 0.62, 0.47), 'concrete'           # plywood sheathing
            for i in range(n):
                a_, c_ = Vector((*ring[i], zfoot)), Vector((*ring[(i + 1) % n], zfoot))
                out.poly(mat, [a_, c_, c_ + Z * (zg - zfoot + hc), a_ + Z * (zg - zfoot + hc)], gcol)
    # before the 1950s a steel frame was raised by guy derricks standing on
    # its top floor — a mast and a long boom, no tower crane (CONVENTION on
    # the date; the tower crane spread in American building from the 1950s-60s)
    if b['h'] >= 25 and b['rise'] < 0.97 and yr < 1955 and hf > 2.0:
        dcol = (0.20, 0.17, 0.14)
        for q_ in range(1 + (b['h'] > 60)):
            mx, my = cx + rng.uniform(-6, 6), cy + rng.uniform(-6, 6); z0 = zg + hf
            out.box3('metal', Vector((mx - 0.35, my - 0.35, z0)), X * 0.7, Y * 0.7, Z * 16.0, dcol)          # the mast
            ang = rng.uniform(0, 2 * math.pi); u = Vector((math.cos(ang), math.sin(ang), 0))
            bl = 20.0; up = math.radians(rng.uniform(30, 60))
            d_ = u * math.cos(up) + Z * math.sin(up); w_ = Vector((-u.y, u.x, 0)) * 0.5
            p0 = Vector((mx, my, z0 + 1.0)); p1 = p0 + d_ * bl
            out.poly('metal', [p0 - w_, p1 - w_ * 0.4, p1 + w_ * 0.4, p0 + w_], dcol)                        # the boom
            out.poly('metal', [p0 - w_ + Z * 0.5, p1 - w_ * 0.4 + Z * 0.5, p1 + w_ * 0.4 + Z * 0.5, p0 + w_ + Z * 0.5], dcol)
    # the tower crane: a lattice mast (drawn solid) past the frame, a jib
    # and a counter-jib, in the usual yellow (CONVENTION)
    if b['h'] >= 25 and b['rise'] < 0.97 and yr >= 1955:
        top = zg + max(hf, 0.0) + 14.0
        ccol = (0.86, 0.66, 0.10)
        mx, my = cx + rng.uniform(-3, 3), cy + rng.uniform(-3, 3)
        out.box3('metal', Vector((mx - 0.9, my - 0.9, zg)), X * 1.8, Y * 1.8, Z * (top - zg), ccol)
        ang = rng.uniform(0, 2 * math.pi); u = Vector((math.cos(ang), math.sin(ang), 0)); v = Vector((-u.y, u.x, 0))
        o = Vector((mx, my, top)) - u * 14.0 - v * 0.7
        out.box3('metal', o, u * (14.0 + min(60.0, 25 + b['h'] * 0.15)), v * 1.4, Z * 1.6, ccol)
        out.box3('concrete', Vector((mx, my, top - 2.0)) - u * 13.0 - v * 1.2, u * 5.0, v * 2.4, Z * 2.0, (0.55, 0.55, 0.53))    # counterweights
        out.box3('metal', Vector((mx - 1.0, my - 1.0, top + 1.6)), X * 2.0, Y * 2.0, Z * 5.0, ccol)                           # the apex


def ruin(b, ground, out):
    """the burned district in the days after 18-21 April 1906, on the record's
    footprint (era.py: the ring is DataSF ff3a-iqhv). SOURCED in outline — the
    photographs of May 1906 show frame houses burned to the ground with their
    brick chimneys standing, and brick and steel buildings left as gutted
    shells with ragged wall tops (e.g. Arnold Genthe, 'Looking toward the Ferry
    Building'; USGS 1906 photo archive) — the form of each ruin is a
    CONVENTION: a low ash heap and one or two chimneys for a frame building,
    a roofless shell of scorched walls, windows open to the sky, for a brick one."""
    rng = random.Random(b['gid'] * 977 + 3)
    ring, _ = ring_ccw([tuple(p) for p in b['ring']])
    n = len(ring)
    if n < 3: return
    zs = [ground(x, y) for x, y in ring]; zg = sum(zs) / n; zfoot = min(zs) - 0.6
    cx = sum(p[0] for p in ring) / n; cy = sum(p[1] for p in ring) / n
    frame = b['ty'] in ('HOUSE', 'FLATS', 'APARTMENT', 'UNCLASSED') and b['h'] < 16 and b.get('ruin') != 'shell'
    ash_c = (0.62, 0.58, 0.54)          # multiplies the burned-ground scan (dark already)
    # the floor of the ruin: ash and fallen brick
    inner = offset_ring(ring, -0.3)
    hz = zg + (rng.uniform(0.4, 1.3) if frame else rng.uniform(0.6, 2.0))
    pts = [Vector((x, y, hz + rng.uniform(-0.25, 0.25))) for x, y in inner]
    for t in tessellate_polygon([pts]):
        out.poly('ash', [pts[k] for k in t], ash_c)
    for i in range(n):                                   # the heap's sides down to the ground
        a, c = inner[i], inner[(i + 1) % n]
        out.poly('ash', [Vector((a[0], a[1], zfoot)), Vector((c[0], c[1], zfoot)), pts[(i + 1) % n], pts[i]], ash_c)
    X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
    if frame:
        for k in range(1 if rng.random() < 0.6 else 2):
            px, py = cx + rng.uniform(-2.5, 2.5), cy + rng.uniform(-2.5, 2.5)
            hc = rng.uniform(5.0, max(5.5, b['h'] * 0.95))
            out.box3('soot', Vector((px - 0.35, py - 0.45, zg)), X * 0.7, Y * 0.9, Z * hc, (0.46, 0.30, 0.24))
        return
    # the shell: every wall a slab 0.4 m thick, its top broken in 2 m runs
    top = zg + max(4.0, b['h']); keep = 1.0 if b.get('ruin') == 'shell' else rng.uniform(0.55, 1.0)
    walls = [Wall(ring[i], ring[(i + 1) % n], out) for i in range(n)]
    storey = 4.0
    # scorched brick, sooted almost black, or a grey stone front
    wc = rng.choice(((0.42, 0.28, 0.22), (0.30, 0.22, 0.19), (0.22, 0.19, 0.17), (0.52, 0.49, 0.45)))
    for w in walls:
        if w.L < 0.3: continue
        u0 = 0.0
        while u0 < w.L - 0.05:
            u1 = min(w.L, u0 + rng.uniform(1.2, 3.6))
            if keep < 1.0:
                f = rng.random()
                ht = zg + (top - zg) * keep * (rng.uniform(0.05, 0.25) if f < 0.18 else rng.uniform(0.45, 1.0))
            else:
                ht = top
            w.box('soot', u0, u1, zfoot, ht, -0.4, 0.0, tuple(c * rng.uniform(0.85, 1.1) for c in wc))
            # the window openings: black, open through the wall to the sky
            for zf in frange(zg + 1.2, ht - 2.2, storey)[:-1] if ht - zg > 4 else []:
                if u1 - u0 > 1.2:
                    w.rect('soot', u0 + 0.35, u1 - 0.35, zf, zf + 2.0, 0.02, (0.03, 0.03, 0.03))
            u0 = u1


def turret(cpt, dirn, first, eave, top, trim, body, accent, rng, out):
    """an octagonal corner turret with a candle-snuffer roof"""
    R = rng.uniform(1.4, 1.8); cx = Vector((cpt.x, cpt.y, 0)) + Vector((dirn.x, dirn.y, 0)) * 0.6
    z0 = first + 0.2; z1 = max(eave, top - 1.0) + rng.uniform(0.6, 1.4); apex = z1 + R * 2.4
    P = [cx + Vector((math.cos(k * math.pi / 4 + math.pi / 8) * R, math.sin(k * math.pi / 4 + math.pi / 8) * R, 0)) for k in range(8)]
    for k in range(8):
        a, c = P[k], P[(k + 1) % 8]
        fw = Wall((a.x, a.y), (c.x, c.y), out)
        holes = []
        nf = max(1, int((z1 - z0) // 3.0))
        for f in range(nf):
            a0 = z0 + f * 3.0 + 0.9; a1 = a0 + 1.5
            if a1 < z1 - 0.3:
                holes.append((0.25, fw.L - 0.25, a0, a1)); fw.opening(0.25, fw.L - 0.25, a0, a1, 'dh', trim, 0.12)
        fw.wall_with_holes('siding', 0.0, fw.L, z0 - 1.0, z1, holes, body)
        fw.box('trim', -0.05, fw.L + 0.05, z1 - 0.35, z1, 0.0, 0.25, trim)
        # the conical roof: a triangle per side, shingled
        out.poly('roof_shingle', [Vector((a.x, a.y, z1)) + (a - cx).normalized() * 0.25, Vector((c.x, c.y, z1)) + (c - cx).normalized() * 0.25, Vector((cx.x, cx.y, apex))], (0.78, 0.76, 0.78))
    # a finial
    out.box3('metal', Vector((cx.x - 0.05, cx.y - 0.05, apex - 0.1)), Vector((0.1, 0, 0)), Vector((0, 0.1, 0)), Vector((0, 0, 0.9)), (0.2, 0.2, 0.2))


# the street's commercial colours: awning canvas and sign boards
AWN = [(0.62, 0.10, 0.09), (0.50, 0.08, 0.10), (0.12, 0.30, 0.18), (0.10, 0.16, 0.34), (0.08, 0.08, 0.09), (0.08, 0.08, 0.09),
       (0.86, 0.46, 0.12), (0.90, 0.74, 0.22), (0.20, 0.44, 0.52), (0.92, 0.91, 0.87), (0.44, 0.20, 0.36), (0.30, 0.18, 0.10)]
SIGN = [(0.94, 0.93, 0.90), (0.10, 0.10, 0.11), (0.70, 0.12, 0.10), (0.12, 0.22, 0.44), (0.92, 0.78, 0.26), (0.16, 0.36, 0.22)]


def shopfronts(w, b, zg, trim, body):
    """(24/09) a shop front at the city's scale, one per 5-9 m of frontage
    (a long front is several shops): a sloped canvas awning with its valance
    in a colour of the street's own, or none; a sign board over it; a blade
    sign standing out now and then; a café's umbrellas on the sidewalk"""
    L = w.L; r = random.Random(b['gid'] * 709 + int(L * 13))
    n = max(1, round(L / r.uniform(5.0, 9.0))); p = L / n
    for k in range(n):
        u0, u1 = k * p + 0.25, (k + 1) * p - 0.25
        if u1 - u0 < 1.5: continue
        if k: w.box('trim', u0 - 0.3, u0 - 0.2, zg, zg + 3.6, 0.0, 0.14, trim)          # the pier between shops
        x_ = r.random(); col = r.choice(AWN)
        if x_ < 0.62:
            D = r.uniform(1.0, 1.7); zt = zg + r.uniform(3.3, 3.7); zb = zt - D * r.uniform(0.45, 0.75)
            w.o.poly('awning', [w.P(u0, zt, 0.02), w.P(u1, zt, 0.02), w.P(u1, zb, D), w.P(u0, zb, D)], col)
            w.o.poly('awning', [w.P(u0, zb, D), w.P(u1, zb, D), w.P(u1, zb - 0.28, D), w.P(u0, zb - 0.28, D)], mix(col, (0, 0, 0), 0.15))   # valance
            for uu in (u0, u1): w.o.poly('awning', [w.P(uu, zt, 0.02), w.P(uu, zb, D), w.P(uu, zb - 0.28, D), w.P(uu, zb - 0.28, 0.02)], mix(col, (0, 0, 0), 0.25))
        sc = col if r.random() < 0.4 else r.choice(SIGN)
        w.box('trim', u0, u1, zg + 3.75, zg + 4.4, 0.0, 0.1, sc)                            # the sign board
        if r.random() < 0.3:                                                                  # its letters, as a lighter or darker bar
            w.rect('trim', u0 + (u1 - u0) * 0.2, u1 - (u1 - u0) * 0.2, zg + 3.95, zg + 4.2, 0.11, (0.96, 0.95, 0.9) if sum(sc) < 1.5 else (0.1, 0.1, 0.1))
        if r.random() < 0.14:                                                                 # a blade sign
            uu = r.choice((u0 + 0.2, u1 - 0.2)); zs = zg + r.uniform(4.2, 5.5)
            w.box('trim', uu - 0.06, uu + 0.06, zs, zs + r.uniform(1.2, 2.6), 0.1, 0.95, r.choice(SIGN + AWN))
        if x_ > 0.9 and u1 - u0 > 3.0:                                                        # a café's umbrellas
            for j in range(r.randint(1, 3)):
                uc = u0 + (u1 - u0) * (j + 0.5) / 3; wc = r.uniform(1.9, 2.4); rad = r.uniform(0.9, 1.25); zu = zg + 2.3
                uc_ = r.choice(((0.92, 0.91, 0.87), (0.62, 0.10, 0.09), (0.12, 0.30, 0.18), (0.10, 0.10, 0.11)))
                ap = w.P(uc, zu + 0.45, wc); ring_ = [w.P(uc + rad * math.cos(a_), zu, wc + rad * math.sin(a_)) for a_ in [2 * math.pi * i / 8 for i in range(8)]]
                for i in range(8): w.o.poly('awning', [ring_[i], ring_[(i + 1) % 8], ap], uc_)
                w.box('metal', uc - 0.03, uc + 0.03, zg, zu, wc - 0.03, wc + 0.03, (0.2, 0.2, 0.2))


def rear_kit(w, b, first, fh, nfl, eave, zg, trim, wmat, wcol):
    """the back of an SF house at the city's scale: a back porch built out
    (the Edwardian flats' stacked sunrooms, a kitchen addition), its windows
    a band; or decks stacked floor over floor, a railing, posts, and a stair
    down to the yard. Real relief the low sun draws; a few faces each"""
    r = random.Random(b['gid'] * 313 + 7); x_ = r.random(); L = w.L
    if x_ < 0.3:
        bw = min(L * 0.7, r.uniform(3.0, 5.0)); u0 = r.choice((0.0, L - bw, (L - bw) / 2)); D = r.uniform(1.8, 2.8)
        nf = min(nfl, r.choice((1, 1, 2, 3, nfl)))
        z0 = max(zg, first - 0.3); z1 = min(eave - 0.3, first + nf * fh)
        if z1 - z0 < 2.0: return
        w.box(wmat, u0, u0 + bw, z0, z1, 0.0, D, wcol)
        w.box('metal', u0 - 0.05, u0 + bw + 0.05, z1, z1 + 0.12, 0.0, D + 0.05, (0.55, 0.55, 0.53))
        for f in range(nf):
            zz = first + f * fh + 0.9
            if zz + 1.2 > z1: break
            w.rect('glass', u0 + 0.35, u0 + bw - 0.35, zz, zz + 1.3, D + 0.02, (1, 1, 1))
            w.rect('trim', u0 + 0.25, u0 + bw - 0.25, zz - 0.12, zz + 1.42, D + 0.01, trim)
        return
    if x_ < 0.82 and first - zg > 0.6:
        Ld = min(L - 1.6, r.uniform(2.8, 4.2)); D = r.uniform(1.8, 2.6)
        if Ld < 2.2: return
        left = r.random() < 0.5; u0 = 0.3 if left else L - Ld - 0.3
        nd = min(nfl, r.choice((1, 1, 2, 2, 3)))
        wood = r.choice(((0.58, 0.45, 0.32), (0.50, 0.40, 0.30), (0.62, 0.60, 0.56), trim))
        rail = r.choice((trim, (0.20, 0.20, 0.21), wood))
        ztop = first + (nd - 1) * fh
        if ztop + 1.2 > eave: return
        for f in range(nd):
            zd = first + f * fh
            w.box('deck', u0, u0 + Ld, zd - 0.2, zd, 0.0, D, wood)
            w.box('trim', u0, u0 + Ld, zd + 0.92, zd + 1.02, D - 0.07, D, rail)                     # top rail
            w.rect('curtain', u0, u0 + Ld, zd, zd + 0.92, D - 0.03, mix(rail, (0.5, 0.5, 0.5), 0.35))  # balusters, read as a veil
        for uu in (u0 + 0.05, u0 + Ld - 0.17):
            w.box('deck', uu, uu + 0.12, zg - 0.2, ztop, D - 0.15, D - 0.03, wood)
        # the stair: from the lowest deck to the yard, beside it, as a ramp of treads
        rise = first - zg; run = rise / 0.72
        us, ue = (u0 + Ld, u0 + Ld + run) if left else (u0, u0 - run)
        if 0.0 <= min(us, ue) and max(us, ue) <= L:
            w.o.poly('deck', [w.P(us, first, D - 1.0), w.P(us, first, D), w.P(ue, zg, D), w.P(ue, zg, D - 1.0)], wood)
            w.o.poly('trim', [w.P(us, first + 0.9, D), w.P(us, first + 1.0, D), w.P(ue, zg + 1.0, D), w.P(ue, zg + 0.9, D)], rail)


def rear_deck(w, u0, first, zg, trim, rng):
    """a wooden deck off the first floor at the back, posts, rail and a stair"""
    L_ = 3.2; D = 2.4; zd = first
    w.box('deck', u0, u0 + L_, zd - 0.2, zd, 0.0, D, (0.60, 0.46, 0.32))
    for uu in (u0 + 0.05, u0 + L_ - 0.15):
        w.box('deck', uu, uu + 0.1, zg - 0.2, zd, D - 0.15, D - 0.05, (0.55, 0.42, 0.30))
    # a railing: posts and a top rail, open between
    w.box('trim', u0, u0 + L_, zd + 0.95, zd + 1.02, D - 0.06, D, trim)
    w.box('trim', u0, u0 + 0.05, zd + 0.95, zd + 1.02, 0.0, D, trim)
    for uu in frange(u0, u0 + L_ - 0.05, 0.6): w.box('trim', uu, uu + 0.05, zd, zd + 1.0, D - 0.06, D - 0.01, trim)
    for ww_ in frange(0.1, D - 0.1, 0.6): w.box('trim', u0, u0 + 0.05, zd, zd + 1.0, ww_, ww_ + 0.05, trim)
    rise = zd - zg; nst = max(3, int(rise / 0.19)); run = 0.26
    for s_ in range(nst):
        zt = zd - (s_ + 1) * rise / nst
        w.box('deck', u0 + L_ + s_ * run, u0 + L_ + (s_ + 1) * run, zt - 0.05, zt, D - 1.0, D, (0.58, 0.45, 0.32))


TILE_TINTS = [(1.0, 1.0, 1.0), (0.94, 0.88, 0.84), (1.0, 0.92, 0.82), (0.86, 0.80, 0.78), (0.97, 0.84, 0.74)]
SHINGLE_TINTS = [(0.80, 0.80, 0.82), (0.80, 0.80, 0.82), (0.95, 0.94, 0.95), (1.28, 1.02, 0.80), (1.18, 0.98, 0.84), (0.92, 1.0, 1.14),
                 (1.45, 0.86, 0.72), (0.92, 1.10, 0.92)]
FLAT_TINTS = [(1.0, 1.0, 1.0), (1.55, 1.55, 1.52), (1.25, 1.18, 1.05), (0.8, 0.8, 0.82), (1.4, 1.42, 1.45)]

def roof_colour(b, rng, flat=False):
    # the measured aerial roof tone (paintIdx, 32 steps dark→light) sets the
    # lightness; the hue is a convention (shingle or membrane), per building
    # (colours are squared into linear by emit(): these are display values)
    if ERA is not None and ERA < 1935 and not flat:
        # before composition shingle: split redwood and cedar shingles,
        # weathered silver-brown (CONVENTION on the tone; the aerial's tone
        # is today's roof, not the period's)
        w_ = rng.uniform(0.40, 0.56)
        return (w_ * 1.08, w_ * 0.98, w_ * 0.86)
    t = b.get('paint', 16) / 31.0
    k = 0.70 + 0.5 * t + rng.uniform(-0.05, 0.05)
    tint = rng.choice(FLAT_TINTS if flat else SHINGLE_TINTS)
    return tuple(k * c for c in tint)


def flat_roof(b, rng, ax_u):
    """the membrane of a flat roof, from the measured aerial roof tone: a
    light roof reads as white elastomeric coating or aluminium paint, a mid
    one as a mineral cap sheet, a dark one as tar and gravel. RGBA: the paint
    (display values), and in alpha the kind (0 gravel, 1 cap sheet, 2 white,
    3 silver) and the roll direction — (kind + 0.1 + 0.8·turn/90°) / 4 —
    which the roof_flat material decodes"""
    t = b.get('paint', 16) / 31.0
    u = rng.random()
    # white only for the lightest; most roofs are the greys of cap sheet and gravel
    if t >= 0.85: kind = 2 if u < 0.45 else (3 if u < 0.7 else 1)
    elif t >= 0.60: kind = 1 if u < 0.55 else (3 if u < 0.75 else 0)
    elif t >= 0.30: kind = 1 if u < 0.5 else 0
    else: kind = 0 if u < 0.6 else 1
    kind = EA.roof_membrane(kind, b['gid'], ERA)      # the membranes of the year shown
    k = 0.70 + 0.35 * t + rng.uniform(-0.06, 0.06)
    base = {0: rng.choice(((0.50, 0.48, 0.45), (0.44, 0.44, 0.44), (0.55, 0.50, 0.44), (0.38, 0.37, 0.36))),
            1: rng.choice(((0.60, 0.60, 0.58), (0.52, 0.56, 0.52), (0.62, 0.58, 0.52), (0.50, 0.52, 0.56), (0.45, 0.45, 0.46), (0.58, 0.52, 0.46))),
            2: rng.choice(((0.86, 0.86, 0.84), (0.80, 0.81, 0.80), (0.84, 0.82, 0.78))),
            3: rng.choice(((0.72, 0.73, 0.74), (0.66, 0.67, 0.69)))}[kind]
    if kind >= 2: k = 0.90 + 0.08 * t
    turn = (math.degrees(math.atan2(ax_u.y, ax_u.x)) % 90.0) / 90.0
    return (*[min(1.0, c * k) for c in base], (kind + 0.1 + 0.8 * turn) / 4.0)


# ── ROOFS FROM THE AIR (roofs_prep.py, roofs agent) ──────────────────────────
# each roof's colour and class measured on USDA NAIP 2022 (public domain),
# as LINEAR ALBEDO per gid in qipu-render-work/roofs/roofs.json. Used only for
# today (ERA None), only where the measurement is confident (ROOFS_CONF), and
# only on the switch ROOFS=1; anywhere else the procedural roof stands. The
# hooks run AFTER the procedural choice, so every rng draw (and with it every
# window, paint and roof fixture) stays what it was: only the roof changes.
def _load_roofs():
    import os, json
    if os.environ.get('ROOFS', '0') != '1': return {}
    # a pass reads the copy frozen next to its snapshot of the scripts; a test the live one
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'roofs.json')
    p = os.environ.get('ROOFS_FILE') or (here if os.path.exists(here) else '/Users/daniel/code/qipu-render-work/roofs/roofs.json')
    if not os.path.exists(p): return {}
    print('[roofs]', p, flush=True)
    c = float(os.environ.get('ROOFS_CONF', 0.5))
    return {int(g): v for g, v in json.load(open(p))['roofs'].items() if v[4] >= c and v[3] not in ('tree', 'shadow')}
ROOF_M = _load_roofs()
LIDAR_FILE = '/Users/daniel/code/qipu-render-work/lidar/roofs_lidar_city.json'
def _load_lidar():
    import json, os
    if os.environ.get('LIDAR_ROOFS', '1') != '1' or not os.path.exists(LIDAR_FILE): return {}
    try: d_ = json.load(open(LIDAR_FILE)); d_.pop('_tiles', None); return d_
    except Exception as ex: print('lidar roofs unreadable', ex); return {}
LIDAR_R = _load_lidar()
# the mean linear albedo of what each material multiplies the paint by (so a
# measured albedo becomes paint = albedo / texture): the Poly Haven diffuse
# maps (grey_roof_01; clay_roof_tiles_02 x the material's 1.1); roof_flat's
# normalised bitumen/gravel mix per kind (hq_scene.roof_flat_mat), and its
# dirt and ponding (~8% on average)
_ROOF_TEX = {'roof_shingle': (0.109, 0.1056, 0.0968), 'roof_tile': (0.3416, 0.0945, 0.0290)}
_FLAT_TEX = {0: (1.215, 1.068, 0.881), 1: (1.238, 1.078, 0.960), 2: (1.05, 1.017, 1.0), 3: (1.05, 1.017, 1.0)}
_FLAT_KIND = {'white': 2, 'metal': 3, 'gravel': 0, 'green': 0}      # the rest: cap sheet

_FA = None
def _faithful():
    """FAITHFUL: per-building reality table {gid: {style, st, garage, bays, bay_kind, facade_col, trim_col, mat, roof_col}}"""
    global _FA
    import os, json
    if _FA is None:
        f = os.environ.get('FA_FILE', '')
        _FA = json.load(open(f)) if (os.environ.get('FAITHFUL', '0') == '1' and f and os.path.exists(f)) else {}
        if _FA: print('FAITHFUL', f, len(_FA))
    return _FA

_RC = None
def _realcol():
    """BCOL_REAL: the realcolour table (REALCOL_LICENCE=open: without NC-derived data)"""
    global _RC
    import os, json
    if _RC is None:
        f = os.environ.get('REALCOL_FILE') or '/Users/daniel/code/qipu-render-work/realcolour/out/realcol_%s.json' % ('open' if os.environ.get('REALCOL_LICENCE') == 'open' else 'all')
        _RC = json.load(open(f)) if os.path.exists(f) else {}
        print('BCOL_REAL', f, len(_RC))
    return _RC

def _lum(a): return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]
def _disp(lin): return tuple(max(0.0, v) ** (1 / 2.2) for v in lin)   # emit() raises back to 2.2


def measured_form(b, roof):
    """a gable the generator drew where the air sees a light membrane (white,
    cap sheet, silver, gravel; albedo >= 0.28) and the survey does not call
    the roof pitched: it is a flat roof, behind a false front mostly
    (roofs.json's 6th field, set by roofs_prep.finish)"""
    m = ROOF_M.get(b['gid'])
    return 'flat' if (m and roof == 'gable' and len(m) > 5 and m[5] == 1) else roof


def roof_now(b):
    """is the roof measured on NAIP 2022 already on this building in the year
    shown? A roof is re-covered every ~25 years: today's surface went on at a
    fixed moment per building between 1997 and 2022 (never before the
    building), and before that the period's procedural roof stands. CONVENTION
    on the cycle; no city-wide switch year (25/09 eras, one grammar)"""
    if ERA is None: return True
    u = ((int(b['gid']) * 2654435761 + 4711) % 1000003) / 1000003.0
    return ERA >= max((b.get('year') or 1900) + 0.5, 2022.0 - 25.0 * u)


def measured_pitched(b, roof_mat, rc):
    """a pitched roof in its measured colour: clay tile where the air sees
    terracotta, shingle otherwise (never whiter than a light shingle: a
    white reading over a gable is a flat roof the generator pitched)"""
    m = ROOF_M.get(b['gid']) if roof_now(b) else None
    if not m:
        if ROOF_M and roof_now(b) and roof_mat == 'roof_shingle':
            # unmeasured (or unsure): the procedural shingle, toned toward the
            # city the air measured — greys warm to cool, few reds and violets
            L = _lum(rc); return roof_mat, tuple(L + 0.45 * (c - L) for c in rc)
        return roof_mat, rc
    a, cls = list(m[:3]), m[3]
    a = unmauve(a)
    mat = 'roof_tile' if cls == 'tile' else 'roof_shingle'
    L = max(_lum(a), 1e-4)
    if mat == 'roof_tile':
        # (25/09) weathered clay, terracotta-brown: the photo's hue kept, its
        # saturation and lightness held down: the measured albedo rendered
        # bright orange (AgX Punchy and the grade's saturation on top), where
        # the Richmond and Sunset photos show brown-red
        a = [L + 0.55 * (v - L) for v in a]; L2 = min(L, 0.30) * 0.9
    # a shingle lives between 0.05 and ~0.22: the photo's lightness is kept in
    # ORDER, compressed into that range (a light reading over a gable is mostly
    # a flat light roof the generator pitched; at 0.3-0.4 a 50° gable went pale)
    else: L2 = (min(0.19, 0.045 + 0.45 * max(0.0, L - 0.05)) if L > 0.05 else L) * random.Random(b['gid'] * 17 + 3).uniform(0.82, 1.08)   # (24/09: darker asphalt, house to house)
    a = [v * L2 / L for v in a]
    t = _ROOF_TEX[mat]
    return mat, _disp([a[k] / t[k] for k in range(3)])


def measured_flat(b, rc):
    """a flat roof's membrane in its measured colour and kind; the roll
    direction (alpha's fraction) is the procedural one's"""
    m = ROOF_M.get(b['gid']) if roof_now(b) else None
    if not m: return rc
    a, cls = list(m[:3]), m[3]
    kind = _FLAT_KIND.get(cls, 1)
    if cls == 'tile':       # terracotta over a flat deck: a red-brown cap sheet, not a painted red
        L = _lum(a); a = [L + 0.6 * (v - L) for v in a]
        # (24/09) and brown, never the pink-mauve a light red reading made
        # (Golden Gateway Commons): the hue held to red-brown, no brighter than a cap sheet
        L = min(_lum(a), 0.16); a = [L * 1.32, L * 0.93, L * 0.72]
    a = unmauve(a)
    t4 = rc[3] * 4.0
    # a BIG flat roof (>= 250 m2) is never darker than the procedural membrane
    # it replaces, unless the photo clearly shows tar (7th field): from 60 cm
    # its clutter, ducts and shade pull the reading down; where it is lifted
    # it keeps the procedural kind too (the silver coating's sheen)
    r_ = b['ring']; n_ = len(r_)
    if not (len(m) > 6 and m[6]) and abs(sum(r_[i][0] * r_[(i + 1) % n_][1] - r_[(i + 1) % n_][0] * r_[i][1] for i in range(n_))) / 2 >= 250:
        k0 = min(3, max(0, int(math.floor(t4))))
        Lp = _lum([rc[i] ** 2.2 * _FLAT_TEX[k0][i] * 0.92 for i in range(3)]); L = max(_lum(a), 1e-4)
        if L < Lp: a = [v * Lp / L for v in a]; kind = k0
    t = _FLAT_TEX[kind]
    return (*_disp([min(1.0, a[k] / (t[k] * 0.92)) for k in range(3)]), (kind + t4 - math.floor(t4)) / 4.0)


def roof_kit(ring, inner, deck, top, b, rng, out, c):
    if c['sub'] == 'pier': pier_roof(ring, deck, top, b, out, c); return
    """what stands on a flat roof, by the kind of building: a stair
    penthouse on the bigger ones, a hatch, skylights, plumbing vents along
    the party walls, brick chimneys on the old houses, condensers and
    rooftop units on apartments and shops, now and then solar panels"""
    style, sub, body, wall_mat, rc = c['style'], c['sub'], c['body'], c['wall_mat'], c['rc']
    ax_u, ax_v, storeys, roles = c['ax_u'], c['ax_v'], c['storeys'], c['roles']
    n = len(ring)
    area = abs(sum(ring[i][0] * ring[(i + 1) % n][1] - ring[(i + 1) % n][0] * ring[i][1] for i in range(n))) / 2
    Z = Vector((0, 0, 1))
    UV = [(Vector((x, y, 0)).dot(ax_u), Vector((x, y, 0)).dot(ax_v)) for x, y in inner]
    umin, umax = min(p[0] for p in UV), max(p[0] for p in UV); vmin, vmax = min(p[1] for p in UV), max(p[1] for p in UV)
    def inside(pu, pv):
        k = False; m = len(UV)
        for i in range(m):
            (u1, v1), (u2, v2) = UV[i], UV[(i + 1) % m]
            if (v1 > pv) != (v2 > pv) and pu < u1 + (pv - v1) * (u2 - u1) / (v2 - v1): k = not k
        return k
    placed = []
    def spot(wu, wv, tries=30, pad=0.35):
        for _ in range(tries):
            u0 = rng.uniform(umin + pad, umax - wu - pad); v0 = rng.uniform(vmin + pad, vmax - wv - pad)
            if umax - wu - pad <= umin + pad or vmax - wv - pad <= vmin + pad: return None
            if not all(inside(u0 + du, v0 + dv) for du in (-pad, wu + pad) for dv in (-pad, wv + pad)): continue
            if not inside(u0 + wu / 2, v0 + wv / 2): continue
            if any(u0 < q[1] + pad and u0 + wu > q[0] - pad and v0 < q[3] + pad and v0 + wv > q[2] - pad for q in placed): continue
            placed.append((u0, u0 + wu, v0, v0 + wv)); return u0, v0
        return None
    def at(u, v, z): return ax_u * u + ax_v * v + Z * z
    def box(mat, u0, v0, wu, wv, z0, h, col):
        out.box3(mat, at(u0, v0, z0), ax_u * wu, ax_v * wv, Z * h, col)
    def cyl(mat, u, v, z0, h, r, col, k=8):
        P = [at(u + math.cos(2 * math.pi * i / k) * r, v + math.sin(2 * math.pi * i / k) * r, 0) for i in range(k)]
        for i in range(k):
            a, b_ = P[i], P[(i + 1) % k]
            out.poly(mat, [a + Z * z0, b_ + Z * z0, b_ + Z * (z0 + h), a + Z * (z0 + h)], col)
        out.poly(mat, [p + Z * (z0 + h) for p in P], col)
    house = style in ('vic', 'stucco', 'midcentury'); hs_ = house
    big = area > 120 or storeys >= 4 or style == 'block'
    # the stair (and lift) penthouse, in the building's own wall and paint
    if storeys >= 10 and area > 250:
        # A TOWER'S TOP, one of four kinds (every tower wore the same stepped
        # box, centred, before: the loudest repeat of the downtown frame):
        # a penthouse off-centre, of louvres or of the tower's own wall; an
        # open louvred screen round the cooling towers, their fans seen from
        # above; a bare roof with a stair house and its units; a setback
        # crown, a smaller storey or three with its windows (the 1980s)
        yr = b['year'] or 1970; eu, ev = umax - umin, vmax - vmin; fh_ = c.get('fh', 3.6)
        k_ = rng.random(); pc = 0.3 if 1978 <= yr <= 1996 else 0.08
        kind = 'crown' if k_ < pc else 'screen' if k_ < pc + 0.3 else 'bare' if k_ < pc + 0.5 else 'house'
        # 24/09: tops that follow the tower's own plan, drawn on their own
        # seed (the old kinds keep theirs): setback tiers, a louvred screen
        # round the plan, a glass crown past the roof, a stepped or a hipped
        # pyramid top on the postmodern 1980s-90s
        H_ = HERO.get(b['gid'])
        if H_ is None or H_.get('top') != 'flat':
            xr = random.Random(b['gid'] * 983 + 17); x_ = xr.random()
            if 1978 <= yr <= 1996: nk = 'pyramid' if x_ < 0.16 else 'stepped' if x_ < 0.38 else 'setback' if x_ < 0.58 else 'ring' if x_ < 0.78 else None
            elif yr >= 1997: nk = 'glass' if x_ < 0.3 else 'setback' if x_ < 0.45 else 'ring' if x_ < 0.7 else None
            else: nk = 'setback' if x_ < 0.25 else 'ring' if x_ < 0.6 else None
            res_ = tower_top(nk, ring, deck, top, b, xr, out, c) if nk else False
            if res_ is True: kind = None
            elif res_ == 'more': kind = 'bare'                     # a stair house and cooling cells inside
        else: kind = None
        louvre = rng.choice(((0.40, 0.41, 0.41), (0.52, 0.52, 0.51), (0.60, 0.60, 0.58), (0.46, 0.43, 0.40)))   # (light metal: the dark louvres drew black outlines from the air)
        def cap(u0, v0, wu, wv, z):
            out.poly('roof_flat', [at(u0 + 0.05, v0 + 0.05, z + 0.02), at(u0 + wu - 0.05, v0 + 0.05, z + 0.02),
                                   at(u0 + wu - 0.05, v0 + wv - 0.05, z + 0.02), at(u0 + 0.05, v0 + wv - 0.05, z + 0.02)], rc)
        def cooling(u0, v0, wu, wv, z):
            # cooling tower cells in a row, a fan shroud on each: dark discs from above
            n_ = max(1, int(wu / 3.2)); cw = wu / n_
            box('equip', u0, v0, wu, wv, z, 2.6, (0.52, 0.53, 0.52))
            for k in range(n_):
                cyl('metal', u0 + cw * (k + 0.5), v0 + wv / 2, z + 2.6, 0.45, min(cw, wv) * 0.4, (0.10, 0.10, 0.11), 12)
        def house(u0, v0, wu, wv, z, h_, own):
            if own: box(wall_mat or 'concrete', u0, v0, wu, wv, z, h_, body)
            else: box('metal', u0, v0, wu, wv, z, h_, louvre)
            if own: box('metal', u0 - 0.03, v0 - 0.03, wu + 0.06, wv + 0.06, z + h_ * 0.3, h_ * 0.45, louvre)
            cap(u0, v0, wu, wv, z + h_)
        if kind == 'crown':
            f_ = rng.uniform(0.6, 0.8); wu, wv = eu * f_, ev * f_
            s_ = spot(wu, wv, tries=40, pad=0.8)
            if s_:
                ns = rng.choice((1, 2, 2, 3)); h_ = fh_ * ns
                box(wall_mat or 'concrete', s_[0], s_[1], wu, wv, deck, h_, body)
                gc_ = c.get('gcol') or (0.22, 0.24, 0.26, 0.3)
                for f in range(ns):
                    box('curtain_wall', s_[0] - 0.03, s_[1] - 0.03, wu + 0.06, wv + 0.06, deck + f * fh_ + fh_ * 0.28, fh_ * 0.5, gc_)
                cap(s_[0], s_[1], wu, wv, deck + h_)
                # and on the crown, a small penthouse of louvres
                pu, pv = wu * rng.uniform(0.35, 0.55), wv * rng.uniform(0.35, 0.55)
                house(s_[0] + (wu - pu) * rng.uniform(0.2, 0.8), s_[1] + (wv - pv) * rng.uniform(0.2, 0.8), pu, pv, deck + h_ + 0.05, rng.uniform(3.0, 4.5), False)
        elif kind == 'screen':
            wu, wv = eu * rng.uniform(0.45, 0.7), ev * rng.uniform(0.4, 0.65)
            s_ = spot(wu, wv, tries=40, pad=0.8)
            if s_:
                hs = rng.uniform(3.6, 5.0); t_ = 0.18; u0, v0 = s_
                for (a_, b_, cu, cv) in ((u0, v0, wu, t_), (u0, v0 + wv - t_, wu, t_), (u0, v0, t_, wv), (u0 + wu - t_, v0, t_, wv)):
                    box('metal', a_, b_, cu, cv, deck, hs, louvre)
                # inside: the cooling towers along one side, units and a roof deck of gravel
                cw_ = wu - 1.2; cv_ = min(wv * 0.42, 4.2)
                if cw_ > 2.5: cooling(u0 + 0.6, v0 + wv - 0.6 - cv_, cw_, cv_, deck)
                for k in range(rng.randint(1, 3)):
                    eu_, ev_ = rng.uniform(1.6, 2.6), rng.uniform(1.2, 1.8)
                    if wv - cv_ - 1.8 > ev_ and wu - 1.2 > eu_:
                        box('equip', u0 + 0.6 + rng.uniform(0, wu - 1.2 - eu_), v0 + 0.6 + rng.uniform(0, wv - cv_ - 1.8 - ev_), eu_, ev_, deck, rng.uniform(1.0, 1.6), (0.52, 0.52, 0.50))
                # the stair and lift house beside it, in the tower's wall
                su, sv = rng.uniform(4.0, 6.5), rng.uniform(3.5, 5.0); q_ = spot(su, sv, tries=30, pad=0.6)
                if q_: house(q_[0], q_[1], su, sv, deck, rng.uniform(3.2, 4.2), True)
        elif kind == 'bare':
            su, sv = rng.uniform(4.0, 7.0), rng.uniform(3.5, 5.5); q_ = spot(su, sv, tries=30, pad=0.8)
            if q_: house(q_[0], q_[1], su, sv, deck, rng.uniform(3.2, 4.5), True)
            cu, cv = rng.uniform(5.0, 9.0), rng.uniform(2.8, 3.6); q_ = spot(cu, cv, tries=30, pad=0.8)
            if q_: cooling(q_[0], q_[1], cu, cv, deck)
        else:   # a penthouse, off-centre, one tier (two now and then on the tallest)
            f_ = rng.uniform(0.35, 0.62); wu, wv = eu * f_ * rng.uniform(0.8, 1.2), ev * f_ * rng.uniform(0.8, 1.2)
            s_ = spot(wu, wv, tries=40, pad=0.8)
            if s_:
                own = rng.random() < 0.55; h_ = rng.uniform(4.5, 7.0)
                house(s_[0], s_[1], wu, wv, deck, h_, own)
                if storeys >= 25 and rng.random() < 0.35:
                    pu, pv = wu * 0.55, wv * 0.55
                    house(s_[0] + (wu - pu) * rng.uniform(0.2, 0.8), s_[1] + (wv - pv) * rng.uniform(0.2, 0.8), pu, pv, deck + h_, rng.uniform(3.0, 4.5), own)
    elif big and area > 90 and rng.random() < (0.0 if hs_ else 0.8):     # (none on a house: it was a white cube on every roof)
        wu, wv = rng.uniform(2.4, 3.6), rng.uniform(2.2, 3.2)
        if storeys >= 6: wu, wv = wu * 1.3, wv * 1.4
        s_ = spot(wu, wv)
        if s_:
            h = rng.uniform(2.4, 3.0) + (0.8 if storeys >= 6 else 0.0)
            box(wall_mat or 'stucco', s_[0], s_[1], wu, wv, deck, h, body)
            out.poly('roof_flat', [at(s_[0] + 0.05, s_[1] + 0.05, deck + h + 0.02), at(s_[0] + wu - 0.05, s_[1] + 0.05, deck + h + 0.02),
                                   at(s_[0] + wu - 0.05, s_[1] + wv - 0.05, deck + h + 0.02), at(s_[0] + 0.05, s_[1] + wv - 0.05, deck + h + 0.02)], rc)
            box('metal', s_[0] - 0.04, s_[1] - 0.04, wu + 0.08, wv + 0.08, deck + h, 0.06, (0.5, 0.5, 0.49))
    elif rng.random() < 0.55 and not hs_:                       # a roof hatch
        s_ = spot(0.85, 0.85)
        if s_: box('metal', s_[0], s_[1], 0.85, 0.85, deck, 0.38, (0.46, 0.46, 0.45))
    # skylights over the stairs and the light wells: a curb and glass, or a milky dome
    nsk_ = rng.choice((0, 1, 1, 2, 3)) if house or area < 400 else rng.randint(1, 4)
    if hs_: nsk_ = 1 if (nsk_ and random.Random(b['gid'] * 29 + 1).random() < 0.35) else 0    # a house: the occasional skylight only
    for _ in range(nsk_):
        wu, wv = rng.uniform(0.7, 1.3), rng.uniform(0.9, 1.8)
        s_ = spot(wu, wv)
        if not s_: continue
        # (24/09, Daniel: white confetti on every flat roof) curbs in galvanised
        # grey, the domes no whiter than 0.6
        box('trim' if rng.random() < 0.6 else 'metal', s_[0], s_[1], wu, wv, deck, 0.22, (0.54, 0.54, 0.52))
        if rng.random() < 0.6 or LOD >= 2:
            out.poly('glass', [at(s_[0] + 0.06, s_[1] + 0.06, deck + 0.235), at(s_[0] + wu - 0.06, s_[1] + 0.06, deck + 0.235),
                               at(s_[0] + wu - 0.06, s_[1] + wv - 0.06, deck + 0.235 + 0.12), at(s_[0] + 0.06, s_[1] + wv - 0.06, deck + 0.235 + 0.12)], (1, 1, 1))
        else:
            um, vm = s_[0] + wu / 2, s_[1] + wv / 2; ap = at(um, vm, deck + 0.22 + min(wu, wv) * 0.3)
            q = [at(s_[0] + 0.05, s_[1] + 0.05, deck + 0.225), at(s_[0] + wu - 0.05, s_[1] + 0.05, deck + 0.225),
                 at(s_[0] + wu - 0.05, s_[1] + wv - 0.05, deck + 0.225), at(s_[0] + 0.05, s_[1] + wv - 0.05, deck + 0.225)]
            for i in range(4): out.poly('equip', [q[i], q[(i + 1) % 4], ap], (0.60, 0.60, 0.57))
    # brick chimneys of the old houses, straddling a party wall
    if style in ('vic', 'stucco') and (b['year'] or 1950) < 1930:
        party = [i for i in range(n) if roles[i] == 2]
        for i in rng.sample(party, min(len(party), rng.choice((0, 1, 1, 2)))):
            a_, b2 = Vector((*ring[i], 0)), Vector((*ring[(i + 1) % n], 0))
            L_ = (b2 - a_).length
            if L_ < 3: continue
            t_ = (b2 - a_) / L_; nn = Vector((-t_.y, t_.x, 0))
            p0 = a_ + t_ * rng.uniform(1.0, L_ - 2.0) - nn * 0.15
            h = rng.uniform(1.0, 1.7)
            out.box3('chimney', p0 + Z * (deck - 0.1), t_ * 0.9, nn * 0.55, Z * (top - deck + h), (1, 1, 1))
            out.box3('trim', p0 - t_ * 0.05 - nn * 0.05 + Z * (top + h - 0.08), t_ * 1.0, nn * 0.65, Z * 0.12, (0.55, 0.53, 0.50))
            if LOD < 2:
                for k in range(rng.randint(1, 2)):
                    cyl('metal', (p0 + t_ * (0.25 + 0.4 * k) + nn * 0.27).dot(ax_u), (p0 + t_ * (0.25 + 0.4 * k) + nn * 0.27).dot(ax_v),
                        top + h + 0.04, 0.35, 0.09, (0.25, 0.24, 0.23), 6)
    # plumbing vents and flues, mostly near the edges
    if LOD < 2:
        for _ in range(int(min(10, 2 + area / 45))):
            s_ = spot(0.2, 0.2, tries=12, pad=0.15)
            if not s_: continue
            col = (0.08, 0.08, 0.08) if rng.random() < 0.6 else (0.55, 0.55, 0.53)
            h = rng.uniform(0.3, 0.8); r = rng.uniform(0.04, 0.09)
            cyl('metal', s_[0] + 0.1, s_[1] + 0.1, deck, h, r, col, 6 if LOD else 8)
            if rng.random() < 0.3: cyl('metal', s_[0] + 0.1, s_[1] + 0.1, deck + h, 0.08, r * 2.2, col, 8)
    # condensers and rooftop units
    n_hv = 0
    if style == 'block': n_hv = int(min(14, 1 + area / 90 * rng.uniform(0.6, 1.4)))
    # (24/09, Daniel: scattered white units read as confetti) grouped: one
    # to three clusters, the units in a row along the roof's axis, mid grey
    # and beige (galvanised steel, painted units: 0.4-0.55), none on a house
    n_hv = EA.gate_count(n_hv, 'hvac', b['gid'], ERA)   # none on the pre-war roofs
    ncl_ = 0 if not n_hv else 1 + (n_hv > 5) + (n_hv > 10)
    for ci_ in range(ncl_):
        rtu = style == 'block' and (b.get('shop') or b['ty'] in ('RETAIL', 'OFFICE', 'HOTEL')) and rng.random() < 0.5
        wu, wv, h = (rng.uniform(2.0, 3.0), rng.uniform(1.3, 1.7), rng.uniform(1.0, 1.3)) if rtu else (rng.uniform(0.9, 1.3), 0.9, 0.85)
        col = rng.choice(((0.50, 0.50, 0.48), (0.42, 0.43, 0.43), (0.55, 0.53, 0.49), (0.46, 0.45, 0.42)))
        m_ = max(1, n_hv // ncl_); s_ = None
        while m_ >= 1 and not s_:
            s_ = spot(m_ * (wu + 0.35) - 0.35, wv, tries=15, pad=0.5)
            if not s_: m_ = m_ // 2 if m_ > 1 else 0
        if not s_: continue
        for k_ in range(m_):
            box('equip', s_[0] + k_ * (wu + 0.35), s_[1], wu, wv, deck, h, col)
        if rtu and LOD >= 1:
            # the row's supply duct running off across the roof, low, in galvanised sheet
            dl = rng.uniform(2.5, 6.0); dv = rng.choice((-1, 1))
            v0_ = s_[1] + wv if dv > 0 else s_[1] - dl
            if vmin + 0.4 < v0_ and v0_ + dl < vmax - 0.4: box('metal', s_[0] + wu * 0.35, v0_, 0.6, dl, deck, 0.55, (0.52, 0.53, 0.52))
        if LOD < 2:
            for k in range(2 if rtu else 1):
                um = s_[0] + (wu * (0.3 + 0.4 * k) if rtu else wu / 2); vm = s_[1] + wv / 2
                cyl('metal', um, vm, deck + h, 0.015, min(wu, wv) * 0.36, (0.07, 0.07, 0.07), 12)
    # solar: rows of panels, tilted up a little toward the sun's side
    if (house or sub == 'apartment') and area > 45 and rng.random() < 0.14 * EA.rel('solar', ERA):
        pw, pd, gap = 1.02, 1.68, 0.03
        tilt = math.radians(10)
        nrow = 0
        for tries in range(3):
            ncol = rng.randint(3, 8); wu = ncol * (pw + gap); wv = pd * math.cos(tilt)
            for r_ in range(rng.randint(1, 4)):
                s_ = spot(wu, wv + 0.5, tries=10, pad=0.4)
                if not s_: break
                nrow += 1
                z0 = deck + 0.25; z1 = z0 + pd * math.sin(tilt)
                if LOD >= 2:
                    out.poly('solar', [at(s_[0], s_[1], z0), at(s_[0] + wu, s_[1], z0), at(s_[0] + wu, s_[1] + wv, z1), at(s_[0], s_[1] + wv, z1)], (1, 1, 1))
                    continue
                for k in range(ncol):
                    u0 = s_[0] + k * (pw + gap)
                    out.poly('solar', [at(u0, s_[1], z0), at(u0 + pw, s_[1], z0), at(u0 + pw, s_[1] + wv, z1), at(u0, s_[1] + wv, z1)], (1, 1, 1))
                box('metal', s_[0], s_[1] + wv - 0.05, wu, 0.05, deck, z1 - deck, (0.5, 0.5, 0.5))
            if nrow: break
    # (24/09) a roof deck at the city's LOD: planks, a railing seen as a thin
    # veil round it, planters, an umbrella now and then — on about one house
    # roof in four; the old centred square stays for LOD 0
    dr = random.Random(b['gid'] * 97 + 5)
    if style in ('vic', 'stucco', 'midcentury') and LOD >= 1 and area > 40 and dr.random() < 0.15:
        wu, wv = dr.uniform(2.8, 5.0), dr.uniform(2.4, 4.0)
        s_ = spot(wu, wv, tries=30, pad=0.35)
        if s_:
            u0, v0 = s_; z0 = deck + 0.14
            box('deck', u0, v0, wu, wv, deck, 0.14, dr.choice(((0.60, 0.46, 0.32), (0.52, 0.40, 0.29), (0.66, 0.58, 0.48), (0.46, 0.44, 0.42))))
            rc_ = dr.choice(((0.14, 0.14, 0.15), (0.90, 0.89, 0.86), (0.40, 0.33, 0.26)))
            C4 = [at(u0, v0, 0), at(u0 + wu, v0, 0), at(u0 + wu, v0 + wv, 0), at(u0, v0 + wv, 0)]
            for i in range(4):
                a_, c_ = C4[i], C4[(i + 1) % 4]
                out.poly('curtain', [a_ + Z * z0, c_ + Z * z0, c_ + Z * (z0 + 1.05), a_ + Z * (z0 + 1.05)], rc_)
            for k in range(dr.randint(1, 4)):                                   # planters along an edge
                pu = dr.uniform(0.6, 1.4)
                box('equip', u0 + dr.uniform(0.1, max(0.12, wu - pu - 0.1)), v0 + (0.1 if dr.random() < 0.5 else wv - 0.55), pu, 0.45, z0, 0.5,
                    dr.choice(((0.20, 0.30, 0.14), (0.26, 0.36, 0.18), (0.30, 0.34, 0.20))))
            if dr.random() < 0.3:                                               # an umbrella
                uc, vc, ra = u0 + wu / 2, v0 + wv / 2, dr.uniform(0.9, 1.2); zu = z0 + 2.1
                ucol = dr.choice(((0.92, 0.91, 0.87), (0.62, 0.10, 0.09), (0.12, 0.30, 0.18), (0.86, 0.46, 0.12)))
                R_ = [at(uc + ra * math.cos(2 * math.pi * i / 8), vc + ra * math.sin(2 * math.pi * i / 8), zu) for i in range(8)]
                ap = at(uc, vc, zu + 0.4)
                for i in range(8): out.poly('awning', [R_[i], R_[(i + 1) % 8], ap], ucol)


def facade(w, is_front, b, rng, c):
    """windows, bays, doors, garages, balconies and the stoop on one wall;
    returns the openings (u0, u1, z0, z1) cut through the wall"""
    holes = []; L = w.L
    style, sub = c['style'], c['sub']
    if c.get('fsys'):
        tower_skin(w, is_front, b, rng, c); return holes
    if c['sub'] == 'pier':
        pier_wall(w, is_front, b, c); return holes
    if c['sub'] == 'works':
        works_front(w, is_front, b, c); return holes
    first, fh, nfl, eave, zg = c['first'], c['fh'], c['nfl'], c['eave'], c['zg']
    trim, body, accent = c['trim'], c['body'], c['accent']
    # window proportions by era: tall Victorian sashes, squarer later
    if style == 'vic': ww, wh = 0.95, min(2.4, fh * 0.64)
    elif sub == 'edwardian': ww, wh = 1.0, min(2.1, fh * 0.6)
    elif style == 'stucco': ww, wh = 1.15, min(1.8, fh * 0.55)
    elif sub == 'sunset': ww, wh = 1.2, 1.5
    elif sub == 'postwar': ww, wh = 1.9, min(1.45, fh * 0.55)     # aluminium sliders
    elif sub == 'modern': ww, wh = 1.8, 1.6
    elif sub == 'tower': ww, wh = 1.5, min(2.4, fh * 0.72)
    else: ww, wh = 1.3, min(1.8, fh * 0.52)
    sill = (fh - wh) * 0.45
    hood = c['hood'] if is_front else None
    bay_u = []
    if is_front and c['bay'] and L > 4.0:
        kind = c['bay']
        # a narrow Victorian carries one bay; a wide Edwardian two, one each side
        n_b = 2 if (sub == 'edwardian' and L > 9.5) else 1
        if c.get('nbay') and style != 'block': n_b = max(1, min(int(c['nbay']), int(L / 3.2)))     # (FAITHFUL)
        bw = min(3.2 if kind != 'box' else 3.4, L * (0.4 if n_b == 1 else (0.3 if n_b == 2 else 0.7 / n_b)))
        if style == 'block':
            # an apartment front: a bay every seven metres or so, from the second floor
            n_b = max(1, min(5, int(L / 7.0))); bw = min(3.0, L / n_b * 0.45)
            starts = [L * (k + 0.5) / n_b - bw / 2 for k in range(n_b)]
        elif n_b == 1:
            left = c['rd'].side('bayside', rng) if c.get('bay_left') is None else c['bay_left']
            starts = [0.35 if left else L - bw - 0.35]
        elif n_b == 2:
            starts = [0.4, L - bw - 0.4]
        else:
            starts = [L * (k + 0.5) / n_b - bw / 2 for k in range(n_b)]
        for bu0 in starts:
            z0_ = first + fh if (style == 'block' and nfl >= 3) else first
            z1_ = eave - 0.25 if kind != 'box' else first + fh - 0.2
            bay(w, bu0, bu0 + bw, z0_, z1_, c, rng, kind)
            bay_u.append((bu0, bu0 + bw, z0_))
    # the entry and its stoop (or the garage of a raised house)
    door_u = None
    garage_u = None
    shop_below = b.get('standin') and b.get('shop') and style == 'vic'
    if is_front and style != 'block' and L > 3.0 and not shop_below:
        free = [(0.3, L - 0.3)]
        for hu in bay_u: free = cut(free, hu, 0.3)
        free = [f for f in free if f[1] - f[0] > 1.3]
        # a garage under the house: not before the car (CONVENTION: from 1925)
        if first - zg > 2.0 and L > 5.0 and (ERA is None or ERA >= 1925):
            # the raised house sits over a garage at the street
            gw = min(2.6, L - 2.2)
            cand = [f for f in [(0.4, L - 0.4)] if f[1] - f[0] > gw + 1.3]
            if cand:
                g0 = cand[0][0] if c['rd'].side('garside', rng) else cand[0][1] - gw
                garage_u = (g0, g0 + gw)
                holes.append((g0, g0 + gw, zg + 0.05, zg + 2.3))
                w.rect('door', g0, g0 + gw, zg + 0.05, zg + 2.3, -0.12, mix(accent, (0.85, 0.84, 0.8), 0.6))
                garage_panels(w, g0, g0 + gw, zg, trim, mix(accent, (0.85, 0.84, 0.8), 0.6))
                w.box('trim', g0 - 0.12, g0 + gw + 0.12, zg + 2.3, zg + 2.45, 0.0, 0.08, trim)
                free = cut(free, garage_u, 0.2)
                free = [f for f in free if f[1] - f[0] > 1.3]
                # (25/09) the post-war flats: a second garage beside the first,
                # the entry beyond them
                if sub == 'postwar' and free:
                    f_ = max(free, key=lambda f: f[1] - f[0])
                    if f_[1] - f_[0] >= gw + 1.6:
                        g1 = f_[0] + 0.1 if f_[0] >= garage_u[1] else f_[1] - 0.1 - gw
                        holes.append((g1, g1 + gw, zg + 0.05, zg + 2.3))
                        w.rect('door', g1, g1 + gw, zg + 0.05, zg + 2.3, -0.12, mix(accent, (0.85, 0.84, 0.8), 0.6))
                        garage_panels(w, g1, g1 + gw, zg, trim, mix(accent, (0.85, 0.84, 0.8), 0.6))
                        w.box('trim', g1 - 0.12, g1 + gw + 0.12, zg + 2.3, zg + 2.45, 0.0, 0.08, trim)
                        free = [f for f in cut(free, (g1, g1 + gw), 0.2) if f[1] - f[0] > 1.3]
        if free and garage_u is not None and LOD >= 1 and TRACT:
            # (25/09) a house over its garage is entered from the street: a
            # recess beside the garage with the stair going up inside it (the
            # Sunset's tunnel entry, arched on the Spanish fronts; a square
            # porch on the others and the Edwardians) — the door no longer
            # hangs on the wall a storey up
            f_ = max(free, key=lambda f: f[1] - f[0])
            du0 = f_[0] + 0.15 if c['rd'].side('doorside', rng) else f_[1] - 1.15
            eu0, eu1 = max(f_[0], du0 - 0.1), min(f_[1], du0 + 1.1)
            holes.append((eu0, eu1, zg + 0.02, zg + 2.35))
            entry_recess(w, eu0, eu1, zg, c)
        elif free:
            f_ = max(free, key=lambda f: f[1] - f[0])
            du0 = f_[0] + 0.15 if c['rd'].side('doorside', rng) else f_[1] - 1.15
            door_u = (du0, du0 + 1.0)
            holes.append((door_u[0], door_u[1], first, first + 2.3))
            w.opening(door_u[0], door_u[1], first, first + 2.3, 'door', trim, 0.35, rng, accent)
            if style == 'vic' or sub == 'edwardian':
                w.box('trim', du0 - 0.25, du0 + 1.25, first + 2.35, first + 2.6, 0.0, 0.5, trim)       # an entry hood
            if LOD < 2: stoop(w, door_u[0] - 0.2, door_u[1] + 0.2, zg, first, trim, style)
            elif FINE and 0.35 <= first - zg <= 1.95:
                stoop_fine(w, door_u[0] - 0.22, door_u[1] + 0.22, zg, first, trim, body, style, b, c['ground'])
    # the entry of an apartment house: double doors in a surround, a canopy
    shop = is_front and b.get('shop') and (style != 'vic' or b.get('standin'))
    if is_front and style == 'block' and sub == 'apartment' and not shop and L > 6.0:
        free = [(0.5, L - 0.5)]
        for hu in bay_u:
            if hu[2] < first + 1.0: free = cut(free, hu, 0.3)
        free = [f for f in free if f[1] - f[0] > 2.4]
        if free:
            f_ = min(free, key=lambda f: abs((f[0] + f[1]) / 2 - L / 2))
            um = min(max(L / 2, f_[0] + 1.0), f_[1] - 1.0)
            door_u = (um - 0.8, um + 0.8)
            holes.append((door_u[0], door_u[1], zg + 0.3, zg + 2.7))
            w.opening(door_u[0], door_u[1], zg + 0.3, zg + 2.7, 'door', trim, 0.4, rng, mix(accent, (0.1, 0.08, 0.06), 0.5))
            if LOD < 2:
                for uu in (door_u[0] - 0.45, door_u[1] + 0.1):
                    w.box('trim', uu, uu + 0.35, zg, zg + 3.0, 0.0, 0.18, trim)                # pilasters
                w.box('trim', door_u[0] - 0.55, door_u[1] + 0.55, zg + 3.0, zg + 3.45, 0.0, 0.3, trim)
                w.box('metal', door_u[0] - 0.4, door_u[1] + 0.4, zg + 3.45, zg + 3.55, 0.0, 1.3, (0.12, 0.12, 0.12))
                w.box('stair', door_u[0] - 0.4, door_u[1] + 0.4, zg - 0.3, zg + 0.3, 0.0, 1.0, (0.70, 0.68, 0.64))
    # a storefront where the record says shop
    if shop:
        s0, s1 = 0.3, L - 0.3
        holes.append((s0, s1, zg + 0.4, zg + 3.2))
        w.opening(s0, s1, zg + 0.4, zg + 3.2, 'shop', trim, 0.3)
        if LOD >= 1: shopfronts(w, b, zg, trim, body)
        else:
            w.box('awning', s0, s1, zg + 3.2, zg + 3.5, 0.0, 1.2, accent)
            w.box('trim', 0.0, L, zg + 3.5, zg + 4.2, 0.0, 0.12, accent)    # sign band
    # windows: each floor, the rest of the wall
    gap_min = {'vic': 0.7, 'block': 0.9}.get(style, 1.0)
    # a punched-stone tower (24/09): reflective panes, low contrast with the
    # stone, and a string course at every floor, so the face reads as a
    # surface with a rhythm, not a static of dark dots
    tw_ = None
    if sub == 'tower' and style == 'block' and LOD >= 1:
        tr_ = random.Random(b['gid'] * 57 + 3)
        tw_ = tr_.choice(((0.40, 0.42, 0.43, 0.45), (0.46, 0.44, 0.40, 0.5), (0.34, 0.36, 0.38, 0.4), (0.52, 0.53, 0.54, 0.6)))
        band = mix(body, (1.0, 1.0, 1.0), 0.12)
        for f in range(1, nfl + 1):
            z = first + f * fh
            if z > eave - 0.3: break
            w.box(c['wall_mat'] or 'concrete', 0.0, L, z - 0.22, z + 0.12, 0.0, 0.1, band)
    for f in range(nfl):
        z0 = first + f * fh + sill; z1 = z0 + wh
        if z1 > eave - 0.2: break
        if shop and z0 < zg + 4.3: continue
        spans = [(0.3, L - 0.3)]
        for hu in bay_u:
            if z1 > hu[2] + 0.2: spans = cut(spans, hu, 0.4)
        if f == 0 and door_u: spans = cut(spans, door_u, 0.4)
        for s0, s1 in spans:
            if sub == 'sunset' and is_front and f == 0 and s1 - s0 > 3.0:
                # the picture window of a Sunset living room
                u0, u1 = s0 + 0.3, min(s1 - 0.3, s0 + 3.2)
                holes.append((u0, u1, z0 - 0.2, z1)); w.opening(u0, u1, z0 - 0.2, z1, 'tall', trim, 0.15, rng)
                continue
            k = int((s1 - s0) // (ww + gap_min))
            if not is_front and style != 'block': k = min(k, max(1, int((s1 - s0) // 3.2)))
            if k < 1: continue
            gap = (s1 - s0) / k
            for j in range(k):
                uc_ = s0 + gap * (j + 0.5)
                u0, u1 = uc_ - ww / 2, uc_ + ww / 2
                holes.append((u0, u1, z0, z1))
                if tw_: w.opening(u0, u1, z0, z1, 'tw', trim, 0.18, rng, body=tw_); continue
                w.opening(u0, u1, z0, z1, 'tall' if style == 'block' or sub in ('modern', 'postwar') else 'dh', trim, 0.18, rng, hood=hood)
                # balconies on a modern front
                if sub == 'modern' and is_front and f > 0 and j % 2 == 0 and LOD == 0:
                    w.box('concrete', u0 - 0.3, min(L - 0.2, u1 + gap + 0.3), z0 - sill - 0.15, z0 - sill, 0.0, 1.2, (0.8, 0.8, 0.78))
                    w.box('metal', u0 - 0.3, min(L - 0.2, u1 + gap + 0.3), z0 - sill, z0 - sill + 1.0, 1.15, 1.2, (0.12, 0.12, 0.13))
        if (style == 'vic' or sub == 'edwardian') and is_front and f > 0:
            if LOD < 2: w.box('trim', 0.0, L, first + f * fh - 0.06, first + f * fh + 0.12, 0.0, 0.06, trim)
            elif FINE: w.box('trim', 0.0, L, first + f * fh - 0.1, first + f * fh + 0.16, 0.0, 0.08, trim)
            else: w.rect('trim', 0.0, L, first + f * fh - 0.1, first + f * fh + 0.16, 0.035, trim)
    # a fire escape down the front of a pre-war apartment house
    if is_front and sub == 'apartment' and 1906 <= (b['year'] or 1950) < 1950 and nfl >= 3 and L > 8 and rng.random() < 0.55:      # (24/09: now at the city's LOD too — the fronts' black zigzag)
        free = [(0.6, L - 0.6)]
        for hu in bay_u: free = cut(free, hu, 0.25)
        free = [f for f in free if f[1] - f[0] > 2.8]
        if free:
            f_ = rng.choice(free); u0 = (f_[0] + f_[1]) / 2 - 1.4
            fire_escape(w, u0, u0 + 2.8, first, fh, nfl, eave, rng)
    return holes


def tower_skin(w, is_front, b, rng, c):
    """the skin of an office building on one wall: 'ribbon' — a band of
    glass on every floor between stone spandrels; 'piers' — glass strips
    between projecting stone piers, floor lines across; 'curtain' — tinted
    glass the whole height, mullions and floor lines over it. The lobby at
    the street is glass in every case."""
    L = w.L; zg, first, fh, nfl, eave = c['zg'], c['first'], c['fh'], c['nfl'], c['eave']
    body, gcol, fsys, wm = c['body'], c['gcol'], c['fsys'], c['wall_mat']
    dark = c.get('mull') or (0.10, 0.10, 0.11)          # (25/09) light mullions on the 2010s glass
    if L < 1.5: return
    # the lobby
    w.rect('shopglass', 0.3, L - 0.3, zg + 0.2, first + fh - 0.4, 0.03, (1, 1, 1))
    top = eave - 0.6
    if fsys == 'ribbon':
        for f in range(1, nfl):
            z0 = first + f * fh + 0.8; z1 = first + (f + 1) * fh - 0.3
            if z1 > top: break
            w.rect('curtain_wall', 0.25, L - 0.25, z0, z1, 0.03, gcol)
            if LOD < 2:
                for uu in frange(0.25, L - 0.25, 1.5): w.box('metal', uu - 0.03, uu + 0.03, z0, z1, 0.03, 0.08, dark)
    elif fsys == 'piers':
        H_ = HERO.get(b['gid'])
        s_ = L / max(1, round(L / (H_['pier'] if H_ else rng.choice((1.5, 2.2, 3.0, 3.0))))); pw = min(0.5, s_ * 0.3)
        k = 0; uu = 0.0
        while uu < L + 1e-3:
            w.box(wm, max(0.0, uu - pw / 2), min(L, uu + pw / 2), first + fh - 0.4, top, 0.0, 0.32, body)
            if uu + s_ <= L + 1e-3:
                w.rect('curtain_wall', uu + pw / 2, uu + s_ - pw / 2, first + fh - 0.4, top, 0.02, gcol)
            uu += s_
        if LOD < 2:
            for f in range(1, nfl):
                z = first + f * fh
                if z > top: break
                w.box(wm, 0.0, L, z - 0.3, z + 0.35, 0.0, 0.14, body)
    elif fsys == 'grid':
        # a precast frame (the 1960s-80s): deep piers and a spandrel at every
        # floor, the glass set back in each cell, so the low sun draws a grid
        # of shadows (the stone band and the pier both real relief)
        s_ = L / max(1, round(L / rng.choice((2.4, 3.0, 3.6)))); pw = min(0.45, s_ * 0.18)
        w.rect('curtain_wall', 0.0, L, first + fh - 0.4, top, 0.02, gcol)
        uu = 0.0
        while uu < L + 1e-3:
            w.box(wm, max(0.0, uu - pw / 2), min(L, uu + pw / 2), first + fh - 0.4, top, 0.0, 0.42, body); uu += s_
        for f in range(1, nfl + 1):
            z = first + f * fh
            if z > top: break
            w.box(wm, 0.0, L, z - 0.55, z + 0.35, 0.0, 0.34, body)
        w.box(wm, -0.05, L + 0.05, top, eave + 0.1, 0.0, 0.45, body)
    else:  # curtain
        # (BK_GLASS) the curtain wall's own grid and spandrels are in the material (alpha + 1 = spandrels on): only the
        # deeper mullion caps every 3 m stay as geometry, no floor bands (two floor rhythms would beat)
        w.rect('curtain_wall', 0.0, L, first + fh - 0.4, top, 0.02, (*gcol[:3], gcol[3] + 1.0) if BK.GLASS else gcol)
        step = 1.5 if LOD < 2 else 3.0
        for uu in frange(0.0, L, step): w.box('metal', uu - 0.035, uu + 0.035, first + fh - 0.4, top, 0.02, 0.12, dark)
        for f in (range(1, nfl + 1) if not BK.GLASS else ()):
            z = first + f * fh
            if z > top: break
            w.box('metal', 0.0, L, z - 0.05, z + 0.05, 0.02, 0.10, dark)
        w.box(wm, -0.05, L + 0.05, top, eave + 0.1, 0.0, 0.25, body)          # the crown band


# ── the port's finger-pier sheds (24/09) ────────────────────────────────────
# A shed is a record over the bay: a vertex past the OSM coastline, or its
# centre within 25 m of it, long (100 m and more), low (under 20 m), big.
# Per-pier overrides (the signature places agent): PIER_OVERRIDE[gid] =
# dict(bulkhead='beaux'|'plain'|'none', body=(r,g,b), trim=(r,g,b), number='31')
PIER_OVERRIDE = {}
_COAST = None


def _coast():
    global _COAST
    if _COAST is None:
        try:
            import numpy as np
            z = np.load('/Users/daniel/code/qipu-render-work/landmarks/coast_land.npz')
            _COAST = (z['sd_dm'], float(z['x0']), float(z['y1']), float(z['res']))
        except Exception as ex:
            print('pier_shed: no coast mask', ex); _COAST = False
    return _COAST


def coast_sd(x, y):
    """signed distance to the OSM coastline in metres, land positive (None off the grid)"""
    C_ = _coast()
    if not C_: return None
    sd, x0, y1, res = C_
    i = int((x - x0) / res); j = int((y1 - y) / res)
    if 0 <= j < sd.shape[0] and 0 <= i < sd.shape[1]: return sd[j, i] / 10.0
    return None


def pier_shed(b):
    """the record's pier-shed spec (a dict, maybe empty of overrides), or None.
    The port's own records (year 1896 or none on the roll, industrial or
    garage, by the water): a long shed over the bay, or the narrow bulkhead
    building along the seawall"""
    if b['gid'] in PIER_OVERRIDE: return dict(PIER_OVERRIDE[b['gid']])
    ov = b.get('places') if isinstance(b.get('places'), dict) else {}
    if ov.get('pier') is False: return None
    if ov.get('pier') or ov.get('bulkhead'):                 # the places agent's pier: its bulkhead and colours
        return {k: (hexcol(v) if isinstance(v, str) and v.startswith('#') else v) for k, v in ov.items() if k in ('bulkhead', 'bulk_body', 'bulk_trim', 'number')}
    if b['h'] > 20 or b['ty'] not in ('INDUSTRIAL', 'GARAGE', 'UNCLASSED', 'INSTITUTION') or b['year'] not in (None, 1896): return None
    r = b['ring']; n = len(r)
    if n < 4: return None
    e = max(range(n), key=lambda i: math.dist(r[i], r[(i + 1) % n]))
    ux, uy = r[(e + 1) % n][0] - r[e][0], r[(e + 1) % n][1] - r[e][1]; l_ = math.hypot(ux, uy); ux, uy = ux / l_, uy / l_
    us = [x * ux + y * uy for x, y in r]; vs = [-x * uy + y * ux for x, y in r]
    A, B = max(us) - min(us), max(vs) - min(vs)
    c0 = coast_sd(b['cx'], b['cy'])
    if c0 is None or c0 > 100: return None
    # the Embarcadero's run of Beaux-Arts bulkheads: Pier 45 to Pier 48;
    # elsewhere (Fort Mason, Pier 70, the islands) a shed without one
    emb = 1550 < b['cx'] < 4700 and 2300 < b['cy'] < 5800
    if A >= 100 and B >= 12: return {} if emb else {'bulkhead': 'none'}   # a shed
    if emb and A >= 40 and B <= 32 and A / max(B, 1.0) >= 2.5: return {'front': True}   # a bulkhead building
    return None


def pier_wall(w, is_front, b, c):
    """a pier shed's long wall along its apron: blank painted sheet between
    shallow pilasters, a clerestory band of steel sash under the eave, big
    rolling doors every twenty-odd metres"""
    L = w.L; zg, eave = c['zg'], c['eave']; body, trim, accent, wm = c['body'], c['trim'], c['accent'], c['wall_mat']
    if L < 2.0 or w is c.get('bulk_w'): return
    r = random.Random(b['gid'] * 71 + int(L * 10))
    pil = mix(body, (0.0, 0.0, 0.0), 0.08)
    step = r.uniform(6.5, 8.5); k = max(1, round(L / step)); p = L / k
    for j in range(k + 1):
        u = min(max(j * p, 0.3), L - 0.3)
        w.box(wm, u - 0.3, u + 0.3, zg, eave - 0.2, 0.0, 0.18, pil)
    # the clerestory: sash between the pilasters, a sill and a head
    z0, z1 = eave - 2.6, eave - 0.9
    if z0 > zg + 5.8:
        for j in range(k):
            u0, u1 = j * p + 0.45, (j + 1) * p - 0.45
            w.rect('glass', u0, u1, z0, z1, 0.03, (1, 1, 1))
            for uu in frange(u0 + 1.2, u1 - 0.6, 1.2): w.rect('trim', uu - 0.05, uu + 0.05, z0, z1, 0.035, trim)
        w.box('trim', 0.0, L, z0 - 0.25, z0, 0.0, 0.12, trim); w.box('trim', 0.0, L, z1, z1 + 0.2, 0.0, 0.08, trim)
    # rolling doors on the apron, every 20-30 m, and a man door now and then
    dh = min(5.2, eave - zg - 3.2)
    if dh > 3.0:
        nd = max(1, int(L / r.uniform(20.0, 30.0))); 
        for j in range(nd):
            uc = (j + 0.5) * L / nd; dw = min(6.0, p - 1.0)
            if dw < 3: continue
            u0 = uc - dw / 2
            w.rect('door', u0, u0 + dw, zg + 0.05, zg + dh, 0.2, accent)
            w.box('metal', u0 - 0.15, u0 + dw + 0.15, zg + dh, zg + dh + 0.45, 0.0, 0.35, mix(accent, (0, 0, 0), 0.3))
            if r.random() < 0.5: w.rect('door', uc + dw / 2 + 1.2, uc + dw / 2 + 2.2, zg + 0.05, zg + 2.3, 0.2, (0.28, 0.30, 0.30))


def bulk_wall(walls):
    """the wall facing the land: its middle, 8 m out, furthest onto it"""
    cand = [w for w in walls if w.L > 12]
    if not cand: return None
    def land(w):
        m = (w.a + w.b) / 2 + w.n * 8.0; v = coast_sd(m.x, m.y); return v if v is not None else -1e9
    return max(cand, key=land)


def bulkhead(wb, PS, zg, top, ctx):
    """the port's face to the Embarcadero, the Beaux-Arts bulkheads of 1908-
    1930: a frontispiece standing clear of the shed in cream stucco, and on
    it, a pier's width apart (one on a short end), a great arched portal
    between paired pilasters under a raised centre that carries the pier's
    number panel; arched windows between, a cornice over all ('plain': the
    frontispiece, the portals and the cornice)"""
    L = wb.L; cream = PS.get('bulk_body') or (0.91, 0.88, 0.80); tr = PS.get('bulk_trim') or mix(cream, (1, 1, 1), 0.3)
    H = top + 2.4; D = 0.9; beaux = PS.get('bulkhead', 'beaux') == 'beaux'
    wb.box('stucco', -0.2, L + 0.2, zg - 0.3, H, 0.0, D, cream)                       # the frontispiece
    wb.box('trim', -0.5, L + 0.5, H - 0.1, H + 0.45, 0.0, D + 0.6, tr)                 # its cornice
    wb.box('trim', -0.3, L + 0.3, H - 0.9, H - 0.6, 0.0, D + 0.25, tr)                 # the frieze's lower band
    wb.box('trim', -0.2, L + 0.2, zg - 0.3, zg + 1.0, 0.0, D + 0.12, mix(cream, (0.5, 0.48, 0.44), 0.35))   # the base
    nm = max(1, round(L / 70.0)); pm = L / nm
    for k in range(nm):
        um = (k + 0.5) * pm
        pw = min(12.0, pm * 0.32); rad = pw / 2; zs = zg + min(7.0, (top - zg) * 0.55)
        pts = [(um - rad, zg + 0.1), (um + rad, zg + 0.1)] + [(um + rad * math.cos(math.pi * j / 12), zs + rad * math.sin(math.pi * j / 12)) for j in range(13)]
        wb.o.poly('door', [wb.P(u, z, D + 0.02) for u, z in pts], (0.16, 0.17, 0.17))
        for j in range(12):
            a0, a1 = math.pi * j / 12, math.pi * (j + 1) / 12
            q = [(um + rad * math.cos(a0), zs + rad * math.sin(a0)), (um + rad * math.cos(a1), zs + rad * math.sin(a1)),
                 (um + (rad + 0.7) * math.cos(a1), zs + (rad + 0.7) * math.sin(a1)), (um + (rad + 0.7) * math.cos(a0), zs + (rad + 0.7) * math.sin(a0))]
            wb.o.poly('trim', [wb.P(u, z, D + 0.08) for u, z in q], tr)
        # the raised centre over the portal and its number panel
        cw = rad + (2.5 if beaux else 1.2)
        wb.box('stucco', um - cw, um + cw, H + 0.45, H + (2.4 if beaux else 1.2), 0.0, D, cream)
        wb.box('trim', um - cw - 0.3, um + cw + 0.3, H + (2.4 if beaux else 1.2), H + (2.75 if beaux else 1.5), 0.0, D + 0.4, tr)
        if beaux:
            wb.rect('door', um - 3.0, um + 3.0, H + 0.8, H + 2.0, D + 0.02, (0.20, 0.30, 0.26))
            wb.rect('trim', um - 1.2, um + 1.2, H + 1.05, H + 1.75, D + 0.04, (0.92, 0.90, 0.84))
            for uu in (um - rad - 2.2, um - rad - 1.2, um + rad + 0.4, um + rad + 1.4):          # paired pilasters
                if 0 <= uu <= L - 0.8: wb.box('trim', uu, uu + 0.8, zg + 1.0, H - 0.9, D, D + 0.35, tr)
    if beaux:
        # arched windows along the rest of the front, one every 7-8 m
        for k in range(nm):
            for side in (-1, 1):
                um = (k + 0.5) * pm; a_ = um + side * (min(12.0, pm * 0.32) / 2 + 3.5); b_ = (k + (1 if side > 0 else 0)) * pm - side * 1.5
                lo, hi = min(a_, b_), max(a_, b_)
                if hi - lo < 3.0: continue
                nw = max(1, int((hi - lo) / 7.5)); st = (hi - lo) / nw
                for j in range(nw):
                    uc = lo + (j + 0.5) * st; ww = min(2.6, st * 0.45); z0, z1 = zg + 2.4, zg + min(6.5, (top - zg) * 0.6)
                    wb.rect('glass', uc - ww / 2, uc + ww / 2, z0, z1, D + 0.03, (1, 1, 1))
                    wb.o.poly('glass', [wb.P(uc + ww / 2 * math.cos(math.pi * i / 8), z1 + ww / 2 * math.sin(math.pi * i / 8), D + 0.03) for i in range(9)], (1, 1, 1))
                    wb.rect('trim', uc - ww / 2 - 0.2, uc + ww / 2 + 0.2, z0 - 0.3, z0, D + 0.05, tr)


def pier_roof(ring, deck, top, b, out, c):
    """a shed's roof: the membrane (the flat path's), and down its length a
    raised monitor with clerestory glass both sides, where the plan is near
    its rectangle; skylight strips across it otherwise"""
    n = len(ring)
    e = max(range(n), key=lambda i: math.dist(ring[i], ring[(i + 1) % n]))
    au = Vector((ring[(e + 1) % n][0] - ring[e][0], ring[(e + 1) % n][1] - ring[e][1], 0)).normalized(); av = Vector((-au.y, au.x, 0))
    us = [x * au.x + y * au.y for x, y in ring]; vs = [x * av.x + y * av.y for x, y in ring]
    u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
    Z = Vector((0, 0, 1)); P = lambda u, v, z: au * u + av * v + Z * z
    if ring_area(ring) >= 0.78 * (u1 - u0) * (v1 - v0):
        wv = (v1 - v0) * 0.28; vm = (v0 + v1) / 2; h = 1.8
        a0, a1 = u0 + 4.0, u1 - 4.0
        out.box3(c['wall_mat'], P(a0, vm - wv / 2, deck), au * (a1 - a0), av * wv, Z * h, c['body'])
        for side in (vm - wv / 2 - 0.02, vm + wv / 2 + 0.02):
            out.poly('glass', [P(a0 + 0.4, side, deck + 0.4), P(a1 - 0.4, side, deck + 0.4), P(a1 - 0.4, side, deck + h - 0.3), P(a0 + 0.4, side, deck + h - 0.3)], (1, 1, 1))
        out.box3('roof_flat', P(a0 - 0.3, vm - wv / 2 - 0.4, deck + h), au * (a1 - a0 + 0.6), av * (wv + 0.8), Z * 0.15, c['rc'])
    else:
        # skylight strips across the shed, every 12 m, where they fall inside
        def inside(x, y):
            k = False
            for i in range(n):
                (x1, y1), (x2, y2) = ring[i], ring[(i + 1) % n]
                if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): k = not k
            return k
        for uu in frange(u0 + 6, u1 - 6, 12.0):
            vv = v0 + 2.0
            while vv < v1 - 2.0:
                p0 = P(uu, vv, 0); p1 = P(uu, vv + 4.0, 0)
                if inside(p0.x, p0.y) and inside(p1.x, p1.y):
                    out.poly('curtain', [P(uu - 0.6, vv, deck + 0.3), P(uu + 0.6, vv, deck + 0.3), P(uu + 0.6, vv + 4.0, deck + 0.3), P(uu - 0.6, vv + 4.0, deck + 0.3)], (0.80, 0.82, 0.80))   # wired glass gone milky
                vv += 9.0


def works_front(w, is_front, b, c):
    """a works wall: pilasters every five to seven metres (real relief on
    the street walls, so the low sun draws their shadows), a steel-sash
    window in each bay — dark glass, or wired and whitewashed glass gone
    milky — a clerestory band on a one-storey shed; at the street roll-up
    doors, one of them on a loading dock under a steel canopy, and a
    personnel door"""
    L = w.L; zg, first, fh, nfl, eave = c['zg'], c['first'], c['fh'], c['nfl'], c['eave']
    body, trim, accent, wm = c['body'], c['trim'], c['accent'], c['wall_mat']
    if L < 2.5: return
    r = random.Random(b['gid'] * 389 + int(L * 7))
    br = random.Random(b['gid'] * 211 + 1)               # the building's own habits, the same on every wall
    pitch = br.uniform(5.2, 7.0); milky = br.random() * 0.8; painted = br.random() < 0.15
    nb = max(1, round(L / pitch)); p = L / nb
    pil = mix(body, (0.0, 0.0, 0.0), 0.10) if wm != 'brick' else body
    for k in range(nb + 1):
        u = min(max(k * p, 0.25), L - 0.25)
        if is_front: w.box(wm, u - 0.25, u + 0.25, zg - 0.3, eave, 0.0, 0.22, pil)
        elif LOD < 2 or k % 2 == 0: w.rect(wm, u - 0.22, u + 0.22, zg - 0.3, eave, 0.03, pil)
    # the street doors
    doors = {}
    if is_front and eave - zg > 3.4:
        nd = 1 if L < 14 else (2 if L < 30 else 3)
        order = sorted(range(nb), key=lambda k: (abs(k + 0.5 - nb / 2) + r.random() * 1.5))
        dh = min(4.3, eave - zg - 1.0, max(3.2, fh - 0.8) if nfl > 1 else 4.3)
        for j, k in enumerate(order[:nd]):
            dw = min(p - 1.1, 4.2)
            if dw < 2.4: continue
            u0 = k * p + (p - dw) / 2; dock = j == 0 and L > 12 and r.random() < 0.45
            z0 = zg + (1.2 if dock else 0.05); z1 = min(z0 + dh, eave - 0.6)
            w.rect('door', u0, u0 + dw, z0, z1, 0.04, accent)
            w.rect('metal', u0 - 0.1, u0 + dw + 0.1, z1, z1 + 0.35, 0.05, (0.30, 0.31, 0.32))       # the roll housing
            if dock:
                w.box('concrete', u0 - 0.8, u0 + dw + 0.8, zg - 0.3, zg + 1.2, 0.0, 1.9, (0.70, 0.69, 0.66))
                w.box('metal', u0 - 1.0, u0 + dw + 1.0, z1 + 0.35, z1 + 0.5, 0.0, 2.4, (0.44, 0.45, 0.46))
            doors[k] = z1 + 0.5
        free = [k for k in range(nb) if k not in doors]
        if free:
            k = r.choice(free); u0 = k * p + p / 2 - 0.5
            w.rect('door', u0, u0 + 1.0, zg + 0.05, zg + 2.2, 0.04, (0.26, 0.27, 0.28)); doors[k] = zg + 2.6
    # the steel sash in each bay, floor by floor (a clerestory on a shed)
    rows = []
    if nfl <= 1:
        z0 = max(zg + 2.8, eave - 2.6); z1 = eave - 0.8
        if z1 - z0 > 0.9: rows.append((z0, z1))
    else:
        for f in range(nfl):
            z0 = first + f * fh + 0.8; z1 = first + (f + 1) * fh - 0.45
            if z1 > eave - 0.4: break
            if z1 - z0 > 0.9: rows.append((z0, z1))
    for k in range(nb):
        ww = p - 1.3
        if ww < 1.0: continue
        u0 = k * p + 0.65
        for (z0, z1) in rows:
            if k in doors and z0 < doors[k]: continue
            if not is_front and r.random() < 0.35: continue
            x_ = r.random()
            if painted and x_ < 0.5: continue                                               # painted over
            if x_ < milky: w.rect('curtain', u0, u0 + ww, z0, z1, 0.03, r.choice(((0.70, 0.72, 0.68), (0.62, 0.64, 0.60), (0.76, 0.76, 0.72))))
            else: w.rect('glass', u0, u0 + ww, z0, z1, 0.03, (1, 1, 1))
            w.rect('trim', u0 - 0.1, u0 + ww + 0.1, z0 - 0.18, z1 + 0.1, 0.015, trim)              # the steel frame and sill


def works_roof(kind, ring, top, ax_u, ax_v, rc, c, out):
    """over the works' rectangle: 'saw' — teeth 6-8 m apart, the glazed
    face turned north; 'barrel' — a bow-truss arc across the short span,
    its ends closed in the wall. The measured roof colour on the slopes."""
    us = [x * ax_u.x + y * ax_u.y for x, y in ring]; vs = [x * ax_v.x + y * ax_v.y for x, y in ring]
    u0, u1, v0, v1 = min(us) + 0.1, max(us) - 0.1, min(vs) + 0.1, max(vs) - 0.1
    # A: the ridges' axis (the long one), B: across
    if u1 - u0 >= v1 - v0: A, B, a0, a1, b0, b1 = ax_u, ax_v, u0, u1, v0, v1
    else: A, B, a0, a1, b0, b1 = ax_v, ax_u, v0, v1, u0, u1
    P = lambda a, b_, z: Vector((A.x * a + B.x * b_, A.y * a + B.y * b_, z))
    wm, body = c['wall_mat'], c['body']
    z = top + 0.05
    if kind == 'saw':
        nt = max(2, round((b1 - b0) / 7.0)); pt = (b1 - b0) / nt; hs = min(2.4, pt * 0.34)
        north = B.y >= 0                                   # the glass faces +B if +B is the northern side
        for j in range(nt):
            lo, hi = b0 + j * pt, b0 + (j + 1) * pt
            bl, bh = (lo, hi) if north else (hi, lo)       # the slope rises from bl to bh, the glass stands at bh
            out.poly('roof_flat', [P(a0, bl, z), P(a1, bl, z), P(a1, bh, z + hs), P(a0, bh, z + hs)], rc)
            out.poly('glass', [P(a0, bh, z + hs), P(a1, bh, z + hs), P(a1, bh, z), P(a0, bh, z)], (1, 1, 1))
            out.poly('trim', [P(a0, bh, z + hs), P(a1, bh, z + hs), P(a1, bh, z + hs - 0.15), P(a0, bh, z + hs - 0.15)], c['trim'])
            for a in (a0, a1): out.poly(wm, [P(a, bl, z), P(a, bh, z), P(a, bh, z + hs)], body)
    else:
        span = b1 - b0; rise = min(0.16 * span, 4.5); ns = 10
        pts = [(b0 + span * k / ns, z + rise * (1 - (2 * k / ns - 1) ** 2)) for k in range(ns + 1)]
        for k in range(ns):
            (ba, za), (bb, zb) = pts[k], pts[k + 1]
            out.poly('roof_flat', [P(a0, ba, za), P(a1, ba, za), P(a1, bb, zb), P(a0, bb, zb)], rc)
        for a in (a0, a1):
            out.poly(wm, [P(a, bb, zz) for bb, zz in pts], body)
            out.poly('trim', [P(a, bb, zz + 0.12) for bb, zz in pts] + [P(a, bb, zz) for bb, zz in pts[::-1]], c['trim'])


def fire_escape(w, u0, u1, first, fh, nfl, eave, rng):
    """black steel platforms at each floor from the second, rails, and the
    stairs running down between them"""
    col = (0.10, 0.10, 0.11); D = 0.95
    o = w.o; Z = Vector((0, 0, 1))
    for f in range(1, nfl):
        z = first + f * fh - 0.08
        if z > eave - 1.0: break
        w.box('metal', u0, u1, z - 0.06, z, 0.02, D, col)                             # the grating
        w.box('metal', u0, u1, z + 0.95, z + 1.0, D - 0.04, D, col)                   # top rail
        if LOD >= 1: w.rect('curtain', u0, u1, z, z + 0.95, D - 0.02, (0.16, 0.16, 0.17))            # the balusters, as a veil
        else: w.box('metal', u0, u1, z + 0.45, z + 0.48, D - 0.04, D, col)
        for uu in (u0, u1 - 0.04): w.box('metal', uu, uu + 0.04, z, z + 1.0, 0.02, D, col)
        if LOD == 0:
            for uu in frange(u0, u1 - 0.03, 0.35): w.box('metal', uu, uu + 0.025, z, z + 1.0, D - 0.035, D - 0.01, col)
        # the stair down to the platform below (none under the lowest: a drop ladder)
        if f > 1:
            zl = z - fh; run = min(u1 - u0 - 0.4, fh / math.tan(math.radians(55)))
            p0 = w.P(u0 + 0.2, zl + 0.02, 0.15)
            o.box3('metal', p0, w.t * run + Z * (fh - 0.05), w.n * 0.55, Z * 0.06, col)
        else:
            w.box('metal', u0 + 0.3, u0 + 0.36, z - 2.2, z, D - 0.3, D - 0.25, col)
            w.box('metal', u0 + 0.74, u0 + 0.8, z - 2.2, z, D - 0.3, D - 0.25, col)



def cut(spans, hu, pad):
    ns = []
    for s0, s1 in spans:
        if hu[1] + pad <= s0 or hu[0] - pad >= s1: ns.append((s0, s1)); continue
        if hu[0] - pad > s0: ns.append((s0, hu[0] - pad))
        if hu[1] + pad < s1: ns.append((hu[1] + pad, s1))
    return ns


def mix(a, b, t): return tuple(x * (1 - t) + y * t for x, y in zip(a, b))


def saturate(c, k):
    import colorsys
    h, l_, s_ = colorsys.rgb_to_hls(*c[:3])
    return colorsys.hls_to_rgb(h, l_, min(1.0, s_ * k))


STYLE_OF_SUB = {'queen': 'vic', 'italianate': 'vic', 'stick': 'vic', 'edwardian': 'stucco', 'med': 'stucco', 'sunset': 'midcentury',
                'modern': 'midcentury', 'apartment': 'block', 'commercial': 'block', 'tower': 'block', 'works': 'block'}


def hexcol(h):
    """'#rrggbb' (sRGB) -> a display colour, as the palettes are written"""
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def unmauve(c):
    """a measured roof reading pink, mauve or violet (the photo's red tile or
    brown shingle through the haze): its hue turned to a red-brown, its
    saturation halved"""
    import colorsys
    h, l_, s_ = colorsys.rgb_to_hls(*[max(0.0, v) for v in c[:3]])
    if 0.72 < h < 0.99 and s_ > 0.04: return list(colorsys.hls_to_rgb(0.04, l_, s_ * 0.5))
    return list(c[:3])


def unviolet(c):
    """lilac and violet paint read loud from the air: their saturation cut"""
    import colorsys
    h, l_, s_ = colorsys.rgb_to_hls(*c[:3])
    if 0.66 < h < 0.95: s_ *= 0.6
    return colorsys.hls_to_rgb(h, l_, s_)


def bay(w, u0, u1, z0, z1, c, rng, kind):
    """a bay window: canted ('slant'), square, or a shallow box around the
    picture window of a Sunset house; windows in each face, its own cornice"""
    out = w.o; trim, body, style, sub = c['trim'], c['body'], c['style'], c['sub']
    fh, nfl, first = c['fh'], c['nfl'], c['first']
    d = 0.95 if kind not in ('box', 'barrel') else (0.5 if kind == 'box' else 0.85)   # (24/09: 0.75 was two pixels; SF bays stand about a metre out)
    inset = 0.6 if kind == 'slant' else 0.0
    A, B = w.P(u0, 0, 0), w.P(u1, 0, 0)
    C, D = w.P(u1 - inset, 0, d), w.P(u0 + inset, 0, d)
    if kind == 'barrel':
        # (25/09) the Spanish front's barrel bay: a half-round in six faces
        pts_b = [w.P(u0 + (u1 - u0) * (1 - math.cos(math.pi * k / 6)) / 2, 0, d * math.sin(math.pi * k / 6)) for k in range(7)]
    else:
        pts_b = [A, D, C, B]
    faces = list(zip(pts_b, pts_b[1:]))
    wm = c['wall_mat'] if c['wall_mat'] in ('siding', 'stucco') else 'stucco'
    wh = min(2.3, fh * 0.62) if kind not in ('box', 'barrel') else (1.5 if kind == 'box' else min(1.8, fh * 0.6))
    sill = (fh - wh) * 0.45
    for (p, q) in faces:
        fw = Wall((p.x, p.y), (q.x, q.y), out)
        if fw.L < 0.05: continue
        holes = []
        nfl_b = nfl if kind not in ('box', 'barrel') else 1
        for f in range(nfl_b):
            a0 = first + f * fh + sill; a1 = a0 + wh
            if a1 > z1 - 0.2: break
            m = 0.18 if fw.L > 1.2 else 0.14
            if fw.L - 2 * m < 0.3: continue
            holes.append((m, fw.L - m, a0, a1))
            fw.opening(m, fw.L - m, a0, a1, 'dh' if kind not in ('box', 'barrel') else 'tall', trim, 0.12, rng, hood=c['hood'] if kind == 'square' else None)
            if f > 0 and (LOD < 2 or FINE): fw.box('trim', 0.0, fw.L, first + f * fh - 0.05, first + f * fh + 0.1, 0.0, 0.06, trim)
        fw.wall_with_holes(wm, 0.0, fw.L, z0 - 0.5, z1, holes, body)
        if FINE and kind not in ('box', 'barrel'):
            # (25/09, level 9) the bay reads by its trim: a light board up each
            # angle, a frieze under a deeper cornice, small brackets under it
            fw.box('trim', -0.04, 0.12, z0 - 0.5, z1, 0.0, 0.05, trim); fw.box('trim', fw.L - 0.12, fw.L + 0.04, z0 - 0.5, z1, 0.0, 0.05, trim)
            fw.rect('trim', 0.0, fw.L, z1 - 0.85, z1 - 0.5, 0.02, trim)
            fw.box('trim', -0.08, fw.L + 0.08, z1 - 0.5, z1, 0.0, 0.55, trim)
            for uu in frange(0.15, fw.L - 0.15, 0.55): fw.box('trim', uu - 0.05, uu + 0.05, z1 - 0.85, z1 - 0.5, 0.0, 0.35, trim)
        else:
            fw.box('trim', -0.05, fw.L + 0.05, z1 - 0.45, z1, 0.0, 0.42, trim)          # the bay's cornice
        if LOD < 2 or FINE: fw.box('trim', -0.02, fw.L + 0.02, z0 - 0.5, z0 - 0.3, 0.0, 0.1, trim)      # its base
        if style == 'vic' and kind == 'slant' and LOD == 0:
            fw.box('trim', fw.L * 0.2, fw.L * 0.8, z0 - 1.0, z0 - 0.5, 0.0, 0.08, trim)   # a panel under the bay
    for z, up in ((z1, True), (z0 - 0.5, False)):
        pl = [Vector((p.x, p.y, z)) for p in [A, B] + pts_b[-2:0:-1]]
        out.poly('trim', pl[::-1] if up else pl, trim)
    # a small tiled hood over the bay of a Mediterranean or Sunset house
    if sub in ('med', 'sunset'):
        e0, e1 = w.P(u0 - 0.2, z1 + 0.05, d + 0.35), w.P(u1 + 0.2, z1 + 0.05, d + 0.35)
        k0, k1 = w.P(u0 - 0.2, z1 + 0.7, 0.0), w.P(u1 + 0.2, z1 + 0.7, 0.0)
        out.poly('roof_tile', [e0, e1, k1, k0], (1, 1, 1))


SV_W = {'early': (('spanish', 0.5), ('plain', 0.35), ('provincial', 0.15)),                         # 1918-35
        'late': (('spanish', 0.3), ('streamline', 0.35), ('provincial', 0.25), ('plain', 0.1)),     # 1936-45
        'post': (('provincial', 0.4), ('plain', 0.4), ('streamline', 0.2))}                          # 1946-61
def sunset_front(b, sub, RP):
    """the builder's front design of a tract house: its own weighted draw, or
    in a run the run's two or three designs taken in turn (never twice side by side)"""
    y = b['year'] or 1940
    W = SV_W['early' if y < 1936 else ('late' if y < 1946 else 'post')]
    def draw(r, pool):
        t = r.random() * sum(w_ for _, w_ in pool); acc = 0.0
        for k, (n_, w_) in enumerate(pool):
            acc += w_
            if t <= acc: return k
        return len(pool) - 1
    if RP:
        r = random.Random(f'{RP[0]}:front'); pool = list(W); order = []
        n_ = 2 if r.random() < 0.5 else 3
        while pool and len(order) < n_: order.append(pool.pop(draw(r, pool))[0])
        return order[RP[1] % len(order)]
    return W[draw(random.Random(b['gid'] * 353 + 41), list(W))][0]


def front_pent(wf, top, trim, body, out, r):
    """the 1940s-50s front: a pent roof across the whole front, shingle (or
    tile) over a light fascia, its cheeks at the ends — from the air the grey
    or red band at the street edge of a Sunset roof"""
    zl, zh, wo, wi = top - 0.95, top + 0.4, 0.42, -1.25
    if r.random() < 0.7: mat, col = 'roof_shingle', r.choice(((0.80, 0.80, 0.82), (0.95, 0.94, 0.95), (0.70, 0.70, 0.72), (1.10, 1.0, 0.92)))
    else: mat, col = 'roof_tile', r.choice(TILE_TINTS)
    out.poly(mat, [wf.P(-0.1, zl, wo), wf.P(wf.L + 0.1, zl, wo), wf.P(wf.L + 0.1, zh, wi), wf.P(-0.1, zh, wi)], col)
    out.poly('trim', [wf.P(-0.1, zl - 0.2, wo), wf.P(wf.L + 0.1, zl - 0.2, wo), wf.P(wf.L + 0.1, zl, wo), wf.P(-0.1, zl, wo)], trim)
    out.poly('trim', [wf.P(-0.1, zl - 0.2, wo), wf.P(wf.L + 0.1, zl - 0.2, wo), wf.P(wf.L + 0.1, zl - 0.2, 0.0), wf.P(-0.1, zl - 0.2, 0.0)], trim)
    for uu in (-0.1, wf.L + 0.1): out.poly('stucco', [wf.P(uu, zl, wo), wf.P(uu, zh, wi), wf.P(uu, zl, wi)], body)


def entry_recess(w, u0, u1, zg, c):
    """the street entry of a house over its garage: a recess 1.5 m deep, its
    walls in their own shade, the stair rising inside (tiled or terrazzo
    steps), arched on a Spanish front, framed square on the others"""
    D, zt = 1.5, zg + 2.35
    body, trim, sv = c['body'], c['trim'], c.get('sv')
    wm = c['wall_mat'] if c['wall_mat'] in ('stucco', 'siding') else 'stucco'
    shade = mix(body, (0.22, 0.21, 0.2), 0.5)
    w.o.poly(wm, [w.P(u0, zg - 0.3, 0.0), w.P(u0, zt, 0.0), w.P(u0, zt, -D), w.P(u0, zg - 0.3, -D)], shade)
    w.o.poly(wm, [w.P(u1, zg - 0.3, 0.0), w.P(u1, zg - 0.3, -D), w.P(u1, zt, -D), w.P(u1, zt, 0.0)], shade)
    w.o.poly(wm, [w.P(u0, zt, 0.0), w.P(u1, zt, 0.0), w.P(u1, zt, -D), w.P(u0, zt, -D)], mix(shade, (0.1, 0.1, 0.1), 0.3))
    w.rect('door', u0, u1, zg - 0.3, zt, -D + 0.01, (0.13, 0.12, 0.11))
    tc = (0.60, 0.32, 0.24) if sv == 'spanish' else (0.72, 0.70, 0.66)
    w.box('stair', u0, u1, zg - 0.3, zg + 0.03, -0.4, 0.0, tc)
    for k in range(4):
        w.box('stair', u0 + 0.02, u1 - 0.02, zg - 0.3, zg + 0.03 + 0.17 * (k + 1), -0.4 - 0.27 * (k + 1), -0.4 - 0.27 * k, tc)
    if sv in ('spanish', 'provincial'):
        # the arch: the wall's corners filled down to a half-round head (fans from each corner)
        r_ = (u1 - u0) / 2; zs = zt - r_; um = (u0 + u1) / 2
        for sg, cu in ((-1.0, u0), (1.0, u1)):
            arc = [(um + sg * r_ * math.cos(math.pi / 2 * k / 8), zs + r_ * math.sin(math.pi / 2 * k / 8)) for k in range(9)]
            for (ua, za), (ub, zb_) in zip(arc, arc[1:]):
                w.o.poly(wm, [w.P(cu, zt, 0.0), w.P(ua, za, 0.0), w.P(ub, zb_, 0.0)], body)
    else:
        w.box('trim', u0 - 0.12, u1 + 0.12, zt, zt + 0.14, 0.0, 0.08, trim)
        for uu in (u0 - 0.12, u1): w.box('trim', uu, uu + 0.12, zg, zt, 0.0, 0.06, trim)


def garage_panels(w, g0, g1, zg, trim, dcol):
    """the garage door's panel joints: LOD 0 its five rails; at level 9
    (FINE) four grooves, the door's colour in shadow, 6 cm: they read"""
    if LOD < 2:
        for k in range(5): w.box('trim', g0, g1, zg + 0.08 + k * 0.45, zg + 0.11 + k * 0.45, -0.12, -0.08, trim)
    elif FINE:
        for k in range(4): w.rect('door', g0 + 0.04, g1 - 0.04, zg + 0.5 + k * 0.45, zg + 0.56 + k * 0.45, -0.11, mix(dcol, (0.18, 0.18, 0.18), 0.5))


def stoop_fine(w, u0, u1, zg, zdoor, trim, body, style, b, ground):
    """(25/09, level 9) the entry stair of a raised house: a landing at the
    door, a straight flight down to the sidewalk and its two knee walls,
    capped. SF's Victorian and Edwardian stoops are painted wood (the trim's
    colour or a porch grey) or concrete and terrazzo; the side walls in the
    house's paint. The flight ends on the sidewalk's own height (the hills);
    its own draws, so the house's sequence stays"""
    r = random.Random(b['gid'] * 947 + 11)
    land, tr = 0.85, 0.25                          # a steep flight (rise 18.5 cm over 25): the Victorian stair
    # the sidewalk at the flight's foot, a first guess of its length
    n0 = max(2, int(round((zdoor - zg) / 0.185)))
    pf = w.P((u0 + u1) / 2, 0.0, land + (n0 - 1) * tr)
    try: zs = ground(pf.x, pf.y)
    except Exception: zs = zg
    rise = zdoor - zs
    if rise < 0.35: return                       # the sidewalk climbs to the door: no stair
    n = max(2, int(round(rise / 0.185)))           # risers
    wend = land + (n - 1) * tr
    x_ = r.random()
    tread = trim if x_ < 0.55 else ((0.74, 0.74, 0.73) if x_ < 0.8 else (0.80, 0.78, 0.74))     # pale: the diagonals the air sees
    zb = min(zs, zg) - 0.6
    w.box('stair', u0, u1, zb, zdoor, 0.0, land, tread)                       # the landing
    for s_ in range(n - 1):                                                    # the flight
        zt = zdoor - (s_ + 1) * rise / n
        w.box('stair', u0 + 0.12, u1 - 0.12, zb, zt, land + s_ * tr, land + (s_ + 1) * tr, tread)
    # the knee walls, their top 0.85 m over the treads, a cap in the trim
    wm = 'trim' if style == 'vic' else 'stucco'
    prof = [(0.0, zb), (wend, zb), (wend, zs + rise / n + 0.85), (land, zdoor + 0.85), (0.0, zdoor + 0.85)]
    kc = trim if style == 'vic' else body          # a Victorian's balustrade walls in the trim, a stucco house's in its body
    for uo, ui in ((u0, u0 + 0.12), (u1, u1 - 0.12)):
        w.o.poly(wm, [w.P(uo, z_, w_) for w_, z_ in prof], kc)
        w.o.poly(wm, [w.P(ui, z_, w_) for w_, z_ in prof[::-1]], kc)
        w.o.poly(wm, [w.P(uo, zb, wend), w.P(ui, zb, wend), w.P(ui, prof[2][1], wend), w.P(uo, prof[2][1], wend)], kc)
        sg = 1.0 if ui > uo else -1.0; ca, cb = uo - 0.03 * sg, ui + 0.03 * sg      # the cap, 3 cm proud each side
        for (w1, z1), (w2, z2) in ((prof[2], prof[3]), (prof[3], prof[4])):
            w.o.poly('trim', [w.P(ca, z1, w1), w.P(ca, z2, w2), w.P(cb, z2, w2), w.P(cb, z1, w1)], trim)


def stoop(w, u0, u1, zg, zdoor, trim, style):
    """stairs from the sidewalk up to a raised door, out from the wall"""
    rise = zdoor - zg
    if rise < 0.3: return
    nst = max(2, int(round(rise / 0.18)))
    run = 0.28
    for s in range(nst):
        zt = zdoor - s * rise / nst
        w.box('stair', u0, u1, zg - 0.3, zt, s * run, (s + 1) * run, (0.72, 0.70, 0.66) if style != 'vic' else (0.62, 0.58, 0.54))
    # a landing and two side walls / rails
    w.box('stair', u0 - 0.15, u1 + 0.15, zg - 0.3, zdoor, 0.0, 0.3, (0.66, 0.63, 0.58))
    if style == 'vic':
        for uu in (u0 - 0.15, u1):
            w.box('stair', uu, uu + 0.15, zg - 0.3, zdoor + 0.9, 0.0, nst * run, (0.80, 0.78, 0.74))


def emit(bpy, out, mats, name='gen'):
    """one mesh per material, with a face colour attribute 'bcol'"""
    objs = []
    for k, (V, F, C) in out.m.items():
        if not F: continue
        me = bpy.data.meshes.new(f'{name}.{k}')
        me.from_pydata(V, [], F)
        # colours first, THEN validate: validate drops degenerate faces and
        # takes their attribute rows with them — done the other way round,
        # every colour after the first dropped face belonged to its neighbour
        at = me.color_attributes.new('bcol', 'FLOAT_COLOR', 'FACE')
        flat = []
        for c in C: flat.extend((c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2, c[3] if len(c) > 3 else 1.0))
        at.data.foreach_set('color', flat)
        me.validate(clean_customdata=False)
        # BTEX_REAL (realcolour pilot, variant B; default off): UV 'rtex' into the projected-photo atlas (rc_tex.py)
        if ERA is None and __import__('os').environ.get('BTEX_REAL', '0') == '1':
            import rc_tex
            if k in rc_tex.FACADE_MATS: rc_tex.assign_uv(me)
        me.materials.append(mats[k] if k in mats else mats['roof_flat' if k == 'roof_big' else k])
        ob = bpy.data.objects.new(f'{name}.{k}', me)
        bpy.context.scene.collection.objects.link(ob); objs.append(ob)
    return objs
