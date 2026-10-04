"""C1 step: 'built' probability per NAPL mosaic year on the area's 1 m grid (footprint frame: the photo shifted by c1/align.json).
README section 4, simplified per year, a gradient-boosted model on texture features (sklearn HistGradientBoosting; run with /opt/homebrew/bin/python3.11).
  positives: interiors (eroded 2 m) of today's records standing in the year with a SOURCED year
  negatives: yards (parcel land >= 3 m from footprints, on lots whose records all stood by Y-2) and today's right-of-way (no parcel within 3 m; opendata property-parcel-polygons), outside 40 m of the viaducts (cleared land)
Held-out check: every 5th 100 m cell is held out. Writes eras/c1/built_<Y>.npz (p float16, grid) and prints precision/recall at p >= 0.7."""
import sys, json, numpy as np, cv2
import common as c
YEARS = [int(a) for a in sys.argv[1:]] or [1950, 1959, 1967, 1972, 1978, 1982]
e0, n1, Wd, Hd = c.grid()
recs = c.records(60)


def poly_px(ring_w):
    return np.array([c.to_px(*c.w2utm(x, y)) for x, y in ring_w], np.int32)


def ll_px(ring):
    return np.array([c.to_px(*c.ll2utm(lo, la)) for lo, la in ring], np.int32)


# right-of-way: not in any parcel
par = np.zeros((Hd, Wd), np.uint8); parid = np.zeros((Hd, Wd), np.int32)
for k, f in enumerate( json.load(open(f'{c.OUT}/parcels.geojson'))['features']):
    g = f['geometry']; polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    for p in polys: cv2.fillPoly(par, [ll_px(p[0])], 1); cv2.fillPoly(parid, [ll_px(p[0])], k + 1)
via = np.zeros((Hd, Wd), np.uint8)
for e in json.load(open(f'{c.OUT}/osm_rail_bridges.json'))['elements']:
    if 'Viaduct' in (e['tags'].get('name') or ''):
        cv2.polylines(via, [ll_px([(q['lon'], q['lat']) for q in e['geometry']])], False, 1, 80)
row = (cv2.dilate(par, np.ones((7, 7), np.uint8)) == 0) & (via == 0)
cells = ((np.arange(Hd)[:, None] // 100) * 31 + np.arange(Wd)[None] // 100) % 5 == 0


def feats(a):
    a = a.astype(np.float32) / 255.0
    F = []
    g1 = cv2.GaussianBlur(a, (0, 0), 1); F.append(g1)
    for s in (3, 8, 20):
        m = cv2.GaussianBlur(a, (0, 0), s); F.append(g1 - m)
        F.append(np.sqrt(np.maximum(cv2.GaussianBlur(a * a, (0, 0), s) - m * m, 0)))
    gm = np.hypot(cv2.Sobel(g1, cv2.CV_32F, 1, 0), cv2.Sobel(g1, cv2.CV_32F, 0, 1))
    for s in (2, 5, 10): F.append(cv2.GaussianBlur(gm, (0, 0), s))
    dk = cv2.erode(g1, np.ones((7, 7), np.uint8)); F.append(cv2.GaussianBlur(dk, (0, 0), 3))
    sh = np.zeros_like(g1); sh[6:] = g1[:-6]; F.append(cv2.GaussianBlur(sh - g1, (0, 0), 3))    # brighter 6 m south than here: a north-side shadow
    F = np.stack(F, -1); F = np.concatenate([F, F * F], -1)
    return F


out = {}
for Y in YEARS:
    O = np.load(f'{c.OUT}/offsets_{Y}.npy')                       # local field (c1/offsets.py): photo minus footprints, E/N m
    a0 = c.napl(Y, 200); J, I = np.mgrid[0:Hd, 0:Wd].astype(np.float32)
    a = cv2.remap(a0, I + 140 + O[0], J + 140 - O[1], cv2.INTER_LINEAR)   # aligned[j, i] = photo[j - dN, i + dE] (pad-200 crop: +140)
    F = feats(a); nf = F.shape[-1]
    pos = np.zeros((Hd, Wd), np.uint8)
    for b in recs:
        if not str(b['from_src']).startswith('sourced') or b['from'] > Y or (b['until'] and b['until'] <= Y): continue
        cv2.fillPoly(pos, [poly_px(b['ring'])], 1)
    posi = cv2.erode(pos, np.ones((5, 5), np.uint8)).astype(bool) & (a > 0)
    # yards: parcel land 3 m or more from any footprint, on parcels whose records all stood by the year (a stable lot: its open land was open then too, CONVENTION)
    allfp = np.zeros((Hd, Wd), np.uint8); late = np.zeros((Hd, Wd), np.uint8)
    for b in recs:
        cv2.fillPoly(allfp, [poly_px(b['ring'])], 1)
        if b['from'] > Y - 2 or not str(b['from_src']).startswith('sourced'): cv2.fillPoly(late, [poly_px(b['ring'])], 1)
    stable = (parid > 0) & ~np.isin(parid, np.unique(parid[late.astype(bool)]))
    yard = stable & ~cv2.dilate(allfp, np.ones((7, 7), np.uint8)).astype(bool)
    negi = (row | yard) & (a > 0) & ~cv2.dilate(pos, np.ones((5, 5), np.uint8)).astype(bool)
    X = F.reshape(-1, nf); mu, sd = X.mean(0), X.std(0) + 1e-6
    tr = ~cells.ravel()
    ip = np.flatnonzero(posi.ravel() & tr); ineg = np.flatnonzero(negi.ravel() & tr)
    rng = np.random.default_rng(Y); n = min(len(ip), len(ineg), 60000)
    idx = np.concatenate([rng.choice(ip, n, False), rng.choice(ineg, n, False)]); yv = np.r_[np.ones(n), np.zeros(n)]
    from sklearn.ensemble import HistGradientBoostingClassifier   # python3.11 (homebrew) has sklearn
    m = HistGradientBoostingClassifier(max_iter=200, learning_rate=0.1, max_leaf_nodes=31, random_state=0).fit(X[idx], yv)
    P = np.concatenate([m.predict_proba(X[k:k + 400000])[:, 1] for k in range(0, len(X), 400000)]).reshape(Hd, Wd).astype(np.float32)
    P = cv2.GaussianBlur(P, (0, 0), 1.0)
    te = cells
    tp = (P >= 0.7) & posi & te; fp = (P >= 0.7) & negi & te
    prec = tp.sum() / max(1, tp.sum() + fp.sum() * (posi & te).sum() / max(1, (negi & te).sum()))   # balanced classes
    rec = tp.sum() / max(1, (posi & te).sum())
    out[Y] = dict(precision_balanced=round(float(prec), 3), recall=round(float(rec), 3), fp_rate=round(float(fp.sum() / max(1, (negi & te).sum())), 3), n_pos=int(posi.sum()), n_neg=int(negi.sum()))
    np.savez_compressed(f'{c.OUT}/built_{Y}.npz', p=P.astype(np.float16), aligned=a, grid=np.array([e0, n1, Wd, Hd]))
    print(Y, out[Y], flush=True)
json.dump(out, open(f'{c.OUT}/built_metrics.json', 'w'), indent=1)
