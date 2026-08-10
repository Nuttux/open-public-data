-- =============================================================================
-- Staging: DataSF Socrata catalog snapshot — typed, one-to-one with raw
--
-- Source: raw.us_sf_catalog (one row per synced dataset × column, from
--         /api/views/<id>.json — snapshotted by sync_socrata.py each run)
--
-- Provenance source of truth for SF marts/exports: dataset display name,
-- data.sfgov.org dataset page URL, rows_updated_at (the portal's refresh
-- timestamp — becomes `as_of` in the export contract) and per-column
-- display names/types. Same pattern as stg_us_fiscaldata_catalog.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_sf_raw', 'us_sf_catalog') }}
)

SELECT
    source_id,
    dataset_id,
    dataset_name,
    dataset_description,
    dataset_page_url,
    domain,
    portal_name,
    attribution,
    category,
    SAFE_CAST(rows_updated_at AS TIMESTAMP)    AS rows_updated_at,
    SAFE_CAST(created_at AS TIMESTAMP)         AS created_at,
    SAFE_CAST(publication_date AS TIMESTAMP)   AS publication_date,
    column_field_name,
    column_display_name,
    column_data_type,
    column_description,
    SAFE_CAST(column_position AS INT64)        AS column_position,
    _synced_at
FROM source
