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
near_sea = ndimage.binary_dilation(ts, iterations=6) & ~ts
def reach(w): return w | (ndimage.binary_dilation(w, iterations=6) & near_sea)
w39, w15, w95 = reach(w39), reach(w15), reach(w95)
for name, w, src in (('shore1939', w39, 'San Mateo 1:62,500 1939 (USGS 301595) + 1:24,000 1947 water'),
                     ('shore1915', w15, 'San Mateo 1915 (298923), San Francisco 1915 (1:62,500), + later'),
                     ('shore1895', w95, 'San Mateo 1896 (298916), San Francisco 1895 (298889), + later')):
    rgb = np.zeros((NY, NX, 3), np.uint8); rgb[..., 0] = w * 255; rgb[..., 2] = 255
    Image.fromarray(rgb).save(f'{M}/{name}.png')
    json.dump({'x0': x0, 'y1': y1, 'res': res, 'w': NX, 'h': NY, 'src': src,
               'note': 'R water then over today\'s land (sm_water.py per sheet, sm_combine.py), B = speaks here'}, open(f'{M}/{name}.json', 'w'), indent=1)
    print(name, int(w.sum()), 'px', round(w.sum() * 16 / 1e6, 2), 'km2')

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
