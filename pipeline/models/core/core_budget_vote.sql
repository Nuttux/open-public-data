-- =============================================================================
-- Core: Budget Voté (OBT) - Entité séparée du budget exécuté
--
-- Source: stg_pdf_budget_vote + stg_budget_vote + seed_mapping_thematiques
-- Description: Budget PRÉVISIONNEL voté par le Conseil de Paris.
--              Même structure et enrichissements que core_budget (CA),
--              mais entité conceptuellement différente.
--
-- ARCHITECTURE:
--   core_budget      = Exécuté (CA) = source de vérité = 2019-2024
--   core_budget_vote = Voté (BP)    = prévisionnel     = 2019-2026
--   mart_vote_vs_execute = JOIN des deux pour comparaison
--
-- Sources (consolidées):
--   - stg_pdf_budget_vote: données extraites des PDFs éditique BG (2020-2026)
--     Inclut les opérations ventilées (90x/93x) ET non ventilées (92x/94x)
--   - stg_budget_vote: CSV OpenData Paris (2019 uniquement)
--     Les années 2020-2021 OpenData sont redondantes avec les PDFs → exclues
--
-- Grain: (annee, section, chapitre_code, nature_code, fonction_code, sens_flux)
-- Une ligne = une combinaison budgétaire unique (budget voté)
--
-- Enrichissements (ode_*):
--   - ode_thematique: thématique dashboard (même logique que core_budget)
--     Les chapitres non-ventilés (92x/94x) ont des thématiques fiscales dédiées
--   - ode_categorie_flux: catégorie comptable (Personnel, Subventions, etc.)
--
-- Output: ~18,000 lignes, années 2019-2026
-- =============================================================================

WITH pdf_data AS (
    -- PDFs éditique BG: 2020-2026 (source la plus complète pour ces années)
    SELECT * FROM {{ ref('stg_pdf_budget_vote') }}
),

opendata_2019 AS (
    -- CSV OpenData: 2019 uniquement (seule source pour cette année)
    -- Filtré à 2019 pour éviter les doublons avec les PDFs 2020-2021
    SELECT
        annee,
        section,
        sens_flux,
        type_operation,
        chapitre_code,
        chapitre_libelle,
        nature_code,
        nature_libelle,
        fonction_code,
        fonction_libelle,
        montant,
        cle_technique,
        -- Métadonnées source (pas de page/pdf pour les données OpenData)
        CAST(NULL AS INT64) AS source_page,
        'opendata-csv' AS source_pdf
    FROM {{ ref('stg_budget_vote') }}
    WHERE annee = 2019
),

budget AS (
    -- Consolidation : PDF 2020-2026 + OpenData 2019
    SELECT * FROM pdf_data
    UNION ALL
    SELECT * FROM opendata_2019
),

mapping_thematiques AS (
    SELECT * FROM {{ ref('seed_mapping_thematiques') }}
),

-- =============================================================================
-- ÉTAPE 1: Trouver LA meilleure thématique pour chaque (chapitre, fonction)
-- Même logique exacte que core_budget
-- =============================================================================
distinct_combos AS (
    SELECT DISTINCT chapitre_code, fonction_code
    FROM budget
),

thematique_matches AS (
    SELECT
        c.chapitre_code,
        c.fonction_code,
        m.thematique,
        m.fonction_prefix,
        ROW_NUMBER() OVER (
            PARTITION BY c.chapitre_code, c.fonction_code
            ORDER BY 
                -- Priorité au match spécifique (fonction_prefix non NULL)
                CASE WHEN m.fonction_prefix IS NOT NULL THEN 0 ELSE 1 END,
                m.fonction_prefix DESC NULLS LAST
        ) AS rn
    FROM distinct_combos c
    INNER JOIN mapping_thematiques m
        ON c.chapitre_code = m.chapitre_code
        AND (m.fonction_prefix IS NULL 
             OR c.fonction_code LIKE CONCAT(m.fonction_prefix, '%'))
),

best_thematique AS (
    SELECT 
        chapitre_code,
        fonction_code,
        thematique AS mapped_thematique
    FROM thematique_matches
    WHERE rn = 1
),

-- =============================================================================
-- ÉTAPE 2: Enrichissement (même logique que core_budget)
-- =============================================================================
enriched AS (
    SELECT
        -- =====================================================================
        -- COLONNES ORIGINALES (même interface que core_budget)
        -- =====================================================================
        b.annee,
        b.section,
        b.sens_flux,
        b.type_operation,
        b.chapitre_code,
        b.chapitre_libelle,
        b.nature_code,
        b.nature_libelle,
        b.fonction_code,
        b.fonction_libelle,
        b.montant,
        b.cle_technique,
        
        -- =====================================================================
        -- COLONNES ENRICHIES (ode_*) - même logique que core_budget
        -- =====================================================================
        
        -- Thématique dashboard (mapping chapitre → thématique)
        COALESCE(
            bt.mapped_thematique,
            CASE b.chapitre_code
                -- Fonctionnement ventilé (93x)
                WHEN '930' THEN 'Administration'
                WHEN '9305' THEN 'Fonds Européens'
                WHEN '931' THEN 'Sécurité'
                WHEN '932' THEN 'Éducation'
                WHEN '933' THEN 'Culture & Sport'
                WHEN '934' THEN 'Social'
                WHEN '9343' THEN 'APA'
                WHEN '9344' THEN 'RSA'
                WHEN '935' THEN 'Urbanisme'
                WHEN '936' THEN 'Économie'
                WHEN '937' THEN 'Environnement'
                WHEN '938' THEN 'Transport'
                WHEN '939' THEN 'Action économique'
                -- Fonctionnement non ventilé (94x) = fiscalité, dotations
                WHEN '940' THEN 'Fiscalité Directe'
                WHEN '941' THEN 'Fiscalité Indirecte'
                WHEN '942' THEN 'Dotations & Participations'
                WHEN '943' THEN 'Opérations Financières'
                WHEN '944' THEN 'Administration'
                WHEN '945' THEN 'Social'
                WHEN '946' THEN 'Social'
                WHEN '947' THEN 'Social'
                -- Investissement ventilé (90x)
                WHEN '900' THEN 'Administration'
                WHEN '9005' THEN 'Fonds Européens'
                WHEN '901' THEN 'Sécurité'
                WHEN '902' THEN 'Éducation'
                WHEN '903' THEN 'Culture & Sport'
                WHEN '904' THEN 'Social'
                WHEN '9044' THEN 'RSA'
                WHEN '905' THEN 'Urbanisme'
                WHEN '906' THEN 'Économie'
                WHEN '907' THEN 'Environnement'
                WHEN '908' THEN 'Transport'
                -- Investissement non ventilé (92x) = emprunts, patrimoine
                WHEN '921' THEN 'Fiscalité Indirecte'
                WHEN '922' THEN 'Dotations & Participations'
                WHEN '923' THEN 'Emprunts & Dette'
                WHEN '925' THEN 'Opérations Patrimoniales'
                WHEN '926' THEN 'Transferts entre Sections'
                ELSE 'Autre'
            END
        ) AS ode_thematique,
        
        -- Catégorie de flux (même logique que core_budget)
        CASE
            -- Personnel
            WHEN b.nature_code LIKE '64%' THEN 'Personnel'
            
            -- Subventions
            WHEN b.nature_code LIKE '657%' THEN 'Subventions (fonctionnement)'
            WHEN b.nature_code LIKE '204%' THEN 'Subventions (investissement)'
            
            -- Transferts
            WHEN b.nature_code LIKE '651%' OR b.nature_code LIKE '652%' THEN 'Transferts sociaux'
            WHEN b.nature_code LIKE '655%' OR b.nature_code LIKE '656%' THEN 'Contributions obligatoires'
            
            -- Achats et services
            WHEN b.nature_code LIKE '60%' THEN 'Achats'
            WHEN b.nature_code LIKE '61%' THEN 'Services extérieurs'
            WHEN b.nature_code LIKE '62%' THEN 'Autres services'
            
            -- Charges financières et dette
            WHEN b.nature_code LIKE '66%' THEN 'Charges financières'
            WHEN b.nature_code LIKE '16%' THEN 'Remboursement dette'
            
            -- Dotations
            WHEN b.nature_code LIKE '739%' THEN 'Reversements péréquation'
            WHEN b.nature_code LIKE '748%' THEN 'Dotations arrondissements'
            
            -- Investissements
            WHEN b.nature_code LIKE '21%' THEN 'Immobilisations corporelles'
            WHEN b.nature_code LIKE '23%' THEN 'Immobilisations en cours'
            WHEN b.nature_code LIKE '20%' AND b.nature_code NOT LIKE '204%' THEN 'Études'
            
            -- Recettes
            WHEN b.nature_code LIKE '73%' THEN 'Impôts et taxes'
            WHEN b.nature_code LIKE '74%' THEN 'Dotations et participations'
            WHEN b.nature_code LIKE '75%' THEN 'Autres produits gestion'
            WHEN b.nature_code LIKE '70%' THEN 'Produits services'
            
            ELSE 'Autre'
        END AS ode_categorie_flux,
        
        -- Métadonnées
        CURRENT_TIMESTAMP() AS _dbt_updated_at

    FROM budget b
    LEFT JOIN best_thematique bt
        ON b.chapitre_code = bt.chapitre_code
        AND b.fonction_code = bt.fonction_code
)

SELECT * FROM enriched
