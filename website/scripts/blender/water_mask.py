"""Land/water mask + distance to shore for one exported district.

The engine's water is an 8 m raster: its edge is a staircase. Rasterised at
2 m, blurred by ~8 m and re-thresholded, the shoreline comes out as a smooth
curve; a Euclidean distance transform then gives every water pixel its
distance to land, which the sea shader turns into shallow colour and foam.
Output: <dir>/sea.png (R = water, G = distance to shore, 0.5 m a step) and
<dir>/sea.json (the metres each pixel covers).
usage: python3 water_mask.py <scene_dir>
"""
import array, base64, json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import distance_transform_edt

D = sys.argv[1]
d = json.load(open(f'{D}/scene.json'))
x0, y0, x1, y1 = d['box']; PAD, RES = 500, 2.0
ox, oy = x0 - PAD, y0 - PAD
W, H = int((x1 - x0 + 2 * PAD) / RES), int((y1 - y0 + 2 * PAD) / RES)
img = Image.new('L', (W, H), 0); dr = ImageDraw.Draw(img)
n = 0
for m in d['meshes']:
    if m['layer'] != 'water' or m.get('instanced'): continue  # all three: the shore band and both open-water sheets
    p = array.array('f'); p.frombytes(base64.b64decode(m['pos']))
    for t in range(len(p) // 9):
        pts = [((p[t*9+k*3] - ox) / RES, H - (p[t*9+k*3+1] - oy) / RES) for k in range(3)]
        dr.polygon(pts, fill=255); n += 1
raw = np.asarray(img, dtype=np.uint8).copy()
# outside the exported box nothing was exported: carry the box's own edge
# outward, so a bay that runs off the frame keeps running
bx0, bx1 = int(PAD / RES), W - int(PAD / RES) - 1
by0, by1 = int(PAD / RES), H - int(PAD / RES) - 1
raw[:, :bx0] = raw[:, bx0:bx0 + 1]; raw[:, bx1 + 1:] = raw[:, bx1:bx1 + 1]
raw[:by0, :] = raw[by0:by0 + 1, :]; raw[by1 + 1:, :] = raw[by1:by1 + 1, :]
soft = np.asarray(Image.fromarray(raw).filter(ImageFilter.GaussianBlur(4)), dtype=np.float32) / 255
water = soft > 0.5
dist = distance_transform_edt(water) * RES                      # metres to land, 0 on land
edge = np.clip((soft - 0.5) * 6 + 0.5, 0, 1)                    # antialiased mask
out = np.zeros((H, W, 3), np.uint8)
out[..., 0] = (edge * 255).astype(np.uint8)
out[..., 1] = np.clip(dist * 2, 0, 255).astype(np.uint8)
Image.fromarray(out).save(f'{D}/sea.png')
json.dump({'ox': ox, 'oy': oy, 'w': W * RES, 'h': H * RES, 'triangles': n, 'water_share': float(water.mean())}, open(f'{D}/sea.json', 'w'))
print(D.split('/')[-1], 'water triangles', n, 'water share', round(float(water.mean()), 3))
