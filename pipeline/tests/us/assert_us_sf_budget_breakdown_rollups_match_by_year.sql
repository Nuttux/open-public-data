-- Free arithmetic self-checks for the Block 1 breakdown marts: every
-- altitude must roll up to the SAME net fiscal-year total as
-- mart_us_sf_budget_by_year (the hero number). Org-group and fund marts
-- cover all fiscal years; dept / character / program marts exclude FY2018
-- (corrupted-drill year) by design, so FY2018 is skipped for those levels.
-- Tolerance $1 (cells under |$0.005| are dropped in the cell-level marts).
{{ config(tags=['us', 'accounting_balance']) }}

WITH by_year AS (
    SELECT fiscal_year, side, total_usd
    FROM {{ ref('mart_us_sf_budget_by_year') }}
),

levels AS (
    SELECT 'org_group' AS level, fiscal_year, side, SUM(total_usd) AS rollup_usd
    FROM {{ ref('mart_us_sf_budget_org_group') }}
    GROUP BY 2, 3

    UNION ALL
    SELECT 'department', fiscal_year, side, SUM(total_usd)
    FROM {{ ref('mart_us_sf_budget_dept') }}
    GROUP BY 2, 3

    UNION ALL
    SELECT 'character', fiscal_year, side, SUM(total_usd)
    FROM {{ ref('mart_us_sf_budget_character') }}
    GROUP BY 2, 3

    UNION ALL
    SELECT 'program', fiscal_year, side, SUM(total_usd)
    FROM {{ ref('mart_us_sf_budget_program') }}
    GROUP BY 2, 3

    UNION ALL
    SELECT 'fund', fiscal_year, side, SUM(total_usd)
    FROM {{ ref('mart_us_sf_budget_fund') }}
    GROUP BY 2, 3
)

SELECT
    l.level,
    l.fiscal_year,
    l.side,
    l.rollup_usd,
    y.total_usd AS by_year_usd,
    l.rollup_usd - y.total_usd AS diff_usd
FROM levels l
INNER JOIN by_year y
    USING (fiscal_year, side)
WHERE ABS(l.rollup_usd - y.total_usd) > 1
