"""CPU preview of roofs_dsm.py: the DSM hillshade of a box (engine m), the footprints
coloured by form (flat blue, gable orange, hip red, refused magenta) and the fitted ridges.
    CITY=vancouver python3 roofs_dsm_preview.py <dsm dir> <roofs.json> x0,y0,x1,y1 <out.png>"""
import glob, json, math, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import cityconf as C
import rasterio
from rasterio.merge import merge
from pyproj import Transformer
from PIL import Image, ImageDraw

dsm_dir, rf, bx, out = sys.argv[1], sys.argv[2], [float(v) for v in sys.argv[3].split(',')], sys.argv[4]
for k, v in C.CFG.get('env', {}).items(): os.environ.setdefault(k, str(v))
import city_data
recs = [b for b in city_data.buildings(bx[0], bx[1], bx[2], bx[3]) if bx[0] <= b['cx'] <= bx[2] and bx[1] <= b['cy'] <= bx[3]]
R = json.load(open(rf)); U = R.get('_unknown', {})
files = glob.glob(os.path.join(dsm_dir, '*.tif')); crs = rasterio.open(files[0]).crs
tr = Transformer.from_crs('EPSG:4326', crs, always_xy=True)
lon, lat = C.unproj(np.array([bx[0], bx[2]]), np.array([bx[1], bx[3]])); u, v = tr.transform(lon, lat)
wb = (min(u), min(v), max(u), max(v))
near = [p for p in files if (lambda e: e.left < wb[2] and e.right > wb[0] and e.bottom < wb[3] and e.top > wb[1])(rasterio.open(p).bounds)]
S, T = merge(near, bounds=wb, res=1.0, nodata=-32767); Z = S[0].astype(float); Z[Z < -1000] = np.nan
gy, gx = np.gradient(np.nan_to_num(Z, nan=np.nanmin(Z)))
az, alt = math.radians(315), math.radians(40)
sl = np.arctan(np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
hs = np.sin(alt) * np.cos(sl) + np.cos(alt) * np.sin(sl) * np.cos(az - aspect)
K = int(os.environ.get("K", 2)); H, W = Z.shape
im = Image.fromarray((np.clip(hs, 0, 1) * 255).astype(np.uint8)).convert('RGB').resize((W * K, H * K), Image.NEAREST); d = ImageDraw.Draw(im)
px = lambda uu, vv: [((x - wb[0]) * K, (wb[3] - y) * K) for x, y in zip(uu, vv)]
col = dict(flat='#3b82f6', gable='#f59e0b', hip='#ef4444')
for b in recs:
    a = np.asarray(b['ring'] + [b['ring'][0]], float); lo, la = C.unproj(a[:, 0], a[:, 1]); pu, pv = tr.transform(lo, la)
    r = R.get(str(b['gid'])); c = col[r[0]] if r else ('#d946ef' if str(b['gid']) in U else '#666666')
    d.line(px(pu, pv), fill=c, width=2)
    if r and r[0] in ('gable', 'hip'):
        cu, cv = np.mean(pu[:-1]), np.mean(pv[:-1]); t = math.radians(r[1]); L = 0.35 * math.sqrt(abs(np.sum(pu[:-1] * np.roll(pv[:-1], -1) - np.roll(pu[:-1], -1) * pv[:-1])) / 2)
        d.line(px([cu - L * math.cos(t), cu + L * math.cos(t)], [cv - L * math.sin(t), cv + L * math.sin(t)]), fill=c, width=4)
im.save(out); print('wrote', out, len(recs), 'footprints', im.size)
