{{ config(tags=['cross_layer']) }}
{# mart_bilan_comptable est un passthrough strict de core_bilan_comptable
   (slice de colonnes + ORDER BY). Doit préserver row count et SUM(montant_net). #}
WITH mart AS (
    SELECT COUNT(*) AS n, ROUND(SUM(montant_net), 0) AS s
    FROM {{ ref('mart_bilan_comptable') }}
),
core AS (
    SELECT COUNT(*) AS n, ROUND(SUM(montant_net), 0) AS s
    FROM {{ ref('core_bilan_comptable') }}
)
SELECT mart.n AS mart_n, core.n AS core_n, mart.s AS mart_s, core.s AS core_s
FROM mart, core
WHERE mart.n != core.n OR ABS(mart.s - core.s) > 1
