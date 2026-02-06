-- =============================================================================
-- Mart: Budget par Nature (pour Donut drill-down)
--
-- Source: core_budget
-- Description: Agrégation croisée Nature × Thématique pour visualisation donut
--
-- Structure:
--   - Niveau 1 (donut initial): répartition par ode_categorie_flux (nature)
--   - Niveau 2 (drill-down): répartition par ode_thematique dans chaque nature
--
-- Output: ~150 lignes par année (combinaisons nature × thématique)
-- =============================================================================

WITH budget_depenses AS (
    -- Filtrer uniquement les dépenses (pas les recettes pour le donut)
    SELECT
        annee,
        section,
        ode_categorie_flux AS nature,
        ode_thematique AS thematique,
        montant
    FROM {{ ref('core_budget') }}
    WHERE sens_flux = 'Dépense'
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
        COUNT(*) AS nb_lignes
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
        COUNT(*) AS nb_lignes
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
        nb_lignes
    FROM par_nature
    
    UNION ALL
    
    -- Niveau 2: Par nature ET thématique
    SELECT
        'niveau_2' AS niveau,
        annee,
        nature,
        thematique,
        montant_total,
        nb_lignes
    FROM par_nature_thematique
)

SELECT
    niveau,
    annee,
    nature,
    thematique,
    ROUND(montant_total, 2) AS montant,
    nb_lignes,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM resultats
ORDER BY annee, niveau, nature, thematique NULLS FIRST
