"""LidarBC's ready-made 1 m rasters for a British Columbia city (Open Government
Licence – British Columbia: "Contains information licensed under the Open
Government Licence – British Columbia."):

    CITY=vancouver python3 bc_lidar_fetch.py [year=2025] [dsm,dem]

DSM = the top of what stands (roofs, trees), DEM = bare earth; a building's
height is DSM − DEM of the SAME survey (never mix surveys: their vertical
datums differ). The tile index is the province's public FeatureServer (layers
1 DSM, 5 DEM, field s3Url); the tiles intersecting the city box (city.json
`bbox`) of that year go to <city>/lidar/bc<year>/<kind>/. A file already there
is kept."""
import json, os, sys, time, urllib.parse, urllib.request
import cityconf as C

YEAR = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
KINDS = (sys.argv[2] if len(sys.argv) > 2 else 'dsm,dem').split(',')
FS = 'https://services6.arcgis.com/ubm4tcTYICKBpist/arcgis/rest/services/LiDAR_BC_S3_Public/FeatureServer'
LAYER = {'dsm': 1, 'dem': 5}

def index(kind):
    s, w, n, e = C.BBOX
    q = dict(where=f'year={YEAR}', geometry=f'{w},{s},{e},{n}', geometryType='esriGeometryEnvelope', inSR=4326,
             spatialRel='esriSpatialRelIntersects', outFields='filename,maptile,s3Url,oper_name', returnGeometry='false', f='json')
    d = json.load(urllib.request.urlopen(f'{FS}/{LAYER[kind]}/query?' + urllib.parse.urlencode(q), timeout=60))
    return [f['attributes'] for f in d['features']]

def get(url, path):
    for attempt in range(5):
        try:
            tmp = path + '.part'
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'qipu-render/0.1'}), timeout=300) as r, open(tmp, 'wb') as f:
                while True:
                    b = r.read(1 << 20)
                    if not b: break
                    f.write(b)
            os.replace(tmp, path); return True
        except Exception as ex:
            print('retry', os.path.basename(path), str(ex)[:120], flush=True); time.sleep(5 * (attempt + 1))
    return False

for kind in KINDS:
    tiles = index(kind); out = C.work('lidar', f'bc{YEAR}', kind); os.makedirs(out, exist_ok=True)
    json.dump(tiles, open(os.path.join(out, 'index.json'), 'w'), indent=1)
    print(kind, len(tiles), 'tiles', sorted({t['oper_name'] for t in tiles}), flush=True)
    for k, t in enumerate(tiles):
        p = os.path.join(out, t['filename'])
        if os.path.exists(p): continue
        ok = get(t['s3Url'], p)
        print(kind, k + 1, '/', len(tiles), t['filename'], 'ok' if ok else 'FAILED', flush=True)
print('done')
