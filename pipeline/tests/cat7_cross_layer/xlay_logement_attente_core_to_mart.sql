{{ config(tags=['cross_layer']) }}
{# mart_logement_attente doit préserver le row count de core_logement_attente_arr.
   Tolérance: 0 (passthrough exact). #}
WITH mart AS (
    SELECT COUNT(*) AS n FROM {{ ref('mart_logement_attente') }}
),
core AS (
    SELECT COUNT(*) AS n FROM {{ ref('core_logement_attente_arr') }}
)
SELECT mart.n AS mart_n, core.n AS core_n
FROM mart, core
WHERE mart.n != core.n
