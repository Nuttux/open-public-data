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
    - budget_breakdown_{fy}.json (one file per fiscal year, Paris per-year
      pattern — the year selector swaps the fetch): org-group totals (7),
      departments (net + per-dept transfer-adjustment lines), dept ×
      character cells (the fiche altitude), character totals with in-session
      glosses, the operating/capital/admin program strip (modern years),
      and the fund type × category block. Carries execution_status
      (closed / recently_closed_preliminary / in_progress / adopted_only)
      — NEVER the calendar completeness boolean (SF-BUILD-PLAN cross-
      cutting rule 2). FY2018 ships org-group + fund blocks only
      (drill.available = false): that year mixes two chart-of-accounts
      systems. Sources: mart_us_sf_budget_{org_group,dept,dept_character,
      character,program,fund}.
    - budget_vs_actual_departments.json: department-level budget vs actual
      on the measured honest perimeter (Operating funds, no related govt
      units, no transfer characters), CLOSED fiscal years FY2019+ only,
      with GEN/PUC structural-outlier annotations (seeded, measured).
      Source: mart_us_sf_budget_vs_actual_dept.
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


# ─── Block 1: per-year budget breakdown ──────────────────────────────────────

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


def build_index(budget: dict, payees: dict, bva: dict,
                breakdowns: dict[int, dict], bva_dept: dict) -> dict:
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

    log.section("Écriture")
    write_json(budget, "budget_by_year.json", log)
    write_json(payees, "top_payees.json", log)
    write_json(bva, "budget_vs_actual.json", log)
    for fy, payload in sorted(breakdowns.items()):
        write_json(payload, f"budget_breakdown_{fy}.json", log)
    write_json(bva_dept, "budget_vs_actual_departments.json", log)
    write_json(build_index(budget, payees, bva, breakdowns, bva_dept), "index.json", log)

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
    bd26 = breakdowns.get(2026, {})
    log.info(
        "breakdown FY2026",
        extra=(
            f"status={bd26.get('execution_status')} · "
            f"depts={len(bd26.get('departments', {}).get('spending', []))} · "
            f"cells={len(bd26.get('dept_characters', {}).get('spending', []))}"
        ),
    )
    bd18 = breakdowns.get(2018, {})
    log.info("breakdown FY2018 drill", extra=str(bd18.get("drill", {}).get("available")))
    fy24 = bva_dept.get("years", {}).get("2024", {}).get("spending", [])
    dph = next((d for d in fy24 if d["code"] == "DPH"), None)
    if dph:
        log.info("bva FY2024 DPH residual", extra=f"{dph['residual_pct']:+.3f}")
    log.summary()
    return 0


if __name__ == "__main__":
    sys.exit(main())
