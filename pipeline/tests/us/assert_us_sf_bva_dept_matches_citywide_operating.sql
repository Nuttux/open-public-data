-- Department-level budget-vs-actual must reproduce the citywide Operating
-- comparison EXACTLY: summing mart_us_sf_budget_vs_actual_dept over
-- departments per (fiscal_year, side) must equal the measured citywide
-- operating pair in mart_us_sf_budget_vs_actual (same perimeter:
-- fund_category='Operating', no related govt units, no transfer
-- characters). Tolerance $1. Only fiscal years present in the dept mart
-- (closed years, FY2019+) are compared.
{{ config(tags=['us', 'accounting_balance']) }}

WITH dept_rollup AS (
    SELECT
        fiscal_year,
        side,
        SUM(COALESCE(budget_operating_usd, 0)) AS budget_usd,
        SUM(COALESCE(actual_operating_usd, 0)) AS actual_usd
    FROM {{ ref('mart_us_sf_budget_vs_actual_dept') }}
    GROUP BY 1, 2
),

citywide AS (
    SELECT
        fiscal_year,
        side,
        budget_operating_excl_transfers_usd,
        actual_operating_aligned_usd
    FROM {{ ref('mart_us_sf_budget_vs_actual') }}
)

SELECT
    d.fiscal_year,
    d.side,
    d.budget_usd,
    c.budget_operating_excl_transfers_usd,
    d.actual_usd,
    c.actual_operating_aligned_usd,
    d.budget_usd - c.budget_operating_excl_transfers_usd AS budget_diff_usd,
    d.actual_usd - c.actual_operating_aligned_usd        AS actual_diff_usd
FROM dept_rollup d
INNER JOIN citywide c
    USING (fiscal_year, side)
WHERE ABS(d.budget_usd - c.budget_operating_excl_transfers_usd) > 1
   OR ABS(d.actual_usd - c.actual_operating_aligned_usd) > 1
