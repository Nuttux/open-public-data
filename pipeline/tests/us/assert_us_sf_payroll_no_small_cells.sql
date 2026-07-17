-- THE dial-B privacy invariant, at the warehouse gate: no published
-- payroll mart row may aggregate fewer than 5 distinct employees —
-- including the pooled "Other roles" rows — and the title-level OT list
-- keeps its ≥ 100-employee bar. The JSON exports are checked again by
-- pipeline/scripts/validate_us_sf_payroll_exports.py (belt and
-- suspenders: the rule holds even if an export bypasses a mart filter).
{{ config(tags=['us', 'data_integrity']) }}

SELECT 'by_dept_year' AS mart, CAST(fiscal_year AS STRING) AS key1, department_code AS key2, n_employees
FROM {{ ref('mart_us_sf_payroll_by_dept_year') }}
WHERE n_employees < 5

UNION ALL

SELECT 'by_family_year', CAST(fiscal_year AS STRING), CONCAT(department_code, '/', family_code), n_employees
FROM {{ ref('mart_us_sf_payroll_by_family_year') }}
WHERE n_employees < 5

UNION ALL

SELECT 'ot_titles', CAST(fiscal_year AS STRING), job_code, n_employees
FROM {{ ref('mart_us_sf_payroll_ot_titles') }}
WHERE n_employees < 100

UNION ALL

SELECT 'high_earner_titles', CAST(fiscal_year AS STRING), job_title, n_employees
FROM {{ ref('mart_us_sf_payroll_high_earner_titles') }}
WHERE n_employees < 5
