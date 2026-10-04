"""C1 step: era.py's period masks for the area from the NAPL mosaics (topo format, eras/masks/napl<Y>.png + .json + _chg.png),
world frame (engine metres), 4 m pixel, the box + 200 m (outside the box: B = 0, no sheet speaks).
  napl<Y>.png  R = water on the photo, G = built-up share (share of pixels with built p >= 0.5, Gaussian sigma 20 m, scaled so established ground reads 0.6;
               era.topo_built reads it as (G - 0.4) / 0.2, the same reading as SF's 1:24,000 urban tint), B = inside the photo and the box
  napl<Y>_chg.png  R = water on the photo over today's land (filled since), G = land then over today's water (0 here: this part of
               False Creek was only ever filled), B = inside
Water on the photo: dark (Gaussian 4 m < 0.8 x the box's median) and flat (sd over 8 m < 0.06) ground joined to today's water, closed
over 25 m (log booms and moored boats are water), CONVENTION thresholds checked by eye on the 1950-1982 previews."""
import json, os, numpy as np, cv2
import common as c, cityconf as C
RES, PAD = 4.0, 200.0
Wl, S, E, N = c.box_ll()
bx0, by0 = C.proj(Wl, S); bx1, by1 = C.proj(E, N)
x0, y1 = np.floor((bx0 - PAD) / RES) * RES, np.ceil((by1 + PAD) / RES) * RES
w, h = int(np.ceil((bx1 + PAD - x0) / RES)), int(np.ceil((y1 - (by0 - PAD)) / RES))
XX, YY = np.meshgrid(x0 + (np.arange(w) + 0.5) * RES, y1 - (np.arange(h) + 0.5) * RES)
inbox = (XX >= bx0) & (XX <= bx1) & (YY >= by0) & (YY <= by1)
LO, LA = C.unproj(XX, YY); EE, NN = c.ll2utm(LO, LA)
# today's land (engine base/landmask.bin, City 2002 shoreline)
lm = json.load(open(f'{c.W}/engine/base/landmask.json')); raw = np.fromfile(f'{c.W}/engine/base/landmask.bin', np.uint8)
bits = np.unpackbits(raw.reshape(lm['h'], lm['rowBytes']), axis=1)[:, :lm['w']]
wx0, wy0, wx1, wy1 = lm['world']
li = np.clip(np.round((XX - wx0) / (wx1 - wx0) * (lm['w'] - 1)).astype(int), 0, lm['w'] - 1)
lj = np.clip(np.round((YY - wy0) / (wy1 - wy0) * (lm['h'] - 1)).astype(int), 0, lm['h'] - 1)
land_today = bits[lj, li].astype(bool)
OUTD = f'{c.ERAS}/masks'; os.makedirs(OUTD, exist_ok=True)
stats = {}
REC = c.records(250)
for Y in (1950, 1959, 1967, 1972, 1978, 1982):
    d = np.load(f'{c.OUT}/built_{Y}.npz'); P = d['p'].astype(np.float32); A = d['aligned'].astype(np.float32) / 255
    ge0, gn1, gw, gh = d['grid']
    B1 = cv2.GaussianBlur((P >= 0.5).astype(np.float32), (0, 0), 20)
    # calibrate to the urban-tint reading: the median share over ESTABLISHED ground (>= 25 % of a 40 m cell under footprints that stood by
    # the year with a sourced date) maps to 0.6 (= fully built for era.topo_built); CONVENTION, so that streets and yards between houses
    # do not read as open land, and cleared blocks (share far below their neighbours') do
    est = np.zeros(P.shape, np.uint8)
    for b in REC:
        if str(b['from_src']).startswith('sourced') and b['from'] <= Y and not (b['until'] and b['until'] <= Y):
            cv2.fillPoly(est, [np.array([c.to_px(*c.w2utm(x, y)) for x, y in b['ring']], np.int32)], 1)
    estc = cv2.GaussianBlur(est.astype(np.float32), (0, 0), 20) >= 0.25
    ref = float(np.median(B1[estc & (A > 0)]))
    B1 = np.clip(B1 * 0.6 / ref, 0, 1)
    m4 = cv2.GaussianBlur(A, (0, 0), 4); sd8 = np.sqrt(np.maximum(cv2.GaussianBlur(A * A, (0, 0), 8) - cv2.GaussianBlur(A, (0, 0), 8) ** 2, 0))
    med = np.median(A[A > 0])
    wet = ((m4 < 0.8 * med) & (sd8 < 0.06) & (A > 0)).astype(np.uint8)
    wet = cv2.morphologyEx(wet, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    I = np.clip(np.round(EE - ge0).astype(int), 0, gw - 1); J = np.clip(np.round(gn1 - NN).astype(int), 0, gh - 1)
    cov = inbox & (A[J, I] > 0)
    wetw = wet[J, I].astype(bool)
    n, lab = cv2.connectedComponents(wetw.astype(np.uint8))
    keep = np.unique(lab[wetw & ~land_today]); keep = keep[keep > 0]
    water = np.isin(lab, keep) & cov
    G = np.where(water, 0, B1[J, I]) * cov
    img = np.stack([water * 255, np.round(G * 255), cov * 255], -1).astype(np.uint8)
    cv2.imwrite(f'{OUTD}/napl{Y}.png', img[..., ::-1])
    chg = np.stack([(water & land_today) * 255, np.zeros_like(G), cov * 255], -1).astype(np.uint8)
    cv2.imwrite(f'{OUTD}/napl{Y}_chg.png', chg[..., ::-1])
    json.dump(dict(src=f'eras/src/napl_{Y}.tif (NRCan NAPL Salish mosaic, OGL-Canada 2.0)', survey=Y, x0=float(x0), y1=float(y1), res=RES, w=w, h=h,
                   photo_offset_EN=json.load(open(f'{c.OUT}/align.json'))['adopted'][str(Y)],
                   note='R water on the photo, G built-up share (p>=0.5 within ~40 m), B inside the photo and the va1 box (c1/masks.py)'),
              open(f'{OUTD}/napl{Y}.json', 'w'), indent=1)
    stats[Y] = dict(water_then_over_land_ha=round(float((water & land_today).sum() * RES * RES / 1e4), 2), G_mean_box=round(float(G[cov].mean()), 3), ref_share=round(ref, 3), built_share_of_box=round(float((G[cov] >= 0.5).mean()), 3))
    print(Y, stats[Y], flush=True)
json.dump(stats, open(f'{c.OUT}/masks_stats.json', 'w'), indent=1)
