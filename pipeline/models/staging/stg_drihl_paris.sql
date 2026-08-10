-- =============================================================================
-- Staging: DRIHL — file d'attente logement social Paris (snapshot 2024)
--
-- Source: seed_drihl_paris_2024
--   (XLSX DRIHL ingéré via pipeline/scripts/tools/extract_drihl_xlsx.py ;
--    types BQ déclarés dans dbt_project.yml seeds.column_types)
-- Grain: code_insee × annee (75 + 75056 + 75101..75120)
--
-- Wrapper de couche: existe pour que core_logement_attente_arr ne référence
-- pas un seed directement (règle layering raw → stg → core).
-- Pas de transformation (le seed est déjà propre et typé).
-- =============================================================================

{{ config(materialized='view', schema='staging', tags=['staging','logement']) }}

SELECT *
FROM {{ ref('seed_drihl_paris_2024') }}
