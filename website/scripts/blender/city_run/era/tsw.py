"""era_auto tsw.py <Ya> <Yb>: SWITCH DATES instead of dissolves, for every pixel of a segment that changes between the two key paintings but that
no building / structure event owns (paint.py TSW_DIR: such a pixel switches locally over 0.4 y on its date, instead of a whole-segment
cross-dissolve that shows double images). env ERA_AREA. -> WQ/tsw/tsw_<Ya>_<Yb>.npy (core px, NaN = none) + tsw_<Ya>_<Yb>.json (px per rule)
RULES, per connected change region (in this order):
  T1 cars      a region that holds cars in either year: the parked fleet turns over one kerb / lot at a time: a hashed date in the segment
  T2 event     a region within 150 px of a building / structure event: the median date of the events it touches (a site, its shadow, its lot)
  T3 marks     a street region in a segment that spans 1972 (era.py 'marks: drawn from the 1970s on'): 1972
  T4 other     a hashed date in the segment (never all at once: each region on its own date)"""
import sys, os, json, pickle, numpy as np, cv2, scipy.ndimage as nd
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import keys as K
import eracity as EC   # per city (CITY unset = SF's literals)  # ERA_CITY
Image.MAX_IMAGE_PIXELS = None
Ya, Yb = int(sys.argv[1]), int(sys.argv[2]); RUN = K.RUN; WQ = K.WQ; S = f'{WQ}seg/{Ya}_{Yb}/'
mom = EC.moment; Y0, Y1 = mom(Ya), mom(Yb)
PD = os.environ.get('TSW_PAINT', f'{RUN}/paint'); kA = np.asarray(Image.open(f'{PD}/key_{Ya}.png').convert('RGB')).astype(np.int16); kB = np.asarray(Image.open(f'{PD}/key_{Yb}.png').convert('RGB')).astype(np.int16)
d = cv2.blur(np.abs(kA - kB).max(-1).astype(np.float32), (5, 5)); del kA, kB
St = np.load(S + 'work/stageA.npz'); ev = json.load(open(S + 'in/events.json'))['events']
own = St['GONE'] | St['NEW'] | (St['CH'] if os.environ.get('TSW_OWN_CH', '1') == '1' else False) | St['ADD'] | St['CROWN'] | (St['FWK'] >= 0) | (St['FWN'] >= 0)   # (i4) TSW_OWN_CH=0: class-change px get dates too (whole-year paintings: else the slow ground spread)
own = K.dk(own, 9)
THR = float(os.environ.get('TSW_THR', 12)); D = (d > THR) & ~own   # (i4) TSW_THR=5: every visibly changed px gets a date (no dissolve left)
# event date raster: builds on the end year's prism ids, demolitions on the start year's
T_ev = np.full(D.shape, np.nan, np.float32); M85, M26 = St['M85'], St['M26']
bi = {e['i']: e['year'] for e in ev if e.get('t') == 'build' and e.get('year') is not None and 'i' in e}
di = {e['i']: e['year'] for e in ev if e.get('t') in ('demolish', 'demolition', 'gone') and e.get('year') is not None and 'i' in e}
for Mx, dd in ((M26, bi), (M85, di)):
    if dd:
        lut = np.full(int(Mx.max()) + 2, np.nan, np.float32)
        for i, y in dd.items():
            if i < len(lut) - 1: lut[i] = y
        v = lut[np.where(Mx >= 0, Mx, len(lut) - 1)]; T_ev = np.where(np.isfinite(v) & ~np.isfinite(T_ev), v, T_ev)
for k in ('FWK', 'FWN'):
    m = St[k] >= 0
    if m.any():
        sj = json.load(open(S + 'in/structures.json')) if os.path.exists(S + 'in/structures.json') else []
        yrs = [s_.get('dem')[0] if s_.get('dem') else (s_['y1'] if s_.get('gone') else s_['y0']) for s_ in sj]
        if yrs: T_ev[m & ~np.isfinite(T_ev)] = float(np.clip(np.median(yrs), Y0, Y1))
has_ev = np.isfinite(T_ev); dist, (iy, ix) = nd.distance_transform_edt(~has_ev, return_indices=True) if has_ev.any() else (np.full(D.shape, 1e9), (None, None))
YD = f'{WQ}years/'
def cls(Y): return np.load(f'{YD}{Y}/Cc.npy')
cA, cB = cls(Ya), cls(Yb)
def cars(Y):
    return K.car_a(K.rd(K.blkdir(Y), 'R.class.png', K.QC))
car = cars(Ya) | cars(Yb)
lab, n = nd.label(K.dk(D, 7) & (d > min(6, THR))); T = np.full(D.shape, np.nan, np.float32); st = dict(T1_cars=0, T2_event=0, T3_marks=0, T4_other=0)
h = lambda i: ((i * 2654435761) % 1000003) / 1000003.0
lo, hi = Y0 + 0.08 * (Y1 - Y0), Y1 - 0.08 * (Y1 - Y0)
for i, sl in enumerate(nd.find_objects(lab), 1):
    if sl is None: continue
    m = lab[sl] == i; npx = int(m.sum())
    if car[sl][m].mean() > 0.03: T[sl][m] = lo + (hi - lo) * h(i); st['T1_cars'] += npx; continue
    dm = dist[sl][m]
    if (dm < 150).mean() > 0.3:
        yy = T_ev[iy[sl][m], ix[sl][m]]; yy = yy[dm < 150]; T[sl][m] = float(np.clip(np.median(yy), Y0 + 0.02, Y1 - 0.02)); st['T2_event'] += npx; continue
    if Ya < 1972 < Yb and ((cA[sl][m] == 5) | (cB[sl][m] == 5)).mean() > 0.6: T[sl][m] = 1972.0; st['T3_marks'] += npx; continue
    T[sl][m] = lo + (hi - lo) * h(i + 7919); st['T4_other'] += npx
st['dissolve_px'] = int(((d > 6) & ~own & ~np.isfinite(T)).sum()); st['owned_px'] = int(((d > 6) & own).sum())   # left to the plain whole-segment dissolve / owned by events
# EVENT CHECK: a build / demolition dated outside its segment is a data error (an identity or year mismatch), listed with its px
bad = [(e['t'], e['key'], e.get('year'), e['px']) for e in ev if e.get('t') in ('build', 'demolish') and e['px'] > 2000 and not e.get('rising') and e.get('year') is not None and not (Ya - 0.01 <= float(e['year']) <= Yb + 0.51)]
und = [(e['t'], e['key'], e['px']) for e in ev if e.get('t') in ('build', 'demolish') and e['px'] > 2000 and e.get('year') is None]
st['event_out_of_segment'] = sorted(bad, key=lambda x: -x[3])[:15]; st['event_undated'] = sorted(und, key=lambda x: -x[2])[:15]
st['n_event_out'] = len(bad); st['n_event_undated'] = len(und)
# (i6) a pixel inside a build / demolition event's own prism raster takes THAT event's date, never its region's median (the Transamerica
# Pyramid's pixels got 1967 from its neighbours; its event owns 0 'NEW' px because the engine models it as a hero mesh)
own_ev = np.isfinite(T_ev) & K.dk(D, 7); T[own_ev] = np.clip(T_ev[own_ev], Y0 + 0.02, Y1 - 0.02); st['T0_own_event'] = int(own_ev.sum())
TD_ = os.environ.get('TSW_OUT', f'{WQ}tsw'); os.makedirs(TD_, exist_ok=True); np.save(f'{TD_}/tsw_{Ya}_{Yb}.npy', T); st.update(regions=int(n), px=int(np.isfinite(T).sum()))
json.dump(st, open(f'{TD_}/tsw_{Ya}_{Yb}.json', 'w')); print('TSW', Ya, Yb, st)
