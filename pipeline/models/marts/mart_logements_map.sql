-- =============================================================================
-- Mart: logements sociaux row-level pour la carte
--
-- Consommé par: pipeline/scripts/export/export_map_data.py
--   → website/public/data/map/logements_{year}.json
--   → website/public/data/map/logements_index.json
--
-- Source: core_logements_sociaux (déjà géolocalisée à la source).
-- =============================================================================

-- Mart "thin" : projection + ORDER BY stable. View pour éviter la
-- matérialisation redondante avec core_logements_sociaux.
{{ config(materialized='view', schema='marts', tags=['mart','map','logements','thin']) }}

SELECT
    id_livraison,
    annee,
    adresse,
    code_postal,
    arrondissement,
    latitude,
    longitude,
    bailleur,
    nb_logements,
    nb_plai,
    nb_plus,
    nb_pluscd,
    nb_pls,
    nature_programme,
    mode_realisation,
    commentaires,
    cle_technique
FROM {{ ref('core_logements_sociaux') }}
