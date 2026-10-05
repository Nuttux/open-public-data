"""Fetch Commons category members (open licences) into photos/pool, sources in sources_pool.json."""
import json, os, re, sys, time, urllib.parse, urllib.request
UA = {'User-Agent': 'qipu-render/1.0 (danielshavit92@gmail.com) colour sampling'}
OK = re.compile(r'^(CC0|CC BY(-SA)? [0-9.]+|CC BY(-SA)?|Public domain|PD.*)$', re.I)
def api(**p):
    p.update(action='query', format='json'); u = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(p)
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40))
src = json.load(open('sources_pool.json')) if os.path.exists('sources_pool.json') else {}
os.makedirs('photos/pool', exist_ok=True)
for cat in sys.argv[1:]:
    cont = {}
    while True:
        r = api(generator='categorymembers', gcmtitle='Category:' + cat, gcmtype='file', gcmlimit=50, prop='imageinfo',
                iiprop='url|extmetadata', iiurlwidth=900, **cont)
        for pg in r.get('query', {}).get('pages', {}).values():
            t = pg['title']
            if t in src or not pg.get('imageinfo') or not re.search(r'\.(jpe?g|png)$', t, re.I): continue
            ii = pg['imageinfo'][0]; em = ii.get('extmetadata', {}); lic = em.get('LicenseShortName', {}).get('value', '').strip()
            if not OK.match(lic): continue
            fn = f'photos/pool/{len(src):03d}.jpg'
            try: open(fn, 'wb').write(urllib.request.urlopen(urllib.request.Request(ii['thumburl'], headers=UA), timeout=40).read())
            except Exception as ex: print('fail', t, ex); continue
            src[t] = dict(file=fn, page=ii['descriptionurl'], licence=lic, cat=cat,
                          author=re.sub('<[^>]+>', '', em.get('Artist', {}).get('value', '')).strip()[:120],
                          date=re.sub('<[^>]+>', '', em.get('DateTimeOriginal', {}).get('value', ''))[:40])
            time.sleep(0.2)
        json.dump(src, open('sources_pool.json', 'w'), indent=1)
        if 'continue' not in r: break
        cont = {'gcmcontinue': r['continue']['gcmcontinue']}
    print(cat, len(src), flush=True)
