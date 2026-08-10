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
    -- Via core (passthrough) pour respecter la convention de couches
    -- (mart → core, jamais mart → stg). Cf. core_marseille_budget.sql.
    SELECT * FROM {{ ref('core_marseille_budget') }}
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
        -- Même macro partagée que core_budget Paris — macros/ode_categorie_flux.sql
        {{ ode_categorie_flux('nature_code') }} AS ode_categorie_flux

    FROM budget
)

SELECT * FROM with_categorie
