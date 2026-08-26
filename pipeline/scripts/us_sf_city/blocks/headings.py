"""The Board's own one-line summary of each item, lifted out of the printed page.

    python3 blocks/headings.py            geo/cache/ia/*.gz -> blocks/cache/headings.json

WHY THIS EXISTS. The item splitter cuts each page on Resolution|Ordinance|Motion,
and the Journal prints the item's HEADING above that word. So the heading of item
N is the tail of item N-1 and every snippet built from the body alone starts in
the middle of a sentence. The headings are already written, in the record, by the
Board, and they were being thrown away:

    ... Todd — 15. Absent — Supervisors Bath, Hayden, Shannon — 3.
    Denying Laundry Permits.  Supervisor Deasy presented:
    | Resolution No. 27524 (New Series), as follows: Resolved, That ...
    ^ the split lands here, so "Denying Laundry Permits." ends up on the item before

WHAT IS TAKEN AND WHAT IS NOT. Between the heading and the split there is always a
connector — "Also,", "File No. 186-62,", "Supervisor Tamaras presented:", "On
motion of Supervisor Deasy:". Those are stripped, and the last complete sentence
before them is the candidate. It is accepted only if it reads as a heading: title
case, ends in a full stop, no roll-call tally, no money fragment, no OCR garble,
and not one of the Board's procedural dispositions ("Adopted.", "Motion Lost.",
"Referred to Streets Committee.") which sit in the same position and say nothing
about the place.

"ALSO," IS THE BOARD'S OWN GROUPING. When the connector is bare "Also," the Journal
is printing a second item under the heading it already printed — the two Larkin
Street laundry denials above are one heading and two resolutions. That heading is
carried forward, and ONLY across a bare "Also," on the same page. Nothing else
inherits.

Item numbering is the same walk as extract_texts.py — same page order, same ITEM
split, same 60..3000 gate, same `locations` gate, same per-volume counter — so
(volume, item) here is (v, i) there. Asserted at the end against items.jsonl.
"""
import gzip, importlib.util, json, os, re, sys, time

import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Code in the repo, data under CITY_DATA. See _paths.py.
from _paths import ANIM, REPO as ROOT, MIN, IA, CACHE  # noqa: F401
HERE = os.path.dirname(os.path.abspath(__file__))


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


# ---------------------------------------------------------------- sentences
# "No. 8169," and "J. Smith" are not sentence ends. Both occur in every heading
# position in this corpus, so the split is abbreviation-guarded rather than naive.
ABBR = set("no nos st ave blvd mr mrs ms dr jr sr co inc etc vs dept hon rev prof "
           "supt approx ft ry rr jan feb mar apr jun jul aug sept sep oct nov dec "
           "u.s d.c p.m a.m".split())
SENT = re.compile(r"[.;:]\s+")


def sentences(t):
    out, start = [], 0
    for m in SENT.finditer(t):
        j = m.start()
        w = re.split(r"[\s,(]", t[:j])[-1].lower().strip("(\"'")
        if w in ABBR or (len(w) == 1 and w.isalpha()):
            continue
        s = t[start:j + 1].strip()
        if s:
            out.append(s)
        start = m.end()
    if t[start:].strip():
        out.append(t[start:].strip())
    return out


# ---------------------------------------------------------------- connectors
ALSO = re.compile(r"\bAlso\s*,\s*$", re.I)
CONNECTORS = [ALSO] + [re.compile(c, re.I) for c in (
    r"\bFile\s+No\.?\s*[\dA-Za-z\-\.]*\s*,?\s*$",
    r"\bBill\s+No\.?\s*[\dA-Za-z\-\.]*\s*,?\s*$",
    r"\bSupervisors?\s+[A-Z][\w'\-\.]+\s+presented\b[^:.]{0,90}:\s*$",
    r"\bPresented\s+by\s+Supervisors?\b[^:.]{0,60}:\s*$",
    r"\bOn\s+m\w{0,4}tion\s+of\s+Supervisors?\s+[A-Z][\w'\-\.]+\s*:?\s*$",
    r"\bThe\s+following\b[^:]{0,110}:\s*$",
    r"\bWhereupon\b[^:]{0,140}:\s*$",
    r"\bi\s*$",
)]

# ---------------------------------------------------------------- heading gates
SMALL = set("a an and as at by for from in of on or the to with upon between under "
            "over into per".split())
ROLLW = re.compile(r"\b(Ayes?|Noes?|Absent|Excused|Supervisors?)\b", re.I)
TALLY = re.compile(r"[—–\-]\s*\d{1,3}\.?\s*$")          # "... Welch— 15."
MONEYFRAG = re.compile(r"\d{1,3},\d{3}\.\d{2}|\(claim dated")
GARBLE = re.compile(r"[\\|{}~^_<>\[\]!*#@=+]|[A-Za-z]\d|\d[A-Za-z]")
FINITE = re.compile(r"\b(is|are|was|were|be|been|shall|hereby|that|which|said|"
                    r"thereof|therein)\b", re.I)
WEEKDAY = re.compile(r"^(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\b", re.I)
# The Journal prints its own disposition in the same slot as a heading. These say
# what happened to the item, never what it was about, and 100% of them are one of
# a short closed set — collected by frequency off this corpus, not invented.
PROCEDURAL = re.compile(
    r"^(adopted|passed|finally passed|re-?referred|referred(\s+back)?\b|reference to\b|"
    r"recommended|approved|filed|read and filed|taken up|motion lost|motion carried|"
    r"consideration (continued|temporarily postponed|postponed)|action deferred|"
    r"substitute( motion)?|new business|unfinished business|old business|"
    r"passed for printing|roll call|excused from attendance|"
    r"(list|[bkh]ill|file|ordinance|resolution|motion)s?\s+no\b|"
    r"the following|severally|in memoriam|adjournment|hearing of appeal|"
    r"communications?|report of|privilege of the floor|committee reports?)\b", re.I)


# "SPECIAL ORDER— 2:30 P. M. Zone Change, District Bounded by Broadway ..." — the
# Journal's running section banner sits on the same line as the heading and the
# sentence split cannot separate them, because "P. M." is an abbreviation.
BANNER = re.compile(r"^(?:[A-Z0-9][A-Z0-9&'\.\-—:]*\s+){2,10}(?=[A-Z][a-z])")
# OCR breaks a word at a line end as "City- Owned"; extract.clean only rejoins the
# lower-case half of the pair, which is most of them but not this one.
LINEBREAK = re.compile(r"(\w)-\s+(\w)")


NUMPFX = re.compile(r"^(Resolution|Ordinance|Motion|Bill)\s*(No\.?\s*[\dA-Za-z\-]*)?\s*"
                    r"(\((?:New Series|Series of \d{4})\))?\s*,\s*(?=[A-Z])", re.I)


def tidy(s):
    s = LINEBREAK.sub(r"\1-\2", BANNER.sub("", s.strip())).strip()
    return NUMPFX.sub("", s).strip()


def is_heading(s):
    s = s.strip()
    if not (12 <= len(s) <= 190) or not s.endswith("."):
        return False
    if ROLLW.search(s) or TALLY.search(s) or MONEYFRAG.search(s) or GARBLE.search(s):
        return False
    if s.upper() == s or WEEKDAY.match(s) or PROCEDURAL.match(s):
        return False
    if not re.match(r"^[A-Z]", s) or FINITE.search(s):
        return False
    w = [x for x in re.split(r"[\s,;]+", s.rstrip(".")) if x]
    if not w or not re.match(r"^[A-Za-z]", w[0]):
        return False
    # a run of single capitalised words separated by commas is a roll call whose
    # "Supervisors" was cut off by the sentence split, not a heading
    if len(w) >= 4:
        commas = s.count(",")
        if commas >= 3 and commas / len(w) > 0.55:
            return False
    sig = [x for x in w if len(x) > 3 and x.lower() not in SMALL and x[0].isalpha()]
    if not sig:
        return len(w) <= 3 and all(x[0].isupper() for x in w if x[0].isalpha())
    return sum(1 for x in sig if x[0].isupper()) / len(sig) >= 0.75


def heading_from(pre):
    """(heading | None, whether the connector was a bare 'Also,')."""
    p = re.sub(r"\s+", " ", pre).strip()
    also = False
    for _ in range(6):
        before = p
        for c in CONNECTORS:
            q = c.sub("", p).strip()
            if q != p and c is ALSO:
                also = True
            p = q
        if p == before:
            break
    for s in reversed(sentences(p)[-3:]):
        s = tidy(s)
        if is_heading(s):
            return re.sub(r"\s+", " ", s).strip(), also
    return None, also


# ---------------------------------------------------------------- vocabulary
def build_vocab():
    """Every word the corpus prints more than twice, counted off the corpus.

    "Transfer Automobile Supphj Station." is the Board's heading for a supply
    station permit, read wrong. There is no rule of English that catches "Supphj"
    that does not also catch half the surnames in the Journal — but the CORPUS
    catches it, because a word the printers set thousands of times appears
    thousands of times and a word the OCR invented appears once. This is the test
    a garbled heading fails, and it is measured rather than reasoned.
    """
    import collections
    it = os.path.join(CACHE, "items.jsonl")
    if not os.path.exists(it):
        print("no items.jsonl — vocabulary not built"); return
    c = collections.Counter()
    for d in map(json.loads, open(it)):
        c.update(w.lower() for w in re.findall(r"[A-Za-z]{4,}", d["t"]))
    common = sorted(w for w, n in c.items() if n >= 3)
    # printed ONCE in ninety years of proceedings. "supphj", "antoniohilr",
    # "soutiiern" — the Journal's vocabulary is small and repetitive, so a word
    # the printers set exactly once is far more often a misreading than a word.
    hapax = sorted(w for w, n in c.items() if n <= 1 and len(w) >= 6)
    p = os.path.join(CACHE, "vocab.json")
    json.dump({"common": common, "hapax": hapax}, open(p, "w"), separators=(",", ":"))
    print(f"vocabulary: {len(common):,} words printed 3+ times, {len(hapax):,} printed "
          f"once (of {len(c):,} distinct) -> {os.path.getsize(p)/1024:,.0f} KB")


# ---------------------------------------------------------------- the walk
def main():
    ex = _load(os.path.join(MIN, "extract.py"), "ex")
    vols = []
    for ln in open(os.path.join(ANIM, "vols.txt")):
        p = ln.split()
        if len(p) == 2:
            vols.append((int(p[0]), p[1]))

    out = {}
    tot = own = inh = 0
    for year, ident in vols:
        a = os.path.join(IA, f"{ident}_hocr_searchtext.txt.gz")
        b = os.path.join(IA, f"{ident}_hocr_pageindex.json.gz")
        if not (os.path.exists(a) and os.path.exists(b)):
            print(f"{year} {ident:44s} NO CACHED HOCR", flush=True); continue
        try:
            t = gzip.open(a, "rt", encoding="utf-8", errors="replace").read()
            pi = json.load(gzip.open(b, "rt"))
        except Exception as e:
            print(f"  !! {ident}: {e}", flush=True); continue
        starts = [e[0] for e in pi]
        t0, item_id, n_own = time.time(), 0, 0
        for i, s in enumerate(starts):
            text = ex.clean(t[s:(starts[i + 1] if i + 1 < len(starts) else len(t))])
            if len(text) < 60:
                continue
            marks = [mm.start() for mm in ex.ITEM.finditer(text)]
            carried, prev = None, 0
            for a2, b2 in zip(marks, marks[1:] + [len(text)]):
                body = text[a2:b2]
                # the window is the whole preceding item, capped — a heading has
                # never been further back than that, and an uncapped window makes
                # the sentence split quadratic on a dense page
                h, also = heading_from(text[max(prev, a2 - 700):a2])
                prev = a2
                kind = None
                if h:
                    carried, kind = h, "own"
                elif also and carried:
                    h, kind = carried, "inh"
                if len(body) < 60 or len(body) > 3000 or not ex.locations_from(body):
                    continue
                item_id += 1
                tot += 1
                if kind == "own":
                    own += 1; n_own += 1
                elif kind == "inh":
                    inh += 1
                if h:
                    out[f"{ident}|{item_id}"] = h
        print(f"{year} {ident:44s} {item_id:>6} items  {n_own:>6} headed  "
              f"{time.time()-t0:.0f}s", flush=True)

    os.makedirs(CACHE, exist_ok=True)
    build_vocab()
    p = os.path.join(CACHE, "headings.json")
    json.dump(out, open(p, "w"), separators=(",", ":"), ensure_ascii=False)
    print(f"\nITEMS {tot:,}")
    print(f"  own heading printed above the item  {own:,} ({100*own/tot:.1f}%)")
    print(f"  carried across a bare 'Also,'       {inh:,} ({100*inh/tot:.1f}%)")
    print(f"  no heading in the record            {tot-own-inh:,} "
          f"({100*(tot-own-inh)/tot:.1f}%)")
    print(f"wrote {p} {os.path.getsize(p)/1024:,.0f} KB")

    # the join is (volume, item). If this walk ever drifts from extract_texts.py
    # every heading lands on somebody else's decision, and nothing downstream
    # could tell — so it is checked here rather than trusted.
    it = os.path.join(CACHE, "items.jsonl")
    if os.path.exists(it):
        keys = {f"{d['v']}|{d['i']}" for d in map(json.loads, open(it))}
        miss = set(out) - keys
        print(f"items.jsonl keys {len(keys):,} · headings that match none of them "
              f"{len(miss):,}")
        if miss:
            sys.exit("REFUSED: this walk is not extract_texts.py's walk.")


if __name__ == "__main__":
    main()
