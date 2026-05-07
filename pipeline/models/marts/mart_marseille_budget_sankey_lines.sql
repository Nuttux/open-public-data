-- =============================================================================
-- Mart: lignes budgétaires Marseille pour Sankey (parallèle au mart Paris)
--
-- Consommé par: pipeline/scripts/export/export_marseille_sankey.py
--   → website/public/data/marseille/budget_sankey_{year}.json
--
-- Source: stg_marseille_budget (BP + CA, 2018-2024)
--
-- ⚠ Différence vs mart_budget_sankey_lines (Paris):
--   - Marseille publie SANS dimension fonctionnelle → pas de regroupement
--     "Éducation/Sécurité/etc." par chapitre comme Paris (chap 932 = Éducation).
--   - À la place, on calcule `ode_categorie_flux` à partir de nature_code
--     (universel M57 par nature), même logique que core_budget Paris.
--   - L'export Marseille agrège par `ode_categorie_flux` (Personnel, Achats,
--     Subventions, Investissements matériels, etc.), pas par politique publique.
--
-- POC v1: ce mart est isolé du mart Paris. Quand l'unification core_budget
-- multi-villes sera faite (P2.1), ce mart sera fusionné via UNION ALL +
-- filtre commune_slug.
-- =============================================================================

{{ config(materialized='table', schema='marts', tags=['mart', 'budget', 'sankey', 'marseille']) }}

WITH budget AS (
    SELECT * FROM {{ ref('stg_marseille_budget') }}
    WHERE montant > 0
),

with_categorie AS (
    SELECT
        commune_slug,
        annee,
        type_budget,
        section,
        sens_flux,
        chapitre_code,
        chapitre_libelle,
        nature_code,
        nature_libelle,
        montant,

        -- Catégorie de flux (basée sur nature comptable, M57 universel).
        -- Logique alignée sur core_budget.ode_categorie_flux (Paris).
        CASE
            -- Personnel
            WHEN nature_code LIKE '64%' THEN 'Personnel'

            -- Subventions
            WHEN nature_code LIKE '657%' THEN 'Subventions (fonctionnement)'
            WHEN nature_code LIKE '204%' THEN 'Subventions (investissement)'

            -- Transferts
            WHEN nature_code LIKE '651%' OR nature_code LIKE '652%' THEN 'Transferts sociaux'
            WHEN nature_code LIKE '655%' OR nature_code LIKE '656%' THEN 'Contributions obligatoires'

            -- Achats et services
            WHEN nature_code LIKE '60%' THEN 'Achats'
            WHEN nature_code LIKE '61%' THEN 'Services extérieurs'
            WHEN nature_code LIKE '62%' THEN 'Autres services'

            -- Charges financières et dette
            WHEN nature_code LIKE '66%' THEN 'Charges financières'
            WHEN nature_code LIKE '16%' THEN 'Remboursement dette'

            -- Dotations
            WHEN nature_code LIKE '739%' THEN 'Reversements péréquation'
            WHEN nature_code LIKE '748%' THEN 'Dotations arrondissements'

            -- Investissements
            WHEN nature_code LIKE '21%' THEN 'Immobilisations corporelles'
            WHEN nature_code LIKE '23%' THEN 'Immobilisations en cours'
            WHEN nature_code LIKE '20%' AND nature_code NOT LIKE '204%' THEN 'Études'

            -- Recettes
            WHEN nature_code LIKE '73%' THEN 'Impôts et taxes'
            WHEN nature_code LIKE '74%' THEN 'Dotations et participations'
            WHEN nature_code LIKE '75%' THEN 'Autres produits gestion'
            WHEN nature_code LIKE '70%' THEN 'Produits services'

            ELSE 'Autre'
        END AS ode_categorie_flux

    FROM budget
)

SELECT * FROM with_categorie
