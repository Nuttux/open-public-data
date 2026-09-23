"""OpenStreetMap (ODbL, (c) OpenStreetMap contributors) through the Overpass
API, with retries over public mirrors. usage: python3 osm_fetch.py <out.json> <query>"""
import sys, time, json, urllib.request, urllib.parse
EP = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.private.coffee/api/interpreter']
def fetch(q, out):
    for attempt in range(8):
        ep = EP[attempt % len(EP)]
        try:
            req = urllib.request.Request(ep, data=urllib.parse.urlencode({'data': q}).encode(), headers={'User-Agent': 'qipu-render/0.1'})
            b = urllib.request.urlopen(req, timeout=180).read()
            json.loads(b)
            open(out, 'wb').write(b); print('ok', ep, len(b)); return True
        except Exception as ex:
            print('retry', ep, str(ex)[:100], flush=True); time.sleep(4 + 4 * attempt)
    return False
if __name__ == '__main__':
    sys.exit(0 if fetch(sys.argv[2], sys.argv[1]) else 1)
