-- =============================================================================
-- Mart: Comparaison Budget Voté vs Budget Exécuté
--
-- Sources: core_budget (CA, exécuté) + core_budget_vote (BV, prévisionnel)
-- Description: JOIN des deux entités budgétaires pour analyse comparative.
--
-- OBJECTIF: Évaluer la fiabilité des prévisions budgétaires.
-- Pour chaque (annee, section, chapitre, sens_flux):
--   - Montant voté (BP) vs montant exécuté (CA)
--   - Taux d'exécution = Exécuté / Voté * 100
--   - Écart absolu et relatif
--
-- USAGE FRONTEND:
--   1. Page /prevision : classement des postes par écart
--   2. Estimation 2025-2026 : montant_vote * taux_execution_moyen_historique
--   3. Contexte électoral : transparence budgétaire
--
-- COUVERTURE:
--   - Comparaison possible: 2019-2024 (les deux sources existent)
--     * 2019: OpenData CSV
--     * 2020-2024: PDFs éditique BG (format legacy 2020-2022, croisée 2023-2024)
--   - Voté seul (prévisionnel): 2025-2026
--
-- Output: ~1,500 lignes
-- =============================================================================

WITH vote AS (
    -- Budget Voté (Budget Primitif) - agrégé au grain chapitre + thématique
    -- NB: on ne groupe PAS par chapitre_libelle ni ode_categorie_flux car
    -- la casse et les patterns nature diffèrent entre vote (PDF) et exécuté (CSV).
    -- Le libellé est récupéré séparément via ANY_VALUE.
    SELECT
        annee,
        section,
        sens_flux,
        chapitre_code,
        ANY_VALUE(chapitre_libelle) AS chapitre_libelle,
        ode_thematique,
        SUM(montant) AS montant_vote
    FROM {{ ref('core_budget_vote') }}
    GROUP BY annee, section, sens_flux, chapitre_code, ode_thematique
),

execute AS (
    -- Budget Exécuté (Compte Administratif) - même grain que vote
    SELECT
        annee,
        section,
        sens_flux,
        chapitre_code,
        ANY_VALUE(chapitre_libelle) AS chapitre_libelle,
        ode_thematique,
        SUM(montant) AS montant_execute
    FROM {{ ref('core_budget') }}
    GROUP BY annee, section, sens_flux, chapitre_code, ode_thematique
),

-- =============================================================================
-- FULL JOIN au grain (annee, section, sens_flux, chapitre, thematique)
-- Toutes les clés du GROUP BY sont dans le JOIN → pas de produit cartésien
-- =============================================================================
combined AS (
    SELECT
        COALESCE(v.annee, e.annee) AS annee,
        COALESCE(v.section, e.section) AS section,
        COALESCE(v.sens_flux, e.sens_flux) AS sens_flux,
        COALESCE(v.chapitre_code, e.chapitre_code) AS chapitre_code,
        COALESCE(v.chapitre_libelle, e.chapitre_libelle) AS chapitre_libelle,
        COALESCE(v.ode_thematique, e.ode_thematique) AS ode_thematique,
        
        -- Montants
        v.montant_vote,
        e.montant_execute,
        
        -- Taux d'exécution (NULL si voté seul)
        SAFE_DIVIDE(e.montant_execute, v.montant_vote) * 100 AS taux_execution_pct,
        
        -- Écart absolu (Exécuté - Voté)
        (e.montant_execute - v.montant_vote) AS ecart_absolu,
        
        -- Écart relatif en %
        SAFE_DIVIDE(e.montant_execute - v.montant_vote, v.montant_vote) * 100 AS ecart_relatif_pct,
        
        -- Flags
        (v.montant_vote IS NOT NULL AND e.montant_execute IS NOT NULL) AS comparaison_possible,
        (v.montant_vote IS NOT NULL AND e.montant_execute IS NULL) AS vote_seul  -- 2025-2026
        
    FROM vote v
    FULL OUTER JOIN execute e
        ON v.annee = e.annee
        AND v.section = e.section
        AND v.sens_flux = e.sens_flux
        AND v.chapitre_code = e.chapitre_code
        AND v.ode_thematique = e.ode_thematique
),

-- =============================================================================
-- Taux d'exécution moyen historique par poste (pour estimation 2025-2026)
-- =============================================================================
taux_historique AS (
    SELECT
        section,
        sens_flux,
        chapitre_code,
        ode_thematique,
        ROUND(AVG(taux_execution_pct), 2) AS taux_execution_moyen,
        ROUND(STDDEV(taux_execution_pct), 2) AS taux_execution_stddev,
        COUNT(*) AS nb_annees_comparees,
        MIN(annee) AS premiere_annee,
        MAX(annee) AS derniere_annee
    FROM combined
    WHERE comparaison_possible = TRUE
    GROUP BY 1, 2, 3, 4
),

-- =============================================================================
-- Résultat final : combine données annuelles + taux historique
-- =============================================================================
final AS (
    SELECT
        c.*,
        
        -- Taux historique pour ce poste
        th.taux_execution_moyen,
        th.taux_execution_stddev,
        th.nb_annees_comparees,
        
        -- Estimation du montant exécuté (pour 2025-2026)
        -- = montant_vote * taux_execution_moyen_historique / 100
        CASE
            WHEN c.vote_seul = TRUE AND th.taux_execution_moyen IS NOT NULL
            THEN c.montant_vote * th.taux_execution_moyen / 100
            ELSE NULL
        END AS montant_estime,
        
        -- Confiance de l'estimation (basée sur nombre d'années et variance)
        CASE
            WHEN th.nb_annees_comparees >= 4 AND th.taux_execution_stddev < 10 THEN 'haute'
            WHEN th.nb_annees_comparees >= 3 THEN 'moyenne'
            WHEN th.nb_annees_comparees >= 1 THEN 'basse'
            ELSE NULL
        END AS confiance_estimation,
        
        CURRENT_TIMESTAMP() AS _dbt_updated_at
        
    FROM combined c
    LEFT JOIN taux_historique th
        ON c.section = th.section
        AND c.sens_flux = th.sens_flux
        AND c.chapitre_code = th.chapitre_code
        AND c.ode_thematique = th.ode_thematique
)

SELECT * FROM final
