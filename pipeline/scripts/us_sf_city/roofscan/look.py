"""Height above ground, rasterised and hillshaded. Does the scan see roofs?"""
import numpy as np, os, sys
from PIL import Image
from scipy.ndimage import median_filter, generic_filter
HERE = os.path.dirname(os.path.abspath(__file__))
CELL = float(os.environ.get("CELL", "0.25"))   # metres per pixel

def ground_surface(x, y, z, c, bb, cell=2.0):
    """coarse ground grid from class-2 returns, filled and smoothed"""
    nx = int((bb[2]-bb[0])/cell)+1; ny = int((bb[3]-bb[1])/cell)+1
    # +inf, NOT NaN: np.minimum propagates NaN, which silently voids the grid
    g = np.full((ny, nx), np.inf)
    m = c == 2
    ix = ((x[m]-bb[0])/cell).astype(int); iy = ((y[m]-bb[1])/cell).astype(int)
    ok = (ix>=0)&(ix<nx)&(iy>=0)&(iy<ny)
    np.minimum.at(g, (iy[ok], ix[ok]), z[m][ok])   # lowest ground return per cell
    g[np.isinf(g)] = np.nan
    # fill holes under buildings by nearest-valid iteration
    for _ in range(60):
        if not np.isnan(g).any(): break
        f = median_filter(np.nan_to_num(g, nan=0), size=3)
        cnt = median_filter((~np.isnan(g)).astype(float), size=3)
        fill = np.isnan(g) & (cnt > 0)
        g[fill] = f[fill]
    return np.nan_to_num(g, nan=np.nanmedian(g)), cell

def render(name):
    d = np.load(os.path.join(HERE, f"{name}.npz"))
    x, y, z, c, inten = d["x"], d["y"], d["z"], d["c"], d["i"]
    bb = d["bbox"]
    keep = (c != 7) & (c != 18)            # drop noise
    x, y, z, c, inten = x[keep], y[keep], z[keep], c[keep], inten[keep]
    G, gc = ground_surface(x, y, z, c, bb)
    gx = np.clip(((x-bb[0])/gc).astype(int), 0, G.shape[1]-1)
    gy = np.clip(((y-bb[1])/gc).astype(int), 0, G.shape[0]-1)
    h = z - G[gy, gx]                       # height above ground
    nx = int((bb[2]-bb[0])/CELL); ny = int((bb[3]-bb[1])/CELL)
    ix = ((x-bb[0])/CELL).astype(int); iy = ((y-bb[1])/CELL).astype(int)
    ok = (ix>=0)&(ix<nx)&(iy>=0)&(iy<ny)
    H = np.full((ny, nx), -1e9)
    np.maximum.at(H, (iy[ok], ix[ok]), h[ok])     # highest surface per pixel
    H[H < -1e8] = 0.0
    H = np.where(np.isfinite(H), H, 0.0)
    H = median_filter(H, size=3)
    print(f"\n=== {name} ===")
    print(f"  {len(x):,} points, height above ground: p50 {np.percentile(h,50):.1f} m, "
          f"p99 {np.percentile(h,99):.1f} m, max {h.max():.1f} m")
    for lo, hi, lbl in [(-1,0.5,"at ground"),(0.5,3,"low (kerb, cars, hedge)"),
                        (3,10,"1-3 storeys"),(10,25,"4-8 storeys"),(25,1e9,"tall")]:
        n = int(((h>=lo)&(h<hi)).sum()); print(f"    {lbl:<26} {100*n/len(h):5.1f}%")
    # hillshade the height field so relief reads
    zy, zx = np.gradient(H, CELL)
    az, alt = np.deg2rad(315.0), np.deg2rad(45.0)
    slope = np.arctan(np.hypot(zx, zy)); aspect = np.arctan2(-zx, zy)
    shade = (np.sin(alt)*np.cos(slope) + np.cos(alt)*np.sin(slope)*np.cos(az-aspect))
    shade = np.clip(shade, 0, 1)
    hn = np.clip(H/max(1.0, np.percentile(H, 99.5)), 0, 1)
    rgb = np.zeros((ny, nx, 3), np.uint8)
    base = 0.35 + 0.65*hn
    rgb[..., 0] = np.clip(255*base*(0.45+0.75*shade), 0, 255)
    rgb[..., 1] = np.clip(255*base*(0.47+0.75*shade), 0, 255)
    rgb[..., 2] = np.clip(255*base*(0.50+0.75*shade), 0, 255)
    Image.fromarray(np.flipud(rgb)).resize((nx*2, ny*2), Image.LANCZOS)\
         .save(os.path.join(HERE, f"{name}_relief.png"))
    print(f"  wrote {name}_relief.png  ({nx}x{ny} at {CELL} m/px)")

for n in (sys.argv[1:] or ["downtown", "sunset"]):
    render(n)
