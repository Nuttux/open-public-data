"""coast_land_city.py (04/10 B2b, Vancouver pilot fix 5): landmarks/coast_land.npz for a city that has no OSM coastline
mask (SF's is tools/coastmask.py from natural=coastline). Here the land/water line is the render's own sea (city/sea.png,
water_mask.py, 2 m, row 0 = north), lightly blurred so the line is a curve, not the mask's triangle steps.

terrain_hq reads it (_coast: land bits + signed distance) to keep the water nodes within 20 m of the shore at the water
level and to lay the shore ON the line (_shore) — without it, the nodes next to the land sank to the sea floor and every
grid cell along the waterline stood as a lit grey slope (van_vp1: the 'grey lip' under the torn-paper edge).

  CITY=vancouver python3 coast_land_city.py [--res 4] [--sigma 3]"""
import os, sys, json, argparse
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cityconf as C
Image.MAX_IMAGE_PIXELS = None
ap = argparse.ArgumentParser(); ap.add_argument('--res', type=float, default=4.0); ap.add_argument('--sigma', type=float, default=3.0)
ap.add_argument('--sea', default=C.work('city')); ap.add_argument('--out', default=C.work('landmarks', 'coast_land.npz')); a = ap.parse_args()   # (FIX4) --sea / --out: a test scene dir
if C.CITY == 'sf': sys.exit('SF has its own coastline mask (tools/coastmask.py)')
sj = json.load(open(os.path.join(a.sea, 'sea.json'))); sp = np.asarray(Image.open(os.path.join(a.sea, 'sea.png')))[:, :, 0].astype(np.float32) / 255
sres = sj['w'] / sp.shape[1]
sea = cv2.GaussianBlur(sp, (0, 0), a.sigma / sres) > 0.5
k = int(round(a.res / sres)); ny, nx = sea.shape[0] // k, sea.shape[1] // k
sea_r = sea[:ny * k, :nx * k].reshape(ny, k, nx, k).mean((1, 3)) > 0.5
land = ~sea_r
x0g, y1g = float(sj['ox']), float(sj['oy'] + sj['h'])
ext = (C.CFG.get('dem') or {}).get('extent')
if ext:
    # (fix4 05/10) past the sea mask's square (+-9.1 km) the render grid still sees the North Shore and Richmond, where
    # terrain_hq had no line (land only above 3 m: Richmond's 1 m fields were sea): the engine's own land mask there
    # (base/landmask.bin: ESA WorldCover 2021 outside the city), on the same 4 m cells; inside the square unchanged
    lj = json.load(open(f"{C.CFG['engine']}/base/landmask.json"))
    LB = np.unpackbits(np.fromfile(f"{C.CFG['engine']}/base/landmask.bin", np.uint8).reshape(lj['h'], lj['rowBytes']), axis=1)[:, :lj['w']]
    wx0, wy0, wx1, wy1 = lj['world']
    pl = max(0, int(np.ceil((x0g - ext[0]) / a.res))); pr = max(0, int(np.ceil((ext[2] - (x0g + nx * a.res)) / a.res)))
    pt = max(0, int(np.ceil((ext[3] - y1g) / a.res))); pb = max(0, int(np.ceil(((y1g - ny * a.res) - ext[1]) / a.res)))
    NX, NY = nx + pl + pr, ny + pt + pb; gx0, gy1 = x0g - pl * a.res, y1g + pt * a.res
    X = gx0 + (np.arange(NX) + 0.5) * a.res; Y = gy1 - (np.arange(NY) + 0.5) * a.res
    ci = np.clip((X - wx0) / (wx1 - wx0) * (lj['w'] - 1), 0, lj['w'] - 1); rj = np.clip((Y - wy0) / (wy1 - wy0) * (lj['h'] - 1), 0, lj['h'] - 1)
    lf = cv2.GaussianBlur(LB.astype(np.float32), (0, 0), 1.0)          # the 6 x 9 m nodes, softened, bilinear
    from scipy.ndimage import map_coordinates
    RJ, CI = np.meshgrid(rj, ci, indexing='ij')
    big = map_coordinates(lf, [RJ, CI], order=1) > 0.5
    big[pt:pt + ny, pl:pl + nx] = land
    print('coast_land: extended', (nx, ny), '->', (NX, NY), 'with the engine landmask; outside land share', round(float(big.mean()), 3))
    land, nx, ny, x0g, y1g = big, NX, NY, gx0, gy1
sd = np.where(land, nd.distance_transform_edt(land), -nd.distance_transform_edt(~land)) * a.res
sd_dm = np.clip(np.round(sd * 10), -32000, 32000).astype(np.int16)
out = a.out; os.makedirs(os.path.dirname(out), exist_ok=True)
np.savez_compressed(out, land=np.packbits(land, axis=1), nx=np.int64(nx), ny=np.int64(ny), x0=np.float64(x0g), y1=np.float64(y1g),
                    res=np.float64(a.res), sd_dm=sd_dm,
                    source=np.array(f'city/sea.png (water_mask.py), blurred {a.sigma} m, {a.res} m cells (beyond its square: engine base/landmask, WorldCover); land 1; sd_dm = signed distance to the line, decimetres, + on land'))
print('coast_land', out, 'nx', nx, 'ny', ny, 'land share', round(float(land.mean()), 3))
