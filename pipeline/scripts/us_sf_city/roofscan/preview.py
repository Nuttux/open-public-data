"""
REBUILD THE CITY FROM THE EXTRACTED FEATURES ALONE, AND LOOK AT IT.

The scan render is the truth. This one is drawn from nothing but what the
extractor kept — a roof plane, a pitch, a ridge, and a handful of boxes per
footprint. If the two read alike, the extraction kept what matters; if the
model is bald where the scan is busy, it did not.
"""
import os, json, math
import numpy as np
from PIL import Image
from pyproj import Transformer
from matplotlib.path import Path as MPath
from extract import AreaSource, world_to_merc

HERE = os.path.dirname(os.path.abspath(__file__))
CELL = 0.35

def shade(H, cell=CELL):
    zy, zx = np.gradient(H, cell)
    az, alt = np.deg2rad(315.0), np.deg2rad(45.0)
    sl = np.arctan(np.hypot(zx, zy)); asp = np.arctan2(-zx, zy)
    sh = np.clip(np.sin(alt)*np.cos(sl) + np.cos(alt)*np.sin(sl)*np.cos(az-asp), 0, 1)
    hn = np.clip(H/max(1.0, np.percentile(H, 99.5)), 0, 1)
    base = 0.35 + 0.65*hn
    rgb = np.zeros(H.shape + (3,), np.uint8)
    for k, t in enumerate((0.45, 0.47, 0.50)):
        rgb[..., k] = np.clip(255*base*(t + 0.75*sh), 0, 255)
    return np.flipud(rgb)

def build(area):
    src = AreaSource(area, CELL)
    rows = json.load(open(os.path.join(HERE, "roofs.json")))[area]
    bb = src.bb
    ny, nx = src.h.shape
    M = np.zeros((ny, nx), np.float32)
    jj, ii = np.mgrid[0:ny, 0:nx]
    CXm = bb[0] + (ii+0.5)*CELL; CYm = bb[1] + (jj+0.5)*CELL
    INV = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
    lo, la = INV.transform(CXm.ravel(), CYm.ravel())
    WX = ((lo - (-122.438)) * 111320.0 * 0.790582709628753).reshape(ny, nx)
    WY = ((la - 37.76) * 111320.0).reshape(ny, nx)
    FP = {r["gid"]: r for r in json.load(open(os.path.join(HERE, "footprints.json")))[area]}
    for r in rows:
        f = FP.get(r["gid"])
        if not f: continue
        rx = np.asarray(f["rx"], float); ry = np.asarray(f["ry"], float)
        sub = ((WX>=rx.min()-1)&(WX<=rx.max()+1)&(WY>=ry.min()-1)&(WY<=ry.max()+1))
        if not sub.any(): continue
        idx = np.where(sub)
        inside = MPath(np.c_[rx, ry]).contains_points(np.c_[WX[idx], WY[idx]])
        if not inside.any(): continue
        yy, xx = idx[0][inside], idx[1][inside]
        z = np.full(yy.shape, r["scan_h"], np.float32)
        if r["pitched"] and r["ridge_deg"] is not None:
            # a ridge across the footprint, at the measured pitch
            th = math.radians(r["ridge_deg"])
            ux, uy = -math.sin(th), math.cos(th)          # across the ridge
            pw = (WX[yy, xx]-rx.mean())*ux + (WY[yy, xx]-ry.mean())*uy
            z = z + (np.abs(pw).max() - np.abs(pw)) * math.tan(math.radians(r["slope_deg"]))
        np.maximum.at(M, (yy, xx), z)
        for b in r["clutter"]:
            hw, hd = b["w"]/2, b["d"]/2
            bm = ((CXm>=b["mx"]-hw)&(CXm<=b["mx"]+hw)&(CYm>=b["my"]-hd)&(CYm<=b["my"]+hd))
            if bm.any(): np.maximum.at(M, np.where(bm), b["top"])
    return src, M

for area in ("downtown", "sunset"):
    src, M = build(area)
    real = np.nan_to_num(src.h, nan=0.0)
    a, b = shade(real), shade(M)
    gap = np.full((a.shape[0], 8, 3), 30, np.uint8)
    Image.fromarray(np.concatenate([a, gap, b], 1)).save(os.path.join(HERE, f"{area}_model.png"))
    on = M > 0.5
    print(f"{area}: model covers {100*on.mean():.0f}% of frame, "
          f"max {M.max():.0f} m; wrote {area}_model.png  (scan left, model right)")
