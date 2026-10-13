"""composite.py <name> [attempt]: patch.png over the painted tiles inside mask + PAD with a soft rim -> out/<name>/comp.png (canvas) and qa/<name>_ba.jpg (before | after, native zoom)."""
import sys, json, os
from lib import *
from PIL import ImageFilter
H = os.path.dirname(os.path.abspath(__file__)); PAD, RIM = 3, 2
def alpha(mask, cover):
    from scipy import ndimage as nd
    m = nd.binary_dilation(mask, iterations=PAD) if PAD else mask
    a = nd.gaussian_filter(m.astype(np.float32), RIM) * 1.6; a = np.clip(a, 0, 1); a[m & nd.binary_erosion(m, iterations=RIM)] = 1.0
    return a * nd.gaussian_filter(nd.binary_erosion(cover, iterations=24).astype(np.float32), 8)
if __name__ == '__main__':
    n = sys.argv[1]; J = json.load(open(f'{H}/jobs/{n}/job.json')); cx0, cy0, cx1, cy1 = J['canvas']; PAD, RIM = J.get('pad', PAD), J.get('rim', RIM)
    mask = np.asarray(Image.open(f'{H}/jobs/{n}/mask.png')) > 0; patch = np.asarray(Image.open(f'{H}/out/{n}/patch.png').convert('RGB')).astype(np.float32); cover = np.asarray(Image.open(f'{H}/out/{n}/cover.png')) > 0
    cur = np.asarray(tiles(cx0, cy0, cx1, cy1)).astype(np.float32); a = alpha(mask, cover)[..., None]; comp = (cur * (1 - a) + patch * a).astype(np.uint8)
    Image.fromarray(comp).save(f'{H}/out/{n}/comp.png')
    if '--save' in sys.argv:   # accepted: keep the painted patch + soft alpha for rebuild_lmk_tiles.py
        d = f'{H}/patches/{n}'; os.makedirs(d, exist_ok=True); Image.fromarray(patch.astype(np.uint8)).save(f'{d}/patch.png'); Image.fromarray((a[..., 0] * 255).astype(np.uint8)).save(f'{d}/alpha.png')
        Image.open(f'{H}/jobs/{n}/mask.png').save(f'{d}/mask.png'); json.dump(dict(canvas=J['canvas'], subject=J['subject'], order=J.get('order', 0)), open(f'{d}/canvas.json', 'w'))
    ys, xs = np.nonzero(a[..., 0] > 0.02); x0, x1, y0, y1 = max(0, xs.min() - 40), min(comp.shape[1], xs.max() + 40), max(0, ys.min() - 40), min(comp.shape[0], ys.max() + 40)
    b, c = Image.fromarray(cur[y0:y1, x0:x1].astype(np.uint8)), Image.fromarray(comp[y0:y1, x0:x1]); w, h = b.size
    sb = Image.new('RGB', (w * 2 + 10, h), (255, 255, 255)); sb.paste(b, (0, 0)); sb.paste(c, (w + 10, 0)); os.makedirs(f'{H}/qa', exist_ok=True)
    sb.save(f'{H}/qa/{n}_ba.jpg', quality=88); b.save(f'{H}/qa/{n}_before.jpg', quality=90); c.save(f'{H}/qa/{n}_after.jpg', quality=90); print(n, sb.size)
