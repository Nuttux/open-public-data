"""San Francisco at a given year — what stood, what the ground was, how it
was painted, paved and lit. The renderers (hq_scene.py, hq_city.py,
gen_buildings.py) read this module and nothing else about history.

Every value here is one of two kinds, and says which:
  SOURCED     — a published date or fact; the source is named beside it (full
                URLs and quotes: qipu-render-work/history/CHECKPOINTS.md);
  CONVENTION  — a period-typical choice where no record says what stood at
                that exact place. Conventions change how a thing LOOKS, never
                what the record says stood there.

What the building record can and cannot say: it holds the 166,166 buildings
standing TODAY with the assessor's year built. A building shows from its year
on. What stood and was since demolished is not in it — the two places that
matters most are handled here: the 1906 burned district (DataSF ff3a-iqhv,
shipped in base/coast.qc) and the Outside Lands before their build-out.
"""
import math, os, json

CITY = '/Users/daniel/code/opd-render/website/public/data/us/sf/city'

# the checkpoints the film cuts between (history/CHECKPOINTS.md)
CHECKPOINTS = (1890, 1906, 1915, 1938, 1955, 1975, None)

# ── landmarks drawn by hand (the scene's 'heroes' layer) ────────────────────
# The engine's heroes come as separate meshes, not tagged by name: each is
# matched to its landmark by where it stands (world metres, the bbox centre
# of its mesh in the city export). y = first year it stood complete. SOURCED.
LANDMARKS = [
    # key, x, y, year, source of the year
    ('ggbridge', -3546, 6425, 1937, 'Golden Gate Bridge opened to traffic 27 May 1937 (GGBHTD; Wikipedia)'),
    ('baybridge', 5421, 4401, 1936, 'San Francisco-Oakland Bay Bridge opened 12 Nov 1936 (Caltrans; Wikipedia)'),
    ('cityhall', 1652, 2146, 1915, 'City Hall dedicated Dec 1915 (heroes.json y=1913 is construction start; SF Planning landmark 21)'),
    ('ferry', 3924, 3958, 1898, 'Ferry Building opened July 1898 (heroes.json; Port of SF)'),
    ('coit', 2831, 4728, 1933, 'Coit Tower completed Oct 1933 (SF Rec & Park; heroes.json roll 1934)'),
    ('pofa', -915, 4778, 1915, 'Palace of Fine Arts, PPIE 1915 (heroes.json; rebuilt in concrete 1964-67, same form)'),
    ('conservatory', -1957, 1404, 1879, 'Conservatory of Flowers opened 1879 (SF Rec & Park; register 1878)'),
    ('opera', 1504, 2072, 1932, 'War Memorial Opera House opened Oct 1932 (heroes.json)'),
    ('oldmint', 2707, 2530, 1874, 'Old U.S. Mint in operation from 1874 (NPS; register 1869 = start)'),
    ('dutchmill', -6285, 1163, 1903, 'Dutch (North) Windmill 1903 (heroes.json register)'),
    ('murphymill', -6221, 556, 1908, 'Murphy (South) Windmill completed 1908 (SF Rec & Park; register 1906)'),
    ('pagoda', 716, 2791, 1968, 'Peace Pagoda 1968 (heroes.json)'),
    ('sutro', -1301, -530, 1973, 'Sutro Tower completed 1973 (Wikipedia; roll 1974)'),
    ('internetarchive', -2954, 2484, 1923, 'Fourth Church of Christ, Scientist (now Internet Archive) 1923 (heroes.json roll 1922 + 1923 BoS permit)'),
    ('transamerica', 3100, 3916, 1972, 'Transamerica Pyramid completed 1972 (DataSF 5kya-mfst)'),
]


def landmark_for(cx, cy):
    """the landmark whose recorded position is nearest this mesh centre"""
    best, bd = None, 1e18
    for L in LANDMARKS:
        d = (L[1] - cx) ** 2 + (L[2] - cy) ** 2
        if d < bd: best, bd = L, d
    return best if bd < 400 ** 2 else None


def landmark_stands(cx, cy, era):
    if era is None: return True
    L = landmark_for(cx, cy)
    return L is None or L[3] <= era


# ── the 1906 burned district (DataSF ff3a-iqhv, via base/coast.qc) ───────────
_BURN = None


def burn_rings():
    """seven rings: the outer boundary and six pockets the register says did
    NOT burn (even-odd, as the engine's own fill: citygl/mark-cells.ts)"""
    global _BURN
    if _BURN is None:
        import qc
        _, f = qc.read(f'{CITY}/base/coast.qc')
        L, XY = [int(v) for v in f['burnLen']], f['burnXY']
        rings, k = [], 0
        for n in L:
            rings.append([(float(XY[(k + i) * 2]), float(XY[(k + i) * 2 + 1])) for i in range(n)]); k += n
        _BURN = rings
    return _BURN


def _in_ring(x, y, r):
    c = False; n = len(r)
    for i in range(n):
        x1, y1 = r[i]; x2, y2 = r[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): c = not c
    return c


def burned(x, y):
    return sum(_in_ring(x, y, r) for r in burn_rings()) % 2 == 1


# ── made land: water before it was filled ───────────────────────────────────
# Each entry: the year the land existed, a test (x, y) -> inside, the source.
# SOURCED: Treasure Island was built by the Army Corps of Engineers on the
# shoals north of Yerba Buena Island, 11 Feb 1936 - 24 Aug 1937 (Wikipedia
# 'Treasure Island, San Francisco'; treasureislandmuseum.org). Its outline is
# today's shoreline (DataSF txuc-3kzm, base/coast.qc ring 2, which holds
# Treasure and Yerba Buena Islands as one) north of y = 6000, Yerba Buena's
# north shore.
_COAST = None


def coast_rings():
    global _COAST
    if _COAST is None:
        import qc
        _, f = qc.read(f'{CITY}/base/coast.qc')
        L, XY = [int(v) for v in f['coastLen']], f['coastXY']
        rings, k = [], 0
        for n in L:
            rings.append([(float(XY[(k + i) * 2]), float(XY[(k + i) * 2 + 1])) for i in range(n)]); k += n
        _COAST = rings
    return _COAST


def _treasure_island(x, y):
    return y > 6000 and 5000 < x < 7200 and _in_ring(x, y, coast_rings()[1])


MADE_LAND = [
    ('treasure_island', 1937, _treasure_island,
     'Army Corps of Engineers, 11 Feb 1936 - 24 Aug 1937 (Wikipedia; Treasure Island Museum)'),
]


def water_then(x, y, era):
    """True where the year shown had open water over today's made land"""
    if era is None: return False
    return any(era < yr and test(x, y) for _, yr, test, _ in MADE_LAND)


def place_record(b, era):
    """what the year shown makes of one building record: None (not built yet,
    or under water), or the record — flagged 'standin' (the lost city before
    the fire, gen_buildings.standin) and/or 'ruin' ('shell' for a survivor,
    'burned' for a stand-in) inside the 1906 burned district."""
    if era is None: return b
    if water_then(b['cx'], b['cy'], era): return None
    y = b['year'] or 0
    if era == 1906 and burned(b['cx'], b['cy']):
        # the weeks after the fire: what stood is a ruin; what the record dates
        # later stands for the lost building, as its ruin
        if y <= 1905: b['ruin'] = 'shell'
        else: b['standin'] = True; b['ruin'] = 'burned'; b['core'] = in_core(b['cx'], b['cy'])
        return b
    if y <= era: return b
    if era < 1906 and burned(b['cx'], b['cy']):
        b['standin'] = True; b['core'] = in_core(b['cx'], b['cy']); return b
    return None


def in_core(x, y):
    """the commercial downtown of the lost city. CONVENTION: within 900 m of
    Market and Montgomery (the financial and retail core of 1890-1906)"""
    return (x - 3124) ** 2 + (y - 3228) ** 2 < 900 ** 2


# ── the ground before the build-out ─────────────────────────────────────────
# SOURCED: the Outside Lands (Richmond, Sunset, Parkside) were sand dunes —
# "at least a dozen square miles of sand dunes" (SF Standard, 2023, on the
# 1938 Ryker aerials), and in August 1938 "the dunes climbed as far east as
# 25th Avenue" in the Sunset (same). The record agrees: around 30th-40th Ave
# between Noriega and Quintara no standing building is dated before 1939.
# CONVENTION: where no building of the year stands within ~40 m, the ground
# is open; west of Stanyan Street / the Twin Peaks slope (x < DUNE_X) and
# below DUNE_Z it is sand, elsewhere dry grassland (the eastern hills were
# grazed grass and scrub, not dunes).
DUNE_X = -1800.0          # metres east: about Stanyan St / Clarendon Ave
DUNE_Z = 150.0            # metres above sea level: the dunes climbed Golden Gate Heights' flank
OPEN_NEAR, OPEN_FAR = 22.0, 55.0   # m to the nearest standing building: yard .. open land


def open_factor(dist):
    """0 = built-up (yards, streets between houses), 1 = open land"""
    t = (dist - OPEN_NEAR) / (OPEN_FAR - OPEN_NEAR)
    t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)


def is_dune_ground(x, y, z):
    return x < DUNE_X and z < DUNE_Z


def streets_graded(era):
    """CONVENTION: before ~1925 the Outside Lands grid was surveyed but not
    graded through the dunes (outsidelands.org 'A Short History of the Sunset
    District'); from the 1920s the builders graded and paved ahead of the
    houses (SF Planning, Sunset District Residential Builders 1925-1950 HCS)."""
    return era is None or era >= 1925


def dune_height(x, y, noise):
    """dune relief in metres. CONVENTION shaped on the record of the place:
    the prevailing wind is from the WNW off the ocean, so the ridges lie
    across it (NNE-SSW) and march inland; heights of a few metres to ~10 m
    (SF Standard 2023: 'huge dunes' south of the park in 1904)."""
    # rotate into the wind frame: u along the wind (from WNW), v across
    a = math.radians(-20.0)
    u = x * math.cos(a) - y * math.sin(a); v = x * math.sin(a) + y * math.cos(a)
    from mathutils import Vector
    # transverse ridges: a skewed wave along u, broken up along v
    w = noise.noise(Vector((u / 140.0, v / 260.0, 0.3))) * 0.5 + 0.5
    ph = (u / 55.0 + noise.noise(Vector((u / 300.0, v / 180.0, 1.7))) * 2.2) % 1.0
    ridge = ph ** 2.2 if ph < 0.8 else (1.0 - ph) / 0.2 * 0.8 ** 2.2   # gentle windward, steep lee
    big = noise.noise(Vector((x / 420.0, y / 420.0, 4.1))) * 0.5 + 0.5
    # broad swells under the ridges, as the 1938 frames show them
    swell = noise.noise(Vector((x / 160.0, y / 160.0, 2.3))) * 0.5 + 0.5
    return max(0.2, 0.6 + 4.5 * swell + 12.0 * big * (0.35 + 0.65 * w) * ridge
               + 0.8 * noise.noise(Vector((x / 40.0, y / 40.0, 9.0))))


def yard_sand(era):
    """how sandy the yards between new houses were in the Outside Lands:
    the 1938 frames show bare sand round the new tracts (Ryker 1938, frame
    148, history/refs); lawns and gardens took over as the district aged.
    CONVENTION on the fade."""
    if era is None or era >= 1960: return 0.0
    if era <= 1940: return 0.85
    return 0.85 * (1960 - era) / 20.0


# ── THE DECADE TABLE ────────────────────────────────────────────────────────
# One row per checkpoint; any year between two rows interpolates (numbers
# linearly, mixes weight by weight; a word — a kind of lamp, a paving — is the
# earlier row's until the later row's year). Rows before 1960 are the film's
# historic checkpoints; from 1960 one row a decade, 2020 = today. Sources are
# in the comments on each key (full URLs: history/CHECKPOINTS.md).
#
#  trees     share of today's UNDATED street trees standing. Trees the DataSF
#            Street Tree List dates are gated on their own planting year
#            (city_data.trees); the undated ones by this share. SOURCED in
#            outline: FUF formed 1981 over 'San Francisco's lack of trees' and
#            has planted 43 % of today's street canopy (fuf.net) — so ≤ 57 %
#            stood in 1981; the steps between are a CONVENTION.
#  cars      share of kerb slots with a parked car. CONVENTION (no count kept):
#            none before 1908, rising to today's.
#  fleet     the parked fleet's body shapes (car families in hq_scene: t20 =
#            the tall 1910s-20s body, r30 = rounded 1930s-40s, f50 = long low
#            1950s, l60 = long flat 1960s-70s, b80 = boxy 1980s, mod = today's
#            sedans/SUVs/hatchbacks/vans). A parked fleet is up to ~15 years
#            old, so each row mixes the decade before. CONVENTION on the
#            dates of the shapes (KBB / PPG car-history pages).
#  carcol    the fleet's paint: 1914-25 Model T 'any colour so long as it is
#            black' (Wikipedia, Ford Model T); 1950s pastels and two-tones;
#            1970s earth tones — brown, tan, gold, avocado; 1990s green; 2000s
#            silver; today white 25 %, grey 23 %, black 22 % (iSeeCars, via
#            AAA Northeast 'Why are popular car colors so boring'; KBB 'A
#            History of Automotive Paint Colors'; PPG 'History of Color').
#  paint     how a VICTORIAN house was painted — stone (1870s Italianates in
#            white/cream to pass for stone), poly (the 1880s-90s polychrome:
#            'red, yellow, chocolate, orange, everything that is loud is in
#            fashion', 1885 critic quoted by Wikipedia 'Painted ladies'), pale
#            (the classical-revival creams and whites after 1900), grey
#            (battleship grey 'with war-surplus Navy paint' in and after both
#            wars, Wikipedia / SF Heritage), color (the colorists: Butch Kardum
#            1963, 'by the 1970s ... entire streets and neighborhoods'; the
#            'Painted Ladies' book 1978), today (today's palette, which the
#            colorists made). SOURCED directions, CONVENTION shares.
#  paint2    the same for the stucco and mid-century houses: pale, grey, today.
#  lamp      gas (gas lamps on posts), electrolier (ornamental electric
#            standards; Market Street's 'Path of Gold' 1916), cobra (the
#            post-war cobra-head on a steel pole). Dates of the switch are a
#            CONVENTION within those sourced ends.
#  marks     painted lines and crosswalks: none before 1950 (the zebra and
#            lane paint the export carries is today's). CONVENTION.
#  solar     share of flat roofs carrying solar panels: ~200 applications
#            before 2008, 3,070 systems by April 2014, ~6,000 incentivised by
#            GoSolarSF since 2008 (SFPUC; Vote Solar) — over ~166,000
#            buildings.
TABLE = {
    1890: dict(trees=0.03, cars=0.0, fleet={}, carcol='black',
               paint=dict(stone=0.35, poly=0.60, pale=0.05), paint2=dict(pale=1.0),
               lamp='gas', marks=0.0, solar=0.0),
    1906: dict(trees=0.04, cars=0.0, fleet={}, carcol='black',
               paint=dict(stone=0.25, poly=0.55, pale=0.20), paint2=dict(pale=1.0),
               lamp='gas', marks=0.0, solar=0.0),
    1915: dict(trees=0.06, cars=0.08, fleet=dict(t20=1.0), carcol='black',
               paint=dict(stone=0.10, poly=0.35, pale=0.45, grey=0.10), paint2=dict(pale=0.8, today=0.2),
               lamp='electrolier', marks=0.0, solar=0.0),
    1938: dict(trees=0.10, cars=0.25, fleet=dict(t20=0.25, r30=0.75), carcol='dark30',
               paint=dict(poly=0.10, pale=0.45, grey=0.45), paint2=dict(pale=0.5, grey=0.1, today=0.4),
               lamp='electrolier', marks=0.0, solar=0.0),
    1950: dict(trees=0.16, cars=0.40, fleet=dict(r30=0.75, f50=0.25), carcol='post45',
               paint=dict(pale=0.30, grey=0.70), paint2=dict(pale=0.4, grey=0.3, today=0.3),
               lamp='electrolier', marks=1.0, solar=0.0),
    1960: dict(trees=0.20, cars=0.50, fleet=dict(r30=0.15, f50=0.60, l60=0.25), carcol='pastel50',
               paint=dict(pale=0.28, grey=0.72), paint2=dict(pale=0.3, grey=0.3, today=0.4),
               lamp='cobra', marks=1.0, solar=0.0),
    1970: dict(trees=0.28, cars=0.58, fleet=dict(f50=0.20, l60=0.80), carcol='bright60',
               paint=dict(pale=0.25, grey=0.60, color=0.15), paint2=dict(pale=0.2, grey=0.2, today=0.6),
               lamp='cobra', marks=1.0, solar=0.0),
    1980: dict(trees=0.36, cars=0.62, fleet=dict(l60=0.55, b80=0.45), carcol='earth70',
               paint=dict(pale=0.25, grey=0.40, color=0.35), paint2=dict(pale=0.1, grey=0.1, today=0.8),
               lamp='cobra', marks=1.0, solar=0.0),
    1990: dict(trees=0.55, cars=0.62, fleet=dict(l60=0.15, b80=0.70, mod=0.15), carcol='mix80',
               paint=dict(pale=0.20, grey=0.25, color=0.55), paint2=dict(today=1.0),
               lamp='cobra', marks=1.0, solar=0.0),
    2000: dict(trees=0.72, cars=0.62, fleet=dict(b80=0.40, mod=0.60), carcol='green90',
               paint=dict(today=1.0), paint2=dict(today=1.0),
               lamp='cobra', marks=1.0, solar=0.0),
    2010: dict(trees=0.86, cars=0.62, fleet=dict(b80=0.10, mod=0.90), carcol='silver00',
               paint=dict(today=1.0), paint2=dict(today=1.0),
               lamp='cobra', marks=1.0, solar=0.006),
    2020: dict(trees=1.00, cars=0.62, fleet=dict(mod=1.0), carcol='today',
               paint=dict(today=1.0), paint2=dict(today=1.0),
               lamp='cobra', marks=1.0, solar=0.04),
}

# the fleet's paint, display RGB with weights (see `carcol` above)
CAR_COLOURS = {
    'black': [((0.02, 0.02, 0.02), 8), ((0.06, 0.08, 0.06), 1), ((0.10, 0.04, 0.04), 1)],
    'dark30': [((0.02, 0.02, 0.02), 5), ((0.06, 0.08, 0.14), 2), ((0.14, 0.05, 0.05), 1), ((0.08, 0.12, 0.08), 1),
               ((0.30, 0.30, 0.28), 1), ((0.42, 0.36, 0.26), 1)],
    'post45': [((0.02, 0.02, 0.02), 4), ((0.10, 0.16, 0.26), 2), ((0.30, 0.40, 0.32), 1), ((0.55, 0.52, 0.44), 1),
               ((0.16, 0.06, 0.06), 1), ((0.80, 0.78, 0.70), 1)],
    'pastel50': [((0.40, 0.72, 0.70), 2), ((0.94, 0.62, 0.52), 1), ((0.95, 0.90, 0.72), 2), ((0.62, 0.80, 0.66), 1),
                 ((0.55, 0.70, 0.86), 2), ((0.02, 0.02, 0.02), 2), ((0.70, 0.10, 0.10), 1), ((0.92, 0.92, 0.90), 2)],
    'bright60': [((0.92, 0.92, 0.90), 3), ((0.45, 0.62, 0.80), 2), ((0.30, 0.62, 0.62), 1), ((0.72, 0.08, 0.08), 2),
                 ((0.82, 0.76, 0.60), 2), ((0.10, 0.20, 0.40), 1), ((0.02, 0.02, 0.02), 1), ((0.20, 0.36, 0.20), 1)],
    'earth70': [((0.36, 0.22, 0.12), 3), ((0.72, 0.60, 0.40), 2), ((0.70, 0.56, 0.18), 2), ((0.42, 0.46, 0.18), 2),
                ((0.78, 0.36, 0.10), 1), ((0.92, 0.92, 0.88), 2), ((0.10, 0.20, 0.12), 1), ((0.02, 0.02, 0.02), 1)],
    'mix80': [((0.72, 0.08, 0.08), 3), ((0.92, 0.92, 0.90), 3), ((0.40, 0.50, 0.66), 2), ((0.74, 0.66, 0.52), 2),
              ((0.02, 0.02, 0.02), 2), ((0.60, 0.60, 0.62), 1), ((0.36, 0.22, 0.12), 1)],
    'green90': [((0.08, 0.24, 0.16), 3), ((0.10, 0.34, 0.36), 1), ((0.92, 0.92, 0.90), 3), ((0.60, 0.08, 0.10), 2),
                ((0.02, 0.02, 0.02), 2), ((0.66, 0.67, 0.70), 2), ((0.12, 0.18, 0.40), 1)],
    'silver00': [((0.68, 0.69, 0.71), 5), ((0.92, 0.92, 0.90), 3), ((0.02, 0.02, 0.025), 3), ((0.40, 0.41, 0.43), 2),
                 ((0.10, 0.18, 0.40), 1), ((0.60, 0.06, 0.06), 1)],
    'today': [((0.92, 0.92, 0.90), 25), ((0.42, 0.43, 0.45), 23), ((0.02, 0.02, 0.025), 22), ((0.70, 0.71, 0.73), 10),
              ((0.10, 0.18, 0.42), 8), ((0.62, 0.06, 0.06), 7), ((0.55, 0.50, 0.40), 5)],
}

_YEARS = sorted(TABLE)


def _row_pair(era):
    """the two rows round a year and the weight of the later one"""
    if era is None: return TABLE[_YEARS[-1]], TABLE[_YEARS[-1]], 0.0
    if era <= _YEARS[0]: return TABLE[_YEARS[0]], TABLE[_YEARS[0]], 0.0
    if era >= _YEARS[-1]: return TABLE[_YEARS[-1]], TABLE[_YEARS[-1]], 0.0
    for a, b in zip(_YEARS, _YEARS[1:]):
        if a <= era <= b: return TABLE[a], TABLE[b], (era - a) / (b - a)


def P(key, era):
    """a TABLE parameter at any year: numbers and mixes interpolate, words
    step at the later row's year"""
    ra, rb, t = _row_pair(era)
    va, vb = ra[key], rb[key]
    if isinstance(va, (int, float)): return va + (vb - va) * t
    if isinstance(va, dict):
        ks = set(va) | set(vb)
        m = {k: va.get(k, 0.0) * (1 - t) + vb.get(k, 0.0) * t for k in ks}
        tot = sum(m.values()) or 1.0
        return {k: v / tot for k, v in m.items() if v > 0}
    return vb if t >= 1.0 else va


def car_colours(era):
    """the kerb's paint mix at a year: both neighbouring rows' mixes, weighted"""
    ra, rb, t = _row_pair(era)
    out = [(c, w * (1 - t)) for c, w in CAR_COLOURS[ra['carcol']]]
    if t > 0: out += [(c, w * t) for c, w in CAR_COLOURS[rb['carcol']]]
    return [(c, w) for c, w in out if w > 0]


def pick(mix, r):
    """a weighted draw from a {name: share} mix with r in [0, 1)"""
    acc = 0.0
    for k, v in sorted(mix.items()):
        acc += v
        if r < acc: return k
    return sorted(mix)[-1] if mix else None


# ── the freeways: absent before they opened ─────────────────────────────────
# Today's export draws the freeways as streets. Each freeway surface (DataSF
# classcode 1 mainline, 6 ramps) takes its name from the nearest named
# centreline and its opening year from here. SOURCED:
#   I-80 Bay Bridge approach: with the bridge, 12 Nov 1936.
#   US 101 Doyle Drive (Presidio): 1936, the Golden Gate's approach (replaced
#     by the Presidio Parkway 2012-15, which is what the export draws).
#   US 101 Central Freeway: 1959 (Wikipedia 'Central Freeway'; SPUR 'When the
#     Freeways Came Down').
#   US 101 Bayshore Freeway: Army St to Bryant/7th opened 1 Oct 1953, the
#     rest of it in the city by 1962 (gribblenation 'The Bayshore Freeway';
#     SF Chronicle vault) — 1953 north of Army St, 1957 south of it
#     [convention on the southern date].
#   I-280: in the city through the 1960s, 'north towards 18th Street by
#     1969', the King Street ramps 1997 (gribblenation 'The strange evolution
#     of Interstate 280') — 1964 south of Army St, 1969 north [convention].
#   HWY 1 (19th Avenue, Park Presidio) and US 101 on Lombard/Richardson are
#     surface streets and are not gated here.
def freeway_year(name, x, y):
    if not name: return None
    if name.startswith('I-80'): return 1936
    if name.startswith('I-280'): return 1964 if y < -1100 else 1969
    if name.startswith('HWY 101'):
        if y > 4300: return 1936 if x < -1300 else None       # Doyle Drive / surface Marina approach
        if y > 1000 and x < 2700: return 1959                  # the Central Freeway
        return 1953 if y > -1100 else 1957                     # the Bayshore
    return None


# ── street trees, cars, paving ──────────────────────────────────────────────
def street_tree_keep(era):
    """share of the undated street trees standing (TABLE `trees`)"""
    return 1.0 if era is None else P('trees', era)


def car_occupancy(era):
    """share of kerb slots with a parked car (TABLE `cars`)"""
    if era is None: return TABLE[2020]['cars']
    return 0.0 if era < 1908 else P('cars', era)


def pavement(era, x, y):
    """what the carriageway was made of. SOURCED in outline: plank and then
    macadam failed under the weather and the horses; from the 1880s Sonoma
    quarries sent millions of basalt blocks, laid above all where the cable
    and street railways had to keep the paving round their slot and rails
    (Sonoma Valley Sun 2021 'From Schocken Hill to the Streets of San
    Francisco'; Port of SF / SFOCII 'History of South Beach Paving Blocks').
    The line between block and dirt is a CONVENTION: basalt block in the old
    core, graded earth and sand beyond it."""
    if era is None or era >= 1950: return 'asphalt'
    if era < 1910:
        return 'basalt' if (x > 1500 and y > 2200) else 'dirt'
    return 'oldpave'


# ── shared scene helpers (Blender side: mathutils) ──────────────────────────
class OpenLand:
    """the open-land raster of a year: for every cell, how far it is from the
    nearest standing building (era.open_factor), and whether that open
    ground is dune sand (is_dune_ground). box = (x0, y0, x1, y1), res in m."""
    def __init__(self, recs, box, res, ground, pad=80.0):
        from mathutils.kdtree import KDTree
        pts = [p for b in recs for p in b['ring']]
        kd = KDTree(max(1, len(pts)))
        for i, p in enumerate(pts): kd.insert((p[0], p[1], 0), i)
        kd.balance()
        self.x0, self.y0, self.res = box[0] - pad, box[1] - pad, res
        self.W = int((box[2] - box[0] + 2 * pad) / res); self.H = int((box[3] - box[1] + 2 * pad) / res)
        self.open = [0.0] * (self.W * self.H); self.sand = [0.0] * (self.W * self.H)
        for j in range(self.H):
            for i in range(self.W):
                x, y = self.x0 + (i + 0.5) * res, self.y0 + (j + 0.5) * res
                o = open_factor(kd.find((x, y, 0))[2]) if pts else 1.0
                if o <= 0: continue
                self.open[j * self.W + i] = o
                if x < DUNE_X:
                    g = ground(x, y)
                    if g is not None and is_dune_ground(x, y, g): self.sand[j * self.W + i] = o

    def at(self, x, y, grid=None):
        i, j = int((x - self.x0) / self.res), int((y - self.y0) / self.res)
        g = self.open if grid is None else grid
        return g[j * self.W + i] if 0 <= i < self.W and 0 <= j < self.H else 0.0

    def sand_at(self, x, y): return self.at(x, y, self.sand)


class StreetGate:
    """which street surfaces stood in the year shown: freeways from their
    opening (freeway_year), other streets from the record's own year (the
    Board's acceptance or the first building on the frontage) or, undated,
    where the land round them was built up"""
    def __init__(self, box, era, open_at, pad=80.0):
        import city_data
        from mathutils.kdtree import KDTree
        self.era, self.open_at = era, open_at
        self.poly = city_data.streets(box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad)
        self.bk = {}
        for k, (rings, yr, w, cls) in enumerate(self.poly):
            xs = [x for r in rings for x, _ in r]; ys = [y for r in rings for _, y in r]
            for gi in range(int(min(xs) // 40), int(max(xs) // 40) + 1):
                for gj in range(int(min(ys) // 40), int(max(ys) // 40) + 1): self.bk.setdefault((gi, gj), []).append(k)
        self.fw = city_data.freeway_points()
        self.fkd = KDTree(len(self.fw))
        for i, f in enumerate(self.fw): self.fkd.insert((f[0], f[1], 0), i)
        self.fkd.balance()

    def at(self, x, y):
        for k in self.bk.get((int(x // 40), int(y // 40)), ()):
            if sum(_in_ring(x, y, r) for r in self.poly[k][0]) % 2: return self.poly[k]
        return None

    def stands(self, x, y):
        era = self.era
        if era is None: return True
        if water_then(x, y, era): return False
        sp = self.at(x, y)
        yr, cls = (sp[1], sp[3]) if sp else (None, None)
        if cls in (1, 6):
            _, i, dd = self.fkd.find((x, y, 0))
            fy = freeway_year(self.fw[i][2], x, y) if dd < 60 else None
            if fy is not None: return era >= fy
        if yr is not None and yr <= era: return True
        if yr is not None and self.open_at(x, y) > 0.5: return False
        return streets_graded(era) or self.open_at(x, y) < 0.5


def hero_mesh_stands(pos, era):
    """a 'heroes' mesh (flat xyz floats) is drawn only once its landmark stood"""
    if era is None: return True
    xs, ys = pos[0::3], pos[1::3]
    return landmark_stands((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, era)
