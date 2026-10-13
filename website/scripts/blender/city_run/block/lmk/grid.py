import sys
from lib import *
from PIL import ImageDraw
def grid(src, x0, y0, x1, y1, out, step=100):
    im = (tiles(x0, y0, x1, y1) if src == 'p' else blk('R.jpg', x0, y0, x1, y1)).convert('RGB'); d = ImageDraw.Draw(im)
    for x in range((x0 // step + 1) * step, x1, step): d.line([(x - x0, 0), (x - x0, y1 - y0)], fill=(255, 255, 0) if x % 500 else (255, 0, 0), width=1); d.text((x - x0 + 2, 2), str(x), fill=(255, 255, 255))
    for y in range((y0 // step + 1) * step, y1, step): d.line([(0, y - y0), (x1 - x0, y - y0)], fill=(255, 255, 0) if y % 500 else (255, 0, 0), width=1); d.text((2, y - y0 + 2), str(y), fill=(255, 255, 255))
    im.save(out, quality=88)
if __name__ == '__main__': grid(sys.argv[1], *map(int, sys.argv[2:6]), sys.argv[6])
