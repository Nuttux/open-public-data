"""shore_water.py (OPEN-GROUND step 2, 07/10; CITY != sf only): the render's sea that the class pass did not call water.

Vancouver's class pass marks the open sea as water (code 1) but its coastline comes from a coarse grid: along English Bay /
Kitsilano / Spanish Banks a stair-stepped band of sea (and the foreshore just under the surface) is code 7 'other' or code 0
'ground'. post_sb.compose only put class water (+ code-7 pieces touching it) back from the render, so on whole shoreline tiles
the AI's houses / street / painted horizon survived on render sea (kits 8_13, 6_13 shore row, English Bay 73600_36480).

render_water(ren, code) -> bool mask of px that look like the render's own sea (Lab within a box of the median Lab of the
class-water px of this image), are code 0 / 7 (never roof / wall / landmark / street / tree), lie within R px of class water and
are connected to it (1/4-res components). compose() adds them to its render mask. SF: never called (byte-identical)."""
import numpy as np, cv2
import scipy.ndimage as nd

R_PX, DL, DA, DB = 160, 18, 8, 10   # ~15 m of L9 px; Lab box (cv2 8-bit Lab) around the image's sea median


def render_water(ren, code, step=2048):
    wat = code == 1
    if wat.sum() < 4000: return np.zeros(code.shape, bool)
    ys, xs = np.nonzero(wat[::7, ::7]); k = np.random.RandomState(0).permutation(len(ys))[:200000]
    ref = np.median(cv2.cvtColor(np.ascontiguousarray(ren[::7, ::7][ys[k], xs[k]][None]), cv2.COLOR_RGB2LAB)[0].astype(np.int16), 0)
    h, w = code.shape; h4, w4 = (h + 3) // 4, (w + 3) // 4
    p4 = np.zeros((h4 * 4, w4 * 4), bool); p4[:h, :w] = wat; wat4 = p4.reshape(h4, 4, w4, 4).any((1, 3)); del p4
    near4 = nd.distance_transform_edt(~wat4) <= R_PX / 4 + 1
    near = np.repeat(np.repeat(near4, 4, 0), 4, 1)[:h, :w]
    cand = np.zeros(code.shape, bool)
    for y in range(0, h, step):
        s = slice(y, min(h, y + step)); ok = near[s] & np.isin(code[s], (0, 7))
        if not ok.any(): continue
        L = cv2.cvtColor(np.ascontiguousarray(ren[s]), cv2.COLOR_RGB2LAB).astype(np.int16)
        cand[s] = ok & (np.abs(L[..., 0] - ref[0]) <= DL) & (np.abs(L[..., 1] - ref[1]) <= DA) & (np.abs(L[..., 2] - ref[2]) <= DB)
    del near
    if not cand.any(): return cand
    p4 = np.zeros((h4 * 4, w4 * 4), bool); p4[:h, :w] = cand; c4 = p4.reshape(h4, 4, w4, 4).any((1, 3)); del p4
    lb, n = nd.label(c4 | wat4); keep = np.zeros(n + 1, bool); keep[np.unique(lb[wat4])] = True; keep[0] = False
    k4 = keep[lb]; del lb
    return cand & np.repeat(np.repeat(k4, 4, 0), 4, 1)[:h, :w]
