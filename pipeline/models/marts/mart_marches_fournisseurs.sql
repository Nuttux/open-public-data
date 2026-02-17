-- =============================================================================
-- MART: Marchés Publics Fournisseurs
--
-- Vue pour la table filtrable des marchés (Explorer tab).
-- Colonnes disponibles pour filtres UI : nature, categorie, perimetre
--
-- ⚠️ Les montants sont des ENVELOPPES PLURIANNUELLES, pas des dépenses.
--
-- Grain: (annee, numero_marche) — un marché par ligne
-- =============================================================================

SELECT
    annee,
    numero_marche,
    objet,
    nature,
    fournisseur_nom,
    fournisseur_siret,
    montant_min,
    montant_max,
    date_notification,
    date_debut,
    date_fin,
    duree_jours,
    categorie_code,
    categorie_libelle,
    perimetre_financier,
    is_multiattributaire,
    cle_technique,
    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM {{ ref('core_marches_publics') }}
ORDER BY annee DESC, montant_max DESC
