#!/usr/bin/env python3
"""
Export US San Francisco payroll data from BigQuery (dbt_us_marts) to JSON.

Outputs (website/public/data/us/sf/):
    - payroll_by_year.json        : citywide comp per FY 2013-2025 —
      components, headcount, exact median, OT-exceeds-salary counters
      (documented $1k floor), per-resident on Census years.
      Source: mart_us_sf_comp_by_year.
    - payroll_by_dept_year.json   : department series keyed on
      department_code (labels break at FY2017 — study §5) with canonical
      labels + per-year org-group rollups COMPUTED FROM THE PUBLISHED
      ROWS (dial B: sub-5 department-years fold into citywide totals and
      are never listed, so org totals must come from listed rows only).
      Source: mart_us_sf_payroll_by_dept_year.
    - payroll_by_family_year.json : the drill grain (dept × job family ×
      year) with the n≥5 rule + visible per-dept "Other roles" pooling
      applied in the mart. Source: mart_us_sf_payroll_by_family_year.
    - payroll_distribution.json   : exact percentiles p25-p99 (p10
      deliberately dropped — part-timer pollution), threshold counts,
      $25k histogram with sub-5 top-tail buckets merged into an open
      bucket at export time. Source: mart_us_sf_payroll_distribution.
    - payroll_overtime.json       : citywide OT series 2013+, the
      OT>salary counter series (naive + floored), dept OT series 2017+
      (label-clean window per the study) and top OT titles (latest FY,
      every title ≥100 employees). Sources: mart_us_sf_comp_by_year,
      mart_us_sf_payroll_by_dept_year, mart_us_sf_payroll_ot_titles.

PRIVACY (dial B, approved): suppression is applied in the marts and
re-applied here (histogram tail merge); scripts/validate/
validate_us_sf_payroll_exports.py re-checks every written file — no
dollar aggregate in any export may cover fewer than 5 employees.
Citywide COUNT-ONLY threshold counts (e.g. "1 employee above $400k in
FY2013") are published exactly; they attach no dollar amount. Row-level
data never leaves BigQuery.

Data contract (ADR-0010 D2): every file carries generated_at +
source_pipeline; every block carries source/source_url (from the synced
Socrata catalog — never hardcoded), as_of and units.

Usage:
    python pipeline/scripts/export/export_us_sf_payroll.py

Prérequis:
    - Google Cloud credentials configurées
    - dbt build --target prod --select +<payroll marts>
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
    "raw.us_sf_employee_comp → dbt_us_staging (+ seeds "
    "seed_us_sf_job_family_display / seed_us_sf_job_reclass) → "
    "dbt_us_intermediate → dbt_us_analytics → dbt_us_marts → "
    "export_us_sf_payroll.py"
)

# Departments carried as named overtime series: top N by latest-FY OT.
OVERTIME_TOP_DEPTS = 8
# Dept OT series start (the study's label-clean window; the dept file
# itself carries all years, keyed on codes).
OVERTIME_DEPT_SERIES_FROM = 2017
PUBLICATION_THRESHOLD = 5


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


def source_block(ref: dict) -> dict:
    return {
        "name": ref["source_name"],
        "dataset_id": ref["source_dataset_id"],
        "source_url": ref["source_url"],
        "attribution": ref["source_attribution"],
        "rows_updated_at": _ts(ref["source_rows_updated_at"]),
    }


def base_payload(ref: dict) -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_pipeline": SOURCE_PIPELINE,
        "country": "us",
        "scale": "city",
        "place": "sf",
        "unit": "USD",
        "as_of": _ts(ref["source_rows_updated_at"]),
        "source": source_block(ref),
        "fiscal_year_note": (
            "SF fiscal year N runs July 1 (N-1) to June 30 N. All figures "
            "are FISCAL-year accounting only — the source publishes every "
            "row under BOTH Calendar and Fiscal accountings and mixing "
            "them double-counts (the dataset's #1 trap)."
        ),
    }


def privacy_block() -> dict:
    return {
        "rule": (
            f"No dollar aggregate in this file covers fewer than "
            f"{PUBLICATION_THRESHOLD} employees. Groups under "
            f"{PUBLICATION_THRESHOLD} people are pooled into visible "
            "'Other roles' rows per department; pools that would "
            "themselves stay under the threshold are folded into the "
            "department total with no row. Departments under the "
            "threshold (the Law Library in practice, 2-3 people) are "
            "included in citywide totals but not listed."
        ),
        "measured_cost": (
            "Pooling moves ~1.2% of total dollars into visible 'Other "
            "roles' rows; the department-level fold is under $600k/year "
            "(<0.01% of compensation). Nothing is removed from totals."
        ),
        "count_only_disclosures": (
            "Counts of employees above fixed thresholds (>$200k…>$500k) "
            "are published exactly, including values under "
            f"{PUBLICATION_THRESHOLD}: they attach no dollar amount to "
            "any group. The source itself is public at row level "
            "(pseudonymized); this site publishes aggregates only."
        ),
    }


# ─────────────────────────────────────────────────────────────── by_year ──


def build_by_year(rows: list[dict]) -> dict:
    ref = rows[0]
    points = [
        {
            "fiscal_year": int(r["fiscal_year"]),
            "salaries_usd": _f(r["salaries_usd"], 2),
            "overtime_usd": _f(r["overtime_usd"], 2),
            "other_salaries_usd": _f(r["other_salaries_usd"], 2),
            "total_salary_usd": _f(r["total_salary_usd"], 2),
            "retirement_usd": _f(r["retirement_usd"], 2),
            "health_and_dental_usd": _f(r["health_and_dental_usd"], 2),
            "other_benefits_usd": _f(r["other_benefits_usd"], 2),
            "total_benefits_usd": _f(r["total_benefits_usd"], 2),
            "total_compensation_usd": _f(r["total_compensation_usd"], 2),
            "ot_share_of_comp": _f(r["ot_share_of_comp"], 6),
            "n_employees": int(r["n_employees"]),
            "avg_total_comp_usd": _f(r["avg_total_comp_usd"], 2),
            "median_total_comp_usd": _f(r["median_total_comp_usd"], 2),
            "per_resident_usd": _f(r["per_resident_usd"], 2),
            "employees_per_1k_residents": _f(r["employees_per_1k_residents"], 2),
            "population": int(r["population"]) if r["population"] is not None else None,
            "population_year": int(r["population_year"]) if r["population_year"] is not None else None,
        }
        for r in rows
    ]

    with_pop = [r for r in rows if r.get("population") is not None]
    latest_pop = max(with_pop, key=lambda r: r["population_year"]) if with_pop else None

    return {
        **base_payload(ref),
        "perimeter": (
            "Every City and County of San Francisco employee paid through "
            "the Controller's payroll in the fiscal year — including "
            "part-year and part-time staff (headcount, NOT full-time "
            "equivalents). Compensation = salaries + overtime + other "
            "salaries + benefits (retirement, health & dental, other)."
        ),
        "median_note": (
            "median/avg are per-person annual totals (an employee's rows "
            "are summed across jobs and departments first). The median is "
            "exact, not an approximation."
        ),
        "ot_counter_note": (
            "n_ot_exceeds_salary_floored counts employees whose overtime "
            "pay exceeded their base salary, requiring salary > "
            f"${int(rows[-1]['ot_salary_floor_usd']):,}. Without the floor "
            "(n_ot_exceeds_salary_naive), FY2019 shows a spike that is an "
            "artifact of job-change rows carrying near-zero salaries."
        ),
        "ot_salary_floor_usd": int(rows[-1]["ot_salary_floor_usd"]),
        "population": {
            "value": int(latest_pop["population"]) if latest_pop else None,
            "year": int(latest_pop["population_year"]) if latest_pop else None,
            "as_of": _ts(latest_pop["population_as_of"]) if latest_pop else None,
            "source": latest_pop["population_source"] if latest_pop else None,
            "source_url": latest_pop["population_source_url"] if latest_pop else None,
            "note": (
                "July 1 Census estimate. per_resident_usd values exist "
                "only for fiscal years with a Vintage 2025 estimate "
                "(2020-2025); SF fiscal year N ends June 30 of year N."
            ),
        },
        "privacy": privacy_block(),
        "points": points,
        "n_points": len(points),
    }


# ────────────────────────────────────────────────────────── by_dept_year ──


def build_by_dept_year(rows: list[dict], by_year: dict) -> dict:
    ref = rows[0]

    depts: dict[str, dict] = {}
    for r in rows:
        code = r["department_code"]
        d = depts.setdefault(code, {
            "department_code": code,
            "department": r["department"],
            "organization_group_code": r["organization_group_code"],
            "organization_group": r["organization_group"],
            "series": [],
        })
        d["series"].append({
            "fiscal_year": int(r["fiscal_year"]),
            "total_compensation_usd": _f(r["total_compensation_usd"], 2),
            "salaries_usd": _f(r["salaries_usd"], 2),
            "overtime_usd": _f(r["overtime_usd"], 2),
            "other_salaries_usd": _f(r["other_salaries_usd"], 2),
            "total_benefits_usd": _f(r["total_benefits_usd"], 2),
            "ot_share_of_comp": _f(r["ot_share_of_comp"], 6),
            "n_employees": int(r["n_employees"]),
            "median_total_comp_usd": _f(r["median_total_comp_usd"], 2),
        })

    # Org-group rollups per year, computed FROM the published rows so the
    # sub-threshold fold can never be recovered by subtraction.
    org_groups: dict[str, dict] = {}
    for r in rows:
        og = r["organization_group_code"]
        g = org_groups.setdefault(og, {
            "organization_group_code": og,
            "organization_group": r["organization_group"],
            "years": {},
        })
        fy = str(int(r["fiscal_year"]))
        y = g["years"].setdefault(fy, {
            "total_compensation_usd": 0.0,
            "overtime_usd": 0.0,
            "n_employees_listed": 0,
            "n_departments": 0,
        })
        y["total_compensation_usd"] = round(
            y["total_compensation_usd"] + float(r["total_compensation_usd"]), 2)
        y["overtime_usd"] = round(y["overtime_usd"] + float(r["overtime_usd"]), 2)
        y["n_employees_listed"] += int(r["n_employees"])
        y["n_departments"] += 1

    return {
        **base_payload(ref),
        "keying_note": (
            "Series are keyed on department_code with the code's most "
            "recent label: department LABELS change format at FY2017 "
            "('POL Police' → 'Police') and several departments were "
            "reorganized — codes are stable across all 13 years, labels "
            "are not."
        ),
        "fold_note": (
            "Department-years with fewer than 5 employees are included "
            "in citywide totals (payroll_by_year.json) but not listed "
            "here; organization-group rollups are computed from the "
            "listed rows only. n_employees_listed sums per-department "
            "headcounts — an employee working in two departments counts "
            "in each."
        ),
        "privacy": privacy_block(),
        "citywide_reference": {
            "note": (
                "Citywide totals live in payroll_by_year.json; listed "
                "departments sum to slightly less (the sub-threshold "
                "fold, <0.01%)."
            ),
        },
        "organization_groups": sorted(
            org_groups.values(), key=lambda g: g["organization_group_code"]),
        "departments": sorted(
            depts.values(),
            key=lambda d: -(d["series"][-1]["total_compensation_usd"]
                            if d["series"] else 0)),
        "n_departments": len(depts),
    }


# ──────────────────────────────────────────────────────── by_family_year ──


def build_by_family_year(rows: list[dict]) -> dict:
    ref = rows[0]

    years: dict[str, dict] = {}
    n_reclassified = 0
    for r in rows:
        fy = str(int(r["fiscal_year"]))
        year = years.setdefault(fy, {})
        dept = year.setdefault(r["department_code"], [])
        if bool(r["is_reclassified"]):
            n_reclassified += 1
        dept.append({
            "family_code": r["family_code"],
            "family_label": r["family_label"],
            "display_family": r["display_family"],
            "is_pooled": bool(r["is_pooled"]),
            "n_pooled_families": int(r["n_pooled_families"]) if r["n_pooled_families"] is not None else None,
            "is_reclassified": bool(r["is_reclassified"]),
            "n_employees": int(r["n_employees"]),
            "salaries_usd": _f(r["salaries_usd"], 2),
            "overtime_usd": _f(r["overtime_usd"], 2),
            "other_salaries_usd": _f(r["other_salaries_usd"], 2),
            "total_benefits_usd": _f(r["total_benefits_usd"], 2),
            "total_compensation_usd": _f(r["total_compensation_usd"], 2),
        })

    return {
        **base_payload(ref),
        "grain": (
            "department × job family × fiscal year. Families are the "
            "source's own 59-code taxonomy (100% populated); the "
            "display_family field groups them into 16 citizen-readable "
            "families."
        ),
        "classification": {
            "method": "manual",
            "seeds": [
                "pipeline/seeds/countries/us/seed_us_sf_job_family_display.csv",
                "pipeline/seeds/countries/us/seed_us_sf_job_reclass.csv",
            ],
            "note": (
                "display_family groups the source's native families for "
                "DISPLAY (by hand, 2026-07-16). is_reclassified marks "
                "cells containing job codes the source files under "
                "'Untitled'/'Unassigned' (the Superior Court's own job "
                "scheme, mayoral staff grades, commissioners…), "
                "reassigned by hand to real families. Amounts always come "
                "from the compensation data itself."
            ),
            "n_cells_with_reclassified_titles": n_reclassified,
        },
        "privacy": privacy_block(),
        "years": dict(sorted(years.items())),
        "n_rows": len(rows),
    }


def build_by_family_citywide(rows: list[dict]) -> dict:
    """Citywide roll-up of the dept × family grain: display_family × fiscal
    year, summed across every department. Powers the payroll page's
    families-over-time view. Amounts and headcount are sums of cells the
    dept × family export already publishes (each ≥ 5 employees or pooled),
    so no citywide family total falls under the privacy floor."""
    ref = rows[0]
    years: dict[str, dict[str, dict]] = {}
    for r in rows:
        fy = str(int(r["fiscal_year"]))
        fam = r["display_family"]
        bucket = years.setdefault(fy, {}).setdefault(fam, {
            "display_family": fam,
            "n_employees": 0,
            "salaries_usd": 0.0,
            "overtime_usd": 0.0,
            "other_salaries_usd": 0.0,
            "total_benefits_usd": 0.0,
            "total_compensation_usd": 0.0,
        })
        bucket["n_employees"] += int(r["n_employees"])
        bucket["salaries_usd"] += float(r["salaries_usd"] or 0)
        bucket["overtime_usd"] += float(r["overtime_usd"] or 0)
        bucket["other_salaries_usd"] += float(r["other_salaries_usd"] or 0)
        bucket["total_benefits_usd"] += float(r["total_benefits_usd"] or 0)
        bucket["total_compensation_usd"] += float(r["total_compensation_usd"] or 0)

    out_years: dict[str, list] = {}
    for fy, fams in sorted(years.items()):
        rows_out = []
        for b in fams.values():
            tc = b["total_compensation_usd"]
            rows_out.append({
                "display_family": b["display_family"],
                "n_employees": b["n_employees"],
                "salaries_usd": round(b["salaries_usd"], 2),
                "overtime_usd": round(b["overtime_usd"], 2),
                "other_salaries_usd": round(b["other_salaries_usd"], 2),
                "total_benefits_usd": round(b["total_benefits_usd"], 2),
                "total_compensation_usd": round(tc, 2),
                "ot_share_of_comp": round(b["overtime_usd"] / tc, 4) if tc > 0 else 0,
            })
        rows_out.sort(key=lambda x: x["total_compensation_usd"], reverse=True)
        out_years[fy] = rows_out

    return {
        **base_payload(ref),
        "grain": (
            "display_family × fiscal year, summed citywide across all "
            "departments. display_family groups the source's native 59-code "
            "taxonomy into citizen-readable families (by hand, see seeds)."
        ),
        "privacy": privacy_block(),
        "years": out_years,
        "n_rows": len(rows),
    }


# ───────────────────────────────────────────────────────── distribution ──


def merge_sparse_tail(buckets: list[dict], n_at_or_above_500k: int) -> list[dict]:
    """Publication rule for the histogram: every published bucket count
    is either 0 or ≥ 5. The open top bucket starts at $500k
    (n_at_or_above_500k) and swallows lower buckets from the top until
    every published count clears the bar (only 2013-2016 need it —
    measured in the block study small-cell audit)."""
    buckets = sorted(buckets, key=lambda b: b["bucket_floor_usd"])
    cut = len(buckets)  # index of first bucket merged into the open top
    open_n = n_at_or_above_500k

    def ok(cut: int, open_n: int) -> bool:
        if 0 < open_n < PUBLICATION_THRESHOLD:
            return False
        return all(
            b["n_employees"] == 0 or b["n_employees"] >= PUBLICATION_THRESHOLD
            for b in buckets[:cut]
        )

    while cut > 0 and not ok(cut, open_n):
        cut -= 1
        open_n += buckets[cut]["n_employees"]

    out = [
        {
            "floor_usd": b["bucket_floor_usd"],
            "ceiling_usd": b["bucket_ceiling_usd"],
            "n_employees": b["n_employees"],
        }
        for b in buckets[:cut]
    ]
    open_floor = buckets[cut]["bucket_floor_usd"] if cut < len(buckets) else 500000
    out.append({
        "floor_usd": open_floor,
        "ceiling_usd": None,  # open bucket
        "n_employees": open_n,
    })
    return out


def build_distribution(rows: list[dict], high_rows: list[dict]) -> dict:
    ref = rows[0]
    points = []
    for r in rows:
        histogram = merge_sparse_tail(
            [dict(b) for b in r["histogram_under_500k"]],
            int(r["n_at_or_above_500k"]),
        )
        points.append({
            "fiscal_year": int(r["fiscal_year"]),
            "n_employees": int(r["n_employees"]),
            "p25_usd": _f(r["p25_usd"], 0),
            "p50_usd": _f(r["p50_usd"], 0),
            "p75_usd": _f(r["p75_usd"], 0),
            "p90_usd": _f(r["p90_usd"], 0),
            "p99_usd": _f(r["p99_usd"], 0),
            "n_above_200k": int(r["n_above_200k"]),
            "n_above_300k": int(r["n_above_300k"]),
            "n_above_400k": int(r["n_above_400k"]),
            "n_above_500k": int(r["n_above_500k"]),
            "n_negative_comp": int(r["n_negative_comp"]),
            "histogram": histogram,
        })

    return {
        **base_payload(ref),
        "bucket_width_usd": int(rows[0]["bucket_width_usd"]),
        "percentile_note": (
            "Percentiles are exact, computed on per-person annual totals. "
            "p10 IS NOT PUBLISHED: the bottom decile is dominated by "
            "part-year and part-time staff (FY2025: ~10% of employees "
            "under $25k), and a p10 line reads as 'poverty wages' when it "
            "mostly measures partial years. The published floor is p25; "
            "the low histogram bump is annotated instead."
        ),
        "histogram_note": (
            "Buckets of $25,000 from $0; the top bucket is open "
            "(ceiling_usd null). Sparse top-tail buckets (fewer than 5 "
            "people, 2013-2016 only) are merged into the open bucket so "
            "every published count covers 0 or ≥ 5 people. Employees "
            "with negative net compensation (adjustment rows, "
            "n_negative_comp) are counted in the first bucket."
        ),
        "high_earners": {
            "fiscal_year": int(high_rows[0]["fiscal_year"]) if high_rows else None,
            "threshold_usd": int(high_rows[0]["threshold_usd"]) if high_rows else None,
            "note": (
                "Composition of the above-threshold group by PRIMARY job "
                "title (each person counted once, under their highest-"
                "paying title). Count-only — no amounts beyond 'above the "
                "threshold'. Titles with at least 5 people; everyone else "
                "in the remainder row."
            ),
            "titles": [
                {
                    "job_title": r["job_title"],
                    "display_family": r["display_family"],
                    "n_employees": int(r["n_employees"]),
                    "is_remainder": bool(r["is_remainder"]),
                }
                for r in high_rows
            ],
        },
        "privacy": privacy_block(),
        "points": points,
    }


# ───────────────────────────────────────────────────────────── overtime ──


def build_overtime(by_year_rows: list[dict], dept_rows: list[dict],
                   title_rows: list[dict]) -> dict:
    ref = by_year_rows[0]

    citywide = [
        {
            "fiscal_year": int(r["fiscal_year"]),
            "overtime_usd": _f(r["overtime_usd"], 2),
            "total_compensation_usd": _f(r["total_compensation_usd"], 2),
            "ot_share_of_comp": _f(r["ot_share_of_comp"], 6),
            "n_ot_exceeds_salary_naive": int(r["n_ot_exceeds_salary_naive"]),
            "n_ot_exceeds_salary_floored": int(r["n_ot_exceeds_salary_floored"]),
        }
        for r in by_year_rows
    ]

    latest_fy = max(int(r["fiscal_year"]) for r in dept_rows)
    latest_ot = {
        r["department_code"]: float(r["overtime_usd"])
        for r in dept_rows if int(r["fiscal_year"]) == latest_fy
    }
    top_codes = [c for c, _ in sorted(
        latest_ot.items(), key=lambda kv: -kv[1])][:OVERTIME_TOP_DEPTS]

    dept_series = []
    for code in top_codes:
        rows_c = [r for r in dept_rows
                  if r["department_code"] == code
                  and int(r["fiscal_year"]) >= OVERTIME_DEPT_SERIES_FROM]
        if not rows_c:
            continue
        dept_series.append({
            "department_code": code,
            "department": rows_c[-1]["department"],
            "organization_group": rows_c[-1]["organization_group"],
            "series": [
                {
                    "fiscal_year": int(r["fiscal_year"]),
                    "overtime_usd": _f(r["overtime_usd"], 2),
                    "total_compensation_usd": _f(r["total_compensation_usd"], 2),
                    "ot_share_of_comp": _f(r["ot_share_of_comp"], 6),
                    "n_employees": int(r["n_employees"]),
                }
                for r in sorted(rows_c, key=lambda r: int(r["fiscal_year"]))
            ],
        })

    top_titles = [
        {
            "fiscal_year": int(r["fiscal_year"]),
            "job_title": r["job_title"],
            "display_family": r["display_family"],
            "n_employees": int(r["n_employees"]),
            "n_ot_earners": int(r["n_ot_earners"]),
            "overtime_usd": _f(r["overtime_usd"], 2),
            "avg_ot_per_ot_earner_usd": _f(r["avg_ot_per_ot_earner_usd"], 2),
        }
        for r in title_rows
    ]

    floor_usd = int(by_year_rows[-1]["ot_salary_floor_usd"])
    return {
        **base_payload(ref),
        "framing_note": (
            "Overtime concentration reflects how staffing gaps in "
            "24/7 services (police patrol, jails, transit, hospitals, "
            "fire) are covered — existing staff working paid extra hours "
            "when positions go unfilled. This file measures the pattern; "
            "it does not adjudicate it."
        ),
        "dept_series_note": (
            f"Named department series start FY{OVERTIME_DEPT_SERIES_FROM} "
            "(the study's label-clean window); full department histories "
            "keyed on stable codes live in payroll_by_dept_year.json. "
            f"Top {OVERTIME_TOP_DEPTS} departments by FY{latest_fy} "
            "overtime."
        ),
        "counter_note": (
            "n_ot_exceeds_salary_* count employees whose overtime pay "
            "exceeded their base salary in the fiscal year. The floored "
            f"variant requires salary > ${floor_usd:,}: without it, "
            "FY2019 shows a 1,900-person spike that is an artifact of "
            "job-change rows with near-zero salaries. Use the floored "
            "series; the naive one is published to keep the artifact "
            "measurable."
        ),
        "titles_note": (
            "Top job titles by overtime in the latest fiscal year, "
            "restricted to titles with at least 100 employees citywide."
        ),
        "ot_salary_floor_usd": floor_usd,
        "privacy": privacy_block(),
        "citywide": citywide,
        "departments": dept_series,
        "top_titles": top_titles,
    }


# ─────────────────────────────────────────────────────────────── driver ──


def write_json(payload: dict, filename: str, log: Logger) -> None:
    output_file = OUTPUT_DIR / filename
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    size_kb = output_file.stat().st_size / 1024
    log.success(f"wrote {filename}", extra=f"{size_kb:.1f} KB")


def main() -> int:
    log = Logger("export_us_sf_payroll")
    log.header("Export US San Francisco payroll → JSON (6 files)")

    log.info("output dir", extra=str(OUTPUT_DIR))
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    log.section("Connexion BigQuery")
    client = bigquery.Client(project=PROJECT_ID)
    log.success("connecté", extra=f"{PROJECT_ID}.{DATASET}")

    log.section("mart_us_sf_comp_by_year")
    by_year_rows = fetch_rows(client, "mart_us_sf_comp_by_year", "fiscal_year")
    log.info("rows", extra=str(len(by_year_rows)))
    by_year = build_by_year(by_year_rows)

    log.section("mart_us_sf_payroll_by_dept_year")
    dept_rows = fetch_rows(client, "mart_us_sf_payroll_by_dept_year",
                           "department_code, fiscal_year")
    log.info("rows", extra=str(len(dept_rows)))
    by_dept = build_by_dept_year(dept_rows, by_year)

    log.section("mart_us_sf_payroll_by_family_year")
    family_rows = fetch_rows(client, "mart_us_sf_payroll_by_family_year",
                             "fiscal_year, department_code, family_code")
    log.info("rows", extra=str(len(family_rows)))
    by_family = build_by_family_year(family_rows)
    by_family_citywide = build_by_family_citywide(family_rows)

    log.section("mart_us_sf_payroll_distribution")
    dist_rows = fetch_rows(client, "mart_us_sf_payroll_distribution", "fiscal_year")
    log.info("rows", extra=str(len(dist_rows)))
    high_rows = fetch_rows(client, "mart_us_sf_payroll_high_earner_titles",
                           "is_remainder, n_employees DESC")
    log.info("high-earner rows", extra=str(len(high_rows)))
    distribution = build_distribution(dist_rows, high_rows)

    log.section("mart_us_sf_payroll_ot_titles")
    title_rows = fetch_rows(client, "mart_us_sf_payroll_ot_titles",
                            "overtime_usd DESC")
    log.info("rows", extra=str(len(title_rows)))
    overtime = build_overtime(by_year_rows, dept_rows, title_rows)

    log.section("Écriture")
    write_json(by_year, "payroll_by_year.json", log)
    write_json(by_dept, "payroll_by_dept_year.json", log)
    write_json(by_family, "payroll_by_family_year.json", log)
    write_json(by_family_citywide, "payroll_by_family_citywide.json", log)
    write_json(distribution, "payroll_distribution.json", log)
    write_json(overtime, "payroll_overtime.json", log)

    log.section("Sanity check")
    latest = by_year["points"][-1]
    log.info("FY%s total comp" % latest["fiscal_year"],
             extra=f"${latest['total_compensation_usd']:,.0f}")
    log.info("FY%s employees" % latest["fiscal_year"],
             extra=f"{latest['n_employees']:,}")
    log.info("FY%s median" % latest["fiscal_year"],
             extra=f"${latest['median_total_comp_usd']:,.0f}")
    dist_latest = distribution["points"][-1]
    log.info("FY%s >$400k" % dist_latest["fiscal_year"],
             extra=str(dist_latest["n_above_400k"]))
    ot_latest = overtime["citywide"][-1]
    log.info("FY%s OT" % ot_latest["fiscal_year"],
             extra=f"${ot_latest['overtime_usd']:,.0f} "
                   f"(counter {ot_latest['n_ot_exceeds_salary_floored']})")
    log.summary()
    return 0


if __name__ == "__main__":
    sys.exit(main())
