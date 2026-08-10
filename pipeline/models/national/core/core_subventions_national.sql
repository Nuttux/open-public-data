{{
  config(
    materialized='table',
    tags=['national', 'core']
  )
}}

/*
  Core: Subventions Nationales par ville

  Table dénormalisée des subventions > 23k€ par ville.
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

FROM {{ ref('stg_subventions_nat') }}
WHERE annee IS NOT NULL
  AND montant > 0
