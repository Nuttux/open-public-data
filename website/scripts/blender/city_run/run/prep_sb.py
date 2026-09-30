"""city/run/prep_sb.py: per super-block (or probe) inputs for the render pods and the AI cards. CPU only.
  jobs <SB>                 -> <SBD>/jobs_render.txt: the SB's own crops + its ring crops (the mosaic margin, rendered ONCE and reused by
                               the neighbour) that the crop registry lacks. Per crop: 'cb_i_j' beauty and (not for sea crops) 'cp_i_j'
                               passes (MASK/CLASS/GID: a separate job, GID_PASS in the beauty job paints the facades), BORDER 0,1,0,1.
  import <SB> <fetched dir> -> the pod outputs (render_sb.sh) into <ROOT>/crops/<i>_<j>.{jpg,class.png,mask.png,gid.png,part.png} (+ .sea
                               marker for beauty-only sea crops); checks size 5120 x 3072 and Tracebacks in the logs.
  windows <SB>              -> the AI windows: the SB's tile range split in 2 by rows (upper / lower half, 1 shared L8 each). Claims the
                               unclaimed AI tiles (<ROOT>/tiles/claims.json: a world tile is generated ONCE, first window wins), and per
                               window <SBD>/<w>/: R_<w>.jpg (mosaic of the tiles +- 1536 px from the crop registry, pre-toned CAMO=0 ROOFN=1),
                               R_<w>.json, P.txt (C9 lines; key RAIL_KEY (v8_rail5) on rail tiles else v5_dry; seed sha1('pilot:gx,gy')), SL8.json
                               (FIX-v6: nf9 1, nfkey nfC), sl8v.py (= sl8v_city.py: L8 prefill + resume), run_pyv.py, lr_run9.py
                               (= combo/block52/lr_run9_b8.py: FIX-v6 prompts + v8_rail4), l8pre_<w>.png (the neighbours' L8 from <ROOT>/l8/).
  probe <probe id>          -> <ROOT>/probes/<id>/: jobs_render.txt (partial crops: the probe tiles +- 1536 px), after the render the window
                               (same files as above, tiles NOT claimed: probe tiles never enter the registry) and geom.json for post_sb.py.
  --plan-only (any command) -> print what would be written, write nothing."""
import os, sys, json, math, hashlib, shutil, subprocess, fcntl, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import sb as SBm
from mos import Mos
W = '/Users/daniel/code/qipu-render-work'; ROOT = SBm.ROOT; S, TS, M = 640, 1024, 1536; CW, CH = SBm.CW, SBm.CH
LV = f'{W}/ai/look_regain/look_v6'; RUNNER = f'{W}/combo/block52/lr_run9_b8.py'
AREAS = json.load(open(f'{HERE}/areas.json')); PLAN_ONLY = '--plan-only' in sys.argv; ARGS = [a for a in sys.argv[1:] if a != '--plan-only']
SNAP = os.environ.get('CITY_SNAP', f'{W}/snap/city1')

def render_env():
    fa = os.environ.get('CITY_FA_FILE', f'{W}/snap/combo2/data/faithful/fa_table_v3.json'); rn = os.environ.get('CITY_RN_CROP', f'{W}/snap/combo2/data/faithful/rn_sf8.png')
    e = AREAS['render_env_all'].replace('@SNAP', SNAP).replace('@FA_FILE', fa).replace('@RN_CROP', rn)
    return (e + ' ' + os.environ.get('CITY_GATED', '')).strip()   # CITY_GATED: e.g. 'SE_DRAPE=1' once validated (areas.json render_env_gated)
def have_crop(i, j):
    b = f'{ROOT}/crops/{i}_{j}'; return os.path.exists(f'{b}.jpg') and (os.path.exists(f'{b}.sea') or os.path.exists(f'{b}.part.png'))

def cmd_jobs(sid):
    c0, c1, r0, r1 = SBm.sb_crops(sid); env = render_env(); L = []; n = dict(own=0, ring=0, have=0, sea=0)
    for j in range(max(0, r0 - 1), min(31, r1 + 1) + 1):
        for i in range(max(0, c0 - 1), min(31, c1 + 1) + 1):
            own = c0 <= i <= c1 and r0 <= j <= r1
            if have_crop(i, j): n['have'] += 1; continue
            kind = SBm.crop_kind(i, j)[0]; n['own' if own else 'ring'] += 1; n['sea'] += kind == 'sea'
            L.append(f'cb_{i}_{j} {i}:{j} 0,1,0,1 {env}')
            if kind != 'sea': L.append(f'cp_{i}_{j} {i}:{j} 0,1,0,1 {env} {AREAS["pass_env"].split(" (")[0]}')
    out = f'{ROOT}/sb/{sid}/jobs_render.txt'
    if not PLAN_ONLY: os.makedirs(os.path.dirname(out), exist_ok=True); open(out, 'w').write('\n'.join(L) + '\n')
    return dict(file=out, jobs=len(L), **n, lines=L)

def cmd_import(sid, src):
    os.makedirs(f'{ROOT}/crops', exist_ok=True); got = 0; bad = []
    for f in sorted(os.listdir(src)):
        if not f.startswith(('cb_', 'cp_')) or '_z9_' not in f: continue
        kind, rest = f[:2], f[3:]; ij, tail = rest.split('_z9_', 1); i, j = map(int, ij.split('_')); sfx = tail.split('.', 1)[1]
        if kind == 'cb' and sfx != 'jpg' or kind == 'cp' and sfx not in ('class.png', 'mask.png', 'gid.png', 'part.png'): continue
        if Image.open(f'{src}/{f}').size != (CW, CH): bad.append(f); continue
        if not PLAN_ONLY: shutil.copy(f'{src}/{f}', f'{ROOT}/crops/{i}_{j}.{sfx}')
        got += 1
        if kind == 'cb' and SBm.crop_kind(i, j)[0] == 'sea' and not PLAN_ONLY: open(f'{ROOT}/crops/{i}_{j}.sea', 'w').write('beauty only; passes synthesized (mos.py)\n')
    tb = [f for f in os.listdir(src) if f.endswith('.log') and 'Traceback' in open(f'{src}/{f}', errors='ignore').read()]
    print('IMPORT', sid, 'files', got, 'bad size', bad, 'tracebacks', tb); return not bad and not tb

def claims(update=None):
    f = f'{ROOT}/tiles/claims.json'; os.makedirs(os.path.dirname(f), exist_ok=True)
    with open(f + '.lock', 'w') as lk:
        fcntl.flock(lk, fcntl.LOCK_EX); C = json.load(open(f)) if os.path.exists(f) else {}
        if update and not PLAN_ONLY: C.update({k: v for k, v in update.items() if k not in C}); json.dump(C, open(f + '.tmp', 'w')); os.replace(f + '.tmp', f)
        return C
def rail_keys(tiles):
    sys.path.insert(0, f'{W}/combo/block52'); import rails_b8
    TH = next(r['RAIL_M'] for r in AREAS['key_rules'] if r['key'] == 'v8_rail4')
    # RAIL_KEY (30/09 b8 sweep): v8_rail5 (default) = rails only where the render shows them, other streets plain asphalt, NO vehicle
    # wording (rail4's VEHG invented buses / cars; b8 ran v5_dry everywhere and erased the F-line and T-line); RAIL_KEY=v8_rail4 = before
    K = os.environ.get('RAIL_KEY', 'v8_rail5')
    R = rails_b8.rail_len([t.replace('_', ',') for t in tiles]); return {t: (K if R[t.replace('_', ',')] >= TH else 'v5_dry') for t in tiles}
seed = lambda gx, gy: int(hashlib.sha1(f'pilot:{gx},{gy}'.encode()).hexdigest()[:8], 16)

def l8_prefill(T, out_png):
    """the window's L8 canvas frame (as sl8v: MX = min(xs)//1024*1024, origin (MX-512, MY-512) L9, scale 1/2) filled from <ROOT>/l8/*.jpg"""
    xs = [int(t.split('_')[0]) for t in T]; ys = [int(t.split('_')[1]) for t in T]
    AX = range(min(xs) // 1024 * 1024, max(xs) + 1024, 1024); AY = range(min(ys) // 1024 * 1024, max(ys) + 1024, 1024); MX, MY = AX[0], AY[0]
    cw, ch = (AX[-1] + 1024 - MX) // 2 + 512, (AY[-1] + 1024 - MY) // 2 + 512; n = 0; can = None
    for f in sorted(os.listdir(f'{ROOT}/l8')) if os.path.isdir(f'{ROOT}/l8') else []:
        if not f.endswith('.json'): continue
        m = json.load(open(f'{ROOT}/l8/{f}')); im = Image.open(f'{ROOT}/l8/{f[:-5]}.jpg'); px, py = (m['ox'] - (MX - 512)) // 2, (m['oy'] - (MY - 512)) // 2
        if px >= cw or py >= ch or px + im.width <= 0 or py + im.height <= 0: continue
        if can is None: can = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        can.paste(im.convert('RGBA'), (px, py)); n += 1
    if can is not None and not PLAN_ONLY: can.save(out_png)
    return n

def make_window(wdir, w, T, box, mos, keys):
    """T: tile keys 'gx_gy' of the window; box: the mosaic L9 box"""
    lines = ['#MOSAIC ' + w] + [f'C9:{t.replace("_", ",")} out/{w}/{t}.jpg - {keys[t]} {seed(*map(int, t.split("_")))}' for t in sorted(T, key=lambda k: tuple(map(int, k.split('_')))[::-1])]
    info = dict(window=w, tiles=len(T), keys={k: sum(1 for t in T if keys[t] == k) for k in set(keys[t] for t in T)}, mosaic=box, mosaic_mp=round((box[2] - box[0]) * (box[3] - box[1]) / 1e6))
    if PLAN_ONLY: return info
    os.makedirs(wdir, exist_ok=True); pt = f'{wdir}/pt'; os.makedirs(pt, exist_ok=True)
    Image.fromarray(mos.read(box)).save(f'{pt}/R.jpg', quality=96); Image.fromarray(mos.read(box, 'class.png')).save(f'{pt}/R.class.png', compress_level=1)
    json.dump(dict(ox=box[0], oy=box[1]), open(f'{pt}/meta.json', 'w'))
    subprocess.run(['python3', f'{W}/ai/look_regain/pretone_block.py', w, f'{wdir}/R_{w}.jpg'], env=dict(os.environ, CAMO='0', ROOFN='1', PT_DIR=pt), check=True)
    if os.environ.get('AUTO_REROLL', '1') == '1': shutil.copy(f'{pt}/R.class.png', f'{wdir}/C_{w}.png')   # the class map for autoreroll.py (30/09)
    shutil.rmtree(pt); json.dump(dict(ox=box[0], oy=box[1]), open(f'{wdir}/R_{w}.json', 'w'))
    open(f'{wdir}/P.txt', 'w').write('\n'.join(lines) + '\n'); json.dump(dict(jobs='P.txt', nf9=1, nfkey='nfC', out=w), open(f'{wdir}/SL8.json', 'w'))
    subprocess.run(['python3', f'{HERE}/mk_sl8v_city.py', f'{wdir}/sl8v.py'], check=True, stdout=subprocess.DEVNULL)
    shutil.copy(f'{LV}/run_pyv.py', wdir); shutil.copy(RUNNER, f'{wdir}/lr_run9.py')
    info['l8_prefill_from'] = l8_prefill(T, f'{wdir}/l8pre_{w}.png'); json.dump(info, open(f'{wdir}/window.json', 'w')); return info

def cmd_windows(sid):
    Q = SBm.sb_Q(sid); xs, ys = SBm.tile_range(Q); terr = os.environ.get('TERRAIN_AI') == '1'
    have = set(f[:-4] for f in os.listdir(f'{ROOT}/tiles') if f.endswith('.jpg')) if os.path.isdir(f'{ROOT}/tiles') else set()
    C = claims(); ai = [f'{x}_{y}' for y in ys for x in xs if SBm.tile_kind(x, y) == 'ai' or (terr and SBm.tile_kind(x, y) == 'terrain')]
    mine = [t for t in ai if t not in have and C.get(t, '').split('w')[0] in ('', sid)]
    mid = (Q[1] + Q[3]) // 2; halves = [[t for t in mine if int(t.split('_')[1]) + 512 < mid], [t for t in mine if int(t.split('_')[1]) + 512 >= mid]]
    keys = rail_keys(mine) if mine else {}; out = []; mos = None if PLAN_ONLY else Mos(ROOT)
    for k, T in enumerate(halves):
        if not T: continue
        w = f'{sid}w{k}'; tx = [int(t.split('_')[0]) for t in T]; ty = [int(t.split('_')[1]) for t in T]
        box = (min(tx) - M, min(ty) - M, max(tx) + TS + M, max(ty) + TS + M)
        claims({t: w for t in T}); out.append(make_window(f'{ROOT}/sb/{sid}/{w}', w, T, box, mos, keys))
    return dict(sb=sid, tiles_in_range=len(xs) * len(ys), ai=len(ai), already=len(ai) - len(mine), windows=out)

def probe_def(pid):
    for rk, r in AREAS['risks'].items():
        for p in r['probes']:
            if p['id'] == pid: return rk, r, p
    raise SystemExit(f'no probe {pid}')
def cmd_probe(pid):
    rk, r, p = probe_def(pid); sys.path.insert(0, f'{W}/combo/block52'); import rails_b8 as R
    x, y = p['l9'] if 'l9' in p else [float(v[0]) for v in R.l9(np.array([p['lat']]), np.array([p['lon']]))]
    nc, nr = p['tiles']; gx0 = int(round((x - nc * S / 2 - (TS - S) / 2) / S)) * S; gy0 = int(round((y - nr * S / 2 - (TS - S) / 2) / S)) * S
    T = [f'{gx0 + a * S}_{gy0 + b * S}' for b in range(nr) for a in range(nc)]
    box = (gx0 - M, gy0 - M, gx0 + (nc - 1) * S + TS + M, gy0 + (nr - 1) * S + TS + M); PD = f'{ROOT}/probes/{pid}'
    env = render_env(); jobs = []; pieces = []
    variants = [('', '')] + ([(v.replace('=', '').replace('_', '').lower(), v) for v in p['render_ab'].split('|')] if 'render_ab' in p else [])
    for j in range(box[1] // CH, (box[3] - 1) // CH + 1):
        for i in range(box[0] // CW, (box[2] - 1) // CW + 1):
            ax0, ax1 = max(box[0], i * CW), min(box[2], (i + 1) * CW); ay0, ay1 = max(box[1], j * CH), min(box[3], (j + 1) * CH)
            bd = f'{(ax0 - i * CW) / CW:.4f},{(ax1 - i * CW) / CW:.4f},{1 - (ay1 - j * CH) / CH:.4f},{1 - (ay0 - j * CH) / CH:.4f}'
            for tag, extra in variants[1:] or variants:
                pre = f'q{tag}_{pid.lower().replace("-", "")}'
                jobs.append(f'{pre}b_{i}_{j} {i}:{j} {bd} {env} {extra}'.rstrip()); jobs.append(f'{pre}p_{i}_{j} {i}:{j} {bd} {env} {extra} {AREAS["pass_env"].split(" (")[0]}'.rstrip())
            pieces.append((i, j, ax0, ay0, ax1 - ax0, ay1 - ay0))
    keys = rail_keys(T); info = dict(probe=pid, risk=rk, name=p['name'], l9=[int(x), int(y)], tiles=T, keys=keys, render_jobs=len(jobs), box=box, variants=[v for _, v in variants if v])
    geom = dict(Q=[gx0 + (TS - S) // 2, gy0 + (TS - S) // 2, gx0 + (nc - 1) * S + TS - (TS - S) // 2, gy0 + (nr - 1) * S + TS - (TS - S) // 2],
                xs=sorted({int(t.split('_')[0]) for t in T}), ys=sorted({int(t.split('_')[1]) for t in T}), kinds={t: 'ai' for t in T})
    info['variant_roots'] = [f'{PD}/{tag or "main"}' for tag, _ in (variants[1:] or variants)]
    if not PLAN_ONLY:
        os.makedirs(PD, exist_ok=True); open(f'{PD}/jobs_render.txt', 'w').write('\n'.join(jobs) + '\n'); json.dump(info | dict(pieces=pieces), open(f'{PD}/probe.json', 'w'))
        for vr in info['variant_roots']: os.makedirs(f'{vr}/sb/PROBE', exist_ok=True); json.dump(geom, open(f'{vr}/sb/PROBE/geom.json', 'w'))
    return info

def cmd_probe_import(pid, src):
    """the probe's pod outputs -> <PD>/<variant>/pc/<i>_<j>.* + pieces.json (a mini CITY_ROOT for post_sb.py PROBE)"""
    PD = f'{ROOT}/probes/{pid}'; P = json.load(open(f'{PD}/probe.json')); tagof = lambda f: f.split('_')[0][1:].replace(pid.lower().replace('-', ''), '')
    for vr in P['variant_roots']:
        tag = os.path.basename(vr); tag = '' if tag == 'main' else tag; pieces = []; os.makedirs(f'{vr}/pc', exist_ok=True)
        for i, j, x, y, w, h in P['pieces']:
            base = f'{vr}/pc/{i}_{j}'; pre = f'q{tag}_{pid.lower().replace("-", "")}'
            for sfx, f in (('jpg', f'{pre}b_{i}_{j}_z9_{i}_{j}.jpg'), ('class.png', f'{pre}p_{i}_{j}_z9_{i}_{j}.class.png'), ('mask.png', f'{pre}p_{i}_{j}_z9_{i}_{j}.mask.png'),
                             ('gid.png', f'{pre}p_{i}_{j}_z9_{i}_{j}.gid.png'), ('part.png', f'{pre}p_{i}_{j}_z9_{i}_{j}.part.png')):
                if not PLAN_ONLY: shutil.copy(f'{src}/{f}', f'{base}.{sfx}')
            pieces.append([base, x, y, w, h])
        if not PLAN_ONLY: json.dump(pieces, open(f'{vr}/pieces.json', 'w'))
    return dict(probe=pid, roots=P['variant_roots'])

def cmd_probe_window(pid):
    """one AI window per variant root (tiles never claimed: probe tiles stay in <vr>/tiles)"""
    PD = f'{ROOT}/probes/{pid}'; P = json.load(open(f'{PD}/probe.json')); out = []
    for vr in P['variant_roots']:
        pieces = [tuple(p) for p in json.load(open(f'{vr}/pieces.json'))] if os.path.exists(f'{vr}/pieces.json') else []
        mos = None if PLAN_ONLY else Mos(None, pieces); tag = os.path.basename(vr); w = f'P{pid.replace("-", "")}{tag}'[:24]
        out.append(make_window(f'{vr}/win', w, P['tiles'], tuple(P['box']), mos, P['keys']))
    return dict(probe=pid, windows=out)

if __name__ == '__main__':
    c = ARGS[0]
    r = (cmd_jobs(ARGS[1]) if c == 'jobs' else cmd_import(ARGS[1], ARGS[2]) if c == 'import' else cmd_windows(ARGS[1]) if c == 'windows' else cmd_probe(ARGS[1]) if c == 'probe'
         else cmd_probe_import(ARGS[1], ARGS[2]) if c == 'probe_import' else cmd_probe_window(ARGS[1]) if c == 'probe_window' else None)
    if isinstance(r, dict): print(json.dumps({k: (v if k != 'lines' else v[:2] + [f'... {len(v)} lines']) for k, v in r.items()}, indent=1)[:4000])
