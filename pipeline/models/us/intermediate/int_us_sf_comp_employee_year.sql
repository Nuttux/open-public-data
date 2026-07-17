-- =============================================================================
-- Intermediate: SF comp per employee × year × year_type — the person grain
--
-- Source: core_us_sf_comp (row grain: employee × year × year_type × job ×
--         dept; ~6% of employees have several rows in a year across
--         jobs/departments).
-- Grain:  employee_identifier × year × year_type (~1.09M rows).
--
-- Why this exists (docs/us/block-studies/4-payroll.md §Architecture):
-- percentiles, distribution histograms and the overtime-exceeds-salary
-- flag are all PER-PERSON statements — computing them on raw rows
-- double-counts multi-row employees (measured FY2025: 43,239 rows vs
-- 40,786 employees). Per the layering rule the person-level aggregation
-- lives here, in dbt — never in an export script.
--
-- year_type ('Calendar' | 'Fiscal') is kept with the field exposed, same
-- rule as core: the Calendar/Fiscal choice belongs to marts (all payroll
-- marts take 'Fiscal'). Summing across year_type double-counts.
--
-- ot_exceeds_salary_floored: the FY2019 naive count (1,903) is an
-- artifact — 1,746 of those rows carry salaries ≤ $1,000 (job-change /
-- "other salaries" rows). The $1,000 floor is the documented fix; both
-- flags are exposed so the artifact stays measurable.
-- =============================================================================

SELECT
    year_type,
    year,
    employee_identifier,
    SUM(salaries)                 AS salaries,
    SUM(overtime)                 AS overtime,
    SUM(other_salaries)           AS other_salaries,
    SUM(total_salary)             AS total_salary,
    SUM(retirement)               AS retirement,
    SUM(health_and_dental)        AS health_and_dental,
    SUM(other_benefits)           AS other_benefits,
    SUM(total_benefits)           AS total_benefits,
    SUM(total_compensation)       AS total_compensation,
    COUNT(*)                      AS n_rows,
    SUM(overtime) > SUM(salaries)                             AS ot_exceeds_salary_naive,
    SUM(overtime) > SUM(salaries) AND SUM(salaries) > 1000    AS ot_exceeds_salary_floored
FROM {{ ref('core_us_sf_comp') }}
GROUP BY year_type, year, employee_identifier
