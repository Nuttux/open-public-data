-- Enrichment-seed integrity for department display names, two ways:
--   coverage  — every modern-era (FY2019+) department code in the dept
--               mart must have a seed row (a new dept appearing in a
--               future sync fails here → extend the seed consciously);
--   staleness — the seed's source_label snapshot must still be one of the
--               labels the source publishes for that code (the display
--               layer never overwrites source labels; if the portal
--               renames a department, re-verify the display name).
{{ config(tags=['us', 'enrichment']) }}

WITH observed AS (
    SELECT DISTINCT department_code, department
    FROM {{ ref('mart_us_sf_budget_dept') }}
    WHERE fiscal_year >= 2019
),

seed AS (
    SELECT department_code, source_label
    FROM {{ ref('stg_us_sf_dept_names') }}
)

SELECT
    o.department_code,
    o.department        AS observed_label,
    s.source_label      AS seed_label,
    CASE
        WHEN s.department_code IS NULL THEN 'missing_from_seed'
        ELSE 'seed_label_not_observed'
    END AS problem
FROM observed o
LEFT JOIN seed s USING (department_code)
WHERE s.department_code IS NULL
   OR NOT EXISTS (
        SELECT 1 FROM observed o2
        WHERE o2.department_code = s.department_code
          AND o2.department = s.source_label
   )
