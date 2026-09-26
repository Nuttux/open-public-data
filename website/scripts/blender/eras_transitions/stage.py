"""stage.py: the 2.5D stage of the transitions grammar (GRAMMAR.md): the pyramid's orthographic camera, the keys and passes of a
window, the building records, and the objects that change between two key years. Canvas = the film canvas of the pilot's L7
frames 5:2 over 5:3 at L8 full res (10240 x 12288 px; origin = L8 device px (51200, 12288)); the AI keys are the fin3 mosaics."""
import os, sys, math, glob, json, types
import numpy as np
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
RW = '/Users/daniel/code/qipu-render-work'; SNAP = f'{RW}/snap/er_p3'; PIL8 = f'{RW}/eras2/pilot'
FIN = '/Volumes/DANI-SD-DRIVE2/qipu-eras/fin3'
# ── the pyramid camera (hq_city.py, level 8) ─────────────────────────────────────────────────────────────────────────
CA_ = math.cos(math.radians(30)); SA_ = 0.42
KX = math.sqrt(2) * CA_; KY = math.sqrt(2) * SA_; ZT = math.sqrt(2 * (CA_ ** 2 - SA_ ** 2))
REFX, REFY = 241.427019126574, 707.0567508859249
SC = 2 ** (round(math.log2(0.06898352692062097) * 24) / 24); SZ = SC * 2 ** 5; PCW, PCH = round(2560 * 32), round(1536 * 32)
OX, OY = 51200, 12288                                  # canvas origin in L8 device px
PX_E, PX_N, PX_Z = 2 * KX * SZ, 2 * KY * SZ, 2 * ZT * SZ   # 5.342 px / m east, 2.591 px / m north (up), 4.672 px / m height
def w2c(x, y, z=0.0):
    """world metres -> canvas px (float; works on arrays)"""
    return 2 * ((KX * np.asarray(x) - REFX) * SZ + PCW / 4) - OX, 2 * ((REFY - KY * np.asarray(y) - ZT * np.asarray(z)) * SZ + PCH / 4) - OY
def c2w(X, Y, z=0.0):
    """canvas px at height z -> world metres"""
    x = ((np.asarray(X) + OX) / 2 - PCW / 4) / SZ + REFX
    py = REFY - ((np.asarray(Y) + OY) / 2 - PCH / 4) / SZ
    return x / KX, (py - ZT * np.asarray(z)) / KY
SUN_AZ, SUN_EL = 215.0, 24.0                              # LOOK B (the pilot's golden hour)
_sd = np.array([-math.sin(math.radians(SUN_AZ)), -math.cos(math.radians(SUN_AZ))]) / math.tan(math.radians(SUN_EL))
SHV = np.array([_sd[0] * PX_E, -_sd[1] * PX_N])        # canvas px of shadow offset per metre of height (~ +6.89, -4.77)
# ── classes (passes_patch: code = 4r + 2g + b) ───────────────────────────────────────────────────────────────────────
GROUND, WATER, ROOF, TREE, LANDMARK, STREET, FACADE, OTHER = range(8)
def classes(a):
    c = (a > 127).astype(np.uint8); return c[..., 0] * 4 + c[..., 1] * 2 + c[..., 2]
def gids(a):
    a = a.astype(np.int64); return (a[..., 0] << 16) | (a[..., 1] << 8) | a[..., 2]
YEARS = {'1938': 1938.0, '1959': 1959.0, '1985': 1985.0, '2006': 2006.0, 'now': 2026.0}
def _pass_path(y, i, j, kind):
    if y == 'now': return f'{PIL8}/out8/lnow_z8_{i}_{j}.{kind}.png'
    g = glob.glob(f'{PIL8}/out8/l8_{y}_*_z8_{i}_{j}.{kind}.png'); return g[0] if g else None
def _beauty_path(y, i, j):
    if y == 'now': return f'{PIL8}/out8/lnow_z8_{i}_{j}.png'
    g = glob.glob(f'{PIL8}/out8/b8_{y}_*_z8_{i}_{j}.png'); return g[0] if g else None
def load_pass(y, kind, win):
    """a Blender pass ('gid' | 'class' | 'beauty') of year y over the canvas window (x0, y0, x1, y1), from the L8 frames"""
    x0, y0, x1, y1 = win; out = np.zeros((y1 - y0, x1 - x0, 3), np.uint8)
    for j in range((y0 + OY) // 3072, (y1 - 1 + OY) // 3072 + 1):
        for i in range((x0 + OX) // 5120, (x1 - 1 + OX) // 5120 + 1):
            p = _beauty_path(y, i, j) if kind == 'beauty' else _pass_path(y, i, j, kind)
            if not p or not os.path.exists(p): continue
            fx0, fy0 = i * 5120 - OX, j * 3072 - OY
            ax0, ay0, ax1, ay1 = max(x0, fx0), max(y0, fy0), min(x1, fx0 + 5120), min(y1, fy0 + 3072)
            im = Image.open(p).convert('RGB').crop((ax0 - fx0, ay0 - fy0, ax1 - fx0, ay1 - fy0))
            out[ay0 - y0:ay1 - y0, ax0 - x0:ax1 - x0] = np.asarray(im)
    return out
SEAMS_Y = (6144,)                       # L7 frame boundaries in the canvas (the AI ran per L7 frame: a tone step): 5:2 / 5:3
SEAMS_X = (0, 10240)                    # 4:x | 5:x and 5:x | 6:x
def _seam_1d(out, r0, R, sigma, axis):
    """one boundary at index r0 along axis 0 (rows) of `out` (already transposed for a vertical seam)"""
    from scipy import ndimage as nd
    if r0 - 8 < 0 or r0 + 8 > out.shape[0]: return
    a_, b_ = out[r0 - 3].copy(), out[r0 + 1].copy()          # the mosaics' last rows before a boundary carry a thin line
    for k, r in enumerate(range(r0 - 2, r0 + 1)): w_ = (k + 1) / 4.0; out[r] = a_ * (1 - w_) + b_ * w_
    d = np.median(out[r0 + 2:r0 + 7], 0) - np.median(out[r0 - 7:r0 - 2], 0)
    d = nd.gaussian_filter1d(d, sigma, axis=0)
    for r in range(max(0, r0 - R), min(out.shape[0], r0 + R)):
        w = 1.0 - abs(r - (r0 - 0.5)) / R
        out[r] += (d / 2 * w) if r < r0 else (-d / 2 * w)
def seam_fix(img, win, R=48, sigma=30):
    """the tone step across an L7 frame boundary, split and ramped over +/- R px (per column or row, smoothed along the seam;
    the texture is left alone). Applied to every key the same way at load, so what is the same in two keys stays the same."""
    x0, y0, x1, y1 = win; out = img.astype(np.float32)
    for sy in SEAMS_Y: _seam_1d(out, sy - y0, R, sigma, 0)
    ot = out.transpose(1, 0, 2)
    for sx in SEAMS_X: _seam_1d(ot, sx - x0, R, sigma, 0)
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def load_key(y, win, src=None):
    """the AI key of year y (fin3 hard-mask mosaics m_<i>_<j>, L7 frames 4-6 x 2-3) over the canvas window"""
    x0, y0, x1, y1 = win; out = np.zeros((y1 - y0, x1 - x0, 3), np.uint8)
    for i in (4, 5, 6):
        for j in (2, 3):
            ox, oy = (i - 5) * 10240, (j - 2) * 6144
            ax0, ay0, ax1, ay1 = max(x0, ox), max(y0, oy), min(x1, ox + 10240), min(y1, oy + 6144)
            if ax1 <= ax0 or ay1 <= ay0: continue
            p = (src or {}).get((y, i, j)) or (f'{FIN}/now_m_{i}_{j}.png' if y == 'now' else f'{FIN}/{y}/m_{i}_{j}.png')
            out[ay0 - y0:ay1 - y0, ax0 - x0:ax1 - x0] = np.asarray(Image.open(p).convert('RGB').crop((ax0 - ox, ay0 - oy, ax1 - ox, ay1 - oy)))
    return seam_fix(out, win)
# ── records ──────────────────────────────────────────────────────────────────────────────────────────────────────────
def _fake_mathutils():
    """era.sanborn_all() wants mathutils.kdtree (Blender) for its freeway rule: a scipy stand-in, same answers"""
    if 'mathutils' in sys.modules: return
    from scipy.spatial import cKDTree
    class KDTree:
        def __init__(s, n): s.p = []; s.t = None
        def insert(s, co, i): s.p.append((co[0], co[1], co[2] if len(co) > 2 else 0.0, i))
        def balance(s): s.a = np.array([q[:3] for q in s.p]) if s.p else np.zeros((1, 3)); s.t = cKDTree(s.a)
        def find(s, co):
            d, k = s.t.query(co[:3]); return (tuple(s.a[k]), s.p[k][3], d)
        def find_range(s, co, r):
            return [(tuple(s.a[k]), s.p[k][3], float(np.linalg.norm(s.a[k] - np.array(co[:3])))) for k in s.t.query_ball_point(co[:3], r)]
    m = types.ModuleType('mathutils'); kd = types.ModuleType('mathutils.kdtree'); kd.KDTree = KDTree; m.kdtree = kd
    class Vector(tuple): pass
    m.Vector = Vector; sys.modules['mathutils'] = m; sys.modules['mathutils.kdtree'] = kd
_R = None
def records():
    """{gid: record} of DataSF buildings + Sanborn lost buildings (800000000 + k) + landmark site records (900000000 + ...)"""
    global _R
    if _R is None:
        _fake_mathutils(); sys.path.insert(0, SNAP)
        import city_data, era
        _R = {b['gid']: b for b in city_data.buildings(-9000, -9000, 9000, 9000)}
        for b in era.sanborn_all(): _R[b['gid']] = b
        for b in era.landmark_sites(list(_R.values()), 2014.0): _R[b['gid']] = dict(b, landmark=True)
    return _R
def decode_gid(g):
    """a gid pass value -> record gid (24-bit pass: ids >= 2^24 keep their low 16 bits under a saturated red channel)"""
    if g < (255 << 16): return int(g)
    low = g & 0xffff; R = records()
    for base in (800000000, 900000000):
        k = (low - (base & 0xffff)) & 0xffff
        if base + k in R: return base + k
    return int(g)
