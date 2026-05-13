-- =============================================================================
-- Core: Marseille Budget (OBT)
--
-- Passthrough sur stg_marseille_budget pour respecter la convention de couches
-- (mart → core uniquement, jamais mart → stg).
--
-- POC v1 : pas d'enrichissement city-specific côté core (Paris a directions,
-- thématiques, fonctions ; Marseille publie en mode nature uniquement → on
-- expose tel quel). Quand l'unification multi-villes P2.1 sera faite,
-- core_budget global UNION ALL ce core city-specific.
--
-- Grain : (commune_slug, type_budget, annee, section, sens_flux, chapitre, nature)
-- Source : stg_marseille_budget (BP + CA 2018-2024, schémas normalisés)
-- =============================================================================

{{ config(materialized='table', schema='analytics', tags=['core', 'marseille']) }}

SELECT * FROM {{ ref('stg_marseille_budget') }}
