"""What a decision is ABOUT, tagged here because it cannot be tagged in the browser.

WHY THIS IS IN THE PIPELINE AND NOT IN THE RENDERER. The obvious way to build a
theme filter is a regex in the client over the text already in the shards. It
does not work, and the failure is silent rather than loud: the shard carries the
one LINE a decision shows — a median of 136 characters, cut by `gloss_of()` —
while the item behind it has a median of 520. Measured over the same corpus:

    term             in shard text   in source text   survives
    landmark                   394            1,154        34%
    homeless                    90              532        17%
    liquor licence             509              666        76%

A client-side filter would therefore draw 17% of the homelessness record and
call it the homelessness record. It is not a shortcut to the same answer; it is
a different, much smaller dataset. So the tag is computed HERE, against the
item's own full text, and travels on the row.

WHAT A TAG IS. A bitmask over `seed["themes"]`, bit `b["bit"]` per theme. Eight
themes fit in one byte and a decision may carry several — the eight overlap each
other on purpose and do not partition anything. 0 means no theme matched, which
is the common case: the union is around 60% of the mappable record.

THE PATTERNS ARE NOT HERE. They are authored data, in
`pipeline/seeds/sf_decision_themes.json`, with the measurement that earned each
theme its slot beside it. This module is the rule that applies them, and the
rule is one line long — which is the point: everything that could drift is in
the seed, under review, in one file.

WORD BOUNDARIES ARE LOAD-BEARING. `bus` without a trailing `\\b` matches
*business*; `reparation` without one matches *p-reparation of plans*, which
scored a racial-equity theme at 1,043 decisions when the true count was 3. The
seed says this too. `check_patterns()` below refuses a pattern that would fire
on the two known traps, so the next one is caught by the build rather than by a
reader.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
# <repo>/pipeline/scripts/us_sf_city/blocks -> <repo>
REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
SEED = os.path.join(REPO, "pipeline", "seeds", "sf_decision_themes.json")

# The corpus rule the counts were produced under, kept with the patterns it
# belongs to: an item shorter than this is a fragment, not a decision.
MIN_TEXT = 25

# Two strings that are not about these themes and must never match one. Both are
# real failures: the first is a missing `\b` on `bus`, the second is the
# `reparation` trap. Anything a new pattern does to them, it does to thousands
# of rows nobody will read.
TRAPS = [
    "Authorizing the preparation of plans and specifications for the business "
    "district improvement.",
    "Amending the Municipal Code relating to businesses preparing food.",
]


# A mask is a JSON number, and a JSON number is a float64: integers stay exact
# to 2^53. So 53 vocabulary entries is the real ceiling, not 32, and the check
# says which number it is protecting rather than a round one that looks like a
# policy. Past 53 a mask silently loses its high bits — no error anywhere, just
# a subject that stops appearing.
MAX_BITS = 53


def load(path=SEED):
    """The seed, checked. Returns the parsed object."""
    seed = json.load(open(path))
    seed["themes"] = check_vocab(seed["themes"], os.path.basename(path))
    return seed


def check_vocab(ts, what="vocabulary"):
    """Compile and check any list of {bit, slug, pattern} — themes or subjects.

    ONE CHECK FOR BOTH VOCABULARIES. The map's eight coarse themes and the
    fiche's forty-one fine subjects are the same kind of object read at two
    grains, and they are tagged by the same call in the same pass. Letting them
    share this gate is what stops the fine one drifting into a second, weaker
    rule the way it already did once — it was matching the published line while
    the coarse one matched the record.
    """
    bits = [t["bit"] for t in ts]
    if sorted(bits) != list(range(len(ts))):
        raise SystemExit(f"REFUSED: {what} bits are {sorted(bits)[:8]}…, expected "
                         f"0..{len(ts)-1}. The mask on every published row is "
                         f"positional — a gap or a repeat silently relabels an "
                         f"entry.")
    if len(bits) > MAX_BITS:
        raise SystemExit(f"REFUSED: {len(bits)} entries in {what}; a JSON number "
                         f"holds {MAX_BITS} bits exactly. Past that the mask "
                         f"loses its high bits with no error anywhere.")
    slugs = [t["slug"] for t in ts]
    if len(set(slugs)) != len(slugs):
        raise SystemExit(f"REFUSED: duplicate slug in {what}.")
    for t in ts:
        t["_rx"] = re.compile(t["pattern"], re.I)
    check_patterns(ts)
    return ts


def slugify(label):
    return re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")


def load_subjects():
    """The fiche's forty-one, from where they are authored.

    THEY ARE NOT COPIED INTO A SEED. `build_threads.THREADS` already holds the
    label, the era, the pattern and the one plain line that says what each
    subject is, and several of the patterns are assembled from the
    `NOT_A_STREET` guard at import time — "Church Street is not a church" — so
    a JSON copy would be a snapshot that silently goes stale the first time the
    guard changes. This reads the authored list and gives it bits.

    The ORDER of that list is therefore load-bearing: it decides the bit each
    subject gets, and the masks already published are positional. Append new
    subjects at the END; reordering relabels every row in the tree.
    """
    import importlib.util
    p = os.path.join(REPO, "pipeline", "scripts", "us_sf_city", "build_threads.py")
    spec = importlib.util.spec_from_file_location("_bt", p)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    out = [{"bit": i, "slug": slugify(lbl), "label": lbl, "era": era,
            "pattern": pat, "note": note}
           for i, (lbl, era, pat, note) in enumerate(m.THREADS)]
    return check_vocab(out, "build_threads.THREADS")


def check_patterns(themes):
    """No pattern may fire on a known word-boundary trap."""
    bad = [(t["slug"], s) for t in themes for s in TRAPS if t["_rx"].search(s)]
    if bad:
        raise SystemExit(
            "REFUSED: pattern(s) match a known word-boundary trap — "
            + "; ".join(f'{slug} on "{s[:60]}…"' for slug, s in bad)
            + ". Close the boundary (\\b) before publishing; this is the "
              "failure that scored 1,043 decisions for a theme with 3.")


# ── THE CUSTODY STAMP, AND WHY IT HAS TO BE CUT BEFORE ANYTHING IS MATCHED ──
# A scanned civic document does not only contain what it says. It contains what
# the library that kept it printed ON it: an ownership stamp, a reference-desk
# rule, a catalogue barcode, and — a century later — a digitisation credit.
#
#   "SAN FRANCISCO PUBLIC LIBRARY · REFERENCE BOOK · Not to be taken from the
#    Library · 3 1223 03557 7437"
#
# That block appears in 24% of the place documents measured, and it is fatal to
# exactly one pattern: `\blibrar`. Tagged raw, 47 places that are not libraries
# — Alamo Square, Golden Gate Park, the Asian Art Museum — came out being about
# libraries, because a 1968 planning study had a library's bookplate on its
# first page.
#
# THE GENERAL RULE, and it is the one worth remembering: a document's text says
# what it is about; a document's METADATA says who has it. The two arrive in the
# same string once a page is scanned, and only the first one is a subject. This
# is the `p-reparation of plans` failure wearing different clothes — the words
# are really there, they are just not about the thing they name.
CUSTODY = [
    re.compile(r"(?:san\s+franc\w*|s\.?\s?[fe]\.?)\s+(?:pub\w*\s+)?librar\w*", re.I),
    re.compile(r"reference\s+book|not\s+to\s+be\s+taken\s+from\s+the\s+librar\w*", re.I),
    re.compile(r"\b3\s?1223\s?[\d\s]{6,}", re.I),
    re.compile(r"government\s+information\s+cent(?:er|re)", re.I),
    re.compile(r"digitized\s+by|internet\s+archive", re.I),
]


def strip_custody(text):
    """Remove the holding institution's marks from a scanned document's text.

    Call this on OCR before tagging it. It is deliberately NOT called inside
    `mask_of` — the Board's minutes are transcribed item text with no bookplate
    on them, and a silent rewrite of every string this module sees would be a
    surprise. The caller that has OCR knows it has OCR.
    """
    for rx in CUSTODY:
        text = rx.sub(" ", text)
    return text


def mask_of(text, themes):
    """The bitmask for one item's OWN TEXT. 0 when nothing matches."""
    if not text or len(text) <= MIN_TEXT:
        return 0
    m = 0
    for t in themes:
        if t["_rx"].search(text):
            m |= 1 << t["bit"]
    return m


def bits_set(mask):
    """-> [bit, …] for a mask, low bit first."""
    return [i for i in range(mask.bit_length()) if mask >> i & 1]


if __name__ == "__main__":
    s = load()
    print(f"{len(s['themes'])} themes from {SEED}")
    for t in s["themes"]:
        print(f"  bit {t['bit']}  {t['kind']:<5}  {t['label']:<26} {t['pattern'][:56]}")
    # the guard, shown working — a check that never fires on anything is not a
    # check, and this is the exact pattern that scored 1,043 for a theme with 3
    try:
        check_patterns([{"slug": "racial-equity",
                         "_rx": re.compile("reparation", re.I)}])
    except SystemExit as e:
        print(f"\ntrap guard fires on the unbounded pattern: {str(e)[:72]}…")
    else:
        raise SystemExit("REFUSED: the trap guard did not fire on `reparation`.")
