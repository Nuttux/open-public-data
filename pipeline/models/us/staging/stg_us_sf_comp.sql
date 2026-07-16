-- =============================================================================
-- Staging: SF Employee Compensation — typed, one-to-one with raw
--
-- Source: raw.us_sf_employee_comp (dataset 88g8-5mnd, ~1.1M rows, all
--         strings, synced via bulk CSV)
-- Grain:  pseudonymous employee_identifier × year × year_type × job × dept
--
-- #1 trap (docs/us/API-RECON.md §A.5, verified): year_type contains BOTH
-- 'Calendar' (548,140 rows) AND 'Fiscal' (547,962) — the SAME compensation
-- appears under both. stg and core keep BOTH with the field exposed
-- (filtering is mart business: marts use year_type = 'Fiscal').
-- Tested via tests/us/assert_us_sf_comp_year_type_split.sql.
--
-- employment_type is blank on ~336k older rows — kept as NULL.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_sf_raw', 'us_sf_employee_comp') }}
)

SELECT
    {{ us_sf_string('year_type') }}                AS year_type,
    {{ us_sf_int('year') }}                        AS year,
    {{ us_sf_string('employee_identifier') }}      AS employee_identifier,
    {{ us_sf_string('organization_group_code') }}  AS organization_group_code,
    {{ us_sf_string('organization_group') }}       AS organization_group,
    {{ us_sf_string('department_code') }}          AS department_code,
    {{ us_sf_string('department') }}               AS department,
    {{ us_sf_string('union_code') }}               AS union_code,
    {{ us_sf_string('union') }}                    AS union_name,
    {{ us_sf_string('job_family_code') }}          AS job_family_code,
    {{ us_sf_string('job_family') }}               AS job_family,
    {{ us_sf_string('job_code') }}                 AS job_code,
    {{ us_sf_string('job') }}                      AS job,
    {{ us_sf_string('employment_type') }}          AS employment_type,
    {{ us_sf_amount('salaries') }}                 AS salaries,
    {{ us_sf_amount('overtime') }}                 AS overtime,
    {{ us_sf_amount('other_salaries') }}           AS other_salaries,
    {{ us_sf_amount('total_salary') }}             AS total_salary,
    {{ us_sf_amount('retirement') }}               AS retirement,
    {{ us_sf_amount('health_and_dental') }}        AS health_and_dental,
    {{ us_sf_amount('other_benefits') }}           AS other_benefits,
    {{ us_sf_amount('total_benefits') }}           AS total_benefits,
    {{ us_sf_amount('total_compensation') }}       AS total_compensation,
    {{ us_sf_amount('hours') }}                    AS hours,
    {{ us_sf_timestamp('data_as_of') }}            AS data_as_of,
    {{ us_sf_timestamp('data_loaded_at') }}        AS data_loaded_at,
    _synced_at
FROM source
