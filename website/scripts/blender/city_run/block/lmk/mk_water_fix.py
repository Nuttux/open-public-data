"""mk_water_fix.py: the striped patch (and 2 black specks) on the water near the Stanley Park causeway: cloned clean sea (shifted copy of the surrounding painted water,
mean colour matched on a ring around the box). Writes patches/stripe_fix/{patch.png, alpha.png, canvas.json} (same format as the painted landmark patches)."""
import json, os
from lib import *
from scipy import ndimage as nd
H = os.environ.get('LMK_HOME', '/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/lmk')   # patches / jobs / out live on the SSD, not in git
BOXES = [((87060, 29815, 87350, 29975), (420, 0)), ((87815, 29560, 87905, 29610), (-180, 0)), ((86440, 29925, 86525, 29965), (200, 0))]   # L9 px (x0, y0, x1, y1), found on the painted tiles 13/10
CV = [86200, 29300, 88400, 30300]
cx0, cy0, cx1, cy1 = CV; cur = np.asarray(tiles(*CV)).astype(np.float32); patch = cur.copy(); al = np.zeros(cur.shape[:2], np.float32)
for (x0, y0, x1, y1), SHIFT in BOXES:
    bx, by = x0 - cx0, y0 - cy0; w, h = x1 - x0, y1 - y0
    ring = np.zeros(cur.shape[:2], bool); ring[by:by + h, bx - 28:bx + w + 28] = True; ring[by:by + h, bx - 8:bx + w + 8] = False   # same rows only: the sea banding runs horizontally
    src = np.roll(cur, (-SHIFT[1], -SHIFT[0]), (0, 1)); srcring = np.roll(ring, (-SHIFT[1], -SHIFT[0]), (0, 1))
    dmean = np.median(cur[ring], 0) - np.median(src[ring], 0)
    new = src[by - 6:by + h + 6, bx - 6:bx + w + 6] + dmean; patch[by - 6:by + h + 6, bx - 6:bx + w + 6] = new
    m = np.zeros(cur.shape[:2], np.float32); m[by:by + h, bx:bx + w] = 1; al = np.maximum(al, np.clip(nd.gaussian_filter(m, 9) * 2.2, 0, 1))
d = f'{H}/patches/stripe_fix'; os.makedirs(d, exist_ok=True)
Image.fromarray(patch.clip(0, 255).astype(np.uint8)).save(f'{d}/patch.png'); Image.fromarray((al * 255).astype(np.uint8)).save(f'{d}/alpha.png'); json.dump(dict(canvas=CV), open(f'{d}/canvas.json', 'w'))
out = (cur * (1 - al[..., None]) + patch * al[..., None]).clip(0, 255).astype(np.uint8)
x0, y0, x1, y1 = 86950, 29480, 88000, 30050
sb = Image.new('RGB', ((x1 - x0) * 2 + 10, y1 - y0), (255, 255, 255)); sb.paste(Image.fromarray(cur[y0 - cy0:y1 - cy0, x0 - cx0:x1 - cx0].astype(np.uint8)), (0, 0)); sb.paste(Image.fromarray(out[y0 - cy0:y1 - cy0, x0 - cx0:x1 - cx0]), (x1 - x0 + 10, 0))
os.makedirs(f'{H}/qa', exist_ok=True); sb.save(f'{H}/qa/stripe_fix_ba.jpg', quality=90); print('ok')
