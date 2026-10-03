"""rails_b8.py: surface tram / cable-car / light-rail length (m) per AI tile from OSM (snap data transit/rail_osm.json), projected to L9 with
the viewer DEM (scratchpad ll.py projection). rail_len(tiles) -> {"gx,gy": metres}. Calibrated against block52's P.txt rail2 set."""
import json, math, numpy as np, sys
sys.path.insert(0, '/private/tmp/claude-501/-Users-daniel-code-qipu-render-work/e9f9d2cc-b809-495b-a48f-3182384413d2/scratchpad')
V = '/Users/daniel/code/qipu-render-work/cloud/viewer'; M = json.load(open(V + '/dem20.json')); Z = np.fromfile(V + '/dem20.bin', np.int16).reshape(M['ny'], M['nx']) / 10
LON0, LAT0 = -122.438, 37.76; KXM = 111320 * math.cos(math.radians(37.76)); CA = math.cos(math.pi / 6); SA = 0.42; KX = math.sqrt(2) * CA; KY = math.sqrt(2) * SA; ZT = math.sqrt(2 * (CA * CA - SA * SA))
SC = 2 ** (round(math.log2(0.06898352692062097) * 24) / 24); SZ = SC * 64; CX, CY = 241.427019126574, 707.0567508859249; PCW, PCH = 2560 * 64, 1536 * 64
def l9(lat, lon):
    x = (lon - LON0) * KXM; y = (lat - LAT0) * 111320
    c = np.clip(((x - M['x0']) / M['step']).astype(int), 0, M['nx'] - 1); r = np.clip(((y - M['y0']) / M['step']).astype(int), 0, M['ny'] - 1); z = np.maximum(Z[r, c], 0)
    return 2 * ((x * KX - CX) * SZ + PCW / 4), 2 * ((CY - (y * KY + z * ZT)) * SZ + PCH / 4)
def samples():
    d = json.load(open('/Users/daniel/code/qipu-render-work/snap/combo3/data/transit/rail_osm.json'))['elements']
    nodes = {e['id']: (e['lat'], e['lon']) for e in d if e['type'] == 'node'}; P = []
    for e in d:
        t = e.get('tags', {})
        if e['type'] != 'way' or t.get('railway') not in ('tram', 'light_rail', 'rail', 'narrow_gauge', 'funicular') or t.get('tunnel') in ('yes',) or t.get('layer', '0').startswith('-') or t.get('subway') == 'yes': continue
        g = [(q['lat'], q['lon']) for q in e['geometry']] if 'geometry' in e else [nodes[n] for n in e.get('nodes', []) if n in nodes]
        for (a, b), (c, dd) in zip(g, g[1:]):
            L = math.hypot((c - a) * 111320, (dd - b) * KXM); k = max(1, int(L / 2))
            for s in np.linspace(0, 1, k, endpoint=False): P.append((a + (c - a) * s, b + (dd - b) * s))
    P = np.array(P); gx, gy = l9(P[:, 0], P[:, 1]); return gx, gy
def rail_len(tiles):
    gx, gy = samples(); out = {}
    for t in tiles:
        x, y = map(int, t.split(',')); out[t] = 2.0 * int(((gx >= x) & (gx < x + 1024) & (gy >= y) & (gy < y + 1024)).sum())
    return out
if __name__ == '__main__':
    L = [l.split() for l in open('/Users/daniel/code/qipu-render-work/combo/block52/work/ai/P.txt') if l.startswith('C9:')]
    R = rail_len([l[0][3:] for l in L]); r2 = {l[0][3:] for l in L if 'rail' in l[3]}
    for th in (10, 30, 60, 100):
        pred = {k for k, v in R.items() if v >= th}; print(th, 'pred', len(pred), 'true', len(r2), 'tp', len(pred & r2), 'fp', len(pred - r2), 'fn', len(r2 - pred))
