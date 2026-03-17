{{
  config(
    materialized='table',
    tags=['national', 'marts']
  )
}}

/*
  Mart: Subventions Nationales

  Agrégation par (commune_slug, annee) pour treemap et tendances.
*/

WITH subventions AS (
    SELECT *
    FROM {{ ref('core_subventions_national') }}
)

SELECT
    commune_slug,
    commune_nom,
    annee,

    COUNT(*) AS nb_subventions,
    SUM(montant) AS montant_total,
    AVG(montant) AS montant_moyen,
    MAX(montant) AS montant_max,
    COUNT(DISTINCT beneficiaire_normalise) AS nb_beneficiaires_uniques

FROM subventions
GROUP BY ALL
ORDER BY commune_slug, annee
