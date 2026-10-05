# common.py (era_auto prep, fork of qhprep/common.py): the engine's window = an AREA (env ERA_AREA = area json: QC core, WQ engine work root).
# Without ERA_AREA it falls back to the quarter (qh) so nothing else changes. Key years chained in segments (Ya, Yb).
# the '1985' / '2026' slot names inside the engine files (prisms_w.pkl keys, Cc_1985/Cc_2026, R_1985/R_2026, out_1985_perbuilding,
# base_2026, base_1985) mean START / END year.
import os, json
import sys as _sys_ec; _sys_ec.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); import eracity as EC   # per city  # ERA_CITY
EC.apply_city_env()   # another city: its city.json env as defaults (TODAY_LIDAR, PLACES_OV...: the snapshot's hq_city prelude), SF nothing  # ERA_CITY
SNAP = EC.PREP_SNAP
KEYS = [1905, 1906, 1938, 1959, 1985, 2006, 2026]           # 2026 = today (ERA unset); 1906 = the ruins checkpoint (28 May 1906)
FIRE = EC.fire_moment()
def moment(Y):
    """the float year a key year's render stands for (era.when): the year's middle, 1906 = 28 May 1906 (the ruins checkpoint); today 2026.5"""
    return EC.moment(Y)
def era_of(Y): return None if Y == 2026 else Y
AREA = json.load(open(os.environ['ERA_AREA'])) if os.environ.get('ERA_AREA') else None
if AREA and AREA.get('snap'): SNAP = EC.SNAP_ROOT + AREA['snap']   # b8: rendered on combo6
if AREA:
    WQ = AREA['WQ'].rstrip('/') + '/'; O = (AREA['QC'][0], AREA['QC'][1]); W, H = AREA['QC'][2] - AREA['QC'][0], AREA['QC'][3] - AREA['QC'][1]
    PAINT = AREA.get('PAINT', WQ + 'paint/'); ERA_OVERLAY = AREA.get('overlay_ids')
else:
    WQ = '/Volumes/QIPU-SSD/era_anim_work/qh/'; O = (112640, 29696); W, H = 10240, 7168
    PAINT = '/Volumes/QIPU-SSD/qipu-render-work/combo/block52/qh/paint/'; ERA_OVERLAY = None
def _swap_era(ov):
    """the area's render overlay era.py replaces the snapshot's for every prep tool (prisms, structures, events agree with the render)"""
    import sys, importlib.util
    if getattr(sys.modules.get('era'), '__file__', '') == ov + '/era.py': return
    sys.path.insert(0, '/Users/daniel/code/qipu-render-work/eras2/transitions'); import stage as S_
    S_.SNAP = SNAP; S_._fake_mathutils()
    if SNAP not in sys.path: sys.path.insert(0, SNAP)
    sp = importlib.util.spec_from_file_location('era', ov + '/era.py'); m = importlib.util.module_from_spec(sp); sys.modules['era'] = m; sp.loader.exec_module(m)
if AREA and AREA.get('overlay'): _swap_era(AREA['overlay'].rstrip('/'))
YD = WQ + 'years/'
SEG = os.environ.get('SEG', '')
SD = WQ + f'seg/{SEG}/'; IN = os.environ.get('QH_IN', SD + 'in/').rstrip('/') + '/'; WK = SD + 'work/'; E = WK + 'E/'
if SEG: YA, YB = map(int, SEG.split('_'))
def sig(b):
    """a prism's identity across two key years: height, ring AND the era flags (a 1905 stand-in, a 1906 shell / burned ruin, a
    post-fire rebuild, a building still rising) - the renders draw these differently even on the same ring and height"""
    import numpy as np
    r = b.get('rise'); return (round(b['h'], 1), tuple(np.round(np.array(b['ring']).ravel(), 1)), bool(b.get('standin')), b.get('ruin'), bool(b.get('rebuild')),
                               None if r is None else round(float(r), 2))
