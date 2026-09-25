"""Historical air-photo mosaics over the city box, read by COG window (no full
download): CITY=vancouver python3 aerial_crop.py [year …]

city.json `eras`: {"stac_items": "<STAC items URL>", "asset": "mosaic",
"res": 1.0, "pad": 300, "out": "<folder>", "licence": "…", "credit": "…"}.
Each STAC item (one flight year) → <out>/<prefix>_<year>.tif in the mosaic's
own CRS, north-up, `res` metres a pixel on a grid snapped to whole multiples
of `res`, averaged down from the COG's nearest finer overview (strips of
STRIP rows: memory stays < 100 MB a year). 0 = no data (the mosaics' nodata).
Plus <out>/<prefix>_<year>_preview.jpg (≤ 1600 px) and <out>/index.json
(URL, CRS, native and output resolution, pixel share with data over the box,
the item's datetime, licence). SF has no `eras` key: the script refuses."""
import os, sys, json, time
from concurrent.futures import ThreadPoolExecutor
for _k, _v in dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_MULTIRANGE='YES',
                   GDAL_HTTP_MERGE_CONSECUTIVE_RANGES='YES', VSI_CACHE='TRUE', GDAL_CACHEMAX='256',
                   GDAL_HTTP_USERAGENT='qipu-render/0.1').items():
    os.environ.setdefault(_k, _v)
import urllib.request
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.windows import from_bounds
from pyproj import Transformer
from PIL import Image
import cityconf as C

E = C.CFG.get('eras')
if not E: sys.exit('no `eras` in city.json')
RES = float(E.get('res', 1.0)); PAD = float(E.get('pad', 300)); STRIP = 1024
OUT = E.get('out') or C.work('eras', 'src'); os.makedirs(OUT, exist_ok=True)
PREFIX = E.get('prefix', 'napl')
UA = {'User-Agent': 'qipu-render/0.1'}


def items():
    r = urllib.request.urlopen(urllib.request.Request(E['stac_items'] + '?limit=100', headers=UA), timeout=60)
    return json.load(r)['features']


def year_of(it):
    return int(it['properties']['datetime'][:4])


def crop(it):
    y = year_of(it); url = it['assets'][E.get('asset', 'mosaic')]['href']
    dst = f'{OUT}/{PREFIX}_{y}.tif'; t0 = time.time()
    with rasterio.open('/vsicurl/' + url) as s:
        tr = Transformer.from_crs(4326, s.crs, always_xy=True)
        S, W, N, Ea = C.BBOX
        xs, ys = tr.transform([W, Ea, W, Ea], [S, S, N, N])
        x0 = (min(xs) - PAD) // RES * RES; x1 = -((-(max(xs) + PAD)) // RES) * RES
        y0 = (min(ys) - PAD) // RES * RES; y1 = -((-(max(ys) + PAD)) // RES) * RES
        w = int(round((x1 - x0) / RES)); h = int(round((y1 - y0) / RES))
        prof = dict(driver='GTiff', width=w, height=h, count=1, dtype='uint8', crs=s.crs, nodata=0,
                    transform=from_origin(x0, y1, RES, RES), tiled=True, blockxsize=512, blockysize=512,
                    compress='deflate', predictor=2, BIGTIFF='IF_SAFER')
        sb = s.bounds; filled = 0
        with rasterio.open(dst, 'w', **prof) as d:
            for r0 in range(0, h, STRIP):
                rh = min(STRIP, h - r0)
                top = y1 - r0 * RES; bot = top - rh * RES
                a = np.zeros((rh, w), np.uint8)
                # the part of the strip the mosaic covers, read at the output's resolution
                cx0, cx1 = max(x0, sb.left), min(x1, sb.right); cy0, cy1 = max(bot, sb.bottom), min(top, sb.top)
                if cx1 > cx0 + RES and cy1 > cy0 + RES:
                    cx0 = x0 + np.ceil((cx0 - x0) / RES) * RES; cx1 = x0 + np.floor((cx1 - x0) / RES) * RES
                    cy1 = top - np.ceil((top - cy1) / RES) * RES; cy0 = top - np.floor((top - cy0) / RES) * RES
                    ow = int(round((cx1 - cx0) / RES)); oh = int(round((cy1 - cy0) / RES))
                    if ow > 0 and oh > 0:
                        win = from_bounds(cx0, cy0, cx1, cy1, s.transform)
                        v = s.read(1, window=win, out_shape=(oh, ow), resampling=Resampling.average, boundless=False)
                        c0 = int(round((cx0 - x0) / RES)); rr = int(round((top - cy1) / RES))
                        a[rr:rr + oh, c0:c0 + ow] = v
                filled += int((a > 0).sum())
                d.write(a, 1, window=rasterio.windows.Window(0, r0, w, rh))
            d.update_tags(source=url, licence=E.get('licence', ''), credit=E.get('credit', ''),
                          datetime=it['properties']['datetime'], native_res=str(s.res[0]))
    # preview
    with rasterio.open(dst) as d:
        k = max(1, int(np.ceil(max(d.width, d.height) / 1600)))
        pv = d.read(1, out_shape=(d.height // k, d.width // k), resampling=Resampling.average)
    Image.fromarray(pv).save(f'{OUT}/{PREFIX}_{y}_preview.jpg', quality=85)
    rec = dict(year=y, url=url, crs=f'EPSG:{s.crs.to_epsg()}', native_res=s.res[0], res=RES, width=w, height=h,
               bounds=[x0, y0, x1, y1], box_share_with_data=round(filled / (w * h), 4),
               datetime=it['properties']['datetime'], file=os.path.basename(dst),
               bytes=os.path.getsize(dst), seconds=round(time.time() - t0))
    print(json.dumps(rec), flush=True)
    return rec


if __name__ == '__main__':
    want = {int(a) for a in sys.argv[1:]}
    its = [i for i in items() if not want or year_of(i) in want]
    with ThreadPoolExecutor(3) as ex:
        recs = list(ex.map(crop, its))
    ip = f'{OUT}/index.json'
    idx = json.load(open(ip)) if os.path.exists(ip) else {}
    idx.setdefault('meta', {}).update(stac_items=E['stac_items'], licence=E.get('licence'), credit=E.get('credit'),
                                      made_by='website/scripts/blender/aerial_crop.py')
    idx.setdefault('years', {}).update({str(r['year']): r for r in recs})
    json.dump(idx, open(ip, 'w'), indent=1, sort_keys=True)
