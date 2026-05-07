{{
  config(
    materialized='table',
    tags=['national', 'mart']
  )
}}

/*
  Mart: marchés publics national, granularité ligne (top 100 par ville × année)

  Consommé par: pipeline/scripts/export/export_national.py (export_marches)
    → website/public/data/communes/<slug>/marches_<year>.json (clé top_marches)

  Source: core_marches_national. Pas de transformation — fixe le contrat de
  colonnes pour l'export et garantit l'ordre.
*/

SELECT
    commune_slug,
    commune_nom,
    marche_id,
    acheteur_siret,
    acheteur_nom,
    objet,
    nature_marche,
    type_procedure,
    code_cpv,
    cpv_division,
    montant,
    forme_prix,
    date_notification,
    annee,
    duree_mois,
    titulaire_nom,
    titulaire_siret,
    categorie_cpv
FROM {{ ref('core_marches_national') }}
ORDER BY commune_slug, annee, montant DESC
