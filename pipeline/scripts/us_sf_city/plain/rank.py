# -*- coding: utf-8 -*-
"""READ EVERY WRITTEN LINE AND SAY HOW MUCH IT MATTERS.

    python3 pipeline/scripts/us_sf_city/plain/rank.py --prep 20 --n 1200
    python3 pipeline/scripts/us_sf_city/plain/rank.py --take
    python3 pipeline/scripts/us_sf_city/plain/rank.py --status

── WHY THIS IS READ AND NOT COMPUTED ───────────────────────────────────────
Four rounds of stated preference established the dimension, and one attempt to
encode it as keyword lists scored WORSE than the arithmetic it replaced —
-0.112 against +0.229 on the round where money was held out. The words
`hospital`, `library` and `park` appear with equal weight in a citywide
staffing emergency and in a dog hospital at one address, and telling those
apart is the entire judgement. So `IMPORTANCE.md` is a rubric a reader applies,
and this file is the machinery around it.

Read blind against that rubric, on records it had never seen, it agreed with
the stated preference at +0.374 mean against the formula's +0.237, and got
four of the five rules right on direct pairwise tests.

── THE PART THAT MAKES UPDATES CHEAP ───────────────────────────────────────
A score is a pure function of one line and the rubric. Nothing about it depends
on the rest of the corpus — deliberately, because the routineness term that
DOES depend on the corpus lives in `score.py` and is frozen to a seed there.

So a new record is read once, on arrival, and never again. `RUBRIC_VERSION` is
stored on every row: change the rubric, bump it, and only rows at an older
version are re-read. A corpus that is 99% scored costs 1% of a pass to update,
which is the difference between a thing that gets run and a thing that does not.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
DATA = pathlib.Path("/Users/daniel/code/open-public-data/pipeline/data/sf_bos")
STORE = DATA / "plain_lines.jsonl"
RANKS = DATA / "importance.jsonl"
WORK = DATA / "rankwork"
RUBRIC = HERE / "IMPORTANCE.md"

RUBRIC_VERSION = 4


def rubric_hash() -> str:
    return hashlib.sha1(RUBRIC.read_bytes()).hexdigest()[:10]


# ── THE GATE: DID THIS READER PENALISE GRAMMAR? ────────────────────────────
# Readers keep deciding that "street levels to be changed" is a proposal and
# "street levels changed" is adopted. It is the same fact written twice, and
# the demotion is worth 12 to 18 points where it happens.
#
# The obvious check — compare all infinitive lines against all others — DOES
# NOT WORK, and rejected a batch on it before the flaw showed. Infinitive
# phrasing correlates with renamings, hearings and one-party payments, which
# the rubric scores low ON PURPOSE. "Garden Lane to be renamed" scoring 12 is
# the renaming rule working, not tense bias.
#
# What works is matched pairs: the same act appearing in the corpus both ways.
# Strip the infinitive marker, collide the two spellings, and compare the twins
# directly. Where a batch has fewer than eight such pairs the test cannot
# decide, and the batch is taken — a check that cannot see is not evidence of
# a fault.
TOBE = re.compile(r"\b(to be|to get|to have)\s+", re.I)


def _skeleton(line: str) -> str:
    s = TOBE.sub(" ", line)
    s = re.sub(r"\b(will|shall|would)\s+", " ", s, flags=re.I)
    return re.sub(r"[^a-z0-9 ]", "", re.sub(r"\s+", " ", s.lower())).strip()


def tense_gap(scores: dict, lines: dict):
    """(mean points the infinitive twin loses, how many pairs) or (None, n)."""
    g = collections.defaultdict(lambda: ([], []))
    for i, sc in scores.items():
        ln = lines.get(i)
        if ln:
            g[_skeleton(ln)][0 if TOBE.search(ln) else 1].append(sc)
    d = [sum(a)/len(a) - sum(b)/len(b) for a, b in g.values() if a and b]
    if len(d) < 8:
        return None, len(d)
    return sum(d)/len(d), len(d)


def done() -> dict:
    if not RANKS.exists():
        return {}
    out = {}
    for l in RANKS.open():
        r = json.loads(l)
        if r.get("rv") == RUBRIC_VERSION:
            out[r["id"]] = r
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prep", type=int, default=0, help="how many batches to lay out")
    ap.add_argument("--n", type=int, default=1200, help="lines per batch")
    ap.add_argument("--take", action="store_true", help="ingest returned batches")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--restamp", action="store_true",
                    help="set every outstanding hand-out to the current rubric; "
                         "run this immediately before launching workers")
    args = ap.parse_args()

    WORK.mkdir(parents=True, exist_ok=True)
    store = [json.loads(l) for l in STORE.open()]
    have = done()

    if args.status:
        n = len(store)
        print(f"written lines   {n:,}")
        print(f"scored          {len(have):,}  ({100*len(have)/max(1,n):.1f}%)")
        print(f"to read         {n-len(have):,}")
        print(f"rubric          v{RUBRIC_VERSION}, sha {rubric_hash()}")
        if have:
            vals = sorted(r["score"] for r in have.values())
            b = collections.Counter()
            for v in vals:
                b["80-100" if v >= 80 else "55-79" if v >= 55 else
                  "30-54" if v >= 30 else "10-29" if v >= 10 else "0-9"] += 1
            print("\nband spread so far:")
            for k in ("80-100", "55-79", "30-54", "10-29", "0-9"):
                print(f"  {k:7} {b[k]:7,}  ({100*b[k]/len(vals):4.1f}%)")
        return

    if args.restamp:
        n = 0
        for q in sorted(WORK.glob("batch-*.rubric")):
            q.write_text(json.dumps({"rv": RUBRIC_VERSION, "rh": rubric_hash()}) + "\n")
            n += 1
        print(f"{n} hand-outs stamped v{RUBRIC_VERSION} sha {rubric_hash()}")
        print("  ONLY safe before workers launch. A reader put it plainly: had "
              "the rewrite gone the other way, 1,200 rows would have claimed a "
              "rubric they were not read against, with rv unchanged, so nothing "
              "would ever re-read them.")
        return

    if args.take:
        lines = {r["id"]: r["line"] for r in store}
        got = 0
        with RANKS.open("a") as out:
            for p in sorted(WORK.glob("done-*.jsonl")):
                sp = WORK / (p.name.replace("done-", "batch-").replace(".jsonl", ".rubric"))
                # ── AN UNSTAMPED FILE IS NOT CURRENT WORK ──────────────────
                # It used to default to the rubric in force NOW, which credited
                # a re-delivered batch with a rubric it never saw: a worker
                # rewrote its file against a version that was still being
                # edited, its stamp had been retired by an earlier ingest, and
                # 1,200 rows were recorded as read under the final rubric.
                # Refusing is the safe direction — the batch is re-read.
                if not sp.exists():
                    sp2 = WORK / ("issued-" + p.name[len("done-"):-len(".jsonl")] + ".rubric")
                    sp = sp2 if sp2.exists() else sp
                if not sp.exists():
                    print(f"  {p.name}: SKIPPED — no rubric stamp, so what it "
                          f"read cannot be established")
                    continue
                stamp = json.loads(sp.read_text())
                bad = 0
                rows = []
                for l in p.open():
                    try:
                        r = json.loads(l)
                        s = int(r["score"])
                    except Exception:
                        bad += 1
                        continue
                    if not (0 <= s <= 100) or r["id"] in have:
                        bad += 1
                        continue
                    rows.append({"id": r["id"], "score": s,
                                 "band": r.get("band", ""), "why": r.get("why", ""),
                                 "rv": stamp["rv"], "rh": stamp["rh"]})
                gap, npairs = tense_gap({r["id"]: r["score"] for r in rows}, lines)
                if gap is not None and gap < -4:
                    print(f"  {p.name}: REJECTED — the infinitive twin loses "
                          f"{-gap:.1f} points over {npairs} matched pairs")
                    p.rename(WORK / "rejected" / p.name)
                    continue
                for r in rows:
                    out.write(json.dumps(r, ensure_ascii=False) + "\n")
                    # only a row read under the CURRENT rubric counts as done.
                    # Adding every ingested row here reported 3,600 records as
                    # read at v4 when the file held none: they were v3 work,
                    # correctly stamped, and correctly still outstanding.
                    if r["rv"] == RUBRIC_VERSION:
                        have[r["id"]] = r
                got += len(rows)
                print(f"  {p.name}: took {len(rows):,}" + (f", skipped {bad}" if bad else ""))
                p.rename(WORK / ("taken-" + p.name[len("done-"):]))
                # ── AND RETIRE THE HAND-OUT, OR ITS IDS STAY "IN FLIGHT" ────
                # `--prep` treats every batch-*.jsonl as work outstanding. A
                # taken batch left on disk therefore hides its own records from
                # the next wave — which is invisible until a rubric bump makes
                # them due for re-reading and 19,200 of them silently do not
                # come back.
                src = WORK / p.name.replace("done-", "batch-")
                if src.exists():
                    src.rename(WORK / ("issued-" + src.name[len("batch-"):]))
                stamp_p = src.with_suffix(".rubric")
                if stamp_p.exists():
                    stamp_p.rename(WORK / ("issued-" + src.name[len("batch-"):-len(".jsonl")]
                                           + ".rubric"))
        print(f"\n{got:,} scores in; {len(have):,} of {len(store):,} read")
        return

    todo = [r for r in store if r["id"] not in have]
    inflight = set()
    for p in WORK.glob("batch-*.jsonl"):
        inflight |= {json.loads(l)["id"] for l in p.open()}
    todo = [r for r in todo if r["id"] not in inflight]
    start = 1 + max((int(p.stem.split("-")[1]) for p in WORK.glob("batch-*.jsonl")),
                    default=0)
    made = 0
    for i in range(0, min(len(todo), args.prep * args.n), args.n):
        chunk = todo[i:i + args.n]
        p = WORK / f"batch-{start+made:03d}.jsonl"
        with p.open("w") as fh:
            for r in chunk:
                fh.write(json.dumps({"id": r["id"], "line": r["line"],
                                     "year": r["y"]}, ensure_ascii=False) + "\n")
        # ── STAMP AT HAND-OUT, AND RE-STAMP AT LAUNCH ──────────────────────
        # Stamping here fixes the ingest-time bug but opens the mirror of it:
        # prep, then edit the rubric, then launch, and the stamp is OLDER than
        # the read. That happened — eight batches were labelled with a hash
        # from two minutes before the anchor table was added, while the workers
        # read the table. A reader caught it. `--restamp` sets every
        # outstanding hand-out to the rubric as it stands NOW, and belongs
        # immediately before workers are launched.
        # `--take` used the rubric version current when it RAN, which is not
        # the one the worker read. Fixing the rubric mid-wave would then have
        # relabelled every batch already in flight as though it had been
        # scored under the new one — the corpus would say v3 and mean v2, and
        # nothing would ever re-read it.
        p.with_suffix(".rubric").write_text(
            json.dumps({"rv": RUBRIC_VERSION, "rh": rubric_hash()}) + "\n")
        print(f"  {p.name}  {len(chunk):,} lines")
        made += 1
    print(f"\n{made} batches, {min(len(todo), args.prep*args.n):,} lines out; "
          f"{len(todo)-min(len(todo), args.prep*args.n):,} still queued")


if __name__ == "__main__":
    main()
