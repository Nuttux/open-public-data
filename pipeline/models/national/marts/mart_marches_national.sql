{{
  config(
    enabled=true,
    materialized='table',
    tags=['national', 'marts']
  )
}}

/*
  Mart: marchés publics national (source d'export, row-level)

  Une ligne = 1 marché attribué à une commune. L'exporteur
  (export_marches_national.py) lit ces lignes filtrées par code_insee et agrège
  (total, par année, top titulaires, par catégorie CPV, couverture).
*/

SELECT
    code_insee,
    commune_nom,
    population,
    annee,
    montant,
    categorie_cpv,
    cpv_division,
    type_procedure,
    objet,
    titulaire_nom,
    duree_mois
FROM {{ ref('core_marches_national') }}
WHERE montant > 0
