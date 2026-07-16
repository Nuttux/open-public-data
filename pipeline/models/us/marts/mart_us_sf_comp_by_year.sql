-- =============================================================================
-- Mart: SF employee compensation by fiscal year
--
-- Sources: core_us_sf_comp (FILTERED to year_type = 'Fiscal' here — the
--          mart is where the Calendar/Fiscal choice is made, per the
--          core-keeps-both rule), stg_us_sf_catalog (provenance).
-- Grain:  fiscal year, 2013-2025.
--
-- n_employees = distinct pseudonymous employee identifiers (headcount-ish,
-- includes part-year and part-time staff — NOT FTE). median/avg per-employee
-- comp are computed on per-employee annual totals (an employee can have
-- several rows across jobs/departments).
-- =============================================================================

WITH fiscal AS (
    SELECT *
    FROM {{ ref('core_us_sf_comp') }}
    WHERE year_type = 'Fiscal'
),

per_employee AS (
    SELECT
        year,
        employee_identifier,
        SUM(total_compensation) AS employee_total_comp
    FROM fiscal
    GROUP BY year, employee_identifier
),

per_employee_stats AS (
    SELECT
        year,
        COUNT(*)                                                    AS n_employees,
        AVG(employee_total_comp)                                    AS avg_total_comp_usd,
        APPROX_QUANTILES(employee_total_comp, 100)[OFFSET(50)]      AS median_total_comp_usd
    FROM per_employee
    GROUP BY year
),

totals AS (
    SELECT
        year,
        SUM(salaries)            AS salaries_usd,
        SUM(overtime)            AS overtime_usd,
        SUM(other_salaries)      AS other_salaries_usd,
        SUM(total_salary)        AS total_salary_usd,
        SUM(retirement)          AS retirement_usd,
        SUM(health_and_dental)   AS health_and_dental_usd,
        SUM(other_benefits)      AS other_benefits_usd,
        SUM(total_benefits)      AS total_benefits_usd,
        SUM(total_compensation)  AS total_compensation_usd,
        COUNT(*)                 AS n_rows
    FROM fiscal
    GROUP BY year
),

provenance AS (
    SELECT DISTINCT
        dataset_id,
        dataset_name,
        dataset_page_url,
        attribution,
        rows_updated_at
    FROM {{ ref('stg_us_sf_catalog') }}
    WHERE source_id = 'sf_employee_comp'
)

SELECT
    t.year                      AS fiscal_year,
    'Fiscal'                    AS year_type,
    t.salaries_usd,
    t.overtime_usd,
    t.other_salaries_usd,
    t.total_salary_usd,
    t.retirement_usd,
    t.health_and_dental_usd,
    t.other_benefits_usd,
    t.total_benefits_usd,
    t.total_compensation_usd,
    t.n_rows,
    s.n_employees,
    s.avg_total_comp_usd,
    s.median_total_comp_usd,
    pr.dataset_id               AS source_dataset_id,
    pr.dataset_name             AS source_name,
    pr.dataset_page_url         AS source_url,
    pr.attribution              AS source_attribution,
    pr.rows_updated_at          AS source_rows_updated_at,
    'USD'                       AS unit
FROM totals t
INNER JOIN per_employee_stats s USING (year)
CROSS JOIN provenance pr
