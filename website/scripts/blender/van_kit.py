"""VANCOUVER'S BUILDING KIT (V-TYPES, 05/10): what gen_buildings draws for each Vancouver type (van_types.py).

Only another city reads this (gen_buildings: VK = None when CITY is unset = San Francisco, and when VAN_TYPES != 1).
A record whose gid is in <work>/lidar/types.json (VT_FILE) is drawn as its type: the generator's style / sub machinery
is given the type's levers (roof form, raised floor, cladding, windows, skin) and the type's own pieces are added:

  character_house    1900-45: steep front or side gable (or hip) from the LiDAR, lap siding, the front gable in
                     shingle, a deep front porch on brick piers with a shed roof, a dormer on a side-gable's front slope
  vancouver_special  1965-85: two-storey box, low hip / gable, brick lower storey on the street front, stucco above,
                     the centre balcony with aluminium pickets across the upper floor, wide sliders
  postwar_bungalow   1946-64 (and the low 1965-85 houses): one storey over a raised basement, low roof, picture window
  stucco_house       1986-2004: the big stucco house, hip roof, a two-storey entry portico
  modern_infill      2005+: flat / shed / plain gable, dark lap or panel cladding, big windows, entry canopy;
                     the mid-rise flavour (strata 2006+) with glass-guard balconies
  laneway_house      the small house on the lane: 1.5 storeys, dark siding, gable / shed / flat
  accessory          garages and sheds on the lane: a garage door on the lane wall, blank walls
  townhouse          a row of units: a door + canopy every ~5.5 m, pitched roof
  west_end_walkup    1946-79, 3-4 storeys: stucco, flat roof, small balconies, centred entry
  stucco_lowrise     1980-2005: the leaky-condo era's stucco blocks, hip / gable roofs, solid-front balconies
  concrete_tower     1950s-80s: concrete with balcony bands floor over floor (offices keep the SF office skins)
  point_tower        1990+: 'Vancouverism' — a slim curtain wall in green-blue or clear glass, white slab edges every
                     floor, glass-guard corner balconies
  podium             a tower's base / low commercial: shop glazing at the street, ribbon glass above, a planted roof
  heritage_brick     1890-1940 commercial and apartment blocks: brick, shops below, arched upper windows, cornice
  chinatown_society  Chinatown (HA-1/HA-1A) before 1940: painted brick, shops, the recessed balcony (loggia) on the top
                     floor, a name panel on the parapet
  institutional      schools, churches, halls: brick, wide windows, roof from the LiDAR
  industrial_shed    the generator's works sheds (pilasters, roll-up doors, saw-tooth / barrel / flat)
  granville_island_shed  the island's sheds: corrugated metal in strong colours, low gable roofs

Colours: <work>/look/colour/palettes.json (the colour agent, VT_PAL overrides), {type: {walls, trim, roof, glass:
[[r,g,b,weight], ...]}}; a missing type or channel takes PLACEHOLDER below (neutral, marked as such).
CONVENTION on every form and colour here; SOURCED: the type's inputs (van_types.py) and the LiDAR roof form / eave / ridge."""
import os, sys, json, math, random
from mathutils import Vector
import cityconf as CC

ON = os.environ.get('VAN_TYPES', '0') == '1' and not CC.SF
TYPES_FILE = os.environ.get('VT_FILE') or CC.work('lidar', 'types.json')
# the colour agent's palettes: VT_PAL, else a copy beside the types (lidar/*.json ships to the pods), else its own file (Mac only:
# look/ is not in lmk_pod.sh's city list)
PAL_FILE = os.environ.get('VT_PAL') or next((p for p in (CC.work('lidar', 'type_palettes.json'), CC.work('look', 'colour', 'palettes.json')) if os.path.exists(p)), CC.work('look', 'colour', 'palettes.json'))
VT, PAL = {}, {}

# ── the types' levers ──
# roofs: the draw when the LiDAR has no fit; pitch: degrees when it has none; raised: the first floor over the ground;
# mat: the cladding; win: (window width m, height as a share of the floor); area_lr: the largest footprint the LiDAR's
# pitched fit is drawn on (the generator's own limit is 800 m2, 500 for a block)
T = {
    'character_house':   dict(oh=0.5, style='vic', sub='craftsman', roofs=(('gable', 0.6), ('hip', 0.4)), pitch=42, raised=(1.0, 1.6), mat='siding', win=(0.9, 0.6), house=True),
    'vancouver_special': dict(style='midcentury', sub='vspecial', roofs=(('gable', 0.75), ('hip', 0.25)), pitch=16, side_gable=True, oh=0.75, raised=(0.25, 0.4), mat='stucco', win=(1.9, 0.46), tall=True, house=True),
    'postwar_bungalow':  dict(oh=0.6, style='midcentury', sub='bungalow', roofs=(('hip', 0.5), ('gable', 0.5)), pitch=24, raised=(0.6, 1.0), mat='stucco', win=(1.3, 0.5), tall=True, house=True),
    'stucco_house':      dict(oh=0.5, style='midcentury', sub='vstucco', roofs=(('hip', 0.8), ('gable', 0.2)), pitch=30, raised=(0.3, 0.6), mat='stucco', win=(1.2, 0.56), tall=True, house=True),
    'modern_infill':     dict(oh=0.25, style='midcentury', sub='infill', roofs=(('flat', 0.6), ('gable', 0.25), ('shed', 0.15)), pitch=24, raised=(0.2, 0.45), mat='siding', win=(1.7, 0.64), tall=True, house=True, area_lr=1500),
    'laneway_house':     dict(style='midcentury', sub='laneway', roofs=(('gable', 0.5), ('flat', 0.3), ('shed', 0.2)), pitch=32, raised=(0.15, 0.25), mat='siding', win=(1.2, 0.56), tall=True, house=True),
    'accessory':         dict(style='midcentury', sub='garage', roofs=(('gable', 0.4), ('hip', 0.2), ('flat', 0.4)), pitch=22, raised=(0.1, 0.1), mat='siding', win=(1.0, 0.4), tall=True, house=True),
    'townhouse':         dict(oh=0.45, style='midcentury', sub='townhouse', roofs=(('gable', 0.7), ('hip', 0.3)), pitch=30, raised=(0.4, 0.8), mat='siding', win=(1.2, 0.55), tall=True, house=True, area_lr=4000),
    'west_end_walkup':   dict(style='block', sub='apartment', roofs=(('flat', 1.0),), pitch=20, raised=(0.4, 0.9), mat='stucco', win=(1.5, 0.5), tall=True),
    'stucco_lowrise':    dict(style='block', sub='apartment', roofs=(('hip', 0.5), ('gable', 0.2), ('flat', 0.3)), pitch=26, raised=(0.3, 0.8), mat='stucco', win=(1.3, 0.5), tall=True, area_lr=4000),
    'concrete_tower':    dict(style='block', sub='tower', roofs=(('flat', 1.0),), pitch=0, raised=(0.4, 0.4), mat='concrete', win=(1.6, 0.6), tall=True),
    'point_tower':       dict(style='block', sub='tower', roofs=(('flat', 1.0),), pitch=0, raised=(0.4, 0.4), mat='concrete', win=(1.6, 0.7), tall=True),
    'podium':            dict(style='block', sub='commercial', roofs=(('flat', 1.0),), pitch=0, raised=(0.4, 0.4), mat='concrete', win=(1.8, 0.6), tall=True, shop=True),
    'heritage_brick':    dict(style='block', sub='commercial', roofs=(('flat', 1.0),), pitch=0, raised=(0.4, 0.4), mat='brick', win=(1.1, 0.62)),
    'chinatown_society': dict(style='block', sub='commercial', roofs=(('flat', 1.0),), pitch=0, raised=(0.4, 0.4), mat='brick', win=(1.0, 0.6), shop=True),
    'institutional':     dict(style='block', sub='inst', roofs=(('flat', 0.6), ('gable', 0.25), ('hip', 0.15)), pitch=30, raised=(0.5, 0.9), mat='brick', win=(2.2, 0.5), tall=True, area_lr=6000),
    'industrial_shed':   dict(style='block', sub='works', roofs=(('flat', 1.0),), pitch=0, raised=(0.4, 0.4), mat='concrete', win=(2.0, 0.4)),
    'granville_island_shed': dict(style='block', sub='works', roofs=(('gable', 0.7), ('flat', 0.3)), pitch=16, raised=(0.3, 0.3), mat='siding', win=(2.0, 0.4), area_lr=5000),
    'stucco_house_':     None,
}
T.pop('stucco_house_')
FALLBACK = {'stucco_house': 'stucco_lowrise', 'accessory': 'postwar_bungalow'}

# ── placeholder colours (display sRGB, weight): NEUTRAL STAND-INS until the colour agent's palettes.json, kept in each
# type's family so a test render reads the types; not measured ──
def _p(*c): return [list(x) for x in c]
PLACEHOLDER = {
    'character_house':   dict(walls=_p((0.80, 0.78, 0.72, 2), (0.36, 0.42, 0.40, 1), (0.30, 0.34, 0.42, 1), (0.62, 0.60, 0.56, 1), (0.84, 0.80, 0.66, 1), (0.48, 0.30, 0.26, 0.6), (0.92, 0.91, 0.87, 1)),
                              trim=_p((0.93, 0.92, 0.88, 3), (0.86, 0.82, 0.72, 1), (0.30, 0.30, 0.30, 0.5)), roof=_p((0.30, 0.30, 0.31, 2), (0.36, 0.32, 0.28, 1), (0.42, 0.42, 0.42, 1)), glass=_p((0.20, 0.22, 0.24, 1))),
    'vancouver_special': dict(walls=_p((0.92, 0.90, 0.86, 3), (0.86, 0.83, 0.76, 2), (0.78, 0.76, 0.72, 1)), trim=_p((0.48, 0.36, 0.26, 1), (0.92, 0.91, 0.88, 1)),
                              roof=_p((0.34, 0.30, 0.27, 2), (0.30, 0.30, 0.31, 1)), glass=_p((0.20, 0.22, 0.24, 1)), brick=_p((0.56, 0.34, 0.26, 2), (0.62, 0.58, 0.52, 1), (0.46, 0.30, 0.24, 1))),
    'postwar_bungalow':  dict(walls=_p((0.92, 0.91, 0.87, 3), (0.86, 0.84, 0.78, 2), (0.74, 0.78, 0.74, 1), (0.80, 0.82, 0.84, 1)), trim=_p((0.93, 0.92, 0.88, 2), (0.36, 0.36, 0.36, 1)),
                              roof=_p((0.32, 0.32, 0.33, 2), (0.40, 0.36, 0.32, 1)), glass=_p((0.20, 0.22, 0.24, 1))),
    'stucco_lowrise':    dict(walls=_p((0.90, 0.86, 0.76, 2), (0.92, 0.88, 0.80, 2), (0.88, 0.80, 0.72, 1), (0.84, 0.84, 0.80, 1)), trim=_p((0.94, 0.93, 0.90, 3), (0.30, 0.46, 0.46, 0.6)),
                              roof=_p((0.36, 0.34, 0.32, 2), (0.42, 0.34, 0.28, 1)), glass=_p((0.24, 0.30, 0.32, 1))),
    'modern_infill':     dict(walls=_p((0.24, 0.25, 0.26, 2), (0.16, 0.16, 0.17, 1), (0.90, 0.90, 0.88, 1.5), (0.56, 0.44, 0.32, 0.7), (0.56, 0.58, 0.58, 1)), trim=_p((0.14, 0.14, 0.15, 2), (0.90, 0.90, 0.88, 1)),
                              roof=_p((0.28, 0.28, 0.29, 2), (0.22, 0.22, 0.23, 1)), glass=_p((0.20, 0.24, 0.26, 1))),
    'laneway_house':     dict(walls=_p((0.22, 0.23, 0.24, 2), (0.54, 0.44, 0.34, 1), (0.86, 0.86, 0.84, 1), (0.40, 0.44, 0.44, 1)), trim=_p((0.14, 0.14, 0.15, 1), (0.90, 0.90, 0.88, 1)),
                              roof=_p((0.24, 0.24, 0.25, 2), (0.34, 0.34, 0.35, 1)), glass=_p((0.20, 0.22, 0.24, 1))),
    'townhouse':         dict(walls=_p((0.84, 0.82, 0.76, 2), (0.70, 0.70, 0.66, 1), (0.60, 0.64, 0.62, 1), (0.88, 0.86, 0.80, 1)), trim=_p((0.93, 0.92, 0.88, 2), (0.30, 0.30, 0.30, 1)),
                              roof=_p((0.32, 0.32, 0.33, 2), (0.38, 0.34, 0.30, 1)), glass=_p((0.20, 0.22, 0.24, 1))),
    'west_end_walkup':   dict(walls=_p((0.93, 0.91, 0.86, 2), (0.90, 0.84, 0.80, 1), (0.84, 0.88, 0.84, 1), (0.84, 0.86, 0.88, 1), (0.92, 0.88, 0.74, 1)), trim=_p((0.95, 0.95, 0.93, 2), (0.36, 0.36, 0.36, 1)),
                              roof=_p((0.40, 0.40, 0.40, 1)), glass=_p((0.22, 0.26, 0.28, 1))),
    'concrete_tower':    dict(walls=_p((0.93, 0.92, 0.89, 2), (0.88, 0.87, 0.84, 2), (0.92, 0.89, 0.82, 1)), trim=_p((0.95, 0.95, 0.93, 2)),   # (vat test: the West End's towers are white and cream; 0.84 rendered mid grey)
                              roof=_p((0.48, 0.48, 0.47, 1)), glass=_p((0.24, 0.27, 0.28, 1), (0.30, 0.28, 0.25, 1))),
    'point_tower':       dict(walls=_p((0.92, 0.92, 0.91, 2), (0.80, 0.82, 0.83, 1)), trim=_p((0.94, 0.94, 0.93, 2)),
                              roof=_p((0.52, 0.52, 0.51, 1)), glass=_p((0.36, 0.52, 0.52, 3), (0.44, 0.56, 0.62, 2), (0.56, 0.64, 0.68, 1.5), (0.30, 0.40, 0.44, 1))),
    'podium':            dict(walls=_p((0.84, 0.84, 0.82, 2), (0.70, 0.70, 0.68, 1), (0.62, 0.50, 0.42, 0.5)), trim=_p((0.88, 0.88, 0.86, 2), (0.20, 0.20, 0.21, 1)),
                              roof=_p((0.50, 0.50, 0.49, 1)), glass=_p((0.34, 0.46, 0.48, 2), (0.42, 0.50, 0.54, 1))),
    'heritage_brick':    dict(walls=_p((0.56, 0.33, 0.25, 3), (0.62, 0.42, 0.32, 2), (0.70, 0.62, 0.50, 1), (0.42, 0.28, 0.22, 1)), trim=_p((0.82, 0.78, 0.68, 2), (0.30, 0.32, 0.30, 1)),
                              roof=_p((0.40, 0.40, 0.40, 1)), glass=_p((0.20, 0.22, 0.24, 1))),
    'chinatown_society': dict(walls=_p((0.78, 0.72, 0.60, 1), (0.56, 0.32, 0.24, 2), (0.44, 0.54, 0.46, 1), (0.84, 0.80, 0.70, 1)), trim=_p((0.86, 0.80, 0.66, 2), (0.62, 0.16, 0.12, 1), (0.24, 0.40, 0.30, 1)),
                              roof=_p((0.40, 0.40, 0.40, 1)), glass=_p((0.20, 0.22, 0.24, 1))),
    'institutional':     dict(walls=_p((0.58, 0.38, 0.30, 2), (0.76, 0.70, 0.58, 1), (0.80, 0.80, 0.78, 1)), trim=_p((0.86, 0.84, 0.78, 2)),
                              roof=_p((0.36, 0.36, 0.37, 1), (0.30, 0.40, 0.36, 0.4)), glass=_p((0.22, 0.25, 0.27, 1))),
    'industrial_shed':   dict(walls=_p((0.76, 0.76, 0.74, 2), (0.66, 0.68, 0.70, 1), (0.84, 0.82, 0.76, 1), (0.58, 0.60, 0.62, 1)), trim=_p((0.40, 0.42, 0.44, 1), (0.88, 0.88, 0.86, 1)),
                              roof=_p((0.60, 0.60, 0.60, 1)), glass=_p((0.30, 0.32, 0.33, 1))),
    'granville_island_shed': dict(walls=_p((0.62, 0.18, 0.14, 2), (0.20, 0.36, 0.56, 1.5), (0.86, 0.66, 0.20, 1), (0.24, 0.44, 0.32, 1), (0.70, 0.70, 0.70, 1.5)), trim=_p((0.92, 0.92, 0.90, 2), (0.26, 0.26, 0.28, 1)),
                              roof=_p((0.56, 0.56, 0.56, 2), (0.46, 0.20, 0.16, 1)), glass=_p((0.24, 0.26, 0.28, 1))),
}


def load():
    """this module when VAN_TYPES=1 for another city and the types file is there, else None"""
    global VT, PAL
    if not ON: return None
    if not os.path.exists(TYPES_FILE): print('[van_kit] no types file', TYPES_FILE, flush=True); return None
    VT = json.load(open(TYPES_FILE))['t']
    if os.path.exists(PAL_FILE):
        try: PAL = {k: v for k, v in json.load(open(PAL_FILE)).items() if isinstance(v, dict)}
        except Exception as ex: print('[van_kit] palettes unreadable', ex, flush=True)
    print('[van_kit] types', len(VT), TYPES_FILE, '| palettes', len(PAL), PAL_FILE if PAL else '(placeholders)', flush=True)
    return sys.modules[__name__]


def _norm(c):
    c = [float(x) for x in c[:3]]
    return tuple(x / 255.0 for x in c) if max(c) > 1.0 else tuple(c)


def _pick(lst, r):
    tot = sum(float(e[3]) if len(e) > 3 else 1.0 for e in lst); x = r.random() * tot
    for e in lst:
        x -= float(e[3]) if len(e) > 3 else 1.0
        if x <= 0: return _norm(e)
    return _norm(lst[-1])


def _chan(t, ch):
    for k in (t, FALLBACK.get(t)):
        if k and isinstance(PAL.get(k), dict) and PAL[k].get(ch): return PAL[k][ch]
    for k in (t, FALLBACK.get(t)):
        if k and PLACEHOLDER.get(k, {}).get(ch): return PLACEHOLDER[k][ch]
    return None


def mix(a, b, t): return tuple(x * (1 - t) + y * t for x, y in zip(a, b))


def spec(b):
    """the record's type spec, or None (not typed: the generator's own rules)"""
    e = VT.get(str(b['gid']))
    if not e: return None
    t = e[0]
    if t not in T: return None
    s = dict(T[t]); s['type'] = t; s['hint'] = e[2] if len(e) > 2 else ''
    s['roles'] = [int(ch) for ch in e[1]] if (len(e) > 1 and e[1]) else None
    r = random.Random(int(b['gid']) * 7907 + 101)
    body = _pick(_chan(t, 'walls'), r); trim = _pick(_chan(t, 'trim'), r)
    roof = _pick(_chan(t, 'roof'), r) if _chan(t, 'roof') else None
    gl = _chan(t, 'glass'); glass = _pick(gl, r) if gl else (0.22, 0.24, 0.26)
    acc = _pick(_chan(t, 'walls'), r)
    accent = mix(acc, body, 0.45) if t == 'character_house' else mix(trim, (0.2, 0.2, 0.2), 0.4)
    s['paint'] = (body, trim, accent); s['roof'] = roof; s['glass'] = (*glass, 0.3 if t in ('point_tower', 'podium') else 0.18)
    br = _chan(t, 'brick') or PLACEHOLDER['vancouver_special']['brick']; s['brick'] = _pick(br, r)
    s['raised_v'] = r.uniform(*s['raised'])
    s['r'] = r.random()                       # one more draw for the type's own choices (porch side, balcony layout)
    if t == 'heritage_brick':
        use = b.get('use') or ''
        if use in ('multi-family',) or (use == 'single family'): s['sub'] = 'apartment'
        else: s['shop'] = True
    if t == 'modern_infill' and b['h'] >= 11: s['style'], s['sub'] = 'block', 'apartment'     # the 2006+ mid-rise
    if t == 'concrete_tower' and (b.get('use') == 'office'): s['office'] = True
    if t == 'podium' and (b.get('use') or '') in ('multi-family', 'single family'): s['shop'] = r.random() < 0.35
    return s


def from_colour(S, VC, b, wm0, wall_mat, body, trim, accent, gcol, roof_tex, era=None):
    """(INTEG 06/10) VAN_COLOUR on: van_colour's draw is the building's one colour source. The spec takes VC's colours so
    the type's own parts (porch, the Special's base and balcony, portico, balconies, slab edges, loggia, dormer) wear the
    same paint, in VC's units (the roof as a tint on the shingle texture, the Special's base as a brick tint or stucco);
    the cladding stays VC's except a tower / podium the skin made concrete. -> (wall_mat, spec)"""
    S = dict(S)
    if wm0 == 'concrete' and wall_mat == 'stucco': wall_mat = 'concrete'
    S['paint'] = (body, trim, accent); S['mat'] = wall_mat
    if gcol is not None: S['glass'] = tuple(gcol)
    S['roof'] = VC.roof_pitched(b, 'roof_shingle', None, roof_tex, era)[1]
    v = b.get('_vc') or {}
    if v.get('base'):
        S['brick_mat'] = v.get('base_mat') or 'brick'
        S['brick'] = VC.brick_tint(v['base']) if S['brick_mat'] == 'brick' else tuple(v['base'])
    return wall_mat, S


def roof_form(S, b, roof, area, fill, LIDAR_R):
    """(form, the LiDAR fit used or None): the LiDAR's form where it has one (pitched only on a footprint the type
    allows and near its rectangle), a shed where the fit refused a mono-pitch, else the type's own draw"""
    t = S['type']
    lr = LIDAR_R.get(str(b['gid']))
    if t in ('point_tower', 'concrete_tower', 'podium'): return 'flat', None
    if lr:
        if lr[0] == 'flat': return 'flat', None
        lim = S.get('area_lr', 800 if S['style'] != 'block' else 500)
        if area <= lim and (fill >= 0.72 or area < 250) and b['h'] < 30: return lr[0], lr
        return 'flat', None
    if S.get('hint') == 'shed' and t in ('laneway_house', 'modern_infill', 'accessory'): return 'shed', None
    if t == 'industrial_shed': return roof, None                   # the works' own (flat, saw-tooth, barrel)
    if S['style'] == 'block' and area > S.get('area_lr', 500): return 'flat', None
    r = random.Random(int(b['gid']) * 389 + 77); x = r.random()
    for f, w in S['roofs']:
        x -= w
        if x <= 0: return f, None
    return S['roofs'][-1][0], None


def massing(S, b, LR, zg, top, eave, rise, first_min, vlen, pitch):
    """(top, eave): a pitched house stands to the LiDAR's ridge, its walls to the LiDAR's eave (the record's height is a
    high percentile of the roof, ~0.9 m under the ridge), never less than one storey over its raised floor"""
    if LR and len(LR) > 4 and LR[4] > 2.5:
        top = max(top, zg + LR[4]); eave = zg + max(LR[3], 0.5)
    if S.get('house') or S['type'] in ('townhouse', 'stucco_lowrise', 'institutional', 'granville_island_shed'):
        eave = max(eave, zg + first_min + 2.6)
        if top - eave < 0.8: top = eave + max(0.8, rise if rise > 0.8 else 1.6)
    return top, eave


def shed_rise(S, vlen, pitch, h):
    return min(max(0.6, vlen * math.tan(pitch)), max(0.8, 0.35 * h))


def floors(S, eave, first, nfl, fh):
    t = S['type']
    if S.get('house') or t in ('townhouse', 'west_end_walkup', 'stucco_lowrise'):
        n = max(1, int(round((eave - first) / 2.75))); return n, max(2.4, (eave - first) / n)
    if t in ('concrete_tower', 'point_tower') or (t == 'modern_infill' and S['style'] == 'block'):
        n = max(1, int(round((eave - first) / 2.9))); return n, max(2.6, (eave - first) / n)
    return nfl, fh


def skin(S, fsys, gcol, body, wall_mat, yr):
    """the tower / podium skin: (fsys, gcol, body, wall_mat)"""
    t = S['type']
    if t == 'point_tower': return 'curtain', S['glass'], S['paint'][0], 'concrete'
    if t == 'concrete_tower': return (fsys if S.get('office') else None), (gcol or S['glass']), body, wall_mat
    if t == 'podium': return 'ribbon', S['glass'], body, wall_mat
    return None, gcol, body, wall_mat


def win(c, fh, ww, wh):
    S = c['vs']; a, k = S['win']
    return a, min(max(1.0, fh * k), 2.6 if S['type'] != 'heritage_brick' else 2.4)


# ── drawing helpers on a Wall (u along it, z up, w out) ──
def band(w, mat, u0, u1, z0, z1, d, col):
    """a slab standing out of the wall: its face, top and underside (3 faces, no ends)"""
    o = w.o
    o.poly(mat, [w.P(u0, z0, d), w.P(u1, z0, d), w.P(u1, z1, d), w.P(u0, z1, d)], col)
    o.poly(mat, [w.P(u0, z1, 0.0), w.P(u0, z1, d), w.P(u1, z1, d), w.P(u1, z1, 0.0)], col)
    o.poly(mat, [w.P(u0, z0, 0.0), w.P(u1, z0, 0.0), w.P(u1, z0, d), w.P(u0, z0, d)], mix(col, (0, 0, 0), 0.3))


def _G(): return sys.modules['gen_buildings']


def porch(w, c, b, door_u):
    """the character house's front porch: a deck on brick piers, tapered posts, a rail, a shed roof"""
    S = c['vs']; L = w.L; zg, first, eave, trim, body = c['zg'], c['first'], c['eave'], c['trim'], c['body']
    if L < 3.2 or first - zg < 0.5: return
    r = random.Random(int(b['gid']) * 131 + 17)
    full = L < 8.5 or r.random() < 0.45
    if L < 4.5: full = True
    pw = L - 0.3 if full else min(L - 0.6, max(3.2, L * r.uniform(0.5, 0.65)))
    if door_u: u0 = max(0.15, min(L - pw - 0.15, (door_u[0] + door_u[1]) / 2 - pw / 2))
    else: u0 = 0.15 if r.random() < 0.5 else L - pw - 0.15
    u1 = u0 + pw; D = r.uniform(1.9, 2.5)
    deck = (0.50, 0.48, 0.46) if r.random() < 0.6 else mix(trim, (0.4, 0.4, 0.4), 0.4)
    w.box('deck', u0, u1, first - 0.22, first, 0.0, D, deck)
    w.rect('siding', u0, u1, zg - 0.3, first - 0.22, D, mix(body, (0.15, 0.15, 0.15), 0.35))          # the skirt under it
    zr = min(eave - 0.05, first + 3.0)
    if zr - first < 2.4: zr = first + 2.45
    G = _G()
    pier = S['brick'] if r.random() < 0.6 else mix(body, trim, 0.5)
    npost = 2 if pw < 5.5 else 3
    for k in range(npost):
        uu = u0 + 0.3 + (pw - 0.6) * k / (npost - 1)
        w.box('brick' if pier is S['brick'] else 'trim', uu - 0.26, uu + 0.26, zg - 0.2, first + 0.95, D - 0.55, D - 0.03, pier)
        w.box('trim', uu - 0.15, uu + 0.15, first + 0.95, zr - 0.3, D - 0.44, D - 0.14, trim)
    w.box('trim', u0, u1, first + 0.86, first + 0.96, D - 0.12, D - 0.02, trim)                    # the rail
    w.rect('curtain', u0, u1, first, first + 0.86, D - 0.06, mix(trim, (0.5, 0.5, 0.5), 0.3))        # its balusters, as a veil
    rc = S['roof'] or (0.32, 0.32, 0.33)
    w.o.poly('roof_shingle', [w.P(u0 - 0.2, zr, 0.0), w.P(u0 - 0.2, zr - 0.55, D + 0.35), w.P(u1 + 0.2, zr - 0.55, D + 0.35), w.P(u1 + 0.2, zr, 0.0)], rc)
    band(w, 'trim', u0 - 0.2, u1 + 0.2, zr - 0.85, zr - 0.55, D + 0.35, trim)                       # the fascia / beam
    if door_u and first - zg > 0.4:                                                                   # the steps up
        du0, du1 = door_u[0] - 0.1, door_u[1] + 0.1; run = (first - zg) / 0.7
        w.o.poly('stair', [w.P(du0, first, D), w.P(du1, first, D), w.P(du1, zg, D + run), w.P(du0, zg, D + run)], (0.62, 0.60, 0.56))


def special_front(w, c, b, holes):
    """the Vancouver Special's street front: brick (or stone) on the lower storey round its windows, the upper floor's
    centre balcony with aluminium pickets"""
    S = c['vs']; L = w.L; zg, first, fh, eave = c['zg'], c['first'], c['fh'], c['eave']
    zt = min(first + fh - 0.1, eave - 0.3); zb = zg - 0.3
    lo = [h for h in holes if h[2] < zt - 0.2 and h[3] > zb]
    us = sorted({0.0, L, *[min(L, max(0.0, h[0])) for h in lo], *[min(L, max(0.0, h[1])) for h in lo]})
    zs = sorted({zb, zt, *[min(zt, max(zb, h[2])) for h in lo], *[min(zt, max(zb, h[3])) for h in lo]})
    for i in range(len(us) - 1):
        for j in range(len(zs) - 1):
            cu, cz = (us[i] + us[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
            if any(h[0] <= cu <= h[1] and h[2] <= cz <= h[3] for h in lo): continue
            w.rect(S.get('brick_mat', 'brick'), us[i], us[i + 1], zs[j], zs[j + 1], 0.04, S['brick'])     # (INTEG) VC's base: brick, or stucco / stone
    band(w, 'concrete', -0.02, L + 0.02, zt, zt + 0.12, 0.08, mix(S['brick'], (0.85, 0.85, 0.82), 0.6))     # the sill course
    if L >= 7.0:
        # (refs: Commons 'Vancouver specials 01/02/04', CC BY 2.0: the balcony runs most of the front, white pickets mostly)
        bw = L * (0.6 + 0.3 * S['r']); u0 = (L - bw) / 2; zs_ = first + fh - 0.12
        rail = (0.93, 0.93, 0.91) if S['r'] < 0.7 else (0.22, 0.22, 0.23)
        band(w, 'concrete', u0, u0 + bw, zs_, zs_ + 0.2, 1.3, (0.82, 0.81, 0.78))
        w.box('metal', u0, u0 + bw, zs_ + 0.98, zs_ + 1.06, 1.22, 1.3, rail)
        w.rect('curtain', u0, u0 + bw, zs_ + 0.2, zs_ + 0.98, 1.27, mix(rail, (0.45, 0.45, 0.45), 0.35))
        for uu in (u0, u0 + bw - 0.06): w.box('metal', uu, uu + 0.06, zs_ + 0.2, zs_ + 1.06, 0.0, 1.3, rail)


def portico(w, c, b, door_u):
    """the big stucco house's entry: two columns two storeys tall, a pediment over them"""
    L = w.L; zg, eave, trim, body = c['zg'], c['eave'], c['trim'], c['body']
    if L < 8.0 or eave - zg < 4.5: return
    um = (door_u[0] + door_u[1]) / 2 if door_u else L / 2
    hw = 1.4; D = 1.6; zt = eave - 0.15
    for uu in (um - hw, um + hw - 0.36): w.box('trim', uu, uu + 0.36, zg, zt, D - 0.4, D - 0.04, trim)
    w.box('stucco', um - hw - 0.15, um + hw + 0.15, zt, zt + 0.45, 0.0, D + 0.1, body)
    pk = zt + 0.45 + 1.0
    w.o.poly('trim', [w.P(um - hw - 0.15, zt + 0.45, D + 0.1), w.P(um + hw + 0.15, zt + 0.45, D + 0.1), w.P(um, pk, D + 0.1)], trim)
    rc = c['vs']['roof'] or (0.34, 0.33, 0.32)
    w.o.poly('roof_shingle', [w.P(um - hw - 0.25, zt + 0.42, D + 0.2), w.P(um, pk + 0.05, D + 0.2), w.P(um, pk + 0.05, 0.0), w.P(um - hw - 0.25, zt + 0.42, 0.0)], rc)
    w.o.poly('roof_shingle', [w.P(um, pk + 0.05, D + 0.2), w.P(um + hw + 0.25, zt + 0.42, D + 0.2), w.P(um + hw + 0.25, zt + 0.42, 0.0), w.P(um, pk + 0.05, 0.0)], rc)


def canopy(w, c, u0, u1, z, d=1.2, col=None):
    band(w, 'concrete', u0, u1, z, z + 0.16, d, col or mix(c['trim'], (0.3, 0.3, 0.3), 0.2))


def balconies(w, c, b, is_front):
    """balconies floor over floor: the concrete tower's bands, the walk-up's small ones, the stucco blocks' solid
    fronts, the mid-rise's glass guards"""
    S = c['vs']; t = S['type']; L = w.L; first, fh, nfl, eave = c['first'], c['fh'], c['nfl'], c['eave']
    if L < 6.0: return
    r = random.Random(int(b['gid']) * 977 + int(L * 10))
    if t == 'concrete_tower':
        if S.get('office'): return
        frac = 0.55 + 0.4 * S['r']; D = 1.5; guard = 'solid' if (b.get('year') or 1970) < 1975 and S['r'] < 0.6 else 'rail'
        spans = [((L - L * frac) / 2, (L + L * frac) / 2)]
    elif t == 'west_end_walkup':
        if not is_front and r.random() < 0.5: return
        n = max(1, int(L / 7.5)); bw = 2.6; D = 1.0; guard = 'rail'
        spans = [(L * (k + 0.5) / n - bw / 2, L * (k + 0.5) / n + bw / 2) for k in range(n)]
    elif t == 'stucco_lowrise':
        n = max(1, int(L / 8.0)); bw = 3.2; D = 1.5; guard = 'solid'
        spans = [(L * (k + 0.5) / n - bw / 2, L * (k + 0.5) / n + bw / 2) for k in range(n)]
    else:   # the mid-rise
        n = max(1, int(L / 9.0)); bw = 4.0; D = 1.8; guard = 'glass'
        spans = [(L * (k + 0.5) / n - bw / 2, L * (k + 0.5) / n + bw / 2) for k in range(n)]
    slab = mix(c['body'], (0.9, 0.9, 0.88), 0.4) if t != 'stucco_lowrise' else c['body']
    for f in range(1, nfl):
        z = first + f * fh - 0.1
        if z + 1.1 > eave: break
        for u0, u1 in spans:
            u0, u1 = max(0.1, u0), min(L - 0.1, u1)
            if u1 - u0 < 1.2: continue
            band(w, 'concrete', u0, u1, z - 0.18, z, D, slab)
            if guard == 'solid': band(w, 'stucco' if t == 'stucco_lowrise' else 'concrete', u0, u1, z, z + 1.0, D, slab)
            elif guard == 'glass': w.rect('curtain_wall', u0, u1, z, z + 1.05, D, (*S['glass'][:3], 0.25))
            else:
                w.rect('curtain', u0, u1, z, z + 1.0, D, (0.26, 0.26, 0.27))
                w.box('metal', u0, u1, z + 0.96, z + 1.04, D - 0.06, D, (0.22, 0.22, 0.23))


def slab_edges(w, c, b):
    """the point tower: a light slab edge at every floor over the glass, glass-guard balconies round one corner"""
    S = c['vs']; L = w.L; first, fh, nfl, eave = c['first'], c['fh'], c['nfl'], c['eave']
    if L < 3.0: return
    edge = S['paint'][1]; r = random.Random(int(b['gid']) * 59 + int(L * 10))
    corner = r.random() < 0.7 and L > 9; side = r.random() < 0.5; bw = min(5.0, L * 0.35)
    for f in range(1, nfl + 1):
        z = first + f * fh
        if z > eave - 0.5: break
        band(w, 'concrete', -0.04, L + 0.04, z - 0.14, z + 0.14, 0.14, edge)
        if corner and f < nfl:
            u0, u1 = (0.0, bw) if side else (L - bw, L)
            band(w, 'concrete', u0, u1, z - 0.14, z + 0.06, 1.7, edge)
            w.rect('curtain_wall', u0, u1, z + 0.06, z + 1.1, 1.7, (0.62, 0.70, 0.72, 0.35))


def arches(w, c, holes):
    """the heritage block's arched upper windows: the round head in glass, a stone ring round it"""
    zg = c['zg']; trim = c['trim']
    for (u0, u1, z0, z1) in holes:
        if z0 < zg + 4.0 or u1 - u0 > 2.2 or u1 - u0 < 0.6: continue
        um, rw = (u0 + u1) / 2, (u1 - u0) / 2
        A = [math.pi * k / 6 for k in range(7)]
        w.o.poly('glass', [w.P(um + rw * math.cos(a), z1 + rw * math.sin(a), 0.03) for a in A], (0.5, 0.5, 0.5))
        for k in range(6):
            a, b_ = A[k], A[k + 1]
            w.o.poly('trim', [w.P(um + rw * math.cos(a), z1 + rw * math.sin(a), 0.05), w.P(um + (rw + 0.16) * math.cos(a), z1 + (rw + 0.16) * math.sin(a), 0.05),
                              w.P(um + (rw + 0.16) * math.cos(b_), z1 + (rw + 0.16) * math.sin(b_), 0.05), w.P(um + rw * math.cos(b_), z1 + rw * math.sin(b_), 0.05)], trim)


def loggia(w, c, b):
    """Chinatown's society building: the recessed balcony across the top floor — a dark recess behind columns and a
    balustrade — and the name panel on the parapet"""
    S = c['vs']; L = w.L; first, fh, nfl, eave, zg = c['first'], c['fh'], c['nfl'], c['eave'], c['zg']
    if L < 5.0 or nfl < 2: return
    z0 = first + (nfl - 1) * fh + 0.1; z1 = min(eave - 0.4, z0 + fh - 0.2)
    if z1 - z0 < 2.0: return
    m = 0.5; w.rect('glass', m, L - m, z0, z1, 0.02, (0.08, 0.08, 0.08))
    n = max(2, int(L / 2.6))
    for k in range(n + 1):
        uu = m + (L - 2 * m) * k / n
        w.box('trim', uu - 0.18, uu + 0.18, z0, z1, 0.0, 0.32, c['trim'])
    w.box('trim', m, L - m, z0, z0 + 0.95, 0.12, 0.32, S['paint'][2] if S['r'] < 0.5 else c['trim'])
    acc = (0.62, 0.16, 0.12) if S['r'] < 0.6 else (0.24, 0.40, 0.30)
    w.box('trim', L * 0.3, L * 0.7, eave + 0.1, eave + 1.0, 0.0, 0.12, acc)                            # the name panel


def garage_facade(w, b, c, role):
    """a garage on the lane: its door on the lane wall, a man door now and then"""
    L = w.L; zg = c['zg']
    if role != 0 or L < 2.6: return []
    r = random.Random(int(b['gid']) * 211 + int(L * 10))
    n = 2 if L >= 5.6 else 1; gw = min(2.6, (L - 0.6 * (n + 1)) / n)
    if gw < 2.0: n = 1; gw = min(2.6, L - 0.6)
    dcol = mix(c['trim'], (0.85, 0.84, 0.80), 0.5) if r.random() < 0.6 else c['body']
    out = []
    for k in range(n):
        g0 = 0.6 + k * (gw + 0.6) if n > 1 else (L - gw) / 2
        h = min(2.2, c['eave'] - zg - 0.25)
        if h < 1.6: continue
        w.rect('door', g0, g0 + gw, zg + 0.05, zg + h, 0.03, dcol)
        for k_ in range(4): w.rect('door', g0 + 0.04, g0 + gw - 0.04, zg + 0.45 + k_ * 0.42, zg + 0.5 + k_ * 0.42, 0.045, mix(dcol, (0.18, 0.18, 0.18), 0.5))
        out.append((g0, g0 + gw, zg + 0.05, zg + h))
    return out


def facade_own(w, is_front, b, rng, c):
    """the walls the type draws whole (the garage): returns the holes or None to let the generator draw"""
    if c['vs']['type'] != 'accessory': return None
    i = c['vwalls'].index(w) if w in c['vwalls'] else -1
    return garage_facade(w, b, c, c['vroles'][i] if i >= 0 else 3)


def after_facade(w, is_front, b, rng, c, holes, door_u):
    t = c['vs']['type']
    if t == 'character_house' and is_front: porch(w, c, b, door_u)
    elif t == 'vancouver_special' and is_front: special_front(w, c, b, holes)
    elif t == 'stucco_house' and is_front: portico(w, c, b, door_u)
    elif t == 'modern_infill' and c['style'] != 'block' and is_front and door_u: canopy(w, c, door_u[0] - 0.8, door_u[1] + 0.8, c['first'] + 2.5, 1.4)
    elif t == 'townhouse' and is_front and w.L >= 9:
        n = max(2, int(w.L / 5.5))
        for k in range(n):
            um = w.L * (k + 0.5) / n
            if door_u and abs(um - (door_u[0] + door_u[1]) / 2) < 1.5: continue
            w.rect('door', um - 0.5, um + 0.5, c['first'], c['first'] + 2.2, 0.03, c['accent'])
            canopy(w, c, um - 0.9, um + 0.9, c['first'] + 2.4, 1.0)
    if t in ('heritage_brick', 'chinatown_society') and (is_front or w.L > 8): arches(w, c, holes)
    if t == 'chinatown_society' and is_front: loggia(w, c, b)
    if t in ('concrete_tower', 'west_end_walkup', 'stucco_lowrise') or (t == 'modern_infill' and c['style'] == 'block'): balconies(w, c, b, is_front)


def after_skin(w, is_front, b, c):
    if c['vs']['type'] == 'point_tower': slab_edges(w, c, b)


def after_roof(c, b, ring, walls, f0, roof, rz, out, top, deck=None):
    """the dormer on a character house's front slope; the planted podium roof"""
    S = c['vs']; t = S['type']
    if t == 'character_house' and roof in ('gable', 'hip'):
        wf = walls[f0]
        if wf.L < 6.0: return
        m = Vector(((wf.a.x + wf.b.x) / 2, (wf.a.y + wf.b.y) / 2, 0)); n_ = wf.n
        z0 = rz(m - n_ * 0.05); z1 = rz(m - n_ * 1.05); s = z1 - z0
        if s < 0.35: return                                   # the front is a gable end: no slope to put a dormer on
        ridge = max(rz(m - n_ * d) for d in (2.0, 3.0, 4.0, 5.0, 6.0))
        if ridge - z0 < 1.8: return
        r = random.Random(int(b['gid']) * 53 + 9)
        if r.random() < 0.3: return
        dw = min(wf.L * 0.45, r.uniform(2.4, 3.6)); u0 = (wf.L - dw) / 2; din = 0.6
        zt = min(ridge - 0.45, z0 + 1.9); d1 = din + (zt - z0) / s + 0.4
        body, trim = c['body'], c['trim']; rc = S['roof'] or (0.32, 0.32, 0.33)
        zb = z0 - 0.1
        out.poly('siding', [wf.P(u0, zb, -din), wf.P(u0 + dw, zb, -din), wf.P(u0 + dw, zt, -din), wf.P(u0, zt, -din)], body)
        for uu in (u0, u0 + dw):
            out.poly('siding', [wf.P(uu, zb, -din), wf.P(uu, zt, -din), wf.P(uu, zt, -d1), wf.P(uu, zb, -d1)], body)
        out.poly('glass', [wf.P(u0 + 0.35, zb + 0.35, -din + 0.03), wf.P(u0 + dw - 0.35, zb + 0.35, -din + 0.03), wf.P(u0 + dw - 0.35, zt - 0.3, -din + 0.03), wf.P(u0 + 0.35, zt - 0.3, -din + 0.03)], (0.5, 0.5, 0.5))
        out.poly('trim', [wf.P(u0 + 0.22, zb + 0.22, -din + 0.015), wf.P(u0 + dw - 0.22, zb + 0.22, -din + 0.015), wf.P(u0 + dw - 0.22, zt - 0.18, -din + 0.015), wf.P(u0 + 0.22, zt - 0.18, -din + 0.015)], trim)
        out.poly('roof_shingle', [wf.P(u0 - 0.25, zt + 0.05, -din + 0.3), wf.P(u0 + dw + 0.25, zt + 0.05, -din + 0.3), wf.P(u0 + dw + 0.25, zt + 0.35, -d1), wf.P(u0 - 0.25, zt + 0.35, -d1)], rc)
    elif t == 'podium' and roof == 'flat' and deck is not None and S['r'] < 0.75:
        G = _G()
        try:
            q = G.offset_ring(ring, -1.6)
            if not G.inset_ok(ring, q): return
        except Exception: return
        from mathutils.geometry import tessellate_polygon
        P = [Vector((x, y, deck + 0.18)) for x, y in q]
        g = random.Random(int(b['gid']) * 3 + 1)
        col = g.choice(((0.30, 0.40, 0.22), (0.36, 0.44, 0.26), (0.28, 0.36, 0.24)))
        for tri in tessellate_polygon([P]): out.poly('plant', [P[k] for k in tri], col)
