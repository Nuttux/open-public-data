"""samples.json (photo-measured, exposure-corrected) + CONVENTION entries (Vancouver facts where the open photos are thin:
roofs from the air, tower glass, industrial) -> palettes.json {type: {walls, trim, roof, glass, [base, roof_flat]}: [[r,g,b,w]]}
in display sRGB 0-1 (true appearance; van_colour.py converts to the render's paint per material), + sources.json."""
import json
DROP = {8, 11, 27, 34, 36, 44, 54, 74}      # boxes that caught sky / a window / a wall in deep shade (review.jpg)
S = [s for i, s in enumerate(json.load(open('samples.json'))) if i not in DROP]
HOUSE_ROOF = [[0.32, 0.32, 0.33, 5], [0.24, 0.24, 0.25, 3], [0.28, 0.30, 0.25, 2], [0.38, 0.35, 0.31, 2], [0.34, 0.28, 0.23, 1],
              [0.47, 0.47, 0.46, 1], [0.19, 0.19, 0.20, 1]]          # asphalt shingle greys, moss-dark, weathered, brown, light, black
FLAT = [[0.56, 0.56, 0.55, 4], [0.82, 0.82, 0.80, 2], [0.46, 0.44, 0.41, 3], [0.31, 0.31, 0.31, 2]]   # grey membrane, white, gravel, tar
GREEN = [0.36, 0.43, 0.27]
TOWER_GLASS = [[0.36, 0.50, 0.52, 4], [0.25, 0.38, 0.42, 3], [0.55, 0.62, 0.66, 2], [0.30, 0.42, 0.58, 2], [0.44, 0.56, 0.54, 2]]
HOUSE_GLASS = [[0.16, 0.18, 0.19, 3], [0.22, 0.24, 0.25, 2]]
WHITE_TRIM = [[0.93, 0.92, 0.88, 4], [0.88, 0.85, 0.77, 2], [0.20, 0.20, 0.21, 1]]
C = {   # convention entries (CONV), weights relative to one photo sample = 1
 'character_house': dict(walls=[[0.20, 0.30, 0.25, 2], [0.24, 0.32, 0.42, 2], [0.50, 0.20, 0.17, 1], [0.86, 0.82, 0.70, 1.5], [0.55, 0.58, 0.50, 1], [0.38, 0.30, 0.24, 1]],
                         trim=WHITE_TRIM + [[0.82, 0.76, 0.60, 1]], roof=HOUSE_ROOF, glass=HOUSE_GLASS),
 'vancouver_special': dict(walls=[[0.93, 0.91, 0.85, 3], [0.88, 0.85, 0.76, 2]], base=[[0.45, 0.25, 0.18, 2], [0.55, 0.47, 0.40, 1], [0.38, 0.32, 0.27, 1]],
                           trim=[[0.93, 0.92, 0.88, 3], [0.30, 0.28, 0.26, 1]], roof=HOUSE_ROOF + [[0.40, 0.33, 0.27, 2]], glass=HOUSE_GLASS),
 'postwar_bungalow': dict(walls=[[0.92, 0.90, 0.84, 2], [0.85, 0.80, 0.68, 1.5], [0.76, 0.80, 0.78, 1], [0.70, 0.62, 0.52, 1]],
                          trim=WHITE_TRIM, roof=HOUSE_ROOF, glass=HOUSE_GLASS),
 'modern_infill': dict(walls=[[0.30, 0.31, 0.32, 1.5], [0.86, 0.86, 0.84, 1.5], [0.55, 0.38, 0.25, 1.5], [0.60, 0.61, 0.60, 1]],
                       trim=[[0.18, 0.18, 0.19, 2], [0.90, 0.90, 0.88, 1]], roof=HOUSE_ROOF + [[0.36, 0.38, 0.40, 2]], glass=HOUSE_GLASS),
 'laneway_house': dict(walls=[[0.30, 0.31, 0.32, 1.5], [0.55, 0.38, 0.25, 1.5], [0.86, 0.86, 0.84, 1], [0.24, 0.32, 0.40, 1], [0.60, 0.62, 0.60, 1]],
                       trim=[[0.18, 0.18, 0.19, 2], [0.92, 0.91, 0.88, 2]], roof=HOUSE_ROOF + [[0.36, 0.38, 0.40, 2]], glass=HOUSE_GLASS),
 'west_end_walkup': dict(walls=[[0.88, 0.85, 0.77, 1], [0.70, 0.64, 0.55, 1], [0.55, 0.36, 0.28, 1]], trim=WHITE_TRIM, roof_flat=FLAT, glass=HOUSE_GLASS),
 'concrete_tower': dict(walls=[[0.70, 0.68, 0.64, 2], [0.80, 0.78, 0.74, 1.5], [0.60, 0.58, 0.55, 1]], trim=[[0.85, 0.84, 0.80, 1]],
                        roof_flat=FLAT, glass=[[0.24, 0.26, 0.27, 2], [0.33, 0.31, 0.27, 1.5], [0.30, 0.38, 0.40, 1]]),
 'point_tower': dict(walls=[[0.90, 0.90, 0.88, 2], [0.72, 0.72, 0.70, 1.5], [0.82, 0.83, 0.84, 1]], trim=[[0.88, 0.89, 0.89, 2], [0.30, 0.31, 0.32, 1]],
                     roof_flat=FLAT + [GREEN + [1.5]], glass=TOWER_GLASS),
 'podium': dict(walls=[[0.78, 0.74, 0.66, 1.5], [0.55, 0.30, 0.22, 1], [0.88, 0.87, 0.84, 1.5], [0.60, 0.60, 0.58, 1]], trim=[[0.25, 0.25, 0.26, 1], [0.90, 0.90, 0.88, 1]],
                roof_flat=FLAT + [GREEN + [3]], glass=TOWER_GLASS),
 'stucco_lowrise': dict(walls=[[0.93, 0.92, 0.88, 2], [0.88, 0.84, 0.74, 2], [0.80, 0.80, 0.78, 1.5], [0.78, 0.84, 0.86, 0.7], [0.88, 0.80, 0.72, 0.7]],
                        trim=[[0.93, 0.92, 0.88, 2], [0.42, 0.30, 0.22, 1], [0.30, 0.31, 0.32, 1]], roof_flat=FLAT, glass=HOUSE_GLASS),
 'heritage_brick': dict(walls=[[0.52, 0.27, 0.20, 2], [0.45, 0.28, 0.22, 1.5], [0.62, 0.42, 0.30, 1]], trim=[[0.82, 0.78, 0.68, 2], [0.22, 0.28, 0.24, 1], [0.20, 0.20, 0.20, 1]],
                        roof_flat=FLAT, glass=HOUSE_GLASS),
 'chinatown_society': dict(walls=[[0.55, 0.26, 0.20, 2], [0.80, 0.74, 0.62, 1]], trim=[[0.62, 0.16, 0.12, 2], [0.20, 0.42, 0.32, 1.5], [0.85, 0.66, 0.25, 1]],
                           roof_flat=FLAT, glass=HOUSE_GLASS),
 'townhouse': dict(walls=[[0.55, 0.38, 0.25, 1.5], [0.60, 0.62, 0.62, 1], [0.86, 0.85, 0.82, 1], [0.32, 0.33, 0.34, 1]], trim=[[0.18, 0.18, 0.19, 2], [0.90, 0.90, 0.88, 1]],
                   roof=HOUSE_ROOF, roof_flat=FLAT, glass=HOUSE_GLASS),
 'institutional': dict(walls=[[0.80, 0.77, 0.70, 1.5], [0.55, 0.36, 0.28, 1.5], [0.66, 0.66, 0.64, 1]], trim=[[0.85, 0.83, 0.78, 1], [0.25, 0.26, 0.27, 1]],
                       roof=HOUSE_ROOF, roof_flat=FLAT, glass=[[0.25, 0.30, 0.33, 2]]),
 'industrial_shed': dict(walls=[[0.80, 0.80, 0.78, 2], [0.62, 0.63, 0.64, 2], [0.78, 0.74, 0.64, 1.5], [0.42, 0.50, 0.56, 1], [0.55, 0.30, 0.22, 0.7]],
                         trim=[[0.35, 0.36, 0.37, 2], [0.85, 0.85, 0.83, 1]],
                         roof_flat=[[0.64, 0.65, 0.66, 3], [0.80, 0.80, 0.79, 2], [0.52, 0.52, 0.51, 3], [0.40, 0.39, 0.37, 1]], glass=[[0.25, 0.27, 0.28, 1]]),
 'granville_island_shed': dict(walls=[[0.62, 0.64, 0.66, 2], [0.30, 0.55, 0.72, 1], [0.70, 0.22, 0.18, 1], [0.85, 0.72, 0.30, 1]], trim=[[0.70, 0.22, 0.18, 1.5], [0.25, 0.45, 0.60, 1], [0.90, 0.90, 0.88, 1]],
                               roof_flat=[[0.64, 0.65, 0.66, 3], [0.55, 0.56, 0.57, 2], [0.42, 0.62, 0.70, 0.7]], roof=[[0.62, 0.63, 0.64, 2], [0.34, 0.34, 0.35, 1]], glass=[[0.25, 0.27, 0.28, 1]]),
}
FLAT_T = {'west_end_walkup', 'concrete_tower', 'point_tower', 'podium', 'stucco_lowrise', 'heritage_brick', 'chinatown_society', 'industrial_shed'}
P = {}
for ty, roles in C.items():
    P[ty] = {r: [[round(v, 3) for v in e[:3]] + [e[3]] for e in L] for r, L in roles.items()}
    P[ty]['_n_photo'] = 0
for s in S:
    r = s['role']
    if r == 'roof' and s['type'] in FLAT_T: r = 'roof_flat'
    P[s['type']].setdefault(r, []).append(s['rgb'] + [1.0]); P[s['type']]['_n_photo'] += 1
P['_meta'] = dict(units='display sRGB 0-1, true appearance (photo-measured: exposure + white-balance corrected, sample.py); weight per entry',
                  roles='walls, trim, roof (pitched), roof_flat, glass, base (Vancouver Special brick/stone ground floor)',
                  conv='entries with weight != 1.0 are CONVENTION (Vancouver facts: asphalt-shingle greys + moss for house roofs, grey/white membrane '
                       '+ green roofs downtown, green-blue/clear tower glass); weight 1.0 = one photo sample (sources.json)')
json.dump(P, open('palettes.json', 'w'), indent=1)
pool = json.load(open('sources_pool.json')); raw = json.load(open('sources_raw.json'))
byfile = {e['file']: dict(title=t, **e) for t, e in pool.items()}
byfile.update({e['file']: dict(title=t, **e) for ty in raw.values() for t, e in ty.items()})
src = {}
for s in S:
    e = byfile[f"photos/{s['photo']}.jpg"]
    d = src.setdefault(s['photo'], dict(url=e['page'], title=e['title'], licence=e['licence'], author=e['author'], date=e.get('date', ''), used=[]))
    d['used'].append(dict(type=s['type'], role=s['role'], box=s['box'], rgb=s['rgb'], exposure=s['exposure']))
json.dump(src, open('sources.json', 'w'), indent=1)
import collections
print(len(S), 'samples from', len(src), 'photos;', collections.Counter(v['licence'] for v in src.values()))
print({t: P[t]['_n_photo'] for t in C})
