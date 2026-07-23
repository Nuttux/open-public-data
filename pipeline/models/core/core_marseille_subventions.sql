-- =============================================================================
-- Core: Marseille subventions (OBT, une ligne par subvention)
--
-- Sources:
--   - stg_marseille_subventions        (lignes SCDL normalisées)
--   - stg_marseille_cache_thematique   (thematique in-session, clé beneficiaire_normalise)
--
-- Contrairement à core_subventions (Paris), la cascade de classification est
-- faite EN AMONT dans enrich_thematique_marseille.py (grounded secteur → keyword
-- → nature → default), pas ici — le cache porte déjà la thematique finale. Le
-- SCDL Marseille n'a NI siret NI direction NI secteurs d'activité (colonnes
-- exposées à NULL pour aligner le schéma sur core_subventions et réutiliser les
-- marts + l'exporter partagés).
--
-- Convention ode_* alignée sur core_subventions.
-- =============================================================================

{{ config(materialized='table', schema='analytics', tags=['core', 'marseille', 'subventions']) }}

WITH subventions AS (
    SELECT * FROM {{ ref('stg_marseille_subventions') }}
),

cache_thematique AS (
    SELECT * FROM {{ ref('stg_marseille_cache_thematique') }}
),

joined AS (
    SELECT
        s.*,
        c.ode_thematique AS cache_thematique,
        c.ode_sous_categorie AS cache_sous_categorie,
        c.ode_source AS cache_source
    FROM subventions s
    LEFT JOIN cache_thematique c
        ON s.beneficiaire_normalise = c.beneficiaire_normalise
)

SELECT
    annee,
    beneficiaire,
    beneficiaire_normalise,
    categorie,
    nature_juridique,
    montant,
    prestations_nature,
    collectivite,
    commune_slug,
    donnees_disponibles,
    cle_technique,

    -- Pas de ces dimensions dans le SCDL Marseille (schéma aligné Paris → NULL).
    CAST(NULL AS STRING) AS siret,
    CAST(NULL AS STRING) AS direction,
    CAST(NULL AS STRING) AS secteurs_activite,
    objet,

    COALESCE(cache_thematique, 'Non classifié') AS ode_thematique,
    cache_sous_categorie AS ode_sous_categorie,
    COALESCE(cache_source, 'default') AS ode_source_thematique,

    CASE nature_juridique
        WHEN 'Etablissements publics' THEN 'public'
        WHEN 'Etablissements de droit public' THEN 'public'
        WHEN 'Etat' THEN 'public'
        WHEN 'Communes' THEN 'public'
        WHEN 'Départements' THEN 'public'
        WHEN 'Régions' THEN 'public'
        WHEN 'Autres personnes de droit public' THEN 'public'
        WHEN 'Associations' THEN 'association'
        WHEN 'Entreprises' THEN 'entreprise'
        WHEN 'Personnes physiques' THEN 'personne_physique'
        WHEN 'Autres personnes de droit privé' THEN 'prive_autre'
        WHEN 'Autres' THEN 'autre'
        ELSE 'non_renseigne'
    END AS ode_type_organisme,

    CASE
        WHEN prestations_nature IS NOT NULL AND prestations_nature > 0 THEN TRUE
        ELSE FALSE
    END AS ode_contribution_nature,

    beneficiaire_normalise AS ode_beneficiaire_canonique,

    CURRENT_TIMESTAMP() AS _dbt_updated_at

FROM joined
