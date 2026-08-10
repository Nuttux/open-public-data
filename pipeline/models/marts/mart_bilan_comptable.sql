-- =============================================================================
-- Mart: bilan comptable — slice à granularité ligne pour Sankey + index
--
-- Consommé par: pipeline/scripts/export/export_bilan_data.py
--   → website/public/data/bilan_sankey_{year}.json
--   → website/public/data/bilan_index.json
--
-- Source: core_bilan_comptable
-- Grain: annee × type_bilan × poste × detail (row-level OBT, identique au core)
--
-- Note: l'agrégation Sankey (nodes / links / drilldown / KPIs) est faite en
-- Python par l'export car elle dépend d'arrondis et de structures imbriquées
-- difficiles à exprimer en SQL. Ce mart fixe le contrat de colonnes pour
-- isoler l'export du schéma core.
-- =============================================================================

-- Mart "thin" : projection de colonnes + ORDER BY stable, pas d'agrégation.
-- Matérialisé en VIEW car aucun calcul ne justifie une table physique ;
-- le contrat (colonnes + ordre) est valable mais peu coûteux en query-time.
{{ config(materialized='view', schema='marts', tags=['mart','bilan','thin']) }}

SELECT
    annee,
    type_bilan,
    poste,
    detail,
    montant_brut,
    montant_amortissements,
    montant_net,
    categorie_analytique
FROM {{ ref('core_bilan_comptable') }}
