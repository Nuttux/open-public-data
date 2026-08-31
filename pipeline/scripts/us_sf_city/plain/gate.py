# -*- coding: utf-8 -*-
"""Two checks every written line must pass before it can be published.

CHECK 1 — did I invent anything? Every name, number and street in the line has
to appear in the record. This is what stops a housing bond being written as a
liquor licence.

CHECK 2 — did I write a proposal as a fact? If the record says "urging" or
"referred" or "intention", the line may not say "built" or "accepted".

Both were wrong in their first version and the fixes are recorded here, because
a check that misfires gets ignored, which is worse than no check at all.
"""
import re

# ── CHECK 1 ────────────────────────────────────────────────────────────────
WORDNUM = {"one":"1","two":"2","three":"3","four":"4","five":"5","six":"6",
 "seven":"7","eight":"8","nine":"9","ten":"10","eleven":"11","twelve":"12",
 "thirteen":"13","fourteen":"14","fifteen":"15","sixteen":"16","seventeen":"17",
 "eighteen":"18","nineteen":"19","twenty":"20","thirty":"30","forty":"40",
 "fifty":"50","sixty":"60","seventy":"70","eighty":"80","ninety":"90",
 "hundred":"100","thousand":"1000"}
STOCK = set("""the a an of in on at to for and or with by from street streets avenue
avenues boulevard road way place drive city county san francisco board public works
supervisors district ordinance resolution motion""".split())


# ── THE RECORD'S OWN ABBREVIATIONS ──────────────────────────────────────────
# The Journal writes "Acme Brewing Co.", "Sansome st.", "United Railroads R. R.";
# a line a person can read writes them out. Flagging "Company" as invented
# because the clerk typed "Co." is the gate being wrong about the line, so each
# abbreviation the record ACTUALLY CONTAINS admits its expansion — and nothing
# else. This adds no word the record does not already carry in short form.
ABBREV = {"co": "company", "inc": "incorporated", "corp": "corporation",
          "bros": "brothers", "st": "street", "ave": "avenue", "av": "avenue",
          "blvd": "boulevard", "dept": "department", "mfg": "manufacturing",
          "assn": "association", "bldg": "building", "ry": "railway",
          "rr": "railroad", "hosp": "hospital", "natl": "national",
          "sq": "square", "rd": "road", "ct": "court", "dr": "drive",
          "ter": "terrace", "ln": "lane", "pl": "place"}

def _norm(s):
    s = s.lower().replace("’", "'").replace(",", "")
    s = re.sub(r"-\s+", "", s)          # "Mc- Grath" and "2826- 2828" are one token
    s = re.sub(r"(?<=\d)\s+(?=\d)", "", s)   # "14 30 Filbert" is 1430
    s = re.sub(r"(?<=\d)[-,]\s*(?=[\dgosl])", "", s)  # "$22,-98G.97" is 2298697
    s = re.sub(r"(?<=\d)g(?=\d)|(?<=\d)g\b", "6", s)  # the scanner reads 6 as G
    s = re.sub(r"[.'‘“”]", "", s)
    return re.sub(r"\s+", " ", s)

def _stem(w):
    return re.sub(r"(?:ing|ed|s)$", "", w.lower())

def _near(word, stems, src):
    """The scan mangles letters: `Slver` for Silver, `Liorary` for Library,
    `Kpuse` for House. A word one or two characters away from something in the
    record is damage, not invention, and the two must not be reported alike."""
    w = word.lower()
    if len(w) < 3: return False
    for cand in stems:
        if abs(len(cand) - len(w)) > 2: continue
        # the scanner substitutes the FIRST letter as readily as any other:
        # `Pood Co.` for Food, `Kpuse` for House. Requiring a matching initial
        # left those reported as invention.
        if len(w) < 4 and cand[0] != w[0]: continue
        # bounded Levenshtein
        prev = list(range(len(cand) + 1))
        for i, ch in enumerate(w, 1):
            cur = [i]
            for j, cj in enumerate(cand, 1):
                cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ch != cj)))
            prev = cur
        if prev[-1] <= (2 if len(w) >= 5 else 1): return True
    return False


def _rounds_to(w, record):
    m = re.fullmatch(r"\$?([\d.]+)m", w.lower())
    if not m: return False
    try: want = round(float(m.group(1)), 1)
    except ValueError: return False
    for n in re.findall(r"\$\s?([\d][\d,]*)", record):
        v = int(n.replace(",", ""))
        if v >= 100_000 and round(v / 1_000_000, 1) == want: return True
    return False


def _money_forms(w):
    """$40.0M in a line stands for $40,000,000 in the record."""
    m = re.fullmatch(r"\$?([\d.]+)m", w.lower())
    if not m: return []
    try: v = int(float(m.group(1)) * 1_000_000)
    except ValueError: return []
    return [str(v), f"{v:,}", f"{v/1_000_000:g} million", f"{v//1_000_000} million"]


def invented(line, record):
    """Words in the line that cannot be found in the record."""
    src = _norm(record)
    # `A. J. Fo-'bes & Son` must yield "fobes", not "fo" and "bes"
    joined = re.sub(r"(?<=[a-z])-(?=[a-z])", "", src)
    stems = {_stem(w) for w in re.findall(r"[a-z]+", src)}
    stems |= {_stem(w) for w in re.findall(r"[a-z]+", joined)}
    # a record that spells "ninety days" backs a line that writes "90"
    for ab, full in ABBREV.items():
        if ab in stems:
            stems.add(_stem(full)); src += " " + full
        if _stem(full) in stems:
            stems.add(ab); src += " " + ab
    for word, digit in WORDNUM.items():
        if word in stems: src += " " + digit
    for tens, unit in re.findall(r"\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)"
                                r"[- ]?(one|two|three|four|five|six|seven|eight|nine)\b", src):
        src += " " + str(int(WORDNUM[tens]) + int(WORDNUM[unit]))
    out = []
    # the FIRST word is capitalised because it opens a sentence, not because it
    # is a name — checking it flagged "Big", "Bar", "Part", "Change", "Land"
    for pos, raw in enumerate(line.split()):
        if pos == 0 and not any(c.isdigit() for c in raw): continue
        w = raw.strip(".,;:'\"()").strip("$-")
        w = re.sub(r"['’]s$", "", w)
        if not w: continue
        is_num = any(c.isdigit() for c in w)
        is_name = w[:1].isupper() and w.lower() not in STOCK
        if not (is_num or is_name): continue
        n = _norm(w)
        if n in src or _stem(w) in stems: continue
        # "Two-hour" against "Two Hours"; "T-Mobile" against "T-Mobile"
        if all(p in src or _stem(p) in stems or _near(p, stems, src)
               for p in n.split("-") if p): continue
        if any(_norm(f) in src for f in _money_forms(w)): continue
        if _rounds_to(w, record): continue
        if _near(w, stems, src): continue          # scan damage, reported apart
        if is_num and _near(w, set(re.findall(r"[a-z0-9]{2,}", src)), src): continue
        out.append(raw)
    return out


def damaged(line, record):
    """Words that match the record only approximately - the scan is damaged."""
    src = _norm(record); stems = {_stem(x) for x in re.findall(r"[a-z]+", src)}
    out = []
    for pos, raw in enumerate(line.split()):
        if pos == 0: continue
        w = re.sub(r"['’]s$", "", raw.strip(".,;:'\"()").strip("$-"))
        if not w or not (w[:1].isupper() and w.lower() not in STOCK): continue
        if _norm(w) in src or _stem(w) in stems: continue
        if _near(w, stems, src): out.append(raw)
    return out

# ── CHECK 2 ────────────────────────────────────────────────────────────────
# The wall again: a page holds several items, so "Referred" or "laid over"
# printed after this item's vote belongs to the NEXT one. Three of the five
# flags in the first run were that — "Anza street roadway accepted" was correct
# and the word "Referred" was about a different resolution further down.
WALL = re.compile(r"\bAyes\s*[:—-]|\bAdopted by the following vote|"
                  r"\bFinally [Pp]assed by the following", re.I)
PENDING = re.compile(r"\b(urging|urge|requesting|intention|intends?|referred|"
                     r"to consider|preliminarily|withdrawn|postponed?|"
                     r"laid over|no action|contemplated)\b"
                     # "proposed" only where it reports a STATUS, never where it
                     # modifies a noun: "the proposed new warehouse" is a thing,
                     # "the work is proposed" is a stage
                     r"|\b(?:is|are|was|were|be|hereby|herein)\s+proposed\b"
                     r"|^\W*proposed\b", re.I)
CLAIMS_DONE = re.compile(r"\b(built|rebuilt|accepted|paved|repaved|removed|installed|"
                         r"leased|bought|sold|closed|made|opened|settles|approved|"
                         r"granted|allowed|gets|takes|widened|graded)\b", re.I)

def overstates(line, record):
    """The record says it has not happened; the line says it has."""
    wall = WALL.search(record)
    own = record[:wall.start()] if wall else record
    own = re.sub(r"\.\s*Referred\.\s+(?=[A-Z])", ". ", own)
    own = re.sub(r"\bReferred\.\s*$", " ", own)
    own = re.sub(r"\bthan (?:originally |previously )?proposed\b", " ", own, flags=re.I)
    own = re.sub(r"\boriginally proposed\b", " ", own, flags=re.I)
    # A closing ordinance RECITES the earlier intention before doing the deed:
    # "declared its intention to close ... no objections were made ... now,
    # therefore, be it Resolved". The intention is history, not the status.
    if re.search(r"now,?\s*therefore,?\s*be it [Rr]esolved|no objection[s]? .{0,40}"
                 r"(?:were|was) (?:made|delivered)|more than ten days have elapsed",
                 own, re.I):
        return None
    # a line that already says "to be closed" or "proposed" claims nothing done
    if re.search(r"\bto be \w+|proposed|put off|asked|weighs|urged\b", line, re.I):
        return None
    p = PENDING.search(own)
    d = CLAIMS_DONE.search(line)
    return (p.group(0), d.group(0)) if (p and d) else None

def check(line, record):
    return {"invented": invented(line, record),
            "damaged": damaged(line, record),
            "overstates": overstates(line, record)}
