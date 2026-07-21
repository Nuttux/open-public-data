-- =============================================================================
-- Staging: SF DPW Internal & External Projects — typed, geometry parsed
--
-- Source: raw.us_sf_dpw_projects (dataset btxj-k9uh, all strings)
-- Grain:  project × mapped point (a linear project — a sewer, a paving job —
--         has many point rows; dedupe on name for a project-level view).
--
-- Block 6C (activity view). Geolocated chantiers: co_ordinatepoint is a JSON
-- string {"type":"Point","coordinates":["lon","lat"]} — parsed to a GEOGRAPHY
-- for the spatial join to City Facilities. client_contract_id bridges to a
-- contract's $ ("NONE"/"_NA"/blank → NULL). Carries NO money of its own;
-- surfaced as current/recent construction ON/NEAR the place, never summed.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_sf_raw', 'us_sf_dpw_projects') }}
),

typed AS (
    SELECT
        {{ us_sf_string('name') }}                       AS project_name,
        {{ us_sf_string('facility_type') }}              AS facility_type,
        {{ us_sf_string('project_status') }}             AS project_status,
        {{ us_sf_string('project_phase') }}              AS project_phase,
        {{ us_sf_string('description') }}                AS description,
        {{ us_sf_string('on_street') }}                  AS on_street,
        NULLIF(NULLIF(NULLIF(UPPER(TRIM(client_contract_id)), 'NONE'), '_NA'), '')
                                                         AS client_contract_id,
        {{ us_sf_date('start_date') }}                   AS start_date,
        {{ us_sf_date('end_date') }}                     AS end_date,
        SAFE_CAST(JSON_EXTRACT_SCALAR(co_ordinatepoint, '$.coordinates[0]') AS FLOAT64) AS longitude,
        SAFE_CAST(JSON_EXTRACT_SCALAR(co_ordinatepoint, '$.coordinates[1]') AS FLOAT64) AS latitude,
        _synced_at
    FROM source
)

SELECT
    *,
    CASE WHEN longitude IS NOT NULL AND latitude IS NOT NULL
         THEN ST_GEOGPOINT(longitude, latitude) END      AS geo
FROM typed
