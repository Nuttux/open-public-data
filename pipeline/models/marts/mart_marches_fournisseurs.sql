-- =============================================================================
-- MART: Marchés Publics Fournisseurs
--
-- Vue pour la table filtrable des marchés (Explorer tab).
-- Colonnes disponibles pour filtres UI : nature, categorie, perimetre.
--
-- ⚠️ montant_max = ENVELOPPE AUTORISÉE (plafond contractuel).
-- ⚠️ montant_notifie = montant déclaré à l'État à la signature (DECP),
--    ≠ cumul bons de commande. Affiché en second quand écart > 5%.
--
-- Grain: (annee, numero_marche) — un marché par ligne
-- =============================================================================

-- LEFT JOIN avec stg_sirene_companies pour combler `fournisseur_nom` quand
-- DECP/OpenData Paris ne le fournit pas. Remplace l'ancien patcher
-- post-export `apply_sirene_to_marches.py` (Cat-D supprimée).
WITH base AS (
    SELECT * FROM {{ ref('core_marches_publics') }}
),
sirene AS (
    SELECT siren, nom FROM {{ ref('core_sirene_companies') }}
),
joined AS (
    SELECT
        b.*,
        s.nom AS sirene_nom
    FROM base b
    LEFT JOIN sirene s
      ON LENGTH(b.fournisseur_siret) = 14
     AND SUBSTR(b.fournisseur_siret, 1, 9) = s.siren
)

SELECT
    annee,
    numero_marche,
    objet,
    nature,
    -- COALESCE: garde fournisseur_nom si déjà non vide, sinon prend nom SIRENE
    -- (les deux NULLIF traitent les chaînes vides comme NULL pour ne pas
    -- exposer un nom vide quand le cache SIRENE n'a pas le nom).
    COALESCE(
        NULLIF(TRIM(fournisseur_nom), ''),
        NULLIF(TRIM(sirene_nom), '')
    ) AS fournisseur_nom,
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

    -- =========================================================================
    -- ENRICHISSEMENT DECP (NULL si pas matché / pas disponible)
    -- =========================================================================
    _source_origin,
    decp_id,
    decp_ccag,
    decp_code_cpv,
    decp_cpv_division,
    decp_cpv_famille,
    decp_procedure,
    decp_montant_notifie,
    decp_duree_mois,
    decp_offres_recues,
    decp_lieu_execution_code,
    decp_lieu_execution_type_code,
    decp_lieu_execution_lisible,
    decp_arrondissement_exec,
    decp_titulaire_siret,
    decp_titulaires_count,
    decp_sous_traitance_declaree,
    decp_nb_modifications,
    decp_has_consideration_sociale,
    decp_has_consideration_environnementale,
    decp_marche_innovant,
    ecart_plafond_vs_notifie,
    afficher_deux_montants,

    CURRENT_TIMESTAMP() AS _dbt_updated_at
FROM joined
ORDER BY annee DESC, montant_max DESC
