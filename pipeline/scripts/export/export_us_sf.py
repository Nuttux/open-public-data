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
    - payment_breakdowns.json : one fiscal year's payments cut three ways
      (paying department, service area, kind of payee), every dimension
      sharing the same denominator so the page's lens toggle re-cuts one
      total. Source: mart_us_sf_payment_breakdowns.
    - payee_profiles.json  (pipeline/cache/us_sf/, NOT public/data — it is a
      pipeline intermediate, read only by normalize_sf_payees.py)
                           : per-vendor rollups — paying departments with
      dollars, sub-object categories (FY2018+) carrying spend_class, and
      the most recently CLOSED fiscal year broken into department ×
      category lines. This is what lets a payee fiche say what the City
      pays a payee FOR; SF vendors carry no registry id, so the account
      coding on their own payment lines is the only source-derived
      description available. Source: mart_us_sf_payee_profile.
    - budget_vs_actual.json: adopted budget and actuals as SEPARATE labeled
      series per FY, plus the measured reconciliation perimeters and
      residuals. The two series are NOT published as a single comparable
      pair — see the reconciliation block in the file and the model header
      of mart_us_sf_budget_vs_actual for why (measured, not assumed).
      Source: mart_us_sf_budget_vs_actual.
    - budget_dept_detail_{fy}.json: per-FY dept × character DETAIL — the
      third drill level below a department fiche (dept → character →
      this). Raw object-level budget line items + vendor payments
      (vouchers) matched to the same cell, two source-distinct blocks,
      read lazily server-side. Sources:
      mart_us_sf_budget_dept_character_object, mart_us_sf_vouchers_dept_character.
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
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import bigquery

sys.path.insert(0, str(Path(__file__).parent.parent))
from utils.logger import Logger  # noqa: E402

PROJECT_ID = "open-data-france-484717"
# Overridable so a dev can verify an export against `dbt_us_dev_*_marts`
# without a prod build (prod stays CI-only).
DATASET = os.environ.get("BQ_MARTS_DATASET", "dbt_us_marts")
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data" / "us" / "sf"
# Intermediates consumed by a later pipeline step, not by the site. Kept out
# of public/data so the shipped data directory stays exactly "what the site
# reads" (payee_profiles.json is 8 MB and is baked into the per-payee fiches
# by normalize_sf_payees.py, which is the only thing that ever opens it).
CACHE_DIR = Path(__file__).parent.parent.parent / "cache" / "us_sf"

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
                # Deprecated calendar boolean (flags the newest ended FY
                # "complete" while the close runs for months) — kept for
                # compatibility; read execution_status instead.
                "is_fiscal_year_complete": bool(r["is_fiscal_year_complete"]),
                "execution_status": r["execution_status"],
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


def build_spending_subobjects(rows: list[dict]) -> dict:
    """
    "What the City buys" — every sub-object, split by spend class.

    The voucher file is the City's ledger, so ranking it raw answers the
    wrong question: FY2025 opens on $3.4B of "Professional/Specialized Svcs"
    and includes federal tax withholding, bond redemption and unearned
    revenue. Each sub-object therefore carries a class from
    seed_us_sf_subobject_class (purchase / obligation / ledger / unclear) and
    the page presents the purchases as the section, the rest as context.

    The exemplar on each row is the largest real vendor x department line in
    that cell — derived, never curated, so it cannot be cherry-picked and it
    refreshes with the data. FY2018+ only: the chart of accounts was
    renumbered at FY2018 (see the mart header).
    """
    # Which categories get a drill list — i.e. which ones become an openable
    # fiche. This was rank-based (top purchases only), which assumed the page's
    # own ranking was the way in. It is not: a payee fiche lists that PAYEE's
    # categories, and for a health plan or a bond trustee every one of them is
    # obligation-class, so Kaiser's fiche was a column of dead labels.
    #
    # Materiality, not rank: a category carrying at least $100k in a year is
    # openable. A rank cut makes reachability depend on what else happened that
    # year; a money floor is a property of the row itself and covers the long
    # tail that payee fiches actually link to.
    DRILL_FLOOR_USD = 100_000

    by_fy: dict[int, list[dict]] = {}
    for r in rows:
        fy_key = int(r["fiscal_year"])
        drillable = abs(float(r["paid_usd"] or 0)) >= DRILL_FLOOR_USD
        by_fy.setdefault(fy_key, []).append({
            "code": r["sub_object_code"],
            "label": r["sub_object"],
            "spend_class": r["spend_class"],
            "paid_usd": _f(r["paid_usd"], 2),
            "n_vendors": int(r["n_vendors"]),
            "n_departments": int(r["n_departments"]),
            "share_of_year": _f(r["share_of_year"], 6),
            "share_of_class": _f(r["share_of_class"], 6),
            "exemplar": {
                "vendor": r["exemplar_vendor"],
                "department": r["exemplar_department"],
                "department_code": r["exemplar_department_code"],
                "amount_usd": _f(r["exemplar_usd"], 2),
            } if r["exemplar_vendor"] else None,
            # The drill list behind a clicked category. Same ranking as the
            # exemplar (which is by construction its first row), so the panel
            # can never contradict the line the reader clicked.
            # n_payees_ranked is the count BEFORE the top-8 cut, so the UI
            # states what it is not showing instead of implying completeness.
            "top_payees": [
                {
                    "vendor": tp["vendor"],
                    "department": tp["department"],
                    "department_code": tp["department_code"],
                    "amount_usd": _f(tp["usd"], 2),
                }
                for tp in (r.get("top_payees") or [])
            ] if drillable else [],
            "n_payees_ranked": (
                int(r["n_payees_ranked"]) if drillable and r.get("n_payees_ranked") is not None else 0
            ),
        })

    class_totals = {}
    for fy, items in by_fy.items():
        totals: dict[str, float] = {}
        for it in items:
            totals[it["spend_class"]] = totals.get(it["spend_class"], 0.0) + (it["paid_usd"] or 0.0)
        class_totals[str(fy)] = {k: round(v, 2) for k, v in sorted(totals.items())}

    ref = rows[0] if rows else {}
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "unit": "USD",
        "grain": "fiscal_year x sub_object_code (FY2018+)",
        "perimeter": (
            "Every vendor-payment line in the Controller's voucher file from "
            "FY2018 on, grouped by the City's own sub-object accounting code. "
            "FY2018 is the floor because the chart of accounts was renumbered "
            "that year: the same concept carries a different code before and "
            "after, so a series across the break would silently split."
        ),
        "class_definitions": {
            "purchase": "Goods and services bought from outside the City.",
            "obligation": (
                "Money out that is not a purchase: debt service, employee "
                "benefit plans, tax withholding, payments to other governments."
            ),
            "ledger": (
                "Balance-sheet and revenue lines that appear in the payments "
                "file without being a payment for anything."
            ),
            "unclear": "Not confidently classified; shown folded, never as fact.",
        },
        "classification_note": (
            "The class is a display classification of the City's sub-object "
            "codes, not a figure from the source. Every dollar comes from the "
            "vouchers; only the grouping is ours."
        ),
        "exemplar_note": (
            "The example on each row is the largest single vendor x department "
            "line in that category and year, excluding related government "
            "units so a category is never illustrated by an internal transfer. "
            "Totals still include every line."
        ),
        "source": {
            "name": ref.get("dataset_name"),
            "dataset_id": ref.get("dataset_id"),
            "source_url": ref.get("dataset_page_url"),
            "attribution": ref.get("attribution"),
            "rows_updated_at": _ts(ref.get("rows_updated_at")),
        },
        "class_totals": class_totals,
        "years": {str(fy): items for fy, items in sorted(by_fy.items())},
    }


def build_payment_breakdowns(rows: list[dict]) -> dict:
    """
    The same fiscal year's payments cut three ways: paying department, service
    area, and kind of payee.

    The who-gets-paid page had one breakdown (what the money bought) where the
    contracts page has four, so a reader could see what was purchased and never
    who paid for it. Every dimension here shares ONE denominator — the fiscal
    year's total payments — so the page's lens toggle re-cuts a single pie
    instead of silently changing what is being measured.

    Only the top rows travel; the UI folds the remainder into "Other" using
    `total_usd`, which is the true FY total from the mart, not the sum of the
    rows shipped.
    """
    TOP_PER_DIMENSION = 10
    by_fy: dict[int, dict] = {}
    for r in rows:
        fy = int(r["fiscal_year"])
        entry = by_fy.setdefault(fy, {
            "total_usd": _f(r["fy_total_usd"], 2),
            "execution_status": r["execution_status"],
            "dimensions": {},
        })
        dim = entry["dimensions"].setdefault(r["dimension"], [])
        if int(r["rank_in_dimension"]) > TOP_PER_DIMENSION:
            continue
        dim.append({
            "key": r["key"],
            "label": r["label"],
            "usd": _f(r["usd"], 2),
            "n_payees": int(r["n_payees"]),
            "share_of_fy": _f(r["share_of_fy"], 6),
        })

    ref = rows[0] if rows else {}
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "unit": "USD",
        "grain": "fiscal_year x dimension x key",
        "top_per_dimension": TOP_PER_DIMENSION,
        "dimension_notes": {
            "department": (
                "The paying department, on the City's own code. Grouped on the "
                "code and not the name: the FY2018 system migration re-cased "
                "every label, so grouping on the label splits one department "
                "in two."
            ),
            "org_group": (
                "The Controller's seven service areas — the same top-level "
                "grouping the budget page uses, so the two pages cut the money "
                "the same way."
            ),
            "kind": (
                "The display bucket of the PAYEE (supplier, nonprofit, "
                "healthcare, fiscal agent, payroll pass-through, individual). "
                "Vendors the classification seed does not cover are shown as "
                "'unclassified' rather than dropped — the gap is a fact about "
                "the classification, not a rounding error."
            ),
        },
        "denominator_note": (
            "Every dimension sums to the same figure: that fiscal year's total "
            "payments. Switching lens re-cuts one total; it never changes what "
            "is being measured."
        ),
        "source": {
            "name": ref.get("source_name"),
            "dataset_id": ref.get("source_dataset_id"),
            "source_url": ref.get("source_url"),
            "attribution": ref.get("source_attribution"),
            "rows_updated_at": _ts(ref.get("source_rows_updated_at")),
        },
        "years": {str(fy): payload for fy, payload in sorted(by_fy.items())},
    }


def build_payee_profiles(rows: list[dict]) -> dict:
    """
    Per-payee rollups: what a payee is actually paid for.

    Paris fills the equivalent slot from SIRENE — a supplier is keyed by
    SIREN, so the fiche can state its activity, legal form and head office.
    SF vendors carry no identifier, so the only thing that can describe a
    payee from the source itself is the City's own account coding on its
    payment lines: which department paid, and which sub-object it was
    booked to ("Food", "Interpreters", "Rent/Lease-Building/Structure").

    Keyed by the RAW Controller vendor string. normalize_sf_payees.py merges
    these across the spelling variants it folds into one payee, so the fiche
    sees one rollup per normalized entity, not per spelling.
    """
    ref = rows[0] if rows else {}
    profiles: dict[str, dict] = {}
    for r in rows:
        profiles[r["vendor"]] = {
            "total_paid_usd": _f(r["total_paid_usd"], 2),
            "n_vouchers": int(r["n_vouchers"] or 0),
            "n_departments": int(r["n_departments"] or 0),
            "n_categories": int(r["n_categories"] or 0),
            "departments": [
                {
                    "department": d["department"],
                    "department_code": d["department_code"],
                    "usd": _f(d["usd"], 2),
                    "n_vouchers": int(d["n_vouchers"] or 0),
                }
                for d in (r.get("departments") or [])
            ],
            "categories": [
                {
                    "code": c["sub_object_code"],
                    "label": c["sub_object"],
                    "spend_class": c["spend_class"],
                    "usd": _f(c["usd"], 2),
                    "n_vouchers": int(c["n_vouchers"] or 0),
                }
                for c in (r.get("categories") or [])
            ],
            "categories_total_usd": _f(r["categories_total_usd"], 2),
            "recent_fy": int(r["recent_fy"]) if r.get("recent_fy") is not None else None,
            "recent_total_usd": _f(r["recent_total_usd"], 2),
            "n_recent_lines": int(r["n_recent_lines"] or 0),
            "recent_lines": [
                {
                    "department": l["department"],
                    "department_code": l["department_code"],
                    "label": l["sub_object"],
                    "spend_class": l["spend_class"],
                    "usd": _f(l["usd"], 2),
                    "n_vouchers": int(l["n_vouchers"] or 0),
                }
                for l in (r.get("recent_lines") or [])
            ],
        }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "unit": "USD",
        "grain": "vendor (raw Controller display string)",
        "count": len(profiles),
        "perimeter": (
            "Every payment line in the Controller's voucher file, rolled up "
            "per vendor by paying department (all years) and by the City's "
            "own sub-object accounting category (FY2018+, the chart-of-"
            "accounts renumbering floor)."
        ),
        "recent_note": (
            "The voucher file carries no payment DATE, only a fiscal year, so "
            "a dated payment ledger cannot be built from this source. "
            "`recent_lines` is instead the payee's most recently CLOSED "
            "fiscal year broken into department x category lines — the "
            "closest the data allows to 'what they were paid for lately'."
        ),
        "class_note": (
            "spend_class (purchase / obligation / ledger / unclear) is a "
            "display classification of the City's sub-object codes, not a "
            "field from the source. It exists so a payee whose money is debt "
            "service or an employee benefit plan is never described as though "
            "the City bought something from them."
        ),
        "source": {
            "name": ref.get("source_name"),
            "dataset_id": ref.get("source_dataset_id"),
            "source_url": ref.get("source_url"),
            "attribution": ref.get("source_attribution"),
            "rows_updated_at": _ts(ref.get("source_rows_updated_at")),
        },
        "profiles": profiles,
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


def _by_fy(rows: list[dict]) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = {}
    for r in rows:
        out.setdefault(int(r["fiscal_year"]), []).append(r)
    return out


PROGRAM_STRIP_MAX_TAGS = 12  # renderable strip = the ~10 modern activity tags


def build_budget_breakdown(
    fy: int,
    by_year_rows: list[dict],
    og_rows: list[dict],
    dept_rows: list[dict],
    cell_rows: list[dict],
    char_rows: list[dict],
    prog_rows: list[dict],
    fund_rows: list[dict],
) -> dict:
    """One fiscal year's page payload. Pure reshaping of mart rows — no
    aggregation happens here (rollups live in dbt marts, each altitude
    identity-tested against mart_us_sf_budget_by_year)."""
    yr = {r["side"]: r for r in by_year_rows}
    ref = by_year_rows[0]
    execution_status = ref["execution_status"]

    def totals(side: str) -> dict:
        r = yr[side]
        return {
            "total_usd": _f(r["total_usd"], 2),
            "transfer_adjustment_usd": _f(r["transfer_adjustment_usd"], 2),
            "n_lines": int(r["n_lines"]),
            "per_resident_usd": _f(r["per_resident_usd"], 2),
            "population_year": int(r["population_year"]) if r["population_year"] is not None else None,
        }

    def org_groups(side: str) -> list[dict]:
        return [
            {
                "code": r["organization_group_code"],
                "label": r["organization_group"],
                "total_usd": _f(r["total_usd"], 2),
                "transfer_adjustment_usd": _f(r["transfer_adjustment_usd"], 2),
                "share_of_side": _f(r["share_of_side"], 6),
                "n_departments": int(r["n_departments"]),
            }
            for r in sorted(og_rows, key=lambda x: -float(x["total_usd"]))
            if r["side"] == side
        ]

    def departments(side: str) -> list[dict]:
        return [
            {
                "code": r["department_code"],
                "label": r["department"],
                "display_name": r["department_display_name"],
                "org_group_code": r["organization_group_code"],
                "total_usd": _f(r["total_usd"], 2),
                "transfer_adjustment_usd": _f(r["transfer_adjustment_usd"], 2),
                "share_of_side": _f(r["share_of_side"], 6),
                "n_characters": int(r["n_characters"]),
            }
            for r in sorted(dept_rows, key=lambda x: -float(x["total_usd"]))
            if r["side"] == side
        ]

    def cells(side: str) -> list[list]:
        """Compact [dept_code, character_code, amount_usd, is_transfer_adjustment]
        rows — labels/glosses resolve through the departments and characters
        blocks (keeps ~800 cells within the 60-120KB/FY budget)."""
        return [
            [r["department_code"], r["character_code"], _f(r["amount_usd"], 2),
             1 if r["is_transfer_adjustment"] else 0]
            for r in sorted(cell_rows, key=lambda x: -abs(float(x["amount_usd"])))
            if r["side"] == side
        ]

    def characters(side: str) -> list[dict]:
        return [
            {
                "code": r["character_code"],
                "label": r["character"],
                "gloss": r["character_gloss"],
                "display_category": r["display_category"] or (
                    "adjustment" if r["is_transfer_adjustment"] else "standard"
                ),
                "total_usd": _f(r["total_usd"], 2),
                "share_of_side": _f(r["share_of_side"], 6),
                "n_departments": int(r["n_departments"]),
                "is_transfer_adjustment": bool(r["is_transfer_adjustment"]),
            }
            for r in sorted(char_rows, key=lambda x: -float(x["total_usd"]))
            if r["side"] == side
        ]

    def funds(side: str) -> list[dict]:
        return [
            {
                "fund_type": r["fund_type"],
                "fund_category": r["fund_category"],
                "total_usd": _f(r["total_usd"], 2),
                "n_funds": int(r["n_funds"]),
            }
            for r in sorted(fund_rows, key=lambda x: -float(x["total_usd"]))
            if r["side"] == side
        ]

    prog_spending = [r for r in prog_rows if r["side"] == "Spending"]
    strip_available = bool(prog_spending) and all(
        int(r["n_programs_in_fy"]) <= PROGRAM_STRIP_MAX_TAGS for r in prog_spending
    )
    program_strip = {
        "available": strip_available,
        "note": (
            "From FY2019 the source's program dimension is ~10 generic "
            "activity tags (Operating / Capital / Administrative…) — an "
            "operating-vs-capital strip, not a drill level."
            if strip_available
            else "Not rendered: this fiscal year's program dimension is the "
                 "legacy per-department taxonomy (hundreds of programs), not "
                 "the modern activity tags."
        ),
        "rows": [
            {
                "program": r["program"],
                "total_usd": _f(r["total_usd"], 2),
                "share_of_side": _f(r["share_of_side"], 6),
            }
            for r in sorted(prog_spending, key=lambda x: -float(x["total_usd"]))
        ] if strip_available else [],
    }

    drill_available = bool(dept_rows)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "us",
        "scale": "city",
        "place": "sf",
        "unit": "USD",
        "fiscal_year": fy,
        "execution_status": execution_status,
        "as_of": _ts(ref["source_rows_updated_at"]),
        "source": source_block(ref),
        "perimeter": (
            "Adopted budget (Annual Appropriation Ordinance), ALL funds, "
            "citywide, NET of the dataset's embedded negative 'Transfer "
            "Adjustment' rows — those lines are carried explicitly (never "
            "silently netted) as transfer_adjustment_usd at every altitude "
            "and flagged in the dept × character cells."
        ),
        "chart_of_accounts": "modern" if fy >= 2019 else "legacy",
        "drill": {
            "available": drill_available,
            "reason": None if drill_available else (
                "FY2018 is the PeopleSoft migration year: the budget dataset "
                "mixes both chart-of-accounts systems and duplicates "
                "department identities, so department/character breakdowns "
                "are not publishable. Citywide, org-group and fund totals "
                "are consistent and shipped."
            ),
        },
        "totals": {"spending": totals("Spending"), "revenue": totals("Revenue")},
        "org_groups": {"spending": org_groups("Spending"), "revenue": org_groups("Revenue")},
        "departments": {"spending": departments("Spending"), "revenue": departments("Revenue")},
        "dept_characters": {
            "columns": ["department_code", "character_code", "amount_usd", "is_transfer_adjustment"],
            "spending": cells("Spending"),
            "revenue": cells("Revenue"),
        },
        "characters": {"spending": characters("Spending"), "revenue": characters("Revenue")},
        "program_strip": program_strip,
        "funds": {"spending": funds("Spending"), "revenue": funds("Revenue")},
        "notes": (
            "display_name and gloss fields are a provenance-flagged "
            "IN-SESSION enrichment layer (seed_us_sf_dept_names, "
            "seed_us_sf_character_glosses, 2026-07-16) — source labels are "
            "always carried verbatim alongside and never overwritten. "
            "Departments with a null display_name (legacy years) render "
            "their source label."
        ),
    }


def build_bva_departments(rows: list[dict]) -> dict:
    ref = rows[0]
    fiscal_years = sorted({int(r["fiscal_year"]) for r in rows})

    def dept_rows(fy: int, side: str) -> list[dict]:
        out = []
        for r in rows:
            if int(r["fiscal_year"]) != fy or r["side"] != side:
                continue
            out.append({
                "code": r["department_code"],
                "label": r["department"],
                "display_name": r["department_display_name"],
                "org_group_code": r["organization_group_code"],
                "budget_usd": _f(r["budget_operating_usd"], 2),
                "actual_usd": _f(r["actual_operating_usd"], 2),
                "residual_usd": _f(r["residual_usd"], 2),
                "residual_pct": _f(r["residual_pct"], 6),
                "is_comparable": bool(r["is_comparable"]),
                "is_structural_outlier": bool(r["is_structural_outlier"]),
                "outlier_note": r["outlier_note"],
            })
        out.sort(key=lambda d: -(d["budget_usd"] or 0))
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
        "perimeter": (
            "The measured honest comparison (mart_us_sf_budget_vs_actual, "
            "2026-07-16): fund_category='Operating' on BOTH sides, "
            "related-government-unit rows excluded from actuals, ALL "
            "transfer characters excluded from both sides. Departments sum "
            "back to the citywide operating pair exactly (dbt-tested)."
        ),
        "coverage": {
            "fiscal_years": fiscal_years,
            "note": (
                "CLOSED fiscal years only (execution_status='closed' — the "
                "most recently ended year is still in its accounting close "
                "and is not shown at department grain). Department series "
                "start FY2019: department codes changed at the FY2018 "
                "chart-of-accounts break and pre-break series need a "
                "crosswalk that does not exist yet."
            ),
        },
        "structural_outliers_note": (
            "GEN and PUC rows carry is_structural_outlier=true with a "
            "measured explanation: their large deviations are perimeter "
            "artifacts (citywide unallocated bucket / fund structure), not "
            "execution stories. Render the annotation or exclude them — "
            "never rank them bare."
        ),
        "years": {
            str(fy): {
                "spending": dept_rows(fy, "Spending"),
                "revenue": dept_rows(fy, "Revenue"),
            }
            for fy in fiscal_years
        },
    }


DETAIL_TOP_VENDORS = 15  # matches mart_us_sf_vouchers_dept_character's rank_in_cell cut


def build_budget_dept_detail(
    fy: int,
    object_rows: list[dict],
    voucher_rows: list[dict],
) -> dict:
    """One fiscal year's dept×character DETAIL payload — the third drill
    level below the department fiche (dept → character → this). Two
    source-distinct blocks per cell, never blended into one number:
      - objects:  raw budget line items (same adopted-budget dataset as
        the rest of the page) — cryptic by design (no gloss enrichment),
        rendered as an expandable "line items" list, never ranked.
      - payments: vendor payments (vouchers dataset) that funded this
        dept×character slice — the honest floor of the drill. Only
        populated where the mart found matching vouchers (Spending-side
        characters only; revenue cells never have a payments block).
    """
    cells: dict[str, dict] = {}

    for r in object_rows:
        if int(r["fiscal_year"]) != fy:
            continue
        key = f"{r['department_code']}|{r['character_code']}"
        cell = cells.setdefault(key, {"side": r["side"], "objects": [], "payments": None})
        cell["objects"].append({
            "code": r["object_code"],
            "label": r["object"],
            "amount_usd": _f(r["amount_usd"], 2),
            "is_transfer_adjustment": bool(r["is_transfer_adjustment"]),
        })

    for rows in cells.values():
        rows["objects"].sort(key=lambda o: -abs(o["amount_usd"]))

    by_cell_vendors: dict[str, list[dict]] = {}
    for r in voucher_rows:
        if int(r["fiscal_year"]) != fy:
            continue
        key = f"{r['department_code']}|{r['character_code']}"
        by_cell_vendors.setdefault(key, []).append(r)

    for key, vendor_rows in by_cell_vendors.items():
        vendor_rows.sort(key=lambda v: int(v["rank_in_cell"]))
        ref = vendor_rows[0]
        kept_usd = sum(float(v["vouchers_paid_usd"]) for v in vendor_rows)
        cell_total = float(ref["cell_total_usd"])
        cell_n = int(ref["cell_n_vendors"])
        payments = {
            "total_usd": _f(cell_total, 2),
            "n_vendors": cell_n,
            "vendors": [
                {
                    "vendor": v["vendor"],
                    "amount_usd": _f(v["vouchers_paid_usd"], 2),
                    "n_vouchers": int(v["n_vouchers"]),
                    "is_non_profit": bool(v["is_non_profit"]),
                    "is_related_govt_unit": bool(v["is_related_govt_unit"]),
                    "bucket": v["bucket"],
                    "is_aggregation_line": bool(v["is_aggregation_line"]),
                }
                for v in vendor_rows
            ],
            "other_vendors_usd": _f(max(0.0, cell_total - kept_usd), 2),
            "other_vendors_n": max(0, cell_n - len(vendor_rows)),
            "execution_status": ref["execution_status"],
        }
        cell = cells.setdefault(key, {"side": "Spending", "objects": [], "payments": None})
        cell["payments"] = payments

    budget_source = None
    if object_rows:
        ref = object_rows[0]
        budget_source = {"source_url": ref["source_url"], "rows_updated_at": _ts(ref["source_rows_updated_at"])}
    vouchers_source = source_block(voucher_rows[0], prefix="source_") if voucher_rows else None

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "us",
        "scale": "city",
        "place": "sf",
        "unit": "USD",
        "fiscal_year": fy,
        "budget_source": budget_source,
        "vouchers_source": vouchers_source,
        "notes": (
            "Two source-distinct blocks per dept×character cell, never "
            "blended: `objects` is raw adopted-budget line detail (no "
            "gloss enrichment — object labels are ~25-50% plain-English, "
            "shown as-is, never ranked as a headline section). `payments` "
            "is vendor payments from the vouchers dataset that funded this "
            "same dept×character slice (measured 90.3% dollar match "
            "against nonzero budget, 2026-07-16) — null where no voucher "
            "activity exists for the cell (Salaries/Fringe/inter-"
            "departmental-services characters structurally have none)."
        ),
        "cells": cells,
    }


def build_index(budget: dict, payees: dict, search: dict, bva: dict,
                breakdowns: dict[int, dict], bva_dept: dict,
                dept_details: dict[int, dict]) -> dict:
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
            "budget_breakdown_{fy}.json": {
                "description": (
                    "Per-fiscal-year budget breakdown: org groups, "
                    "departments, dept × character cells, characters "
                    "(with glosses), program strip, funds"
                ),
                "fiscal_years": sorted(breakdowns.keys()),
                "execution_status": {
                    str(fy): b["execution_status"] for fy, b in sorted(breakdowns.items())
                },
                "as_of": budget["as_of"],
                "source_url": budget["source"]["source_url"],
            },
            "budget_dept_detail_{fy}.json": {
                "description": (
                    "Per-fiscal-year dept × character DETAIL — the third "
                    "drill level (dept → character → this): raw object-"
                    "level budget line items + vendor payments (vouchers) "
                    "matched to the same cell, lazily read server-side "
                    "when a department fiche is requested"
                ),
                "fiscal_years": sorted(dept_details.keys()),
                "as_of": budget["as_of"],
                "source_urls": sorted({budget["source"]["source_url"]} | {
                    d["vouchers_source"]["source_url"]
                    for d in dept_details.values() if d["vouchers_source"]
                }),
            },
            "budget_vs_actual_departments.json": {
                "description": (
                    "Department-level budget vs actual, Operating perimeter, "
                    "closed fiscal years FY2019+, GEN/PUC annotated"
                ),
                "as_of": bva_dept["as_of"],
                "source_urls": sorted({
                    bva_dept["sources"]["budget"]["source_url"],
                    bva_dept["sources"]["actuals"]["source_url"],
                }),
            },
        },
        "population_source_url": budget["population"]["source_url"],
    }


def write_json(payload: dict, filename: str, log: Logger, directory: Path | None = None) -> None:
    target_dir = directory or OUTPUT_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    output_file = target_dir / filename
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

    log.section("mart_us_sf_spending_subobjects")
    subobj_rows = fetch_rows(
        client, "mart_us_sf_spending_subobjects", "fiscal_year, paid_usd DESC"
    )
    log.info("rows", extra=f"subobjects={len(subobj_rows)}")
    spending_subobjects = build_spending_subobjects(subobj_rows)

    log.section("mart_us_sf_payees_search")
    search_rows = fetch_rows(client, "mart_us_sf_payees_search", "total_usd DESC")
    log.info("rows", extra=str(len(search_rows)))
    search = build_payees_search(search_rows)

    log.section("mart_us_sf_payment_breakdowns")
    breakdown_rows = fetch_rows(
        client, "mart_us_sf_payment_breakdowns", "fiscal_year, dimension, rank_in_dimension"
    )
    log.info("rows", extra=str(len(breakdown_rows)))
    payment_breakdowns = build_payment_breakdowns(breakdown_rows)

    log.section("mart_us_sf_payee_profile")
    profile_rows = fetch_rows(client, "mart_us_sf_payee_profile", "total_paid_usd DESC")
    log.info("rows", extra=str(len(profile_rows)))
    payee_profiles = build_payee_profiles(profile_rows)

    log.section("mart_us_sf_budget_vs_actual")
    bva_rows = fetch_rows(client, "mart_us_sf_budget_vs_actual", "side, fiscal_year")
    log.info("rows", extra=str(len(bva_rows)))
    bva = build_budget_vs_actual(bva_rows)

    log.section("Block 1 — breakdown marts")
    og_fy = _by_fy(fetch_rows(client, "mart_us_sf_budget_org_group", "fiscal_year, side"))
    dept_fy = _by_fy(fetch_rows(client, "mart_us_sf_budget_dept", "fiscal_year, side"))
    cell_fy = _by_fy(fetch_rows(client, "mart_us_sf_budget_dept_character", "fiscal_year, side"))
    char_fy = _by_fy(fetch_rows(client, "mart_us_sf_budget_character", "fiscal_year, side"))
    prog_fy = _by_fy(fetch_rows(client, "mart_us_sf_budget_program", "fiscal_year, side"))
    fund_fy = _by_fy(fetch_rows(client, "mart_us_sf_budget_fund", "fiscal_year, side"))
    by_year_fy = _by_fy(budget_rows)
    log.info("cells (all FY)", extra=str(sum(len(v) for v in cell_fy.values())))

    breakdowns: dict[int, dict] = {}
    for fy in sorted(by_year_fy.keys()):
        breakdowns[fy] = build_budget_breakdown(
            fy,
            by_year_fy[fy],
            og_fy.get(fy, []),
            dept_fy.get(fy, []),
            cell_fy.get(fy, []),
            char_fy.get(fy, []),
            prog_fy.get(fy, []),
            fund_fy.get(fy, []),
        )

    log.section("mart_us_sf_budget_vs_actual_dept")
    bva_dept_rows = fetch_rows(
        client, "mart_us_sf_budget_vs_actual_dept", "fiscal_year, side, department_code"
    )
    log.info("rows", extra=str(len(bva_dept_rows)))
    bva_dept = build_bva_departments(bva_dept_rows)

    log.section("Block 2 — dept×character DETAIL (objects + vendor payments)")
    object_rows = fetch_rows(
        client, "mart_us_sf_budget_dept_character_object",
        "fiscal_year, side, department_code, character_code",
    )
    voucher_cell_rows = fetch_rows(
        client, "mart_us_sf_vouchers_dept_character",
        "fiscal_year, department_code, character_code, rank_in_cell",
    )
    log.info("rows", extra=f"objects={len(object_rows)} vendor_cells={len(voucher_cell_rows)}")
    detail_fys = sorted({int(r["fiscal_year"]) for r in object_rows} | {int(r["fiscal_year"]) for r in voucher_cell_rows})
    dept_details: dict[int, dict] = {
        fy: build_budget_dept_detail(fy, object_rows, voucher_cell_rows) for fy in detail_fys
    }

    log.section("Écriture")
    write_json(budget, "budget_by_year.json", log)
    write_json(payees, "top_payees.json", log)
    write_json(search, "payees_search.json", log)
    write_json(payment_breakdowns, "payment_breakdowns.json", log)
    write_json(payee_profiles, "payee_profiles.json", log, directory=CACHE_DIR)
    write_json(spending_subobjects, "spending_subobjects.json", log)
    write_json(bva, "budget_vs_actual.json", log)
    for fy, payload in sorted(breakdowns.items()):
        write_json(payload, f"budget_breakdown_{fy}.json", log)
    for fy, payload in sorted(dept_details.items()):
        write_json(payload, f"budget_dept_detail_{fy}.json", log)
    write_json(bva_dept, "budget_vs_actual_departments.json", log)
    write_json(
        build_index(budget, payees, search, bva, breakdowns, bva_dept, dept_details),
        "index.json", log,
    )

    log.section("Sanity check (acceptance anchors)")
    sp = {p["fiscal_year"]: p["total_usd"] for p in budget["sides"]["spending"]["points"]}
    log.info("budget FY2025 Spending", extra=f"${sp.get(2025, 0):,.0f}")
    log.info("budget FY2026 Spending", extra=f"${sp.get(2026, 0):,.0f}")
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

