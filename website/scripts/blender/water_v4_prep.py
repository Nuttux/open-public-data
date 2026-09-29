"""water_v4_prep.py [out dir]: v4_depth.png (16-bit, R = sqrt(depth / 60 m), row 0 = north) + v4_depth.json (world frame) from
bathy_8m.npy (tools/bathy.py: USGS 3DEP topobathy 2 m, public domain, flattened cells filled), for water_v4.py. Default out = the
water dir water2_hq reads (WATER_DIR or /Users/daniel/code/qipu-render-work/water)."""
import json, os, sys, numpy as np
from PIL import Image
B = '/Users/daniel/code/qipu-render-work/landmarks/bathy_8m'
OUT = sys.argv[1] if len(sys.argv) > 1 else (os.environ.get('WATER_DIR') or '/Users/daniel/code/qipu-render-work/water')
q = json.load(open(B + '.json')); d = np.nan_to_num(np.load(B + '.npy').astype(np.float32), nan=0.0)
ny, nx = d.shape; DM = 60.0
v = np.sqrt(np.clip(d / DM, 0, 1)); Image.fromarray((v * 65535 + 0.5).astype(np.uint16)).save(os.path.join(OUT, 'v4_depth.png'))
x0, y1, r = q['x0'], q['y1'], q['res']
json.dump(dict(x0=x0, x1=x0 + nx * r, y0=y1 - ny * r, y1=y1, res=r, dmax=DM, source=q.get('source', '')), open(os.path.join(OUT, 'v4_depth.json'), 'w'))
print('v4_depth', nx, ny, 'frame', x0, y1 - ny * r, x0 + nx * r, y1, '->', OUT)

# ── v4d: ocean-spectrum wave tiles (periodic FFT height fields) for water_v4.py V4_FFT=1 ─────────────────────────────
# Directional JONSWAP (Hasselmann et al. 1973) for the bay's afternoon westerly: U10 ~ 6 m/s, fetch ~ 10 km -> peak
# f_p = 3.5 (g^2 / (U F))^0.33 ~ 0.41 Hz (lambda_p ~ 9 m), gamma 3.3, cos^2s spreading (s = 6, downwind = +x of the tile),
# deep-water dispersion. Two tiles of incommensurate size (61.3 m, 97.1 m; 1024 px = 6.0 / 9.5 cm) with independent phases:
# the shader sums them at different rotations and offsets (no visible repetition), each normalised to RMS slope / sqrt(2).
def wave_tiles(out, U=6.0, F=10000.0, seed=2909):
    g = 9.81; fp = 3.5 * (g * g / (U * F)) ** 0.33; kp = (2 * np.pi * fp) ** 2 / g; alpha = 0.076 * (U * U / (F * g)) ** 0.22
    meta = {}
    for name, Lt in (('v4_wave1', 61.3), ('v4_wave2', 97.1)):
        n = 1024; rng = np.random.default_rng(seed + int(Lt * 10))
        k1 = 2 * np.pi * np.fft.fftfreq(n, Lt / n); KX, KY = np.meshgrid(k1, k1); K = np.hypot(KX, KY); K[0, 0] = 1e-6
        w = np.sqrt(g * K); f = w / (2 * np.pi)
        sig = np.where(f <= fp, 0.07, 0.09); r = np.exp(-((f - fp) ** 2) / (2 * sig ** 2 * fp ** 2))
        Sf = alpha * g * g * (2 * np.pi) ** -4 * f ** -5 * np.exp(-1.25 * (fp / f) ** 4) * 3.3 ** r      # JONSWAP S(f)
        th = np.arctan2(KY, KX); D = np.maximum(np.cos(th / 2), 0) ** 12; D /= D.sum() / (K > 0).sum() + 1e-12     # cos^2s(theta/2), s = 6
        Sk = Sf * (g / (2 * w)) / (2 * np.pi) / K * D                                                             # S(k) dkx dky
        Sk[0, 0] = 0; Sk[K > np.pi * n / Lt * 0.9] = 0                                                           # below Nyquist
        dk = (2 * np.pi / Lt) ** 2; amp = np.sqrt(Sk * dk / 2)
        Z = amp * (rng.normal(size=(n, n)) + 1j * rng.normal(size=(n, n)))
        h = np.real(np.fft.ifft2(Z)) * n * n
        gy, gx = np.gradient(h, Lt / n); s_rms = float(np.sqrt((gx ** 2 + gy ** 2).mean()))
        h = h / s_rms * (1 / np.sqrt(2))                              # RMS slope 1/sqrt(2) per tile; the shader scales (V4_FSLOPE)
        lo, hi = float(h.min()), float(h.max())
        Image.fromarray(((h - lo) / (hi - lo) * 65535 + 0.5).astype(np.uint16)).save(os.path.join(out, name + '.png'))
        meta[name] = dict(L=Lt, lo=lo, hi=hi, rms=float(h.std()))
    json.dump(dict(tiles=meta, U=U, F=F, fp=fp, lambda_p=float(2 * np.pi / kp), note='JONSWAP, cos^2s s=6, RMS slope 0.707 per tile before V4_FSLOPE'), open(os.path.join(out, 'v4_waves.json'), 'w'), indent=1)
    print('v4 wave tiles', meta, 'lambda_p', round(2 * np.pi / kp, 1), 'm')

wave_tiles(OUT)
