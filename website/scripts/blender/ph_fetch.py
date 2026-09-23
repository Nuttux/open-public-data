"""Download Poly Haven (CC0) assets: models as .blend with textures, textures as
PBR maps. usage: python3 ph_fetch.py <res> <id> [<id>...]"""
import json, os, sys, urllib.request
UA = {'User-Agent': 'qipu-render/0.1 (danielshavit92@gmail.com)'}
def _open(u): return urllib.request.urlopen(urllib.request.Request(u, headers=UA))
OUT = os.path.expanduser('~/code/qipu-assets/polyhaven')
res = sys.argv[1]
def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0: return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'wb').write(_open(url).read())
for aid in sys.argv[2:]:
    info = json.load(_open(f'https://api.polyhaven.com/files/{aid}'))
    d = os.path.join(OUT, aid)
    if 'blend' in info:                       # a model (or a texture offered as .blend)
        b = info['blend'].get(res) or info['blend'][sorted(info['blend'])[0]]
        b = b['blend']; get(b['url'], os.path.join(d, os.path.basename(b['url'])))
        for rel, inc in b.get('include', {}).items(): get(inc['url'], os.path.join(d, rel))
    for mp in ('Diffuse', 'nor_gl', 'Rough', 'Displacement', 'AO', 'arm'):
        if mp in info and 'blend' not in info:
            m = info[mp].get(res) or info[mp][sorted(info[mp])[0]]
            f = m.get('jpg') or m.get('png') or list(m.values())[0]
            get(f['url'], os.path.join(d, f'{mp}.{f["url"].rsplit(".", 1)[1]}'))
    print('ok', aid, sorted(os.listdir(d))[:6])
