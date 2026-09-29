"""city/run/import_b8.py: block_b8 (= SB C4R1, run by the b8 agent) into the city registries, so its neighbours reuse it:
  crops   B8DIR/render/b8b_i_j_z9_i_j.jpg (beauty) + b8_i_j_z9_i_j.{class,mask,gid,part}.png (passes) -> ROOT/crops/i_j.*  (48 full crops;
          the partial margin crops of b8 are NOT imported: the neighbours render their own full ring crops)
  tiles   B8DIR/tiles/<gx>_<gy>.jpg -> ROOT/tiles/ + claims 'C4R1w0' (a registry tile is never regenerated)
  L8      B8DIR/l8_<w>.jpg + its canvas origin -> ROOT/l8/C4R1.{jpg,json}: PULL IT FROM THE CARD BEFORE b8a IS DESTROYED
          (run_b8.sh pull EXCLUDES l8*): ssh <b8a> ls /root/lr/out/B8/l8_*.jpg. Without it the C3R1 / C4R2 / C4R0 edges with b8 get
          fix5b-level seams (two L8 passes) instead of the registry's continuity.
  z9      B8_Z9 (cloud/ckpt_<b8 layer>/tiles/9) -> ROOT/layer/tiles/9 (b8 is published as it was reviewed; not re-posted)
env B8DIR (b8 work dir), B8_Z9, B8_L8 (the l8 jpg), B8_L8_ORIGIN "ox,oy" (L9 px of its canvas (0,0) = MX-512, MY-512 of sl8v).
python3 import_b8.py [--plan-only]"""
import os, sys, json, glob, shutil
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import sb as SBm
ROOT = SBm.ROOT; PO = '--plan-only' in sys.argv; B = os.environ.get('B8DIR', '/Volumes/QIPU-SSD/qipu-render-work/combo/block52/work_b8')   # the b8 agent's work dir (empty at 29/09 18:30)
todo = []; miss = []
for i in range(20, 26):
    for j in range(8, 16):
        for sfx, f in (('jpg', f'{B}/render/b8b_{i}_{j}_z9_{i}_{j}.jpg'),) + tuple((s, f'{B}/render/b8_{i}_{j}_z9_{i}_{j}.{s}') for s in ('class.png', 'mask.png', 'gid.png', 'part.png')):
            (todo if os.path.exists(f) else miss).append((f, f'{ROOT}/crops/{i}_{j}.{sfx}'))
tiles = sorted(glob.glob(f'{B}/tiles/*_*.jpg')); l8 = os.environ.get('B8_L8'); z9 = os.environ.get('B8_Z9')
print('b8 dir', B, '| crop files', len(todo), 'missing', len(miss), '| AI tiles', len(tiles), '| L8', l8 or 'NOT GIVEN', '| z9', z9 or 'NOT GIVEN')
if miss: print('  missing e.g.', [m[0] for m in miss[:3]])
if PO or miss: sys.exit(0 if PO else 1)
os.makedirs(f'{ROOT}/crops', exist_ok=True); os.makedirs(f'{ROOT}/tiles', exist_ok=True)
for a, b in todo: shutil.copy(a, b)
for f in tiles: shutil.copy(f, f'{ROOT}/tiles/')
sys.argv = ['prep_sb.py']; import prep_sb; prep_sb.claims({os.path.basename(f)[:-4]: 'C4R1w0' for f in tiles})
if l8:
    ox, oy = map(int, os.environ['B8_L8_ORIGIN'].split(',')); os.makedirs(f'{ROOT}/l8', exist_ok=True); shutil.copy(l8, f'{ROOT}/l8/C4R1.jpg'); json.dump(dict(ox=ox, oy=oy), open(f'{ROOT}/l8/C4R1.json', 'w'))
if z9:
    for f in glob.glob(f'{z9}/*/*.webp'): d = f'{ROOT}/layer/tiles/9/{f.split("/")[-2]}'; os.makedirs(d, exist_ok=True); shutil.copy(f, d)
print('IMPORTED b8')
