# rrq.py (city_run/run, from the b8 re-roll 30/09): sl8q.py with a per-chunk noise key: chunk line 1 '#OUT <dir> <nfkey>'. With nf9=1 the L9 noise is hashed from
# (nfkey, position), so a re-roll needs a new nfkey (a new generator seed alone gives the same image). Same shared L8 (l8_from), same prompts.
import os, json, glob, time
Q = '/root/Q'; os.makedirs(Q, exist_ok=True); base = json.load(open(f'{WH_R}/SL8.base.json')); src = open(f'{WH_R}/sl8v.py').read()
# the city's sl8v.py (look_v6 + [city] patches) takes the L8 frame from the listed tiles: a re-roll subset would shift it -> force the
# window's frame from CFG 'origin' (as b8's sl8v.py does); the L8 itself is resumed from out/<RRk>/l8_<w>.jpg (placed by the card runner)
if "CFG.get('origin')" not in src:
    a_ = "    MX, MY = AX[0], AY[0];"; assert src.count(a_) == 1, 'sl8v frame line not found'
    src = src.replace(a_, "    if CFG.get('origin'): MX0, MY0 = CFG['origin']; AX = range(MX0, AX[-1] + 1, 1024); AY = range(MY0, AY[-1] + 1, 1024)\n" + a_)
while True:
    todo = sorted(f for f in glob.glob(f'{Q}/c_*.txt') if not os.path.exists(f[:-4] + '.done'))
    if not todo:
        if os.path.exists(f'{Q}/STOP'): break
        time.sleep(3); continue
    f = todo[0]; L = open(f).read().splitlines(); h = L[0].split()
    open(f'{WH_R}/P_q.txt', 'w').write('\n'.join(L[1:]) + '\n')
    json.dump(dict(base, jobs='P_q.txt', out=h[1], nfkey=h[2]), open(f'{WH_R}/SL8.json', 'w'))
    exec(compile(src, 'sl8v.py', 'exec'), dict(__name__='__wh__', pipe=pipe, WH_R=WH_R, WH_OUT=WH_OUT, ARGS=[]))
    open(f[:-4] + '.done', 'w').write('ok'); print('CHUNK_DONE', f, flush=True)
print('RRQ_DONE')
