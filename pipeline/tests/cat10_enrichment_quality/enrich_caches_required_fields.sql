{{ config(tags=['enrichment_quality']) }}
{# Vérifie la présence des champs critiques par cache.
   Pattern (cache_name, required_json_path) à étendre quand on ajoute des caches. #}

WITH cache AS (
    SELECT relative_path, SAFE.PARSE_JSON(payload) AS j
    FROM {{ ref('mart_enrichment_caches') }}
),
checks AS (
    SELECT relative_path, 'items missing' AS check_failed
    FROM cache
    WHERE relative_path IN (
        'sirene_companies.json',
        'beneficiaire_grounded.json',
        'beneficiaire_grounded_en.json',
        'deliberations_sirene.json',
        'generic_photo_bank.json',
        'projet_photos.json',
        'vulgarization_marches.json',
        'vulgarization_marches_en.json',
        'vulgarization_subventions.json',
        'vulgarization_subventions_en.json',
        'vulgarization_projets.json',
        'vulgarization_projets_en.json'
    )
    AND JSON_QUERY(j, '$.items') IS NULL

    UNION ALL

    SELECT relative_path, 'generated_at missing' AS check_failed
    FROM cache
    WHERE relative_path IN (
        'sirene_companies.json',
        'beneficiaire_grounded.json',
        'beneficiaire_grounded_en.json',
        'deliberations_sirene.json',
        'vulgarization_marches.json',
        'vulgarization_subventions.json',
        'vulgarization_projets.json'
    )
    AND JSON_VALUE(j, '$.generated_at') IS NULL
)
SELECT * FROM checks
