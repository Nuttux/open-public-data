"""pipeline/metrics.py - the suite's automatic detectors, per crop / window (out = the assembled AI image, inp = the AI's input =
the pre-toned render mosaic crop, render = the untoned render (detectors.py calibration), cls = class map RGB, gid = building-id map RGB).

  flags         look_regain/detectors.py detect() (v5 set: veg_roof, lawn, roof_lot, roof_road, water_street, veg, inv_water, water_roof,
                roof_color, street_teal, veg_obj, veg_shore) over <= 1024 px chunks; a flag = a value over detectors.TH (calibrated per 1024 tile)
  land_on_water px of render-class WATER whose blurred output departs from the blurred input by dE > 25 (largest blob after an opening):
                land / piers / boats invented on water (k9casc_base failure, BAR g2)
  sharp         Laplacian variance of the output luminance (look v6 sharpness measure)
  colour        per building (gid, >= 300 visible px): median Lab of output vs input; pass = dE76 <= 12; + mean dL (the AI darkening
                facades: Mission finding). v2: vs the building table's facade colour once the BUILDING-ID pass is per pixel (faithful).
  disagree      windows only: win_asm.py overlap disagreement (mean |dRGB| of neighbour tiles in their overlap, blur 6)
"""
import ast, sys, numpy as np
from scipy import ndimage as nd
sys.path.insert(0, '/Users/daniel/code/qipu-render-work/ai')
DET = '/Users/daniel/code/qipu-render-work/ai/look_regain/detectors.py'


def _load_detect():
    """detect(), lab(), big(), TH, YW from detectors.py WITHOUT running its module code (it reads a block dir from argv)"""
    src = open(DET).read(); tree = ast.parse(src); keep = []
    for n in tree.body:
        if isinstance(n, ast.FunctionDef) and n.name in ('lab', 'big', 'detect'): keep.append(n)
        elif isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ('TH', 'YW', '_M') for t in n.targets): keep.append(n)
    import addguard
    g = dict(np=np, nd=nd, addguard=addguard)
    exec(compile(ast.Module(body=keep, type_ignores=[]), DET, 'exec'), g)
    assert all(k in g for k in ('detect', 'TH', 'YW', 'lab')), 'detectors.py changed'
    return g


D = _load_detect()


def arr(im): return np.asarray(im.convert('RGB'))


def chunks(h, w, n=1024):
    ys = list(range(0, max(1, h - n) + 1, n)) or [0]; xs = list(range(0, max(1, w - n) + 1, n)) or [0]
    if ys[-1] + n < h: ys.append(h - n)
    if xs[-1] + n < w: xs.append(w - n)
    return [(max(0, y), max(0, x)) for y in ys for x in xs]


def flags(o, r, c):
    h, w = o.shape[:2]; tot = {}; fl = []
    for y, x in chunks(h, w):
        s = (slice(y, y + 1024), slice(x, x + 1024))
        d = D['detect'](o[s], r[s], c[s])
        for k, v in d.items():
            tot[k] = tot.get(k, 0) + int(v)
            if k in D['TH'] and v >= D['TH'][k]: fl.append(k)
    return tot, fl


def code(c): cl = c > 128; return cl[..., 0] * 4 + cl[..., 1] * 2 + cl[..., 2]


def land_on_water(o, i, c):
    """render-class WATER px (eroded 4 px: shore / pier edges excluded) that the output draws LAND-like: not water-blue (blurred b* > -4)
    or textured (local luminance sd > 14, 9 px); largest blob after an opening (3). Water v3 of the compose = L 59 a -8 b -17, sd ~4
    (production r05: 0 px)."""
    w = nd.binary_erosion(code(c) == 1, iterations=4)
    if w.sum() < 500: return 0
    L = D['lab'](nd.gaussian_filter(o.astype(np.float32), (3, 3, 0))); Y = o.astype(np.float32) @ D['YW']
    sd = np.sqrt(np.maximum(nd.uniform_filter(Y * Y, 9) - nd.uniform_filter(Y, 9) ** 2, 0))
    m = nd.binary_opening(w & ((L[..., 2] > -4) | (sd > 14)), iterations=3)
    lb, n = nd.label(m)
    return int(np.bincount(lb.ravel())[1:].max()) if n else 0


def sharp(o): return float(nd.laplace(o.astype(np.float32) @ D['YW']).var())


def colour(o, i, g):
    gid = (g[..., 0].astype(np.int64) << 16) | (g[..., 1].astype(np.int64) << 8) | g[..., 2]
    u, cnt = np.unique(gid[gid > 0], return_counts=True); ids = u[cnt >= 300]
    if not len(ids): return dict(n=0, pass_pct=None, dL=None)
    Lo, Li = D['lab'](o), D['lab'](i); ok = 0; dls = []
    for b in ids:
        m = gid == b; a, z = np.median(Lo[m], 0), np.median(Li[m], 0)
        ok += np.linalg.norm(a - z) <= 12; dls.append(a[0] - z[0])
    return dict(n=int(len(ids)), pass_pct=round(100 * ok / len(ids), 1), dL=round(float(np.mean(dls)), 2))


def all_metrics(out, inp, render, cls, gid):
    o, i, r, c, g = arr(out), arr(inp), arr(render), arr(cls), arr(gid)
    h = min(x.shape[0] for x in (o, i, r, c, g)); w = min(x.shape[1] for x in (o, i, r, c, g))
    o, i, r, c, g = (x[:h, :w] for x in (o, i, r, c, g))
    tot, fl = flags(o, r, c); col = colour(o, i, g)
    return dict(flags=fl, n_flags=len(fl), det=tot, land_on_water=land_on_water(o, i, c), sharp=round(sharp(o), 1),
                col_pass=None if col['pass_pct'] is None else float(col['pass_pct']), col_dL=col['dL'], col_n=col['n'])


def aggregate(M):
    ks = [k for k in M if not k.startswith('_')]; A = {}
    for grp, sel in (('golden', [k for k in ks if not k.startswith('w')]), ('win', [k for k in ks if k.startswith('w')])):
        if not sel: continue
        v = lambda f: [M[k][f] for k in sel if M[k].get(f) is not None]
        A[grp] = dict(n=len(sel), flags=int(sum(v('n_flags'))), crops_flagged=int(sum(1 for k in sel if M[k]['n_flags'])),
                      land_on_water=int(sum(v('land_on_water'))), sharp=round(float(np.mean(v('sharp'))), 1),
                      col_pass=round(float(np.mean(v('col_pass'))), 1) if v('col_pass') else None,
                      col_dL=round(float(np.mean(v('col_dL'))), 2) if v('col_dL') else None,
                      disagree=round(float(np.mean(v('disagree'))), 2) if v('disagree') else None)
    return A
