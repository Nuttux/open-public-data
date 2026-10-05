# ids.py (qhprep, from heroprep/b52eprep): prisms of ONE key year around the qh core (SNAP combo5, the topo sheets via fakebpy as in
# Blender), wide pad -> years/<Y>/prisms.pkl. Heights follow what the render draws (gen_buildings.ruin / construction):
#  stand-ins (the lost city: records flagged 'standin'): split into lots with each lot's period form + height (gen_buildings.split_lots /
#  standin, the renderer's own rules); 1906 'burned' frame buildings (HOUSE/FLATS/APARTMENT/UNCLASSED < 16 m) = an ash heap (1.5 m; k25 ASH_MOUND overlays: their RUIN_FRAME_PRISM_H, 0.6 m) (+ a chimney: ignored); 'burned' brick
#  = ragged walls 55-100 % of h (-> 0.8 h); 'shell' = full-height roofless walls (h); a rising building = its frame fraction of h.
# usage: python3 ids.py <Y>      (2026 = today)
import sys, os, time, pickle, numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); import eracity as EC   # per city (CITY unset = SF's literals)  # ERA_CITY
sys.path.insert(0, '/Users/daniel/code/qipu-render-work/eras2/transitions')
import stage as S, objects as O
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import common as CM, fakebpy
S.SNAP = CM.SNAP
sys.path.insert(0, S.SNAP); import terrain_hq as T
Y = int(sys.argv[1]); era = CM.era_of(Y)
ox, oy, W, H = CM.O[0], CM.O[1], CM.W, CM.H
X0, Y0 = ox / 2 - S.OX, oy / 2 - S.OY; X1, Y1 = X0 + W / 2, Y0 + H / 2
xs, ys = S.c2w(np.array([X0, X1, X0, X1]), np.array([Y0, Y0, Y1, Y1]), 0.0)
wbox = (xs.min(), ys.min(), xs.max(), ys.max())
# the date audit (30/09): RECORD_YEAR_FIX of the overlay era.py (ERA_OVERLAY dir, default qh/kt/k6 = combo5 era.py + the audit's fixes)
# applied to the snap's era module before anything reads the records (landmark models keep skip_gids.json 'built', as the render does)
S.records(); import era as EA0, importlib.util
OV = os.environ.get('ERA_OVERLAY', CM.ERA_OVERLAY or '/Volumes/QIPU-SSD/qipu-render-work/combo/block52/qh/kt/k6')
if OV:
    sp = importlib.util.spec_from_file_location('era_overlay', OV + '/era.py'); m_ = importlib.util.module_from_spec(sp); sp.loader.exec_module(m_)
    n0 = len(EA0.RECORD_YEAR_FIX); EA0.RECORD_YEAR_FIX.clear(); EA0.RECORD_YEAR_FIX.update(m_.RECORD_YEAR_FIX); print('year fixes from', OV, n0, '->', len(EA0.RECORD_YEAR_FIX))
t = time.time(); P = O.standing(era, wbox, pad=(600.0, 900.0, 200.0, 150.0))
# (30/09 v2) landmark model dates the audit found wrong, as the render's overlay (qh/kt/k7/lm_places.py LM_BUILT_FIX): t_mills is ONE mesh
# 'Mills Building and Mills Tower' dated 1892; the 22-storey tower was completed 1931 -> no model before 1931
LM_BUILT_FIX = {'t_mills': 1931}
try:
    _sp = importlib.util.spec_from_file_location('lmp_overlay', os.environ.get('LM_OVERLAY', EC.OVERLAY) + '/lm_places.py'); _m = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(_m); LM_BUILT_FIX.update(getattr(_m, 'LM_BUILT_FIX', {}))
except Exception as _e: print('LM_BUILT_FIX overlay not read:', _e)
_n0 = len(P); P = [b for b in P if not (b.get('kind') == 'lm' and b.get('lm') in LM_BUILT_FIX and era is not None and era < LM_BUILT_FIX[b['lm']])]
if len(P) != _n0: print('LM_BUILT_FIX: dropped', _n0 - len(P), 'landmark prisms')
# (era_auto 01/10) RULE: the hero meshes (Transamerica Pyramid, ...) are excluded from the records, so they had no prism and no build event and
# the film switched their pixels on a guessed date (the Pyramid stood in 1967). Each hero record in the box is a landmark prism, standing from its
# (audited) record year on.
import city_data as _cd, era as _EAh
_x0, _y0, _x1, _y1 = wbox[0] - 600, wbox[1] - 900, wbox[2] + 200, wbox[3] + 150
_hk = {b['key'] for b in P}
for _b in _cd.buildings(-9000, -9000, 9000, 9000):
    if _b['gid'] not in _cd.hero_gids() or not (_x0 <= _b['cx'] <= _x1 and _y0 <= _b['cy'] <= _y1) or f"g{_b['gid']}" in _hk: continue
    _y = _EAh.RECORD_YEAR_FIX.get(_b['gid']) or _b.get('year')
    if era is not None and (_y is None or _y > era): continue
    P.append(dict(_b, key=f"g{_b['gid']}", kind='lm', lm=f"hero_{_b['gid']}", year=_y)); print('hero prism', _b['gid'], round(_b['h']), _y)
import era as EA
GB = fakebpy.gen_buildings()                       # the renderer's own stand-in rules (split_lots, standin), outside Blender
from collections import Counter
fl = Counter(); out = []
# (k25) RULE ASH_MOUND alignment: a burned frame building's prism is as tall as the render draws it. k25's gen_buildings.py draws a low heap
# (RUIN_FRAME_PRISM_H, ~0.6 m); earlier overlays a 0.4-1.3 m plate (prism 1.5 m, unchanged). Read from the area's RENDER overlay
# (area json 'overlay', else ERA_OVERLAY); ASH_MOUND=0 (the render's switch back to the plate) -> 1.5.
def _frame_ruin_h():
    import re
    for d_ in ((CM.AREA or {}).get('overlay'), OV):
        f_ = f'{str(d_).rstrip("/")}/gen_buildings.py' if d_ else None
        if f_ and os.path.exists(f_):
            m_ = re.search(r'^RUIN_FRAME_PRISM_H = ([0-9.]+)', open(f_).read(), re.M)
            return float(m_.group(1)) if (m_ and os.environ.get('ASH_MOUND', '1') == '1') else 1.5
    return 1.5
FRAME_RUIN_H = _frame_ruin_h(); print('burned frame prism h', FRAME_RUIN_H)
def zg_of(b): r = np.array(b['ring']); return float(np.nanmin(T.true_ground(r[:, 0], r[:, 1])))
FRAME = ('HOUSE', 'FLATS', 'APARTMENT', 'UNCLASSED')
for b in P:
    parts = [b]
    if b.get('standin'):
        # the lost city: today's merged footprint cut into the old lots, each lot's period form and height (gen_buildings.standin)
        ps = GB.split_lots(b) if not b.get('_lot') else [b]
        parts = []
        for i, sb in enumerate(ps):
            sb = GB.standin(dict(sb, _lot=True)); sb['key'] = b['key'] if len(ps) == 1 else f"{b['key']}#{i}"; sb['kind'] = b['kind']; parts.append(sb)
        fl['standin_records'] += 1; fl['standin_lots'] += len(parts)
    for sb in parts:
        sb['h0'] = sb['h']
        if sb.get('ruin') == 'burned':
            frame = sb.get('ty') in FRAME and sb['h'] < 16
            sb['h'] = FRAME_RUIN_H if frame else max(4.0, sb['h']) * 0.8; fl['burned_' + ('frame' if frame else 'brick')] += 1
        elif sb.get('ruin') == 'shell': sb['h'] = max(4.0, sb['h']); fl['shell'] += 1
        if sb.get('rise') is not None:
            fr, _ = EA.construction_stage(sb['rise']); sb['h'] = max(1.0, sb['h'] * float(fr)); fl['rise'] += 1
        if sb.get('rebuild'): fl['rebuild'] += 1
        sb['zg'] = zg_of(sb); out.append(sb)
P = out
os.makedirs(CM.YD + str(Y), exist_ok=True)
pickle.dump(dict(prisms=P, wbox=wbox, canvas=(X0, Y0), year=Y, era=era), open(CM.YD + f'{Y}/prisms.pkl', 'wb'))
print(Y, 'era', era, len(P), 'prisms %.1f s' % (time.time() - t), dict(Counter(b['kind'] for b in P)), dict(fl))
