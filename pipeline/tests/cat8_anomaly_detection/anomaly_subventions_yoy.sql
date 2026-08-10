{{ config(tags=['anomaly_detection']) }}
{# Variation YoY du total subventions ne doit pas dépasser ±50 %.
   Un swing de cette ampleur signale soit une réforme structurelle
   (ex 2020-2021 anonymisation) soit une régression du sync.

   On exclut 2020-2021 du test parce que les noms y sont anonymisés
   par OpenData Paris (pas un bug). #}

WITH yearly AS (
    SELECT annee, SUM(montant) AS total
    FROM {{ ref('core_subventions') }}
    WHERE annee NOT IN (2020, 2021)
    GROUP BY annee
),
with_lag AS (
    SELECT
        annee,
        total,
        LAG(total) OVER (ORDER BY annee) AS prev_total
    FROM yearly
)
SELECT annee, total, prev_total,
       SAFE_DIVIDE(total - prev_total, prev_total) AS yoy_change
FROM with_lag
WHERE prev_total IS NOT NULL
  AND ABS(SAFE_DIVIDE(total - prev_total, prev_total)) > 0.50
