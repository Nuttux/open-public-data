"""sm_combine.py — the south-east shore of the 1:62,500 epochs as era masks
(history/masks/shore1895|1915|1939.png + .json, R = water then over today's
land, B = the masks speak here; world frame, 4 m): the San Mateo sheets south
of 37.75 N (y < -1110), the San Francisco sheets north of it, and — the bay
was only ever filled here, never given back at this scale — each epoch's
water also counts for every earlier epoch; 1930-43 also takes the 1946
1:24,000 water (usgs1947_chg)."""
import json, numpy as np
from PIL import Image
D = '/Users/daniel/code/qipu-render-work/history/sm'; M = '/Users/daniel/code/qipu-render-work/history/masks'
x0, y0, x1, y1, res = 1200.0, -6200.0, 7400.0, 2200.0, 4.0
NX, NY = int((x1 - x0) / res), int((y1 - y0) / res)
GX, GY = np.meshgrid(x0 + (np.arange(NX) + 0.5) * res, y1 - (np.arange(NY) + 0.5) * res)
def load(name, ymin=None, ymax=None, ch=0, d=D):
    m = json.load(open(f'{d}/{name.replace("_chg", "")}.json')); a = np.asarray(Image.open(f'{d}/{name}.png'))
    i = ((GX - m['x0']) / m['res']).astype(int); j = ((m['y1'] - GY) / m['res']).astype(int)
    ok = (i >= 0) & (i < a.shape[1]) & (j >= 0) & (j < a.shape[0])
    o = np.zeros(GX.shape, bool); o[ok] = (a[j[ok], i[ok], ch] > 127) & (a[j[ok], i[ok], 2] > 127)
    if ymin is not None: o &= GY >= ymin
    if ymax is not None: o &= GY < ymax
    return o
J = -1110.0
w39 = load('sm1939', ymax=J) | load('usgs1947_chg', d=M)
w15 = load('sm1915', ymax=J) | load('sf1915', ymin=J) | w39
w95 = load('sm1896', ymax=J) | load('sf1895', ymin=J) | w15
# the north shore on the 1895 sheet (the Crissy marsh and Harbor View, filled
# 1912-14 for the Exposition): x0 of this grid starts at 1200, so the north
# shore is written to its own mask below
# keep water that reaches today's bay (a fill against the shore) or a large
# body (the Islais marsh); drop the sheets' creeks inland, reservoirs and specks
from scipy import ndimage
SEA = '/Users/daniel/code/qipu-render-work/city'
g = json.load(open(f'{SEA}/sea.json')); sea = np.asarray(Image.open(f'{SEA}/sea.png'))[..., 0] > 127; SS = sea.shape[0]
si = ((GX - g['ox']) / g['w'] * SS).astype(int); sj = ((1 - (GY - g['oy']) / g['h']) * SS).astype(int)
ok = (si >= 0) & (si < SS) & (sj >= 0) & (sj < SS); ts = np.zeros(GX.shape, bool); ts[ok] = sea[sj[ok], si[ok]]
tsd = ndimage.binary_dilation(ts, iterations=3)
def keep(w):
    # slivers under ~25 m wide along a shore that did not move (the sheets'
    # shoreline and today's disagree by that much) are not a change
    w = ndimage.binary_opening(w, iterations=3)
    lab, n = ndimage.label(w)
    if not n: return w
    sz = ndimage.sum(w, lab, range(1, n + 1)); touch = ndimage.maximum(tsd, lab, range(1, n + 1))
    k = np.zeros(n + 1, bool); k[1:] = (touch > 0) | (sz > 5000)
    return k[lab]
# Islais Creek above the marsh (west of the Bayshore, x < 2700) was a creek, not a bay
creek = (GX < 2700) & (GY < J)
w39, w15, w95 = keep(w39 & ~creek), keep(w15 & ~creek), keep(w95 & ~creek)
# today's shoreline itself (its seawall, its riprap: the last metres of today's
# land before today's water) goes with the water of the year where that water
# reaches it, or a strip of today's shore stands in the old bay
near_sea = ndimage.binary_dilation(ts, iterations=12) & ~ts            # 48 m: the riprap rims of the fills (thin loops on the old bay, 1906 z5 1:1)
def reach(w): return w | (ndimage.binary_dilation(w, iterations=12) & near_sea)
w39, w15, w95 = reach(w39), reach(w15), reach(w95)
for name, w, src in (('shore1939', w39, 'San Mateo 1:62,500 1939 (USGS 301595) + 1:24,000 1947 water'),
                     ('shore1915', w15, 'San Mateo 1915 (298923), San Francisco 1915 (1:62,500), + later'),
                     ('shore1895', w95, 'San Mateo 1896 (298916), San Francisco 1895 (298889), + later')):
    rgb = np.zeros((NY, NX, 3), np.uint8); rgb[..., 0] = w * 255; rgb[..., 2] = 255
    Image.fromarray(rgb).save(f'{M}/{name}.png')
    json.dump({'x0': x0, 'y1': y1, 'res': res, 'w': NX, 'h': NY, 'src': src,
               'note': 'R water then over today\'s land (sm_water.py per sheet, sm_combine.py), B = speaks here'}, open(f'{M}/{name}.json', 'w'), indent=1)
    print(name, int(w.sum()), 'px', round(w.sum() * 16 / 1e6, 2), 'km2')

# THE FILL YEAR: between two sheets the made land did not appear at once. A
# cell water on the earlier sheet and land on the later one is filled at a
# year between their surveys, the fill advancing from the earlier shore
# outward (each body of new land at its own pace: year = a + (b - a) * its
# distance from the old shore / the body's greatest). CONVENTION. Written as
# shorefill.png: R,G = the year - 1800 as a 16-bit number (R high byte), B = speaks.
steps = [(1895.0, w95), (1915.0, w15), (1939.0, w39), (1946.0, load('usgs1947_chg', d=M))]
fill = np.zeros(GX.shape, np.float32)
for (ya, wa), (yb, wb) in zip(steps, steps[1:]):
    T = wa & ~wb
    if not T.any(): continue
    dist = ndimage.distance_transform_edt(wa)                 # from the earlier shore
    lab, n = ndimage.label(T)
    mx = ndimage.maximum(dist, lab, range(1, n + 1)); mn = ndimage.minimum(dist, lab, range(1, n + 1))
    mxa = np.concatenate([[1.0], mx]); mna = np.concatenate([[0.0], mn])
    f = (dist - mna[lab]) / np.maximum(1.0, mxa[lab] - mna[lab])
    fill[T] = (ya + (yb - ya) * np.clip(f, 0, 1))[T]
fill[steps[-1][1] & w95] = 1944.0                              # still bay in 1946: the 1:24,000 sheets take over
v = np.where(fill > 0, np.round(fill - 1800.0), 0).astype(np.uint16)
rgb = np.zeros((NY, NX, 3), np.uint8); rgb[..., 0] = v >> 8; rgb[..., 1] = v & 255; rgb[..., 2] = 255
Image.fromarray(rgb).save(f'{M}/shorefill.png')
json.dump({'x0': x0, 'y1': y1, 'res': res, 'w': NX, 'h': NY, 'note': 'fill year - 1800 = R*256 + G (0 = land in 1895), B = speaks'},
          open(f'{M}/shorefill.json', 'w'), indent=1)
print('shorefill', int((fill > 0).sum()), 'px; years', [int((np.abs(fill - y) < 0.5).sum()) for y in (1895, 1915, 1939, 1944)])

# the north shore of 1895 west of Van Ness (the Presidio shore, the Crissy
# marsh, Harbor View cove): its own grid
x0, y0, x1, y1 = -3600.0, 3800.0, 1600.0, 6200.0
NX, NY = int((x1 - x0) / res), int((y1 - y0) / res)
GX, GY = np.meshgrid(x0 + (np.arange(NX) + 0.5) * res, y1 - (np.arange(NY) + 0.5) * res)
si = ((GX - g['ox']) / g['w'] * SS).astype(int); sj = ((1 - (GY - g['oy']) / g['h']) * SS).astype(int)
ok = (si >= 0) & (si < SS) & (sj >= 0) & (sj < SS); ts = np.zeros(GX.shape, bool); ts[ok] = sea[sj[ok], si[ok]]
tsd = ndimage.binary_dilation(ts, iterations=3); near_sea = ndimage.binary_dilation(ts, iterations=6) & ~ts
wn = reach(keep(load('sfn1895')))
rgb = np.zeros((NY, NX, 3), np.uint8); rgb[..., 0] = wn * 255; rgb[..., 2] = 255
Image.fromarray(rgb).save(f'{M}/north1895.png')
json.dump({'x0': x0, 'y1': y1, 'res': res, 'w': NX, 'h': NY, 'src': 'San Francisco 1:62,500 1895 (298889), datum -90 -11',
           'note': 'R water then over today\'s land, B = speaks here'}, open(f'{M}/north1895.json', 'w'), indent=1)
print('north1895', int(wn.sum()), 'px', round(wn.sum() * 16 / 1e6, 2), 'km2')
