-- =============================================================================
-- Staging: Fiscal Data machine-readable catalog snapshot
--
-- Source: raw.us_fiscaldata_catalog (services/dtg/metadata/, synced for the
--         endpoints declared in configs/countries/us.yaml)
-- Grain:  (endpoint, column_name)
--
-- Carries the provenance metadata used downstream instead of hardcoding it:
-- dataset page URL on fiscaldata.treasury.gov, row definitions, per-field
-- labels and data types, coverage dates and update cadence.
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('us_raw', 'us_fiscaldata_catalog') }}
)

SELECT
    source_id,
    dataset_id,
    dataset_title,
    dataset_page_url,
    publisher,
    {{ us_fd_int('api_id') }}          AS api_id,
    table_name,
    table_description,
    row_definition,
    endpoint,
    update_frequency,
    {{ us_fd_date('api_last_updated') }} AS api_last_updated,
    {{ us_fd_date('earliest_date') }}  AS earliest_date,
    {{ us_fd_date('latest_date') }}    AS latest_date,
    {{ us_fd_int('row_count') }}       AS row_count,
    column_name,
    pretty_name,
    definition,
    data_type,
    (is_required = '1')                AS is_required,
    _synced_at
FROM source
