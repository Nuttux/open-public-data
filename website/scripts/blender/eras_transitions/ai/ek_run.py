"""ek_run.py (ON THE POD): the era keys v2 runner. Watches /root/ek/jobs/*.txt (each file once, in name order, only when
<file>.ok exists = upload complete); a line "<Y> <gx> <gy> <dry|wet> <seed>" = one 1024 tile of the year's L8 render at global L8
(gx, gy), cut from /root/ek/up/r_<Y>_<i7>_<j7>.jpg (L7 frames of 10240 x 6144). The look agent's FIX recipe (FORENSICS.md): the
render tile ONLY (no reference image), klein PROMPT + the reworded dry / wet clause, 4 steps, guidance 1, noise drawn on the CPU
(torch.Generator('cpu'): the same image on every GPU model). Dry tiles: ai/addguard.invented_water; a flagged tile is re-rolled
twice with the stronger clause (seed + 1, + 2) and the least-flagged kept. Writes /root/ek/out/<Y>/t_<gx>_<gy>.jpg (q95); log
/root/ek/log.txt (one json line per tile); /root/ek/STOP ends it."""
import os, sys, time, glob, json, torch, numpy as np
from PIL import Image
from diffusers import Flux2KleinPipeline
sys.path.insert(0, '/root'); import addguard
R = '/root/ek'; os.chdir(R); Image.MAX_IMAGE_PIXELS = None
BASE = ("Turn this 3D render into a real aerial photograph taken from a helicopter at clear midday: high sun, neutral daylight, crisp and sharp, "
        "real photographic materials on the existing roofs, walls, streets, trees and water. Strict edit: keep every existing building, street, "
        "footprint, roof shape, height, tree and the coastline exactly where it is, same framing and camera. Do not add any new building, tower "
        "or object, do not remove or move anything, keep each building's colour family.")                      # = klein.py PROMPT
DRYD = ' There is no water anywhere in this image: every street is dry dark asphalt with road markings.'
WETD = ' The only water is the bay exactly where the render shows water; every street is dry dark asphalt with road markings.'
DRYD2 = (' There is no water, pond, pool or fountain anywhere in this image: every street is dry dark asphalt with road markings, and open '
         'ground is dry dirt, gravel, pavement or grass exactly as in the render.')
P = {'dry': BASE + DRYD, 'wet': BASE + WETD, 'dry2': BASE + DRYD2}
pipe = Flux2KleinPipeline.from_pretrained('black-forest-labs/FLUX.2-klein-4B', torch_dtype=torch.bfloat16).to('cuda'); pipe.set_progress_bar_config(disable=True)
CV = {}
def canvas(y, kind):
    """the year's render ('r') or class ('c') over the pilot canvas, loaded once per year"""
    k = (y, kind)
    if k not in CV:
        for kk in [q for q in CV if q[0] != y]: del CV[kk]            # one year in memory at a time
        cj = json.load(open(f'{R}/up/canvas.json')); A = np.zeros((12288, 30720, 3), np.uint8)
        for i7, j7 in cj['frames']:
            p = f"{R}/up/{kind}_{y}_{i7}_{j7}.{'jpg' if kind == 'r' else 'png'}"
            if os.path.exists(p):
                x0, y0 = i7 * 10240 - cj['gx0'], j7 * 6144 - cj['gy0']; A[y0:y0 + 6144, x0:x0 + 10240] = np.asarray(Image.open(p).convert('RGB'))
        CV[k] = A
    return CV[k]
def gen(im, key, seed):
    return np.asarray(pipe(image=[im], prompt=P[key], width=im.width, height=im.height, num_inference_steps=4, guidance_scale=1.0,
                           generator=torch.Generator('cpu').manual_seed(seed)).images[0])
log = open(f'{R}/log.txt', 'a'); done = set(); t0 = time.time(); n = 0
log.write(f'READY {time.strftime("%H:%M:%S")}\n'); log.flush()
while not os.path.exists(f'{R}/STOP'):
    todo = [f for f in sorted(glob.glob(f'{R}/jobs/*.txt')) if f not in done and os.path.exists(f + '.ok')]
    if not todo: time.sleep(3); continue
    for jf in todo:
        for line in open(jf):
            a = line.split()
            if len(a) < 5: continue
            y, gx, gy, key, seed = a[0], int(a[1]), int(a[2]), a[3], int(a[4]); out = f'{R}/out/{y}/t_{gx}_{gy}.jpg'
            if os.path.exists(out): continue
            if os.path.exists(f'{R}/STOP'): break
            try:
                t1 = time.time(); cj_x, cj_y = gx - 40960, gy - 12288
                rt = canvas(y, 'r')[cj_y:cj_y + 1024, cj_x:cj_x + 1024]; im = Image.fromarray(rt)
                o = gen(im, key, seed); flag = 0; tries = 1
                if key == 'dry':
                    ct = canvas(y, 'c')[cj_y:cj_y + 1024, cj_x:cj_x + 1024]
                    flag = int(addguard.invented_water(rt, o, ct).sum())
                    for k in (1, 2):
                        if flag == 0: break
                        o2 = gen(im, 'dry2', seed + k); f2 = int(addguard.invented_water(rt, o2, ct).sum()); tries += 1
                        if f2 < flag: o, flag = o2, f2
                os.makedirs(os.path.dirname(out), exist_ok=True); Image.fromarray(o).save(out + '.part', 'JPEG', quality=95); os.replace(out + '.part', out); n += 1
                log.write(json.dumps(dict(out=out[len(R) + 1:], s=round(time.time() - t1, 1), flag=flag, tries=tries)) + '\n'); log.flush()
            except Exception as e:
                log.write(f'ERROR {out} {repr(e)[:200]}\n'); log.flush()
        done.add(jf); log.write(f'JOBS_DONE {os.path.basename(jf)} n={n} t={time.time() - t0:.0f}s\n'); log.flush()
log.write('STOPPED\n'); log.flush()
