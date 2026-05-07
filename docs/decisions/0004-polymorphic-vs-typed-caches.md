# ADR-0004 : Pipeline enrichment caches — polymorphe + tests, pas typé

**Status** : Accepted (2026-05-07)
**Décideur** : daniel
**Contexte** : Issue #3 de la review post-Phase 18

## Contexte

Le projet a 17 fichiers JSON sous `pipeline/cache/enrichment/` produits par les scripts d'enrichment LLM/SIRENE/photos. Chaque fichier a un schéma JSON différent. Pour respecter le layering, chaque cache doit transiter par BigQuery (raw → stg → core → mart → export).

Deux approches :

1. **Pipeline typé par cache** : 1 raw + 1 stg + 1 mart par fichier (~12 pipelines)
2. **Pipeline polymorphe** : 1 raw avec colonne `payload STRING` (JSON sérialisé) commune, 1 stg + 1 core + 1 mart polymorphes, des tests pour valider la structure attendue par cache

## Décision

**Pipeline polymorphe** + tests de validation par cache_name.

`raw.enrichment_caches_paris` :
```
relative_path STRING
payload       STRING  -- JSON sérialisé
size_bytes    INT64
generated_at  STRING
```

`stg → core → mart` : passthrough.

Validation via 3 tests singular :
- `enrich_caches_expected_present.sql` : tous les caches attendus existent
- `enrich_caches_payload_parses.sql` : `SAFE.PARSE_JSON(payload)` IS NOT NULL pour chaque ligne
- `enrich_caches_required_fields.sql` : `JSON_QUERY(j, '$.items')` IS NOT NULL pour les caches qui doivent avoir `items`

L'export `export_enrichment_caches.py` lit `mart_enrichment_caches` et écrit chaque payload sous `public/data/enrichment/<relative_path>`.

## Alternatives rejetées

**A. Pipeline typé par cache (12 pipelines)**
- ✅ Validation de schéma BQ native (column types, NOT NULL constraints)
- ✅ dbt docs montre les colonnes par cache
- ❌ ~3-4 heures de travail × 12 pipelines = surcharge énorme pour caches qui changent de schéma régulièrement
- ❌ Chaque ajout de cache (nouvelle vulgarisation, nouveau LLM) requiert un nouveau set de fichiers SQL
- ❌ Les caches d'enrichment LLM ont des schémas fluides par essence (les LLMs changent, on ajoute des champs)

**B. Pas de BigQuery pour les caches d'enrichment** (whitelist Cat-E)
- ✅ Plus simple
- ❌ Casse la règle « tout passe par BQ » → on a explicitement dit qu'on voulait 0 exception (Phase 11)
- ❌ La promesse d'auditabilité est trouée

## Conséquences

**Positives** :
- Une seule pipeline à maintenir pour 17 fichiers (et N fichiers futurs)
- L'ajout d'un nouveau cache = 0 ligne de SQL (le sync polymorphe le ramasse automatiquement)
- Tests singular reproduisent l'essentiel de la validation typée (présence + parsing + champs requis)

**Négatives** :
- Pas de typage BQ natif → si un cache dérive (champ manquant), seul le test singular l'attrape
- `dbt docs` ne peut pas décrire la structure interne d'un cache
- Une régression silencieuse sur la structure d'un payload n'est détectée qu'au prochain run dbt test

**Compromis acceptable** parce que les caches sont **lazy-loaded en lecture par l'UI** : si un payload est cassé, le frontend tombe en fallback gracieux (try/catch sur `fetch`). La donnée critique (chiffres affichés en first-paint) ne dépend pas de ces caches.

## Enforcement

- Tests obligatoires en CI : `pipeline/tests/cat10_enrichment_quality/enrich_caches_*.sql`
- Tout nouveau cache attendu DOIT être ajouté au test `enrich_caches_expected_present` (sinon il pourrait disparaître silencieusement)
- Si un cache devient critique pour le first-paint, le promouvoir en pipeline typé (et créer un nouvel ADR)
