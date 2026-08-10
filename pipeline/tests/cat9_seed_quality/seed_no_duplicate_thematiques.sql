{{ config(tags=['seed_quality']) }}
{# No duplicate chapitre_code+fonction_prefix combinations in thematiques mapping #}
SELECT chapitre_code, fonction_prefix, COUNT(*) AS cnt
FROM {{ ref('seed_mapping_thematiques') }}
WHERE chapitre_code IS NOT NULL AND chapitre_code != ''
GROUP BY chapitre_code, fonction_prefix
HAVING COUNT(*) > 1
