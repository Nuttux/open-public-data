-- =============================================================================
-- MART: Marseille subventions bénéficiaires
--
-- Miroir de mart_subventions_beneficiaires (Paris), lit core_marseille_subventions.
-- Grain: (annee, beneficiaire, beneficiaire_normalise). direction/secteurs/siret
-- sont NULL (absents du SCDL Marseille). Consommé par export_subventions_data.py
-- --city marseille --table-prefix marseille_.
-- =============================================================================

{{ config(materialized='table', schema='marts', tags=['mart', 'subventions', 'marseille']) }}

WITH subventions AS (
    SELECT *
    FROM {{ ref('core_marseille_subventions') }}
    WHERE donnees_disponibles = TRUE
      AND montant > 0
),

aggregees AS (
    SELECT
        annee,
        beneficiaire,
        beneficiaire_normalise,

        MAX(nature_juridique) AS nature_juridique,
        MAX(direction) AS direction,
        MAX(secteurs_activite) AS secteurs_activite,
        MAX(ode_thematique) AS thematique,
        MAX(ode_sous_categorie) AS sous_categorie,
        MAX(ode_source_thematique) AS source_thematique,

        SUM(montant) AS montant_total,
        COUNT(*) AS nb_subventions,

        MAX(objet) AS objet_principal,
        MAX(siret) AS siret

    FROM subventions
    GROUP BY annee, beneficiaire, beneficiaire_normalise
)

SELECT
    *,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM aggregees
-- Deterministic tie-break (see Paris mart): equal montant_total must not
-- reshuffle between builds.
ORDER BY annee DESC, montant_total DESC, beneficiaire_normalise ASC, beneficiaire ASC
