-- =============================================================================
-- MART: Subventions Bénéficiaires
-- 
-- Vue pour la table filtrable des bénéficiaires de subventions.
-- Colonnes disponibles pour filtres UI : thematique, nature_juridique, direction, secteurs
--
-- Grain: (annee, beneficiaire_normalise)
-- =============================================================================

WITH subventions AS (
    SELECT *
    FROM {{ ref('core_subventions') }}
    WHERE donnees_disponibles = TRUE
      AND montant > 0
),

-- Agrégation par bénéficiaire et année
aggregees AS (
    SELECT
        annee,
        beneficiaire,
        beneficiaire_normalise,
        
        -- Colonnes pour filtres
        MAX(nature_juridique) AS nature_juridique,
        MAX(direction) AS direction,
        MAX(secteurs_activite) AS secteurs_activite,
        MAX(ode_thematique) AS thematique,
        MAX(ode_sous_categorie) AS sous_categorie,
        MAX(ode_source_thematique) AS source_thematique,
        
        -- Métriques
        SUM(montant) AS montant_total,
        COUNT(*) AS nb_subventions,
        
        -- Détails (pour tooltip)
        MAX(objet) AS objet_principal,
        MAX(siret) AS siret
        
    FROM subventions
    GROUP BY annee, beneficiaire, beneficiaire_normalise
)

SELECT
    *,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM aggregees
ORDER BY annee DESC, montant_total DESC
