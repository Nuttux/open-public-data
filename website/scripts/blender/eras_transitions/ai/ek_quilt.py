"""ek_quilt.py <ek2 dir> [years...]: the era keys v2 mosaics by SEAM QUILTING (the shared recipe's assembly, RECIPE.md FIX-v3,
after the look agent's quilt_block.py, re-implemented here for a sparse tile set over the whole pilot): every pixel comes from ONE
tile. Per tile row, horizontally adjacent tiles are joined by vertical min-cost seams in a +-BAND band around the boundary of their
512-px core cells; the row strips are joined by horizontal min-cost seams the same way. Cost = smoothed |A - B| + WALL on the year's
render buildings / landmarks (seams go around buildings, so a building comes whole from one tile when it fits in the band); FE-px
feather across each seam. Where a row has a gap (no tile), the strip has a hole; a join where only one side exists takes that side.
Pixels no tile covers keep the old key (fin3). Writes <ek2>/<Y>/m_<i7>_<j7>.jpg (q96) + cov_<i7>_<j7>.png, and <ek2>/RECIPE.json."""
import sys, os, glob, json, time, numpy as np
from PIL import Image
from scipy import ndimage as nd
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import stage as S
Image.MAX_IMAGE_PIXELS = None
E = sys.argv[1]; YEARS = sys.argv[2:] or ['1938', '1959', '1985', '2006']; FIN = '/Volumes/DANI-SD-DRIVE2/qipu-eras/fin3'
OUTK = os.environ.get('QUILT_OUT', E)             # where the mosaics go (default: the ek2 dir itself)
T = 1024; BAND = int(os.environ.get('BAND', 200)); WALL = float(os.environ.get('WALL', 60)); FE = int(os.environ.get('FE', 6))
GX0, GY0, CW, CH = 40960, 12288, 30720, 12288                   # the pilot canvas in global L8 px
def seam(Ec):   # min-cost top-to-bottom path through Ec (h x w): column index per row (quilt_block.seam)
    h, w = Ec.shape; M = Ec.copy(); Bk = np.zeros((h, w), np.int8)
    for yy in range(1, h):
        l = np.r_[np.inf, M[yy - 1, :-1]]; c = M[yy - 1]; r = np.r_[M[yy - 1, 1:], np.inf]; st = np.stack([l, c, r]); k = st.argmin(0)
        M[yy] += st[k, np.arange(w)]; Bk[yy] = k - 1
    x = np.zeros(h, int); x[-1] = int(M[-1].argmin())
    for yy in range(h - 1, 0, -1): x[yy - 1] = min(w - 1, max(0, x[yy] + Bk[yy, x[yy]]))
    return x
def cost(a, b, wl):
    d = np.abs(a - b).mean(-1); return nd.gaussian_filter(d, 2.0) + WALL * nd.gaussian_filter(wl.astype(np.float32), 1.0)
for y in YEARS:
    t0 = time.time(); tiles = {}
    for p in glob.glob(f'{E}/tiles/out/{y}/t_*.jpg'):
        gx, gy = map(int, os.path.basename(p)[2:-4].split('_')); tiles[(gx, gy)] = p
    if not tiles: continue
    # the year's render buildings / landmarks over the canvas (from the uploaded class passes)
    WL = np.zeros((CH, CW), bool)
    for i7 in (4, 5, 6):
        for j7 in (2, 3):
            c = S.classes(np.asarray(Image.open(f'{E}/up/c_{y}_{i7}_{j7}.png').convert('RGB')))
            WL[(j7 - 2) * 6144:(j7 - 1) * 6144, (i7 - 4) * 10240:(i7 - 3) * 10240] = np.isin(c, [S.ROOF, S.FACADE, S.LANDMARK])
    canvas = np.zeros((CH, CW, 3), np.uint8); cov = np.zeros((CH, CW), bool)
    ys = sorted(set(k[1] for k in tiles)); prev = None; nseam = 0
    def put(img, val, y0g):
        y0 = y0g - GY0; y1 = y0 + img.shape[0]; ya, yb = max(0, y0), min(CH, y1)
        if ya < yb:
            v = val[ya - y0:yb - y0]; canvas[ya:yb][v] = np.clip(img[ya - y0:yb - y0][v] + 0.5, 0, 255).astype(np.uint8); cov[ya:yb] |= v
    for gy in ys:
        # (1) the row strip over the whole canvas width: consecutive tiles joined by vertical seams
        strip = np.zeros((T, CW, 3), np.float32); val = np.zeros((T, CW), bool); cur = None
        for gx in sorted(k[0] for k in tiles if k[1] == gy):
            t = np.asarray(Image.open(tiles[(gx, gy)]).convert('RGB'), np.float32); x0 = gx - GX0
            if cur is None or gx - cur != 512:
                sl = slice(max(0, x0), min(CW, x0 + T)); strip[:, sl] = t[:, sl.start - x0:sl.stop - x0]; val[:, sl] = True; cur = gx; continue
            xb = x0 + 256; a0, a1 = xb - BAND, xb + BAND; A = strip[:, a0:a1]; Bt = t[:, a0 - x0:a1 - x0]
            s = seam(cost(A, Bt, WL[gy - GY0:gy - GY0 + T, a0:a1] if gy - GY0 + T <= CH else np.zeros_like(A[..., 0], bool))); nseam += 1
            xx = np.arange(a1 - a0)[None, :]; wgt = np.clip((xx - s[:, None] + FE) / (2 * FE), 0, 1)[..., None]
            strip[:, a0:a1] = A * (1 - wgt) + Bt * wgt; e = min(CW, x0 + T); strip[:, a1:e] = t[:, a1 - x0:e - x0]; val[:, a0:e] = True; cur = gx
        # (2) join with the previous strip: a horizontal seam around the boundary of the core rows (where both exist)
        if prev is None or gy - prev[2] != 512:
            if prev is not None: put(prev[0], prev[1], prev[3])
            prev = (strip, val, gy, gy)                    # (img, valid, tile row gy, first global row held)
            continue
        pimg, pval, pgy, py0 = prev; yb = gy + 256; b0, b1 = yb - BAND, yb + BAND
        A = pimg[b0 - py0:b1 - py0]; Av = pval[b0 - py0:b1 - py0]; Bs = strip[b0 - gy:b1 - gy]; Bv = val[b0 - gy:b1 - gy]
        both = Av & Bv
        wl = WL[b0 - GY0:b1 - GY0] if b1 - GY0 <= CH else np.zeros(Av.shape, bool)
        C = cost(A, Bs, wl); C[~both] = 0.0
        s = seam(C.T); nseam += 1
        yy = np.arange(b1 - b0)[:, None]; wgt = np.clip((yy - s[None, :] + FE) / (2 * FE), 0, 1)
        wgt = np.where(both, wgt, np.where(Bv, 1.0, 0.0))[..., None]
        joined = A * (1 - wgt) + Bs * wgt; jval = Av | Bv
        put(pimg[:b0 - py0], pval[:b0 - py0], py0); put(joined, jval, b0)
        prev = (strip[b1 - gy:], val[b1 - gy:], gy, b1)
    if prev is not None: put(prev[0], prev[1], prev[3])
    os.makedirs(f'{OUTK}/{y}', exist_ok=True)
    for i7 in (4, 5, 6):
        for j7 in (2, 3):
            sl = (slice((j7 - 2) * 6144, (j7 - 1) * 6144), slice((i7 - 4) * 10240, (i7 - 3) * 10240))
            if not cov[sl].any(): continue
            old = np.asarray(Image.open(f'{FIN}/{y}/m_{i7}_{j7}.png').convert('RGB'))
            out = np.where(cov[sl][..., None], canvas[sl], old)
            Image.fromarray(out).save(f'{OUTK}/{y}/m_{i7}_{j7}.jpg', quality=96); Image.fromarray((cov[sl] * 255).astype(np.uint8)).save(f'{OUTK}/{y}/cov_{i7}_{j7}.png')
    print(y, 'tiles', len(tiles), 'seams', nseam, 'covered %.3f' % cov.mean(), f'{time.time() - t0:.0f}s', flush=True)
json.dump(dict(recipe='FIX-v2 prompts (ai/look_regain/RECIPE.md: klein PROMPT + dry "There is no water anywhere in this image: every street is '
                         'dry dark asphalt with road markings." / wet "The only water is the bay exactly where the render shows water; every street '
                         'is dry dark asphalt with road markings."), render tile only (no reference), invented-water guard + 2 re-rolls (DRYD2)',
               noise='torch.Generator("cpu") (FIX-v3 rule)', seeds='sha1("era8:gx,gy") (world-keyed, the same for every year)',
               assembly=f'seam quilting (FIX-v3 assembly) BAND {BAND} WALL {WALL} FE {FE}', model='FLUX.2 klein 4B bf16, 4 steps, guidance 1, 1024 tiles stride 512, L8',
               input='the year L8 LOOK B ungraded beauty (eras2/pilot/out8 b8_<Y>), no pre-tone', built=time.strftime('%Y-%m-%d %H:%M')),
          open(f'{OUTK}/RECIPE.json', 'w'), indent=1)
