"""port_from_b14.py (03/10, B1): regenerates the parametrised block line here from the live SF copies (work_b14 + block52); every replacement is asserted to match once. Proof of SF defaults: the replacement list IS the diff."""
import os, sys
S = '/Volumes/QIPU-SSD/qipu-render-work/combo/block52/work_b14'; B = '/Users/daniel/code/qipu-render-work/combo/block52'
D = '/Volumes/QIPU-SSD/worktrees/combo-van/website/scripts/blender/city_run/block'
HDR = ('HERE=${0:A:h}; V=${BLK_DIR:?BLK_DIR = the block work dir}; TAG=${BLK_TAG:-${${V:t}#work_}}   # (city_run/block) the block line for any city: CITY unset = SF\n'
       'eval "$(cd $HERE/.. && python3 -c \'import citycfg as C; print(\"CITY_SF=%d BLK_SNAP_DEF=%s BLK_OVL_DEF=%s PIER_CTX=%d\" % (C.SF, C.BLOCK[\"snapshot\"], C.BLOCK[\"overlay\"] or \"-\", C.BLOCK[\"pier_ctx\"]))\')"\n')
def gen(src, dst, reps, n_ok=None):
    s = open(src).read()
    for a, b, *n in reps:
        c = s.count(a); want = n[0] if n else 1
        assert c == want, (dst, a, c)
        s = s.replace(a, b)
    open(f'{D}/{dst}', 'w').write(s); print('wrote', dst)
VB = '/Volumes/QIPU-SSD/qipu-render-work/combo/block52/work_b14'
gen(f'{S}/render_q.sh', 'render_q.sh', [
    ('# b14 render (02/10', '# (city_run/block/render_q.sh: BLK_DIR, BLK_TAG, BLK_SNAP; SF defaults = work_b14/render_q.sh of 03/10)\n# b14 render (02/10'),
    ('set -u\nW=/Users/daniel/code/qipu-render-work; V=/Volumes/QIPU-SSD/qipu-render-work/combo/block52/work_b14; SN=combo7\n',
     'set -u\n' + HDR + 'W=/Users/daniel/code/qipu-render-work; SN=${BLK_SNAP:-$BLK_SNAP_DEF}\n'),
    ('PFX=${3:-b14r}', 'PFX=${3:-${TAG}r}'),
    ('ls $W/combo/block_overlay/*.py > $V/overlay.txt', '{ [ "$BLK_OVL_DEF" = - ] || ls $BLK_OVL_DEF/*.py; } > $V/overlay.txt'),
    ("-path '*combo7*'", "-path \"*$SN*\"", 2),
    ('(b14 fix) overlay files (one source path per line) copied into the pod\'s combo7 snapshot', '(b14 fix) overlay files (one source path per line) copied into the pod\'s $SN snapshot'),
    ('"b14 fix render (overlay failed)"', '"$TAG fix render (overlay failed)"'),
    ('"b14 render (overlay failed)"', '"$TAG render (overlay failed)"'),
    ('"b14 render (setup failed)"', '"$TAG render (setup failed)"'),
    ('"b14 render (combo7, queue)"', '"$TAG render ($SN, queue)"'),
    ('"b14 render (exit trap)"', '"$TAG render (exit trap)"'),
    ('bash $W/combo/block52/render_b8.sh', 'bash $HERE/render_b8.sh'),
])
gen(f'{S}/ai_q.sh', 'ai_q.sh', [
    ('# b8v2 after the render', '# (city_run/block/ai_q.sh: BLK_DIR, BLK_TAG, BLK_CKPT; SF defaults = work_b14/ai_q.sh of 03/10; post/autoreroll from this branch\'s city_run/run)\n# b8v2 after the render'),
    ('set -u\nW=/Users/daniel/code/qipu-render-work; V=/Volumes/QIPU-SSD/qipu-render-work/combo/block52/work_b14; B=$W/combo/block52\nRUN=/Users/daniel/code/opd-combo/website/scripts/blender/city_run/run\n',
     'set -u\n' + HDR + 'W=/Users/daniel/code/qipu-render-work; B=$HERE; CK=${BLK_CKPT:-block_$TAG}\nRUN=${BLK_RUN:-${HERE:h}/run}\n'),
    ('L8L=b14L$(date +%H%M)', 'L8L=${TAG}L$(date +%H%M)'),
    ('python3 $V/pier_ctx.py $V/ai/R_b8.jpg', '[ $PIER_CTX = 0 ] || python3 $HERE/pier_ctx.py $V/ai/R_b8.jpg'),
    ('python3 $V/b8.py', 'BLK_DIR=$V python3 $HERE/b8.py', 6),
    ('"b14 shared L8 (733 anchors, v8_rail5 windows, combo7 render)"', '"$TAG shared L8 ($CITY_SF: 1 = SF)"'),
    ('autoreroll_card.py b14t$k$HM', 'autoreroll_card.py ${TAG}t$k$HM'),
    ('$ORG b14rr$(date +%H%M)', '$ORG ${TAG}rr$(date +%H%M)'),
    ('say "STEP 6 publish block_b14"\n  B8_CKPT=block_b14 BLK_DIR=$V', 'say "STEP 6 publish $CK"\n  B8_CKPT=$CK BLK_DIR=$V'),
])
gen(f'{S}/chain.sh', 'chain.sh', [
    ('V=/Volumes/QIPU-SSD/qipu-render-work/combo/block52/work_b14; W=/Users/daniel/code/qipu-render-work\n',
     'HERE=${0:A:h}; V=${BLK_DIR:?BLK_DIR = the block work dir}; TAG=${BLK_TAG:-${${V:t}#work_}}; W=/Users/daniel/code/qipu-render-work   # (city_run/block/chain.sh; SF defaults = work_b14/chain.sh)\n'),
    ('pgrep -f "render_q.sh [0-9]+ [0-9.]+ b14"', 'pgrep -f "render_q.sh [0-9]+ [0-9.]+ $TAG"'),
    ('python3 $V/b8.py check', 'BLK_DIR=$V python3 $HERE/b8.py check', 2),
    ('"ABORT: Vast credit too low for the b14 AI (+ era AI): $C"', '"ABORT: Vast credit too low for the $TAG AI (+ era AI): $C"'),
    ('zsh $V/ai_q.sh 4', 'BLK_DIR=$V BLK_TAG=$TAG zsh $HERE/ai_q.sh ${BLK_CARDS:-4}'),
])
gen(f'{S}/requeue.sh', 'requeue.sh', [
    ('W=/Users/daniel/code/qipu-render-work; V=/Volumes/QIPU-SSD/qipu-render-work/combo/block52/work_b14;',
     'W=/Users/daniel/code/qipu-render-work; V=${BLK_DIR:?}; TAG=${BLK_TAG:-${${V:t}#work_}};   # (city_run/block; SF = work_b14/requeue.sh)\n'),
    ('for p in b14r1 b14r2 b14r3 b14r4 b14r5 b14r6 b14s1 b14s2 b14s3 b14s4;', 'for p in ${TAG}r{1..6} ${TAG}s{1..4};'),
    ('requeued b14:', 'requeued $TAG:'),
])
gen(f'{S}/b8.py', 'b8.py', [
    ('"""block_b8 Mac-side steps', '"""(city_run/block/b8.py: the block line for any city; CITY unset = SF. V = BLK_DIR, the block\'s Q / ckpt / sheet from V/block.json;\nSF defaults = work_b14/b8.py of 03/10, the block52 helpers from this dir)\nblock_b8 Mac-side steps'),
    ("V = os.path.dirname(os.path.abspath(__file__)); W = '/Users/daniel/code/qipu-render-work'; B52 = f'{W}/combo/block52'\nsys.path.insert(0, B52); import q_b8 as G\n",
     "HERE = os.path.dirname(os.path.abspath(__file__)); V = os.environ.get('BLK_DIR') or HERE; W = '/Users/daniel/code/qipu-render-work'; B52 = HERE\n"
     "sys.path.insert(0, B52); import q_b8 as G\nsys.path.insert(0, os.path.dirname(HERE)); import citycfg as CC\n"
     "BJ = json.load(open(f'{V}/block.json')) if os.path.exists(f'{V}/block.json') else {}   # Q, ckpt, note, sheet [[name, x, y]...], at, right\n"),
    ("os.environ.setdefault('B8_TESTQ', '66560,55296,87040,70656')", "os.environ.setdefault('B8_TESTQ', ','.join(map(str, BJ['Q'])) if BJ else '66560,55296,87040,70656')"),
    ("CK = os.environ.get('B8_CKPT', 'block_b14')", "CK = os.environ.get('B8_CKPT', BJ.get('ckpt', 'block_b14'))"),
    ("subprocess.run(['python3', f'{B52}/prep_b8.py'], check=True, env=dict(os.environ, B8DIR=V, RAILKEY=os.environ.get('RAILKEY', 'v8_rail5')))",
     "subprocess.run(['python3', f'{B52}/prep_b8.py'], check=True, env=dict(os.environ, B8DIR=V, RAILKEY=os.environ.get('RAILKEY', CC.BLOCK['rail_key'])))"),
    ("        L.insert(0, dict(name=CK, tiles=f'../ckpt_{CK}/tiles', maxz=9, note='block b14 = Twin Peaks / Noe Valley / Diamond Heights (combo7 + block_overlay, autoreroll); z9 66560,55296,87040,70656'))",
     "        L.insert(0, dict(name=CK, tiles=f'../ckpt_{CK}/tiles', maxz=9, note=BJ.get('note', 'block b14 = Twin Peaks / Noe Valley / Diamond Heights (combo7 + block_overlay, autoreroll); z9 66560,55296,87040,70656')))"),
    ("    C = [('Twin Peaks summit'", "    C = [tuple(c) for c in BJ['sheet']] if 'sheet' in BJ else [('Twin Peaks summit'"),
    ("    print(f'VIEWER http://127.0.0.1:8797/cloud/viewer/?left={CK}&right=block_b10&at=77000,61000,5')",
     "    print(f\"VIEWER http://127.0.0.1:8797/cloud/viewer/?left={CK}&right={BJ.get('right', 'block_b10')}&at={BJ.get('at', '77000,61000,5')}\")"),
])
gen(f'{B}/prep_b8.py', 'prep_b8.py', [
    ('"""prep_b8.py:', '"""(city_run/block/prep_b8.py; CITY unset = SF = block52/prep_b8.py: rails per city (citycfg rails), lr_run9 prompts through citycfg.prompt_text)\nprep_b8.py:'),
    ("H = '/Users/daniel/code/qipu-render-work/combo/block52'", "H = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(H)); import citycfg as CC"),
    ("'/Users/daniel/code/qipu-render-work/ai/look_regain/pretone_block.py'", "f'{H}/pretone_block.py'"),
    ("sys.path.insert(0, H); import rails_b8\nRL = rails_b8.rail_len([f'{gx},{gy}' for gx in XS for gy in YS])",
     "if CC.BLOCK['rails']: sys.path.insert(0, H); import rails_b8; RL = rails_b8.rail_len([f'{gx},{gy}' for gx in XS for gy in YS])\nelse: RL = {f'{gx},{gy}': 0 for gx in XS for gy in YS}   # no rail data for this city: one prompt key"),
    ("for f in ('sl8v.py', 'run_pyv.py'): shutil.copy(f'/Users/daniel/code/qipu-render-work/combo/block52/work/ai/{f}', O)\nshutil.copy(f'{H}/lr_run9_b8.py', f'{O}/lr_run9.py')",
     "for f in ('sl8v.py', 'run_pyv.py'): shutil.copy(f'{H}/work_ai/{f}', O)\nopen(f'{O}/lr_run9.py', 'w').write(CC.prompt_text(open(f'{H}/lr_run9_b8.py').read()))   # SF: a byte-identical copy"),
])
gen(f'{S}/launch_b14_render.sh', 'launch_render.sh', [
    ('#!/bin/zsh\n# b14 render launch.', '#!/bin/zsh\n# (city_run/block/launch_render.sh: BLK_DIR [BLK_TAG]; zsh launch_render.sh [npods=3] [watchdog h=3.0] [VIC_SAT]; SF defaults = work_b14/launch_b14_render.sh)\n# b14 render launch.'),
    ('W=/Users/daniel/code/qipu-render-work; N=/Volumes/QIPU-SSD/qipu-render-work/combo/block52/work_b14; VS=${1:-}',
     'HERE=${0:A:h}; W=/Users/daniel/code/qipu-render-work; N=${BLK_DIR:?BLK_DIR = the block work dir (new_block.py)}; TAG=${BLK_TAG:-${${N:t}#work_}}; NP=${1:-3}; WH=${2:-3.0}; VS=${3:-}'),
    ('(b14 render ~\\$3, R2 staging)', '($TAG render, R2 staging)'),
    ('(cd $N && python3 b8.py jobs)', '(BLK_DIR=$N python3 $HERE/b8.py jobs)'),
    ('cd $N; nohup zsh render_q.sh 3 3.0 b14r > logs/render_q.out', 'cd $N; BLK_DIR=$N BLK_TAG=$TAG nohup zsh $HERE/render_q.sh $NP $WH ${TAG}r > logs/render_q.out'),
    ('#   tail -n 0 -F /Volumes/QIPU-SSD/qipu-render-work/combo/block52/work_b14/logs/render_q.log', '#   tail -n 0 -F $BLK_DIR/logs/render_q.log'),
])
gen(f'{S}/launch_b14_ai.sh', 'launch_ai.sh', [
    ('#!/bin/zsh\n# b14 AI step:', '#!/bin/zsh\n# (city_run/block/launch_ai.sh: BLK_DIR [BLK_TAG] [BLK_CARDS=4]; SF defaults = work_b14/launch_b14_ai.sh)\n# b14 AI step:'),
    ('N=/Volumes/QIPU-SSD/qipu-render-work/combo/block52/work_b14; W=/Users/daniel/code/qipu-render-work',
     'HERE=${0:A:h}; N=${BLK_DIR:?BLK_DIR = the block work dir}; TAG=${BLK_TAG:-${${N:t}#work_}}; W=/Users/daniel/code/qipu-render-work'),
    ("sed -i '' 's#zsh \\$V/ai_q.sh 8#zsh $V/ai_q.sh 4#' $N/chain.sh\n", ''),
    ('cd $N; nohup zsh chain.sh > logs/chain.out', 'cd $N; BLK_DIR=$N BLK_TAG=$TAG nohup zsh $HERE/chain.sh > logs/chain.out'),
    ('# watcher: tail -n 0 -F /Volumes/QIPU-SSD/qipu-render-work/combo/block52/work_b14/logs/ai_q.log', '# watcher: tail -n 0 -F $BLK_DIR/logs/ai_q.log'),
])
