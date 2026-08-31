import sys, os, json, re, statistics
sys.path.insert(0,'/tmp')
from gate import check
from harness import load_records
RECS={r['id']:r for r in load_records()}
STOP=set("the a an of to for and in on at by with be is are was were city street avenue "
         "board supervisors san francisco allowed given paid takes over new more days "
         "set aside ordered asked".split())
# ── THE GLOSSARY IS WHY A GOOD LINE LOOKS MISALIGNED ────────────────────────
# This test asks whether the line shares vocabulary with its record. But the
# whole job is to REPLACE the Board's vocabulary with words a person knows, so
# the better a line translates, the less it overlaps. Measured: six lines in one
# 1980s slice, every one correct, every one a "Final Negative Declaration"
# written as "no major environmental harm" — and modern records lean on the
# glossary hardest, so this gets worse as the corpus gets newer.
#
# The threshold is not the problem and raising it would only hide this. The
# record's own jargon now admits its plain-English translation, exactly as the
# gate admits "Company" where the Journal wrote "Co.".
_G = json.load(open("/Users/daniel/code/open-public-data/pipeline/seeds/"
                    "sf_bos_plain_english.json"))
GLOSS = [(k.lower(), v.lower()) for sec, terms in _G.items()
         if isinstance(terms, dict)
         for k, v in terms.items() if not k.startswith("_")]

def _near1(w, pool):
    """w against a scan that destroyed it: Keutucky/Kentucky, sevrers/sewers."""
    for t in pool:
        if abs(len(t) - len(w)) > 2: continue
        if t[0] != w[0] and t[-1] != w[-1]: continue
        # bounded edit distance, tolerant in proportion to the word's length
        lim = 1 if len(w) < 6 else (2 if len(w) < 9 else 3)
        pa, pb = range(len(t) + 1), None
        for i, cb in enumerate(w, 1):
            pb = [i]
            for j, ca in enumerate(t, 1):
                pb.append(min(pa[j] + 1, pb[j - 1] + 1, pa[j - 1] + (ca != cb)))
            if min(pb) > lim: break
            pa = pb
        else:
            if pa[-1] <= lim: return True
    return False

def aligned(line, text):
    lw={w.lower() for w in re.findall(r"[A-Za-z]{4,}", line)}-STOP
    tw={w.lower() for w in re.findall(r"[A-Za-z]{4,}", text)}
    low=text.lower()
    for term, plain in GLOSS:
        if term in low:
            tw |= {w for w in re.findall(r"[A-Za-z]{4,}", plain)}
    if not lw: return True
    hit = lw & tw
    # ── THE SCAN, NOT THE LINE ──────────────────────────────────────────────
    # Where the page is destroyed there is nothing left to overlap WITH:
    # "Parnassus" is printed "I'ariiassus", "Kentucky" is "Keutucky", "sewers"
    # is "sevrers". Eleven correct lines in one 1900s slice were called
    # misaligned on exactly this, and the slice was binned for it. So a word
    # the scan mangled still counts as found — the same allowance the gate
    # makes, for the same reason. A line about a DIFFERENT record still fails:
    # near-matching a garbled word is not the same as matching any word.
    if len(hit) < max(1, len(lw)//4):
        hit = set(hit) | {w for w in (lw - tw) if _near1(w, tw)}
    return len(hit) >= max(1, len(lw)//4)
OFF=[(re.compile(r"^(?:Resolution|Ordinance|Motion)\b",re.I),"instrument"),
     (re.compile(r"\bhereby\b|\bwhereas\b|\bthereof\b",re.I),"legalese"),
     (re.compile(r"\brevocable at\b|\bduring the pleasure\b",re.I),"boilerplate"),
     (re.compile(r"\bconditional use\b|\bofficial grades?\b|\bfull acceptance\b",re.I),"jargon")]
inpat, outpat, lo, hi = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
ok=[]; binned=[]; pending=[]
for i in range(lo, hi+1):
    o=outpat.format(i)
    if not os.path.exists(o): pending.append(i); continue
    src={json.loads(l)['id']:json.loads(l) for l in open(inpat.format(i))}
    rows=[json.loads(l) for l in open(o) if l.strip()]
    reorder=mis=inv=ovr=0; reg=[]; W=[]; runs=[]
    prev_bad=False
    for d in rows:
        s=src.get(d['id'])
        if s is None or d.get('anchor',s['anchor']).strip()!=s['anchor'].strip(): reorder+=1
        if s is None: continue
        rec=RECS[d['id']]
        bad = not aligned(d['line'], rec['t'])
        if bad:
            mis+=1
            if prev_bad: runs.append(d['line'][:40])
        prev_bad=bad
        c=check(d['line'], rec['t'])
        inv+=bool(c['invented']); ovr+=bool(c['overstates'])
        for rx,why in OFF:
            if rx.search(d['line']): reg.append(d['line'][:50]); break
        W.append(len(d['line'].split()))
    drift = bool(runs) or mis > 5 or reorder or len(rows)!=len(src)
    (binned if drift else ok).append(i)
    print(f"w{i:>2}: {len(rows):>3}/{len(src)} · {statistics.median(W):.0f}w · reord {reorder} · "
          f"misal {mis} (runs {len(runs)}) · inv {inv} · ovr {ovr} · reg {len(reg)}"
          f" -> {'BIN' if drift else 'ok'}")
print(f"\nclean {ok}\nbinned {binned}\npending {pending}")
json.dump(ok, open('/tmp/clean.json','w'))
