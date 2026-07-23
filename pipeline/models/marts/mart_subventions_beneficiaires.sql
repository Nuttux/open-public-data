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
        
        -- Colonnes pour filtres. "Dominant grant wins" : on prend la valeur de
        -- la ligne au plus gros montant (tie-break cle_technique), en ignorant
        -- les NULL. MAX() lexicographique renvoyait une valeur arbitraire — et
        -- pour siret, un IDENTIFIANT arbitraire/faux quand un même nom normalisé
        -- porte deux siret. IGNORE NULLS + ORDER BY montant DESC est déterministe
        -- et sémantiquement correct (la subvention principale décrit l'orga).
        ARRAY_AGG(nature_juridique IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS nature_juridique,
        ARRAY_AGG(direction IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS direction,
        ARRAY_AGG(secteurs_activite IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS secteurs_activite,
        ARRAY_AGG(ode_thematique IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS thematique,
        ARRAY_AGG(ode_sous_categorie IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS sous_categorie,
        ARRAY_AGG(ode_source_thematique IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS source_thematique,

        -- Métriques
        SUM(montant) AS montant_total,
        COUNT(*) AS nb_subventions,

        -- Détails (pour tooltip) — objet de la subvention la plus importante.
        ARRAY_AGG(objet IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS objet_principal,
        ARRAY_AGG(siret IGNORE NULLS ORDER BY montant DESC, cle_technique)[SAFE_OFFSET(0)] AS siret

    FROM subventions
    GROUP BY annee, beneficiaire, beneficiaire_normalise
)

SELECT
    *,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM aggregees
-- Deterministic tie-break: many beneficiaries share identical montant_total,
-- so without a unique final key the row order (and any downstream export) is
-- non-reproducible between builds.
ORDER BY annee DESC, montant_total DESC, beneficiaire_normalise ASC, beneficiaire ASC
