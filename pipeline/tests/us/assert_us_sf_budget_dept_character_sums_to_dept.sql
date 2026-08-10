-- Fiche-altitude identity: the dept × character cells must sum back to
-- their department's net total (the number the DeptFiche header shows).
-- Tolerance $1 per department (cells under |$0.005| are dropped).
{{ config(tags=['us', 'accounting_balance']) }}

WITH cells AS (
    SELECT fiscal_year, side, department_code, SUM(amount_usd) AS cells_usd
    FROM {{ ref('mart_us_sf_budget_dept_character') }}
    GROUP BY 1, 2, 3
),

depts AS (
    SELECT fiscal_year, side, department_code, total_usd
    FROM {{ ref('mart_us_sf_budget_dept') }}
)

SELECT
    d.fiscal_year,
    d.side,
    d.department_code,
    d.total_usd,
    COALESCE(c.cells_usd, 0) AS cells_usd,
    d.total_usd - COALESCE(c.cells_usd, 0) AS diff_usd
FROM depts d
LEFT JOIN cells c
    USING (fiscal_year, side, department_code)
WHERE ABS(d.total_usd - COALESCE(c.cells_usd, 0)) > 1
