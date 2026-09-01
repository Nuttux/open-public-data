# -*- coding: utf-8 -*-
"""THE SECOND PASS: the 33,841 records the first run never wrote.

    python3 pipeline/scripts/us_sf_city/plain/pass2.py [--samples N]

── WHY THERE IS A SECOND PASS ──────────────────────────────────────────────
The first run wrote 90,443 of 124,284 records. The 33,841 it did not write
were not judged unwritable — they were never assessed. Two separate causes,
MEASURED:

    15,250   named no street, and `harness.load_records` opened with
             `if not o.get('r'): continue`. A record has to name a street to
             be OFFERED, because the map needed a dot. But the year panel
             lists decisions with no dot at all, so that requirement was the
             map's, not the reader's.

    18,591   named a street and `pred.predicate` returned None on them.

`predicate` is an EXTRACTOR: it finds the event span so a writer has
something to read, and returns None when its patterns do not match. Using
that None as "this record states no event" conflates two different things —
the record has no event, and the regex has no rule for how this record says
it. Read the second bucket and the difference is obvious:

    Resolved, That the building generally known as "Mowry's Hall", or the
    "Gantner and Mattern Building", corner of Laguna and Grove streets…
        -> a real event. `RESOLVED_BE` wants the verb inside 190 characters
           and the building's two names push it past.

    Resolution No. 8 (New Series), by the following vote: Ayes — Supervisors
    Coffey, Coleman, Davis, Furey, Gallagher, Harrigan, Lonergan, Wilson — 8.
        -> genuinely nothing. A number and a roll call.

So the second pass does not widen the regexes — that would be guessing at
the shapes of 18,591 records from a handful. It inverts the question. The
writer reads the whole record anyway, so the only thing worth deciding
mechanically is whether there is anything on the page AT ALL. Everything
else goes to a writer, and the same gate checks what comes back.

── WHAT IS EXCLUDED, AND ONLY THIS ─────────────────────────────────────────
A record is held back only when, after the roll call and the page furniture
are removed, too little text remains to state anything. That is a claim
about the page, not about the record's importance, and it is the one claim
that can be made without reading.

Anything held back is written to `pass2_held.jsonl` with the reason, so the
decision is inspectable rather than a number in a summary.
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path("/Users/daniel/code/open-public-data")
STORE = ROOT / "pipeline/data/sf_bos/plain_lines.jsonl"
ITEMS = pathlib.Path("/tmp/items_merged.jsonl")
HELD = ROOT / "pipeline/data/sf_bos/pass2_held.jsonl"

# ── THE PAGE FURNITURE ──────────────────────────────────────────────────────
# The same strippers the first run used, kept identical on purpose: a record
# assessed by one rule in pass 1 and another in pass 2 would make the corpus
# inconsistent in a way no reader could see and no gate would catch.
TALLY = re.compile(r"(?:Ayes?|Noes?|Absent|Excused)\s*[:—–-][^.]{0,400}?(?:—\s*\d+\s*\.|\.)", re.I)
VOTED = re.compile(r"\b(?:Adopted|Finally [Pp]assed|Passed for Second Reading|"
                   r"PASSED ON FIRST READING|The motion carried)\s+by the following vote\s*:?", re.I)
ROLL = re.compile(r"\bSupervisors?\s+(?:[A-Z][\w'-]+,\s*){3,}[A-Z][\w'-]+\s*[—–-]?\s*\d*\.?", re.I)
SITE = re.compile(r"https?://\S+|City and County of San Francisco Page \d+[^.]*")

# a record that is its own citation and nothing else
NUMBER_ONLY = re.compile(
    r"^\W{0,4}(?:Resolution|Ordinance|Motion|File)s?\s*(?:No\.?)?\s*[\d][\w\-.]{0,9}\s*"
    r"(?:\((?:New Series|Second Series|Series of \d{4})\)\s*)?[.,;:]?\s*$", re.I)

# the Clerk's own boilerplate, printed on every page of a modern file
FURNITURE = re.compile(
    r"^\W{0,4}(?:Board of Supervisors|City and County of San Francisco|"
    r"Printed at \d|Page \d+|Meeting (?:Agenda|Minutes)|Roll Call|"
    r"Present:|Absent:|Quorum|The meeting (?:convened|adjourned|recessed)|"
    r"There being no further business)\b", re.I)

# ── A ROLL CALL WITHOUT THE WORD "SUPERVISORS" IN FRONT OF IT ───────────────
# `ROLL` needs the word to anchor on and the Journal often drops it, printing
# the names straight after the item: "Resolution. Booth, Broderiek, Center.
# Comte. Connolly, D'Ancona, Giannini, Hocks…". What identifies it is not the
# capitals — the Journal sets every heading in Title Case, so counting capitals
# holds back "Ordinance Declaring Nineteenth Avenue Boulevard" as readily as a
# roll call, which is what a first version of this file did to 1,498 records.
#
# What identifies it is the PUNCTUATION: a run of single capitalised words each
# ending in a comma or a full stop. A heading's words are separated by spaces.
BARE_ROLL = re.compile(
    r"\b(?:[A-Z][A-Za-z'’.-]{2,}\s*[,.]\s*){3,}[A-Z][A-Za-z'’.-]{2,}\s*"
    r"(?:[—–-]\s*\d+\s*\.?)?")

# ── THE SUBJECT IN SQUARE BRACKETS IS A SUBJECT ─────────────────────────────
# From the 1990s the Clerk puts the subject beside the file number, and the
# whole record can be "Ordinance No. [Amended Road Easement]" — four words,
# every one of them the point. Counting words holds those back; they are the
# most writable records in the corpus. CLEANUP.md rule 4 is the same finding
# from the other direction.
BRACKET_SUBJ = re.compile(r"[\[({]\s*([A-Za-z][^\]})]{5,})\s*[\]})]")


def substance(t: str) -> str:
    """The record with the roll call and the page furniture taken out."""
    t = TALLY.sub(" ", t)
    t = VOTED.sub(" ", t)
    t = ROLL.sub(" ", t)
    t = BARE_ROLL.sub(" ", t)
    t = SITE.sub(" ", t)
    return re.sub(r"\s+", " ", t).strip()


def held_reason(t: str) -> str | None:
    """Why this record cannot be written, or None if it can be offered.

    The bar is deliberately low: this answers "is there anything on the page",
    never "is this worth writing". A record that states a small event is a
    record, and a bracketed subject of two words states one.
    """
    s = substance(t)
    # a bracketed subject is the record, however short the rest of the page is
    b = BRACKET_SUBJ.search(s) or BRACKET_SUBJ.search(t)
    if b and len(b.group(1).split()) >= 2:
        return None
    if len(s.split()) < 6:
        return "nothing left once the roll call is removed"
    if NUMBER_ONLY.match(s):
        return "a file number and nothing else"
    if FURNITURE.match(s) and len(s.split()) < 14:
        return "the Clerk's page furniture"
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--samples", type=int, default=6)
    args = ap.parse_args()

    if not ITEMS.exists():
        sys.exit(f"missing {ITEMS} — the merged item file is a build artifact; "
                 f"rebuild it before running the second pass")

    done = {json.loads(l)["id"] for l in STORE.open()}
    offer: list[dict] = []
    held: list[dict] = []
    why = collections.Counter()
    by_decade = collections.Counter()
    samples: dict[str, list] = collections.defaultdict(list)

    for ln in ITEMS.open():
        o = json.loads(ln)
        rid = f"{o['v']}|{o['i']}"
        if rid in done:
            continue
        t = o.get("t") or ""
        r = held_reason(t)
        if r:
            why[r] += 1
            held.append({"id": rid, "y": o["y"], "why": r, "t": t[:300]})
            if len(samples[r]) < args.samples:
                samples[r].append((o["y"], substance(t)[:150]))
            continue
        offer.append({"id": rid, "y": o["y"], "t": t,
                      "p": [(x.get("d") or x.get("s") or "") for x in (o.get("r") or [])][:3],
                      "placed": bool(o.get("r"))})
        by_decade[o["y"] // 10 * 10] += 1

    with HELD.open("w") as fh:
        for h in held:
            fh.write(json.dumps(h, ensure_ascii=False) + "\n")

    unwritten = len(offer) + len(held)
    print(f"unwritten records   {unwritten:,}")
    print(f"  to offer          {len(offer):,}  ({100*len(offer)/unwritten:.1f}%)")
    print(f"  held back         {len(held):,}  ({100*len(held)/unwritten:.1f}%)")
    print(f"\nheld back, by reason:")
    for r, n in why.most_common():
        print(f"  {n:6,}  {r}")
    placed = sum(1 for o in offer if o["placed"])
    print(f"\nof the offered: {placed:,} name a place (a dot on the map), "
          f"{len(offer)-placed:,} do not (year panel only)")
    print(f"\nto offer, by decade:")
    for d in sorted(by_decade):
        print(f"  {d}s  {by_decade[d]:6,}")
    for r, v in samples.items():
        print(f"\n--- held: {r} ---")
        for y, s in v:
            print(f"  {y}  {s}")
    print(f"\nheld records written to {HELD}")


if __name__ == "__main__":
    main()
