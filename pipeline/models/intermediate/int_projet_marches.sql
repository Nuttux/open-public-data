-- =============================================================================
-- Intermediate: Projet d'investissement ↔ Marchés publics (jointure probable)
--
-- Source: seed_match_projet_marches (généré par Claude via
-- pipeline/scripts/enrich/match_projet_marches.py + score_projet_marches.py).
-- Jointure ENRICHIE avec core_marches_publics pour récupérer les champs DECP
-- (CCAG, CPV famille, lieu exécution, date notification).
--
-- Grain: une ligne = une paire (projet, marché), score >= 0.60 OU no_match.
--
-- ⚠️ Les matchs sont FAITS PAR HEURISTIQUES (match tokens + score pondéré),
-- pas par une clé de jointure dure. Un marché peut être attribué à tort.
-- Afficher côté UI avec disclaimer "rapprochement automatique".
-- =============================================================================
{{ config(materialized='view') }}

WITH seed AS (
    SELECT *
    FROM {{ ref('stg_match_projet_marches') }}
),

marches AS (
    SELECT
        numero_marche,
        objet                        AS marche_objet_full,
        fournisseur_nom              AS marche_fournisseur_nom,
        fournisseur_siret            AS marche_fournisseur_siret,
        date_notification            AS marche_date_notification,
        duree_jours                  AS marche_duree_jours,
        montant_max                  AS marche_montant_max,
        decp_montant_notifie         AS marche_montant_notifie,
        decp_ccag                    AS marche_ccag,
        decp_cpv_famille             AS marche_cpv_famille,
        decp_lieu_execution_lisible  AS marche_lieu_execution
    FROM {{ ref('core_marches_publics') }}
)

SELECT
    s.projet_id,
    s.projet_year,
    s.projet_nom,
    s.projet_montant,
    s.projet_arr,
    s.numero_marche,
    s.score,
    s.label,
    s.reason,

    -- Depuis le core (source de vérité pour les champs marché)
    COALESCE(m.marche_fournisseur_nom, s.fournisseur_nom) AS fournisseur_nom,
    COALESCE(m.marche_fournisseur_siret, s.fournisseur_siret) AS fournisseur_siret,
    COALESCE(m.marche_objet_full, s.marche_objet) AS marche_objet,
    s.marche_annee,
    COALESCE(m.marche_montant_max, s.marche_montant) AS marche_montant_max,
    m.marche_montant_notifie,
    m.marche_date_notification,
    m.marche_duree_jours,
    m.marche_ccag,
    m.marche_cpv_famille,
    m.marche_lieu_execution

FROM seed s
LEFT JOIN marches m USING (numero_marche)
