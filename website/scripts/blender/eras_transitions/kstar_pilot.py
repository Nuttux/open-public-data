"""kstar_pilot.py <out dir> [jobs]: the consistent past keys (K*, GRAMMAR §6) of the WHOLE pilot (L7 frames 4-6 x 2-3), tile by
tile: per tile (an L8 frame + margins) the chain today -> 2006 -> 1985 -> 1959 -> 1938 (prep.py, K* only), then each year's core
cut into one memmap per year (canvas 30720 x 12288, origin = L7 frame 4:2), and the slider's order maps O_<Y> (the moment each
pixel switches from year Y to the next, GRAMMAR §7). Resumable: finished tiles are skipped."""
import sys, os, subprocess, json, time, numpy as np
from concurrent.futures import ThreadPoolExecutor
OUT = sys.argv[1]; JOBS = int(sys.argv[2]) if len(sys.argv) > 2 else 1; os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__)); X0C, W, H = -10240, 30720, 12288
YRS = ['2006', '1985', '1959', '1938']
MM = {y: np.lib.format.open_memmap(f'{OUT}/K_{y}.npy', mode='r+' if os.path.exists(f'{OUT}/K_{y}.npy') else 'w+', dtype=np.uint8, shape=(H, W, 3)) for y in YRS}
OM = {y: np.lib.format.open_memmap(f'{OUT}/O_{y}.npy', mode='r+' if os.path.exists(f'{OUT}/O_{y}.npy') else 'w+', dtype=np.uint8, shape=(H, W)) for y in YRS}
tiles = [(i, j) for j in range(4) for i in range(6)]            # L8 frames: 6 across (x -10240..20480), 4 down
def run(t):
    i, j = t; cx0, cy0 = X0C + i * 5120, j * 3072
    win = (cx0 - 400, max(0, cy0 - 400), cx0 + 5120 + 400, min(H, cy0 + 3072 + 900))
    D = f'{OUT}/t_{i}_{j}'; os.makedirs(D, exist_ok=True)
    if os.path.exists(f'{D}/done'): return t, 'skip'
    w = ','.join(map(str, win)); env = dict(os.environ, TR_NOPKL='1', TR_ORDER='1'); t0 = time.time()
    steps = [('2006', 'now', '-', f'{D}/K_2006.npy'), ('1985', '2006', f'{D}/K_2006.npy', f'{D}/K_1985.npy'),
             ('1959', '1985', f'{D}/K_1985.npy', f'{D}/K_1959.npy'), ('1938', '1959', f'{D}/K_1959.npy', f'{D}/K_1938.npy')]
    for a, b, bs, ao in steps:
        r = subprocess.run(['nice', 'python3', f'{HERE}/prep.py', a, b, w, f'{D}/x.pkl', bs, ao], env=env, capture_output=True, text=True)
        if r.returncode != 0: return t, 'FAILED ' + a + ' ' + r.stderr[-400:]
    for y in YRS:
        K = np.load(f'{D}/K_{y}.npy'); oy, ox = cy0 - win[1], cx0 - win[0]
        MM[y][cy0:cy0 + 3072, cx0 - X0C:cx0 - X0C + 5120] = K[oy:oy + 3072, ox:ox + 5120]; MM[y].flush()
        Or = np.load(f'{D}/O_{y}.npy'); OM[y][cy0:cy0 + 3072, cx0 - X0C:cx0 - X0C + 5120] = Or[oy:oy + 3072, ox:ox + 5120]; OM[y].flush()
        os.remove(f'{D}/K_{y}.npy'); os.remove(f'{D}/O_{y}.npy')
    open(f'{D}/done', 'w').write(f'{time.time() - t0:.0f}s'); return t, f'done {time.time() - t0:.0f}s'
with ThreadPoolExecutor(JOBS) as ex:
    for t, msg in ex.map(run, tiles): print(time.strftime('%H:%M:%S'), 'tile', t, msg, flush=True)
print('KSTAR_DONE', flush=True)
