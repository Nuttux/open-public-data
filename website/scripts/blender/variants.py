"""Render a grid of variants for side-by-side judgement.
usage: python3 variants.py <outdir> <w> <h> <spp> <locs,comma> '<json list of env dicts>'"""
import sys, json, os, subprocess
from PIL import Image, ImageDraw
S = '/private/tmp/claude-501/-Users-daniel-Desktop-dani-code-open-data-paris-open-public-data/2af8a356-3125-4a36-ad95-180e17e79d3a/scratchpad/blender'
B = '/Users/daniel/code/opd-render/website/scripts/blender'
out, W, H, spp, locs, vs = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5].split(','), json.loads(sys.argv[6])
os.makedirs(out, exist_ok=True); tiles = []
for vi, v in enumerate(vs):
    for l in locs:
        f = f'{out}/{l}_v{vi}.png'
        env = {**os.environ, 'SUN_AZ': '205', 'SUN_EL': '22', 'EXPO': '0.45', **{k: str(x) for k, x in v.items()}}
        r = subprocess.run(['blender', '-b', '-P', f'{B}/build_render.py', '--', l, 'photo', f, spp, str(W), str(H)], cwd=S, env=env, capture_output=True, text=True, timeout=1500)
        if not os.path.exists(f): print('FAILED', l, v, r.stdout[-800:]); continue
        subprocess.run(['python3', f'{B}/grade.py', f, f])
        tiles.append((f, f'v{vi} {l} {v}'))
cols = len(locs); rows = (len(tiles) + cols - 1) // cols
sh = Image.new('RGB', (W * cols, H * rows), 'white')
for i, (f, lab) in enumerate(tiles):
    x, y = (i % cols) * W, (i // cols) * H
    sh.paste(Image.open(f).convert('RGB'), (x, y)); ImageDraw.Draw(sh).text((x + 8, y + 6), lab, fill=(255, 255, 0))
sh.save(f'{out}/sheet.jpg', quality=88); print('sheet', len(tiles))
