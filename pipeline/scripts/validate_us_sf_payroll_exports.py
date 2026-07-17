#!/usr/bin/env python3
from __future__ import annotations
"""
Validate the SF payroll JSON exports — privacy rule + cross-file identities.

Usage:
    python pipeline/scripts/validate_us_sf_payroll_exports.py

Checks (block 4 acceptance, dial B):
    1. PRIVACY SWEEP — in every payroll_*.json, EVERY object carrying an
       "n_employees" field satisfies n ≥ 5 (histogram bins may be 0 —
       merged-tail rule), and title rows keep n ≥ 100. Every dollar
       aggregate in the exports carries its n_employees, so this bounds
       every published $ cell. Count-only citywide fields
       (n_above_200k…500k, the OT counters, n_negative_comp,
       n_pooled_families, n_departments) attach no dollar amount to any
       group and are exempt by design — the choice is stated in each
       file's privacy block.
    2. p10 is ABSENT from the distribution export (deliberate drop —
       part-timer pollution).
    3. Data contract: generated_at, source_pipeline, source.source_url,
       as_of, privacy block in all 5 files.
    4. Cross-file identities: distribution n == by_year n; overtime
       citywide == by_year OT columns; histogram Σ == n_employees;
       org-group rollups == Σ listed dept rows; family cells ≤ dept row
       (fold < 0.05%); dept Σ ≤ citywide (fold < 0.05%); floored counter
       ≤ naive counter.
"""

import json
import sys
from pathlib import Path

DATA_DIR = (Path(__file__).resolve().parent.parent.parent
            / "website" / "public" / "data" / "us" / "sf")

THRESHOLD = 5
TITLE_THRESHOLD = 100
FILES = [
    "payroll_by_year.json",
    "payroll_by_dept_year.json",
    "payroll_by_family_year.json",
    "payroll_distribution.json",
    "payroll_overtime.json",
]

passed = 0
failed = 0


def check(name: str, condition: bool, msg: str = ""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        print(f"  ❌ {name}: {msg}")


def load(name: str) -> dict | None:
    try:
        return json.loads((DATA_DIR / name).read_text())
    except (FileNotFoundError, json.JSONDecodeError) as e:
        global failed
        failed += 1
        print(f"  ❌ Failed to load {name}: {e}")
        return None


def walk_n_employees(node, path: str, allow_zero: bool):
    """Yield (path, n) for every n_employees anywhere in the payload."""
    if isinstance(node, dict):
        if "n_employees" in node and isinstance(node["n_employees"], (int, float)):
            yield path, int(node["n_employees"]), allow_zero
        for k, v in node.items():
            # Histogram bins are the one place a published count may be 0
            # (empty bin) — everything else must clear the threshold.
            yield from walk_n_employees(
                v, f"{path}.{k}", allow_zero or k == "histogram")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk_n_employees(v, f"{path}[{i}]", allow_zero)


def validate_privacy(payloads: dict[str, dict]):
    print("\n── Privacy sweep: no published cell under n=5 ──")
    for name, data in payloads.items():
        if data is None:
            continue
        violations = []
        for path, n, allow_zero in walk_n_employees(data, name, False):
            ok = n >= THRESHOLD or (allow_zero and n == 0)
            if not ok:
                violations.append(f"{path} n={n}")
        check(f"{name}: every n_employees ≥ {THRESHOLD}"
              f"{' (histogram bins may be 0)' if name == 'payroll_distribution.json' else ''}",
              not violations, "; ".join(violations[:5]))

    ot = payloads.get("payroll_overtime.json")
    if ot:
        bad_titles = [t for t in ot.get("top_titles", [])
                      if t["n_employees"] < TITLE_THRESHOLD]
        check(f"top_titles: every title ≥ {TITLE_THRESHOLD} employees",
              not bad_titles, str(bad_titles[:3]))


def validate_contract(payloads: dict[str, dict]):
    print("\n── Data contract ──")
    for name, data in payloads.items():
        if data is None:
            continue
        for key in ("generated_at", "source_pipeline", "as_of", "privacy"):
            check(f"{name}: has {key}", key in data, "missing")
        check(f"{name}: source.source_url",
              bool(data.get("source", {}).get("source_url")), "missing")


def validate_distribution(payloads: dict[str, dict]):
    print("\n── Distribution ──")
    dist = payloads.get("payroll_distribution.json")
    by_year = payloads.get("payroll_by_year.json")
    if not dist or not by_year:
        return
    def keys_of(node):
        if isinstance(node, dict):
            for k, v in node.items():
                yield k
                yield from keys_of(v)
        elif isinstance(node, list):
            for v in node:
                yield from keys_of(v)

    p10_keys = [k for k in keys_of(dist) if k.startswith("p10")]
    check("no p10 key anywhere (deliberate drop)", not p10_keys, str(p10_keys))
    n_by_year = {p["fiscal_year"]: p["n_employees"] for p in by_year["points"]}
    for p in dist["points"]:
        fy = p["fiscal_year"]
        hist_n = sum(b["n_employees"] for b in p["histogram"])
        check(f"FY{fy}: Σ histogram == n_employees",
              hist_n == p["n_employees"],
              f"{hist_n} != {p['n_employees']}")
        check(f"FY{fy}: n_employees == by_year",
              p["n_employees"] == n_by_year.get(fy),
              f"{p['n_employees']} != {n_by_year.get(fy)}")
        mono = (p["p25_usd"] <= p["p50_usd"] <= p["p75_usd"]
                <= p["p90_usd"] <= p["p99_usd"])
        check(f"FY{fy}: percentiles monotone", mono, str(p))
        open_buckets = [b for b in p["histogram"] if b["ceiling_usd"] is None]
        check(f"FY{fy}: exactly one open top bucket", len(open_buckets) == 1,
              f"{len(open_buckets)} open buckets")


def validate_cross(payloads: dict[str, dict]):
    print("\n── Cross-file identities ──")
    by_year = payloads.get("payroll_by_year.json")
    by_dept = payloads.get("payroll_by_dept_year.json")
    by_family = payloads.get("payroll_by_family_year.json")
    ot = payloads.get("payroll_overtime.json")
    if not all([by_year, by_dept, by_family, ot]):
        return

    yp = {p["fiscal_year"]: p for p in by_year["points"]}

    # Departments sum to citywide within the sub-5 fold (< 0.05%).
    dept_by_fy: dict[int, float] = {}
    for d in by_dept["departments"]:
        for s in d["series"]:
            dept_by_fy[s["fiscal_year"]] = (
                dept_by_fy.get(s["fiscal_year"], 0.0)
                + s["total_compensation_usd"])
    for fy, total in sorted(dept_by_fy.items()):
        city = yp[fy]["total_compensation_usd"]
        fold = city - total
        check(f"FY{fy}: Σ dept ≤ citywide, fold < 0.05%",
              0 <= fold < city * 0.0005,
              f"fold = {fold:,.0f} on {city:,.0f}")

    # Org rollups == Σ listed dept rows.
    org_fy: dict[int, float] = {}
    for g in by_dept["organization_groups"]:
        for fy_s, y in g["years"].items():
            org_fy[int(fy_s)] = org_fy.get(int(fy_s), 0.0) + y["total_compensation_usd"]
    ok_org = all(abs(org_fy[fy] - dept_by_fy[fy]) < 1 for fy in dept_by_fy)
    check("org-group rollups == Σ listed dept rows (every FY)", ok_org,
          str({fy: (org_fy.get(fy), dept_by_fy[fy])
               for fy in dept_by_fy
               if abs(org_fy.get(fy, 0) - dept_by_fy[fy]) >= 1}))

    # Family cells ≤ their dept row; the residual is a fold of ≤ 4 people
    # (that identity is verified EXACTLY against the warehouse by
    # tests/us/assert_us_sf_payroll_family_cells_reconcile.sql — here we
    # bound it file-locally to catch gross export bugs: never negative,
    # never plausibly more than 4 very-highly-paid people, using the
    # year's own p99 × 5 as a generous per-person ceiling).
    dist = payloads.get("payroll_distribution.json")
    p99 = {p["fiscal_year"]: p["p99_usd"] for p in dist["points"]} if dist else {}
    dept_total: dict[tuple[int, str], float] = {}
    for d in by_dept["departments"]:
        for s in d["series"]:
            dept_total[(s["fiscal_year"], d["department_code"])] = (
                s["total_compensation_usd"])
    bad_cells = []
    for fy_s, depts in by_family["years"].items():
        fy = int(fy_s)
        fold_cap = 4 * 5 * p99.get(fy, 500000)
        for code, cells in depts.items():
            cell_sum = sum(c["total_compensation_usd"] for c in cells)
            ref = dept_total.get((fy, code))
            if ref is None:
                bad_cells.append(f"FY{fy_s} {code}: family rows but no dept row")
            elif not (cell_sum <= ref + 0.01 and (ref - cell_sum) <= fold_cap):
                bad_cells.append(
                    f"FY{fy_s} {code}: Σ cells {cell_sum:,.0f} vs dept {ref:,.0f}")
    check("family cells reconcile to dept rows (exact identity in dbt)",
          not bad_cells, "; ".join(bad_cells[:4]))

    # Overtime file mirrors by_year.
    ok_ot = all(
        abs(c["overtime_usd"] - yp[c["fiscal_year"]]["overtime_usd"]) < 0.01
        and c["n_ot_exceeds_salary_floored"] <= c["n_ot_exceeds_salary_naive"]
        for c in ot["citywide"]
    )
    check("overtime citywide == by_year OT; floored ≤ naive", ok_ot, "")


def main() -> int:
    print(f"Validating SF payroll exports in {DATA_DIR}")
    payloads = {name: load(name) for name in FILES}
    validate_privacy(payloads)
    validate_contract(payloads)
    validate_distribution(payloads)
    validate_cross(payloads)
    print(f"\n{'='*50}\n✅ {passed} passed   ❌ {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
