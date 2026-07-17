-- Overtime cross-mart consistency, per fiscal year:
--   1. Σ dept-mart overtime + the sub-5 dept fold (recomputed from core)
--      == citywide overtime in mart_us_sf_comp_by_year, to the cent —
--      the OT lens joins the two marts, they must tell one story;
--   2. the floored OT-exceeds-salary counter never exceeds the naive one
--      (the $1k floor can only remove artifact rows, block study §2);
--   3. Σ top-title OT (latest FY) never exceeds that year's citywide OT.
{{ config(tags=['us', 'data_integrity']) }}

WITH fold AS (
    SELECT
        year,
        SUM(overtime) AS fold_ot_usd
    FROM {{ ref('core_us_sf_comp') }}
    WHERE year_type = 'Fiscal'
      AND (
        department_code IS NULL
        OR (year, department_code) IN (
            SELECT AS STRUCT year, department_code
            FROM {{ ref('core_us_sf_comp') }}
            WHERE year_type = 'Fiscal' AND department_code IS NOT NULL
            GROUP BY year, department_code
            HAVING COUNT(DISTINCT employee_identifier) < 5
        )
      )
    GROUP BY year
),

dept AS (
    SELECT fiscal_year, SUM(overtime_usd) AS dept_ot_usd
    FROM {{ ref('mart_us_sf_payroll_by_dept_year') }}
    GROUP BY fiscal_year
),

titles AS (
    SELECT fiscal_year, SUM(overtime_usd) AS titles_ot_usd
    FROM {{ ref('mart_us_sf_payroll_ot_titles') }}
    GROUP BY fiscal_year
),

by_year AS (
    SELECT
        fiscal_year,
        overtime_usd,
        n_ot_exceeds_salary_naive,
        n_ot_exceeds_salary_floored
    FROM {{ ref('mart_us_sf_comp_by_year') }}
)

SELECT
    y.fiscal_year,
    y.overtime_usd,
    d.dept_ot_usd,
    COALESCE(f.fold_ot_usd, 0) AS fold_ot_usd,
    t.titles_ot_usd,
    y.n_ot_exceeds_salary_naive,
    y.n_ot_exceeds_salary_floored
FROM by_year y
LEFT JOIN dept d ON d.fiscal_year = y.fiscal_year
LEFT JOIN fold f ON f.year = y.fiscal_year
LEFT JOIN titles t ON t.fiscal_year = y.fiscal_year
WHERE ABS(y.overtime_usd - COALESCE(d.dept_ot_usd, 0) - COALESCE(f.fold_ot_usd, 0)) > 0.01
   OR y.n_ot_exceeds_salary_floored > y.n_ot_exceeds_salary_naive
   OR COALESCE(t.titles_ot_usd, 0) > y.overtime_usd
