import sys, json
sys.path.insert(0, '/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/lmk')
from lib import tiles
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS = None
B = '/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/work_ct_sc/blk'; OX, OY = 75264, 53760
c = json.load(open('/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/lmk/wh/cand.json'))
lo, hi, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
sel = sorted([x for x in c if lo <= x['area'] < hi], key=lambda x: -x['area'])
print(len(sel))
CELL = 360; cols = 4; rows = (len(sel) + cols - 1) // cols
S = Image.new('RGB', (cols * (CELL * 2 + 6), rows * (CELL + 4)), 'white')
for n, x in enumerate(sel):
    cx, cy = (x['x0'] + x['x1']) // 2, (x['y0'] + x['y1']) // 2; sz = max(x['x1'] - x['x0'], x['y1'] - x['y0']) + 300; sz = max(sz, 900)
    box = (cx - sz // 2, cy - sz // 2, cx + sz // 2, cy + sz // 2)
    r = Image.open(f'{B}/R.jpg').crop((box[0] - OX, box[1] - OY, box[2] - OX, box[3] - OY)).resize((CELL, CELL)); p = tiles(*box).resize((CELL, CELL))
    d = ImageDraw.Draw(r); d.text((4, 4), f"{n} {cx},{cy} a{x['area']//1000}k", fill=(255, 255, 0))
    px, py = (n % cols) * (CELL * 2 + 6), (n // cols) * (CELL + 4); S.paste(r, (px, py)); S.paste(p, (px + CELL, py))
S.save(out, quality=85)
