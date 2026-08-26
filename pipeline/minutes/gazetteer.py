"""
Canonical San Francisco street gazetteer, built from DataSF's street network.

Why this exists: OCR of the 1912 Journal yields 910 distinct "street names", 36% of them
appearing once — Argnello / ArgueJlo / Argueilo Boulevard are all Arguello. Folding rare
spellings into frequent ones by edit distance was tried and is UNSAFE: it merged Alameda
into Alabama and Bacon into Jackson, all real and distinct SF streets.

Matching against a gazetteer of streets that actually exist is safe, because Alameda and
Alabama are both in it and each matches itself. Nothing is invented; a name either
resolves to a real street or is reported unresolved.

Standalone. Usage:  python3 gazetteer.py            # build + report resolution rate
"""
import json, os, re, subprocess, urllib.parse, difflib, collections

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")


UNITS = {"FIRST":1,"SECOND":2,"THIRD":3,"FOURTH":4,"FIFTH":5,"SIXTH":6,"SEVENTH":7,
         "EIGHTH":8,"NINTH":9,"TENTH":10,"ELEVENTH":11,"TWELFTH":12,"THIRTEENTH":13,
         "FOURTEENTH":14,"FIFTEENTH":15,"SIXTEENTH":16,"SEVENTEENTH":17,"EIGHTEENTH":18,
         "NINETEENTH":19}
# exact words for the round tens, and the cardinal prefixes that compound (TWENTY-SECOND)
TENS_EXACT  = {"TWENTIETH":20,"THIRTIETH":30,"FORTIETH":40,"FIFTIETH":50,"SIXTIETH":60}
TENS_PREFIX = {"TWENTY":20,"THIRTY":30,"FORTY":40,"FOURTY":40,"FIFTY":50,"SIXTY":60}
DISTRICT_SUFFIX = re.compile(r"\s+(TI|HP|SI|YB)$")

def _suffix(n):
    if 10 <= n % 100 <= 20: return "TH"
    return {1:"ST",2:"ND",3:"RD"}.get(n % 10, "TH")

def _ord(n): return f"{n}{_suffix(n)}"

def written_ordinal(t):
    """TWENTYSECOND -> 22ND, THIRTIETH -> 30TH, FIRST -> 1ST. None if not an ordinal word."""
    if t in UNITS:      return _ord(UNITS[t])
    if t in TENS_EXACT: return _ord(TENS_EXACT[t])
    for pre, val in TENS_PREFIX.items():
        if t.startswith(pre):
            rest = t[len(pre):]
            if rest in UNITS: return _ord(val + UNITS[rest])
    return None


# Spelling drift confirmed by hand against the DataSF list: the record's spelling on the
# left, the modern canonical street on the right. These are NOT renames — the street is
# the same one, spelled differently then, or mangled by OCR in a way fuzzy matching at a
# safe cutoff will not reach.
VARIANTS = {
    "GENESEE":   "GENNESSEE",   # 33 mentions in 1925; Gennessee is the modern spelling
    "DEHARO":    "DE HARO",
    "QOETTINGEN": "GOETTINGEN", # OCR reads G as Q
    "SANITAGO":  "SANTIAGO",    # OCR transposition
}

# Streets the city renamed. Each needs a citation before it is trusted — an unsourced
# rename silently relocates decisions, which is worse than leaving them unresolved.
RENAMES = {
    "COOLIDGE": ("WALL", "https://archive.org/details/journalofproceed1912sanfrich/page/n21/mode/1up"),
    "CORBETT": ("JUNIPERO SERRA", "https://archive.org/details/journalofproceed1914sanfrich/page/n113/mode/1up"),
    "DELMAR": ("ASHBURY", "https://archive.org/details/journalofproceed1914sanfrich/page/n775/mode/1up"),  # partial
    "KENTUCKY": ("THIRD", "https://archive.org/details/journalofproceed1915sanfrich/page/n476/mode/1up"),
    "LIZZIE": ("KINGSTON", "https://archive.org/details/journalofproceed1925sanfrich/page/n1388/mode/1up"),
    "MARENGO": ("ALEMANY", "https://archive.org/details/journalofproceed30sanfrich/page/n91/mode/1up"),  # partial
    "MOSCOW": ("VALMAR", "https://archive.org/details/journalofproceed50sanfrich/page/n196/mode/1up"),
}

DIGIT_ORD = re.compile(r"^0*(\d{1,3})(ST|ND|RD|TH)?$")

def norm(name: str) -> str:
    """Both the record's words and DataSF's codes land on the same string: 22ND, 1ST, MISSION."""
    n = re.sub(r"[^A-Z0-9 ]", "", (name or "").upper()).strip()
    n = DISTRICT_SUFFIX.sub("", n)
    n = re.sub(r"\s+", " ", n).strip()
    flat = n.replace(" ", "")
    m = DIGIT_ORD.match(flat)
    if m: return _ord(int(m.group(1)))
    w = written_ordinal(flat)
    if w: return w
    n = VARIANTS.get(n, n)
    if n in RENAMES:
        n = RENAMES[n][0]
        # the rename target may itself be an ordinal word ("Kentucky" -> "Third" -> 3RD),
        # so normalise again rather than handing back a form the gazetteer never uses
        w2 = written_ordinal(n.replace(" ", ""))
        if w2: n = w2
    return n

def fetch_streets():
    p = os.path.join(CACHE, "datasf_streets.json")
    if os.path.exists(p) and os.path.getsize(p) > 5000:
        return json.load(open(p))
    url = ("https://data.sfgov.org/resource/3psu-pn9h.json?"
           + urllib.parse.urlencode({"$select": "street,st_type", "$limit": "20000"}))
    out = subprocess.run(["curl", "-sL", "--max-time", "180", url], capture_output=True, text=True).stdout
    rows = json.loads(out)
    json.dump(rows, open(p, "w"))
    return rows

def build():
    """-> {normalised name: canonical display name}"""
    g = {}
    for r in fetch_streets():
        raw = (r.get("street") or "").strip()
        if not raw: continue
        k = norm(raw)
        if k and k not in g:
            g[k] = raw.title()
    return g


# Character pairs this OCR actually confuses, taken from observed misreads in the corpus:
# "Oeary"/Geary, "Gearv"/Geary, "Polsom"/Folsom, "Van Xess"/Van Ness, "Wooisey"/Woolsey,
# "I'olk"/Polk, "Qoettingen"/Goettingen. A single substitution is accepted ONLY when the
# pair is one of these AND exactly one real street matches — uniqueness is the second guard.
# Blanket edit-distance-1 was measured and rejected: ~20% of its matches were wrong
# (Berlin->Merlin, Latham->Lapham, Hart->Hare), and a wrong street silently relocates a
# decision, which is worse than leaving it unresolved.
OCR_CONFUSABLE = {frozenset(p) for p in
                  ["OG","OQ","GQ","VY","IL","IT","PF","XN","CE","SB","S5","O0","I1","UN","MN","RN","DO","EF","JI","TF"]}

def _ocr_sub_unique(k, gaz):
    hits = []
    for cand in gaz:
        if len(cand) != len(k): continue
        diff = [(a, b) for a, b in zip(cand, k) if a != b]
        if len(diff) == 1 and frozenset(diff[0]) in OCR_CONFUSABLE:
            hits.append(cand)
            if len(hits) > 1: return None
    return hits[0] if len(hits) == 1 else None

def resolve(name, gaz, keys=None, cutoff=0.88):
    """0.88 is deliberate. A sweep to 0.80 lifts 1925 from 94.3% to 96.8%, but roughly half
    the newly-matched names are wrong: Army->Armory (Army was RENAMED, not misspelled),
    Bernal->Bengal, Hart->Hobart, Cowden->Owen. Exact match always runs first, so a real
    street never reaches the fuzzy branch — that is why Alameda and Alabama are safe here
    when frequency-folding destroyed them. Loosening trades that safety away.
    Exact, then normalised, then conservative fuzzy AGAINST REAL STREETS ONLY."""
    k = norm(name)
    if k in gaz: return gaz[k], "exact"
    keys = keys if keys is not None else list(gaz)
    m = difflib.get_close_matches(k, keys, n=1, cutoff=cutoff)
    if m: return gaz[m[0]], "fuzzy"
    o = _ocr_sub_unique(k, gaz)
    if o: return gaz[o], "ocr"
    return None, "unresolved"

if __name__ == "__main__":
    import importlib.util
    spec = importlib.util.spec_from_file_location("ex", os.path.join(HERE, "extract.py"))
    ex = importlib.util.module_from_spec(spec); spec.loader.exec_module(ex)
    gaz = build(); keys = list(gaz)
    print(f"gazetteer: {len(gaz)} canonical SF streets from DataSF 3psu-pn9h\n")

    for label, ident in [("1912", "journalofproceed1912sanfrich"), ("1925", "journalofproceed1925sanfrich")]:
        rows = list(ex.decisions(ident))
        c = collections.Counter(s for r in rows for s in r["streets"])
        stats, unresolved = collections.Counter(), []
        for name, n in c.items():
            base = re.sub(r"\s+(Street|Avenue|Boulevard|Road|Way|Drive|Place|Terrace|Alley|Lane|Court|Park|Plaza|Square|Highway|Circle|Path|Walk)$", "", name)
            hit, how = resolve(base, gaz, keys)
            stats[how] += 1
            stats[how + "_mentions"] += n
            if how == "unresolved": unresolved.append((n, name))
        tot = stats["exact"] + stats["fuzzy"] + stats["unresolved"]
        totm = sum(c.values())
        print(f"{label}: {tot} distinct names, {totm} mentions")
        print(f"   exact      {stats['exact']:>4} names ({stats['exact_mentions']:>5} mentions)")
        print(f"   fuzzy      {stats['fuzzy']:>4} names ({stats['fuzzy_mentions']:>5} mentions)")
        print(f"   UNRESOLVED {stats['unresolved']:>4} names ({stats['unresolved_mentions']:>5} mentions)")
        print(f"   -> {100*(stats['exact_mentions']+stats['fuzzy_mentions'])/max(totm,1):.1f}% of mentions resolve")
        print("   top unresolved:", [f"{n}x {s}" for n, s in sorted(unresolved, reverse=True)[:10]], "\n")
