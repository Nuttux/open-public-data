"""The city on the USGS 1:24,000 sheets of 1946-1980, as world rasters.

The 7.5-minute sheets San Francisco North and South, Hunters Point, Point
Bonita and Oakland West (USGS Historical Topographic Map Collection,
public domain, GeoTIFF: polyconic on NAD27, 2.032 m a pixel) draw, legibly:
water as a full blue tint, the built-up city as a pink urban tint (parks,
cleared land and open ground white), landmark buildings and pier sheds in
black, and on the photorevised prints every change since the base survey in
purple. This reads the prints of one epoch (e.g. the 1956 base, or its 1968
photorevision) into the map's world frame and writes:

  <out>.png      R water, G urban-tint density (over ~20 m), B inside a sheet
  <out>_ink.png  R black ink (buildings, piers), G purple (photorevision)
  <out>.json     the sheets, the datum shift used and the water check

World frame: x = (lon + 122.438) * 111320 * cos(37.76), y = (lat - 37.76) *
111320 (the engine's, pipeline encode_city_chunks.py), 4 m a pixel.
Datum: WGS84 -> NAD27 by pyproj (EPSG:4326 -> EPSG:4267; at Alcatraz +92 m
E, +12 m N — the shift measured by hand on the 1895 sheet). A residual shift
is then MEASURED: the sheet's water against today's water mask (the city
export's sea.png) near shores that have not moved (Alcatraz; Lands End, the
Presidio bluffs) and reported; it is applied only with --fit.

usage: python3 topo24_extract.py <out_prefix> <sheet.tif>[,<sheet.tif>...] [--fit]
(pyproj, numpy, PIL — the system python3, not Blender's)
"""
import json, math, sys, os
import numpy as np
from PIL import Image, ImageFilter
from pyproj import CRS, Transformer
Image.MAX_IMAGE_PIXELS = None

LAT0, LON0, MPD = 37.76, -122.438, 111320.0
KX = MPD * math.cos(math.radians(LAT0))
RES = 4.0
WX0, WY0, WX1, WY1 = -7200.0, -7200.0, 7400.0, 8400.0
SEA = '/Users/daniel/code/qipu-render-work/city'

out, sheets = sys.argv[1], sys.argv[2].split(',')
FIT = '--fit' in sys.argv
NX, NY = int((WX1 - WX0) / RES), int((WY1 - WY0) / RES)
gx = WX0 + (np.arange(NX) + 0.5) * RES; gy = WY1 - (np.arange(NY) + 0.5) * RES
GX, GY = np.meshgrid(gx, gy)
LON = GX / KX + LON0; LAT = GY / MPD + LAT0
to27 = Transformer.from_crs('EPSG:4326', 'EPSG:4267', always_xy=True)
LON27, LAT27 = to27.transform(LON, LAT)


# the quadrangles' neatlines (lon0, lat0, lon1, lat1; NAD27), from their titles
NEAT = {'San_Francisco_North': (-122.5, 37.75, -122.375, 37.875), 'San_Francisco_South': (-122.5, 37.625, -122.375, 37.75),
        'Hunters_Point': (-122.375, 37.625, -122.25, 37.75), 'Point_Bonita': (-122.625, 37.75, -122.5, 37.875),
        'Oakland_West': (-122.375, 37.75, -122.25, 37.875)}
# the South sheet draws the ocean shore west of its neatline (degrees W, S, E, N)
EXTEND = {'San_Francisco_South': (0.025, 0.0, 0.0, 0.0)}


def geokeys(t):
    k = t[34735]; dbl = t.get(34736); o = {}
    for i in range(4, len(k), 4):
        key, loc, cnt, val = k[i:i + 4]
        o[key] = val if loc == 0 else (dbl[val] if loc == 34736 and cnt == 1 else None)
    return o


def today_water():
    g = json.load(open(f'{SEA}/sea.json')); a = np.asarray(Image.open(f'{SEA}/sea.png'))[..., 0].astype(np.float32) / 255
    S = a.shape[0]
    i = ((GX - g['ox']) / g['w'] * S).astype(int); j = ((1 - (GY - g['oy']) / g['h']) * S).astype(int)
    ok = (i >= 0) & (i < S) & (j >= 0) & (j < S)
    w = np.zeros(GX.shape, np.float32); w[ok] = a[j[ok], i[ok]]
    return w > 0.5


def box(a, r):
    return np.asarray(Image.fromarray(a).filter(ImageFilter.BoxBlur(r)))


WAT = np.zeros(GX.shape, np.float32); URB = np.zeros(GX.shape, np.float32); INS = np.zeros(GX.shape, bool)
INK = np.zeros(GX.shape, np.float32); PUR = np.zeros(GX.shape, np.float32)
TW = today_water()
meta = []
for sh in sheets:
    im = Image.open(sh); t = im.tag_v2; gk = geokeys(t)
    X0, Y0 = t[33922][3], t[33922][4]; S = t[33550][0]
    lat0, lon0 = gk.get(3081, 0.0), gk.get(3080)
    proj = Transformer.from_crs(CRS.from_proj4(f'+proj=longlat +ellps=clrk66 +no_defs'),
                                CRS.from_proj4(f'+proj=poly +lat_0={lat0} +lon_0={lon0} +x_0=0 +y_0=0 +ellps=clrk66 +units=m +no_defs'),
                                always_xy=True)
    A = np.asarray(im.convert('RGB'))
    H_, W_ = A.shape[:2]
    Af = A.astype(np.float32)
    R, G, B = Af[..., 0], Af[..., 1], Af[..., 2]
    # classes on the sheet itself
    lum = Af.mean(axis=2)
    blk = (lum < 80)
    pur = (R > 120) & (B > 120) & (G < 130) & (R - G > 45) & (B - G > 35)
    # the tints are fine screens: judged on a 5-pixel (10 m) blur
    Ab = np.stack([box(A[..., c], 2) for c in range(3)], axis=2).astype(np.float32)
    Rb, Gb, Bb = Ab[..., 0], Ab[..., 1], Ab[..., 2]
    reddish = (Rb > 185) & (Rb - Bb > 22) & (Rb - Gb > 14)
    # the photorevisions tint what was built since in purple, not pink
    reddish |= (Rb > 185) & (Rb - Gb > 14) & (Bb - Gb > 14)

    # the sheet's pixel under every world cell, once; a small shift (dx, dy)
    # world metres is then a shift of the sheet's pixel grid (the sheet's axes
    # are within a fraction of a degree of the world's)
    PXf, PYf = proj.transform(LON27, LAT27)
    PXf = (PXf - X0) / S; PYf = (Y0 - PYf) / S

    # the map face: the quadrangle's own neatline (NAD27 degrees; a 7.5'
    # sheet), the collar outside it cut away — except where the sheet carries
    # its face past the neatline to take in a strip of coast (EXTEND)
    nb = NEAT[next(k_ for k_ in NEAT if k_ in os.path.basename(sh))]
    ext = EXTEND.get(next((k_ for k_ in EXTEND if k_ in os.path.basename(sh)), None), (0, 0, 0, 0))
    face = (LON27 >= nb[0] - ext[0]) & (LON27 <= nb[2] + ext[2]) & (LAT27 >= nb[1] - ext[1]) & (LAT27 <= nb[3] + ext[3])

    def sample(arr, dx=0.0, dy=0.0, idx=None):
        px_ = PXf if idx is None else PXf[idx]; py_ = PYf if idx is None else PYf[idx]
        px = (px_ - dx / S).astype(np.int64); py = (py_ + dy / S).astype(np.int64)
        ok = (px >= 0) & (px < W_) & (py >= 0) & (py < H_) & (face if idx is None else face[idx])
        o = np.zeros(px.shape, arr.dtype); o[ok] = arr[py[ok], px[ok]]
        return o, ok

    # the water tint: the sheet's own colour where today is open water far
    # from any shore (the bay has not moved there)
    _, ok0 = sample(np.zeros((H_, W_), np.uint8))
    deep = TW & ok0
    deep &= box((TW * 255).astype(np.uint8), 25) > 250          # 100 m from any land today
    smp = []
    for c in range(3):
        v, _ = sample(Ab[..., c]); smp.append(np.median(v[deep]) if deep.any() else np.nan)
    wref = np.array(smp, np.float32)
    ndeep = int(deep.sum())
    if ndeep < 20000 or np.isnan(wref).any() or (wref.max() - wref.min()) < 10:
        # too little open water today on this sheet: the sheet's own blue —
        # the commonest colour among its bluish pixels
        bl = (Ab[..., 2] - Ab[..., 0] > 8) & (Ab.mean(axis=2) > 150)
        q = (Ab[bl] // 6).astype(np.int32)
        keys, cnt = np.unique(q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2], return_counts=True)
        kk = keys[np.argmax(cnt)]; wref = np.array([kk // 10000, kk // 100 % 100, kk % 100], np.float32) * 6 + 3
    # water: the tint is a cool shift off the paper — green above red, blue
    # not below it (paper is neutral or cream, the urban tint red, woodland
    # green with blue far below red). Holds on every printing seen, down to
    # the faint 1973 photorevision (paper 254,254,254 / water 246,254,254).
    Rb, Gb, Bb = Ab[..., 0], Ab[..., 1], Ab[..., 2]
    wat_s = ((Gb - Rb >= 6) & (Bb - Rb >= -3) & (Ab.mean(axis=2) > 175)).astype(np.uint8) * 255
    wat_s = np.asarray(Image.fromarray(wat_s).filter(ImageFilter.MedianFilter(5)))
    urb_s = box(reddish.astype(np.uint8) * 255, 10)             # the share over ~40 m: a tinted block fills it, contour lines do not
    best = (0.0, 0.0)
    if FIT:
        # residual shift: the water edge against today's on unmoved shores
        roi = ok0 & (((GX > 700) & (GX < 2000) & (GY > 6900) & (GY < 8000)) |          # Alcatraz
                     ((GX > -6600) & (GX < -3300) & (GY > 3600) & (GY < 5300)))           # Lands End, the Presidio bluffs
        sc = -1; ri = np.nonzero(roi)
        if len(ri[0]):
            for dx in range(-60, 61, 4):
                for dy in range(-60, 61, 4):
                    w_, _ = sample(wat_s, dx, dy, ri)
                    s_ = float(((w_ > 127) == TW[ri]).mean())
                    if s_ > sc: sc, best = s_, (float(dx), float(dy))
    w_, ok = sample(wat_s, *best); u_, _ = sample(urb_s, *best)
    k_, _ = sample((blk * 255).astype(np.uint8), *best); p_, _ = sample((pur * 255).astype(np.uint8), *best)
    WAT = np.where(ok, np.maximum(WAT, w_ / 255.0), WAT); URB = np.where(ok, np.maximum(URB, u_ / 255.0), URB)
    INK = np.where(ok, np.maximum(INK, k_ / 255.0), INK); PUR = np.where(ok, np.maximum(PUR, p_ / 255.0), PUR)
    INS |= ok
    # the check: agreement with today's water over the sheet where both agree it is sea or land far from shore
    agree = float(((w_ > 127) == TW)[ok].mean())
    meta.append(dict(sheet=os.path.basename(sh), water_ref=[float(v) for v in wref], deep_samples=ndeep, residual_shift=best,
                     water_agreement_today=round(agree, 4), lat0=lat0, lon0=lon0))
    print(meta[-1], flush=True)

rgb = np.stack([(WAT * 255).astype(np.uint8), (np.clip(URB, 0, 1) * 255).astype(np.uint8), (INS * 255).astype(np.uint8)], axis=2)
Image.fromarray(rgb).save(out + '.png')
ink = np.stack([(INK * 255).astype(np.uint8), (PUR * 255).astype(np.uint8), (INS * 255).astype(np.uint8)], axis=2)
Image.fromarray(ink).save(out + '_ink.png')
json.dump({'sheets': meta, 'x0': WX0, 'y1': WY1, 'res': RES, 'w': NX, 'h': NY,
           'note': 'R water, G urban-tint density, B inside a sheet; _ink: R black ink, G purple photorevision'},
          open(out + '.json', 'w'), indent=1)
print(out, NX, NY)
