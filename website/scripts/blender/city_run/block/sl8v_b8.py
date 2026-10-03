# sl8.py (workhorse .py job): SHARED L8 LAYER per window. L8 generated once per world anchor (X, Y = 0 mod 1024 L9 px; the 2048 L9 px
# around it /2, as C9's L8 stage), their 512 L8 px cores blended (32 px feather) into ONE L8 mosaic; every L9 tile then crops its
# context from that mosaic (x2) and runs the usual C9 anchored L9 pass. Config: WH_R/SL8.json {"jobs": "WINS.txt", "nf": 0|1, "out": "SL8"}
import json, os, hashlib, time, torch, numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
src = open(f'{WH_R}/lr_run9.py').read(); head = src[:src.index("MODEL = os.environ")].replace("R = '/root/lr'; os.chdir(R)", "R = WH_R")
_g = {'WH_R': WH_R}; exec(head, _g); P, ANCHOR = _g['P'], _g['ANCHOR']
CFG = json.load(open(f'{WH_R}/SL8.json')); OUTD = f'{WH_OUT}/{CFG["out"]}'; os.makedirs(OUTD, exist_ok=True)
def NF(lv, x0, y0, n=64, K=16):
    C = pipe.transformer.config.in_channels; z = torch.empty(1, C, n, n)
    for cy in range(y0 // K, (y0 + n - 1) // K + 1):
        for cx in range(x0 // K, (x0 + n - 1) // K + 1):
            g = torch.Generator('cpu').manual_seed(int(hashlib.sha1(f'{CFG.get("nfkey", "nf")}{lv}:{cx},{cy}'.encode()).hexdigest()[:15], 16))
            ch = torch.randn(1, C, K, K, generator=g); ax, ay = cx * K, cy * K
            sx0, sy0 = max(ax, x0), max(ay, y0); sx1, sy1 = min(ax + K, x0 + n), min(ay + K, y0 + n)
            z[:, :, sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = ch[:, :, sy0 - ay:sy1 - ay, sx0 - ax:sx1 - ax]
    return z
def gen(imgs, prompt, seed, lat, lv=9):
    kw = dict(latents=lat) if CFG.get(f'nf{lv}', CFG.get('nf')) else {}
    return pipe(image=imgs, prompt=prompt, width=1024, height=1024, num_inference_steps=4, guidance_scale=1.0,
                generator=torch.Generator('cpu').manual_seed(int(seed)), **kw).images[0]
x_ = np.arange(1024) + 0.5; rp = np.clip(np.minimum(x_ - 224, 800 - x_) / 64, 0, 1); WT = np.outer(rp, rp)[..., None].astype(np.float32)
def rgb2lab(a):
    a = a / 255.0; a = np.where(a > 0.04045, ((a + 0.055) / 1.055) ** 2.4, a / 12.92)
    xyz = a @ np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]).T / [0.95047, 1.0, 1.08883]
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)
def lab2rgb(l):
    fy = (l[..., 0] + 16) / 116; f = np.stack([fy + l[..., 1] / 500, fy, fy - l[..., 2] / 200], -1)
    xyz = np.where(f > 0.2069, f ** 3, (f - 16 / 116) / 7.787) * [0.95047, 1.0, 1.08883]
    a = xyz @ np.array([[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]]).T
    a = np.where(a > 0.0031308, 1.055 * np.clip(a, 0, None) ** (1 / 2.4) - 0.055, 12.92 * a); return np.clip(a * 255, 0, 255)
def plan(M, w, MX, MY):   # the EDITABLE PLAN: correct the shared L8 mosaic once by the render class map (lush lawns, our water), texture kept (L untouched on veg)
    from scipy.ndimage import gaussian_filter, binary_erosion
    Cm = Image.open(f'{WH_R}/C_{w}.png').convert('RGB'); cx0, cy0 = json.load(open(f'{WH_R}/R_{w}.json')).values()
    c = np.asarray(Cm.crop((MX - 512 - cx0, MY - 512 - cy0, MX - 512 - cx0 + 2 * M.width, MY - 512 - cy0 + 2 * M.height)).resize(M.size, Image.NEAREST)) > 128
    k = c[..., 0] * 4 + c[..., 1] * 2 + c[..., 2]
    lab = rgb2lab(np.asarray(M, np.float64)); A, B = lab[..., 1], lab[..., 2]
    vw = gaussian_filter(binary_erosion(k == 3, iterations=1).astype(float), 1.5)
    dry = np.clip((A - CFG.get('ga', -26)) / 12, 0, 1) * (A < 8)   # only px drier than the green target; blossoms (a* >= 8) kept
    s = CFG.get('gs', 0.65) * vw * dry
    lab[..., 1] = A + s * (CFG.get('ga', -26) - A); lab[..., 2] = B + s * 0.5 * (CFG.get('gb', 32) - B)
    ww = gaussian_filter((k == 1).astype(float), 1.5) * CFG.get('ws', 0.8)
    lab[..., 1] += ww * (-8.5 - lab[..., 1]); lab[..., 2] += ww * (-14.5 - lab[..., 2]); lab[..., 0] += 0.4 * ww * (59 - lab[..., 0])
    return Image.fromarray(lab2rgb(lab).astype(np.uint8)), float(vw.mean()), float((s > 0.1).mean())
win = {}; cur = None
for l in open(f'{WH_R}/{CFG["jobs"]}'):
    a = l.split()
    if a[:1] == ['#MOSAIC']: cur = a[1]; win[cur] = []; continue
    if len(a) >= 5: gx, gy = map(int, a[0][3:].split(',')); win[cur].append((gx, gy, a[3], a[4]))
log = open(f'{WH_R}/log_{CFG["out"]}.txt', 'a'); n = 0
for w, T in win.items():
    R = Image.open(f'{WH_R}/R_{w}.jpg').convert('RGB'); ox, oy = json.load(open(f'{WH_R}/R_{w}.json')).values()
    TK = {(gx, gy): (k, s) for gx, gy, k, s in T}
    xs = [t[0] for t in T]; ys = [t[1] for t in T]
    AX = range(min(xs) // 1024 * 1024, max(xs) + 1024, 1024); AY = range(min(ys) // 1024 * 1024, max(ys) + 1024, 1024)
    if CFG.get('origin'): MX0, MY0 = CFG['origin']; AX = range(MX0, AX[-1] + 1, 1024); AY = range(MY0, AY[-1] + 1, 1024)   # (b8) the FULL window's anchor origin: halves share one L8
    MX, MY = AX[0], AY[0]; cw, ch_ = (AX[-1] + 1024 - MX) // 2 + 512, (AY[-1] + 1024 - MY) // 2 + 512   # L8 canvas: origin (MX-512, MY-512) L9 px
    LF = CFG.get('l8_from'); LF = f'{WH_R}/{LF}' if LF else None
    acc = np.zeros((1, 1, 3), np.float32) if LF else np.zeros((ch_, cw, 3), np.float32); ws = np.zeros((1, 1, 1), np.float32) if LF else np.zeros((ch_, cw, 1), np.float32)
    TX_ = np.array([((gx - MX) // 2 + 256, (gy - MY) // 2 + 256) for gx, gy, _, _ in T]); nsk = 0
    for Y in ([] if LF else AY):
        for X in AX:
            cx_, cy_ = (X - MX) // 2, (Y - MY) // 2   # (b8) an anchor whose 1024 canvas px no queued tile's L8 crop touches is skipped: identical output
            if CFG.get('skip_unused', 1) and not ((TX_[:, 0] < cx_ + 1024) & (TX_[:, 0] + 512 > cx_) & (TX_[:, 1] < cy_ + 1024) & (TX_[:, 1] + 512 > cy_)).any(): nsk += 1; continue
            k, s = TK.get((X, Y)) or min(TK.items(), key=lambda kv: abs(kv[0][0] - X) + abs(kv[0][1] - Y))[1]
            l8 = R.crop((X - 512 - ox, Y - 512 - oy, X + 1536 - ox, Y + 1536 - oy)).resize((1024, 1024), Image.LANCZOS); t1 = time.time()
            o8 = gen([l8], P[k], s, NF(8, (X - 512) // 32, (Y - 512) // 32), 8); n += 1
            cx, cy = (X - MX) // 2, (Y - MY) // 2   # the L8 tile's top-left in canvas px (canvas origin = MX-512 L9 -> tile at (X-512-(MX-512))/2)
            acc[cy:cy + 1024, cx:cx + 1024] += np.asarray(o8, np.float32) * WT; ws[cy:cy + 1024, cx:cx + 1024] += WT
            log.write(json.dumps(dict(l8=[X, Y], s=round(time.time() - t1, 1), key=k, seed=int(s))) + '\n'); log.flush()
    log.write(json.dumps(dict(l8_anchors=len(AX) * len(AY), skipped_unused=nsk)) + '\n'); log.flush()
    if LF: M = Image.open(LF).convert('RGB'); log.write(json.dumps(dict(l8_from=LF, origin=[MX, MY], size=M.size)) + '\n'); log.flush()
    else:
        M = Image.fromarray(np.clip(acc / np.maximum(ws, 1e-6), 0, 255).astype(np.uint8)); M.save(f'{OUTD}/l8_{w}.jpg', quality=92)
        json.dump(dict(origin_l9=[MX - 512, MY - 512], anchors=[MX, MY]), open(f'{OUTD}/l8_{w}.json', 'w'))
    if CFG.get('l8_only'): continue
    if CFG.get('plan'): M, vf, pf = plan(M, w, MX, MY); M.save(f'{OUTD}/l8plan_{w}.jpg', quality=92); log.write(json.dumps(dict(plan=w, veg=round(vf, 3), pushed=round(pf, 3))) + '\n'); log.flush()
    for gx, gy, k, s in T:
        if os.path.exists(f'{OUTD}/{gx}_{gy}.jpg'): continue   # (b8) resume
        t1 = time.time(); px, py = (gx - MX) // 2 + 256, (gy - MY) // 2 + 256
        im = M.crop((px, py, px + 512, py + 512)).resize((1024, 1024), Image.LANCZOS); l9 = R.crop((gx - ox, gy - oy, gx - ox + 1024, gy - oy + 1024))
        o = gen([im, l9], ANCHOR(P[k]), s, NF(9, gx // 16, gy // 16)); o.save(f'{OUTD}/{gx}_{gy}.jpg', quality=95); n += 1
        log.write(json.dumps(dict(out=f'{gx}_{gy}', s=round(time.time() - t1, 1), key=k, seed=int(s), nf=CFG.get('nf', 0))) + '\n'); log.flush()
