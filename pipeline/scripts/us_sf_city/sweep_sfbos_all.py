"""EVERY item the Board's own PDFs contain — placement as an ATTRIBUTE, not a gate.

WHAT THIS FIXES, AND IT IS A SCOPING DECISION THAT BECAME A DECISION ABOUT WHAT
THE DATABASE IS
-------------------------------------------------------------------------------
`fetch_sfbos_minutes.py --extract` writes a row only when an item resolves to a
street. Two `continue`s do it:

    locs = ex.locations_from(body)
    ...
    if not locs: continue        # the item names no street-shaped phrase
    ...
    if not res:  continue        # it named one and the gazetteer refused it

That filter was built to serve the MAP — a decision the map cannot pin is a
decision the map cannot draw — and its consequence is that everything the Board
did to the WHOLE CITY was discarded at the door. Measured: all 6,786 rows in
`cache_sfbos/items.jsonl` carry a non-empty `r` and none do not; 18 of the 390
meetings on disk contribute no row at all; the budget, the emergency
proclamations and the eviction moratoria are not in the file.

This re-sweeps the same 390 PDFs through the same extractor and keeps every
item, tagging each with WHETHER it placed and, when it did not, WHICH of three
different things happened. Those three are not one thing and are never summed:

    pl = "placed"      at least one street the DataSF gazetteer knows
    pl = "unresolved"  it named a street-shaped phrase and the gazetteer refused
                       -- a FAILURE of ours, and `un` lists the exact phrases
    pl = "none"        it named no place at all
                       -- of which the interesting half is citywide business and
                          the rest is procedure, separated by `pk`, never lumped

`pk` is orthogonal to `pl` on purpose. A vote record can name a street and a
citywide ordinance can be procedural-free; collapsing the two into one label
would hide exactly the population this exists to expose.

THE PARITY GATE — THE MAP KEEPS EXACTLY WHAT IT HAS
----------------------------------------------------
`--verify` projects every row of the new stream that has a non-empty `r` onto
the twelve canonical fields, in their original order, and compares the result
BYTE FOR BYTE, line for line, against `cache_sfbos/items.jsonl`. Not a count, not
a checksum of a sorted set: the same lines in the same order. If one byte of the
placed subset moves, this refuses and names the row. The published block index is
built from those rows and `91de7fa0`/`1f56663a` are live.

`sfbos_gate()` from the merge is re-asserted here over EVERY row, placed or not:

    url  == "https://sfbos.org/sites/default/files/" + <stem> + "_minutes.pdf"
    page == n + 1

An unplaced item still needs a citation that opens. A dead link under a real
decision is worse than no link.

Usage:
    python3 sweep_sfbos_all.py --sweep      read the 390 PDFs -> items_all.jsonl
    python3 sweep_sfbos_all.py --relabel    recompute pl/pk/fn from the cache
    python3 sweep_sfbos_all.py --verify     parity gate + sfbos_gate
    python3 sweep_sfbos_all.py --report     the measurements
    python3 sweep_sfbos_all.py --files      file numbers found vs items carried
    python3 sweep_sfbos_all.py --pool       one row per legislative file (a POOL)
    python3 sweep_sfbos_all.py --bleed      placed rows pinned to the NEXT file's address
    python3 sweep_sfbos_all.py --sample     read labelled items, for judging cues
"""
from __future__ import annotations

import argparse
import collections
import importlib.util
import json
import pathlib
import random
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent.parent
MIN = REPO / "pipeline" / "minutes"
CACHE = HERE / "cache_sfbos"
PDFS = CACHE / "pdf"
CAL = CACHE / "calendar.json"
PLACED = CACHE / "items.jsonl"          # what the map is built from today
ALL = CACHE / "items_all.jsonl"         # what this writes
META = CACHE / "items_all.meta.json"

BASE = "https://sfbos.org/sites/default/files"

# the twelve fields the merged block index reads, in the order the existing
# stream serialises them. The parity gate compares this projection and nothing
# else, because these are the bytes that reach the map.
CANON = ("v", "y", "n", "i", "k", "dt", "t", "m", "r", "src", "url", "page")


def _load(path: pathlib.Path, name: str):
    sp = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(sp)
    sys.modules[name] = m
    sp.loader.exec_module(m)
    return m


ex = _load(MIN / "extract.py", "ex_all")
gz = _load(MIN / "gazetteer.py", "gz_all")

# identical to fetch_sfbos_minutes.do_extract's local STYPE
STYPE = re.compile(r"\s+(Street|Avenue|Boulevard|Road|Way|Drive|Place|Terrace|"
                   r"Alley|Lane|Court|Park|Plaza|Square|Highway|Circle|Path|Walk)$",
                   re.I)

# The Clerk prints a legislative file as six digits then a bracketed title:
#     160576 [Settlement of Lawsuits - Justice Operating Co. LLC ...]
# THE TRAP, AND IT FIRED: a bare \d{6} sweep over the corpus finds 12,593
# distinct tokens, and 476 of them are not file numbers at all -- Superior Court
# case numbers (`Case No. CGC-20-584260`) contribute every 5xxxxx and 6xxxxx.
# So a file number is recognised by the shape the Clerk actually prints, never
# by its digit count alone.
FILENO = re.compile(r"(?<!\d)(\d{6})(?!\d)\s*\[")
TITLED = re.compile(r"(?<!\d)(\d{6})(?!\d)\s*\[([^\]]{0,400})\]")
FILEREF = re.compile(r"File Nos?\.\s*(?:and\s*)?((?:\d{6}[,;\s]*(?:and\s*)?)+)")

# ---------------------------------------------------------------- form
# WHAT A CHUNK IS, read off the Clerk's own typography, not guessed at.
#
# The splitter cuts a page at every Resolution|Ordinance|Motion word, so a chunk
# is not automatically an item. Four shapes account for 98.5% of them and the
# Clerk writes each one the same way every time:
#
#   title      "Resolution authorizing the Mayor to accept ..."      24,541
#              the item's OWN WORDS. Always a gerund (or "of Intention",
#              or "that the Board") straight after the opening word.
#   stamp      "Resolution No. 293-21 ADOPTED by the following vote"  10,535
#              the numbered record that a titled item was disposed of. Its
#              substance is the title printed with it or elsewhere in the meeting.
#   fragment   "Ordinance be CONTINUED ON FINAL PASSAGE to ..."        6,410
#              the splitter cut mid-sentence: the words belong to the chunk before.
#   template   "Resolution may be introduced before the Board ..."       868
#              the PDF template's own explanatory text, printed every meeting.
#
# A REFERRAL IS NOT PROCEDURAL AND THE BRIEF'S EXAMPLE IS WRONG HERE. Measured:
# 5,105 chunks carry "RECEIVED AND ASSIGNED to <committee>" and 6,982 carry some
# referral wording, and the referral is a stamp on the END of a fully-titled new
# ordinance --
#   "Ordinance ... requesting the Department of Building Inspection and the Office
#    of Economic and Workforce Development to report. 06/13/17; RECEIVED AND
#    ASSIGNED to Land Use"
# -- so calling those items procedural would throw away the day's new legislation.
# Disposition is therefore recorded SEPARATELY, in `disp`, as metadata about what
# the Board DID with an item, never as a verdict on whether the item has substance.
TEMPL = re.compile(r"^(?:Resolution|Ordinance|Motion)s?[,.]?\s+(?:may be|as defined|"
                   r"shall be considered)", re.I)
STAMP = re.compile(r"^(?:Resolution|Ordinance|Motion)s?\s+No[.s]", re.I)
TITLE = re.compile(r"^(?:Resolution|Ordinance|Motion)\s+"
                   r"(?:\w+ly\s+)?(?:\w+ing\b|of\s+Intention\b|that\s+th)", re.I)
ADJOURN = re.compile(r"that the Board adjourn|\bADJOURNMENT\b|"
                     r"there being no further business|meeting adjourned", re.I)
ROLL = re.compile(r"On the call of the roll|\bROLL CALL\b|The Clerk called the roll|"
                  r"noted present|a quorum", re.I)

# One line PER SPEAKER underneath an item, which is how the modern minutes record
# public comment. It repeats the item's title once per person, so 1,7xx chunks are
# re-prints of a title already counted. `sp` flags them; it does not reclassify
# them, because the title they repeat is real.
SPEAKER = re.compile(r"(?:^|[.)\]]\s)[A-Z][A-Za-z.'\u2019-]+(?:\s+[A-Z][A-Za-z.'\u2019-]+){0,3}"
                     r";\s*(?:expressed|spoke|shared|urged|requested|stated|presented|"
                     r"raised|voiced|thanked|commented|provided|asked|questioned)\b")

# What the Board DID with it. Metadata, never a substance verdict. Ordered so the
# most specific disposition wins.
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
FORMS = ("title", "stamp", "fragment", "template", "rollcall", "adjournment")


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


def sfbos_gate(rows) -> None:
    """The citation shape is an invariant this PROVES, over every row, placed or
    not. Raises rather than warns: an unplaced item still needs a link that
    opens, and a dead link under a real decision is worse than no link."""
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
    print(f"  sfbos_gate  url  == PREFIX + stem + '_minutes.pdf'   "
          f"{n - bad_u:,} / {n:,}")
    print(f"  sfbos_gate  page == n + 1                            "
          f"{n - bad_p:,} / {n:,}")
    if bad_u or bad_p:
        sys.exit(f"REFUSED: sfbos_gate failed ({bad_u} url, {bad_p} page). First: {first}")


# ---------------------------------------------------------------- sweep
def do_sweep() -> None:
    gaz = gz.build()
    keys = list(gaz)
    print(f"  gazetteer: {len(gaz)} real SF streets")
    cal = json.loads(CAL.read_text())
    todo = [(k, v["stem"]) for k, v in sorted(cal.items()) if v["minutes"]]
    print(f"  {len(todo)} meetings with published minutes")

    m = collections.Counter()
    per_meeting: dict[str, dict] = {}
    n_chars_total = n_chars_in_items = 0
    with open(ALL, "w") as w:
        for j, (day, stem) in enumerate(todo, 1):
            f = PDFS / f"{stem}_minutes.pdf"
            if not f.exists():
                m["pdf missing on disk"] += 1
                continue
            m["pdfs read"] += 1
            txt = subprocess.run(["pdftotext", "-layout", str(f), "-"],
                                 capture_output=True).stdout.decode("utf8", "replace")
            pages = txt.split("\f")
            if len(re.sub(r"\s", "", txt)) < 400:
                m["pdf with no text layer"] += 1
                continue
            seq = 0
            mm_stats = collections.Counter()
            for pno, raw in enumerate(pages):
                text = ex.clean(raw)
                n_chars_total += len(text)
                if len(text) < 60:
                    m["page too short to split"] += 1
                    continue
                m["pages split"] += 1
                marks = [mk.start() for mk in ex.ITEM.finditer(text)]
                if not marks:
                    m["page with no Resolution/Ordinance/Motion mark"] += 1
                    continue
                n_chars_in_items += len(text) - marks[0]
                for a, b in zip(marks, marks[1:] + [len(text)]):
                    body = text[a:b]
                    if len(body) < 60:
                        m["chunk < 60 chars (dropped by the splitter)"] += 1
                        continue
                    if len(body) > 3000:
                        m["chunk > 3000 chars (dropped by the splitter)"] += 1
                        continue
                    # ---- from here the walk is IDENTICAL to do_extract's, and
                    # `seq` increments exactly where it did, so `i` is unchanged
                    locs = ex.locations_from(body)
                    seq += 1
                    m["items"] += 1
                    offs, used = {}, set()
                    for m2 in ex.STREET.finditer(body):
                        nm = re.sub(r"^(?:On|At|In|To|From|Along|Near|Upon)\s+", "",
                                    m2.group("name").strip())
                        k2 = (f"{nm} {m2.group('type').rstrip('s').title()}",
                              m2.group("num"))
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
                    mk = ex.ITEM.search(body)
                    pl = "placed" if res else ("unresolved" if locs else "none")
                    m[f"pl={pl}"] += 1
                    mm_stats[pl] += 1
                    row = {
                        "v": f"sfbos:{stem}", "y": int(day[:4]), "n": pno,
                        "i": seq, "k": mk.group(1)[0] if mk else "?",
                        "dt": day, "t": body,
                        "m": [x.replace(",", "") for x in ex.MONEY.findall(body)[:6]],
                        "r": res,
                        "src": "sfbos",
                        "url": f"{BASE}/{stem}_minutes.pdf",
                        "page": pno + 1,
                        # ---- everything below is NEW and additive. The twelve
                        # fields above are byte-identical to the placed stream.
                        "pl": pl,
                        "pk": form_of(body),
                        "disp": disp_of(body),
                        "sp": 1 if SPEAKER.search(body) else 0,
                        "un": sorted(set(un)),
                        "fn": sorted(set(FILENO.findall(body))),
                    }
                    w.write(json.dumps(row) + "\n")
            per_meeting[stem] = {"dt": day, "items": seq, **dict(mm_stats)}
            if j % 50 == 0:
                print(f"    … {j}/{len(todo)}  {m['items']:,} items", flush=True)

    META.write_text(json.dumps({
        "counters": dict(m),
        "chars_after_clean": n_chars_total,
        "chars_inside_an_item_chunk": n_chars_in_items,
        "per_meeting": per_meeting,
    }, indent=1))
    print(f"\n  {m['pdfs read']} PDFs read, {m['pages split']:,} pages split")
    print(f"  {m['items']:,} items kept  "
          f"(placed {m['pl=placed']:,} / unresolved {m['pl=unresolved']:,} / "
          f"no place {m['pl=none']:,})")
    print(f"  -> {ALL.relative_to(REPO)}")
    print(f"  -> {META.relative_to(REPO)}")


def do_relabel() -> None:
    """Recompute pl/pk/fn from the cached text. Never touches the twelve."""
    rows = [json.loads(l) for l in open(ALL)]
    for r in rows:
        r["pk"] = form_of(r["t"])
        r["disp"] = disp_of(r["t"])
        r["sp"] = 1 if SPEAKER.search(r["t"]) else 0
        r["fn"] = sorted(set(FILENO.findall(r["t"])))
    with open(ALL, "w") as w:
        for r in rows:
            w.write(json.dumps(r) + "\n")
    print(f"  relabelled {len(rows):,} rows")


# ---------------------------------------------------------------- gates
def do_verify() -> None:
    old = [l.rstrip("\n") for l in open(PLACED) if l.strip()]
    new_all = [json.loads(l) for l in open(ALL)]
    new_placed = [json.dumps({k: r[k] for k in CANON}) for r in new_all if r["r"]]
    print(f"  published placed stream : {len(old):,} rows")
    print(f"  re-swept, r non-empty   : {len(new_placed):,} rows")
    if len(old) != len(new_placed):
        sys.exit(f"REFUSED: placed subset changed size {len(old)} -> {len(new_placed)}")
    diff = [i for i, (a, b) in enumerate(zip(old, new_placed)) if a != b]
    if diff:
        i = diff[0]
        print(f"    FIRST DIFF at line {i}\n      was: {old[i][:300]}\n      now: {new_placed[i][:300]}")
        sys.exit(f"REFUSED: {len(diff)} placed rows differ. The map would move.")
    print(f"  PARITY PASS: all {len(old):,} placed rows byte-identical, "
          f"line for line, in order")
    sfbos_gate(new_all)
    # every row also has to name a PDF that exists and a page inside it
    stems = {p.stem.replace("_minutes", "") for p in PDFS.glob("*.pdf")}
    miss = {r["v"].split(":", 1)[1] for r in new_all} - stems
    if miss:
        sys.exit(f"REFUSED: {len(miss)} rows cite a PDF not on disk: {sorted(miss)[:5]}")
    print(f"  every cited stem is a PDF on disk                     "
          f"{len(stems)} / {len(stems)}")
    import fitz
    npg = {}
    over = 0
    for stem in sorted({r["v"].split(":", 1)[1] for r in new_all}):
        d = fitz.open(str(PDFS / f"{stem}_minutes.pdf"))
        npg[stem] = d.page_count
        d.close()
    for r in new_all:
        if r["page"] > npg[r["v"].split(":", 1)[1]]:
            over += 1
    print(f"  every cited page is inside its file                   "
          f"{len(new_all) - over:,} / {len(new_all):,}")
    if over:
        sys.exit(f"REFUSED: {over} rows cite a page past the end of their PDF")


# ---------------------------------------------------------------- report
def _rows():
    return [json.loads(l) for l in open(ALL)]


# ONE STRING PER TOPIC, and the string is printed beside every number it
# produces. A compound pattern makes a count that cannot be checked, and the
# point of this table is that someone can check it.
#
# THE MEETING COLUMN IS COUNTED OVER THE WHOLE PDF, whitespace-normalised, and
# that second word is load-bearing: `pdftotext` wraps "Proclamation of
# Emergency" across a line break in half its occurrences, so a regex over raw
# text finds it in 25 meetings and the same regex over normalised text finds it
# in 52. A search that cannot see a thing reports its absence in the same words
# as its absence -- which is the bug this whole script exists to fix, and it is
# available one level up too.
TOPICS = [
    ("budget", r"\bbudget\b"),
    ("police", r"\bpolice\b"),
    ("homelessness", r"homeless"),
    ("COVID", r"COVID"),
    ("eviction", r"eviction"),
    ('"Proclamation of Emergency"', r"Proclamation of Emergency"),
]


def _meeting_texts() -> dict:
    out = {}
    for p in sorted(PDFS.glob("*.pdf")):
        t = subprocess.run(["pdftotext", "-layout", str(p), "-"],
                           capture_output=True).stdout.decode("utf8", "replace")
        out[p.stem.replace("_minutes", "")] = ex.clean(t)
    return out


def do_report() -> None:
    rows = _rows()
    meta = json.loads(META.read_text())
    c = meta["counters"]
    n = len(rows)
    old = sum(1 for _ in open(PLACED))
    print(f"\n{'=' * 74}\nTHE CORPUS\n{'=' * 74}")
    print(f"  meeting PDFs on disk                      {c['pdfs read']:>10,}")
    print(f"  pages split                               {c['pages split']:>10,}")
    print(f"  items the FULL sweep keeps                {n:>10,}")
    print(f"  items the map's sweep kept                {old:>10,}   "
          f"{100 * old / n:.1f}%")
    print(f"  items it discarded at the door            {n - old:>10,}   "
          f"{100 * (n - old) / n:.1f}%")
    print(f"\n  chunks the splitter itself drops (not items, counted not hidden)")
    for k in ("chunk < 60 chars (dropped by the splitter)",
              "chunk > 3000 chars (dropped by the splitter)",
              "page too short to split",
              "page with no Resolution/Ordinance/Motion mark"):
        print(f"    {k:<52} {c.get(k, 0):>8,}")
    cov = 100 * meta["chars_inside_an_item_chunk"] / max(1, meta["chars_after_clean"])
    print(f"    characters that fall inside an item chunk    {cov:>8.1f}%")

    print(f"\n{'=' * 74}\nDOES IT PLACE — three things, never summed\n{'=' * 74}")
    pl = collections.Counter(r["pl"] for r in rows)
    for k, lbl in (("placed", "PLACED       a street the gazetteer knows"),
                   ("unresolved", "UNRESOLVED   named a street-shaped phrase, refused"),
                   ("none", "NO PLACE     names no place at all")):
        print(f"  {lbl:<50} {pl[k]:>8,}  {100 * pl[k] / n:>5.1f}%")
    print(f"\n{'=' * 74}\nWHAT A CHUNK IS — the form the Clerk printed it in\n{'=' * 74}")
    pk = collections.Counter(r["pk"] for r in rows)
    for k in FORMS:
        print(f"  {k:<14} {pk[k]:>8,}  {100 * pk[k] / n:>5.1f}%")
    nsp = sum(1 for r in rows if r["sp"])
    print(f"  {'(carries a public-comment speaker line)':<38} {nsp:>7,}"
          f"  {100 * nsp / n:>5.1f}%")

    print(f"\n{'=' * 74}\nTHE HONEST TAXONOMY OF WHAT DOES NOT PLACE\n{'=' * 74}")
    print(f"  the {n - pl['placed']:,} items the map cannot draw are FOUR different")
    print(f"  things and they are never summed into one number:\n")
    proc = [r for r in rows if r["pl"] != "placed" and r["pk"] in
            ("stamp", "template", "rollcall", "adjournment")]
    frag = [r for r in rows if r["pl"] != "placed" and r["pk"] == "fragment"]
    unre = [r for r in rows if r["pl"] == "unresolved" and r["pk"] not in
            ("stamp", "template", "rollcall", "adjournment", "fragment")]
    city = [r for r in rows if r["pl"] == "none" and r["pk"] == "title"]
    tot_un = n - pl["placed"]
    for lbl, sub, note in (
        ("CITYWIDE BY NATURE", city,
         "the item's own title, no place named. The prize."),
        ("PROCEDURAL", proc,
         "numbered disposition stamps, template text, roll calls, adjournments"),
        ("SPLITTER FRAGMENT", frag,
         "the cut fell mid-sentence; the words belong to the chunk before"),
        ("NAMES A PLACE WE CANNOT RESOLVE", unre,
         "a titled item naming a street-shaped phrase the gazetteer refused"),
    ):
        print(f"  {lbl:<34}{len(sub):>8,}  {100 * len(sub) / tot_un:>5.1f}%")
        print(f"    {note}")
    chk = len(city) + len(proc) + len(frag) + len(unre)
    assert chk == tot_un, f"taxonomy is not a partition: {chk} != {tot_un}"
    print(f"\n  {chk:,} = {tot_un:,}. An EXACT partition, no row counted twice and")
    print(f"  none left over. An unresolved street on a stamp or a fragment is")
    print(f"  counted as the stamp or fragment it is, not as a placement failure.")
    cty_fn = sum(1 for r in city if r["fn"])
    cty_sp = sum(1 for r in city if r["sp"])
    print(f"\n  of the {len(city):,} CITYWIDE items:")
    print(f"    carry a legislative file number       {cty_fn:>8,}"
          f"  {100 * cty_fn / max(1, len(city)):>5.1f}%")
    print(f"    are a public-comment re-print of one  {cty_sp:>8,}"
          f"  {100 * cty_sp / max(1, len(city)):>5.1f}%")
    print(f"    distinct file numbers among them      "
          f"{len({f for r in city for f in r['fn']}):>8,}")

    print(f"\n  WHAT THE BOARD DID WITH IT (disp) — metadata, not a substance verdict")
    dp = collections.Counter(r["disp"] for r in rows)
    for k, v in dp.most_common():
        print(f"    {(k or '(no disposition printed)'):<26} {v:>8,}  {100 * v / n:>5.1f}%")

    print(f"\n  cross-tab: form x placement, rows")
    print(f"    {'':<16}" + "".join(f"{k:>12}" for k in ("placed", "unresolved", "none")))
    for k in FORMS:
        r3 = [sum(1 for r in rows if r["pk"] == k and r["pl"] == p)
              for p in ("placed", "unresolved", "none")]
        print(f"    {k:<16}" + "".join(f"{x:>12,}" for x in r3))

    print(f"\n{'=' * 74}\nTHE STREETS THE GAZETTEER REFUSES — the failure, named\n{'=' * 74}")
    un = collections.Counter(s for r in rows for s in r["un"])
    print(f"  {len(un):,} distinct refused phrases, "
          f"{sum(un.values()):,} mentions, on {pl['unresolved']:,} otherwise-unplaced items")
    for s, k in un.most_common(25):
        print(f"    {k:>6}  {s}")

    print(f"\n{'=' * 74}\nWHAT THE OLD FILTER THREW AWAY — by subject\n{'=' * 74}")
    print(f"  meetings = the whole PDF, whitespace-normalised (390 of them)")
    print(f"  items / on the map = the same string over item text\n")
    texts = _meeting_texts()
    print(f"  {'topic':<28}{'meetings':>9}{'items':>8}{'on map':>8}{'kept':>7}")
    for name, pat in TOPICS:
        rx = re.compile(pat, re.I)
        mtg = sum(1 for t in texts.values() if rx.search(t))
        hit = [r for r in rows if rx.search(r["t"])]
        onmap = sum(1 for r in hit if r["pl"] == "placed")
        print(f"  {name:<28}{mtg:>9}{len(hit):>8,}{onmap:>8,}"
              f"{100 * onmap / max(1, len(hit)):>6.0f}%")

    sup = re.compile(r"Supplement to the Proclamation of Emergency", re.I)
    ordn = re.compile(r"(\w[\w-]*)\s+Supplement to the Proclamation of Emergency", re.I)
    hits = [r for r in rows if sup.search(r["t"])]
    print(f"\n  the emergency proclamations, in one line:")
    print(f"    items naming a Supplement to the Proclamation   {len(hits):>6}")
    print(f"    distinct supplements named                     "
          f"{len({m.group(1).title() for r in hits for m in ordn.finditer(r['t'])}):>6}")
    print(f"    on the map today                               "
          f"{sum(1 for r in hits if r['pl'] == 'placed'):>6}")

    print(f"\n{'=' * 74}\nMEETINGS THE MAP CANNOT SEE AT ALL\n{'=' * 74}")
    placed_v = {r["v"] for r in rows if r["pl"] == "placed"}
    all_v = {r["v"] for r in rows}
    print(f"  meetings with at least one item            {len(all_v):>6}")
    print(f"  meetings with at least one PLACED item     {len(placed_v):>6}")
    print(f"  meetings invisible to the map              {len(all_v - placed_v):>6}")
    for v in sorted(all_v - placed_v):
        d = next(r["dt"] for r in rows if r["v"] == v)
        k = sum(1 for r in rows if r["v"] == v)
        print(f"    {d}  {v:<22} {k:>4} items, none placed")

    by_year = collections.Counter(r["y"] for r in rows)
    by_year_p = collections.Counter(r["y"] for r in rows if r["pl"] == "placed")
    print(f"\n  {'year':>6}{'items':>10}{'placed':>9}{'%':>7}")
    for y in sorted(by_year):
        print(f"  {y:>6}{by_year[y]:>10,}{by_year_p[y]:>9,}"
              f"{100 * by_year_p[y] / by_year[y]:>6.0f}%")


def do_files() -> None:
    """File numbers the corpus PRINTS vs file numbers an ITEM carries.

    A file number appearing in text is not an item, and the gap has one cause
    worth naming out loud: the splitter's vocabulary is Resolution|Ordinance|
    Motion, so a legislative file whose body uses none of those three words can
    never become an item however clearly the Clerk printed it. The largest such
    class is the HEARING -- appeals of CEQA determinations, land-use appeals,
    budget hearings -- printed as

        161146 [Hearing - Appeal of Determination of Exemption From Environmental
                Review - Proposed Project at 2675 Folsom Street]
        Hearing of persons interested in or objecting to the determination ...

    That one names a placeable address, is a real contested decision, and no
    stage of this pipeline has ever seen it. It is a SECOND filter sitting
    upstream of the placement filter this script removes, and removing it is a
    different job.
    """
    rows = _rows()
    corpus: collections.Counter = collections.Counter()
    titles: dict[str, str] = {}
    bare_all: set = set()
    for p in sorted(PDFS.glob("*.pdf")):
        txt = subprocess.run(["pdftotext", "-layout", str(p), "-"],
                             capture_output=True).stdout.decode("utf8", "replace")
        flat = re.sub(r"\s+", " ", txt)
        for f in FILENO.findall(txt):
            corpus[f] += 1
        for m in TITLED.finditer(flat):
            titles.setdefault(m.group(1), m.group(2).strip())
        bare_all |= set(re.findall(r"(?<!\d)(\d{6})(?!\d)", txt))
    in_items: collections.Counter = collections.Counter()
    for r in rows:
        for f in r["fn"]:
            in_items[f] += 1
    placed_files = {f for r in rows if r["pl"] == "placed" for f in r["fn"]}
    print(f"  distinct 6-digit tokens anywhere in the text   {len(bare_all):>8,}")
    print(f"  ...NOT file numbers (Superior Court case nos)  "
          f"{len(bare_all - set(corpus)):>8,}")
    print(f"  distinct FILE NUMBERS (six digits then '[')    {len(corpus):>8,}")
    print(f"  ...with a title short enough to read whole     {len(titles):>8,}")
    print(f"  distinct file numbers carried by an ITEM       {len(in_items):>8,}   "
          f"{100 * len(in_items) / len(corpus):.1f}%")
    print(f"  distinct file numbers on a PLACED item         {len(placed_files):>8,}   "
          f"{100 * len(placed_files) / len(corpus):.1f}%")
    missing = sorted(set(corpus) - set(in_items))
    print(f"  file numbers printed but on NO item            {len(missing):>8,}")

    def head(f):
        return titles.get(f, "?").split(" - ")[0].strip()
    print(f"\n  what the {len(missing):,} orphans ARE, by the first segment of the")
    print(f"  Clerk's own bracketed title:")
    for k, v in collections.Counter(head(f) for f in missing
                                    if f in titles).most_common(15):
        print(f"    {v:>6}  {k}")
    print(f"\n  the same breakdown for file numbers that DO reach an item:")
    for k, v in collections.Counter(head(f) for f in in_items
                                    if f in titles).most_common(8):
        print(f"    {v:>6}  {k}")


# one row per LEGISLATIVE FILE, for judging what a film could be made of.
# THIS IS A POOL AND NOT A SELECTION. Nothing here is ranked, scored or
# recommended; the choosing is Daniel's and is not a pipeline's to do.
def do_pool() -> None:
    rows = _rows()
    best: dict[str, dict] = {}
    for r in rows:
        if r["pk"] != "title" or not r["fn"]:
            continue
        for f in r["fn"]:
            cur = best.get(f)
            # the fullest printing of this file's own title wins; ties by the
            # earliest meeting, so the pool is a function of the corpus and not
            # of the order it was read in
            key = (len(r["t"]), r["dt"] < (cur["dt"] if cur else "9999"))
            if cur is None or len(r["t"]) > len(cur["t"]) or (
                    len(r["t"]) == len(cur["t"]) and r["dt"] < cur["dt"]):
                best[f] = r
    out = CACHE / "film_pool.jsonl"
    with open(out, "w") as w:
        for f in sorted(best):
            r = best[f]
            w.write(json.dumps({
                "file": f, "dt": r["dt"], "y": r["y"], "kind": r["k"],
                "t": r["t"], "money": r["m"], "disp": r["disp"],
                "pl": r["pl"], "streets": [x["d"] for x in r["r"]],
                "refused": r["un"],
                "cite": f"{r['url']}#page={r['page']}",
            }) + "\n")
    n = len(best)
    pl = collections.Counter(best[f]["pl"] for f in best)
    money = sum(1 for f in best if best[f]["m"])
    print(f"  {n:,} legislative files, one row each -> {out.relative_to(REPO)}")
    print(f"    placed {pl['placed']:,} / unresolved {pl['unresolved']:,} / "
          f"no place {pl['none']:,}")
    print(f"    carry a dollar figure {money:,}")
    print(f"    years {min(best[f]['y'] for f in best)}-"
          f"{max(best[f]['y'] for f in best)}, "
          f"{len({best[f]['dt'] for f in best}):,} distinct meetings")
    print("  NOT ranked and NOT selected. The choosing is not a pipeline's job.")


# ---------------------------------------------------------------- bleed
# THE PLACEMENT ITSELF HAS A BUG, AND IT IS NOT THIS SCRIPT'S TO FIX.
#
# The Clerk prints a legislative file as a header ABOVE the item it introduces:
#
#     160248 [Liquor License - 141 Gough Street]
#     Resolution approving a licence transfer ...
#
# The splitter cuts at the Resolution|Ordinance|Motion word, so an item's OWN
# header sits at the tail of the PREVIOUS chunk. Any `NNNNNN [` a title-form
# chunk contains is therefore the NEXT file's header -- and every street named
# inside it belongs to that next file, not to this item.
#
#     Resolution urging the San Francisco Legislative Delegation to work to
#     amend the "By Right Housing Approvals" ...  160248 [Liquor License -
#     141 Gough Street]
#                                      ^ placed on GOUGH STREET
#
# Measured conservatively -- title-form rows only, and only where EVERY street
# the row placed on lies after such a header -- 468 of the 6,786 published rows,
# 6.9%, are pinned to an address belonging to a different decision. The COVID
# emergency motion of 2020-09-01 is one of them: it sits on 2300 Harrison Street
# because 201019 [Findings Reversing the Community Plan Evaluation - 2300
# Harrison Street] followed it on the page.
#
# It is NOT fixed here. The published block index is built from these rows and
# correcting them would move the map, which this change exists not to do.
# Reported, reproducible, and left as a decision.
NEXTFILE = re.compile(r"(?<!\d)\d{6}(?!\d)\s*\[")


def do_bleed() -> None:
    rows = _rows()
    per = collections.Counter()
    ex = []
    for r in rows:
        if r["pl"] != "placed":
            continue
        ms = [m.start() for m in NEXTFILE.finditer(r["t"]) if m.start() > 0]
        if not ms:
            per[(r["pk"], "no later header in the chunk")] += 1
            continue
        p = ms[0]
        if all(x["o"] >= p for x in r["r"]):
            per[(r["pk"], "EVERY street after a later file header")] += 1
            if r["pk"] == "title" and len(ex) < 8:
                ex.append((r, p))
        else:
            per[(r["pk"], "a street before the header")] += 1
    for k in sorted(per):
        print(f"  {per[k]:>6}  {k[0]:<10} {k[1]}")
    tot = sum(v for k, v in per.items() if k[0] == "title")
    bl = per[("title", "EVERY street after a later file header")]
    print(f"\n  CONSERVATIVE LOWER BOUND — title-form rows only, where the item's")
    print(f"  own words are present and every placed street is not:")
    print(f"    title-form placed rows                        {tot:>7,}")
    print(f"    ...placed entirely on the NEXT file's address {bl:>7,}  "
          f"{100 * bl / tot:.1f}%")
    print(f"    as a share of all {len([r for r in rows if r['pl'] == 'placed']):,} "
          f"published placed rows          {100 * bl / 6786:.1f}%")
    print(f"\n  stamp- and fragment-form rows are NOT counted above. A stamp's own")
    print(f"  header legitimately follows its disposition line "
          f"(\"Ordinance No. 132-16")
    print(f"  FINALLY PASSED 160576 [Settlement of Lawsuits ...]\"), so the same")
    print(f"  test cannot separate the two cases there without more work.")
    print()
    for r, p in ex:
        print(f"  {r['dt']} p{r['page']}  placed on {[x['d'] for x in r['r']]}")
        print(f"     ITEM : {r['t'][:104]}")
        print(f"     NEXT : {r['t'][p:p + 80]}\n")


def do_sample(what: str, k: int) -> None:
    rows = _rows()
    random.seed(11)
    if what in ("placed", "unresolved", "none"):
        pool = [r for r in rows if r["pl"] == what]
    elif what == "citywide":
        pool = [r for r in rows if r["pl"] == "none" and r["pk"] == "title"]
    elif what == "proc":
        for name in FORMS:
            sub = [r for r in rows if r["pk"] == name]
            print(f"\n--- {name}  ({len(sub):,} rows) ---")
            for r in random.sample(sub, min(4, len(sub))):
                print(f"  {r['dt']} p{r['page']:>3} {r['t'][:170]}")
        return
    else:
        pool = rows
    for r in random.sample(pool, min(k, len(pool))):
        print(f"\n  {r['dt']} p{r['page']:>3} [{r['pl']}/{r['pk']}/{r['disp'] or '-'}] "
              f"files={r['fn']} refused={r['un']}\n    {r['t'][:400]}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--sweep", action="store_true")
    ap.add_argument("--relabel", action="store_true")
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--files", action="store_true")
    ap.add_argument("--pool", action="store_true")
    ap.add_argument("--bleed", action="store_true")
    ap.add_argument("--sample", nargs="?", const="all")
    ap.add_argument("-k", type=int, default=12)
    a = ap.parse_args()
    if not any((a.sweep, a.relabel, a.verify, a.report, a.files, a.pool, a.bleed, a.sample)):
        ap.error("one of --sweep / --relabel / --verify / --report / --files / --pool / --bleed / --sample")
    if a.sweep:
        do_sweep()
    if a.relabel:
        do_relabel()
    if a.verify:
        do_verify()
    if a.report:
        do_report()
    if a.files:
        do_files()
    if a.pool:
        do_pool()
    if a.bleed:
        do_bleed()
    if a.sample:
        do_sample(a.sample, a.k)


if __name__ == "__main__":
    main()
