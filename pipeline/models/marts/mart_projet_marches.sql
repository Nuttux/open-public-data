-- =============================================================================
-- MART: Projet d'investissement ↔ Marchés publics (pour UI fiche projet)
--
-- Source: int_projet_marches
-- Grain: une ligne = un match (projet, marché).
-- =============================================================================
{{ config(materialized='table') }}

-- LEFT JOIN SIRENE pour combler `fournisseur_nom` quand vide
-- (remplace apply_sirene_to_marches.py).
WITH base AS (
    SELECT * FROM {{ ref('int_projet_marches') }}
    WHERE numero_marche IS NOT NULL
      AND numero_marche != ''
),
sirene AS (
    SELECT siren, nom FROM {{ ref('core_sirene_companies') }}
),
joined AS (
    SELECT
        b.*,
        s.nom AS sirene_nom
    FROM base b
    LEFT JOIN sirene s
      ON LENGTH(b.fournisseur_siret) = 14
     AND SUBSTR(b.fournisseur_siret, 1, 9) = s.siren
)

SELECT
    projet_id,
    projet_year,
    projet_nom,
    projet_montant,
    projet_arr,

    numero_marche,
    COALESCE(
        NULLIF(TRIM(fournisseur_nom), ''),
        NULLIF(TRIM(sirene_nom), '')
    ) AS fournisseur_nom,
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
FROM joined
ORDER BY projet_id, score DESC
