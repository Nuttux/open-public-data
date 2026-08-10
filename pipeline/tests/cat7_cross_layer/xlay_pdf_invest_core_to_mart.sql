{{ config(tags=['cross_layer']) }}
{# mart_investissements_localises doit préserver row count + sum(montant)
   de core_pdf_investissements_localises. #}
WITH mart AS (
    SELECT
        COUNT(*) AS n,
        ROUND(SUM(montant), 0) AS s
    FROM {{ ref('mart_investissements_localises') }}
),
core AS (
    SELECT
        COUNT(*) AS n,
        ROUND(SUM(montant), 0) AS s
    FROM {{ ref('core_pdf_investissements_localises') }}
)
SELECT mart.n AS mart_n, core.n AS core_n,
       mart.s AS mart_s, core.s AS core_s
FROM mart, core
WHERE mart.n != core.n OR ABS(mart.s - core.s) > 1
