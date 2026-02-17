{{ config(tags=['cross_layer']) }}
SELECT stg_count, int_count
FROM (
    SELECT
        (SELECT COUNT(*) FROM {{ ref('stg_ap_projets') }}) AS stg_count,
        (SELECT COUNT(*) FROM {{ ref('int_ap_projets_enrichis') }}) AS int_count
)
WHERE int_count > stg_count
