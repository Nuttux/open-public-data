{{ config(tags=['cross_layer']) }}
{# mart_hors_bilan doit préserver row count + sum(capital_restant) de core_dette_garantie. #}
WITH mart AS (
    SELECT
        COUNT(*) AS n,
        ROUND(SUM(capital_restant), 0) AS s
    FROM {{ ref('mart_hors_bilan') }}
),
core AS (
    SELECT
        COUNT(*) AS n,
        ROUND(SUM(capital_restant), 0) AS s
    FROM {{ ref('core_dette_garantie') }}
)
SELECT mart.n AS mart_n, core.n AS core_n,
       mart.s AS mart_s, core.s AS core_s
FROM mart, core
WHERE mart.n != core.n OR ABS(mart.s - core.s) > 1
