"""Rebuild z8..z0 of a ckpt layer from its z9 webp tiles (2x2 children -> 1 parent, LANCZOS, transparent where no child).
python3 pyr_down.py <tiles_dir>"""
import sys, os, glob
from PIL import Image
T = sys.argv[1]
for z in range(8, -1, -1):
    kids = {}
    for p in glob.glob(f'{T}/{z + 1}/*/*.webp'):
        tx, ty = int(p.split('/')[-2]), int(os.path.basename(p)[:-5]); kids.setdefault((tx // 2, ty // 2), []).append((tx, ty, p))
    for (px, py), L in kids.items():
        im = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
        for tx, ty, p in L: im.paste(Image.open(p).convert('RGBA'), ((tx % 2) * 512, (ty % 2) * 512))
        os.makedirs(f'{T}/{z}/{px}', exist_ok=True); im.resize((512, 512), Image.LANCZOS).save(f'{T}/{z}/{px}/{py}.webp', quality=90)
    print('z', z, len(kids))
