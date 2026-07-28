#!/usr/bin/env python3
"""Generate plain-English explanations for SF supplier contracts.

The SF register has no descriptive field — `scope_of_work` is capped at 50
chars and is ≈ a truncated copy of the title (measured, docs/us/block-studies/
3-contracts.md §5). 59% of titles start with a department code and read like
`PUC_CPSF_SYSTEMENERGY3201-FY24`. The block study called title generation the
highest-value enrichment for this dataset and it was deferred; this is it.

Produces, per contract:
    title_clear     — one line, ≤120 chars, plain English
    what_concretely — 2-3 sentences: who does what, where, to what end

Both are GENERATED, not extracted, and the site labels them as such next to
the register's verbatim title (the Paris ContratFiche pattern).

Grounding rules, enforced in the prompt and checked after:
  * the only facts available are title + type + department + purchasing
    authority + prime contractor + amounts + term. Nothing else exists;
  * the model may rephrase, expand a standard abbreviation and add the kind
    of context the contract type implies — it may NOT name a location, a
    population, a program or a dollar figure that is not in the input;
  * a title with no readable subject (tier 3) is never decoded — the text is
    written from the other columns alone, which is a plain-English restatement
    of the register rather than a guess.

Work is deduplicated by (normalized title, contract type): the register
repeats titles heavily ("ADMGA FY24 GOS ARTS" ×235), so ~32k contracts are
~24k distinct generation units, and every contract sharing a signature gets
the same text.

Runs on the Batch API (50% cheaper, one request per signature, results in
under an hour typically). Idempotent: signatures already in the cache are
never re-sent.

Usage:
    # what it would cost and how many items, no API call
    python pipeline/scripts/enrich/vulgarize_sf_contracts_llm.py --plan

    # 40-item live sample to eyeball quality before committing to the corpus
    ANTHROPIC_API_KEY=... python .../vulgarize_sf_contracts_llm.py --limit 40

    # the whole register
    ANTHROPIC_API_KEY=... python .../vulgarize_sf_contracts_llm.py

    # collect a batch submitted earlier
    ANTHROPIC_API_KEY=... python .../vulgarize_sf_contracts_llm.py --collect msgbatch_...
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

from google.cloud import bigquery

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "pipeline" / "scripts" / "export"))
from us_sf_title_tier import title_tier  # noqa: E402

BQ_PROJECT = "open-data-france-484717"
BQ_DATASET = "dbt_us_marts"
CACHE_PATH = PROJECT_ROOT / "pipeline" / "cache" / "enrichment" / "vulgarization_sf_contracts.json"

DEFAULT_MODEL = "claude-opus-5"
# Per-MTok list prices; the Batch API halves both. Kept here only so --plan can
# print an estimate — never used to pick a model.
PRICES = {
    "claude-opus-5": (5.0, 25.0),
    "claude-sonnet-5": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
}
BATCH_DISCOUNT = 0.5

SYSTEM_PROMPT = """You explain San Francisco city contracts to residents who are not procurement experts.

You receive the complete set of facts a contract register holds about one contract. There is no other source: no description field exists. Your job is to make the register's administrative shorthand readable — not to research the contract.

Return two fields:

title_clear — ONE line, max 120 characters, plain English, sentence case. Expand the register's abbreviations ("Phmcy Scndry Dist." -> "Secondary pharmacy distribution"; "Rcrtn Ctr Rbd" -> "Recreation center rebuild"). Drop department-code prefixes and fiscal-year tags. Name what the money is for, not who signed it.

what_concretely — 2 to 3 sentences, max 320 characters total. What does this contract actually pay for? Who does the work, and for whom? Use the contract type and the department to say what kind of arrangement it is (a construction job, a grant the City gives out, a lease, a purchase of goods). Write like a newspaper: short sentences, no jargon.

ABSOLUTE RULES:
1. Invent nothing. Every noun you write must be traceable to the input. Do NOT name a neighborhood, street, building, population served, program, or partner organization unless it appears in the input. Do NOT state a dollar amount, a date, or a count that is not in the input.
2. Expanding a standard abbreviation is allowed and expected. Guessing what a code means is not: if you cannot tell what "CLP" or "RA4082" refers to, leave it out rather than inventing an expansion.
3. When the title carries no readable subject (it is only a vendor name, a bare code like "693JJ3185002", or a single letter), do NOT try to decode it. Describe the contract from the other columns instead: the type says what kind of arrangement it is, the department says who signed, the prime says who is paid. "A grant from the Mayor's Office to the Eviction Defense Collaborative" is correct and useful. Naming a purpose those columns do not state is not. If the columns are empty too, return an empty string for both fields.
4. Neutral register. You are describing what the City buys, not judging it. No praise, no suspicion, no words like "controversial", "generous", "wasteful", "no-bid".
5. Do NOT name the prime contractor in either field. Several contracts often share one title and type, and your answer is applied to all of them — their prime contractors differ, so naming one makes the text false for the others. Describe the KIND of counterparty when it helps ("a construction firm", "a nonprofit", "a drug distributor"); the site displays the actual name beside your text.
6. Never imply wrongdoing from the purchasing authority. A sole-source waiver is a lawful procurement path; if you mention it, state it as the recorded basis for the award and nothing more."""

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "title_clear": {
            "type": "string",
            "description": "One plain-English line, max 120 chars. Empty string if the title carries no readable subject.",
        },
        "what_concretely": {
            "type": "string",
            "description": "2-3 sentences, max 320 chars. Empty string if the title carries no readable subject.",
        },
    },
    "required": ["title_clear", "what_concretely"],
    "additionalProperties": False,
}


def norm_title(title: str | None) -> str:
    """Signature key: case- and whitespace-insensitive title."""
    return re.sub(r"\s+", " ", (title or "").strip()).upper()


def signature(row: dict[str, Any]) -> str:
    return f"{norm_title(row['contract_title'])}|{row.get('contract_type') or ''}"


def usd(v: Any) -> str:
    n = float(v or 0)
    if n >= 1e9:
        return f"${n / 1e9:.2f}B"
    if n >= 1e6:
        return f"${n / 1e6:.1f}M"
    return f"${n:,.0f}"


def user_prompt(row: dict[str, Any]) -> str:
    """Every fact the register holds, labelled. Nothing inferred, nothing added."""
    lines = [
        "Contract register entry:",
        f"  title (verbatim): {row['contract_title'] or '(blank)'}",
        f"  contract type: {row.get('contract_type') or '(not recorded)'}",
        f"  department: {row.get('department') or '(not recorded)'}",
        f"  purchasing authority: {row.get('purchasing_authority') or '(none recorded)'}",
        f"  prime contractor: {row.get('prime_contractor') or '(not recorded)'}",
        f"  agreed amount: {usd(row.get('agreed_usd'))}",
        f"  paid to date: {usd(row.get('paid_usd'))}",
    ]
    start, end = row.get("term_start_date"), row.get("term_end_date")
    if start or end:
        lines.append(f"  term: {start or '?'} to {end or '?'}")
    return "\n".join(lines)


# ── cache ────────────────────────────────────────────────────────────────────


def load_cache() -> dict[str, dict[str, Any]]:
    if not CACHE_PATH.exists():
        return {}
    with CACHE_PATH.open(encoding="utf-8") as f:
        return json.load(f).get("items", {})


def save_cache(items: dict[str, dict[str, Any]], model: str) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "model": model,
        "unit": "one entry per (normalized title | contract type) signature",
        "count": len(items),
        "grounding": (
            "Generated from the register's own columns only (title, type, department, "
            "purchasing authority, prime contractor, amounts, term). The register has no "
            "description field. Empty strings mean the title carried no readable subject "
            "and no text was generated."
        ),
        "items": items,
    }
    tmp = CACHE_PATH.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2, sort_keys=True)
    tmp.replace(CACHE_PATH)


# ── corpus ───────────────────────────────────────────────────────────────────


def fetch_units() -> tuple[list[dict[str, Any]], dict[str, int]]:
    """One representative row per signature, plus tier counts over all contracts.

    The representative is the highest-agreed contract of the signature — the
    richest context for the same words, and deterministic.
    """
    client = bigquery.Client()
    rows = [
        dict(r)
        for r in client.query(
            f"""
            SELECT contract_no, contract_title, contract_type, department,
                   purchasing_authority, prime_contractor, agreed_usd, paid_usd,
                   term_start_date, term_end_date
            FROM `{BQ_PROJECT}.{BQ_DATASET}.mart_us_sf_contracts_summary`
            ORDER BY agreed_usd DESC
            """
        ).result()
    ]
    tiers: dict[str, int] = {"1": 0, "2": 0, "3": 0}
    units: dict[str, dict[str, Any]] = {}
    for r in rows:
        tiers[str(title_tier(r["contract_title"]))] += 1
        sig = signature(r)
        if sig not in units:  # rows are agreed-desc, so first = biggest
            units[sig] = r
    return list(units.values()), tiers


# ── validation ───────────────────────────────────────────────────────────────

# Words that would editorialize. Rule 4 forbids them; this catches a slip.
BANNED = re.compile(
    r"\b(controversial|wasteful|generous|questionable|no-bid|sweetheart|scandal|"
    r"lucrative|excessive|allegedly|suspicious)\b",
    re.I,
)


def validate(item: dict[str, str], row: dict[str, Any]) -> list[str]:
    """Cheap grounding checks. Anything flagged is dropped, not shipped."""
    problems: list[str] = []
    title, what = item.get("title_clear", ""), item.get("what_concretely", "")
    if not title and not what:
        return problems  # honest blank — allowed and expected
    if len(title) > 140:
        problems.append(f"title_clear too long ({len(title)})")
    if len(what) > 400:
        problems.append(f"what_concretely too long ({len(what)})")
    for field, text in (("title_clear", title), ("what_concretely", what)):
        if BANNED.search(text):
            problems.append(f"{field}: editorializing word")
    # A dollar figure the input never stated is the clearest fabrication tell.
    haystack = user_prompt(row)
    for money in re.findall(r"\$[\d.,]+\s*[BMK]?", f"{title} {what}"):
        if money.strip() not in haystack:
            problems.append(f"unsourced amount {money.strip()!r}")
    return problems


# ── batch API ────────────────────────────────────────────────────────────────


def build_requests(units: list[dict[str, Any]], model: str) -> list[dict[str, Any]]:
    """One request per signature. The system block is cached across the batch."""
    requests = []
    for i, row in enumerate(units):
        requests.append(
            {
                "custom_id": f"u{i}",
                "params": {
                    "model": model,
                    "max_tokens": 1024,
                    "system": [
                        {
                            "type": "text",
                            "text": SYSTEM_PROMPT,
                            "cache_control": {"type": "ephemeral"},
                        }
                    ],
                    "output_config": {
                        "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA}
                    },
                    "messages": [{"role": "user", "content": user_prompt(row)}],
                },
            }
        )
    return requests


def submit(units: list[dict[str, Any]], model: str) -> str:
    import anthropic

    client = anthropic.Anthropic()
    batch = client.messages.batches.create(requests=build_requests(units, model))
    print(f"📤 batch {batch.id} submitted · {len(units)} units · {batch.processing_status}")
    return batch.id


def collect(batch_id: str, units: list[dict[str, Any]], model: str) -> None:
    import anthropic

    client = anthropic.Anthropic()
    while True:
        batch = client.messages.batches.retrieve(batch_id)
        if batch.processing_status == "ended":
            break
        counts = batch.request_counts
        print(
            f"  … {batch.processing_status} · done {counts.succeeded} "
            f"errored {counts.errored} processing {counts.processing}",
            flush=True,
        )
        time.sleep(30)

    by_id = {f"u{i}": row for i, row in enumerate(units)}
    cache = load_cache()
    kept = blank = rejected = errored = 0
    for result in client.messages.batches.results(batch_id):
        row = by_id.get(result.custom_id)
        if row is None:
            continue
        if result.result.type != "succeeded":
            errored += 1
            continue
        text = next((b.text for b in result.result.message.content if b.type == "text"), "")
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            errored += 1
            continue
        problems = validate(parsed, row)
        if problems:
            rejected += 1
            print(f"  ⚠ rejected {row['contract_no']}: {'; '.join(problems)}")
            continue
        title = (parsed.get("title_clear") or "").strip()
        what = (parsed.get("what_concretely") or "").strip()
        if not title and not what:
            blank += 1
        else:
            kept += 1
        cache[signature(row)] = {
            "title_clear": title,
            "what_concretely": what,
            "tier": title_tier(row["contract_title"]),
            "model": model,
            "sample_contract_no": row["contract_no"],
        }
    save_cache(cache, model)
    print(
        f"💾 {CACHE_PATH.relative_to(PROJECT_ROOT)} · {len(cache)} signatures "
        f"(+{kept} written, {blank} honest blanks, {rejected} rejected, {errored} errors)"
    )


# ── plan ─────────────────────────────────────────────────────────────────────


def plan(units: list[dict[str, Any]], tiers: dict[str, int], model: str) -> None:
    total = sum(tiers.values())
    print(f"\nRegister: {total:,} contracts")
    for t, label in (("1", "readable title"), ("2", "shorthand"), ("3", "columns only")):
        n = tiers[t]
        print(f"  tier {t} {label:<22} {n:6,d} ({n / total:5.1%})")
    print(f"\nDistinct generation units (title|type): {len(units):,}")

    sys_tokens = len(SYSTEM_PROMPT) // 4
    body = sum(len(user_prompt(r)) for r in units) // 4
    # First request writes the cached system block at 1.25x; the rest read at 0.1x.
    cached_in = sys_tokens * 1.25 + sys_tokens * 0.1 * max(0, len(units) - 1)
    out_tokens = len(units) * 130
    print(
        f"Tokens (est): input ~{(body + cached_in) / 1e6:.2f}M "
        f"(system block cached) · output ~{out_tokens / 1e6:.2f}M"
    )
    print("\nBatch API cost estimate (50% off list):")
    for m, (pin, pout) in PRICES.items():
        cost = ((body + cached_in) / 1e6 * pin + out_tokens / 1e6 * pout) * BATCH_DISCOUNT
        mark = "  ← default" if m == model else ""
        print(f"  {m:<20} ~${cost:5.2f}{mark}")
    print("\nEstimates only — actual usage is reported per batch when it ends.")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--model", default=DEFAULT_MODEL, help=f"default {DEFAULT_MODEL}")
    ap.add_argument("--limit", type=int, help="only the N biggest units (sample run)")
    ap.add_argument("--plan", action="store_true", help="counts + cost, no API call")
    ap.add_argument("--collect", metavar="BATCH_ID", help="collect a batch submitted earlier")
    ap.add_argument("--submit-only", action="store_true", help="submit and exit without waiting")
    args = ap.parse_args()

    units, tiers = fetch_units()
    cache = load_cache()
    pending = [u for u in units if signature(u) not in cache]
    print(f"📦 cache {len(cache)} signatures · {len(pending)} of {len(units)} units pending")

    if args.plan:
        plan(pending or units, tiers, args.model)
        return 0

    if args.collect:
        collect(args.collect, units if not args.limit else units[: args.limit], args.model)
        return 0

    if not pending:
        print("✅ nothing to do.")
        return 0
    if args.limit:
        pending = pending[: args.limit]
        print(f"🔒 limited to {len(pending)} units")

    batch_id = submit(pending, args.model)
    if args.submit_only:
        print(f"   collect later:  --collect {batch_id}")
        return 0
    collect(batch_id, pending, args.model)
    return 0


if __name__ == "__main__":
    sys.exit(main())
