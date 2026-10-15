import sys, os, json, random
from lib import *
H = os.path.dirname(os.path.abspath(__file__)); names = sorted(d for d in os.listdir(f'{H}/patches') if os.path.exists(f'{H}/patches/{d}/alpha.png') and (d.startswith('fix5') or d.startswith('wh_')))
for seed in map(int, sys.argv[1:]):
    r = random.Random(seed); n = r.choice(names); cx0, cy0, cx1, cy1 = json.load(open(f'{H}/patches/{n}/canvas.json'))['canvas']
    a = np.asarray(Image.open(f'{H}/patches/{n}/alpha.png')); ys, xs = np.nonzero((a > 12) & (a < 243)); i = r.randrange(len(ys)); x, y = cx0 + int(xs[i]), cy0 + int(ys[i])
    T2 = '/Users/daniel/code/qipu-render-work/cloud/ckpt_van_city_today/tiles/9'
    im = tiles(x - 300, y - 225, x + 300, y + 225, T2); im.save(f'{H}/qa/rand_{seed}_{n}.jpg', quality=90); print(seed, n, x, y)
