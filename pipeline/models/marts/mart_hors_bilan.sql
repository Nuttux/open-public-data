-- =============================================================================
-- Mart: hors bilan (emprunts garantis Paris) — slice row-level pour l'export
--
-- Consommé par: pipeline/scripts/export/export_hors_bilan.py
--   → website/public/data/hors_bilan_{year}.json
--
-- Source: core_dette_garantie. La JSON-shape de l'export embarque plusieurs
-- top-N imbriqués (top_beneficiaires avec emprunts_top + preteurs nestés,
-- by_arrondissement avec top_emprunts + top_benefs, etc.) que SQL ne sait
-- exprimer qu'en pyramide d'arrays — l'agrégation reste en Python côté
-- export. Ce mart fixe le contrat de colonnes.
-- =============================================================================

-- Mart "thin" : projection + ORDER BY stable. L'agrégation reste en Python
-- (export hors_bilan), donc ce mart sert de contrat de colonnes uniquement.
{{ config(materialized='view', schema='marts', tags=['mart','hors_bilan','thin']) }}

SELECT
    annee,
    nature,
    annee_mobilisation,
    beneficiaire,
    objet,
    preteur,
    montant_initial,
    capital_restant,
    duree_residuelle,
    taux_type,
    taux_index,
    taux_actuariel,
    annuite_interets,
    annuite_capital,
    bucket_nature,
    arrondissement,
    is_taux_fixe,
    source_url
FROM {{ ref('core_dette_garantie') }}
