"""city_run/citycfg.py — WHICH CITY the block line (render queue -> AI -> post -> publish) works for: CITY (unset = sf).

San Francisco's values are the constants the block52 scripts carried (03/10, b14); nothing is read from disk for SF
except what those scripts read themselves. Another city reads qipu-render-work/cities/<city>/city.json:
  ref            [cx, cy, scale]      the tile pyramid's reference view (= hq_city CITY_REF)
  proj           {lon0, lat0, mpd, cosl}   the engine projection (lon/lat -> world metres)
  bbox           [s, w, n, e]         city limits box (the 'outside' mask when block.limits is absent)
  block          {...}                the block line's switches, each OFF / empty when absent:
     limits        geojson (lon/lat polygon) of the city limits: L9 cells outside = 'terrain' (not painted)
     render_env    the per-job render switches (env_b8.txt), default 'Z=9'
     snapshot      render snapshot name (lmk_pod.sh up <snap>), default '<city>1'
     overlay       render overlay files (one path per line in overlay.txt), default none
     prompt_subs   [[old, new], ...] applied to lr_run9's prompt text when prep copies it (SF: none -> byte-identical)
     rails         false: no rail prompt key (SF: rails_b8.py OSM rails + RAILKEY v8_rail5)
     pier_ctx      false: SF's Piers 15/17 lawn -> concrete fix in the AI input
     roof_rn_seam  false: SF's NAIP roof-photo box seam fix (post_sb ROOF_RN_SEAM)
     colour_table  '' : the gid-keyed facade colour table post_sb colour2 locks to (SF fa_table_v3)
     areas         '' : the risk probes file for the post sheet (SF city_run/run/areas.json)
     quay_lip      1 (absent = 1, SF): post_sb QUAY_LIP seawall lip painted on the AI output; 0 where the render has its own seawall (Vancouver: QUAY_WALL)
     city_root     the block planner's coverage root (sb.py CITY_ROOT), default cities/<city>/blocks
Import from any city_run script: sys.path.insert(0, <city_run>); import citycfg as CC."""
import json, math, os

W = '/Users/daniel/code/qipu-render-work'
CITY = os.environ.get('CITY', 'sf') or 'sf'
SF = CITY == 'sf'
HERE = os.path.dirname(os.path.abspath(__file__))

# pyramid geometry, shared by every city (hq_city PYRAMID MODE): Z=9 canvas = 32 x 32 crops of 5120 x 3072 px
CA, SA = math.cos(math.pi / 6), 0.42
KX, KY, ZT = math.sqrt(2) * CA, math.sqrt(2) * SA, math.sqrt(2 * (CA * CA - SA * SA))
CW, CH, NCOL, NROW = 5120, 3072, 32, 32
PCW, PCH = 2560 * 64, 1536 * 64

if SF:
    J = {}
    CX, CY = 241.427019126574, 707.0567508859249
    SCALE = 2 ** (round(math.log2(0.06898352692062097) * 24) / 24)
    LON0, LAT0 = -122.438, 37.76
    KXM, KYM = 111320 * math.cos(math.radians(37.76)), 111320
    BLOCK = dict(
        limits='', snapshot='combo7', overlay=f'{W}/combo/block_overlay',
        render_env=('Z=9 SE_APRON=1 WATER_V4=1 FAITHFUL=1 FA_FILE={S}/data/faithful/fa_table_v3.json ROOF_NAIP=1 '
                    'RN_CROP={S}/data/faithful/rn_sf8.png BTEX_REAL=1 BTEX_MODE=paint BTEX_FILE={S}/data/faithful/btex_walls_v2g.json '
                    'BTEX_ATLAS={S}/data/faithful/btex_atlas_v2.png TREE_EDGE=1 FOOT_SPLIT=1 LM_CLEAR_KEEP=1 ROOF_CALM=1 WAKE_NOAO=1 '
                    'LM_SF_CROWN=1 LM_MODELS_OVERRIDE={S}/oo_models SE_FILE={S}/se_aprons_clip.json MARKS_IX=1 LIFE_PEOPLE=0 HOT_CROWD=0 '
                    'TREE_ROAD=1 CRANE_V2=1 GREENROOF_V2=1 TREE_WATER=1 SLIVER=1 TREE_ROOF=1 LAKE_CLEAR2=1 LM_COPPER_KEYS=deyoung'),
        prompt_subs=[], rails=True, rail_key='v8_rail5', pier_ctx=True, roof_rn_seam=True,
        colour_table=f'{W}/snap/combo2/data/faithful/fa_table_v3.json', areas=f'{HERE}/run/areas.json',
        city_root='/Volumes/QIPU-SSD/qipu-city', viewer_right='block_b10')
else:
    J = json.load(open(f'{W}/cities/{CITY}/city.json'))
    CX, CY, SCALE = map(float, J['ref'])
    P_ = J['proj']; LON0, LAT0 = P_['lon0'], P_['lat0']; KXM, KYM = P_['mpd'] * P_['cosl'], P_['mpd']
    BLOCK = dict(limits='', snapshot=f'{CITY}1', overlay='', render_env='Z=9', prompt_subs=[], rails=False, rail_key='v5_dry',
                 pier_ctx=False, roof_rn_seam=False, colour_table='', areas='', city_root=f'{W}/cities/{CITY}/blocks', viewer_right='')
    BLOCK.update(J.get('block', {}))
SZ = SCALE * 64   # Z = 9

def render_env(snap_dir):
    """the per-job render switches with the snapshot's path filled in"""
    return BLOCK['render_env'].replace('{S}', snap_dir)

# ---- world <-> L9 px (rails_b8.l9 for SF, the same algebra for any city) ----
def l9_of_world(x, y, z):
    return 2 * ((x * KX - CX) * SZ + PCW / 4), 2 * ((CY - (y * KY + z * ZT)) * SZ + PCH / 4)
def world_of_lonlat(lon, lat):
    return (lon - LON0) * KXM, (lat - LAT0) * KYM
def lonlat_of_world(x, y):
    return x / KXM + LON0, y / KYM + LAT0

_DEM = []
def dem():
    """(z(x, y) vectorised over numpy arrays): SF the viewer's dem20 (rails_b8); another city its engine's terrain-fine grid"""
    import numpy as np
    if _DEM: return _DEM[0]
    if SF:
        M = json.load(open(f'{W}/cloud/viewer/dem20.json')); Z = np.fromfile(f'{W}/cloud/viewer/dem20.bin', np.int16).reshape(M['ny'], M['nx']) / 10
        x0, y0, sx, sy, top = M['x0'], M['y0'], M['step'], M['step'], False
    else:
        E = J['engine']; M = json.load(open(f'{E}/base/terrain-fine.json'))
        Z = np.fromfile(f'{E}/base/terrain-fine.bin', '<u2').reshape(M['h'], M['w']).astype(np.float32) / 65535 * M['zmax']
        ex = M['extent']; x0, y0 = ex[0], ex[1]; sx, sy = (ex[2] - ex[0]) / (M['w'] - 1), (ex[3] - ex[1]) / (M['h'] - 1); top = False   # row 0 = south (terrain_hq.engine_ground)
    def z(x, y):
        c = np.clip(np.rint((x - x0) / sx).astype(int) if not SF else ((x - x0) / sx).astype(int), 0, Z.shape[1] - 1); r = np.clip(np.rint((y - y0) / sy).astype(int) if not SF else ((y - y0) / sy).astype(int), 0, Z.shape[0] - 1)
        if top: r = Z.shape[0] - 1 - r
        return np.maximum(Z[r, c], 0)
    _DEM.append(z); return z

def lonlat_of_l9(X9, Y9):
    """L9 px -> lon, lat on the ground (3 fixed-point steps through the DEM, as sb.outside_mask)"""
    import numpy as np
    z_ = dem(); x = ((X9 / 2 - PCW / 4) / SZ + CX) / KX; t = CY - (Y9 / 2 - PCH / 4) / SZ; z = np.zeros_like(x)
    for _ in range(3):
        y = (t - z * ZT) / KY; z = z_(x, y)
    y = (t - z * ZT) / KY; return lonlat_of_world(x, y)

def l9_of_lonlat(lat, lon):
    """lat, lon -> L9 px (rails_b8.l9 for SF)"""
    import numpy as np
    x, y = world_of_lonlat(np.asarray(lon, float), np.asarray(lat, float)); return l9_of_world(x, y, dem()(x, y))

def outside(lon, lat):
    """True where a point is outside the city (not painted): SF its county rule; another city its limits polygon, else its bbox"""
    import numpy as np
    if SF: return (lat < 37.7080) | ((lat > 37.815) & (lon < -122.44)) | (lat > 37.845)
    if BLOCK.get('limits'):
        from shapely.geometry import shape
        from shapely import contains_xy
        g = json.load(open(BLOCK['limits'])); g = g.get('geometry', g)
        ins = contains_xy(shape(g), np.ravel(lon), np.ravel(lat))
        return ~ins.reshape(np.shape(lon))
    s, w, n, e = J['bbox']; return (lat < s) | (lat > n) | (lon < w) | (lon > e)

def prompt_text(src):
    """lr_run9's source with the city's prompt substitutions (SF: unchanged, byte for byte)"""
    for a, b in BLOCK.get('prompt_subs', []):
        assert a in src, f'prompt_subs: {a!r} not in lr_run9'
        src = src.replace(a, b)
    return src

if __name__ == '__main__':
    print(json.dumps(dict(city=CITY, ref=[CX, CY, SCALE], lonlat0=[LON0, LAT0], kxm=KXM, kym=KYM, block=BLOCK,
                          m_per_px_l7=1 / (2 * SCALE * 16 * KX), m_per_px_l9=1 / (2 * SZ * KX)), indent=1))
