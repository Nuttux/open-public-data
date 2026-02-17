-- =============================================================================
-- MART: Marchés Publics par Nature
--
-- Vue optimisée pour le treemap et les agrégations par dimension.
--
-- ⚠️ Les montants sont des ENVELOPPES PLURIANNUELLES, pas des dépenses.
--
-- Grain: (annee, nature) — 3 valeurs (SERVICES/TRAVAUX/FOURNITURE)
-- =============================================================================

WITH marches AS (
    SELECT *
    FROM {{ ref('core_marches_publics') }}
),

-- Agrégation par nature
par_nature AS (
    SELECT
        annee,
        nature,
        COUNT(*) AS nb_marches,
        SUM(montant_max) AS enveloppe_max_totale,
        SUM(montant_min) AS enveloppe_min_totale,
        AVG(montant_max) AS enveloppe_max_moyenne,
        AVG(duree_jours) AS duree_moyenne_jours,
        SUM(CASE WHEN is_multiattributaire THEN 1 ELSE 0 END) AS nb_multiattributaires
    FROM marches
    GROUP BY annee, nature
),

-- Total annuel pour pourcentages
totaux AS (
    SELECT annee, SUM(enveloppe_max_totale) AS total_annuel
    FROM par_nature
    GROUP BY annee
)

SELECT
    p.annee,
    p.nature,
    p.nb_marches,
    p.enveloppe_max_totale,
    p.enveloppe_min_totale,
    p.enveloppe_max_moyenne,
    p.duree_moyenne_jours,
    p.nb_multiattributaires,
    ROUND(100 * p.enveloppe_max_totale / t.total_annuel, 2) AS pct_total,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM par_nature p
LEFT JOIN totaux t ON p.annee = t.annee
ORDER BY p.annee DESC, p.enveloppe_max_totale DESC
