# Runbook : séparation dev / prod

## Pourquoi

Avant le round 3 review, les targets `dev` et `prod` de `pipeline/profiles.yml` pointaient toutes deux vers les **mêmes datasets BigQuery** (`dbt_paris_*`). Cela signifiait qu'un `dbt test` lancé en local mutait potentiellement la donnée que l'UI lisait en temps réel sur opendata-paris.fr.

Depuis [Issue #2 round 3](#), trois targets distinctes :

- **dev** → `dbt_paris_dev_<user>_*` (préfixé par username)
- **ci** → `dbt_paris_ci_<run_id>_*` (éphémère, nettoyé post-run)
- **prod** → `dbt_paris_*` (UI prod, ne jamais cibler depuis local)

## Workflow dev

```bash
# Définir l'username (une fois, dans ton ~/.zshrc ou similaire)
export DBT_USER="daniel"

# Build dans le dataset dev (préfixé par ton user)
cd pipeline
dbt build --target dev

# Cela crée :
#   open-data-france-484717.dbt_paris_dev_daniel_staging.*
#   open-data-france-484717.dbt_paris_dev_daniel_analytics.*
#   open-data-france-484717.dbt_paris_dev_daniel_marts.*
#   open-data-france-484717.dbt_paris_dev_daniel_intermediate.*
#   open-data-france-484717.dbt_paris_dev_daniel_seeds.*

# La prod n'est PAS touchée.
```

## Workflow CI

GitHub Actions auto-set `GITHUB_RUN_ID`. Le dataset CI est unique par run :

```bash
# Dans le workflow YAML, après auth GCP :
cd pipeline
dbt build --target ci  # → dbt_paris_ci_42_*

# Post-step : drop le dataset éphémère pour éviter les coûts de stockage
bq rm -r -f -d open-data-france-484717:dbt_paris_ci_${GITHUB_RUN_ID}_marts
bq rm -r -f -d open-data-france-484717:dbt_paris_ci_${GITHUB_RUN_ID}_analytics
bq rm -r -f -d open-data-france-484717:dbt_paris_ci_${GITHUB_RUN_ID}_intermediate
bq rm -r -f -d open-data-france-484717:dbt_paris_ci_${GITHUB_RUN_ID}_staging
bq rm -r -f -d open-data-france-484717:dbt_paris_ci_${GITHUB_RUN_ID}_seeds
```

## Workflow prod

**Une seule façon de cibler prod : la release** (manuel ou via workflow `release.yml` qui n'existe pas encore — TODO).

```bash
# DANGER : ne jamais lancer ça en local
# Réservé au workflow de release (à créer)
cd pipeline
dbt build --target prod
# Met à jour les tables que l'UI lit en temps réel.
```

## Migration du dataset DBT_USER existant

Si tu as déjà des données dans le dataset `dbt_paris_*` (l'ancien dev = prod) :

```bash
# Option 1 : ne rien faire. Ces tables RESTENT prod (l'UI les lit).
# Le prochain `dbt build --target dev` créera des dbt_paris_dev_<user>_* en parallèle.

# Option 2 : si tu veux nettoyer prod, fais-le après release explicite.
```

## Garde-fous

- **Aucun script Python** ne référence directement le dataset prod. Tous lisent `MARTS_DATASET` qui est fixé en constante (à terme : passer par env var).
- **`dbt run`/`dbt test` sans `--target`** utilise la default = `dev`. Donc un `dbt test` négligent ne touche pas prod.
- **Profile.yml versionné** avec ces 3 targets — si quelqu'un copie en `~/.dbt/profiles.yml`, il garde la séparation.

## TODO non couvert

- **Workflow de release** (`.github/workflows/release.yml`) qui orchestre `dbt build --target prod` + `dbt source freshness` + `dbt test` avec un service account dédié.
- **Snapshot prod → dev** weekly via `bq cp` pour que les devs travaillent sur des données réalistes.
- **Audit trail** : qui a lancé un build prod, à quelle heure, avec quel commit hash. À mettre dans BQ INFORMATION_SCHEMA.JOBS.
