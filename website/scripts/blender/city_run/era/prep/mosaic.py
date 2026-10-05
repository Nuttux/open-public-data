# mosaic.py (qhprep): the qh core of ONE key year cropped from a render mosaic (blk/: meta.json ox, oy; R.jpg untoned beauty, R.class.png)
# -> years/<Y>/R.npy (raw untoned core), Cc.npy (class code 0..7), R_small.jpg, src.json        usage: python3 mosaic.py <Y> <blk dir>
import sys, json, os, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import common as CM
def code(c): c = c > 128; return (c[..., 0] * 4 + c[..., 1] * 2 + c[..., 2]).astype(np.uint8)
if __name__ == '__main__':
    Y, B = int(sys.argv[1]), sys.argv[2].rstrip('/'); m = json.load(open(f'{B}/meta.json')); D = CM.YD + f'{Y}/'; os.makedirs(D, exist_ok=True)
    x0, y0 = CM.O[0] - m['ox'], CM.O[1] - m['oy']; box = (x0, y0, x0 + CM.W, y0 + CM.H); out = {}
    for f in ('R.jpg', 'R.class.png'):
        im = Image.open(f'{B}/{f}'); assert x0 >= 0 and y0 >= 0 and box[2] <= im.size[0] and box[3] <= im.size[1], (f, im.size, box)
        out[f] = np.asarray(im.crop(box).convert('RGB')); del im
    np.save(D + 'R.npy', out['R.jpg']); cc = code(out['R.class.png']); np.save(D + 'Cc.npy', cc)
    json.dump(dict(src=B, meta=m, box=box), open(D + 'src.json', 'w'))
    Image.fromarray(out['R.jpg']).resize((1024, 717), Image.LANCZOS).save(D + 'R_small.jpg', quality=85)
    print(Y, 'core', out['R.jpg'].shape, 'from', B, 'box', box, '| classes', np.bincount(cc.ravel(), minlength=8))
