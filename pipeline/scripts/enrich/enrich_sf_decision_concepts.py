"""The subjects a pattern cannot reach — read, not matched.

    python3 pipeline/scripts/enrich/enrich_sf_decision_concepts.py --limit 200
    python3 pipeline/scripts/enrich/enrich_sf_decision_concepts.py --report
    python3 pipeline/scripts/enrich/enrich_sf_decision_concepts.py            # the sweep

WHY A SECOND TAGGER EXISTS AT ALL.

`blocks/themes.py` tags every decision by pattern, and it is right for what it
does: the Board's own recurring phrases — `stable permit`, `spur track`,
`liquor license` — are exact, cheap and repeatable, and they carry the eight map
subjects and the forty-one fiche subjects between them.

What a pattern CANNOT do is decide what a document is about when the record
never says the word. Measured on this corpus:

    `equity`  ->  70 hits, which are the federal Transportation Equity Act, a
                  Cultural Equity Endowment Fund, and a court case
    `arts`    -> 983 hits, which are roll-call votes and a list of elevator
                  loading zones

Near-zero precision, because the Board cleared the Fillmore without writing the
word race once. That is not a pattern that needs improving. It is a different
question, and the only thing that can answer it is something that reads the
record.

TWO TAGGERS, KEPT APART ON PURPOSE. This writes its own field and never edits
the pattern masks. "The word appears" and "a model judged it" are different
claims, and a reader — or an auditor — has to be able to tell which one is
behind any given mark. Merging them into one number would destroy exactly that.

THE VOCABULARY IS CLOSED AND THE MODEL MAY REFUSE. It picks from the list below
or returns nothing; it is never asked what a decision is "about" in the open.
An open-ended labeller invents a taxonomy that drifts between batches, and
nothing downstream could tell a real trend from a change in the model's mood.

THE LIST IS A STARTING VOCABULARY, NOT A VALIDATED ONE. Nothing here has been
scored against a human answer key yet, and it must not be published as if it
had. `--report` prints a sample per concept for exactly that purpose: read them,
cut what does not survive, and record the cut. `project_sf_*` in memory has the
same rule for every family this repo has shipped.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "pipeline" / "scripts" / "us_sf_city" / "blocks"))

CACHE = ROOT / "pipeline" / "cache" / "enrichment" / "sf_decision_concepts.json"
HISTORIC = ROOT / "scratchpad/sf-city-anim/blocks/cache/items.jsonl"
MODERN = ROOT / "pipeline/scripts/us_sf_city/cache_sfbos/items.jsonl"

MODEL = os.environ.get("CLAUDE_MODEL", "claude-opus-5")

# ── the closed vocabulary ───────────────────────────────────────────────────
# Every entry is a subject the pattern taggers demonstrably cannot reach, with
# the plain sentence the model is judged against. Keep these short: a long
# definition is a place for a model to find a reading nobody intended.
CONCEPTS = [
    ("displacement", "people or businesses made to leave a place — clearance, "
                     "relocation, condemnation of occupied buildings, eviction "
                     "as a consequence of a public project"),
    ("race-and-segregation", "race, ethnicity or national origin as a subject of "
                             "the decision — including decisions whose stated "
                             "purpose is to separate, exclude or redress"),
    ("arts-and-culture", "art, music, theatre, museums, murals, festivals or "
                         "cultural institutions as the subject"),
    ("disability-and-access", "physical access, accommodation, or services for "
                              "disabled or elderly people"),
    ("labour-and-wages", "wages, hours, working conditions, strikes, or the "
                         "terms on which the city employs or contracts labour"),
    ("public-health-emergency", "an epidemic, outbreak, quarantine or declared "
                                "health emergency"),
    ("environmental-harm", "pollution, contamination, toxic material, noise or "
                           "damage to habitat as the subject of the decision"),
    ("who-pays-and-who-benefits", "the decision explicitly weighs a cost or a "
                                  "benefit falling on one group of people rather "
                                  "than another"),
]
SLUGS = [c[0] for c in CONCEPTS]

SYSTEM = """You label San Francisco Board of Supervisors records by subject.

You are given numbered records. For each, return the concepts it is ABOUT, from
the closed list you are given and from nowhere else.

RULES, in order of importance:

1. ABOUT, not MENTIONED. A record that names a street in Chinatown is not about
   race. A budget line that funds a museum among forty other things is not about
   art. If the concept is not what the record is FOR, do not return it.
2. RETURN NOTHING RATHER THAN A WEAK MATCH. Most records are paving, permits,
   sewers and payments, and the correct answer for them is an empty list. An
   empty list is a good answer and is expected for the large majority.
3. NEVER INFER FROM WHAT YOU KNOW ABOUT SAN FRANCISCO. Judge only the text in
   front of you. If a record describes clearing a district without saying who
   lived there, it is displacement; it is not race-and-segregation unless the
   record itself makes that its subject.
4. The text is OCR of scanned pages and is often broken mid-sentence. A record
   too damaged to read gets an empty list, not a guess.

Return one entry per record, in the order given, using the record's own id."""

SCHEMA = {
    "type": "object",
    "properties": {
        "records": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "concepts": {
                        "type": "array",
                        "items": {"type": "string", "enum": SLUGS},
                    },
                },
                "required": ["id", "concepts"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["records"],
    "additionalProperties": False,
}


def load_records(max_chars: int):
    """Every mappable decision, keyed the way the shards key them."""
    out = []
    for p in (HISTORIC, MODERN):
        if not p.exists():
            sys.exit(f"REFUSED: {p} is not there. See blocks/INTEGRATION.md §6.")
        for line in open(p):
            r = json.loads(line)
            t = r.get("t") or ""
            if len(t) <= 25 or not r.get("r"):
                continue
            key = f'{r["v"]}|{r["i"]}'
            out.append((key, r.get("y"), t[:max_chars]))
    return out


def ask(client, batch, model: str):
    """One batch -> {key: [concept, ...]}. Raises on a malformed reply."""
    listing = "\n".join(
        f"[{i}] ({yr}) {txt}" for i, (_k, yr, txt) in enumerate(batch)
    )
    vocab = "\n".join(f"- {s}: {d}" for s, d in CONCEPTS)
    msg = client.messages.create(
        model=model,
        max_tokens=8000,
        system=SYSTEM,
        # THE VOCABULARY IS THE STABLE PREFIX AND THE RECORDS ARE NOT, so the
        # cacheable half is written first and the breakpoint sits between them.
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text",
                     "text": f"The closed list of concepts:\n{vocab}",
                     "cache_control": {"type": "ephemeral"}},
                    {"type": "text", "text": f"The records:\n{listing}"},
                ],
            }
        ],
        output_config={"format": {"type": "json_schema", "schema": SCHEMA},
                       "effort": "low"},
    )
    if msg.stop_reason == "refusal":
        raise RuntimeError(f"refused: {getattr(msg, 'stop_details', None)}")
    text = "".join(b.text for b in msg.content if b.type == "text")
    data = json.loads(text)
    got = {}
    for row in data["records"]:
        i = row["id"]
        if not (0 <= i < len(batch)):
            continue
        got[batch[i][0]] = [c for c in row["concepts"] if c in SLUGS]
    return got, msg.usage


def report(entries, records, n=4):
    """A sample per concept, so a wrong concept is read rather than trusted."""
    by_key = {k: t for k, _y, t in records}
    print(f"{len(entries):,} records labelled\n")
    for slug, desc in CONCEPTS:
        hits = [k for k, v in entries.items() if slug in v]
        print(f"── {slug}  ({len(hits):,})  — {desc}")
        for k in hits[:n]:
            print(f"     {(by_key.get(k) or '')[:150]}")
        if not hits:
            print("     (nothing)")
        print()
    none = sum(1 for v in entries.values() if not v)
    print(f"empty (correct for most records): {none:,} = "
          f"{100*none/max(1,len(entries)):.0f}%")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0,
                    help="stop after N records; 0 is the whole corpus")
    ap.add_argument("--batch", type=int, default=40,
                    help="records per request")
    ap.add_argument("--chars", type=int, default=1200,
                    help="characters of each record sent")
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--refresh", action="store_true",
                    help="ignore the cache and re-read")
    ap.add_argument("--report", action="store_true",
                    help="print a sample per concept from the cache and stop")
    ap.add_argument("--estimate", action="store_true",
                    help="print what the full sweep would cost and stop")
    a = ap.parse_args()

    records = load_records(a.chars)
    cache = json.loads(CACHE.read_text()) if CACHE.exists() and not a.refresh else {}
    entries: dict = cache.get("records", {})

    if a.report:
        report(entries, records)
        return 0

    todo = [r for r in records if r[0] not in entries]
    if a.limit:
        todo = todo[: a.limit]

    if a.estimate:
        chars = sum(len(t) for _k, _y, t in records)
        print(f"mappable records      : {len(records):,}")
        print(f"already cached        : {len(entries):,}")
        print(f"characters to send    : {chars/1e6:.1f}M")
        print(f"~ input tokens        : {chars/4/1e6:.2f}M "
              f"(plus ~{len(records)//a.batch:,} x system+vocabulary)")
        print(f"batches of {a.batch}         : {-(-len(records)//a.batch):,} requests")
        print("\nRun --limit 200 first and read --report before the sweep.")
        return 0

    if not todo:
        print("nothing to do; every record is cached")
        return 0

    try:
        import anthropic
    except ImportError:
        sys.exit("REFUSED: pip install anthropic")
    client = anthropic.Anthropic()

    CACHE.parent.mkdir(parents=True, exist_ok=True)
    n_in = n_out = n_fail = 0
    t0 = time.time()
    for s in range(0, len(todo), a.batch):
        batch = todo[s : s + a.batch]
        try:
            got, usage = ask(client, batch, a.model)
        except Exception as e:                      # noqa: BLE001
            n_fail += 1
            print(f"  batch {s//a.batch}: {type(e).__name__}: {e}", flush=True)
            continue
        entries.update(got)
        n_in += usage.input_tokens
        n_out += usage.output_tokens
        done = min(s + a.batch, len(todo))
        if (s // a.batch) % 5 == 0 or done == len(todo):
            print(f"  {done:,}/{len(todo):,}  in {n_in/1e6:.2f}M / out "
                  f"{n_out/1e3:.0f}k  {time.time()-t0:.0f}s", flush=True)
        CACHE.write_text(json.dumps(
            {"model": a.model, "concepts": SLUGS, "chars": a.chars,
             "source": "pipeline/scripts/enrich/enrich_sf_decision_concepts.py",
             "not_validated": "The vocabulary has not been scored against a "
                              "human answer key. Do not publish these as "
                              "measured until it has.",
             "records": entries}, separators=(",", ":")))
    print(f"\n{len(entries):,} cached · {n_fail} batch(es) failed")
    print(f"tokens in {n_in:,} / out {n_out:,}")
    print(f"→ {CACHE}")
    print("\nNow read a sample before trusting any of it:  --report")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
