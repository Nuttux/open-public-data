"""stg -> core : one row per record, and this is the published dataset.

    python3 build_core_table.py               # build
    python3 build_core_table.py --check       # gates only, no write

INPUT   the two swept corpora            (raw)
        blocks/out/joined.json           where each record was placed
        pipeline/seeds/sf_bos_taxonomy.json
        pipeline/seeds/sf_bos_classification.csv   the frozen classifier output
OUTPUT  website/public/data/us/sf/city/records/sf_bos_records.csv[.gz]
        website/public/data/us/sf/city/records/schema.json

WHY THIS FILE IS THE POINT OF THE WHOLE EXERCISE.

Until now the map's internals WERE the public dataset: 256 shards of bitmasks
and single-letter keys, a transport format that nobody could read and that had
no coordinate column at all. This is the row-level table the shards should have
been a projection of — one row per record, columns a stranger can understand,
and the map built FROM it rather than beside it.

THE LAYERS, and this file is the third of them:

    raw     the swept items, untouched
    stg     typed and trimmed, kind in plain words          <- `stg_rows()`
    core    THIS — one row per record, every column filled  <- `core_rows()`
    mart    the block shards and the map marks, exported from core

THE CLASSIFICATION IS A SEED, NOT A STEP. A model's judgement is not
reproducible the way SQL is, so it is frozen into a versioned CSV that this
reads. Re-running the model changes that file, the diff is reviewable, and a
build never silently reclassifies. Rows the classifier has not reached carry a
null topic and are counted out loud — an honest gap, never a guess.
"""
from __future__ import annotations

import argparse
import collections
import csv
import gzip
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from _paths import CACHE, GEO, JOINED, REPO  # noqa: E402

SEEDS = os.path.join(REPO, "pipeline", "seeds")
TAXONOMY = os.path.join(SEEDS, "sf_bos_taxonomy.json")
CLASSIFIED = os.path.join(SEEDS, "sf_bos_classification.csv")
OUTDIR = os.path.join(REPO, "website", "public", "data", "us", "sf", "city", "records")

HISTORIC = os.path.join(CACHE, "items.jsonl")
# The FULL modern sweep, not `items.jsonl`. That file is the 8,611 rows the
# block join could place; this is all 43,507 the Clerk printed. The table is
# the row-level record of what the Board did, and a record without a street
# is not a lesser record — it is where the citywide acts live. Verified a
# strict superset, every row carrying url and page == n+1.
MODERN = os.path.join(REPO, "pipeline/scripts/us_sf_city/cache_sfbos/items_all.jsonl")

KIND = {"R": "resolution", "O": "ordinance", "M": "motion",
        "W": "departmental work", "H": "hearing"}

# how the record told us where it happened, in the order the build prefers.
# The words are the reader's, not the builder's — `stated`/`addr`/`segment`
# meant nothing to anyone opening this file for the first time.
WHERE = {4: "names its own block", 3: "street address", 2: "between two streets",
         1: "street corner", 0: "street only"}
WHERE_DOTTABLE = {"names its own block", "street address",
                  "between two streets", "street corner"}
WHY_NO_PLACE = {
    "street fronts >60 blocks or no parcel on it": "street runs too far",
    "all streets named after the roll call (next item bleed)":
        "place belongs to the next item",
    "omnibus (>6 streets, no number/corner)": "too many streets listed",
}

MONEY = re.compile(r"\$\s?([\d]{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{4,}(?:\.\d{2})?)")

SFBOS_NS = "sfbos:"

# THE NUMBER A BARE OUTCOME POINTS AT. "Resolution No. 341-25 ADOPTED" is the
# whole record; what was adopted is described in another row, filed when the
# item was introduced. 63% of outcome-shaped rows carry a number like this, and
# it is the only thread back to the missing half — so it is a column rather than
# something a reader has to pull out of `text` themselves.
REFERS = re.compile(r"\b(?:resolution|ordinance|motion)\s+no\.?\s*"
                    r"([0-9][0-9,\-]{0,12}[0-9]|[0-9])", re.I)


def source_url(r) -> str:
    """A link that opens the page this was read from.

    Two record systems, two shapes — the same split `build_index.page_url()`
    makes. The Clerk's own PDFs need no leaf map; the Archive's scans address a
    BookReader leaf, and without the map that link can be a page or two off, so
    it is built only where it is exact.
    """
    own = (r.get("_url") or "").strip()
    if own.startswith("http") and "legistar" in own.lower():
        return own
    v = r["_v"] or ""
    if v.startswith(SFBOS_NS):
        stem = v[len(SFBOS_NS):]
        return f"https://sfbos.org/sites/default/files/{stem}_minutes.pdf"
    return f"https://archive.org/details/{v}"

def ref_no(text: str) -> str:
    """The decision number this row cites, when it cites exactly one.

    Several numbers means the row is discussing more than one decision and
    which it IS cannot be known from the text — an empty cell is the honest
    answer there, and the numbers are all still in `text`.
    """
    found = {m.group(1).strip(",-") for m in REFERS.finditer(text or "")}
    return found.pop() if len(found) == 1 else ""


COLUMNS = [
    "id", "year", "date", "kind", "heading", "text", "source_url",
    "record_type", "topic", "subtopic", "action",
    "how_we_know_where", "why_no_place", "block", "longitude", "latitude",
    "streets", "amounts", "amount_count",
    "refers_to_decision_number", "classified_by",
    "plain_line", "plain_line_caution", "importance",
]


def stg_rows():
    """Every record, typed and trimmed. One row per item in the two corpora."""
    for path, src in ((HISTORIC, "archive"), (MODERN, "sfbos")):
        if not os.path.exists(path):
            sys.exit(f"REFUSED: {path} is missing. See INTEGRATION.md §6.")
        for line in open(path):
            r = json.loads(line)
            y = r.get("y")
            if isinstance(y, str):
                y = int(y) if y[:4].isdigit() else None
            text = " ".join((r.get("t") or "").split())
            yield {
                "id": f'{r.get("v")}|{r.get("i")}',
                "year": y,
                "date": (r.get("dt") or "")[5:],
                "kind": KIND.get(r.get("k"), r.get("k") or ""),
                "heading": " ".join((r.get("hp") or "").split()),
                "text": text,
                "_src": src,
                "_v": r.get("v"), "_n": r.get("n"),
                # The Legistar sweep records the document's own address. The
                # stem-built sfbos.org URL is right for the Clerk's own PDFs
                # and a 404 for a Legistar meeting, so carry what the sweep saw.
                "_url": r.get("url") or "",
                "_amounts": [a for a in (r.get("m") or []) if a],
                "_has_street": bool(r.get("r")),
            }


def importance():
    """id -> 0-100, how much the record matters, at its newest rubric version.

    The store is append-only and one id carries a row per rubric version, so
    the row with the highest `rv` is the current reading. Taking the last line
    in the file would make the published number depend on append order.

    Unlike the map index, this publishes the score wherever one exists, INCLUDING
    where the written line carries a caution — because this table publishes those
    lines too, beside `plain_line_caution`. A reader who can see the caution can
    weigh the number; on the map there is no room to say it, so the map holds
    both back together.
    """
    path = os.path.join(REPO, "pipeline", "data", "sf_bos", "importance.jsonl")
    if not os.path.exists(path):
        return {}
    best, ver = {}, {}
    for line in open(path):
        if not line.strip():
            continue
        d = json.loads(line)
        i, rv = d["id"], int(d.get("rv") or 0)
        if rv < ver.get(i, -1):
            continue
        ver[i] = rv
        best[i] = int(d["score"])
    return best


def plain_lines():
    """The written line for each record — a seed, exactly like the classifier.

    WHY THIS IS A SEED AND NOT A STEP. The same reasoning the classification
    carries: a model's sentence is not reproducible the way SQL is, so it is
    frozen into a versioned file this reads. Re-running the writers changes that
    file, the diff is reviewable, and a build never silently rewrites a line.

    WHY IT ENTERS AT CORE. It was joined straight into the block shards, which
    is the mart — the map was reading a column the published table did not have.
    Every layer below now sees it, and `sf_bos_records.csv` carries the sentence
    beside the Clerk's own text.

    `plain_line_caution` is not decoration: a line whose named words could not
    all be found in the record ("invented"), or which states as done something
    the record only proposed ("overstates"), ships with the reason attached
    rather than being dropped without trace. A reader of the table can filter
    them; a surface that wants only clean lines has one column to test.
    """
    path = os.path.join(REPO, "pipeline", "data", "sf_bos", "plain_lines.jsonl")
    if not os.path.exists(path):
        return {}
    out = {}
    for line in open(path):
        if not line.strip():
            continue
        d = json.loads(line)
        flags = d.get("flags") or {}
        why = [k for k in ("invented", "overstates", "damaged") if flags.get(k)]
        out[d["id"]] = (d["line"], "|".join(why))
    return out


def rec_key(v, n, text) -> str:
    """The identity two halves of this pipeline can both compute.

    The placement dump stores `v`, `n` and the first characters of the text —
    NOT the item index — so `v|i` cannot be rebuilt from it. This is the same
    key `build_threads.py` and `build_hood_records.py` dedupe on: the page plus
    the opening of the line. Anything finer would not exist on both sides;
    anything coarser would merge two items printed on one page.
    """
    return f"{v}|{n}|{' '.join((text or '').split())[:60]}"


def load_placement():
    """key -> {tier, block}, from the placement build."""
    if not os.path.exists(JOINED):
        print(f"  note: {JOINED} absent — location columns will be empty")
        return {}
    j = json.load(open(JOINED))
    dec = j.get("dec") or {}
    own = j.get("own") or {}
    # THE BLOCKS PLACEMENT FOUND, NOT THE ONES THAT SURVIVED THE DEDUP.
    # `own` is the deduped set — right for a block panel, wrong for a dataset:
    # 35.5% of records located at block precision had no block in it, because
    # an identical reading elsewhere had already claimed the line. The record
    # keeps its location; only the panel dedupes. `placed_blocks` is written by
    # build_index for exactly this, and `own` is the fallback for a dump made
    # before that existed.
    pb = j.get("placed_blocks") or {}
    block_of = {did: bs[0] for did, bs in pb.items() if bs}
    if not block_of:
        for bn, dids in own.items():
            for d in dids:
                block_of.setdefault(str(d), bn)
    out = {}
    for did, d in dec.items():
        k = rec_key(d.get("v"), d.get("n"), d.get("t"))
        # the street names the record itself printed, deduped in the order the
        # item named them. `r` is the resolved mentions the placement was made
        # from, so this is what the record said, not what we inferred.
        names = []
        for m in (d.get("r") or []):
            nm = (m.get("d") or m.get("s") or "").strip()
            if nm and nm not in names:
                names.append(nm)
        tier = d.get("p")
        try:
            tier = int(tier)
        except (TypeError, ValueError):
            tier = None
        # a page can hold two items opening identically; keep the most precise
        prev = out.get(k)
        if prev is None or (tier or -1) > (prev["tier"] or -1):
            out[k] = {"tier": tier, "block": block_of.get(str(did)),
                      "streets": names[:8]}
    return out


def block_xy():
    """block id -> (x, y) in the shared metre frame, and lon/lat."""
    p = os.path.join(GEO, "blocks.json")
    if not os.path.exists(p):
        return {}
    man = os.path.join(REPO, "website/public/data/us/sf/city/manifest.json")
    proj = json.load(open(man))["proj"] if os.path.exists(man) else None
    out = {}
    for b in json.load(open(p)):
        if proj:
            lon = b["cx"] / (proj["mpd"] * proj["cosl"]) + proj["lon0"]
            lat = b["cy"] / proj["mpd"] + proj["lat0"]
            out[b["b"]] = (round(lon, 6), round(lat, 6))
    return out


def load_classification():
    """id -> {record_type, topic, subtopic, action, by}. Empty when unrun."""
    if not os.path.exists(CLASSIFIED):
        return {}
    out = {}
    with open(CLASSIFIED, newline="") as f:
        for row in csv.DictReader(f):
            out[row["id"]] = row
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="gates only, write nothing")
    a = ap.parse_args()

    tax = json.load(open(TAXONOMY))
    topics = {t["slug"]: t for t in tax["topics"]}
    subs = {s["slug"] for t in tax["topics"] for s in t["subtopics"]}
    actions = {x["slug"] for x in tax["actions"]}
    rtypes = {x["slug"] for x in tax["record_types"]}

    placed = load_placement()
    xy = block_xy()
    cls = load_classification()

    rows = list(stg_rows())
    print(f"stg: {len(rows):,} records")

    by_key = placed

    plain = plain_lines()
    imp = importance()
    out = []
    for r in rows:
        p = by_key.get(rec_key(r["_v"], r["_n"], r["text"])) or {}
        tier = p.get("tier")
        where = WHERE.get(tier) if tier is not None else None
        if where is None:
            where = "no place given"
        blk = p.get("block") or ""
        lon = lat = ""
        if blk and blk in xy:
            lon, lat = xy[blk]
        c = cls.get(r["id"]) or {}
        amounts = r["_amounts"]
        out.append({
            "id": r["id"], "year": r["year"] or "", "date": r["date"],
            "kind": r["kind"], "heading": r["heading"], "text": r["text"],
            "source_url": source_url(r),
            "record_type": c.get("record_type", ""),
            "topic": c.get("topic", ""), "subtopic": c.get("subtopic", ""),
            "action": c.get("action", ""),
            "how_we_know_where": where,
            # TWO DIFFERENT SILENCES, and merging them would be a lie. A record
            # that never names a street is unplaceable by nature — a lawsuit,
            # an appointment. A record that DOES name one, which the placement
            # then refused, is a limit of ours: the street ran too far, or the
            # streets it named belonged to the item printed below it. The
            # reader is owed the difference.
            "why_no_place": ("" if where != "no place given"
                             else ("named a street we could not use"
                                   if r["_has_street"] else "no place in the text")),
            "block": blk, "longitude": lon, "latitude": lat,
            "streets": "|".join(p.get("streets") or []),
            "amounts": "|".join(amounts), "amount_count": len(amounts),
            "refers_to_decision_number": ref_no(r["text"]),
            "classified_by": c.get("classified_by", ""),
            "plain_line": plain.get(r["id"], ("", ""))[0],
            "plain_line_caution": plain.get(r["id"], ("", ""))[1],
            "importance": imp.get(r["id"], ""),
        })

    # ── gates ────────────────────────────────────────────────────────────
    fails = []
    ids = collections.Counter(o["id"] for o in out)
    dup = [k for k, v in ids.items() if v > 1]
    if dup:
        fails.append(f"{len(dup):,} duplicate id(s), e.g. {dup[0]}")
    bad_t = {o["topic"] for o in out if o["topic"] and o["topic"] not in topics}
    if bad_t:
        fails.append(f"topic(s) not in the taxonomy: {sorted(bad_t)[:4]}")
    bad_s = {o["subtopic"] for o in out if o["subtopic"] and o["subtopic"] not in subs}
    if bad_s:
        fails.append(f"subtopic(s) not in the taxonomy: {sorted(bad_s)[:4]}")
    bad_a = {o["action"] for o in out if o["action"] and o["action"] not in actions}
    if bad_a:
        fails.append(f"action(s) not in the taxonomy: {sorted(bad_a)[:4]}")
    bad_r = {o["record_type"] for o in out if o["record_type"] and o["record_type"] not in rtypes}
    if bad_r:
        fails.append(f"record_type(s) not in the taxonomy: {sorted(bad_r)[:4]}")
    # a dottable location must have a block; a non-dottable one must not
    for o in out:
        if o["how_we_know_where"] in WHERE_DOTTABLE and not o["block"]:
            fails.append("a record located precisely has no block — the map would "
                         "have nowhere to draw it")
            break
    print(f"\ncoverage")
    n = len(out)
    for col in ("record_type", "topic", "action"):
        k = sum(1 for o in out if o[col])
        print(f"  {col:<18}{k:>8,} of {n:,} = {100*k/n:>5.1f}%")
    wc = collections.Counter(o["how_we_know_where"] for o in out)
    print("\nhow_we_know_where")
    for k, v in wc.most_common():
        print(f"  {k:<24}{v:>8,}{100*v/n:>7.1f}%")

    if fails:
        print("\nGATES FAILED")
        for f in fails:
            print("  -", f)
        return 1
    print("\ngates: ok")

    if a.check:
        return 0
    os.makedirs(OUTDIR, exist_ok=True)
    # THE GZIP IS THE DATASET; THE RAW CSV IS NOT SHIPPED.
    # 124,284 rows of full record text is 111 MB raw and 21 MB compressed, and
    # `website/public/data` is already 407 MB that every deploy carries. The
    # compressed file is what a person downloads and what every tool reads
    # natively; the uncompressed copy would be a 90% larger tree for no reader.
    path = os.path.join(OUTDIR, "sf_bos_records.csv.gz")
    with gzip.open(path, "wt", newline="", encoding="utf-8") as g:
        w = csv.DictWriter(g, fieldnames=COLUMNS, extrasaction="ignore")
        w.writeheader()
        w.writerows(out)
    # …and a small preview, so the shape can be seen without downloading 21 MB
    prev = os.path.join(OUTDIR, "sf_bos_records.preview.csv")
    with open(prev, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
        w.writeheader()
        w.writerows(out[:500])
    # ── the dataset explains itself, beside itself ───────────────────────
    # A CSV with no schema is a puzzle. This is written from the taxonomy, so
    # the values a column can hold cannot drift from the values it does hold.
    schema = {
        "name": "San Francisco Board of Supervisors records, 1906-2026",
        "rows": len(out),
        "generated_by": "pipeline/scripts/us_sf_city/blocks/build_core_table.py",
        "read_this_first": os.path.join("pipeline/scripts/us_sf_city/blocks",
                                        "RECORD-COLUMNS.md"),
        "counting_rules": [
            "One row is one thing the Board dealt with.",
            # NOT "add up to the row count". They do not: a row with no subject
            # in its line carries an empty topic, so the eight topics sum to the
            # rows that HAVE one. Written the other way, this rule licensed the
            # exact miscounting the rest of the file exists to prevent.
            "topic is single-valued, so no row is counted twice — but the topics "
            "sum to the rows that carry one, not to every row.",
            "Do not count rows whose record_type is not `decision` into subject "
            "figures — they are page furniture, index rows, or a bare vote whose "
            "description lives in another row.",
            "Say which denominator you used: all rows, decisions only, or "
            "classified rows only. All three are legitimate and they differ.",
        ],
        "columns": [
            {"name": "id", "what": "stable key: volume and item number"},
            {"name": "year", "what": "the year the Board acted"},
            {"name": "date", "what": "month-day where the volume printed one"},
            {"name": "kind", "values": sorted(set(KIND.values()))},
            {"name": "heading", "what": "the title the volume printed above the item"},
            {"name": "text", "what": "the line as printed, original spelling and "
                                     "scan errors kept"},
            {"name": "source_url", "what": "opens the scanned page"},
            {"name": "record_type", "values": [r["slug"] for r in tax["record_types"]]},
            {"name": "topic", "values": [t["slug"] for t in tax["topics"]]},
            {"name": "subtopic",
             "values": sorted({s["slug"] for t in tax["topics"] for s in t["subtopics"]})},
            {"name": "action", "values": [a["slug"] for a in tax["actions"]]},
            {"name": "streets", "what": "the street names the record itself "
                                        "printed, | separated"},
            {"name": "refers_to_decision_number",
             "what": "for a bare vote outcome, the decision number it points at "
                     "— the thread back to the row that describes what was "
                     "voted on. Blank when the row cites several"},
            {"name": "how_we_know_where", "values": list(WHERE.values()) + ["no place given"],
             "what": "how precisely the record said where it happened. Only the "
                     "first four are precise enough to draw a dot; `street only` "
                     "means the street is known and the spot is not."},
            {"name": "why_no_place",
             "values": ["no place in the text", "named a street we could not use"]},
            {"name": "block", "what": "assessor block, when there is one"},
            {"name": "longitude"}, {"name": "latitude"},
            {"name": "amounts", "what": "every printed figure, | separated"},
            {"name": "amount_count",
             "what": "how many. Take amounts[0] only when this is 1 — 6.2% of "
                     "rows carry several and none of them is THE amount."},
            # ── OURS, AND SAID SO ────────────────────────────────────────
            # Every other column here is the Board's or a measurement of it.
            # This one is a sentence WE wrote, and the schema has to say so
            # plainly or a reader will take it for the record's own words.
            {"name": "plain_line",
             "what": "OUR one-sentence reading of the record in plain English, "
                     "6-11 words, written from the item's full text — NOT the "
                     "Board's wording. `text` is the Board's. Empty where the "
                     "record states no event (page furniture, an index row)."},
            {"name": "importance",
             "what": "OURS, not the Board's: 0-100 for how much the record "
                     "matters, read off the plain_line by a reader applying a "
                     "written rubric. Reach picks the band and stage discounts "
                     "it, so an adopted citywide rule outranks the same rule "
                     "referred. It is a reading, not a measurement, and it is "
                     "for sorting a year into an order worth scanning — not a "
                     "claim that one act mattered more than another. Empty "
                     "where the record has no written line to read."},
            {"name": "plain_line_caution",
             "values": ["", "invented", "overstates", "damaged",
                        "invented|damaged", "overstates|damaged"],
             "what": "why a written line is doubtful, | separated, blank when it "
                     "is not. `invented` = a name or figure in the line could "
                     "not be found in the record; `overstates` = the line states "
                     "as done what the record only proposed; `damaged` = the "
                     "words match only approximately because the SCAN is broken, "
                     "not the line. Filter on this rather than trusting every row."},
            {"name": "classified_by",
             "values": ["form", "fund", "near-duplicate", "purpose-clause",
                        "record", "rule", "title"],
             "what": "`record` means a human read this row. `form` means a human "
                     "read the sentence-shape it shares with others. "
                     "`fund` means the subject came from the fund the money was "
                     "appropriated OUT OF — \"Sewer Fund, Bond Issue 1904\", "
                     "\"Municipal Railway Construction Fund\" — which is the "
                     "City's own word for what the money was for, printed in the "
                     "record. "
                     "`title` means a human read the Clerk's own file title for "
                     "it — the modern record carries one, and the WHOLE title is "
                     "the key, because `Administrative Code` alone heads 1,477 "
                     "records about rent control, surveillance policy, police "
                     "equipment and the film commission. "
                     "`near-duplicate` means it is the same sentence as a labelled "
                     "row with different scan errors. `rule` means a pattern that "
                     "agreed 90-100% with a human read. `purpose-clause` means two "
                     "reads: the opening formula gave the action, and the subject "
                     "came from the clause after it — \"for the purpose of "
                     "reconstructing the main sewer in Mission street\". Every row "
                     "carries one of the five; a row can still have an empty "
                     "`topic`, which is a read row whose line does not say what it "
                     "was about."},
        ],
    }
    with open(os.path.join(OUTDIR, "schema.json"), "w") as f:
        json.dump(schema, f, indent=1)

    # ── the numbers the page prints, counted here rather than in the browser ──
    # A page that has to parse 21 MB to say "26.6% classified" is a page that
    # says it slowly and differently each time. Counted once, at build.
    def tally(col):
        return collections.Counter(o[col] for o in out if o[col])
    topic_label = {t["slug"]: t["label"] for t in tax["topics"]}
    n_dec = sum(1 for o in out if o["record_type"] == "decision")

    # WHY THE NO-TOPIC ROWS ARE SPLIT HERE INSTEAD OF LEFT AS ONE REMAINDER.
    # "rows minus rows-with-a-topic" is a single number covering two unrelated
    # things, and nothing downstream can tell them apart from the outside:
    #
    #   a row that is NOT A DECISION — a running footer, an index line, a line
    #   cut in half by a page break — has no subject because there is no act in
    #   it to have one;
    #
    #   a DECISION WITH AN ACTION AND NO TOPIC was read, and the printed formula
    #   fixed what the Board did without saying what about. "the following
    #   amounts be and the same are hereby set aside" is always an
    #   appropriation; what the money was for sits past the end of the formula
    #   and is not in the line.
    #
    # Added together they read as backlog. Neither is: both are final answers.
    # Counted apart so the page can say which is which instead of implying a
    # queue that does not exist.
    n_read = sum(1 for o in out if o["record_type"])
    n_dec_topic = sum(1 for o in out
                      if o["record_type"] == "decision" and o["topic"])

    # DECISIONS ONLY, AND NOT ALL ROWS WITH A TOPIC. A bare vote outcome —
    # "Resolution No. 341-25 ADOPTED" — is `running-the-city / vote-or-scheduling`,
    # which is true of the row and useless as a subject: it says the Board voted,
    # not what about. Tallied over every row with a topic, those 12,530 rows
    # doubled `running-the-city` (10,573 -> 23,103) and moved it up the chart, so
    # the page was breaking its own counting rule — "do not count rows whose
    # record_type is not `decision` into subject figures" — in the one chart most
    # likely to be quoted. The topic and decade tallies below are therefore taken
    # over decisions, and named so nothing downstream can mistake the denominator.
    dec = [o for o in out if o["record_type"] == "decision"]

    def tally_dec(col):
        return collections.Counter(o[col] for o in dec if o[col])

    stats = {
        "rows": len(out),
        "generated_at": "",
        "years": [min((o["year"] for o in out if o["year"]), default=0),
                  max((o["year"] for o in out if o["year"]), default=0)],
        # NOT a `classified` count of every row with a topic. That number
        # (119,424) is arithmetically true and reads as a subject figure, which
        # it is not — see the note above the decision tallies. Removed rather
        # than left in the file for someone to quote.
        "read": n_read,
        "decisions": n_dec,
        "decisions_with_topic": n_dec_topic,
        "decisions_without_topic": n_dec - n_dec_topic,
        "download_bytes": 0,
        "record_type": tally("record_type").most_common(),
        "topic_decisions": [[topic_label.get(k, k), v]
                            for k, v in tally_dec("topic").most_common()],
        "action": tally("action").most_common(),
        "how_we_know_where": tally("how_we_know_where").most_common(),
        "classified_by": tally("classified_by").most_common(),
        "decisions_by_decade": sorted(collections.Counter(
            (o["year"] // 10 * 10) for o in dec if o["year"]).items()),
        "decisions_with_topic_by_decade": sorted(collections.Counter(
            (o["year"] // 10 * 10) for o in dec if o["year"] and o["topic"]).items()),
    }
    print(f"\n-> {path}  {os.path.getsize(path)/1e6:.1f} MB gzipped, "
          f"{len(out):,} rows")
    print(f"-> {prev}  (first 500 rows, uncompressed)")
    stats["download_bytes"] = os.path.getsize(path)
    with open(os.path.join(OUTDIR, "stats.json"), "w") as f:
        json.dump(stats, f, indent=1)
    print(f"-> {os.path.join(OUTDIR, 'schema.json')}")
    print(f"-> {os.path.join(OUTDIR, 'stats.json')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
