-- =============================================================================
-- Mart: investissements localisés (extraction PDF Annexe IL)
--
-- Consommé par: pipeline/scripts/export/export_investissements_localises.py
--   → website/public/data/map/investissements_localises_{year}.json
--   → website/public/data/map/investissements_localises_index.json
--
-- Source: core_pdf_investissements_localises
-- Grain: ligne projet, ordonnée par (annee_publication, montant DESC) pour
-- une sortie JSON déterministe.
-- =============================================================================

-- Mart "thin" : projection + ORDER BY stable.
{{ config(materialized='view', schema='marts', tags=['mart','investissements','pdf','thin']) }}

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
FROM {{ ref('core_pdf_investissements_localises') }}
