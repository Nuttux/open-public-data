"""San Francisco's rail, above ground, for the path-traced city (transit_hq.py).

python3 transit_prep.py <rail_osm.json> <transit.json>

<rail_osm.json> is an Overpass extract (osm_fetch.py; the query is QUERY
below): every railway way, platform and turntable in the city's box, with its
geometry, and the route relations (tram, light_rail, train, subway).
OpenStreetMap, ODbL, (c) OpenStreetMap contributors.

WHY NOT THE ENGINE'S OWN 'rail' LAYER. scene.json does carry one (bed, ties,
rails; layers/rail.ts), but it is DataSF's Muni ROUTE file (9exe-acju): one
line per route, not per track, drawn with a 4 m "gauge" so a pair reads at the
engine's camera. It has no Caltrain, no yards, no BART, no platforms and no
turntables. OSM maps every track: both tracks of a double line, crossovers,
the yard ladders at 4th & King, Muni Metro East and Green Division, the three
cable-car turntables.

What is kept: what can be seen from the air. A way in a tunnel, below ground
(layer or level < 0, location=underground) is dropped. A building passage is
kept but marked covered (no vehicle, no wire). Abandoned track is dropped
(its rails are gone); disused and industrial track is kept, marked, for the
rust-and-weeds look of the Port's old belt lines.

Output (engine metres, x = (lon + 122.438) * 111320 * cos(37.76 deg),
y = (lat - 37.76) * 111320):
  tracks:     [{id, cls, gauge, service, yard, bridge, covered, elec, fwd,
                routes, layer, pts: [[x, y], ...]}]
     cls: cable (Muni cable car, 1067 mm, slot between the rails)
          tram  (F Market & Wharves, E Embarcadero; street track)
          lrv   (Muni Metro J K L M N T S; street track or private way)
          rail  (Caltrain, and the Port / Quint St industrial leads)
          bart  (BART where it runs in the open)
          disused
  platforms:  [{id, net, h, ring: [[x, y], ...]} or line: [[x, y], ...]]
  turntables: [{id, cx, cy, r}]
"""
import json, math, sys

KX = 111320 * 0.790582709628753; KY = 111320.0
def xy(lon, lat): return [round((lon + 122.438) * KX, 2), round((lat - 37.76) * KY, 2)]

QUERY = """[out:json][timeout:170];
(
  way["railway"~"^(tram|light_rail|rail|subway|narrow_gauge|funicular|disused|abandoned|construction|turntable|platform|traverser|preserved|miniature)$"](37.70,-122.53,37.84,-122.35);
  way["public_transport"="platform"]["railway"](37.70,-122.53,37.84,-122.35);
  way["landuse"="railway"](37.70,-122.53,37.84,-122.35);
  node["railway"~"^(turntable|buffer_stop|tram_stop|stop|station|halt|switch)$"](37.70,-122.53,37.84,-122.35);
);
out body geom;
relation["route"~"^(tram|light_rail|train|subway)$"](37.70,-122.53,37.84,-122.35);
out body;"""

def _num(s, default=0):
    try: return int(str(s).split(';')[0])
    except ValueError: return default

def underground(t):
    if t.get('tunnel') in ('yes', 'culvert', 'covered') or t.get('location') == 'underground': return True
    if _num(t.get('layer', 0)) < 0 or _num(t.get('level', 0)) < 0: return True
    return False

def height_m(s, default):
    """OSM height: '0.9', '2\\'10"', '3 ft'"""
    if not s: return default
    s = s.strip()
    try:
        if "'" in s:
            ft, rest = s.split("'", 1); inch = rest.replace('"', '').strip() or '0'
            return float(ft) * 0.3048 + float(inch) * 0.0254
        if s.endswith('ft'): return float(s[:-2]) * 0.3048
        return float(s.replace('m', ''))
    except ValueError:
        return default

def main(src, out):
    d = json.load(open(src))
    els = d['elements']
    routes = {}
    for e in els:
        if e['type'] != 'relation': continue
        ref = e['tags'].get('ref') or e['tags'].get('name', '')[:12]
        net = e['tags'].get('network', '')
        for m in e['members']:
            if m['type'] == 'way': routes.setdefault(m['ref'], set()).add(f'{net}:{ref}')
    tracks, platforms, turntables = [], [], []
    for e in els:
        if e['type'] != 'way' or 'geometry' not in e: continue
        t = e.get('tags', {}); rw = t.get('railway')
        pts = [xy(g['lon'], g['lat']) for g in e['geometry']]
        if rw == 'turntable':
            cx = sum(p[0] for p in pts[:-1]) / max(1, len(pts) - 1); cy = sum(p[1] for p in pts[:-1]) / max(1, len(pts) - 1)
            r = sum(math.hypot(p[0] - cx, p[1] - cy) for p in pts[:-1]) / max(1, len(pts) - 1)
            turntables.append(dict(id=e['id'], cx=round(cx, 2), cy=round(cy, 2), r=round(r, 2)))
            continue
        if rw == 'platform' or t.get('public_transport') == 'platform':
            if underground(t) or t.get('indoor') == 'yes' or t.get('covered') == 'yes' and t.get('subway') == 'yes': continue
            if t.get('subway') == 'yes': continue
            net = 'caltrain' if t.get('network') == 'Caltrain' or t.get('train') == 'yes' else 'bart' if t.get('network') == 'BART' else 'muni'
            h = height_m(t.get('height'), {'caltrain': 0.25, 'bart': 1.0, 'muni': 0.18}[net])
            rec = dict(id=e['id'], net=net, h=round(min(h, 1.2), 2), name=t.get('name', ''))
            if len(pts) >= 4 and pts[0] == pts[-1]: rec['ring'] = pts[:-1]
            else: rec['line'] = pts
            platforms.append(rec)
            continue
        if rw in ('abandoned', 'miniature', 'funicular', 'construction', 'traverser', 'platform', None): continue
        if underground(t): continue
        gauge = _num(t.get('gauge', 1435), 1435) / 1000.0
        if rw == 'tram': cls = 'cable' if abs(gauge - 1.067) < 0.01 or t.get('cable_tram') else 'tram'
        elif rw == 'light_rail': cls = 'lrv'
        elif rw == 'subway': cls = 'bart'
        elif rw == 'rail': cls = 'rail'
        elif rw in ('disused', 'preserved', 'narrow_gauge'): cls = 'disused'
        else: continue
        svc = t.get('service', '')
        usage = t.get('usage', '')
        elec = t.get('electrified', 'no') in ('contact_line', 'yes') and cls in ('tram', 'lrv', 'rail')
        tracks.append(dict(
            id=e['id'], cls=cls, gauge=gauge, service=svc, usage=usage,
            yard=svc == 'yard', bridge=bool(t.get('bridge')) and t.get('bridge') != 'no',
            covered=t.get('tunnel') == 'building_passage' or t.get('covered') == 'yes',
            cutting=t.get('cutting') == 'yes', embedded=t.get('embedded') == 'yes',
            elec=elec, fwd=t.get('railway:preferred_direction', ''), layer=_num(t.get('layer', 0)),
            routes=sorted(routes.get(e['id'], ())), pts=pts))
    json.dump(dict(source='OpenStreetMap (ODbL), (c) OpenStreetMap contributors; Overpass extract',
                   tracks=tracks, platforms=platforms, turntables=turntables), open(out, 'w'), separators=(',', ':'))
    by = {}
    for tr in tracks:
        L = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(tr['pts'], tr['pts'][1:]))
        k = (tr['cls'], 'yard' if tr['yard'] else tr['service'] or '-', 'bridge' if tr['bridge'] else '')
        by[k] = by.get(k, 0) + L
    for k, v in sorted(by.items(), key=lambda x: -x[1]): print(f'{v:9.0f} m', k)
    print(len(tracks), 'tracks', len(platforms), 'platforms', len(turntables), 'turntables')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
