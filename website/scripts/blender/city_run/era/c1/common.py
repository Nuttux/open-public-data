"""C1 (Vancouver eras, first area): shared helpers for the CPU prep of one era area.
CITY=vancouver. Box = area.json 'box_ll' (lon/lat); NAPL crops (eras/src, EPSG:32610, 1 m); engine world metres (cityconf.proj)."""
import os, sys, json
os.environ.setdefault('CITY', 'vancouver')
BL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, BL)
import numpy as np
import rasterio
from pyproj import Transformer
import cityconf as C
W = '/Users/daniel/code/qipu-render-work/cities/vancouver'
ERAS = f'{W}/eras'
AREA = os.environ.get('ERA_AREA', f'{ERAS}/era_auto/va1/area.json')
OUT = f'{ERAS}/c1'
_T = Transformer.from_crs(4326, 32610, always_xy=True); _TI = Transformer.from_crs(32610, 4326, always_xy=True)


def area():
    return json.load(open(AREA))


def box_ll():
    return area()['box_ll']          # [W, S, E, N]


def ll2utm(lon, lat): return _T.transform(lon, lat)
def utm2ll(e, n): return _TI.transform(e, n)
def w2utm(x, y): return ll2utm(*C.unproj(x, y))
def utm2w(e, n): return C.proj(*utm2ll(e, n))


def grid(pad=60):
    """the area's 1 m UTM grid: (e0, n1, width, height) whole metres, north-up, pad m around the box"""
    Wl, S, E, N = box_ll()
    e0, n1 = ll2utm(Wl, N); e1, n0 = ll2utm(E, S)
    e0, n0, e1, n1 = int(e0) - pad, int(n0) - pad, int(e1) + pad, int(n1) + pad
    return e0, n1, e1 - e0, n1 - n0


def napl(Y, pad=60):
    e0, n1, w, h = grid(pad)
    with rasterio.open(f'{ERAS}/src/napl_{Y}.tif') as r:
        return r.read(1, window=rasterio.windows.from_bounds(e0, n1 - h, e0 + w, n1, r.transform), boundless=True, fill_value=0)


def to_px(e, n, pad=60):
    e0, n1, _, _ = grid(pad)
    return e - e0, n1 - n


def records(margin=150):
    """today's records in the box (+margin m), with era spans from record_years.json"""
    import city_data as CD
    Wl, S, E, N = box_ll()
    x0, y0 = C.proj(Wl, S); x1, y1 = C.proj(E, N)
    recs = CD.buildings(x0 - margin, y0 - margin, x1 + margin, y1 + margin)
    sp = json.load(open(f'{ERAS}/record_years.json'))['records']
    for b in recs:
        s = sp.get(str(b['gid']))
        b['from'], b['from_src'], b['until'], b['until_src'] = s if s else (b.get('year'), 'none', None, None)
    return recs


def in_box(x, y, margin=0.0):
    Wl, S, E, N = box_ll()
    x0, y0 = C.proj(Wl, S); x1, y1 = C.proj(E, N)
    return x0 - margin <= x <= x1 + margin and y0 - margin <= y <= y1 + margin
