"""Per photo: k-means colour clusters (sky masked), and contact sheets photo + numbered swatches, 2 types per sheet."""
import json, os, sys, numpy as np
from PIL import Image, ImageDraw
S = json.load(open('sources_raw.json')); K = 8; rs = np.random.RandomState(0)
def s2l(a): a = a / 255.0; return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
def kmeans(X, k, it=25):
    C = X[rs.choice(len(X), k, replace=False)]
    for _ in range(it):
        d = ((X[:, None, :] - C[None]) ** 2).sum(-1); l = d.argmin(1)
        C = np.array([X[l == j].mean(0) if (l == j).any() else C[j] for j in range(k)])
    return C, np.bincount(l, minlength=k) / len(X)
CL = {}
for ty, ph in S.items():
    for t, e in ph.items():
        im = Image.open(e['file']).convert('RGB'); im.thumbnail((200, 200)); a = np.asarray(im).astype(np.float32)
        H, W, _ = a.shape; yy = np.repeat(np.arange(H)[:, None], W, 1) / H
        r, g, b = a[..., 0], a[..., 1], a[..., 2]; L = a.mean(-1)
        sky = ((b > r + 12) & (L > 120) & (yy < 0.55)) | (L > 240)
        X = a[~sky].reshape(-1, 3)
        if len(X) < 500: continue
        C, w = kmeans(X, K); o = np.argsort(-w)
        CL[e['file']] = [[*map(int, C[j]), round(float(w[j]), 3)] for j in o]
json.dump(CL, open('clusters.json', 'w'))
tys = list(S); os.makedirs('sheets', exist_ok=True)
for si in range(0, len(tys), 2):
    sheet = Image.new('RGB', (4 * 260, 4 * 250), 'white'); d = ImageDraw.Draw(sheet)
    for k_, ty in enumerate(tys[si:si + 2]):
        for i, (t, e) in enumerate(S[ty].items()):
            col, row = i % 4, k_ * 2 + i // 4; x0, y0 = col * 260, row * 250
            im = Image.open(e['file']).convert('RGB'); im.thumbnail((255, 200)); sheet.paste(im, (x0, y0))
            d.text((x0 + 3, y0 + 2), f'{ty[:14]} {i}', fill='yellow'); d.text((x0 + 4, y0 + 3), f'{ty[:14]} {i}', fill='black')
            for j, c in enumerate(CL.get(e['file'], [])):
                d.rectangle([x0 + j * 32, y0 + 205, x0 + j * 32 + 30, y0 + 235], fill=tuple(c[:3])); d.text((x0 + j * 32 + 2, y0 + 236), str(j), fill='black')
    sheet.save(f'sheets/sheet_{si // 2}.jpg', quality=82)
print('ok', len(CL))
