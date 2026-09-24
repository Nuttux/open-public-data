import json, collections, csv
j = json.load(open('/Users/daniel/code/qipu-render-work/fresh/fresh_records.json'))
R = {r['gid']: r for r in j['records']}
sup_by = collections.defaultdict(list)
for s in j['supersedes']: sup_by[s['by']].append(s)
res = collections.Counter(); ex = collections.defaultdict(list)
for p in j['permits']:
    g = p.get('gids') or []
    if g:
        red = all(R[x].get('redated') for x in g)
        k = 'dated (already drawn from OSM, now from its permit year)' if red else ('replaced old footprint(s)' if any(s['kind'] == 'datasf' or s['kind'] == 'newb' for s in sup_by[p['permit']]) else 'added (no footprint before)')
        k += {'parcel': ' [parcel outline]', 'old footprint, permit height': ' [old outline, permit height]'}.get(p.get('footprint_src'), '')
    else: k = p.get('result', '?')
    res[k] += 1; ex[k].append(p['addr'])
print('NEW CONSTRUCTION permits', sum(res.values()))
for k, v in res.most_common(): print(f'  {v:4d}  {k}   e.g. {", ".join(ex[k][:3])}')
m = j['meta']['counts']
print('records', m['records'], '| superseded gids', m['superseded'], '(datasf', m['superseded_datasf'], ', newb', m['superseded_newb'], ') | newb dated', m.get('newb_redated'), '| demolished gids', m['demolished'], '| active sites', m['active_sites'])
dc = collections.Counter()
for d in j['demolition_permits']:
    r = d['result']; dc[next((x for x in r if x.startswith('demolition removed')), r[0] if r else '(none)')] += 1
print('DEMOLITION permits', sum(dc.values()))
for k, v in dc.most_common(): print(f'  {v:4d}  {k}')
C = [r for r in csv.DictReader(open('/Users/daniel/code/qipu-render-work/decisions/permits_completed_since_2022.csv'))]
nd = sum(1 for r in C if r['category'] == 'demolition'); nn = sum(1 for r in C if r['category'] == 'new construction')
ok_n = sum(v for k, v in res.items() if not k.startswith(('no footprint', 'no coordinates', 'duplicate', 'landmark')))
ok_d = sum(v for k, v in dc.items() if k not in ('no coordinates', '(none)'))
print(f'reflected: new {ok_n}/{nn} ({100*ok_n/nn:.0f}%), demolitions {ok_d}/{nd} ({100*ok_d/nd:.0f}%), all {ok_n+ok_d}/{nn+nd} ({100*(ok_n+ok_d)/(nn+nd):.0f}%)')
