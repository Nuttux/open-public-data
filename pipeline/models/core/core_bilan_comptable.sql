-- =============================================================================
-- Core: Bilan Comptable (État Patrimonial)
--
-- Source: stg_bilan_comptable
-- Description: Table finale du bilan comptable de la Ville de Paris
--
-- Années: 2019-2024
-- =============================================================================

SELECT *
FROM {{ ref('stg_bilan_comptable') }}
