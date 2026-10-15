"""mk_water_fix5_seam.py: English Bay / Spanish Banks hard straight seam between flat bay water and teal shallows (L9 ~36600-37900, y~66150), no GPU.
Per column: find the dark seam row, cover it with a clone of the flat bay water just above and cross-fade back into the teal shallows over ~150 px (so the line and the tone step vanish),
then even out the left/right tone step inside the teal. Writes patches/fix5_seam/{patch.png, alpha.png, canvas.json} + qa/fix5_seam_ba.jpg."""
import os, json
from lib import *
from scipy import ndimage as nd
H = os.path.dirname(os.path.abspath(__file__)); X0, Y0, X1, Y1 = 36500, 65700, 38000, 66600
CV = [X0, Y0, X1, Y1]; im = np.asarray(tiles(*CV)).astype(np.float32); h, w = im.shape[:2]
L = im.mean(2); r, g, b = im[..., 0], im[..., 1], im[..., 2]; water = (b > r + 25) & (b > g - 2)
Ls = nd.gaussian_filter1d(L, 2, axis=0)
lo, hi = 66050 - Y0, 66260 - Y0
seam = np.zeros(w, int); ok = np.zeros(w, bool)
for x in range(w):
    col = Ls[lo:hi, x]; y = lo + int(np.argmin(col)); seam[x] = y; ok[x] = water[max(y - 30, 0):y - 5, x].mean() > .9 and water[y + 15:y + 40, x].mean() > .8
xs = np.nonzero(ok)[0]; print('columns with seam', len(xs), xs.min() + X0, xs.max() + X0)
seam_s = nd.median_filter(np.interp(np.arange(w), xs, seam[xs]), 9); seam_s = nd.gaussian_filter1d(seam_s, 2)
top = np.zeros(w); bot = np.zeros(w)
for x in range(w):
    col = Ls[lo:hi, x]; dk = np.nonzero(col < np.median(col) - 9)[0]
    y0_ = lo + (dk.min() if len(dk) else int(seam_s[x]) - lo); y1_ = lo + (dk.max() if len(dk) else int(seam_s[x]) - lo)
    top[x] = y0_; bot[x] = y1_
top = nd.minimum_filter1d(nd.median_filter(np.interp(np.arange(w), xs, top[xs]), 7), 15); bot = nd.maximum_filter1d(nd.median_filter(np.interp(np.arange(w), xs, bot[xs]), 7), 15)
bot = np.maximum(bot, seam_s); top = np.minimum(top, seam_s)
top = nd.gaussian_filter1d(top, 3); bot = nd.gaussian_filter1d(bot, 3)
seam_s = bot   # the ramp starts below the dark band
xmin, xmax = xs.min(), xs.max()
out = im.copy(); al = np.zeros((h, w), np.float32); RAMP = 150; UP = 40
yy = np.arange(h)[:, None]; s = seam_s[None, :]
a = np.where(yy <= s + 10, 1.0, np.clip(1 - (yy - s - 10) / RAMP, 0, 1)); a = a * a * (3 - 2 * a) if False else a
a = np.where(yy >= top[None, :] - UP, a, 0)
a = a * ((np.arange(w) >= xmin - 5) & (np.arange(w) <= xmax + 5))[None, :]
a = nd.gaussian_filter(a, (6, 25)); a = np.clip(a, 0, 1)
# clone source: flat bay water 300 px higher (same column band), tone matched per column to the rows just above the seam
src = np.zeros_like(im)
for x in range(w):
    sy = int(seam_s[x]); 
    col_src = np.roll(im[:, x], 300, axis=0)   # row y takes row y-300
    src[:, x] = col_src
ref_above = np.stack([nd.uniform_filter1d(np.median(np.where(((yy >= s - 60) & (yy < s - 12))[..., None], im, np.nan), axis=0) if False else 0 * im[0], 5)[:, ] for _ in range(1)])[0] if False else None
# tone offset: mean of the 50 rows above the seam vs the same rows of the source, smoothed along x
off = np.zeros((w, 3), np.float32)
for x in range(w):
    sy = int(seam_s[x]); ty = int(top[x]); off[x] = im[ty - 60:ty - 14, x].mean(0) - src[ty - 60:ty - 14, x].mean(0)
off = nd.gaussian_filter1d(off, 40, axis=0)
src = src + off[None, :, :]
# cover only water (never beach / trees): shore side of the teal keeps its pixels
wm = nd.binary_closing(water, iterations=3)
a = a * wm
new = im * (1 - a[..., None]) + src * a[..., None]
# even out the left/right tone step inside the teal (columns), low-frequency only, water rows below the seam
rows = (yy > s + 20) & (yy < s + 170) & wm
cm = np.stack([np.nanmean(np.where(rows, new[..., k], np.nan), axis=0) for k in range(3)], -1)
cm = np.where(np.isnan(cm), np.nanmean(cm, 0), cm); sm = nd.gaussian_filter1d(cm, 160, axis=0, mode='nearest'); sm2 = nd.gaussian_filter1d(cm, 8, axis=0, mode='nearest')
corr = (sm - sm2)[None, :, :] * (np.clip((yy - s - 10) / 20, 0, 1) * np.clip((s + 190 - yy) / 40, 0, 1))[..., None] * wm[..., None]
new = new + corr
# the vertical step between the lighter-left and darker-right teal: find it, cross-fade the right texture leftwards over ~280 px
cmm = nd.uniform_filter1d(cm, 1, axis=0).mean(1); stp = np.array([abs(cmm[x:x + 60].mean() - cmm[x - 60:x].mean()) if 100 < x < w - 100 else 0 for x in range(w)]); E = int(np.argmax(stp)); print('tone step at x', E + X0, 'size', round(float(stp[E]), 2))
if stp[E] > 1.5:
    xa = np.arange(w); ramp = np.clip((xa - (E - 260)) / 290., 0, 1); ramp = ramp * ramp * (3 - 2 * ramp)
    shifted = np.roll(new, -600, axis=1); mk = ((yy > s + 14) & wm & np.roll(wm, -600, axis=1)).astype(np.float32); mk = nd.gaussian_filter(mk, 3)
    aa = (ramp[None, :] * mk * (xa[None, :] < E + 60))[..., None]
    new = new * (1 - aa) + shifted * aa
fin = np.abs(new - im).sum(2) > 0.5
alpha = np.clip(nd.gaussian_filter(fin.astype(np.float32), 2) * 1.5, 0, 1)
d = f'{H}/patches/fix5_seam'; os.makedirs(d, exist_ok=True)
Image.fromarray(new.clip(0, 255).astype(np.uint8)).save(f'{d}/patch.png'); Image.fromarray((alpha * 255).astype(np.uint8)).save(f'{d}/alpha.png'); json.dump(dict(canvas=CV, order=5), open(f'{d}/canvas.json', 'w'))
res = (im * (1 - alpha[..., None]) + new * alpha[..., None]).clip(0, 255).astype(np.uint8)
bx0, bx1, by0, by1 = 36500, 38000, 65950, 66500
A_ = Image.fromarray(im[by0 - Y0:by1 - Y0, bx0 - X0:bx1 - X0].astype(np.uint8)); B_ = Image.fromarray(res[by0 - Y0:by1 - Y0, bx0 - X0:bx1 - X0])
sb = Image.new('RGB', (A_.width, A_.height * 2 + 10), (255, 255, 255)); sb.paste(A_, (0, 0)); sb.paste(B_, (0, A_.height + 10)); os.makedirs(f'{H}/qa', exist_ok=True); sb.save(f'{H}/qa/fix5_seam_ba.jpg', quality=90); print('ok')
