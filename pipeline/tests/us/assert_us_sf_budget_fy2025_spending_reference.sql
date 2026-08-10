-- Block 1 acceptance anchor (docs/us/block-studies/1-budget.md, verified
-- live on BigQuery 2026-07-16): FY2025 adopted Spending is exactly
-- $15,917,870,152 (Revenue $15,917,870,147 — $5 apart, balanced budget).
-- The page hero renders this number; if the portal restates FY2025 the
-- test flags it so the acceptance criterion is re-baselined consciously
-- rather than silently.
{{ config(tags=['us', 'accounting_balance']) }}

WITH fy2025 AS (
    SELECT total_usd
    FROM {{ ref('mart_us_sf_budget_by_year') }}
    WHERE fiscal_year = 2025 AND side = 'Spending'
)

SELECT
    total_usd,
    15917870152 AS reference_usd,
    total_usd - 15917870152 AS diff_usd
FROM fy2025
WHERE ABS(total_usd - 15917870152) > 1
