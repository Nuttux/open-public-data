# build.py (qhprep, from b52eprep; SEG=<Ya>_<Yb> env; slot 2026 = end year Yb, slot 1985 = start year Ya)
# (b52eprep: part 2 of heroprep build.py): the painting-dependent step. Needs work/stageA.npz (prep.py), the raw renders
# work/E/R_1985.npy, R_2026.npy and the three z9 core paintings (10240 x 7168 RGB, L9 origin 112640,29696):
#   qh: --base26 key_<Yb>  --base85 raw_<Ya>  --out85 key_<Ya>
#   --base26 <v8 final layer>  --base85 <raw 1985 AI quilt>  [--out85 <key-year out_1985_perbuilding>]  (or env BASE26 / BASE85 / OUT85)
# It computes the lift guards, Lr, the non-building seam (NB final), paste/pasteNB, composes its own out_1985_perbuilding
# (-> work/out_1985_composed.png) and writes in/: base_2026.png, base_1985.png, out_1985_perbuilding.png (= --out85 if given: the
# caller's file wins, else the composed one), state.npz (final).        usage: python3 build.py --base26 A --base85 B [--out85 C]
import sys, os, argparse, shutil, pickle, numpy as np, scipy.ndimage as nd
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import common as CM
E = CM.E; IN = CM.IN; WK = CM.WK; W, H = CM.W, CM.H
ap = argparse.ArgumentParser(); ap.add_argument('--base26', default=os.environ.get('BASE26')); ap.add_argument('--base85', default=os.environ.get('BASE85'))
ap.add_argument('--out85', default=os.environ.get('OUT85')); a_ = ap.parse_args()
assert a_.base26 and a_.base85, 'need --base26 and --base85'
def rgb(p):
    im = Image.open(p).convert('RGB'); assert im.size == (W, H), (p, im.size, 'expected', (W, H)); return np.asarray(im)
S0 = dict(np.load(WK + 'stageA.npz')); globals().update(S0)
Gev = S0['Gev']; FWH = float(S0['FWH'])
c85 = np.load(IN + 'Cc_1985.npy'); c26 = np.load(IN + 'Cc_2026.npy')
def lin(x): x = x.astype(np.float32) / 255.; return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)
def srgb(x): x = np.clip(x, 0, 1); return np.where(x <= 0.0031308, x * 12.92, 1.055 * x ** (1 / 2.4) - 0.055) * 255
W3 = np.array([.2126, .7152, .0722], np.float32)
AI26 = rgb(a_.base26); AI85 = rgb(a_.base85); AI26_ = AI26
lai = nd.gaussian_filter(lin(AI26_) @ W3, 2); fade = 1 - np.clip((lai - 0.35) / 0.25, 0, 1)
pos = L > 0; L = np.where(pos, L * fade * ~nd.binary_dilation(spill, iterations=3), L); L = np.clip(L, -2.0, 1.3)
print('guards: spill px %d, lift faded on %d px' % (int(spill.sum()), int((pos & (fade < 1)).sum())))
Lr = L * rmask
F85s = srgb(lin(AI26) * (2 ** Lr)[..., None])
F85s = np.where((np.abs(Lr) < 1e-4)[..., None], AI26.astype(np.float32), F85s)   # exact 2026 bytes where no light change
# tone seam for the non-building regions: the 1985 AI inside is brought to the 2026 side's low-frequency colour at the border,
# fading to its own colour 40 px inside (a feather alone leaves a tone step between two paintings of the same street)
band = nd.binary_dilation(NB, iterations=14) & ~nd.binary_dilation(NB, iterations=3) & ~CH
bl8 = lambda x: nd.gaussian_filter(x, (4, 4, 0))
rr = np.clip(bl8(F85s) / (bl8(AI85.astype(np.float32)) + 1), 0.7, 1.4)
wb = nd.gaussian_filter(band.astype(np.float32), 30) + 1e-4
rf = np.stack([nd.gaussian_filter(rr[..., c] * band, 30) for c in range(3)], -1) / wb[..., None]
din = nd.distance_transform_edt(NB); wt = (np.exp(-din / 40.0) * (wb > 0.02))[..., None]
AI85n = AI85.astype(np.float32) * (1 + (rf - 1) * wt)
AI85m = AI85.astype(np.float32)   # (tone seam tried: it made round dark patches; plain feather kept)
# seam placement for the non-building regions (a cheap min-cost seam): in a 40 px band around them, where the two paintings
# still disagree (3 px blur, > 18) and it touches the region, the 1985 painting is taken; the feather then sits where they agree
_bb = np.isin(c85, (2, 4, 6)) & np.isin(c26, (2, 4, 6))
_band = nd.binary_dilation(NB, iterations=40) & ~NB & ~CH & ~_bb
_dis = nd.gaussian_filter(np.abs(AI85.astype(np.float32) - F85s).mean(-1), 3) > 18
_l2, _n2 = nd.label((_band & _dis) | NB); _k2 = np.unique(_l2[NB]); _k2 = _k2[_k2 > 0]
_seam = np.isin(_l2, _k2) & _band & _dis; print('seam band px moved to 1985', int(_seam.sum()))
NB = nd.binary_closing(NB | _seam, iterations=3) & ~CH
pasteNB = nd.gaussian_filter(nd.binary_dilation(NB, iterations=2).astype(np.float32), 3.0) * (1 - pasteCH)
paste = np.clip(pasteCH + pasteNB, 0, 1)
out = paste[..., None] * AI85m + (1 - paste[..., None]) * F85s
out = np.clip(np.round(out), 0, 255).astype(np.uint8)
Image.fromarray(out).save(WK + 'out_1985_composed.png')
if a_.out85:
    o_ = rgb(a_.out85); print('out85 given (wins): %s | mean|d| vs composed %.2f, on changed px %.2f' % (a_.out85, np.abs(o_.astype(int) - out).mean(), np.abs(o_.astype(int) - out).mean(-1)[CH].mean()))
    shutil.copyfile(a_.out85, IN + 'out_1985_perbuilding.png') if a_.out85.lower().endswith('.png') else Image.fromarray(o_).save(IN + 'out_1985_perbuilding.png'); del o_
else: shutil.copyfile(WK + 'out_1985_composed.png', IN + 'out_1985_perbuilding.png'); print('no --out85: in/out_1985_perbuilding.png = the composed one')
for src_, dst_ in ((a_.base26, 'base_2026.png'), (a_.base85, 'base_1985.png')):
    shutil.copyfile(src_, IN + dst_) if src_.lower().endswith('.png') else Image.fromarray(rgb(src_)).save(IN + dst_)
np.savez_compressed(IN + 'state.npz', GONE=GONE, NEW=NEW, ADD=ADD, CH=CH, own=own, M85=M85, M26=M26, Z85=Z85, Z26=Z26, SN=SN, SO=SO, SW=SW, paste=paste, rmask=rmask, Lr=Lr, static=static, UNEX=UNEX, CROWN=CROWN, G=Gev, NB=NB, FW=FW, FWs=FWs, FWZ=FWZ, FWH=FWH, FWK=FWK, FWN=FWN, FWNs=FWNs, FWNZ=FWNZ, pasteCH=pasteCH, pasteNB=pasteNB)
d = np.abs(out.astype(int) - AI26.astype(int)).mean(-1); unc = ~nd.binary_dilation(CH | NB, iterations=10)
sh = unc & (np.abs(Lr) > 1e-4)
print('mean|d| vs base_2026: unchanged px %.3f | unchanged & no shadow change %.4f (exact %.4f) | shadow-change px %.2f (%.3f of px) | changed px %.2f' % (
    d[unc].mean(), d[unc & ~sh].mean(), (d[unc & ~sh] == 0).mean(), d[sh].mean(), sh.mean(), d[CH].mean()))
print('base_1985 crossfade endpoint vs base_2026 on unchanged px: %.2f' % np.abs(AI85.astype(int) - AI26.astype(int)).mean(-1)[unc].mean())

# the largest render-evidence blobs still outside the masks
lab, n = nd.label(Gev & ~CH & ~NB); sz = nd.sum(np.ones_like(lab), lab, range(1, n + 1)); import collections
R85 = np.load(E + 'R_1985.npy').astype(np.float32); R26 = np.load(E + 'R_2026.npy').astype(np.float32)
print('remaining render-evidence outside masks: %d px (%.4f of window), %d blobs' % (int((Gev & ~CH & ~NB).sum()), (Gev & ~CH & ~NB).mean(), n))
for i in np.argsort(-sz)[:10]:
    m = lab == i + 1; ys, xs = np.nonzero(m); pr = collections.Counter(zip(c85[m].tolist(), c26[m].tolist())).most_common(2)
    dmin = nd.distance_transform_edt(~CH)[m].min()
    print('  blob %6d px  x %4d-%4d y %4d-%4d  class(85,26) %s  |dRGB| %.0f  dist to mask %.0f px' % (sz[i], xs.min(), xs.max(), ys.min(), ys.max(), pr, np.abs(R85[m] - R26[m]).mean(), dmin))
# the non-building changes the mask picked up
lb, nb_ = nd.label(NB); szb = nd.sum(NB, lb, range(1, nb_ + 1))
print('non-building regions: %d, %d px' % (nb_, int(NB.sum())))
for i in np.argsort(-szb)[:12]:
    m = lb == i + 1; ys, xs = np.nonzero(m)
    print('  %6d px  x %4d-%4d y %4d-%4d  1985 %s  2026 %s  freeway %.2f' % (szb[i], xs.min(), xs.max(), ys.min(), ys.max(),
          collections.Counter(c85[m][::5].tolist()).most_common(2), collections.Counter(c26[m][::5].tolist()).most_common(2), FW[m].mean()))
