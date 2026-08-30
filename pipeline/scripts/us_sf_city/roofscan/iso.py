"""
THE SAME BLOCK, DRAWN TWICE, FROM THE SAME CAMERA.

before  every footprint as one prism at its published height — which is
        exactly what the page draws today
after   the same footprints with the roof plane, the pitch and the rooftop
        objects the scan measured

Both go through one oblique renderer so the only difference in the picture is
the geometry. Column-marching with a y-buffer, far row to near row: the same
way the height-field renderers of the 90s did it, and fast enough in numpy.
"""
import os, json, math
import numpy as np
from PIL import Image
from pyproj import Transformer
from matplotlib.path import Path as MPath
from scipy.ndimage import rotate as ndrotate
from extract import AreaSource

HERE = os.path.dirname(os.path.abspath(__file__))
CELL = 0.35
LON0, LAT0, MPD, COSL = -122.438, 37.76, 111320.0, 0.790582709628753
INV = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)


def fields(area):
    """(before, after) height-above-ground grids on the scan's own raster"""
    src = AreaSource(area, CELL)
    rows = {r["gid"]: r for r in json.load(open(os.path.join(HERE, "roofs.json")))[area]}
    FP = json.load(open(os.path.join(HERE, "footprints.json")))[area]
    bb = src.bb; ny, nx = src.h.shape
    jj, ii = np.mgrid[0:ny, 0:nx]
    CXm = bb[0] + (ii+0.5)*CELL; CYm = bb[1] + (jj+0.5)*CELL
    lo, la = INV.transform(CXm.ravel(), CYm.ravel())
    WX = ((lo - LON0) * MPD * COSL).reshape(ny, nx)
    WY = ((la - LAT0) * MPD).reshape(ny, nx)
    B = np.zeros((ny, nx), np.float32)   # before
    A = np.zeros((ny, nx), np.float32)   # after
    ID = np.zeros((ny, nx), np.int32)     # which building each cell belongs to
    for bi, f in enumerate(FP, start=1):
        rx = np.asarray(f["rx"], float); ry = np.asarray(f["ry"], float)
        sub = (WX>=rx.min()-1)&(WX<=rx.max()+1)&(WY>=ry.min()-1)&(WY<=ry.max()+1)
        if not sub.any(): continue
        idx = np.where(sub)
        ins = MPath(np.c_[rx, ry]).contains_points(np.c_[WX[idx], WY[idx]])
        if not ins.any(): continue
        yy, xx = idx[0][ins], idx[1][ins]
        # BEFORE: one flat lid at the published height, which is the drawing today
        np.maximum.at(B, (yy, xx), np.float32(f["h"]))
        ID[yy, xx] = bi
        r = rows.get(f["gid"])
        if r is None:
            np.maximum.at(A, (yy, xx), np.float32(f["h"]))   # no scan: unchanged
            continue
        z = np.full(yy.shape, r["scan_h"], np.float32)
        if r["pitched"] and r["ridge_deg"] is not None:
            th = math.radians(r["ridge_deg"])
            ux, uy = -math.sin(th), math.cos(th)
            pw = (WX[yy,xx]-rx.mean())*ux + (WY[yy,xx]-ry.mean())*uy
            z = z + (np.abs(pw).max() - np.abs(pw)) * math.tan(math.radians(r["slope_deg"]))
        np.maximum.at(A, (yy, xx), z)
        for b in r["clutter"]:
            hw, hd = b["w"]/2, b["d"]/2
            bm = (CXm>=b["mx"]-hw)&(CXm<=b["mx"]+hw)&(CYm>=b["my"]-hd)&(CYm<=b["my"]+hd)
            if bm.any(): np.maximum.at(A, np.where(bm), np.float32(b["top"]))
    return B, A, ID


# ── the oblique renderer ───────────────────────────────────────────────────
SKY_T = np.array([214, 226, 236], np.float32)
SKY_B = np.array([236, 240, 243], np.float32)
GROUND = np.array([168, 166, 142], np.float32)
ROOF  = np.array([206, 204, 196], np.float32)
WALL  = np.array([150, 146, 138], np.float32)

def render(H, ID, azimuth=35.0, mpp=0.35, zpx=3.4, ydepth=0.62, up=2,
           sun=(-0.6, -0.45), crop=None):
    """
    H in metres on a square grid -> an oblique RGB view.

    Far row to near row, each column drawn from its own roof line down to its
    own ground line, nearer rows painting over farther ones. The first cut kept
    a y-buffer and ran the wall down to the bottom of the frame, so the very
    first row filled the whole image and the city vanished under it.
    """
    R = ndrotate(H, azimuth, reshape=True, order=1, mode="constant", cval=0.0)
    #  NEAREST for the identity grid: interpolating a building id invents
    #  buildings between two real ones, and thresholding the interpolated
    #  height was what fringed every roof edge with speckle.
    I = ndrotate(ID, azimuth, reshape=True, order=0, mode="constant", cval=0)
    if crop:
        a, b = crop
        ys, ye = int(R.shape[0]*a), int(R.shape[0]*b)
        xs, xe = int(R.shape[1]*a), int(R.shape[1]*b)
        R = R[ys:ye, xs:xe]; I = I[ys:ye, xs:xe]
    from scipy.ndimage import median_filter as _mf
    I = _mf(I, size=3)                    # drop the one-cell fringe
    R = np.repeat(np.repeat(R, up, 0), up, 1)
    I = np.repeat(np.repeat(I, up, 0), up, 1)
    ny, nx = R.shape
    cell = mpp / up
    gy, gx = np.gradient(R, cell)
    nrm = np.sqrt(1 + gx*gx + gy*gy)
    lit = np.clip(0.62 + 0.44*(-(gx*sun[0] + gy*sun[1]) / nrm), 0.3, 1.4)

    yd = ydepth * up * 0.5
    zp = zpx * up * 0.5
    H_PX = int(ny*yd + R.max()*zp) + 60
    base = H_PX - 24
    img = np.zeros((H_PX, nx, 3), np.float32)
    t = np.linspace(0, 1, H_PX)[:, None]
    img[:] = (SKY_T*(1-t) + SKY_B*t)[:, None, :]

    #  one stable colour per building, the same in both renders, so the only
    #  difference the eye can find between them is the geometry
    rng = np.random.default_rng(7)
    pal = np.array([[214,206,190],[200,196,186],[224,216,200],[190,190,186],
                    [212,198,178],[196,204,204],[226,220,206],[204,192,180],
                    [186,196,200],[218,210,196]], np.float32)
    key = (I.astype(np.int64) * 2654435761) >> 7
    tint = pal[key % len(pal)]
    built_all = I > 0
    for j in range(ny-1, -1, -1):                     # far row first
        yg = int(base - j*yd)                          # this row's ground line
        if yg < 0: continue
        tops = np.clip((yg - R[j]*zp).astype(np.int32), 0, H_PX-1)
        yg_c = min(yg, H_PX-1)
        b = built_all[j]
        face = np.where(b[:, None], tint[j], GROUND[None, :]) * lit[j][:, None]
        side = np.where(b[:, None], tint[j]*0.60, GROUND[None, :] * 0.70)
        for c in range(nx):
            a = tops[c]
            if a > yg_c: continue
            img[a:a+max(1, up), c] = face[c]           # the lit surface
            if yg_c > a + up: img[a+up:yg_c+1, c] = side[c]   # what holds it up
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


if __name__ == "__main__":
    import sys
    for area in ("sunset", "downtown"):
        B, A, ID = fields(area)
        n = min(B.shape)
        B, A, ID = B[:n, :n], A[:n, :n], ID[:n, :n]
        cr = (0.36, 0.63)          # one blockface, close enough to read
        zp = 4.2 if area == "sunset" else 1.0
        ib = render(B, ID, zpx=zp, crop=cr, up=4, ydepth=0.30)
        ia = render(A, ID, zpx=zp, crop=cr, up=4, ydepth=0.30)
        ib = ib.resize((ib.width//2, ib.height//2), Image.LANCZOS)
        ia = ia.resize((ia.width//2, ia.height//2), Image.LANCZOS)
        print('   panel', ib.size)
        h = max(ib.height, ia.height)
        out = Image.new("RGB", (ib.width + ia.width + 12, h), (28, 31, 36))
        out.paste(ib, (0, h-ib.height)); out.paste(ia, (ib.width+12, h-ia.height))
        out.save(os.path.join(HERE, f"{area}_beforeafter.png"))
        print(f"{area}: before max {B.max():.1f} m, after max {A.max():.1f} m -> {area}_beforeafter.png {out.size}")
