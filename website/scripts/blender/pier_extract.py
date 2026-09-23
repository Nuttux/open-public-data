"""pier_extract.py — the piers the city has lost, off the USGS 1:24,000 sheets
(history/masks/usgs<epoch>_ink.png, R = black ink; topo24_extract.py): the ink
drawn over TODAY's water along the bay shore, closed into solid bodies, kept
where a body is pier-sized (30 m wide or more, 1,500 m² or more), each written
as an oriented rectangle (centre, axis, length, width) — history/masks/
piers.json {epoch: [[cx, cy, ang_deg, L, W], ...]}. Today's piers are land in
the city's water mask, so what stands on today's water is what was taken
away (or a sheet's misregistered edge, under 12 m, opened away).
usage: python3 pier_extract.py"""
import json, math, numpy as np
from PIL import Image
from scipy import ndimage
M = '/Users/daniel/code/qipu-render-work/history/masks'; SEA = '/Users/daniel/code/qipu-render-work/city'
g = json.load(open(f'{SEA}/sea.json')); sea = np.asarray(Image.open(f'{SEA}/sea.png'))[..., 0] > 127; SS = sea.shape[0]
meta = json.load(open(f'{M}/usgs1947.json')); res = meta['res']
x0, y0, x1, y1 = 1000.0, -6200.0, 7000.0, 6000.0            # the bay shore (east and north), and the islands
i0 = int((x0 - meta['x0']) / res); i1 = int((x1 - meta['x0']) / res); j0 = int((meta['y1'] - y1) / res); j1 = int((meta['y1'] - y0) / res)
H, W = j1 - j0, i1 - i0
X, Y = np.meshgrid(meta['x0'] + (np.arange(i0, i1) + 0.5) * res, meta['y1'] - (np.arange(j0, j1) + 0.5) * res)
si = ((X - g['ox']) / g['w'] * SS).astype(int); sj = ((1 - (Y - g['oy']) / g['h']) * SS).astype(int)
ok = (si >= 0) & (si < SS) & (sj >= 0) & (sj < SS)
water = np.zeros(X.shape, bool); water[ok] = sea[sj[ok], si[ok]]
# today's water well away from today's land: a pier the city still has is land
# in the mask; 8 m in from it is where a lost pier's deck can only be
water_in = ndimage.binary_erosion(water, iterations=2)
st = ndimage.generate_binary_structure(2, 1)
out = {}
for ep in ('usgs1947', 'usgs1956', 'usgs1968', 'usgs1973', 'usgs1980'):
    a = np.asarray(Image.open(f'{M}/{ep}_ink.png'))[j0:j1, i0:i1]
    onsheet = np.asarray(Image.open(f'{M}/{ep}.png'))[j0:j1, i0:i1, 2] > 127
    ink = (a[..., 0] > 127) & water_in & onsheet
    body = ndimage.binary_closing(ink, structure=st, iterations=3)          # a shed's two walls: one body
    body = ndimage.binary_fill_holes(body)
    body = ndimage.binary_opening(body, structure=st, iterations=3)         # under ~24 m wide: a line, not a pier
    lab, n = ndimage.label(body)
    rects = []
    for k in range(1, n + 1):
        ys_, xs_ = np.nonzero(lab == k)
        if len(xs_) * res * res < 1500: continue
        px = X[ys_, xs_]; py = Y[ys_, xs_]
        cx, cy = px.mean(), py.mean()
        cov = np.cov(np.vstack([px - cx, py - cy]))
        ev, evec = np.linalg.eigh(cov); ax = evec[:, 1]
        u = (px - cx) * ax[0] + (py - cy) * ax[1]; v = -(px - cx) * ax[1] + (py - cy) * ax[0]
        L = u.max() - u.min() + res; Wd = v.max() - v.min() + res
        fill = len(xs_) * res * res / (L * Wd)
        if Wd < 22 or fill < 0.55: continue           # a pier is a solid rectangle
        cu = (u.max() + u.min()) / 2; cv = (v.max() + v.min()) / 2
        rects.append([round(cx + cu * ax[0] - cv * ax[1], 1), round(cy + cu * ax[1] + cv * ax[0], 1),
                      round(math.degrees(math.atan2(ax[1], ax[0])), 2), round(L, 1), round(Wd, 1)])
    # a pier runs out from the shore: the part the sheet drew over today's
    # water may be only its outer end (its root lies on today's land or under
    # today's pier) — carried back along its axis to the nearest land, up to
    # 300 m; one that reaches no land is a ship or a sheet's mark, dropped
    def land(x, y):
        i = int((x - g['ox']) / g['w'] * SS); j = int((1 - (y - g['oy']) / g['h']) * SS)
        return 0 <= i < SS and 0 <= j < SS and not sea[j, i]
    keep = []
    for cx, cy, ang, L, Wd in rects:
        a_ = math.radians(ang); ux, uy = math.cos(a_), math.sin(a_)
        best = None
        for sgn in (-1, 1):
            ex, ey = cx + sgn * ux * L / 2, cy + sgn * uy * L / 2
            for k in range(0, 76):
                d = k * 4.0
                if land(ex + sgn * ux * d, ey + sgn * uy * d):
                    if best is None or d < best[1]: best = (sgn, d)
                    break
        if best is None: continue
        sgn, d = best; d += 6.0                                          # into the bulkhead
        keep.append([round(cx + sgn * ux * d / 2, 1), round(cy + sgn * uy * d / 2, 1), ang, round(L + d, 1), Wd])
    # a pier carried back along a skewed axis can cross its neighbour: of
    # two that overlap by a quarter of the smaller, the larger stays
    def poly(r):
        cx, cy, ang, L, Wd = r; a_ = math.radians(ang); ux, uy = math.cos(a_), math.sin(a_); vx, vy = -uy, ux
        return [(cx + s * ux * L / 2 + t * vx * Wd / 2, cy + s * uy * L / 2 + t * vy * Wd / 2) for s, t in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    def inside(x, y, P):
        c = False
        for i in range(4):
            (x1, y1), (x2, y2) = P[i], P[(i + 1) % 4]
            if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1): c = not c
        return c
    def overlap(r1, r2):
        P2 = poly(r2); cx, cy, ang, L, Wd = r1; a_ = math.radians(ang); ux, uy = math.cos(a_), math.sin(a_); vx, vy = -uy, ux
        n = 0; tot = 0
        for i in range(12):
            for j in range(4):
                u = (i + 0.5) / 12 - 0.5; v = (j + 0.5) / 4 - 0.5; tot += 1
                n += inside(cx + u * L * ux + v * Wd * vx, cy + u * L * uy + v * Wd * vy, P2)
        return n / tot
    keep.sort(key=lambda r: -r[3] * r[4]); rects = []
    for r in keep:
        if any(overlap(r, q) > 0.25 for q in rects): continue
        rects.append(r)
    out[ep] = rects
    print(ep, len(rects), 'piers', round(sum(r[3] * r[4] for r in rects) / 1e4, 1), 'ha')
json.dump(out, open(f'{M}/piers.json', 'w'))
