{{
  config(
    materialized='table',
    tags=['national', 'mart']
  )
}}

/*
  Mart: subventions national, granularité ligne (top N par ville × année)

  Consommé par: pipeline/scripts/export/export_national.py (export_subventions)
    → website/public/data/communes/<slug>/subventions_<year>.json (clé top_subventions)

  Source: core_subventions_national. Pas de transformation — fixe le contrat
  de colonnes pour l'export.
*/

SELECT
    commune_slug,
    commune_nom,
    nom_attribuant,
    siret_attribuant,
    nom_beneficiaire,
    siret_beneficiaire,
    beneficiaire_normalise,
    objet,
    montant,
    nature_subvention,
    date_convention,
    annee,
    conditions_versement,
    pourcentage_subvention
FROM {{ ref('core_subventions_national') }}
ORDER BY commune_slug, annee, montant DESC
