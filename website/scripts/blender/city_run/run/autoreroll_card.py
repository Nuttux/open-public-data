#!/usr/bin/env python3
"""city_run/run/autoreroll_card.py: ONE card runs re-roll chunks (rrq.py = sl8q.py + a per-chunk noise key) for autoreroll.py.
  python3 autoreroll_card.py <label (NEW each run)> <win dir> <l8 jpg> <origin x,y> <chunk dir> [max_minutes]
Uploads the window's R_<w>.jpg/.json, lr_run9.py, run_pyv.py, sl8v.py + the L8 + rrq.py; sends <chunk dir>/c_*.txt; pulls /root/lr/out/RR*/
into <chunk dir>/out/ every 30 s; the card goes DOWN in `finally` (every exit path). RUN_LESSONS: FP8=3, expandable_segments, semicolon
nohup start, outputs pulled as they land, a new label per run, runner / GPU checked every 30 s. First used on b8 30/09 (8 tiles x 3 keys,
7.2 min on a Vast 5090, ~$0.2 with the card overhead)."""
import os, sys, json, time, subprocess, traceback, glob, shutil
W = '/Users/daniel/code/qipu-render-work'
L, WD, L8F, ORIG, H = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]; MAXMIN = float(sys.argv[6]) if len(sys.argv) > 6 else 45
WN = next(l.split()[1] for l in open(f'{WD}/P.txt') if l.startswith('#MOSAIC')); HERE = os.path.dirname(os.path.abspath(__file__))
CH = sorted(glob.glob(f'{H}/c_*.txt')); NT = sum(sum(1 for l in open(c) if l.startswith('C9:')) for c in CH)
json.dump({"jobs": "P.txt", "nf9": 1, "nfkey": "nfC", "l8_from": os.path.basename(L8F), "origin": [int(v) for v in ORIG.split(',')]}, open(f'{H}/SL8.base.json', 'w'))
shutil.copy(f'{HERE}/rrq.py', f'{H}/rrq.py')
SSHO = ['-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'LogLevel=ERROR', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=30']
def log(m): print(time.strftime('%H:%M:%S ') + m, flush=True)
def addr(): return open(f'{W}/speed/addr_{L}').read().split()
def ssh(cmd, timeout=180, inp=None):
    h, p = addr(); return subprocess.run(['ssh', *SSHO, '-p', p, f'root@{h}', cmd], capture_output=True, text=True, timeout=timeout, input=inp)
def pull():
    h, p = addr(); e = 'ssh ' + ' '.join(SSHO) + f' -p {p}'; os.makedirs(f'{H}/out', exist_ok=True)
    return subprocess.run(['rsync', '-a', '--include', 'RR*/', '--include', 'RR*/[0-9]*.jpg', '--exclude', '*', '-e', e, f'root@{h}:/root/lr/out/', f'{H}/out/'], capture_output=True, text=True, timeout=600).returncode
up = False; t0 = time.time()
try:
    env = dict(os.environ, START='0', FP8='3', VAST_MAXTB='4', MAX_VAST=os.environ.get('MAX_VAST', '10'), PYTORCH_CUDA_ALLOC_CONF='expandable_segments:True')
    r = subprocess.run([sys.executable, f'{W}/speed/gpu.py', 'up', L, '1'], env=env, capture_output=True, text=True, cwd=W)
    open(f'{H}/gpu_{L}.log', 'w').write(r.stdout + r.stderr); up = os.path.exists(f'{W}/speed/gpus/{L}.json')
    rl = [x for x in r.stdout.splitlines() if x.startswith('READY')]
    if r.returncode or not rl: raise SystemExit(f'NO GPU rc {r.returncode}: {(r.stderr.strip().splitlines() or ["?"])[-1][:200]}')
    log(f'{L}: {rl[0]}'); h, p = addr(); fp8 = json.load(open(f'{W}/speed/gpus/{L}.json')).get('fp8', '3')
    files = [f'{WD}/{f}' for f in (f'R_{WN}.jpg', f'R_{WN}.json', 'lr_run9.py', 'run_pyv.py', 'sl8v.py')] + [L8F] + [f'{H}/{f}' for f in ('rrq.py', 'SL8.base.json')]
    names = ' '.join(os.path.basename(f) for f in files)
    subprocess.run([sys.executable, f'{W}/speed/stage.py', 'put', f'ai_RR_{L}', h, p, '/root/B8X', *files], capture_output=True, text=True, cwd=W, timeout=1800)
    chk = ssh(f'cd /root/B8X && ls -l {names} | wc -l').stdout.strip()
    if chk != '8':
        log(f'stage upload incomplete ({chk}), rsync fallback'); e = 'ssh ' + ' '.join(SSHO) + f' -p {p}'
        subprocess.run(['rsync', '-a', '-e', e, *files, f'root@{h}:/root/B8X/'], capture_output=True, text=True, timeout=1800)
        chk = ssh(f'cd /root/B8X && ls -l {names} | wc -l').stdout.strip()
        if chk != '8': raise SystemExit('UPLOAD_FAIL')
    ks = sorted({open(c).readline().split()[1] for c in CH})   # the RR<k> out dirs: the L8 pre-placed there (the city sl8v resumes from it)
    ssh('; '.join(f'mkdir -p /root/lr/out/{k}; cp /root/B8X/{os.path.basename(L8F)} /root/lr/out/{k}/l8_{WN}.jpg' for k in ks))
    log('uploaded')
    ssh(f"mkdir -p /root/lr/out /root/Q; cd /root/B8X; FP8={fp8} PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True HF_HOME=/root/hf HF_HUB_OFFLINE=1 "
        f"nohup /usr/local/bin/python -u run_pyv.py rrq.py /root/B8X > /root/B8X/run.out 2>&1 < /dev/null &", timeout=60)
    for c in CH:
        n_ = os.path.basename(c)[:-4]; body = open(c).read()
        ok = ssh(f'cat > /root/Q/{n_}.tmp && mv /root/Q/{n_}.tmp /root/Q/{n_}.txt && echo SENT', inp=body, timeout=60).stdout.strip() == 'SENT'
        if not ok: raise SystemExit(f'chunk {n_} send failed')
    ssh('touch /root/Q/STOP'); log(f'runner started (FP8={fp8}), {len(CH)} chunks / {NT} tiles sent')
    while True:
        st = ssh("ls /root/Q/ | tr '\\n' ' '; echo; pgrep -f '[r]rq.py' >/dev/null && echo run || echo stop; tail -c 600 /root/B8X/run.out | grep -E 'Error|Traceback|CUDA error' | tail -1; nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader", timeout=60).stdout.split('\n')
        nd_ = st[0].count('.done'); pull(); got = sum(len(os.listdir(f'{H}/out/{d}')) for d in os.listdir(f'{H}/out')) if os.path.isdir(f'{H}/out') else 0
        log(f'chunks done {nd_}/{len(CH)}, tiles pulled {got}/{NT}, runner {st[1] if len(st) > 1 else "?"}, gpu {st[-2] if len(st) > 2 else "?"}')
        if nd_ >= len(CH) and got >= NT: log('ALL_DONE'); break
        if len(st) > 2 and st[2].strip() and 'utilization' not in st[2] and not st[2].strip().rstrip('%').strip().isdigit(): raise SystemExit('RUNNER ERROR: ' + st[2][:300])
        if len(st) > 1 and st[1] == 'stop' and nd_ < len(CH): raise SystemExit('RUNNER STOPPED: ' + ssh('tail -5 /root/B8X/run.out').stdout[-500:])
        if time.time() - t0 > MAXMIN * 60: raise SystemExit('TIMEOUT')
        time.sleep(30)
except SystemExit as e: log(f'ABORT {e}')
except Exception: log('ABORT ' + traceback.format_exc()[-800:])
finally:
    if up:
        try: pull()
        except Exception: pass
        r = subprocess.run([sys.executable, f'{W}/speed/gpu.py', 'down', L, f'auto re-roll {WN}: {NT} tiles (rrq.py)'], capture_output=True, text=True, cwd=W)
        log(f'DOWN {(r.stdout + r.stderr).strip().splitlines()[-1:]}')
    log('RR_END')
