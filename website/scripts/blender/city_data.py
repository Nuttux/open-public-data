"""Buildings of a box, straight from the published chunks: footprint ring,
height, year, use, storeys, facade type, shop bit, per-edge role.
Mirrors src/lib/citygl/bldg.ts decodeBldg (global accumulator, escapes first)."""
import glob, os, numpy as np
import qc
CITY = '/Users/daniel/code/opd-render/website/public/data/us/sf/city'
RH = [-0.375, -0.125, 0.125, 0.375]
FA_TYPES = ["HOUSE", "FLATS", "APARTMENT", "RETAIL", "OFFICE", "INDUSTRIAL", "INSTITUTION", "HOTEL", "GARAGE", "UNCLASSED"]
USES = ["single family", "multi-family", "retail", "office", "industrial", "hotel / institutional", "mixed or not stated"]
ROLE = {0: 'back', 1: 'front', 2: 'party', 3: 'side'}

def decode(f):
    cnt, dx, dy, xi, xn = f['cnt'], f['vx'], f['vy'], f['xi'], f['xn']
    n = len(cnt); esc = np.zeros(n, np.int64)
    for k in range(len(xi)): esc[xi[k]] += xn[k]
    ax = ay = 0; p = 0; rings = []
    for i in range(n):
        for _ in range(esc[i]): ax += int(dx[p]); ay += int(dy[p]); p += 1
        r = []
        for _ in range(cnt[i]): ax += int(dx[p]); ay += int(dy[p]); p += 1; r.append((float(ax), float(ay)))
        rings.append(r)
    return rings

def buildings(x0, y0, x1, y1):
    out = []
    # the cells, and base/solo: the 15,265 footprints too large or too tall to
    # belong to one cell (every building over 30 m is one) ship on their own
    pairs = [(p, f'{CITY}/face/{os.path.basename(p)}') for p in sorted(glob.glob(f'{CITY}/bldg/*.qc'))]
    pairs.append((f'{CITY}/base/solo.qc', f'{CITY}/base/solo-face.qc'))
    for path, fp in pairs:
        _, f = qc.read(path)
        face = qc.read(fp)[1] if os.path.exists(fp) else None
        rings = decode(f)
        roff = 0
        for i, r in enumerate(rings):
            n_ = len(r)
            roles = [int(v) for v in face['role'][roff:roff + n_]] if face is not None else [0] * n_
            roff += n_
            if not r: continue
            cx = sum(p[0] for p in r) / n_; cy = sum(p[1] for p in r) / n_
            if not (x0 <= cx <= x1 and y0 <= cy <= y1): continue
            u = int(f['u'][i])
            out.append(dict(gid=int(f['gid'][i]), ring=r, cx=cx, cy=cy,
                            h=float(f['h'][i]) + RH[int(f['hf'][i]) & 3], year=None if u & 16 else 1849 + int(f['yr'][i]),
                            use=USES[u & 7] if (u & 7) < len(USES) else 'mixed or not stated', st=int(f['st'][i]),
                            ty=FA_TYPES[int(face['ty'][i])] if face is not None and int(face['ty'][i]) < 10 else 'UNCLASSED',
                            shop=bool(face['shop'][i]) if face is not None else False, roles=roles,
                            paint=int(f['paintIdx'][i])))
    return out


def hero_gids():
    """footprints the engine replaces by a hand-built landmark (heroes.json `b`):
    the generator must not model them a second time"""
    import json
    h = json.load(open(f'{CITY}/base/heroes.json'))
    return {int(x['b']) for x in h['heroes'] if isinstance(x.get('b'), (int, float)) and x['b'] >= 0}


def trees(x0, y0, x1, y1):
    """the published street trees (tree/*.qc, DataSF Street Tree List): world
    position and planting year (None where the list gives no date).
    Grid per src/lib/city/trees.ts: 24 m cells, key = row*600 + col, origin
    (-7200, -6600), `pos` two nibbles over a 16 x 16 lattice (site centres),
    years counted from 1900."""
    out = []
    for p in sorted(glob.glob(f'{CITY}/tree/*.qc')):
        h, f = qc.read(p)
        e = {k: h.get(k) for k in ('gw', 'cell', 'x0', 'y0', 'q')}
        gw, cell, gx0, gy0, q = (e['gw'] or 600, e['cell'] or 24, e['x0'] if e['x0'] is not None else -7200,
                                 e['y0'] if e['y0'] is not None else -6600, e['q'] or 16)
        step = cell / q; vo = 0
        for ci in range(len(f['cellKey'])):
            key = int(f['cellKey'][ci]); cnt = int(f['cellCnt'][ci])
            bx = gx0 + (key % gw) * cell; by = gy0 + (key // gw) * cell
            if bx > x1 or bx + cell < x0 or by > y1 or by + cell < y0: vo += cnt; continue
            for j in range(vo, vo + cnt):
                ps = int(f['pos'][j]); yr = int(f['yr'][j])
                out.append((bx + (ps % q + 0.5) * step, by + (ps // q + 0.5) * step, 1900 + yr if yr else None))
            vo += cnt
    return out


def streets(x0, y0, x1, y1):
    """the published roadway polygons (strt/*.qc, DataSF h8n7-e4ns ROW) with
    their year — the Board of Supervisors' roadway acceptance, or the earliest
    building on the frontage (pipeline DATA-TRUTH.md §street year); None when
    undated. Returns [(rings, yr, width_dm)]."""
    out = []
    for p in sorted(glob.glob(f'{CITY}/strt/*_*.qc')):
        _, f = qc.read(p)
        if 'rdN' not in f: continue
        k = r = 0
        for i in range(len(f['fid'])):
            nr = int(f['rdN'][i]); rings = []
            for j in range(nr):
                n_ = int(f['rdLen'][r + j])
                rings.append(list(zip(f['rdX'][k:k + n_].tolist(), f['rdY'][k:k + n_].tolist()))); k += n_
            r += nr
            if not rings: continue
            xs = [x for rg in rings for x, _ in rg]; ys = [y for rg in rings for _, y in rg]
            if max(xs) < x0 or min(xs) > x1 or max(ys) < y0 or min(ys) > y1: continue
            yr = int(f['yr'][i]); out.append((rings, yr or None, int(f['w'][i]), int(f['cls'][i])))
    return out


def street_names():
    """the one name table the label and line chunks index with `nm`
    (manifest chunk entry base/street-labels `names`)"""
    import json, ast
    m = json.load(open(f'{CITY}/manifest.json'))
    e = [c for c in m['chunks'] if c.get('k') == 'base/street-labels'][0]
    return e['names'] if isinstance(e['names'], list) else ast.literal_eval(e['names'])


def freeway_points(step=10.0):
    """points every `step` m along the named freeway centrelines (DataSF
    3psu-pn9h classcode 1 mainline, 6 ramps): [(x, y, name)]"""
    names = street_names(); pts = []
    for f in ('base/street-lines.qc', 'strt/street-lines-2.qc'):
        _, d = qc.read(f'{CITY}/{f}')
        k = 0
        for i in range(len(d['fid'])):
            n = int(d['len'][i]); nm = int(d['nm'][i]); name = names[nm] if nm < len(names) else ''
            if name.startswith(('HWY', 'I-')):
                xs = d['x'][k:k + n].tolist(); ys = d['y'][k:k + n].tolist()
                for j in range(n - 1):
                    L = ((xs[j + 1] - xs[j]) ** 2 + (ys[j + 1] - ys[j]) ** 2) ** 0.5
                    for t in range(max(1, int(L / step))):
                        a = t * step / L if L else 0
                        pts.append((xs[j] + (xs[j + 1] - xs[j]) * a, ys[j] + (ys[j + 1] - ys[j]) * a, name))
            k += n
    return pts


_LINES = None


def named_lines():
    """{name: [polyline, ...]} of the published centrelines (classes 0-4)"""
    global _LINES
    if _LINES is None:
        names = street_names(); _LINES = {}
        for f in ('base/street-lines.qc', 'strt/street-lines-2.qc'):
            _, d = qc.read(f'{CITY}/{f}')
            k = 0
            for i in range(len(d['fid'])):
                n = int(d['len'][i]); nm = int(d['nm'][i])
                if nm < len(names):
                    _LINES.setdefault(names[nm], []).append(list(zip(d['x'][k:k + n].tolist(), d['y'][k:k + n].tolist())))
                k += n
    return _LINES


def street_between(name, a, b):
    """the centreline of street `name` between its crossings with streets `a`
    and `b` (nearest approach of the two centrelines), as a list of polylines;
    [] when a name is not published"""
    L = named_lines()
    if name not in L or a not in L or b not in L: return []
    segs = [(p, q) for pl in L[name] for p, q in zip(pl, pl[1:])]

    def cross(other):
        best = (1e18, None)
        for pl in L[other]:
            for x, y in pl:
                for (p, q) in segs:
                    dx, dy = q[0] - p[0], q[1] - p[1]; ll = dx * dx + dy * dy or 1e-9
                    t = max(0.0, min(1.0, ((x - p[0]) * dx + (y - p[1]) * dy) / ll))
                    cx, cy = p[0] + dx * t, p[1] + dy * t
                    d = (cx - x) ** 2 + (cy - y) ** 2
                    if d < best[0]: best = (d, (cx, cy))
        return best
    da, pa = cross(a); db, pb = cross(b)
    if pa is None or pb is None or da > 40 ** 2 or db > 40 ** 2: return []
    ax, ay = pb[0] - pa[0], pb[1] - pa[1]; ln = (ax * ax + ay * ay) ** 0.5 or 1.0
    ux, uy = ax / ln, ay / ln
    out = []
    for (p, q) in segs:
        tp = (p[0] - pa[0]) * ux + (p[1] - pa[1]) * uy; tq = (q[0] - pa[0]) * ux + (q[1] - pa[1]) * uy
        # keep the pieces whose projection lies between the two crossings
        # and which run close to the chord (a street can bend, not double back)
        if max(tp, tq) < -2 or min(tp, tq) > ln + 2: continue
        lo, hi = max(0.0, min(tp, tq)), min(ln, max(tp, tq))
        if hi - lo < 0.5: continue
        def at(t):
            s = (t - tp) / (tq - tp) if tq != tp else 0.0
            return (p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s)
        out.append([at(lo), at(hi)])
    return out


_LABELS = None


def street_line(name):
    """a named street as the one straight stretch the label chunks publish
    (base/street-labels, strt/street-labels-2: centre, unit direction,
    length): ((x, y), (dx, dy), length) or None"""
    global _LABELS
    if _LABELS is None:
        names = street_names(); _LABELS = {}
        for f in ('base/street-labels.qc', 'strt/street-labels-2.qc'):
            _, d = qc.read(f'{CITY}/{f}')
            for i in range(len(d['nm'])):
                nm = int(d['nm'][i])
                if nm >= len(names): continue
                rec = ((float(d['x'][i]), float(d['y'][i])), (int(d['dx'][i]) / 10000, int(d['dy'][i]) / 10000), float(d['len'][i]))
                if names[nm] not in _LABELS or rec[2] > _LABELS[names[nm]][2]: _LABELS[names[nm]] = rec
    return _LABELS.get(name)


def line_between(name, a, b):
    """street `name` between its crossings with streets a and b, on the
    published straight stretches: [(x0, y0), (x1, y1)] or None"""
    s = street_line(name)
    if s is None: return None
    (cx, cy), (dx, dy), _ = s

    def meet(other):
        o = street_line(other)
        if o is None: return None
        (ox, oy), (ex, ey), _ = o
        den = dx * ey - dy * ex
        if abs(den) < 1e-6: return None
        t = ((ox - cx) * ey - (oy - cy) * ex) / den
        return (cx + dx * t, cy + dy * t)
    pa, pb = meet(a), meet(b)
    return [pa, pb] if pa and pb else None


def parks():
    """the published Recreation and Parks rings (DataSF gtr9-ntp6, base/parks.qc,
    decimetres): [(name, ring)]"""
    import json
    _, d = qc.read(f'{CITY}/base/parks.qc')
    m = json.load(open(f'{CITY}/manifest.json'))
    e = [c for c in m['chunks'] if c.get('k') == 'base/parks'][0]
    names = e.get('names') or []
    out, k = [], 0
    for i, n in enumerate([int(v) for v in d['len']]):
        xy = d['xy'][k * 2:(k + n) * 2]
        out.append((names[i] if i < len(names) else '', [(float(xy[j * 2]) / 10, float(xy[j * 2 + 1]) / 10) for j in range(n)]))
        k += n
    return out
