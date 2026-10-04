"""C1 step: a LOCAL offset field per mosaic year (the mosaics are not coregistered: 1967's south half sits ~35 m east, ~38 m north
of its north half). Reference = 1972 (footprints -> photo -4 E, +1 N, measured by align.py with a clear peak; within 5 m everywhere in
the README's zones). For each other year, 240 m tiles (stride 120 m) of the photo are template-matched (NCC, band-passed) against the
1972 photo within +-90 m; tiles with NCC >= 0.15 and a peak 1.25x the second-best (outside 15 m) are kept; the field = their values,
median-filtered over neighbours, nearest-filled where missing, on the 1 m grid (bilinear). Writes eras/c1/offsets_<Y>.npy (2, H, W):
photo minus footprints (E, N) in metres, footprint frame of c1/common.grid()."""
import json, numpy as np, cv2
import common as c
from scipy.ndimage import median_filter, distance_transform_edt, zoom
PAD = 200; M = 90; T = 240; ST = 120
e0, n1, Wd, Hd = c.grid()
REF = (-4, 1)
def pre(Y):
    a = c.napl(Y, PAD).astype(np.float32); g = cv2.GaussianBlur(a, (0, 0), 2); return g - cv2.GaussianBlur(a, (0, 0), 25), a > 0
R, _ = pre(1972)
res = {}
for Y in (1950, 1959, 1967, 1978, 1982):
    A, ok = pre(Y)
    nj = (Hd - T) // ST + 2; ni = (Wd - T) // ST + 2
    F = np.full((2, nj, ni), np.nan)
    for jj in range(nj):
        for ii in range(ni):
            j0 = (PAD - 60) + min(jj * ST, Hd - T); i0 = (PAD - 60) + min(ii * ST, Wd - T)   # the pad-200 crop starts 140 m before c.grid()'s
            t = A[j0:j0 + T, i0:i0 + T]
            if (ok[j0:j0 + T, i0:i0 + T]).mean() < 0.9 or t.std() < 1: continue
            r = cv2.matchTemplate(R[j0 - M:j0 + T + M, i0 - M:i0 + T + M], t, cv2.TM_CCOEFF_NORMED)
            _, mx, _, l = cv2.minMaxLoc(r); r2 = r.copy(); r2[max(0, l[1] - 15):l[1] + 16, max(0, l[0] - 15):l[0] + 16] = -1
            if mx >= 0.15 and mx >= 1.25 * r2.max():
                F[0, jj, ii] = -(l[0] - M) + REF[0]; F[1, jj, ii] = (l[1] - M) + REF[1]
    good = ~np.isnan(F[0])
    for k in (0, 1):
        f = F[k].copy(); med = np.nanmedian(f)
        f[~good] = med; fm = median_filter(f, 3, mode='nearest')
        bad = good & (np.abs(F[k] - fm) > 12); g2 = good & ~bad
        idx = distance_transform_edt(~g2, return_distances=False, return_indices=True)
        F[k] = F[k][tuple(idx)] if g2.any() else med
    # tile centres at min(jj*ST, Hd-T) + T/2 -> bilinear onto every pixel
    cj = np.array([min(jj * ST, Hd - T) + T / 2 for jj in range(nj)]); ci = np.array([min(ii * ST, Wd - T) + T / 2 for ii in range(ni)])
    from scipy.interpolate import RegularGridInterpolator
    J, I = np.mgrid[0:Hd, 0:Wd]
    out = np.stack([RegularGridInterpolator((cj, ci), F[k], bounds_error=False, fill_value=None)((np.clip(J, cj[0], cj[-1]), np.clip(I, ci[0], ci[-1]))) for k in (0, 1)])
    np.save(f'{c.OUT}/offsets_{Y}.npy', out.astype(np.float32))
    res[Y] = dict(tiles_kept=int(good.sum()), tiles=int(good.size), E=[round(float(out[0].min()), 1), round(float(out[0].max()), 1)], N=[round(float(out[1].min()), 1), round(float(out[1].max()), 1)])
    print(Y, res[Y], flush=True)
np.save(f'{c.OUT}/offsets_1972.npy', np.stack([np.full((Hd, Wd), REF[0], np.float32), np.full((Hd, Wd), REF[1], np.float32)]))
j = json.load(open(f'{c.OUT}/align.json')); j['fields'] = res; j['fields_note'] = 'offsets_<Y>.npy (c1/offsets.py) supersede "adopted": per-pixel field via photo-to-photo matching against 1972'
json.dump(j, open(f'{c.OUT}/align.json', 'w'), indent=1)
