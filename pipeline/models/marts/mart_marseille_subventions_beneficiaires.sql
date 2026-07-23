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

        -- "Dominant grant wins" (cf. Paris mart) : valeur de la ligne au plus
        -- gros montant, IGNORE NULLS, déterministe. Corrige MAX(siret) qui
        -- renvoyait un identifiant arbitraire.
        ARRAY_AGG(nature_juridique IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS nature_juridique,
        ARRAY_AGG(direction IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS direction,
        ARRAY_AGG(secteurs_activite IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS secteurs_activite,
        ARRAY_AGG(ode_thematique IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS thematique,
        ARRAY_AGG(ode_sous_categorie IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS sous_categorie,
        ARRAY_AGG(ode_source_thematique IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS source_thematique,

        SUM(montant) AS montant_total,
        COUNT(*) AS nb_subventions,

        ARRAY_AGG(objet IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS objet_principal,
        ARRAY_AGG(siret IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS siret

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
