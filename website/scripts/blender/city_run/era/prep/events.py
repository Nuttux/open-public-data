# events.py (qhprep copy of era_anim/events.py): the DATA-driven event list of one key-year segment (no invented events).
# qh: 'same' / 'cont' from prep.py (flag-aware sig: stand-ins, ruins, rebuilds, rising); Y0 / Y1 = the key years' moments (seg.json);
# the 1906 fire: demolitions of the burned district at the fire (18-21 Apr 1906, era.burned), ruins appear right after (td1 / t0 / yc / gap
# overrides read by grammar.py); a building still rising at the end year completes AT the end year (its partial frame = the key render).
# changed prisms (not in 'same') visible in the core -> construction (2026 prism, completion year = prism 'year' / BT year_built)
# or demolition (1985 prism, BT year_demolished); the Embarcadero Freeway from era.STRUCTURES (dem 1991.16-1991.75).
# usage: python3 events.py <in dir> [Y0 Y1]  -> <in dir>/events.json
import sys, os, json, pickle, numpy as np
sys.path.insert(0, '/Users/daniel/code/opd-pipeline/website/scripts/blender/pipeline')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); import eracity as EC   # per city (CITY unset = SF's literals)  # ERA_CITY
if EC.CITY != 'sf': sys.modules['bt_read'] = None   # SF's building table (bid = SF gid): never for another city  # ERA_CITY
IN = sys.argv[1]; SJ = json.load(open(IN + '/seg.json')); Y0, Y1 = SJ['Y0'], SJ['Y1']; FIRE = SJ['fire']
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import common as _CMe   # (era_auto) the area's overlay era first
sys.path.insert(0, EC.PREP_SNAP); import era as EA
def u(key, salt): import hashlib; return int(hashlib.sha1(f'{key}:{salt}'.encode()).hexdigest()[:8], 16) / 2 ** 32


def main():
    D = pickle.load(open(IN + '/prisms_w.pkl', 'rb')); P85, P26 = D['prisms']['1985'], D['prisms']['2026']
    S = np.load(IN + '/state.npz')
    k85 = {b['key']: b for b in P85}; k26 = {b['key']: b for b in P26}
    SC = pickle.load(open(IN + '/same.pkl', 'rb')); same, cont = SC['same'], SC['cont']
    fire = Y0 < FIRE < Y1
    try:
        from bt_read import BT; T = BT()
    except Exception as e:
        print('BT unavailable:', e); T = None
    def bt_years(gid):
        if T is None or gid is None: return None, None, None, None
        r = T.c.execute('select year_built, year_built_src, year_demolished, year_demolished_src from buildings where bid = ?', (int(gid),)).fetchone()
        return tuple(r) if r else (None, None, None, None)
    ev = []
    NEWm, GONEm, ADD, own = S['NEW'], S['GONE'], S['ADD'], S['own']
    newid = np.where(NEWm, S['M26'], -1); goneid = np.where(GONEm, S['M85'], -1)
    newid = np.where(ADD & (own >= 0), own, newid); goneid = np.where(ADD & (own < -1), -own - 2, goneid)
    cn = np.bincount(newid[newid >= 0].ravel(), minlength=len(P26)); cg = np.bincount(goneid[goneid >= 0].ravel(), minlength=len(P85))
    SO = S['SO']; codes = set(np.unique(SO[SO != -1]).tolist())     # changed casters whose shadow reaches the core count too
    for k, b in enumerate(P26):
        if b['key'] in same or (cn[k] == 0 and k not in codes): continue
        yb, ys, _, _ = bt_years(b.get('gid'))
        y = EA.RECORD_YEAR_FIX.get(b.get('gid')) or b.get('year') or yb   # (era_auto) today's prisms keep the raw roll year (fix_records skips era None): the audited year wins
        if b.get('lm') == 'transit_center': y = 2018.4             # the Salesforce Transit Center opened 2018 (with its bus ramps, era.STRUCTURES 2018.6); BT's 2009 is the parcel
        src = 'prism' if b.get('year') else (ys or 'none')
        e = dict(t='build', i=k, key=b['key'], gid=b.get('gid'), kind=b['kind'], h=round(float(b['h']), 1), year=y, src=src, px=int(cn[k]))
        if fire and b.get('ruin'):                                  # a ruin: there as soon as the fire has passed its lot
            t0 = FIRE + 0.012 + 0.006 * u(b['key'], 2); e.update(t0=t0, yc=t0 + 0.03, gap=0.004, src='fire (era.FIRE)', ruin=b['ruin'])
        elif fire and EA.burned(b['cx'], b['cy']) and (y is None or y > FIRE):   # the rebuild after the fire: not before the lot is cleared
            e.update(tmin=FIRE + 0.15 + 0.35 * u(b['key'], 3))
        if b.get('rise') is not None and not b.get('ruin'):                             # still rising at the end year: its frame so far completes AT Y1
            e.update(yc=Y1 - 0.02, rising=round(float(b['rise']), 2))
        if b['key'] in cont: e['cont'] = True
        ev.append(e)
    for k, b in enumerate(P85):
        if b['key'] in same or (cg[k] == 0 and -(k + 2) not in codes): continue
        yb, ys, yd, ds = bt_years(b.get('gid'))
        if b['key'] in cont: continue
        e = dict(t='demolish', i=k, key=b['key'], gid=b.get('gid'), kind=b['kind'], h=round(float(b['h']), 1), year=yd, src=ds or 'none', built=b.get('year'), px=int(cg[k]))
        if b.get('ruin') and Y0 < 1908.6:                              # a 1906 ruin: rubble cleared over the summer of 1906 .. mid-1908 (era.rubble_share)
            e.update(td1=max(Y0 + 0.1, 1906.6 + 1.9 * u(b['key'], 4)), dur=0.12, src='rubble cleared (era.rubble_share)')
        elif fire and EA.burned(b['cx'], b['cy']):                   # burned 18-21 April 1906
            e.update(td1=FIRE + 0.002 + 0.008 * u(b['key'], 1), dur=0.006, gap=0.004, src='fire (era.FIRE, era.burned)')
        ev.append(e)
    for st in json.load(open(IN + '/structures.json')):
        if st['px'] > 0: ev.append(dict(t='structure_' + ('gone' if st['gone'] else 'new'), key=st['key'], kind=st['kind'], year=(st['dem'] or [st['y1']])[0] if st['gone'] else st['y0'] - 1.5,
                                         year_end=(st['dem'] or [0, st['y1']])[1] if st['gone'] else st['y0'], src='era.STRUCTURES / freeways', px=st['px']))
    json.dump(dict(Y0=Y0, Y1=Y1, Ya=SJ['Ya'], Yb=SJ['Yb'], events=ev), open(IN + '/events.json', 'w'), indent=0)
    for e in sorted(ev, key=lambda e: (e['t'], e.get('year') or 0)):
        print(e['t'], e['key'][:28], 'h', e.get('h'), 'year', e.get('year'), e.get('src'), 'px', e['px'])

if __name__ == '__main__':
    main()
