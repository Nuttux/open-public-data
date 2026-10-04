"""C1: one small overlay per key year for Daniel -> ~/Downloads/qipu-renders/vancouver/eras_preview/<Y>.jpg
NAPL mosaic of the year (footprint frame, c1/offsets.py), RED = lost buildings standing that year (eras/lost_buildings.geojson),
BLUE = today's records removed as new-since (built after the year), YELLOW = the year's structures (viaducts), thin GREEN = stand-ins
era.infill puts on later records (c1/manifest_<Y>.json)."""
import os, json, numpy as np, cv2
import common as c, cityconf as C
K = 0.7; OUTD = os.path.expanduser('~/Downloads/qipu-renders/vancouver/eras_preview'); os.makedirs(OUTD, exist_ok=True)
Wl, S, E, N = c.box_ll(); X0, Y0 = C.proj(Wl, S); X1, Y1 = C.proj(E, N)
W = int((X1 - X0) * K); H = int((Y1 - Y0) * K)
XX, YY = np.meshgrid(X0 + (np.arange(W) + 0.5) / K, Y1 - (np.arange(H) + 0.5) / K); I, J = c.to_px(*c.w2utm(XX, YY))
def P(x, y): return (int((x - X0) * K), int((Y1 - y) * K))
recs = {b['gid']: b for b in c.records(300)}
lost = json.load(open(f'{c.ERAS}/lost_buildings.geojson'))['features']
ST = json.load(open(f'{c.OUT}/structures.json'))
for Y in (1950, 1967, 1972, 1982):
    A = np.load(f'{c.OUT}/built_{Y}.npz')['aligned']
    im = cv2.cvtColor(cv2.remap(A, I.astype(np.float32), J.astype(np.float32), cv2.INTER_AREA), cv2.COLOR_GRAY2BGR)
    im = (im * 0.85).astype(np.uint8)
    M = json.load(open(f'{c.OUT}/manifest_{Y}.json'))
    for g in M['new_since_gids']:
        if g in recs: cv2.fillPoly(im, [np.array([P(x, y) for x, y in recs[g]['ring']], np.int32)], (230, 120, 30))
    for g in M['standin_gids']:      # over the blue: a later record that gets a period stand-in
        if g in recs: cv2.polylines(im, [np.array([P(x, y) for x, y in recs[g]['ring']], np.int32)], True, (60, 230, 60), 1)
    for f in lost:
        p = f['properties']
        if p['y0'] <= Y + 0.5 < p['gone_by']: cv2.fillPoly(im, [np.array([P(x, y) for x, y in f['geometry']['coordinates'][0]], np.int32)], (40, 40, 235))
    for s in ST:
        if s['y0'] <= Y + 0.5 < s['y1']: cv2.polylines(im, [np.array([P(x, y) for x, y in s['path']], np.int32)], False, (0, 220, 255), max(2, int(s['w'] * K * 0.5)))
    lab = f"{Y}  red lost {M['lost_buildings']}  blue new-since removed {M['new_since_removed']}  green stand-ins {M['infill_standins']}  yellow {'+'.join(x.split('_')[0] + x.split('_')[2] for x in M['structures'])}"
    cv2.rectangle(im, (0, 0), (W, 20), (0, 0, 0), -1); cv2.putText(im, lab, (5, 14), 0, 0.42, (255, 255, 255), 1)
    cv2.imwrite(f'{OUTD}/{Y}.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, 82]); print(f'{OUTD}/{Y}.jpg', im.shape)
