"""How often does "a decision happened HERE" land on the right block?

The index infers position from the words of the record. The record itself
occasionally prints the answer — "Assessor's Block 2622" — and where it does, the
inferred join can be run again as if it had not, and scored. That is the only
ground truth available, and it is genuine: nothing in the addr / segment / corner
join reads the stated block.

    python3 blocks/measure_accuracy.py   ->  $BLOCKS_OUT/accuracy.json  (~4 min)

── THE STALENESS ASSERT READS THE FILE THE PAGE PRINTS BESIDE ────────────────

This figure is the project's own honesty claim. It was measured once, on
2026-08-23, and the shards under it were rebuilt three times without it — the
page went on saying *"checked against 906 decisions: 84.8 % landed"* against an
index more than three times that size. `sf_data_audit.md` A2.

The old assert compared `locate()`'s tier counts against
`$BLOCKS_OUT/block-index.json` — a file written by the SAME build, in the SAME
directory, that goes stale in the SAME direction. **A guard that reads a stale
input to decide whether it is stale is not a guard**, and MINUTES.md §24.6
recorded it passing on an index that had moved 3358 -> 3359/16378 underneath it.

So it now compares against **`PUB_INDEX` — the published
`website/public/data/us/sf/city/blocks/block-index.json`**, which is the index
the reader's browser fetches and the one this number will be printed beside.
That file cannot rot in step with this measurement, because publishing it is a
separate act from running this script: if the site ships an index this run does
not reproduce, the assert fires and nothing is written.

The assert can only stop a WRONG number being written. It cannot notice that a
RIGHT number was never re-taken — nothing that has not been run can. That half
of the job is `accuracy.test.ts`, which replays the fingerprint written below
against the shipped index on every `npm test`, and fails the build the moment
the two disagree.

── THE ANSWER KEY IS WHAT THE INDEX ITSELF READS AS A STATED BLOCK ───────────

`stated_blocks()` takes `wide=`, which reads the Clerk's forms as well as the
Journal's, and `locate()` switches it **per row, by where the row came from**
(`r["v"].startswith(SFBOS_NS)`). This scores the same rule, for the reason
MINUTES.md §24.5 asks for it: the answer key must be the set of rows whose text
the index considers to state a block, or the two are measuring different corpora.

**Reading the Clerk's wording cannot make the index score better.** The stated
block is the answer key and never an input to the thing being scored — pass 2
hides it. It enlarges the key. Both keys are measured and both are written, so
the enlargement is visible rather than asserted.
"""
import collections, hashlib, json, math, os, sys
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_index as BI

# Code in the repo, data under CITY_DATA. See _paths.py.
from _paths import OUT, REPO  # noqa: F401
HERE = os.path.dirname(os.path.abspath(__file__))

# The index as the reader's browser fetches it. Overridable so a control build
# can be scored against its own published tree, never so the assert can be
# pointed back at the directory this script writes into.
PUB_INDEX = os.environ.get("PUB_INDEX") or os.path.join(
    REPO, "website", "public", "data", "us", "sf", "city", "blocks",
    "block-index.json")

# One block face. San Francisco's median block is about 110 m on its long side, so
# a placement one block off is roughly this far out and no further.
FACE_M = 120.0
NEAR_M = 250.0
FAR_M = 600.0


def score(blind, truth, bpos, TN):
    """The blind join, scored against an answer key. Returns (totals, by_tier)."""
    by_tier = collections.defaultdict(lambda: collections.Counter())
    tot = collections.Counter()
    for did, tier, hits, _f in blind:
        if did not in truth or tier < 1:
            continue                      # block precision only; street tier is §2's other section
        want = set(truth[did])
        exact = bool(want & set(hits))
        # distance from the nearest inferred block to the nearest stated one
        d = min((math.dist(bpos[h], bpos[w]) for h in hits if h in bpos
                 for w in want if w in bpos), default=float("inf"))
        for bucket, ok in (("exact", exact), ("face", exact or d <= FACE_M),
                           ("near", exact or d <= NEAR_M), ("far", not exact and d > FAR_M)):
            if ok:
                by_tier[TN[tier]][bucket] += 1
                tot[bucket] += 1
        by_tier[TN[tier]]["n"] += 1
        tot["n"] += 1
    return tot, by_tier


def rates(tot, by_tier):
    n = tot["n"]
    return {
        "n": n,
        "exact": round(100.0 * tot["exact"] / n, 1),
        "within_one_block_face": round(100.0 * tot["face"] / n, 1),
        "within_250m": round(100.0 * tot["near"] / n, 1),
        "over_600m": round(100.0 * tot["far"] / n, 1),
        "by_tier": {k: {"n": v["n"], "exact": round(100.0 * v["exact"] / v["n"], 1),
                        "within_one_block_face": round(100.0 * v["face"] / v["n"], 1)}
                    for k, v in sorted(by_tier.items()) if v["n"]},
    }


def main():
    idx = BI.street_index()
    blocks = json.load(open(os.path.join(BI.GEO, "blocks.json")))
    idx = BI.geometry_guard(idx, blocks)
    idx = {k: v for k, v in idx.items() if v}
    bmeta = {b["b"]: b for b in blocks}
    bpos = {b["b"]: (b["cx"], b["cy"]) for b in blocks}
    order = {b["b"]: i for i, b in enumerate(blocks)}
    items, _npre, _nnew = BI.load_items()

    TN = {4: "stated", 3: "addr", 2: "segment", 1: "corner", 0: "street"}

    # ---- pass 1: exactly what shipped -----------------------------------
    placed, _unpl, tier_n = BI.locate(items, idx, bmeta, bpos, order, use_stated=True)
    pub = json.load(open(PUB_INDEX))["meta"]
    shipped = pub["precision_counts"]
    got = {TN[k]: v for k, v in tier_n.items()}
    if got != shipped:
        sys.exit(f"STALE: locate() does not reproduce the PUBLISHED index.\n"
                 f"  {PUB_INDEX}\n"
                 f"  published {shipped}\n  now       {got}\n"
                 f"Either this build is not the one that shipped, or the shipped "
                 f"index is not the one this build produces. Do not publish an "
                 f"accuracy figure beside an index it did not score.")
    print("pass 1 reproduces the PUBLISHED index exactly:", got, flush=True)

    # the stated blocks, per item — the answer key, read the way locate() reads it
    truth, truth_journal = {}, {}
    for did, r in enumerate(items):
        wide = r["v"].startswith(BI.SFBOS_NS)
        sb = BI.stated_blocks(r["t"], bmeta, wide=wide)
        if sb and len(sb) <= 4:
            truth[did] = sb
        # the control: the Journal's wording only, which is the key the figure
        # published on 2026-08-23 was taken over
        sj = sb if not wide else BI.stated_blocks(r["t"], bmeta, wide=False)
        if sj and len(sj) <= 4:
            truth_journal[did] = sj
    print(f"answer key : {len(truth)} items "
          f"({len(truth_journal)} on the Journal's wording alone)", flush=True)

    # ---- pass 2: the same join, blind to the stated block ---------------
    blind, _u2, _t2 = BI.locate(items, idx, bmeta, bpos, order, use_stated=False)
    print("pass 2 (stated-blind) placed", len(blind), "items", flush=True)

    tot, by_tier = score(blind, truth, bpos, TN)
    jt, jb = score(blind, truth_journal, bpos, TN)

    n = tot["n"]
    if n < 50:
        sys.exit(f"only {n} ground-truth placements — too few to publish a rate")

    # ── THE FINGERPRINT ──────────────────────────────────────────────────
    # What this score describes, taken from the published index rather than
    # from anything this run wrote. `accuracy.test.ts` recomputes it from the
    # shipped file and fails when it moves, which is the check the old assert
    # could not be.
    fp = {
        "precision_counts": shipped,
        "n_decisions_placed": pub["n_decisions_placed"],
        "n_blocks": pub["n_blocks"],
        "sha256": hashlib.sha256(
            json.dumps(shipped, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()[:16],
    }

    acc = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "generated_by": "blocks/measure_accuracy.py",
        **rates(tot, by_tier),
        "face_m": FACE_M, "near_m": NEAR_M, "far_m": FAR_M,
        "key_items": len(truth),
        "index": fp,
        "control_journal_wording_only": {
            "key_items": len(truth_journal), **rates(jt, jb),
            "note": ("The same blind join scored against the smaller answer key "
                     "the Journal's own wording gives. Published for one reason: "
                     "reading the Clerk's forms as well enlarges the KEY and "
                     "cannot flatter the JOIN, and the two lines are what shows "
                     "that."),
        },
        "street_tier_note": (
            "Street-tier decisions name a street and nothing else, so they are not "
            "scored here at all: they are not a claim about a block."),
        "method": ("Every decision whose text prints its own assessor block, joined "
                   "again with that sentence hidden from the join, and scored against "
                   "what the record said. Nothing in the address, segment or corner "
                   "join reads the stated block. The key is read with the same "
                   "per-row rule locate() uses: the Clerk's forms on the Clerk's "
                   "PDFs, the Journal's on the Journal."),
        "staleness": (
            "`index` above is the published block-index.json this score was taken "
            "against. It is asserted on every site build by "
            "website/src/lib/city/accuracy.test.ts, which re-reads the "
            "shipped index rather than anything this script wrote."),
    }
    p = os.path.join(OUT, "accuracy.json")
    os.makedirs(OUT, exist_ok=True)
    json.dump(acc, open(p, "w"), indent=1)
    print(json.dumps(acc, indent=1))
    print("wrote", p)


if __name__ == "__main__":
    main()
