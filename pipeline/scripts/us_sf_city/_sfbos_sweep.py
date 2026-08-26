"""ONE walk of the Board's own minute PDFs. Both consumers import it.

`fetch_sfbos_minutes.py --extract` writes the map's corpus and
`sweep_sfbos_all.py --sweep` writes the full database. They used to carry two
copies of the same page walk, kept in step by hand and proved equal after the
fact. The walk is here now, once, so they cannot drift.

THE CLERK'S TYPOGRAPHY, MEASURED RATHER THAN ASSUMED
----------------------------------------------------
A legislative file is printed as its number, a bracketed title, and then the
item's body indented underneath:

    201018 [Concurring in Actions to Meet Local Emergency - Coronavirus
            Response - Twenty-Sixth Supplement]
            Motion concurring in actions taken by the Mayor ...
    201019 [Findings Reversing the Community Plan Evaluation - 2300 Harrison Street]
            Motion adopting findings to reverse the determination ...

**The header sits ABOVE the item it introduces, and never anywhere else.** That
is not a guess: `NNNNNN [` occurs 24,624 times in the 390 PDFs and in every one
of them the match is alone at the start of its line — 24,622 at the hard left
margin and 2 indented. **Zero occur mid-line.** So a file number followed by a
bracket is a header, always, and never an inline reference in prose. (A bare
`\\d{6}` sweep is a different and worse instrument: it also finds 542 Superior
Court case numbers, `Case No. CGC-20-584260`.)

The match is made on `ex.clean()`ed text, not on the raw text, and that is
deliberate: two of the corpus's headers are indented rather than flush left, so
a line-anchored regex over raw text silently misses them. Cleaning is checked
not to move the set — over all 10,778 pages the cleaned text yields exactly the
same header list as the raw text does, once the raw test stops assuming the left
margin.

TWO CONSEQUENCES, AND THE SPLITTER GETS BOTH WRONG
--------------------------------------------------
`ex.ITEM` cuts a page at every `Resolution|Ordinance|Motion` word, so a chunk
runs from one such word to the next — straight through the header printed in
between.

**1. HEADER BLEED (`trim_headers`).** An item's chunk ends with the *next*
file's header, and every street named inside that header is read as this item's
own. The single COVID emergency motion the map carries is drawn on **2300
Harrison Street** because 201019's header bled into 201018's chunk. Measured
over the published stream: **2,025 of 6,786 placed rows (29.8%) place on at
least one street that belongs to another decision, and 1,829 (27.0%) place on
nothing else.** An item therefore ends where the next file's header begins, and
the body is cut there.

The length gate stays on the UNTRIMMED chunk, exactly where it was, because the
per-meeting item counter `i` increments behind it and `i` is a published field:
trimming must not renumber the items around it.

**2. FILES THAT CAN NEVER BECOME ITEMS (`emit_orphans`).** A legislative file
whose body uses none of those three words is invisible to every stage, however
plainly the Clerk printed it — 505 distinct files, of which **418 are Hearings**:
contested CEQA and land-use appeals, with addresses, which is where the public
objects. They are recovered WITHOUT adding a word to the splitter's vocabulary
and WITHOUT inventing a boundary: the span is header to next header, both of
them printed by the Clerk. A span that already contains a
`Resolution|Ordinance|Motion` mark is left alone, because the ordinary walk has
already made an item there.

Their `i` continues after the meeting's last ordinary item, so every existing
`i` keeps the value it was published with.
"""
from __future__ import annotations

import importlib.util
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
MIN = REPO / "pipeline" / "minutes"

BASE = "https://sfbos.org/sites/default/files"

# the twelve fields the merged block index reads, in the order this stream has
# always serialised them
CANON = ("v", "y", "n", "i", "k", "dt", "t", "m", "r", "src", "url", "page")


def _load(path: pathlib.Path, name: str):
    sp = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(sp)
    sys.modules[name] = m
    sp.loader.exec_module(m)
    return m


ex = _load(MIN / "extract.py", "ex_sfbos_sweep")
gz = _load(MIN / "gazetteer.py", "gz_sfbos_sweep")

# identical to the STYPE both callers used to define for themselves
STYPE = re.compile(r"\s+(Street|Avenue|Boulevard|Road|Way|Drive|Place|Terrace|"
                   r"Alley|Lane|Court|Park|Plaza|Square|Highway|Circle|Path|Walk)$",
                   re.I)

# a file header: six digits, then a bracket. See the module docstring for the
# measurement that says this shape is the header and nothing else is.
HEADER = re.compile(r"(?<!\d)(\d{6})(?!\d)\s*\[")
FILENO = HEADER
TITLED = re.compile(r"(?<!\d)(\d{6})(?!\d)\s*\[([^\]]{0,400})\]")

# the Clerk's own first word for the form, read off the bracketed title. Nothing
# else about an orphan row's kind is inferred.
HEARING_TITLE = re.compile(r"\s*(?:Public\s+)?Hearings?\b", re.I)

# ---------------------------------------------------------------- form
# WHAT A CHUNK IS, read off the Clerk's own typography, not guessed at.
#
#   title      "Resolution authorizing the Mayor to accept ..."
#              the item's OWN WORDS. Always a gerund (or "of Intention",
#              or "that the Board") straight after the opening word.
#   stamp      "Resolution No. 293-21 ADOPTED by the following vote"
#              the numbered record that a titled item was disposed of.
#   fragment   "Ordinance be CONTINUED ON FINAL PASSAGE to ..."
#              the splitter cut mid-sentence: the words belong to the chunk before.
#   template   "Resolution may be introduced before the Board ..."
#              the PDF template's own explanatory text, printed every meeting.
#   file       "161146 [Hearing - Appeal of Determination ...] Hearing of persons
#              interested in or objecting to ..."
#              a legislative file the splitter's vocabulary cannot see at all,
#              delimited by the two headers the Clerk printed around it.
TEMPL = re.compile(r"^(?:Resolution|Ordinance|Motion)s?[,.]?\s+(?:may be|as defined|"
                   r"shall be considered)", re.I)
STAMP = re.compile(r"^(?:Resolution|Ordinance|Motion)s?\s+No[.s]", re.I)
TITLE = re.compile(r"^(?:Resolution|Ordinance|Motion)\s+"
                   r"(?:\w+ly\s+)?(?:\w+ing\b|of\s+Intention\b|that\s+th)", re.I)
ADJOURN = re.compile(r"that the Board adjourn|\bADJOURNMENT\b|"
                     r"there being no further business|meeting adjourned", re.I)
ROLL = re.compile(r"On the call of the roll|\bROLL CALL\b|The Clerk called the roll|"
                  r"noted present|a quorum", re.I)

SPEAKER = re.compile(r"(?:^|[.)\]]\s)[A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+){0,3}"
                     r";\s*(?:expressed|spoke|shared|urged|requested|stated|presented|"
                     r"raised|voiced|thanked|commented|provided|asked|questioned)\b")

# What the Board DID with it. Metadata, never a substance verdict.
DISP = [
    ("not-adopted", re.compile(r"\bNOT ADOPTED\b|\bFAILED\b|\bDISAPPROVED\b")),
    ("tabled", re.compile(r"\bTABLED\b")),
    ("continued", re.compile(r"\bCONTINUED ON\b|\bbe CONTINUED\b|\bCONTINUED to\b")),
    ("referred", re.compile(r"RECEIVED AND ASSIGNED to|\bRE-?REFERRED\b|"
                            r"REFERRED to the|ASSIGNED UNDER 30 DAY RULE")),
    ("amended", re.compile(r"\bbe AMENDED\b|\bADOPTED AS AMENDED\b|\bAMENDED,\b")),
    ("passed", re.compile(r"\bFINALLY PASSED\b|\bPASSED ON FIRST READING\b")),
    ("adopted", re.compile(r"\bADOPTED\b|\bAPPROVED\b")),
    ("filed", re.compile(r"RECEIVED AND FILED|\bFILED\b")),
    ("voted", re.compile(r"by the following vote|The motion carried by")),
]
FORMS = ("title", "stamp", "fragment", "template", "rollcall", "adjournment", "file")


def form_of(t: str) -> str:
    if TEMPL.match(t):
        return "template"
    if STAMP.match(t):
        return "stamp"
    head = t[:140]
    if ADJOURN.search(head):
        return "adjournment"
    if ROLL.search(head):
        return "rollcall"
    if TITLE.match(t):
        return "title"
    return "fragment"


def disp_of(t: str) -> str:
    for name, rx in DISP:
        if rx.search(t):
            return name
    return ""


def resolve_streets(body: str, gaz, keys):
    """The gazetteer join, byte-identical to what both callers used to run.

    Returns (resolved, refused, named_any) — `named_any` is whether the text
    contained a street-SHAPED phrase at all, which is what separates "names no
    place" from "we could not resolve the place it named".
    """
    locs = ex.locations_from(body)
    offs, used = {}, set()
    for m2 in ex.STREET.finditer(body):
        nm = re.sub(r"^(?:On|At|In|To|From|Along|Near|Upon)\s+", "",
                    m2.group("name").strip())
        k2 = (f"{nm} {m2.group('type').rstrip('s').title()}", m2.group("num"))
        if k2 not in used:
            used.add(k2)
            offs[k2] = m2.start()
    res, un = [], []
    for L in locs:
        mt = STYPE.search(L["street"])
        hit, how = gz.resolve(STYPE.sub("", L["street"]), gaz, keys)
        if how == "unresolved":
            un.append(L["street"])
            continue
        res.append({"s": gz.norm(hit), "d": hit, "a": L["number"],
                    "x": 1 if L["cross_of"] else 0, "h": how,
                    "ty": mt.group(1) if mt else "",
                    "o": offs.get((L["street"], L["number"]), 0)})
    return res, un, bool(locs)


def _row(stem, day, pno, seq, body, gaz, keys, kind, hf="", ht=""):
    res, un, named = resolve_streets(body, gaz, keys)
    pl = "placed" if res else ("unresolved" if named else "none")
    return {
        "v": f"sfbos:{stem}", "y": int(day[:4]), "n": pno,
        "i": seq, "k": kind, "dt": day, "t": body,
        "m": [x.replace(",", "") for x in ex.MONEY.findall(body)[:6]],
        "r": res,
        "src": "sfbos",
        "url": f"{BASE}/{stem}_minutes.pdf",
        "page": pno + 1,
        # additive, and never read by the block index
        "pl": pl,
        "pk": "file" if kind in ("H", "F") else form_of(body),
        "disp": disp_of(body),
        "sp": 1 if SPEAKER.search(body) else 0,
        "un": sorted(set(un)),
        "fn": sorted(set(FILENO.findall(body))),
        # THE FILE THIS TEXT WAS PRINTED UNDER, and it is not the same thing as
        # `fn`. `fn` is a number the item's OWN words contain; before the header
        # trim it was almost always the NEXT file's, which is why 9,868 files
        # looked "carried by an item" and only 932 really were. `hf` is the
        # header the Clerk printed immediately above this text — the file the
        # text belongs to — carried as metadata so the join survives without the
        # header's words, or its streets, being merged into the item.
        "hf": hf,
        "ht": ht,
    }


def read_pdf(path: pathlib.Path) -> list[str] | None:
    """The pages of one meeting, or None when the PDF carries no text layer.

    `-layout` keeps the minute's column structure, which is what keeps an item's
    own address on the same line as the item.
    """
    txt = subprocess.run(["pdftotext", "-layout", str(path), "-"],
                         capture_output=True).stdout.decode("utf8", "replace")
    if len(re.sub(r"\s", "", txt)) < 400:
        return None
    return txt.split("\f")


def sweep_meeting(stem: str, day: str, path: pathlib.Path, gaz, keys, *,
                  trim_headers: bool = True, emit_orphans: bool = True,
                  counters=None):
    """Every row one meeting yields, in page order, ordinary items first.

    `trim_headers=False, emit_orphans=False` reproduces the walk exactly as it
    stood before either fix, which is what makes both of them provable rather
    than merely plausible.
    """
    c = counters if counters is not None else {}

    def bump(k, n=1):
        c[k] = c.get(k, 0) + n

    pages = read_pdf(path)
    if pages is None:
        bump("pdf with no text layer")
        return []
    bump("pdfs read")
    rows, orphan_spans, seq = [], [], 0
    for pno, raw in enumerate(pages):
        text = ex.clean(raw)
        bump("chars_after_clean", len(text))
        if len(text) < 60:
            bump("page too short to split")
            continue
        bump("pages split")
        marks = [mk.start() for mk in ex.ITEM.finditer(text)]
        hmatch = list(HEADER.finditer(text))
        heads = [mk.start() for mk in hmatch]
        # the header a position sits under: the last one printed above it
        def under(pos):
            j = -1
            for q, h in enumerate(heads):
                if h <= pos:
                    j = q
                else:
                    break
            if j < 0:
                return "", ""
            mt = TITLED.match(text, heads[j])
            return hmatch[j].group(1), (mt.group(2).strip() if mt else "")
        if marks:
            bump("chars_inside_an_item_chunk", len(text) - marks[0])
        else:
            bump("page with no Resolution/Ordinance/Motion mark")
        for a, b in zip(marks, marks[1:] + [len(text)]):
            body = text[a:b]
            # THE GATE STAYS ON THE UNTRIMMED CHUNK. `seq` increments behind it
            # and `seq` is the published `i`.
            if len(body) < 60:
                bump("chunk < 60 chars (dropped by the splitter)")
                continue
            if len(body) > 3000:
                bump("chunk > 3000 chars (dropped by the splitter)")
                continue
            seq += 1
            bump("items")
            if trim_headers:
                cut = next((h - a for h in heads if a < h < b), None)
                if cut is not None:
                    trimmed = body[:cut].rstrip()
                    bump("chunk trimmed at the next file's header")
                    bump("chars trimmed off as another file's header",
                         len(body) - len(trimmed))
                    body = trimmed
            # the chunk opens ON its mark and the trim only ever cuts to its
            # right, so the kind is read off the same word it always was
            mk = ex.ITEM.search(body)
            hf, ht = under(a)
            rows.append(_row(stem, day, pno, seq, body, gaz, keys,
                             mk.group(1)[0] if mk else "?", hf, ht))
        if emit_orphans:
            for j, h in enumerate(heads):
                end = heads[j + 1] if j + 1 < len(heads) else len(text)
                if any(h <= m < end for m in marks):
                    bump("file header whose span already yields an item")
                    continue
                span = text[h:end].rstrip()
                if len(span) < 60 or len(span) > 3000:
                    bump("file header whose span fails the 60..3000 gate")
                    continue
                orphan_spans.append((pno, span))
    # AFTER the ordinary walk, so every published `i` keeps its value.
    for pno, span in orphan_spans:
        seq += 1
        bump("items")
        bump("items from a file header the splitter cannot see")
        mt = TITLED.match(span)
        title = mt.group(2).strip() if mt else ""
        kind = "H" if HEARING_TITLE.match(title.split(" - ")[0]) else "F"
        bump(f"orphan kind {kind}")
        rows.append(_row(stem, day, pno, seq, span, gaz, keys, kind,
                         HEADER.match(span).group(1), title))
    return rows


def sfbos_gate(rows, echo=print) -> None:
    """Prove every row can be turned back into a link that opens.

    Raises rather than warns: an unplaced item still needs a link that opens,
    and a dead link under a real decision is worse than no link.
    """
    bad_u = bad_p = 0
    first = None
    for r in rows:
        stem = r["v"].split(":", 1)[1]
        if r["url"] != f"{BASE}/{stem}_minutes.pdf":
            bad_u += 1
            first = first or ("url", r["v"], r["i"], r["url"])
        if r["page"] != r["n"] + 1:
            bad_p += 1
            first = first or ("page", r["v"], r["i"], r["page"], r["n"])
    n = len(rows)
    echo(f"  sfbos_gate  url  == PREFIX + stem + '_minutes.pdf'   {n - bad_u:,} / {n:,}")
    echo(f"  sfbos_gate  page == n + 1                            {n - bad_p:,} / {n:,}")
    if bad_u or bad_p:
        raise SystemExit(
            f"REFUSED: sfbos_gate failed ({bad_u} url, {bad_p} page). First: {first}")
