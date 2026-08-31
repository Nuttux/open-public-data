import json, glob, re, random, sys
c=json.load(open('website/public/data/us/sf/city/blocks/classify.json'))
rows=[]
for f in sorted(glob.glob('website/public/data/us/sf/city/blocks/block-*.json')):
    if 'geo' in f: continue
    for k,blk in json.load(open(f)).items():
        if not isinstance(blk, dict): continue
        streets=[s for s in (blk.get('s') or [])]
        for x in blk.get('d', []):
            if isinstance(x, dict) and x.get('m'): rows.append((streets, x))

MONEY=re.compile(r'\$\s?[\d][\d,]*(?:\.\d{2})?')
# case-insensitive on the TYPE word: the old Journal prints "741 Mission street"
ADDR=re.compile(r'\b\d{1,5}(?:-\d{1,5})?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?:[Ss]treet|[Ss]t|[Aa]venue|[Aa]ve|[Bb]oulevard|[Bb]lvd|[Ww]ay|[Pp]lace|[Dd]rive|[Rr]oad)\b')

# ── FIX 4: the twelve failures were all one thing — somebody at a meeting ──
JUNK=[re.compile(p, re.I) for p in [
  r'^(?:by|per request of)\s+supervisor', r'^supervisor\s+\w+\s+(?:stated|moved|announced|requested|inquired)',
  r'^(?:mr|ms|mrs)\.\s', r'that\s+(?:a\s+)?letter\s+be\s+sent', r'^file\s+no', r'^\W*$',
  r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z][\w&.\' ]+,\s*\d',            # name, org, number
  r'^(?:[A-Z][a-z]+\s+)+(?:and\s+[A-Z][a-z]+\s+)?(?:Streets?|Avenues?)(?:\s+and\s+[A-Z][a-z]+\s+(?:Streets?|Avenues?))*\.?$',
  r'^approved by the board on\b', r'^dated\s+\w+\s+\d',
  r'^(?:\d{1,5}\s+)?[A-Z][\w\' ]{2,24}\s+(?:Street|Avenue|Way|Place|Boulevard)s?\s*[,;]\s*(?:\d{1,5}\s+)?[A-Z][\w\' ]{2,24}\s+(?:Street|Avenue|Way|Place|Boulevard)s?\.?$', r'^(?:fiscal impact|received and assigned|be amended|as defined herein|passed for|finally passed|adopted by the following|ayes|noes|absent|referred to|ordered filed|action deferred)',
]]
CONT=re.compile(r'^[^A-Za-z0-9]*(?:[a-z]|(?:And|As|Or|But|With|Said|Which|Thence|Including|Provided|Together)\b)')
BROKEN=re.compile(r'[^A-Za-z0-9\s.,;:\'"()$%&/-]')

# ── FIX 2 + 3: the payload sits AFTER the boilerplate, so cut the boilerplate
#    out of the middle instead of truncating at a length ──
STRIP=[re.compile(p, re.I) for p in [
  r'\bunder Article \d+[A-Za-z]* of the(?: Planning Code)?\b', r'\bpursuant to [^,;]{0,60}?Code\b',
  r'\bin accordance with the (?:recommendation|provisions) of[^,;]{0,50}', r',?\s*finding and determining that\b',
  r'\bof the City and County of San Francisco\b', r'\ba California limited partnership,?\b',
  r'\bCase No\.?\s*[\w.\-]+,?',
  r'\bFile No\.?\s*[\d\-]+,?', r'\((?:New|Second) Series\),?', r'\b(?:Resolution|Ordinance|Motion) No\.?\s*[\w.\-]+,?',
  r'\(District \d+\),?', r'\bas amended\b', r'\bAdopting Final Negative Declaration,?\s*',
  r'\bexecution and delivery of\b', r'\bApproving and authorizing\b', r'\bAuthorizing and directing\b',
]]
# a case number says nothing, but DELETING it breaks the sentence:
# "Approving Conditional Use Application No. 2002.0124CVR on property at X"
# became "Approving on property at X". Replaced with the plain noun instead.
SWAP=[(re.compile(r'\b(?:Conditional Use )?Application No\.?\s*[\w.\-]+,?', re.I), 'a conditional use')]
# these phrases open a tail that never carries the substance — cut to the end
TAIL=re.compile(r'[\s,;]*\b(?:and (?:adopting|making) (?:environmental |CEQA )?findings'
                r'|and adopting the? ?[Pp]lanning [Cc]ode findings'
                r'|and directing the Clerk|and authorizing the Clerk'
                r'|in accordance with the recommendation)\b.*$', re.I)
def clean(t):
    t=re.sub(r'\s+',' ',t).strip()
    t=re.sub(r'^\d{5,}\s*(?=\[)', '', t)
    m=re.match(r'^\[([^\]]{12,})\]', t)
    if m: t=m.group(1)
    t=re.sub(r'\s*\b(?:Sponsors?|Sponsored by)\s*:.*$', '', t)
    t=re.sub(r'^\(?\d{1,2}[).]\s+', '', t)
    t=re.sub(r'^\d{1,3}\s+[a-z]{1,2}\s+(?=[A-Z])', '', t).rstrip('…').rstrip('.')
    for r_,rep in SWAP: t=r_.sub(rep, t)
    for r_ in STRIP: t=r_.sub(' ', t)
    t=TAIL.sub('', t); t=re.sub(r'[\s,;]*\balso known as(?:\s+the)?$', '', t, flags=re.I)
    t=re.sub(r'\b(?:the|a|an)\s+(a|an|the)\b', r'\1', t)
    t=re.sub(r'\b(of|and|the|to)\s+\1\b', r'\1', t)
    t=re.sub(r'\s+([,;])', r'\1', t); t=re.sub(r'\s{2,}',' ',t).strip(' ,;-')
    return t[:1].upper()+t[1:] if t else t

PREP=re.compile(r'^(?:In|On|At|To|For|From|Of|With|Between|Under|Near|Upon|By)\s', re.I)
STREETY=re.compile(r'\b[A-Z][\w\']+(?:\s+[A-Z][\w\']+)?\s+(?:Street|Avenue|Boulevard|Way|Place|Drive|Road|Court|Terrace|Lane|Alley)s?\b', re.I)
def street_list(t):
    """A line that is nothing but street names joined by punctuation says
    where but never what. Tested structurally: strip the street phrases and
    see whether any sentence is left."""
    rest=re.sub(r'[^A-Za-z ]+', ' ', STREETY.sub(' ', t))
    return len([w for w in rest.split() if w.lower() not in
                ('and','the','of','to','at','from','between','a','an','st','ave')]) < 3
def readable(t):
    t=t.strip()
    if len(t) < 40: return False
    # "In the residence of J. McCluskey, Assistant" — a preposition-led scrap
    if len(t) < 60 and PREP.match(t): return False
    if street_list(t): return False
    if CONT.match(t) or any(r_.match(t) or r_.search(t) for r_ in JUNK[:6]): return False
    if any(r_.match(t) for r_ in JUNK[6:]): return False
    w=t.split()
    bad=sum(1 for x in w if BROKEN.search(x) or (len(x)>=4 and not re.search(r'[aeiouAEIOU]', x)))
    return bad/max(1,len(w)) < 0.18

DANGLE=re.compile(r'[\s,;-]+(?:the|a|an|of|to|for|and|in|on|at|by|with|as|near|from)$', re.I)
def undangle(t):
    for _ in range(4):
        n=DANGLE.sub('', t)
        if n==t: return t
        t=n
    return t

def trim(t, cap=112):
    if len(t) <= cap: return t
    best=-1
    for m in re.finditer(r',\s|;\s|\s\(|\s-\s', t):
        if 45 <= m.start() <= cap: best=m.start()
    cut = best if best>0 else t.rfind(' ', 0, cap)
    return undangle(t[:cut].rstrip(' ,;-')) + '…'

def usd(s):
    v=int(re.sub(r'[^\d]','', s.split('.')[0]) or 0)
    if v < 100: return None
    return f'${v/1e6:.1f}M' if v>=1e6 else f'${v:,}'

# ── FIX 1: the block's own cross-streets, which the shard already publishes ──
ORD=re.compile(r'^(\d+)(ST|ND|RD|TH)$', re.I)
def _word(w):
    m=ORD.match(w)
    return (m.group(1)+m.group(2).lower()) if m else w.title()
def where(streets):
    out=[]
    for s in streets[:2]:
        base,_,ty = s.rpartition('|')
        if not base: base, ty = ty, ''
        ty={'ST':'St','AVE':'Ave','BLVD':'Blvd','WAY':'Way','PL':'Pl','DR':'Dr',
            'TER':'Ter','RD':'Rd','ALY':'Aly','CT':'Ct','LN':'Ln'}.get(ty,'')
        out.append((' '.join(_word(w) for w in base.split())+' '+ty).strip())
    return ' · '.join(out)

# The block's cross-streets are only safe when the line names no street of its
# own. Row 18 read "Along the easterly side of Nineteenth avenue" under the
# label "23rd Ave · 24th Ave" — the block streets contradicted the sentence.
NAMED=re.compile(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+([Ss]treet|[Aa]venue|[Bb]oulevard|[Ww]ay|[Pp]lace|[Dd]rive|[Rr]oad)\b')
def place_of(cl, streets):
    a=ADDR.search(cl)
    if a: return re.sub(r'\s(street|avenue|boulevard|way|place|drive|road)\b',
                        lambda z: ' '+z.group(1).capitalize(), a.group(0))
    n=NAMED.search(cl)
    if n: return n.group(1)+' '+{'s':'St','a':'Ave','b':'Blvd','w':'Way','p':'Pl','d':'Dr','r':'Rd'}[n.group(2)[0].lower()]
    return where(streets)

def render(streets, x):
    tag = c['sub'][x['cs']] if 'cs' in x else None
    if tag and x.get('g')=='h': tag=None
    cl = clean(x['t'])
    ok = readable(cl)
    head = trim(undangle(cl)) if ok else tag
    m=MONEY.search(x['t'])
    place = place_of(cl, streets)
    facts=[f for f in [usd(m.group(0)) if m else None, place] if f]
    showtag = tag if (ok and tag) else None
    return x['y'], showtag, facts, head

def run(seed, k, label):
    random.seed(seed)
    print(f'\n{"="*72}\n{label}\n{"="*72}')
    for i,(st,x) in enumerate(random.sample(rows, k),1):
        y,tag,facts,head = render(st,x)
        bits=' · '.join([b for b in ([tag] if tag else [])+facts if b])
        print(f"{i:>3}. {y}  {bits}")
        print(f"     {head or '(nothing to show)'}")

if sys.argv[1]=='A': run(1234, 100, 'SAMPLE A — the same 100 I tuned against')
else: run(90210, 200, 'SAMPLE B — a fresh 200, never looked at')
