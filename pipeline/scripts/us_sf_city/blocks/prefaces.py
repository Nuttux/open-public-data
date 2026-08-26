"""The item's own TITLE, which the splitter leaves on the item before it.

    python3 blocks/prefaces.py       geo/cache/ia/*.gz -> blocks/cache/prefaces.json

WHY THIS EXISTS. The Journal prints an item as

    Ordering the Improvement of Ordway Street Between San Bruno Avenue and Girard
    Street and Extending City Aid in Approximate Amount of $2,200.
    File No. 7222, Ordinance No (Series of 1939).
    Passed for Second Reading by the following vote: Ayes: Supervisors ... — 11.

and the item splitter cuts pages on `Resolution|Ordinance|Motion`, which is the word
in the MIDDLE of the second line. So every chunk it produces is

    [ body + roll call of item K ] [ title + file number of item K+1 ]

`build_index.before_rollcall()` already refuses to read the trailing title as item K's
location — that is what stops a 1930 Portola Drive extension from landing in the Sunset.
It then throws the title away, and for 6,643 located items the title was the only place
the item named a street at all. This pass gives it back to the item it belongs to.

WHAT A PREFACE IS. The text between the end of the PREVIOUS item's roll call and this
item's `Resolution|Ordinance|Motion` mark. That span is this item's by position: the
previous item ended at its vote. It is not gated on reading like a heading the way
`headings.py` is — headings.py is choosing a line to PRINT to a reader and is right to
be fussy; this is choosing text to read a street out of.

WHAT IS REFUSED, AND WHY. The same slot sometimes holds a whole self-contained item that
never uses the words Resolution/Ordinance/Motion, and handing its streets to the next
resolution would be the same bleed pointing the other way:

    ... Ayes: ... — 11.  Equestrian Center. Supervisor McCarty called attention to a
    meeting ... re proposed bridle path in Golden Gate Park ... and the Clerk was
    directed to comply.

So a preface is kept only where the record itself shows the two run together: either a
connector was stripped off its end (`File No. 7222,` · `Supervisor Welch presented:` ·
`Also,` — the list `headings.py` collected off this corpus), or it does not end in a full
stop, which means the `Resolution` that follows continues its sentence.

The walk is the walk. Same page order, same `ITEM` split, same 60..3000 gate, same
`locations` gate, same per-volume counter as `extract_texts.py` and `headings.py`, so
`(volume, item)` is the same join everywhere, and that is asserted at the end rather than
trusted.
"""
import gzip, importlib.util, json, os, re, sys, time

import sys as _sys
_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Code in the repo, data under CITY_DATA. See _paths.py.
from _paths import ANIM, REPO as ROOT, MIN, IA, CACHE  # noqa: F401
HERE = os.path.dirname(os.path.abspath(__file__))

sys.path.insert(0, HERE)
import headings as HD


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


# The end of a roll call — where an item stops. Character-for-character
# build_index.ROLLEND, which is where the other half of this cut is applied.
ROLLEND = re.compile(
    r"\bAyes?\s*[—:\-].{0,800}?(?:(?:Absent|Excused)\b[^.]{0,240}?\d{1,2}\s*[.\-—]"
    r"|\d{1,2}\s*[.\-—])", re.S | re.I)

# the running head the printer sets at the top of every page — "MONDAY, APRIL 2, 1951 285"
# — sits inside the preface whenever the title straddles a page break.
RUNHEAD = re.compile(
    r"\b(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY)\s*,?\s+"
    r"(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|"
    r"NOVEMBER|DECEMBER)\s+\d{1,2}\s*,?\s+\d{4}\s*\d{0,4}", re.I)

SENT_END = re.compile(r"[.!?][\"')\]]?$")
# the verbs of a resolution's BODY, not of its title. headings.py rejects a heading
# on the same test: the Board's titles are noun phrases ("Accepting the Roadway of
# Mojave Street ..."), its bodies are finite clauses ("Resolved, That permission ...
# is hereby granted"). This is what stops a whole neighbouring resolution being read
# as the next item's title when the record gave no roll call to cut on.
FINITE = re.compile(r"\b(is|are|was|were|be|been|shall|hereby|that|which|said|"
                    r"thereof|therein|resolved|ordained|whereas)\b", re.I)

MAX_PRE = 400          # hard cap on how much of a window can be claimed
FALLBACK_WINDOW = 700  # when the previous item printed no roll call at all
KEEP_SENTENCES = 1     # a title is ONE line of print. Keeping two sentences recovered
                       # 238 more items and moved the ground-truth accuracy by nothing
                       # (n=244, identical to a tenth of a point), while letting the
                       # PREVIOUS item's last sentence into this item's location. Kept
                       # at one.


def strip_connectors(p):
    """(text with trailing connectors removed, 'also' | 'other' | None)."""
    kind = None
    for _ in range(6):
        before = p
        for c in HD.CONNECTORS:
            q = c.sub("", p).strip()
            if q != p:
                kind = "also" if c is HD.ALSO else (kind or "other")
            p = q
        if p == before:
            break
    return p, kind


INHERIT = "\x00inherit"


def preface_of(window, anch):
    """The part of `window` that belongs to the item after it, or None.

    `anch` is how the window's LEFT edge was found: "roll" means the previous item
    printed a roll call and the window starts exactly after it, so everything in it
    is by construction the next item's. "tail" means it did not, and the window is
    only the last few hundred characters of the previous item — which may be that
    item's own prose, so far less of it is trusted.
    """
    w = RUNHEAD.sub(" ", re.sub(r"\s+", " ", window)).strip()
    if not w:
        return None, "empty"
    body, kind = strip_connectors(w)
    if kind is None and SENT_END.search(w):
        # a complete sentence with nothing joining it to what follows: its own item
        return None, "self-contained"
    if kind == "also":
        # "Also," is the Board printing a SECOND item under the heading it has
        # already printed. The text before it is the first item's body, not this
        # item's title — the heading is the one the first item was given.
        return INHERIT, "also"
    if not body:
        return None, "connector-only"
    ss = HD.sentences(body)
    if not ss:
        return None, "empty"
    if anch == "roll":
        out = " ".join(ss[-KEEP_SENTENCES:])
    else:
        out = ss[-1]
        if FINITE.search(out) and SENT_END.search(w.rstrip()):
            # the previous item's own prose, not a title, and nothing runs on
            return None, "body-prose"
    return out[-MAX_PRE:].strip(), ("connector" if kind else "runs-on")


def main():
    """--ia/--vols/--out let this same walk run over the sweep/ cache.

    The bleed fix is only as wide as the volumes it has hOCR for. Run with no
    arguments it reads the original 59 volumes out of geo/cache/ia, exactly as
    before. Run with --ia sweep/cache/ia --vols sweep/manifest.json it reads the
    other 87, so the 1980s get the same item boundary the 1920s got instead of
    being weaker for a reason that is an artefact of which cache a volume sits in.
    The identity check at the bottom is what makes this safe: every preface key
    must match an item this pipeline actually emitted, or the run refuses.
    """
    global IA
    av = sys.argv[1:]
    def opt(name, dflt=None):
        return av[av.index(name) + 1] if name in av else dflt
    IA = opt("--ia", IA)
    outp = opt("--out", os.path.join(CACHE, "prefaces.json"))
    vsrc = opt("--vols", os.path.join(ANIM, "vols.txt"))
    itemsp = opt("--items", os.path.join(CACHE, "items.jsonl"))

    ex = _load(os.path.join(MIN, "extract.py"), "ex")
    vols = []
    if vsrc.endswith(".json"):
        for r in json.load(open(vsrc)):
            if r.get("body") == "board" and not r.get("already_swept"):
                vols.append((r["year"], r["id"]))
    else:
        for ln in open(vsrc):
            p = ln.split()
            if len(p) == 2:
                vols.append((int(p[0]), p[1]))
    vols.sort()
    print(f"{len(vols)} volumes from {vsrc}, hOCR from {IA}", flush=True)

    out, why_n = {}, {}
    tot = 0
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
        t0, item_id, n_pre = time.time(), 0, 0
        carry, carry_anch = "", None   # tail of the previous PAGE — a title can
                                       # straddle the break
        for i, s in enumerate(starts):
            text = ex.clean(t[s:(starts[i + 1] if i + 1 < len(starts) else len(t))])
            if len(text) < 60:
                continue
            marks = [mm.start() for mm in ex.ITEM.finditer(text)]
            carried, carried_anch = None, None   # nothing inherits across a page
            if not marks:
                # a page with no item mark at all is one long continuation; keep
                # only its tail, so a title split across it still survives
                carry = (carry + " " + text)[-FALLBACK_WINDOW:]
                continue
            prev_end, prev_anch = None, None   # where the previous item stopped
            for j, (a2, b2) in enumerate(zip(marks, marks[1:] + [len(text)])):
                if j == 0:
                    window, anch = carry + " " + text[:a2], carry_anch
                else:
                    window, anch = text[prev_end:a2], prev_anch
                pre, why = preface_of(window, anch)
                if pre == INHERIT:
                    pre, anch = carried, (carried_anch or anch)
                elif pre and why == "connector":
                    # only a title the record itself set off with a connector is
                    # allowed to be inherited across an "Also," — a run-on fragment
                    # of the previous item's prose is not a heading and must not
                    # become one for a second item
                    carried, carried_anch = pre, anch
                body = text[a2:b2]
                m = None
                for mm in ROLLEND.finditer(body):
                    m = mm
                prev_end = a2 + (m.end() if m else max(0, len(body) - FALLBACK_WINDOW))
                prev_anch = "roll" if m else "tail"
                if len(body) < 60 or len(body) > 3000 or not ex.locations_from(body):
                    continue
                item_id += 1
                tot += 1
                why_n[(why, anch)] = why_n.get((why, anch), 0) + 1
                if pre:
                    out[f"{ident}|{item_id}"] = {"p": pre, "w": why, "a": anch}
                    n_pre += 1
            if prev_end is not None:
                carry, carry_anch = text[prev_end:][-FALLBACK_WINDOW:], prev_anch
            else:
                carry, carry_anch = "", None
        print(f"{year} {ident:44s} {item_id:>6} items  {n_pre:>6} prefaced  "
              f"{time.time()-t0:.0f}s", flush=True)

    os.makedirs(CACHE, exist_ok=True)
    p = outp
    json.dump(out, open(p, "w"), separators=(",", ":"), ensure_ascii=False)
    print(f"\nITEMS {tot:,}")
    for (w, a), v in sorted(why_n.items(), key=lambda x: -x[1]):
        print(f"  {w:16s} start={str(a):5s} {v:>7,} ({100*v/tot:.1f}%)")
    print(f"wrote {p} {os.path.getsize(p)/1024:,.0f} KB")

    it = itemsp
    if os.path.exists(it):
        keys = {f"{d['v']}|{d['i']}" for d in map(json.loads, open(it))}
        vols_in = {k.split("|")[0] for k in keys}
        # 4 of the 59 cached volumes (1966, 1970, 1976, 1993) are NOT in items.jsonl:
        # three were fetched after it was written, one is the 1976 file the old sweep
        # lost. This pass reads them; the index cannot, so they are excluded from the
        # join check rather than silently failing it. Nothing downstream reads them.
        mine = {k for k in out if k.split("|")[0] in vols_in}
        miss = mine - keys
        print(f"items.jsonl keys {len(keys):,} · prefaces on those {len(vols_in)} volumes "
              f"{len(mine):,} · matching no item {len(miss):,}")
        print(f"volumes cached but absent from items.jsonl: "
              f"{sorted({k.split('|')[0] for k in out} - vols_in)}")
        if miss:
            sys.exit("REFUSED: this walk is not extract_texts.py's walk.")


if __name__ == "__main__":
    main()
