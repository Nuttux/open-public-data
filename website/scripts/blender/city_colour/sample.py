"""Sample the boxed wall/trim/roof/glass patches, exposure- and white-balance-corrected per photo.
Grey-card stand-in: each photo's near-neutral pixels (concrete, asphalt, white trim, overcast sky excluded) average to grey
(per-channel gain clipped to +-12 %), and its exposure is set so the 96th-percentile luminance of the non-sky scene sits at
0.70 linear (gain clipped 0.8-1.35). Box value = per-channel median in linear, back to display sRGB. -> samples.json"""
import glob, json, numpy as np
from PIL import Image
def s2l(a): return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
def l2s(a): a = np.clip(a, 0, 1); return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)
B = [b for f in sorted(glob.glob('boxes_*.json')) for b in json.load(open(f))]
out = []; cache = {}
for ph, ty, role, (x0, y0, x1, y1) in B:
    if ph not in cache:
        a = np.asarray(Image.open(f'photos/{ph}.jpg').convert('RGB')).astype(np.float32) / 255.0; H, W, _ = a.shape
        lin = s2l(a); L = lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        yy = np.repeat(np.arange(H)[:, None], W, 1) / H
        sky = ((a[..., 2] > a[..., 0] + 0.05) & (a.mean(-1) > 0.45) & (yy < 0.6)) | (a.min(-1) > 0.93)
        mx, mn = lin.max(-1), lin.min(-1); neutral = ~sky & ((mx - mn) < 0.12 * mx + 0.01) & (L > np.percentile(L[~sky], 20)) & (L < np.percentile(L[~sky], 97))
        wb = np.ones(3, np.float32)
        if neutral.sum() > 200:
            m = lin[neutral].mean(0); wb = np.clip(m.mean() / np.maximum(m, 1e-4), 0.88, 1.12)
        p96 = np.percentile((lin * wb)[~sky] @ np.array([0.2126, 0.7152, 0.0722]), 96)
        ex = float(np.clip(0.70 / max(p96, 1e-3), 0.8, 1.35)); cache[ph] = (lin, wb, ex, (H, W))
    lin, wb, ex, (H, W) = cache[ph]
    p = lin[int(y0 * H):max(int(y1 * H), int(y0 * H) + 1), int(x0 * W):max(int(x1 * W), int(x0 * W) + 1)].reshape(-1, 3)
    raw = np.median(p, 0); cor = raw * wb * ex
    out.append(dict(photo=ph, type=ty, role=role, box=[x0, y0, x1, y1], raw=[round(float(v), 3) for v in l2s(raw)],
                    rgb=[round(float(v), 3) for v in l2s(cor)], wb=[round(float(v), 3) for v in wb], exposure=round(ex, 3), n=int(len(p))))
json.dump(out, open('samples.json', 'w'), indent=0)
for o in out: print(o['type'][:12], o['role'][:5], o['photo'][-8:], 'raw', o['raw'], '->', o['rgb'], 'ex', o['exposure'])
