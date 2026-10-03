"""WHICH CITY the prep scripts work for: CITY (unset = sf).

    CITY=vancouver python3 newb_prep.py

San Francisco keeps its historic places (the work folder qipu-render-work/, the
engine chunks of the opd-render worktree). Another city reads
qipu-render-work/cities/<city>/city.json: `engine` (its qc/1 chunks), `bbox`
(south, west, north, east: the Overpass box of its city limits), the survey
year of its footprints, and `env` (hq_city's switches, see citysnap.sh); its
work folder is that city's folder. The projection is the engine's own, from
the chunks' manifest.json (x = (lon − lon0)·mpd·cosl east, y = (lat − lat0)·mpd
north) — for SF exactly the constants the scripts carried before.

citysnap.sh leaves this file's paths alone (it re-points everything else)."""
import json, os

ROOT = '/Users/daniel/code/qipu-render-work'
# RENDER SWITCHES THAT READ SAN FRANCISCO'S OWN DATA (gid tables, SF coordinates, SF-only layers). San Francisco keeps
# its defaults (this list is not read for SF). For another city citysnap.sh writes each one as '0' into the snapshot's
# hq_city.py BEFORE the city's own city.json `env`: absent from city.json = off; a city that builds the layer turns it on there.
SF_ONLY = (
    'FAITHFUL', 'ROOF_NAIP', 'BTEX_REAL', 'SE_APRON', 'LM_SF_CROWN', 'TREE_EDGE', 'TREE_ROAD', 'WATER_V4',   # block env_b8.txt inputs
    'SANBORN', 'SITES', 'LOTS_V2', 'CRANE_V2', 'TRACT', 'ROWS', 'PLACES_OV', 'SOUTH',                     # SF records / lots / rows
    'MARINA_V2', 'CRUISE', 'PORT_BOXES', 'BOATS_V2', 'HOT', 'RED_VERIFY', 'LIFE_MARKS',                   # SF water / life places
    'GLASS_V2', 'GROUND_V2', 'TREE_WATER',                                                                 # SF landmark coords, SF sea mask
)
CITY = os.environ.get('CITY', 'sf')
SF = CITY == 'sf'
if SF:
    CFG = dict(city='sf', engine='/Users/daniel/code/opd-render/website/public/data/us/sf/city', work=ROOT,
               bbox=[37.700, -122.520, 37.840, -122.340],
               # DataSF's footprints were surveyed ~2016; an OSM building they lack is taken as built after (2019, newb_prep)
               survey_year=2019)
else:
    CFG = json.load(open(f'{ROOT}/cities/{CITY}/city.json'))
    CFG.setdefault('work', f'{ROOT}/cities/{CITY}')
ENGINE, WORK = CFG['engine'], CFG['work']
BBOX = CFG['bbox']
SURVEY_YEAR = int(CFG['survey_year'])

_P = json.load(open(f'{ENGINE}/manifest.json'))['proj']
LON0, LAT0 = _P['lon0'], _P['lat0']
KX, KY = _P['mpd'] * _P['cosl'], _P['mpd']

def proj(lon, lat):
    """lon, lat → engine world metres"""
    return ((lon - LON0) * KX, (lat - LAT0) * KY)

def unproj(x, y):
    return (LON0 + x / KX, LAT0 + y / KY)

def work(*p):
    return os.path.join(WORK, *p)

def tiles(nlat=2, nlon=3):
    """the city box cut in nlat x nlon Overpass tiles: (south, west, north, east)"""
    s, w, n, e = BBOX
    return [(round(s + (n - s) * i / nlat, 3), round(w + (e - w) * j / nlon, 3),
             round(s + (n - s) * (i + 1) / nlat, 3), round(w + (e - w) * (j + 1) / nlon, 3))
            for i in range(nlat) for j in range(nlon)]
