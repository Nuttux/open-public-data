"""pipeline/sample.py - the CITY SAMPLE of the test suite (Daniel 28/09: ~10 % of the city, spread over terrain types, ~$4 per run on the
Vast 5090 FP8=3 path, a different random sample each night, reproducible by seed). LISTS the sample; running it is gated (Daniel's go).

World grid: stride 640 (coordinator 28/09: equal to 512 in the blind seam check), tiles 1024 L9 px at gx, gy = k * 640; tiles > 95 % water
are the render (no AI; speed/tp/tp_skip.py rule). Per tile, from the whole-city L7 render (z7_present_0924_0735; water by the tp_skip colour
lookup trained on the pilot class maps) and the DataSF buildings (city_data, heights + DEM, projected like the map):
  stratum  shore     water >= 15 %
           downtown  a building >= 40 m in the tile
           park      <= 3 buildings and green (L7 px G > R + 8 and G > B + 4) >= 8 %   (parks, Presidio, Golden Gate Park)
           open      <= 3 buildings, not green (freeway / rail / port yards, beyond the county line)
           dense     >= 40 building centroids (row houses)
           resid     the rest (medium-density residential / mixed)
  (thresholds from the tile distributions of 28/09: green p90 0.14, buildings p50 7 / p90 53; stratum() recomputes them from the
  cached features, so a threshold change needs no new grid)
Sample = seeded, stratified: each stratum gets its share of the AI tiles, but at least MIN_SHARE of the sample; within a stratum uniform.
The cached grid (city_tiles_s640.json on the SD) makes a nightly draw instant. At run time the sample's JOB LINES are taken from the
city run's own job files (same prompt key / clauses / seed / mosaic = the production inputs), so the sample measures production.
"""
import os, sys, json, math, time
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
BL = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, BL)
Z7 = '/Volumes/DANI-SD-DRIVE2/qipu-render-work-backup/pyramid/z7_present_0924_0735'; PB = '/Users/daniel/code/qipu-render-work/ai/pilot/blocks'
SUITE = '/Volumes/DANI-SD-DRIVE2/pipeline/suite'; C = 32   # one cell = 32 L9 px = 8 L7 px
USD_PER_1K = 1.65; S_PER_TILE = 9.2; MIN_SHARE = 0.08


def colour_lookup():
    """P(water | L7 RGB bin) trained on the pilot blocks' class maps (= tp_skip.py)"""
    num = np.zeros(32 ** 3); den = np.zeros(32 ** 3)
    for b in ('4_2', '5_2', '6_2', '4_3', '5_3', '6_3'):
        m = json.load(open(f'{PB}/{b}/meta.json')); x0, y0, x1, y1 = m['block']; ox, oy = m['ox'], m['oy']
        c = np.asarray(Image.open(f'{PB}/{b}/R.class.png').convert('RGB').crop((x0 - ox, y0 - oy, x1 - ox, y1 - oy))) > 128
        t = (~c[..., 0] & ~c[..., 1] & c[..., 2]).astype(np.float32); t = t.reshape(t.shape[0] // 4, 4, t.shape[1] // 4, 4).mean((1, 3))
        i, j = map(int, b.split('_')); f = np.asarray(Image.open(f'{Z7}/f_z7_{i}_{j}.png').convert('RGB'))
        q = f.astype(np.int32) // 8; k = ((q[..., 0] * 32 + q[..., 1]) * 32 + q[..., 2]).ravel()
        num += np.bincount(k, t.ravel(), 32 ** 3); den += np.bincount(k, None, 32 ** 3)
    return np.where(den > 20, num / np.maximum(den, 1), 0.5)


def grid(stride=640):
    p = f'{SUITE}/city_tiles_s{stride}.json'
    if os.path.exists(p): return json.load(open(p))
    t0 = time.time(); P = colour_lookup()
    H, W = 8 * 3072 // 8, 8 * 5120 // 8   # cells (8 L7 px each)
    wat = np.zeros((H, W), np.float32); grn = np.zeros((H, W), np.float32); emp = np.zeros((H, W), np.float32)
    for i in range(8):
        for j in range(8):
            f = np.asarray(Image.open(f'{Z7}/f_z7_{i}_{j}.png').convert('RGBA')); q = f[..., :3].astype(np.int32) // 8
            w = (P[(q[..., 0] * 32 + q[..., 1]) * 32 + q[..., 2]] > 0.5).astype(np.float32)
            r, g, b = (f[..., k].astype(np.int16) for k in range(3)); gr = ((g > r + 8) & (g > b + 4)).astype(np.float32)
            e = (f[..., 3] < 8).astype(np.float32)
            red = lambda a: a.reshape(384, 8, 640, 8).mean((1, 3))
            wat[j * 384:(j + 1) * 384, i * 640:(i + 1) * 640] = red(w); grn[j * 384:(j + 1) * 384, i * 640:(i + 1) * 640] = red(gr)
            emp[j * 384:(j + 1) * 384, i * 640:(i + 1) * 640] = red(e)
    # buildings: centroid at mid-height, projected to L9 (the map's oblique view), -> cells
    os.environ.update(NEWB='1', FRESH='1', SOUTH='0'); os.environ.pop('ERA', None)
    import city_data, lm_dem, tiles as TL
    B = city_data.buildings(-20000, -20000, 20000, 20000); X = np.array([b['cx'] for b in B]); Y = np.array([b['cy'] for b in B]); Hh = np.array([b['h'] for b in B])
    Z = np.nan_to_num(lm_dem.sample_arr(X, Y)); cnt = np.zeros((H, W), np.float32); mh = np.zeros((H, W), np.float32)
    for x, y, z, h in zip(X, Y, Z, Hh):
        bx = TL.world_to_l9_box(x, y, x, y, z + h / 2, z + h / 2); cx, cy = int(bx[0] // C), int(bx[1] // C)
        if 0 <= cx < W and 0 <= cy < H: cnt[cy, cx] += 1; mh[cy, cx] = max(mh[cy, cx], h)
    from scipy import ndimage as nd
    ii = lambda a: np.cumsum(np.cumsum(np.pad(a, ((1, 0), (1, 0))), 0), 1)
    IW, IG, IE, IC = ii(wat), ii(grn), ii(emp), ii(cnt); T = 1024 // C; S = stride // C
    MH = nd.maximum_filter(mh, size=T, mode='constant')   # at (y + T/2, x + T/2): the max over the tile's cells [y, y + T)
    out = []
    for y in range(0, H - T + 1, S):
        for x in range(0, W - T + 1, S):
            box = lambda I: float(I[y + T, x + T] - I[y, x + T] - I[y + T, x] + I[y, x]) / (T * T)
            w, g, e = box(IW), box(IG), box(IE); n = box(IC) * T * T; h = float(MH[min(y + T // 2, H - 1), min(x + T // 2, W - 1)])
            if w + e > 0.95: continue   # open water / empty: the render, no AI
            st = stratum(w, g, n, h)
            out.append([x * C, y * C, st, round(w, 3), round(g, 3), int(n), round(h, 1)])
    res = dict(stride=stride, built=time.strftime('%Y-%m-%d %H:%M'), n_ai=len(out), cols=['gx', 'gy', 'stratum', 'water', 'green', 'n_bldg', 'max_h'], tiles=out)
    json.dump(res, open(p, 'w')); print(f'grid s{stride}: {len(out)} AI tiles in {time.time() - t0:.0f} s -> {p}')
    return res


def stratum(w, g, n, h):
    return 'shore' if w >= 0.15 else 'downtown' if h >= 40 else ('park' if g >= 0.08 else 'open') if n <= 3 else 'dense' if n >= 40 else 'resid'


def draw(G, seed, frac=0.10):
    rng = np.random.default_rng(seed); by = {}
    for t in G['tiles']: t[2] = stratum(*t[3:7]); by.setdefault(t[2], []).append(t)
    n = int(round(frac * G['n_ai'])); share = {k: max(len(v) / G['n_ai'], MIN_SHARE) for k, v in by.items()}; z = sum(share.values())
    pick = []
    for k, v in sorted(by.items()):
        m = min(len(v), int(round(n * share[k] / z))); idx = rng.choice(len(v), m, replace=False); pick += [v[i] for i in sorted(idx)]
    return pick, {k: len(v) for k, v in by.items()}


def main(o):
    G = grid(o.stride); pick, pop = draw(G, o.seed, o.frac)
    from collections import Counter
    cnt = Counter(t[2] for t in pick); h = len(pick) * S_PER_TILE / 3600
    # renders available today (the pilot L9 frames): the sample can only run there until the city render lands
    ren = sum(1 for t in pick if os.path.exists(f"/Users/daniel/code/qipu-render-work/ai/pilot/renders/f_z9_{t[0] // 5120}_{t[1] // 3072}.png"))
    out = f'{SUITE}/samples/sample_s{o.stride}_seed{o.seed}.json'; os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(dict(seed=o.seed, frac=o.frac, stride=o.stride, n=len(pick), strata=dict(cnt), population=pop, tiles=pick,
                   est=dict(gpu_h_5090=round(h, 2), usd=round(len(pick) * USD_PER_1K / 1000, 2)), renders_available_now=ren), open(out, 'w'))
    print(json.dumps(dict(seed=o.seed, n=len(pick), of=G['n_ai'], strata=dict(cnt), population=pop, est_usd=round(len(pick) * USD_PER_1K / 1000, 2),
                          est_5090_h=round(h, 2), renders_available_now=ren, out=out)))
