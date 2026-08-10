-- =============================================================================
-- Staging: Bilan Comptable (État Patrimonial)
--
-- Source: bilan_comptable
-- Description: Bilan annuel de la Ville de Paris - Actif/Passif
--
-- Transformations:
--   - Nettoyage: standardisation de la casse et orthographe
--   - Normalisation: type_bilan (Actif/Passif)
--   - Typage: FLOAT64 pour montants, INT64 pour année
--   - Agrégation des doublons par clé technique
--   - NULL → 0: valeurs manquantes converties en 0 (logique comptable)
--
-- Output: ~300 lignes (après nettoyage), années 2019-2024
-- =============================================================================

WITH source AS (
    SELECT *
    FROM {{ source('paris_raw', 'bilan_comptable') }}
),

-- =============================================================================
-- ÉTAPE 1: Nettoyage et typage de base
-- =============================================================================
cleaned AS (
    SELECT
        -- =====================================================================
        -- IDENTIFIANTS
        -- Note: Les noms de colonnes sont déjà nettoyés lors de l'upload
        -- (sans accents, snake_case)
        -- =====================================================================
        SAFE_CAST(exercice_comptable AS INT64) AS annee,
        
        -- Type de bilan normalisé
        CASE 
            WHEN UPPER(TRIM(actif_passif)) = 'ACTIF' THEN 'Actif'
            WHEN UPPER(TRIM(actif_passif)) = 'PASSIF' THEN 'Passif'
            ELSE INITCAP(TRIM(actif_passif))
        END AS type_bilan,
        
        -- =====================================================================
        -- POSTE: Normalisation de la casse et terminologie
        -- =====================================================================
        CASE UPPER(TRIM(poste))
            -- ACTIF
            WHEN 'ACTIF IMMOBILISE' THEN 'Actif immobilisé'
            WHEN 'ACTIF CIRCULANT' THEN 'Actif circulant'
            WHEN 'TRESORERIE' THEN 'Trésorerie'
            WHEN 'COMPTES DE REGULARISATION' THEN 'Comptes de régularisation'
            WHEN 'ECARTS DE CONVERSION ACTIF' THEN 'Écarts de conversion actif'
            -- PASSIF
            WHEN 'FONDS PROPRES' THEN 'Fonds propres'
            WHEN 'DETTES FINANCIERES' THEN 'Dettes financières'
            WHEN 'DETTES NON FINANCIERES' THEN 'Dettes non financières'
            WHEN 'PROVISIONS POUR RISQUES ET CHARGES' THEN 'Provisions pour risques et charges'
            WHEN 'PROVISIONS POUR RISQUE ET CHARGES' THEN 'Provisions pour risques et charges'
            WHEN 'ECARTS DE CONVERSION PASSIF' THEN 'Écarts de conversion passif'
            WHEN 'DETTES' THEN 'Dettes'  -- Ancienne terminologie (avant 2019)
            -- Default: normalisation casse
            ELSE INITCAP(LOWER(TRIM(poste)))
        END AS poste_normalise,
        
        -- =====================================================================
        -- DÉTAIL: Normalisation orthographique
        -- =====================================================================
        -- Correction des variations orthographiques connues
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                TRIM(detail),
                r'régularisations', 'régularisation'  -- Uniformiser singulier
            ),
            r'immobilisation incorporelles', 'immobilisations incorporelles'  -- Correction faute
        ) AS detail,
        
        -- =====================================================================
        -- MONTANTS (toujours positifs, NULL → 0)
        -- En comptabilité, une valeur absente = 0, pas "inconnu"
        -- =====================================================================
        COALESCE(ABS(SAFE_CAST(brut AS FLOAT64)), 0) AS montant_brut,
        COALESCE(ABS(SAFE_CAST(amortissements_et_provisions AS FLOAT64)), 0) AS montant_amortissements,
        COALESCE(ABS(SAFE_CAST(net AS FLOAT64)), 0) AS montant_net
        
    FROM source
    WHERE 
        -- Exclure uniquement les lignes d'en-tête ou invalides
        SAFE_CAST(exercice_comptable AS INT64) IS NOT NULL
        -- Filtrer à partir de 2019 (données M57 fiables)
        AND SAFE_CAST(exercice_comptable AS INT64) >= 2019
),

-- =============================================================================
-- ÉTAPE 2: Agrégation des doublons
-- Certaines lignes ont le même (année, type, poste, détail) mais des montants différents
-- On les agrège pour éviter les doublons
-- =============================================================================
aggregated AS (
    SELECT
        annee,
        type_bilan,
        poste_normalise AS poste,
        detail,
        SUM(montant_brut) AS montant_brut,
        SUM(montant_amortissements) AS montant_amortissements,
        SUM(montant_net) AS montant_net,
        COUNT(*) AS nb_lignes_source  -- Pour traçabilité
    FROM cleaned
    GROUP BY annee, type_bilan, poste_normalise, detail
),

-- =============================================================================
-- ÉTAPE 3: Ajout de la clé technique et métadonnées
-- =============================================================================
final AS (
    SELECT
        annee,
        type_bilan,
        poste,
        detail,
        montant_brut,
        montant_amortissements,
        montant_net,
        nb_lignes_source,
        
        -- =====================================================================
        -- CLÉ TECHNIQUE
        -- =====================================================================
        CONCAT(
            SAFE_CAST(annee AS STRING), '-',
            CASE type_bilan WHEN 'Actif' THEN 'A' ELSE 'P' END, '-',
            COALESCE(SUBSTR(TO_HEX(MD5(poste)), 1, 4), '0000'), '-',
            COALESCE(SUBSTR(TO_HEX(MD5(COALESCE(detail, ''))), 1, 8), '00000000')
        ) AS cle_technique,
        
        -- =====================================================================
        -- CLASSIFICATION ANALYTIQUE
        -- Pour faciliter les agrégations de haut niveau
        -- =====================================================================
        CASE
            -- Immobilisations
            WHEN poste = 'Actif immobilisé' AND (
                LOWER(detail) LIKE '%incorpor%' 
                OR LOWER(detail) LIKE '%subvention%'
            ) THEN 'Immobilisations incorporelles'
            
            WHEN poste = 'Actif immobilisé' AND LOWER(detail) LIKE '%financ%'
                THEN 'Immobilisations financières'
            
            WHEN poste = 'Actif immobilisé' AND LOWER(detail) LIKE '%droits de retour%'
                THEN 'Droits de retour'
            
            WHEN poste = 'Actif immobilisé' AND LOWER(detail) LIKE '%en cours%'
                THEN 'Immobilisations en cours'
            
            WHEN poste = 'Actif immobilisé'
                THEN 'Immobilisations corporelles'
            
            -- Autres postes: reprendre le poste
            ELSE poste
        END AS categorie_analytique
        
    FROM aggregated
    -- On garde TOUTES les lignes, même celles avec montant = 0
    -- Un poste à 0€ est une information valide en comptabilité
)

SELECT * FROM final
