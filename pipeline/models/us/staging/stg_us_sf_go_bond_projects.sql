-- =============================================================================
-- Staging: SF GO Bond Projects — typed, one-to-one with raw
--
-- Source: raw.us_sf_go_bond_projects (dataset d3dc-v5yr, all strings)
-- Grain:  bond × component/program × planned project × reporting year.
--
-- Block 6B. The granular named projects under each bond program item
-- (planned_project_name — e.g. "RP Buena Vista Park Master Pln"). No dollars of
-- its own; provides the project inventory that names a place, paired with
-- stg_us_sf_go_bond_spending (program-item $) in the crosswalk.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_sf_raw', 'us_sf_go_bond_projects') }}
)

SELECT
    {{ us_sf_string('bond') }}                       AS bond,
    {{ us_sf_int('year') }}                          AS report_year,
    {{ us_sf_string('component_or_program') }}       AS component_or_program,
    {{ us_sf_string('subcomponent') }}               AS subcomponent,
    {{ us_sf_string('planned_project_name') }}       AS planned_project_name,
    {{ us_sf_int('fiscal_year') }}                   AS fiscal_year,
    {{ us_sf_int('number_of_planned_projects') }}    AS n_planned_projects,
    {{ us_sf_int('number_of_completed_projects') }}  AS n_completed_projects,
    {{ us_sf_date('completiondate') }}               AS completion_date,
    {{ us_sf_date('data_as_of') }}                   AS data_as_of,
    {{ us_sf_date('data_loaded_at') }}               AS data_loaded_at,
    _synced_at
FROM source
