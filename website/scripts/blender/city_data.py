"""Buildings of a box, straight from the published chunks: footprint ring,
height, year, use, storeys, facade type, shop bit, per-edge role.
Mirrors src/lib/citygl/bldg.ts decodeBldg (global accumulator, escapes first)."""
import glob, json, os, numpy as np
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

# THE BUILDINGS DATASF DOES NOT HAVE (newb_prep.py): OpenStreetMap records
# (ODbL, (c) OpenStreetMap contributors) in this same schema, flagged
# src='osm'. They are appended (NEWB=0: not), and the low DataSF records a new
# tower stands on (the lot before it) are dropped from its year on (ERA, the
# year hq_city/hq_scene show; unset = today). NEWB_FILE overrides the file.
NEWB_FILES = [os.path.join(os.path.dirname(os.path.abspath(__file__)), 'newb_records.json'),
              '/Users/daniel/code/qipu-render-work/newbuildings/osm_records.json']
SOUTH_FILE = '/Users/daniel/code/qipu-render-work/ground/south_records.json'
_NB = None
def newb():
    """(records, DataSF gids they replace in the ERA shown); empty with NEWB=0"""
    global _NB
    if os.environ.get('NEWB', '1') != '1': return [], set()
    if _NB is None:
        _NB = ([], set())
        p = os.environ.get('NEWB_FILE') or next((q for q in NEWB_FILES if os.path.exists(q)), None)
        if p and os.path.exists(p):
            j = json.load(open(p)); era = float(os.environ['ERA']) if os.environ.get('ERA') else None
            # a record on a landmark's site ('lm') gives way when that landmark is modelled
            try:
                import landmarks_hq as L_; on = {l.key for l in L_._registry()}     # enabled, LM_KEYS, or all with LM_ALL=1
            except Exception: on = None
            live = lambda r: not r.get('lm') or (on is not None and r['lm'] not in on)
            _NB = ([dict(r, ring=[(float(x), float(y)) for x, y in r['ring']]) for r in j['records'] + j.get('lm_records', []) if live(r)],
                   {int(x['gid']) for x in j.get('replaces', []) + j.get('lm_replaces', []) if (era is None or era >= x['year']) and live(x)})
        # beyond the county line: generic buildings from OSM (ground_prep.py
        # south_records: Daly City, Colma, Brisbane — the picture's frame); SOUTH=0 leaves them out
        sp = SOUTH_FILE
        if os.environ.get('SOUTH', '1') == '1' and os.path.exists(sp):
            era = float(os.environ['ERA']) if os.environ.get('ERA') else None
            _NB[0].extend(dict(r, ring=[(float(x), float(y)) for x, y in r['ring']]) for r in json.load(open(sp))['records'] if era is None or r['year'] <= era)
    return _NB

def buildings(x0, y0, x1, y1):
    out = []
    NB, GONE = newb()
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
            if GONE and int(f['gid'][i]) in GONE: continue
            out.append(dict(gid=int(f['gid'][i]), ring=r, cx=cx, cy=cy,
                            h=float(f['h'][i]) + RH[int(f['hf'][i]) & 3], year=None if u & 16 else 1849 + int(f['yr'][i]),
                            use=USES[u & 7] if (u & 7) < len(USES) else 'mixed or not stated', st=int(f['st'][i]),
                            ty=FA_TYPES[int(face['ty'][i])] if face is not None and int(face['ty'][i]) < 10 else 'UNCLASSED',
                            shop=bool(face['shop'][i]) if face is not None else False, roles=roles,
                            paint=int(f['paintIdx'][i])))
    out.extend(r for r in NB if x0 <= r['cx'] <= x1 and y0 <= r['cy'] <= y1)
    return overrides(out)


# SIGNATURE PLACES (places agent): per-building corrections for today's city,
# places/overrides.json {gids: {gid: {h, st, ty, skip, ...}}}. h / st / ty
# replace the record's; skip drops it; every other field (roof, roof_col,
# facade_col, style...) rides on the record as b['places'] for gen_buildings.
# Today only (ERA unset): an era render keeps the records as they were.
OV_FILE = '/Users/daniel/code/qipu-render-work/places/overrides.json'
_OV = None
def overrides(recs):
    global _OV
    if os.environ.get('ERA') or os.environ.get('PLACES_OV', '1') != '1': return recs
    if _OV is None:
        try: _OV = {int(k): v for k, v in json.load(open(OV_FILE))['gids'].items()} if os.path.exists(OV_FILE) else {}
        except Exception as ex: print('[overrides] unreadable', ex, flush=True); _OV = {}
    if not _OV: return recs
    out = []
    for b in recs:
        o = _OV.get(b['gid'])
        if o is None: out.append(b); continue
        if o.get('skip'): continue
        b = dict(b)
        for k in ('h', 'st', 'ty', 'year', 'use', 'shop'):
            if k in o: b[k] = o[k]
        b['places'] = {k: v for k, v in o.items() if k not in ('h', 'st', 'ty', 'year', 'use', 'shop', 'skip', 'why')}
        out.append(b)
    return out


def hero_gids():
    """footprints the engine replaces by a hand-built landmark (heroes.json `b`):
    the generator must not model them a second time"""
    import json
    h = json.load(open(f'{CITY}/base/heroes.json'))
    return {int(x['b']) for x in h['heroes'] if isinstance(x.get('b'), (int, float)) and x['b'] >= 0}
