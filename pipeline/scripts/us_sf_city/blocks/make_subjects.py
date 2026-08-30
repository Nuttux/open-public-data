#!/usr/bin/env python3
"""The decisions that say what the Board DID but not what about, grouped to read.

    make_subjects.py

INPUT   pipeline/seeds/sf_bos_classification.csv   the frozen seed
OUTPUT  scratchpad/sf-classify/subject_units.jsonl reading units, commonest first

WHAT THIS PASS IS FOR. Most of the corpus was sorted by its opening formula —
the shape of the sentence with numbers, money and street names removed. That
works because the formula fixes the verb: "the sum of $1,250 be and the same is
hereby set aside, appropriated and authorized to be expended" is an
appropriation every time. It does NOT fix the subject, because the subject is
past the end of the formula, and the same formula pays for a sewer in one line
and for litigation in the next. Those rows were frozen with an action and an
empty topic rather than given the topic of whichever record was read first.

This pass goes back for the subject, and only the subject. It never touches
`record_type` or `action`: those were read and are right.

THE KEY IS NOT `form_b`, AND THAT IS THE WHOLE POINT. These records share their
opening formula with thousands of rows that ARE correctly topiced. Writing a
topic against that form — the way `tail_batch.py` does — would reach back and
re-topic every one of them. So the unit key here is the PURPOSE CLAUSE: the
text from "for the purpose of…", "in payment to…", "for the construction of…"
onward, normalised the same way. A row with no purpose clause in it gets no
group and is read on its own.

WHY 12 WORDS AND NOT 9. `form_b` cuts at nine because nine is where a Clerk's
formula stops being boilerplate. A purpose clause starts at the informative
part and stays informative longer — at nine words "in payment to the hereinafter
named persons being payments" has not reached the subject yet.
"""
from __future__ import annotations

import argparse
import collections
import csv
import json
import os

import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from _paths import CACHE, REPO  # noqa: E402
from freeze_classification import MARK, subject_form  # noqa: E402

SCRATCH = os.path.join(REPO, "scratchpad", "sf-classify")
SEED = os.path.join(REPO, "pipeline", "seeds", "sf_bos_classification.csv")
HISTORIC = os.path.join(CACHE, "items.jsonl")
MODERN = os.path.join(REPO, "pipeline/scripts/us_sf_city/cache_sfbos/items.jsonl")
OUT = os.path.join(SCRATCH, "subject_units.jsonl")
ANSWERS = os.path.join(SCRATCH, "subject_labels.tsv")

def load_rows() -> dict[str, dict]:
    rows = {}
    for path in (HISTORIC, MODERN):
        for line in open(path, encoding="utf-8"):
            r = json.loads(line)
            t = " ".join((r.get("t") or "").split())
            if len(t) <= 25:
                continue
            rows[f'{r.get("v")}|{r.get("i")}'] = {
                "y": r.get("y"), "h": r.get("h") or "", "t": t,
            }
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", default=SEED)
    args = ap.parse_args()

    corpus = load_rows()
    want = []
    with open(args.seed, encoding="utf-8") as fh:
        for d in csv.DictReader(fh):
            if d["record_type"] == "decision" and not d["topic"]:
                r = corpus.get(d["id"])
                if r:
                    want.append({"id": d["id"], "action": d["action"], **r})
    print(f"{len(want):,} decisions carry an action and no topic")

    for r in want:
        r["f"] = subject_form(r["t"])
    n_with = sum(1 for r in want if r["f"])
    print(f"{n_with:,} have a purpose clause ({100*n_with/max(1,len(want)):.1f}%), "
          f"{len(want)-n_with:,} do not and are read one at a time")

    # ALREADY ANSWERED IS NOT THE SAME AS ALREADY TOPICED. A unit read and
    # marked as naming no subject keeps its empty topic, so it is still in
    # `want` — and without this it would be handed back for reading on every
    # single run, for ever. The answer file is the record of what has been
    # looked at, so it is what decides; that is also what makes this pass
    # resumable after the excerpt width or the marker list changes.
    answered = set()
    if os.path.exists(ANSWERS):
        for line in open(ANSWERS, encoding="utf-8"):
            p = line.rstrip("\n").split("\t")
            if len(p) >= 2 and p[1].strip():
                answered.add((p[0], p[1]))

    groups: dict[tuple[str, str], list[dict]] = collections.defaultdict(list)
    for r in want:
        key = ("form", r["f"]) if r["f"] else ("record", r["id"])
        if key in answered:
            continue
        groups[key].append(r)
    ranked = sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0][1]))
    if answered:
        print(f"{len(answered):,} units already answered and not handed back")

    with open(OUT, "w", encoding="utf-8") as fh:
        for rank, ((kind, key), members) in enumerate(ranked, 1):
            m = members[0]
            # SHOW THE LINE FROM THE PURPOSE CLAUSE ON. The formula in front of
            # it is identical across every unit here, so printing from the start
            # of the record would spend the whole reading width on boilerplate.
            mk = MARK.search(m["t"])
            ex = m["t"][mk.start():] if mk else m["t"]
            fh.write(json.dumps({
                "rank": rank, "kind": kind, "key": key, "n": len(members),
                "y": m["y"], "h": m["h"][:60], "action": m["action"],
                "ex": " ".join(ex.split())[:700],
            }, ensure_ascii=False) + "\n")

    n_form = sum(1 for (k, _), _ in ranked if k == "form")
    covered = sum(len(v) for (k, _), v in groups.items() if k == "form")
    print(f"{len(ranked):,} units ({n_form:,} purpose-clause forms covering "
          f"{covered:,} records, {len(ranked)-n_form:,} single records)")
    print(f"-> {OUT}")


if __name__ == "__main__":
    main()
