"""
Extract structured decisions from scanned municipal minutes on the Internet Archive.

Standalone. No imports from the surrounding repo — this directory is meant to lift out.
Input:  an IA item identifier whose _djvu.xml is downloadable
Output: one JSON object per decision, with an exact page-level source URL

Usage:  python3 extract.py <identifier> [<identifier> ...]
"""
import json, os, re, sys, urllib.request, html

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cache")
os.makedirs(CACHE, exist_ok=True)

# ---------------------------------------------------------------- fetch

def djvu_xml(ident: str) -> str:
    path = os.path.join(CACHE, f"{ident}.xml")
    if os.path.exists(path) and os.path.getsize(path) > 10000:
        return open(path, encoding="utf-8", errors="replace").read()
    url = f"https://archive.org/download/{ident}/{ident}_djvu.xml"
    with urllib.request.urlopen(url, timeout=300) as r:
        data = r.read()
    open(path, "wb").write(data)
    return data.decode("utf-8", "replace")

# ---------------------------------------------------------------- pages

WORD = re.compile(r"<WORD[^>]*>(.*?)</WORD>", re.S)
PAGE_SPLIT = re.compile(r'<OBJECT\b', re.S)

def pages(xml: str):
    """Yield (leaf_index, page_text). leaf_index is 0-based, matching IA's /page/nN."""
    for i, chunk in enumerate(PAGE_SPLIT.split(xml)[1:]):
        words = [html.unescape(w) for w in WORD.findall(chunk)]
        yield i, " ".join(words)

# ---------------------------------------------------------------- parsing

MEETING = re.compile(
    r"\b(Monday|Tuesday|Wednesday|Thursday|Friday)\s*,?\s+"
    r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+"
    r"(\d{1,2})\s*,?\s+(\d{4})", re.I)

ITEM = re.compile(r"\b(Resolution|Ordinance|Motion)\b")

VOTE = re.compile(r"\bAyes?\s*[:\-—]?\s*(.{0,400}?)(?:\bNoes?\b|\bAbsent\b|\bExcused\b|$)", re.S | re.I)
NOES = re.compile(r"\bNoes?\s*[:\-—]?\s*(.{0,300}?)(?:\bAbsent\b|\bExcused\b|$)", re.S | re.I)
NAMES = re.compile(r"\b([A-Z][a-zA-Z'\-]{3,18})\b")

MONEY = re.compile(r"\$\s?([\d]{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{4,})")

# Street types appear in both cases in the source: the 1970s volumes print
# "Pine Street", the 1912 volume prints "San Bruno avenue". Matching only the
# capitalised form silently dropped most early-century locations.
STREET_TYPES = ("Street|Streets|Avenue|Avenues|Boulevard|Road|Way|Drive|Place|Terrace|"
                "Alley|Lane|Court|Park|Plaza|Square|Highway|Circle|Path|Walk")
STREET = re.compile(
    r"\b(?:(?P<num>\d{1,5})\s+)?"
    r"(?P<name>[A-Z][a-zA-Z'’\-]{1,16}(?:\s+[A-Z][a-zA-Z'’\-]{1,16}){0,2})\s+"
    r"(?P<type>" + STREET_TYPES + "|" + STREET_TYPES.lower() + r")\b")

# "San Bruno avenue, near Silliman street" / "corner of Third and Market streets"
NEARBY = re.compile(r"\b(near|at|corner of|between|and|from|to)\s*$", re.I)

# A capitalised word before a street type does not make it a street. Courts of law
# are the big one ("Superior Court"); the rest are sentence-start artefacts —
# "...ordering Street work" produced a phantom "Ordering Street" 35 times in 1912.
NOT_A_STREET_NAME = set("""
Superior Juvenile Supreme Police Justice District Appellate Appeals Circuit Municipal
Ordering Order Said Same Following Certain Such Other Above Below Whereas Resolved
Ordained Approved Adopted Passed Referred Between Along Across Upon Improving Improve
Grading Grade Paving Pave Accepting Accept Repairing Repair Widening Widen Naming
Changing Change Closing Close Opening Open Crossing Cross Public This That These Those
Install Installing Tearing Torn Removing Remove Extending Extend Laying Lay Constructing
Construct Repairing Repair Cleaning Clean Sprinkling Sweeping Lighting Light Watering
""".split())

STOPNAMES = set("""Supervisors Supervisor Absent Excused President Board City County
San Francisco Clerk Mayor Ayes Noes The And For""".split())

# OCR breaks words across lines as "Mendel- sohn" / "re- pairs" / "Se- ries".
# Rejoining before any other parsing is what makes name and street matching work.
DEHYPHEN = re.compile(r"(\w)[-‐‑]\s+([a-z])")

def clean(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    return DEHYPHEN.sub(r"\1\2", s)

def names_from(blob: str):
    out = []
    for n in NAMES.findall(blob or ""):
        if n in STOPNAMES or len(n) < 4:
            continue
        if n not in out:
            out.append(n)
    return out

def locations_from(body: str):
    """Structured places named in an item.

    Each entry keeps the street number when the text carries one (the record
    writes '2426 Pine Street' far more often than the bare street name), plus a
    flag for streets that read as a cross-street of the one before them.
    """
    out, seen = [], set()
    for m in STREET.finditer(body):
        name = m.group("name").strip()
        name = re.sub(r"^(?:On|At|In|To|From|Along|Near|Upon)\s+", "", name)
        if name in NOT_A_STREET_NAME or name.split()[0] in NOT_A_STREET_NAME:
            continue
        if name in STOPNAMES:
            continue
        stype = m.group("type").rstrip("s").title()
        if stype == "Street" and m.group("type").lower().endswith("s"):
            stype = "Street"  # "Third and Market streets" — plural form, same type
        street = f"{name} {stype}"
        num = m.group("num")
        raw = f"{num} {street}" if num else street
        key = (street, num)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "street": street,
            "number": num,
            "raw": raw,
            # true when the preceding text joins this to the previous street
            "cross_of": bool(out) and bool(NEARBY.search(body[:m.start()][-16:])),
        })
    return out

def decisions(ident: str):
    xml = djvu_xml(ident)
    current_date = None
    for leaf, text in pages(xml):
        text = clean(text)
        if not text:
            continue
        m = None
        for m in MEETING.finditer(text):
            pass
        if m:
            month, day, year = m.group(2).title(), int(m.group(3)), int(m.group(4))
            current_date = f"{year}-{'JanFebMarAprMayJunJulAugSepOctNovDec'.find(month[:3])//3+1:02d}-{day:02d}"

        # split the page into candidate items on Resolution/Ordinance/Motion boundaries
        marks = [mm.start() for mm in ITEM.finditer(text)]
        for a, b in zip(marks, marks[1:] + [len(text)]):
            body = text[a:b]
            if len(body) < 60 or len(body) > 3000:
                continue
            locations = locations_from(body)
            amounts = MONEY.findall(body)
            vm, nm = VOTE.search(body), NOES.search(body)
            ayes = names_from(vm.group(1)) if vm else []
            noes = names_from(nm.group(1)) if nm else []
            if not locations and not amounts and not ayes:
                continue
            yield {
                "volume": ident,
                "leaf": leaf,
                "url": f"https://archive.org/details/{ident}/page/n{leaf}/mode/1up",
                "date": current_date,
                "type": ITEM.match(body).group(1) if ITEM.match(body) else None,
                "text": body,
                "locations": locations,
                "streets": sorted({l["street"] for l in locations}),
                "amounts": [a.replace(",", "") for a in amounts[:6]],
                "ayes": ayes[:15],
                "noes": noes[:15],
            }

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "decisions.jsonl")
    n = 0
    with open(out, "a") as f:
        for ident in sys.argv[1:]:
            c = 0
            for d in decisions(ident):
                f.write(json.dumps(d) + "\n"); c += 1; n += 1
            print(f"{ident}: {c} decisions", flush=True)
    print(f"total {n} -> {out}")
