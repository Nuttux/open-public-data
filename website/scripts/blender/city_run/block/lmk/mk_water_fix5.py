"""mk_water_fix5.py <name> x0 y0 x1 y1 [thr]: deterministic 2D water unification (no GPU). Finds sparkle/AI-patch water (high local energy inside the water colour mask) + the dark outlines around it,
and replaces it with a clone of clean flat water from the same rows (horizontal shifts), tone-matched with a low-frequency field of the surrounding clean water. Feathered alpha.
Writes patches/<name>_NN/{patch.png, alpha.png, canvas.json} per chunk (alpha only inside the chunk core) + qa/<name>_*."""
import sys, os, json
from lib import *
from scipy import ndimage as nd
H = os.path.dirname(os.path.abspath(__file__)); CH, MG = 4096, 400
def G(a, s): return nd.gaussian_filter(a, s, mode='nearest')
def fix(im, thr, core):
    r, g, b = im[..., 0], im[..., 1], im[..., 2]; L = im.mean(2)
    water = (b > r + 35) & (b > g + 8); water2 = (b > r + 12) & (b >= g - 2)   # water2 also catches the dark blue-grey gaps between glints and teal shading
    gl = (L > 130) & (np.abs(b - r) < 50) & (b >= r - 15) & ~water                      # white glints (not sand: sand has b << r)
    sv = nd.binary_dilation(nd.binary_opening(gl, iterations=5), iterations=4); lab, n = nd.label(sv); sl = nd.find_objects(lab)
    big = np.zeros(n + 1, bool)
    for i, o in enumerate(sl, 1): big[i] = max(o[0].stop - o[0].start, o[1].stop - o[1].start) >= 70   # long grey things (bridge, piers) stay; blob-sized white glints go
    protect = sv & big[lab]; gl &= ~protect
    Wc = nd.binary_closing(water | water2 | gl, iterations=8); Wc = nd.binary_opening(Wc, iterations=2)
    inner = nd.binary_erosion(Wc, iterations=10)
    hp = L - G(L, 4); en = np.sqrt(G(hp ** 2 * inner, 10) / np.maximum(G(inner.astype(np.float32), 10), 1e-3)); en[G(inner.astype(np.float32), 10) < 0.2] = 0
    spark = (en > thr) & Wc & (G(gl.astype(np.float32), 12) > 0.002)   # real sparkle has glints; bridge shadows / ripples do not
    spark = nd.binary_opening(spark, iterations=3)
    zone = nd.binary_dilation(spark, iterations=30)
    for i, o in enumerate(sl, 1):
        m = lab[o] == i
        if big[i] and (nd.binary_dilation(spark, iterations=10)[o] & m).sum() > 0.5 * m.sum(): gl[o] |= m; protect[o] &= ~m   # a blob of white inside sparkle is glints, not a pier
    glz = gl & zone
    solid = nd.binary_opening(~(water | gl), iterations=12); solid = nd.binary_dilation(solid, iterations=2)   # land, bridge, trees: never touched
    solid0 = nd.binary_opening(~(water | gl), iterations=12) | protect
    S = nd.binary_dilation(spark | glz, iterations=14) & ~solid0
    S = nd.binary_closing(S, iterations=6) & ~solid0
    Cl = Wc & ~nd.binary_dilation(S, iterations=40) & nd.binary_erosion(Wc, iterations=28)
    if Cl.sum() < 1000: return im, np.zeros(Wc.shape, np.float32), Wc & False
    ref = np.median(im[Cl], 0); sm = np.stack([G(im[..., k], 5) for k in range(3)], -1)
    Cl &= (np.abs(sm - ref).sum(2) < 16) & (en < 9)   # tone-consistent flat water only (no reflections, no shore shading)
    Cl = nd.binary_erosion(Cl, iterations=6)
    if Cl.sum() < 1000: return im, np.zeros(Wc.shape, np.float32), Wc & False
    medL = np.median(L[Cl])
    Cl_loose = Wc & (np.abs(sm - ref).sum(2) < 40) & ~nd.binary_dilation(solid0, iterations=10)
    near = nd.binary_dilation(S, iterations=60)
    pz = nd.binary_dilation(protect, iterations=90)   # shadows / ripples around bridge + piers are real: no anomaly or outline rules there
    near = (G(S.astype(np.float32), 120) > 0.004) & ~pz   # within ~400 px of sparkle: the teal shallows with a hard straight edge sit next to it
    anom = Wc & near & ~pz & (np.abs(im - ref).sum(2) > 18) & nd.binary_erosion(Wc, iterations=4)
    anom = nd.binary_opening(anom, iterations=2)
    lab3, n3 = nd.label(anom); sz3 = np.bincount(lab3.ravel()); sz3[0] = 0; anom &= sz3[lab3] > 4000
    S = S | (nd.binary_dilation(anom, iterations=4) & Wc & ~pz)
    dark = Wc & nd.binary_dilation(S, iterations=6) & (L < medL - 30) & ~nd.binary_dilation(solid, iterations=30) & ~pz
    R = nd.binary_closing(S | dark, iterations=3) & ~solid0 & ~nd.binary_dilation(protect, iterations=70)
    Nn = ~water; solidN = nd.binary_opening(Nn, iterations=4)   # land / trees / piers are wider than ~8 px; glint lattices and ripples are thinner
    keep = nd.binary_dilation(solidN, iterations=5)   # never touched
    R &= ~keep
    R = nd.binary_opening(R, iterations=1)
    rest = Wc & ~R & ~solid0; lab2, n2 = nd.label(rest); Rd = nd.binary_dilation(R, iterations=2)
    for i, o in enumerate(nd.find_objects(lab2), 1):   # small islands of old patch water mostly enclosed by the cleaned area (the odd pocket with a dark rim): clean them too
        m = lab2[o] == i; a_ = m.sum()
        if a_ > 150000 or a_ < 50: continue
        ring = nd.binary_dilation(m, iterations=3) & ~m
        if (Rd[o][ring]).mean() > 0.55 and not (protect[o] & m).any(): R[o] |= m
    if R.sum() == 0: return im, np.zeros(R.shape, np.float32), R
    Cf = Cl.astype(np.float32)
    def low(sig):
        return np.stack([G(im[..., k] * Cf, sig) for k in range(3)], -1) / np.maximum(G(Cf, sig), 1e-4)[..., None], G(Cf, sig)
    lo, w = low(60); lo2, w2 = low(250); lo = np.where(w[..., None] > 0.02, lo, lo2)
    out = im.copy(); todo = R.copy(); h, wd = L.shape
    shifts = [(dx, 0) for d in range(1, 16) for dx in (d * 260, -d * 260)] + [(dx, dy) for dy in (30, -30, 60, -60) for dx in (500, -500, 1100, -1100)]
    for dx, dy in shifts:
        if not todo.any(): break
        srcC = np.roll(Cl, (dy, dx), (0, 1)); ok = todo & srcC
        if not ok.any(): continue
        src = np.roll(im, (dy, dx), (0, 1)); srclo = np.roll(lo, (dy, dx), (0, 1))
        out[ok] = lo[ok] + (src[ok] - srclo[ok]); todo &= ~ok
    filled = R & ~todo
    band = nd.binary_dilation(filled, iterations=14) & ~nd.binary_dilation(filled, iterations=3) & Cl_loose
    if band.sum() > 200:
        d = (im - out) * band[..., None]; w = band.astype(np.float32)
        corr = np.stack([G(d[..., k], 40) for k in range(3)], -1) / np.maximum(G(w, 40), 1e-3)[..., None]
        dist = nd.distance_transform_edt(~nd.binary_erosion(filled, iterations=1)); wt = np.exp(-dist / 1.0)  # placeholder, replaced below
        din = nd.distance_transform_edt(filled)   # distance from the region edge, inside
        wt = np.exp(-din / 80.0)[..., None]
        out = np.where(filled[..., None], out + corr * wt, out)
    a = np.clip(G(filled.astype(np.float32), 3.0) * 1.5, 0, 1); a[nd.binary_erosion(filled, iterations=4)] = 1
    cy0, cy1, cx0, cx1 = core; m = np.zeros_like(a); m[cy0:cy1, cx0:cx1] = 1
    return out, a * m, R
if __name__ == '__main__':
    name = sys.argv[1]; X0, Y0, X1, Y1 = map(int, sys.argv[2:6]); thr = float(sys.argv[6]) if len(sys.argv) > 6 else 12.
    NP = int(os.environ.get('NPARTS', '4')); Wd, Ht = X1 - X0, Y1 - Y0
    num = np.zeros((Ht, Wd, 3), np.float32); den = np.zeros((Ht, Wd), np.float32); wsum = np.zeros((Ht, Wd), np.float32)   # chunk results are blended with ramps so no seam at chunk borders
    def ramp(n, lo_open, hi_open):
        t = np.ones(n, np.float32); k = min(MG, n // 2)
        if lo_open: t[:k] = np.linspace(0.02, 1, k)
        if hi_open: t[-k:] = np.minimum(t[-k:], np.linspace(1, 0.02, k))
        return t
    k = 0
    for y in range(Y0, Y1, 2600):
        for x in range(X0, X1, CH):
            x1, y1 = min(x + CH, X1), min(y + 2600, Y1); cx0, cy0, cx1, cy1 = x - MG, y - MG, x1 + MG, y1 + MG
            im = np.asarray(tiles(cx0, cy0, cx1, cy1)).astype(np.float32)
            out, a, R = fix(im, thr, (0, im.shape[0], 0, im.shape[1]))
            # chunk covers x-MG..x1+MG; weight = ramp over its outer MG on all sides (the interior of the chunk wins over the neighbour's margin)
            wy = np.concatenate([np.linspace(0.02, 1, MG), np.ones(y1 - y), np.linspace(1, 0.02, MG)]).astype(np.float32); wx = np.concatenate([np.linspace(0.02, 1, MG), np.ones(x1 - x), np.linspace(1, 0.02, MG)]).astype(np.float32)
            w = wy[:, None] * wx[None, :]
            gx0, gy0 = max(cx0, X0), max(cy0, Y0); gx1, gy1 = min(cx1, X1), min(cy1, Y1)
            sl = (slice(gy0 - cy0, gy1 - cy0), slice(gx0 - cx0, gx1 - cx0)); gs = (slice(gy0 - Y0, gy1 - Y0), slice(gx0 - X0, gx1 - X0))
            aw = (a * w)[sl]; num[gs] += out[sl] * aw[..., None]; den[gs] += aw; wsum[gs] += w[sl]
            k += 1; print(k, x, y, int(R.sum()), flush=True)
    A = den / np.maximum(wsum, 1e-6); P = num / np.maximum(den, 1e-6)[..., None]
    os.makedirs(f'{H}/qa', exist_ok=True)
    for p in range(NP):
        px0 = X0 + (Wd * p) // NP; px1 = X0 + (Wd * (p + 1)) // NP
        d = f'{H}/patches/{name}_{p:02d}'; os.makedirs(d, exist_ok=True)
        Image.fromarray(P[:, px0 - X0:px1 - X0].clip(0, 255).astype(np.uint8)).save(f'{d}/patch.png'); Image.fromarray((A[:, px0 - X0:px1 - X0].clip(0, 1) * 255).astype(np.uint8)).save(f'{d}/alpha.png')
        json.dump(dict(canvas=[px0, Y0, px1, Y1], order=5), open(f'{d}/canvas.json', 'w'))
    print('DONE', flush=True)
