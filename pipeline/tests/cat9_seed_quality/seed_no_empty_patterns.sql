{{ config(tags=['seed_quality']) }}
{# No seed mapping should have empty patterns (matches everything in REGEXP_CONTAINS) #}
SELECT 'seed_mapping_beneficiaires' AS seed, pattern, thematique
FROM {{ ref('seed_mapping_beneficiaires') }}
WHERE pattern IS NULL OR TRIM(pattern) = ''

UNION ALL

SELECT 'seed_lieux_connus' AS seed, pattern_match AS pattern, nom_complet AS thematique
FROM {{ ref('seed_lieux_connus') }}
WHERE pattern_match IS NULL OR TRIM(pattern_match) = ''
