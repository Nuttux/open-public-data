-- =============================================================================
-- Staging: Census Bureau Vintage 2025 population estimates — national row
--
-- Source: raw.us_census_population (NST-EST2025-ALLDATA.csv, all strings)
-- Grain:  one row (SUMLEV '010' = United States)
--
-- Keeps the July 1 estimate columns pivoted as published; the year-grain
-- unpivot happens in core_us_population. _source/_source_url provenance
-- columns are stamped by sync_census_popest.py from configs/countries/us.yaml.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_raw', 'us_census_population') }}
    WHERE SUMLEV = '010'  -- national row only
)

SELECT
    NAME                                        AS area_name,
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
