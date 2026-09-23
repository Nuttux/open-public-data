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


# The 1895 shoreline where it has moved since, read off the USGS 1:62,500 San
# Francisco sheet of 1895 (public domain, georeferenced; its NAD27 datum
# shift to this map's frame MEASURED on Alcatraz, which sits 90 m east and
# 11 m north of its WGS84 position on the sheet — the NAD27->NAD83 shift at
# San Francisco; the building-ink correlation of topo_extract.py locks onto
# the street grid's period and is not used). Traced by eye on topo_view.py's
# gridded resampling with today's centrelines over it
# (history/refs/_topo1895_marina_zoom2.png; Mission Bay traced at the earlier
# offset and moved by its difference), about +-20 m.
#  · Harbor View cove (the Marina): its shore reached south to about
#    Chestnut Street at Scott; 'filling proceeded
#    gradually from the late 1860s to 1912, when major hydraulic filling was
#    done for the PPIE' (USGS, The Marina District ... geology, history).
#  · Mission Bay's last open water, inside the rail causeway west of today's
#    UCSF campus; the filling 'lasted from approximately 1860 to 1910'
#    (FoundSF 'Mission Bay').
HARBOR_VIEW_1895 = [(-1100, 4976), (-908, 4960), (-732, 4904), (-636, 4832), (-588, 4736), (-548, 4640), (-500, 4544),
                    (-428, 4472), (-348, 4451), (-204, 4480), (-76, 4528), (20, 4592), (52, 4624), (164, 4672), (196, 4720),
                    (228, 4800), (260, 4864), (292, 4912), (308, 5008), (340, 5104), (340, 5700), (-1100, 5700)]
MISSION_BAY_1895 = [(x, y - 141) for x, y in [(3712, 1280), (3808, 1424), (3904, 1472), (4032, 1456), (4144, 1408), (4160, 1280), (4160, 960),
                    (4144, 768), (4096, 640), (4048, 672), (4000, 768), (3904, 896), (3808, 992), (3776, 1088), (3712, 1152)]]

MADE_LAND = [
    ('treasure_island', 1937, _treasure_island,
     'Army Corps of Engineers, 11 Feb 1936 - 24 Aug 1937 (Wikipedia; Treasure Island Museum)'),
    ('harbor_view_cove', 1912, lambda x, y: _in_ring(x, y, HARBOR_VIEW_1895),
     'USGS 1895 sheet; filled for the PPIE by 1912 (USGS Marina District paper)'),
    ('mission_bay', 1910, lambda x, y: _in_ring(x, y, MISSION_BAY_1895),
     'USGS 1895 sheet; filled by about 1910 (FoundSF Mission Bay)'),
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
    if 1906 < era < 1930 and burned(b['cx'], b['cy']):
        # the rebuilt city since replaced: a lot the record fills later held a
        # post-fire building with the rebuild's own odds (rebuild_share)
        if ((b['gid'] * 2654435761) % 1000) / 1000.0 < rebuild_share(era):
            b['standin'] = True; b['rebuild'] = True; b['core'] = in_core(b['cx'], b['cy']); return b
    return None


def rebuild_share(era):
    """share of the burned district rebuilt by a year. SOURCED: more than
    25,000 buildings destroyed; 'by 1909, more than 20,000 buildings had been
    constructed'; 'by 1910 the city was mostly rebuilt'; nearly complete by
    1915 (FoundSF 'Rebuilding San Francisco After the 1906 Quake'; California
    Historical Society). The curve between those points is a CONVENTION."""
    pts = [(1906, 0.0), (1907, 0.35), (1908, 0.6), (1909, 0.8), (1910, 0.9), (1915, 0.97), (1930, 1.0)]
    for (a, va), (b_, vb) in zip(pts, pts[1:]):
        if a <= era <= b_: return va + (vb - va) * (era - a) / (b_ - a)
    return 1.0


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
    the prevailing wind is from the WNW off the ocean, so transverse ridges
    lie across it (NNE-SSW) and march inland — a long windward slope, a crest,
    and a slip face at sand's angle of repose (~33 deg) on the lee (ESE) side,
    as the 1938 frames show them; crests a few metres to ~9 m ('huge dunes'
    south of the park in 1904, SF Standard 2023)."""
    from mathutils import Vector
    a = math.radians(-20.0)                                  # the wind: from the WNW
    u = x * math.cos(a) - y * math.sin(a); v = x * math.sin(a) + y * math.cos(a)
    L = 70.0                                                 # crest spacing
    warp = noise.noise(Vector((u / 260.0, v / 150.0, 1.7))) * 1.6 + noise.noise(Vector((u / 90.0, v / 60.0, 5.3))) * 0.35
    ph = (u / L + warp) % 1.0
    Hc = 2.0 + 7.0 * (noise.noise(Vector((x / 380.0, y / 380.0, 4.1))) * 0.5 + 0.5)   # crest height
    Hc *= 0.55 + 0.45 * (noise.noise(Vector((u / 120.0, v / 220.0, 0.3))) * 0.5 + 0.5)
    lee = min(0.3, Hc / 0.65 / L)                            # the slip face's share of the wavelength
    prof = (ph / (1 - lee)) ** 1.25 if ph < 1 - lee else (1.0 - ph) / lee
    swell = 2.5 * (noise.noise(Vector((x / 180.0, y / 180.0, 2.3))) * 0.5 + 0.5)
    return max(0.2, 0.4 + swell + Hc * prof)


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
#  marks     painted lines and crosswalks: the export carries today's zebra
#            and lane paint, drawn from the 1970s on. CONVENTION.
#  strip     share of Victorians 'modernised': in the 1930s and again in the
#            1950s contractors stripped the millwork and covered the siding in
#            stucco or asbestos shingle; restoration from the 1970s (San
#            Francisco Victoriana founded 1972) — sanfranciscostory.com
#            'Victorian Comeback II'; OpenSFHistory 'Victorian to Spanish';
#            CS Monitor 1980. SOURCED direction, CONVENTION shares.
#  solar     share of flat roofs carrying solar panels: ~200 applications
#            before 2008, 3,070 systems by April 2014, ~6,000 incentivised by
#            GoSolarSF since 2008 (SFPUC; Vote Solar) — over ~166,000
#            buildings.
TABLE = {
    1890: dict(trees=0.03, cars=0.0, fleet={}, carcol='black',
               paint=dict(stone=0.35, poly=0.60, pale=0.05), paint2=dict(pale=1.0),
               lamp='gas', marks=0.0, solar=0.0, strip=0.0),
    1906: dict(trees=0.04, cars=0.0, fleet={}, carcol='black',
               paint=dict(stone=0.25, poly=0.55, pale=0.20), paint2=dict(pale=1.0),
               lamp='gas', marks=0.0, solar=0.0, strip=0.0),
    1915: dict(trees=0.06, cars=0.08, fleet=dict(t20=1.0), carcol='black',
               paint=dict(stone=0.10, poly=0.35, pale=0.45, grey=0.10), paint2=dict(pale=0.8, today=0.2),
               lamp='electrolier', marks=0.0, solar=0.0, strip=0.0),
    1938: dict(trees=0.10, cars=0.25, fleet=dict(t20=0.25, r30=0.75), carcol='dark30',
               paint=dict(poly=0.10, pale=0.45, grey=0.45), paint2=dict(pale=0.5, grey=0.1, today=0.4),
               lamp='electrolier', marks=0.0, solar=0.0, strip=0.12),
    1950: dict(trees=0.16, cars=0.40, fleet=dict(r30=0.75, f50=0.25), carcol='post45',
               paint=dict(pale=0.30, grey=0.70), paint2=dict(pale=0.4, grey=0.3, today=0.3),
               lamp='electrolier', marks=0.0, solar=0.0, strip=0.25),
    1960: dict(trees=0.20, cars=0.50, fleet=dict(r30=0.15, f50=0.60, l60=0.25), carcol='pastel50',
               paint=dict(pale=0.28, grey=0.72), paint2=dict(pale=0.3, grey=0.3, today=0.4),
               lamp='cobra', marks=0.0, solar=0.0, strip=0.32),
    1970: dict(trees=0.28, cars=0.58, fleet=dict(f50=0.20, l60=0.80), carcol='bright60',
               paint=dict(pale=0.25, grey=0.60, color=0.15), paint2=dict(pale=0.2, grey=0.2, today=0.6),
               lamp='cobra', marks=1.0, solar=0.0, strip=0.32),
    1980: dict(trees=0.36, cars=0.62, fleet=dict(l60=0.55, b80=0.45), carcol='earth70',
               paint=dict(pale=0.25, grey=0.40, color=0.35), paint2=dict(pale=0.1, grey=0.1, today=0.8),
               lamp='cobra', marks=1.0, solar=0.0, strip=0.26),
    1990: dict(trees=0.55, cars=0.62, fleet=dict(l60=0.15, b80=0.70, mod=0.15), carcol='mix80',
               paint=dict(pale=0.20, grey=0.25, color=0.55), paint2=dict(today=1.0),
               lamp='cobra', marks=1.0, solar=0.0, strip=0.2),
    2000: dict(trees=0.72, cars=0.62, fleet=dict(b80=0.40, mod=0.60), carcol='green90',
               paint=dict(today=1.0), paint2=dict(today=1.0),
               lamp='cobra', marks=1.0, solar=0.0, strip=0.16),
    2010: dict(trees=0.86, cars=0.62, fleet=dict(b80=0.10, mod=0.90), carcol='silver00',
               paint=dict(today=1.0), paint2=dict(today=1.0),
               lamp='cobra', marks=1.0, solar=0.006, strip=0.13),
    2020: dict(trees=1.00, cars=0.62, fleet=dict(mod=1.0), carcol='today',
               paint=dict(today=1.0), paint2=dict(today=1.0),
               lamp='cobra', marks=1.0, solar=0.04, strip=0.1),
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


# ── structures the record has lost: the freeways that came down ─────────────
# The export draws today's roads; these stood and were removed. Paths in world
# metres, laid on today's DataSF centrelines (3psu-pn9h, via base/street-lines
# and strt/street-lines-2): the Embarcadero Freeway on THE EMBARCADERO from
# Mission Street to Broadway and its approach from the Bay Bridge near First
# Street; the Central Freeway between Octavia and Laguna (midway, from the
# Octavia and Laguna centrelines) from Market to Fell, then curving north-east
# to Franklin at Golden Gate Avenue. SOURCED dates:
#   Embarcadero Freeway (SR 480): opened 5 Feb 1959, double-decked; closed by
#     the 1989 Loma Prieta earthquake; demolition began 27 Feb 1991
#     (Wikipedia 'California State Route 480').
#   Central Freeway north of Market: opened April 1959, double-decked
#     between Octavia and Laguna; north of Fell removed 1992; upper deck
#     north of Mission removed late 1996; the lower deck to Fell removed 2003;
#     Octavia Boulevard opened 9 Sep 2005 (Wikipedia 'Central Freeway').
# The section (deck heights, width, bent spacing) is a CONVENTION for a
# 1950s California double-deck viaduct: decks at ~7.5 m and ~14 m, 16 m wide,
# bents every 24 m.
STRUCTURES = [
    dict(k='embarcadero_fwy', kind='viaduct2', y0=1959, y1=1991, w=16.0,
         path=[(3880, 2930), (3960, 3040), (4040, 3170), (4110, 3330), (4140, 3470), (4128, 3611),
               (4004, 3759), (3937, 3810), (3884, 3853), (3836, 3906), (3793, 3989), (3749, 4084),
               (3693, 4141), (3600, 4275), (3549, 4368)]),
    dict(k='central_fwy_fell', kind='viaduct2', y0=1959, y1=2003, deck1_until=1996, w=16.0,
         path=[(1262, 1318), (1222, 1372), (1195, 1440), (1178, 1540), (1160, 1640), (1143, 1740)]),
    dict(k='central_fwy_north', kind='viaduct2', y0=1959, y1=1992, w=14.0,
         path=[(1143, 1740), (1136, 1830), (1150, 1930), (1190, 2040), (1250, 2150), (1320, 2260), (1400, 2318)]),
]


def structures(era):
    """the lost structures standing in the year shown, with their decks"""
    if era is None: return []
    out = []
    for st in STRUCTURES:
        if st['y0'] <= era < st['y1']:
            decks = [7.5, 14.0]
            if st.get('deck1_until') and era >= st['deck1_until']: decks = [7.5]
            out.append(dict(st, decks=decks))
    return out


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
_PARKS = None


def in_park(x, y):
    """inside a published Recreation and Parks ring (DataSF gtr9-ntp6): a
    park's ground is planted, not dune — CONVENTION for the early years of the
    western parks (Golden Gate Park was begun on the dunes in 1870 and had some
    60,000 trees by 1875; its ocean end was still being reclaimed in the 1890s)"""
    global _PARKS
    if _PARKS is None:
        import city_data
        _PARKS = {}
        for k, (_, r) in enumerate(city_data.parks()):
            if len(r) < 3: continue
            xs = [p[0] for p in r]; ys = [p[1] for p in r]
            for gi in range(int(min(xs) // 100), int(max(xs) // 100) + 1):
                for gj in range(int(min(ys) // 100), int(max(ys) // 100) + 1):
                    _PARKS.setdefault((gi, gj), []).append(r)
    return any(_in_ring(x, y, r) for r in _PARKS.get((int(x // 100), int(y // 100)), ()))


# ── the built-up city on the USGS sheets (topo_extract.py) ──────────────────
# The 1:62,500 San Francisco sheets ink every built frontage: the 1895 edition
# (surveyed 1892-94) and the 1915 edition. Where the record's survivors are
# thin — demolished since — the sheet still says the block was built up.
# Masks: history/masks/usgs1895.png, usgs1915.png (G = building-ink density,
# 4 m a pixel, world frame); TOPO_DIR overrides the folder.
TOPO_DIR = os.environ.get('TOPO_DIR', '/Users/daniel/code/qipu-render-work/history/masks')
_TOPO = {}


def topo_sheet(era):
    """which sheet speaks for a year: 1895 up to the fire, 1915 to 1930"""
    if era is None or era >= 1930: return None
    return 'usgs1895' if era < 1906 else 'usgs1915'


def topo_built(x, y, era):
    """the sheet's building-ink density at a point (0..1), or 0 when no sheet
    speaks for the year or the point is off the sheet"""
    name = topo_sheet(era)
    if name is None: return 0.0
    if name not in _TOPO:
        try:
            import bpy, numpy as np
            meta = json.load(open(f'{TOPO_DIR}/{name}.json'))
            img = bpy.data.images.load(f'{TOPO_DIR}/{name}.png'); img.colorspace_settings.name = 'Non-Color'
            a = np.empty(img.size[0] * img.size[1] * 4, np.float32); img.pixels.foreach_get(a)
            a = a.reshape(img.size[1], img.size[0], 4)[::-1]           # top row first, as the PNG
            _TOPO[name] = (meta, a)
        except Exception as ex:
            print('topo sheet unavailable', name, ex); _TOPO[name] = None
    t = _TOPO[name]
    if t is None: return 0.0
    meta, a = t
    i = int((x - meta['x0']) / meta['res']); j = int((meta['y1'] - y) / meta['res'])
    if not (0 <= i < meta['w'] and 0 <= j < meta['h']) or a[j, i, 2] < 0.5: return 0.0
    return float(a[j, i, 1])


class OpenLand:
    """the open-land raster of a year: for every cell, how far it is from the
    nearest standing building (era.open_factor), and whether that open
    ground is dune sand (is_dune_ground). box = (x0, y0, x1, y1), res in m."""
    def __init__(self, recs, box, res, ground, pad=80.0, era=None):
        from mathutils.kdtree import KDTree
        self.era = era
        pts = [p for b in recs for p in b['ring']]
        kd = KDTree(max(1, len(pts)))
        for i, p in enumerate(pts): kd.insert((p[0], p[1], 0), i)
        kd.balance()
        self.x0, self.y0, self.res = box[0] - pad, box[1] - pad, res
        self.W = int((box[2] - box[0] + 2 * pad) / res); self.H = int((box[3] - box[1] + 2 * pad) / res)
        self.open = [0.0] * (self.W * self.H); self.sand = [0.0] * (self.W * self.H); self.park = [0.0] * (self.W * self.H)
        for j in range(self.H):
            for i in range(self.W):
                x, y = self.x0 + (i + 0.5) * res, self.y0 + (j + 0.5) * res
                o = open_factor(kd.find((x, y, 0))[2]) if pts else 1.0
                if o > 0 and self.era is not None:
                    tb = topo_built(x, y, self.era)          # the sheet says built up
                    o *= 1.0 - min(1.0, max(0.0, (tb - 0.12) / 0.2))
                if o <= 0: continue
                if in_park(x, y): self.park[j * self.W + i] = 1.0; self.open[j * self.W + i] = o; continue
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
        if topo_built(x, y, era) > 0.15: return True             # the period's sheet draws the built street
        if yr is not None and self.open_at(x, y) > 0.5: return False
        return streets_graded(era) or self.open_at(x, y) < 0.5


def hero_mesh_stands(pos, era):
    """a 'heroes' mesh (flat xyz floats) is drawn only once its landmark stood"""
    if era is None: return True
    xs, ys = pos[0::3], pos[1::3]
    return landmark_stands((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, era)


def build_structures(bpy, era, ground, mat, box=None, log=print):
    """the lost viaducts as geometry: each deck a slab with parapets, carried
    on two-column bents; deck heights follow the ground, smoothed over ±40 m"""
    from mathutils import Vector
    V, F = [], []

    def box3(o, a, b, c):
        p = [o, o + a, o + a + b, o + b, o + c, o + a + c, o + a + b + c, o + b + c]
        k = len(V); V.extend(tuple(q) for q in p)
        for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            F.append(tuple(k + i for i in f))
    for st in structures(era):
        path = [Vector((x, y, 0)) for x, y in st['path']]
        if box is not None and not any(box[0] - 300 <= p.x <= box[2] + 300 and box[1] - 300 <= p.y <= box[3] + 300 for p in path):
            continue
        # resample every 2 m
        P = []
        for a, b in zip(path, path[1:]):
            n = max(1, int((b - a).length / 2.0))
            P += [a + (b - a) * (i / n) for i in range(n)]
        P.append(path[-1])
        g = [ground(p.x, p.y) or 0.0 for p in P]
        gs = [sum(g[max(0, i - 20):i + 21]) / len(g[max(0, i - 20):i + 21]) for i in range(len(g))]
        hw = st['w'] / 2
        for dz in st['decks']:
            for i in range(len(P) - 1):
                a, b = P[i], P[i + 1]; t = (b - a).normalized(); n_ = Vector((-t.y, t.x, 0))
                za, zb = gs[i] + dz, gs[i + 1] + dz
                A, B = Vector((a.x, a.y, za)), Vector((b.x, b.y, zb))
                # the slab, 1.2 m deep
                for (s0, s1, z0, z1) in ((-hw, hw, -1.2, 0.0), (-hw, -hw + 0.4, 0.0, 1.0), (hw - 0.4, hw, 0.0, 1.0)):
                    q = [A + n_ * s0 + Vector((0, 0, z0)), B + n_ * s0 + Vector((0, 0, z0)), B + n_ * s1 + Vector((0, 0, z0)), A + n_ * s1 + Vector((0, 0, z0))]
                    k = len(V); top = [x + Vector((0, 0, z1 - z0)) for x in q]; V.extend(tuple(x) for x in q + top)
                    for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
                        F.append(tuple(k + j for j in f))
        # bents every 24 m: two columns and a cap beam under each deck
        for i in range(0, len(P) - 1, 12):
            a = P[i]; t = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized(); n_ = Vector((-t.y, t.x, 0))
            top = gs[i] + max(st['decks']) - 1.2
            for side in (-1, 1):
                c = a + n_ * side * (hw - 2.0)
                box3(Vector((c.x - 0.6, c.y - 0.6, g[i] - 0.5)), Vector((1.2, 0, 0)), Vector((0, 1.2, 0)), Vector((0, 0, top - g[i] + 0.5)))
            for dz in st['decks']:
                o = a - n_ * hw + Vector((0, 0, gs[i] + dz - 2.4)) - t * 0.8
                box3(o, n_ * st['w'], t * 1.6, Vector((0, 0, 1.2)))
        log('lost structure standing:', st['k'], 'decks', st['decks'])
    if not F: return None
    me = bpy.data.meshes.new('lost_structures'); me.from_pydata(V, [], F); me.update()
    ob = bpy.data.objects.new('lost_structures', me); bpy.context.scene.collection.objects.link(ob); me.materials.append(mat)
    return ob


def infill(all_recs, era, placed_gids, radius=80.0, share_min=0.6, gap_min=25):
    """the buildings the record has lost outside the fire: a record dated
    after the year shown that REPLACED something — it is 25+ years younger
    than its neighbourhood, and 60 %+ of the buildings within 80 m already
    stood — gets a stand-in of its neighbours' period and height on its
    footprint. CONVENTION, and the reasoning is the record's own: a street
    whose buildings date from the 1900s was not empty in 1950 where a 1970
    building stands today. Returns the stand-in records to add."""
    if era is None: return []
    from mathutils.kdtree import KDTree
    kd = KDTree(max(1, len(all_recs)))
    for i, b in enumerate(all_recs): kd.insert((b['cx'], b['cy'], 0), i)
    kd.balance()
    out = []
    for b in all_recs:
        if b['gid'] in placed_gids or water_then(b['cx'], b['cy'], era): continue
        y = b['year'] or 0
        if y <= era: continue
        nb = [all_recs[i] for _, i, _ in kd.find_range((b['cx'], b['cy'], 0), radius) if all_recs[i]['gid'] != b['gid']]
        old = [n for n in nb if (n['year'] or 0) and n['year'] <= era]
        tb = topo_built(b['cx'], b['cy'], era)
        sheet_says = tb > 0.3 and not burned(b['cx'], b['cy'])
        if not sheet_says:
            if len(nb) < 6 or len(old) / len(nb) < share_min: continue
        yrs = sorted(n['year'] for n in old)
        med = yrs[len(yrs) // 2] if yrs else (1885 if era < 1906 else 1910)
        if y - med < gap_min and not sheet_says: continue
        hs = sorted(n['h'] for n in old) or [9.0]
        b = dict(b); b['standin'] = True; b['nb_year'] = min(med, era); b['nb_h'] = min(hs[len(hs) // 2], 14.0 if era < 1930 else 99)
        out.append(b)
    return out


# ── the rails of the year: cable, streetcar, metro ──────────────────────────
# SOURCED: today's lines (DataSF 9exe-acju Muni Simple Routes, base/rail.json)
# each carry the year the Board is recorded paying to build them
# (pipeline/seeds/sf_rail_opened.json; 0 = older than the record: the cable
# lines — California Street 1878, Powell 1888 — and Market Street); the torn-up
# private lines the Board's minutes date (base/rail-history.json: its `year`
# and `ended`, on today's centrelines). CONVENTION: the rolling stock drawn on
# them (a car every ~300 m; cable cars and period streetcars as simple bodies).
# The lost cable network (Wikipedia 'San Francisco cable car system': eight
# companies, twenty-three lines opened 1873-1890; most converted to electric
# streetcars after the 1906 fire). Each line runs on the named street between
# two cross streets, laid on the published straight label stretches
# (city_data.line_between). SOURCED: street, termini, opening year; the
# cable phase ends 1906 unless a later end is named. CONVENTION: after 1906 the
# converted lines are drawn as streetcar track until 1945 (the Market Street
# Railway passed to Muni in 1944 and its lines went to buses in the years after).
CABLE_LINES = [
    # street, from, to, opened, cable ended, company
    ('CLAY ST', 'KEARNY ST', 'VAN NESS AVE', 1873, 1942, 'Clay Street Hill Railroad (to Van Ness 1877; Sacramento-Clay line to 1942)'),
    ('SUTTER ST', 'SANSOME ST', 'PRESIDIO AVE', 1877, 1906, 'Sutter Street Railway'),
    ('LARKIN ST', 'BUSH ST', 'HAYES ST', 1877, 1906, 'Sutter Street Railway, Larkin branch'),
    ('CALIFORNIA ST', 'VAN NESS AVE', 'PRESIDIO AVE', 1878, 1951, 'California Street Cable Railroad (west of Van Ness)'),
    ('GEARY ST', 'KEARNY ST', 'VAN NESS AVE', 1880, 1912, 'Geary Street, Park & Ocean Railway'),
    ('GEARY BLVD', 'VAN NESS AVE', 'PRESIDIO AVE', 1880, 1912, 'Geary Street, Park & Ocean Railway'),
    ('UNION ST', 'COLUMBUS AVE', 'STEINER ST', 1882, 1906, 'Presidio & Ferries Railway'),
    ('MARKET ST', 'STEUART ST', 'CASTRO ST', 1883, 1906, 'Market Street Cable Railway'),
    ('HAIGHT ST', 'MARKET ST', 'STANYAN ST', 1883, 1906, 'Market Street Cable Railway, Haight branch'),
    ('VALENCIA ST', 'MARKET ST', '28TH ST', 1883, 1906, 'Market Street Cable Railway, Valencia branch'),
    ('MCALLISTER ST', 'MARKET ST', 'BAKER ST', 1884, 1906, 'Market Street Cable Railway, McAllister branch'),
    ('HAYES ST', 'MARKET ST', 'STANYAN ST', 1886, 1906, 'Market Street Cable Railway, Hayes branch'),
    ('CASTRO ST', 'MARKET ST', '26TH ST', 1887, 1941, 'Market Street Cable Railway, Castro branch'),
    ('JACKSON ST', 'POWELL ST', 'STEINER ST', 1888, 1956, 'Ferries & Cliff House Railway, Washington-Jackson'),
    ('WASHINGTON ST', 'POWELL ST', 'STEINER ST', 1888, 1956, 'Ferries & Cliff House Railway, Washington-Jackson'),
    ('HOWARD ST', 'STEUART ST', '11TH ST', 1889, 1906, 'Omnibus Railroad & Cable Company'),
]
_CABLE_GEOM = None


def rails(era):
    """[(x0, y0, x1, y1, kind)] of the lines running in the year shown"""
    if era is None: return []
    out = []
    global _CABLE_GEOM
    if _CABLE_GEOM is None:
        import city_data
        _CABLE_GEOM = [(city_data.line_between(st, a, b), y0, y1, st == 'MARKET ST') for st, a, b, y0, y1, _ in CABLE_LINES]
    for g, y0, y1, st_is_market in _CABLE_GEOM:
        if not g or era < y0: continue
        # after the fire a converted line runs as streetcar track, except on
        # Market Street, whose later track is today's line (rail.json)
        kind = 'cable' if era < y1 else ('streetcar' if (y1 == 1906 and era < 1945 and not st_is_market) else None)
        if kind is None: continue
        (ax, ay), (bx, by) = g
        n = max(1, int(((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5 / 60))
        for i in range(n):
            out.append((ax + (bx - ax) * i / n, ay + (by - ay) * i / n, ax + (bx - ax) * (i + 1) / n, ay + (by - ay) * (i + 1) / n, kind))
    r = json.load(open(f'{CITY}/base/rail.json'))
    for x0, y0, x1, y1, kind, yr in r['segs']:
        if kind == 'cable' and era < 1878: continue
        if kind == 'streetcar' and era < 1906: continue      # Market Street ran cable until the fire
        if yr <= era: out.append((x0, y0, x1, y1, kind))
    h = json.load(open(f'{CITY}/base/rail-history.json'))
    for rt in h['routes']:
        if (rt['year'] or 0) > era or (rt['ended'] and era >= rt['ended']): continue
        for ln in rt['lines']:
            for (a, b) in zip(ln, ln[1:]): out.append((a[0], a[1], b[0], b[1], rt['kind']))
    return out


def build_rails(bpy, era, box, street_z, rail_mat, slot_mat, body_mats, log=print, seed=5):
    """steel rails at standard gauge on the street, the cable slot between
    them, and the cars of the period running on them. street_z(x, y) -> the
    street surface height or None."""
    import random
    from mathutils import Vector
    segs = [s for s in rails(era) if box[0] - 20 <= (s[0] + s[2]) / 2 <= box[2] + 20 and box[1] - 20 <= (s[1] + s[3]) / 2 <= box[3] + 20]
    if not segs: return
    RV, RF, SV, SF = [], [], [], []
    def strip(V, F, a, b, n, off, w, dz):
        za, zb = street_z(a.x + n.x * off, a.y + n.y * off), street_z(b.x + n.x * off, b.y + n.y * off)
        if za is None or zb is None: return
        p = [a + n * (off - w / 2), b + n * (off - w / 2), b + n * (off + w / 2), a + n * (off + w / 2)]
        zz = [za, zb, zb, za]
        k = len(V); V.extend((q.x, q.y, z + dz) for q, z in zip(p, zz)); F.append((k, k + 1, k + 2, k + 3))
    cars = []
    rnd = random.Random(seed)
    for x0, y0, x1, y1, kind in segs:
        a, b = Vector((x0, y0, 0)), Vector((x1, y1, 0))
        L = (b - a).length
        if L < 0.5: continue
        t = (b - a) / L; n = Vector((-t.y, t.x, 0))
        steps = max(1, int(L / 4.0))
        for i in range(steps):
            p0, p1 = a + (b - a) * (i / steps), a + (b - a) * ((i + 1) / steps)
            for tr in ((-1.9, 1.9) if kind != 'cable' else (-1.7, 1.7)):      # two tracks, one each way
                for g in (-0.7175, 0.7175):
                    strip(RV, RF, p0, p1, n, tr + g, 0.08, 0.035)
                if kind == 'cable': strip(SV, SF, p0, p1, n, tr, 0.035, 0.03)
        # the period's rolling stock, about one car every 300 m of line
        if rnd.random() < L / 300.0:
            u = rnd.uniform(0.2, 0.8); c = a + (b - a) * u
            tr = rnd.choice((-1.9, 1.9)); c = c + n * tr
            z = street_z(c.x, c.y)
            if z is not None and box[0] <= c.x <= box[2] and box[1] <= c.y <= box[3]:
                cars.append((c, t if tr > 0 else -t, kind))
    for nm, V, F, m in (('rails', RV, RF, rail_mat), ('cableslot', SV, SF, slot_mat)):
        if not F: continue
        me = bpy.data.meshes.new(nm); me.from_pydata(V, [], F); me.update()
        ob = bpy.data.objects.new(nm, me); bpy.context.scene.collection.objects.link(ob); me.materials.append(m)
    # the cars: body, clerestory roof, a darker band of windows
    for i, (c, t, kind) in enumerate(cars):
        Lc, Wc, Hc = ((8.3, 2.4, 3.1) if kind == 'cable' else (14.0, 2.6, 3.3) if era >= 1912 else (9.5, 2.4, 3.2))
        z = street_z(c.x, c.y) + 0.35
        n = Vector((-t.y, t.x, 0))
        V, F = [], []
        def bx(o, a_, b_, c_):
            p = [o, o + a_, o + a_ + b_, o + b_, o + c_, o + a_ + c_, o + a_ + b_ + c_, o + b_ + c_]
            k = len(V); V.extend(tuple(q) for q in p)
            for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)): F.append(tuple(k + j for j in f))
        o = Vector((c.x, c.y, z)) - t * Lc / 2 - n * Wc / 2
        bx(o, t * Lc, n * Wc, Vector((0, 0, Hc - 0.5)))
        bx(o + t * 0.8 + n * 0.35 + Vector((0, 0, Hc - 0.5)), t * (Lc - 1.6), n * (Wc - 0.7), Vector((0, 0, 0.45)))
        me = bpy.data.meshes.new(f'tram{i}'); me.from_pydata(V, [], F); me.update()
        me.materials.append(body_mats[kind if kind in body_mats else 'streetcar'])
        ob = bpy.data.objects.new(f'tram{i}', me); bpy.context.scene.collection.objects.link(ob)
    log('rails', len(segs), 'segments,', len(cars), 'cars on them')


# ── 1915: the Panama-Pacific International Exposition ───────────────────────
# SOURCED (PPIE 'Condensed Facts', 1914-15, archive.org condensedfactsco00panarich,
# history/refs/ppie_condensed_facts.txt; Wikipedia 'Tower of Jewels (PPIE)'):
#  · the Tower of Jewels, 433-435 ft, a 'circular, seven-storied tower covering an
#    acre of ground at the base', on the south line of the main group, over the
#    avenue north to the Court of the Universe, at 37.80373 N 122.4419 W —
#    which is exactly on Scott Street's published centreline, at Beach Street;
#  · the main group, 'a great walled city' of eight palaces with facades 65 ft
#    high (areas in sq ft: Agriculture 328,633, Transportation 314,000, Mines
#    252,000, Liberal Arts 251,300, Food Products 236,690, Manufactures 234,000,
#    Varied Industries 219,000, Education 205,100) round three courts — the
#    Court of the Universe (700 x 900 ft) in the middle, Four Seasons west,
#    Abundance east;
#  · Machinery to the east, 968 x 368 ft; Fine Arts to the west on its lagoon;
#    in the South Garden Horticulture, glass, 672 x 320 ft, dome 160 ft, and
#    Festival Hall (57,400 sq ft), domed;
#  · the palaces 'of a soft, cold, gray tint, a kind of smoked ivory' under
#    Jules Guerin's single colour scheme, doorways vividly coloured.
# CONVENTION: the exact outlines — the group is laid out as a 900 x 315 m walled
# rectangle on the Scott Street axis (its area matches the eight palaces' sum
# plus the courts), turned to the Marina's street grid (Scott Street runs
# 9.1 degrees west of north); palaces as blocks with a clerestory and a minor
# dome each; roofs and domes in muted terracotta and verdigris.
PPIE_YEARS = (1915, 1915)          # open 20 Feb - 4 Dec 1915; torn down in 1916 but Fine Arts


def build_ppie(bpy, era, ground, mats, log=print):
    if era is None or not (PPIE_YEARS[0] <= era <= PPIE_YEARS[1]): return
    import math
    from mathutils import Vector
    T = Vector((-343.0, 4868.0, 0.0))                       # the Tower of Jewels
    N = Vector((-0.1587, 0.9873, 0.0)); Ee = Vector((N.y, -N.x, 0.0))   # the grid's north and east
    zb = ground(T.x, T.y) or 3.0
    def W(u, v, z=0.0):                                       # local metres east/north of the tower
        p = T + Ee * u + N * v; return Vector((p.x, p.y, zb + z))
    parts = {k: ([], []) for k in mats}
    def box(mat, u0, v0, u1, v1, z0, z1):
        V, F = parts[mat]; k = len(V)
        P = [W(u0, v0, z0), W(u1, v0, z0), W(u1, v1, z0), W(u0, v1, z0), W(u0, v0, z1), W(u1, v0, z1), W(u1, v1, z1), W(u0, v1, z1)]
        V.extend(tuple(p) for p in P)
        for f in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)): F.append(tuple(k + i for i in f))
    def dome(mat, u, v, z0, r, h, seg=16, rings=6):
        V, F = parts[mat]; base = len(V)
        for j in range(rings + 1):
            a = (j / rings) * math.pi / 2
            for i in range(seg):
                t = 2 * math.pi * i / seg
                p = W(u + math.cos(t) * r * math.cos(a), v + math.sin(t) * r * math.cos(a), z0 + h * math.sin(a))
                V.append(tuple(p))
        for j in range(rings):
            for i in range(seg):
                a0 = base + j * seg + i; a1 = base + j * seg + (i + 1) % seg
                F.append((a0, a1, a1 + seg, a0 + seg))
    H = 19.8                                                  # 65 ft facades
    # the walled city: 900 x 315 m from the tower's line north; courts cut out
    U0, U1, V0, V1 = -450.0, 450.0, 12.0, 327.0
    courts = [(-137, 137, 40, 327), (-420 + 120, -420 + 230, 120, 230), (190, 300, 120, 230)]
    # eight palace blocks: two rows, four columns, minus the courts
    cols = [(-450, -285), (-285, -137), (137, 285), (285, 450)]
    rows = [(V0, 170), (170, V1)]
    for (u0, u1) in cols:
        for (v0, v1) in rows:
            # carve the block round any court it touches (by splitting in thirds)
            pieces = [(u0, v0, u1, v1)]
            for (cu0, cu1, cv0, cv1) in courts:
                nxt = []
                for (a, b_, c, d_) in pieces:
                    if cu1 <= a or cu0 >= c or cv1 <= b_ or cv0 >= d_: nxt.append((a, b_, c, d_)); continue
                    if a < cu0: nxt.append((a, b_, cu0, d_))
                    if c > cu1: nxt.append((cu1, b_, c, d_))
                    if b_ < cv0: nxt.append((max(a, cu0), b_, min(c, cu1), cv0))
                    if d_ > cv1: nxt.append((max(a, cu0), cv1, min(c, cu1), d_))
                pieces = nxt
            for (a, b_, c, d_) in pieces:
                if c - a < 4 or d_ - b_ < 4: continue
                box('ivory', a, b_, c, d_, -1.0, H)
                box('ivory', a - 0.6, b_ - 0.6, c + 0.6, d_ + 0.6, H - 1.2, H)          # the cornice
                if c - a > 30 and d_ - b_ > 30:                                          # clerestory roof
                    box('roof', a + 8, b_ + 8, c - 8, d_ - 8, H, H + 6.0)
            uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
            dome('dome', uc, vc, H + 6.0, 11.0, 12.0)
    # the Tower of Jewels: seven stepped tiers on an acre (63.6 m square) base
    tiers = [(31.8, 0.0, 38.0), (24.0, 38.0, 58.0), (19.0, 58.0, 76.0), (15.5, 76.0, 92.0),
             (12.0, 92.0, 106.0), (9.0, 106.0, 118.0), (6.0, 118.0, 126.0)]
    for r, z0, z1 in tiers:
        box('ivory', -r, -r, r, r, z0 - (1.0 if z0 == 0 else 0.0), z1)
        box('jewel', -r - 0.3, -r - 0.3, r + 0.3, r + 0.3, z1 - 1.6, z1 - 0.6)            # the band of Novagems
    dome('jewel', 0.0, 0.0, 126.0, 4.5, 6.5)
    # the arch through the base (the gateway to the Court of the Universe): a
    # deep shadowed opening on the south and north faces
    box('shadow', -9.0, -32.2, 9.0, -31.6, 0.0, 30.0); box('shadow', -9.0, 31.6, 9.0, 32.2, 0.0, 30.0)
    # the Court of the Universe: its sunken garden, and a peristyle round it
    # (CONVENTION: a 12 m arcade on the court's 900 x 700 ft ellipse)
    for i in range(72):
        t0, t1 = 2 * math.pi * i / 72, 2 * math.pi * (i + 0.72) / 72
        cu, cv = 0.0, 40 + 107
        a0 = (cu + 128 * math.cos(t0), cv + 100 * math.sin(t0)); a1 = (cu + 128 * math.cos(t1), cv + 100 * math.sin(t1))
        if abs(a0[0]) < 14 and a0[1] < cv: continue                   # the tower's avenue comes in here
        box('ivory', min(a0[0], a1[0]) - 1, min(a0[1], a1[1]) - 1, max(a0[0], a1[0]) + 1, max(a0[1], a1[1]) + 1, -1.0, 12.0)
    box('garden', -95, 70, 95, 225, -1.0, 0.25)
    # Machinery, east: 968 x 368 ft (295 x 112 m), three naves
    box('ivory', 480, 110, 775, 222, -1.0, 24.0); box('roof', 486, 116, 769, 216, 24.0, 33.0)
    # South Garden: Horticulture (glass, 205 x 98 m, dome 160 ft = 49 m) west, Festival Hall east
    box('glassh', -352, -150, -147, -52, -1.0, 15.0); box('glassh', -300, -140, -199, -62, 15.0, 24.0)
    dome('glassh', -250, -101, 24.0, 26.0, 25.0, 20, 8)
    box('ivory', 160, -140, 240, -64, -1.0, 17.0); dome('dome', 200, -102, 17.0, 24.0, 22.0, 20, 8)
    objs = []
    for k, (V, F) in parts.items():
        if not F: continue
        me = bpy.data.meshes.new('ppie_' + k); me.from_pydata(V, [], F); me.update()
        ob = bpy.data.objects.new('ppie_' + k, me); bpy.context.scene.collection.objects.link(ob); me.materials.append(mats[k]); objs.append(ob)
    log('PPIE 1915 built:', sum(len(F) for V, F in parts.values()), 'faces')
    return objs


def ppie_footprint(x, y):
    """inside the fairground's built area (buildings of later years are not
    there in 1915, the ground is the fair's)"""
    from mathutils import Vector
    d = Vector((x + 343.0, y - 4868.0, 0.0)); N = Vector((-0.1587, 0.9873, 0.0)); Ee = Vector((N.y, -N.x, 0.0))
    u, v = d.dot(Ee), d.dot(N)
    return -460 <= u <= 790 and -160 <= v <= 340


# ── the Mission Bay rail yards ──────────────────────────────────────────────
# SOURCED: most of the 303 acres of Mission Bay 'had long been a railyard of
# the Southern Pacific Railroad Company', passed to Catellus; the Mission Bay
# North and South redevelopment plans were approved in November 1998 (OCII
# 'Mission Bay South'; Wikipedia 'Mission Bay, San Francisco'). The yard is
# drawn on the district between Townsend, Third Street, Mariposa and Seventh
# (corners from the published street stretches) from the end of the filling
# (1910) to the plan (1998), wherever no building of the year stands: tracks
# every 4.6 m parallel to Townsend Street on a ballast bed. CONVENTION: the
# track layout.
MISSION_BAY_YARD = [(4180, 2296), (4327, 481), (4047, 460), (3781, 729), (3199, 1316)]
YARD_YEARS = (1910, 1998)


def build_yards(bpy, era, box, ground, open_at, rail_mat, ballast_mat, log=print):
    if era is None or not (YARD_YEARS[0] <= era < YARD_YEARS[1]): return
    from mathutils import Vector
    d = Vector((-0.7074, -0.7068, 0)); n = Vector((-d.y, d.x, 0))
    RV, RF, BV, BF = [], [], [], []
    xs = [p[0] for p in MISSION_BAY_YARD]; ys = [p[1] for p in MISSION_BAY_YARD]
    c = Vector((sum(xs) / len(xs), sum(ys) / len(ys), 0))
    ntr = 0
    for k in range(-260, 261):
        off = k * 4.6
        for s in range(-200, 201):
            p0 = c + n * off + d * (s * 3.0); p1 = p0 + d * 3.0
            m = (p0 + p1) / 2
            if not (box[0] - 10 <= m.x <= box[2] + 10 and box[1] - 10 <= m.y <= box[3] + 10): continue
            if not _in_ring(m.x, m.y, MISSION_BAY_YARD) or open_at(m.x, m.y) < 0.3: continue
            z0, z1 = ground(p0.x, p0.y), ground(p1.x, p1.y)
            if z0 is None or z1 is None: continue
            for (w, V, F, dz) in ((1.6, BV, BF, 0.06), (0.04, RV, RF, 0.16)):
                for g in ((0.0,) if V is BV else (-0.7175, 0.7175)):
                    q = [p0 + n * (g - w), p1 + n * (g - w), p1 + n * (g + w), p0 + n * (g + w)]
                    zz = [z0, z1, z1, z0]; kk = len(V)
                    V.extend((a.x, a.y, z + dz) for a, z in zip(q, zz)); F.append((kk, kk + 1, kk + 2, kk + 3))
            ntr += 1
    for nm, V, F, m in (('yard_ballast', BV, BF, ballast_mat), ('yard_rails', RV, RF, rail_mat)):
        if not F: continue
        me = bpy.data.meshes.new(nm); me.from_pydata(V, [], F); me.update()
        ob = bpy.data.objects.new(nm, me); bpy.context.scene.collection.objects.link(ob); me.materials.append(m)
    if ntr: log('Mission Bay yard: track pieces', ntr)
