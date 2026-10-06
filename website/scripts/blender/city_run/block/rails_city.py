"""rails_city.py (VT2 06/10): another city's heavy-rail track length (m) per 1024-px AI tile at L9 -- rails_b8's count (2 m
samples) on the city's own OSM rails (city.json block.rails = the rail_osm.json path: railway=rail, any service, not in a
tunnel, a building passage or covered, not on a bridge) through citycfg's projection. SF keeps rails_b8.py (citycfg rails True).
rail_len(tiles) -> {"gx,gy": metres}.   CITY=vancouver python3 rails_city.py  (counts on the vt1 windows)"""
import json, math, os, sys
import numpy as np
H = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(H)); import citycfg as CC


def samples():
    d = json.load(open(CC.city_path(CC.BLOCK['rails'])))['elements']; X, Y = [], []
    for e in d:
        t = e.get('tags', {}); g = e.get('geometry')
        if e['type'] != 'way' or not g or t.get('railway') != 'rail': continue
        if t.get('tunnel') not in (None, 'no') or t.get('bridge') not in (None, 'no') or t.get('covered') not in (None, 'no'): continue
        x, y = CC.world_of_lonlat(np.array([q['lon'] for q in g]), np.array([q['lat'] for q in g]))
        for a, b, c, dd in zip(x[:-1], y[:-1], x[1:], y[1:]):
            k = max(1, int(math.hypot(c - a, dd - b) / 2)); s = np.linspace(0, 1, k, endpoint=False)
            X.append(a + (c - a) * s); Y.append(b + (dd - b) * s)
    X, Y = np.concatenate(X), np.concatenate(Y)
    return CC.l9_of_world(X, Y, CC.dem()(X, Y))


def rail_len(tiles):
    gx, gy = samples(); out = {}
    for t in tiles:
        x, y = map(int, t.split(',')); out[t] = 2.0 * int(((gx >= x) & (gx < x + 1024) & (gy >= y) & (gy < y + 1024)).sum())
    return out


if __name__ == '__main__':
    for nm, (cs, rs) in {'vt1d 18-20x11-12': ((18, 19, 20), (11, 12)), 'vt1e 23x19': ((23,), (19,)), 'vt1a 12x14': ((12,), (14,))}.items():
        T = [f'{c * 5120 + i * 640},{r * 3072 + j * 640}' for c in cs for r in rs for i in range(8) for j in range(4)]
        R = rail_len(T); th = CC.BLOCK.get('rail_min', 60)
        print(nm, 'tiles', len(T), 'rail tiles (>=', th, 'm)', sum(v >= th for v in R.values()), 'max m', max(R.values()))
