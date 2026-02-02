-- Modèle final : Consolidation du budget Paris (Central + Arrondissements)
-- 
-- Ce modèle combine les budgets de la mairie centrale et des arrondissements
-- pour la période M57 (2019+). Il ajoute des classifications pour faciliter
-- la visualisation Sankey (groupe_recette, categorie_depense).
--
-- RÈGLES APPLIQUÉES :
-- - 6A : Uniquement les opérations "Réel" (filtré en staging)
-- - 6B : Exclusion des dotations aux arrondissements du budget central (filtré en int)
-- - Période : 2019+ pour cohérence avec la norme M57

WITH budget_central AS (
    SELECT 
        annee,
        entite_budgetaire,
        section_budgetaire,
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
        'Budget Central' AS source_budget
    FROM {{ ref('int_budget_central_m57') }}
),

budget_arrondissements AS (
    SELECT 
        annee,
        entite_budgetaire,
        section_budgetaire,
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
        'Budget Arrondissements' AS source_budget
    FROM {{ ref('int_budget_arrondissements_m57') }}
),

-- Union des deux budgets
consolidated AS (
    SELECT * FROM budget_central
    UNION ALL
    SELECT * FROM budget_arrondissements
),

-- Ajout des classifications pour la visualisation
enriched AS (
    SELECT
        *,
        
        -- =================================================================
        -- CATÉGORIE DÉPENSES basée sur la fonction budgétaire
        -- =================================================================
        CASE 
            WHEN fonction_code LIKE '0%' THEN 'Administration Générale'
            WHEN fonction_code LIKE '1%' THEN 'Sécurité & Salubrité'
            WHEN fonction_code LIKE '2%' THEN 'Enseignement & Formation'
            WHEN fonction_code LIKE '3%' THEN 'Culture'
            WHEN fonction_code LIKE '4%' THEN 'Sport & Jeunesse'
            WHEN fonction_code LIKE '5%' THEN 'Action Sociale'
            WHEN fonction_code LIKE '6%' THEN 'Famille'
            WHEN fonction_code LIKE '7%' THEN 'Logement'
            WHEN fonction_code LIKE '8%' THEN 'Urbanisme & Environnement'
            WHEN fonction_code LIKE '9%' THEN 'Action Économique'
            WHEN chapitre_code IN ('66', '016') 
                 OR chapitre_libelle LIKE '%DETTE%' 
                 OR nature_libelle LIKE '%INTÉRÊTS%'
            THEN 'Dette & Intérêts'
            WHEN chapitre_code IN ('012', '64', '65') 
                 OR nature_libelle LIKE '%PERSONNEL%'
            THEN 'Personnel'
            ELSE 'Autres Dépenses'
        END AS categorie_depense,
        
        -- =================================================================
        -- GROUPEMENT DES RECETTES basé sur les chapitres/natures M57
        -- =================================================================
        CASE
            -- FISCALITÉ DIRECTE (Impôts locaux)
            WHEN chapitre_code IN ('731', '732', '733', '734', '73') 
                 OR chapitre_libelle LIKE '%IMPOSITION%DIRECT%'
                 OR chapitre_libelle LIKE '%TAXES FONC%'
            THEN 'Fiscalité Directe'
            
            -- FISCALITÉ INDIRECTE (Droits de mutation, taxes diverses)
            WHEN chapitre_code IN ('741', '742', '743', '744', '74')
                 OR chapitre_libelle LIKE '%IMPÔTS%TAXES%'
                 OR chapitre_libelle LIKE '%MUTATION%'
                 OR chapitre_libelle LIKE '%PUBLICITÉ FONCIÈRE%'
            THEN 'Fiscalité Indirecte'
            
            -- DOTATIONS DE L'ÉTAT
            WHEN chapitre_code IN ('741', '742', '74')
                 OR chapitre_libelle LIKE '%DOTATION%'
                 OR chapitre_libelle LIKE '%DGF%'
                 OR nature_libelle LIKE '%DOTATION%ÉTAT%'
            THEN 'Dotations État'
            
            -- RECETTES DES SERVICES
            WHEN chapitre_code IN ('70', '706', '707', '708')
                 OR chapitre_libelle LIKE '%PRODUITS%SERVICES%'
                 OR chapitre_libelle LIKE '%PRESTATIONS%'
                 OR nature_libelle LIKE '%REDEVANCE%'
            THEN 'Recettes des Services'
            
            -- EMPRUNTS ET DETTE
            WHEN chapitre_code IN ('16', '164', '165', '166', '167')
                 OR chapitre_libelle LIKE '%EMPRUNT%'
                 OR nature_libelle LIKE '%EMPRUNT%'
            THEN 'Emprunts'
            
            -- SUBVENTIONS ET PARTICIPATIONS
            WHEN chapitre_code IN ('13', '131', '132')
                 OR chapitre_libelle LIKE '%SUBVENTION%'
                 OR chapitre_libelle LIKE '%PARTICIPATION%'
            THEN 'Subventions & Participations'
            
            ELSE 'Autres Recettes'
        END AS groupe_recette,
        
        -- =================================================================
        -- CATÉGORIE CITOYENNE (classification simplifiée pour le public)
        -- =================================================================
        CASE 
            WHEN fonction_libelle LIKE '%ÉCOLE%' 
                 OR fonction_libelle LIKE '%SCOLAIRE%'
                 OR fonction_libelle LIKE '%ÉDUCATION%'
            THEN 'Écoles & Éducation'
            
            WHEN fonction_libelle LIKE '%SOCIAL%' 
                 OR fonction_libelle LIKE '%SOLIDARITÉ%'
                 OR fonction_libelle LIKE '%INSERTION%'
            THEN 'Solidarité & Social'
            
            WHEN fonction_libelle LIKE '%TRANSPORT%' 
                 OR fonction_libelle LIKE '%VOIRIE%'
                 OR fonction_libelle LIKE '%MOBILITÉ%'
            THEN 'Transports & Voirie'
            
            WHEN fonction_libelle LIKE '%CULTURE%' 
                 OR fonction_libelle LIKE '%MUSÉE%'
                 OR fonction_libelle LIKE '%BIBLIOTHÈQUE%'
            THEN 'Culture'
            
            WHEN fonction_libelle LIKE '%SPORT%' 
                 OR fonction_libelle LIKE '%PISCINE%'
                 OR fonction_libelle LIKE '%GYMNASE%'
            THEN 'Sports'
            
            WHEN fonction_libelle LIKE '%ENVIRONNEMENT%' 
                 OR fonction_libelle LIKE '%ESPACE%VERT%'
                 OR fonction_libelle LIKE '%PROPRETÉ%'
            THEN 'Environnement & Propreté'
            
            WHEN fonction_libelle LIKE '%LOGEMENT%' 
                 OR fonction_libelle LIKE '%HABITAT%'
            THEN 'Logement'
            
            WHEN fonction_libelle LIKE '%SÉCURITÉ%' 
                 OR fonction_libelle LIKE '%PRÉVENTION%'
            THEN 'Sécurité'
            
            ELSE 'Autres'
        END AS categorie_citoyenne

    FROM consolidated
)

SELECT * FROM enriched
