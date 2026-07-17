#!/usr/bin/env python3
"""
Export US San Francisco supplier-contract data (Block 3) from BigQuery
(dbt_us_marts) to JSON.

Outputs (website/public/data/us/sf/):
    - contracts_overview.json : hero (active portfolio), register landscape
      by type/department, the sole-source lens (totals, per-department
      histogram, per-start-year strip, top contracts with their purchasing
      authority strings VERBATIM), LBE participation (prime and team as two
      separately-labeled perimeters, never summed), purchasing-authority
      families (seeded classification, human review pending) and the
      data-quality/méthode numbers.
      Sources: mart_us_sf_contracts_summary (+ one aggregate over
      core_us_sf_contracts for the sub-only exclusion count and one over
      core_us_sf_vouchers for voucher-join coverage — méthode stats only,
      no money flows from either).
    - contracts_active.json   : one row per contract active today (~5.1k)
      for the search + table. Money = agreed_usd / paid_usd only.
    - contracts/fiche/<no>.json : per-contract fiche payloads (~6.3k:
      active ∪ sole-source ∪ top-500 by agreed) with the FY2018+ spend
      curve (voucher join) and the project team (never summed into money).

Hard rules carried from the block study (docs/us/block-studies/3-contracts.md):
    * money comes from prime-dedupe agreed_usd / paid_usd (lifetime voucher
      payments) — consumed/remaining source columns exist in NO mart and
      therefore in NO export (dbt-tested);
    * "remaining" is only ever remaining_calc_usd = GREATEST(agreed − paid, 0),
      published together with src_arithmetic_consistent;
    * team attachments are their own perimeter (sub $ lives inside prime
      envelopes and over-runs them on 486 contracts).

Data contract (ADR-0010 D2): generated_at + source_pipeline on every file;
source/source_url + as_of on every block; units documented. No hardcoded
numbers anywhere downstream — the page renders these files.

Usage:
    python pipeline/scripts/export/export_us_sf_contracts.py

Prérequis:
    - Google Cloud credentials configurées
    - dbt build --select +mart_us_sf_contracts_summary+ mart_us_sf_contract_team --target prod
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger  # noqa: E402
from export.us_sf_title_clean import clean_title  # noqa: E402

PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_us_marts"
ANALYTICS_DATASET = "dbt_us_analytics"
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data" / "us" / "sf"
FICHE_DIR = OUTPUT_DIR / "contracts" / "fiche"

SOURCE_PIPELINE = (
    "configs/countries/us.yaml → sync_socrata.py → raw.us_sf_supplier_contracts"
    " + raw.us_sf_vouchers → dbt_us_staging → dbt_us_analytics → dbt_us_marts →"
    " export_us_sf_contracts.py"
)

TOP_DEPARTMENTS = 15
TOP_SOLE_DEPARTMENTS = 12
TOP_SOLE_CONTRACTS = 10
TOP_N_BY_AGREED = 500

FAMILY_ORDER = [
    "competitive_bid", "grant", "sole_source_waiver", "government_agreement",
    "rent_real_estate", "emergency", "legacy_none", "other",
]


def _f(value, ndigits=2):
    if value is None:
        return None
    out = float(value)
    return round(out, ndigits) if ndigits is not None else out


def _ts(value):
    return value.isoformat() if value is not None else None


def _d(value):
    """date → ISO string."""
    return value.isoformat() if value is not None else None


def fetch_rows(client: bigquery.Client, query: str) -> list[dict]:
    """Rows as dicts, BigQuery NUMERIC (decimal.Decimal) coerced to float."""
    from decimal import Decimal

    def conv(v):
        return float(v) if isinstance(v, Decimal) else v

    return [
        {k: conv(v) for k, v in dict(row).items()}
        for row in client.query(query).result()
    ]


def source_block(ref: dict) -> dict:
    return {
        "name": ref["source_name"],
        "dataset_id": ref["source_dataset_id"],
        "source_url": ref["source_url"],
        "attribution": ref["source_attribution"],
        "rows_updated_at": _ts(ref["source_rows_updated_at"]),
    }


def base_meta(as_of, source: dict) -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "us",
        "scale": "city",
        "place": "sf",
        "unit": "USD",
        "as_of": _ts(as_of),
        "source": source,
    }


def title_plain_for(row: dict) -> str | None:
    return clean_title(row["contract_title"], row["department_code"])


# ---------------------------------------------------------------------------
# Overview
# ---------------------------------------------------------------------------

def build_overview(summary: list[dict], quality: dict, join_stats: dict,
                   export_date: str) -> dict:
    ref = summary[0]
    total_agreed = sum(r["agreed_usd"] for r in summary)
    total_paid = sum(r["paid_usd"] for r in summary)

    active = [r for r in summary if r["is_active"] is True]
    expired = [r for r in summary if r["is_active"] is False]
    unknown_end = [r for r in summary if r["is_active"] is None]
    sole = [r for r in summary if r["is_sole_source"]]
    active_sole = [r for r in active if r["is_sole_source"]]
    non_profit = [r for r in summary if r["is_non_profit"]]
    lbe_prime = [r for r in summary if r["is_lbe_prime"]]

    # --- landscape by contract type (register-wide) ---
    by_type: dict[str, dict] = {}
    for r in summary:
        key = r["contract_type"] or "(not specified)"
        agg = by_type.setdefault(key, {"contract_type": key, "n_contracts": 0,
                                       "agreed_usd": 0.0, "paid_usd": 0.0})
        agg["n_contracts"] += 1
        agg["agreed_usd"] += r["agreed_usd"]
        agg["paid_usd"] += r["paid_usd"]
    types_sorted = sorted(by_type.values(), key=lambda a: -a["agreed_usd"])
    for a in types_sorted:
        a["agreed_usd"] = _f(a["agreed_usd"])
        a["paid_usd"] = _f(a["paid_usd"])
        a["share_of_register_agreed"] = _f(a["agreed_usd"] / total_agreed, 6)
    grants_row = next(
        (a for a in types_sorted if a["contract_type"].startswith("Grant Contracts")),
        None,
    )

    # --- departments ---
    by_dept: dict[str, dict] = {}
    for r in summary:
        key = r["department"] or "(not specified)"
        agg = by_dept.setdefault(key, {
            "department": key, "department_code": r["department_code"],
            "n_contracts": 0, "agreed_usd": 0.0, "paid_usd": 0.0,
            "n_sole": 0, "sole_agreed_usd": 0.0,
        })
        agg["n_contracts"] += 1
        agg["agreed_usd"] += r["agreed_usd"]
        agg["paid_usd"] += r["paid_usd"]
        if r["is_sole_source"]:
            agg["n_sole"] += 1
            agg["sole_agreed_usd"] += r["agreed_usd"]
    depts_sorted = sorted(by_dept.values(), key=lambda a: -a["agreed_usd"])

    departments = [
        {
            "department": a["department"],
            "department_code": a["department_code"],
            "n_contracts": a["n_contracts"],
            "agreed_usd": _f(a["agreed_usd"]),
            "paid_usd": _f(a["paid_usd"]),
        }
        for a in depts_sorted[:TOP_DEPARTMENTS]
    ]

    # --- sole-source lens ---
    sole_agreed = sum(r["agreed_usd"] for r in sole)
    sole_paid = sum(r["paid_usd"] for r in sole)
    sole_by_dept = sorted(
        (a for a in by_dept.values() if a["n_sole"] > 0),
        key=lambda a: -a["sole_agreed_usd"],
    )[:TOP_SOLE_DEPARTMENTS]
    sole_dept_rows = [
        {
            "department": a["department"],
            "department_code": a["department_code"],
            "n_sole": a["n_sole"],
            "sole_agreed_usd": _f(a["sole_agreed_usd"]),
            "n_contracts": a["n_contracts"],
            "dept_agreed_usd": _f(a["agreed_usd"]),
            "share_of_dept_contracts": _f(a["n_sole"] / a["n_contracts"], 6),
            "share_of_dept_agreed": _f(
                a["sole_agreed_usd"] / a["agreed_usd"] if a["agreed_usd"] else None, 6),
        }
        for a in sole_by_dept
    ]

    by_start_year: dict[int, dict] = {}
    for r in summary:
        if not r["term_start_date"]:
            continue
        y = r["term_start_date"].year
        if y < 2000 or y > 2026:
            continue  # 1991 tail + one junk 2099 start — too thin to chart
        agg = by_start_year.setdefault(y, {"year": y, "n_contracts": 0, "n_sole": 0})
        agg["n_contracts"] += 1
        if r["is_sole_source"]:
            agg["n_sole"] += 1
    year_rows = [
        {**a, "share_sole": _f(a["n_sole"] / a["n_contracts"], 6)}
        for a in sorted(by_start_year.values(), key=lambda a: a["year"])
    ]

    # Stability strip: the register is LIVING — old start years survive only
    # as a residue (2010: 122 recorded starts, skewed to long-running
    # sole-source health contracts → 47.5% share). The headline range is
    # computed over years with at least STABILITY_MIN_STARTS recorded
    # starts; the full per-year rows above stay published for anyone to
    # recompute with another floor.
    STABILITY_MIN_STARTS = 300
    covered = [y for y in year_rows if y["n_contracts"] >= STABILITY_MIN_STARTS]
    stability = None
    if covered:
        stability = {
            "min_starts_floor": STABILITY_MIN_STARTS,
            "year_from": covered[0]["year"],
            "year_to": covered[-1]["year"],
            "share_min": min(y["share_sole"] for y in covered),
            "share_max": max(y["share_sole"] for y in covered),
            "note": (
                "Computed over start years with at least "
                f"{STABILITY_MIN_STARTS} recorded starts — the living "
                "register keeps only a thin, biased residue of older "
                "start years."
            ),
        }

    top_sole = sorted(sole, key=lambda r: -r["agreed_usd"])[:TOP_SOLE_CONTRACTS]
    top_sole_rows = [
        {
            "contract_no": r["contract_no"],
            "title": r["contract_title"],
            "title_plain": title_plain_for(r),
            "prime_contractor": r["prime_contractor"],
            "department": r["department"],
            "agreed_usd": _f(r["agreed_usd"]),
            "paid_usd": _f(r["paid_usd"]),
            "purchasing_authority": r["purchasing_authority"],
            "authority_family": r["authority_family"],
            "is_active": r["is_active"],
        }
        for r in top_sole
    ]

    # --- LBE (two perimeters, never summed) ---
    lbe = {
        "prime": {
            "n_contracts": len(lbe_prime),
            "agreed_usd": _f(sum(r["agreed_usd"] for r in lbe_prime)),
            "perimeter": (
                "Contracts whose PRIME contractor is a certified Local "
                "Business Enterprise — amounts are those contracts' full "
                "agreed envelopes."
            ),
        },
        "team": {
            "n_member_rows": quality["lbe_team_rows"],
            "n_contracts": quality["lbe_team_contracts"],
            "attached_usd": _f(quality["lbe_team_attached_usd"]),
            "perimeter": (
                "LBE subcontractors and joint-venture members on other "
                "primes' contracts — attached amounts live INSIDE those "
                "primes' envelopes. Never add this to the prime figure."
            ),
        },
    }

    # --- purchasing-authority families ---
    fam_agg: dict[str, dict] = {}
    for r in summary:
        key = r["authority_family"]
        agg = fam_agg.setdefault(key, {"family": key, "n_contracts": 0,
                                       "agreed_usd": 0.0, "n_sole_flagged": 0})
        agg["n_contracts"] += 1
        agg["agreed_usd"] += r["agreed_usd"]
        if r["is_sole_source"]:
            agg["n_sole_flagged"] += 1
    families = [
        {**fam_agg[f], "agreed_usd": _f(fam_agg[f]["agreed_usd"])}
        for f in FAMILY_ORDER if f in fam_agg
    ]

    return {
        **base_meta(ref["source_rows_updated_at"], source_block(ref)),
        "export_date_pacific": export_date,
        "perimeter": (
            "Every supplier agreement in the SF Controller's register "
            "(dataset cqi5-hm2d): purchasing and construction contracts, "
            "professional services, GRANTS THE CITY GIVES OUT, rents and "
            "other non-purchasing agreements. One row per contract "
            "(prime-contractor dedupe); the 'active' portfolio is the "
            "subset whose term covers the export date."
        ),
        "hero": {
            "active": {
                "n_contracts": len(active),
                "agreed_usd": _f(sum(r["agreed_usd"] for r in active)),
                "paid_usd": _f(sum(r["paid_usd"] for r in active)),
            },
            "register": {
                "n_contracts": len(summary),
                "agreed_usd": _f(total_agreed),
                "paid_usd": _f(total_paid),
                "n_expired": len(expired),
                "n_unknown_end": len(unknown_end),
            },
            "active_definition": (
                "term_end_date >= the export date (America/Los_Angeles). "
                "Contracts with no recorded end date are counted separately "
                "(n_unknown_end), never as active."
            ),
            "paid_definition": (
                "paid_usd is the register's lifetime payment total per "
                "contract, which matches summed vouchers (payment detail "
                "begins FY2018 — PeopleSoft migration)."
            ),
        },
        "landscape": {
            "by_type": types_sorted,
            "grants": grants_row and {
                "n_contracts": grants_row["n_contracts"],
                "agreed_usd": grants_row["agreed_usd"],
                "paid_usd": grants_row["paid_usd"],
                "share_of_register_agreed": grants_row["share_of_register_agreed"],
            },
        },
        "departments": departments,
        "non_profit": {
            "n_contracts": len(non_profit),
            "agreed_usd": _f(sum(r["agreed_usd"] for r in non_profit)),
            "paid_usd": _f(sum(r["paid_usd"] for r in non_profit)),
            "flag_definition": (
                "non_profit = 'X' as published by the Controller on any row "
                "of the contract."
            ),
        },
        "sole_source": {
            "n_contracts": len(sole),
            "agreed_usd": _f(sole_agreed),
            "paid_usd": _f(sole_paid),
            "share_of_contracts": _f(len(sole) / len(summary), 6),
            "share_of_agreed": _f(sole_agreed / total_agreed, 6),
            "active": {
                "n_contracts": len(active_sole),
                "agreed_usd": _f(sum(r["agreed_usd"] for r in active_sole)),
            },
            "flag_definition": (
                "sole_source_flg = 'X' as published by the Controller on any "
                "row of the contract. Sole-source is a lawful procurement "
                "path that requires a waiver or commission approval — each "
                "contract's purchasing-authority string states the basis and "
                "is rendered verbatim."
            ),
            "by_department": sole_dept_rows,
            "by_start_year": year_rows,
            "stability": stability,
            "top_contracts": top_sole_rows,
        },
        "lbe": lbe,
        "authority_families": {
            "families": families,
            "classification": {
                "method": "manual_in_session",
                "classified_at": "2026-07-16",
                "seed": "pipeline/seeds/countries/us/seed_us_sf_purchasing_authority_families.csv",
                "note": (
                    "93 distinct free-text authority strings grouped into 8 "
                    "display families by hand (human review pending). "
                    "Families group the strings only — the sole-source lens "
                    "uses the source's own flag."
                ),
            },
        },
        "data_quality": {
            "n_paid_exceeds_agreed": quality["n_paid_exceeds_agreed"],
            "n_multi_prime_row_contracts": quality["n_multi_prime"],
            "n_sub_only_contracts_excluded": quality["n_sub_only"],
            "share_src_arithmetic_consistent": _f(quality["share_consistent"], 6),
            "n_placeholder_end_dates": quality["n_placeholder_end"],
            "voucher_join": join_stats,
            "notes": (
                "paid_usd can exceed agreed_usd (payments accumulate across "
                "modifications while agreed reflects the base document — "
                "visible mostly on construction; 'Unilateral' contracts are "
                "change-order vehicles). The source's own consumed/remaining "
                "columns fail basic arithmetic and are never published; "
                "'remaining' anywhere on the page is GREATEST(agreed − paid, 0)."
            ),
        },
    }


# ---------------------------------------------------------------------------
# Active contracts (search + table)
# ---------------------------------------------------------------------------

def build_active(summary: list[dict]) -> dict:
    ref = summary[0]
    active = sorted(
        (r for r in summary if r["is_active"] is True),
        key=lambda r: -r["agreed_usd"],
    )
    rows = []
    for r in active:
        tp = title_plain_for(r)
        row = {
            "contract_no": r["contract_no"],
            "title": r["contract_title"],
            "prime": r["prime_contractor"],
            "department": r["department"],
            "department_code": r["department_code"],
            "contract_type": r["contract_type"],
            "sole_source": r["is_sole_source"],
            "lbe_prime": r["is_lbe_prime"],
            "non_profit": r["is_non_profit"],
            "agreed_usd": _f(r["agreed_usd"]),
            "paid_usd": _f(r["paid_usd"]),
            "paid_exceeds_agreed": r["paid_exceeds_agreed"],
            "start": _d(r["term_start_date"]),
            "end": _d(r["term_end_date"]),
        }
        if tp:
            row["title_plain"] = tp
        rows.append(row)

    return {
        **base_meta(ref["source_rows_updated_at"], source_block(ref)),
        "perimeter": (
            "Contracts active today (term_end_date >= export date, "
            "America/Los_Angeles), one row per contract, sorted by agreed "
            "amount. title_plain is a deterministic cleanup of the "
            "register's admin shorthand (department prefixes stripped, "
            "all-caps recased) — present only when it differs from title; "
            "the raw title is always published."
        ),
        "n_rows": len(rows),
        "rows": rows,
    }


# ---------------------------------------------------------------------------
# Per-contract fiches
# ---------------------------------------------------------------------------

def fiche_corpus(summary: list[dict]) -> list[dict]:
    by_agreed = sorted(summary, key=lambda r: -r["agreed_usd"])
    top_ids = {r["contract_no"] for r in by_agreed[:TOP_N_BY_AGREED]}
    return [
        r for r in summary
        if r["is_active"] is True or r["is_sole_source"] or r["contract_no"] in top_ids
    ]


def build_fiche(r: dict, spend: list[dict], team: list[dict]) -> dict:
    tp = title_plain_for(r)
    role_rank = {"Prime Contractor": 0, "Joint Venture Constituent": 1, "Subcontractor": 2}
    team_sorted = sorted(
        team, key=lambda m: (role_rank.get(m["role"], 9), -(m["attached_usd"] or 0)))

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "unit": "USD",
        "as_of": _ts(r["source_rows_updated_at"]),
        "contract": {
            "contract_no": r["contract_no"],
            "title": r["contract_title"],
            "title_plain": tp,
            "contract_type": r["contract_type"],
            "purchasing_authority": r["purchasing_authority"],
            "authority_family": r["authority_family"],
            "department": r["department"],
            "department_code": r["department_code"],
            "prime_contractor": r["prime_contractor"],
            "term_start": _d(r["term_start_date"]),
            "term_end": _d(r["term_end_date"]),
            "term_end_is_placeholder": r["term_end_date_is_placeholder"],
            "is_active": r["is_active"],
            "sole_source": r["is_sole_source"],
            "non_profit": r["is_non_profit"],
            "lbe_prime": r["is_lbe_prime"],
            "agreed_usd": _f(r["agreed_usd"]),
            "paid_usd": _f(r["paid_usd"]),
            "remaining_calc_usd": _f(r["remaining_calc_usd"]),
            "src_arithmetic_consistent": r["src_arithmetic_consistent"],
            "paid_exceeds_agreed": r["paid_exceeds_agreed"],
            "n_prime_rows": r["n_prime_rows"],
        },
        "spend_by_fy": {
            "points": [
                {
                    "fiscal_year": int(s["fiscal_year"]),
                    "vouchers_paid_usd": _f(s["vouchers_paid_usd"]),
                    "n_vouchers": int(s["n_vouchers"]),
                    "execution_status": s["execution_status"],
                }
                for s in sorted(spend, key=lambda s: s["fiscal_year"])
            ],
            "note": (
                "Vouchers joined on contract_number — payment detail begins "
                "FY2018 (PeopleSoft migration; contract numbers change at "
                "the break). SF fiscal year N runs July 1 (N−1) to June 30 N."
            ),
        },
        "team": [
            {
                "supplier": m["supplier"],
                "role": m["role"],
                "lbe": m["is_lbe"],
                "attached_usd": _f(m["attached_usd"]),
            }
            for m in team_sorted
        ],
        "team_note": (
            "Attached amounts for subcontractors and JV members live inside "
            "the prime's envelope — they are context, never additive with "
            "the contract's own amounts."
        ),
        "source": {
            "name": r["source_name"],
            "dataset_id": r["source_dataset_id"],
            "source_url": r["source_url"],
            "attribution": r["source_attribution"],
            "rows_updated_at": _ts(r["source_rows_updated_at"]),
            "raw_rows_url": (
                "https://data.sfgov.org/resource/"
                f"{r['source_dataset_id']}.json?contract_no={r['contract_no']}"
            ),
        },
    }


def write_json(payload: dict, path: Path, log: Logger | None = None, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        if compact:
            json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    if log:
        log.success(f"wrote {path.name}", extra=f"{path.stat().st_size / 1024:.1f} KB")


def main() -> int:
    log = Logger("export_us_sf_contracts")
    log.header("Export US SF contracts (overview, actives, fiches) → JSON")
    client = bigquery.Client(project=PROJECT_ID)
    log.success("connecté", extra=f"{PROJECT_ID}.{DATASET}")

    log.section("mart_us_sf_contracts_summary")
    summary = fetch_rows(client, f"""
        SELECT * FROM `{PROJECT_ID}.{DATASET}.mart_us_sf_contracts_summary`
        ORDER BY agreed_usd DESC
    """)
    log.info("contracts", extra=str(len(summary)))

    log.section("aggregates (méthode)")
    quality_row = fetch_rows(client, f"""
        WITH team AS (
            SELECT * FROM `{PROJECT_ID}.{DATASET}.mart_us_sf_contract_team`
            WHERE role != 'Prime Contractor' AND is_lbe
        ),
        core_subonly AS (
            SELECT COUNT(DISTINCT c.contract_no) AS n_sub_only
            FROM `{PROJECT_ID}.{ANALYTICS_DATASET}.core_us_sf_contracts` c
            WHERE c.contract_no IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM `{PROJECT_ID}.{ANALYTICS_DATASET}.core_us_sf_contracts` p
                WHERE p.contract_no = c.contract_no AND p.is_prime_contractor_row)
        )
        SELECT
            (SELECT COUNT(*) FROM team)                       AS lbe_team_rows,
            (SELECT COUNT(DISTINCT contract_no) FROM team)    AS lbe_team_contracts,
            (SELECT SUM(attached_usd) FROM team)              AS lbe_team_attached_usd,
            (SELECT n_sub_only FROM core_subonly)             AS n_sub_only
    """)[0]
    summary_stats = {
        "lbe_team_rows": int(quality_row["lbe_team_rows"]),
        "lbe_team_contracts": int(quality_row["lbe_team_contracts"]),
        "lbe_team_attached_usd": float(quality_row["lbe_team_attached_usd"]),
        "n_sub_only": int(quality_row["n_sub_only"]),
        "n_paid_exceeds_agreed": sum(1 for r in summary if r["paid_exceeds_agreed"]),
        "n_multi_prime": sum(1 for r in summary if r["n_prime_rows"] > 1),
        "share_consistent": sum(1 for r in summary if r["src_arithmetic_consistent"]) / len(summary),
        "n_placeholder_end": sum(1 for r in summary if r["term_end_date_is_placeholder"]),
    }

    join_row = fetch_rows(client, f"""
        WITH v AS (
            SELECT contract_number, SUM(vouchers_paid) paid
            FROM `{PROJECT_ID}.{ANALYTICS_DATASET}.core_us_sf_vouchers`
            WHERE contract_number IS NOT NULL
            GROUP BY contract_number
        ),
        reg AS (SELECT contract_no FROM `{PROJECT_ID}.{DATASET}.mart_us_sf_contracts_summary`)
        SELECT
            COUNT(*)                                             AS n_numbers,
            COUNTIF(r.contract_no IS NOT NULL)                   AS n_matched,
            SAFE_DIVIDE(SUM(IF(r.contract_no IS NOT NULL, v.paid, 0)), SUM(v.paid))
                                                                 AS matched_dollar_share
        FROM v LEFT JOIN reg r ON v.contract_number = r.contract_no
    """)[0]
    join_stats = {
        "voucher_contract_numbers": int(join_row["n_numbers"]),
        "matched_in_register": int(join_row["n_matched"]),
        "matched_dollar_share": _f(join_row["matched_dollar_share"], 6),
        "coverage_floor": "FY2018 (PeopleSoft migration)",
    }

    export_date = fetch_rows(
        client, "SELECT CAST(CURRENT_DATE('America/Los_Angeles') AS STRING) d")[0]["d"]

    log.section("contracts_overview.json")
    overview = build_overview(summary, summary_stats, join_stats, export_date)
    write_json(overview, OUTPUT_DIR / "contracts_overview.json", log)

    log.section("contracts_active.json")
    active = build_active(summary)
    write_json(active, OUTPUT_DIR / "contracts_active.json", log)

    log.section("fiches")
    corpus = fiche_corpus(summary)
    corpus_ids = [r["contract_no"] for r in corpus]
    log.info("corpus", extra=f"{len(corpus)} contracts (active ∪ sole-source ∪ top-{TOP_N_BY_AGREED})")

    spend_rows = fetch_rows(client, f"""
        SELECT contract_no, fiscal_year, vouchers_paid_usd, n_vouchers, execution_status
        FROM `{PROJECT_ID}.{DATASET}.mart_us_sf_contract_spend_by_fy`
    """)
    spend_by_contract: dict[str, list[dict]] = {}
    for s in spend_rows:
        spend_by_contract.setdefault(s["contract_no"], []).append(s)

    team_rows = fetch_rows(client, f"""
        SELECT contract_no, supplier, role, is_lbe, attached_usd
        FROM `{PROJECT_ID}.{DATASET}.mart_us_sf_contract_team`
    """)
    team_by_contract: dict[str, list[dict]] = {}
    for m in team_rows:
        team_by_contract.setdefault(m["contract_no"], []).append(m)

    # Wipe stale fiches so removed contracts don't linger with old data.
    if FICHE_DIR.exists():
        for old in FICHE_DIR.glob("*.json"):
            old.unlink()
    n_written = 0
    for r in corpus:
        no = r["contract_no"]
        fiche = build_fiche(r, spend_by_contract.get(no, []), team_by_contract.get(no, []))
        write_json(fiche, FICHE_DIR / f"{no}.json", compact=True)
        n_written += 1
    log.success("fiches écrites", extra=str(n_written))

    log.section("Sanity check")
    h = overview["hero"]
    log.info("active", extra=f"{h['active']['n_contracts']} contracts, "
             f"${h['active']['agreed_usd']:,.0f} agreed, ${h['active']['paid_usd']:,.0f} paid")
    log.info("register", extra=f"{h['register']['n_contracts']} contracts, "
             f"${h['register']['agreed_usd']:,.0f} agreed")
    ss = overview["sole_source"]
    log.info("sole-source", extra=f"{ss['n_contracts']} ({ss['share_of_contracts']*100:.1f}%), "
             f"${ss['agreed_usd']:,.0f}")
    n_cleaned = sum(1 for row in active["rows"] if row.get("title_plain"))
    log.info("title_plain (actives)", extra=f"{n_cleaned}/{active['n_rows']} cleaned")
    # Guard: consumed/remaining source columns must never surface as a KEY
    # in any export (prose may — and does — explain why they're absent).
    forbidden = ("consumed", "remaining_amt", "remaining_src")

    def keys_of(node):
        if isinstance(node, dict):
            for k, v in node.items():
                yield k
                yield from keys_of(v)
        elif isinstance(node, list):
            for v in node:
                yield from keys_of(v)

    sample_fiche = build_fiche(
        corpus[0],
        spend_by_contract.get(corpus[0]["contract_no"], []),
        team_by_contract.get(corpus[0]["contract_no"], []),
    )
    for payload in (overview, active, sample_fiche):
        bad = [k for k in keys_of(payload) if any(f in k.lower() for f in forbidden)]
        assert not bad, f"forbidden source column leaked into export keys: {bad}"
    log.success("no consumed/remaining keys in exports")
    assert len(corpus_ids) == len(set(corpus_ids))
    log.summary()
    return 0


if __name__ == "__main__":
    sys.exit(main())
