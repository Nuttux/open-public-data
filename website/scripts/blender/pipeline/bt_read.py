#!/usr/bin/env python3
"""pipeline/bt_read.py - READER API of the building table (BT_SCHEMA.md). Pure stdlib (sqlite3 + json): works in Blender's python,
on pods, in the AI compose, the eras and the stories.

  from bt_read import BT
  T = BT()                                   # default /Volumes/DANI-SD-DRIVE2/pipeline/bt/sf_bt.sqlite (env BT_FILE overrides)
  T.get(gid)                                 # core + the CHOSEN value of every attribute (profile 'best') + its conf / src / date
  T.attr(gid, 'facade_col')                  # chosen {value, conf, src, date, note}; T.attr(gid, 'st', all=True) -> every candidate
  T.in_box(x0, y0, x1, y1)                   # gids whose centre is in the world box
  T.records(x0, y0, x1, y1, era=None)        # = city_data.buildings(x0, y0, x1, y1) of today's render (profile 'render_today'):
                                             #   DataSF + OSM + fresh + places merged exactly as city_data does (drop-in for the render)
  T.fa_table()                               # = faithful fa_table_v3.json shape {gid: {...}} for gen_buildings' FA_FILE
  T.alive(gid, year)                         # stands in that year? (built <= year < demolished)
  T.changed(other_db)                        # {added, removed, changed} gids vs another build (-> pipeline/tiles.py touch: tiles to re-run)

  python3 bt_read.py info | get <gid> | box x0,y0,x1,y1 | diff <other.sqlite>
"""
import os, sys, json, sqlite3

DEF = os.environ.get('BT_FILE', '/Volumes/DANI-SD-DRIVE2/pipeline/bt/sf_bt.sqlite')
# 'best' profile: a hand-checked value (places) first, then by confidence (measured > registry > photo-read > inferred > convention).
# era_fix only counts for years. Per-attribute exceptions go here (BT_SCHEMA.md "profiles").
MANUAL = ('places',)


def choose(cands, attr=None, profile='best'):
    """cands: [{value, conf, src, ...}] -> the chosen one (or None)"""
    if not cands: return None
    if profile == 'render_today': cands = [c for c in cands if not c['src'].startswith('faithful') and c['src'] != 'era_fix'] or []
    if not cands: return None
    return max(cands, key=lambda c: (c['src'] in MANUAL, c['conf'] or 0))


class BT:
    def __init__(s, path=None):
        s.path = path or DEF; s.c = sqlite3.connect(f'file:{s.path}?mode=ro', uri=True); s.c.row_factory = sqlite3.Row
        s.meta = {r['k']: r['v'] for r in s.c.execute('select * from meta')}

    # ---- single building ----
    def _core(s, r):
        d = dict(r); d['ring'] = [tuple(p) for p in json.loads(d['ring'])]; d['roles'] = json.loads(d['roles']) if d['roles'] else None
        d['raw'] = json.loads(d['raw']); d['gid'] = d['bid']; return d

    def cands(s, gid, attr=None):
        q = 'select attr, value, conf, src, date, note from attrs where bid = ?' + (' and attr = ?' if attr else '')
        return [dict(attr=r['attr'], value=json.loads(r['value']), conf=r['conf'], src=r['src'], date=r['date'], note=r['note'])
                for r in s.c.execute(q, (gid, attr) if attr else (gid,))]

    def attr(s, gid, attr, all=False, profile='best'):
        c = s.cands(gid, attr); return c if all else choose(c, attr, profile)

    def get(s, gid, profile='best'):
        r = s.c.execute('select * from buildings where bid = ?', (gid,)).fetchone()
        if not r: return None
        d = s._core(r); by = {}
        for c in s.cands(gid): by.setdefault(c['attr'], []).append(c)
        d['attrs'] = {a: choose(v, a, profile) for a, v in by.items()}
        for a in ('h', 'st', 'ty', 'use'):
            if d['attrs'].get(a): d[a] = d['attrs'][a]['value']
        d['z0'] = d['attrs'].get('z0', {}).get('value') if d['attrs'].get('z0') else None
        d['geoms'] = [dict(kind=g['kind'], idx=g['idx'], geom=json.loads(g['geom']), conf=g['conf'], src=g['src']) for g in
                      s.c.execute('select * from geoms where bid = ? order by kind, idx', (gid,))]
        return d

    def in_box(s, x0, y0, x1, y1):
        return [r[0] for r in s.c.execute('select bid from buildings where cx between ? and ? and cy between ? and ?', (x0, x1, y0, y1))]

    def alive(s, gid, year):
        r = s.c.execute('select year_built, year_demolished from buildings where bid = ?', (gid,)).fetchone()
        if not r: return False
        return (r[0] is None or r[0] <= year) and (r[1] is None or year < r[1])

    # ---- today's render view (= city_data.buildings) ----
    def _attrs_src(s, src, attr=None):
        q = 'select bid, attr, value from attrs where src = ?' + (' and attr = ?' if attr else '')
        return s.c.execute(q, (src, attr) if attr else (src,)).fetchall()

    def records(s, x0, y0, x1, y1, era=None, places=True, modelled_landmarks=None, south=True):
        """city_data.buildings(x0, y0, x1, y1) with NEWB=1 FRESH=1 (SOUTH=south, PLACES_OV=places) for ERA=era, from the table, in city_data's order.
        modelled_landmarks: the landmark keys the scene models (landmarks_hq registry); None = as outside Blender (lm records dropped)"""
        on = modelled_landmarks
        live = lambda lm: not lm or (on is not None and lm not in on)
        lmrep = {b: json.loads(v) for b, a, v in s._attrs_src('osm', 'replaced_for_landmark')}
        GONE = {b for b, a, v in s._attrs_src('osm', 'year_demolished') if (era is None or era >= json.loads(v)) and live(lmrep.get(b))}
        fr_until = {b: json.loads(v) for b, a, v in s._attrs_src('fresh', 'year_demolished')}
        redated = {b for b, a, v in s._attrs_src('fresh', 'fresh_redated')}
        FDATED = set(fr_until) | redated; FGONE = {b for b, u in fr_until.items() if era is None or era >= u} | redated
        if FDATED: GONE = (GONE - FDATED) | FGONE
        out = []
        for r in s.c.execute("select * from buildings where origin in ('datasf', 'osm', 'south', 'fresh') and cx between ? and ? and cy between ? and ? order by ord", (x0, x1, y0, y1)):
            d = s._core(r); o = d['origin']
            if o == 'datasf' and d['bid'] in GONE: continue
            if o == 'osm' and (d['bid'] in FGONE or not live(d['raw'].get('lm'))): continue
            if o == 'south' and (not south or d['bid'] in FGONE or (era is not None and d['raw']['year'] > era)): continue
            rec = dict(d['raw']); rec['ring'] = d['ring']; rec['roles'] = d['roles'] if o == 'datasf' else d['roles']
            out.append(rec)
        if era is not None or not places: return out
        ov = {}
        for b, a, v in s._attrs_src('places'): ov.setdefault(b, {})[a] = json.loads(v)
        fp = {r[0]: json.loads(r[1]) for r in s.c.execute("select bid, geom from geoms where kind = 'footprint_places'")}
        res = []; seen = set()
        for b in out:
            o = ov.get(b['gid']); f = fp.get(b['gid'])
            if o is None and f is None: res.append(b); seen.add(b['gid']); continue
            o = o or {}
            if o.get('skip'): continue
            b = dict(b)
            for k in ('h', 'st', 'ty', 'use', 'shop'):
                if k in o: b[k] = o[k]
            if 'year_built' in o: b['year'] = o['year_built']
            if f and f.get('ring'):
                b['ring'] = [tuple(p) for p in f['ring']]; n = len(b['ring'])
                b['cx'] = sum(p[0] for p in b['ring']) / n; b['cy'] = sum(p[1] for p in b['ring']) / n; b['roles'] = list(f.get('roles') or [1] * n)
            b['places'] = {k[3:]: v for k, v in o.items() if k.startswith('ov_')}
            res.append(b); seen.add(b['gid'])
        for r in s.c.execute("select * from buildings where origin = 'places_add' and cx between ? and ? and cy between ? and ? order by ord", (x0, x1, y0, y1)):
            d = s._core(r)
            if d['bid'] not in seen: a = dict(d['raw']); a['ring'] = d['ring']; a['roles'] = d['roles']; res.append(a)
        return res

    # ---- faithful table view (= fa_table_v3.json) ----
    FA_KEYS = ('facade_col', 'trim_col', 'style', 'st', 'garage', 'bays', 'bay_kind', 'mat', 'ref_col', 'roof_col', 'shape')
    def fa_table(s, gids=None):
        T = {}
        for b, a, v in s.c.execute("select bid, attr, value from attrs where src like 'faithful%'"):
            if a in s.FA_KEYS and (gids is None or b in gids): T.setdefault(str(b), {})[a] = json.loads(v)
        for b, k, i, g in s.c.execute("select bid, kind, idx, geom from geoms where kind in ('arc', 'front_walls') order by bid, kind, idx"):
            if gids is not None and b not in gids: continue
            e = T.setdefault(str(b), {})
            if k == 'front_walls': e['fw'] = json.loads(g)
            else: e.setdefault('arcs', []).append(json.loads(g))
        return T

    # ---- changes between two builds ----
    def changed(s, other):
        o = BT(other) if isinstance(other, str) else other
        a = dict(s.c.execute('select bid, rev from buildings').fetchall()); b = dict(o.c.execute('select bid, rev from buildings').fetchall())
        return dict(added=sorted(set(a) - set(b)), removed=sorted(set(b) - set(a)), changed=sorted(k for k in set(a) & set(b) if a[k] != b[k]))


if __name__ == '__main__':
    a = sys.argv[1:]; T = BT(os.environ.get('BT_FILE'))
    if not a or a[0] == 'info': print(json.dumps(T.meta, indent=1))
    elif a[0] == 'get': print(json.dumps(T.get(int(a[1])), indent=1, default=str)[:6000])
    elif a[0] == 'box': print(len(T.in_box(*map(float, a[1].split(',')))))
    elif a[0] == 'diff': d = T.changed(a[1]); print({k: len(v) for k, v in d.items()}, {k: v[:10] for k, v in d.items()})
