"""new_block.py — set up a block work dir for the block line (render_q.sh -> chain.sh -> ai_q.sh -> post_sb -> b8.py publish), any city.
CPU only. CITY unset = SF (the same files the b14 agent wrote by hand into work_b14/: block.json, env_b8.txt, overlay.txt, jobs).

  [CITY=vancouver] python3 new_block.py <work dir> <Q x0,y0,x1,y1 (L9 px, multiples of 5120 / 3072)> [ckpt name] [--snap NAME] [--dry]
     -> <dir>/block.json, env_b8.txt (citycfg render_env, the snapshot path filled in), overlay.txt, jobs_b8.txt (= jobs_order.txt),
        q/ logs/ render/, and prints the crop / job / AI-tile counts and the commands to launch.
  python3 new_block.py --grid [x0,y0,x1,y1]   the city's L9 crop grid (kinds from citycfg.outside + the engine land mask) and AI tiles"""
import json, math, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(HERE)); import citycfg as CC
import numpy as np

def snap_dir(sn):
    return f'{CC.W}/snap/{sn}' if CC.SF else f'{CC.W}/cities/{CC.CITY}/snap/{sn}'

def crop_kinds(Q=None, cell=256):
    """{(i, j): (kind, city_frac, water_frac)} over Q (default the whole canvas): sampled on a cell grid through the DEM, as sb.outside_mask"""
    x0, y0, x1, y1 = Q or (0, 0, CC.NCOL * CC.CW, CC.NROW * CC.CH)
    Y9, X9 = np.mgrid[y0 + cell / 2:y1:cell, x0 + cell / 2:x1:cell]
    lon, lat = CC.lonlat_of_l9(X9, Y9); out = CC.outside(lon, lat)
    wat = water(lon, lat)
    K = {}
    for j in range(y0 // CC.CH, y1 // CC.CH):
        for i in range(x0 // CC.CW, x1 // CC.CW):
            m = (X9 >= i * CC.CW) & (X9 < (i + 1) * CC.CW) & (Y9 >= j * CC.CH) & (Y9 < (j + 1) * CC.CH)
            c = float((~out[m] & ~wat[m]).mean()); w = float(wat[m].mean())
            K[(i, j)] = ('city' if c >= 0.005 else 'terrain' if 1 - w - c >= 0.005 else 'sea', round(c, 4), round(w, 4))
    return K, (X9, Y9, out, wat)

_LM = []
def water(lon, lat):
    """True on water: the engine's land mask (landmask.json/.bin), else nothing is water"""
    if CC.SF: raise SystemExit('SF: use sb.py (coverage.py from the render)')
    if not _LM:
        E = CC.J['engine']; M = json.load(open(f'{E}/base/landmask.json'))
        _LM.append((M, np.fromfile(f'{E}/base/landmask.bin', np.uint8)))
    M, A = _LM[0]   # 1 bit a node, row 0 = south, MSB first, rows padded to a byte, set = land; node (i, j) -> `world` linearly
    w, h = M['w'], M['h']; ex = M['world']; x, y = CC.world_of_lonlat(lon, lat)
    c = np.clip(np.rint((x - ex[0]) / (ex[2] - ex[0]) * (w - 1)).astype(int), 0, w - 1); r = np.clip(np.rint((y - ex[1]) / (ex[3] - ex[1]) * (h - 1)).astype(int), 0, h - 1)
    land = (A[r * M['rowBytes'] + c // 8] >> (7 - c % 8)) & 1 > 0
    return ~land

def ai_tiles(Q, X9, Y9, out, wat):
    """stride-640 1024-px tiles over Q (q_b8 GX/GY) that are not > 95 % water / outside (prep_b8's rule, from the class pass)"""
    S, TS = 640, 1024; GX = range(math.ceil(Q[0] / S) - 1, math.ceil(Q[2] / S)); GY = range(math.ceil(Q[1] / S) - 1, math.ceil(Q[3] / S))
    n = 0; bad = out | wat
    for gy in GY:
        for gx in GX:
            m = (X9 >= gx * S) & (X9 < gx * S + TS) & (Y9 >= gy * S) & (Y9 < gy * S + TS)
            if m.any() and bad[m].mean() <= 0.95: n += 1
    return n, len(GX) * len(GY)

def setup(d, Q, ck, sn, dry):
    S = snap_dir(sn); os.makedirs(d, exist_ok=True)
    for x in ('q/todo', 'q/done', 'q/fail', 'logs', 'render', 'tq', 'tiles_a', 'l8'): os.makedirs(f'{d}/{x}', exist_ok=True)
    bj = dict(city=CC.CITY, Q=Q, ckpt=ck, snapshot=sn, note=f'{CC.CITY} {ck} ({sn}); z9 {",".join(map(str, Q))}',
              at=f'{(Q[0] + Q[2]) // 2},{(Q[1] + Q[3]) // 2},5', right=CC.BLOCK.get('viewer_right') or ck,
              sheet=[[f'centre', (Q[0] + Q[2]) // 2, (Q[1] + Q[3]) // 2]])
    if os.path.exists(f'{d}/block.json'): bj = dict(bj, **json.load(open(f'{d}/block.json')))
    json.dump(bj, open(f'{d}/block.json', 'w'), indent=1)
    open(f'{d}/env_b8.txt', 'w').write(CC.render_env(S) + '\n')
    ov = CC.BLOCK['overlay']; open(f'{d}/overlay.txt', 'w').write(''.join(f'{ov}/{f}\n' for f in sorted(os.listdir(ov)) if f.endswith('.py')) if ov else '')
    subprocess.run(['python3', f'{HERE}/b8.py', 'jobs'], check=True, env=dict(os.environ, BLK_DIR=d))
    open(f'{d}/jobs_order.txt', 'w').write(open(f'{d}/jobs_b8.txt').read())
    print('BLOCK', d, 'Q', Q, 'ckpt', ck, 'snapshot', S, '(exists)' if os.path.isdir(S) else '(MISSING: make it first)')
    print('  render: BLK_DIR=%s zsh %s/launch_render.sh <npods> <watchdog h>' % (d, HERE))
    print('  AI:     BLK_DIR=%s zsh %s/launch_ai.sh' % (d, HERE))

if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--grid':
        Q = list(map(int, a[1].split(','))) if len(a) > 1 else None
        K, (X9, Y9, out, wat) = crop_kinds(Q)
        n = {k: sum(v[0] == k for v in K.values()) for k in ('city', 'terrain', 'sea')}
        cs = [k for k, v in K.items() if v[0] == 'city']
        print(json.dumps(dict(city=CC.CITY, Q=Q, crops=len(K), kinds=n,
                              city_cols=[min(i for i, _ in cs), max(i for i, _ in cs)] if cs else None,
                              city_rows=[min(j for _, j in cs), max(j for _, j in cs)] if cs else None)))
        if Q: print('AI tiles (ai, window)', ai_tiles(Q, X9, Y9, out, wat))
        sys.exit(0)
    sn = a[a.index('--snap') + 1] if '--snap' in a else CC.BLOCK['snapshot']
    pos = [x for i, x in enumerate(a) if not x.startswith('--') and (i == 0 or a[i - 1] != '--snap')]
    d, Q = os.path.abspath(pos[0]), list(map(int, pos[1].split(','))); ck = pos[2] if len(pos) > 2 else f'{CC.CITY}_{os.path.basename(d)}'
    assert Q[0] % CC.CW == 0 and Q[2] % CC.CW == 0 and Q[1] % CC.CH == 0 and Q[3] % CC.CH == 0, 'Q on the crop grid'
    setup(d, Q, ck, sn, '--dry' in a)
