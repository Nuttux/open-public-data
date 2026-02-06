-- =============================================================================
-- Mart: Budget par Nature (pour Donut drill-down)
--
-- Sources: core_budget (exécuté) + core_budget_vote (voté)
-- Description: Agrégation croisée Nature × Thématique pour visualisation donut.
--              Combine les données exécutées (CA 2019-2024) et votées (BP 2025-2026)
--              pour couvrir toutes les années disponibles.
--
-- Structure:
--   - Niveau 1 (donut initial): répartition par ode_categorie_flux (nature)
--   - Niveau 2 (drill-down): répartition par ode_thematique dans chaque nature
--   - type_budget: 'execute' ou 'vote' pour distinguer la source
--
-- Output: ~150 lignes par année (combinaisons nature × thématique)
-- =============================================================================

WITH budget_depenses AS (
    -- Dépenses du budget exécuté (CA) — source de vérité
    SELECT
        annee,
        section,
        ode_categorie_flux AS nature,
        ode_thematique AS thematique,
        montant,
        'execute' AS type_budget
    FROM {{ ref('core_budget') }}
    WHERE sens_flux = 'Dépense'

    UNION ALL

    -- Dépenses du budget voté (BP) — uniquement années sans CA
    -- On exclut les années déjà couvertes par core_budget pour éviter les doublons
    SELECT
        annee,
        section,
        ode_categorie_flux AS nature,
        ode_thematique AS thematique,
        montant,
        'vote' AS type_budget
    FROM {{ ref('core_budget_vote') }}
    WHERE sens_flux = 'Dépense'
      AND annee NOT IN (SELECT DISTINCT annee FROM {{ ref('core_budget') }})
),

-- =============================================================================
-- NIVEAU 1: Agrégation par Nature (catégorie de flux)
-- Pour le donut principal
-- =============================================================================
par_nature AS (
    SELECT
        annee,
        nature,
        SUM(montant) AS montant_total,
        COUNT(*) AS nb_lignes,
        ANY_VALUE(type_budget) AS type_budget
    FROM budget_depenses
    GROUP BY 1, 2
),

-- =============================================================================
-- NIVEAU 2: Agrégation Nature × Thématique
-- Pour le drill-down quand on clique sur une nature
-- =============================================================================
par_nature_thematique AS (
    SELECT
        annee,
        nature,
        thematique,
        SUM(montant) AS montant_total,
        COUNT(*) AS nb_lignes,
        ANY_VALUE(type_budget) AS type_budget
    FROM budget_depenses
    GROUP BY 1, 2, 3
),

-- =============================================================================
-- UNION: Combine les deux niveaux
-- =============================================================================
resultats AS (
    -- Niveau 1: Par nature uniquement
    SELECT
        'niveau_1' AS niveau,
        annee,
        nature,
        NULL AS thematique,
        montant_total,
        nb_lignes,
        type_budget
    FROM par_nature
    
    UNION ALL
    
    -- Niveau 2: Par nature ET thématique
    SELECT
        'niveau_2' AS niveau,
        annee,
        nature,
        thematique,
        montant_total,
        nb_lignes,
        type_budget
    FROM par_nature_thematique
)

SELECT
    niveau,
    annee,
    nature,
    thematique,
    ROUND(montant_total, 2) AS montant,
    nb_lignes,
    type_budget,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM resultats
ORDER BY annee, niveau, nature, thematique NULLS FIRST
