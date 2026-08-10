-- =============================================================================
-- Mart: deliberations row-level (article × session) pour l'export
--
-- Consommé par: pipeline/scripts/export/export_deliberations.py
--   → website/public/data/subventions_delibs/session_{session_id}.json
--
-- Source: core_deliberations
-- Grain: ligne article. L'export reconstruit la structure imbriquée
-- (sessions → delibs → articles) côté Python.
-- =============================================================================

{{ config(materialized='table', schema='marts', tags=['mart','deliberations']) }}

SELECT
    session_id,
    session_generated_at,
    session_source,
    session_nb_delibs,
    session_nb_articles,
    delib_id,
    delib_id_entite,
    delib_title,
    direction_id,
    direction_name,
    article_num,
    beneficiary,
    siret,
    amount_eur,
    amount_raw,
    motif,
    dossier
FROM {{ ref('core_deliberations') }}
ORDER BY session_id, delib_id, article_num
