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
    python3 sweep_sfbos_all.py --control    re-sweep with both fixes OFF and diff
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
import json
import pathlib
import random
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

# ONE WALK, IMPORTED RATHER THAN COPIED. This file used to carry its own copy of
# `fetch_sfbos_minutes.do_extract`'s page walk and prove the two equal after the
# fact. They are now the same function, so there is nothing left to drift. Every
# regex, form label and gate below comes from there too.
from _sfbos_sweep import (  # noqa: E402
    BASE, CANON, DISP, FORMS, HEADER, STYPE, TITLED,
    SPEAKER, disp_of, ex, form_of, gz, sfbos_gate, sweep_meeting,
)

REPO = HERE.parent.parent.parent
MIN = REPO / "pipeline" / "minutes"
CACHE = HERE / "cache_sfbos"
PDFS = CACHE / "pdf"
CAL = CACHE / "calendar.json"
PLACED = CACHE / "items.jsonl"          # what the map is built from
ALL = CACHE / "items_all.jsonl"         # what this writes
META = CACHE / "items_all.meta.json"

FILENO = HEADER
FILEREF = re.compile(r"File Nos?\.\s*(?:and\s*)?((?:\d{6}[,;\s]*(?:and\s*)?)+)")

_ = (DISP, STYPE, TITLED, disp_of, form_of)   # re-exported for readers of this file


def _meetings():
    cal = json.loads(CAL.read_text())
    return [(k, v["stem"]) for k, v in sorted(cal.items()) if v["minutes"]]


def _walk(trim=True, orphans=True, echo=True):
    gaz = gz.build()
    keys = list(gaz)
    if echo:
        print(f"  gazetteer: {len(gaz)} real SF streets")
    todo = _meetings()
    if echo:
        print(f"  {len(todo)} meetings with published minutes")
    counters: dict = {}
    per_meeting: dict[str, dict] = {}
    rows = []
    for j, (day, stem) in enumerate(todo, 1):
        f = PDFS / f"{stem}_minutes.pdf"
        if not f.exists():
            counters["pdf missing on disk"] = counters.get("pdf missing on disk", 0) + 1
            continue
        got = sweep_meeting(stem, day, f, gaz, keys, trim_headers=trim,
                            emit_orphans=orphans, counters=counters)
        rows += got
        st = collections.Counter(r["pl"] for r in got)
        per_meeting[stem] = {"dt": day, "items": len(got), **dict(st)}
        if echo and j % 50 == 0:
            print(f"    … {j}/{len(todo)}  {len(rows):,} items", flush=True)
    return rows, counters, per_meeting


# ---------------------------------------------------------------- sweep
def do_sweep() -> None:
    rows, m, per_meeting = _walk()
    with open(ALL, "w") as w:
        for r in rows:
            w.write(json.dumps(r) + "\n")
    META.write_text(json.dumps({
        "counters": m,
        "chars_after_clean": m.get("chars_after_clean", 0),
        "chars_inside_an_item_chunk": m.get("chars_inside_an_item_chunk", 0),
        "per_meeting": per_meeting,
    }, indent=1))
    pl = collections.Counter(r["pl"] for r in rows)
    print(f"\n  {m.get('pdfs read', 0)} PDFs read, {m.get('pages split', 0):,} pages split")
    print(f"  {len(rows):,} items kept  "
          f"(placed {pl['placed']:,} / unresolved {pl['unresolved']:,} / "
          f"no place {pl['none']:,})")
    print(f"  {m.get('chunk trimmed at the next file\'s header', 0):,} chunks trimmed "
          f"at the next file's header")
    print(f"  {m.get('items from a file header the splitter cannot see', 0):,} items "
          f"recovered from a header the splitter cannot see")
    print(f"  -> {ALL.relative_to(REPO)}")
    print(f"  -> {META.relative_to(REPO)}")


# ---------------------------------------------------------------- control
# THE TEST THAT MAKES BOTH FIXES PROVABLE RATHER THAN PLAUSIBLE. Re-sweeps with
# `trim_headers=False, emit_orphans=False`, which is the walk exactly as it stood
# when `items_all.jsonl` and `items.jsonl` were published, and diffs it against a
# named baseline line for line. If the refactor moved one byte of its own, this
# says so before any measurement of the fixes is believed.
def do_control(baseline: str) -> None:
    base = pathlib.Path(baseline)
    rows, _m, _p = _walk(trim=False, orphans=False)
    old = [l.rstrip("\n") for l in open(base) if l.strip()]
    if base.name == "items.jsonl":
        new = [json.dumps({k: r[k] for k in CANON}) for r in rows if r["r"]]
    else:
        new = [json.dumps({k: v for k, v in r.items() if k not in ("hf", "ht")})
               for r in rows]
    print(f"  baseline {base}  {len(old):,} rows")
    print(f"  control re-sweep                {len(new):,} rows")
    if len(old) != len(new):
        sys.exit(f"REFUSED: control changed size {len(old)} -> {len(new)}")
    diff = [i for i, (x, y) in enumerate(zip(old, new)) if x != y]
    if diff:
        i = diff[0]
        print(f"    FIRST DIFF at line {i}\n      was: {old[i][:300]}\n      now: {new[i][:300]}")
        sys.exit(f"REFUSED: {len(diff)} control rows differ. The refactor is not neutral.")
    print(f"  CONTROL PASS: all {len(old):,} rows byte-identical, line for line, "
          f"in order. Every later difference is the fix, not the refactor.")


def do_relabel() -> None:
    """Recompute pl/pk/fn from the cached text. Never touches the twelve.

    `hf`/`ht` are NOT recomputed: they are the header printed above the item on
    the page, which the row's own text does not contain. Re-deriving them needs
    the page, so it needs `--sweep`.
    """
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
    print(f"  the {n - pl['placed']:,} items the map cannot draw are FIVE different")
    print(f"  things and they are never summed into one number:\n")
    proc = [r for r in rows if r["pl"] != "placed" and r["pk"] in
            ("stamp", "template", "rollcall", "adjournment")]
    frag = [r for r in rows if r["pl"] != "placed" and r["pk"] == "fragment"]
    unre = [r for r in rows if r["pl"] == "unresolved" and r["pk"] not in
            ("stamp", "template", "rollcall", "adjournment", "fragment", "file")]
    city = [r for r in rows if r["pl"] == "none" and r["pk"] == "title"]
    # the fifth class exists because the fifth FORM does: a legislative file
    # recovered from its own header. It is kept apart from `city` because these
    # are hearings and appeals, not citywide business.
    hear = [r for r in rows if r["pl"] != "placed" and r["pk"] == "file"]
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
        ("A FILE THE SPLITTER CANNOT SEE", hear,
         "a Hearing or other file recovered from its own header, naming no place"),
    ):
        print(f"  {lbl:<34}{len(sub):>8,}  {100 * len(sub) / tot_un:>5.1f}%")
        print(f"    {note}")
    chk = len(city) + len(proc) + len(frag) + len(unre) + len(hear)
    assert chk == tot_un, f"taxonomy is not a partition: {chk} != {tot_un}"
    print(f"\n  {chk:,} = {tot_un:,}. An EXACT partition, no row counted twice and")
    print(f"  none left over. An unresolved street on a stamp or a fragment is")
    print(f"  counted as the stamp or fragment it is, not as a placement failure.")
    cty_fn = sum(1 for r in city if r["hf"])
    cty_sp = sum(1 for r in city if r["sp"])
    print(f"\n  of the {len(city):,} CITYWIDE items:")
    # `hf`, not `fn`. See do_files(): a file number in an item's own words was
    # the NEXT file's until the header trim, so `fn` answered a different
    # question from the one this line asks.
    print(f"    printed under a legislative file      {cty_fn:>8,}"
          f"  {100 * cty_fn / max(1, len(city)):>5.1f}%")
    print(f"    are a public-comment re-print of one  {cty_sp:>8,}"
          f"  {100 * cty_sp / max(1, len(city)):>5.1f}%")
    print(f"    distinct files among them             "
          f"{len({r['hf'] for r in city if r['hf']}):>8,}")

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
    """File numbers the corpus PRINTS vs file numbers an ITEM answers for.

    THE OLD READING OF THIS TABLE WAS ITSELF THE BLEED. It counted a file as
    "carried by an item" when the number appeared in the item's text -- and
    because the header prints above the item it introduces, that number was
    almost always the NEXT file's. 9,868 files looked carried; once the chunk is
    cut at the header, only the 1,102 header-delimited rows contain a file number
    in their own words at all.

    So the question is asked the other way round, which is the way the Clerk
    writes it: which file's header is this item printed UNDER? That is `hf`, and
    it answers for 12,028 of the 12,051 files the corpus prints.

    What remains after that is the real second filter: a legislative file whose
    body uses none of `Resolution|Ordinance|Motion` can never become an item
    through the splitter, however plainly the Clerk printed it --

        161146 [Hearing - Appeal of Determination of Exemption From Environmental
                Review - Proposed Project at 2675 Folsom Street]
        Hearing of persons interested in or objecting to the determination ...

    -- which is why those spans are now emitted as items in their own right,
    bounded by the two headers around them rather than by a word.
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
            if m.group(1) not in titles or len(m.group(2)) > len(titles[m.group(1)]):
                titles[m.group(1)] = m.group(2).strip()
        bare_all |= set(re.findall(r"(?<!\d)(\d{6})(?!\d)", txt))
    under: collections.Counter = collections.Counter()
    own: collections.Counter = collections.Counter()
    for r in rows:
        if r["hf"]:
            under[r["hf"]] += 1
        for f in r["fn"]:
            own[f] += 1
    placed_files = {r["hf"] for r in rows if r["pl"] == "placed" and r["hf"]}
    hearing_files = {r["hf"] for r in rows if r["k"] == "H" and r["hf"]}
    hearing_placed = {r["hf"] for r in rows
                      if r["k"] == "H" and r["pl"] == "placed" and r["hf"]}
    print(f"  distinct 6-digit tokens anywhere in the text   {len(bare_all):>8,}")
    print(f"  ...NOT file numbers (Superior Court case nos)  "
          f"{len(bare_all - set(corpus)):>8,}")
    print(f"  distinct FILE NUMBERS (six digits then '[')    {len(corpus):>8,}")
    print(f"  ...with a title short enough to read whole     {len(titles):>8,}")
    print(f"\n  distinct files an ITEM IS PRINTED UNDER (hf)   {len(under):>8,}   "
          f"{100 * len(under) / len(corpus):.1f}%")
    print(f"  ...on a PLACED item                            {len(placed_files):>8,}   "
          f"{100 * len(placed_files) / len(corpus):.1f}%")
    print(f"  files whose own words name a file number (fn)  {len(own):>8,}")
    missing = sorted(set(corpus) - set(under))
    print(f"  files printed with NO item under them          {len(missing):>8,}")

    def head(f):
        return titles.get(f, "?").split(" - ")[0].strip()
    if missing:
        print(f"\n  what the {len(missing):,} remaining ARE, by the first segment of")
        print(f"  the Clerk's own bracketed title:")
        for k, v in collections.Counter(head(f) for f in missing
                                        if f in titles).most_common(15):
            print(f"    {v:>6}  {k}")
    print(f"\n  HEARINGS, the class the splitter's vocabulary could never see:")
    print(f"    distinct hearing files now carrying an item  {len(hearing_files):>7,}")
    print(f"    ...of which place on the map                 {len(hearing_placed):>7,}")
    print(f"    hearing items                                "
          f"{sum(1 for r in rows if r['k'] == 'H'):>7,}")
    print(f"    other header-delimited items (kind F)        "
          f"{sum(1 for r in rows if r['k'] == 'F'):>7,}")
    fk = collections.Counter(head(r["hf"]) for r in rows if r["k"] == "F" and r["hf"])
    for k, v in fk.most_common(8):
        print(f"      {v:>5}  {k}")


# one row per LEGISLATIVE FILE, for judging what a film could be made of.
# THIS IS A POOL AND NOT A SELECTION. Nothing here is ranked, scored or
# recommended; the choosing is Daniel's and is not a pipeline's to do.
def do_pool() -> None:
    rows = _rows()
    best: dict[str, dict] = {}
    for r in rows:
        # THE JOIN IS `hf`, NOT `fn`, AND THAT IS THE WHOLE CORRECTION. `fn` is a
        # file number the item's own words contain, and before the header trim
        # that was almost always the NEXT file's -- so the pool used to key each
        # file to the item printed ABOVE it. `hf` is the header printed above
        # this item, which is the file this item IS.
        if r["pk"] not in ("title", "file") or not r["hf"]:
            continue
        for f in [r["hf"]]:
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
# WHAT THE HEADER TRIM TOOK OFF THE MAP, counted against a named baseline.
#
# The Clerk prints a legislative file's header ABOVE the item it introduces, so
# a chunk that runs from one `Resolution|Ordinance|Motion` word to the next ends
# with the NEXT file's header, and every street inside it used to be read as this
# item's own:
#
#     Resolution urging the San Francisco Legislative Delegation to work to
#     amend the "By Right Housing Approvals" ...  160248 [Liquor License -
#     141 Gough Street]
#                                      ^ was placed on GOUGH STREET
#
# `_sfbos_sweep.sweep_meeting(trim_headers=True)` cuts the chunk there. This
# reports what that changed, row by row, against the stream as it was published:
#
#     python3 sweep_sfbos_all.py --bleed <baseline items_all.jsonl>
#
# The earlier reading of this — 468 rows, title-form only — was an explicitly
# conservative floor. It excluded stamp- and fragment-form rows on the grounds
# that a stamp's header might legitimately be its own. It is not: the header
# above an item is the header above an item whatever the chunk under it looks
# like, and the same test applied to every form finds 2,025 rows touched.
NEXTFILE = HEADER


def do_bleed(baseline: str) -> None:
    old = {}
    for line in open(baseline):
        r = json.loads(line)
        old[(r["v"], r["i"])] = r
    new = {(r["v"], r["i"]): r for r in _rows()}
    per = collections.Counter()
    exs = []
    n_old_placed = sum(1 for r in old.values() if r["r"])
    lost = changed = 0
    for k, r in old.items():
        if not r["r"]:
            continue
        q = new.get(k)
        a2 = [x["d"] for x in r["r"]]
        b2 = [x["d"] for x in (q["r"] if q else [])]
        if a2 == b2:
            per[(r["pk"], "untouched")] += 1
            continue
        if not b2:
            lost += 1
            per[(r["pk"], "placed ENTIRELY on another file's address")] += 1
            if len(exs) < 8:
                ms = [m.start() for m in NEXTFILE.finditer(r["t"]) if m.start() > 0]
                exs.append((r, ms[0] if ms else 0, a2, b2))
        else:
            changed += 1
            per[(r["pk"], "some streets were another file's")] += 1
    for k2 in sorted(per):
        print(f"  {per[k2]:>6}  {k2[0]:<10} {k2[1]}")
    print(f"\n  baseline placed rows                              {n_old_placed:>7,}")
    print(f"  ...whose ONLY address belonged to the next file   {lost:>7,}  "
          f"{100 * lost / max(1, n_old_placed):.1f}%")
    print(f"  ...which named one of the next file's addresses   {changed:>7,}  "
          f"{100 * changed / max(1, n_old_placed):.1f}%")
    print(f"  rows touched                                      "
          f"{lost + changed:>7,}  {100 * (lost + changed) / max(1, n_old_placed):.1f}%")
    print(f"  placed rows after the trim                        "
          f"{sum(1 for r in new.values() if r['r']):>7,}")
    print()
    for r, pos, a2, _b in exs:
        print(f"  {r['dt']} p{r['page']}  was placed on {a2}")
        print(f"     ITEM : {r['t'][:pos][:104]}")
        print(f"     NEXT : {r['t'][pos:pos + 80]}\n")


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
    ap.add_argument("--bleed", metavar="BASELINE_ITEMS_ALL",
                    help="diff the trim against a baseline items_all.jsonl")
    ap.add_argument("--control", metavar="BASELINE",
                    help="re-sweep with both fixes OFF and diff, line for line")
    ap.add_argument("--sample", nargs="?", const="all")
    ap.add_argument("-k", type=int, default=12)
    a = ap.parse_args()
    if not any((a.sweep, a.control, a.relabel, a.verify, a.report, a.files,
                a.pool, a.bleed, a.sample)):
        ap.error("one of --sweep / --control / --relabel / --verify / --report / "
                 "--files / --pool / --bleed / --sample")
    if a.sweep:
        do_sweep()
    if a.control:
        do_control(a.control)
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
        do_bleed(a.bleed)
    if a.sample:
        do_sample(a.sample, a.k)


if __name__ == "__main__":
    main()
