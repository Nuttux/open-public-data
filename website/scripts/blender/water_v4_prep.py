"""water_v4_prep.py [out dir]: v4_depth.png (16-bit, R = sqrt(depth / 60 m), row 0 = north) + v4_depth.json (world frame) from
bathy_8m.npy (tools/bathy.py: USGS 3DEP topobathy 2 m, public domain, flattened cells filled), for water_v4.py. Default out = the
water dir water2_hq reads (WATER_DIR or /Users/daniel/code/qipu-render-work/water)."""
import json, os, sys, numpy as np
from PIL import Image
B = '/Users/daniel/code/qipu-render-work/landmarks/bathy_8m'
OUT = sys.argv[1] if len(sys.argv) > 1 else (os.environ.get('WATER_DIR') or '/Users/daniel/code/qipu-render-work/water')
q = json.load(open(B + '.json')); d = np.nan_to_num(np.load(B + '.npy').astype(np.float32), nan=0.0)
ny, nx = d.shape; DM = 60.0
v = np.sqrt(np.clip(d / DM, 0, 1)); Image.fromarray((v * 65535 + 0.5).astype(np.uint16)).save(os.path.join(OUT, 'v4_depth.png'))
x0, y1, r = q['x0'], q['y1'], q['res']
json.dump(dict(x0=x0, x1=x0 + nx * r, y0=y1 - ny * r, y1=y1, res=r, dmax=DM, source=q.get('source', '')), open(os.path.join(OUT, 'v4_depth.json'), 'w'))
print('v4_depth', nx, ny, 'frame', x0, y1 - ny * r, x0 + nx * r, y1, '->', OUT)
