"""THE NEIGHBOURHOOD — the same four answers as a block, one level up.

Daniel: *"hmm no I'd rather something more about a neighbourhood than hyper
localized blocks."*

Nothing here is new material. Every figure this script emits is a **rollup of a
file that already shipped**, over the membership the map itself already
publishes — so the neighbourhood cannot disagree with the block a reader clicks
into. What changes is coverage, and it changes by two orders of magnitude:

    public money          30 of 5,404 blocks  (0.6 %)  ->  20 of 41 hoods (49 %)
    a published place     66 of 5,404 blocks  (1.2 %)  ->  27 of 41 hoods (66 %)
    a census count     4,594 of 5,404 blocks  (85 %)   ->  41 of 41 hoods (100 %)
    the Board's record 4,679 of 5,404 blocks  (87 %)   ->  40 of 41 hoods (98 %)

── WHERE THE MEMBERSHIP COMES FROM, AND WHY IT IS NOT A JOIN ─────────────────

`base/blocks.qc` already ships a `hood` field: one u8 per block, an index into
the 41 `hoodNames` the same chunk publishes, which are DataSF's Analysis
Neighborhoods (`ajp5-b2md`) verbatim. **This script reads that field and does
not re-derive it.** Re-running a point-in-polygon test here would produce a
second membership that could disagree with the one the map draws and the one the
panel already prints in its subtitle — the classic two-guards-one-bad-row trap.
So there is exactly one membership on this map and this file is a rollup of it.

MEASURED on the shipped chunk: all 5,404 blocks carry an index in 0..40. There
is no sentinel and no unassigned block, so a click that resolves to a block
always resolves to a neighbourhood. (53 BUILDINGS fall outside all 41 published
polygons — Alcatraz, the piers — but the pick resolves against block rings, not
buildings, so that case cannot reach this panel.)

── AGGREGATION MUST NOT LAUNDER A GAP ────────────────────────────────────────

A rolled-up number that does not say what it is rolled up from is worse than no
number, because it implies a coverage it does not have. Three places this file
refuses to let that happen, and each ships the denominator beside the figure:

  * **money.** South of Market reads $776.3 M agreed — and that is ONE place,
    Moscone Center, of the four that stand there. `places` and
    `places_with_a_figure` are both on every record and the panel says both.
  * **residents.** A hood's count is summed over the blocks the 2020 Census
    ring join actually reaches. Only 2 of the 41 hoods have a ring on every
    block, so `residents_blocks` ships beside `blocks`. City-wide the join
    carries 868,555 of the county's 873,965 residents (99.4 %).
  * **the record.** `record.blocks` is how many of the hood's blocks carry
    anything at all, beside `blocks`.

── THE HIGHLIGHTS ARE CURATED, NOT JUDGED ────────────────────────────────────

The architecture is `export_sf_places.curate_documents()`, one level down in
material: **dedupe by stem, classify into an inspectable tier table, rank by
evidence within the tier, cap, and count what the cap hid.** No model pass.

The reason is the one this project established on the Paris side and it holds
here even harder: **the city already writes the description.** Every row in the
block record is a sentence the Board printed, with the scan leaf it was printed
on. A salience rank over those sentences gives highlights that are quotable,
sourced, and one click from the page they appear on. A generated summary of the
same material would be the one thing on this map that cannot be clicked
through to.

What does NOT transfer is `DOC_TYPES`. That table matches catalogue titles
("Annual report", "Environmental impact report") and there is no catalogue here
— a row is a sentence. The tier signal is already in the data and is stronger:
`g` says whether the line is the Board's own printed heading, and `p` says how
precisely the record places it. See `TIERS` below.

The one thing this level adds that a block cannot: **how many of the
neighbourhood's blocks the same printed subject lands on.** That is a count, not
a judgement, and it is the difference between a decision that touched one corner
and one that reorganised the whole district — "Giving Notice of Special Election
for Bonds for Municipal Railway Extensions", 1927, on twenty-four Sunset blocks.

── RUN ───────────────────────────────────────────────────────────────────────

    python3 pipeline/scripts/us_sf_city/build_hood_facts.py --build

Reads only files already on disk (the chunk, the two block-fact files, the 256
record shards). Never touches the network, so there is no `--fetch`.
"""
from __future__ import annotations

import argparse
import collections
import glob
import json
import pathlib
import math
import re
import sys
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from _chunk import field_array, read_chunk  # noqa: E402

REPO = HERE.parent.parent.parent
CITY = REPO / "website" / "public" / "data" / "us" / "sf" / "city"
BLOCKS = CITY / "blocks"
OUT = BLOCKS / "hood-facts.json"
OUT_RINGS = CITY / "base" / "hood-rings.json"

# ── the dissolve ─────────────────────────────────────────────────────────────
# The neighbourhood's outline is THE UNION OF ITS OWN BLOCKS, closed across the
# gaps between them. Not the published `ajp5-b2md` polygon: that outline runs
# down the middle of the street, and the blocks are what a reader can click —
# so drawing the union means the region drawn is exactly the set of blocks that
# would answer with this neighbourhood.
#
# An assessor block excludes the right-of-way, so two neighbouring rings are
# ~21 m apart (SF's standard street is 68.75 ft; a wide arterial 82.5 ft ~=
# 25 m). Dilating each ring and eroding the union by the same closes any gap
# under twice the radius, and leaves anything wider as the real separation it
# is. Closing preserves the OUTER boundary — it only fills concavities
# narrower than the diameter — so the edge of the region stays where the blocks
# put it however large the radius.
#
# MEASURED. Parts and vertices over all 41 hoods, and the share of the drawn
# area that turns out to sit on ANOTHER neighbourhood's blocks, which is the
# check that matters — a boundary that trespasses is a boundary that lies:
#
#     18 m  111 parts  3,417 verts   trespass 0.02 %   (worst hood 0.36 %)
#     30 m   ~70       ~2,400        trespass 0.03 %   (worst hood 0.83 %)
#     55 m   43 parts  ~1,600        trespass 0.07 %   (worst hood 1.00 %)
#
# **55 m is what ships.** At 18 m the wide shot came out as a tangle of a
# hundred outlines weaving round every park and boulevard — looked at, and it
# read as noise rather than as a city divided into forty-one pieces. At 55 m
# there is about one shape per neighbourhood, the trespass is still under a
# tenth of one per cent, and Golden Gate Park (800 m wide) and the freeway are
# still the separations they are.
DISSOLVE_M = 55.0
# 15 m is under a pixel at the whole-city stop (the frame is ~22,500 m across a
# ~1,150 px strip = 19.6 m/px), about two at the district stop and five at the
# block stop, which is where the selected neighbourhood's line is last drawn.
SIMPLIFY_M = 15.0
# A city block is ~10,000 m2. Below six of them a part is a fragment of made
# land or a wedge between two freeway ramps, and at the whole-city stop it is a
# speck rather than a division.
MIN_PART_M2 = 60000.0

# ── the tier table ────────────────────────────────────────────────────────────
# First match wins, so the order IS the precedence rule — the same contract
# `classify_doc()` runs under, and the same promise: given a row you can point
# at the line of this table that decided its fate.
#
#   g  where the line came from: `h` the Board's own printed heading, `p` that
#      heading composed with the sentence under it, `s` the sentence the matched
#      address sits in.
#   p  the precision tier, 1 corner .. 4 the record names this block. There is
#      no p=0 here: street-tier rows live in `street/<KEY>.json` and are a claim
#      about a street, not about this ground. MEASURED over all 256 shards:
#      p1 54,655 · p2 17,339 · p3 18,054 · p4 1,343, and no p0.
TIERS: list[tuple[str, str, int, object]] = [
    ("heading", "The Board's own printed heading", 1,
     lambda g, p: g == "h" and p >= 1),
    ("heading_body", "A printed heading with its item", 2,
     lambda g, p: g == "p" and p >= 1),
    ("addressed", "A sentence naming an address on the block", 3,
     lambda g, p: g == "s" and p >= 3),
    ("placed", "A sentence the record places on the block", 4,
     lambda g, p: p >= 1),
]

# TIER 9 — never displayed, counted instead. The exact role `PROCEDURAL_TIER`
# plays on the places shelf, and for the same reason: these are the Journal's
# own machinery, not a decision about a place. Every pattern below is anchored
# at the start of the line, so a sentence that MENTIONS a committee is not
# demoted — only one that IS the committee's procedural note.
PROCEDURAL_TIER = 9

# A CROSS-REFERENCE IS NOT A DECISION ABOUT A PLACE. The Journal points at its
# own neighbouring items, and one of those pointers standing alone at the head
# of a neighbourhood says nothing: "Section 34, County Clerk — A Companion
# Measure to the Preceding Item." was the Tenderloin's top line, on 15 blocks,
# and a reader cannot know what the preceding item was. Searched anywhere in
# the line rather than anchored, because the pointer usually comes last.
#
# MEASURED over all 91,391 rows: `companion measure` 44, `preceding item` 25
# (overlapping). `the foregoing resolution` was tested and REJECTED at 10 rows
# — "Supervisor Uhl objected to the adoption of the foregoing resolution,
# holding that the improvement…" is a substantive line and demoting it would
# have thrown away the one place the record prints a dissent.
SELF_REFERENTIAL = re.compile(r"\b(?:companion\s+measure|preceding\s+item)\b", re.I)

PROCEDURAL_HEAD = re.compile(
    r"^\s*(?:on\s+recommendation\s+of|read\s+and\s+ordered|ordered\s+filed|"
    r"referred\s+to\s+(?:the\s+)?committee|passed\s+for\s+second\s+reading|"
    r"finally\s+passed|action\s+deferred|adopted\s+by\s+the\s+following\s+vote|"
    r"suspension\s+of\s+rules|"
    r"the\s+following\s+(?:resolution|ordinance)\s+was)\b", re.I)

# Under this many characters a line is a fragment, not a sentence. The block
# fiche already uses this floor for its decade headlines and for the same
# reason: "Fortysixth Avenue and Irving Street." is a whole row and says
# nothing as the face of anything. Fragments are still IN the record; they are
# only passed over for a highlight.
FRAGMENT_CHARS = 40

# How many highlights a neighbourhood ships.
#
# **Six, and Daniel's answer was "five too many."** He is right, and fixing the
# RANKING is what made three safe: while the sort was spread-only, positions 4-6
# were where the good lines hid, so the cap was propping up a ranking that could
# not be trusted at the top. With `distinctiveness x blocks` the top three are
# the three, and the count the cap hid still ships beside them.
HIGHLIGHT_CAP = 3

# ── how DISTINCTIVE a line is to the neighbourhood it sits in ────────────────
# Ranking by blocks-reached alone surfaces the most administratively SPREAD
# item, which is reliably the least interesting one: routine paving touches many
# blocks, so Lone Mountain/USF led with a hearing on an appeal against a
# sidewalk assessment, and Mission with street acceptances.
#
# The fix is a hood-level inverse document frequency over the line's own words:
# a token that appears in all 41 neighbourhoods (`acceptance`, `roadway`,
# `appropriation`, `assessment`) scores 0, and one that appears in two scores
# high. It is computed in the same pass over the same rows, it is deterministic,
# and it is a count — no judgement anywhere in it.
#
# MEASURED, and the first two attempts were WORSE, which is why they are named
# here rather than deleted:
#
#   * **distinctiveness alone** puts *"Splicer $5.50 Laborer (acting as
#     Foreman).."* at the head of the Mission and a $225 personal-injury
#     settlement at the head of the Sunset. Rarity in this corpus is mostly
#     SURNAMES and scanning errors, not significance.
#   * **distinctiveness x log(1 + blocks)** still over-weights rarity: the
#     Sunset lost its 1927 Municipal Railway bond election — on 24 of its own
#     blocks, which IS the Sunset's story — to that same settlement.
#   * **distinctiveness x blocks**, linear, is what ships. It keeps every good
#     line the spread sort found and drops the boilerplate the spread sort could
#     not see past. Lone Mountain's sidewalk hearing falls from 1st to 4th and
#     is replaced by the 1926 conference invitation and *"Selecting Western
#     Addition Block No. 667 as Site for Proposed Lowell High School Building"*;
#     the Mission gains the 1909 *"Denying Protest Against Locating 'The San
#     Francisco Hospital'…"*, which is the origin of the hospital whose money
#     the section above it reports.
_TOKEN = re.compile(r"[a-z][a-z']{3,}")
# Words that carry no neighbourhood signal because every volume is full of them.
# Held short on purpose: the IDF does this job on its own for anything that is
# genuinely everywhere, and a long hand-written stop list is a judgement about
# what matters wearing the costume of a constant.
_STOP = frozenset("""
this that with from have been were which their there they them then than those
upon shall will being said same such into over under between certain other more
most also when what your board city county san francisco street streets avenue
avenues resolution ordinance motion hereby thereof
""".split())


def _tokens(line: str) -> set[str]:
    return {w for w in _TOKEN.findall(line.lower()) if w not in _STOP}


# ── what a reader cannot read THROUGH ────────────────────────────────────────
# The scans are 1906-1999 letterpress and the OCR is honest but not clean. A
# reader reads straight past `Sciiool` for School and `IVIay` for May; nobody
# reads `1,588.11 December (I, 11)07 - To the Barber Asphalt l*avinjr Company`,
# which was heading a decade of the rail and reads as a broken page rather than
# as the record.
#
# So the gate is on CHARACTERS and not on a dictionary: a token is broken when a
# digit sits against a letter, when it carries punctuation no word carries, or
# when four or more letters hold no vowel. It is deliberately not a spell check
# — that would throw away every surname and every street the city ever named.
# MEASURED over 10,570 group faces in six neighbourhoods: **84 % pass.**
_BROKEN = re.compile(r"[A-Za-z][0-9]|[0-9][A-Za-z]|[^\sA-Za-z0-9'\-/&.,;:()$%\"]")
_STRIP = ".,;:()[]\"'"
JUNK_MAX = 0.10


def junk_share(line: str) -> float:
    """The share of this line's word tokens that a reader cannot read through."""
    words = [w for w in line.split() if re.search(r"[A-Za-z]", w)]
    if not words:
        return 1.0
    bad = 0
    for w in words:
        core = w.strip(_STRIP)
        if _BROKEN.search(core) or (len(core) >= 4 and not re.search(r"[aeiouyAEIOUY]", core)):
            bad += 1
    return bad / len(words)

# The dash the Board sets between a printed heading and the item beneath it.
HEADING_DASH = re.compile(r"\s+[—–-]\s+")
LABEL_MIN, LABEL_MAX = 3, 60


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def classify(row: dict) -> tuple[str, int]:
    """(type key, tier) for one decision, from its own published fields."""
    line = (row.get("t") or "").strip()
    if PROCEDURAL_HEAD.match(line):
        return "procedural", PROCEDURAL_TIER
    if SELF_REFERENTIAL.search(line):
        return "cross_reference", PROCEDURAL_TIER
    if len(line) < FRAGMENT_CHARS:
        return "fragment", PROCEDURAL_TIER
    if junk_share(line) > JUNK_MAX:
        return "unreadable", PROCEDURAL_TIER
    g = row.get("g") or ""
    p = int(row.get("p") or 0)
    for key, _label, tier, test in TIERS:
        if test(g, p):  # type: ignore[operator]
            return key, tier
    return "unplaced", PROCEDURAL_TIER


def printed_heading(row: dict) -> str | None:
    """The heading the volume printed above this item, or None.

    Only `h` and `p` rows are read: those are the two cases where the line
    BEGINS with the heading. A body sentence can hold a dash of its own and the
    text before it is half a sentence, not a subject.
    """
    if row.get("g") not in ("h", "p"):
        return None
    parts = HEADING_DASH.split((row.get("t") or "").strip())
    if len(parts) < 2:
        return None
    label = parts[0].strip().rstrip(".,;:").strip()
    if not (LABEL_MIN <= len(label) <= LABEL_MAX):
        return None
    if not re.search(r"[A-Za-z]{3}", label):
        return None
    return label


def stem(s: str) -> str:
    """Fold two printings of the same thing together — and NOTHING else.

    Case, punctuation, spacing and a trailing plural. Folding `Oil Permits`
    into `Oil and Boiler Permits` would be a judgement about what those two
    have in common, and the counts would stop being counts. Same rule as
    `foldHeading` in `block-records.ts`.
    """
    t = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    t = re.sub(r"\s+", " ", t).strip()
    w = t.split(" ")
    if w and len(w[-1]) > 3 and w[-1].endswith("s"):
        w[-1] = w[-1][:-1]
    return " ".join(w)


def dissolve(names: list[str], hood_of_index: "object") -> dict:
    """The 41 outlines, in world metres, out of the blocks' own vertices.

    `base/blocks` ships each ring as an origin in world metres plus `cnt`
    i16 deltas at a per-block quantum of `(1 << sc) / 10`, and the quantum
    MULTIPLIES — `scene.ts` records what reading it the other way costs.
    """
    import numpy as np
    from shapely.geometry import MultiPolygon, Polygon
    from shapely.ops import unary_union

    header, payload = read_chunk((CITY / "base" / "blocks.qc").read_bytes())
    f = {n: field_array(header, payload, n)
         for n in ("cnt", "sc", "ox", "oy", "vx", "vy", "hood", "z")}
    cnt = f["cnt"]
    off = np.zeros(len(cnt) + 1, dtype=np.int64)
    off[1:] = np.cumsum(cnt)

    per: dict[int, list] = collections.defaultdict(list)
    # Per hood, its blocks' centroids and ground elevations — so an outline
    # vertex can be given the height of the ground it stands on rather than
    # sea level. `base/blocks.z` is in TENTHS OF A METRE (measured against Lake
    # Merced at 76 and Twin Peaks at 2362; `CityMap.BLOCK_Z_PER_M` says so).
    # A hood outline drawn at z = 0 would run 280 m under Twin Peaks, which at
    # the district stop is tens of pixels of drift off the ground it names.
    seed: dict[int, list] = collections.defaultdict(list)
    for i in range(len(cnt)):
        o, m = int(off[i]), int(cnt[i])
        if m < 3:
            continue
        q = (1 << int(f["sc"][i])) / 10.0
        ring = np.column_stack([f["ox"][i] + f["vx"][o:o + m] * q,
                                f["oy"][i] + f["vy"][o:o + m] * q])
        g = Polygon(ring)
        if not g.is_valid:
            g = g.buffer(0)
        if not g.is_empty:
            hi = int(f["hood"][i])
            per[hi].append(g)
            seed[hi].append((float(ring[:, 0].mean()), float(ring[:, 1].mean()),
                             float(f["z"][i]) / 10.0))

    parts_out: list[list[list[int]]] = []
    labels: list[list[int]] = []
    n_parts = n_verts = 0
    for hi in range(len(names)):
        polys = per.get(hi, [])
        if not polys:
            parts_out.append([])
            labels.append([0, 0])
            continue
        u = (unary_union([g.buffer(DISSOLVE_M, join_style=2) for g in polys])
             .buffer(-DISSOLVE_M, join_style=2))
        geoms = list(u.geoms) if isinstance(u, MultiPolygon) else [u]
        # Interior rings are dropped. A hole inside a division — a reservoir, a
        # rail yard, a block the assessor never drew — is a second outline
        # inside the first, and at the whole-city stop it reads as a smudge on
        # the shape rather than as information. The exterior is the division.
        geoms = [Polygon(g.exterior).simplify(SIMPLIFY_M) for g in geoms]
        geoms = sorted((g for g in geoms if g.area > MIN_PART_M2),
                       key=lambda g: -g.area)
        sx = np.array([c[0] for c in seed[hi]])
        sy = np.array([c[1] for c in seed[hi]])
        sz = np.array([c[2] for c in seed[hi]])
        rings = []
        for g in geoms:
            flat: list[int] = []
            for x, y in g.exterior.coords:
                # the elevation of the nearest of this hood's own blocks
                j = int(np.argmin((sx - x) ** 2 + (sy - y) ** 2))
                flat.append(round(x))
                flat.append(round(y))
                flat.append(round(sz[j]))
            rings.append(flat)
            n_verts += len(flat) // 3
        n_parts += len(rings)
        parts_out.append(rings)
        # A representative point, not a centroid: a neighbourhood shaped like
        # a crescent has its centroid outside itself, and a name floating over
        # the wrong district is worse than no name.
        rep = geoms[0].representative_point() if geoms else None
        labels.append([round(rep.x), round(rep.y)] if rep else [0, 0])

    print(f"  outlines   : {n_parts} parts, {n_verts} vertices, "
          f"dissolved at {DISSOLVE_M:.0f} m and simplified at {SIMPLIFY_M:.0f} m")
    return {
        "names": names,
        "parts": parts_out,
        "labels": labels,
        "note": (
            "Per neighbourhood, the union of its own assessor blocks' published "
            "rings — the same vertices the map's hit test walks — closed across "
            f"the gaps between them by dilating each ring {DISSOLVE_M:.0f} m and "
            "eroding the union by the same, interior rings dropped, simplified at "
            f"{SIMPLIFY_M:.0f} m. World metres, rounded to the metre, as flat "
            "[x, y, z, x, y, z, ...] per part, largest part first, where z is "
            "the ground elevation of the nearest of the hood's own blocks. "
            "`labels` is a "
            "representative point INSIDE the largest part, not a centroid: a "
            "crescent-shaped neighbourhood has its centroid outside itself."
        ),
        "dissolve_m": DISSOLVE_M,
        "simplify_m": SIMPLIFY_M,
        "n_parts": n_parts,
        "n_vertices": n_verts,
    }


def membership() -> tuple[list[str], list[str], dict[str, int]]:
    """(hoodNames, blockIds, blockId -> hood index) — read, never re-derived."""
    header, payload = read_chunk((CITY / "base" / "blocks.qc").read_bytes())
    hood = field_array(header, payload, "hood")
    meta = json.loads((CITY / "base" / "blocks-id.json").read_text())
    names, ids = meta["hoodNames"], meta["id"]
    if len(ids) != hood.size:
        raise SystemExit(f"blocks-id has {len(ids)} ids, the chunk has {hood.size} hoods")
    bad = [int(h) for h in hood if h >= len(names)]
    if bad:
        raise SystemExit(f"{len(bad)} blocks carry a hood index past hoodNames")
    return names, ids, {b: int(hood[i]) for i, b in enumerate(ids)}


def hood_token_df(per_rows: dict[int, list[tuple[str, int, dict]]]) -> tuple[collections.Counter, int]:
    """In how many of the 41 neighbourhoods each word appears, and how many
    neighbourhoods carry a record at all. One pass over the rows already read."""
    df: collections.Counter[str] = collections.Counter()
    n = 0
    for rows in per_rows.values():
        if not rows:
            continue
        n += 1
        seen: set[str] = set()
        for _b, _k, row in rows:
            seen |= _tokens(row.get("t") or "")
        for w in seen:
            df[w] += 1
    return df, n


# The mean over the line's THREE most distinctive words, not over all of them.
#
# Averaging over every token penalises a long, specific line for the common
# words it needs to be a sentence: *"Removal and Abandonment of Street Railway
# Tracks — Ninth Street Between the Southeasterly Line of Bryant Street and the
# Northwesterly Line of Market Street"* is dragged under a six-word line by
# `street`, `line` and `between`. Asking instead *does this line name a few
# unusual things* is length-neutral, and it is what lifted the Sunset's 1953
# Underground District back over a $225 injury settlement.
DISTINCT_TOP = 3


def distinctiveness(line: str, df: collections.Counter, n_hoods: int) -> float:
    """Mean inverse hood-frequency of the line's most distinctive words.

    0 for a line made entirely of words every neighbourhood's record uses.
    """
    words = _tokens(line)
    if not words:
        return 0.0
    best = sorted((math.log(n_hoods / max(1, df[w])) for w in words),
                  reverse=True)[:DISTINCT_TOP]
    return sum(best) / len(best)


def curate(
    rows: list[tuple[str, int, dict]],
    df: collections.Counter,
    n_hoods: int,
) -> tuple[list[dict], dict[str, int]]:
    """Dedupe -> classify -> rank -> cap. Deterministic; no model call.

    `rows` is (blockId, the row's own rank inside its block, the row). The rank
    is the pipeline's own interest order and is the last-resort tie-break, so a
    highlight is never chosen by hash order.
    """
    groups: dict[tuple[str, str], list[tuple[str, int, dict]]] = collections.defaultdict(list)
    for block_id, rank, row in rows:
        head = printed_heading(row)
        key = ("H", stem(head)) if head else ("T", stem(row.get("t") or "")[:80])
        groups[key].append((block_id, rank, row))

    counts: collections.Counter[str] = collections.Counter()
    out: list[dict] = []
    for group in groups.values():
        # The face of the group is its best-provenanced, best-ranked printing:
        # a whole printed heading before a composed one before a body sentence.
        def face(item: tuple[str, int, dict]) -> tuple[int, int]:
            g = item[2].get("g")
            return (0 if g == "h" else 1 if g == "p" else 2, item[1])

        block_id, rank, row = min(group, key=face)
        key, tier = classify(row)
        counts[key] += 1
        if tier >= PROCEDURAL_TIER:
            continue
        years = [r.get("y") for _b, _k, r in group if r.get("y")]
        line = (row.get("t") or "").strip()
        n_blocks = len({b for b, _k, _r in group})
        dist = distinctiveness(line, df, n_hoods)
        out.append({
            "t": line,
            "y": int(row.get("y") or 0),
            "u": row.get("u") or "",
            "b": block_id,
            "k": row.get("k") or "",
            "p": int(row.get("p") or 0),
            "tier": tier,
            "type": key,
            # how many printings folded in, and on how many of the
            # neighbourhood's own blocks they land. Both are counts.
            "n": len(group),
            "nb": n_blocks,
            # both halves of the score ship, so a reader of the file can see
            # WHY a line is at the top and not only that it is
            "d": round(dist, 3),
            "score": round(dist * n_blocks, 2),
            "y0": min(years) if years else 0,
            "y1": max(years) if years else 0,
            "a": max(int(r.get("a") or 0) for _b, _k, r in group),
            "_rank": rank,
        })

    # (tier, -distinctiveness x blocks, the pipeline's own rank, the line)
    # TIER STILL WINS OUTRIGHT — evidence only orders within a band, which is
    # `rank_documents`'s rule. What changed is the evidence: it was blocks
    # reached alone, which ranks the most administratively spread item first.
    # See the measurement above `_TOKEN` for the two scores that were tried and
    # rejected before this one. `t` last so the order is stable across runs.
    out.sort(key=lambda o: (o["tier"], -o["score"], o["_rank"], o["t"]))
    for o in out:
        del o["_rank"]
    return out, dict(counts)


def build() -> None:
    names, ids, of_hood = membership()
    n_hoods = len(names)
    print(f"  membership : {len(ids)} blocks over {n_hoods} published neighbourhoods")

    facts = json.loads((BLOCKS / "block-facts.json").read_text())
    money = json.loads((BLOCKS / "block-money.json").read_text())
    row_of = {b: i for i, b in enumerate(facts["b"])}

    # ── the record, out of the 256 shards already on disk ──────────────────
    per_rows: dict[int, list[tuple[str, int, dict]]] = collections.defaultdict(list)
    rec = collections.defaultdict(lambda: {
        "n": 0, "blocks": set(), "y0": 0, "y1": 0,
        "dec": collections.Counter(),
    })
    shards = 0
    for path in sorted(glob.glob(str(BLOCKS / "block-*.json"))):
        if any(x in pathlib.Path(path).name for x in ("facts", "money", "index")):
            continue
        shards += 1
        for block_id, entry in json.loads(pathlib.Path(path).read_text()).items():
            hi = of_hood.get(block_id)
            if hi is None:
                continue
            rows = entry.get("d") or []
            if not rows:
                continue
            a = rec[hi]
            a["blocks"].add(block_id)
            for rank, row in enumerate(rows):
                per_rows[hi].append((block_id, rank, row))
                a["n"] += 1
                y = int(row.get("y") or 0)
                if y:
                    a["dec"][y // 10 * 10] += 1
                    a["y0"] = y if not a["y0"] else min(a["y0"], y)
                    a["y1"] = max(a["y1"], y)
    print(f"  record     : {shards} shards, "
          f"{sum(a['n'] for a in rec.values())} decisions, "
          f"{sum(1 for a in rec.values() if a['n'])} of {n_hoods} hoods carry one")

    # ── the money, deduped by place inside the hood ────────────────────────
    # A place standing on four blocks reports the SAME figure on each — the
    # block file says so in `n_blocks` — so summing block rows would multiply
    # Moscone by four. The dedupe key is the place slug.
    per_place: dict[int, dict[str, dict]] = collections.defaultdict(dict)
    for block_id, places in money["b"].items():
        hi = of_hood.get(block_id)
        if hi is None:
            continue
        for pl in places:
            per_place[hi].setdefault(pl["slug"], pl)

    # A place whose blocks straddle two neighbourhoods is counted whole in each,
    # for the same reason it is counted whole on each of its blocks: no
    # published file apportions it. Measured and printed rather than hidden.
    hoods_of_place: dict[str, set[int]] = collections.defaultdict(set)
    for hi, places in per_place.items():
        for slug in places:
            hoods_of_place[slug].add(hi)
    straddling = sorted(s for s, h in hoods_of_place.items() if len(h) > 1)

    token_df, n_with_record = hood_token_df(per_rows)
    print(f"  vocabulary : {len(token_df)} words over the "
          f"{n_with_record} neighbourhoods that carry a record")

    out_hoods = []
    type_counts: collections.Counter[str] = collections.Counter()
    for hi, name in enumerate(names):
        blocks = [b for b in ids if of_hood[b] == hi]
        pop = homes = pop_blocks = 0
        use: collections.Counter[str] = collections.Counter()
        for b in blocks:
            i = row_of.get(b)
            if i is None:
                continue
            if facts["pop"][i] >= 0:
                pop += facts["pop"][i]
                pop_blocks += 1
            if facts["hu"][i] >= 0:
                homes += facts["hu"][i]
            u = facts["us"][i]
            if u >= 0:
                use[facts["useNames"][u]] += 1

        r = rec.get(hi)
        highlights, counts = curate(per_rows.get(hi, []), token_df, n_with_record)
        type_counts.update(counts)
        shown = highlights[:HIGHLIGHT_CAP]

        places = per_place.get(hi, {})
        with_fig = {s: p for s, p in places.items()
                    if p["n_contracts"] > 0 or p["n_payees"] > 0}
        # The largest figure in the neighbourhood, named. This is what stops
        # "$776.3 M in South of Market" reading as coverage: the panel can say
        # WHICH place carries it.
        top = max(with_fig.values(), key=lambda p: p["agreed_usd"] + p["paid_usd"],
                  default=None)

        out_hoods.append({
            "i": hi,
            "name": name,
            "blocks": len(blocks),
            "residents": pop,
            "homes": homes,
            "residents_blocks": pop_blocks,
            "use": use.most_common(1)[0][0] if use else None,
            "use_blocks": use.most_common(1)[0][1] if use else 0,
            "record": {
                "n": r["n"] if r else 0,
                "blocks": len(r["blocks"]) if r else 0,
                "y0": r["y0"] if r else 0,
                "y1": r["y1"] if r else 0,
                "dec": (sorted([[d, n] for d, n in r["dec"].items()]) if r else []),
            },
            "money": {
                "places": len(places),
                "places_with_a_figure": len(with_fig),
                "n_contracts": sum(p["n_contracts"] for p in with_fig.values()),
                "agreed_usd": sum(p["agreed_usd"] for p in with_fig.values()),
                "paid_usd": sum(p["paid_usd"] for p in with_fig.values()),
                "n_payees": sum(p["n_payees"] for p in with_fig.values()),
                "payees_paid_usd": sum(p["payees_paid_usd"] for p in with_fig.values()),
                "top": ({"slug": top["slug"], "name": top["name"],
                         "agreed_usd": top["agreed_usd"], "paid_usd": top["paid_usd"],
                         "n_blocks": top["n_blocks"]} if top else None),
                "names": sorted(p["name"] for p in places.values()),
            },
            "highlights": shown,
            "highlights_hidden": max(0, len(highlights) - len(shown)),
        })

    cov = {
        "hoods": n_hoods,
        "blocks": len(ids),
        "hoods_with_residents": sum(1 for h in out_hoods if h["residents"] > 0),
        "hoods_with_a_record": sum(1 for h in out_hoods if h["record"]["n"] > 0),
        "hoods_with_a_place": sum(1 for h in out_hoods if h["money"]["places"] > 0),
        "hoods_with_a_money_figure":
            sum(1 for h in out_hoods if h["money"]["places_with_a_figure"] > 0),
        "hoods_where_every_block_has_a_census_ring":
            sum(1 for h in out_hoods if h["residents_blocks"] == h["blocks"]),
        "residents_carried": facts["coverage"]["residents_carried"],
        "residents_counted": facts["coverage"]["residents_counted"],
        "blocks_with_a_money_figure": money["coverage"]["blocks_with_a_money_figure"],
        "places_straddling_two_hoods": straddling,
    }

    blob = {
        "generated_at": now_iso(),
        "generated_by": "pipeline/scripts/us_sf_city/build_hood_facts.py",
        "roll_year": facts["roll_year"],
        "census_year": facts["census_year"],
        "note": (
            "A rollup, not a new measurement. Every figure here is a sum over "
            "the block-level files already shipped, taken over the membership "
            "`base/blocks.qc` publishes as `hood` — DataSF Analysis "
            "Neighborhoods (ajp5-b2md), 41 polygons. No figure is apportioned "
            "and no figure is divided: where a published place stands in a "
            "neighbourhood, the whole of its money is reported there, exactly "
            "as it is on each of its own blocks."
        ),
        "source": {
            "dataset": "ajp5-b2md",
            "name": "Analysis Neighborhoods",
            "publisher": "City & County of San Francisco",
            "url": "https://data.sfgov.org/d/ajp5-b2md",
            "membership": (
                "read from `base/blocks.qc`'s own `hood` field, which is the "
                "membership the map draws and the panel already prints. It is "
                "NOT re-derived here: a second point-in-polygon pass could "
                "disagree with the first and both guards would still pass."
            ),
        },
        "curation": {
            "method": (
                "dedupe by stem, classify against the tier table, rank by "
                "DISTINCTIVENESS x BLOCKS REACHED inside the tier, cap, and "
                "count what the cap hid. Distinctiveness is the mean inverse "
                "hood-frequency of the line's own words, so boilerplate every "
                "neighbourhood's record carries scores 0 and falls; ranking on "
                "blocks alone put a sidewalk-assessment hearing at the head of "
                "Lone Mountain/USF. "
                "Deterministic — no model pass. The lines are the Board's own "
                "and every one links to the scan leaf it was printed on."
            ),
            "tiers": [{"key": k, "label": lab, "tier": t}
                      for k, lab, t, _ in TIERS]
                     + [{"key": "procedural", "label":
                         "The Journal's own machinery, and fragments — counted, never shown",
                         "tier": PROCEDURAL_TIER}],
            "cap": HIGHLIGHT_CAP,
            "fragment_chars": FRAGMENT_CHARS,
            "junk_max": JUNK_MAX,
            "distinct_top": DISTINCT_TOP,
            "classified": dict(sorted(type_counts.items())),
        },
        "coverage": cov,
        "hoods": out_hoods,
    }
    OUT.write_text(json.dumps(blob, separators=(",", ":")))

    rings = dissolve(names, None)
    OUT_RINGS.write_text(json.dumps(rings, separators=(",", ":")))

    print(f"  money      : {cov['hoods_with_a_place']} of {n_hoods} hoods carry a "
          f"published place, {cov['hoods_with_a_money_figure']} a figure "
          f"(blocks: {cov['blocks_with_a_money_figure']} of {cov['blocks']})")
    print(f"  census     : {cov['hoods_with_residents']} of {n_hoods} hoods carry a "
          f"count; {cov['hoods_where_every_block_has_a_census_ring']} have a ring on "
          f"every block")
    print(f"  curation   : {dict(sorted(type_counts.items()))}")
    if straddling:
        print(f"  straddling : {len(straddling)} places stand in two neighbourhoods "
              f"and are reported whole in each — {', '.join(straddling)}")
    print(f"  wrote      : {OUT.relative_to(REPO)}  "
          f"{OUT.stat().st_size / 1024:.0f} KB")
    print(f"               {OUT_RINGS.relative_to(REPO)}  "
          f"{OUT_RINGS.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true")
    a = ap.parse_args()
    if not a.build:
        ap.error("--build")
    build()
