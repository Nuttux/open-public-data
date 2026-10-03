"""(city_run/block/b8.py: the block line for any city; CITY unset = SF. V = BLK_DIR, the block's Q / ckpt / sheet from V/block.json;
SF defaults = work_b14/b8.py of 03/10, the block52 helpers from this dir)
block_b8 Mac-side steps (launch_b8.sh calls them). V = this dir (SSD). Q = 102400..133120 x 24576..49152 (q_b8.py). No GPU here.
  python3 b8.py jobs       jobs_b8.txt (72 crops x beauty b8b_ + passes b8p_, env_b8.txt) + the two pod halves
  python3 b8.py check      every render output there (beauty jpg; passes class/mask/gid/part)
  python3 b8.py mosaic     blk/ = the AI's input mosaic (mosaic_b8.py: Q +- 1536, real margin crops, reflect above Q)
  python3 b8.py prep       pretone + the AI windows: ai_l8/ (the whole tile list, l8_only), ai_a/ + ai_b/ (halves, l8_from the shared L8)
  python3 b8.py estimate   AI card-hours and $ for the queued tiles + L8 anchors (BENCH_0929: 10.6 s/tile, 5.3 s/anchor on a 5090)
  python3 b8.py registry   CITY_ROOT = V/city for city/run/post_sb.py: crops/<i>_<j>.* (hard links), margin + top-strip pieces, tiles/, geom
  python3 b8.py publish    city layer z9 -> cloud/ckpt_block_b8/tiles (+ z8..z0), viewer entry (block_b8 | block52_v8), sheet, detect summary
"""
import sys, os, json, glob, shutil, subprocess, numpy as np
from PIL import Image, ImageDraw
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); V = os.environ.get('BLK_DIR') or HERE; W = '/Users/daniel/code/qipu-render-work'; B52 = HERE
sys.path.insert(0, B52); import q_b8 as G
sys.path.insert(0, os.path.dirname(HERE)); import citycfg as CC
BJ = json.load(open(f'{V}/block.json')) if os.path.exists(f'{V}/block.json') else {}   # Q, ckpt, note, sheet [[name, x, y]...], at, right
os.environ.setdefault('B8_TESTQ', ','.join(map(str, BJ['Q'])) if BJ else '66560,55296,87040,70656')   # block b14 (03/10, CITY_PLAN.md C2 (no freeway): Twin Peaks east + Noe Valley + Diamond Heights + upper Glen Canyon; I-280 / Glen Park left for after the ramp fix)
#   # block b9 (01/10, Daniel 'yes sure go b9 with haight'): b8's west neighbour, same top row, 2 rows further south for Haight-Ashbury / Buena Vista (Marina, Fort Mason, Aquatic Park, Russian Hill, Pacific Heights + Broadway, Japantown, Alamo Sq, Hayes Valley, Civic Center, the Panhandle, Haight & Ashbury)
if os.environ.get('B8_TESTQ'):   # dry runs on another Q (e.g. block52's, with v8's render): q_b8's grid recomputed for it
    import math
    G.Q = list(map(int, os.environ['B8_TESTQ'].split(','))); G.C0, G.C1, G.R0, G.R1 = G.Q[0] // G.CW, G.Q[2] // G.CW - 1, G.Q[1] // G.CH, G.Q[3] // G.CH - 1
    G.GX = range(math.ceil(G.Q[0] / G.S) - 1, math.ceil(G.Q[2] / G.S)); G.GY = range(math.ceil(G.Q[1] / G.S) - 1, math.ceil(G.Q[3] / G.S))
CK = os.environ.get('B8_CKPT', BJ.get('ckpt', 'block_b14'))
Q = G.Q; XS = [g * 640 for g in G.GX]; YS = [g * 640 for g in G.GY]; PAD = 1536; WIN = 'b8'

def jobs():
    env = open(f'{V}/env_b8.txt').read().strip(); L = []
    for i, j, bd in G.crops():
        L.append(f'b8b_{i}_{j} {i}:{j} {bd} {env}'); L.append(f'b8p_{i}_{j} {i}:{j} {bd} {env} MASK_PASS=only CLASS_PASS=1 GID_PASS=1')
    open(f'{V}/jobs_b8.txt', 'w').write('\n'.join(L) + '\n')
    for k in range(2): open(f'{V}/jobs_b8_{k}.txt', 'w').write('\n'.join(L[k::2]) + '\n')   # beauty + passes of a crop on different pods
    print('JOBS', len(L))

def check():
    miss = []
    for l in open(f'{V}/jobs_b8.txt'):
        if not l.strip(): continue
        L_ = l.split()[0]; i, j = L_.split('_')[1:3]; base = f'{V}/render/{L_}_z9_{i}_{j}'
        miss += [base + s for s in (['.jpg'] if L_.startswith('b8b_') else ['.class.png', '.mask.png', '.gid.png', '.part.png']) if not os.path.exists(base + s)]
    print('CHECK', len(miss), 'missing', miss[:6]); sys.exit(1 if miss else 0)

def missing():
    """jobs_missing.txt = the job lines of jobs_b8.txt whose outputs are missing; prints their count"""
    L = []
    for l in open(f'{V}/jobs_b8.txt'):
        if not l.strip(): continue
        L_ = l.split()[0]; i, j = L_.split('_')[1:3]; base = f'{V}/render/{L_}_z9_{i}_{j}'
        need = ['.jpg'] if L_.startswith('b8b_') else ['.class.png', '.mask.png', '.gid.png', '.part.png']
        if any(not os.path.exists(base + s_) for s_ in need): L.append(l if l.endswith('\n') else l + '\n')
    open(f'{V}/jobs_missing.txt', 'w').write(''.join(L)); print(len(L))

def mosaic():
    subprocess.run(['python3', f'{B52}/mosaic_b8.py', f'{V}/render', f'{V}/blk', 'b8b', 'b8p', ','.join(map(str, Q)), str(PAD), f'@{V}/jobs_b8.txt'], check=True)

def prep():
    json.dump(dict(Q=Q, xs=XS, ys=YS, ckpt=CK, win=WIN, out='B8L'), open(f'{V}/cfg.json', 'w'))
    subprocess.run(['python3', f'{B52}/prep_b8.py'], check=True, env=dict(os.environ, B8DIR=V, RAILKEY=os.environ.get('RAILKEY', CC.BLOCK['rail_key'])))   # -> V/ai (P.txt, R_b8.jpg, C_b8.png, water_tiles.json)
    A = f'{V}/ai'; T = [l for l in open(f'{A}/P.txt') if l.startswith('C9:')]
    xs = [int(l.split()[0][3:].split(',')[0]) for l in T]; ys = [int(l.split()[0][3:].split(',')[1]) for l in T]
    org = [min(xs) // 1024 * 1024, min(ys) // 1024 * 1024]            # sl8v's anchor origin of the WHOLE window (MX, MY)
    for d, part, cfg in (('ai_l8', T, dict(l8_only=1, out='B8L')), ('ai_a', T[0::2], dict(l8_from=f'l8_{WIN}.jpg', origin=org, out='B8A')),
                         ('ai_b', T[1::2], dict(l8_from=f'l8_{WIN}.jpg', origin=org, out='B8B'))):
        D = f'{V}/{d}'; os.makedirs(D, exist_ok=True)
        for f in (f'R_{WIN}.jpg', f'R_{WIN}.json', f'C_{WIN}.png', 'run_pyv.py', 'lr_run9.py'):
            if not os.path.exists(f'{D}/{f}'): os.link(f'{A}/{f}', f'{D}/{f}')
        shutil.copy(f'{B52}/sl8v_b8.py', f'{D}/sl8v.py')
        open(f'{D}/P.txt', 'w').write(f'#MOSAIC {WIN}\n' + ''.join(part)); json.dump(dict(jobs='P.txt', nf9=1, nfkey='nfC', **cfg), open(f'{D}/SL8.json', 'w'))
    json.dump(dict(origin_anchor=org, origin_l9=[org[0] - 512, org[1] - 512], tiles=len(T)), open(f'{V}/l8_origin.json', 'w'))
    print('PREP tiles', len(T), 'half a', len(T[0::2]), 'half b', len(T[1::2]), 'anchor origin', org)

def estimate():
    T = [l.split()[0][3:] for l in open(f'{V}/ai/P.txt') if l.startswith('C9:')]; xy = np.array([list(map(int, t.split(','))) for t in T])
    MX, MY = xy[:, 0].min() // 1024 * 1024, xy[:, 1].min() // 1024 * 1024; AX = range(MX, xy[:, 0].max() + 1024, 1024); AY = range(MY, xy[:, 1].max() + 1024, 1024)
    TX = np.c_[(xy[:, 0] - MX) // 2 + 256, (xy[:, 1] - MY) // 2 + 256]; na = 0
    for Y in AY:
        for X in AX:
            cx, cy = (X - MX) // 2, (Y - MY) // 2
            na += bool(((TX[:, 0] < cx + 1024) & (TX[:, 0] + 512 > cx) & (TX[:, 1] < cy + 1024) & (TX[:, 1] + 512 > cy)).any())
    h_l8 = na * 5.3 / 3600; h_t = len(T) * 10.6 / 3600; setup = 2 * 10 / 60
    card_h = h_l8 + h_t + setup; usd = card_h * float(os.environ.get('RATE', 0.65))
    json.dump(dict(tiles=len(T), anchors=na, l8_h=round(h_l8, 2), tiles_h=round(h_t, 2), card_h=round(card_h, 2), usd=round(usd, 2), a_h=round(h_l8 + h_t / 2 + 0.2, 2), b_h=round(h_t / 2 + 0.2, 2)), open(f'{V}/ai_estimate.json', 'w'))
    print(f'ESTIMATE tiles {len(T)} anchors {na}: L8 {h_l8:.2f} h + tiles {h_t:.2f} h + setups = {card_h:.2f} card-h = ${usd:.2f}; card A {h_l8 + h_t / 2 + 0.2:.2f} h, card B {h_t / 2 + 0.2:.2f} h')

def registry():
    R = f'{V}/city'; [os.makedirs(f'{R}/{d}', exist_ok=True) for d in ('crops', 'pieces', 'tiles', 'sb/b8')]; pieces = []
    for i, j, bd in G.crops():
        x0, x1, y0, y1 = map(float, bd.split(',')); full = bd == '0,1,0,1'; base = f'{R}/crops/{i}_{j}' if full else f'{R}/pieces/{i}_{j}'
        for src, sfx in ((f'{V}/render/b8b_{i}_{j}_z9_{i}_{j}.jpg', '.jpg'),) + tuple((f'{V}/render/b8p_{i}_{j}_z9_{i}_{j}{s}', s) for s in ('.class.png', '.mask.png', '.gid.png', '.part.png')):
            if not os.path.exists(base + sfx): os.link(src, base + sfx)
        if not full:
            w, h = Image.open(base + '.jpg').size; pieces.append([base, round(i * 5120 + x0 * 5120), round(j * 3072 + (1 - y1) * 3072), w, h])
    # above Q: the mosaic's reflected top strip (post_sb's halo reads up to 1024 px beyond the SB; no crop was rendered there)
    m = json.load(open(f'{V}/blk/meta.json')); top = f'{R}/pieces/top'
    for s in ('jpg', 'class.png', 'mask.png', 'gid.png', 'part.png'):
        if not os.path.exists(f'{top}.{s}'):
            a = Image.open(f'{V}/blk/R.{s}'); a.crop((0, 0, a.size[0], PAD)).save(f'{top}.{s}', **({'quality': 96} if s == 'jpg' else {}))
    pieces.append([top, m['ox'], m['oy'], Image.open(f'{top}.jpg').size[0], PAD]); json.dump(pieces, open(f'{R}/pieces.json', 'w'))
    n = 0
    for d in ('tiles_a', 'tiles_b'):
        for f in glob.glob(f'{V}/{d}/*_*.jpg'):
            t = f'{R}/tiles/{os.path.basename(f)}'
            if not os.path.exists(t): os.link(f, t); n += 1
    kinds = {k: 'render' for k in json.load(open(f'{V}/ai/water_tiles.json'))}
    json.dump(dict(Q=Q, xs=XS, ys=YS, kinds=kinds), open(f'{R}/sb/b8/geom.json', 'w'))
    print('REGISTRY crops', len(glob.glob(f'{R}/crops/*.jpg')), 'pieces', len(pieces), 'AI tiles', n, 'render tiles', len(kinds))

def publish():
    import fcntl
    R = f'{V}/city'; TD = f'{W}/cloud/ckpt_{CK}/tiles'
    # (30/09 evening) ATOMIC: the demo's tile server reads this dir live; deleting z9 then rebuilding in place showed a dark
    # placeholder tile on the demo page at 19:35 (34 The Embarcadero). Build the whole pyramid beside it, then swap the dirs.
    NEW, OLD = TD + '.new', TD + '.old'
    for d_ in (NEW, OLD):
        if os.path.exists(d_): shutil.rmtree(d_)
    os.makedirs(NEW); shutil.copytree(f'{R}/layer/tiles/9', f'{NEW}/9')
    subprocess.run(['python3', f'{B52}/pyr_down.py', NEW], check=True)
    if os.path.exists(TD): os.rename(TD, OLD)
    os.rename(NEW, TD)
    if os.path.exists(OLD): shutil.rmtree(OLD)
    CJ = f'{W}/cloud/viewer/checkpoints.json'
    with open(CJ + '.lock', 'w') as lk:
        fcntl.flock(lk, fcntl.LOCK_EX); L = [p for p in json.load(open(CJ)) if p.get('name') != CK]
        L.insert(0, dict(name=CK, tiles=f'../ckpt_{CK}/tiles', maxz=9, note=BJ.get('note', 'block b14 = Twin Peaks / Noe Valley / Diamond Heights (combo7 + block_overlay, autoreroll); z9 66560,55296,87040,70656')))
        json.dump(L, open(CJ + '.tmp', 'w'), indent=1); os.replace(CJ + '.tmp', CJ)
    sys.path.insert(0, f'{W}/faithful'); import fc
    C = [tuple(c) for c in BJ['sheet']] if 'sheet' in BJ else [('Twin Peaks summit', 69900, 55800), ('Christmas Tree Point', 70500, 56500), ('Portola & OShaughnessy', 71300, 61800), ('Glen Canyon Park', 76200, 66100), ('Upper Douglass dog park', 78100, 60900), ('Diamond Heights Safeway', 80000, 63300), ('Clipper & Diamond', 80000, 60400), ('Noe Valley Rec', 83300, 61400), ('Noe & 24th', 84600, 59100), ('b9 seam (y=55296)', 80000, 54800), ('b10 seam (x=87040)', 86200, 60000), ('b11 seam (x=66560)', 65800, 57000)]
    w, h = 1600, 1000; S = Image.new('RGB', (2 * w, (len(C) + 1) // 2 * h)); os.makedirs(f'{V}/crops', exist_ok=True)
    for k, (n, x, y) in enumerate(C):
        a = fc.layer_crop(CK, x, y, w, h); a.save(f'{V}/crops/{k + 1:02d}_{n.split("(")[0].strip().replace(" ", "_").replace("/", "")}.jpg', quality=93)
        S.paste(a, ((k % 2) * w, (k // 2) * h)); ImageDraw.Draw(S).text(((k % 2) * w + 10, (k // 2) * h + 8), f'{k + 1} {n} ({x},{y})', fill=(255, 255, 0))
    o = os.path.expanduser(f'~/Downloads/qipu-renders/live_ai/block52/{CK}.jpg'); S.save(o, quality=90); print('SHEET', o)
    D = [json.load(open(f)) for f in sorted(glob.glob(f'{R}/sb/b8/final/f_*.done'))]
    json.dump(D, open(f'{V}/detect_summary.json', 'w')); print('DETECT', sum(d.get('cells', 0) for d in D), 'cells,', sum(d.get('flagged', 0) for d in D), 'flagged')
    print(f"VIEWER http://127.0.0.1:8797/cloud/viewer/?left={CK}&right={BJ.get('right', 'block_b10')}&at={BJ.get('at', '77000,61000,5')}")

if __name__ == '__main__': globals()[sys.argv[1]]()
