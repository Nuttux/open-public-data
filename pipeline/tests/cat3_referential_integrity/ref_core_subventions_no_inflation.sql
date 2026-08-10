{{ config(tags=['referential_integrity']) }}
{# Phase 16 : core_subventions = stg_subventions_all + joins seeds.
   Les LEFT JOIN ne doivent pas multiplier les lignes (la dédup associations
   garantit 1:1 sur (beneficiaire_normalise, annee)). #}
WITH stg AS (SELECT COUNT(*) AS n FROM {{ ref('stg_subventions_all') }}),
     core AS (SELECT COUNT(*) AS n FROM {{ ref('core_subventions') }})
SELECT stg.n AS stg_count, core.n AS core_count
FROM stg, core
WHERE stg.n != core.n
