"""key_compare.py <K*.npy> <year> <canvas window x0,y0,x1,y1 of the npy> <crop x0,y0,x1,y1 (canvas px)> <out.jpg> [scale]:
the original key (compose_hard, fin3) | the consistent key K* | today, on one canvas crop, native or scaled."""
import sys, numpy as np
from PIL import Image
sys.path.insert(0, '/Users/daniel/code/qipu-render-work/eras2/transitions')
import stage as S
kp, y = sys.argv[1], sys.argv[2]; kw = [int(v) for v in sys.argv[3].split(',')]; c = [int(v) for v in sys.argv[4].split(',')]; out = sys.argv[5]
sc = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
K = np.load(kp, mmap_mode='r'); k = np.asarray(K[c[1] - kw[1]:c[3] - kw[1], c[0] - kw[0]:c[2] - kw[0]])
a = S.load_key(y, tuple(c)); b = S.load_key('now', tuple(c))
cells = [Image.fromarray(x) for x in (a, k, b)]
if sc != 1.0: cells = [im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS) for im in cells]
W, H = cells[0].size; Sh = Image.new('RGB', (W * 3 + 16, H), 'white')
for i, im in enumerate(cells): Sh.paste(im, (i * (W + 8), 0))
Sh.save(out, quality=90); print(out, Sh.size)
