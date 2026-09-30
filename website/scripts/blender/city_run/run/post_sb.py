"""city/run/post_sb.py: the Mac post of ONE super-block, BANDED (Mac RAM): never a whole-SB image in memory.
Same steps and constants as combo/block52/post_b7.py (block52_v7, the look that shipped), minus step_wake (WAKE_NOAO=1 fixes the wake at
the render), plus two fixes:
  quilt  : quilt_stream.py (= tp_quilt_c.py streamed by tile row, byte-identical) over the SB's tile range (sb.tile_range: stacked SBs share
           the band tiles -> the same seam) -> <SBD>/quilt/q_<y>.png, bands of 3072 rows (one crop row). AI tiles from the registry
           <ROOT>/tiles/<gx>_<gy>.jpg; 'render' tiles (> 95 % water; terrain when TERRAIN_AI=0) from the crop registry (mos.py).
           A missing AI tile is an ERROR (FALLBACK_RENDER=1 to allow, counted in quilt.json -> QA fails the SB).
  finish : per band of FIN_BH=1536 rows, on the band + a HALO=1024 px halo (measured peak ~6 GB at b8 width; 3072 + 1536 was 7.4 GB at block52 width) (quilt bands above / below inside the SB, the RENDER beyond the SB edges):
           compose (class water = render, docks touching water = render, AI plants near water = render; 1 px soft rim)
           -> roof_fix (ai_level/roof_fix.fix, 4096 x 5120 chunks + 256 px halo as post_b7) -> colour2 -> piers -> final band + z9 tiles + detect
  colour2: post_b7 step_colour (variant b: facades only, a*b* toward the faithful table colour, L cap 8, near-mean weights, x confidence)
           with the delta of each building computed ONCE and reused: <ROOT>/colour/deltas.jsonl {gid: d, a_mean}. post_b7 corrects a
           building only in the 3072-row band that holds its top row and writes that band only, so a facade crossing a band line keeps
           its lower part UNcorrected (a step at y = 3072 k); here every band applies the building's one delta (and SB neighbours reuse it).
  sheet  : 8 native crops (1600 x 1000) -> ~/Downloads/qipu-renders/live_ai/city/<SB>.jpg (probe points, worst detector cells, SB-edge
           crossings, 2 seeded random)
python3 post_sb.py <SB> quilt|finish|sheet|all [band]     env CITY_ROOT (default /Volumes/QIPU-SSD/qipu-city)"""
import os, sys, json, types, time, hashlib, numpy as np, cv2
from PIL import Image
from scipy import ndimage as nd
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import sb as SBm, quilt_stream as QS
from mos import Mos
W = '/Users/daniel/code/qipu-render-work'; ROOT = SBm.ROOT; BH = 3072; FBH = int(os.environ.get('FIN_BH', 1536)); HALO = int(os.environ.get('HALO', 1024))   # quilt bands / finish bands / halo
lab = lambda a: cv2.cvtColor(np.ascontiguousarray(a), cv2.COLOR_RGB2LAB).astype(np.float32)
def mem(tag):
    if os.environ.get('MEMDBG'): import resource; print('MEM', tag, round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 2 ** 30, 2), 'GB peak so far', flush=True)
def codeof(c): c = c > 128; return (c[..., 0] * 4 + c[..., 1] * 2 + c[..., 2]).astype(np.uint8)
def sbd(sid): d = f'{ROOT}/sb/{sid}'; [os.makedirs(f'{d}/{x}', exist_ok=True) for x in ('quilt', 'final', 'detect')]; return d
def geom(sid):
    if os.path.exists(f'{ROOT}/sb/{sid}/geom.json'): g = json.load(open(f'{ROOT}/sb/{sid}/geom.json')); return g['Q'], g['xs'], g['ys']   # tests / probes
    Q = SBm.sb_Q(sid); xs, ys = SBm.tile_range(Q); return Q, xs, ys
_M = []
def mos():
    if not _M:
        pieces = json.load(open(f'{ROOT}/pieces.json')) if os.path.exists(f'{ROOT}/pieces.json') else []   # extra partial crops (probes / tests)
        _M.append(Mos(ROOT, [tuple(p) for p in pieces], cache=10))
    return _M[0]

def step_quilt(sid):
    D = sbd(sid); Q, xs, ys = geom(sid); M = mos(); TD = f'{ROOT}/tiles'; miss = []; terr = os.environ.get('TERRAIN_AI') == '1'
    kind = {} if os.path.exists(f'{ROOT}/sb/{sid}/geom.json') else None
    def load(gx, gy):
        k = SBm.tile_kind(gx, gy) if kind is None else json.load(open(f'{ROOT}/sb/{sid}/geom.json'))['kinds'].get(f'{gx}_{gy}', 'ai')
        if k == 'ai' or (k == 'terrain' and terr):
            f = f'{TD}/{gx}_{gy}.jpg'
            if os.path.exists(f): return np.asarray(Image.open(f).convert('RGB'), np.float32)
            miss.append(f'{gx}_{gy}')
            if os.environ.get('FALLBACK_RENDER') != '1': raise RuntimeError(f'missing AI tile {gx}_{gy} (registry {TD})')
        return M.read((gx, gy, gx + 1024, gy + 1024)).astype(np.float32)
    WLc = {}
    def walls(x0, y0, w, h):   # wall / landmark px of the render mask (as tp_quilt_c), read per 1024-row slab and cached
        out = np.zeros((h, w), bool)
        for sy in range(y0 // 1024 * 1024, y0 + h, 1024):
            if sy not in WLc:
                if len(WLc) > 3: WLc.pop(min(WLc))
                mk = M.read((xs[0], sy, xs[-1] + 1024, sy + 1024), 'mask.png') > 128   # the quilt asks walls inside [xs[0], xs[-1] + 1024] only
                WLc[sy] = (mk[..., 1] & ~mk[..., 0]) | (mk[..., 0] & ~mk[..., 1] & ~mk[..., 2])
            a0, a1 = max(y0, sy), min(y0 + h, sy + 1024); out[a0 - y0:a1 - y0] = WLc[sy][a0 - sy:a1 - sy, x0 - xs[0]:x0 - xs[0] + w]
        return out
    t0 = time.time(); bw = QS.BandWriter(Q, xs[0], ys[0], f'{D}/quilt', H=BH); st = QS.quilt(xs, ys, load, walls, bw)
    st.update(missing_ai=len(miss), missing=miss[:50], seam_px=bw.seam_px, s=round(time.time() - t0)); json.dump(st, open(f'{D}/quilt.json', 'w')); print('QUILT', sid, st, flush=True)

def band_region(sid, y0):
    """the band [y0, y0+BH) of Q (Q-relative) + HALO: returns (img uint8 = AI inside the SB / render outside, box L9, inner slice, inside-SB mask)"""
    Q, _, _ = geom(sid); D = f'{ROOT}/sb/{sid}'; QH = Q[3] - Q[1]; y1 = min(QH, y0 + FBH)
    box = (Q[0] - HALO, Q[1] + y0 - HALO, Q[2] + HALO, Q[1] + y1 + HALO); M = mos(); img = M.read(box)
    ins = np.zeros(img.shape[:2], bool)
    for yb in range(max(0, (y0 - HALO) // BH * BH), min(QH, y1 + HALO), BH):   # quilt bands (3072 rows) overlapping the region
        a = np.asarray(Image.open(f'{D}/quilt/q_{yb}.png').convert('RGB')); r0 = Q[1] + yb - box[1]; lo, hi = max(0, r0), min(img.shape[0], r0 + a.shape[0])
        if lo < hi: img[lo:hi, HALO:HALO + a.shape[1]] = a[lo - r0:hi - r0]; ins[lo:hi, HALO:HALO + a.shape[1]] = True
    return img, box, (slice(HALO, HALO + y1 - y0), slice(HALO, img.shape[1] - HALO)), ins

def compose(out, ren, code):
    wat = code == 1; st = dict(water_px=int(wat.sum()))
    al = nd.gaussian_filter(wat.astype(np.float32), 0.8); al = np.where(wat, 1.0, np.minimum(al * 1.0, 0.5) * (al > 0.05)).astype(np.float32)
    l7, _ = nd.label(code == 7); ring = nd.binary_dilation(wat, iterations=2); ids7 = np.unique(l7[ring & (l7 > 0)]); touch = np.isin(l7, ids7[ids7 > 0]); del l7, ring
    near = nd.distance_transform_edt(~wat) <= 60; cand = near & np.isin(code, (4, 7)); plant = np.zeros_like(wat)
    for y in range(0, out.shape[0], 2048):
        s = slice(y, min(out.shape[0], y + 2048)); La, Lr = lab(out[s])[..., 1], lab(ren[s])[..., 1]; plant[s] = cand[s] & (La < 120) & (Lr >= 124)
    m = wat | touch | plant; out[m] = ren[m]; rim = (al > 0) & ~wat & ~m
    if rim.any(): out[rim] = (out[rim] * (1 - al[rim][:, None]) + ren[rim] * al[rim][:, None]).astype(np.uint8)
    st.update(docks_render=int(touch.sum()), plants_fixed=int(plant.sum())); return out, st

# (30/09 b8 defect sweep) two water-side rules after compose, default ON (0 = off):
#   QUAY_R=300 (default 0 = off) AI greenery (trees, hedges, lawns) on ground / street px within QUAY_R L9 px (~28 m) of water where the render has none
#                    (quays, pier aprons and tips, waterfront plazas, the Embarcadero) -> filled from the surrounding AI paving (+ render
#                    texture), their cast shadows too; the render's own trees and lawns (render green) stay
#   BRIDGE_RENDER=1  landmark components standing in water (ring >= 85 % water, sparse: area / bbox < 0.25 = bridge decks, towers, trusses)
#                    -> render (the AI drew a house and rooftop units on the Bay Bridge deck); one mask per SB at 1/4, cached
QUAY_R = int(os.environ.get('QUAY_R', '0'));   # OFF by default (30/09 evening: Daniel rejected it on b8, the fill left smeared 'photoshopped' patches; the pier issue is the abrupt land/water edge, not the trees)
BRIDGE_RENDER = os.environ.get('BRIDGE_RENDER', '1') == '1'
def _normconv(a, valid, sigmas=(10, 40, 160)):
    """fill: Gaussian normalised convolution of a over valid px, coarser sigma where the finer one has no support"""
    F = np.zeros(a.shape, np.float32); got = np.zeros(a.shape[:2], bool); v = valid.astype(np.float32)
    for sg in sigmas:
        den = cv2.GaussianBlur(v, (0, 0), sg); num = cv2.GaussianBlur(a.astype(np.float32) * v[..., None], (0, 0), sg)
        ok = (den > 0.02) & ~got; F[ok] = num[ok] / den[ok, None]; got |= ok
        if got.all(): break
    if not got.all(): F[~got] = a[valid].mean(0) if valid.any() else a[~got]
    return F
def _fill_plants(out, ren, code, pl, pave_cls, obj_cls=(), grow=4):
    """replace the AI plant blobs pl (+ their cast shadows) by the surrounding AI surface of classes pave_cls (normalised convolution
    + the render's grain); blobs over obj_cls px (a shed wall behind a quay tree) get the render there, shifted to the AI's tone"""
    pl = nd.binary_opening(pl, iterations=2)
    if not pl.any(): return 0, 0
    lb, n = nd.label(nd.binary_dilation(pl, iterations=grow)); tot = 0; H, Wd = code.shape; PAD = 96
    for sl in nd.find_objects(lb):
        ys = slice(max(0, sl[0].start - PAD), min(H, sl[0].stop + PAD)); xs = slice(max(0, sl[1].start - PAD), min(Wd, sl[1].stop + PAD))
        m = lb[ys, xs] > 0; c = code[ys, xs]; o = out[ys, xs].astype(np.float32); r = ren[ys, xs].astype(np.float32); L = o.mean(-1)
        pave = np.isin(c, pave_cls); obj = np.isin(c, obj_cls) if obj_cls else np.zeros_like(pave); m = m & (pave | obj); valid = ~m & pave
        if valid.sum() < 50: continue
        Lm = np.median(L[valid]); valid &= L > Lm - 15                       # the surface, not its shadows
        if valid.sum() < 50: continue
        F = _normconv(o, valid)
        near = nd.binary_dilation(m, iterations=64) & ~m & pave             # the cast shadows round the plant: darker than the fill
        sh = nd.binary_opening(near & (L < F.mean(-1) - 12), iterations=1)
        mp = (m & pave) | (nd.binary_dilation(sh, iterations=2) & pave)
        tex = r - cv2.GaussianBlur(r, (0, 0), 2.0)                           # render grain on the filled surface
        f = np.clip(F + 0.6 * tex + 0.5, 0, 255).astype(np.uint8); blk = out[ys, xs]; blk[mp] = f[mp]; tot += int(mp.sum())
        mo = m & obj
        if mo.any():
            vo = obj & ~m
            d = (o[vo].mean(0) - r[vo].mean(0)) if vo.sum() > 50 else np.zeros(3, np.float32)
            blk[mo] = np.clip(r[mo] + d + 0.5, 0, 255).astype(np.uint8); tot += int(mo.sum())
    return tot, int(n)
def _green(a): a = a.astype(np.int16); return (a[..., 1] > a[..., 0] + 8) & (a[..., 1] > a[..., 2] + 2)
def quay_plants(out, ren, code):
    wat = code == 1
    if not wat.any() or QUAY_R <= 0: return out, dict(quay_plants=0)
    dw = np.repeat(np.repeat(nd.distance_transform_edt(~wat[::4, ::4]) * 4, 4, 0), 4, 1)[:code.shape[0], :code.shape[1]]
    # the render's own trees / lawns (+ ~12 px): class veg, AND green render ground (b8: lawns on the Brannan St Wharf, Mission Rock and the
    # Mission Creek banks are class 0 green in the render; the first version erased them). Green camo blotches on aprons are protected too.
    rg = ren[::2, ::2].astype(np.int16); rgr = ((rg[..., 1] - rg[..., 0]) >= 12) & ((rg[..., 1] - rg[..., 2]) >= 12)
    rveg = nd.binary_dilation((code[::2, ::2] == 3) | rgr, iterations=6); rveg = np.repeat(np.repeat(rveg, 2, 0), 2, 1)[:code.shape[0], :code.shape[1]]
    cand = (dw <= QUAY_R) & np.isin(code, (0, 5, 6, 7)) & ~rveg; pl = np.zeros(code.shape, bool)
    for y in range(0, out.shape[0], 2048):
        s = slice(y, min(out.shape[0], y + 2048))
        if cand[s].any(): pl[s] = cand[s] & _green(out[s]) & ~(_green(ren[s]) & np.isin(code[s], (6, 7)))   # (a green render wall stays)
    tot, n = _fill_plants(out, ren, code, pl, (0, 5), (6, 7)); return out, dict(quay_plants=tot, quay_blobs=n)
# ROOF_PLANTS=1 (experimental, default 0; 30/09 b8 #11: a garden street with trees invented on the Westfield roof in every seed, SOLID clause
# or not): AI greenery on roof / landmark px of a FLAT render roof where the render has no green (+ 12 px) -> the surrounding roof
ROOF_PLANTS = os.environ.get('ROOF_PLANTS', '0') == '1'   # OFF by default: on b8 it left pale blotches on Westfield and smeared a glass tower's park reflection
def roof_plants(out, ren, code):
    if not ROOF_PLANTS: return out, dict(roof_plants=0)
    rveg = nd.binary_dilation(((code == 3) | _green(ren))[::2, ::2], iterations=6); rveg = np.repeat(np.repeat(rveg, 2, 0), 2, 1)[:code.shape[0], :code.shape[1]]
    pl = np.zeros(code.shape, bool)
    for y in range(0, out.shape[0], 2048):
        s = slice(y, min(out.shape[0], y + 2048)); c = code[s]; rf = np.isin(c, (2, 4)) & ~rveg[s]
        if not rf.any(): continue
        Lr = cv2.cvtColor(np.ascontiguousarray(ren[s]), cv2.COLOR_RGB2GRAY).astype(np.float32)
        flat = cv2.blur(np.abs(cv2.Laplacian(Lr, cv2.CV_32F)), (31, 31)) < 6
        pl[s] = rf & flat & _green(out[s])
    l_, n_ = nd.label(nd.binary_opening(pl, iterations=2)); keep = np.bincount(l_.ravel()) >= 400; keep[0] = False; pl = keep[l_]   # tiny specks stay
    tot, n = _fill_plants(out, ren, code, pl, (2, 4), grow=9); return out, dict(roof_plants=tot, roof_blobs=n)   # (a crown's pale rim too)

QUAY_LIP = os.environ.get('QUAY_LIP', '0') == '1'; PXM = 9.45   # L9 px per metre up (2 * ZT * SZ)
def quay_lip(out, code, HQ=1.8, seed=0):
    """QUAY_LIP=1 (proposal, default 0 until Daniel approves the sheet live_ai/block52/b8_quay_edge_test.jpg): where ground / lawn /
    street meets the render's water with no pier wall, dock or object nearby, a HQ m seawall face on the edges facing the camera (land
    stands HQ m above the water: HQ * 9.45 px), a dark wet band at the waterline, a light kerb, a thin shadow past the edges facing away"""
    H = int(round(HQ * PXM)); o = out.astype(np.float32)
    W = code == 1; Lnd = np.isin(code, (0, 3, 5))
    obj = nd.binary_dilation(np.isin(code, (2, 4, 6, 7)), iterations=6)            # a render pier / wall / dock nearby: it has its own edge
    h_, w_ = code.shape
    # distance (rows) down from the last land px through water (south-facing edges), and up (north-facing)
    dn = np.full((h_, w_), 10 ** 6, np.int32); run = np.full(w_, 10 ** 6, np.int32); src = np.zeros(w_, bool)
    for y in range(h_):
        run = np.where(Lnd[y] & ~obj[y], 0, np.where(W[y], run + 1, 10 ** 6)); dn[y] = run
    up = np.full((h_, w_), 10 ** 6, np.int32); run = np.full(w_, 10 ** 6, np.int32)
    for y in range(h_ - 1, -1, -1):
        run = np.where(Lnd[y] & ~obj[y], 0, np.where(W[y], run + 1, 10 ** 6)); up[y] = run
    face = W & (dn >= 1) & (dn <= H)
    t = np.clip((dn - 0.5) / H, 0, 1)
    rng = np.random.default_rng(seed); col = (1.0 + 0.025 * nd.gaussian_filter1d(rng.standard_normal(w_), 6) * 2.5).astype(np.float32)[None, :]   # soft staining
    base = np.array([146, 145, 140], np.float32)
    wall = base[None, None, :] * (1.04 - 0.22 * t)[..., None] * col[..., None]
    wet = np.clip((t - 0.72) / 0.28, 0, 1)[..., None]; wall = wall * (1 - 0.55 * wet) + np.array([62, 66, 64], np.float32) * 0.55 * wet
    a = nd.gaussian_filter(face.astype(np.float32), 0.7); a = np.where(face, 1.0, np.minimum(a, 0.6))[..., None]
    o = o * (1 - a) + wall * a
    kerb = Lnd & ~obj & (np.roll(W, -1, 0) | np.roll(W, -2, 0)) & ~W                                   # the land px right above a face: a light kerb
    o[kerb] = np.minimum(255, o[kerb] * 1.12 + 10)
    sh = W & (up >= 1) & (up <= int(1.2 * 5.2) + 2)                                                   # shadow on the water past the north-facing edges
    s = nd.gaussian_filter(sh.astype(np.float32), 1.0)[..., None]
    o = o * (1 - 0.30 * s)
    return np.clip(o + 0.5, 0, 255).astype(np.uint8), dict(face_px=int(face.sum()), kerb_px=int(kerb.sum()), shadow_px=int(sh.sum()))

def bridge_mask(sid):
    """1/4-res mask (SB box +- HALO) of the landmark components that stand in water: bridges"""
    D = sbd(sid); f = f'{D}/bridge4.npz'
    if os.path.exists(f): z = np.load(f); return z['m'], tuple(z['o'])
    Q, _, _ = geom(sid); M = mos(); x0, y0, x1, y1 = Q[0] - HALO, Q[1] - HALO, Q[2] + HALO, Q[3] + HALO; parts = []
    for yy in range(y0, y1, 2048): parts.append(codeof(M.read((x0, yy, x1, min(y1, yy + 2048)), 'class.png'))[::4, ::4])
    c = np.vstack(parts); del parts; wat = c == 1; l4, n = nd.label(c == 4); sz = np.bincount(l4.ravel()); sl = nd.find_objects(l4); m = np.zeros(c.shape, bool)
    for i in range(1, n + 1):
        if sz[i] * 16 < 300000: continue   # bridges only (b8: 20k also caught two floating ferry barges, drawn flat grey)
        s = sl[i - 1]; ys = slice(max(0, s[0].start - 10), s[0].stop + 10); xs = slice(max(0, s[1].start - 10), s[1].stop + 10); mi = l4[ys, xs] == i
        ring = nd.binary_dilation(mi, iterations=8) & ~mi; wf = float(wat[ys, xs][ring].mean()); fill = sz[i] / float(mi.shape[0] * mi.shape[1])
        if wf >= 0.85 and fill < 0.25 and max(mi.shape) * 4 >= 2000: m[ys, xs] |= mi
    np.savez_compressed(f, m=m, o=np.array([x0, y0])); return m, (x0, y0)
def bridge(out, ren, code, box, sid):
    if not BRIDGE_RENDER: return out, dict(bridge_px=0)
    m4, (ox, oy) = bridge_mask(sid); a, b = (box[1] - oy) // 4, (box[0] - ox) // 4; h4, w4 = (code.shape[0] + 3) // 4, (code.shape[1] + 3) // 4
    sub = np.zeros((h4, w4), bool); ya, xa = max(0, a), max(0, b); yb, xb = min(m4.shape[0], a + h4), min(m4.shape[1], b + w4)
    if ya < yb and xa < xb: sub[ya - a:yb - a, xa - b:xb - b] = m4[ya:yb, xa:xb]
    if not sub.any(): return out, dict(bridge_px=0)
    m = np.repeat(np.repeat(nd.binary_dilation(sub, iterations=1), 4, 0), 4, 1)[:code.shape[0], :code.shape[1]] & np.isin(code, (4, 7))
    m = m | (nd.binary_dilation(m, iterations=3) & (code != 1) & ~np.isin(code, (2, 6)))   # its rim (AI halo), never a neighbour's roof or wall
    out[m] = ren[m]; return out, dict(bridge_px=int(m.sum()))

def roof(out, ren, cls, g3):
    sys.modules['measure'] = types.SimpleNamespace(MX=types.SimpleNamespace(code=lambda c: ((np.asarray(c) > 128) * np.array([4, 2, 1])).sum(-1)), SU=None)
    sys.path.insert(0, f'{W}/ai/ai_level'); import roof_fix as RF
    res = out.copy(); nt = nd_ = 0; HS = 256; H, Wd = out.shape[:2]
    for y0 in range(0, H, 4096):
        for x0 in range(0, Wd, 5120):
            y1, x1 = min(H, y0 + 4096), min(Wd, x0 + 5120); ya, xa, yb, xb = max(0, y0 - HS), max(0, x0 - HS), min(H, y1 + HS), min(Wd, x1 + HS)
            f, a, b = RF.fix(out[ya:yb, xa:xb], ren[ya:yb, xa:xb], cls[ya:yb, xa:xb], g3[ya:yb, xa:xb]); res[y0:y1, x0:x1] = f[y0 - ya:y1 - ya, x0 - xa:x1 - xa]; nt += a; nd_ += b
    return res, dict(terracotta=nt, dark=nd_)

_CT = []
def colour2(out, gid, part, ins, inner, sid):
    sys.path.insert(0, f'{W}/faithful'); sys.path.insert(0, f'{W}/faithful/v4'); import fc, bid_correct as BC
    if not _CT:
        T_ = json.load(open(os.environ.get('CITY_FA_FILE', f'{W}/snap/combo2/data/faithful/fa_table_v3.json')))
        _CT.append((BC.confidence(), {int(g): [float(x) for x in fc.hexlab(e.get('ref_col') or e['facade_col'])] for g, e in T_.items() if (e.get('ref_col') or e.get('facade_col'))}))
    conf, TAB = _CT[0]; KW = 1; LCAP, ER, FE = 8.0, 3, 3.0
    DF = f'{ROOT}/colour/deltas.jsonl'; os.makedirs(os.path.dirname(DF), exist_ok=True)
    REG = {}
    if os.path.exists(DF):
        for l in open(DF): e = json.loads(l); REG.setdefault(e['g'], e)
    La = np.empty(out.shape, np.float32)
    for y in range(0, out.shape[0], 512): La[y:y + 512] = BC.srgb2lab(out[y:y + 512])   # chunked: fc's float64 temporaries on a whole band were ~12 GB
    res = La.copy(); sel0 = (part == KW) & (gid >= 0)
    ids = np.unique(gid[sel0]); ids = np.array([g for g in ids if int(g) in TAB and conf.get(int(g), 0) > 0])
    n = new = 0; newrows = []
    if len(ids):
        lb = np.zeros(gid.shape, np.int32); sel = np.isin(gid, ids) & sel0; lb[sel] = np.searchsorted(ids, gid[sel]) + 1; sl = nd.find_objects(lb)
        iy, ix = inner
        for k, g in enumerate(ids):
            if sl[k] is None: continue
            if sl[k][0].stop <= iy.start or sl[k][0].start >= iy.stop: continue      # not in the band interior: nothing to write
            s = tuple(slice(max(0, q.start - 6), q.stop + 6) for q in sl[k]); m = lb[s] == k + 1; e = REG.get(int(g))
            if e is None:
                me = nd.binary_erosion(m, iterations=ER) & ins[s]                       # stats on the AI px only (inside the SB)
                if me.sum() < 60: continue
                a_mean = La[s][me].mean(0); t = np.array(TAB[int(g)], np.float32); d = np.zeros(3, np.float32)
                d[0] = np.clip(t[0] - a_mean[0], -LCAP, LCAP); d[1:] = np.clip(t[1:] - a_mean[1:], -20, 20); d *= conf[int(g)]
                e = dict(g=int(g), d=[float(v) for v in d], a=[float(v) for v in a_mean], sb=sid); REG[int(g)] = e; newrows.append(e); new += 1
            d = np.array(e['d'], np.float32); a_mean = np.array(e['a'], np.float32)
            fw = np.clip(nd.distance_transform_edt(m) / FE, 0, 1)[m]; Ls = La[s]; px = Ls[m]
            de = np.hypot(px[:, 1] - a_mean[1], px[:, 2] - a_mean[2]); dl = np.abs(px[:, 0] - a_mean[0]); fw = fw * np.exp(-0.5 * (de / 10.0) ** 2) * np.exp(-0.5 * (dl / 25.0) ** 2)
            r = res[s]; r[m] = r[m] + fw[:, None] * d[None, :]; n += 1
    if newrows:
        with open(DF, 'a') as f: f.writelines(json.dumps(e) + '\n' for e in newrows)
    o = np.empty(out.shape, np.uint8)
    for y in range(0, out.shape[0], 512): o[y:y + 512] = BC.lab2srgb(res[y:y + 512])
    return o, dict(facades=n, new_deltas=new)

def narrow_piers(code, wat, r90_max=30.0, min_area=2000, wshare_min=0.4):   # = post_b7.narrow_piers (PIER_KEEP 29/09)
    l4, _ = nd.label(code == 4); ring = nd.binary_dilation(wat, iterations=2); ids = np.unique(l4[ring & (l4 > 0)]); ids = ids[ids > 0]
    sl = nd.find_objects(l4); m = np.zeros(code.shape, bool); L = []
    for i in ids:
        s = sl[i - 1]; mi = l4[s] == i; a = int(mi.sum())
        if a < min_area: continue
        dt = nd.distance_transform_edt(np.pad(mi, 1))[1:-1, 1:-1]; r90 = float(np.percentile(dt[mi], 90))
        b = mi & ~nd.binary_erosion(mi); ws = float((b & nd.binary_dilation(wat[s], iterations=3)).sum() / max(1, b.sum()))
        if r90 <= r90_max and ws >= wshare_min: m[s] |= mi; L.append((s[1].start, s[0].start, s[1].stop - s[1].start, s[0].stop - s[0].start, a, round(r90, 1)))
    return m, L
def piers(a, ren, code):
    m, L = narrow_piers(code, code == 1)
    m = (nd.binary_dilation(m, iterations=14) & np.isin(code, (0, 3, 5, 7))) | nd.binary_dilation(m, iterations=3)
    al = np.clip(nd.gaussian_filter(m.astype(np.float32), 1.2) * 1.6, 0, 1); k = al > 0.003
    a[k] = np.clip(a[k] * (1 - al[k, None]) + ren[k] * al[k, None] + 0.5, 0, 255).astype(np.uint8); return a, dict(piers=len(L))

def detect(o, r, c):   # = detect_b7.py per 1024 cell (look_regain detectors + land-blue / water-changed counts)
    g = globals().setdefault('_DET', {})
    if not g:
        sys.path.insert(0, f'{W}/ai'); import addguard
        src = open(f'{W}/ai/look_regain/detectors.py').read(); a = src.index('YW = np.array'); b = src.index('W4 = dict'); t0 = src.index('TH = dict'); t1 = src.index('\n', t0)
        gg = dict(np=np, nd=nd, addguard=addguard, Image=Image); exec(src[t0:t1] + '\n' + src[a:b], gg); g.update(detect=gg['detect'], TH=gg['TH'])
    d = g['detect'](o, r, c); code = codeof(c); of = o.astype(np.int32); wb = (of[..., 2] > of[..., 0] + 20) & (of[..., 1] > of[..., 0] + 10)
    d['land_blue_px'] = int((wb & (code != 1) & (code != 7)).sum()); d['water_px'] = int((code == 1).sum()); d['land_px'] = int((code != 1).sum())
    d['water_changed'] = int(((code == 1) & (np.abs(of - r.astype(np.int32)).max(-1) > 24)).sum())
    return d, [q for q, th in g['TH'].items() if d.get(q, 0) >= th]

def step_finish(sid, only=None):
    D = sbd(sid); Q, _, _ = geom(sid); QH = Q[3] - Q[1]; M = mos(); TL = f'{ROOT}/layer/tiles/9'
    for y0 in range(0, QH, FBH):
        if only is not None and y0 != only: continue
        if os.path.exists(f'{D}/final/f_{y0}.done'): continue
        t0 = time.time(); img, box, inner, ins = band_region(sid, y0)
        mem('region')
        ren = M.read(box); cls = M.read(box, 'class.png'); code = codeof(cls)
        out, s1 = compose(img, ren, code)
        out, sb_ = bridge(out, ren, code, box, sid); s1.update(sb_)
        out, sq_ = quay_plants(out, ren, code); s1.update(sq_)
        if QUAY_LIP: out, sl_ = quay_lip(out, code); s1.update(sl_)
        out, sr_ = roof_plants(out, ren, code); s1.update(sr_)
        mem('compose')
        out, s2 = roof(out, ren, cls, M.read(box, 'gid.png')); del cls
        mem('roof')
        g3 = M.read(box, 'gid.png').astype(np.int32); gid = (g3[..., 0] << 16) | (g3[..., 1] << 8) | g3[..., 2]; gid[gid == 0] = -1; del g3
        cy = slice(max(0, inner[0].start - 512), min(out.shape[0], inner[0].stop + 512)); part = M.read(box, 'part.png')   # colour on the band +- 512 rows (RAM)
        out[cy], s3 = colour2(out[cy], gid[cy], part[cy], ins[cy], (slice(inner[0].start - cy.start, inner[0].stop - cy.start), inner[1]), sid); del gid, part
        mem('colour')
        out, s4 = piers(out, ren, code)
        mem('piers')
        fin = out[inner]; Image.fromarray(fin).save(f'{D}/final/f_{y0}.png', compress_level=1)
        nt = 0                                            # z9 tiles (512 px; Q and bands are multiples of 512)
        for ty in range((Q[1] + y0) // 512, (Q[1] + y0 + fin.shape[0]) // 512):
            for tx in range(Q[0] // 512, Q[2] // 512):
                os.makedirs(f'{TL}/{tx}', exist_ok=True); yy, xx = ty * 512 - Q[1] - y0, tx * 512 - Q[0]
                Image.fromarray(fin[yy:yy + 512, xx:xx + 512]).save(f'{TL}/{tx}/{ty}.webp', quality=90); nt += 1
        det = {}; fl = {}; r_in = ren[inner]; c_in = M.read((Q[0], Q[1] + y0, Q[2], Q[1] + y0 + fin.shape[0]), 'class.png')
        for y in range(0, fin.shape[0], 1024):
            for x in range(0, fin.shape[1], 1024):
                k = f'{Q[0] + x}_{Q[1] + y0 + y}'; d, f = detect(fin[y:y + 1024, x:x + 1024], r_in[y:y + 1024, x:x + 1024], c_in[y:y + 1024, x:x + 1024]); det[k] = d
                if f: fl[k] = {q: d[q] for q in f}
        json.dump(dict(cells=det, flagged=fl), open(f'{D}/detect/d_{y0}.json', 'w'))
        st = dict(band=y0, **s1, **s2, **s3, **s4, z9=nt, cells=len(det), flagged=len(fl), s=round(time.time() - t0))
        json.dump(st, open(f'{D}/final/f_{y0}.done', 'w')); print('BAND', sid, st, flush=True)
        del img, ren, out, fin, code

def step_sheet(sid):
    D = sbd(sid); Q, _, _ = geom(sid); AR = json.load(open(f'{HERE}/areas.json'))['risks']; pts = []
    sys.path.insert(0, '/Users/daniel/code/qipu-render-work/combo/block52'); import rails_b8 as R
    for rk in AR.values():
        for p in rk['probes']:
            x, y = (p['l9'] if 'l9' in p else [float(v[0]) for v in R.l9(np.array([p['lat']]), np.array([p['lon']]))])
            if Q[0] + 800 <= x < Q[2] - 800 and Q[1] + 500 <= y < Q[3] - 500: pts.append((p['id'], int(x), int(y)))
    fl = []
    for f in sorted(os.listdir(f'{D}/detect')):
        for k, v in json.load(open(f'{D}/detect/{f}'))['flagged'].items(): fl.append((sum(v.values()), k))
    for _, k in sorted(fl, reverse=True)[:3]: x, y = map(int, k.split('_')); pts.append(('flag ' + k, x + 512, y + 512))
    for e in (Q[0], Q[2]):                                            # SB edge crossings (the seam registry check)
        if 0 < e < SBm.CITY_W: pts.append((f'edge x={e}', e, (Q[1] + Q[3]) // 2))
    for e in (Q[1], Q[3]):
        if 0 < e < SBm.CITY_H: pts.append((f'edge y={e}', (Q[0] + Q[2]) // 2, e))
    rng = np.random.default_rng(int(hashlib.sha1(sid.encode()).hexdigest()[:8], 16))
    while len(pts) < 8: pts.append(('random', int(rng.integers(Q[0] + 800, Q[2] - 800)), int(rng.integers(Q[1] + 500, Q[3] - 500))))
    from PIL import ImageDraw
    Wc, Hc = 1600, 1000; S_ = Image.new('RGB', (2 * Wc, 4 * Hc)); M = mos(); used = 0
    for n, x, y in pts[:8]:
        x0, y0 = x - Wc // 2, y - Hc // 2; c = np.zeros((Hc, Wc, 3), np.uint8); ok = np.zeros((Hc, Wc), bool)
        for yb in range(0, Q[3] - Q[1], FBH):                         # final bands inside the SB
            f = f'{D}/final/f_{yb}.png'
            if not os.path.exists(f): continue
            by0 = Q[1] + yb; lo, hi = max(y0, by0), min(y0 + Hc, by0 + FBH); lx, hx = max(x0, Q[0]), min(x0 + Wc, Q[2])
            if lo < hi and lx < hx:
                a = np.asarray(Image.open(f).convert('RGB')); c[lo - y0:hi - y0, lx - x0:hx - x0] = a[lo - by0:hi - by0, lx - Q[0]:hx - Q[0]]; ok[lo - y0:hi - y0, lx - x0:hx - x0] = True
        if (~ok).any():                                               # outside the SB: the neighbour's published z9 tiles if any, else the render (dimmed)
            r = M.read((x0, y0, x0 + Wc, y0 + Hc)); c[~ok] = (r[~ok] * 0.6).astype(np.uint8)
        S_.paste(Image.fromarray(c), ((used % 2) * Wc, (used // 2) * Hc)); ImageDraw.Draw(S_).text(((used % 2) * Wc + 10, (used // 2) * Hc + 8), f'{used + 1} {n} ({x},{y})', fill=(255, 255, 0)); used += 1
    o = os.path.expanduser(f'~/Downloads/qipu-renders/live_ai/city/{sid}.jpg'); os.makedirs(os.path.dirname(o), exist_ok=True); S_.save(o, quality=90); print('SHEET', o)

if __name__ == '__main__':
    sid, st = sys.argv[1], sys.argv[2]; only = int(sys.argv[3]) if len(sys.argv) > 3 else None
    for s in (('quilt', 'finish', 'sheet') if st == 'all' else st.split(',')):
        (step_finish(sid, only) if s == 'finish' else globals()['step_' + s](sid))
