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
ap = argparse.ArgumentParser(); ap.add_argument('--res', type=float, default=4.0); ap.add_argument('--sigma', type=float, default=3.0); a = ap.parse_args()
if C.CITY == 'sf': sys.exit('SF has its own coastline mask (tools/coastmask.py)')
sj = json.load(open(C.work('city', 'sea.json'))); sp = np.asarray(Image.open(C.work('city', 'sea.png')))[:, :, 0].astype(np.float32) / 255
sres = sj['w'] / sp.shape[1]
sea = cv2.GaussianBlur(sp, (0, 0), a.sigma / sres) > 0.5
k = int(round(a.res / sres)); ny, nx = sea.shape[0] // k, sea.shape[1] // k
sea_r = sea[:ny * k, :nx * k].reshape(ny, k, nx, k).mean((1, 3)) > 0.5
land = ~sea_r
sd = np.where(land, nd.distance_transform_edt(land), -nd.distance_transform_edt(~land)) * a.res
sd_dm = np.clip(np.round(sd * 10), -32000, 32000).astype(np.int16)
out = C.work('landmarks', 'coast_land.npz'); os.makedirs(os.path.dirname(out), exist_ok=True)
np.savez_compressed(out, land=np.packbits(land, axis=1), nx=np.int64(nx), ny=np.int64(ny), x0=np.float64(sj['ox']), y1=np.float64(sj['oy'] + sj['h']),
                    res=np.float64(a.res), sd_dm=sd_dm,
                    source=np.array(f'city/sea.png (water_mask.py), blurred {a.sigma} m, {a.res} m cells; land 1; sd_dm = signed distance to the line, decimetres, + on land'))
print('coast_land', out, 'nx', nx, 'ny', ny, 'land share', round(float(land.mean()), 3))
