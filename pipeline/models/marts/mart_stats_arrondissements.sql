-- =============================================================================
-- MART: Statistiques par Arrondissement
-- 
-- Agrégation multi-sources pour stats par arrondissement.
-- Combine: investissements (AP) et logements sociaux.
-- NOTE: Les subventions ne sont PAS incluses (pas de géolocalisation pertinente).
--
-- Grain: (annee, arrondissement)
-- =============================================================================

-- Investissements par arrondissement
WITH investissements AS (
    SELECT
        annee,
        ode_arrondissement AS arrondissement,
        SUM(montant) AS montant_investissements,
        COUNT(DISTINCT ap_code) AS nb_projets_investissement
    FROM {{ ref('core_ap_projets') }}
    WHERE ode_arrondissement IS NOT NULL
    GROUP BY annee, ode_arrondissement
),

-- Logements sociaux par arrondissement
logements AS (
    SELECT
        annee,
        arrondissement,
        SUM(nb_logements) AS nb_logements_finances,
        COUNT(*) AS nb_programmes_logements
    FROM {{ ref('core_logements_sociaux') }}
    WHERE arrondissement IS NOT NULL
    GROUP BY annee, arrondissement
),

-- Liste des années et arrondissements
annees_arr AS (
    SELECT DISTINCT annee, arrondissement
    FROM (
        SELECT annee, arrondissement FROM investissements
        UNION DISTINCT
        SELECT annee, arrondissement FROM logements
    )
),

-- Jointure finale
combined AS (
    SELECT
        a.annee,
        a.arrondissement,
        COALESCE(i.montant_investissements, 0) AS montant_investissements,
        COALESCE(i.nb_projets_investissement, 0) AS nb_projets_investissement,
        COALESCE(l.nb_logements_finances, 0) AS nb_logements_finances,
        COALESCE(l.nb_programmes_logements, 0) AS nb_programmes_logements
    FROM annees_arr a
    LEFT JOIN investissements i 
        ON a.annee = i.annee AND a.arrondissement = i.arrondissement
    LEFT JOIN logements l 
        ON a.annee = l.annee AND a.arrondissement = l.arrondissement
),

-- Calcul des totaux annuels pour ratios
totaux AS (
    SELECT
        annee,
        SUM(montant_investissements) AS total_investissements,
        SUM(nb_logements_finances) AS total_logements
    FROM combined
    GROUP BY annee
)

SELECT
    c.annee,
    c.arrondissement,
    -- Investissements
    c.montant_investissements,
    c.nb_projets_investissement,
    ROUND(100 * c.montant_investissements / NULLIF(t.total_investissements, 0), 2) AS pct_investissements,
    -- Logements
    c.nb_logements_finances,
    c.nb_programmes_logements,
    ROUND(100 * c.nb_logements_finances / NULLIF(t.total_logements, 0), 2) AS pct_logements,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM combined c
LEFT JOIN totaux t ON c.annee = t.annee
ORDER BY c.annee DESC, c.arrondissement
