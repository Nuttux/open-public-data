"""parity_cmp.py <mac.png> <pod.png> <out_prefix> — mean abs diff (0-255, whole frame and 8x8 blocks of 1/8 res,
so noise averages out and a geometry/material/light difference stands out) + a 2x crop sheet (mac | pod) of the
worst block and of the centre."""
import sys, numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(np.float32)
b = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(np.float32)
o = sys.argv[3]; H, W, _ = a.shape
print(f'mean abs diff {np.abs(a - b).mean():.2f} /255 (per channel {np.abs(a - b).mean((0, 1)).round(2)}); mean mac {a.mean():.1f} pod {b.mean():.1f}')
s = lambda x: x.reshape(H // 8, 8, W // 8, 8, 3).mean((1, 3))
d8 = np.abs(s(a) - s(b)); print(f'at 1/8 res (noise averaged): mean {d8.mean():.2f}, p99 {np.percentile(d8.mean(2), 99):.1f}, max {d8.mean(2).max():.1f}')
blk = d8.mean(2); by, bx = np.unravel_index(np.argmax(blk), blk.shape); cy, cx = by * 8, bx * 8
for tag, (y, x) in (('worst', (cy, cx)), ('centre', (H // 2, W // 2))):
    y0 = int(min(max(y - 150, 0), H - 300)); x0 = int(min(max(x - 200, 0), W - 400))
    ca = Image.fromarray(a[y0:y0 + 300, x0:x0 + 400].astype(np.uint8)).resize((800, 600), Image.NEAREST)
    cb = Image.fromarray(b[y0:y0 + 300, x0:x0 + 400].astype(np.uint8)).resize((800, 600), Image.NEAREST)
    sh = Image.new('RGB', (1610, 600), 'white'); sh.paste(ca, (0, 0)); sh.paste(cb, (810, 0)); sh.save(f'{o}_{tag}_2x.png')
    print(f'{tag} crop at x{x0} y{y0} -> {o}_{tag}_2x.png (left mac, right pod)')
