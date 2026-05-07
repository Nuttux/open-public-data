{{ config(tags=['row_count']) }}
{# Plafonds et planchers de row count par core. Si la donnée brute est
   re-syncée et qu'un sync casse partiellement, on s'attend à voir le
   row count chuter en dehors du range — ce test flag immédiatement.

   Les ranges sont volontairement larges (×3) pour absorber les
   évolutions naturelles ; resserrer si on a besoin de plus de
   sensibilité (avec le risque de faux positifs). #}

WITH expectations AS (
    SELECT * FROM UNNEST([
        STRUCT('core_budget'                AS model, 15000 AS min_n,  80000 AS max_n),
        STRUCT('core_budget_vote'           AS model, 10000 AS min_n,  50000 AS max_n),
        STRUCT('core_subventions'           AS model, 30000 AS min_n,  80000 AS max_n),
        STRUCT('core_ap_projets'            AS model,  3000 AS min_n,  15000 AS max_n),
        STRUCT('core_marches_publics'       AS model, 10000 AS min_n,  30000 AS max_n),
        STRUCT('core_logements_sociaux'     AS model,  3000 AS min_n,  10000 AS max_n),
        STRUCT('core_dette_garantie'        AS model, 30000 AS min_n,  80000 AS max_n),
        STRUCT('core_deliberations'         AS model,  8000 AS min_n,  50000 AS max_n)
    ])
),
actual AS (
    SELECT 'core_budget' AS model, COUNT(*) AS n FROM {{ ref('core_budget') }}
    UNION ALL SELECT 'core_budget_vote', COUNT(*) FROM {{ ref('core_budget_vote') }}
    UNION ALL SELECT 'core_subventions', COUNT(*) FROM {{ ref('core_subventions') }}
    UNION ALL SELECT 'core_ap_projets', COUNT(*) FROM {{ ref('core_ap_projets') }}
    UNION ALL SELECT 'core_marches_publics', COUNT(*) FROM {{ ref('core_marches_publics') }}
    UNION ALL SELECT 'core_logements_sociaux', COUNT(*) FROM {{ ref('core_logements_sociaux') }}
    UNION ALL SELECT 'core_dette_garantie', COUNT(*) FROM {{ ref('core_dette_garantie') }}
    UNION ALL SELECT 'core_deliberations', COUNT(*) FROM {{ ref('core_deliberations') }}
)
SELECT a.model, a.n AS actual_count, e.min_n, e.max_n,
       CASE
         WHEN a.n < e.min_n THEN 'below_min'
         WHEN a.n > e.max_n THEN 'above_max'
       END AS status
FROM actual a
JOIN expectations e USING (model)
WHERE a.n < e.min_n OR a.n > e.max_n
