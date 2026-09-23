"""Offline preparation for landmarks_hq (plain python3, not Blender):
the landmarks' outlines from OpenStreetMap (ODbL, (c) OpenStreetMap
contributors; cached Overpass answers in the work dir) in world metres, the
DataSF footprints the building generator would model under each of them
(their gids go to skip_gids.json for the orchestrator), written to
/Users/daniel/code/qipu-render-work/landmarks/footprints.json.
usage: python3 lm_prep.py
"""
import json, math, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import city_data
W = '/Users/daniel/code/qipu-render-work/landmarks'
X = lambda lon: (lon + 122.438) * 111320 * 0.790582709628753
Y = lambda lat: (lat - 37.76) * 111320

# key -> (osm type, id), what to take from the generator
OSM = {
    'transamerica': ('way', 24222973), 'salesforce': ('way', 431972186), 'transit_center': ('way', 542375290),
    'coit': ('way', 28824850), 'ferry': ('way', 558731934), 'cityhall': ('relation', 7261820),
    'pofa': ('way', 288371295), 'grace': ('way', 32946942), 'stmarys': ('relation', 7814696),
    'conservatory': ('way', 30675038), 'deyoung': ('relation', 1652482), 'legion': ('relation', 21115818),
    'oracle': ('relation', 7325085), 'chase': ('way', 579646390), 'fortpoint': ('relation', 5504536),
    'cliffhouse': ('way', 168942988), 'calacademy': ('way', 28695389), 'polofield': ('way', 476267889),
    'crissy': ('way', 32649967), 'lombard': ('way', 402111597),
}
# landmarks drawn on DataSF footprints named by gid (no usable OSM outline)
GIDS = {'pofa_colonnade': [159039, 159067, 159038, 159065]}
# landmarks whose DataSF footprints the generator must NOT build (the
# landmark model replaces them); the rest keep the generator's buildings
# DataSF footprints inside an OSM outline that the model does NOT replace
NOT_UNDER = {'stmarys': (149497,)}
# DataSF footprints a model replaces although their centre falls outside its
# OSM outline (Fort Point's centre is in its own parade ground)
EXTRA = {'fortpoint': (159137,)}
# ONLY landmarks landmarks_hq actually builds (else the building would vanish)
SKIP = {'calacademy', 'fortpoint', 'oracle', 'chase', 'deyoung', 'legion', 'grace', 'stmarys', 'conservatory', 'pofa_colonnade', 'pofa', 'salesforce', 'transit_center', 'transamerica', 'coit', 'ferry', 'cityhall'}

def load_osm():
    els = {}
    for f in ('lm_osm.json', 'lm_rel.json', 'gg_osm.json', 'bay_osm.json', 'fp_osm.json', 'misc_osm.json'):
        p = os.path.join(W, f)
        if not os.path.exists(p): continue
        for e in json.load(open(p)).get('elements', []): els[(e['type'], e['id'])] = e
    return els

def rings_of(e):
    if e['type'] == 'way':
        return [[(X(p['lon']), Y(p['lat'])) for p in e['geometry']]], []
    outer, inner = [], []
    for m in e.get('members', []):
        g = m.get('geometry')
        if not g: continue
        r = [(X(p['lon']), Y(p['lat'])) for p in g]
        (outer if m['role'] == 'outer' else inner).append(r)
    return outer, inner

def pip(x, y, r):
    ins = False
    for i in range(len(r)):
        (x1, y1), (x2, y2) = r[i], r[(i + 1) % len(r)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: ins = not ins
    return ins

# Alcatraz: OSM building outlines (alcatraz_osm.json); heights (m) and kinds
# from the National Park Service's descriptions; ruins stand roofless
ALCATRAZ_H = {24433389: (7, 'flat'), 24433395: (9, 'flat'), 24433437: (10, 'flat'), 24617219: (14, 'flat'), 27996721: (9, 'flat'),
              27996723: (8, 'gable'), 27996732: (6, 'ruin'), 27996743: (3, 'flat'), 27996759: (7, 'flat'), 27996775: (6, 'flat'),
              27996789: (10, 'ruin'), 27996792: (3, 'flat'), 28000041: (3, 'flat'), 99202294: (26, 'lighthouse'), 128245367: (12, 'flat'),
              128245373: (14.5, 'flat'), 232326055: (3, 'flat'), 232326056: (3, 'flat'), 396629347: (2, 'flat'), 660870452: (25, 'watertower'),
              769605624: (8, 'gable'), 1056707165: (30, 'chimney'), 1056707170: (3, 'ruin'), 1056707172: (3, 'ruin'), 1056707180: (10, 'tower'),
              1067744689: (3, 'flat'), 1473736510: (4, 'flat'), 1473736524: (6, 'ruin'), 985656043: (0, 'skip'), 27609572: (0, 'skip'), 27999864: (0, 'skip')}

def alcatraz():
    d = json.load(open(os.path.join(W, 'alcatraz_osm.json')))
    out = []
    for e in d['elements']:
        h, k = ALCATRAZ_H.get(e['id'], (6, 'flat'))
        if k == 'skip': continue
        out.append(dict(id=e['id'], name=e.get('tags', {}).get('name'), h=h, kind=k,
                        ring=[(round(X(p['lon']), 2), round(Y(p['lat']), 2)) for p in e['geometry']]))
    return dict(osm='overpass bbox 37.8235,-122.4290,37.8300,-122.4180', buildings=out,
                outer=[[(1050, 7200), (1560, 7200), (1560, 7650), (1050, 7650)]], inner=[], datasf=[])

def assemble(ways):
    """join a multipolygon's member ways into closed rings"""
    segs = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while changed and (abs(cur[0][0] - cur[-1][0]) > 1e-6 or abs(cur[0][1] - cur[-1][1]) > 1e-6):
            changed = False
            for i, sg in enumerate(segs):
                if sg[0] == cur[-1]: cur += sg[1:]
                elif sg[-1] == cur[-1]: cur += sg[::-1][1:]
                elif sg[-1] == cur[0]: cur = sg[:-1] + cur
                elif sg[0] == cur[0]: cur = sg[::-1][:-1] + cur
                else: continue
                segs.pop(i); changed = True; break
        rings.append(cur)
    return rings

# lakes, ponds, open reservoirs, the tidal creeks the sea mask misses
WATER_SKIP_NAMES = {'Vaillancourt Fountain', 'Mission Creek'}
def water():
    d = json.load(open(os.path.join(W, 'water_osm.json')))
    out = []
    for e in d['elements']:
        t = e.get('tags', {})
        if t.get('covered') == 'yes' or t.get('name') in WATER_SKIP_NAMES: continue
        # covered reservoirs OSM does not flag (Sunset, University Mound, Twin
        # Peaks): only Laguna Honda among the city's reservoirs is open water
        if t.get('water') in ('reservoir',) and t.get('name') != 'Laguna Honda': continue
        if t.get('water') in ('wastewater',) : kind = 'tank'
        elif t.get('water') in ('river', 'canal') or 'Creek' in (t.get('name') or ''): kind = 'tidal'
        elif t.get('water') in ('reservoir', 'basin'): kind = 'reservoir'
        else: kind = 'lake'
        if e['type'] == 'way':
            rings = [[(round(X(p['lon']), 2), round(Y(p['lat']), 2)) for p in e.get('geometry', [])]]
            holes = []
        else:
            outs = [[(round(X(p['lon']), 2), round(Y(p['lat']), 2)) for p in (m.get('geometry') or [])] for m in e.get('members', []) if m.get('role') == 'outer']
            ins = [[(round(X(p['lon']), 2), round(Y(p['lat']), 2)) for p in (m.get('geometry') or [])] for m in e.get('members', []) if m.get('role') == 'inner']
            rings, holes = assemble(outs), assemble(ins)
        for r in rings:
            if len(r) < 4: continue
            a = 0.5 * abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r))))
            if a < 150: continue
            out.append(dict(id=e['id'], name=t.get('name'), kind=kind, ring=r, holes=[h for h in holes if len(h) >= 4], area=round(a)))
    json.dump(dict(source='OpenStreetMap (ODbL, (c) OpenStreetMap contributors): natural=water within San Francisco', water=out),
              open(os.path.join(W, 'water.json'), 'w'))
    print('water bodies', len(out))

# piers and docks: OpenStreetMap man_made=pier (piers2_osm.json). Closed
# ways are decks (fixed piers) or floats; open ways are docks and fingers, a
# width across (OSM gives none: 2.4 m for a marina finger, 3.5 m otherwise)
def piers():
    p = os.path.join(W, 'piers2_osm.json')
    if not os.path.exists(p): return
    out = []
    for e in json.load(open(p))['elements']:
        g = e.get('geometry') or []
        if len(g) < 2: continue
        t = e.get('tags', {})
        if t.get('ruined') == 'yes' or t.get('disused') == 'yes' and t.get('floating') != 'yes': continue
        pts = [(round(X(q['lon']), 2), round(Y(q['lat']), 2)) for q in g]
        closed = len(g) > 3 and g[0] == g[-1]
        fl = t.get('floating') == 'yes'
        if closed:
            r = pts[:-1]
            a = 0.5 * abs(sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r))))
            if a < 12: continue
            out.append(dict(id=e['id'], name=t.get('name'), kind='float' if fl else 'deck', ring=r, area=round(a)))
        else:
            out.append(dict(id=e['id'], name=t.get('name'), kind='float_line' if fl else 'line', line=pts,
                            width=float(t.get('width', 0) or 0) or (2.4 if fl else 3.5)))
    json.dump(dict(source='OpenStreetMap (ODbL, (c) OpenStreetMap contributors): man_made=pier within San Francisco', piers=out),
              open(os.path.join(W, 'piers.json'), 'w'))
    print('piers', len(out))

def main():
    els = load_osm()
    out, skip = {}, {}
    allb = None
    for key, ref in OSM.items():
        e = els.get(ref)
        if e is None: print('missing', key, ref); continue
        outer, inner = rings_of(e)
        xs = [p[0] for r in outer for p in r]; ys = [p[1] for r in outer for p in r]
        bb = (min(xs), min(ys), max(xs), max(ys))
        recs = city_data.buildings(bb[0] - 5, bb[1] - 5, bb[2] + 5, bb[3] + 5)
        under = [b for b in recs if any(pip(b['cx'], b['cy'], r) for r in outer) and not any(pip(b['cx'], b['cy'], r) for r in inner)]
        out[key] = dict(osm=f'{ref[0]}/{ref[1]}', tags=e.get('tags', {}), outer=outer, inner=inner, bbox=bb,
                        datasf=[dict(gid=b['gid'], ring=b['ring'], h=b['h'], year=b['year']) for b in under])
        if key in SKIP: skip[key] = [b['gid'] for b in under if b['gid'] not in NOT_UNDER.get(key, ())] + list(EXTRA.get(key, ()))
        print(key, 'outer', [len(r) for r in outer], 'datasf', [(b['gid'], round(b['h'], 1)) for b in under][:8])
    allrecs = {b['gid']: b for b in city_data.buildings(-9000, -9000, 9000, 9000)}
    for key, gl in GIDS.items():
        recs = [allrecs[g] for g in gl if g in allrecs]
        out[key] = dict(osm=None, tags={}, outer=[b['ring'] for b in recs], inner=[],
                        datasf=[dict(gid=b['gid'], ring=b['ring'], h=b['h'], year=b['year']) for b in recs])
        if key in SKIP: skip[key] = [b['gid'] for b in recs]
        print(key, [(b['gid'], round(b['h'], 1)) for b in recs])
    out['alcatraz'] = alcatraz()
    water()
    piers()
    json.dump(out, open(os.path.join(W, 'footprints.json'), 'w'))
    import landmarks_hq
    skip = {k: v for k, v in skip.items() if k in landmarks_hq.ENABLED}
    built = {l.key: l.built for l in landmarks_hq._registry()}
    hero = city_data.hero_gids()
    gids = sorted({g for v in skip.values() for g in v} - hero)
    json.dump(dict(note='DataSF footprints (gid) replaced by a landmarks_hq model: the building generator should not '
                        'build them (hq_scene / hq_city: filter recs by this list as by city_data.hero_gids()). '
                        'In an era render, skip the gids of a landmark only from the year it opened: '
                        'skip gid when ERA is None or ERA >= built[landmark] (before that the landmark is not '
                        'built and the old buildings on its site stand). gids = all of them, for the present day. '
                        'Written by lm_prep.py.', by_landmark=skip, built={k: built.get(k) for k in skip}, gids=gids),
              open(os.path.join(W, 'skip_gids.json'), 'w'), indent=1)
    print('skip gids', len(gids))

if __name__ == '__main__':
    main()
