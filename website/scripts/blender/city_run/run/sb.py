"""city/run/sb.py (city-run planner, 29/09): ONE place for the whole-city geometry, the super-blocks (SB), their order and their tile counts.
Imported by city.py / prep_sb.py / post_sb.py. CPU only, no GPU.

City = 163840 x 98304 L9 px = 32 x 32 L9 crops of 5120 x 3072 (crop i:j = cols x rows, like the render's Z=9 ONLY=i:j).
Super-blocks: column groups 0-4 | 5-9 | 10-14 | 15-19 | 20-25 | 26-31 x row groups 0-7 | 8-15 | 16-23 | 24-31 -> 24 SBs of at most 6 x 8 crops
(= block_b8, which IS the SB 'C4R1': crop cols 20..25 x rows 8..15, Q 102400..133120 x 24576..49152).
x SB edges are multiples of 5120 = 8 x 640: never inside a stride-640 quilt band. y edges 24576 / 73728 fall inside a horizontal band, so an
SB's quilt takes every tile whose pixels can reach Q (tile k owns [k*S + HO - BAND - FE, (k+1)*S + HO + BAND + FE]): stacked SBs then
share the tiles and compute the same seam (same columns, same inputs, deterministic DP).
Crop kinds (coverage.py, 64 px cells): 'city' = SF land >= 0.5 %, 'terrain' = land outside SF only (Marin, Angel Island, south of the county
line 37.708), 'sea' = < 0.5 % land. AI tile (1024 px, stride 640): water + outside-SF < 95 % (tiles >= 95 % water = the render, as prep_b7).
  python3 sb.py            -> the SB table (order, crops by kind, render jobs, AI tiles owned in run order, z9 tiles) -> <ROOT>/plan/sbs.json
  python3 sb.py json       -> same, JSON only"""
import os, sys, json, math, numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); import citycfg as CC   # CITY (unset = SF): city_run/citycfg.py
ROOT = os.environ.get('CITY_ROOT', CC.BLOCK['city_root']); COV = f'{ROOT}/cov'
CW, CH, S, TS, M = 5120, 3072, 640, 1024, 1536; HO = (TS - S) // 2; BAND = HO - 56; FE = 6; CELL = 64
CITY_W, CITY_H = 32 * CW, 32 * CH
COLG = [(0, 4), (5, 9), (10, 14), (15, 19), (20, 25), (26, 31)]; ROWG = [(0, 7), (8, 15), (16, 23), (24, 31)]
# run order + what each SB holds (from the lat/lon of ~55 named places projected with the viewer DEM, combo/block52/rails_b8.l9)
SBS = [  # id, name, risk tags (areas.json), note
    ('C4R1', 'b8: FiDi / North Beach / Chinatown / SoMa / Embarcadero piers / Oracle Park', ['landmarks', 'rails', 'piers', 'towers'], 'DONE by the b8 run (reused, not re-run)'),
    ('C3R1', 'Russian Hill / Nob Hill / Lombard / Marina / Fort Mason / Pacific Heights / Tenderloin / Civic Center / Hayes / Alamo Sq', ['rails', 'slopes_mild', 'piers', 'landmarks'], 'demo'),
    ('C4R2', 'Mission Bay / Chase Center / Potrero Hill / Dogpatch / Pier 70 / Islais Creek / Bayview north', ['industrial', 'rails', 'slopes', 'piers'], 'demo: SoMa waterfront south'),
    ('C3R2', 'Mission / Mission Dolores / Castro / Noe / Bernal Heights / Glen Park', ['slopes', 'rails'], 'Mission'),
    ('C2R1', 'Haight / Panhandle / Presidio east / Crissy Field / Palace of Fine Arts / Cal Academy + de Young', ['parks', 'landmarks', 'rails'], 'Haight'),
    ('C2R2', 'Twin Peaks / Sutro Tower / Cole Valley / Inner Sunset / Forest Hill / Mt Davidson', ['slopes', 'parks', 'landmarks'], 'hills'),
    ('C1R1', 'Richmond / Presidio west / Golden Gate Bridge south / Baker Beach', ['parks', 'landmarks'], 'west side'),
    ('C1R2', 'Golden Gate Park middle / Sunset / Parkside', ['parks'], 'west side'),
    ('C0R1', 'Outer Richmond / Lands End / Legion of Honor / Cliff House / Sutro Baths', ['surf', 'parks', 'landmarks'], 'west side'),
    ('C0R2', 'Ocean Beach / GG Park west (windmills) / Outer Sunset', ['surf', 'parks'], 'west side'),
    ('C3R3', 'Excelsior / Outer Mission / McLaren Park / Crocker-Amazon', ['slopes', 'parks', 'south_edge'], 'south'),
    ('C2R3', 'Balboa Park / Ingleside / Oceanview / Stonestown east', ['south_edge', 'rails'], 'south'),
    ('C1R3', 'Lake Merced / SF State / Parkmerced / Olympic Club', ['parks', 'south_edge'], 'south'),
    ('C4R3', 'Visitacion Valley / Portola / Candlestick / Bayview south', ['industrial', 'south_edge', 'slopes'], 'south-east'),
    ('C5R2', 'Hunters Point north / India Basin / Pier 80-96', ['industrial', 'piers'], 'east'),
    ('C5R3', 'Hunters Point shipyard / Candlestick Point', ['industrial', 'piers', 'south_edge'], 'east'),
    ('C0R3', 'Fort Funston / Lake Merced west / Ocean Beach south', ['surf', 'south_edge'], 'west edge'),
    ('C5R1', 'Bay Bridge east span water / Yerba Buena approach', ['landmarks'], 'mostly water'),
    ('C5R0', 'Treasure Island / Yerba Buena Island', ['landmarks', 'piers'], 'island'),
    ('C3R0', 'Alcatraz / north bay water', ['landmarks'], 'island'),
    ('C2R0', 'Golden Gate strait / Marin headlands east', ['terrain'], 'mostly water + Marin'),
    ('C1R0', 'Golden Gate Bridge north / Marin headlands', ['landmarks', 'terrain'], 'Marin'),
    ('C0R0', 'Marin headlands west / Point Bonita', ['terrain'], 'Marin'),
    ('C4R0', 'north bay water off the piers / Angel Island edge', ['terrain'], 'water'),
]
if not CC.SF:   # another city: its own super-block list (city.json block.sbs: [id, name, tags, note]) or every column x row group, unnamed
    SBS = [tuple(x) for x in CC.BLOCK.get('sbs', [])] or [(f'C{c}R{r}', '', [], '') for r in range(len(ROWG)) for c in range(len(COLG))]
ORDER = [s[0] for s in SBS]

def sb_crops(sid):
    c, r = int(sid[1]), int(sid[3]); (c0, c1), (r0, r1) = COLG[c], ROWG[r]; return c0, c1, r0, r1
def sb_Q(sid):
    c0, c1, r0, r1 = sb_crops(sid); return [c0 * CW, r0 * CH, (c1 + 1) * CW, (r1 + 1) * CH]
def tile_range(Q):
    """stride-640 tiles whose pixels can land in Q after the quilt (see the docstring)"""
    k0 = max(0, math.floor((Q[0] - HO - BAND - FE) / S) - 1); k1 = min((CITY_W - TS) // S, math.ceil((Q[2] - HO + BAND + FE) / S))
    gx = [k for k in range(k0, k1 + 1) if k * S + HO - BAND - FE < Q[2] and (k + 1) * S + HO + BAND + FE > Q[0]]
    k0 = max(0, math.floor((Q[1] - HO - BAND - FE) / S) - 1); k1 = min((CITY_H - TS) // S, math.ceil((Q[3] - HO + BAND + FE) / S))
    gy = [k for k in range(k0, k1 + 1) if k * S + HO - BAND - FE < Q[3] and (k + 1) * S + HO + BAND + FE > Q[1]]
    # the city edge: the first / last tile row / column covers the edge (no neighbour); make sure Q is covered
    return [k * S for k in gx], [k * S for k in gy]

# ---- coverage (coverage.py output + the SF county mask) -------------------------------------------------------------------------
_C = {}
def cov():
    if _C: return _C
    W = np.load(f'{COV}/water64.npy').astype(np.float32); out = f'{COV}/outside64.npy'
    if not os.path.exists(out): np.save(out, outside_mask(W.shape).astype(np.float16))
    O = np.load(out).astype(np.float32) * (1 - W)   # land outside SF
    _C.update(W=W, O=O, iiW=np.pad(W, ((1, 0), (1, 0))).cumsum(0).cumsum(1), iiO=np.pad(O, ((1, 0), (1, 0))).cumsum(0).cumsum(1)); return _C
def frac(ii, x0, y0, x1, y1):   # mean over the L9 box (64 px cells)
    a, b, c, d = y0 // CELL, x0 // CELL, y1 // CELL, x1 // CELL; return float((ii[c, d] - ii[a, d] - ii[c, b] + ii[a, b]) / max(1, (c - a) * (d - b)))
def outside_mask(shape):
    """1 where the 64 px cell centre is outside San Francisco: south of the county line (lat < 37.7080) or Marin / Angel Island
    (lat > 37.815 and lon < -122.44, or lat > 37.845). Inverse of rails_b8.l9 (viewer DEM heights: 3 fixed-point steps).
    Another city (CITY): outside its limits (citycfg.outside), same inverse through its engine DEM."""
    if not CC.SF:
        Y9, X9 = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float64) * CELL + CELL / 2
        lon, lat = CC.lonlat_of_l9(X9, Y9); return CC.outside(lon, lat)
    sys.path.insert(0, '/Users/daniel/code/qipu-render-work/combo/block52'); import rails_b8 as R
    Y9, X9 = np.mgrid[0:shape[0], 0:shape[1]].astype(np.float64) * CELL + CELL / 2
    x = ((X9 / 2 - R.PCW / 4) / R.SZ + R.CX) / R.KX; t = R.CY - (Y9 / 2 - R.PCH / 4) / R.SZ; z = np.zeros_like(x)
    for _ in range(3):
        y = (t - z * R.ZT) / R.KY; c = np.clip(((x - R.M['x0']) / R.M['step']).astype(int), 0, R.M['nx'] - 1); r = np.clip(((y - R.M['y0']) / R.M['step']).astype(int), 0, R.M['ny'] - 1)
        z = np.maximum(R.Z[r, c], 0)
    y = (t - z * R.ZT) / R.KY; lon = x / R.KXM + R.LON0; lat = y / 111320 + R.LAT0
    return (lat < 37.7080) | ((lat > 37.815) & (lon < -122.44)) | (lat > 37.845)
def crop_kind(i, j):
    C = cov(); b = (i * CW, j * CH, (i + 1) * CW, (j + 1) * CH); w = frac(C['iiW'], *b); o = frac(C['iiO'], *b); city = 1 - w - o
    return ('city' if city >= 0.005 else 'terrain' if o >= 0.005 else 'sea'), round(city, 4), round(o, 4), round(w, 4)
def tile_kind(gx, gy):
    C = cov(); w = frac(C['iiW'], gx, gy, gx + TS, gy + TS); o = frac(C['iiO'], gx, gy, gx + TS, gy + TS)
    return 'render' if w > 0.95 else 'terrain' if w + o > 0.95 else 'ai'

def sb_info(sid, taken=None, terrain_ai=False):
    """crops / render jobs / AI tiles of one SB. taken = set of tile keys already owned by earlier SBs (the registry, run order)."""
    c0, c1, r0, r1 = sb_crops(sid); Q = sb_Q(sid); xs, ys = tile_range(Q)
    kinds = {f'{i}:{j}': crop_kind(i, j) for j in range(r0, r1 + 1) for i in range(c0, c1 + 1)}
    need = [k for k, v in kinds.items() if v[0] != 'sea']                     # crops with land: rendered
    # ring crops: the mosaic margin (M = 1536 px) around Q comes from the neighbours' FULL crops (rendered once, reused by the neighbour)
    ring = [f'{i}:{j}' for j in range(max(0, r0 - 1), min(31, r1 + 1) + 1) for i in range(max(0, c0 - 1), min(31, c1 + 1) + 1)
            if not (c0 <= i <= c1 and r0 <= j <= r1)]
    tiles = {f'{gx}_{gy}': tile_kind(gx, gy) for gy in ys for gx in xs}
    ai = [k for k, v in tiles.items() if v == 'ai' or (terrain_ai and v == 'terrain')]
    own = [k for k in ai if taken is None or k not in taken]
    sea_only = not need
    return dict(id=sid, Q=Q, crops=kinds, land_crops=len(need), city_crops=sum(v[0] == 'city' for v in kinds.values()),
                terrain_crops=sum(v[0] == 'terrain' for v in kinds.values()), sea_crops=sum(v[0] == 'sea' for v in kinds.values()),
                ring=ring, xs=xs, ys=ys, tiles_window=len(tiles), ai_window=len(ai), ai_own=own, render_tiles=sum(v == 'render' for v in tiles.values()),
                terrain_tiles=sum(v == 'terrain' for v in tiles.values()), z9=(c1 - c0 + 1) * (r1 - r0 + 1) * 60, sea_only=sea_only)

def plan(terrain_ai=False, b8_done=True):
    taken = set(); out = []
    for sid, name, tags, note in SBS:
        d = sb_info(sid, taken, terrain_ai); d.update(name=name, tags=tags, note=note); taken |= set(d['ai_own']); out.append(d)
    return out

if __name__ == '__main__':
    P = plan(terrain_ai=os.environ.get('TERRAIN_AI') == '1'); os.makedirs(f'{ROOT}/plan', exist_ok=True)
    json.dump([{k: v for k, v in d.items() if k not in ('crops',)} | dict(ai_own=len(d['ai_own'])) for d in P], open(f'{ROOT}/plan/sbs.json', 'w'), indent=0)
    json.dump({d['id']: d['crops'] for d in P}, open(f'{ROOT}/plan/crops.json', 'w'))
    if sys.argv[1:] != ['json']:
        print(f"{'#':>2} {'SB':5} {'crops city/terr/sea':>20} {'AI own':>7} {'AI win':>7} {'water t':>7} {'z9':>5}  name")
        for n, d in enumerate(P):
            print(f"{n:2d} {d['id']:5} {d['city_crops']:>8}/{d['terrain_crops']:>3}/{d['sea_crops']:>3}      {len(d['ai_own']):7d} {d['ai_window']:7d} {d['render_tiles']:7d} {d['z9']:5d}  {d['name'][:70]}")
        T = lambda k: sum(d[k] for d in P)
        print('TOTAL city crops', T('city_crops'), 'terrain crops', T('terrain_crops'), 'sea crops', T('sea_crops'), '| AI tiles (owned, each once)', sum(len(d['ai_own']) for d in P),
              '| without C4R1 (b8 done)', sum(len(d['ai_own']) for d in P[1:]), '| z9 tiles', T('z9'))
