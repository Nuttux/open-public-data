#!/usr/bin/env python3
"""city/run/city.py: THE orchestrator of the whole-city run (render -> AI -> Mac post -> QA -> layer), resumable, $-capped.
  python3 city.py plan [SB ...] --plan-only   the jobs it WOULD launch (render job lists, AI windows + keys, post bands, cards, $, time): no
                                               GPU, no file written (default SB list = all, in run order)
  python3 city.py run [SB ...]                the loop (every 60 s): launch ready tasks on free lanes, watch cards, retry, cap, stop rule
  python3 city.py status                      the queue (per SB x stage), cards up, $ spent by the city run
  python3 city.py gate <probe id> ok|fail     record the review of a probe (an SB waits for the probes of its risk tags: areas.json)
  python3 city.py stop                        STOP file: no new task, every city card down (logged), loop exits
State: <ROOT>/state/queue.json (tasks: sb, stage, window, status pending|running|done|failed, tries, card, pid, log) + <ROOT>/state/city.log.
Everything is written on the SSD <ROOT> (default /Volumes/QIPU-SSD/qipu-city); the Mac's / only holds these scripts.

STAGES per SB (deps):   render [lane R: RunPod A5000/A40 pod, PAR=2]  <- gates of its risk tags (probes reviewed)
                        import [mac] <- render      windows [mac, serialized in run order: the tile claims] <- import
                        ai:<w> [lane A: Vast 5090 FP8=3, one window at a time]  <- windows
                        post [mac lane, banded] <- every ai window that claimed a tile of the SB's tile range + import
                        qa [mac] <- post (detectors + sheet + the STOP RULE)       layer: pyr_down.py once every SB passed
RETRY: a dead card (runner stopped, no new tile for 15 min / first tile 25 min, ssh unreachable, render traceback) -> pull what is done,
  card down (COSTS.md), host into speed/hosts.py's 24 h blacklist, task back to pending (resumes from the registries); 3 deaths of one
  task -> failed (lane keeps going with the other SBs). A Blender Traceback on the same crop twice -> failed (a bug, not a flake).
CAP: CITY_CAP (default $95) over the city ledger (COSTS.md rows 'cty-*' + the live city cards x their $/h); >= 85 % -> no new card;
  >= 100 % -> STOP (all city cards down). Also refuses when cloud/pod.py's global HARD_STOP would be crossed. Every card has max_hours
  (watchdog on the card), so a dead Mac cannot leave a card billing past it.
STOP RULE (qa): an SB fails when (a) any AI tile of its range is missing / rendered as fallback, (b) a Blender Traceback or a mosaic hole,
  (c) flagged detector cells > 2x block_b8's rate (CITY_B8_FLAG_RATE) or land-blue px > 0.2 % of land, (d) its SB-edge discontinuity > the
  within-SB seam p95. A failed SB is not published; SBs sharing its failed risk tag pause; 2 failed SBs in a row -> STOP."""
import os, sys, json, time, subprocess, shlex, glob
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import sb as SBm
W = '/Users/daniel/code/qipu-render-work'; ROOT = SBm.ROOT; ST = f'{ROOT}/state'; AREAS = json.load(open(f'{HERE}/areas.json'))
CAP = float(os.environ.get('CITY_CAP', 95)); N_R = int(os.environ.get('N_RENDER', 5)); N_A = int(os.environ.get('N_AI', 5)); MAC_PAR = int(os.environ.get('MAC_PAR', 2))
SNAP = os.environ.get('CITY_SNAP_NAME', 'city1'); PLAN_ONLY = '--plan-only' in sys.argv
# measured rates (29/09): render per full crop, beauty + passes jobs, PAR=2 pod throughput (block52: passes 30 jobs / 68 min on an A5000,
# beauty 16 / 34 min on an A40); AI per tile incl. the shared L8 anchors (b7: 495 tiles in 72 min on a Vast 5090 FP8=3)
RS = dict(city=(260, 320, 420), terrain=(150, 200, 300), sea=(50, 70, 120))   # s per crop: low / expected / high
AS = (8.0, 9.0, 12.0); PR = dict(render=(0.27, 0.35, 0.49), ai=(0.60, 0.65, 0.74)); SETUP_H = dict(render=0.2, ai=0.12)
def log(m):
    line = f'{time.strftime("%m-%d %H:%M:%S")} {m}'; print(line, flush=True)
    if not PLAN_ONLY: os.makedirs(ST, exist_ok=True); open(f'{ST}/city.log', 'a').write(line + '\n')

# ---------------------------------------------------------------- the task graph
def tasks_for(sid):
    info = SBm.sb_info(sid); T = []
    if sid == 'C4R1': return [dict(sb=sid, stage='import_b8', lane='mac', deps=[])]          # block_b8: its crops, tiles, L8, final z9 -> the registries
    gates = sorted({p['id'] for tag in info_tags(sid) for p in AREAS['risks'].get(tag, {}).get('probes', [])})
    T.append(dict(sb=sid, stage='render', lane='R', deps=[f'gate:{g}' for g in gates]))
    T.append(dict(sb=sid, stage='import', lane='mac', deps=[f'{sid}:render']))
    T.append(dict(sb=sid, stage='windows', lane='mac', deps=[f'{sid}:import'] + [f'{p}:windows' for p in prev_sbs(sid)[-1:]]))
    for k in (0, 1): T.append(dict(sb=sid, stage=f'ai:{sid}w{k}', lane='A', deps=[f'{sid}:windows']))
    T.append(dict(sb=sid, stage='post', lane='mac', deps=[f'{sid}:import', f'claims:{sid}']))
    T.append(dict(sb=sid, stage='qa', lane='mac', deps=[f'{sid}:post']))
    return T
def info_tags(sid): return next(s[2] for s in SBm.SBS if s[0] == sid) + ['sb_seams']
def prev_sbs(sid): o = SBm.ORDER; return [s for s in o[:o.index(sid)] if s != 'C4R1']

# ---------------------------------------------------------------- the estimate (plan)
def estimate(sids):
    P = {d['id']: d for d in SBm.plan()}; rows = []; tot = dict(crops=0, ai=0, rh=[0, 0, 0], ah=[0, 0, 0])
    done_crops = {f'{i}:{j}' for i in range(20, 26) for j in range(8, 16)}   # block_b8's 48 full crops
    seen = set(done_crops)
    for sid in SBm.ORDER:
        d = P[sid]; c0, c1, r0, r1 = SBm.sb_crops(sid)
        need = [f'{i}:{j}' for j in range(max(0, r0 - 1), min(31, r1 + 1) + 1) for i in range(max(0, c0 - 1), min(31, c1 + 1) + 1)]
        new = [k for k in need if k not in seen] if sid != 'C4R1' else []; seen |= set(new)   # b8's ring is rendered by its neighbours
        kinds = [SBm.crop_kind(*map(int, k.split(':')))[0] for k in new]; ai = 0 if sid == 'C4R1' else len(d['ai_own'])
        rh = [sum(RS[k][q] for k in kinds) / 3600 for q in range(3)]; ah = [ai * AS[q] / 3600 for q in range(3)]
        if sid in sids:
            rows.append((sid, len(new), sum(k == 'city' for k in kinds), ai, rh, ah, d['name']))
            tot['crops'] += len(new); tot['ai'] += ai; tot['rh'] = [a + b for a, b in zip(tot['rh'], rh)]; tot['ah'] = [a + b for a, b in zip(tot['ah'], ah)]
    return rows, tot

def cmd_plan(sids):
    rows, tot = estimate(sids)
    print(f"{'SB':5} {'new crops':>9} {'(city)':>6} {'AI tiles':>8} {'render pod-h':>13} {'AI card-h':>10}  name")
    for sid, nc, ncc, ai, rh, ah, name in rows: print(f"{sid:5} {nc:9d} {ncc:6d} {ai:8d} {rh[1]:13.1f} {ah[1]:10.1f}  {name[:60]}")
    rh, ah = tot['rh'], tot['ah']
    usd = [rh[q] * PR['render'][q] + ah[q] * PR['ai'][q] for q in range(3)]
    print(f"TOTAL new crops {tot['crops']}, AI tiles {tot['ai']}; render {rh[0]:.0f}/{rh[1]:.0f}/{rh[2]:.0f} pod-h, AI {ah[0]:.0f}/{ah[1]:.0f}/{ah[2]:.0f} card-h (low/exp/high); "
          f"GPU $ {usd[0]:.0f}/{usd[1]:.0f}/{usd[2]:.0f} before setup, probes, retries")
    if len(sids) <= 2:
        for sid in sids:
            if sid == 'C4R1': print('C4R1 = block_b8: import_b8 only'); continue
            print(f'\n==== {sid}: the tasks and the exact commands city.py run would launch ====')
            for t in tasks_for(sid): print(f"  task {t['sb']}:{t['stage']:<14} lane {t['lane']:<3} deps {t['deps']}")
            print('\n-- render (lane R) --'); r = run_py(['prep_sb.py', 'jobs', sid, '--plan-only']); print(r[:1500])
            print(f"  cmd: bash cloud/lmk_pod.sh cty-r1 up {SNAP} 3   (only if no city render pod is free; NETVOL=1 when the pack is on /vol)")
            print(f"  cmd: PAR=2 bash city/run/render_sb.sh cty-r1 {SNAP} {ROOT}/sb/{sid}/jobs_render.txt {ROOT}/sb/{sid}/fetched 'c[bp]_*'")
            print(f"  cmd: python3 city/run/prep_sb.py import {sid} {ROOT}/sb/{sid}/fetched")
            print('\n-- AI windows (lane A) --'); print(run_py(['prep_sb.py', 'windows', sid, '--plan-only'])[:2500])
            for k in (0, 1):
                w = f'{sid}w{k}'; print(f"  cmd: START=0 python3 speed/gpu.py up cty-a1 3  ->  bash city/run/run_win.sh cty-a1 {ROOT}/sb/{sid}/{w} {w} up|wait|pull")
            Q = SBm.sb_Q(sid); nb = -(-(Q[3] - Q[1]) // 3072)
            print(f"\n-- post (Mac, banded) --\n  cmd: python3 city/run/post_sb.py {sid} quilt      (streamed, ~1 GB RAM)\n  cmd: python3 city/run/post_sb.py {sid} finish     ({nb} bands of 3072 rows + 1536 halo, ~6-8 GB RAM each, resumable per band)")
            print(f"  cmd: python3 city/run/post_sb.py {sid} sheet  -> ~/Downloads/qipu-renders/live_ai/city/{sid}.jpg\n  cmd: python3 city/run/city.py qa {sid}")
            print(f"  z9 tiles -> {ROOT}/layer/tiles/9 ({(Q[2] - Q[0]) // 512 * ((Q[3] - Q[1]) // 512)} webp)")
def run_py(a): return subprocess.run(['python3', f'{HERE}/{a[0]}', *a[1:]], capture_output=True, text=True, cwd=HERE).stdout

# ---------------------------------------------------------------- state, cost, cards
def load_q():
    f = f'{ST}/queue.json'
    if os.path.exists(f): return json.load(open(f))
    q = []
    for sid in SBm.ORDER: q += [dict(t, status='pending', tries=0, card=None, pid=None) for t in tasks_for(sid)]
    return q
def save_q(q): os.makedirs(ST, exist_ok=True); json.dump(q, open(f'{ST}/queue.json.tmp', 'w'), indent=0); os.replace(f'{ST}/queue.json.tmp', f'{ST}/queue.json')
def city_cost():
    """COSTS.md rows of city cards ('cty-' labels) + the live city cards (hours x $/h from speed/gpus/<label>.json or the pod state)"""
    t = 0.0
    for l in open(f'{W}/cloud/COSTS.md'):
        c = l.split('|')
        if len(c) > 8 and 'cty-' in c[3]:
            try: t += float(c[7].strip().lstrip('$'))
            except ValueError: pass
    for f in glob.glob(f'{W}/speed/gpus/cty-*.json'):
        s = json.load(open(f))
        if not s.get('ended'): t += (time.time() - float(s.get('t_start', time.time()))) / 3600 * float(s.get('dph', 0.65))
    for f in glob.glob(f'{ST}/cards/cty-r*.json'):
        s = json.load(open(f))
        if s.get('up') and not s.get('down'): t += (time.time() - s['up']) / 3600 * s.get('dph', 0.49)
    return round(t, 2)
def global_spent():
    r = subprocess.run(['python3', f'{W}/cloud/pod.py', 'total'], capture_output=True, text=True);
    try: return float(r.stdout.strip().split()[-1].lstrip('$'))
    except Exception: return None
def cap_state():
    c = city_cost(); return c, ('stop' if c >= CAP else 'soft' if c >= 0.85 * CAP else 'ok')
def stop_all(q, why):
    log(f'STOP: {why}'); open(f'{ST}/STOP', 'w').write(why + '\n')
    for f in glob.glob(f'{W}/speed/gpus/cty-*.json'):
        s = json.load(open(f))
        if not s.get('ended'): subprocess.run(['python3', f'{W}/speed/gpu.py', 'down', s['label'], f'city: STOP ({why})'])
    for f in glob.glob(f'{ST}/cards/cty-r*.json'):
        s = json.load(open(f))
        if not s.get('down'): subprocess.run(['bash', f'{W}/cloud/lmk_pod.sh', s['label'], 'down', f'city: STOP ({why})'])

# ---------------------------------------------------------------- the loop
def deps_ok(t, q):
    st = {f"{x['sb']}:{x['stage']}": x['status'] for x in q}
    for d in t['deps']:
        if d.startswith('gate:'):
            if not os.path.exists(f'{ROOT}/gates/{d[5:]}.ok'): return False
        elif d.startswith('claims:'):   # every AI window that claimed a tile of the SB's tile range is done
            C = json.load(open(f'{ROOT}/tiles/claims.json')) if os.path.exists(f'{ROOT}/tiles/claims.json') else {}
            Q = SBm.sb_Q(d[7:]); xs, ys = SBm.tile_range(Q); ws = {C[f'{x}_{y}'] for x in xs for y in ys if f'{x}_{y}' in C}
            if any(st.get(f"{w.split('w')[0]}:ai:{w}") != 'done' for w in ws): return False
        elif st.get(d) != 'done': return False
    return True
def launch(t):
    """the command of a task, run detached with its log; returns the Popen pid"""
    sid, stg = t['sb'], t['stage']; L = f'{ROOT}/sb/{sid}/logs'; os.makedirs(L, exist_ok=True)
    if stg == 'render':
        cmd = (f"python3 {HERE}/prep_sb.py jobs {sid} && (bash {W}/cloud/lmk_pod.sh {t['card']} status >/dev/null 2>&1 || bash {W}/cloud/lmk_pod.sh {t['card']} up {SNAP} 3) && "
               f"PAR=2 bash {HERE}/render_sb.sh {t['card']} {SNAP} {ROOT}/sb/{sid}/jobs_render.txt {ROOT}/sb/{sid}/fetched 'c[bp]_*'")
    elif stg == 'import': cmd = f"python3 {HERE}/prep_sb.py import {sid} {ROOT}/sb/{sid}/fetched"
    elif stg == 'windows': cmd = f"python3 {HERE}/prep_sb.py windows {sid}"
    elif stg.startswith('ai:'):
        w = stg[3:]; D = f'{ROOT}/sb/{sid}/{w}'
        cmd = (f"[ -f {D}/P.txt ] || exit 0; ( [ -f {W}/speed/addr_{t['card']} ] && ssh -o ConnectTimeout=15 -p $(cut -d' ' -f2 {W}/speed/addr_{t['card']}) root@$(cut -d' ' -f1 {W}/speed/addr_{t['card']}) true ) "
               f"|| START=0 python3 {W}/speed/gpu.py up {t['card']} 3; bash {HERE}/run_win.sh {t['card']} {D} {w} up && bash {HERE}/run_win.sh {t['card']} {D} {w} wait; r=$?; bash {HERE}/run_win.sh {t['card']} {D} {w} pull; exit $r")
    elif stg == 'post': cmd = f"python3 {HERE}/post_sb.py {sid} quilt,finish,sheet"
    elif stg == 'qa': cmd = f"python3 {HERE}/city.py qa {sid}"
    elif stg == 'import_b8': cmd = f"python3 {HERE}/import_b8.py"
    p = subprocess.Popen(['bash', '-c', cmd], stdout=open(f'{L}/{stg.replace(":", "_")}.log', 'a'), stderr=subprocess.STDOUT, start_new_session=True); PROCS[p.pid] = p; return p.pid
PROCS = {}   # our children (Popen): exit codes via poll(); a pid from an earlier city.py process is watched with kill(0) and re-run (resumes)
def alive(pid):
    try: os.kill(pid, 0); return True
    except Exception: return False
def cmd_run(sids):
    q = load_q(); save_q(q); log(f'RUN start: {len(q)} tasks, cap ${CAP}, lanes R {N_R} A {N_A} mac {MAC_PAR}')
    while True:
        if os.path.exists(f'{ST}/STOP'): stop_all(q, 'STOP file'); break
        cost, cs = cap_state(); g = global_spent()
        if cs == 'stop': stop_all(q, f'city cap reached: ${cost} >= ${CAP}'); break
        if g is not None and g >= 250 - 2: stop_all(q, f'global HARD_STOP near: ${g}'); break
        for t in q:                                        # finished children
            if t['status'] == 'running' and t['pid']:
                pr = PROCS.get(t['pid'])
                if pr is not None:
                    code = pr.poll()
                    if code is None: continue
                    PROCS.pop(t['pid'])
                elif alive(t['pid']): continue
                else: code = 99   # launched by an earlier city.py: exit unknown -> run again (the stages resume from the registries)
                t['status'] = 'done' if code == 0 else 'pending'; t['pid'] = None
                if code == 99: log(f"{t['sb']}:{t['stage']} orphan finished -> re-run to verify"); continue
                if code != 0:
                    t['tries'] += 1; log(f"{t['sb']}:{t['stage']} exit {code} (try {t['tries']}) card {t['card']}")
                    if t['lane'] in 'RA' and t['card']: card_dead(t)
                    if t['tries'] >= 3: t['status'] = 'failed'; log(f"FAILED {t['sb']}:{t['stage']}")
                else: log(f"done {t['sb']}:{t['stage']}")
                if t['stage'] == 'qa' and t['status'] == 'done' and not json.load(open(f"{ROOT}/sb/{t['sb']}/qa.json"))['pass']: sb_failed(q, t['sb'])
        busy = {l: sum(1 for t in q if t['status'] == 'running' and t['lane'] == l) for l in ('R', 'A', 'mac')}
        for t in q:
            if t['status'] != 'pending' or (sids and t['sb'] not in sids) or not deps_ok(t, q): continue
            lim = dict(R=N_R, A=N_A, mac=MAC_PAR)[t['lane']]
            if busy[t['lane']] >= lim: continue
            if t['lane'] in 'RA':
                if cs != 'ok': continue                    # soft cap: no new card
                t['card'] = t['card'] or free_card(q, t['lane'])
            if t['lane'] == 'mac' and not mac_ok(): continue
            t['pid'] = launch(t); t['status'] = 'running'; busy[t['lane']] += 1; log(f"launch {t['sb']}:{t['stage']} card {t['card']} pid {t['pid']} (city ${cost})")
        idle_cards(q); save_q(q)
        if all(t['status'] in ('done', 'failed') for t in q if not sids or t['sb'] in sids): log('RUN: nothing left'); break
        time.sleep(60)
def free_card(q, lane):
    used = {t['card'] for t in q if t['status'] == 'running' and t['lane'] == lane}; n = N_R if lane == 'R' else N_A
    return next(f"cty-{'r' if lane == 'R' else 'a'}{k}" for k in range(1, 100) if f"cty-{'r' if lane == 'R' else 'a'}{k}" not in used)
def card_dead(t):
    c = t['card']; log(f'card {c} dead -> down + blacklist; the task resumes on a new card')
    try:
        ip = open(f'{W}/speed/addr_{c}').read().split()[0]; subprocess.run(['python3', '-c', f"import sys; sys.path.insert(0, '{W}/speed'); import hosts; hosts.fail('city', '{ip}', 'city: dead mid-run')"])
    except Exception: pass
    if t['lane'] == 'A': subprocess.run(['python3', f'{W}/speed/gpu.py', 'down', c, f"city: dead during {t['stage']}"])
    else: subprocess.run(['bash', f'{W}/cloud/lmk_pod.sh', c, 'down', f"city: dead during {t['sb']} render"])
    t['card'] = None
def idle_cards(q):
    """a city card with no pending / running task of its lane for 10 min -> down"""
    for lane, pat in (('A', 'cty-a'), ('R', 'cty-r')):
        if any(t['lane'] == lane and t['status'] in ('pending', 'running') for t in q): continue
        for f in glob.glob(f'{W}/speed/gpus/{pat}*.json') if lane == 'A' else glob.glob(f'{ST}/cards/{pat}*.json'):
            s = json.load(open(f))
            if not s.get('ended') and not s.get('down'):
                (subprocess.run(['python3', f'{W}/speed/gpu.py', 'down', s['label'], 'city: lane idle']) if lane == 'A' else subprocess.run(['bash', f'{W}/cloud/lmk_pod.sh', s['label'], 'down', 'city: lane idle']))
def mac_ok():
    """free RAM >= 12 GB (vm_stat free + inactive) and swap not full, and / >= 6 GB free (the post writes to the SSD only)"""
    try:
        v = subprocess.run(['vm_stat'], capture_output=True, text=True).stdout; pg = 16384
        free = sum(int(l.split(':')[1].strip(' .')) for l in v.splitlines() if l.startswith(('Pages free', 'Pages inactive'))) * pg / 2 ** 30
        sw = subprocess.run(['sysctl', '-n', 'vm.swapusage'], capture_output=True, text=True).stdout; used, tot = float(sw.split('used = ')[1].split('M')[0]), float(sw.split('total = ')[1].split('M')[0])
        st = os.statvfs('/'); root_free = st.f_bavail * st.f_frsize / 2 ** 30
        return free >= 12 and (tot == 0 or used / tot < 0.9) and root_free >= 6
    except Exception: return False
def sb_failed(q, sid):
    tags = set(info_tags(sid)) - {'sb_seams'}; log(f'SB {sid} FAILED QA: SBs sharing {sorted(tags)} pause (not published)')
    for t in q:
        if t['status'] == 'pending' and set(info_tags(t['sb'])) & tags and t['stage'] == 'render': t['status'] = 'paused'
    fails = [x for x in q if x['stage'] == 'qa' and x['status'] == 'done' and not json.load(open(f"{ROOT}/sb/{x['sb']}/qa.json"))['pass']]
    if len(fails) >= 2 and fails[-1]['sb'] == sid: stop_all(q, f'2 SBs failed QA ({[f["sb"] for f in fails][-2:]})')

# ---------------------------------------------------------------- QA (the stop rule)
def cmd_qa(sid):
    D = f'{ROOT}/sb/{sid}'; qj = json.load(open(f'{D}/quilt.json')); why = []
    cells = flagged = 0; lb = land = 0
    for f in glob.glob(f'{D}/detect/d_*.json'):
        d = json.load(open(f)); cells += len(d['cells']); flagged += len(d['flagged'])
        lb += sum(v['land_blue_px'] for v in d['cells'].values()); land += sum(v.get('land_px', 0) for v in d['cells'].values())
    rate = flagged / max(1, cells); b8 = float(os.environ.get('CITY_B8_FLAG_RATE', 0.08))
    if qj.get('missing_ai'): why.append(f"{qj['missing_ai']} AI tiles missing")
    if rate > 2 * b8: why.append(f'flagged cells {rate:.3f} > 2 x b8 {b8:.3f}')
    if land and lb / land > 0.002: why.append(f'land-blue {lb / land:.4f} of land')
    if glob.glob(f'{D}/fetched/*.log') and any('Traceback' in open(f, errors='ignore').read() for f in glob.glob(f'{D}/fetched/*.log')): why.append('Blender Traceback')
    res = dict(sb=sid, pass_=not why, reasons=why, cells=cells, flagged=flagged, rate=round(rate, 4), land_blue=lb, sheet=os.path.expanduser(f'~/Downloads/qipu-renders/live_ai/city/{sid}.jpg'))
    res['pass'] = res.pop('pass_'); json.dump(res, open(f'{D}/qa.json', 'w'), indent=1); print('QA', res)

def cmd_status():
    q = load_q(); from collections import Counter
    print('city $', city_cost(), 'cap', CAP, '| global $', global_spent()); print(Counter(t['status'] for t in q))
    for t in q:
        if t['status'] in ('running', 'failed', 'paused'): print(' ', t['sb'], t['stage'], t['status'], t['card'], 'tries', t['tries'])

if __name__ == '__main__':
    a = [x for x in sys.argv[1:] if x != '--plan-only']; c = a[0] if a else 'help'; sids = a[1:] or SBm.ORDER
    if c == 'plan': cmd_plan(sids)
    elif c == 'run':
        assert not PLAN_ONLY; cmd_run(a[1:])
    elif c == 'qa': cmd_qa(a[1])
    elif c == 'status': cmd_status()
    elif c == 'gate': os.makedirs(f'{ROOT}/gates', exist_ok=True); open(f'{ROOT}/gates/{a[1]}.{a[2]}', 'w').write(time.strftime('%F %T') + '\n'); print('gate', a[1], a[2])
    elif c == 'stop': os.makedirs(ST, exist_ok=True); open(f'{ST}/STOP', 'w').write('manual\n'); print('STOP file written: the loop downs every city card at its next tick')
    else: print(__doc__)
