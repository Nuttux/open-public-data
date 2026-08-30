"""
HOW MUCH OF THE CHANGE IS GEOMETRY, AND HOW MUCH IS EVERYTHING ELSE.

Three panels of one blockface:
  1  before          flat lids at the published height — the drawing today
  2  shape only      the scan's roof shape and rooftop objects, same flat light
  3  shape + light   the same geometry with cast shadows, contact darkening and
                     the colour spread the renderer currently clamps to 2 %

Panel 2 is what the roof data buys on its own. Panel 3 is what it buys once the
things that make detail READ are also switched on. The gap between 2 and 3 is
the argument for doing the cheap work first.
"""
import os, math
import numpy as np
from PIL import Image
from scipy.ndimage import rotate as ndrotate, median_filter as mf
from iso import fields, CELL, SKY_T, SKY_B, GROUND

HERE = os.path.dirname(os.path.abspath(__file__))

PAL_TIGHT = np.array([[208,203,192],[201,198,190],[212,206,196],[198,197,192],
                      [206,200,190],[200,203,201],[210,205,195],[203,198,191]], np.float32)
# what SF actually is, and what the wall/roof tables are capable of once the
# +/-3.5 % clamp in facade.ts comes off
PAL_WIDE  = np.array([[226,214,190],[190,176,158],[212,196,178],[168,176,178],
                      [232,224,206],[176,152,132],[204,184,160],[150,158,160],
                      [238,230,214],[196,166,140],[164,172,166],[218,202,176]], np.float32)


def shadow(R, cell, sx=-0.62, sy=-0.5, elev=0.62, steps=90):
    """cast shadow over a height field: march toward the sun, keep the horizon"""
    n = math.hypot(sx, sy); sx, sy = sx/n, sy/n
    tan = math.tan(elev)
    sh = np.zeros_like(R)
    horiz = np.full_like(R, -1e9)
    for k in range(1, steps):
        dy, dx = int(round(k*sy)), int(round(k*sx))
        shifted = np.roll(np.roll(R, -dy, 0), -dx, 1)
        horiz = np.maximum(horiz, shifted - k*cell*tan)
    sh = (horiz > R + 0.15).astype(np.float32)
    return mf(sh, size=3)


def render(H, ID, azimuth=35.0, zpx=4.2, ydepth=0.30, up=4, crop=(0.36, 0.63),
           pal=PAL_TIGHT, lights=False):
    R = ndrotate(H, azimuth, reshape=True, order=1, mode="constant", cval=0.0)
    I = ndrotate(ID, azimuth, reshape=True, order=0, mode="constant", cval=0)
    a, b = crop
    ys, ye = int(R.shape[0]*a), int(R.shape[0]*b)
    xs, xe = int(R.shape[1]*a), int(R.shape[1]*b)
    R, I = R[ys:ye, xs:xe], mf(I[ys:ye, xs:xe], size=3)
    SH = shadow(R, CELL) if lights else np.zeros_like(R)
    R = np.repeat(np.repeat(R, up, 0), up, 1)
    I = np.repeat(np.repeat(I, up, 0), up, 1)
    SH = np.repeat(np.repeat(SH, up, 0), up, 1)
    ny, nx = R.shape
    cell = CELL / up
    gy, gx = np.gradient(R, cell)
    nrm = np.sqrt(1 + gx*gx + gy*gy)
    lit = np.clip(0.62 + 0.44*(-(gx*-0.6 + gy*-0.45) / nrm), 0.3, 1.4)
    if lights:
        lit = lit * (1.0 - 0.42*SH)                       # cast shadow
        # contact darkening: how much taller the neighbourhood is than this cell
        from scipy.ndimage import maximum_filter, uniform_filter
        occ = np.clip((uniform_filter(R, 13) - R) / 2.2, 0, 1)
        lit = lit * (1.0 - 0.30*occ)
    key = (I.astype(np.int64) * 2654435761) >> 7
    tint = pal[key % len(pal)]
    yd, zp = ydepth*up*0.5, zpx*up*0.5
    H_PX = int(ny*yd + R.max()*zp) + 60
    base = H_PX - 24
    img = np.zeros((H_PX, nx, 3), np.float32)
    t = np.linspace(0, 1, H_PX)[:, None]
    img[:] = (SKY_T*(1-t) + SKY_B*t)[:, None, :]
    built = I > 0
    for j in range(ny-1, -1, -1):
        yg = int(base - j*yd)
        if yg < 0: continue
        tops = np.clip((yg - R[j]*zp).astype(np.int32), 0, H_PX-1)
        yg_c = min(yg, H_PX-1)
        bj = built[j]
        face = np.where(bj[:, None], tint[j], GROUND[None, :]) * lit[j][:, None]
        side = np.where(bj[:, None], tint[j]*0.58, GROUND[None, :]*0.70)
        for c in range(nx):
            aa = tops[c]
            if aa > yg_c: continue
            img[aa:aa+up, c] = face[c]
            if yg_c > aa+up: img[aa+up:yg_c+1, c] = side[c]
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    return im.resize((im.width//2, im.height//2), Image.LANCZOS)


if __name__ == "__main__":
    for area, zp in (("sunset", 4.2), ("downtown", 1.0)):
        B, A, ID = fields(area)
        n = min(B.shape); B, A, ID = B[:n,:n], A[:n,:n], ID[:n,:n]
        panels = [
            ("today",            render(B, ID, zpx=zp, pal=PAL_TIGHT, lights=False)),
            ("+ roof shape",     render(A, ID, zpx=zp, pal=PAL_TIGHT, lights=False)),
            ("+ colour",         render(A, ID, zpx=zp, pal=PAL_WIDE,  lights=False)),
            ("+ shadow",         render(A, ID, zpx=zp, pal=PAL_WIDE,  lights=True)),
        ]
        panels = [p for _, p in panels]
        h = max(p.height for p in panels); w = sum(p.width for p in panels) + 24
        out = Image.new("RGB", (w, h), (28, 31, 36))
        x = 0
        for p in panels:
            out.paste(p, (x, h - p.height)); x += p.width + 12
        out.save(os.path.join(HERE, f"{area}_three.png"))
        print(f"{area}: wrote {area}_three.png {out.size}")
