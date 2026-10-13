# lmk_job.py (workhorse .py job, run by run_pyv.py on a klein card): for every job dir <WH_R>/<name>/ {base.png, mask.png, job.json}:
# pass 1 = L8 windows (2048 L9 px -> 1024) over the landmark -> soft mosaic; pass 2 = anchored L9 windows (1024 native) [pass-1 crop, base]
# -> feathered patch, coarse colour lock to pass 1 (low frequencies only). Writes <WH_OUT>/LMK/<name>/patch.png (+ m8.png, log.json). Same klein call as ai/lr_run9.py.
import json, os, time, math, torch, numpy as np
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None
OUT = f'{WH_OUT}/LMK'; os.makedirs(OUT, exist_ok=True)
def gen(imgs, prompt, seed):
    return pipe(image=imgs, prompt=prompt, width=1024, height=1024, num_inference_steps=4, guidance_scale=1.0, generator=torch.Generator('cpu').manual_seed(int(seed))).images[0]
def ramp(n, r):
    x = np.arange(n) + 0.5; return np.clip(np.minimum(x, n - x) / r, 0, 1)
def starts(lo, hi, size, stride, cmax):
    span = hi - lo
    if span <= size: s = [max(0, min(cmax - size, (lo + hi) // 2 - size // 2))]
    else:
        n = math.ceil((span - size) / stride) + 1; s = [int(lo + i * (span - size) / (n - 1)) for i in range(n)] if n > 1 else [lo]
    return [max(0, min(cmax - size, v)) for v in s]
for name in sorted(os.listdir(WH_R)):
    d = f'{WH_R}/{name}'
    if not os.path.exists(f'{d}/job.json'): continue
    if os.path.exists(f'{OUT}/{name}/DONE'): continue
    J = json.load(open(f'{d}/job.json')); seed = J.get('seed', 11); t0 = time.time()
    base = Image.open(f'{d}/base.png').convert('RGB'); mask = np.asarray(Image.open(f'{d}/mask.png')) > 0; W, H = base.size
    ys, xs = np.nonzero(mask); bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    subj = J['subject']
    P8 = J.get('p8') or (f"Turn this into a crisp, sharp real aerial photograph at clear midday in Vancouver, British Columbia. The pale clay-grey 3D model in the middle is {subj}. Repaint it with its real photographic materials and colours. "
        "Strict edit: keep its exact outline, size, height and position, keep every other building, street, tree and the water exactly where they are, same framing and camera. Do not add any new building, tower or object, and do not write any text or lettering.")
    P9 = J.get('p9') or (f"Turn image 1, a soft aerial photograph, into a crisp, sharp, highly detailed real aerial photograph with exactly the geometry of image 2, a 3D render of the same place: every building stands exactly there. "
        f"Image 1 shows the real look of {subj}: keep its materials and colours, with the same outline, size and height as image 2. Keep every other building, street, tree and the water exactly as in image 2. Do not add any new building or object, and do not write any text or lettering.")
    P9S = "Turn this soft, blurry aerial photograph into a crisp, sharp, highly detailed real aerial photograph, keeping every building, mast, cable, window and the whole outline exactly as it is. Do not add any new building or object, and do not write any text or lettering."
    # pass 1
    K = J.get('k8', 2); S8 = 1024 * K; acc = np.zeros((H // K, W // K, 3), np.float32); wt = np.zeros((H // K, W // K, 1), np.float32); n8 = 1024 // K * K
    r8 = np.outer(ramp(1024, 64), ramp(1024, 64))[..., None].astype(np.float32)
    for y in starts(by0 - 128, by1 + 128, S8, S8 * 3 // 4, H):
        for x in starts(bx0 - 128, bx1 + 128, S8, S8 * 3 // 4, W):
            l8 = base.crop((x, y, x + S8, y + S8)).resize((1024, 1024), Image.LANCZOS); o = np.asarray(gen([l8], P8, seed), np.float32)
            acc[y // K:y // K + 1024, x // K:x // K + 1024] += o * r8; wt[y // K:y // K + 1024, x // K:x // K + 1024] += r8
    b2 = np.asarray(base.resize((W // K, H // K), Image.LANCZOS), np.float32)
    m8 = np.where(wt > 1e-3, acc / np.maximum(wt, 1e-6), b2).clip(0, 255).astype(np.uint8); M8 = Image.fromarray(m8)
    os.makedirs(f'{OUT}/{name}', exist_ok=True); M8.save(f'{OUT}/{name}/m8.png'); t1 = time.time()
    # pass 2 (windows of 1024*k9 L9 px, resized to 1024; k9 = 1 native)
    st9, rr9 = J.get('s9', 768), J.get('r9', 96); k9 = J.get('k9', 1.0); WS = int(1024 * k9); c8 = WS // K
    pa = np.zeros((H, W, 3), np.float32); pw = np.zeros((H, W, 1), np.float32); r9 = np.outer(ramp(WS, rr9), ramp(WS, rr9))[..., None].astype(np.float32); n9 = 0
    for y in starts(by0 - 64, by1 + 64, WS, int(st9 * k9), H):
        for x in starts(bx0 - 64, bx1 + 64, WS, int(st9 * k9), W):
            l8 = M8.crop((x // K, y // K, x // K + c8, y // K + c8)).resize((1024, 1024), Image.LANCZOS); l9 = base.crop((x, y, x + WS, y + WS)).resize((1024, 1024), Image.LANCZOS)
            o = gen([l8], P9S, seed + 1) if J.get('mode9') == 'sharp' else gen([l8, l9], P9, seed + 1)
            o = np.asarray(o.resize((WS, WS), Image.LANCZOS) if WS != 1024 else o, np.float32); pa[y:y + WS, x:x + WS] += o * r9; pw[y:y + WS, x:x + WS] += r9; n9 += 1
    patch = np.where(pw > 1e-3, pa / np.maximum(pw, 1e-6), np.asarray(base, np.float32))
    # coarse colour lock: low frequencies (blur ~ 24 px at 1/4 res) of the patch follow pass 1 (windows agree, no colour drift)
    q = lambda a: Image.fromarray(a.clip(0, 255).astype(np.uint8)).resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(6))
    lp = np.asarray(q(patch), np.float32); l1 = np.asarray(Image.fromarray(m8).resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(6)), np.float32)
    lb = np.asarray(base.resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(6)), np.float32)
    wm = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).resize((W // 4, H // 4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(10)), np.float32)[..., None] / 255.; wm = np.clip(wm * 2.0, 0, 1)
    l1 = l1 * wm + lb * (1 - wm)   # outside the landmark the sea / ground keeps the painted tile's tone (pass 1 regrades the whole window)
    dl = np.asarray(Image.fromarray(((l1 - lp) * 0.6 + 128).clip(0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC), np.float32) - 128
    patch = np.where(pw > 1e-3, patch + dl * J.get('lock', 1.0), patch).clip(0, 255).astype(np.uint8)
    Image.fromarray(patch).save(f'{OUT}/{name}/patch.png'); Image.fromarray((pw[..., 0] > 1e-3).astype(np.uint8) * 255).save(f'{OUT}/{name}/cover.png')
    json.dump(dict(p1_s=round(t1 - t0, 1), p2_s=round(time.time() - t1, 1), n9=n9, seed=seed, P8=P8, P9=P9), open(f'{OUT}/{name}/log.json', 'w')); open(f'{OUT}/{name}/DONE', 'w').write('1')
    print('LMK_DONE', name, round(time.time() - t0), flush=True)
