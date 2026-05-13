{{ config(tags=['referential_integrity']) }}
{# Phase 16 du refactor : int_ap_projets_enrichis aplati dans core_ap_projets.
   Le core ne doit pas multiplier les lignes vs stg (les joins de seeds
   doivent être 1:1 ou 1:N filtré). Tolère 0 % d'écart. #}
WITH stg AS (SELECT COUNT(*) AS n FROM {{ ref('stg_ap_projets') }}),
     core AS (SELECT COUNT(*) AS n FROM {{ ref('core_ap_projets') }})
SELECT stg.n AS stg_count, core.n AS core_count
FROM stg, core
WHERE stg.n != core.n
