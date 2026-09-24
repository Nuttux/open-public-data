"""The city's moving life, as data for life_hq.py: the ferries' routes, the
marinas, the roads' travel lanes and the buses on them, and where the water is.

python3 life_prep.py [work_dir]          (default /Users/daniel/code/qipu-render-work/life)

Reads (osm_fetch.py; the queries are QUERIES below):
  water_osm.json  route=ferry ways, ferry terminals, leisure=marina, seamarks
  roads_osm.json  every drivable highway way in the city's box, with its tags
  bus_osm.json    the bus and trolleybus route relations (members only)
and the render's sea mask (<city>/sea.png, sea.json: R > 0.5 = water, G x 127.5
= metres to the shore). OpenStreetMap, ODbL, (c) OpenStreetMap contributors.

Writes life.json (engine metres, x = (lon + 122.438) * 111320 * cos(37.76 deg),
y = (lat - 37.76) * 111320):
  ferries:  [{id, name, op, pts}]           route=ferry ways
  marinas:  [{id, name, ring}]
  roads:    [{id, hw, nf, nb, br, ly, pts, ix, bus, muni, name}]
            nf / nb: travel lanes with / against the way's direction (a
            one-way is nf only; oneway=-1 is reversed here); ix: the arc
            positions (m) of the way's intersections with other drivable
            ways; bus: bus routes on the way (Muni counts 1, others 0.5)
and sea_4m.npy (uint8: metres to the shore, 0 = land, 255 = far; 4 m cells,
origin and size in life.json['sea']).
"""
import json, math, os, sys
import numpy as np

W = sys.argv[1] if len(sys.argv) > 1 else '/Users/daniel/code/qipu-render-work/life'
CITY = '/Users/daniel/code/qipu-render-work/city'
KX = 111320 * 0.790582709628753; KY = 111320.0
def xy(lon, lat): return [round((lon + 122.438) * KX, 1), round((lat - 37.76) * KY, 1)]

QUERIES = {
    'water_osm.json': '''[out:json][timeout:180];(
 way["route"="ferry"](37.60,-122.62,38.15,-122.20); relation["route"="ferry"](37.60,-122.62,38.15,-122.20);
 nwr["amenity"="ferry_terminal"](37.68,-122.56,37.90,-122.30); nwr["leisure"="marina"](37.68,-122.56,37.90,-122.30);
 way["man_made"="pier"](37.68,-122.56,37.90,-122.30); nwr["seamark:type"](37.68,-122.56,37.90,-122.30);
 nwr["leisure"="slipway"](37.68,-122.56,37.90,-122.30); nwr["mooring"](37.68,-122.56,37.90,-122.30););
out geom tags;''',
    'roads_osm.json': '''[out:json][timeout:300];
way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|busway)$"](37.700,-122.530,37.860,-122.340);
out geom tags;''',
    'marina_rel.json': '''[out:json][timeout:60];
(relation["leisure"="marina"](37.68,-122.56,37.90,-122.30););
out geom;''',
    'people_osm.json': '''[out:json][timeout:120];(
 way["leisure"="park"]["name"="Mission Dolores Park"](37.75,-122.44,37.77,-122.42);
 nwr["natural"="beach"](37.70,-122.53,37.82,-122.35);
 way["highway"~"^(footway|pedestrian|path|cycleway)$"](37.787,-122.405,37.810,-122.385);
 way["highway"~"^(footway|pedestrian|path|cycleway)$"](37.800,-122.470,37.808,-122.440););
out geom tags;''',
    'people_rel.json': '''[out:json][timeout:60];(relation(2165532););out geom;''',
    'bus_osm.json': '''[out:json][timeout:180];
relation["route"~"^(bus|trolleybus)$"](37.700,-122.530,37.860,-122.340);
out body;''',
}

# lanes per direction when OSM does not say (a two-way street), and for a one-way
DEF2 = {'motorway': 3, 'trunk': 2, 'primary': 2, 'secondary': 1, 'tertiary': 1, 'residential': 1, 'unclassified': 1,
        'living_street': 1, 'busway': 1}
DEF1 = {'motorway': 3, 'trunk': 2, 'primary': 2, 'secondary': 2, 'tertiary': 2, 'residential': 1, 'unclassified': 1,
        'living_street': 1, 'busway': 1}


def _int(v):
    try: return int(str(v).split(';')[0])
    except Exception: return None


def roads():
    E = json.load(open(os.path.join(W, 'roads_osm.json')))['elements']
    B = json.load(open(os.path.join(W, 'bus_osm.json')))['elements']
    bus, muni = {}, {}
    for r in B:
        t = r.get('tags', {}); m_ = 'Muni' in (t.get('network', '') + t.get('operator', '')) or 'SFMTA' in t.get('operator', '')
        if 'Owl' in t.get('ref', '') or t.get('network') == 'Flixbus': continue
        for mb in r.get('members', []):
            if mb['type'] == 'way' and mb.get('role', '') in ('', 'forward', 'backward'):
                bus[mb['ref']] = bus.get(mb['ref'], 0) + (1.0 if m_ else 0.5)
                if m_: muni[mb['ref']] = 1
    out = []; cnt = {}
    for e in E:
        t = e['tags']; hw = t['highway']
        if t.get('tunnel') in ('yes', 'building_passage') or t.get('covered') == 'yes': continue
        if t.get('area') == 'yes' or t.get('access') in ('no', 'private') and hw not in ('busway',): continue
        if int(_int(t.get('layer')) or 0) < 0: continue
        pts = [xy(g['lon'], g['lat']) for g in e['geometry']]
        base = hw.replace('_link', '')
        link = hw.endswith('_link')
        ow = t.get('oneway', 'yes' if (base == 'motorway' or link and base in ('motorway', 'trunk')) or t.get('junction') == 'roundabout' else 'no')
        if ow == '-1': pts = pts[::-1]; ow = 'yes'
        n = _int(t.get('lanes')); nf = _int(t.get('lanes:forward')); nb = _int(t.get('lanes:backward'))
        if ow == 'yes':
            nf = n or (1 if link else DEF1.get(base, 1)); nb = 0
        else:
            if nf is None or nb is None:
                if n and n >= 2: nf = nb = n // 2
                else: nf = nb = DEF2.get(base, 1) if not n else 1
                if n == 1: nf = nb = 0      # one shared lane: drawn at the centre, either way
        out.append(dict(id=e['id'], hw=hw, nf=int(nf), nb=int(nb), one=(n == 1 and ow != 'yes'), br=t.get('bridge', 'no') != 'no',
                        ly=int(_int(t.get('layer')) or 0), pts=pts, bus=bus.get(e['id'], 0), muni=muni.get(e['id'], 0),
                        name=t.get('name', ''), ref=t.get('ref', '')))
        for p in pts: k = (p[0], p[1]); cnt[k] = cnt.get(k, 0) + 1
    # intersections: a vertex shared by two ways or more (the ways' ends meet
    # there, or a street crosses mid-way)
    for r in out:
        P = np.asarray(r['pts']); s = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(P, axis=0).T))])
        r['ix'] = [round(float(s[i]), 1) for i, p in enumerate(r['pts']) if cnt.get((p[0], p[1]), 0) >= 2]
    return out


def _rings(ways):
    """join open member ways end to end into closed rings"""
    ways = [list(w) for w in ways if len(w) >= 2]; out = []
    while ways:
        r = ways.pop(0)
        while r[0] != r[-1]:
            for k, w in enumerate(ways):
                if w[0] == r[-1]: r += w[1:]; ways.pop(k); break
                if w[-1] == r[-1]: r += w[::-1][1:]; ways.pop(k); break
            else: break
        if len(r) >= 4: out.append(r)
    return out


def water():
    E = json.load(open(os.path.join(W, 'water_osm.json')))['elements']
    rel = os.path.join(W, 'marina_rel.json')
    if os.path.exists(rel):
        E = [e for e in E if not (e['type'] == 'relation' and e.get('tags', {}).get('leisure') == 'marina')] + json.load(open(rel))['elements']
    fer, mar, term = [], [], []
    for e in E:
        t = e.get('tags', {})
        if t.get('route') == 'ferry' and e['type'] == 'way':
            fer.append(dict(id=e['id'], name=t.get('name', ''), op=t.get('operator', ''), pts=[xy(g['lon'], g['lat']) for g in e['geometry']]))
        elif t.get('leisure') == 'marina':
            if e['type'] == 'way':
                mar.append(dict(id=e['id'], name=t.get('name', ''), ring=[xy(g['lon'], g['lat']) for g in e['geometry']]))
            elif e['type'] == 'relation':
                outer = [[xy(g['lon'], g['lat']) for g in m['geometry']] for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
                for r in _rings(outer): mar.append(dict(id=e['id'], name=t.get('name', ''), ring=r))
        elif t.get('amenity') == 'ferry_terminal':
            if e['type'] == 'node': term.append(dict(id=e['id'], name=t.get('name', ''), p=xy(e['lon'], e['lat'])))
    return fer, mar, term


def people():
    """where people are at 5 pm: Mission Dolores Park's lawn, the beaches (Ocean
    Beach, Crissy Field's East Beach), the promenades (the Embarcadero's Herb
    Caen Way, Crissy Field's Golden Gate Promenade)"""
    out = dict(parks=[], beaches=[], walks=[])
    p = os.path.join(W, 'people_osm.json')
    if not os.path.exists(p): return out
    for e in json.load(open(p))['elements']:
        t = e.get('tags', {}); g = e.get('geometry')
        if e['type'] != 'way' or not g: continue
        pts = [xy(q['lon'], q['lat']) for q in g]
        if t.get('leisure') == 'park': out['parks'].append(dict(name=t.get('name', ''), ring=pts))
        elif t.get('natural') == 'beach' and t.get('name') in ('East Beach',): out['beaches'].append(dict(name=t['name'], ring=pts))
        elif t.get('name', '').startswith(('Herb Caen Way', 'Golden Gate Promenade')): out['walks'].append(dict(name=t['name'], pts=pts))
    r = os.path.join(W, 'people_rel.json')
    if os.path.exists(r):
        for e in json.load(open(r))['elements']:
            outer = [[xy(q['lon'], q['lat']) for q in m['geometry']] for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
            for ring in _rings(outer): out['beaches'].append(dict(name=e['tags'].get('name', ''), ring=ring))
    return out


def sea():
    from PIL import Image
    from scipy import ndimage
    Image.MAX_IMAGE_PIXELS = None
    g = json.load(open(os.path.join(CITY, 'sea.json')))
    im = np.asarray(Image.open(os.path.join(CITY, 'sea.png')).convert('RGB'))[:, :, 0]
    # hq_scene.sea() cuts the sea where R <= 0.5 (land); the texture's v runs up, so row 0 = south (oy)
    land = im[::-1] <= 127
    f = 2; land4 = land[: land.shape[0] // f * f, : land.shape[1] // f * f].reshape(land.shape[0] // f, f, land.shape[1] // f, f).any(axis=(1, 3))   # a cell with any land is land
    res = g['w'] / land.shape[1] * f
    dist = ndimage.distance_transform_edt(~land4) * res
    np.save(os.path.join(W, 'sea_4m.npy'), np.clip(dist, 0, 255).astype(np.uint8))
    return dict(ox=g['ox'], oy=g['oy'], res=res, nx=land4.shape[1], ny=land4.shape[0])


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[2] == 'fetch':
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import osm_fetch
        for fn, q in QUERIES.items(): osm_fetch.fetch(q, os.path.join(W, fn))
    R = roads(); F, M, T = water(); S = sea(); PP = people()
    json.dump(dict(source='OpenStreetMap (ODbL, (c) OpenStreetMap contributors); the render sea mask', sea=S,
                   ferries=F, marinas=M, terminals=T, roads=R, people=PP), open(os.path.join(W, 'life.json'), 'w'), separators=(',', ':'))
    print('roads', len(R), 'ferries', len(F), 'marinas', len(M), 'terminals', len(T), 'sea', S)
