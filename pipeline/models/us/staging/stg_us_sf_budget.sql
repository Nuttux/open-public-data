-- =============================================================================
-- Staging: SF Budget (adopted AAO) — typed, one-to-one with raw
--
-- Source: raw.us_sf_budget (dataset xdgd-c79v, all strings)
-- Grain:  FY × revenue_or_spending × org group × dept × program × character
--         × object × sub_object × fund hierarchy (row-level budget lines)
--
-- Notes (docs/us/API-RECON.md §A.1):
--   - Adopted AAO only; FY2010-FY2027. SF budgets two years at a time —
--     the two years after the current one are high-level estimates.
--   - Net totals depend on embedded NEGATIVE "Transfer Adjustments
--     (Citywide)" rows — kept; naive SUM(budget) is correct because of them.
--   - The raw `related_govt_unit` column is BROKEN on this dataset (it
--     mirrors revenue_or_spending) — deliberately NOT exposed here so
--     nobody filters on it. The real flag lives on the actuals dataset.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_sf_raw', 'us_sf_budget') }}
)

SELECT
    {{ us_sf_int('fiscal_year') }}                 AS fiscal_year,
    {{ us_sf_string('revenue_or_spending') }}      AS revenue_or_spending,
    {{ us_sf_string('organization_group_code') }}  AS organization_group_code,
    {{ us_sf_string('organization_group') }}       AS organization_group,
    {{ us_sf_string('department_code') }}          AS department_code,
    {{ us_sf_string('department') }}               AS department,
    {{ us_sf_string('program_code') }}             AS program_code,
    {{ us_sf_string('program') }}                  AS program,
    {{ us_sf_string('character_code') }}           AS character_code,
    {{ us_sf_string('character') }}                AS character,
    {{ us_sf_string('object_code') }}              AS object_code,
    {{ us_sf_string('object') }}                   AS object,
    {{ us_sf_string('sub_object_code') }}          AS sub_object_code,
    {{ us_sf_string('sub_object') }}               AS sub_object,
    {{ us_sf_string('fund_type_code') }}           AS fund_type_code,
    {{ us_sf_string('fund_type') }}                AS fund_type,
    {{ us_sf_string('fund_code') }}                AS fund_code,
    {{ us_sf_string('fund') }}                     AS fund,
    {{ us_sf_string('fund_category_code') }}       AS fund_category_code,
    {{ us_sf_string('fund_category') }}            AS fund_category,
    {{ us_sf_amount('budget') }}                   AS budget_amt,
    {{ us_sf_timestamp('data_as_of') }}            AS data_as_of,
    {{ us_sf_timestamp('data_loaded_at') }}        AS data_loaded_at,
    _synced_at
FROM source
