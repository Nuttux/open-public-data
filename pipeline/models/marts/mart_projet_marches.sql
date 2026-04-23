-- =============================================================================
-- MART: Projet d'investissement ↔ Marchés publics (pour UI fiche projet)
--
-- Source: int_projet_marches
-- Grain: une ligne = un match (projet, marché).
-- =============================================================================
{{ config(materialized='table') }}

SELECT
    projet_id,
    projet_year,
    projet_nom,
    projet_montant,
    projet_arr,

    numero_marche,
    fournisseur_nom,
    fournisseur_siret,
    marche_objet,
    marche_annee,
    marche_montant_max,
    marche_montant_notifie,
    marche_date_notification,
    marche_duree_jours,
    marche_ccag,
    marche_cpv_famille,
    marche_lieu_execution,

    score,
    label,
    reason,

    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM {{ ref('int_projet_marches') }}
WHERE numero_marche IS NOT NULL
  AND numero_marche != ''
ORDER BY projet_id, score DESC
