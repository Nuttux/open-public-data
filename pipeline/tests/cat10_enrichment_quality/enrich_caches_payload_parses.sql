{{ config(tags=['enrichment_quality']) }}
{# Vérifie que chaque payload de mart_enrichment_caches est du JSON valide.
   BQ retourne NULL si parsing échoue ; on flag les caches non-parseables. #}

SELECT relative_path, size_bytes
FROM {{ ref('mart_enrichment_caches') }}
WHERE SAFE.PARSE_JSON(payload) IS NULL
  AND payload IS NOT NULL
  AND TRIM(payload) != ''
