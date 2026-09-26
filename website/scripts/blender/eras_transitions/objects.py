"""objects.py: the buildings standing in a year as PRISMS (footprint ring + ground z + height), chosen exactly as hq_city.py
chooses them for an era render (records placed by era.place_record, landmark sites, Sanborn lost buildings, era.infill
stand-ins; the footprints a landmark model replaces keep their record prism, tagged 'lm'), and their rasterisation in the canvas:
a painter's-order ID map, per-pixel height, roof / wall split. Keys: 'g<gid>' (a record's own building), 's<gid>' (the stand-in
that stood on a record's lot before it), 'b<gid>' (a Sanborn lost building), 'L<key>' (a landmark site: Salesforce, 181 Fremont)."""
import os, sys, json, math
import numpy as np
from PIL import Image, ImageDraw
import stage as S


def _era():
    S.records(); import era as EA, city_data
    return EA, city_data


def standing(era, wbox, pad=(120.0, 380.0, 120.0, 120.0)):
    """prisms standing at float year `era` (None = today's render) whose centre is in the world box (x0, y0, x1, y1) + pad
    (pad: west, south, east, north; south is large: towers south of the window rise into it)"""
    EA, city_data = _era()
    x0, y0, x1, y1 = wbox[0] - pad[0], wbox[1] - pad[1], wbox[2] + pad[2], wbox[3] + pad[3]
    inb = lambda b: x0 <= b['cx'] <= x1 and y0 <= b['cy'] <= y1
    HG = city_data.hero_gids() | {137672}
    skj = json.load(open(os.path.join(S.SNAP, 'skip_gids.json')))
    built = skj.get('built', {}); lm_of = {}
    for k, gs in skj['by_landmark'].items():
        for g in gs: lm_of[int(g)] = k
    lm_now = {int(g) for k, gs in skj['by_landmark'].items() if era is None or era >= built.get(k, 0) for g in gs}
    allb0 = [dict(b) for b in city_data.buildings(-9000, -9000, 9000, 9000) if inb(b)]
    if era is None:     # today's render applies the places overrides (LiDAR heights and rings); an era render does not
        allb0 = [dict(b) for b in city_data.overrides(allb0, (x0, y0, x1, y1)) if inb(b)]
    allb = [b for b in EA.fix_records([dict(b) for b in allb0], era) if b['gid'] not in HG and b['gid'] not in lm_now]
    out = []
    for b in allb:
        r = EA.place_record(dict(b), era) if era is not None else dict(b)
        if r: out.append(dict(r, key=f"g{r['gid']}", kind='record'))
    if era is not None:
        for r in EA.landmark_sites(allb0, era):
            if inb(r): out.append(dict(r, key=f"L{r['gid']}", kind='site'))
        sbr = [b for b in EA.sanborn_records(era) if inb(b)]
        if sbr:
            out = [b for b in out if b['kind'] != 'record' or not EA.sanborn_contradicted(b, era)]
            for b in sbr:
                r = EA.place_record(dict(b), era)
                if r: out.append(dict(r, key=f"b{r['gid']}", kind='sanborn'))
        inf = EA.infill(allb, era, {b['gid'] for b in out})
        if sbr:
            kd = EA.sanborn_index(sbr); inf = [b for b in inf if kd.find((b['cx'], b['cy'], 0))[2] > 8.0]
        for b in inf:
            if inb(b): out.append(dict(b, key=f"s{b['gid']}", kind='standin', h=b.get('nb_h', b['h'])))
    # the landmark models (drawn by landmarks_hq, gid 0 in the passes): their replaced footprints as prisms
    for b in allb0:
        if b['gid'] in lm_now and b['gid'] not in city_data.hero_gids():
            out.append(dict(b, key=f"g{b['gid']}", kind='lm', lm=lm_of.get(b['gid'])))
    if era is None or era >= 2017.0:
        for k, st in EA.LANDMARK_SITES.items():
            if k == 'transamerica': continue
            gk = 900000000 + len(k) * 1000 + sum(map(ord, k))            # this landmark's own record (era.landmark_sites)
            r = [b for b in EA.landmark_sites(allb0, st['build'][0] + 0.01) if b['gid'] == gk]
            for b in r:
                if inb(b): out.append(dict(b, key=f"L{b['gid']}", kind='lm', lm=k, rise=None, h=st['h']))
    return out


def ground_z(prisms, gpass, cpass, win):
    """per prism, the ground height (m) under it, from the gid pass: the lowest visible rows of its gid where the pixel below is
    not solid, vs its footprint's near edge projected at z = 0; a median over the buildings that show their base, nearest
    neighbour elsewhere"""
    g = gpass; H, W = g.shape; x0, y0 = win[:2]; est = {}
    for b in prisms:
        if not b['key'].startswith('g'): continue
        gid = int(b['key'][1:]); X, Y = S.w2c(np.array([p[0] for p in b['ring']]), np.array([p[1] for p in b['ring']]), 0.0)
        cx0, cx1 = int(X.min()) - x0, int(X.max()) - x0
        if cx1 < 0 or cx0 >= W: continue
        cols = range(max(cx0, 0), min(cx1 + 1, W), 3); d = []
        ring_img = Image.new('L', (W, H)); ImageDraw.Draw(ring_img).polygon(list(zip((X - x0).tolist(), (Y - y0).tolist())), fill=1)
        ra = np.asarray(ring_img)
        for c in cols:
            rr = np.nonzero(g[:, c] == gid)[0]
            if len(rr) < 4: continue
            r_ = rr.max()
            if r_ + 3 >= H or cpass[r_ + 2, c] not in (S.GROUND, S.STREET, S.WATER) or cpass[r_ + 3, c] not in (S.GROUND, S.STREET, S.WATER): continue
            rb = np.nonzero(ra[:, c])[0]
            if len(rb) == 0: continue
            d.append((rb.max() - r_) / S.PX_Z)
        if len(d) >= 3: est[b['key']] = float(np.median(d))
    keys = list(est); pts = np.array([[b['cx'], b['cy']] for b in prisms if b['key'] in est]); vals = np.array([est[k] for k in keys])
    for b in prisms:
        if b['key'] in est: b['zg'] = est[b['key']]
        elif len(pts):
            dd = np.hypot(pts[:, 0] - b['cx'], pts[:, 1] - b['cy']); nn = np.argsort(dd)[:5]; b['zg'] = float(np.median(vals[nn]))
        else: b['zg'] = 0.0
    return est


def poly_px(b, z, win):
    X, Y = S.w2c(np.array([p[0] for p in b['ring']]), np.array([p[1] for p in b['ring']]), z)
    return (X - win[0]), (Y - win[1])


def silhouette_polys(b, win, h=None):
    """the prism's image polygons at height h above its ground: bottom ring, top ring, side quads"""
    h = b['h'] if h is None else h; zg = b.get('zg', 0.0)
    Xb, Yb = poly_px(b, zg, win); Xt, Yt = Xb, Yb - h * S.PX_Z
    n = len(Xb); P = [list(zip(Xb, Yb)), list(zip(Xt, Yt))]
    for i in range(n):
        j = (i + 1) % n; P.append([(Xb[i], Yb[i]), (Xb[j], Yb[j]), (Xt[j], Yt[j]), (Xt[i], Yt[i])])
    return P


def id_map(prisms, win, order=None):
    """painter's-order raster of the prisms (far = north first): int32 index + 1 per pixel (0 = none)"""
    W, H = win[2] - win[0], win[3] - win[1]
    im = Image.new('I', (W, H), 0); dr = ImageDraw.Draw(im)
    idx = sorted(range(len(prisms)), key=lambda k: -prisms[k]['cy']) if order is None else order
    for k in idx:
        for p in silhouette_polys(prisms[k], win): dr.polygon([(float(x), float(y)) for x, y in p], fill=k + 1)
    return np.asarray(im, dtype=np.int32)


def id_map_z(prisms, win):
    """the prisms rasterised with a depth test per column (not one order per object): at every pixel the prism whose footprint's
    near edge is nearest the camera in that column wins (a long terminal or viaduct no longer covers what stands in front of it)"""
    W, H = win[2] - win[0], win[3] - win[1]
    M = np.full((H, W), -1, np.int32); Dz = np.full((H, W), -1e9, np.float32)
    for k, b in enumerate(prisms):
        zg = b.get('zg', 0.0); h = b['h']
        X, Y = poly_px(b, zg, win)
        x0, x1 = int(max(0, np.floor(X.min()) - 1)), int(min(W, np.ceil(X.max()) + 2)); y0, y1 = int(max(0, np.floor(Y.min() - h * S.PX_Z) - 1)), int(min(H, np.ceil(Y.max()) + 2))
        if x1 <= x0 or y1 <= y0: continue
        im = Image.new('L', (x1 - x0, y1 - y0)); dr = ImageDraw.Draw(im)
        for p in silhouette_polys(b, win): dr.polygon([(float(x) - x0, float(y) - y0) for x, y in p], fill=1)
        m = np.asarray(im) > 0
        if not m.any(): continue
        # per column the footprint's near edge (image row): the depth key
        xc = np.arange(x0, x1) + 0.5; yn = np.full(x1 - x0, -np.inf); n = len(X)
        for i in range(n):
            xa, ya, xb, yb = X[i], Y[i], X[(i + 1) % n], Y[(i + 1) % n]
            if abs(xb - xa) < 1e-6: continue
            sel = (xc >= min(xa, xb)) & (xc <= max(xa, xb)); yn[sel] = np.maximum(yn[sel], ya + (xc[sel] - xa) * (yb - ya) / (xb - xa))
        ok = np.isfinite(yn)
        if not ok.any(): yn[:] = Y.max()
        else:
            idx = np.nonzero(ok)[0]; yn = np.where(ok, yn, yn[idx[np.clip(np.searchsorted(idx, np.arange(len(yn))), 0, len(idx) - 1)]])
        # per-pixel surface depth (the image row of the ground point under the surface seen): the front wall below the roof's
        # near edge (its foot: yn), the roof above it (the pixel's row + the height in px)
        rows = (np.arange(y0, y1, dtype=np.float32) + 0.5)[:, None]
        dz = np.where(rows >= yn[None, :] - h * S.PX_Z, yn[None, :], rows + h * S.PX_Z).astype(np.float32)
        sl = (slice(y0, y1), slice(x0, x1)); win_ = m & (dz > Dz[sl])
        Dz[sl][win_] = dz[win_]; M[sl][win_] = k
    return M
