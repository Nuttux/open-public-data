"""What the shore of a 1:24,000 epoch changes against today's (after
topo24_extract.py): <epoch>_chg.png, R = water then over today's land
(fill since), G = land then over today's water (dredged or restored since),
B = inside a sheet; world frame and 4 m pixel of the epoch's mask.

Both are cleaned so the sheets' registration (about +-20 m) and their
generalised shoreline do not paint slivers along the whole coast: a change
must hold 12 m in from its edge (erosion) and cover at least 2,000 m².
Land-then is not read on the Pacific shore (the sheets' ocean tint is too
faint to trust there, and the beach moves with the seasons).

usage: python3 topo24_change.py <masks_dir> <epoch> [<epoch> ...]
"""
import json, sys
import numpy as np
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None
SEA = '/Users/daniel/code/qipu-render-work/city'


def clean(m, erode=3, min_px=125):
    im = Image.fromarray((m * 255).astype(np.uint8))
    im = im.filter(ImageFilter.MinFilter(2 * erode + 1)).filter(ImageFilter.MaxFilter(2 * erode + 1))
    a = np.asarray(im) > 127
    # drop small blobs (connected components by a flood over a coarse grid)
    try:
        from scipy import ndimage
        lab, n = ndimage.label(a)
        if n:
            sz = ndimage.sum(a, lab, range(1, n + 1))
            keep = np.zeros(n + 1, bool); keep[1:] = sz >= min_px
            a = keep[lab]
    except ImportError:
        pass
    return a


d = sys.argv[1]
g = json.load(open(f'{SEA}/sea.json')); sea = np.asarray(Image.open(f'{SEA}/sea.png'))[..., 0] > 127
for ep in sys.argv[2:]:
    m = json.load(open(f'{d}/{ep}.json')); a = np.asarray(Image.open(f'{d}/{ep}.png')).astype(np.float32) / 255
    H, W = a.shape[:2]
    xs = m['x0'] + (np.arange(W) + 0.5) * m['res']; ys = m['y1'] - (np.arange(H) + 0.5) * m['res']
    X, Y = np.meshgrid(xs, ys); S = sea.shape[0]
    i = ((X - g['ox']) / g['w'] * S).astype(int); j = ((1 - (Y - g['oy']) / g['h']) * S).astype(int)
    ok = (i >= 0) & (i < S) & (j >= 0) & (j < S)
    today = np.zeros(X.shape, bool); today[ok] = sea[j[ok], i[ok]]
    inside = (a[..., 2] > 0.5) & ok
    then_w = a[..., 0] > 0.5
    # the city's own shore only: today's land mask is the city's (the export
    # counts Marin, the peninsula south of the county line and the islands
    # as sea), so the frame stops at the county line and the Golden Gate
    region = ok & (Y > -5770) & ~((Y > 5600) & (X < -2000)) & (X < 6200)
    pacific = (X < -5200) & (Y < 3500)
    from scipy import ndimage
    # water then: only the bay and the ocean — a sheet's water that touches
    # today's open water (lakes, reservoirs and pools are not the sea)
    lab, n = ndimage.label(then_w & inside)
    touch = np.unique(lab[then_w & inside & today & (ndimage.binary_erosion(today, iterations=25))])
    sea_then = np.isin(lab, touch[touch > 0])
    wt = clean(sea_then & ~today & inside & region)
    # land then: wide ground, joined to today's land (not a pier: an opening
    # of 32 m takes out anything narrower than 64 m; not an island)
    # ... and only along a shore the sheet itself draws (its water within
    # 300 m): a print whose bay tint is too faint to read says nothing
    near_w = ndimage.binary_dilation(then_w & inside, iterations=75)
    lt0 = ~then_w & today & inside & region & ~pacific & near_w
    lt0 = ndimage.binary_opening(lt0, iterations=8)
    lab2, n2 = ndimage.label(lt0)
    touch2 = np.unique(lab2[lt0 & ndimage.binary_dilation(~today & ok, iterations=2)])
    lt = clean(np.isin(lab2, touch2[touch2 > 0]))
    out = np.stack([(wt * 255).astype(np.uint8), (lt * 255).astype(np.uint8), (inside * 255).astype(np.uint8)], axis=2)
    Image.fromarray(out).save(f'{d}/{ep}_chg.png')
    print(ep, 'water then over land now (km2)', round(wt.sum() * m['res'] ** 2 / 1e6, 3),
          'land then over water now (km2)', round(lt.sum() * m['res'] ** 2 / 1e6, 3))
