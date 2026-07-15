#!/usr/bin/env python3
"""
Export US national data from BigQuery (dbt_us_marts) to JSON.

Outputs (website/public/data/us/national/):
    - daily_bread.json : latest closed MTS month — receipts by source +
      outlays by function, current month + FYTD + prior FYTD, per-resident
      scaling, budget balance. Source: mart_us_daily_bread.
    - debt_series.json : public debt — annual FY-end series 1790+,
      month-end series 1993+, latest daily observation, per-resident.
      Source: mart_us_debt_series.
    - index.json       : file manifest + shared provenance.

Data contract (ADR-0010 D2, inherited from the France national exports):
every file carries generated_at + source_pipeline; every block carries
source/source_url (fiscaldata.treasury.gov dataset page + exact API
endpoint, Census source for population), as_of and a period-completeness
flag; units documented in the JSON. No hardcoded numbers — everything
flows from BigQuery (which the dbt tests tie back to the published MTS
totals) or from cited sync configs.

Usage:
    python pipeline/scripts/export/export_us_national.py

Prérequis:
    - Google Cloud credentials configurées
    - dbt run --select path:models/us --target prod
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
OUTPUT_DIR = Path(__file__).parent.parent.parent.parent / "website" / "public" / "data" / "us" / "national"

SOURCE_PIPELINE = (
    "configs/countries/us.yaml → sync_fiscaldata.py + sync_census_popest.py → "
    "raw.us_* → dbt_us_staging → dbt_us_analytics → dbt_us_marts → "
    "export_us_national.py"
)

FISCAL_YEAR_MONTHS = 12


def _f(value, ndigits=None):
    """Decimal/None → float (rounded if asked)."""
    if value is None:
        return None
    out = float(value)
    return round(out, ndigits) if ndigits is not None else out


def fetch_daily_bread(client: bigquery.Client) -> list[dict]:
    query = f"""
    SELECT *
    FROM `{PROJECT_ID}.{DATASET}.mart_us_daily_bread`
    ORDER BY side, row_type, current_fytd_amt DESC
    """
    return [dict(row) for row in client.query(query).result()]


def fetch_debt_series(client: bigquery.Client) -> list[dict]:
    query = f"""
    SELECT *
    FROM `{PROJECT_ID}.{DATASET}.mart_us_debt_series`
    ORDER BY series, record_date
    """
    return [dict(row) for row in client.query(query).result()]


def build_side(rows: list[dict], side: str) -> dict:
    """Build the receipts/outlays block: published total + detail items."""
    details = [r for r in rows if r["side"] == side and r["row_type"] == "detail"]
    totals = [r for r in rows if r["side"] == side and r["row_type"] == "total"]
    if len(totals) != 1:
        raise RuntimeError(f"expected exactly 1 total row for side={side}, got {len(totals)}")
    total = totals[0]

    # Self-check (the dbt identity tests already tie Σ(detail) to the
    # published MTS T-rows; verify the mart arithmetic once more on export).
    sum_fytd = sum(float(r["current_fytd_amt"]) for r in details)
    if abs(sum_fytd - float(total["current_fytd_amt"])) > 0.02:
        raise RuntimeError(
            f"{side}: Σ(detail FYTD) {sum_fytd} != total row {total['current_fytd_amt']}"
        )

    items = [
        {
            "category": r["category"],
            "line_code_nbr": r["line_code_nbr"],
            "current_month_usd": _f(r["current_month_amt"]),
            "current_fytd_usd": _f(r["current_fytd_amt"]),
            "prior_fytd_usd": _f(r["prior_fytd_amt"]),
            "share_of_side_fytd": _f(r["share_of_side_fytd"], 6),
            "yoy_fytd_pct": _f(r["yoy_fytd_pct"], 6),
            "per_resident_fytd_usd": _f(r["per_resident_fytd_usd"], 2),
            "per_resident_month_usd": _f(r["per_resident_month_usd"], 2),
        }
        for r in sorted(details, key=lambda r: -float(r["current_fytd_amt"]))
    ]

    return {
        "total": {
            "current_month_usd": _f(total["current_month_amt"]),
            "current_fytd_usd": _f(total["current_fytd_amt"]),
            "prior_fytd_usd": _f(total["prior_fytd_amt"]),
            "yoy_fytd_pct": _f(total["yoy_fytd_pct"], 6),
            "per_resident_fytd_usd": _f(total["per_resident_fytd_usd"], 2),
            "per_resident_month_usd": _f(total["per_resident_month_usd"], 2),
        },
        "items": items,
        "n_items": len(items),
    }


def build_daily_bread(rows: list[dict]) -> dict:
    ref = rows[0]  # provenance/population/as_of columns repeat on every row
    record_date = ref["record_date"]
    months_in = int(ref["months_into_fiscal_year"])
    fiscal_year = int(ref["fiscal_year"])

    receipts = build_side(rows, "receipts")
    outlays = build_side(rows, "outlays")
    balance_fytd = receipts["total"]["current_fytd_usd"] - outlays["total"]["current_fytd_usd"]
    balance_month = receipts["total"]["current_month_usd"] - outlays["total"]["current_month_usd"]

    fy_start_year = fiscal_year - 1  # FY2026 starts October 2025

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "us",
        "scale": "national",
        "unit": "USD",
        "accounting_basis": (
            "Federal cash receipts and outlays (Monthly Treasury Statement — "
            "the official deficit math). Not comparable with USAspending "
            "obligations."
        ),
        "as_of": record_date.isoformat(),
        "fiscal_year": fiscal_year,
        "completeness": {
            "fytd_through": record_date.isoformat(),
            "months_into_fiscal_year": months_in,
            "fiscal_year_months": FISCAL_YEAR_MONTHS,
            "fiscal_year_complete": months_in == FISCAL_YEAR_MONTHS,
            "note": (
                f"FYTD figures cover October {fy_start_year} through "
                f"{record_date.strftime('%B %Y')} — month {months_in} of "
                f"{FISCAL_YEAR_MONTHS} of fiscal year {fiscal_year}. "
                "prior_fytd = same window one fiscal year earlier. "
                "Each MTS publication restates prior months; this export "
                "always reflects the latest publication."
            ),
        },
        "source": {
            "name": ref["source_name"],
            "table": ref["source_table"],
            "source_url": ref["source_url"],
            "api_endpoint": ref["source_api_endpoint"],
            "update_frequency": ref["source_update_frequency"],
        },
        "population": {
            "value": int(ref["population"]),
            "year": int(ref["population_year"]),
            "as_of": ref["population_as_of"].isoformat(),
            "source": ref["population_source"],
            "source_url": ref["population_source_url"],
            "note": "Denominator for all per_resident_* values.",
        },
        "receipts": receipts,
        "outlays": outlays,
        "budget_balance": {
            "current_fytd_usd": round(balance_fytd, 2),
            "current_month_usd": round(balance_month, 2),
            "sign_convention": (
                "receipts − outlays: surplus positive, deficit negative "
                "(matches the MTS 'Total Surplus (+) or Deficit (-)' line)."
            ),
        },
    }


def build_debt_series(rows: list[dict], population_block: dict) -> dict:
    def provenance(row: dict) -> dict:
        return {
            "name": row["source_name"],
            "source_url": row["source_url"],
            "api_endpoint": row["source_api_endpoint"],
            "update_frequency": row["source_update_frequency"],
        }

    annual = [r for r in rows if r["series"] == "annual_fy_end"]
    month_end = [r for r in rows if r["series"] == "month_end"]
    latest_rows = [r for r in rows if r["series"] == "latest"]
    if len(latest_rows) != 1:
        raise RuntimeError(f"expected exactly 1 'latest' row, got {len(latest_rows)}")
    latest = latest_rows[0]

    population = population_block["value"]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "us",
        "scale": "national",
        "unit": "USD",
        "as_of": latest["record_date"].isoformat(),
        "latest": {
            "record_date": latest["record_date"].isoformat(),
            "tot_pub_debt_out_usd": _f(latest["tot_pub_debt_out_amt"]),
            "debt_held_public_usd": _f(latest["debt_held_public_amt"]),
            "intragov_hold_usd": _f(latest["intragov_hold_amt"]),
            "per_resident_usd": round(float(latest["tot_pub_debt_out_amt"]) / population, 2),
            "source": provenance(latest),
        },
        "population": population_block,
        "series": {
            "annual_fy_end": {
                "description": (
                    "Total public debt outstanding at each fiscal-year end "
                    "since 1790 (Historical Debt Outstanding). No "
                    "public/intragov breakout in this dataset."
                ),
                "source": provenance(annual[0]),
                "n_points": len(annual),
                "points": [
                    {
                        "record_date": r["record_date"].isoformat(),
                        "fiscal_year": int(r["fiscal_year"]) if r["fiscal_year"] is not None else None,
                        "tot_pub_debt_out_usd": _f(r["tot_pub_debt_out_amt"]),
                    }
                    for r in annual
                ],
            },
            "month_end": {
                "description": (
                    "Total public debt outstanding at the last business day "
                    "of each month since 1993-04 (Debt to the Penny, "
                    "downsampled from daily)."
                ),
                "source": provenance(month_end[0]),
                "n_points": len(month_end),
                "points": [
                    {
                        "record_date": r["record_date"].isoformat(),
                        "tot_pub_debt_out_usd": _f(r["tot_pub_debt_out_amt"]),
                        "debt_held_public_usd": _f(r["debt_held_public_amt"]),
                        "intragov_hold_usd": _f(r["intragov_hold_amt"]),
                    }
                    for r in month_end
                ],
            },
        },
        "notes": (
            "The annual (Historical Debt Outstanding) and daily-based (Debt "
            "to the Penny) series treat Federal Financing Bank debt "
            "differently per the datasets' published notes — do not splice "
            "them into a single continuous line."
        ),
    }


def build_index(daily_bread: dict, debt: dict) -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "us",
        "scale": "national",
        "files": {
            "daily_bread.json": {
                "description": (
                    "Receipts by source + outlays by function, latest closed "
                    "MTS month (current month, FYTD, prior FYTD, per resident)"
                ),
                "as_of": daily_bread["as_of"],
                "fiscal_year": daily_bread["fiscal_year"],
                "completeness": daily_bread["completeness"],
                "source_url": daily_bread["source"]["source_url"],
            },
            "debt_series.json": {
                "description": (
                    "Public debt outstanding — annual FY-end 1790+, month-end "
                    "1993+, latest daily observation"
                ),
                "as_of": debt["as_of"],
                "source_urls": sorted({
                    debt["latest"]["source"]["source_url"],
                    debt["series"]["annual_fy_end"]["source"]["source_url"],
                }),
            },
        },
        "population_source_url": daily_bread["population"]["source_url"],
    }


def write_json(payload: dict, filename: str, log: Logger) -> None:
    output_file = OUTPUT_DIR / filename
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    size_kb = output_file.stat().st_size / 1024
    log.success(f"wrote {filename}", extra=f"{size_kb:.1f} KB")


def main() -> int:
    log = Logger("export_us_national")
    log.header("Export US national (daily bread + debt) → JSON")

    log.info("output dir", extra=str(OUTPUT_DIR))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    log.section("Connexion BigQuery")
    client = bigquery.Client(project=PROJECT_ID)
    log.success("connecté", extra=f"{PROJECT_ID}.{DATASET}")

    log.section("mart_us_daily_bread")
    db_rows = fetch_daily_bread(client)
    log.info("rows", extra=str(len(db_rows)))
    daily_bread = build_daily_bread(db_rows)

    log.section("mart_us_debt_series")
    debt_rows = fetch_debt_series(client)
    log.info("rows", extra=str(len(debt_rows)))
    debt = build_debt_series(debt_rows, daily_bread["population"])

    log.section("Écriture")
    write_json(daily_bread, "daily_bread.json", log)
    write_json(debt, "debt_series.json", log)
    write_json(build_index(daily_bread, debt), "index.json", log)

    log.section("Sanity check")
    log.info("as_of (MTS)", extra=daily_bread["as_of"])
    log.info(
        "FYTD receipts",
        extra=f"${daily_bread['receipts']['total']['current_fytd_usd']:,.2f} "
              f"({daily_bread['receipts']['n_items']} sources)",
    )
    log.info(
        "FYTD outlays",
        extra=f"${daily_bread['outlays']['total']['current_fytd_usd']:,.2f} "
              f"({daily_bread['outlays']['n_items']} functions)",
    )
    log.info(
        "FYTD balance",
        extra=f"${daily_bread['budget_balance']['current_fytd_usd']:,.2f}",
    )
    log.info(
        "debt latest",
        extra=f"${debt['latest']['tot_pub_debt_out_usd']:,.2f} on {debt['latest']['record_date']} "
              f"(${debt['latest']['per_resident_usd']:,.2f}/resident)",
    )
    log.info(
        "population",
        extra=f"{daily_bread['population']['value']:,} ({daily_bread['population']['year']})",
    )
    log.summary()
    return 0


if __name__ == "__main__":
    sys.exit(main())
