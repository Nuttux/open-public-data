-- Payroll dept mart ↔ citywide identity (dial B accounting):
--   Σ published dept rows + fold (dept-years under 5 employees, incl.
--   NULL dept codes) == citywide total_compensation, to the cent,
-- AND the fold never covers more than 4 distinct employees in a year
-- (in practice: Law Library n=2-3, one FY2022 Sheriff-oversight code,
-- two NULL-dept rows in FY2017 — block study §4 / small-cell audit).
-- Fail on any year where the identity or the fold bound breaks.
{{ config(tags=['us', 'data_integrity']) }}

WITH core_by_dept AS (
    SELECT
        year,
        department_code,
        COUNT(DISTINCT employee_identifier) AS n_employees,
        SUM(total_compensation)             AS comp_usd
    FROM {{ ref('core_us_sf_comp') }}
    WHERE year_type = 'Fiscal'
    GROUP BY year, department_code
),

fold AS (
    -- Everything the dept mart must NOT publish: n<5 dept-years and NULL
    -- department codes.
    SELECT
        c.year,
        SUM(c.comp_usd) AS fold_usd
    FROM core_by_dept c
    WHERE c.n_employees < 5 OR c.department_code IS NULL
    GROUP BY c.year
),

fold_n AS (
    -- Distinct employees inside the fold, per year (dedup across cells).
    SELECT
        year,
        COUNT(DISTINCT employee_identifier) AS n_folded
    FROM {{ ref('core_us_sf_comp') }} f
    WHERE year_type = 'Fiscal'
      AND (
        department_code IS NULL
        OR (year, department_code) IN (
            SELECT AS STRUCT year, department_code
            FROM core_by_dept
            WHERE n_employees < 5 AND department_code IS NOT NULL
        )
      )
    GROUP BY year
),

mart AS (
    SELECT fiscal_year, SUM(total_compensation_usd) AS published_usd
    FROM {{ ref('mart_us_sf_payroll_by_dept_year') }}
    GROUP BY fiscal_year
),

by_year AS (
    SELECT fiscal_year, total_compensation_usd
    FROM {{ ref('mart_us_sf_comp_by_year') }}
)

SELECT
    y.fiscal_year,
    y.total_compensation_usd,
    m.published_usd,
    COALESCE(f.fold_usd, 0)  AS fold_usd,
    COALESCE(n.n_folded, 0)  AS n_folded
FROM by_year y
LEFT JOIN mart m ON m.fiscal_year = y.fiscal_year
LEFT JOIN fold f ON f.year = y.fiscal_year
LEFT JOIN fold_n n ON n.year = y.fiscal_year
WHERE ABS(y.total_compensation_usd - COALESCE(m.published_usd, 0) - COALESCE(f.fold_usd, 0)) > 0.01
   OR COALESCE(n.n_folded, 0) > 4
