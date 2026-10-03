"""LOOK REGAIN pod runner, v5 (klein-9B cascade; MODEL env; job type C8:gx,gy = L8 generation of the 2048 L9 px around the tile (/2) ->
central 512 x2 -> L9 sharpen pass with the SHARP form of the same prompt). Derived from lr_run.py: a queue of FLUX.2 klein 4B edit jobs (pure noise, 4 steps, guidance 1, the pilot's call).
Watches /root/lr/jobs/*.txt (processed in name order, each once); every line: <in> <out> <ref or -> <prompt key> <seed>
(paths relative to /root/lr). Writes <out> (.jpg q95 or .png), progress in /root/lr/log.txt; a file /root/lr/STOP ends it.
python lr_run.py"""
import os, sys, time, glob, json, torch
from PIL import Image
from diffusers import Flux2KleinPipeline
R = '/root/lr'; os.chdir(R)
BASE = ("Turn this 3D render into a real aerial photograph taken from a helicopter at clear midday: high sun, neutral daylight, crisp and sharp, "
        "real photographic materials on the existing roofs, walls, streets, trees and water. Strict edit: keep every existing building, street, "
        "footprint, roof shape, height, tree and the coastline exactly where it is, same framing and camera. Do not add any new building, tower "
        "or object, do not remove or move anything, keep each building's colour family.")                      # = klein.py PROMPT (early / U7 / pilot)
STRICT = (" Strict edit: keep every existing building, street, footprint, roof shape, height, tree and the coastline exactly where it is, same "
          "framing and camera. Do not add any new building, tower or object, do not remove or move anything, keep each building's colour family.")
LIGHT_W = ("Turn this 3D render into a real aerial photograph taken from a helicopter in warm late-afternoon sunlight, with the same sun direction "
           "and shadows as the render: long crisp dark shadows, deep shade, dark asphalt streets with cars, bright sunlit roofs and walls, "
           "sparkling blue water with sun glitter, crisp and sharp, real photographic materials on the existing roofs, walls, streets, trees and water." + STRICT)
LIGHT_D = ("Turn this 3D render into a real aerial photograph taken from a helicopter in warm late-afternoon sunlight, with the same sun direction "
           "and shadows as the render: long crisp dark shadows, deep shade, dark asphalt streets with cars, bright sunlit roofs and walls, "
           "crisp and sharp, real photographic materials on the existing roofs, walls, streets and trees." + STRICT)
REFP = " Match the photographic look (colour, light, texture) of the second image, a real aerial photograph, not its content."
DRY = ' There is no water anywhere in this image: every street is dry grey asphalt with road markings.'
DRYD = ' There is no water anywhere in this image: every street is dry dark asphalt with road markings.'
WATERC = ' The water is deep blue with natural sun glitter.'
DRYD2 = ' There is no water, pond, pool or fountain anywhere in this image: every street is dry dark asphalt with road markings, and open ground is dry dirt, gravel, pavement or grass exactly as in the render.'
ROOF = ' Flat roofs are clean, even membrane, gravel or tar roofs, without patchy blotches.'
GLASS = ' Every glass curtain wall is opaque: it reflects the sky, nothing is visible through it; keep each tower\'s mullion grid and outline exactly as in the render.'
WETD = ' The only water is the bay exactly where the render shows water; every street is dry dark asphalt with road markings.'
P = {'base': BASE, 'base_dry': BASE + DRY, 'base_ref': BASE + REFP, 'base_ref_dry': BASE + REFP + DRY,
     'base_dryd': BASE + DRYD, 'base_water': BASE + WATERC, 'base_wetd': BASE + WETD, 'base_dryd_glass': BASE + DRYD + GLASS, 'base_dryd2': BASE + DRYD2, 'base_wet0': BASE + ' The only water is the bay exactly where the render shows water.', 'base_dry0': BASE + ' There is no water anywhere in this image.', 'base_dry0_glass': BASE + ' There is no water anywhere in this image.' + GLASS, 'base_wet0_glass': BASE + ' The only water is the bay exactly where the render shows water.' + GLASS, 'base_roofs': BASE + ' The only water is the bay exactly where the render shows water. Keep every flat roof a roof: no roads or road markings on roofs.', 'base_dryd_roof': BASE + DRYD + ROOF, 'base_wetd_roof': BASE + WETD + ROOF, 'base_wetd_glass': BASE + WETD + GLASS, 'lightw': LIGHT_W, 'lightw_ref': LIGHT_W + REFP, 'lightd_ref_dry': LIGHT_D + REFP + DRYD, 'lightd': LIGHT_D + DRYD}
WET1 = ' The only water is the bay exactly where the render shows water; all land is dry.'
WET2 = ' The only water is the bay exactly where the render shows water; every roof, street, lot and patch of open ground is dry land, exactly as in the render.'
P.update({'base_wet1': BASE + WET1, 'base_wet1_glass': BASE + WET1 + GLASS, 'base_wet2': BASE + WET2, 'base_wet2_glass': BASE + WET2 + GLASS})
# v4 (R13, 27/09 18:30): BASE named a helicopter (helicopters invented on flat roofs) and listed water + coastline on EVERY tile (ponds on
# inland lots / roofs / courtyards of dry tiles in fix2). BASE_AIR = BASE without the helicopter; BASE_DRY = BASE_AIR without water / coastline.
BASE_AIR = BASE.replace('taken from a helicopter at clear midday', 'taken from the air at clear midday')
BASE_DRY = BASE_AIR.replace('roofs, walls, streets, trees and water.', 'roofs, walls, streets and trees.').replace('height, tree and the coastline exactly', 'height and tree exactly')
assert BASE_AIR != BASE and BASE_DRY.count('water') == 0 and 'coastline' not in BASE_DRY and 'helicopter' not in BASE_DRY
SOLID = ' Every roof, lot, courtyard, plaza and lawn keeps exactly the solid surface the render shows.'
P.update({'v4_dryn': BASE_DRY, 'v4_dry0': BASE_DRY + ' There is no water anywhere in this image.', 'v4_dryl': BASE_DRY + SOLID, 'v4_wet1': BASE_AIR + WET1})
RAIL = ' The tram and cable-car tracks in the streets stay steel rails exactly where the render shows them.'
LOT = ' The bare dirt lots stay bare dirt exactly as in the render.'
RAIL2 = ' The tram and cable-car rails in the streets stay empty steel rails set in the pavement, exactly where the render shows them; no vehicle is added.'
for k_, c_ in (('v5_dry_rail2', RAIL2), ('v5_dry_rail2_lot', RAIL2 + LOT), ('v5_dry', ''), ('v5_dry_rail', RAIL), ('v5_dry_lot', LOT), ('v5_dry_rail_lot', RAIL + LOT)): P[k_] = BASE_DRY + c_
ANCHOR = lambda p_: p_.replace('Turn this 3D render into a real aerial photograph', 'Turn image 1, a soft aerial photograph, into a crisp, sharp, highly detailed real aerial photograph with exactly the geometry of image 2, a 3D render of the same place: every building, tower and monument of image 2 stands exactly there')
SHARPEN = lambda p_: p_.replace('Turn this 3D render into a real aerial photograph', 'Turn this soft, blurry aerial photograph into a crisp, sharp, highly detailed real aerial photograph')
assert all(SHARPEN(P[k_]) != P[k_] for k_ in ('v5_dry', 'v4_wet1'))
GUIDE = (' Image 2 is a colour-coded map of image 1 with the same framing: blue = water, magenta = streets and pavement, green = roofs,'
         ' yellow = walls, red = landmarks, cyan = trees and lawns, black = open ground, white = vehicles, rails, piers and other objects.'
         ' Keep every area exactly as the map says: water only where the map is blue, trees and lawns only where it is cyan, every roof stays'
         ' a roof, and every white object stays exactly as in image 1.')
for k_, c_ in (('v6_guide', ''), ('v6_guide_rail2', RAIL2)): P[k_] = BASE_DRY + c_
# v7 (fix5, 28/09): vehicle crops. RAIL2's 'no vehicle is added' may push the model to erase the render's streetcars; VEH asks to keep them.
RAIL3 = ' The tram and cable-car rails in the streets stay steel rails set in the pavement, exactly where the render shows them.'
VEH = ' Every bus, streetcar, cable car, car and truck stays exactly where the render shows it, with its shape, length and colour.'
P.update({'v7_veh': BASE_DRY + VEH, 'v7_veh_rail3': BASE_DRY + RAIL3 + VEH})
# v7g (g3: the vehicle wording kept r08 / r10 / r12 but invented buses, cars and trolley wires): + a guard against extra vehicles
VEHG = VEH + ' No other vehicle is added.'
P.update({'v7_vehg': BASE_DRY + VEHG, 'v7_vehg_rail3': BASE_DRY + RAIL3 + VEHG})
# v8 (29/09, block52_v7 road sweep): v5_dry_rail2 painted rails + trolley wires on EVERY street of a rail tile, ballast on wide railed
# roads and erased the cars ('no vehicle is added'). RAIL4 = rails only where the render shows them, the other streets plain asphalt;
# + VEHG (keep every vehicle, add none).
RAIL4 = (' Tram and cable-car rails appear only where the render shows them, as steel rails set in the grey asphalt pavement; every other'
         ' street stays plain grey asphalt with its lane markings, with no rails, no gravel and no overhead wires.')
P.update({'v8_rail4': BASE_DRY + RAIL4 + VEHG, 'v8_rail5': BASE_DRY + RAIL4})   # rail5: no vehicle wording (rail4's VEH invented buses / cars)
MODEL = os.environ.get('MODEL', 'black-forest-labs/FLUX.2-klein-9B')
pipe = Flux2KleinPipeline.from_pretrained(MODEL, torch_dtype=torch.bfloat16).to('cuda'); pipe.set_progress_bar_config(disable=True)
Image.MAX_IMAGE_PIXELS = None; RJ = [None, None]; CJ = [None]; MT = ['']
VC = json.load(open(f'{R}/VARIANT.json')) if os.path.exists(f'{R}/VARIANT.json') else {}   # lookv6 variant knobs
from PIL import ImageFilter
import hashlib
def NF(lv, x0, y0, n=64, K=16):   # world-anchored noise field: latent cell (16 px at level lv) noise from one field keyed by world chunk (K x K cells)
    C = pipe.transformer.config.in_channels; z = torch.empty(1, C, n, n)
    for cy in range(y0 // K, (y0 + n - 1) // K + 1):
        for cx in range(x0 // K, (x0 + n - 1) // K + 1):
            g = torch.Generator('cpu').manual_seed(int(hashlib.sha1(f'{VC.get("nfkey", "nf")}{lv}:{cx},{cy}'.encode()).hexdigest()[:15], 16))
            ch = torch.randn(1, C, K, K, generator=g); ax, ay = cx * K, cy * K
            sx0, sy0 = max(ax, x0), max(ay, y0); sx1, sy1 = min(ax + K, x0 + n), min(ay + K, y0 + n)
            z[:, :, sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = ch[:, :, sy0 - ay:sy1 - ay, sx0 - ax:sx1 - ax]
    return z
log = open(f'{R}/log.txt', 'a'); done_files = set(); t0 = time.time(); n = 0
log.write(f'READY {time.strftime("%H:%M:%S")}\n'); log.flush()
while not os.path.exists(f'{R}/STOP'):
    todo = [f for f in sorted(glob.glob(f'{R}/jobs/*.txt')) if f not in done_files and os.path.exists(f + '.ok')]   # .ok = upload complete
    if not todo: time.sleep(3); continue
    for jf in todo:
        if MT[0] != '': RJ[0] = RJ[1] = CJ[0] = None; MT[0] = ''   # every job file starts on the default mosaic (R.jpg / R.json / C.png)
        for line in open(jf):
            a = line.split()
            if a[:1] == ['#MOSAIC']:   # '#MOSAIC <tag>': the following jobs read R_<tag>.jpg / R_<tag>.json / C_<tag>.png (crops outside the block)
                MT[0] = a[1]; RJ[0] = Image.open(f'{R}/R_{a[1]}.jpg').convert('RGB'); RJ[0].load(); RJ[1] = json.load(open(f'{R}/R_{a[1]}.json'))
                CJ[0] = Image.open(f'{R}/C_{a[1]}.png').convert('RGB') if os.path.exists(f'{R}/C_{a[1]}.png') else None; continue
            if len(a) < 5 or os.path.exists(a[1]): continue
            try:
                if a[0].startswith('RJT:'):   # a w x h crop (tall tile) of the block render mosaic at global gx,gy
                    if RJ[0] is None: RJ[0] = Image.open(f'{R}/R.jpg').convert('RGB'); RJ[0].load(); RJ[1] = json.load(open(f'{R}/R.json'))
                    v = list(map(int, a[0][4:].split(','))); gx, gy, tw, th = v[:4]; ox, oy = RJ[1]['ox'], RJ[1]['oy']; im = RJ[0].crop((gx - ox, gy - oy, gx - ox + tw, gy - oy + th))
                    if len(v) >= 6: im = im.resize((v[4], v[5]), Image.LANCZOS)   # scaled whole-height tile (object taller than 2560 px)
                elif a[0][:3] in ('G8:', 'G9:'):   # GUIDES: the render's class map as image 2 at the L8 step; G9 also anchors the L9 pass on the render
                    if RJ[0] is None: RJ[0] = Image.open(f'{R}/R.jpg').convert('RGB'); RJ[0].load(); RJ[1] = json.load(open(f'{R}/R.json'))
                    if CJ[0] is None: CJ[0] = Image.open(f'{R}/C.png').convert('RGB'); CJ[0].load()
                    gx, gy = map(int, a[0][3:].split(',')); ox, oy = RJ[1]['ox'], RJ[1]['oy']; box8 = (gx - 512 - ox, gy - 512 - oy, gx + 1536 - ox, gy + 1536 - oy)
                    l8 = RJ[0].crop(box8).resize((1024, 1024), Image.LANCZOS); c8m = CJ[0].crop(box8).resize((1024, 1024), Image.NEAREST); t1 = time.time()
                    o8 = pipe(image=[l8, c8m], prompt=P[a[3]] + GUIDE, width=1024, height=1024, num_inference_steps=4, guidance_scale=1.0,
                              generator=torch.Generator('cpu').manual_seed(int(a[4]))).images[0]
                    im = o8.crop((256, 256, 768, 768)).resize((1024, 1024), Image.LANCZOS)
                    if a[0].startswith('G9:'):
                        l9 = RJ[0].crop((gx - ox, gy - oy, gx - ox + 1024, gy - oy + 1024))
                        o = pipe(image=[im, l9], prompt=ANCHOR(P[a[3]]), width=1024, height=1024, num_inference_steps=4, guidance_scale=1.0, generator=torch.Generator('cpu').manual_seed(int(a[4]))).images[0]
                    else: o = pipe(image=[im], prompt=SHARPEN(P[a[3]]), width=1024, height=1024, num_inference_steps=4, guidance_scale=1.0, generator=torch.Generator('cpu').manual_seed(int(a[4]))).images[0]
                    os.makedirs(os.path.dirname(a[1]) or '.', exist_ok=True); o.save(a[1], quality=95); n += 1
                    log.write(json.dumps(dict(out=a[1], s=round(time.time() - t1, 1), model=MODEL, key=a[3], seed=int(a[4]), guide=a[0][:2])) + '\n'); log.flush(); continue
                elif a[0].startswith('C9:') or a[0].startswith('C8:'):   # cascade: L8 stage on the 2048 L9 px around the tile, then the L9 sharpen pass
                    if RJ[0] is None: RJ[0] = Image.open(f'{R}/R.jpg').convert('RGB'); RJ[0].load(); RJ[1] = json.load(open(f'{R}/R.json'))
                    gx, gy = map(int, a[0][3:].split(',')); ox, oy = RJ[1]['ox'], RJ[1]['oy']
                    l8 = RJ[0].crop((gx - 512 - ox, gy - 512 - oy, gx + 1536 - ox, gy + 1536 - oy)).resize((1024, 1024), Image.LANCZOS); t1 = time.time()
                    KW = dict(latents=NF(8, (gx - 512) // 32, (gy - 512) // 32)) if VC.get('nf') else {}
                    KW9 = dict(latents=NF(9, gx // 16, gy // 16)) if VC.get('nf') else {}
                    o8 = pipe(image=[l8], prompt=P[a[3]] + VC.get('c8', ''), width=1024, height=1024, num_inference_steps=VC.get('st8', 4), guidance_scale=1.0, **KW,
                              generator=torch.Generator('cpu').manual_seed(int(a[4]))).images[0]
                    if os.environ.get('SAVE_L8'): os.makedirs(os.path.dirname(a[1]) + '_l8', exist_ok=True); o8.save(os.path.dirname(a[1]) + '_l8/' + os.path.basename(a[1]), quality=92)
                    im = o8.crop((256, 256, 768, 768)).resize((1024, 1024), Image.LANCZOS)
                    if VC.get('usm'): im = im.filter(ImageFilter.UnsharpMask(radius=VC['usm'][0], percent=VC['usm'][1], threshold=VC['usm'][2]))
                    if a[0].startswith('C9:'):   # landmark tiles: the L9 pass also sees the render tile (geometry anchor: slender towers the L8 stage lost)
                        l9 = RJ[0].crop((gx - ox, gy - oy, gx - ox + 1024, gy - oy + 1024))
                        if VC.get('a2'): l9 = l9.resize((VC['a2'], VC['a2']), Image.LANCZOS)
                        p9 = ANCHOR(P[a[3]]) + VC.get('c9', '')
                        if VC.get('anc'): p9 = p9.replace('with exactly the geometry of image 2', VC['anc'])
                        o = pipe(image=[im, l9], prompt=p9, width=1024, height=1024, num_inference_steps=VC.get('st9', 4), guidance_scale=1.0, **KW9,
                                 generator=torch.Generator('cpu').manual_seed(int(a[4]))).images[0]
                    else: o = pipe(image=[im], prompt=SHARPEN(P[a[3]]), width=1024, height=1024, num_inference_steps=4, guidance_scale=1.0,
                                   generator=torch.Generator('cpu').manual_seed(int(a[4]))).images[0]
                    os.makedirs(os.path.dirname(a[1]) or '.', exist_ok=True); o.save(a[1], quality=95); n += 1
                    log.write(json.dumps(dict(out=a[1], s=round(time.time() - t1, 1), model=MODEL, key=a[3], seed=int(a[4]), casc=2 if a[0].startswith('C9:') else 1, vc=VC)) + '\n'); log.flush(); continue
                elif a[0].startswith('RJ:'):   # a 1024 crop of the block render mosaic /root/lr/R.jpg (origin in R.json) at global L9 gx,gy
                    if RJ[0] is None: RJ[0] = Image.open(f'{R}/R.jpg').convert('RGB'); RJ[0].load(); RJ[1] = json.load(open(f'{R}/R.json'))
                    gx, gy = map(int, a[0][3:].split(',')); ox, oy = RJ[1]['ox'], RJ[1]['oy']; im = RJ[0].crop((gx - ox, gy - oy, gx - ox + 1024, gy - oy + 1024))
                else: im = Image.open(a[0]).convert('RGB')
                imgs = [im] + ([Image.open(a[2]).convert('RGB')] if a[2] != '-' else [])
                t1 = time.time()
                o = pipe(image=imgs, prompt=P[a[3]], width=im.width, height=im.height, num_inference_steps=4, guidance_scale=1.0,
                         generator=torch.Generator(os.environ.get('LR_NOISE', 'cpu')).manual_seed(int(a[4]))).images[0]   # CPU noise: the same image on every GPU model (FORENSICS rule)
                os.makedirs(os.path.dirname(a[1]) or '.', exist_ok=True)
                o.save(a[1], quality=95) if a[1].endswith('.jpg') else o.save(a[1]); n += 1
                log.write(json.dumps(dict(out=a[1], s=round(time.time() - t1, 1), model=MODEL, key=a[3], seed=int(a[4]))) + '\n'); log.flush()
            except Exception as e:
                log.write(f'ERROR {a[1]} {repr(e)[:200]}\n'); log.flush()
        done_files.add(jf); log.write(f'JOBS_DONE {os.path.basename(jf)} n={n} t={time.time() - t0:.0f}s\n'); log.flush()
log.write('STOPPED\n'); log.flush()
