"""Where each Legistar item stands, read ONLY from the Clerk's own action words.

The Clerk prints actions in capitals after the item's description:
    04/21/26; ASSIGNED UNDER 30 DAY RULE to Budget and Finance Committee
    PASSED, ON FIRST READING by the following vote
Two traps measured on this batch and excluded here:
  - the sweep's `st` tag read "filed" out of "the lawsuit was filed on July 15"
  - the agenda header "shall be referred to and reported upon by an appropriate
    Committee" is boilerplate printed above every resolution section
The LAST action printed is where the item stands at this meeting.
"""
import json, re, sys, collections
ACT = [
 ('final',      r'FINALLY PASSED|\bADOPTED\b|\bAPPROVED\b'),
 ('first',      r'PASSED,? ON FIRST READING|voted No on First Reading'),
 ('continued',  r'\bCONTINUED\b'),
 ('filed',      r'\bFILED\b|\bTABLED\b'),
 ('proposed',   r'REFERRED FOR ADOPTION WITHOUT COMMITTEE REFERENCE'),
 ('committee',  r'ASSIGNED UNDER 30 DAY RULE|RECEIVED AND ASSIGNED|\bREFERRED\b(?! FOR ADOPTION)|RECEIVED FROM DEPARTMENT'),
]
BOILER = re.compile(r'shall be referred to and reported upon[^.]*\.', re.I)
def where(text):
    t = BOILER.sub(' ', text or '')
    hits = []
    for k, rx in ACT:
        for m in re.finditer(rx, t):          # case-SENSITIVE: the Clerk's capitals only
            hits.append((m.start(), k, m.group(0)))
    if not hits: return 'unknown', ''
    p, k, w = max(hits)
    return k, w
if __name__ == '__main__':
    rows = [json.loads(l) for l in open(sys.argv[1])]   # the work list: id, kind, ht
    full = {}
    for l in open('/Users/daniel/code/opd-ux/pipeline/scripts/us_sf_city/cache_sfbos/items_all_legistar.jsonl'):
        d = json.loads(l); full[f"{d['v']}|{d['i']}"] = d.get('t') or ''
    stamped = collections.defaultdict(set)
    for r in rows:
        if r['kind'] == 'vote': stamped[r['id'].split('|')[0]].add(r['ht'])
    S, W = {}, {}
    for r in rows:
        k, w = where(full.get(r['id'], ''))
        if r['kind'] == 'vote': k, w = 'final', 'vote stamp'
        elif r['ht'] and r['ht'] in stamped[r['id'].split('|')[0]] and k in ('unknown', 'committee', 'first'):
            # the same meeting printed a stamp that passed it; the stamp is later
            k, w = 'final', 'vote stamp, same meeting'
        S[r['id']] = k; W[r['id']] = w
    json.dump({'stage': S, 'word': W}, open('stage-true2.json', 'w'))
    for kind in ('placed', 'write'):
        print(kind, collections.Counter(S[r['id']] for r in rows if r['kind'] == kind).most_common())
