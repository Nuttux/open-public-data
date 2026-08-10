-- =============================================================================
-- Mart: tension logement social par arrondissement (file d'attente DRIHL)
--
-- Consommé par: pipeline/scripts/export/export_logement_attente.py
--   → website/public/data/logement_attente_paris.json
-- Source: core_logement_attente_arr
-- Grain: code_insee × annee (Paris global + 75056 + 75101..75120)
--
-- Sélection et ordre déterministes pour stabilité du JSON exporté.
-- Aucune agrégation : core est déjà à la maille finale.
-- =============================================================================

-- Mart "thin" : fixe le contrat de colonnes pour l'export. PAS d'ORDER BY :
-- BigQuery ne préserve pas l'ORDER BY d'une VIEW dans le outer SELECT.
-- Si l'export a besoin d'ordre déterministe, il doit faire son propre
-- ORDER BY (cf. ADR-0003 v2).
{{ config(materialized='view', schema='marts', tags=['mart','logement','thin']) }}

SELECT
    code_insee,
    nom,
    scope,
    arrondissement,
    annee,
    demandes_choix1,
    attributions,
    ratio_dem_attrib,
    delai_median_attribution_mois,
    part_anciennete_5ans_plus,
    rang_tension,
    source,
    source_url
FROM {{ ref('core_logement_attente_arr') }}
