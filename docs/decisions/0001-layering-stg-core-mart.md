# ADR-0001 : Layering `stg → core → (int) → mart → export → JSON`

**Status** : Accepted (2026-05-07)
**Décideur** : daniel
**Contexte** : phases 0-18 du refactor layering

## Contexte

Le projet OpenDataParis transforme des données publiques (OpenData Paris, DGFiP, INSEE, scrape) en JSONs servis à un Next.js. Avant le refactor, plusieurs scripts écrivaient directement dans `website/public/data/` sans passer par BigQuery, créant 4 flèches de bypass dans le diagramme et rendant l'origine de chaque chiffre opaque.

L'objectif : pour tout fichier sous `website/public/data/`, on doit pouvoir tracer en SQL la transformation depuis la source brute jusqu'au JSON exposé.

## Décision

**Tout chemin de donnée respecte la séquence** :

```
external source → ingest → raw.* (BigQuery)
                ↳ stg_*  (one-to-one avec source ou seed)
                ↳ core_* (entité métier OBT, joint stg + seeds)
                ↳ int_*  (optionnel, cross-domain post-core)
                ↳ mart_* (shape consommateur d'1 JSON / famille de JSONs)
                ↳ export → public/data/<file>.json
                ↳ UI lecture (read-only, jamais BQ direct)
```

Aucune dérogation hors whitelist documentée et justifiée par ADR.

## Alternatives rejetées

- **dbt strict (`stg → int → mart`, sans `core`)** : voir [ADR-0002](0002-naming-core-vs-int.md). Refusé pour conserver une couche OBT par entité explicite.
- **`stg → core → mart` (sans `int`)** : envisagé mais conservé `int` pour les compositions cross-domain (ex `int_projet_marches` joint `core_ap_projets × core_marches_publics`). Si `int` n'a qu'un consommateur, à éclater inline (pour Phase 16 : `int_ap_projets_enrichis` et `int_subventions_enrichies` ont été aplatis dans `core_*`).
- **Lake-and-shore (raw → mart direct)** : refusé. Trop de logique métier dans les marts → impossible à auditer.

## Conséquences

**Positives** :
- Auditable ligne à ligne. `dbt docs generate` produit le lineage natif.
- Une seule règle, enforce-able par script (`pipeline/scripts/audit/check_layering.py`).
- Tests cross-layer (`xlay_*`) garantissent la cohérence montant total à chaque couche.

**Négatives** :
- Cérémonie pour les caches d'enrichissement (LLM/SIRENE) qui ne bénéficient pas réellement du round-trip BQ. Voir [ADR-0004](0004-polymorphic-vs-typed-caches.md).
- 6 marts « thin » qui ne font que projection + ORDER BY. Acceptés en [ADR-0003](0003-thin-marts-as-views.md).
- Performance : les seeds-mappings (`stg_mapping_*`) sont matérialisés en view → un peu plus lent qu'un `ref('seed_X')` direct, mais on garde la règle.

## Enforcement

`pipeline/scripts/audit/check_layering.py --strict` doit retourner exit 0 en CI. Toute violation = la PR ne peut pas merger.
