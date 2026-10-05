# raster2.py (heroprep: + depth, bbox shadow sweep): my copy of objects.id_map_z at L9 (x2 of the L8 canvas) on any L9 window + per-pixel surface height, roof flag,
# and per-prism shadow-need rasters (image-space sun sweep)
import sys, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, '/Users/daniel/code/qipu-render-work/eras2/transitions')
import stage as S
PXZ = 2 * S.PX_Z                                   # L9 px per metre of height
V = np.array([2 * S.SHV[0], 2 * S.SHV[1] + PXZ])   # image displacement of a sun ray per metre of descent (L9)
def poly(b, z, o):
    X, Y = S.w2c(np.array([p[0] for p in b['ring']]), np.array([p[1] for p in b['ring']]), z)
    return 2 * (X + S.OX) - o[0], 2 * (Y + S.OY) - o[1]
def sil(b, o, h=None):
    h = b['h'] if h is None else h; Xb, Yb = poly(b, b.get('zg', 0.0), o); Xt, Yt = Xb, Yb - h * PXZ
    n = len(Xb); P = [list(zip(Xb, Yb)), list(zip(Xt, Yt))]
    for i in range(n):
        j = (i + 1) % n; P.append([(Xb[i], Yb[i]), (Xb[j], Yb[j]), (Xt[j], Yt[j]), (Xt[i], Yt[i])])
    return P, (Xb, Yb, Xt, Yt)
def id_map_z(prisms, o, W, H, depth=False):
    M = np.full((H, W), -1, np.int32); Dz = np.full((H, W), -1e9, np.float32); Z = np.zeros((H, W), np.float32)
    for k, b in enumerate(prisms):
        h = b['h']; hp = h * PXZ; X, Y = poly(b, b.get('zg', 0.0), o)
        x0, x1 = int(max(0, np.floor(X.min()) - 1)), int(min(W, np.ceil(X.max()) + 2)); y0, y1 = int(max(0, np.floor(Y.min() - hp) - 1)), int(min(H, np.ceil(Y.max()) + 2))
        if x1 <= x0 or y1 <= y0: continue
        P, (Xb, Yb, Xt, Yt) = sil(b, o)
        im = Image.new('L', (x1 - x0, y1 - y0)); dr = ImageDraw.Draw(im)
        for p in P: dr.polygon([(float(x) - x0, float(y) - y0) for x, y in p], fill=1)
        rim = Image.new('L', (x1 - x0, y1 - y0)); ImageDraw.Draw(rim).polygon([(float(x) - x0, float(y) - y0) for x, y in zip(Xt, Yt)], fill=1)
        m = np.asarray(im) > 0; rf = np.asarray(rim) > 0
        if not m.any(): continue
        xc = np.arange(x0, x1) + 0.5; yn = np.full(x1 - x0, -np.inf); n = len(X)
        for i in range(n):
            xa, ya, xb, yb = X[i], Y[i], X[(i + 1) % n], Y[(i + 1) % n]
            if abs(xb - xa) < 1e-6: continue
            sel = (xc >= min(xa, xb)) & (xc <= max(xa, xb)); yn[sel] = np.maximum(yn[sel], ya + (xc[sel] - xa) * (yb - ya) / (xb - xa))
        ok = np.isfinite(yn)
        if not ok.any(): yn[:] = Y.max()
        else:
            idx = np.nonzero(ok)[0]; yn = np.where(ok, yn, yn[idx[np.clip(np.searchsorted(idx, np.arange(len(yn))), 0, len(idx) - 1)]])
        rows = (np.arange(y0, y1, dtype=np.float32) + 0.5)[:, None]
        dz = np.where(rows >= yn[None, :] - hp, yn[None, :], rows + hp).astype(np.float32)
        zp = np.where(rf, h, np.clip((yn[None, :] - rows) / PXZ, 0, h)).astype(np.float32)
        sl = (slice(y0, y1), slice(x0, x1)); w_ = m & (dz > Dz[sl])
        Dz[sl][w_] = dz[w_]; M[sl][w_] = k; Z[sl][w_] = zp[w_]
    return (M, Z, Dz) if depth else (M, Z)
def hull(pts):
    from scipy.spatial import ConvexHull
    pts = np.asarray(pts); return pts[ConvexHull(pts).vertices]
def shadow_need(b, o, W, H, K=40, extra=6.0):
    """per pixel the smallest height (m) of prism b whose shadow sweep covers it (inf = never); conservative (convex hull)"""
    need = np.full((H, W), np.inf, np.float32); h = b['h']
    for q in np.linspace(1.0 / K, 1.0, K)[::-1]:
        hq = q * h; _, (Xb, Yb, Xt, Yt) = sil(b, o, hq); t = hq + b.get('zg', 0.0) + extra
        pts = np.concatenate([np.c_[Xb, Yb], np.c_[Xt, Yt], np.c_[Xt + t * V[0], Yt + t * V[1]], np.c_[Xb + (t - hq) * V[0], Yb + (t - hq) * V[1]]])
        if pts[:, 0].max() < 0 or pts[:, 0].min() > W or pts[:, 1].max() < 0 or pts[:, 1].min() > H: continue
        hp_ = hull(pts); bx0, by0 = int(max(0, np.floor(hp_[:, 0].min()))), int(max(0, np.floor(hp_[:, 1].min())))
        bx1, by1 = int(min(W, np.ceil(hp_[:, 0].max()) + 1)), int(min(H, np.ceil(hp_[:, 1].max()) + 1))
        if bx1 <= bx0 or by1 <= by0: continue
        im = Image.new('L', (bx1 - bx0, by1 - by0)); ImageDraw.Draw(im).polygon([(float(p[0]) - bx0, float(p[1]) - by0) for p in hp_], fill=1)
        need[by0:by1, bx0:bx1][np.asarray(im) > 0] = hq
    return need
