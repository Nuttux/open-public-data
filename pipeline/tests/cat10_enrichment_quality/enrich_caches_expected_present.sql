{{ config(tags=['enrichment_quality']) }}
{# Vérifie que tous les caches d'enrichissement attendus sont présents dans
   mart_enrichment_caches. La liste vit ici (et pas dans une seed) parce
   qu'elle est très stable et que toute évolution doit passer en review. #}

WITH expected AS (
    SELECT relative_path FROM UNNEST([
        'sirene_companies.json',
        'beneficiaire_grounded.json',
        'beneficiaire_grounded_en.json',
        'deliberations_sirene.json',
        'generic_photo_bank.json',
        'projet_photos.json',
        'projet_names_en.json',
        'vulgarization_marches.json',
        'vulgarization_marches_en.json',
        'vulgarization_subventions.json',
        'vulgarization_subventions_en.json',
        'vulgarization_projets.json',
        'vulgarization_projets_en.json'
    ]) AS relative_path
),
present AS (
    SELECT relative_path FROM {{ ref('mart_enrichment_caches') }}
)
SELECT e.relative_path AS missing_cache
FROM expected e
LEFT JOIN present p ON e.relative_path = p.relative_path
WHERE p.relative_path IS NULL
