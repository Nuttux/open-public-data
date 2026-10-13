"""(LMK1 13/10) van_ct_lmk FIRST in SRC: the painted landmark patches (lmk/rebuild_lmk_tiles.py: only the touched tiles) win; rerun that script after any block merge, then this one.
van_vt2 = the z9 tiles of van_vt2a/d/e (disjoint windows; an overlap keeps the first) + pyramid; atomic swap; checkpoints.json entry"""
import os, sys, json, shutil, subprocess, fcntl
W = '/Users/daniel/code/qipu-render-work'; B = '/Volumes/QIPU-SSD/worktrees/combo-van/website/scripts/blender/city_run/block'
QF = '/Volumes/QIPU-SSD/qipu-render-work/combo/vancouver/city_today/qa_fail.txt'   # (OPEN-GROUND step2) blocks failing ct_ai's QA gate
SRC = [s for s in ['van_ct_lmk'] + ['van_ct_' + b for b in 'dt kits fv evn evm ws sc evs sw sp2 sp1 ps'.split()] if os.path.isdir(f'{W}/cloud/ckpt_{s}/tiles/9') and s not in os.environ.get('EXCLUDE', '').split(',') + ['van_ct_' + l.strip() for l in (open(QF) if os.path.exists(QF) else []) if l.strip()]]; SRC += [s for s in ['van_surround'] if os.path.isdir(f'{W}/cloud/ckpt_{s}/tiles/9')]   # (FINISH 07/10) render-only surroundings LAST: a painted tile always wins; no-op until ckpt van_surround exists
CK = 'van_city_today'; TD = f'{W}/cloud/ckpt_{CK}/tiles'; NEW, OLD = TD + '.new', TD + '.old'
for d in (NEW, OLD):
    if os.path.exists(d): shutil.rmtree(d)
n = dup = 0
for s in SRC:
    z9 = f'{W}/cloud/ckpt_{s}/tiles/9'
    for x in os.listdir(z9):
        os.makedirs(f'{NEW}/9/{x}', exist_ok=True)
        for f in os.listdir(f'{z9}/{x}'):
            if os.path.exists(f'{NEW}/9/{x}/{f}'): dup += 1; continue
            shutil.copy2(f'{z9}/{x}/{f}', f'{NEW}/9/{x}/{f}'); n += 1
print('z9 tiles', n, 'overlaps', dup)
subprocess.run(['python3', f'{B}/pyr_down.py', NEW], check=True)
os.makedirs(os.path.dirname(TD), exist_ok=True)
if os.path.exists(TD): os.rename(TD, OLD)
os.rename(NEW, TD)
if os.path.exists(OLD): shutil.rmtree(OLD)
CJ = f'{W}/cloud/viewer/checkpoints.json'
with open(CJ + '.lock', 'w') as lk:
    fcntl.flock(lk, fcntl.LOCK_EX); L = [p for p in json.load(open(CJ)) if p.get('name') != CK]
    L.insert(0, dict(name=CK, tiles=f'../ckpt_{CK}/tiles', maxz=9, note='vancouver present-day whole city (CITY-TODAY 07/10, combo-van10): ' + ' + '.join(SRC)))
    json.dump(L, open(CJ + '.tmp', 'w'), indent=1); os.replace(CJ + '.tmp', CJ)
print('PUBLISHED', CK)
