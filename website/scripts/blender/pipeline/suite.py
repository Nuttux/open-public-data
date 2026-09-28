#!/usr/bin/env python3
"""pipeline/suite.py - THE AUTOMATIC TEST SUITE for a candidate AI recipe (pipeline agent 28/09; BAR 28/09 19:10 (4)-(5)).
One command (qipu-render-work/qa/run_suite.sh <spec.json>) -> ONE summary sheet (old | new + a short table) for Daniel.

Sets (frozen copies on the SD, suite/inputs/, made by `freeze`; the look agent's scratchpad originals are session-local):
  golden10  the 10 quick-check golden crops (r16 r18 r05 o01 o04 o06 o13 b03 r11 j02 = the fp8 A/B set: landmarks, known bugs, joins),
            52 C9 tiles, production prompt key + seed per tile, pre-toned base-render mosaics; assembled by golden_ai.py assemble
  win       the 3 patchiness windows of look v6 (w1 o07 park, w2 o08 backyards, w3 o05 FiDi; 5x5 world tiles each, 75 C9 tiles),
            assembled + overlap disagreement by win_asm.py (look v6)
  sample    (gated: Daniel's go on the first nightly run) a random ~10 % CITY SAMPLE, stratified by terrain, reproducible by seed:
            `suite.py sample --seed S` lists it (no GPU); `run --sample S` runs it
Every AI tile goes through pipeline/tiles.py: tiles already in the CAS with the same inputs are REUSED (the reference and repeated
candidates cost nothing); the rest runs on speed/gpu.py (PROVIDER=auto: Vast 5090 FP8=3, RunPod fallback), then is recorded.
Detectors per crop / window (metrics.py): flags (look_regain detectors.py SET v5 thresholds), land on water, sharpness
(Laplacian variance), colour hold per building (gid pass: median Lab of the output vs the AI input, dE <= 12), overlap disagreement.

  suite.py freeze                          copy the inputs + the production reference (prod_bf16) to the SD
  suite.py run <spec.json> [--no-gpu] [--keep] [--label pqa] [--ref NAME] [--sets golden10,win] [--sample SEED]
  suite.py set-ref <run name>              the reference ('old') for later runs (ONE precision per comparison: BAR 28/09 18:10)
  suite.py sample --seed S [--frac 0.10] [--stride 640]    list the city sample (strata, tiles, $ estimate); no GPU
"""
import sys, os, json, glob, shutil, subprocess, argparse, time, hashlib
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
P = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, P)
import tiles as TL, metrics as MX
RW = '/Users/daniel/code/qipu-render-work'; LR = f'{RW}/ai/look_regain'; GA = '/Volumes/DANI-SD-DRIVE2/look_regain/golden_ai'
SUITE = os.environ.get('PIPE_SUITE', '/Volumes/DANI-SD-DRIVE2/pipeline/suite'); IN = f'{SUITE}/inputs'
SCR = '/private/tmp/claude-501/-Users-daniel-code-qipu-render-work/e9f9d2cc-b809-495b-a48f-3182384413d2/scratchpad'
SHEETS = os.path.expanduser('~/Downloads/qipu-renders/live_ai/pipeline')
GPU = f'{RW}/speed/gpu.py'; RUNNER = f'{RW}/speed/vast/lr_run9v.py'
PB = f'{RW}/ai/pilot/blocks'; GC = {c['id']: c for c in json.load(open(f'{RW}/ai/golden/golden.json'))['crops']}
G10 = ['r16', 'r18', 'r05', 'o01', 'o04', 'o06', 'o13', 'b03', 'r11', 'j02']
SETS = {'golden10': dict(jobs=f'{IN}/golden10/jobs/GA_fp8_0.txt', mosaics=f'{IN}/golden10/mosaic'),
        'win': dict(jobs=f'{IN}/win/jobs/WIN.txt', mosaics=f'{IN}/win/mosaic')}
lg = lambda m: (open(f'{RW}/pipeline/agent.log', 'a').write(f"{time.strftime('%d/%m %H:%M')} suite: {m}\n"), print(m, flush=True))


def cfg():
    p = f'{SUITE}/suite.json'; return json.load(open(p)) if os.path.exists(p) else dict(ref='prod_bf16')


class Blocks:
    """any global L9 box of the pilot blocks' R.jpg / R.class.png / R.gid.png (black / 0 outside)"""
    def __init__(s): s.m = {b: json.load(open(f'{PB}/{b}/meta.json')) for b in sorted(os.listdir(PB)) if os.path.exists(f'{PB}/{b}/meta.json')}; s.c = {}
    def get(s, x0, y0, w, h, kind):
        f = {'render': 'R.jpg', 'class': 'R.class.png', 'gid': 'R.gid.png'}[kind]; out = Image.new('RGB', (w, h))
        for b, m in s.m.items():
            ox, oy = m['ox'], m['oy']; W_, H_ = Image.open(f'{PB}/{b}/{f}').size   # lazy: size only
            if not (x0 < ox + W_ and y0 < oy + H_ and x0 + w > ox and y0 + h > oy): continue
            k = (b, kind)
            if k not in s.c:
                if len(s.c) > 2: s.c.clear()
                s.c[k] = Image.open(f'{PB}/{b}/{f}').convert('RGB')
            im = s.c[k]
            out.paste(im.crop((max(x0, ox) - ox, max(y0, oy) - oy, min(x0 + w, ox + W_) - ox, min(y0 + h, oy + H_) - oy)), (max(0, ox - x0), max(0, oy - y0)))
        return out


# ---------- freeze ----------
def freeze(o):
    g = f'{IN}/golden10'; w = f'{IN}/win'
    for d in (f'{g}/jobs', f'{g}/gid', f'{w}/jobs', f'{w}/mosaic', f'{w}/render', f'{w}/class', f'{w}/gid', f'{IN}/ref_prod_bf16/golden10'): os.makedirs(d, exist_ok=True)
    if not os.path.exists(f'{g}/mosaic'): shutil.copytree(f'{GA}/fp8/mosaic', f'{g}/mosaic')
    shutil.copy(f'{GA}/fp8/jobs/GA_fp8_0.txt', f'{g}/jobs/'); shutil.copy(f'{GA}/fp8/manifest.json', f'{g}/manifest.json')
    os.makedirs(f'{GA}/suite10', exist_ok=True); shutil.copy(f'{GA}/fp8/manifest.json', f'{GA}/suite10/manifest.json')   # golden_ai assemble's tag dir
    for c in G10: shutil.copy(f'{GA}/fp8/cands/bf16_prod/{c}.png', f'{IN}/ref_prod_bf16/golden10/{c}.png')
    B = Blocks()
    for c in G10:
        x = GC[c]
        if not os.path.exists(f'{g}/gid/{c}.png'): B.get(x['x0'], x['y0'], x['w'], x['h'], 'gid').save(f'{g}/gid/{c}.png')
    s = f'{SCR}/win'
    for f in glob.glob(f'{s}/mosaic/R_w*'): shutil.copy(f, f'{w}/mosaic/')
    shutil.copy(f'{s}/jobs/WIN.txt', f'{w}/jobs/'); shutil.copy(f'{s}/windows.json', f'{w}/windows.json'); shutil.copy(f'{s}/win_asm.py', f'{w}/win_asm.py')
    W = json.load(open(f'{w}/windows.json'))
    for k, d in W.items():
        x0, y0 = d['gx0'] + 256, d['gy0'] + 256
        for kind in ('render', 'class', 'gid'):
            if not os.path.exists(f'{w}/{kind}/{k}.png'): B.get(x0, y0, 2560, 2560, kind).save(f'{w}/{kind}/{k}.png')
    # the production windows = look v6's 'base' (bf16 fix5b tiles, assembled by the same win_asm.py; metric of its asm/metric.json)
    r = f'{IN}/ref_prod_bf16/win'; os.makedirs(r, exist_ok=True)
    for k in W: shutil.copy(f'/Volumes/DANI-SD-DRIVE2/look_regain/look_v6/win/win_base/{k}.png', f'{r}/prod_bf16_{k}.png')
    mt = {}
    for l in open(f'{s}/asm/metric.json'):
        if l.strip(): mt.update(json.loads(l))
    json.dump({f'prod_bf16_{k}': mt[f'base_{k}'] for k in W}, open(f'{r}/metric.json', 'w')); open(f'{r}/metric.json', 'a').write('\n')
    if not os.path.exists(f'{SUITE}/suite.json'): json.dump(dict(ref='prod_bf16'), open(f'{SUITE}/suite.json', 'w'))
    lg(f'freeze: inputs -> {IN} (golden10 {len(G10)} crops, win 3 windows, ref prod_bf16)')


# ---------- run ----------
def gpu(*a, env=None):
    r = subprocess.run([sys.executable, GPU, *a], env=dict(os.environ, **(env or {})), capture_output=True, text=True)
    sys.stderr.write(r.stderr[-2000:]); return r


def run_tiles(spec_p, spec, sets, RD, o):
    """plan every set, reuse cached tiles, run the rest on one card; -> {set: tiles dir}, gpu info"""
    todo = {}; info = dict(gpu=None, tiles_run=0, tiles_reused=0, usd=0.0)
    for s in sets:
        S = SETS[s]; T = f'{RD}/{s}/tiles'; os.makedirs(T, exist_ok=True)
        a = argparse.Namespace(spec=spec_p, jobs=S['jobs'], mosaics=S['mosaics'], emit=None, link=None, card_strict=None)
        res, td, hit = TL.plan(a, quiet=True)
        for j in hit:
            d = f"{T}/{os.path.basename(j['out'])}"
            if not os.path.exists(d): shutil.copyfile(j['cas'], d)
        info['tiles_reused'] += len(hit); lg(f"plan {spec['name']} {s}: reuse {len(hit)}, run {len(td)} {res['why']}")
        if td: todo[s] = td
    if not todo: return info
    if o.no_gpu: lg(f"--no-gpu: {sum(map(len, todo.values()))} tiles NOT run (sets {','.join(todo)})"); info['missing'] = {k: len(v) for k, v in todo.items()}; return info
    if os.path.abspath(spec['runner']) != RUNNER: raise SystemExit(f"runner {spec['runner']}: the suite's card runs {RUNNER} (gpu.py); a custom runner is v2 (DESIGN.md)")
    st = f'{RW}/speed/gpus/{o.label}.json'; started = False
    if not (os.path.exists(st) and not json.load(open(st)).get('ended')):
        r = gpu('up', o.label, str(o.maxh), env=dict(FP8=str(spec.get('fp8', '3'))))
        if 'READY' not in r.stdout: raise SystemExit(f'gpu.py up failed: {r.stdout[-500:]}')
        started = True
    S_ = json.load(open(st)); info['gpu'] = f"{S_.get('gpu')} FP8={S_.get('fp8')} ({S_.get('provider')})"
    if str(S_.get('fp8')) != str(spec.get('fp8', '3')): lg(f"WARNING card FP8={S_.get('fp8')} != spec fp8={spec.get('fp8')}")
    t0 = time.time()
    try:
        for s, td in todo.items():
            S = SETS[s]; jd = f'{RD}/{s}/jobs'; os.makedirs(jd, exist_ok=True); jf = f"{jd}/{spec['name']}_{s}.txt"; ls = []; tag = None; mos = set()
            for j in td:
                if j['op'] == 'other': continue
                if j['tag'] != tag: tag = j['tag']; ls.append(f'#MOSAIC {tag}'); mos.add(tag)
                a = j['line'].split(); a[1] = f"out/{spec['name']}_{s}/{os.path.basename(j['out'])}"; ls.append(' '.join(a))   # own out path: the runner skips existing outputs
            open(jf, 'w').write('\n'.join(ls) + '\n')
            files = [f"{S['mosaics']}/{p}_{t}.{e}" for t in sorted(mos) for p, e in (('R', 'jpg'), ('R', 'json'), ('C', 'png')) if os.path.exists(f"{S['mosaics']}/{p}_{t}.{e}")]
            pull = f'{RD}/{s}/pull'; r = gpu('run', o.label, jf, pull, *files); print(r.stdout.strip()[-300:])
            n, new, miss = TL.record(argparse.Namespace(spec=spec_p, jobs=jf, mosaics=S['mosaics'], outs=pull, run=spec['name'], card=S_.get('gpu')))
            for p in glob.glob(f"{pull}/out/{spec['name']}_{s}/*.jpg"): shutil.copyfile(p, f"{RD}/{s}/tiles/{os.path.basename(p)}")
            info['tiles_run'] += n
            if miss: lg(f'WARNING {s}: {miss} tiles missing after the run')
    finally:
        info['gpu_s'] = round(time.time() - t0); info['usd'] = round(S_.get('dph', 0) * (time.time() - S_.get('t_start', t0)) / 3600, 2)
        if started and not o.keep: gpu('down', o.label, f"pipeline suite {spec['name']}"); lg(f"card {o.label} down (~${info['usd']})")
    return info


def assemble(spec, sets, RD):
    out = {}
    if 'golden10' in sets:
        T = f'{RD}/golden10/tiles'; n = spec['name']
        r = subprocess.run([sys.executable, f'{LR}/golden_ai.py', 'assemble', 'suite10', '--src', T, '--name', n, '--ids', ','.join(G10), '--allow-missing'], capture_output=True, text=True)
        print(r.stdout.strip()[-400:]); sys.stderr.write(r.stderr[-1500:])
        d = f'{RD}/golden10/crops'; os.makedirs(d, exist_ok=True)
        for c in G10:
            p = f'{GA}/suite10/cands/{n}/{c}.png'
            if os.path.exists(p): shutil.copyfile(p, f'{d}/{c}.png')
        out['golden10'] = d
    if 'win' in sets:
        d = f'{RD}/win/asm'; os.makedirs(d, exist_ok=True)
        subprocess.run([sys.executable, f'{IN}/win/win_asm.py', f'{IN}/win/windows.json', d, f"{spec['name']}={RD}/win/tiles"], check=True, capture_output=True)
        out['win'] = d
    return out


def measure(name, gdir, wdir, wprefix):
    """-> {crop/window id: metrics} (+ '_agg'); golden crops vs their AI input (mosaic), windows vs theirs"""
    M = {}
    if gdir:
        for c in G10:
            p = f'{gdir}/{c}.png'
            if not os.path.exists(p): continue
            x = GC[c]; mj = json.load(open(f'{IN}/golden10/mosaic/R_fp8_{c}.json'))
            inp = Image.open(f'{IN}/golden10/mosaic/R_fp8_{c}.jpg').convert('RGB').crop((x['x0'] - mj['ox'], x['y0'] - mj['oy'], x['x0'] - mj['ox'] + x['w'], x['y0'] - mj['oy'] + x['h']))
            M[c] = MX.all_metrics(Image.open(p).convert('RGB'), inp, Image.open(f'/Volumes/DANI-SD-DRIVE2/golden/crops/render/{c}.png').convert('RGB'),
                                  Image.open(f'/Volumes/DANI-SD-DRIVE2/golden/crops/class/{c}.png').convert('RGB'), Image.open(f'{IN}/golden10/gid/{c}.png').convert('RGB'))
    if wdir:
        W = json.load(open(f'{IN}/win/windows.json')); mt = {}
        for l in open(f'{wdir}/metric.json'):
            if l.strip(): mt.update(json.loads(l))
        for k, d in W.items():
            p = f'{wdir}/{wprefix}_{k}.png'
            if not os.path.exists(p): continue
            mj = json.load(open(f'{IN}/win/mosaic/R_{k}.json')); x0, y0 = d['gx0'] + 256, d['gy0'] + 256
            inp = Image.open(f'{IN}/win/mosaic/R_{k}.jpg').convert('RGB').crop((x0 - mj['ox'], y0 - mj['oy'], x0 - mj['ox'] + 2560, y0 - mj['oy'] + 2560))
            m = MX.all_metrics(Image.open(p).convert('RGB'), inp, Image.open(f'{IN}/win/render/{k}.png').convert('RGB'),
                               Image.open(f'{IN}/win/class/{k}.png').convert('RGB'), Image.open(f'{IN}/win/gid/{k}.png').convert('RGB'))
            m['disagree'] = mt.get(f'{wprefix}_{k}'); M[k] = m
    M['_agg'] = MX.aggregate(M); return M


def ref_dirs(ref):
    if ref == 'prod_bf16': return f'{IN}/ref_prod_bf16/golden10', f'{IN}/ref_prod_bf16/win', 'prod_bf16'
    R = f'{SUITE}/runs/{ref}'; return f'{R}/golden10/crops', f'{R}/win/asm', ref


def run(o):
    spec = TL.load_spec(o.spec); n = spec['name']; RD = f'{SUITE}/runs/{n}'; os.makedirs(RD, exist_ok=True)
    sets = o.sets.split(','); ref = o.ref or cfg()['ref']
    if o.sample is not None: raise SystemExit('the city sample runs only after Daniel\'s go on the first nightly run (BAR 28/09 19:10); `suite.py sample` lists it')
    lg(f"run {n} (recipe {spec['_h_recipe']}, fp8 {spec.get('fp8')}) sets {sets} vs ref {ref}")
    info = run_tiles(o.spec, spec, sets, RD, o)
    if info.get('missing'): json.dump(info, open(f'{RD}/info.json', 'w'), indent=1); print('tiles missing, no assembly:', info['missing']); return
    A = assemble(spec, sets, RD)
    new = measure(n, A.get('golden10'), A.get('win'), n)
    rg, rw, rp = ref_dirs(ref); rc = f'{SUITE}/ref_metrics_{ref}.json'
    old = json.load(open(rc)) if os.path.exists(rc) else measure(ref, rg if 'golden10' in sets else None, rw if 'win' in sets else None, rp)
    json.dump(old, open(rc, 'w'), indent=1)
    json.dump(dict(spec=n, recipe=spec['_h_recipe'], ref=ref, info=info, new=new, old=old), open(f'{RD}/metrics.json', 'w'), indent=1)
    import sheet
    out = sheet.make(n, ref, spec, info, new, old, A.get('golden10'), rg, A.get('win'), rw, rp)
    lg(f"DONE {n}: sheet {out}; tiles run {info['tiles_run']} reused {info['tiles_reused']} gpu {info.get('gpu')} ~${info['usd']}")


def set_ref(o):
    c = cfg(); c['ref'] = o.name; json.dump(c, open(f'{SUITE}/suite.json', 'w')); lg(f'reference -> {o.name}')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter); sp = ap.add_subparsers(dest='cmd', required=True)
    sp.add_parser('freeze')
    p = sp.add_parser('run'); p.add_argument('spec'); p.add_argument('--no-gpu', action='store_true'); p.add_argument('--keep', action='store_true')
    p.add_argument('--label', default='pqa'); p.add_argument('--maxh', default=1.5, type=float); p.add_argument('--ref'); p.add_argument('--sets', default='golden10,win'); p.add_argument('--sample', type=int)
    p = sp.add_parser('set-ref'); p.add_argument('name')
    p = sp.add_parser('sample'); p.add_argument('--seed', type=int, required=True); p.add_argument('--frac', type=float, default=0.10); p.add_argument('--stride', type=int, default=640)
    o = ap.parse_args()
    if o.cmd == 'sample':
        import sample; sample.main(o)
    else: {'freeze': freeze, 'run': run, 'set-ref': set_ref}[o.cmd](o)
