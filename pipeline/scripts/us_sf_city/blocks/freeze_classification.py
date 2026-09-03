"""Hand labels -> the versioned classification seed.

    python3 freeze_classification.py

INPUT   scratchpad/sf-classify/forms300.txt      the forms that were read
        scratchpad/sf-classify/form_labels.tsv   what they were labelled
OUTPUT  pipeline/seeds/sf_bos_classification.csv

WHY A SEED AND NOT A PIPELINE STEP.

A model's judgement is not reproducible the way SQL is: run it twice and the
answers can differ, and a build that re-classifies on every run would change
published numbers with nobody deciding to. So the judgement happens ONCE, lands
in a versioned CSV, and every build after that is deterministic SQL reading a
file. Re-running the classifier changes that file, the diff is reviewable in a
pull request, and the change is a decision somebody made rather than a thing
that happened.

WHAT `by` MEANS, AND WHY IT IS ON EVERY ROW.

    form     one of the 300 commonest FORMS was read, and this record shares
             it. The form was normalised — numbers, money, street names and
             roll calls removed — so records sharing one are the same sentence
             with a different address in it.
    record   this record was read on its own.
    rule     a deterministic family that agreed with a hand read 90-100% of
             the time. Three of them earned this; the rest did not.

A reader can filter the published dataset to `by = record` and get only what a
human eye actually saw. That is the point of the column.

THE FORM EXPANSION IS THE RISK, AND IT IS BOUNDED HERE. A form determines the
ACTION reliably — "the following amounts be and the same are hereby set aside"
is always an appropriation — but it does NOT always determine the TOPIC, because
what the money was FOR sits past the end of the formula. Where the label left
topic blank, this writes an action and no topic rather than guessing one.
"""
from __future__ import annotations

import collections
import csv
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from _paths import CACHE, REPO  # noqa: E402

SCRATCH = os.path.join(REPO, "scratchpad", "sf-classify")
LABELS = os.path.join(SCRATCH, "form_labels.tsv")
OUT = os.path.join(REPO, "pipeline", "seeds", "sf_bos_classification.csv")
TAXONOMY = os.path.join(REPO, "pipeline", "seeds", "sf_bos_taxonomy.json")

HISTORIC = os.path.join(CACHE, "items.jsonl")
MODERN = os.path.join(REPO, "pipeline/scripts/us_sf_city/cache_sfbos/items.jsonl")
# THE CORPUS GREW AND THIS FILE DID NOT NOTICE. `cache_sfbos/items.jsonl` is the
# Clerk-PDF sweep as it stood when the labels were read: 8,611 rows. The swept
# corpus is now 34,896 rows larger, all of it 2010s-2020s, and every one of those
# records came out of here with no row at all — no record_type, no topic. That is
# not "not a decision", it is "never looked at", and read as the former it dropped
# 34,106 records off the year pages until 0ef105107.
# ALL_ITEMS is the whole of it. Set BLOCKS_ITEMS to override, as the index does.
ALL_ITEMS = (os.environ.get("BLOCKS_ITEMS")
             or os.path.join(REPO, "pipeline/data/sf_bos/items_merged.jsonl"))
# The rank->form mapping pass A's 300 labels were made against. See the note in
# the file itself, and `main()` below.
FORM_RANKS = os.path.join(REPO, "pipeline", "seeds", "sf_bos_form_ranks.tsv")
TITLE_LABELS = os.path.join(REPO, "pipeline", "seeds", "sf_bos_title_labels.tsv")
SHAPE_LABELS = os.path.join(REPO, "pipeline", "seeds", "sf_bos_shape_labels.tsv")
GAP_LABELS = os.path.join(REPO, "pipeline", "seeds", "sf_bos_gap_labels.tsv")

# THE SAME NORMALISATION THE FORMS WERE DRAWN WITH. If this drifts from the
# code that produced forms300.txt, labels attach to the wrong records — so it
# lives here, once, and `forms300.txt` is regenerated from it.
STREETS = (r"(?:st(?:reet)?|ave(?:nue)?|blvd|boulevard|road|rd|way|drive|dr"
           r"|place|pl|court|ct|alley|lane|terrace|plaza|highway|hwy)")


# ── PASS B: the form of the SUBJECT CLAUSE, not of the preamble ────────────
# `form_of` keys on the first 16 words, and for this corpus that is mostly the
# Clerk's opening formula — "Resolution No. 14248 (New Series), as follows:
# Resolved, That…" — which is identical across completely unrelated decisions.
# Stripping it first and keying on what FOLLOWS collapses the remainder far
# harder: 40,301 distinct forms instead of 58,000, and the commonest ones are
# recognisable acts rather than boilerplate.
PREAMBLE = re.compile(
    r"^\s*(?:the\s+)?(?:following\s+)?(?:resolution|ordinance|motion|bill)\b"
    r"[^.:]{0,90}?(?:\(?(?:new|second)\s+series\)?|series of\s*#?)?"
    r"[\s,.:;]*(?:entitled[\s,\"']*)?(?:as follows[\s,:]*)?"
    r"(?:be it )?(?:resolved|ordained|it is hereby ordered)?[\s,:]*(?:that\s+)?",
    re.I)


def form_b(t: str, words: int = 9) -> str:
    """The shape of what the record actually DID, preamble removed."""
    s = PREAMBLE.sub(" ", t, count=1).lower()
    s = re.sub(r"\$[\d,.]+", " $ ", s)
    s = re.sub(r"\b\d[\d,.\-/]*\b", " # ", s)
    s = re.sub(r"\b[a-z][a-z'\-]+\s+" + STREETS + r"\b", " ST ", s)
    s = re.sub(r"\b(?:new series|series of|second series)\b", " ", s)
    s = re.sub(r"\bsupervisors?\b[^.]{0,200}", " ", s)
    s = re.sub(r"[^a-z ]+", " ", s)
    return " ".join(" ".join(s.split()).split()[:words])


# ── PASS D's KEY: the purpose clause, not the formula ────────────────────
# Lives here beside `form_b` for the same reason `form_b` does: the code that
# WRITES a label and the code that READS it must normalise identically, so
# there is exactly one definition and both import it. See make_subjects.py for
# why the key cannot be `form_b` — these records share their opening formula
# with rows that are already correctly topiced.
MARK = re.compile(
    r"\b(?:for the purpose of|for the purposes of"
    r"|in payment (?:to|of|for)|on account of|in satisfaction of"
    r"|to defray|for defraying|to enable|for enabling"
    r"|for (?:the )?(?:construction|reconstruction|repair|repairs|improvement"
    r"|improving|paving|repaving|grading|purchase|acquisition|acquiring"
    r"|maintenance|expense|expenses|removal|installation|installing|erection"
    r"|completion|extension|widening|lighting|cleaning|furnishing|equipment"
    r"|rental|salaries|salary|relief|care|support)\b)", re.I)


def subject_form(t: str, words: int = 12) -> str:
    """The shape of the purpose clause, or '' when the line has none."""
    m = MARK.search(t)
    if not m:
        return ""
    s = t[m.start():].lower()
    s = re.sub(r"\$[\d,.]+", " $ ", s)
    s = re.sub(r"\b\d[\d,.\-/]*\b", " # ", s)
    s = re.sub(r"\b[a-z][a-z'\-]+\s+" + STREETS + r"\b", " ST ", s)
    s = re.sub(r"[^a-z ]+", " ", s)
    return " ".join(" ".join(s.split()).split()[:words])


# ── PASS E's KEY: the Clerk's own file title ──────────────────────────────
# The modern record carries something the Journal never did: `ht`, a subject
# heading a person at the Clerk's office wrote on purpose. 93.8% of the rows
# this pass exists for have one, and it is a far better statement of what the
# item is about than its opening formula, which is shared with everything else
# filed that week.
#
# The KEY IS THE WHOLE TITLE, not its leading phrase, and that is the entire
# design. `Administrative Code` alone heads 1,477 unlabelled records about rent
# control, surveillance policy, police equipment and the film commission —
# labelling by leading phrase would repeat exactly the failure the structural
# rules above were written to undo, one sample answering for a group with
# nothing in common.
#
# Numbers, money and fiscal years are normalised out so that "Patient Rates -
# FYs 2016-2017" and "Patient Rates - FYs 2018-2019" are one row to read rather
# than two. Nothing else is touched: the words carry the subject.
def title_form(h: str) -> str:
    """The Clerk's file title, with the numbers taken out of it."""
    h = re.sub(r"\$[\d,\.]+", " $ ", h)
    h = re.sub(r"\bFYs?\s*[\d\-/ ]+", " FY ", h)
    h = re.sub(r"\b\d[\d,\.\-/]*\b", " # ", h)
    return re.sub(r"\s+", " ", h).strip()


def form_of(t: str, words: int = 16) -> str:
    s = t.lower()
    s = re.sub(r"\$[\d,.]+", " $ ", s)
    s = re.sub(r"\b\d[\d,.\-/]*\b", " # ", s)
    s = re.sub(r"\b[a-z][a-z'\-]+\s+" + STREETS + r"\b", " STREET ", s)
    s = re.sub(r"\b(?:new series|series of|second series)\b", " ", s)
    s = re.sub(r"\bsupervisors?\b[^.]{0,200}", " ", s)
    s = re.sub(r"[^a-z ]+", " ", s)
    return " ".join(" ".join(s.split()).split()[:words])


def main() -> int:
    tax = json.load(open(TAXONOMY))
    topics = {t["slug"] for t in tax["topics"]}
    subs = {s["slug"]: t["slug"] for t in tax["topics"] for s in t["subtopics"]}
    actions = {a["slug"] for a in tax["actions"]}
    rtypes = {r["slug"] for r in tax["record_types"]}

    # ── the labels, checked against the taxonomy before anything expands ──
    labels = {}
    bad = []
    with open(LABELS) as f:
        for line in f:
            p = (line.rstrip("\n").split("\t") + ["", "", "", ""])[:5]
            n, rt, top, sub, act = p
            if not n.strip():
                continue
            n = int(n)
            if rt and rt not in rtypes:
                bad.append(f"line {n}: record_type {rt!r}")
            if top and top not in topics:
                bad.append(f"line {n}: topic {top!r}")
            if sub and sub not in subs:
                bad.append(f"line {n}: subtopic {sub!r}")
            if sub and top and subs.get(sub) != top:
                bad.append(f"line {n}: subtopic {sub!r} does not belong to {top!r}")
            if act and act not in actions:
                bad.append(f"line {n}: action {act!r}")
            labels[n] = {"record_type": rt, "topic": top, "subtopic": sub, "action": act}
    if bad:
        print("REFUSED — labels disagree with the taxonomy:")
        for b in bad[:20]:
            print("  ", b)
        return 1
    print(f"{len(labels)} form labels, all valid against the taxonomy")

    # ── the corpus, grouped by form ──────────────────────────────────────
    rows = []
    stub = []
    kind_of = {}
    title_of = {}
    seen_row = set()
    srcs = [ALL_ITEMS] if os.path.exists(ALL_ITEMS) else [HISTORIC, MODERN]
    for path in srcs:
        for line in open(path):
            r = json.loads(line)
            t = " ".join((r.get("t") or "").split())
            rid = f'{r.get("v")}|{r.get("i")}'
            # A ROW TOO SHORT TO SAY ANYTHING IS STILL A ROW. `MIN_TEXT` keeps
            # fragments out of the form grouping — one word cannot carry a
            # sentence shape — but leaving them with no row at all is what made
            # "not classified" indistinguishable from "not a decision". Twelve
            # rows in the corpus are the bare word "Motion" or "Ordinance.";
            # they are cut in half, and they are typed as that here.
            if len(t) <= 25:
                stub.append(rid)
                continue
            if rid in seen_row:
                continue
            seen_row.add(rid)
            rows.append((rid, t))
            kind_of[rid] = r.get("k") or ""
            _ht = (r.get("ht") or "").strip()
            if _ht:
                title_of[rid] = title_form(_ht)
    print(f"{len(rows):,} rows from {', '.join(os.path.basename(p) for p in srcs)}")
    groups = collections.defaultdict(list)
    for rid, t in rows:
        groups[form_of(t)].append(rid)

    # ── PASS A, KEYED ON THE FORM AND NOT ON ITS RANK ────────────────────
    # The label file is keyed by RANK — label 1 belongs to whatever form was
    # commonest. Rank is a property of the CORPUS, not of the form, so the
    # moment the corpus grows the same rank names a different sentence and 300
    # hand labels attach to records nobody read. Growing it by 34,896 rows was
    # exactly that move.
    #
    # So the mapping is pinned. `sf_bos_form_ranks.tsv` holds rank -> form as it
    # stood on the 124,284-row corpus the labels were read against, and the
    # label now finds its form through that file. The ranking below is still
    # computed, but only to REPORT drift — a form whose rank moved is fine; a
    # form that has vanished from the corpus is not, and says so.
    rank_form = {}
    if os.path.exists(FORM_RANKS):
        for line in open(FORM_RANKS):
            if line.startswith("#") or not line.strip():
                continue
            i, _n, form = line.rstrip("\n").split("\t", 2)
            rank_form[int(i)] = form
        missing = [i for i in labels if rank_form.get(i) not in groups]
        if missing:
            print(f"WARNING: {len(missing)} labelled form(s) no longer occur in "
                  f"the corpus: ranks {missing[:8]}")
    else:
        raise SystemExit(
            f"REFUSED: {FORM_RANKS} is missing. Pass A's labels are keyed by "
            f"rank, and rank depends on the corpus — without the pinned mapping "
            f"this would attach 300 hand labels to whatever is commonest today.")

    out = []
    per_topic = collections.Counter()

    # ── WHAT THE ROW IS, BEFORE WHAT IT IS ABOUT ─────────────────────────
    # These three read the row's own STRUCTURE — the record's `kind`, a calendar
    # line ending on a bill number, a roll call and nothing else — and they run
    # FIRST, ahead of every form. They used to run after, and while the corpus
    # stopped in 2016 that was invisible.
    #
    # Widening it to the whole sweep made it very visible. MEASURED on the wider
    # corpus with the old order: 16,275 rows are a roll call and nothing else,
    # and 4,772 of them had been given a subject by a form — "Resolution No.
    # 320-23 ADOPTED by the following vote: Ayes: 8 …" filed under LIQUOR,
    # "Ordinance No. 139-19 FINALLY PASSED … Printed at 1:17 pm" under HOUSING.
    # `form_of()` strips the numbers but keeps the supervisors' names, so each
    # roll of names is its own form, and whoever read one read whatever act
    # happened to be its sample.
    #
    # A row that IS a roll call is a roll call whatever else it looks like. So
    # the structure answers first and the forms fill in behind it.
    # ── what the record's own `kind` already says ────────────────────────
    # `W` is a departmental annual report — Bureau of Engineering, DPW, the
    # Park Commission — not a Board act at all. The sweep has always carried
    # this and nothing was reading it. Every one of the 51 report-prose records
    # found by hand in the tail was `kind = W`, with no exceptions, so this is
    # the record answering for itself rather than a guess about its prose.
    seen_k = {o["id"] for o in out}
    n_kind = 0
    for rid, _t in rows:
        if rid in seen_k or kind_of.get(rid) != "W":
            continue
        out.append({"id": rid, "record_type": "departmental-work", "topic": "",
                    "subtopic": "", "action": "other", "classified_by": "rule"})
        n_kind += 1
    if n_kind:
        print(f"\n{n_kind:,} departmental report rows, from the record's own kind")
    # ── the volume's own calendar rows ───────────────────────────────────
    # "Ordinance, Beach Street. Supervisor McGregor presented: Bill No. 6767," —
    # a line from the Board's calendar, not a decision. Short, and it ends on a
    # bill number with no act in it. Length is part of the test on purpose: the
    # same words inside a real ordinance must not trip it.
    IDXROW = re.compile(r"\bBill No\.?\s*[\d,]*\s*,?\s*$", re.I)
    seen_i = {o["id"] for o in out}
    n_idx = 0
    for rid, t in rows:
        if rid in seen_i or len(t) >= 120 or not IDXROW.search(t):
            continue
        out.append({"id": rid, "record_type": "index-row", "topic": "",
                    "subtopic": "", "action": "other", "classified_by": "rule"})
        n_idx += 1
    if n_idx:
        print(f"{n_idx:,} calendar rows ending on a bill number")
    # ── the roll call and nothing else ───────────────────────────────────
    # "Resolution No. 506-87 Adopted by the following vote: Ayes: Supervisors
    # Britt, Gonzalez, …" — the record IS the roll call. The act it belongs to
    # was printed elsewhere in the volume; this row carries a tally and a list
    # of names, so there is nothing to give a topic to.
    #
    # The 60-character limit is the whole guard: a real ordinance that ends
    # "…Finally passed by the following vote:" has its subject in front of the
    # vote clause and must NOT be swept in here. MEASURED: 30 records drawn at
    # random from what this matches were read one at a time; 30 of 30 carried
    # no act.
    ROLLCALL = re.compile(r"\bby the following vote\b|\bAyes\s*[—:-]\s*Supervisor",
                          re.I)
    seen_v = {o["id"] for o in out}
    n_roll = 0
    for rid, t in rows:
        if rid in seen_v:
            continue
        m = ROLLCALL.search(t)
        if not m or m.start() > 60:
            continue
        out.append({"id": rid, "record_type": "vote-outcome-only",
                    "topic": "running-the-city", "subtopic": "vote-or-scheduling",
                    "action": "voted-or-scheduled", "classified_by": "rule"})
        per_topic["running-the-city"] += 1
        n_roll += 1
    if n_roll:
        print(f"{n_roll:,} rows that are a roll call and nothing else")

    # ── what a member of the public said ─────────────────────────────────
    # "Resolution urging state legislation to enable the creation of a public
    # banking charter (File No. 190118). Anuba S; expressed support."
    #
    # The Clerk prints public comment UNDER the item it was spoken to, so the
    # row opens with a decision and ends with a speaker. It is a record of the
    # meeting, not an act of the Board: 1,223 of the last 1,523 unclassified
    # rows are this, and the topic of the file being spoken to already has its
    # own row elsewhere in the corpus.
    #
    # SO IT IS TYPED AND LEFT WITHOUT A TOPIC, on purpose, exactly like page
    # furniture and an index row. Giving it the subject of the file it quotes
    # would double-count that subject and would say the Board did something it
    # did not do. `themes.subject_span()` refuses the same shape for the same
    # reason.
    # THE PATTERN IS THE CLERK'S FORMAT, NOT A VERB. A first draft matched any
    # of `expressed|spoke|presented|requested|…` anywhere in the row and typed
    # 3,390 rows public comment — including the annual Budget and Appropriation
    # Ordinance, because a long ordinance says "presented" somewhere in it. That
    # is the `p-reparation of plans` failure again: the word is really there and
    # it is not about this row.
    #
    # So the shape is anchored: the file being spoken to, then a NAME, then a
    # semicolon, then the speaking verb — "(File No. 190118). Anuba S; expressed
    # support." A speaker with no name is printed literally as "Speaker;".
    SPEAKER = re.compile(
        r"\(File No\.\s*\d+\)[^;]{0,60};\s*"
        r"(?:expressed|spoke|shared|stated|urged|read|presented|thanked"
        r"|provided|asked|commented|voiced|raised)\b", re.I)
    SPEAKER_NAMED = re.compile(
        r"\b(?:Speakers?|(?:Fe)?male Speaker)\s*;\s*"
        r"(?:expressed|spoke|shared|stated|urged|read|presented|thanked"
        r"|provided|asked|commented|voiced|raised)\b", re.I)
    seen_p = {o["id"] for o in out}
    n_pc = 0
    for rid, t in rows:
        if rid in seen_p:
            continue
        if not (SPEAKER.search(t) or SPEAKER_NAMED.search(t)):
            continue
        out.append({"id": rid, "record_type": "public-comment", "topic": "",
                    "subtopic": "", "action": "other", "classified_by": "rule"})
        n_pc += 1
    if n_pc:
        print(f"{n_pc:,} rows that are public comment on a file, not an act")

    # ── the disposition stamp, and nothing else ──────────────────────────
    # "Ordinance No. 155-24 FINALLY PASSED City and County of San Francisco
    # Page 549 Printed at 9:38 pm on 10/3/24". The Clerk stamps the outcome of
    # an act whose text was printed elsewhere; this row carries a file number, a
    # verb and the page footer. It is the roll-call case without the roll call,
    # so `\bby the following vote\b` never sees it.
    #
    # MEASURED: 2,291 rows are exactly this, and 1,441 of them had been given a
    # subject by a form — 710 under LANDMARKS, 410 under HOUSING, 321 under
    # SUBDIVISIONS. Every one of those numbers is a form's sample record
    # answering for a row that says nothing.
    #
    # The footer is stripped BEFORE the test and the test is anchored at both
    # ends, so a real ordinance that happens to end on a disposition keeps its
    # subject: the pattern only fires when the stamp is the WHOLE row.
    # The footer, and the tally clause that can follow a stamp. Stripping the
    # tally here rather than raising the roll-call rule's 60-character guard is
    # deliberate: that guard is what stops a real ordinance ending "…finally
    # passed by the following vote:" being swept in, and "Motion No. M22-074
    # APPROVED The foregoing items were acted upon by the following vote:" puts
    # the clause at character 62 — two past it. The stamp test below is anchored
    # at both ends, so stripping the tally cannot swallow an act: anything with a
    # subject in front of the stamp still fails to match.
    FURNITURE = re.compile(
        r"City and County of San Francisco\s+Page\s+\d+\s+Printed at.*$"
        r"|(?:The foregoing items? (?:were|was) acted upon\s+)?"
        r"by the following vote\s*:.*$", re.I)
    STAMP = re.compile(
        r"^(?:Resolution|Ordinance|Motion)\s+No\.?\s*[A-Za-z0-9\-]*\s*"
        r"(?:ADOPTED|FINALLY PASSED|PASSED ON FIRST READING|APPROVED|AMENDED"
        r"|RE-?REFERRED|CONTINUED|TABLED|WITHDRAWN)\b[\s.,;:-]*$")
    seen_s = {o["id"] for o in out}
    n_stamp = 0
    for rid, t in rows:
        if rid in seen_s or not STAMP.match(FURNITURE.sub("", t).strip()):
            continue
        out.append({"id": rid, "record_type": "vote-outcome-only",
                    "topic": "running-the-city", "subtopic": "vote-or-scheduling",
                    "action": "voted-or-scheduled", "classified_by": "rule"})
        per_topic["running-the-city"] += 1
        n_stamp += 1
    if n_stamp:
        print(f"{n_stamp:,} rows that are a disposition stamp and nothing else")

    # PASS A now fills in BEHIND the four above, so it has to skip what they
    # already answered.
    seen_a = {o["id"] for o in out}
    for i, lab in sorted(labels.items()):
        f = rank_form.get(i)
        ids = groups.get(f) if f else None
        if not ids:
            continue
        for rid in ids:
            if rid in seen_a:
                continue
            out.append({"id": rid, **lab, "classified_by": "form"})
            if lab["topic"]:
                per_topic[lab["topic"]] += 1

    # ── PASS B, keyed on the form STRING rather than on its rank ─────────
    # The rank of a form depends on how much is already classified, so a
    # rank-keyed label file would attach to a different form every time the
    # seed grows. `forms_b.jsonl` carries the form itself, and that is the key.
    fb = os.path.join(SCRATCH, "forms_b.jsonl")
    lb = os.path.join(SCRATCH, "form_labels_b.tsv")
    n_b = 0
    if os.path.exists(fb) and os.path.exists(lb):
        by_i = {}
        for line in open(fb):
            d = json.loads(line)
            by_i[d["i"]] = d["form"]
        lab_b = {}
        for line in open(lb):
            parts = (line.rstrip("\n").split("\t") + ["", "", "", ""])[:5]
            if not parts[0].strip():
                continue
            i = int(parts[0])
            f = by_i.get(i)
            if not f:
                continue
            lab_b[f] = {"record_type": parts[1], "topic": parts[2],
                        "subtopic": parts[3], "action": parts[4]}
        bad_b = []
        for f, l in lab_b.items():
            if l["topic"] and l["topic"] not in topics:
                bad_b.append(f"topic {l['topic']!r}")
            if l["subtopic"] and subs.get(l["subtopic"]) != l["topic"]:
                bad_b.append(f"subtopic {l['subtopic']!r} not under {l['topic']!r}")
            if l["action"] and l["action"] not in actions:
                bad_b.append(f"action {l['action']!r}")
            if l["record_type"] and l["record_type"] not in rtypes:
                bad_b.append(f"record_type {l['record_type']!r}")
        if bad_b:
            print("REFUSED — pass-B labels disagree with the taxonomy:")
            for b in bad_b[:12]:
                print("  ", b)
            return 1
        seen_b = {o["id"] for o in out}
        for rid, t in rows:
            if rid in seen_b:
                continue
            l = lab_b.get(form_b(t))
            if l:
                out.append({"id": rid, **l, "classified_by": "form"})
                if l["topic"]:
                    per_topic[l["topic"]] += 1
                n_b += 1
        print(f"\n{n_b:,} more from {len(lab_b)} subject-clause forms")

    # ── records read one at a time ───────────────────────────────────────
    rl = os.path.join(SCRATCH, "record_labels.tsv")
    n_rec = 0
    if os.path.exists(rl):
        seen_r = {o["id"] for o in out}
        for line in open(rl):
            parts = (line.rstrip("\n").split("\t") + ["", "", "", ""])[:5]
            rid = parts[0].strip()
            if not rid or rid in seen_r:
                continue
            lab = {"record_type": parts[1], "topic": parts[2],
                   "subtopic": parts[3], "action": parts[4]}
            if lab["topic"] and lab["topic"] not in topics:
                print(f"REFUSED: record label topic {lab['topic']!r}")
                return 1
            if lab["subtopic"] and subs.get(lab["subtopic"]) != lab["topic"]:
                print(f"REFUSED: record label subtopic {lab['subtopic']!r}")
                return 1
            out.append({"id": rid, **lab, "classified_by": "record"})
            seen_r.add(rid)
            if lab["topic"]:
                per_topic[lab["topic"]] += 1
            n_rec += 1
        print(f"{n_rec:,} records read one at a time")

    # ── PASS E: the Clerk's own file title, read one title at a time ─────
    # Runs LAST of the labelling passes, so it only ever fills a gap: a row any
    # earlier pass answered keeps that answer. Every title in the seed was read
    # by hand; see the note on `title_form` for why the key is the whole title.
    n_title = 0
    if os.path.exists(TITLE_LABELS):
        lab_t, bad_t = {}, []
        for line in open(TITLE_LABELS):
            if line.startswith("#") or not line.strip():
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 4:
                continue
            title, top, sub, act = parts[0], parts[1], parts[2], parts[3]
            if top and top not in topics:
                bad_t.append(f"{title[:50]!r}: topic {top!r}")
            if sub and subs.get(sub) != top:
                bad_t.append(f"{title[:50]!r}: subtopic {sub!r} not under {top!r}")
            if act and act not in actions:
                bad_t.append(f"{title[:50]!r}: action {act!r}")
            lab_t[title] = {"record_type": "decision", "topic": top,
                            "subtopic": sub, "action": act}
        if bad_t:
            print("REFUSED — title labels disagree with the taxonomy:")
            for b in bad_t[:12]:
                print("  ", b)
            return 1
        seen_t = {o["id"] for o in out}
        for rid, _t in rows:
            if rid in seen_t:
                continue
            l = lab_t.get(title_of.get(rid, ""))
            if l:
                out.append({"id": rid, **l, "classified_by": "title"})
                if l["topic"]:
                    per_topic[l["topic"]] += 1
                n_title += 1
        print(f"\n{n_title:,} from {len(lab_t):,} Clerk file titles read by hand")

    # ── the rows too short to group ──────────────────────────────────────
    seen_stub = {o["id"] for o in out}
    n_stub = 0
    for rid in stub:
        if rid in seen_stub:
            continue
        out.append({"id": rid, "record_type": "cut-in-half", "topic": "",
                    "subtopic": "", "action": "other", "classified_by": "rule"})
        n_stub += 1
    if n_stub:
        print(f"{n_stub:,} rows too short to be a sentence, typed cut-in-half")

    # ── PASS F: the tail, read one sentence-shape at a time ──────────────
    # What is left after every other pass. It is small (434 rows) and it is not
    # one thing: public comment the Clerk printed without a file number, so the
    # anchored rule above cannot see it; procedural amendments ("Ordinance be
    # AMENDED in Section 3.203…"); page footers; and a tail of real acts. Every
    # shape in the seed was read.
    n_shape = 0
    if os.path.exists(SHAPE_LABELS):
        lab_s, bad_s = {}, []
        for line in open(SHAPE_LABELS):
            if line.startswith("#") or not line.strip():
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 5:
                continue
            shape, rt, top, sub, act = parts[0], parts[1], parts[2], parts[3], parts[4]
            if rt and rt not in rtypes:
                bad_s.append(f"record_type {rt!r}")
            if top and top not in topics:
                bad_s.append(f"topic {top!r}")
            if sub and subs.get(sub) != top:
                bad_s.append(f"subtopic {sub!r} not under {top!r}")
            if act and act not in actions:
                bad_s.append(f"action {act!r}")
            lab_s[shape] = {"record_type": rt, "topic": top,
                            "subtopic": sub, "action": act}
        if bad_s:
            print("REFUSED — shape labels disagree with the taxonomy:")
            for b in bad_s[:12]:
                print("  ", b)
            return 1
        seen_sh = {o["id"] for o in out}
        for rid, t in rows:
            if rid in seen_sh:
                continue
            l = lab_s.get(form_b(t))
            if l:
                out.append({"id": rid, **l, "classified_by": "record"})
                if l["topic"]:
                    per_topic[l["topic"]] += 1
                n_shape += 1
        if n_shape:
            print(f"{n_shape:,} from {len(lab_s)} sentence shapes read one at a time")

    # ── the three families that earned it ────────────────────────────────
    # Measured against a hand-read blind sample of 156 records: these agreed
    # 90-100% of the time. Every other family scored between 0% and 67% and is
    # deliberately NOT here — a rule that is right two times in three is worse
    # than an honest blank, because nothing downstream can tell which third it
    # got wrong. See CLASSIFY-SPEC.md for the per-family table.
    KEEPERS = [
        ("the-street", "grades", "ordered",
         r"official grades?\b|changing and re-?establish\w*|establishing grades"),
        ("the-street", "sidewalk-widths", "amended",
         r"regulating the width of sidewalks|width of sidewalks"),
        ("the-street", "set-back-lines", "ordered",
         r"set-?back lines?"),
        ("the-street", "closed-for-a-day", "granted",
         r"temporar\w* clos\w+|street fair|closed to vehicular traffic"),
        ("the-street", "closed-for-good", "ordered",
         r"clos(?:e|ed|ing) and abandon|\bvacat(?:e|ing|ion) of\b"
         r"|closing certain streets|permanent closure|intent to vacate"),
        ("the-street", "street-names", "ordered",
         r"changing the name of|commemorative street name|official street names"),
        ("public-money", "lawsuits", "settled",
         r"settlement of (?:the |a |two )?(?:portion of the )?lawsuit"
         r"|authorizing settlement|superior court, case no"
         r"|united states district court|\bunlitigated claim\b"),
    ]
    KEEP_RX = [(t, sub, act, re.compile(pat, re.I)) for t, sub, act, pat in KEEPERS]
    seen_ids = {o["id"] for o in out}
    n_rule = 0
    for rid, t in rows:
        if rid in seen_ids:
            continue
        for top, sub, act, rx in KEEP_RX:
            if rx.search(t):
                out.append({"id": rid, "record_type": "decision", "topic": top,
                            "subtopic": sub, "action": act, "classified_by": "rule"})
                per_topic[top] += 1
                n_rule += 1
                break
    print(f"\n{n_rule:,} more from the three families that agreed 90-100% "
          f"with a hand read")

    # ── PASS C: the rest of the tail, read form by form ──────────────────
    # Pass B read the 2,000 commonest forms. This is the same mechanism run to
    # exhaustion over what was left: `make_tail.py` groups everything still
    # unlabelled into units, `tail_batch.py` prints them commonest-first and
    # writes the answers back keyed by the form string.
    #
    # A form whose first nine words are pure Clerk boilerplate covers records
    # with nothing in common, and those were NOT labelled here — they were
    # marked SPLIT and came back as one unit per record, landing in
    # record_labels.tsv above. So every form in this file is one somebody read
    # and judged to determine the answer for its whole group.
    fc = os.path.join(SCRATCH, "form_labels_c.tsv")
    n_c = 0
    if os.path.exists(fc):
        lab_c = {}
        bad_c = []
        for line in open(fc):
            p = (line.rstrip("\n").split("\t") + ["", "", "", ""])[:5]
            if not p[0].strip():
                continue
            l = {"record_type": p[1], "topic": p[2],
                 "subtopic": p[3], "action": p[4]}
            if l["topic"] and l["topic"] not in topics:
                bad_c.append(f"{p[0]!r}: topic {l['topic']!r}")
            if l["subtopic"] and subs.get(l["subtopic"]) != l["topic"]:
                bad_c.append(f"{p[0]!r}: subtopic {l['subtopic']!r}")
            if l["action"] and l["action"] not in actions:
                bad_c.append(f"{p[0]!r}: action {l['action']!r}")
            if l["record_type"] and l["record_type"] not in rtypes:
                bad_c.append(f"{p[0]!r}: record_type {l['record_type']!r}")
            lab_c[p[0]] = l
        if bad_c:
            print("REFUSED — pass-C labels disagree with the taxonomy:")
            for b in bad_c[:12]:
                print("  ", b)
            return 1
        seen_c = {o["id"] for o in out}
        for rid, t in rows:
            if rid in seen_c:
                continue
            l = lab_c.get(form_b(t))
            if l:
                out.append({"id": rid, **l, "classified_by": "form"})
                if l["topic"]:
                    per_topic[l["topic"]] += 1
                n_c += 1
        print(f"{n_c:,} more from {len(lab_c):,} forms read to exhaust the tail")

    # ── PASS D: the SUBJECT, for decisions whose formula named none ──────
    # Everything above answers "what did the Board do". For most rows the same
    # answer carried the topic with it, because the formula that fixed the verb
    # also named the subject. For ~6,100 it did not: "the sum of $1,250 be and
    # the same is hereby set aside, appropriated and authorized to be expended"
    # is an appropriation whether the money buys a sewer or defends a lawsuit.
    # Those rows were frozen with an action and an empty topic rather than given
    # the topic of whichever record happened to be read first.
    #
    # This pass goes back for the subject and ONLY the subject. It cannot change
    # `record_type` or `action`, and it cannot touch a row that already has a
    # topic — both are asserted below rather than left to convention.
    #
    # A blank topic in this file is a RESULT, not a gap: somebody read the line
    # and it names no single subject, usually because one appropriation covers
    # several unrelated budget items. Those rows keep their empty topic and are
    # NOT counted as filled.
    sd = os.path.join(SCRATCH, "subject_labels.tsv")
    n_d = n_d_none = 0
    if os.path.exists(sd):
        lab_d: dict[str, dict[str, tuple[str, str]]] = {"form": {}, "record": {}}
        bad_d = []
        for line in open(sd):
            p = (line.rstrip("\n").split("\t") + ["", "", "", ""])[:4]
            kind, key, top, sub = p
            if not key.strip() or kind not in lab_d:
                continue
            if top and top not in topics:
                bad_d.append(f"topic {top!r}")
            if sub and subs.get(sub) != top:
                bad_d.append(f"subtopic {sub!r} not under {top!r}")
            lab_d[kind][key] = (top, sub)
        if bad_d:
            print("REFUSED — subject labels disagree with the taxonomy:")
            for b in bad_d[:12]:
                print("  ", b)
            return 1
        text_of = dict(rows)
        for o in out:
            if o["record_type"] != "decision" or o["topic"]:
                continue
            t = text_of.get(o["id"])
            if t is None:
                continue
            hit = lab_d["record"].get(o["id"])
            if hit is None:
                f = subject_form(t)
                hit = lab_d["form"].get(f) if f else None
            if hit is None:
                continue
            top, sub = hit
            if not top:
                n_d_none += 1
                continue
            o["topic"], o["subtopic"] = top, sub
            o["classified_by"] = "purpose-clause"
            per_topic[top] += 1
            n_d += 1
        print(f"\n{n_d:,} subjects recovered from the purpose clause"
              f"  ({n_d_none:,} read and naming no single subject)")

    # ── the same sentence with different scan errors ─────────────────────
    # The Journal reprints an ordinance at every reading and the OCR of the two
    # printings differs, so `form_of` — which only strips numbers, money and
    # street names — files them as two different forms. A 4-gram shingle
    # overlap catches what normalisation cannot: "Authorizing an expenditure of
    # $22,- 98G.97" is "Authorizing an expenditure of $22,986.97".
    #
    # THE THRESHOLD IS DELIBERATELY HIGH. At 0.80 of the smaller shingle set
    # these are the same sentence, not merely the same kind of sentence — the
    # looser the test, the more this becomes guessing dressed as propagation.
    # It carries its own `classified_by` so a reader can discount it.
    def shingles(t, k=4):
        w = re.sub(r"[^a-z ]+", " ", t.lower()).split()[:30]
        return {" ".join(w[i:i + k]) for i in range(max(0, len(w) - k + 1))}

    # SORTED, NOT SET ORDER. Both loops below take the first 6 shingles of a
    # record to keep the index small. `set` iteration order depends on string
    # hashes, and CPython randomises those per process — so unsorted, this pass
    # indexed a different 6 shingles on every run and the seed came out
    # different each time it was frozen (measured: 124,267 then 124,237 records
    # from identical inputs). Sorting makes the choice a property of the text
    # instead of a property of the process, which is what a versioned seed needs.
    labelled = {o["id"]: o for o in out}
    lab = [(o["id"], txt, shingles(txt)) for rid, txt in rows
           if (o := labelled.get(rid)) is not None]
    idx = collections.defaultdict(list)
    for i, (_rid, _t, sh) in enumerate(lab):
        for sg in sorted(sh)[:6]:
            idx[sg].append(i)
    n_near = 0
    for rid, t in rows:
        if rid in labelled:
            continue
        sh = shingles(t)
        cand = collections.Counter()
        for sg in sorted(sh)[:6]:
            for j in idx.get(sg, ())[:40]:
                cand[j] += 1
        best, bs = None, 0.0
        for j, _c in cand.most_common(8):
            o = len(sh & lab[j][2]) / max(1, min(len(sh), len(lab[j][2])))
            if o > bs:
                bs, best = o, j
        if best is not None and bs >= 0.80:
            src = labelled[lab[best][0]]
            out.append({"id": rid, "record_type": src["record_type"],
                        "topic": src["topic"], "subtopic": src["subtopic"],
                        "action": src["action"], "classified_by": "near-duplicate"})
            if src["topic"]:
                per_topic[src["topic"]] += 1
            n_near += 1
    print(f"\n{n_near:,} more from records that are the same sentence with "
          f"different scan errors")

    # ── PASS G: the fund an appropriation comes OUT OF ───────────────────
    # 343 appropriations reached this point with an action and no topic, and
    # the reason is documented above: the form fixes the ACTION — "the following
    # amounts be and the same are hereby set aside" is always an appropriation —
    # while what the money was FOR sits past the end of the formula, so the form
    # label deliberately left the topic blank rather than guess it.
    #
    # But these records are not silent about their subject. They name the FUND:
    #
    #   "…out of the hereinafter mentioned funds…, to-wit: Sewer Fund, Bond
    #    Issue 1904. (1) For construction of Bakers Beach outlet sewer…"
    #
    # The fund is the City's own word for what the money is for, printed in the
    # record, and it is a closed vocabulary — Municipal Railway Construction,
    # County Road, Hospital-Jail Completion, Polytechnic High School. So this is
    # not the model guessing from prose; it is reading a name the record states.
    #
    # IT RUNS LAST, AFTER EVERY OTHER PASS, and only on a row that has an
    # action and no topic. Order is the whole safety of it: placed earlier it
    # ran before the purpose-clause pass and took 1,498 rows that pass would
    # have given a more specific subject to — a coarse answer arriving first
    # and blocking a better one. Where no fund is named the row keeps its
    # honest blank.
    FUNDS = [
        (r"municipal railway|geary street railway|railway construction"
         r"|railway depreciation", "getting-around", "transit"),
        (r"sewer", "the-street", "sewers"),
        (r"pav(?:e|ing|ement)|repaving|repaying|county road|street repair"
         r"|repairs to streets", "the-street", "street-works"),
        (r"water construction|municipal water works|water works|hetch hetchy",
         "city-services", "water-supply"),
        (r"hospital|emergency hospital|health", "city-services", "health"),
        (r"high school|school", "city-services", "schools"),
        (r"county jail|jail", "city-services", "police"),
        (r"fire (?:department|house|protection)", "city-services", "fire"),
        (r"librar", "city-services", "libraries"),
        (r"park|playground|esplanade|ocean beach|golden gate park",
         "city-services", "parks"),
        (r"city hall|civic center|auditorium|public buildings"
         r"|repairs to buildings|furniture", "land-and-building", "construction"),
    ]
    FUND_RX = [(re.compile(p, re.I), t, s2) for p, t, s2 in FUNDS]
    FUND_SEG = re.compile(r"to-?wit\s*:?\s*(.{0,90})", re.I)
    OUT_OF = re.compile(r"out of (?:the )?(?!the hereinafter)(.{0,80})", re.I)
    text_of = dict(rows)
    n_fund = 0
    for o in out:
        if o["topic"] or not o["action"] or o["record_type"] != "decision":
            continue
        t = text_of.get(o["id"], "")
        m = FUND_SEG.search(t) or OUT_OF.search(t)
        if not m:
            continue
        seg = m.group(1)
        for rx, top, sub in FUND_RX:
            if rx.search(seg):
                o["topic"], o["subtopic"] = top, sub
                o["classified_by"] = "fund"
                per_topic[top] += 1
                n_fund += 1
                break
    if n_fund:
        print(f"{n_fund:,} appropriations given a subject by the fund they name")

    # ── PASS H: the rows that end with an action and no subject ──────────
    # After every other pass, 759 rows still had an action and no topic. They
    # were read one sentence-shape at a time, and the answer is mostly that they
    # are not decisions with a missing subject — they are the historic Journal's
    # own debris: a record that begins mid-sentence, a supervisor's remark during
    # debate, a communication read into the minutes. So this pass may change the
    # RECORD TYPE as well as fill the topic, which no other late pass does.
    #
    # It runs after PASS G for the same reason G runs after the purpose clause:
    # the most specific answer must arrive first, and a hand read is the most
    # specific answer there is.
    n_gap = 0
    if os.path.exists(GAP_LABELS):
        lab_g, bad_g = {}, []
        for line in open(GAP_LABELS):
            if line.startswith("#") or not line.strip():
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 5:
                continue
            shape, rt, top, sub, act = parts[:5]
            if rt and rt not in rtypes:
                bad_g.append(f"record_type {rt!r}")
            if top and top not in topics:
                bad_g.append(f"topic {top!r}")
            if sub and subs.get(sub) != top:
                bad_g.append(f"subtopic {sub!r} not under {top!r}")
            if act and act not in actions:
                bad_g.append(f"action {act!r}")
            lab_g[shape] = (rt, top, sub, act)
        if bad_g:
            print("REFUSED — gap labels disagree with the taxonomy:")
            for b in bad_g[:12]:
                print("  ", b)
            return 1
        for o in out:
            if o["topic"] or o["record_type"] != "decision":
                continue
            l = lab_g.get(form_b(text_of.get(o["id"], "")))
            if not l:
                continue
            rt, top, sub, act = l
            o["record_type"] = rt or o["record_type"]
            o["topic"], o["subtopic"] = top, sub
            if act:
                o["action"] = act
            o["classified_by"] = "record"
            if top:
                per_topic[top] += 1
            n_gap += 1
        if n_gap:
            print(f"{n_gap:,} rows with an action and no subject, read by shape")

    # THE WHOLE CORPUS, not just the rows long enough to group. `rows` excludes
    # the 12 one-word fragments, and dividing by it printed 100.0% of a number
    # smaller than the corpus — the coverage claim has to be against every
    # record the file holds, or it is not a coverage claim.
    n_corpus = len(rows) + len(stub)
    print(f"\n{len(out):,} records labelled = {100*len(out)/n_corpus:.1f}% "
          f"of {n_corpus:,}")
    with_topic = sum(1 for o in out if o["topic"])
    print(f"  of those, carry a topic : {with_topic:,} = {100*with_topic/max(1,len(out)):.0f}%")
    print(f"  action only (topic not determined by the form): "
          f"{len(out)-with_topic:,}")

    print("\nby topic")
    for k, v in per_topic.most_common():
        print(f"  {k:<24}{v:>8,}")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["id", "record_type", "topic", "subtopic",
                                          "action", "classified_by"])
        w.writeheader()
        w.writerows(out)
    print(f"\n-> {OUT}  ({os.path.getsize(OUT)/1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
