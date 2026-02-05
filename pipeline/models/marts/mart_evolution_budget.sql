-- =============================================================================
-- Mart: Évolution Budget
--
-- Source: core_budget
-- Description: Agrégations temporelles du budget pour graphiques d'évolution
--
-- Granularités disponibles:
--   - Par année + sens (recette/dépense)
--   - Par année + chapitre
--   - Par année + thématique (mapping chapitre → thématique)
--
-- Output: ~200 lignes (6 ans × ~30 dimensions)
-- =============================================================================

WITH budget_base AS (
    SELECT
        annee,
        sens_flux,
        chapitre_code,
        chapitre_libelle,
        montant,
        -- Mapping chapitre → thématique macro
        CASE
            WHEN chapitre_code IN ('011', '012', '014') THEN 'Personnel'
            WHEN chapitre_code IN ('65', '657') THEN 'Subventions'
            WHEN chapitre_code IN ('66', '67') THEN 'Charges financières'
            WHEN chapitre_code IN ('20', '21', '23') THEN 'Investissement'
            WHEN chapitre_code LIKE '9%' THEN 'Opérations patrimoniales'
            WHEN chapitre_code IN ('73', '74', '75') THEN 'Fiscalité & Dotations'
            WHEN chapitre_code IN ('70', '71') THEN 'Produits services'
            ELSE 'Autres'
        END AS thematique_macro
    FROM {{ ref('core_budget') }}
),

-- Agrégation par année et sens
par_annee_sens AS (
    SELECT
        annee,
        sens_flux,
        SUM(montant) AS montant_total,
        COUNT(*) AS nb_lignes
    FROM budget_base
    GROUP BY 1, 2
),

-- Calcul des variations annuelles
avec_variation AS (
    SELECT
        annee,
        sens_flux,
        montant_total,
        nb_lignes,
        LAG(montant_total) OVER (PARTITION BY sens_flux ORDER BY annee) AS montant_annee_prec,
        SAFE_DIVIDE(
            montant_total - LAG(montant_total) OVER (PARTITION BY sens_flux ORDER BY annee),
            LAG(montant_total) OVER (PARTITION BY sens_flux ORDER BY annee)
        ) * 100 AS variation_pct
    FROM par_annee_sens
),

-- Agrégation par année et thématique macro
par_thematique AS (
    SELECT
        annee,
        sens_flux,
        thematique_macro,
        SUM(montant) AS montant_total,
        COUNT(*) AS nb_lignes
    FROM budget_base
    GROUP BY 1, 2, 3
),

-- Union des vues
resultats AS (
    -- Vue 1: Par sens avec variation
    SELECT
        'par_sens' AS vue,
        annee,
        sens_flux,
        NULL AS thematique_macro,
        montant_total,
        nb_lignes,
        variation_pct,
        montant_annee_prec
    FROM avec_variation

    UNION ALL

    -- Vue 2: Par thématique macro
    SELECT
        'par_thematique' AS vue,
        annee,
        sens_flux,
        thematique_macro,
        montant_total,
        nb_lignes,
        NULL AS variation_pct,
        NULL AS montant_annee_prec
    FROM par_thematique
)

SELECT
    vue,
    annee,
    sens_flux,
    thematique_macro,
    montant_total,
    nb_lignes,
    ROUND(variation_pct, 2) AS variation_pct,
    montant_annee_prec,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM resultats
ORDER BY vue, annee, sens_flux, thematique_macro
