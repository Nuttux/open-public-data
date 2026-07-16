#!/usr/bin/env python3
"""
Export US San Francisco city data from BigQuery (dbt_us_marts) to JSON.

Outputs (website/public/data/us/sf/):
    - budget_by_year.json  : net adopted budget per FY × side (Revenue /
      Spending), FY2010-FY2027, per-resident scaling on Census years.
      Source: mart_us_sf_budget_by_year.
    - top_payees.json      : top voucher payees per FY with the manual
      bucket classification (fiscal agents/banks dominate naive rankings).
      Source: mart_us_sf_top_payees.
    - budget_vs_actual.json: adopted budget and actuals as SEPARATE labeled
      series per FY, plus the measured reconciliation perimeters and
      residuals. The two series are NOT published as a single comparable
      pair — see the reconciliation block in the file and the model header
      of mart_us_sf_budget_vs_actual for why (measured, not assumed).
      Source: mart_us_sf_budget_vs_actual.
    - index.json           : file manifest + shared provenance.

Data contract (ADR-0010 D2, same as the France/US-national exports):
every file carries generated_at + source_pipeline; every block carries
source/source_url (data.sfgov.org dataset pages from the synced Socrata
catalog — never hardcoded), as_of (the portal's rowsUpdatedAt) and
period-completeness flags; units documented in the JSON. No hardcoded
numbers — everything flows from BigQuery marts whose invariants are
dbt-tested (tests/us/assert_us_sf_*).

Usage:
    python pipeline/scripts/export/export_us_sf.py

Prérequis:
    - Google Cloud credentials configurées
    - dbt build --select <us sf models> --target prod
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger  # noqa: E402

PROJECT_ID = "open-data-france-484717"
DATASET = "dbt_us_marts"
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data" / "us" / "sf"

SOURCE_PIPELINE = (
    "configs/countries/us.yaml → sync_socrata.py + sync_census_popest.py → "
    "raw.us_sf_* → dbt_us_staging → dbt_us_analytics → dbt_us_marts → "
    "export_us_sf.py"
)

TOP_PAYEES_PER_FY = 40

BUCKET_DEFINITIONS = {
    "fiscal_agent_debt_service": (
        "Banks acting as bond trustees, paying agents or custodians — "
        "money flowing THROUGH them (mostly debt service), not payment "
        "for services they provide."
    ),
    "payroll_passthrough": (
        "Entities administering compensation flows (deferred-compensation "
        "plans, IHSS home-care worker wages) — closer to payroll than to "
        "procurement."
    ),
    "healthcare": (
        "Health/dental plans and clinical providers — largely employee and "
        "retiree benefit premiums plus hospital staffing agreements."
    ),
    "nonprofit": (
        "Nonprofit service providers (housing, health, social services) — "
        "the classic 'qui reçoit' grantees/contractors."
    ),
    "supplier": (
        "Market vendors: construction, utilities, equipment, energy, "
        "pharmaceuticals."
    ),
    "other": (
        "Aggregated or intergovernmental payees (other public agencies, "
        "the Controller's 'Single Payment Payees' line) that fit none of "
        "the above."
    ),
}


def _f(value, ndigits=None):
    """Decimal/None → float (rounded if asked)."""
    if value is None:
        return None
    out = float(value)
    return round(out, ndigits) if ndigits is not None else out


def _ts(value):
    return value.isoformat() if value is not None else None


def fetch_rows(client: bigquery.Client, table: str, order_by: str) -> list[dict]:
    query = f"SELECT * FROM `{PROJECT_ID}.{DATASET}.{table}` ORDER BY {order_by}"
    return [dict(row) for row in client.query(query).result()]


def source_block(ref: dict, prefix: str = "source_") -> dict:
    return {
        "name": ref[f"{prefix}name"],
        "dataset_id": ref[f"{prefix}dataset_id"],
        "source_url": ref[f"{prefix}url"],
        "attribution": ref[f"{prefix}attribution"],
        "rows_updated_at": _ts(ref[f"{prefix}rows_updated_at"]),
    }


def population_block(rows: list[dict]) -> dict:
    """Latest Census year available in the mart rows (population columns
    repeat per row; not every FY has a matching Census year)."""
    with_pop = [r for r in rows if r.get("population") is not None]
    if not with_pop:
        raise RuntimeError("no population data in mart rows")
    latest = max(with_pop, key=lambda r: r["population_year"])
    return {
        "value": int(latest["population"]),
        "year": int(latest["population_year"]),
        "as_of": _ts(latest["population_as_of"]),
        "source": latest["population_source"],
        "source_url": latest["population_source_url"],
        "note": (
            "July 1 Census estimate. per_resident_usd values are computed "
            "per fiscal year against the SAME-year estimate (SF fiscal year "
            "N ends June 30 of year N) and only exist for fiscal years with "
            "a Vintage 2025 estimate (2020-2025)."
        ),
    }


def build_budget_by_year(rows: list[dict]) -> dict:
    ref = rows[0]
    max_fy = max(int(r["fiscal_year"]) for r in rows)

    def side_points(side: str) -> list[dict]:
        return [
            {
                "fiscal_year": int(r["fiscal_year"]),
                "total_usd": _f(r["total_usd"], 2),
                "transfer_adjustment_usd": _f(r["transfer_adjustment_usd"], 2),
                "n_lines": int(r["n_lines"]),
                "per_resident_usd": _f(r["per_resident_usd"], 2),
                "population_year": int(r["population_year"]) if r["population_year"] is not None else None,
                "is_fiscal_year_complete": bool(r["is_fiscal_year_complete"]),
            }
            for r in rows if r["side"] == side
        ]

    spending = side_points("Spending")
    revenue = side_points("Revenue")

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "us",
        "scale": "city",
        "place": "sf",
        "unit": "USD",
        "as_of": _ts(ref["source_rows_updated_at"]),
        "source": source_block(ref),
        "population": population_block(rows),
        "perimeter": (
            "Adopted budget (Annual Appropriation Ordinance) as published "
            "by the SF Controller — ALL funds (operating + capital + "
            "continuing projects), citywide. Totals are NET: the dataset "
            "embeds negative 'Transfer Adjustment' rows that cancel "
            "inter/intra-fund transfers (their per-year size is exposed as "
            "transfer_adjustment_usd). There is no proposed-vs-adopted "
            "distinction anywhere on the portal."
        ),
        "sides": {
            "spending": {"points": spending, "n_points": len(spending)},
            "revenue": {"points": revenue, "n_points": len(revenue)},
        },
        "notes": (
            "San Francisco adopts a balanced two-year budget: Revenue equals "
            "Spending in every fiscal year (dbt-tested within $10), and the "
            f"two most recent fiscal years (FY{max_fy - 1}, FY{max_fy}) are "
            "adopted in the same AAO cycle — the second year's "
            "enterprise-department figures are high-level estimates, not "
            "re-appropriated amounts. SF fiscal year N runs July 1 (N-1) to "
            "June 30 N. Dataset floor: FY2010."
        ),
    }


def build_top_payees(rows: list[dict]) -> dict:
    ref = rows[0]
    years: dict[str, dict] = {}
    for r in rows:
        if int(r["rank_in_fy"]) > TOP_PAYEES_PER_FY:
            continue
        fy = str(int(r["fiscal_year"]))
        year = years.setdefault(fy, {
            "fy_total_vouchers_paid_usd": _f(r["fy_total_vouchers_paid_usd"], 2),
            "is_fiscal_year_complete": bool(r["is_fiscal_year_complete"]),
            "payees": [],
        })
        year["payees"].append({
            "rank": int(r["rank_in_fy"]),
            "vendor": r["vendor"],
            "vouchers_paid_usd": _f(r["vouchers_paid_usd"], 2),
            "share_of_fy_paid": _f(r["share_of_fy_paid"], 6),
            "n_vouchers": int(r["n_vouchers"]),
            "is_non_profit": bool(r["is_non_profit"]),
            "top_department": r["top_department"],
            "bucket": r["bucket"],
            "bucket_note": r["classification_note"],
        })

    classified = [r for r in rows if r["bucket"] is not None]
    classification = {
        "method": "manual",
        "classified_at": max(r["classified_at"] for r in classified) if classified else None,
        "seed": "pipeline/seeds/countries/us/seed_us_sf_payee_buckets.csv",
        "coverage": (
            "The top FY2025 payees were classified by hand on 2026-07-16; "
            "bucket is null for unclassified payees (other fiscal years' "
            "tails). Buckets categorize payees for DISPLAY — every amount "
            "comes from the voucher dataset itself."
        ),
        "bucket_definitions": BUCKET_DEFINITIONS,
    }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "us",
        "scale": "city",
        "place": "sf",
        "unit": "USD",
        "as_of": _ts(ref["source_rows_updated_at"]),
        "source": source_block(ref),
        "metric": (
            "vouchers_paid summed per (fiscal year, vendor) over the "
            "Controller's voucher distribution lines. Vendor names are the "
            "portal's unkeyed strings — the same institution can appear "
            "under multiple spellings (e.g. Bank of New York Mellon)."
        ),
        "ranking_caveat": (
            "A naive top-payees ranking is dominated by banks and fiscal "
            "agents (debt service and pass-through flows), NOT by service "
            "providers — read payees through their bucket."
        ),
        "classification": classification,
        "top_n": TOP_PAYEES_PER_FY,
        "years": dict(sorted(years.items())),
        "notes": (
            "Dataset floor FY2007; in-progress fiscal years are flagged "
            "is_fiscal_year_complete=false. SF fiscal year N runs July 1 "
            "(N-1) to June 30 N."
        ),
    }


def build_budget_vs_actual(rows: list[dict]) -> dict:
    ref = rows[0]

    def points(side: str) -> list[dict]:
        out = []
        for r in rows:
            if r["side"] != side or r["fiscal_year"] is None:
                continue
            out.append({
                "fiscal_year": int(r["fiscal_year"]),
                "budget_net_usd": _f(r["budget_net_usd"], 2),
                "actual_all_usd": _f(r["actual_all_usd"], 2),
                "actual_excl_related_govt_units_usd": _f(r["actual_excl_rgu_usd"], 2),
                "reconciliation": {
                    "budget_excl_transfers_usd": _f(r["budget_excl_transfers_usd"], 2),
                    "actual_excl_rgu_excl_transfers_usd": _f(r["actual_excl_rgu_excl_transfers_usd"], 2),
                    "residual_usd": _f(r["residual_excl_transfers_usd"], 2),
                    "residual_pct": _f(r["residual_excl_transfers_pct"], 6),
                },
                "is_fiscal_year_complete": (
                    bool(r["is_fiscal_year_complete"])
                    if r["is_fiscal_year_complete"] is not None else None
                ),
            })
        return out

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "us",
        "scale": "city",
        "place": "sf",
        "unit": "USD",
        "as_of": _ts(ref["actuals_rows_updated_at"]),
        "sources": {
            "budget": {
                "source_url": ref["budget_source_url"],
                "rows_updated_at": _ts(ref["budget_rows_updated_at"]),
            },
            "actuals": {
                "source_url": ref["actuals_source_url"],
                "rows_updated_at": _ts(ref["actuals_rows_updated_at"]),
            },
        },
        "series_are_separate": True,
        "notes": (
            "Budget (net adopted AAO) and actuals are published here as "
            "SEPARATE labeled series, NOT as a like-for-like comparison. "
            "Measured on FY2010-FY2024 (complete years), even after "
            "aligning the perimeters — dropping related-government-unit "
            "rows (retirement system, OCII…, absent from the budget "
            "dataset) and all transfer characters from both sides — "
            "actual spending exceeds the adopted budget by roughly "
            "$1.5-4B per year (~10-25%). That residual is real budget "
            "life (supplemental appropriations, carryforward of "
            "continuing-project authority, grant-driven spending), not "
            "accounting noise we can subtract — so publishing a single "
            "'budget vs actual' bar would imply a precision the data "
            "does not support. The reconciliation block carries the "
            "aligned-perimeter figures and the measured residual per "
            "fiscal year so the gap itself is a documented, queryable "
            "fact (mart_us_sf_budget_vs_actual)."
        ),
        "sides": {
            "spending": {"points": points("Spending")},
            "revenue": {"points": points("Revenue")},
        },
    }


def build_index(budget: dict, payees: dict, bva: dict) -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "us",
        "scale": "city",
        "place": "sf",
        "files": {
            "budget_by_year.json": {
                "description": (
                    "Net adopted budget per fiscal year × side (Revenue/"
                    "Spending), FY2010+, per-resident on Census years"
                ),
                "as_of": budget["as_of"],
                "source_url": budget["source"]["source_url"],
            },
            "top_payees.json": {
                "description": (
                    f"Top {payees['top_n']} voucher payees per fiscal year "
                    "with manual bucket classification (FY2025)"
                ),
                "as_of": payees["as_of"],
                "source_url": payees["source"]["source_url"],
            },
            "budget_vs_actual.json": {
                "description": (
                    "Adopted budget and actuals as separate labeled series "
                    "+ measured reconciliation residuals (not a "
                    "like-for-like comparison — see file notes)"
                ),
                "as_of": bva["as_of"],
                "source_urls": sorted({
                    bva["sources"]["budget"]["source_url"],
                    bva["sources"]["actuals"]["source_url"],
                }),
            },
        },
        "population_source_url": budget["population"]["source_url"],
    }


def write_json(payload: dict, filename: str, log: Logger) -> None:
    output_file = OUTPUT_DIR / filename
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    size_kb = output_file.stat().st_size / 1024
    log.success(f"wrote {filename}", extra=f"{size_kb:.1f} KB")


def main() -> int:
    log = Logger("export_us_sf")
    log.header("Export US San Francisco (budget, payees, budget-vs-actual) → JSON")

    log.info("output dir", extra=str(OUTPUT_DIR))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    log.section("Connexion BigQuery")
    client = bigquery.Client(project=PROJECT_ID)
    log.success("connecté", extra=f"{PROJECT_ID}.{DATASET}")

    log.section("mart_us_sf_budget_by_year")
    budget_rows = fetch_rows(client, "mart_us_sf_budget_by_year", "side, fiscal_year")
    log.info("rows", extra=str(len(budget_rows)))
    budget = build_budget_by_year(budget_rows)

    log.section("mart_us_sf_top_payees")
    payee_rows = fetch_rows(client, "mart_us_sf_top_payees", "fiscal_year, rank_in_fy")
    log.info("rows", extra=str(len(payee_rows)))
    payees = build_top_payees(payee_rows)

    log.section("mart_us_sf_budget_vs_actual")
    bva_rows = fetch_rows(client, "mart_us_sf_budget_vs_actual", "side, fiscal_year")
    log.info("rows", extra=str(len(bva_rows)))
    bva = build_budget_vs_actual(bva_rows)

    log.section("Écriture")
    write_json(budget, "budget_by_year.json", log)
    write_json(payees, "top_payees.json", log)
    write_json(bva, "budget_vs_actual.json", log)
    write_json(build_index(budget, payees, bva), "index.json", log)

    log.section("Sanity check")
    sp = {p["fiscal_year"]: p["total_usd"] for p in budget["sides"]["spending"]["points"]}
    log.info("budget FY2025 Spending", extra=f"${sp.get(2025, 0):,.0f}")
    log.info("budget FY2026 Spending", extra=f"${sp.get(2026, 0):,.0f}")
    fy2025 = payees["years"].get("2025", {})
    log.info("vouchers FY2025 total", extra=f"${fy2025.get('fy_total_vouchers_paid_usd', 0):,.0f}")
    if fy2025.get("payees"):
        top = fy2025["payees"][0]
        log.info("top payee FY2025", extra=f"{top['vendor']} ${top['vouchers_paid_usd']:,.0f} [{top['bucket']}]")
    log.info("population", extra=f"{budget['population']['value']:,} ({budget['population']['year']})")
    log.summary()
    return 0


if __name__ == "__main__":
    sys.exit(main())
