"""RunPod lifecycle for the SF cloud renders. The key is read from ~/.runpod_key and never written anywhere.

python3 pod.py balance                      -> prepaid balance, spend/h
python3 pod.py create <label> <max_hours>   -> one 48 GB GPU pod (cheapest available), watchdog stops it after max_hours;
                                               prints the pod id; state in cloud/state/<id>.json
python3 pod.py wait <id>                    -> waits for SSH, prints "ip port"
python3 pod.py stop|terminate <id>          -> stop (keeps /workspace) / terminate (deletes all, billing ends)
python3 pod.py list                         -> every pod on the account
python3 pod.py guard                        -> stops any RUNNING pod past its planned end (+10 min), or unknown to us;
                                               exit 1 if it had to stop one
python3 pod.py log <id>                     -> appends the pod's run (hours x $/h) to COSTS.md, prints the total
python3 pod.py total                        -> total spent per COSTS.md; exit 3 if >= HARD_STOP ($15)
"""
import base64, json, os, sys, time, urllib.request, datetime as dt

HERE = os.path.dirname(os.path.abspath(__file__)); ST = os.path.join(HERE, 'state'); os.makedirs(ST, exist_ok=True)
COSTS = os.path.join(HERE, 'COSTS.md'); HARD_STOP = 15.0
API = 'https://rest.runpod.io/v1'
# cheapest first; all 48 GB (a 24 GB card can't hold a full frame: no out-of-core on CUDA/OptiX)
GPUS = ['NVIDIA RTX A6000', 'NVIDIA A40', 'NVIDIA L40', 'NVIDIA RTX 6000 Ada Generation', 'NVIDIA L40S']
IMAGE = 'runpod/base:1.3.2-ubuntu2204'
# Europe and North America only: the upload from Paris to a pod in Taiwan ran at ~1 MB/s (24/09, parity attempt 2)
DCS = ['EU-RO-1', 'EU-SE-1', 'EU-NL-1', 'EU-CZ-1', 'EU-FR-1', 'EUR-IS-1', 'EUR-IS-2', 'EUR-IS-3', 'EUR-NO-1',   # Europe first (Daniel is in France)
       'US-GA-1', 'US-GA-2', 'US-NC-1', 'US-MD-1', 'US-DE-1', 'CA-MTL-1', 'CA-MTL-2', 'CA-MTL-3', 'US-IL-1',   # then North America east
       'US-TX-1', 'US-TX-3', 'US-TX-4', 'US-KS-2', 'US-KS-3', 'US-CA-2', 'US-WA-1']                           # never Asia/Oceania


def key():
    return open(os.path.expanduser('~/.runpod_key')).read().strip()


def req(method, path, body=None, base=API):
    r = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={'Authorization': f'Bearer {key()}', 'Content-Type': 'application/json', 'User-Agent': 'qipu-render/1.0'})
    try:
        with urllib.request.urlopen(r, timeout=60) as f:
            t = f.read().decode(); return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        return {'_error': e.code, '_body': e.read().decode()[:500]}


def gql(q):
    return req('POST', '', {'query': q}, base='https://api.runpod.io/graphql')


def balance():
    m = gql('query { myself { clientBalance currentSpendPerHr } }')['data']['myself']
    return m['clientBalance'], m['currentSpendPerHr']


def total():
    t = 0.0
    if os.path.exists(COSTS):
        for l in open(COSTS):
            c = l.split('|')
            if len(c) > 8 and c[1].strip().startswith('20'):
                try: t += float(c[7].strip().lstrip('$'))
                except ValueError: pass
    return t


def st_path(pid): return os.path.join(ST, pid + '.json')


def create(label, maxh):
    if total() >= HARD_STOP: sys.exit(f'HARD STOP: COSTS.md totals ${total():.2f} >= ${HARD_STOP}')
    bal, _ = balance()
    if bal < 3: sys.exit(f'balance ${bal:.2f} too low')
    maxs = int(float(maxh) * 3600)
    # the watchdog: whatever happens to the driver or this Mac, the pod stops itself after max_hours
    wd = base64.b64encode(f"""sleep {maxs}
echo "$(date) watchdog: {maxh} h reached, stopping" >> /root/watchdog.log
runpodctl stop pod "$RUNPOD_POD_ID" >> /root/watchdog.log 2>&1 && exit 0
curl -s -H 'Content-Type: application/json' -H "Authorization: Bearer $RUNPOD_API_KEY" \\
  -d '{{"query":"mutation {{ podStop(input: {{podId: \\"'$RUNPOD_POD_ID'\\"}}) {{ id }} }}"}}' https://api.runpod.io/graphql >> /root/watchdog.log 2>&1
""".encode()).decode()
    body = dict(name=f'qipu-{label}', imageName=IMAGE, gpuCount=1, gpuTypeIds=GPUS, gpuTypePriority='custom',
                containerDiskInGb=40, volumeInGb=0, minVCPUPerGPU=8,
                ports=['22/tcp'], supportPublicIp=True, dataCenterIds=DCS, dataCenterPriority='custom', countryCodes=['FR', 'NL', 'SE', 'NO', 'IS', 'CZ', 'RO', 'US', 'CA'],
                env={'PUBLIC_KEY': open(os.path.expanduser('~/.ssh/id_ed25519.pub')).read().strip(),
                     'NVIDIA_DRIVER_CAPABILITIES': 'all', 'QIPU_ROOT': '/root/q', 'WD_B64': wd},
                dockerStartCmd=['bash', '-c', 'echo $WD_B64 | base64 -d > /wd.sh; nohup bash /wd.sh >/dev/null 2>&1 & exec /start.sh'])
    p = None
    # RAM first: the frame's scene build is single-threaded Python (~150 s), so throughput comes from PAR, and a frame
    # needs ~27 GB; POD_RAM=80 asks for PAR 3, then falls back to any 48 GB card (an A40 has 50 GB: PAR 1)
    tries = [(c, r) for r in dict.fromkeys([int(os.environ.get('POD_RAM', 48)), 48]) for c in ('COMMUNITY', 'SECURE')]
    for cloud, ram in tries:
        p = req('POST', '/pods', dict(body, cloudType=cloud, minRAMPerGPU=ram))
        if 'id' in p: break
        print(cloud, 'refused:', p.get('_body', p)[:200], file=sys.stderr)
        # a 500 can still have made the pod (24/09 18:21: 'Internal Server Error', yet qipu-bench2 ran 15 min): adopt it
        time.sleep(15)
        mine = [q for q in pods() if q.get('name') == body['name'] and not os.path.exists(st_path(q['id']))]
        if mine:
            p = req('GET', f"/pods/{mine[0]['id']}"); print('adopted', p['id'], 'made despite the error', file=sys.stderr); break
    if not p or 'id' not in p: sys.exit('no 48 GB GPU available now')
    s = dict(id=p['id'], label=label, gpu=(p.get('machine') or {}).get('gpuTypeId') or p.get('gpu', {}).get('id'),
             cloud=cloud, cost_per_hr=p.get('adjustedCostPerHr') or p.get('costPerHr'), created=time.time(), max_hours=float(maxh),
             balance_before=bal)
    json.dump(s, open(st_path(p['id']), 'w'), indent=1)
    print(p['id'], s['gpu'], cloud, f"${s['cost_per_hr']}/h", file=sys.stderr); print(p['id'])


def wait(pid, tmax=900):
    t0 = time.time()
    while time.time() - t0 < tmax:
        p = req('GET', f'/pods/{pid}')
        pm = p.get('portMappings') or {}
        if p.get('publicIp') and pm.get('22'):
            s = json.load(open(st_path(pid)));
            s.update(gpu=s.get('gpu') or (p.get('gpu') or {}).get('id'), cost_per_hr=p.get('adjustedCostPerHr') or p.get('costPerHr') or s['cost_per_hr'],
                     ip=p['publicIp'], port=pm['22'])
            json.dump(s, open(st_path(pid), 'w'), indent=1)
            print(p['publicIp'], pm['22']); return
        time.sleep(10)
    sys.exit('pod not reachable in time')


def stop(pid): print(req('POST', f'/pods/{pid}/stop'))


def terminate(pid):
    r = req('DELETE', f'/pods/{pid}'); print('terminated', pid, r)
    p = st_path(pid)
    if os.path.exists(p):
        s = json.load(open(p)); s['ended'] = s.get('ended') or time.time(); json.dump(s, open(p, 'w'), indent=1)


def pods():
    r = req('GET', '/pods'); return r if isinstance(r, list) else r.get('pods', r)


def guard():
    bad = 0
    for p in pods():
        if p.get('desiredStatus') != 'RUNNING': continue
        sp = st_path(p['id'])
        if not os.path.exists(sp):
            try: age_s = time.time() - dt.datetime.strptime((p.get('lastStartedAt') or '')[:19], '%Y-%m-%d %H:%M:%S').replace(tzinfo=dt.timezone.utc).timestamp()
            except ValueError: age_s = 1e9
            if (p.get('name') or '').startswith('qipu-') and age_s < 180:
                print('untracked qipu pod', p['id'], 'is < 3 min old (a create in progress?): left for now'); continue
            if (p.get('name') or '').startswith('qipu-'):      # ours but untracked (a create that errored): terminate
                print('UNTRACKED qipu pod', p['id'], p.get('name'), ': TERMINATING'); terminate(p['id']); bad = 1
            else:
                print('UNKNOWN running pod', p['id'], p.get('name'))   # not ours: report, don't touch
            continue
        s = json.load(open(sp)); age = (time.time() - s['created']) / 3600
        if age > s['max_hours'] + 1 / 6:
            print(f"pod {p['id']} ran {age:.2f} h > planned {s['max_hours']} h: STOPPING"); stop(p['id']); bad = 1
        else:
            print(f"pod {p['id']} {age:.2f} h of {s['max_hours']} h")
    sys.exit(bad)


def log(pid, note=''):
    s = json.load(open(st_path(pid)))
    end = s.get('ended') or time.time(); h = (end - s['created']) / 3600; c = h * float(s['cost_per_hr'] or 0)
    new = not os.path.exists(COSTS) or os.path.getsize(COSTS) == 0
    with open(COSTS, 'a') as f:
        if new:
            f.write('# Cloud render costs (RunPod). Hard stop: nothing more is created once the total reaches $15.\n\n'
                    '| date | pod | label | gpu | $/h | hours | cost | note |\n|---|---|---|---|---|---|---|---|\n')
        f.write(f"| {dt.datetime.fromtimestamp(s['created']).strftime('%Y-%m-%d %H:%M')} | {pid} | {s['label']} | {s['gpu']} | "
                f"{s['cost_per_hr']} | {h:.3f} | ${c:.3f} | {note} |\n")
    print(f'run ${c:.3f}; total ${total():.2f}')


if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'balance': print('balance $%.2f, spend $%.3f/h' % balance())
    elif a[0] == 'create': create(a[1], a[2])
    elif a[0] == 'wait': wait(a[1])
    elif a[0] == 'stop': stop(a[1])
    elif a[0] == 'terminate': terminate(a[1])
    elif a[0] == 'list': [print(p['id'], p.get('name'), p.get('desiredStatus'), p.get('costPerHr')) for p in pods()]
    elif a[0] == 'guard': guard()
    elif a[0] == 'log': log(a[1], ' '.join(a[2:]))
    elif a[0] == 'total':
        t = total(); print(f'${t:.2f}'); sys.exit(3 if t >= HARD_STOP else 0)
