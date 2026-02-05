-- =============================================================================
-- MART: Sankey Budget
-- 
-- Vue optimisée pour le diagramme Sankey de la page d'accueil.
-- Agrège les dépenses par thématique et catégorie de flux.
--
-- Grain: (annee, ode_thematique, ode_categorie_flux)
-- =============================================================================

WITH budget AS (
    SELECT *
    FROM {{ ref('core_budget') }}
    WHERE sens_flux = 'Dépense'
),

-- Agrégation par thématique
par_thematique AS (
    SELECT
        annee,
        ode_thematique,
        ode_categorie_flux,
        SUM(montant) AS montant_total,
        COUNT(*) AS nb_lignes
    FROM budget
    GROUP BY annee, ode_thematique, ode_categorie_flux
),

-- Ajout des niveaux pour le Sankey (source -> target)
sankey_links AS (
    SELECT
        annee,
        -- Niveau 1: Catégorie -> Thématique
        ode_categorie_flux AS source,
        ode_thematique AS target,
        montant_total,
        nb_lignes,
        'categorie_to_thematique' AS link_type
    FROM par_thematique
    WHERE ode_categorie_flux IS NOT NULL
      AND ode_thematique IS NOT NULL
      AND montant_total > 0
),

-- Calcul des totaux pour pourcentages
totaux_annuels AS (
    SELECT
        annee,
        SUM(montant_total) AS total_annee
    FROM sankey_links
    GROUP BY annee
)

SELECT
    s.annee,
    s.source,
    s.target,
    s.montant_total,
    s.nb_lignes,
    s.link_type,
    ROUND(100 * s.montant_total / t.total_annee, 2) AS pct_total,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM sankey_links s
LEFT JOIN totaux_annuels t ON s.annee = t.annee
ORDER BY s.annee, s.montant_total DESC
