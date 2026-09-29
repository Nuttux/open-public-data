"""city/run/quilt_stream.py: combo/complete/tp_quilt_c.py (stride-640 seam quilting, whole-object ownership, WALL cost, FE feather)
STREAMED by tile row, for super-blocks that do not fit in the Mac's RAM (tp_quilt_c keeps every row strip + the whole float32 canvas:
~25 GB for a b8-size SB; this keeps ~2 strips: ~1 GB). Same arithmetic, same order of operations: the output is identical (checked by
`python3 quilt_stream.py test`, which runs both on a block52_v7 sub-region and compares the bytes).
Why it is exact: a vertical seam lives inside one row strip (local), and the horizontal seam between rows r and r+1 is one DP over the
full width in the band [yb - BAND, yb + BAND) that no other seam touches; canvas rows above the next band are final and are emitted.
API: quilt(xs, ys, load(gx, gy) -> float32 TSxTSx3, walls(x0, y0, w, h) -> bool, emit(row0, rows_float32, seam_rows_bool)) -> stats
     xs / ys = tile origins (stride S), canvas origin (xs[0], ys[0]); emit gets canvas rows in order, each exactly once.
python3 quilt_stream.py test"""
import os, sys, json, numpy as np
from scipy import ndimage as nd
S = int(os.environ.get('S', 640)); TS = 1024; HO = (TS - S) // 2; BAND = int(os.environ.get('BAND', HO - 56)); WALL = float(os.environ.get('WALL', 60)); FE = int(os.environ.get('FE', 6))
# --- verbatim from tp_quilt_c.py (seam, reachable, sides, seam_owned) ---
def seam(E):
    h, w = E.shape; M = E.copy(); Bk = np.zeros((h, w), np.int8)
    for yy in range(1, h):
        l = np.r_[np.inf, M[yy - 1, :-1]]; c = M[yy - 1]; r = np.r_[M[yy - 1, 1:], np.inf]; st = np.stack([l, c, r]); k = st.argmin(0)
        M[yy] += st[k, np.arange(w)]; Bk[yy] = k - 1
    if not np.isfinite(M[-1].min()): return None
    x = np.zeros(h, int); x[-1] = int(M[-1].argmin())
    for yy in range(h - 1, 0, -1): x[yy - 1] = min(w - 1, max(0, x[yy] + Bk[yy, x[yy]]))
    return x
def reachable(lo, hi):
    i = np.arange(lo.size); L = np.maximum(np.maximum.accumulate(lo + i) - i, (np.maximum.accumulate((lo - i)[::-1]))[::-1] + i)
    U = np.minimum(np.minimum.accumulate(hi - i) + i, (np.minimum.accumulate((hi + i)[::-1]))[::-1] - i); return bool((L <= U).all())
def sides(wl, c0, c1, eA, eB, minpx=150):
    lab, n = nd.label(wl); h = wl.shape[0]; lo = np.zeros(h, int); hi = np.full(h, c1 - c0 - 1, int); used = 0
    if n == 0: return None
    objs = nd.find_objects(lab); sizes = nd.sum(wl, lab, np.arange(1, n + 1))
    for i in np.argsort(-sizes):
        if sizes[i] < minpx: break
        sl = objs[i]; mnx, mxx = sl[1].start, sl[1].stop - 1; canA = mxx < c1 - FE - 1; canB = mnx >= c0 + FE + 1
        if not (canA or canB): continue
        side = 'A' if canA and (not canB or (eA - mxx) >= (mnx - eB)) else 'B'; rows = np.arange(sl[0].start, sl[0].stop); sub = lab[sl] == i + 1
        if side == 'A':
            mx = np.where(sub.any(1), sl[1].start + (sub.shape[1] - 1 - np.argmax(sub[:, ::-1], 1)), -1); nlo = lo.copy(); r = rows[mx >= 0]
            nlo[r] = np.maximum(nlo[r], mx[mx >= 0] - c0 + FE + 1)
            if not reachable(nlo, hi): continue
            lo = nlo
        else:
            mn = np.where(sub.any(1), sl[1].start + np.argmax(sub, 1), 10 ** 9); nhi = hi.copy(); r = rows[mn < 10 ** 9]
            nhi[r] = np.minimum(nhi[r], mn[mn < 10 ** 9] - c0 - FE - 1)
            if not reachable(lo, nhi): continue
            hi = nhi
        used += 1
    return (lo, hi) if used else None
def seam_owned(E, bnd):
    if bnd is None: return seam(E)
    lo, hi = bnd; Ec = E.copy(); cc = np.arange(E.shape[1])[None, :]; Ec[(cc < lo[:, None]) | (cc > hi[:, None])] = np.inf
    s = seam(Ec); return seam(E) if s is None else s
def cost(a, b, wl): d = np.abs(a - b).mean(-1); return nd.gaussian_filter(d, 2.0) + WALL * nd.gaussian_filter(wl.astype(np.float32), 1.0), d
# --- the streamed loop ---
def quilt(xs, ys, load, walls, emit):
    sx0 = xs[0]; SW = xs[-1] + TS - sx0; y0 = ys[0]; rec = []
    def strip_of(gy):
        strip = np.zeros((TS, SW, 3), np.float32); sm = np.zeros((TS, SW), bool)
        for n_, gx in enumerate(xs):
            t = load(gx, gy)
            if n_ == 0: strip[:, :TS] = t; continue
            xb = gx + HO - sx0; a0, a1 = xb - BAND, xb + BAND; A = strip[:, a0:a1]; Bt = t[:, a0 - (gx - sx0):a1 - (gx - sx0)]
            bnd = sides(walls(sx0 + xb - 512, gy, 1024, TS), 512 - BAND, 512 + BAND, 512 + HO, 512 - HO)
            E, d = cost(A, Bt, walls(sx0 + a0, gy, a1 - a0, TS)); s = seam_owned(E, bnd)
            rr = np.arange(TS); rec.append(dict(d=float(d[rr, s].mean()), wall=float(walls(sx0 + a0, gy, a1 - a0, TS)[rr, s].mean())))
            xx = np.arange(a1 - a0)[None, :]; wgt = np.clip((xx - s[:, None] + FE) / (2 * FE), 0, 1)[..., None]
            strip[:, a0:a1] = A * (1 - wgt) + Bt * wgt; strip[:, a1:gx - sx0 + TS] = t[:, a1 - (gx - sx0):]; sm[rr, a0 + s] = True
        return strip, sm
    buf, SM = strip_of(ys[0]); base = 0
    for r in range(len(ys)):
        if r:
            gy = ys[r]; strip, sm = strip_of(gy); yb = gy + HO - y0; b0, b1 = yb - BAND, yb + BAND
            A = buf[b0 - base:b1 - base]; Bs = strip[b0 - (gy - y0):b1 - (gy - y0)]
            bnd = sides(walls(sx0, y0 + yb - 512, SW, 1024).T, 512 - BAND, 512 + BAND, 512 + HO, 512 - HO)
            E, d = cost(A, Bs, walls(sx0, y0 + b0, SW, b1 - b0)); s = seam_owned(E.T, bnd); cc = np.arange(SW)
            rec.append(dict(d=float(d.T[cc, s].mean()), wall=float(walls(sx0, y0 + b0, SW, b1 - b0).T[cc, s].mean())))
            yy = np.arange(b1 - b0)[:, None]; wgt = np.clip((yy - s[None, :] + FE) / (2 * FE), 0, 1)[..., None]
            blend = (A * (1 - wgt) + Bs * wgt).astype(np.float32); smb = np.where(yy < s[None, :], SM[b0 - base:b1 - base], sm[b0 - (gy - y0):b1 - (gy - y0)]); smb[s, cc] = True
            buf = np.concatenate([buf[:b0 - base], blend, strip[b1 - (gy - y0):]]); SM = np.concatenate([SM[:b0 - base], smb, sm[b1 - (gy - y0):]])
        cut = (ys[r + 1] + HO - y0 - BAND) if r + 1 < len(ys) else base + buf.shape[0]
        emit(base, buf[:cut - base], SM[:cut - base]); buf, SM = buf[cut - base:], SM[cut - base:]; base = cut
    return dict(seams=len(rec), d=round(float(np.mean([q['d'] for q in rec])), 2) if rec else 0, wall=round(float(np.mean([q['wall'] for q in rec])), 4) if rec else 0)

class BandWriter:
    """collects emitted canvas rows, crops them to Q and writes bands of H rows (Q-relative, from Q[1]): <out>/q_<y>.png (+ seam count)"""
    def __init__(self, Q, sx0, y0, out, H=3072):
        self.Q, self.sx0, self.y0, self.out, self.H = Q, sx0, y0, out, H; self.rows = []; self.n = 0; self.next = Q[1]; self.seam_px = 0; os.makedirs(out, exist_ok=True)
    def __call__(self, row0, rows, sm):
        Q = self.Q; a = self.y0 + row0; b = a + rows.shape[0]; lo, hi = max(a, Q[1]), min(b, Q[3])
        if lo >= hi: return
        x0, x1 = Q[0] - self.sx0, Q[2] - self.sx0; self.rows.append(np.clip(rows[lo - a:hi - a, x0:x1] + 0.5, 0, 255).astype(np.uint8)); self.seam_px += int(sm[lo - a:hi - a, x0:x1].sum()); self.n += hi - lo
        while self.n >= self.H or (self.n and self.next + self.n >= Q[3]): self.flush()
    def flush(self):
        from PIL import Image
        a = np.concatenate(self.rows); h = min(self.H, a.shape[0]); Image.fromarray(a[:h]).save(f'{self.out}/q_{self.next - self.Q[1]}.png', compress_level=1)
        self.rows = [a[h:]] if a.shape[0] > h else []; self.n = a.shape[0] - h; self.next += h

if __name__ == '__main__' and sys.argv[1:] == ['test']:
    # equivalence on block52_v7: 6 x 5 tiles of its window, Q = their core region, tp_quilt_c.py (original) vs quilt() (streamed)
    import subprocess, tempfile, shutil
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    WK = '/Users/daniel/code/qipu-render-work/combo/block52/work'; P7 = json.load(open(f'{WK}/T/plan.json'))['b7']; RX, RY = P7['region'][:2]
    xs = [gx for gx in range(163 * S, 169 * S, S)]; ys = [gy for gy in range(40 * S, 45 * S, S)]
    Q = [xs[0] + 512, ys[0] + 300, xs[-1] + 700, ys[-1] + 900]; REG = [xs[0], ys[0], xs[-1] + TS, ys[-1] + TS]
    D = tempfile.mkdtemp(dir=os.environ.get('TMPDIR')); os.makedirs(f'{D}/raw')
    raw = Image.open(f'{WK}/T/raw/b7.png').crop((REG[0] - RX, REG[1] - RY, REG[2] - RX, REG[3] - RY)); raw.save(f'{D}/raw/t.png')
    mk = Image.open(f'{WK}/T/raw/b7.mask.png').crop((REG[0] - RX, REG[1] - RY, REG[2] - RX, REG[3] - RY)); mk.save(f'{D}/raw/t.mask.png')
    tiles = {f'{x}_{y}': P7['tiles'][f'{x}_{y}'] for x in xs for y in ys}
    json.dump({'t': dict(Q=Q, region=REG, strides={str(S): dict(xs=xs, ys=ys)}, tiles=tiles, mosaic=P7['mosaic'])}, open(f'{D}/plan.json', 'w'))
    subprocess.run(['python3', '/Users/daniel/code/qipu-render-work/combo/complete/tp_quilt_c.py', str(S), 't'], check=True, env=dict(os.environ, TPT=D, TILES=f'{WK}/tiles', OUT=f'{D}/orig', FALLBACK_RENDER='1'), stdout=subprocess.DEVNULL)
    RAW = np.asarray(raw.convert('RGB')); MK = np.asarray(mk.convert('RGB')) > 128; WL = (MK[..., 1] & ~MK[..., 0]) | (MK[..., 0] & ~MK[..., 1] & ~MK[..., 2])
    def load(gx, gy):
        if tiles[f'{gx}_{gy}']['kind'] == 'render' or not os.path.exists(f'{WK}/tiles/{gx}_{gy}.jpg'): return RAW[gy - REG[1]:gy - REG[1] + TS, gx - REG[0]:gx - REG[0] + TS].astype(np.float32)
        return np.asarray(Image.open(f'{WK}/tiles/{gx}_{gy}.jpg').convert('RGB'), np.float32)
    walls = lambda x0, y0, w, h: WL[y0 - REG[1]:y0 - REG[1] + h, x0 - REG[0]:x0 - REG[0] + w]
    bw = BandWriter(Q, xs[0], ys[0], f'{D}/stream', H=1000); st = quilt(xs, ys, load, walls, bw)
    a = np.asarray(Image.open(f'{D}/orig/t.png').convert('RGB')); b = np.concatenate([np.asarray(Image.open(f'{D}/stream/q_{k}.png')) for k in range(0, Q[3] - Q[1], 1000)])
    print('stats', st, json.load(open(f'{D}/orig/stats.json'))['t'], 'shape', a.shape, b.shape, 'IDENTICAL' if a.shape == b.shape and (a == b).all() else f'DIFFERENT max {np.abs(a.astype(int) - b).max()}')
    dd = np.abs(a.astype(int) - b).max(-1); yy, xx = np.nonzero(dd); print("diff px", len(yy), "rows", yy.min() if len(yy) else None, yy.max() if len(yy) else None, "cols", xx.min() if len(xx) else None, xx.max() if len(xx) else None, "Q", Q, "xs0 ys0", xs[0], ys[0]); shutil.rmtree(D)
