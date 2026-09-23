"""USGS 3DEP bare-earth elevation (public domain) for the render, on the
render's own world frame: x = metres east, y = metres north of lon -122.438,
lat 37.76 (x = (lon + 122.438) * 111320 * cos 37.76°, y = (lat - 37.76) * 111320).

The world frame is linear in lon/lat, so a request in EPSG:4326 whose bbox is
a world tile comes back as a grid that is regular in world metres. Tiles of
T metres at RES metres a pixel, saved as float32 .npy under
/Users/daniel/code/qipu-render-work/landmarks/dem/<res>m/t_<i>_<j>.npy
(tile i covers x in [X0 + i*T, X0 + (i+1)*T), row 0 = NORTH edge).

source: https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer
(exportImage, bilinear; the service mosaics the best available 3DEP DEM,
1 m lidar over San Francisco and Marin).
usage: python3 fetch_dem.py [res=2] [x0 y0 x1 y1]
"""
import io, os, sys, time, urllib.request, urllib.parse
import numpy as np

KX = 111320 * 0.790582709628753; KY = 111320
RES = float(sys.argv[1]) if len(sys.argv) > 1 else 2.0
X0, Y0, X1, Y1 = [float(v) for v in sys.argv[2:6]] if len(sys.argv) > 5 else (-7200, -6200, 7600, 10000)
T = 2000.0                                               # metres a tile
OUT = f'/Users/daniel/code/qipu-render-work/landmarks/dem/{RES:g}m'
os.makedirs(OUT, exist_ok=True)
URL = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage'

def fetch(x0, y0, x1, y1, w, h):
    wq = int(round(h * (x1 - x0) / KX / ((y1 - y0) / KY)))
    q = dict(bbox=f'{x0 / KX - 122.438},{y0 / KY + 37.76},{x1 / KX - 122.438},{y1 / KY + 37.76}',
             bboxSR=4326, imageSR=4326, size=f'{wq},{h}', format='tiff', pixelType='F32',
             interpolation='RSP_BilinearInterpolation', noData=-9999, f='image')
    req = urllib.request.Request(URL + '?' + urllib.parse.urlencode(q), headers={'User-Agent': 'qipu-render/0.1'})
    b = urllib.request.urlopen(req, timeout=180).read()
    from PIL import Image
    a = np.asarray(Image.open(io.BytesIO(b)), dtype=np.float32)
    # the service keeps pixels SQUARE IN DEGREES (it widens a bbox whose
    # aspect disagrees with `size`), so the request is w x h with
    # w / h = dlon / dlat; the columns are then resampled to metres
    xs = (np.arange(w) + 0.5) / w * a.shape[1] - 0.5
    c0 = np.clip(np.floor(xs).astype(int), 0, a.shape[1] - 2); f = xs - c0
    return a[:, c0] * (1 - f) + a[:, c0 + 1] * f

def main():
    n = int(T / RES)
    ii = range(int(np.floor(X0 / T)), int(np.ceil(X1 / T)))
    jj = range(int(np.floor(Y0 / T)), int(np.ceil(Y1 / T)))
    for j in jj:
        for i in ii:
            p = f'{OUT}/t_{i}_{j}.npy'
            if os.path.exists(p): continue
            for attempt in range(4):
                try:
                    a = fetch(i * T, j * T, (i + 1) * T, (j + 1) * T, n, n)
                    np.save(p, a); print('ok', i, j, a.shape, float(np.nanmin(a)), float(np.nanmax(a)), flush=True); break
                except Exception as ex:
                    print('retry', i, j, ex, flush=True); time.sleep(5 * (attempt + 1))

if __name__ == '__main__':
    main()
