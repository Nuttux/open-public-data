"""Pre-toned block render mosaic = the AI's INPUT only (never shown). Root-cause fixes for three hallucinations of the no-reference recipe:
  1. flat blue = water: the render's sky-lit asphalt and shadows on flat dry ground are blue (b* -7..-12), like the render's water
     (streets painted as canals #54 #55, a shadow on a lot painted as water #46). Streets (class 5), dry ground (0) and dry 'other' (7,
     > 40 px from water): b* pushed up to -1 (dB = max(0, -1 - b*)), 1.5 px soft class edges.
  2. streets get a light asphalt grain (L* noise seeded by the global 64-px cell: deterministic, seam-free), so a street reads as asphalt.
  3. the render's roof 'camo' (low-contrast blotches of its roof texture, which the strict edit copies: #52 #67 #72): roof px (class 2)
     edge-preserving smoothing of L*a*b* at the 20-px scale (bilateral, range ~6 L*), units / pitch edges / parapets kept.
  4. (ROOFN=1) grey roofs next to the bay read as water (pier-shed roofs #14 painted as bay in 5 of 10 samples): the render's grey roofs carry
     the same sky-blue cast (b* -4..-7) as its water; low-chroma roof px (class 2, C* < 12): b* raised to +1 (dB = max(0, 1 - b*)).
env CAMO=0 skips 3.   python3 pretone_block.py <block i_j> <out.jpg>"""
import sys, json, numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd
Image.MAX_IMAGE_PIXELS = None
import os
BLK, OUT = sys.argv[1], sys.argv[2]; GRAIN = 2.5; CAMO = int(os.environ.get('CAMO', 1)); ROOFN = int(os.environ.get('ROOFN', 0))
B = os.environ.get('PT_DIR', f'/Users/daniel/code/qipu-render-work/ai/pilot/blocks/{BLK}'); meta = json.load(open(f'{B}/meta.json')); OX, OY = meta['ox'], meta['oy']
R = Image.open(f'{B}/R.jpg').convert('RGB'); CL = Image.open(f'{B}/R.class.png'); W, H = R.size
M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]], np.float32); WP = np.array([0.9505, 1, 1.089], np.float32)
def to_lab(a):
    c = a.astype(np.float32) / 255; c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92); xyz = c @ M.T / WP
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116); return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)
def to_rgb(L):
    fy = (L[..., 0] + 16) / 116; f = np.stack([fy + L[..., 1] / 500, fy, fy - L[..., 2] / 200], -1)
    xyz = np.where(f > 0.206893, f ** 3, (f - 16 / 116) / 7.787) * WP; c = np.clip(xyz @ np.linalg.inv(M).T, 0, 1)
    return (np.where(c > 0.0031308, 1.055 * c ** (1 / 2.4) - 0.055, 12.92 * c) * 255 + 0.5).astype(np.uint8)
def noise_rows(y0, y1):   # position-seeded noise: 64 px cells keyed by the global cell index
    out = np.zeros((y1 - y0, W), np.float32)
    for cy in range(y0 // 64, (y1 + 63) // 64):
        for cx in range(W // 64 + 1):
            g = np.random.default_rng((cy + OY // 64) * 100003 + cx + OX // 64).normal(0, GRAIN, (64, 64)).astype(np.float32)
            a0, a1 = max(y0, cy * 64), min(y1, cy * 64 + 64); b1 = min(W, cx * 64 + 64)
            if a0 < a1 and cx * 64 < b1: out[a0 - y0:a1 - y0, cx * 64:b1] = g[a0 - cy * 64:a1 - cy * 64, :b1 - cx * 64]
    return out
res = np.zeros((H, W, 3), np.uint8); P = 64
for y in range(0, H, 1024):
    ya, yb = max(0, y - P), min(H, y + 1024 + P)
    r = np.asarray(R.crop((0, ya, W, yb))); cl = np.asarray(CL.crop((0, ya, W, yb)).convert('RGB'))
    code = (cl[..., 0] > 128) * 4 + (cl[..., 1] > 128) * 2 + (cl[..., 2] > 128)
    wat = code == 1; nearw = nd.binary_dilation(wat[::4, ::4], iterations=10); nearw = np.kron(nearw, np.ones((4, 4), bool))[:wat.shape[0], :wat.shape[1]]
    L = to_lab(r)
    # 3. roof camo: bilateral on L*a*b* (as 8-bit) at 1/2 res, roof px only, blended with a soft roof mask
    for cls_, sc_, ss_ in (((2, 32, 16), (4, 20, 12)) if CAMO else ()):   # roofs: strong; landmarks: gentler (clock faces, arches, windows are high contrast: kept)
        roof = code == cls_
        if not roof.any(): continue
        h2, w2 = L.shape[0] // 2, L.shape[1] // 2
        l8 = np.clip(np.stack([L[..., 0] * 2.55, L[..., 1] + 128, L[..., 2] + 128], -1), 0, 255).astype(np.uint8)
        s = cv2.resize(l8, (w2, h2), interpolation=cv2.INTER_AREA)
        bf = cv2.bilateralFilter(s, d=-1, sigmaColor=sc_, sigmaSpace=ss_)
        bu = cv2.resize(bf, (L.shape[1], L.shape[0]), interpolation=cv2.INTER_LINEAR).astype(np.float32)
        low_in = cv2.resize(s, (L.shape[1], L.shape[0]), interpolation=cv2.INTER_LINEAR).astype(np.float32)
        Lsm = np.stack([(l8[..., 0] - low_in[..., 0] + bu[..., 0]) / 2.55, l8[..., 1] - low_in[..., 1] + bu[..., 1] - 128, l8[..., 2] - low_in[..., 2] + bu[..., 2] - 128], -1)
        a = nd.gaussian_filter(nd.binary_erosion(roof, iterations=2).astype(np.float32), 1.0)[..., None]
        L = Lsm * a + L * (1 - a)
    # 1. blue flat surfaces -> neutral (streets, dry ground, dry 'other')
    flat = (code == 5) | (((code == 0) | (code == 7)) & ~nearw)
    fs = nd.gaussian_filter(flat.astype(np.float32), 1.5)
    L[..., 2] += np.maximum(0, -1 - L[..., 2]) * fs
    # 4. grey roofs: sky-blue cast removed (not blue / coloured roofs: C* >= 12 kept)
    if ROOFN:
        rf = nd.gaussian_filter(((code == 2) & (np.hypot(L[..., 1], L[..., 2]) < 12)).astype(np.float32), 1.5)
        L[..., 2] += np.maximum(0, 1 - L[..., 2]) * rf
    # 2. asphalt grain on streets
    st = nd.gaussian_filter((code == 5).astype(np.float32), 1.5)
    L[..., 0] += nd.gaussian_filter(noise_rows(ya, yb), 0.7) * 2.0 * st
    res[y:min(H, y + 1024)] = to_rgb(L)[y - ya:y - ya + min(1024, H - y)]
    print('rows', y, flush=True)
Image.fromarray(res).save(OUT, quality=95); print('PRETONE_DONE', OUT)
