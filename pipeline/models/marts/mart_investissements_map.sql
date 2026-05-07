-- =============================================================================
-- Mart: investissements (AP) row-level pour la carte
--
-- Consommé par: pipeline/scripts/export/export_map_data.py
--   → website/public/data/map/investissements_{year}.json
--   → website/public/data/map/investissements_index.json
--
-- Source: core_ap_projets (déjà enrichi par int_ap_projets_enrichis via
-- la cascade de géocodage). Ce mart fixe le contrat de colonnes pour l'export.
--
-- Filtre: annee >= 2018 (avant ce seuil, les données ne sont pas exposées dans la carte)
-- =============================================================================

-- Mart "thin" : filter (annee>=2018) + projection + ORDER BY stable.
-- View pour éviter la matérialisation redondante avec core_ap_projets.
{{ config(materialized='view', schema='marts', tags=['mart','map','investissements','thin']) }}

SELECT
    annee,
    ap_code,
    ap_texte,
    mission_code,
    mission_libelle,
    direction_code,
    direction,
    nature_code,
    fonction_code,
    montant,
    cle_technique,
    -- Colonnes enrichies par la cascade géo (ode_*)
    ode_arrondissement,
    ode_adresse,
    ode_latitude,
    ode_longitude,
    ode_type_equipement,
    ode_nom_lieu,
    ode_source_geo,
    ode_confiance
FROM {{ ref('core_ap_projets') }}
WHERE annee >= 2018
