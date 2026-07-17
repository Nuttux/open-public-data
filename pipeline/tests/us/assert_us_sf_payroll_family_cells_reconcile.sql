-- Payroll family mart ↔ dept mart identity, per department-year:
--   Σ published family cells (incl. the visible "Other roles" pool)
--   + expected fold == department total, to the cent.
-- The expected fold is recomputed INDEPENDENTLY from core: sub-5 cells
-- whose per-department pool also stays under 5 fold into the dept total
-- with no row (dial B — defeats subtraction-recovery). Fail on any
-- department-year where the arithmetic breaks or a fold covers more
-- than 4 distinct employees.
{{ config(tags=['us', 'data_integrity']) }}

WITH rows_with_family AS (
    SELECT
        f.year,
        f.department_code,
        f.employee_identifier,
        f.total_compensation,
        CASE
            WHEN f.job_family_code IN ('0000', '__UNASSIGNED__')
                 AND r.reclass_family_code IS NOT NULL
                THEN r.reclass_family_code
            ELSE f.job_family_code
        END AS family_code
    FROM {{ ref('core_us_sf_comp') }} f
    LEFT JOIN {{ ref('stg_us_sf_job_reclass') }} r
        ON r.job_code = f.job_code
    WHERE f.year_type = 'Fiscal'
      AND f.department_code IS NOT NULL
),

published_dept_years AS (
    SELECT year, department_code
    FROM rows_with_family
    GROUP BY year, department_code
    HAVING COUNT(DISTINCT employee_identifier) >= 5
),

cells AS (
    SELECT
        r.year,
        r.department_code,
        r.family_code,
        COUNT(DISTINCT r.employee_identifier) AS n_employees,
        SUM(r.total_compensation)             AS comp_usd
    FROM rows_with_family r
    INNER JOIN published_dept_years p
        ON p.year = r.year AND p.department_code = r.department_code
    GROUP BY r.year, r.department_code, r.family_code
),

pool AS (
    SELECT
        r.year,
        r.department_code,
        COUNT(DISTINCT r.employee_identifier) AS pool_n,
        SUM(r.total_compensation)             AS pool_usd
    FROM rows_with_family r
    INNER JOIN cells c
        ON c.year = r.year
       AND c.department_code = r.department_code
       AND c.family_code = r.family_code
       AND c.n_employees < 5
    GROUP BY r.year, r.department_code
),

expected AS (
    SELECT
        c.year,
        c.department_code,
        SUM(c.comp_usd)                          AS dept_total_usd,
        COALESCE(ANY_VALUE(p.pool_n), 0)         AS pool_n,
        -- Pool under 5 → folded (no row); pool ≥ 5 → published as a row.
        CASE
            WHEN COALESCE(ANY_VALUE(p.pool_n), 0) BETWEEN 1 AND 4
                THEN ANY_VALUE(p.pool_usd)
            ELSE 0
        END                                      AS expected_fold_usd
    FROM cells c
    LEFT JOIN pool p
        ON p.year = c.year AND p.department_code = c.department_code
    GROUP BY c.year, c.department_code
),

mart AS (
    SELECT
        fiscal_year,
        department_code,
        SUM(total_compensation_usd) AS published_usd,
        MIN(n_employees)            AS min_n
    FROM {{ ref('mart_us_sf_payroll_by_family_year') }}
    GROUP BY fiscal_year, department_code
)

SELECT
    e.year,
    e.department_code,
    e.dept_total_usd,
    m.published_usd,
    e.expected_fold_usd,
    e.pool_n
FROM expected e
LEFT JOIN mart m
    ON m.fiscal_year = e.year AND m.department_code = e.department_code
WHERE ABS(e.dept_total_usd - COALESCE(m.published_usd, 0) - e.expected_fold_usd) > 0.01
   OR (e.expected_fold_usd != 0 AND e.pool_n > 4)
