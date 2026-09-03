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
    # THE THIRD TRAP IS A PHRASE, NOT A BOUNDARY, and it is the one the modern
    # record actually hits. `\bshelter\b` is correctly bounded and still wrong
    # 4 times in a 12-row sample of the homelessness theme, because 2020-23 is
    # full of "shelter-in-place": hotel damage claims, commercial-eviction
    # resolutions, COVID emergency supplements. A word can be bounded, spelled
    # right, and still be a different word. `subject_span()` cuts the phrase
    # before anything is matched; this line is what stops a future pattern
    # putting it back.
    "A dispute over a bus shelter and a shelter-in-place order.",
]

# A TRAP MUST BE CLEAN AGAINST EVERY VOCABULARY THAT SHARES THIS GATE, and the
# first draft of the line above was not. It read "…caused by shelter-in-place
# HOTEL GUESTS", and `check_patterns` is run by BOTH `load()` and
# `load_subjects()` — so the fiche's `hotels-and-rooming-houses` matched the
# word `hotel`, correctly, and refused a build seven minutes in. A trap has to
# name the failure and nothing else; every other subject word is a landmine for
# a vocabulary this file does not know about.


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
    check_span(seed["themes"])
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
    """No pattern may fire on a known trap, AS THE TAGGER WOULD SEE IT.

    The traps are run through `subject_span()` first, which is the whole point:
    the third one is defused by the span rule rather than by the pattern, and
    checking the raw string would refuse `\bshelter\b` — a correct pattern —
    while checking the cut string proves the cut is actually wired in. Remove
    the cut and this gate fails, which is what a gate is for.
    """
    bad = [(t["slug"], s) for t in themes for s in TRAPS
           if t["_rx"].search(subject_span(s))]
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


# ── THE SPAN A THEME MAY BE READ FROM ──────────────────────────────────────
# Until 2026-09 a theme was read from the whole of an item's text, and for the
# historic Journal that is right: an item is one act, so a word in it is a word
# about the act. The modern minutes break the assumption, and not by being
# longer — the modern median is 348 characters against the historic 537. They
# break it by CONTENT. A modern item names its counterparty, its address list,
# the departments asked to report, the uses it exempts, the roll call, and the
# referral trail; it names a dozen things it is not about.
#
# MEASURED, on 96 modern items drawn 12 per theme and read by hand: 59 were
# about the theme they carried, 31 were not — 65.6% precision. The one a reader
# actually reported was a landmark designation of a church complex appearing
# under SCHOOLS, because the address list reads "117 Diamond Street (School)".
#
# Four spans are cut here, and each was a labelled failure family, not a guess:
#
#   the SIP phrase   4 of 31. "shelter-in-place" is not a shelter. See TRAPS.
#   a speaker roll   5 of 31. "Hatchner; expressed opposition to the navigation
#                    center" is a public-comment list, not a decision about
#                    homelessness. Two markers or more and the row is a roll.
#   the next item    4 of 31. The Clerk prints `171298 [Title]` at the head of
#                    an item, and an item's text can run into the head of the
#                    one after it. Anything past the SECOND such header — or
#                    past the first, when the first is not this item's own —
#                    belongs to a different decision.
#   an appointment   3 of 31. "Mayoral Reappointment, Historic Preservation
#                    Commission - Richard Johns" is about a person. A dot on a
#                    landmark filter should be a landmark, not a nomination.
#
# AND THEN THE TITLE WINS. Where the Clerk wrote a file title for the item —
# 93.8% of the modern record — that title is a subject heading a person wrote
# on purpose, and it is a far better statement of what the item is about than
# the recital is. Reading the theme from it, with the four cuts above already
# applied to the fallback, is what takes precision from 65.6% to the figure the
# build prints. It costs recall, which is why the patterns were widened in the
# same pass: the losses were nearly all items whose title says FIRE PREVENTION,
# FIRE APPARATUS or SFUSD while the pattern only knew "fire department" and
# "unified school".
#
# HISTORIC ITEMS ARE UNTOUCHED BY THE TITLE RULE. They carry no Clerk title, so
# they take the fallback, and the four cuts are near no-ops on them: the Journal
# has no six-digit file headers and no shelter-in-place.
# TWO SHELTERS THAT ARE NOT SHELTER. "shelter-in-place" is the COVID order and
# fired 4 times in a 12-row sample; "bus shelter" is a Muni stop and turned a
# Certificate of Honor for a man who saved a baby born in one into a
# homelessness record. Both are cut before anything is matched.
NOT_A_SHELTER = re.compile(
    r"shelter[\s\-]*in[\s\-]*place|\b(?:bus|transit|muni|street)\s+shelter", re.I)
SPEAKER_ROLL = re.compile(r";\s*(?:expressed|spoke|stated|urged)\b", re.I)
# The Clerk's public-comment format: the file being spoken to, then the
# speaker. When THAT is all a row has left, the row is a comment, not an act.
FILE_REF_TAIL = re.compile(r"\(File No\.\s*\d+\)[^;]{0,60}$", re.I)
NEXT_ITEM = re.compile(r"\b\d{6}\s*\[")
APPOINTMENT = re.compile(
    r"^(?:mayoral\s+)?(?:re)?appointments?[,\s]|\bnomination\s+of\b"
    r"|\bfor\s+reappointment\b", re.I)

# How far into the text this item's OWN header may start. Past it, a header is
# the next item's.
OWN_HEADER = 80


def subject_span(text, title=None):
    """The text a theme may be read from. '' when the row states no subject.

    `title` is the Clerk's own file title for the item (`ht` on the row), where
    the record has one. Pass it and it wins; pass nothing and the item's text is
    used with the cuts applied. See the note above for what each cut is worth.
    """
    if not text:
        return ""
    if title and APPOINTMENT.search(title):
        return ""
    if title:
        return NOT_A_SHELTER.sub(" ", title)
    body = NOT_A_SHELTER.sub(" ", text)
    # WHAT A SPEAKER SAID IS NOT WHAT THE BOARD DID. The first speaker marker
    # ends the item's own words. Cutting there rather than refusing the row is
    # deliberate: a 2011 wireless-facility motion carries a bled-in comment at
    # its tail and is a real decision, while a refusal on the marker alone
    # would have thrown it away with the comment.
    spk = SPEAKER_ROLL.search(body)
    if spk:
        body = body[:spk.start()]
        # …but where the cut leaves nothing except the file the speaker was
        # speaking TO, the row was the comment. "Resolution urging ABAG to
        # focus on unmet needs for affordable housing (File No. 200955). Sara
        # Oglesby; expressed opposition to the" is not a housing decision; the
        # housing decision is File No. 200955, which has its own row.
        if FILE_REF_TAIL.search(body):
            return ""
    heads = list(NEXT_ITEM.finditer(body))
    if heads:
        nth = 1 if heads[0].start() < OWN_HEADER else 0
        if len(heads) > nth:
            body = body[:heads[nth].start()]
    return body


# ── THE SPAN RULE, CHECKED AGAINST THE ROWS THAT MADE IT ───────────────────
# Every case here is a real item from the corpus that was tagged wrongly, or a
# real item that a first draft of the rule threw away. They are the measurement
# in executable form: change the rule and the ones it breaks say so by name,
# rather than turning up in a sample six weeks later.
#
# `t` is the item's text, `ht` the Clerk's file title where it has one, `on` the
# themes that MUST fire, `off` the themes that must NOT.
SPAN_CASES = [
    dict(why="the reader's own report: an address list is not a subject",
         ht="Initiating Landmark Designation - Most Holy Redeemer Church Complex",
         t="Resolution initiating a landmark designation under Article 10 of the "
           "Planning Code for the Most Holy Redeemer Church Complex, consisting "
           "of 110 Diamond Street (Church), 100 Diamond Street (Rectory), 115 "
           "Diamond Street (Convent), 117 Diamond Street (School)",
         on=["landmarks-old-buildings"], off=["schools"]),
    dict(why="shelter-in-place is not a shelter",
         ht="Settlement of Unlitigated Claim - AB Taylor Propco LLC - $2,900,000",
         t="the claim involves allegations of property damage to the Tilden "
           "Hotel caused by shelter-in-place (SIP) hotel guests",
         on=[], off=["homelessness-shelter"]),
    dict(why="a bus shelter is not a shelter",
         ht="", t="in recognition of his heroic actions while saving a baby born "
                  "in a San Francisco bus shelter. Supervisor Campos introduced, "
                  "welcomed, and presented a Certificate of Honor",
         on=[], off=["homelessness-shelter"]),
    dict(why="an appointment is about a person, singular and plural alike",
         ht="Mayoral Reappointment, Historic Preservation Commission - Lydia So",
         t="Motion approving the Mayor's nomination for reappointment of Lydia "
           "So to the Historic Preservation Commission",
         on=[], off=["landmarks-old-buildings"]),
    dict(why="an appointment is about a person, singular and plural alike",
         ht="Appointments, Local Homeless Coordinating Board - Laura Guzman",
         t="Motion approving the appointments of Laura Guzman and Sophia Isom "
           "to the Local Homeless Coordinating Board",
         on=[], off=["homelessness-shelter"]),
    dict(why="the row is the public comment, not the decision spoken to",
         ht="", t="Resolution urging the Association of Bay Area Governments to "
                  "focus on unmet needs for affordable housing (File No. "
                  "200955). Sara Oglesby; expressed opposition to the",
         on=[], off=["housing"]),
    dict(why="but a decision with a comment stuck to its tail survives the cut",
         ht="", t="Motion No. 18458, under Planning Code Section 303, approving "
                  "the conditional use of an existing three-story building. "
                  "A speaker; expressed concerns about the library.",
         on=["whats-being-built"], off=["libraries"]),
    dict(why="anything past the next item's header belongs to that item",
         ht="", t="Resolution approving the construction of a building for the "
                  "Central Pump Station Well. 03/25/14; RECEIVED AND ASSIGNED "
                  "to Land Use Committee. 140292 [Multifamily Housing Revenue "
                  "Bonds - Transbay Block 6 - Not to Exceed $15,000,000]",
         on=[], off=["housing"]),
    dict(why="recall: the fire service's WORK, not only its stations",
         ht="Administrative Code - Firefighter Personal Protective Equipment "
            "Containing PFAS",
         t="Ordinance amending the Administrative Code to prohibit the "
           "provision of personal protective equipment containing PFAS",
         on=["fire"], off=[]),
    dict(why="recall: the modern Clerk writes SFUSD, not 'unified school'",
         ht="Committee of the Whole - SFUSD's Resource Alignment Initiative",
         t="Motion to hold a public hearing on the state of educators impacted "
           "by the Resource Alignment Initiative",
         on=["schools"], off=[]),
]


def check_span(themes):
    """Every recorded failure, replayed. Raises SystemExit on the first miss."""
    rx = {t["slug"]: t["_rx"] for t in themes}
    bad = []
    for c in SPAN_CASES:
        span = subject_span(c["t"], c["ht"] or None)
        for slug in c["on"]:
            if not (span and rx[slug].search(span)):
                bad.append(f'{slug} should fire but does not — {c["why"]}')
        for slug in c["off"]:
            if span and rx[slug].search(span):
                bad.append(f'{slug} fires and must not — {c["why"]}')
    if bad:
        raise SystemExit("REFUSED: the span rule no longer holds:\n  "
                         + "\n  ".join(bad))
    return len(SPAN_CASES)


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
