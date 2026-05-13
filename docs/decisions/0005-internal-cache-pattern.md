# ADR-0005 : Pattern « internal cache » pour LLM/scrape/PDF

**Status** : Accepted (2026-05-07)
**Décideur** : daniel
**Contexte** : Phases 8, 9, 11, 12 du refactor

## Contexte

Plusieurs producteurs de données ne sont **pas idempotents en SQL** :

- LLM (vulgarizations, grounded context, classifications) — appels API non-déterministes
- Scrape HTML (deliberations Conseil de Paris) — page-state au moment du scrape
- Vision PDF (Gemini Vision sur Annexe IL) — coût important, déterminisme imparfait
- API externe (recherche-entreprises pour SIRENE) — rate-limited

Si on les met dans un sync direct vers BigQuery, on retombe dans deux pièges :
1. Les rerouter en pleine production rebuild = coût énorme (LLM tokens, pages PDF)
2. Pas de cache disque → impossible de continuer un travail interrompu

## Décision

**Pattern à deux niveaux** :

```
producer (LLM/scrape/PDF) → pipeline/cache/<topic>/<file> (disque interne)
                          ↳ sync_<topic>.py charge cache → raw.<topic>_paris
                          ↳ stg → core → mart
                          ↳ export → public/data/<file>
```

Le cache disque (`pipeline/cache/`) joue trois rôles :
1. **Scratch idempotent** : un script peut écrire un fichier final sans avoir à parler à BigQuery (offline-friendly).
2. **Source du sync** : `sync_*.py` lit le cache et le matérialise en BQ.
3. **Repro** : un dev peut commit un cache complet dans une PR pour discuter d'une extraction sans avoir besoin d'API keys.

Le contenu de `pipeline/cache/` n'est **JAMAIS** lu directement par l'UI. Aucun `fetch('pipeline/cache/...')` côté frontend n'est légal.

## Alternatives rejetées

**A. Producer écrit direct dans `public/data/`**
- ✅ Plus simple
- ❌ Casse le layering — la donnée n'a pas transité par BigQuery
- ❌ L'UI consomme un fichier qui n'est pas issu d'un sync stable

**B. Producer écrit direct dans `raw.<topic>_paris`**
- ✅ Pas de fichier intermédiaire
- ❌ LLM/PDF/scrape demandent retry, idempotence, debug → impossible si tout vit en BQ
- ❌ Coût (chaque relance = re-call LLM)

**C. Tout passer par GCS comme cache**
- ✅ Cloud-native
- ❌ Overhead pour un projet où le dev se fait localement à 90 %
- ❌ Casse le « repro PR avec cache committé »

## Conséquences

**Positives** :
- Producteurs restent simples (un script Python, écrit un fichier).
- BigQuery devient l'autorité pour les données publiées (ce que l'UI consomme).
- Auditable : `pipeline/cache/<topic>/X` doit avoir une ligne dans `raw.<topic>_paris` et inversement.

**Négatives** :
- Le « round-trip BQ » pour des données qui pourraient théoriquement vivre uniquement en cache et être copiées telles-quelles → cérémonie. Voir [ADR-0004](0004-polymorphic-vs-typed-caches.md) pour le compromis polymorphe sur les enrichments.
- 5 sync scripts à maintenir (`sync_dette_garantie`, `sync_pdf_investissements_localises`, `sync_deliberations`, `sync_sirene_companies`, `sync_enrichment_caches`).

## Enforcement

- `pipeline/scripts/audit/check_layering.py` refuse tout write d'un script `enrich/` ou `tools/` ou `sync/` vers `website/public/data/`.
- Le frontend audit (Issue #9) refuse tout `fetch('pipeline/cache/...')`.
