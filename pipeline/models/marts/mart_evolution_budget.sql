-- =============================================================================
-- Mart: Évolution Budget
--
-- Source: core_budget
-- Description: Agrégations temporelles du budget pour graphiques d'évolution
--
-- Granularités disponibles:
--   - Par année + sens (recette/dépense) - totaux globaux
--   - Par année + section (Fonctionnement/Investissement) - pour épargne brute
--   - Par année + thématique macro
--
-- Métriques calculées:
--   - Épargne brute = Recettes fonct. - Dépenses fonct.
--   - Surplus/Déficit = Recettes propres (hors emprunts) - Dépenses
--
-- Output: ~250 lignes (6 ans × ~40 dimensions)
-- =============================================================================

WITH budget_base AS (
    SELECT
        annee,
        section,  -- Fonctionnement ou Investissement
        sens_flux,
        chapitre_code,
        chapitre_libelle,
        nature_code,
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
        END AS thematique_macro,
        -- Flag emprunts (nature 16x = emprunts reçus)
        CASE WHEN nature_code LIKE '16%' AND sens_flux = 'Recette' THEN TRUE ELSE FALSE END AS est_emprunt
    FROM {{ ref('core_budget') }}
),

-- Agrégation par année et sens (totaux globaux)
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

-- Agrégation par année et section (Fonctionnement / Investissement)
par_section AS (
    SELECT
        annee,
        section,
        sens_flux,
        SUM(montant) AS montant_total,
        COUNT(*) AS nb_lignes
    FROM budget_base
    GROUP BY 1, 2, 3
),

-- Calcul épargne brute et surplus financier par année
metriques_financieres AS (
    SELECT
        annee,
        -- Recettes et dépenses par section
        SUM(CASE WHEN section = 'Fonctionnement' AND sens_flux = 'Recette' THEN montant ELSE 0 END) AS recettes_fonct,
        SUM(CASE WHEN section = 'Fonctionnement' AND sens_flux = 'Dépense' THEN montant ELSE 0 END) AS depenses_fonct,
        SUM(CASE WHEN section = 'Investissement' AND sens_flux = 'Recette' THEN montant ELSE 0 END) AS recettes_invest,
        SUM(CASE WHEN section = 'Investissement' AND sens_flux = 'Dépense' THEN montant ELSE 0 END) AS depenses_invest,
        -- Emprunts (à soustraire des recettes propres)
        SUM(CASE WHEN est_emprunt THEN montant ELSE 0 END) AS emprunts,
        -- Totaux
        SUM(CASE WHEN sens_flux = 'Recette' THEN montant ELSE 0 END) AS recettes_totales,
        SUM(CASE WHEN sens_flux = 'Dépense' THEN montant ELSE 0 END) AS depenses_totales
    FROM budget_base
    GROUP BY annee
),

metriques_calculees AS (
    SELECT
        annee,
        recettes_fonct,
        depenses_fonct,
        recettes_invest,
        depenses_invest,
        emprunts,
        recettes_totales,
        depenses_totales,
        -- Épargne brute = surplus de fonctionnement
        recettes_fonct - depenses_fonct AS epargne_brute,
        -- Recettes propres = recettes totales - emprunts
        recettes_totales - emprunts AS recettes_propres,
        -- Surplus/Déficit financier = recettes propres - dépenses
        (recettes_totales - emprunts) - depenses_totales AS surplus_deficit,
        -- Solde comptable (pour référence)
        recettes_totales - depenses_totales AS solde_comptable
    FROM metriques_financieres
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
        NULL AS section,
        NULL AS thematique_macro,
        montant_total,
        nb_lignes,
        variation_pct,
        montant_annee_prec,
        NULL AS epargne_brute,
        NULL AS recettes_propres,
        NULL AS surplus_deficit
    FROM avec_variation

    UNION ALL

    -- Vue 2: Par section
    SELECT
        'par_section' AS vue,
        annee,
        sens_flux,
        section,
        NULL AS thematique_macro,
        montant_total,
        nb_lignes,
        NULL AS variation_pct,
        NULL AS montant_annee_prec,
        NULL AS epargne_brute,
        NULL AS recettes_propres,
        NULL AS surplus_deficit
    FROM par_section

    UNION ALL

    -- Vue 3: Métriques financières calculées
    SELECT
        'metriques' AS vue,
        annee,
        NULL AS sens_flux,
        NULL AS section,
        NULL AS thematique_macro,
        NULL AS montant_total,
        NULL AS nb_lignes,
        NULL AS variation_pct,
        NULL AS montant_annee_prec,
        epargne_brute,
        recettes_propres,
        surplus_deficit
    FROM metriques_calculees

    UNION ALL

    -- Vue 4: Par thématique macro
    SELECT
        'par_thematique' AS vue,
        annee,
        sens_flux,
        NULL AS section,
        thematique_macro,
        montant_total,
        nb_lignes,
        NULL AS variation_pct,
        NULL AS montant_annee_prec,
        NULL AS epargne_brute,
        NULL AS recettes_propres,
        NULL AS surplus_deficit
    FROM par_thematique
)

SELECT
    vue,
    annee,
    sens_flux,
    section,
    thematique_macro,
    montant_total,
    nb_lignes,
    ROUND(variation_pct, 2) AS variation_pct,
    montant_annee_prec,
    epargne_brute,
    recettes_propres,
    surplus_deficit,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM resultats
ORDER BY vue, annee, sens_flux, section, thematique_macro
