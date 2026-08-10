{{
  config(
    materialized='table',
    tags=['national', 'marts']
  )
}}

/*
  Mart: Marchés Publics National

  Agrégation par (commune_slug, annee, categorie_cpv) pour treemap.
*/

WITH marches AS (
    SELECT *
    FROM {{ ref('core_marches_national') }}
)

SELECT
    commune_slug,
    commune_nom,
    annee,
    categorie_cpv,

    COUNT(*) AS nb_marches,
    SUM(montant) AS montant_total,
    AVG(montant) AS montant_moyen,
    MAX(montant) AS montant_max,
    AVG(duree_mois) AS duree_moyenne_mois

FROM marches
GROUP BY ALL
ORDER BY commune_slug, annee, montant_total DESC
