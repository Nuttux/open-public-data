-- =============================================================================
-- Staging: Marchés publics
--
-- Source: liste_des_marches_de_la_collectivite_parisienne
-- Description: Marchés publics de la collectivité parisienne
--
-- ⚠️ ATTENTION: montant_min/max sont des ENVELOPPES PLURIANNUELLES
--    NE PAS SOMMER comme dépense annuelle !
--    Usage: contexte uniquement
--
-- Output: ~17k lignes, années 2013-2024
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('paris_raw', 'liste_des_marches_de_la_collectivite_parisienne') }}
),

cleaned AS (
    SELECT
        -- =====================================================================
        -- IDENTIFIANTS
        -- =====================================================================
        SAFE_CAST(annee_de_notification AS INT64) AS annee,
        num_marche AS numero_marche,
        
        -- =====================================================================
        -- MARCHÉ
        -- =====================================================================
        objet_du_marche AS objet,
        nature_du_marche AS nature,
        
        -- =====================================================================
        -- FOURNISSEUR
        -- =====================================================================
        fournisseur_nom,
        fournisseur_siret,
        fournisseur_code_postal,
        fournisseur_ville,
        
        -- =====================================================================
        -- MONTANTS (ENVELOPPES PLURIANNUELLES - NE PAS SOMMER)
        -- =====================================================================
        SAFE_CAST(montant_min AS FLOAT64) AS montant_min,
        SAFE_CAST(montant_max AS FLOAT64) AS montant_max,
        
        -- =====================================================================
        -- DATES
        -- =====================================================================
        SAFE_CAST(date_de_notification AS DATE) AS date_notification,
        SAFE_CAST(date_de_debut AS DATE) AS date_debut,
        SAFE_CAST(date_de_fin AS DATE) AS date_fin,
        SAFE_CAST(duree_du_marche_en_jours AS INT64) AS duree_jours,
        
        -- =====================================================================
        -- CATÉGORIE
        -- =====================================================================
        categorie_d_achat_cle AS categorie_code,
        categorie_d_achat_texte AS categorie_libelle,
        perimetre_financier,
        
        -- =====================================================================
        -- CLÉ TECHNIQUE
        -- =====================================================================
        COALESCE(num_marche,
            CONCAT(
                COALESCE(SAFE_CAST(annee_de_notification AS STRING), 'XXXX'), '-',
                COALESCE(fournisseur_nom, 'X'), '-',
                COALESCE(objet_du_marche, 'X')
            )
        ) AS cle_technique
        
    FROM source
)

SELECT * FROM cleaned
