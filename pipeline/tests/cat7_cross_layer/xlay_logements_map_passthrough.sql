{{ config(tags=['cross_layer']) }}
{# mart_logements_map et mart_investissements_map sont des passthrough.
   Doivent préserver le row count exact de leur core. #}
WITH logements_mart AS (SELECT COUNT(*) AS n FROM {{ ref('mart_logements_map') }}),
     logements_core AS (SELECT COUNT(*) AS n FROM {{ ref('core_logements_sociaux') }}),
     invest_mart    AS (SELECT COUNT(*) AS n FROM {{ ref('mart_investissements_map') }}),
     invest_core    AS (
         SELECT COUNT(*) AS n FROM {{ ref('core_ap_projets') }}
         WHERE annee >= 2018  -- mart_investissements_map filtre annee >= 2018
     )
SELECT 'logements' AS dataset, logements_mart.n AS mart_n, logements_core.n AS core_n
FROM logements_mart, logements_core
WHERE logements_mart.n != logements_core.n
UNION ALL
SELECT 'investissements', invest_mart.n, invest_core.n
FROM invest_mart, invest_core
WHERE invest_mart.n != invest_core.n
