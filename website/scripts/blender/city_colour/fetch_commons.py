"""Fetch open Commons photos per Vancouver building type (licence + author kept). Plain Python."""
import json, os, re, sys, time, urllib.parse, urllib.request
UA = {'User-Agent': 'qipu-render/1.0 (danielshavit92@gmail.com) colour sampling'}
Q = json.load(open(sys.argv[1]))          # {type: [search strings]}
N = int(sys.argv[2]) if len(sys.argv) > 2 else 10
PLACE = re.compile(r'vancouver|kitsilano|gastown|yaletown|strathcona|granville island|coal harbour|mount pleasant|dunbar|kerrisdale|marpole|fairview|renfrew|killarney|grandview|commercial drive|east van')
OK = re.compile(r'^(CC0|CC BY(-SA)? [0-9.]+|CC BY(-SA)?|Public domain|PD.*)$', re.I)
def api(**p):
    p.update(action='query', format='json')
    u = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(p)
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=40))
src = json.load(open('sources_raw.json')) if os.path.exists('sources_raw.json') else {}
for ty, qs in Q.items():
    os.makedirs(f'photos/{ty}', exist_ok=True); got = src.setdefault(ty, {})
    for q in qs:
        if len(got) >= N: break
        r = api(generator='search', gsrsearch=q + ' filetype:bitmap', gsrnamespace=6, gsrlimit=20, prop='imageinfo',
                iiprop='url|extmetadata|size', iiurlwidth=900)
        for pg in sorted(r.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 99)):
            if len(got) >= N: break
            t = pg['title']
            if t in got or not pg.get('imageinfo'): continue
            ii = pg['imageinfo'][0]; em = ii.get('extmetadata', {})
            lic = em.get('LicenseShortName', {}).get('value', '')
            if not OK.match(lic.strip()): continue
            blob = (t + ' ' + em.get('ImageDescription', {}).get('value', '') + ' ' + em.get('Categories', {}).get('value', '')).lower()
            if not PLACE.search(blob) or re.search(r'\b(washington|wa\b|habs|interior|night)', blob): continue
            art = re.sub('<[^>]+>', '', em.get('Artist', {}).get('value', '')).strip()
            fn = f'photos/{ty}/{len(got):02d}.jpg'
            try:
                open(fn, 'wb').write(urllib.request.urlopen(urllib.request.Request(ii['thumburl'], headers=UA), timeout=40).read())
            except Exception as ex: print('fail', t, ex); continue
            got[t] = dict(file=fn, page=ii['descriptionurl'], licence=lic, author=art[:120], query=q,
                          date=re.sub('<[^>]+>', '', em.get('DateTimeOriginal', {}).get('value', ''))[:40])
            time.sleep(0.3)
    print(ty, len(got), flush=True)
    json.dump(src, open('sources_raw.json', 'w'), indent=1)
