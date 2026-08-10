{{ config(materialized='view', schema='staging', tags=['staging','deliberations']) }}

SELECT
    SAFE_CAST(session_id AS INT64) AS session_id,
    delib_id,
    SAFE_CAST(direction_id AS INT64) AS direction_id,
    direction_name,
    article_num,
    beneficiary,
    siret,
    SAFE_CAST(amount_eur AS FLOAT64) AS amount_eur,
    amount_raw,
    motif,
    dossier
FROM {{ source('paris_raw', 'deliberations_articles_paris') }}
