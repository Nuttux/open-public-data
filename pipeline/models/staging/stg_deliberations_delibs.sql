{{ config(materialized='view', schema='staging', tags=['staging','deliberations']) }}

SELECT
    SAFE_CAST(session_id AS INT64) AS session_id,
    delib_id,
    SAFE_CAST(id_entite AS INT64) AS id_entite,
    title,
    SAFE_CAST(direction_id AS INT64) AS direction_id,
    direction_name
FROM {{ source('paris_raw', 'deliberations_delibs_paris') }}
