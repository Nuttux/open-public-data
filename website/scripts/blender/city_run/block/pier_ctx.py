"""pier_ctx.py (30/09 night, b8v2; Daniel: 'the inner court of the L-shaped pier shed is painted as lawn with trees, a pier deck is concrete'):
the render leaves 3DEP's lawn-coloured ground showing on some OSM pier decks (Piers 15/17, the Exploratorium court: the deck slab sits
under the DEM's ground there), and the AI grows a garden on it. Four render-side attempts (water_hq PIER_COURT v1-v6, LM_DECK_GROUND,
DECK_Z90) did not reach it, so the AI's INPUT is fixed instead: inside every OSM deck named 'Pier ...' (not Pier 27: its park is real),
ground px (class 0) that the render shows green become concrete grey (their luminance kept, +-texture), in the window's R_<w>.jpg
before the L8 and the tiles are painted. The post (compose) never takes ground from the render, so nothing else changes.
  python3 pier_ctx.py <R.jpg> <R.json> <C.png> [out.jpg (default: in place)] [--crop x0,y0,x1,y1 test.jpg]"""
import sys, json, math, numpy as np, cv2
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
R_, RJ, CP = sys.argv[1:4]; OUT = sys.argv[4] if len(sys.argv) > 4 and not sys.argv[4].startswith('--') else R_
CA = math.cos(math.pi / 6); SA = 0.42; KX = math.sqrt(2) * CA; KY = math.sqrt(2) * SA; ZT = math.sqrt(2 * (CA * CA - SA * SA))
RCX, RCY = 241.427019126574, 707.0567508859249; SZ = 2 ** (round(math.log2(0.06898352692062097) * 24) / 24) * 64; PCW, PCH = 2560 * 64, 1536 * 64
l9 = lambda x, y, z: (2 * ((x * KX - RCX) * SZ + PCW / 4), 2 * ((RCY - (y * KY + z * ZT)) * SZ + PCH / 4))
ox, oy = json.load(open(RJ)).values()
R = np.asarray(Image.open(R_).convert('RGB')).copy(); H, W = R.shape[:2]
c = np.asarray(Image.open(CP).convert('RGB')) > 128; code = (c[..., 0] * 4 + c[..., 1] * 2 + c[..., 2]).astype(np.uint8); del c
P = json.load(open('/Users/daniel/code/qipu-render-work/snap/combo7/data/landmarks/piers.json'))['piers']
mask = np.zeros((H, W), np.uint8); nd_ = 0; rings = []
for p in P:
    n = p.get('name') or ''
    if p['kind'] != 'deck' or not n.startswith('Pier ') or n == 'Pier 27': continue
    pts = np.array([l9(x, y, 3.8) for x, y in p['ring']]) - [ox, oy]
    if pts[:, 0].max() < 0 or pts[:, 1].max() < 0 or pts[:, 0].min() > W or pts[:, 1].min() > H: continue
    cv2.fillPoly(mask, [np.round(pts).astype(np.int32)], 1); nd_ += 1; rings.append((np.array(p['ring'], float), pts))
# the slip BETWEEN two neighbouring piers (< 40 m apart), where 3DEP has ground (the Piers 15/17 court: the DEM filled the slip, the
# render drew land in lawn colour): the two rings' convex hull, minus the rings, also counts as deck
slip = np.zeros_like(mask); nc_ = 0
for i in range(len(rings)):
    for j in range(i + 1, len(rings)):
        A, B = rings[i][0], rings[j][0]
        if np.sqrt(((A[:, None, :] - B[None, :, :]) ** 2).sum(-1)).min() > 40.0: continue
        hull = cv2.convexHull(np.round(np.vstack([rings[i][1], rings[j][1]])).astype(np.int32)); cv2.fillPoly(slip, [hull], 1); nc_ += 1
print('PIER_CTX pier pairs (slip hulls)', nc_, flush=True)
r16 = R.astype(np.int16)
grn = ((mask > 0) & (code == 0) & (r16[..., 1] > r16[..., 0] + 4) & (r16[..., 1] > r16[..., 2] + 2)) | ((slip > 0) & (mask == 0) & (code == 0))   # the slip: every ground px (lawn and dirt colours)
grn = cv2.morphologyEx(grn.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3))) > 0
L = cv2.cvtColor(R, cv2.COLOR_RGB2GRAY).astype(np.float32)
ys, xs = np.where(grn)
if len(ys):
    l_ = L[ys, xs]; g = 138 + (l_ - l_.mean()) * 0.6
    R[ys, xs] = np.stack([g + 3, g + 2, g - 2], -1).clip(0, 255).astype(np.uint8)
print('PIER_CTX decks', nd_, 'green deck px -> concrete', int(grn.sum()), flush=True)
if '--crop' in sys.argv:
    x0, y0, x1, y1 = map(int, sys.argv[sys.argv.index('--crop') + 1].split(',')); o = sys.argv[sys.argv.index('--crop') + 2]
    a = Image.open(R_).convert('RGB').crop((x0 - ox, y0 - oy, x1 - ox, y1 - oy)); b = Image.fromarray(R[y0 - oy:y1 - oy, x0 - ox:x1 - ox])
    S = Image.new('RGB', (a.width, 2 * a.height)); S.paste(a, (0, 0)); S.paste(b, (0, a.height)); S.save(o, quality=88)
else:
    Image.fromarray(R).save(OUT, quality=96)
