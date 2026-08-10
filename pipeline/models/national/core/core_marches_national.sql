{{
  config(
    materialized='table',
    tags=['national', 'core']
  )
}}

/*
  Core: Marchés Publics National par ville

  Table dénormalisée des marchés publics DECP par ville.
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
    annee_notification AS annee,
    duree_mois,
    titulaire_nom,
    titulaire_siret,

    -- Classification CPV simplifiée
    CASE
        WHEN cpv_division IN ('09', '31', '65') THEN 'Énergie'
        WHEN cpv_division IN ('30', '32', '48', '72') THEN 'Informatique & Télécom'
        WHEN cpv_division IN ('33', '85') THEN 'Santé & Social'
        WHEN cpv_division IN ('34', '50', '60', '63') THEN 'Transport & Véhicules'
        WHEN cpv_division IN ('39', '44', '45') THEN 'Construction & Bâtiment'
        WHEN cpv_division IN ('55', '15', '03') THEN 'Alimentation & Restauration'
        WHEN cpv_division IN ('71', '79') THEN 'Services professionnels'
        WHEN cpv_division IN ('77', '90') THEN 'Environnement & Propreté'
        WHEN cpv_division IN ('22', '80') THEN 'Éducation & Formation'
        WHEN cpv_division IN ('92') THEN 'Culture & Loisirs'
        WHEN cpv_division IN ('75') THEN 'Administration publique'
        ELSE 'Autres'
    END AS categorie_cpv

FROM {{ ref('stg_decp_marches') }}
WHERE annee_notification IS NOT NULL
  AND montant > 0
