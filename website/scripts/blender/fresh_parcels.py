# DataSF parcels (acdm-wktn, "Parcels - Active and Retired") for every blocklot in the permit tables
import csv, json, urllib.request, urllib.parse, sys, os
D='/Users/daniel/code/qipu-render-work/decisions'; OUT='/Users/daniel/code/qipu-render-work/fresh/parcels.json'
bl=set()
for f in ('permits_completed_since_2022.csv','permits_active.csv'):
    for r in csv.DictReader(open(f'{D}/{f}')):
        if r['blocklot']: bl.add(r['blocklot'].strip())
bl=sorted(bl); out={}
if os.path.exists(OUT): out=json.load(open(OUT))
todo=[b for b in bl if b not in out]
print(len(bl),'blocklots,',len(todo),'to fetch',flush=True)
for i in range(0,len(todo),60):
    ch=todo[i:i+60]
    soql="SELECT blklot, shape, active, date_rec_add, date_rec_drop WHERE blklot in ("+','.join(f"'{b}'" for b in ch)+") LIMIT 5000"
    url='https://data.sfgov.org/resource/acdm-wktn.json?'+urllib.parse.urlencode({'$query':soql})
    try:
        rows=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'qipu-research'}),timeout=60))
    except Exception as e:
        print('chunk',i,'failed',e,flush=True); continue
    for r in rows: out.setdefault(r['blklot'],[]).append(r)
    for b in ch: out.setdefault(b,[])
    print('chunk',i,len(rows),flush=True)
    json.dump(out,open(OUT,'w'))
print('DONE',sum(1 for v in out.values() if v),'with geometry',flush=True)
