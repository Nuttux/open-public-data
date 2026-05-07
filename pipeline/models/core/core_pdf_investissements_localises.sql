-- =============================================================================
-- Core: investissements localisés (extraction PDF Annexe IL)
--
-- Source: stg_pdf_investissements_localises
-- Grain: une ligne par projet
--
-- Aucun enrichissement supplémentaire ici (le projet a déjà arrondissement,
-- montant, chapitre, type_ap depuis l'extraction Gemini). On expose les
-- métadonnées d'extraction au même grain pour permettre l'agrégation côté mart.
-- =============================================================================

{{ config(materialized='table', schema='analytics', tags=['core','investissements','pdf']) }}

SELECT
    annee_publication,
    source,
    extraction_date,
    pages_traitees,
    pages_il,
    total_attendu_m_eur,
    ecart_pourcent,
    validation_ok,
    projet_id,
    annee,
    arrondissement,
    chapitre_code,
    chapitre_libelle,
    nom_projet,
    montant,
    type_ap,
    confidence,
    source_page,
    source_pdf,
    date_extraction
FROM {{ ref('stg_pdf_investissements_localises') }}
