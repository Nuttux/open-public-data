# Documentation — Open Data Paris

## Par où commencer

Selon ton rôle :

| Rôle | Lis d'abord |
|---|---|
| **Nouveau contributeur — vue d'ensemble** | [data-platform/README.md](data-platform/README.md) |
| **Dev qui ajoute/modifie un modèle dbt** | [data-platform/04-layering-convention.md](data-platform/04-layering-convention.md) |
| **Dev qui ajoute un dataset / sync** | [data-platform/02-catalog-and-model.md](data-platform/02-catalog-and-model.md) |
| **Dev qui modifie l'UI ou les exports** | [data-platform/01-pipeline-diagram.md](data-platform/01-pipeline-diagram.md) |
| **Auditeur / data quality** | [data-platform/03-quality-monitoring.md](data-platform/03-quality-monitoring.md) + [data-quality.md](data-quality.md) |
| **Dev qui veut câbler un WIP au front** | [runbooks/promote-wip-to-production.md](runbooks/promote-wip-to-production.md) |
| **Décisions d'architecture passées** | [decisions/](decisions/) (ADR series) |

## Plan du repo

```
docs/
  README.md                ← (ce fichier) entry point unique
  architecture-modelling.md ← architecture narrative (quoi/pourquoi)
  data-quality.md          ← tracker des incidents data
  data-platform/
    README.md              ← intro plateforme + contrats
    01-pipeline-diagram.md ← topologie sources → JSON (mermaid)
    02-catalog-and-model.md ← référence : sources, tables, modèles
    03-quality-monitoring.md ← tests dbt, gates, suivi
    04-layering-convention.md ← règles stg/core/(int)/mart, gate audit
    rendered/              ← PDFs/SVGs/PNGs des diagrammes
  decisions/               ← ADR series (chaque choix d'archi figé)
    README.md              ← index des ADR
    0001-* .. 0008-*       ← un ADR par décision
  archive/                 ← logs de refactors passés (lecture seule)
```

## Outils opérationnels

```bash
# Audit gate (refuse les bypasses du layering)
python3 pipeline/scripts/audit/check_layering.py --strict

# Audit frontend (refuse fetch UI hors /data/)
python3 pipeline/scripts/audit/check_frontend_fetches.py --strict

# dbt test (cible dev par défaut, jamais prod)
cd pipeline && DBT_USER=$USER dbt test --target dev

# Source freshness
cd pipeline && dbt source freshness --target dev

# Re-render diagrammes
python3 docs/data-platform/rendered/extract_blocks.py
# (puis npx mmdc dans rendered/)
```

## ⚠️ Status CI

Le workflow `.github/workflows/data-platform-audit.yml` a deux niveaux :

**Niveau 1 — toujours actif** (pas de credentials BQ requis) :
- ✅ Layering audit (refus des bypasses)
- ✅ Frontend fetch audit
- ✅ `dbt parse` (validation syntaxe Jinja + refs)
- ✅ schema.yml completeness check

**Niveau 2 — à activer** (nécessite setup GCP Workload Identity Federation) :
- ❌ `dbt test` (les 280+ tests data-quality)
- ❌ `dbt source freshness`
- ❌ `verify_export` (byte-equality des JSON)

**Aujourd'hui le niveau 2 est désactivé.** Le job `ci-status` du workflow annonce visiblement ce mode partiel à chaque run pour éviter une fausse impression de couverture. Pour activer :

1. Configurer Workload Identity Federation entre GitHub Actions et GCP
2. Ajouter les secrets repo : `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`
3. Ajouter la variable repo : `ENABLE_BQ_CI=true`

Voir [runbooks/dev-prod-separation.md](runbooks/dev-prod-separation.md) pour le setup détaillé.

## Licence

Le repo combine deux régimes :

- **Code (Python, TS, dbt, scripts, ADR, diagrammes)** : [AGPL-3.0](../LICENSE) — copyleft réseau. Si tu forks et que tu héberges une version modifiée sur un serveur accessible publiquement (typiquement : adapter le projet pour ta propre ville), tu **dois publier les modifications du code source**. Ce choix est intentionnel : le projet est conçu comme un commun citoyen, et l'AGPL empêche les ré-utilisations propriétaires d'un travail open data.
- **Données publiées (sous `website/public/data/`)** : [Licence Ouverte Etalab 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/), héritée des sources OpenData Paris, data.gouv.fr, INSEE, DRIHL, etc. Les champs `source` et `source_url` doivent être conservés en cas de republication. La licence AGPL du code **ne s'applique pas** à la donnée publiée (qui reste libre per Etalab).
- **Synthèses LLM** (vulgarisations, traductions sous `enrichment/vulgarization_*`) : couvertes par l'AGPL en tant que dérivés du code. Si tu republie ces synthèses, **disclose la provenance IA** (Gemini, Claude) per l'AI Act du 1er août 2024.

Voir le fichier [LICENSE](../LICENSE) racine.

### Conséquence pratique

Si quelqu'un veut héberger une version pour Lyon ou Marseille en partant de ce repo : c'est explicitement encouragé, mais leur version doit elle-même être open source AGPL. Pas de fork propriétaire qui prend le code et garde les améliorations privées.

## Convention sur la doc

- **README** = entry point. Maximum 200 lignes. Pointe vers les détails.
- **ADR** = décisions figées. Une ADR par décision, jamais réécrite (superseded si besoin).
- **Numbered docs** (`0X-*.md`) = référence par sujet, peut évoluer.
- **`_*` ou `archive/`** = artefacts d'un travail terminé, lecture seule.

Toute PR qui change l'architecture doit soit référencer un ADR existant, soit en créer un nouveau.
