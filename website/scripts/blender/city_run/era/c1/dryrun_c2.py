"""dryrun_c2.py (V-ERAS 05/10, CPU, no Blender): what the era snapshot's era.py (ERA_SNAP, default eva2) puts in va1's scene per key
year: structures standing (all / within the area box + 300 m, as build_structures' box test), the bridges among them with their y0,
lost buildings, rails, topo sheet; and EVERY file it opens (audit hook) -> eras/c1/manifest_c2_<Y>.json + eras/c1/dryrun_c2_opened.txt.
    CITY=vancouver python3.11 dryrun_c2.py"""
import os, sys, json, collections, importlib.util
os.environ['CITY'] = 'vancouver'; os.environ.pop('ERA', None)
D = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, f'{D}/stub')
OPENED = set()
sys.addaudithook(lambda ev, a: OPENED.add(os.path.abspath(str(a[0]))) if ev == 'open' and isinstance(a[0], (str, bytes, os.PathLike)) else None)
import common as c
SN = os.environ.get('ERA_SNAP', 'eva2'); S = f'/Users/daniel/code/qipu-render-work/cities/vancouver/snap/{SN}'
sys.path.insert(0, S)
spec = importlib.util.spec_from_file_location('era', f'{S}/era.py'); E = importlib.util.module_from_spec(spec); sys.modules['era'] = E; spec.loader.exec_module(E)
BD = json.load(open('/Users/daniel/code/qipu-render-work/cities/vancouver/eras/bridge_dates.json'))['decks']
near = lambda st, m=300: any(c.in_box(p[0], p[1], m) for p in st['path'])
out = {}
for Y in [1950, 1967, 1972, 1982, None]:
    t = E.when(Y) if Y else 2026.0
    if Y:   # the record years (record_years.json via fix_records) and the photo masks (topo_built: eras/masks/napl<Y>.png) are read too
        rr = [dict(b_) for b_ in c.records(300)]; E.fix_records(rr, Y); ax = c.area()['box_ll']; E.topo_built(*c.utm2w(*c.ll2utm((ax[0] + ax[2]) / 2, (ax[1] + ax[3]) / 2)), t)
    st = E.structures(t)
    br = [s for s in st if s['k'] in BD]; vi = [s for s in st if s['k'] not in BD]
    named = collections.Counter(BD[s['k']]['name'] or '(unnamed)' for s in br)
    m = dict(year=Y or 'today', moment=t, LOST_FW_HQ=os.environ.get('LOST_FW_HQ'), CITY_DECK_TOP=bool(getattr(E, 'CITY_DECK_TOP', False)),
             viaducts=[(s['k'], s['y0'], s['y1']) for s in vi], viaducts_in_box=[s['k'] for s in vi if near(s)],
             bridge_decks=len(br), bridges_by_name=dict(sorted(named.items())), bridge_decks_in_box=[s['k'] for s in br if near(s)],
             not_yet=sorted({BD[k]['name'] or '(unnamed)' for k in BD if BD[k]['y0'] > t and BD[k]['y0'] < 2025}),
             lost_in_box=len([b for b in E.sanborn_records(Y) if c.in_box(b['cx'], b['cy'])]) if Y else 0,
             rails=len(E.rails(t)) if Y else None, topo=E.topo_sheet(t) if Y else None)
    out[Y or 'today'] = m; json.dump(m, open(f'{c.OUT}/manifest_c2_{Y or "today"}.json', 'w'), indent=1)
    print(Y or 'today', 'viaducts', m['viaducts_in_box'], '| bridge decks', len(br), '| not yet:', m['not_yet'], '| lost', m['lost_in_box'], '| rails', m['rails'], '| topo', m['topo'])
U = sorted(p for p in OPENED if p.startswith('/Users/daniel/code/qipu-render-work/cities/') and '/snap/' not in p and '__pycache__' not in p)
open(f'{c.OUT}/dryrun_c2_opened.txt', 'w').write('\n'.join(U) + '\n'); print(len(U), 'city data files opened ->', f'{c.OUT}/dryrun_c2_opened.txt')
