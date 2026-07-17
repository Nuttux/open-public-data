#!/usr/bin/env python3
"""
Export US San Francisco city data from BigQuery (dbt_us_marts) to JSON.

Outputs (website/public/data/us/sf/):
    - budget_by_year.json  : net adopted budget per FY × side (Revenue /
      Spending), FY2010-FY2027, per-resident scaling on Census years.
      Source: mart_us_sf_budget_by_year.
    - top_payees.json      : the who-gets-paid page payload — top 100
      voucher payees per FY with bucket classification, objects_top3 and
      grant-funded $; per-FY perimeter split (city vs related government
      units — never netted silently), bucket-classification coverage,
      nonprofit slice (FY2018+) with the community-ranking exclusions,
      grant lens (FY2018+), execution_status enum and the curated
      "what a payment buys" materiality lines.
      Sources: mart_us_sf_top_payees, mart_us_sf_payees_by_fy,
      mart_us_sf_top_nonprofits, mart_us_sf_payee_materiality.
    - payees_search.json   : lazy search index (one row per vendor in the
      per-FY top-1,000 union — 4,068 vendors ≈95-97% of every FY's $),
      fetched by the page on first query (Paris beneficiaires_search
      pattern). Source: mart_us_sf_payees_search.
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
period-completeness (execution_status enum, SF-BUILD-PLAN cross-cutting
rule 2); units documented in the JSON. No hardcoded numbers — everything
flows from BigQuery marts whose invariants are dbt-tested
(tests/us/assert_us_sf_*).

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

TOP_PAYEES_PER_FY = 100
TOP_NONPROFITS_PER_FY = 30

# Buckets the page's DEFAULT ranking excludes. Fiscal agents and payroll
# pass-throughs are re-includable via the page toggle; `person` rows are
# NEVER featured (personnes-physiques doctrine — individual landlords etc.
# render as "individual payee" only where the user explicitly searches).
DEFAULT_VIEW_EXCLUDED_BUCKETS = [
    "fiscal_agent_debt_service",
    "payroll_passthrough",
    "person",
]

BUCKET_DEFINITIONS = {
    "fiscal_agent_debt_service": (
        "Banks acting as bond trustees, paying agents or custodians — "
        "money flowing THROUGH them (mostly debt service), not payment "
        "for services they provide."
    ),
    "payroll_passthrough": (
        "Entities administering compensation flows (deferred-compensation "
        "plans, IHSS home-care worker wages, pension contributions) — "
        "closer to payroll than to procurement."
    ),
    "healthcare": (
        "Health/dental plans and clinical providers — largely employee and "
        "retiree benefit premiums plus hospital staffing agreements."
    ),
    "nonprofit": (
        "Nonprofit service providers (housing, health, social services) — "
        "the classic 'who gets paid' grantees/contractors."
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
    "person": (
        "An individual person paid directly (mostly landlords under "
        "master leases). Rendered as 'individual payee' and never "
        "featured in rankings or suggestions."
    ),
}

FY2018_NOTE = (
    "FY2018 is a system migration, not a policy change: the Controller "
    "moved to PeopleSoft in July 2017. From FY2018 the vendor count halves "
    "(one-off payees are collapsed into the literal vendor 'Single Payment "
    "Payees'), the nonprofit flag and contract numbers begin, and spelling "
    "conventions change (legacy ALL-CAPS vs Title Case). Any series that "
    "kinks at FY2018 kinks for that reason."
)

GRANT_LENS_DEFINITION = (
    "Payments under contracts San Francisco classifies as 'Grant Contracts "
    "(City as Grantor)' — voucher lines joined to the contract register by "
    "contract number. Contract numbers exist FY2018+ only; 98-99% of "
    "carried contract dollars match the register (measured 2026-07-16)."
)


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


def _payee_row(r: dict) -> dict:
    return {
        "rank": int(r["rank_in_fy"]),
        "vendor": r["vendor"],
        "vouchers_paid_usd": _f(r["vouchers_paid_usd"], 2),
        "share_of_fy_paid": _f(r["share_of_fy_paid"], 6),
        "n_vouchers": int(r["n_vouchers"]),
        "is_non_profit": bool(r["is_non_profit"]),
        "top_department": r["top_department"],
        "n_departments": int(r["n_departments"]),
        "objects_top3": list(r["objects_top3"] or []),
        "grant_funded_usd": _f(r["grant_funded_usd"], 2),
        "bucket": r["bucket"],
        "bucket_note": r["classification_note"],
        "is_aggregation_line": bool(r["is_aggregation_line"]),
    }


def _nonprofit_row(r: dict) -> dict:
    return {
        "rank": int(r["rank_in_fy"]),
        "community_rank": int(r["community_rank"]) if r["community_rank"] is not None else None,
        "in_community_ranking": bool(r["in_community_ranking"]),
        "vendor": r["vendor"],
        "vouchers_paid_usd": _f(r["vouchers_paid_usd"], 2),
        "grant_funded_usd": _f(r["grant_funded_usd"], 2),
        "share_of_fy_nonprofit": _f(r["share_of_fy_nonprofit"], 6),
        "n_vouchers": int(r["n_vouchers"]),
        "n_departments": int(r["n_departments"]),
        "top_department": r["top_department"],
        "bucket": r["bucket"],
        "bucket_note": r["classification_note"],
    }


def build_top_payees(
    payee_rows: list[dict],
    fy_rows: list[dict],
    nonprofit_rows: list[dict],
    materiality_rows: list[dict],
) -> dict:
    ref = payee_rows[0]

    nonprofits_by_fy: dict[int, list[dict]] = {}
    for r in nonprofit_rows:
        if int(r["rank_in_fy"]) <= TOP_NONPROFITS_PER_FY:
            nonprofits_by_fy.setdefault(int(r["fiscal_year"]), []).append(_nonprofit_row(r))

    years: dict[str, dict] = {}
    for fy_row in fy_rows:
        fy = int(fy_row["fiscal_year"])
        nonprofit = None
        if fy_row["nonprofit_usd"] is not None:
            nonprofit = {
                "total_usd": _f(fy_row["nonprofit_usd"], 2),
                "n_vendors": int(fy_row["n_nonprofit_vendors"]),
                "share_of_total": _f(fy_row["nonprofit_share_of_total"], 6),
                "top_department": {
                    "name": fy_row["top_nonprofit_department"],
                    "usd": _f(fy_row["top_nonprofit_department_usd"], 2),
                },
                "top": nonprofits_by_fy.get(fy, []),
            }
        grants = None
        if fy_row["grant_funded_usd"] is not None:
            grants = {
                "total_usd": _f(fy_row["grant_funded_usd"], 2),
                "nonprofit_usd": _f(fy_row["grant_funded_nonprofit_usd"], 2),
            }
        years[str(fy)] = {
            "totals": {
                "all_usd": _f(fy_row["total_usd"], 2),
                "city_usd": _f(fy_row["city_usd"], 2),
                "related_govt_units_usd": _f(fy_row["related_govt_units_usd"], 2),
                "related_share_of_total": _f(fy_row["related_share_of_total"], 6),
            },
            "related_top_departments": [
                {"department": d["department"], "usd": _f(d["usd"], 2)}
                for d in (fy_row["related_top_departments"] or [])
            ],
            "n_vendors": int(fy_row["n_vendors"]),
            "n_vouchers": int(fy_row["n_vouchers"]),
            "execution_status": fy_row["execution_status"],
            "bucket_coverage_pct": _f(fy_row["bucket_coverage_pct"], 4),
            "grants": grants,
            "nonprofit": nonprofit,
            "payees": [],
        }

    for r in payee_rows:
        if int(r["rank_in_fy"]) > TOP_PAYEES_PER_FY:
            continue
        years[str(int(r["fiscal_year"]))]["payees"].append(_payee_row(r))

    classified = [r for r in payee_rows if r["bucket"] is not None]
    classification = {
        "method": "manual",
        "classified_at": max(r["classified_at"] for r in classified) if classified else None,
        "seed": "pipeline/seeds/countries/us/seed_us_sf_payee_buckets.csv",
        "coverage": (
            "Two manual in-session batches (2026-07-16): the top FY2025 "
            "payees, then the measured per-FY top-30 union + all-time "
            "top-200 + six study-named individual landlords (232 exact "
            "vendor strings). A classified string carries its bucket into "
            "every fiscal year it appears in; bucket is null for "
            "unclassified names. Per-FY coverage of dollars is exported as "
            "bucket_coverage_pct — strong FY2024+ (62-66%), weak pre-2018 "
            "(~26-46%), where the page shows a coverage badge. Buckets "
            "categorize payees for DISPLAY — every amount comes from the "
            "voucher dataset itself."
        ),
        "bucket_definitions": BUCKET_DEFINITIONS,
    }

    materiality = {
        "note": (
            "Curated examples of what a single payment line buys. The "
            "pipeline seed picks WHICH (vendor × department × sub-object × "
            "fiscal year) lines to feature; every dollar amount is computed "
            "from the voucher data (dbt-tested to keep matching)."
        ),
        "items": [
            {
                "slug": r["slug"],
                "label": r["label"],
                "editorial_note": r["editorial_note"],
                "vendor": r["vendor"],
                "department": r["department"],
                "object": r["object"],
                "sub_object": r["sub_object"],
                "fiscal_year": int(r["fiscal_year"]),
                "amount_usd": _f(r["amount_usd"], 2),
                "execution_status": r["execution_status"],
            }
            for r in materiality_rows
        ],
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
        "perimeter": (
            "ALL payments through the City's financial system — including "
            "flows to related government units (pension benefits, health "
            "service system premiums, community college district, "
            "citywide debt service). The city vs related split is exported "
            "per year in totals and related_top_departments; it is never "
            "netted silently."
        ),
        "ranking_caveat": (
            "A naive top-payees ranking is dominated by banks and fiscal "
            "agents (debt service and pass-through flows), NOT by service "
            "providers — read payees through their bucket."
        ),
        "classification": classification,
        "default_view": {
            "excluded_buckets": DEFAULT_VIEW_EXCLUDED_BUCKETS,
            "note": (
                "The page's default ranking excludes fiscal agents / "
                "debt-service banks and payroll pass-throughs (money "
                "flowing THROUGH the payee), re-includable via the page "
                "toggle. 'person' rows are never featured."
            ),
        },
        "grant_lens_definition": GRANT_LENS_DEFINITION,
        "fy2018_note": FY2018_NOTE,
        "nonprofit_floor_note": (
            "The Controller's nonprofit flag exists from FY2018 only "
            "(measured: zero flagged rows 2007-2017) — the nonprofit slice "
            "starts there. No name-based backfill: it would cover only "
            "13.8% of pre-2018 dollars."
        ),
        "top_n": TOP_PAYEES_PER_FY,
        "years": dict(sorted(years.items())),
        "materiality": materiality,
        "notes": (
            "Dataset floor FY2007. execution_status per year: closed / "
            "recently_closed_preliminary (year ended but the accounting "
            "close is still running, ~4 months) / in_progress. SF fiscal "
            "year N runs July 1 (N-1) to June 30 N."
        ),
    }


def build_payees_search(rows: list[dict]) -> dict:
    ref = rows[0]
    years = sorted({int(y["fiscal_year"]) for r in rows for y in (r["by_year"] or [])})
    data = []
    for r in rows:
        by_year = {
            str(int(y["fiscal_year"])): round(float(y["usd"]), 2)
            for y in (r["by_year"] or [])
            if y["usd"] is not None and float(y["usd"]) != 0.0
        }
        data.append({
            "name": r["vendor"],
            "totalAmount": _f(r["total_usd"], 2),
            "byYear": by_year,
            "lastActiveYear": int(r["last_active_fy"]) if r["last_active_fy"] is not None else int(r["last_fy"]),
            "nFys": int(r["n_fys"]),
            "np": bool(r["is_non_profit"]),
            "bucket": r["bucket"],
            "topDepartment": r["top_department"],
            "nDepartments": int(r["n_departments"]) if r["n_departments"] is not None else None,
            "isAggregationLine": bool(r["is_aggregation_line"]),
        })
    data.sort(key=lambda d: -(d["totalAmount"] or 0))
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "us",
        "scale": "city",
        "place": "sf",
        "unit": "USD",
        "as_of": _ts(ref["source_rows_updated_at"]),
        "source": source_block(ref),
        "perimeter": (
            "One row per vendor in the union of each fiscal year's top "
            "1,000 payees by dollars (≈95-97% of every year's total). The "
            "full universe is ~71,700 raw vendor strings; the excluded "
            "tail is dollar-immaterial and contains most person-like "
            "names. byYear carries the vendor's complete per-FY sums, "
            "including years outside its top-1,000 appearances."
        ),
        "person_note": (
            "bucket='person' rows are individual payees (mostly landlords "
            "paid directly). The UI labels them 'individual payee' and "
            "never features them in rankings or suggestions."
        ),
        "years": years,
        "count": len(data),
        "data": data,
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
                "reconciliation_all_funds": {
                    "budget_excl_transfers_usd": _f(r["budget_excl_transfers_usd"], 2),
                    "actual_excl_rgu_excl_transfers_usd": _f(r["actual_excl_rgu_excl_transfers_usd"], 2),
                    "residual_usd": _f(r["residual_excl_transfers_usd"], 2),
                    "residual_pct": _f(r["residual_excl_transfers_pct"], 6),
                },
                "operating_comparison": {
                    "budget_usd": _f(r["budget_operating_excl_transfers_usd"], 2),
                    "actual_usd": _f(r["actual_operating_aligned_usd"], 2),
                    "residual_usd": _f(r["residual_operating_usd"], 2),
                    "residual_pct": _f(r["residual_operating_pct"], 6),
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
        "comparable_perimeter": "operating_comparison",
        "notes": (
            "Two ways to read this file, both measured in "
            "mart_us_sf_budget_vs_actual (2026-07-16). (1) ALL FUNDS: "
            "budget_net_usd (net adopted AAO) and actual_all_usd are "
            "SEPARATE labeled series, NOT a like-for-like pair — even "
            "after dropping related-government-unit rows (retirement "
            "system, OCII…, absent from the budget dataset) and all "
            "transfer characters from both sides, actual spending stays "
            "$0.6-2.8B above budget per fiscal year (+4% to +23%, "
            "FY2018-FY2025; reconciliation_all_funds block). That "
            "residual concentrates in an actuals-only 'Unspecified' fund "
            "category with no budget counterpart ($1.6-2.4B/FY) and in "
            "continuing-project funds, where spending draws on MULTI-YEAR "
            "authority — a real feature of how SF budgets, not noise we "
            "can subtract. (2) OPERATING FUNDS ONLY (operating_comparison "
            "block: fund_category='Operating' on both sides, related govt "
            "units and transfer characters excluded): budget and actual "
            "DO reconcile — actuals run 0.4% to 8.8% UNDER budget across "
            "FY2010-FY2025 (one -16.8% outlier in FY2021, COVID), i.e. "
            "ordinary under-execution of appropriations. Only the "
            "operating_comparison pair should be charted as "
            "budget-vs-actual."
        ),
        "sides": {
            "spending": {"points": points("Spending")},
            "revenue": {"points": points("Revenue")},
        },
    }


def build_index(budget: dict, payees: dict, search: dict, bva: dict) -> dict:
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
                    f"Who-gets-paid payload: top {payees['top_n']} voucher "
                    "payees per fiscal year with bucket classification, "
                    "perimeter split, coverage, nonprofit slice (FY2018+), "
                    "grant lens and materiality lines"
                ),
                "as_of": payees["as_of"],
                "source_url": payees["source"]["source_url"],
            },
            "payees_search.json": {
                "description": (
                    f"Lazy payee search index — {search['count']} vendors "
                    "(per-FY top-1,000 union) with per-FY sums and buckets"
                ),
                "as_of": search["as_of"],
                "source_url": search["source"]["source_url"],
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
    log.header("Export US San Francisco (budget, payees, search, budget-vs-actual) → JSON")

    log.info("output dir", extra=str(OUTPUT_DIR))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    log.section("Connexion BigQuery")
    client = bigquery.Client(project=PROJECT_ID)
    log.success("connecté", extra=f"{PROJECT_ID}.{DATASET}")

    log.section("mart_us_sf_budget_by_year")
    budget_rows = fetch_rows(client, "mart_us_sf_budget_by_year", "side, fiscal_year")
    log.info("rows", extra=str(len(budget_rows)))
    budget = build_budget_by_year(budget_rows)

    log.section("mart_us_sf_top_payees (+by_fy, nonprofits, materiality)")
    payee_rows = fetch_rows(client, "mart_us_sf_top_payees", "fiscal_year, rank_in_fy")
    fy_rows = fetch_rows(client, "mart_us_sf_payees_by_fy", "fiscal_year")
    nonprofit_rows = fetch_rows(client, "mart_us_sf_top_nonprofits", "fiscal_year, rank_in_fy")
    materiality_rows = fetch_rows(client, "mart_us_sf_payee_materiality", "fiscal_year, slug")
    log.info("rows", extra=(
        f"payees={len(payee_rows)} by_fy={len(fy_rows)} "
        f"nonprofits={len(nonprofit_rows)} materiality={len(materiality_rows)}"
    ))
    payees = build_top_payees(payee_rows, fy_rows, nonprofit_rows, materiality_rows)

    log.section("mart_us_sf_payees_search")
    search_rows = fetch_rows(client, "mart_us_sf_payees_search", "total_usd DESC")
    log.info("rows", extra=str(len(search_rows)))
    search = build_payees_search(search_rows)

    log.section("mart_us_sf_budget_vs_actual")
    bva_rows = fetch_rows(client, "mart_us_sf_budget_vs_actual", "side, fiscal_year")
    log.info("rows", extra=str(len(bva_rows)))
    bva = build_budget_vs_actual(bva_rows)

    log.section("Écriture")
    write_json(budget, "budget_by_year.json", log)
    write_json(payees, "top_payees.json", log)
    write_json(search, "payees_search.json", log)
    write_json(bva, "budget_vs_actual.json", log)
    write_json(build_index(budget, payees, search, bva), "index.json", log)

    log.section("Sanity check (Block-2 acceptance numbers)")
    fy2025 = payees["years"].get("2025", {})
    tot = fy2025.get("totals", {})
    log.info("FY2025 all payments", extra=f"${tot.get('all_usd', 0):,.0f}")
    log.info("FY2025 via related govt units", extra=f"${tot.get('related_govt_units_usd', 0):,.0f}")
    log.info("FY2025 coverage", extra=f"{100 * (fy2025.get('bucket_coverage_pct') or 0):.1f}%")
    if fy2025.get("payees"):
        naive_top = fy2025["payees"][0]
        excluded = set(DEFAULT_VIEW_EXCLUDED_BUCKETS)
        default_top = next(
            (p for p in fy2025["payees"] if (p["bucket"] or "") not in excluded),
            None,
        )
        log.info("FY2025 naive #1 (toggled view)", extra=(
            f"{naive_top['vendor']} ${naive_top['vouchers_paid_usd']:,.0f} [{naive_top['bucket']}]"
        ))
        if default_top:
            log.info("FY2025 default #1", extra=(
                f"{default_top['vendor']} ${default_top['vouchers_paid_usd']:,.0f} [{default_top['bucket']}]"
            ))
    np2025 = fy2025.get("nonprofit") or {}
    log.info("FY2025 nonprofit", extra=(
        f"${(np2025.get('total_usd') or 0):,.0f} / {np2025.get('n_vendors', 0)} orgs"
    ))
    gr2025 = fy2025.get("grants") or {}
    log.info("FY2025 grant-funded", extra=f"${(gr2025.get('total_usd') or 0):,.0f}")
    log.info("search index", extra=f"{search['count']} vendors")
    log.info("materiality", extra=f"{len(payees['materiality']['items'])} lines")
    log.summary()
    return 0


if __name__ == "__main__":
    sys.exit(main())
