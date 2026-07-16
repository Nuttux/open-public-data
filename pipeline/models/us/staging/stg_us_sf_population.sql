-- =============================================================================
-- Staging: Census Vintage 2025 place estimates — San Francisco city row
--
-- Source: raw.us_census_population_places (sub-est2025.csv, all strings)
-- Grain:  one row — SUMLEV '162' (incorporated place), STATE '06'
--         (California), PLACE '67000' (San Francisco city). Verified live
--         2026-07-16. NB: SUMLEV '157'/'050' carry the same SF numbers at
--         county-balance/county level (SF is a consolidated city-county) —
--         '162' is the canonical city row.
--
-- Keeps the July 1 estimate columns pivoted as published; the year-grain
-- unpivot happens in core_us_sf_population. _source/_source_url provenance
-- columns are stamped by sync_census_popest.py from configs/countries/us.yaml.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_sf_raw', 'us_census_population_places') }}
    WHERE SUMLEV = '162'
      AND STATE = '06'
      AND PLACE = '67000'
)

SELECT
    NAME                                        AS area_name,
    STNAME                                      AS state_name,
    SAFE_CAST(ESTIMATESBASE2020 AS INT64)       AS estimates_base_2020,
    SAFE_CAST(POPESTIMATE2020 AS INT64)         AS popestimate_2020,
    SAFE_CAST(POPESTIMATE2021 AS INT64)         AS popestimate_2021,
    SAFE_CAST(POPESTIMATE2022 AS INT64)         AS popestimate_2022,
    SAFE_CAST(POPESTIMATE2023 AS INT64)         AS popestimate_2023,
    SAFE_CAST(POPESTIMATE2024 AS INT64)         AS popestimate_2024,
    SAFE_CAST(POPESTIMATE2025 AS INT64)         AS popestimate_2025,
    _source                                     AS source,
    _source_url                                 AS source_url,
    _synced_at
FROM source
