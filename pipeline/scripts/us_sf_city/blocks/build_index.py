"""block -> decisions.  Make the WHOLE CITY clickable, not 27 curated objects.

INPUT   cache/items.jsonl            49,952 located Board items with their TEXT
        ../geo/cache/addresses.json  227,937 parcel address ranges  [DataSF, REAL]
        ../geo/cache/blocks.json     5,404 dissolved assessor blocks [DataSF, REAL]
OUTPUT  out/*.json                   see SIZES printed at the end, and INTEGRATION.md

FOUR PRECISION TIERS, best-available wins, and the tier travels with every
decision so the reader is never told "here" when the record only said "somewhere
on this street":

  addr     3   a house number in the text falls inside a real parcel address
               range -> "2426 Pine Street" is block 0655 and nothing else
  segment  2   "X street, between Y and Z" -> the blocks fronting X whose
               centroids lie between the X/Y corner and the X/Z corner. This is
               the single most common construct in the corpus (35.5% of items)
               and without it every one of them smears down a whole street.
  corner   1   two streets, the second flagged a cross-street of the first ->
               the blocks fronting BOTH
  street   0   nothing but a street name -> every block that fronts it. Weak by
               construction, labelled as such, and ranked below everything else.

NEVER INVENTED: an item that resolves to no block is written to out/unplaced.json
with its reason, not guessed onto a block.
"""
import collections, json, math, os, re, sys, unicodedata

import importlib.util
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# THE CODE IS IN THE REPO; THE DATA IS NOT. _paths.py is the only place the two
# are told apart, and CITY_DATA is the only thing a rebuild elsewhere has to set.
# BLOCKS_ITEMS / BLOCKS_OUT / BLOCKS_JOINED keep exactly the meaning they had:
# they let a build run SIDE BY SIDE with the published one and be diffed, rather
# than the published output being overwritten to find out what a change did.
from _paths import ANIM, GEO, MIN, CACHE, OUT, ITEMS, JOINED  # noqa: F401
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)

from strip import strip as snip
import headings as HD
import gloss as GL
_s = importlib.util.spec_from_file_location("gz", os.path.join(MIN, "gazetteer.py"))
gz = importlib.util.module_from_spec(_s); _s.loader.exec_module(gz)
_s = importlib.util.spec_from_file_location("ex", os.path.join(MIN, "extract.py"))
ex = importlib.util.module_from_spec(_s); _s.loader.exec_module(ex)
ex_locations = ex.locations_from
# identical to extract_texts.STYPE — the type is carried separately, so the
# gazetteer is asked about the bare name
STYPE_RE = re.compile(r"\s+(Street|Avenue|Boulevard|Road|Way|Drive|Place|Terrace|Alley|"
                      r"Lane|Court|Park|Plaza|Square|Highway|Circle|Path|Walk)$")

# ---------------------------------------------------------------- policy knobs
OMNIBUS_STREETS = 6      # an item naming more than this is a LIST, not a place;
                         # it may still land at addr/segment/corner precision but
                         # is never allowed to smear at `street` precision.
MAX_STREET_BLOCKS = 60   # a street-tier item fronting more blocks than this is
                         # dropped rather than smeared over half the city
TOPK = 12                # decisions materialised per block in the click payload
SNIP = 260               # characters of decision text kept in the click payload

# ---------------------------------------------------------------- vocabulary
# phases.py collapses 100 hand-authored beat types onto 7 phases the renderer
# already switches on. The Journal is not hand-authored, so the phase has to come
# from the Board's own verbs. Each list below is a verb that actually occurs in
# this corpus, assigned to the phase whose member-labels it matches in phases.py.
PHASE_CUES = [
 ("opened",    r"\b(accept(?:ing|ance|ed)?|completion|completed|dedicat(?:e|ing|ed)|"
               r"open(?:ing|ed) to (?:public )?(?:travel|traffic)|final(?:ly)? accept)"),
 ("building",  r"\b(improv(?:e|ing|ement)|pav(?:e|ing)|repav|grad(?:e|ing)|sewer|"
               r"construct(?:ion|ing)?|widen(?:ing)?|extend(?:ing|sion)|lay(?:ing)? "
               r"(?:down|a)|repair(?:ing|s)?|install(?:ing|ation)?|erect(?:ing|ion)?)"),
 ("funded",    r"\b(appropriat|set aside|award(?:ed|ing)? (?:the )?contract|bond|"
               r"claim dated|demand|assessment|expend|purchase price|damages)"),
 ("contested", r"\b(protest|object(?:ion|ing)|denied|deny|refus|remonstrance|"
               r"appeal|disapprov|reject(?:ed|ing)?|hearing (?:of|on)|opposi)"),
 ("stalled",   r"\b(postpon|continu(?:ed|ance) to|refer(?:red)? back|lay(?:ing)? "
               r"over|tabled|withdraw)"),
 ("decided",   r"\b(chang(?:e|ing) the name|nam(?:e|ing) of|clos(?:e|ed|ing) and "
               r"abandon|abandon(?:ment|ed)?|vacat(?:e|ing|ion)|establish(?:ing)? "
               r"the (?:grade|width)|zon(?:e|ing)|reclassif|conditional use|permit)"),
 ("proposed",  r"\b(petition|intention|proposed|notice of|referred to|introduc|bill no)"),
]
PHASE_RX = [(p, re.compile(rx, re.I)) for p, rx in PHASE_CUES]
PHASE_ORDER = {"opened": 0, "building": 1, "decided": 2, "funded": 3,
               "contested": 4, "stalled": 5, "proposed": 6}
# how much a phase adds to the rank. Something the city BUILT or FINISHED on your
# block reads better than a bill being referred to committee.
PHASE_W = {"opened": 1.0, "building": .8, "contested": .7, "decided": .6,
           "funded": .5, "stalled": .3, "proposed": .0}

def phase_of(t):
    for p, rx in PHASE_RX:
        if rx.search(t):
            return p
    return "proposed"

# roll-call boilerplate: an item that is mostly a vote list says nothing about
# the place, and there are thousands of them.
# WHAT A BLOCK'S RECORD IS ABOUT. Same construction as the phases above and the
# same discipline: every cue below is a phrase that actually occurs in this corpus,
# and 81.4% of placed decisions match at least one. The block summary is written
# from the counts these produce — nothing about a block is composed by hand.
SUBJECT_CUES = [
 ("street paving",        r"\b(pav(?:e|ed|ing)|repav|macadam|bitumin|basalt|"
                          r"grad(?:e|ed|ing)\b|regrad|sidewalk|curb|crosswalk|"
                          r"street work|improvement of .{0,40}(?:street|avenue))"),
 ("sewers",               r"\b(sewer|drainage|storm drain|catch basin|culvert)"),
 ("business permits",     r"\b(permit|licen[cs]e)\b"),
 ("street lighting",      r"\b(electrolier|street light|lamp post|lighting of)"),
 ("payments and claims",  r"\b(claim dated|demand|appropriat|set aside|sum of \$|"
                          r"payment to|expenditure)"),
 ("land bought and sold", r"\b(condemn|acquir|purchase of|offer to sell|deed to|"
                          r"quitclaim|easement|right of way)"),
 ("streetcar lines",      r"\b(railway|railroad|street car|streetcar|trolley|"
                          r"municipal railway)"),
 ("zoning",               r"\b(zone|zoning|reclassif|set-?back|conditional use|"
                          r"variance|use district)"),
 ("subdivision maps",     r"\b(final map|tentative map|subdivision|condominium|"
                          r"parcel map)"),
 ("street names and closures", r"\b(chang(?:e|ing) the name|nam(?:e|ing) of|"
                          r"vacat(?:e|ing|ion) of|clos(?:e|ed|ing) and abandon|"
                          r"abandonment|widening of|extension of)"),
 ("public buildings",     r"\b(school|engine house|fire house|hospital|library|"
                          r"playground|police station|city hall|auditorium)"),
 ("water mains",          r"\b(water main|hydrant|water department|reservoir|"
                          r"pipe line)"),
 ("assessments and appeals", r"\b(assessment|appeal|protest|remonstrance)"),
 ("oil tanks and boilers", r"\b(oil storage tank|gallons capacity|boiler|"
                          r"horsepower|gasoline)"),
]
SUBJECT_RX = [(n, re.compile(x, re.I)) for n, x in SUBJECT_CUES]


def subjects_of(t):
    return [n for n, rx in SUBJECT_RX if rx.search(t)]


ROLL = re.compile(r"\b(Ayes?|Noes?|Absent|Excused)\s*[:\-—]", re.I)
SUPES = re.compile(r"\bSupervisors?\b")

# WHAT THE BODY OF A MODERN CHUNK OFTEN IS, AND NONE OF IT IS A SENTENCE ABOUT A
# PLACE. The Clerk puts the substance of a legislative file in the bracketed
# title he prints ABOVE it; what is left under that title is very often a
# disposition stamp, the vote it carried, or the printer's footer. Counted over
# the 2,729 rows this change adds to the block layer:
#
#     255  nothing at all — a stamp with its boilerplate stripped
#     761  a bare vote list  "11 - Cohen, Brown, Fewer, Kim, Mandelman, …"
#     132  a vote count then prose  "1 - Walton Supervisor Walton was noted
#                                    present at 5:55 p.m. Severed from …"
#      60  the printer's own footer  "City and County of San Francisco Page 946
#                                     Printed at 1:42 pm on 1/17/18"
#     127  a procedural motion  "Supervisor Safai, seconded by Supervisor Cohen,
#                               moved that this…"
#   1,335  of 2,729 — 48.9% of them
#
# Each line above is a shape that OCCURS, counted, not a shape anticipated. A row
# whose only words are a list of eleven surnames is not a record of anything and
# must not be published as one; the title the Clerk printed over it is.
NO_SENTENCE = (
    re.compile(r"^\s*$"),
    re.compile(r"^\s*\d{1,2}\s*[-\u2013\u2014]\s*[A-Z][A-Za-z'\u2019-]+"
               r"(?:,\s*[A-Z][A-Za-z'\u2019-]+){2,}"),
    re.compile(r"^\s*\d{1,2}\s*[-\u2013\u2014]\s*[A-Z][A-Za-z'\u2019-]+\s+[A-Z]"),
    re.compile(r"City and County of San Francisco\s+Page\s+\d+|Printed at\s+\d"),
    re.compile(r"^Supervisor\s+\S+,\s+seconded by\s+Supervisor"),
)


def no_sentence(line):
    return any(rx.search(line or "") for rx in NO_SENTENCE)
NOISE = re.compile(r"[^A-Za-z0-9 ]")

# The segment grammar, and the reason it is two grammars.
#
# The Board writes "X street, between Y and Z". The Bureau of Engineering and the
# DPW annual reports write "X Street from Y Street to Z Street", and they do it
# 3.6 times more often than they write "between" (303 : 85, measured over six
# volumes in series/BLOCK-SERIES.md §2). A test for the literal word "between"
# reads one of those two corpora and is blind to the other: merged unchanged, 233
# works that name both their limits arrive as a corner or a whole street.
#
# So the clause connector is a pair — (opener, joiner) — and a clause qualifies
# when it carries EITHER pair in the right order: the opener between the first and
# second street, the joiner between the second and third. Everything else about
# the tier is untouched: same unbroken-clause rule, same 190-character span, same
# <=6-block corners, same 140 m perpendicular guard, same <=24-block cap. This
# widens what is READ, never what is inferred from it.
# SEG_FROM_TO switches the second grammar on. It exists as a flag because the
# widening had to be measurable as ONE variable against the corpus that was already
# shipped: merge/ab_segment.py flips it and scores both arms. Result, on the
# unchanged 55-volume Journal corpus: 763 items gain a tier, 0 lose one, and the
# blocks those 763 claim fall from 13,814 to 3,572 - the tier is a TIGHTENING.
SEG_FROM_TO = True
SEGWORD = re.compile(r"\b(?:between|from)\b", re.I)
BETWEEN = re.compile(r"\bbetween\b", re.I)     # kept: the name other call sites import

# "from X to Y" is also how the Journal writes a metes-and-bounds LOT, and a lot is
# a point, not a run: "Grove street, distant thereon 82 feet 6 inches easterly FROM
# Polk street, of dimensions 30 feet frontage by a uniform depth of 120 feet TO Birch
# avenue" is one parcel behind Grove, and reading it as Grove-from-Polk-to-Birch
# spread it over 7 blocks where the corner tier had correctly held it to 1. The tell
# is always a dimension word, never the street names. Refusing on it costs 10 clauses
# across the whole corpus and every one of the 10 is a lot description; 1,846 real
# "from ... to" runs are unaffected. Applied to this pair ONLY, so the Board's own
# "between ... and" grammar is character-for-character what it always was.
LOTDESC = re.compile(r"\b(?:depth|dimensions|distant thereon|frontage)\b", re.I)

# ---- "bounded by A, B and C streets" -------------------------------------------
# The Park Commissioners never write a segment and never write an address. They
# place a park by naming what encloses it: "Columbia Square - contains 2.52 acres
# and is bounded by Columbia, Harrison, Sherman and Folsom Streets." Three or four
# streets that all front ONE block is TIGHTER evidence than a segment, not looser -
# it is the record drawing the block's own outline.
#
# WHAT TIER THIS REPORTS AT, AND WHY IT IS NOT ITS OWN. A bounded clause deserves a
# tier of its own next to `addr`. It does not get one here, because `tier_names` is
# the vocabulary the renderer words its pill from, a sixth name would render as the
# bare string "bounded" with an empty tooltip, and gen/ is being patched by three
# other agents two days before a demo. So a bounded clause is reported as `corner`,
# whose published wording - "the record names two streets, and this block fronts
# both" - is TRUE of it, merely weaker than the record deserves. It understates; it
# never overstates. What ships is the thing that matters: the reader lands on the
# ONE right block instead of the handful a corner would have given. Promoting it
# later is two dictionary entries in gen/part4.html plus a name in tier_names.
BOUNDED = re.compile(r"\bbounded\s+by\b", re.I)


def bounded_blocks(keys, idx):
    """The block(s) fronting EVERY street the record says bound the place.

    FULL INTERSECTION ONLY, and that is a deliberate narrowing of the version in
    series/place.py, which fell back to "all but one of the named streets" when no
    block fronted them all. That fallback is right for a park with private property
    on its fourth side and wrong for the Board, because the Board writes
    "the AREA bounded by Sacramento Street, Grant Avenue, California and Taylor
    Streets" - a four-block zoning district, not a block. Dropping one street from
    that set put the decision on 0221/0222 when the same sentence went on to say
    "Assessor's Block 242": 423 m out, at the wrong end of the district.

    Measured on the Journal items that print their own block: the fallback places
    192 items and gets 3 of 4 checkable ones right; the full intersection places 58
    and gets 3 of 3. The 134 it gives up are not lost - they fall through to the
    corner tier below, which places them and says only what a corner can say. A
    block that does not front a street the record names is an inference the record
    does not support, and this index does not make it.
    """
    sets = [s for s in (set(idx.get(k, {})) for k in keys) if s]
    if len(sets) < 3:
        return []
    all_ = set.intersection(*sets)
    return sorted(all_) if all_ and len(all_) <= 4 else []

# The Board sometimes writes the assessor block number itself — "Lot 7, Block 2622,
# as per the Assessor's Block Books, also known as No. 336 Castro street". 864 items
# do, and 772 name a block that still exists. That is not an inference at all, it is
# the city stating the answer, and SF assessor block numbers have been stable for the
# century this corpus covers: on the 139 address-tier placements that also state a
# block, the independent street-and-number join lands on the SAME block 86% of the
# time. So a stated block outranks everything the index can infer.
STATED = re.compile(r"Assessor'?s?\s+Block\s+(?:No\.?\s*)?(\d{3,4}[A-Z]?)\b", re.I)

# ── THE CLERK WRITES IT DIFFERENTLY, AND THE REGEX ABOVE READS NONE OF IT ─────
# The Journal prints "Assessor's Block 2622". The Clerk of the Board prints
#
#     Assessor’s Parcel Block No. 3568, Lot No. 003
#             ^ a curly apostrophe    ^ a lot number after it
#               ^ the word Parcel between Assessor's and Block
#
# and `STATED` requires `Assessor'?s?` immediately followed by whitespace and
# `Block`, so all three of those break it. Measured over the Board's own PDFs:
# 1,362 items state their own parcel block and `STATED` matched exactly ONE.
#
# THE FORMS BELOW ARE AN INVENTORY, NOT AN ANTICIPATION. Every branch is a string
# the corpus prints; `us_sf_city/measure_stated_blocks.py --inventory` enumerates
# them with counts and an example of each, and counts what is refused as
# carefully as what is taken:
#
#   qualifier   Assessor’s / Assessor's / Assessors / Assessor s / Assessor
#               then optionally Parcel, then Block, then optionally "(Block)"
#   number word No. · No · No: · Nos. · Number · Numbers · nothing
#   the number  4 digits 1,582 · 4+letter 71 · 3 digits 22 · 2 digits 6
#   lists       "Nos. 6332 and 6331"  ·  "Nos. 2780, 2783, 2784, …" (29 of them)
#
# AND FOUR REFUSALS, EACH OF WHICH A ONE-LINE REGEX WOULD HAVE TAKEN:
#
#   a RANGE            "Assessor Parcel Block Nos. 41 through 43" is Mission Bay
#                      South's REDEVELOPMENT blocks 41-43, printed under the word
#                      Assessor. 0041 and 0043 are real assessor blocks in the
#                      Financial District, 4 km from the Owens/A Street corner
#                      the same sentence names. A range is recorded, never resolved.
#   another county     "Assessor's Parcel Block No. 096-0155-004-01, known as
#                      11601 Main Street, Sunol" is an Alameda County APN. An SF
#                      assessor block is four digits, so a number followed by
#                      "-<digits>" is kept only when the number itself is four
#                      digits and what follows is a lot ("4285B-001").
#   a BOUNDARY block   "the summary street vacation of a portion of 25th Street,
#                      which is generally bounded by Assessor's Parcel Block
#                      No. 4241 … to the north, … No. 4298 …, No. 4299 …, and
#                      No. 4300 … to the south" names four blocks and the
#                      decision is on none of them. A sentence that says
#                      "bounded by" disqualifies every block in it.
#   OCR damage         "Assessor's BlocK 3S13" must not be read as block 0003, so
#                      a block number has to end at a character that is neither a
#                      digit nor a letter.
#
# The three things that print "Block <number>" and are not assessor blocks —
# "Community Development Block Grant" (35), "the 900 block of Mason Street" (62),
# "Mission Bay South Redevelopment Plan Block 13" — are excluded by construction
# rather than by a stop-list: the match has to begin at the word Assessor, and a
# number has to follow the word Block.
STATED_HEAD = re.compile(r"Assessor(?:[’'`]s|\s+s|s)?\s*(?:Parcel\s+)?"
                         r"Block\s*(?:\(Block\)\s*)?"
                         r"(?:Nos?\b[.:]?|Numbers?\b[.:]?)?\s*,?\s*(?:\(AB\)\s*)?", re.I)
STATED_NUM = re.compile(r"(\d{1,4})-?([A-Z]{1,2})?(?![0-9A-Za-z])")
STATED_SEP = re.compile(r"^\s*(?:,|;|and|&)\s*", re.I)
STATED_RANGE = re.compile(r"^\s*(?:through|thru|to)\s+\d", re.I)
STATED_NEIGH = re.compile(r"\s*(?:to|on|at)\s+the\s+(?:north|south|east|west)", re.I)
STATED_BOUND = re.compile(r"bounded\s+by", re.I)
STATED_SENT = re.compile(r"[.;]\s")


def _stated_wide(s, out):
    """Every block the Clerk's own sentence states for the item printing it."""
    for m in STATED_HEAD.finditer(s):
        n = STATED_NUM.match(s, m.end())
        if not n:
            continue
        p, nums = n.end(), [n.group(0)]
        if re.match(r"-\d", s[p:]):
            if not re.match(r"^\d{4}-?[A-Z]{0,2}$", n.group(0)):
                continue                      # another county's APN
        else:
            rng = False
            while True:
                if STATED_RANGE.match(s[p:]):
                    rng = True
                    break
                sp = STATED_SEP.match(s[p:])
                if not sp:
                    break
                n2 = STATED_NUM.match(s, p + sp.end())
                if not n2 or re.match(r"-\d", s[n2.end():]):
                    break
                nums.append(n2.group(0))
                p = n2.end()
            if rng:
                continue                      # a range of blocks, never expanded
        if STATED_NEIGH.match(s[p:p + 24]):
            continue                          # "… No. 0079 to the north"
        j = 0
        for b in STATED_SENT.finditer(s, 0, m.start()):
            j = b.end()
        if STATED_BOUND.search(s, j, m.start()):
            continue                          # the sentence bounds, it does not locate
        for x in nums:
            d = re.match(r"(\d+)-?([A-Z]*)", x)
            b = d.group(1).zfill(4) + d.group(2)
            if b not in out:
                out.append(b)
    return out


def stated_blocks(t, bmeta, wide=False):
    """The blocks this text states for ITSELF, best-effort and never inferred.

    `wide` reads the Clerk's forms as well as the Journal's. It is switched on
    per ROW, by where the row came from, and it is OFF by default so that
    nothing already published moves: applying the wide reading to the Journal
    too changes the stated set on 578 archive rows, 162 of them before 1999, and
    the pre-1999 layer is proved unmoved on every build. That is a separate
    change with its own move list and it is not made here.
    """
    out = []
    if wide:
        _stated_wide(re.sub(r"\s+", " ", t), out)
    else:
        for m in STATED.findall(re.sub(r"\s+", " ", t)):
            b = m.zfill(4) if m[-1].isdigit() else m
            if b not in out:
                out.append(b)
    return [b for b in out if b in bmeta]


# The item splitter cuts the page on Resolution|Ordinance|Motion, so the HEADING of
# the NEXT item trails into the end of this one. Hand-checking 40 placements caught
# two of exactly this: a 1915 appropriation for the Chief of Police's automobile
# carried "Church Street Municipal Railway Extension" from the next item and landed
# on a Glen Park block; a 1930 Portola Drive extension carried "Nineteenth Avenue
# From Sloat Boulevard" and landed in the Sunset. A decision ENDS at its roll call,
# so any street named after the roll call belongs to the next item, not this one.
ROLLEND = re.compile(
    r"\bAyes?\s*[\u2014:\-].{0,800}?(?:(?:Absent|Excused)\b[^.]{0,240}?\d{1,2}\s*[.\-\u2014]"
    r"|\d{1,2}\s*[.\-\u2014])", re.S | re.I)


def before_rollcall(r):
    """The street mentions that are really this decision's own.

    The roll call is searched in the item's own BODY, never in its preface: the
    preface is by construction printed before the body, so everything in it is on
    the near side of the cut, and a roll-call remnant left in the preface must
    never be allowed to cut the body's own streets away.
    """
    ms = LR(r)
    m = ROLLEND.search(r["t"])
    if not m or m.end() >= len(r["t"]) - 30:
        return ms
    cut = r.get("_sh", 0) + m.end()
    return [x for x in ms if x.get("o", 0) < cut]


# ---------------------------------------------------------------- the preface
# THE OTHER HALF OF THE SAME CUT. before_rollcall() refuses to read the trailing
# title as this item's location; blocks/prefaces.py hands that title to the item it
# belongs to. An item is therefore located from [ its preface + its body up to its
# own roll call ], which is the span the Journal actually printed for it.
#
# 6,643 located items had NO street on the body side of the cut, because their
# street was printed only in their title. Nothing here invents a location: the
# preface is text the record printed for this item, joined through the same
# gazetteer as everything else, and an item whose preface names no street stays
# unplaced.
def LT(r):
    """The text this item is LOCATED from — preface + body."""
    return r.get("_lt") or r["t"]


def LR(r):
    """The street mentions this item is located from, offsets into LT(r)."""
    return r.get("_lr") or r["r"]


def preface_locs(txt, gaz, keys):
    """Same resolution extract_texts.py runs on a body, run on the preface."""
    used, offs = set(), {}
    for m in ex.STREET.finditer(txt):
        nm = re.sub(r"^(?:On|At|In|To|From|Along|Near|Upon)\s+", "", m.group("name").strip())
        k = (f"{nm} {m.group('type').rstrip('s').title()}", m.group("num"))
        if k not in used:
            used.add(k); offs[k] = m.start()
    out = []
    for L in ex_locations(txt):
        mt = STYPE_RE.search(L["street"])
        hit, how = gz.resolve(STYPE_RE.sub("", L["street"]), gaz, keys)
        if how == "unresolved":
            continue
        out.append({"s": gz.norm(hit), "d": hit, "a": L["number"],
                    "x": 1 if L["cross_of"] else 0, "h": how,
                    "ty": (mt.group(1) if mt else ""),
                    "o": offs.get((L["street"], L["number"]), 0)})
    return out


# The Board's minutes live at one prefix and their file is named after the
# meeting. Both are INVARIANTS THE BUILD PROVES rather than assumptions it makes
# — sfbos_gate() below refuses to build if a single row disagrees. That is what
# lets `u` stay two small parts instead of carrying a full URL on every row: the
# reader-facing link is reconstructed, and it cannot be reconstructed wrongly
# without the build stopping first.
SFBOS_NS = "sfbos:"
SFBOS_PREFIX = "https://sfbos.org/sites/default/files/"
SFBOS_SUFFIX = "_minutes.pdf"


def sfbos_gate(items):
    """Prove every Board-PDF row can be turned back into a link that opens.

    Checked on the whole corpus, every build:
      1. the URL is exactly PREFIX + <meeting stem> + SUFFIX, so the stem in `u`
         reconstructs it and nothing else has to be stored
      2. `page` is `n + 1`, so the 1-based page written into `u` is the page the
         sweep actually read the text from

    A dead link under a real decision is worse than no link, so this raises
    rather than warns. Verified 2026-08-26: all 372 meetings return HTTP 200
    application/pdf, and no cited page falls beyond its file's page count.
    """
    n = bad_url = bad_page = 0
    for r in items:
        v = r.get("v") or ""
        if not v.startswith(SFBOS_NS):
            continue
        n += 1
        stem = v[len(SFBOS_NS):]
        if r.get("url") != SFBOS_PREFIX + stem + SFBOS_SUFFIX:
            bad_url += 1
        if r.get("page") != (r.get("n") or 0) + 1:
            bad_page += 1
    if bad_url or bad_page:
        raise SystemExit(
            f"sfbos citation gate FAILED on {n:,} Board-PDF rows: "
            f"{bad_url:,} URL(s) not PREFIX+stem+SUFFIX, "
            f"{bad_page:,} page(s) != n+1. The reconstructed link would not "
            f"open. Fix the sweep or carry the URL per row; do not publish.")
    if n:
        print(f"sfbos citation gate: {n:,} Board-PDF rows, all reconstructible",
              flush=True)
    return n


def load_items():
    """The located items, each with its own preface attached.

    Returns (items, n_prefaced, n_recovered) where n_recovered counts items that
    had no resolvable street in their body at all and are located only by the
    title the Journal printed above them.
    """
    pre = {}
    p = os.path.join(CACHE, "prefaces.json")
    if os.path.exists(p):
        pre = json.load(open(p))
    gaz = gz.build(); keys = list(gaz)
    items, n_pre, n_new = [], 0, 0
    for r in map(json.loads, open(ITEMS)):
        d = pre.get(f'{r["v"]}|{r["i"]}')
        # TWO RECORD SYSTEMS, ONE PREFACE. The Journal's title has to be
        # RECONSTRUCTED — blocks/prefaces.py walks the pages and decides, on a
        # connectedness test, which trailing text belongs to the item below.
        # The Clerk's title needs no such test: he prints "NNNNNN [" at the head
        # of its own line above the item it introduces, 24,624 times and never
        # once mid-line, so the sweep carries it on the row as `hp`.
        ptxt = (d or {}).get("p") or r.get("hp") or ""
        pl = preface_locs(ptxt, gaz, keys) if ptxt else []
        if pl:
            sh = len(ptxt) + 1
            r["_sh"] = sh
            r["_lt"] = ptxt + " " + r["t"]
            r["_lr"] = pl + [dict(m, o=m.get("o", 0) + sh) for m in r["r"]]
            n_pre += 1
            if not r["r"]:
                n_new += 1
        if LR(r):
            items.append(r)
    return items, n_pre, n_new



# ---------------------------------------------------------------- inputs
# The record writes the street TYPE and it is load-bearing. San Francisco has a
# numbered Avenue grid in the Richmond and Sunset AND a numbered Street grid in the
# Mission and SoMa; gazetteer.norm() throws the type away, so "Nineteenth Street"
# and "Nineteenth Avenue" collapse onto one key that fronts 136 blocks on opposite
# sides of the city. 60 keys collide this way over 3,062 block-links. Keeping the
# type is what stops a Mission paving order from appearing in the Sunset.
TYPEMAP = {"Street": "ST", "Avenue": "AVE", "Boulevard": "BLVD", "Road": "RD",
           "Way": "WAY", "Drive": "DR", "Place": "PL", "Terrace": "TER",
           "Alley": "ALY", "Lane": "LN", "Court": "CT", "Park": "PARK",
           "Plaza": "PLZ", "Highway": "HWY", "Circle": "CIR", "Walk": "WALK"}
ANY = "*"


def street_index():
    """'NAME|TYPE' -> {block: [lo, hi]} from REAL parcel address ranges, plus a
    'NAME|*' union used only when the record's type names nothing that exists."""
    idx = collections.defaultdict(dict)
    def put(k, bn, lo, hi):
        e = idx[k].get(bn)
        if e is None:
            idx[k][bn] = [lo or 10**9, hi]
        else:
            if lo: e[0] = min(e[0], lo)
            if hi: e[1] = max(e[1], hi)
    for r in json.load(open(os.path.join(GEO, "addresses.json"))):
        sn = (r.get("street_name") or "").strip()
        bn = (r.get("block_num") or "").strip()
        ty = (r.get("street_type") or "").strip().upper()
        if not sn or not bn or sn == "UNKNOWN":
            continue
        k = gz.norm(sn)
        try:
            lo = int(r.get("from_address_num") or 0); hi = int(r.get("to_address_num") or 0)
        except ValueError:
            lo = hi = 0
        if ty:
            put(f"{k}|{ty}", bn, lo, hi)
        put(f"{k}|{ANY}", bn, lo, hi)
    for k in idx:
        for bn, e in idx[k].items():
            if e[0] == 10**9: e[0] = 0
    return idx


def geometry_guard(idx, blocks):
    """Throw out any (street, block) pair the MAP does not support.

    The address table is one source; the street centrelines are an independent one.
    A block that fronts a street is within a roadway half-width of its centreline, so
    a pair whose block outline is more than 150 m from every centreline of that street
    is an error in the address table and is dropped rather than published.
    """
    import numpy as np
    LON0, LAT0, MPD = -122.4380, 37.7600, 111320.0
    COSL = math.cos(math.radians(LAT0))
    pts = collections.defaultdict(list)
    for r in json.load(open(os.path.join(GEO, "streets.json"))):
        g = r.get("line")
        if not g or g.get("type") != "LineString":
            continue
        k = gz.norm(r.get("street") or "")
        ty = (r.get("st_type") or "").strip().upper()
        if not k:
            continue
        for c in g["coordinates"]:
            p = ((c[0] - LON0) * MPD * COSL, (c[1] - LAT0) * MPD)
            if ty: pts[f"{k}|{ty}"].append(p)
            pts[f"{k}|{ANY}"].append(p)
    SP = {k: np.array(v) for k, v in pts.items() if v}
    BR = {b["b"]: np.array(b["ring"]) for b in blocks}
    dropped = kept = nogeo = 0
    for k in list(idx):
        P = SP.get(k)
        if P is None:
            nogeo += len(idx[k]); continue
        for bn in list(idx[k]):
            R = BR.get(bn)
            if R is None:
                del idx[k][bn]; dropped += 1; continue
            d2 = ((P[None, :, 0] - R[:, None, 0]) ** 2 +
                  (P[None, :, 1] - R[:, None, 1]) ** 2).min()
            if d2 > 150.0 ** 2:
                del idx[k][bn]; dropped += 1
            else:
                kept += 1
    print(f"geometry guard: kept {kept:,} street-block pairs, dropped {dropped:,}, "
          f"{nogeo:,} pairs on streets with no centreline", flush=True)
    return idx


def KEY(m, idx):
    """The index key for one street mention: type-specific when the type exists."""
    k = m["s"]
    t = TYPEMAP.get((m.get("ty") or "").title())
    if t and idx.get(f"{k}|{t}"):
        return f"{k}|{t}"
    return f"{k}|{ANY}"


def good_number(a, text):
    """A house number the SOURCE really prints as a house number.

    6.0% of parsed numbers are fund balances ('230.53 Potrero Avenue') or OCR-split
    addresses ('10.34 Geary' for 1034). Both put a decision on a specific WRONG
    block, which is the worst failure this index can produce, so both are dropped.
    """
    if not a or a.startswith("0") or len(a) < 2:
        return False
    return re.search(r"(?<![\d,.$])" + re.escape(a) + r"(?![\d])", text) is not None


# ── LOCATE, LIFTED OUT OF main() ─────────────────────────────
# Verbatim the body main() has always run, moved out so it can be run a SECOND
# time with the stated-block shortcut switched off. That second run is the only
# ground truth this index has: the decisions where the Journal prints its own
# assessor block, joined again as if it had not, and compared. With use_stated on
# the two calls are the same code, and measure_accuracy.py asserts the tier counts
# come back identical to the shipped index, so the measurement cannot drift away
# from what ships.
def locate(items, idx, bmeta, bpos, order, use_stated=True):
    placed, unplaced = [], collections.Counter()
    tier_n = collections.Counter()
    for did, r in enumerate(items):
        # t is what the item is LOCATED from: its preface plus its body. The
        # stated-block shortcut stays on the body alone — "Assessor's Block 2622"
        # is the record answering for ITSELF, and that is also the ground truth
        # measure_accuracy.py scores against, so it is never read out of a preface.
        t = LT(r)
        ms = before_rollcall(r)
        if not ms:
            unplaced["all streets named after the roll call (next item bleed)"] += 1
            continue
        for m in ms:
            m["K"] = KEY(m, idx)
        hits, tier = [], None

        # -- 3 addr ------------------------------------------------------
        focus = {}
        # `wide` is decided by WHERE THE ROW CAME FROM, not by its year: the
        # Clerk's forms are read on the Clerk's own PDFs. See stated_blocks().
        sb = (stated_blocks(r["t"], bmeta, wide=r["v"].startswith(SFBOS_NS))
              if use_stated else [])
        if sb and len(sb) <= 4:
            hits, tier = list(sb), 4
            # the focus is where the snippet is cut from, so it has to be the
            # sentence that STATED THE BLOCK, read with the same regex that
            # found it — the Journal's or the Clerk's
            _s = re.sub(r"\s+", " ", r["t"])
            mm = (STATED_HEAD if r["v"].startswith(SFBOS_NS) else STATED).search(_s)
            _sh = r.get("_sh", 0)
            for bn in sb:
                focus.setdefault(bn, _sh + (mm.start() if mm else 0))
        for m in (() if hits else ms):
            if not good_number(m.get("a"), t):
                continue
            a = int(m["a"])
            # No slack. A +-1 tolerance let "600 Van Ness Avenue" match a block
            # whose only address is 601 — the opposite side of the street — and put
            # a 1995 rezoning on the wrong block, while the source itself named
            # "Assessor's Block 763". The record is precise here; so is this.
            c = [bn for bn, (lo, hi) in idx.get(m["K"], {}).items()
                 if lo and lo <= a <= hi]
            if c:
                hits += c; tier = 3
                for bn in c:
                    focus.setdefault(bn, m.get("o", 0))

        # -- 2 segment: "X street between Y and Z" -----------------------
        if not hits and SEGWORD.search(t) and len(ms) >= 3:
            for j in range(len(ms) - 2):
                A, B, C = ms[j]["K"], ms[j + 1]["K"], ms[j + 2]["K"]
                fa = idx.get(A, {})
                if not fa or A in (B, C):
                    continue
                # "X street, between Y and Z" is ONE CLAUSE. Omnibus items list many
                # such clauses in a row, and pairing a street from one clause with a
                # street from the next fabricates a segment the Board never voted on:
                # "Moraga street, between Thirty-first and Thirty-second avenues.
                # Thirty-eighth avenue, between Santiago and Taraval streets." was
                # being read as Moraga from 32nd to 38th, six blocks of invented
                # decision. The source punctuates its own clauses, so the clause is
                # required to be unbroken, and to actually read "between ... and".
                oa, ob, oc = ms[j].get("o", 0), ms[j + 1].get("o", 0), ms[j + 2].get("o", 0)
                if not (oa < ob < oc) or oc - oa > 190:
                    continue
                span = t[oa:oc]
                if re.search(r"[.;:]\s", span):
                    continue
                lo_ab, lo_bc = t[oa:ob].lower(), t[ob:oc].lower()
                if "between" in lo_ab and " and " in lo_bc:
                    pass                                    # the Board's grammar
                elif (SEG_FROM_TO and " from " in lo_ab and " to " in lo_bc
                      and not LOTDESC.search(span)):
                    pass                                    # the Engineering grammar
                else:
                    continue
                c1 = [bn for bn in fa if bn in idx.get(B, {})]
                c2 = [bn for bn in fa if bn in idx.get(C, {})]
                # A corner is a handful of blocks. Two PARALLEL streets share a
                # whole strip of blocks running the length of the city, and reading
                # that as a corner is what put "Thirty-first and Thirty-second
                # avenues between Balboa and Cabrillo" (Richmond) on a Sunset block.
                if not c1 or not c2 or len(c1) > 6 or len(c2) > 6:
                    continue
                p1 = [bpos[b] for b in c1 if b in bpos]
                p2 = [bpos[b] for b in c2 if b in bpos]
                if not p1 or not p2:
                    continue
                x1 = (sum(p[0] for p in p1) / len(p1), sum(p[1] for p in p1) / len(p1))
                x2 = (sum(p[0] for p in p2) / len(p2), sum(p[1] for p in p2) / len(p2))
                vx, vy = x2[0] - x1[0], x2[1] - x1[1]
                L2 = vx * vx + vy * vy
                if L2 < 400:            # the two corners are the same corner
                    continue
                seg = []
                for bn in fa:
                    p = bpos.get(bn)
                    if not p: continue
                    s = ((p[0] - x1[0]) * vx + (p[1] - x1[1]) * vy) / L2
                    # perpendicular distance keeps the segment ON the street
                    px = x1[0] + s * vx - p[0]; py = x1[1] + s * vy - p[1]
                    if -0.08 <= s <= 1.08 and (px * px + py * py) < 140 ** 2:
                        seg.append(bn)
                if seg and len(seg) <= 24:
                    hits += seg; tier = 2
                    for bn in seg:
                        focus.setdefault(bn, ms[j].get("o", 0))
                    break

        # -- 1b bounded: reported AS a corner, but narrowed to the block itself
        if not hits:
            for bm in BOUNDED.finditer(t):
                near = [m for m in ms if bm.end() <= m.get("o", 0) <= bm.end() + 200]
                ks = list(dict.fromkeys(m["K"] for m in near))
                bb = bounded_blocks(ks, idx) if len(ks) >= 3 else []
                if bb:
                    hits += bb; tier = 1
                    for bn in bb:
                        focus.setdefault(bn, bm.start())
                    break

        # -- 1 corner ----------------------------------------------------
        if not hits:
            for j in range(1, len(ms)):
                if not ms[j].get("x"):
                    continue
                both = set(idx.get(ms[j - 1]["K"], {})) & set(idx.get(ms[j]["K"], {}))
                if both and len(both) <= 8:
                    hits += list(both); tier = 1
                    for bn in both:
                        focus.setdefault(bn, ms[j - 1].get("o", 0))

        # -- 0 street ----------------------------------------------------
        # a street named in both the preface and the body is ONE street, not two,
        # and must not count twice against the omnibus threshold
        nuniq = len({(m["K"], m.get("a")) for m in ms})
        if not hits and nuniq <= OMNIBUS_STREETS:
            for m in ms:
                bs = list(idx.get(m["K"], {}))
                if bs and len(bs) <= MAX_STREET_BLOCKS:
                    hits += bs; tier = 0

        hits = sorted({h for h in hits if h in bmeta}, key=lambda b: order[b])
        if not hits:
            unplaced["omnibus (>%d streets, no number/corner)" % OMNIBUS_STREETS
                     if nuniq > OMNIBUS_STREETS else
                     "street fronts >%d blocks or no parcel on it" % MAX_STREET_BLOCKS] += 1
            continue
        tier_n[tier] += 1
        placed.append((did, tier, hits, focus))
    return placed, unplaced, tier_n


def main():
    idx = street_index()
    blocks = json.load(open(os.path.join(GEO, "blocks.json")))
    idx = geometry_guard(idx, blocks)
    idx = {k: v for k, v in idx.items() if v}
    bmeta = {b["b"]: b for b in blocks}
    bpos = {b["b"]: (b["cx"], b["cy"]) for b in blocks}
    order = {b["b"]: i for i, b in enumerate(blocks)}
    print(f"{len(idx):,} streets, {len(blocks):,} blocks", flush=True)

    # archive.org's /page/nN addresses a BookReader LEAF, and BookReader paginates
    # only the leaves scandata flags addToAccessFormats=true. The hOCR the sweep
    # counted from covers EVERY leaf, so the two indices diverge, and the gap grows
    # through a volume (3 at leaf 253, 9 at leaf 1389 in the 1974 volume). A constant
    # per-volume offset was measured first and is wrong for exactly that reason.
    # See fetch_leafmap.py — the mapping was confirmed against the page images.
    LEAFMAP = {}
    _lm = os.path.join(CACHE, "leafmap.json")
    if os.path.exists(_lm):
        LEAFMAP = json.load(open(_lm))
    print(f"exact leaf map for {len(LEAFMAP)} volumes", flush=True)

    def page_url(v, leaf):
        """-> ("<document>/<page>", exact?, kind)

        TWO RECORD SYSTEMS, TWO CITATION SHAPES, ONE FIELD.

        `u` keeps the two-part "<document>/<page>" it has always had. What
        changes is what resolves it, and `kind` says which:

          None  an archive.org scan. `<document>` is the IA identifier and
                `<page>` a BookReader LEAF, mapped through LEAFMAP.
          "b"   a PDF the Board posted itself. `<document>` is the file's stem
                and `<page>` its 1-based PDF page.

        The Board's page needs no map. The sweep reads the page index out of the
        PDF's own text layer, so `n` is that file's 0-based page and `n + 1` is
        the page a reader opens — there is no leaf/page divergence to correct
        and nothing to flag as approximate. `sfbos_gate()` proves both halves of
        that on every row before this is allowed to run.
        """
        if v.startswith(SFBOS_NS):
            return f"{v[len(SFBOS_NS):]}/{leaf + 1}", True, "b"
        m = LEAFMAP.get(v)
        if m and 0 <= leaf < len(m) and m[leaf] is not None:
            return f"{v}/{m[leaf]}", True, None
        return f"{v}/{leaf}", False, None

    items, n_pre, n_new = load_items()
    sfbos_gate(items)
    print(f"{len(items):,} located items "
          f"({n_pre:,} carry a preface, {n_new:,} of them located ONLY by it)", flush=True)

    # ---------------------------------------------------------- locate
    placed, unplaced, tier_n = locate(items, idx, bmeta, bpos, order)

    TN = {4: "stated", 3: "addr", 2: "segment", 1: "corner", 0: "street"}
    print("\nprecision:", {TN[k]: v for k, v in sorted(tier_n.items(), reverse=True)})
    tot = sum(tier_n.values())
    blockprec = tier_n[4] + tier_n[3] + tier_n[2] + tier_n[1]
    print(f"placed {tot:,}/{len(items):,} items "
          f"({100*tot/len(items):.1f}%); at BLOCK precision {blockprec:,} "
          f"({100*blockprec/len(items):.1f}% of located, {100*blockprec/tot:.1f}% of placed)")
    print("unplaced:", dict(unplaced), f" total {sum(unplaced.values()):,}")

    # ---------------------------------------------------------- rank
    def score(r, tier):
        t = r["t"]
        s = {4: 3.6, 3: 3.0, 2: 2.0, 1: 1.5, 0: 0.4}[tier]
        # money: the LARGEST SINGLE printed figure. Progress payments are never
        # summed — the record prints them separately and a sum would be fiction.
        amt = 0
        for a in r["m"]:
            try: amt = max(amt, float(a))
            except ValueError: pass
            if amt > 5e8: amt = 0
        if amt >= 100:
            s += min(math.log10(amt) - 1.5, 2.2)
        ph = phase_of(t)
        s += PHASE_W[ph]
        s -= 0.55 * math.log(len(LR(r)) + 1)      # 20 streets = a list, not a place
        if ROLL.search(t) and len(SUPES.findall(t)) >= 2:
            s -= 1.0                                # mostly a roll call
        if len(t) < 140:
            s -= 0.6
        return round(s, 3), ph, amt

    # which streets front each block, ranked by how much of the block they front
    b_streets = collections.defaultdict(list)
    for skey, d in idx.items():
        for bn in d:
            if bn in bmeta:
                b_streets[bn].append(skey)
    # Every street base fronting a block, uncapped. This is what decides whether a
    # heading is about THIS block or about a different address in the same list, so
    # it is needed before the rows are ranked, not just before they are written.
    BSTREETS = {bn: {k.split("|")[0] for k in ks} for bn, ks in b_streets.items()}
    # publish the type-specific key when one exists and drop the "|*" union for the
    # same name, so the renderer never fetches the same street twice under two keys
    for bn in b_streets:
        ks = set(b_streets[bn])
        typed = {k.split("|")[0] for k in ks if not k.endswith("|" + ANY)}
        b_streets[bn] = sorted(k for k in ks
                               if not (k.endswith("|" + ANY) and k.split("|")[0] in typed))[:6]

    # ---------------------------------------------------------- assemble
    by_block = collections.defaultdict(list)
    dec = {}
    FOCUS = {}
    for did, tier, hits, focus in placed:
        r = items[did]
        for bn, o in focus.items():
            # focus offsets are into LT(r) = preface + body; the snippet is cut
            # from the body, so shift back. A focus that landed in the preface
            # clamps to 0, i.e. "the item's opening words".
            FOCUS[(bn, did)] = max(0, o - r.get("_sh", 0))
        sc, ph, amt = score(r, tier)
        dec[did] = (r, tier, sc, ph, amt)
        for bn in hits:
            by_block[bn].append((sc, did, tier))

    # ------------------------------------------------------------ the line
    # THE BOARD'S OWN ONE-LINE SUMMARY, where the record prints one. See
    # blocks/headings.py: the item splitter cuts on Resolution|Ordinance|Motion and
    # the heading is printed above that word, so it was landing on the item before
    # and being thrown away. Half the decisions placed here have one; a third of the
    # rows on the page carry it, whole or as the category in front of a list entry.
    HEAD = json.load(open(os.path.join(CACHE, "headings.json")))
    GAZ = gz.build(); GAZ_KEYS = list(GAZ)
    # the streets a heading names, resolved through the same gazetteer as the index
    HSTREETS = {}
    for _k, _h in HEAD.items():
        _b = set()
        for _L in ex_locations(_h):
            _hit, _how = gz.resolve(STYPE_RE.sub("", _L["street"]), GAZ, GAZ_KEYS)
            if _how != "unresolved":
                _b.add(gz.norm(_hit))
        HSTREETS[_k] = _b
    # the same thing for the Clerk's own title, which arrives on the ROW rather
    # than in headings.json. Built once here for the same reason HSTREETS is:
    # gloss_of() is asked for a line thousands of times and must not re-resolve.
    HPS = {}
    for _r in items:
        _hp = _r.get("hp")
        if not _hp:
            continue
        _b = set()
        for _L in ex_locations(_hp):
            _hit, _how = gz.resolve(STYPE_RE.sub("", _L["street"]), GAZ, GAZ_KEYS)
            if _how != "unresolved":
                _b.add(gz.norm(_hit))
        HPS[f'{_r["v"]}|{_r["i"]}'] = _b
    VOCAB = GL.Vocab(json.load(open(os.path.join(CACHE, "vocab.json"))))
    _gcache = {}

    def gloss_of(did, bn, sk=None):
        """The one line this decision shows HERE — on this block, or under this
        street. Memoised: it is asked for once while ranking and once while
        writing, and it is not cheap.

        `bn` is an assessor block; `sk` is a street key, for the street-tier files
        which have no block at all. Passing neither used to mean "no streets to
        compare against", which silently failed every heading that named a street
        — 31,066 of the 49,440 rows on the page are street-tier, and all of them
        were losing their heading to a bug rather than to a rule.
        """
        ck = (did, bn or sk)
        if ck in _gcache:
            return _gcache[ck]
        r = dec[did][0]
        key = f'{r["v"]}|{r["i"]}'
        ctx = (BSTREETS.get(bn) or set()) if bn else ({sk.split("|")[0]} if sk else set())
        h = HEAD.get(key)
        v = GL.heading_verdict(h, HSTREETS.get(key) or set(), ctx, VOCAB)
        if v == "win":
            _gcache[ck] = (h, "h")
            return _gcache[ck]
        sent = GL.sentence_gloss(r["t"], FOCUS.get((bn, did)) if bn else None, SNIP,
                                 nxt=HEAD.get(f'{r["v"]}|{r["i"] + 1}'))
        if r.get("hp") and no_sentence(sent):
            # THE CLERK PRINTED A TITLE OVER THIS ITEM AND THE BODY UNDER IT SAYS
            # NOTHING. Only ever a FALLBACK: where the body is a sentence the
            # body wins, because the body is what the reader clicked through to.
            #
            # Guarded the same way `heading_verdict` guards a Journal heading: if
            # the title names streets and none of them fronts THIS block, it is
            # about a different address in the same file and it is not printed
            # here.
            _hs = HPS.get(key) or set()
            if not _hs or (_hs & ctx):
                # It is marked `h`, not `s`, because that is what it IS — the
                # heading the record printed — and `h` is the one value the front
                # end reads a category label off ("Final Map 8380 - 178-188
                # Albion Street" -> "Final Map 8380").
                #
                # Verbatim when it fits: `GL._fit` ends a line it did not have to
                # cut with an ellipsis, and an ellipsis on a whole printed title
                # is a claim ("there is more") that is not true.
                _ttl = r["hp"].strip()
                _gcache[ck] = (_ttl if len(_ttl) <= SNIP
                               else GL._fit(_ttl, SNIP), "h")
                return _gcache[ck]
        if v == "prefix":
            # "Oil and Boiler Permits - Bernard Bosq, at 1680 Clay street; 1500
            # gallons capacity." The entry is meaningless without the category it
            # was printed under, and the category is right there in the record.
            out = GL.compose(h, sent, SNIP)
            _gcache[ck] = (out, "p" if out != sent else "s")
            return _gcache[ck]
        _gcache[ck] = (sent, "s")
        return _gcache[ck]

    # dedupe within a block: the same ordinance is read twice and the Journal
    # reprints it verbatim. Key on the first 90 alphanumerics.
    # The Journal prints an ordinance at every reading, and the readings differ only
    # in the resolution number — so a signature that keeps digits does not collapse
    # them, and a Sunset block showed four near-identical 1928 sewer orders. Signing
    # on LETTERS ONLY of the de-boilerplated text collapses the readings and still
    # separates two genuinely different sewer orders on the same street.
    def sig(t):
        return re.sub(r"[^A-Za-z]", "", snip(t))[:110].upper()

    # Exact signatures are not enough. The Journal reprints an ordinance at each
    # reading and the OCR of the two printings differs (one Sunset block showed four
    # 1928 sewer orders that are two orders read twice), and the item splitter cuts
    # the two copies at different points, so their leading text differs too. Compare
    # what the two texts SAY instead: 4-word shingles, Jaccard over 0.55 is a reprint.
    def shingles(t):
        w = re.sub(r"[^a-z ]", " ", snip(t).lower()).split()
        w = [x for x in w if len(x) > 2]
        return {" ".join(w[i:i + 4]) for i in range(max(0, len(w) - 3))}

    def near_dup(a, b):
        if not a or not b:
            return False
        i = len(a & b)
        return i / min(len(a), len(b)) > 0.55

    # ...and an EXACT line key is not enough either, because the two printings are
    # two OCR passes: one Russian Hill block was showing "Bernard Bosq, at 1680
    # Clay street; 1500 gallons capacity." beside "...1500 gallons capaciiy."
    # Character 4-grams over the line, Jaccard above 0.86 — two different house
    # numbers on one street sit around 0.72, so this collapses the reprint and
    # keeps the neighbour.
    def grams(pk):
        return {pk[i:i + 4] for i in range(max(0, len(pk) - 3))}

    def near_dup_line(pk, prev):
        g = grams(pk)
        if len(g) < 8:
            return False
        return any(len(g & o) / min(len(g), len(o)) > 0.86 for o in prev[-40:] if o)

    click, full = {}, {}
    dup_dropped = 0

    # ---- THE NEAR-DUPLICATE PASS: ORDER-INDEPENDENT, AND SCOPED BY ERA ------
    #
    # This pass collapses TWO READINGS OF ONE DECISION — the same ordinance
    # printed twice, or OCR'd twice with "capaciiy" for "capacity".
    #
    # IT USED TO BE ORDER-SENSITIVE, AND THAT WAS THE BUG. It walked the block's
    # rows in rank order and compared each against a sliding window of the rows
    # already kept (`shs[-40:]`). Which member of a near-identical set survived
    # therefore depended on what had arrived before it, so merging new volumes
    # silently moved decisions on and off blocks that had nothing to do with the
    # new data: 78 pre-1999 decisions left blocks they had been on for the whole
    # life of this map, and 330 previously-suppressed ones surfaced. Nothing
    # about that is visible in a row count and nobody chose any of it.
    #
    # It is now a CLUSTERING. Near-duplicates are grouped by a symmetric test,
    # and each group elects a representative by a total order on the row's own
    # CONTENT (score, then year, date, page, text). Neither the grouping nor the
    # election can see the order the rows arrived in, so the same corpus produces
    # the same output however it is shuffled. `verify_order_independence.py`
    # asserts exactly that by shuffling the input and rebuilding.
    #
    # ***  THE CONSTRAINT THAT MATTERS MOST, AND IT IS COUNTER-INTUITIVE  ***
    # KEEP CROSS-MEETING COLLAPSE. DROP CROSS-ERA COLLAPSE.
    # Scoping suppression to a single MEETING sounds like the true invariant and
    # is badly wrong: the Journal legitimately prints one item across several
    # meetings — introduced at one, finally passed at another — and collapsing
    # those is work this pass is SUPPOSED to do. Measured: a same-meeting scope
    # moves 3,177 blocks and GROWS the pre-1999 layer by 3,966 decisions. It
    # looks like a win because the numbers go up. It is a decade of correct
    # suppression being silently undone.
    # An ERA cut is the widest scope that still forbids the thing that is never
    # right — a 2015 minute suppressing a 1926 ordinance — while leaving every
    # within-era, cross-meeting collapse exactly as it was.
    ERA_CUT = 1999
    FUZZY_HEAD = 60          # the head the pairwise tests run over, as before

    def _rowkey(z):
        """A TOTAL order on the row's own content. No input-order component.

        The last two components matter and were missing at first: without them
        two rows that agree on score, year, date, page and their opening 200
        characters tie, and Python's stable sort then falls back to the order
        they arrived in — which is exactly the dependence this is removing.
        `v` is the archive.org identifier and `i` the item's own sequence within
        that volume, both assigned by the sweep from the document itself, so the
        pair is unique per row and identical however the corpus is shuffled.
        `verify_order_independence.py` failed on precisely this: 1,352 of 2,197
        published files differed between two shuffles until these were added.
        """
        sc, did, tier = z
        r = dec[did][0]
        it = items[did]
        return (-sc, r.get("y") or 0, r.get("d") or "", r.get("u") or "",
                r.get("t") or "", it.get("v") or "", it.get("i") or 0)

    def _dedup(rows, bn):
        """Order-independent. Same rows in, same rows out, any order."""
        nonlocal dup_dropped
        rows = sorted(rows, key=_rowkey)

        # -- 1. exact signature, and the printed line: group, elect, drop the rest
        for keyf in (lambda z: sig(dec[z[1]][0]["t"]),
                     lambda z: re.sub(r"[^a-z0-9]", "",
                                      gloss_of(z[1], bn)[0].lower())[:90]):
            groups = {}
            for z in rows:
                k = keyf(z)
                if k == "":
                    groups[("", id(z))] = [z]      # an empty key groups with nothing
                else:
                    groups.setdefault(k, []).append(z)
            out = []
            for g in groups.values():
                g.sort(key=_rowkey)
                out.append(g[0])
                dup_dropped += len(g) - 1
            rows = sorted(out, key=_rowkey)

        # -- 2. THE PRINTED LINE, fuzzily, over EVERY row.
        #
        # LEADER ELECTION, NOT TRANSITIVE CLUSTERING, AND THE DIFFERENCE IS LARGE.
        # Union-find was tried first and over-collapses by chaining: A resembles
        # B, B resembles C, so A, B and C become one group and two of them are
        # dropped even when A and C are plainly different decisions. Measured on
        # a 400-row sample of what it removed: 41% had nothing like them left on
        # the block — about 3,500 real pre-1999 decisions deleted by transitivity.
        # The streaming version never chained, because it only ever compared a
        # candidate against rows it had already KEPT.
        #
        # So the rule is the same one, made order-independent: walk the rows in a
        # total order derived from their own CONTENT (_rowkey), and drop a row
        # only when it resembles a row already elected. No sliding window — the
        # comparison is against every leader, which is what removes the last
        # dependence on arrival order. Candidate leaders are found through an
        # inverted index on the six lexicographically smallest 4-grams of the
        # line, so this stays near-linear on blocks carrying thousands of rows;
        # the real 0.86 test still decides.
        pk_of = [re.sub(r"[^a-z0-9]", "", gloss_of(z[1], bn)[0].lower())[:90]
                 for z in rows]
        gr = [grams(pk) for pk in pk_of]
        kept, lead_gr = [], []
        for i, z in enumerate(rows):
            g = gr[i]
            # THE WINDOW STAYS, AND ONLY ITS ORDER CHANGES. Comparing against
            # EVERY leader was tried and is too aggressive: this test looks at
            # the printed LINE — about ninety characters of heading — and two
            # genuinely different decisions share one routinely ("Changing and
            # re-establishing the official grades on Capitol avenue, between
            # ..."). Unbounded, it deleted 1,240 pre-1999 decisions that had no
            # near-duplicate left anywhere on their block. The original bounded
            # the same coarse test to the last forty kept rows, and that bound
            # was doing real work. It is kept. What changes is that the forty are
            # now the last forty in a CONTENT order, not in arrival order, which
            # is the whole of the order-dependence and none of the behaviour.
            if len(g) >= 8 and any(
                    len(g & o) / max(1, min(len(g), len(o))) > 0.86
                    for o in lead_gr[-40:] if o):
                dup_dropped += 1
                continue
            lead_gr.append(g if len(g) >= 8 else None)
            kept.append(z)
        rows = kept

        # -- 3. THE SENTENCE, by shingle, over the head only — as before. This is
        # all a reader ever sees, and it keeps the pass O(k^2) on k = FUZZY_HEAD.
        head, tail = rows[:FUZZY_HEAD], rows[FUZZY_HEAD:]
        shs = [shingles(dec[z[1]][0]["t"]) for z in head]
        lead_sh, out = [], []
        for i, z in enumerate(head):
            if any(near_dup(shs[i], o) for o in lead_sh[-40:]):
                dup_dropped += 1
                continue
            lead_sh.append(shs[i])
            out.append(z)
        return sorted(out + tail, key=_rowkey)

    for bn, lst in by_block.items():
        old = [z for z in lst if (dec[z[1]][0]["y"] or 0) < ERA_CUT]
        new_ = [z for z in lst if (dec[z[1]][0]["y"] or 0) >= ERA_CUT]
        keep = sorted(_dedup(old, bn) + _dedup(new_, bn), key=_rowkey)
        full[bn] = [d for _, d, _ in keep]
        # decade diversity: no more than 4 of the top-K from one decade, so a
        # block does not show twelve 1928 paving orders and nothing else.
        dcount = collections.Counter(); top = []
        for sc, did, tier in keep:
            d10 = dec[did][0]["y"] // 10
            if dcount[d10] >= 4 and len(top) < TOPK:
                continue
            dcount[d10] += 1; top.append((did, tier))
            if len(top) >= TOPK: break
        if len(top) < TOPK:                      # top up if diversity starved it
            have = {d for d, _ in top}
            for sc, did, tier in keep:
                if did not in have:
                    top.append((did, tier))
                    if len(top) >= TOPK: break
        click[bn] = top
    print(f"\nduplicate readings dropped inside blocks: {dup_dropped:,}")

    # ---------------------------------------------------------- write
    #
    # LAYOUT. Block-precision links are only 70,505 (median 13 per block), so
    # they are materialised PER BLOCK with their text: one fetch answers one
    # click. Street-precision links are 693,060 for just 21,155 distinct
    # decisions — a 33x duplication — so those are stored ONCE PER STREET and
    # the block carries a 4-entry list of the streets that front it. The reader
    # sees the same split: "on this block" above, "on this street" below.
    MONEY_ON_ROW = re.compile(r"\$\s?([\d]{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{4,})")
    # a figure with cents and no dollar sign in front of it is a column out of a
    # table: "(1) Broadway, Scott to Divisadero * $1,498.00 (2) Broderick, Ellis
    # to O'Farrell 733.15 (3) Davis, Pacific to Broadway 929.00"
    BARE_FIGURE = re.compile(r"(?<![$\d.,])\d{1,3}(?:,\d{3})*\.\d{2}\b")

    def rec(did, tier, bn=None, sk=None):
        r, _, sc, ph, amt = dec[did]
        # the heading when the Board printed one and it is about THIS block,
        # otherwise the whole sentence the matched address sits in, otherwise —
        # and this is deliberate — no line at all. The archive title and the
        # collection still stand; invented prose would not.
        line, src = gloss_of(did, bn, sk)
        u, exact, kind = page_url(r["v"], r["n"])
        # MONEY THAT BELONGS TO THIS ROW, AND ONLY THAT. `amt` is the largest
        # figure anywhere in the item and it still ranks the item, but a
        # condominium map on Larkin Street was printing $23,585 lifted off the
        # claim above it in the same OCR window. Two rules, both about the LINE
        # the reader is reading rather than the item behind it:
        #   the figure has to be IN the line
        #   the line has to carry exactly ONE figure - a line holding several is
        #   a fragment of a claims table, and which of them belongs to this row
        #   is precisely what cannot be known
        on_row = {x.replace(",", "") for x in MONEY_ON_ROW.findall(line)}
        shown = float(next(iter(on_row))) if (
            len(on_row) == 1 and not BARE_FIGURE.search(line)) else 0
        out = {"y": r["y"], "d": (r["dt"] or "")[5:], "k": r["k"], "p": tier,
               "f": PHASE_ORDER[ph], "a": int(shown) if shown >= 100 else 0, "u": u,
               "t": line, "g": src}
        if kind:
            # absent on an archive.org row, so every byte published before this
            # existed is unchanged; present means "resolve this the other way".
            out["c"] = kind
        if not exact:
            # the page link for this volume could not be mapped onto BookReader's
            # leaf list, so it may be a page or two off. Flagged, not hidden.
            out["approx"] = 1
        return out

    W = lambda name, obj: (json.dump(obj, open(os.path.join(OUT, name), "w"),
                                     separators=(",", ":"), ensure_ascii=False),
                           os.path.getsize(os.path.join(OUT, name)))[1]
    import gzip as _g
    def GZ(name):
        return len(_g.compress(open(os.path.join(OUT, name), "rb").read(), 9))

    # ---- T0 first paint --------------------------------------------------
    own = {bn: [d for d in v if dec[d][1] >= 1] for bn, v in full.items()}
    st_of = {bn: [d for d in v if dec[d][1] == 0] for bn, v in full.items()}
    TN = {4: "stated", 3: "addr", 2: "segment", 1: "corner", 0: "street"}
    t0 = {"meta": {"generated_by": "scratchpad/sf-city-anim/blocks/build_index.py",
                   "n_blocks": len(blocks), "n_decisions_placed": len(dec),
                   "n_items_located": len(items), "n_unplaced": sum(unplaced.values()),
                   "tier_names": ["street", "corner", "segment", "addr", "stated"],
                   "precision_counts": {TN[k]: v for k, v in sorted(tier_n.items(), reverse=True)},
                   "shards": 256,
                   "leaf_mapped_volumes": sorted(LEAFMAP)},
          "b":  [b["b"] for b in blocks],
          "n":  [len(own.get(b["b"], [])) for b in blocks],
          "ns": [len(st_of.get(b["b"], [])) for b in blocks],
          "y0": [min((dec[d][0]["y"] for d in own.get(b["b"], [])), default=0) for b in blocks],
          "y1": [max((dec[d][0]["y"] for d in own.get(b["b"], [])), default=0) for b in blocks]}
    sizes = [("T0  block-index.json          first paint", W("block-index.json", t0),
              GZ("block-index.json"), 1)]

    # ---- what this block's record is ABOUT --------------------------------
    #
    # 43 decisions on Russian Hill are mostly paving, permits and oil-storage
    # tanks, and a reader meeting a list of 43 rows deserves to know that before
    # the first row. The line is COUNTED, never composed: the subject cues above
    # are matched against each decision's own text, the two commonest are named
    # with the number of decisions they cover, and the decade is named when one
    # holds a third of them. A block with fewer than four decisions gets no line —
    # summarising three rows is noise, and the rows are right there.
    SUBJ = {did: subjects_of(dec[did][0]["t"]) for did in dec}
    bsum = {}
    for bn, dids in own.items():
        N = len(dids)
        if N < 4:
            continue
        cnt = collections.Counter(x for d in dids for x in SUBJ[d])
        floor = max(2, 0.15 * N)
        tops = [n for n, c in cnt.most_common(2) if c >= floor]
        clauses = []
        if tops:
            u = sum(1 for d in dids if set(SUBJ[d]) & set(tops))
            if u >= 0.25 * N:
                # "oil tanks and boilers and business permits" is three ANDs in a
                # row; a label that already carries one is joined with ", or"
                j = ", or " if any(" and " in t for t in tops) else " and "
                what = tops[0] if len(tops) == 1 else j.join(tops[:2])
                clauses.append(f"{u} of the {N} decisions here are about {what}")
        d10 = collections.Counter(dec[d][0]["y"] // 10 * 10 for d in dids)
        dy, dc = d10.most_common(1)[0]
        if dc >= 0.3 * N:
            clauses.append((f"{dc} of them are from the {dy}s" if clauses
                            else f"{dc} of the {N} decisions here are from the {dy}s"))
        if clauses:
            bsum[bn] = ". ".join(clauses) + "."
    print(f"\nblock summaries written for {len(bsum):,} of the {len(own):,} blocks "
          f"that hold a decision")

    # ---- T1 the click: every block-precision decision, with text ----------
    SH = 256
    raw = gzs = 0
    for s_ in range(SH):
        pay = {}
        for i2, b in enumerate(blocks):
            if i2 % SH != s_: continue
            bn = b["b"]
            if own.get(bn) or st_of.get(bn):
                pay[bn] = {"d": [rec(d, dec[d][1], bn) for d in own.get(bn, [])],
                           "s": b_streets.get(bn, [])}
                if bsum.get(bn):
                    pay[bn]["w"] = bsum[bn]
        n = W(f"block-{s_:02d}.json", pay); raw += n; gzs += GZ(f"block-{s_:02d}.json")
    sizes.append((f"T1  block-NN.json x{SH}        one fetch per click", raw, gzs, SH))

    # ---- T2 street-tier, stored ONCE per street --------------------------
    by_street = collections.defaultdict(list)
    for did, (r, tier, sc, ph, amt) in dec.items():
        if tier != 0: continue
        for m in r["r"]:
            k = m.get("K") or KEY(m, idx)
            if k in idx:
                by_street[k].append((sc, did))
    STREET_CAP = 120
    st_kept = st_total = 0
    os.makedirs(os.path.join(OUT, "street"), exist_ok=True)
    raw = gzs = 0
    slug = lambda k: re.sub(r"[^A-Z0-9]+", "_", k)
    for k, lst in sorted(by_street.items()):
        # Score alone is not a total order: streets carry many rows at the same
        # score and the top-STREET_CAP cut then depends on the order they were
        # collected in, which is the order the corpus was read in. Same total
        # content key the block pass uses. verify_order_independence.py failed
        # on exactly these 1,095 street files after the block shards were fixed.
        lst.sort(key=lambda z: _rowkey((z[0], z[1], 0)))
        seen, keep = set(), []
        for sc, did in lst:
            if did in seen: continue
            seen.add(did); keep.append(did)
            if len(keep) >= STREET_CAP: break
        st_total += len(lst); st_kept += len(keep)
        f = f"street/{slug(k)}.json"
        n = W(f, [rec(d, 0, sk=k) for d in keep]); raw += n; gzs += GZ(f)
    SS = len(by_street)
    sizes.append((f"T2  street/<NAME>.json x{SS}  lazy, <=6 per click", raw, gzs, SS))

    W("unplaced.json", {"reasons": dict(unplaced), "n_located_items": len(items),
                        "n_placed": tot, "n_unplaced": sum(unplaced.values())})
    # These two strings described a layout this build has never written: the loop
    # above shards on `i % SH` with SH = 256, and a street file is named after its
    # own key. Anything reading shards.json would have fetched the wrong file.
    W("shards.json", {"block_shards": SH, "street_shards": SS, "street_cap": STREET_CAP,
                      "block_shard_rule": "index in b[] modulo %d, formatted %%02d" % SH,
                      "street_shard_rule": "street key, non-alphanumeric runs -> _"})

    print(f"\nstreet-tier: {st_total:,} street-decision pairs, kept {st_kept:,} "
          f"(cap {STREET_CAP}/street)")
    print("\nSIZES                                          raw KB    gzip KB   per-fetch gz")
    TR = TG = 0
    for name, r_, g_, cnt in sizes:
        TR += r_; TG += g_
        print(f"  {name:<44} {r_/1024:>8,.0f} {g_/1024:>10,.0f} {g_/cnt/1024:>13,.1f} KB")
    print(f"  {'TOTAL on disk':<44} {TR/1024/1024:>8,.2f} MB {TG/1024/1024:>9,.2f} MB")
    fp = sizes[0][2]
    print(f"\n  FIRST PAINT loads {fp/1024:,.0f} KB gz (T0 only) — every one of "
          f"{len(blocks):,} blocks becomes clickable")
    print(f"  ONE CLICK adds  {sizes[1][2]/SH/1024:,.0f} KB gz (1 block shard)"
          f" + {sizes[2][2]/SS/1024:,.0f} KB gz per street shard")

    # ---------------------------------------------------------- coverage
    import statistics as st2
    n_all = sorted(len(full.get(b["b"], [])) for b in blocks)
    n_own = sorted(len(own.get(b["b"], [])) for b in blocks)
    nzA = [x for x in n_all if x]; nzO = [x for x in n_own if x]
    print(f"\nCOVERAGE of {len(blocks):,} blocks")
    print(f"  >=1 decision of ANY precision      {len(nzA):,} ({100*len(nzA)/len(blocks):.1f}%)"
          f"   EMPTY {len(blocks)-len(nzA):,}")
    print(f"  >=1 BLOCK-PRECISION decision       {len(nzO):,} ({100*len(nzO)/len(blocks):.1f}%)"
          f"   none {len(blocks)-len(nzO):,}")
    print(f"  block-precision per block: median {st2.median(nzO):.0f}  p10 {nzO[int(.1*len(nzO))]}"
          f"  p90 {nzO[int(.9*len(nzO))]}  max {max(nzO)}")
    sh = sum(n_own[-int(.05*len(n_own)):]) / max(sum(n_own), 1)
    print(f"  busiest 5% of blocks hold {100*sh:.1f}% of block-precision links")
    for cut in (0, 1, 3, 5, 10, 25, 50):
        k = sum(1 for x in n_own if x > cut)
        print(f"    blocks with >{cut:>2} block-precision decisions: {k:>5,} ({100*k/len(blocks):>5.1f}%)")
    # by neighbourhood
    nh = collections.defaultdict(lambda: [0, 0, 0])
    for b in blocks:
        e = nh[b.get("nh") or "?"]
        e[0] += 1; e[1] += len(own.get(b["b"], [])); e[2] += 1 if own.get(b["b"]) else 0
    print("\n  by neighbourhood (blocks / with>=1 / median block-precision per block)")
    rowsn = sorted(nh.items(), key=lambda kv: -kv[1][0])[:18]
    for name, (nb, tl, wi) in rowsn:
        print(f"    {name[:30]:<30} {nb:>5} {100*wi/nb:>6.0f}%  {tl/nb:>7.1f} avg")

    json.dump({"dec": {str(k): {"v": items[k]["v"], "n": items[k]["n"], "y": items[k]["y"],
                                # the streets the item was LOCATED from — preface
                                # included — so verify_geo.py checks the join that was
                                # actually made, not half of it
                                "t": items[k]["t"], "r": LR(items[k]), "p": dec[k][1]}
                       for k in dec},
               "own": own, "street_of": st_of,
               "b_streets": {k: v for k, v in b_streets.items()}},
              open(JOINED, "w"))


if __name__ == "__main__":
    main()
