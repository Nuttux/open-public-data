"""Cut the path-traced level-7 frames into the site's tile pyramid.

python3 tiles_build.py <frames_dir>[,<older_dir>…] <out_dir> [--upload gs://qipu-tiles/us/sf/city/render]

The frames are hq_city.py MODE=pyramid output: f_z7_<i>_<j>.png, 5120 x 3072
device px each, an 8 x 8 grid over the level-7 canvas (40960 x 24576). Each is
graded (grade.py), cut into 512 px WebP tiles at level 7, and every level
below is the 2 x 2 downsample of the one above — the pyramid shares one camera
(true heights), so unlike the captured pyramid no level needs its own render.
A frame not rendered yet leaves its tiles out, and the levels above show
transparent there, which the page's paper shows through.

index.json follows lib/citygl/tile-plane.ts (tile, dpr, ref, levels) and adds
`proj`: the heights the overlay must use to land on these pictures.
"""
import json, math, os, subprocess, sys, time
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
FR, OUT = sys.argv[1], sys.argv[2]
UP = sys.argv[sys.argv.index('--upload') + 1] if '--upload' in sys.argv else None
# --z: the level the frames were rendered at (hq_city MODE=pyramid Z=…): 7 for
# the present at 37 cm/px, 5 or 6 for the eras (f_z5_i_j.png, 2x2 frames)
ZTOP = int(sys.argv[sys.argv.index('--z') + 1]) if '--z' in sys.argv else 7
T, FW, FH = 512, 5120, 3072
PRE = f'f_z{ZTOP}_'
REF = dict(cx=241.427019126574, cy=707.0567508859249, scale=2 ** (round(math.log2(0.06898352692062097) * 24) / 24))
CA, SA = math.cos(math.radians(30)), 0.42
ZT = math.sqrt(2 * (CA ** 2 - SA ** 2))
band = lambda z: (lambda k: 0 if k < 1.826 else 1 if k < 5.77 else 2)(2 ** (z - 3))

os.makedirs(OUT, exist_ok=True)
graded = os.path.join(OUT, '_graded'); os.makedirs(graded, exist_ok=True)
# several passes, newest first: a frame comes from the newest pass that has it
src = {}
for fr in reversed(FR.split(',')):
    for fn in os.listdir(fr):
        if fn.startswith(PRE) and fn.endswith('.png'): src[fn] = os.path.join(fr, fn)
made = set()
for fn in sorted(src):
    i, j = (int(v) for v in fn[len(PRE):-4].split('_'))
    g = os.path.join(graded, fn)
    if not os.path.exists(g) or os.path.getmtime(g) < os.path.getmtime(src[fn]):
        subprocess.run(['python3', os.path.join(HERE, 'grade.py'), src[fn], g, '40', '12'], check=True)
    # incremental: a frame already cut since its last grade is left alone, so
    # a rebuild (and the rsync after it) only touches what changed
    cut = os.path.join(OUT, str(ZTOP), str(i * (FW // T)), f'{j * (FH // T)}.webp')
    if os.path.exists(cut) and os.path.getmtime(cut) >= os.path.getmtime(g):
        made.update((i * (FW // T) + tx, j * (FH // T) + ty) for tx in range(FW // T) for ty in range(FH // T))
        continue
    im = Image.open(g).convert('RGB')
    for ty in range(FH // T):
        for tx in range(FW // T):
            X, Y = i * (FW // T) + tx, j * (FH // T) + ty
            d = os.path.join(OUT, str(ZTOP), str(X)); os.makedirs(d, exist_ok=True)
            im.crop((tx * T, ty * T, (tx + 1) * T, (ty + 1) * T)).save(os.path.join(d, f'{Y}.webp'), 'WEBP', quality=80, method=5)
            made.add((X, Y))
    print('frame', i, j, flush=True)

# `full`: tiles with no hole. A tile whose four children all exist can still
# be half empty (a child at the edge of the rendered area), and saving it
# without alpha would paint that half black.
have, full = {ZTOP: made}, {ZTOP: made}
for z in range(ZTOP - 1, -1, -1):
    up = have[z + 1]; cur = set(); full[z] = set()
    for (X, Y) in {(x // 2, y // 2) for x, y in up}:
        out = os.path.join(OUT, str(z), str(X), f'{Y}.webp')
        kids = [os.path.join(OUT, str(z + 1), str(2 * X + dx), f'{2 * Y + dy}.webp')
                for dx in (0, 1) for dy in (0, 1) if (2 * X + dx, 2 * Y + dy) in up]
        opaque = all((2 * X + dx, 2 * Y + dy) in full[z + 1] for dx in (0, 1) for dy in (0, 1))
        if os.path.exists(out) and os.path.getmtime(out) >= max(os.path.getmtime(k) for k in kids):
            cur.add((X, Y))
            if opaque: full[z].add((X, Y))
            continue
        tile = Image.new('RGBA', (T, T), (0, 0, 0, 0))
        for dx in (0, 1):
            for dy in (0, 1):
                if (2 * X + dx, 2 * Y + dy) not in up: continue
                src = Image.open(os.path.join(OUT, str(z + 1), str(2 * X + dx), f'{2 * Y + dy}.webp')).convert('RGBA')
                tile.paste(src.resize((T // 2, T // 2), Image.LANCZOS), (dx * T // 2, dy * T // 2))
        d = os.path.join(OUT, str(z), str(X)); os.makedirs(d, exist_ok=True)
        if opaque: full[z].add((X, Y))
        (tile.convert('RGB') if opaque else tile).save(os.path.join(d, f'{Y}.webp'), 'WEBP', quality=80, method=5)
        cur.add((X, Y))
    have[z] = cur
    print('level', z, len(cur), 'tiles', flush=True)

levels = {}
for z in range(ZTOP + 1):
    f = 2 ** (z - 3); pw, ph = round(2560 * f), round(1536 * f)
    levels[str(z)] = dict(band=band(z), scale=REF['scale'] * f, tiles=[math.ceil(pw / T), math.ceil(ph / T)], px=[pw, ph])
# v: the build. The page puts it on every tile URL, so a rebuilt tile shows as
# soon as the index (5 min) does, past the day the CDN keeps the old one
json.dump(dict(tile=T, dpr=2, ref=REF, levels=levels, proj=dict(zex=ZT, zexb=ZT, sA=SA),
               v=time.strftime('%m%d%H%M')),
          open(os.path.join(OUT, 'index.json'), 'w'), indent=1)
n = sum(len(v) for v in have.values())
print('pyramid', n, 'tiles', flush=True)

if UP:
    # tiles: a day in the browser (the look is still being improved); index: 5 min
    subprocess.run(['gsutil', '-q', '-m', '-h', 'Cache-Control:public,max-age=86400', '-h', 'Content-Type:image/webp',
                    'rsync', '-r', '-x', r'(_graded/.*|index\.json)$', OUT, UP], check=True)
    subprocess.run(['gsutil', '-q', '-h', 'Cache-Control:public,max-age=300', '-h', 'Content-Type:application/json',
                    'cp', os.path.join(OUT, 'index.json'), UP + '/index.json'], check=True)
    print('uploaded to', UP, flush=True)
