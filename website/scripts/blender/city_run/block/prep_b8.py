"""(city_run/block/prep_b8.py; CITY unset = SF = block52/prep_b8.py: rails per city (citycfg rails), lr_run9 prompts through citycfg.prompt_text)
prep_b8.py: B8DIR/blk (mosaic_b8.py) -> pre-toned mosaic (pretone_block.py, CAMO=0 ROOFN=1) + the AI window dir B8DIR/ai (one shared L8, FIX-v6:
nf9 + nfkey nfC), as prep_b7.py. Tiles = cfg.json xs x ys (stride 640); > 95 % class water -> not queued (render). Keys: 'v5_dry', or RAILKEY
(env, default v5_dry) where OSM surface rail length in the tile >= 10 m (rails_b8.py). Seeds sha1('pilot:gx,gy') as block52.
env SPLIT=n writes P_0..P_{n-1}.txt (+ SL8_k.json) for n AI cards.   python3 prep_b8.py"""
import os, sys, json, hashlib, shutil, subprocess, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
SD = os.environ['B8DIR']; B = f'{SD}/blk'; O = f'{SD}/ai'; os.makedirs(O, exist_ok=True); H = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.dirname(H)); import citycfg as CC
CFG = json.load(open(f'{SD}/cfg.json')); XS, YS = CFG['xs'], CFG['ys']; RK = os.environ.get('RAILKEY', 'v5_dry'); WN = CFG.get('win', 'b8')
meta = json.load(open(f'{B}/meta.json')); OX, OY = meta['ox'], meta['oy']
if not os.path.exists(f'{B}/R_pt.jpg'):
    subprocess.run(['python3', f'{H}/pretone_block.py', 'b8', f'{B}/R_pt.jpg'], env=dict(os.environ, CAMO='0', ROOFN='1', PT_DIR=B), check=True)
shutil.copy(f'{B}/R_pt.jpg', f'{O}/R_{WN}.jpg'); json.dump(dict(ox=OX, oy=OY), open(f'{O}/R_{WN}.json', 'w')); shutil.copy(f'{B}/R.class.png', f'{O}/C_{WN}.png')
C = Image.open(f'{B}/R.class.png')
RS = ''   # (VT2 06/10) another city's rails: block.rails = its rail_osm.json path -> the tile's area key + block.rail_suffix where >= block.rail_min m of track
if CC.BLOCK['rails'] and isinstance(CC.BLOCK['rails'], str) and not CC.SF: sys.path.insert(0, H); import rails_city; RL = rails_city.rail_len([f'{gx},{gy}' for gx in XS for gy in YS]); RS = CC.BLOCK.get('rail_suffix', '_rail')
elif CC.BLOCK['rails']: sys.path.insert(0, H); import rails_b8; RL = rails_b8.rail_len([f'{gx},{gy}' for gx in XS for gy in YS])
else: RL = {f'{gx},{gy}': 0 for gx in XS for gy in YS}   # no rail data for this city: one prompt key
AK = CC.prompt_area_keys([(gx, gy) for gx in XS for gy in YS]) if CC.BLOCK.get('prompt_areas') else {}   # city area keys (SF: none)
CK = {}   # (OPEN-GROUND 07/10, CITY != sf) content keys: a mostly-open tile (render buildings <= 8 %, open >= 60 %) -> van_beach / van_meadow / van_woods
if not CC.SF and AK and os.environ.get('CONTENT_KEYS', '1') == '1':   # (block/tile_content.py) instead of its area key (houses_w invented mansions on Jericho's meadows)
    sys.path.insert(0, H); import tile_content as TC_; TCD = TC_.block_content(B, [(gx, gy) for gx in XS for gy in YS], OX, OY)
    CK = {t: TC_.open_key(d) for t, d in TCD.items() if TC_.open_key(d) and AK.get(t) not in TC_.KEEP_AREA}; json.dump({f'{gx}_{gy}': d for (gx, gy), d in TCD.items()}, open(f'{O}/content.json', 'w'))
L = []; keep = []; nr = 0
for gy in YS:
    c = np.asarray(C.crop((0, gy - OY, C.size[0], gy - OY + 1024)).convert('RGB')) > 128; wat = (~c[..., 0]) & (~c[..., 1]) & c[..., 2]
    for gx in XS:
        if wat[:, gx - OX:gx - OX + 1024].mean() > 0.95: keep.append(f'{gx}_{gy}'); continue
        if RS: k = AK.get((gx, gy), 'v5_dry') + RS if RL[f'{gx},{gy}'] >= CC.BLOCK.get('rail_min', 60) else CK.get((gx, gy)) or AK.get((gx, gy), 'v5_dry'); nr += k.endswith(RS)
        else: k = RK if RL[f'{gx},{gy}'] >= 10 else CK.get((gx, gy)) or AK.get((gx, gy), 'v5_dry'); nr += k == RK != 'v5_dry'
        sd = int(hashlib.sha1(f'pilot:{gx},{gy}'.encode()).hexdigest()[:8], 16); L.append(f'C9:{gx},{gy} out/{WN}/{gx}_{gy}.jpg - {k} {sd}')
json.dump(keep, open(f'{O}/water_tiles.json', 'w')); n = int(os.environ.get('SPLIT', 1))
LOOK = {}
for k_, f_ in CC.BLOCK.get('look_refs', {}).items():   # per-key look reference photos for sl8v (SF: none); 1024 px copies next to the jobs
    im_ = Image.open(CC.city_path(f_)).convert('RGB'); im_.thumbnail((1024, 1024), Image.LANCZOS); im_.save(f'{O}/look_{k_}.jpg', quality=92); LOOK[k_] = f'look_{k_}.jpg'
for s in range(n):
    part = L[s::n] if n > 1 else L; sfx = f'_{s}' if n > 1 else ''
    open(f'{O}/P{sfx}.txt', 'w').write(f'#MOSAIC {WN}\n' + '\n'.join(part) + '\n')
    json.dump(dict(jobs=f'P{sfx}.txt', nf9=1, nfkey='nfC', out=CFG.get('out', 'B8') + sfx.upper(), **({'look': LOOK} if LOOK else {})), open(f'{O}/SL8{sfx}.json', 'w'))
for f in ('sl8v.py', 'run_pyv.py'): shutil.copy(f'{H}/work_ai/{f}', O)
open(f'{O}/lr_run9.py', 'w').write(CC.prompt_text(open(f'{H}/lr_run9_b8.py').read()))   # SF: a byte-identical copy
print('tiles AI', len(L), 'rail-key', nr, 'water(render)', len(keep)) if not AK else print('tiles AI', len(L), 'rail-key', nr, 'water(render)', len(keep), 'area keys', {k: list(AK.values()).count(k) for k in sorted(set(AK.values()))}, 'content keys', {k: list(CK.values()).count(k) for k in sorted(set(CK.values()))})
