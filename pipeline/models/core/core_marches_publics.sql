-- =============================================================================
-- Core: Marchés Publics (OBT)
--
-- Source: stg_marches_publics
-- Description: Table dénormalisée des marchés publics de la collectivité parisienne
--
-- Grain: (annee, numero_marche) ou cle_technique
-- Une ligne = un marché unique
--
-- ⚠️ ATTENTION: montant_min/max sont des ENVELOPPES PLURIANNUELLES
--    NE PAS SOMMER comme dépense annuelle !
--    97% des marchés sont des accords-cadres (montant_min ≠ montant_max)
--    66% ont montant_min = 0 (aucun engagement minimum)
--
-- Enrichissements:
--   - is_multiattributaire: marché attribué à plusieurs fournisseurs (placeholder)
--
-- Output: ~17k lignes, années 2013-2024
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ ref('stg_marches_publics') }}
    WHERE montant_max > 0
      AND (duree_jours > 0 OR duree_jours IS NULL)
)

SELECT
    -- =====================================================================
    -- COLONNES ORIGINALES
    -- =====================================================================
    annee,
    numero_marche,
    objet,
    nature,

    -- Fournisseur
    fournisseur_nom,
    fournisseur_siret,
    fournisseur_code_postal,
    fournisseur_ville,

    -- Montants (ENVELOPPES PLURIANNUELLES - NE PAS SOMMER)
    montant_min,
    montant_max,

    -- Dates
    date_notification,
    date_debut,
    date_fin,
    duree_jours,

    -- Catégorie
    categorie_code,
    categorie_libelle,
    perimetre_financier,

    -- Clé
    cle_technique,

    -- =====================================================================
    -- COLONNES ENRICHIES
    -- =====================================================================
    -- Flag multi-attributaire (494 marchés, ~15% de la valeur totale)
    (fournisseur_nom = 'MARCHE MULTIATTRIBUTAIRE') AS is_multiattributaire,

    -- Métadonnées
    CURRENT_TIMESTAMP() AS _dbt_updated_at

FROM source
