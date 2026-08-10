{{ config(materialized='view', schema='staging', tags=['staging','deliberations']) }}

SELECT
    SAFE_CAST(session_id AS INT64) AS session_id,
    generated_at,
    source,
    SAFE_CAST(nb_delibs AS INT64) AS nb_delibs,
    SAFE_CAST(nb_articles AS INT64) AS nb_articles
FROM {{ source('paris_raw', 'deliberations_sessions_paris') }}
