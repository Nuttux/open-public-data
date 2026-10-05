# sumev.py (qhprep): a short summary of a segment's events.json          usage: python3 sumev.py <seg dir>
import sys, json
from collections import Counter
d = json.load(open(sys.argv[1].rstrip('/') + '/in/events.json')); ev = d['events']
print('segment', d.get('Ya'), '->', d.get('Yb'), '(%.2f -> %.2f)' % (d['Y0'], d['Y1']), dict(Counter(e['t'] for e in ev)), 'visible (px>0):', sum(e['px'] > 0 for e in ev))
b = [e for e in ev if e['t'] == 'build' and e['px'] > 0]; g = [e for e in ev if e['t'] == 'demolish' and e['px'] > 0]
yr = Counter(); [yr.update([(int(e['year']) // 5 * 5) if e.get('year') else 'none']) for e in b]
print('  builds by record year (5-y bins):', dict(sorted(yr.items(), key=lambda kv: str(kv[0]))))
print('  flags: ruins', sum(1 for e in b if e.get('ruin')), 'rising at end', sum(1 for e in b if e.get('rising') is not None), 'continuing', sum(1 for e in b if e.get('cont')),
      '| demolitions with data year', sum(1 for e in g if e.get('year')), 'fire', sum(1 for e in g if e.get('td1')), 'no year', sum(1 for e in g if not e.get('year') and not e.get('td1')))
print('  outside the segment (year < Ya or > Yb):', [(e['key'], e['year']) for e in b if e.get('year') and not (d['Ya'] - 1 <= e['year'] <= d['Yb'] + 1)][:12])
for e in sorted([e for e in b if e['h'] >= 40], key=lambda e: -e['px'])[:8]: print('  tall build', e['key'], e['h'], 'm', e['year'], 'px', e['px'])
for e in [e for e in ev if e['t'].startswith('structure')]: print('  ', e['t'], e['key'], e['year'], '-', e['year_end'], 'px', e['px'])
