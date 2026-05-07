# Runbook : stratégie de sauvegarde des données (cat. 4)

## Contexte

Le site sert des JSON pré-calculés depuis `website/public/data/` (taille totale ~500 MB). Ces JSON sont **régénérés à la demande** par le pipeline depuis BigQuery. Donc en cas de corruption ou de suppression accidentelle, on peut **toujours rebuilder**.

Ce qu'on doit sauvegarder, c'est :
1. **Les sources brutes** (raw BigQuery) qui peuvent être supprimées par l'éditeur (Open Data Paris) ou écrasées par un re-run.
2. **Les seeds dbt** (`pipeline/seeds/*.csv`) qui contiennent les enrichissements LLM coûteux à régénérer (~100 € de calls Claude/Gemini cumulés).
3. **Les caches d'enrichissement** (`pipeline/cache/`) — pareil, coûteux à rebuild.
4. **L'historique git** (le code lui-même) — déjà sauvegardé sur GitHub.

## Stratégie

### Niveau 1 — Git (gratuit, déjà en place)

Tout ce qui est dans le repo git est sauvegardé :
- Code source
- `pipeline/seeds/*.csv` (mappings + enrichissements LLM consolidés)
- `website/public/data/*.json` (snapshots versionnés des exports)

Recovery : `git clone` du repo restaure tout ce qui est tracké.

**Limites** : les caches `pipeline/cache/` sont en `.gitignore` (trop gros pour git, plusieurs GB). Et BigQuery raw n'est pas dans git.

### Niveau 2 — BigQuery (responsabilité GCP)

BigQuery garde par défaut un **time travel de 7 jours** sur toutes les tables. Pour une recovery dans cette fenêtre :

```sql
-- Restaurer une table à un point passé
CREATE OR REPLACE TABLE `open-data-france-484717.raw.subventions_paris`
AS SELECT * FROM `open-data-france-484717.raw.subventions_paris`
   FOR SYSTEM_TIME AS OF TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY);
```

Au-delà de 7 jours : pas de recovery automatique côté GCP. Il faut soit :
- Re-syncer depuis la source (Open Data Paris) — possible si la source n'a pas changé
- Restaurer depuis un snapshot manuel (cf niveau 3)

### Niveau 3 — Snapshots manuels avant changement majeur (à instaurer)

**Avant chaque** changement de structure raw / réécriture massive d'un seed / re-run de pipeline coûteux (LLM enrichment), exporter un snapshot dans GCS :

```bash
DATE=$(date +%Y-%m-%d)
PROJECT=open-data-france-484717
BUCKET=gs://opd-snapshots

# Snapshot d'une table raw avant écrasement
bq extract --destination_format=NEWLINE_DELIMITED_JSON \
  $PROJECT:raw.subventions_paris \
  $BUCKET/raw/subventions_paris/$DATE/*.json

# Snapshot des seeds dbt avant re-run LLM coûteux
gsutil -m cp -r pipeline/seeds/ $BUCKET/seeds/$DATE/

# Snapshot des caches d'enrichissement (garde le calcul LLM)
gsutil -m cp -r pipeline/cache/ $BUCKET/cache/$DATE/
```

**Bucket GCS à créer** (one-time setup) :
1. Console GCP → Cloud Storage → Create bucket
2. Name: `opd-snapshots`
3. Region: `europe-west9` (Paris, latence et résidence EU)
4. Storage class: `Coldline` (3,3 Md€/Go/mois, optimisé read rare)
5. Lifecycle rule: après 90 jours → `Archive` (1,5 c€/Go/mois)
6. Versioning: ON (garde toutes les versions, anti-écrasement accidentel)

Coût estimé pour ~10 GB de snapshots cumulés : **< 1 €/mois**.

### Niveau 4 — Backup hebdo automatique (optionnel)

Une fois la stratégie niveau 3 rodée, automatiser via le workflow GitHub Actions
existant (`enrich-pipeline.yml`) — ajouter un step `Backup` après le run :

```yaml
- name: Backup raw + seeds + cache to GCS
  run: bash pipeline/scripts/ops/backup_to_gcs.sh
  env:
    GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GCS_BACKUP_KEY }}
```

Le script `backup_to_gcs.sh` est à écrire — pattern :
```bash
#!/usr/bin/env bash
set -euo pipefail
DATE=$(date +%Y-%m-%d)
PROJECT=open-data-france-484717
BUCKET=gs://opd-snapshots/auto

bq extract $PROJECT:raw.* $BUCKET/raw/$DATE/
gsutil -m cp -r pipeline/seeds/ $BUCKET/seeds/$DATE/
echo "Backup OK : $BUCKET/$DATE/"
```

## Plan de recovery

### Si BigQuery raw est corrompue / supprimée
1. **< 7 jours** : `FOR SYSTEM_TIME AS OF` (cf niveau 2)
2. **> 7 jours** : restaurer depuis GCS niveau 3 (`bq load`)
3. **Aucun snapshot** : re-syncer depuis Open Data Paris via `pipeline/scripts/sync/*`

### Si les seeds dbt sont corrompus
1. **`git checkout HEAD -- pipeline/seeds/`** restaure le dernier état committed.
2. Si les seeds n'ont jamais été committés : restaurer depuis GCS.

### Si l'export `website/public/data/*.json` est corrompu
1. `git checkout HEAD -- website/public/data/` restaure la dernière version committed.
2. Re-run `python pipeline/scripts/export/export_<entity>.py`.

## Pour faire de cette PR un statut "complete"

Ce runbook documente la stratégie. Pour la mettre en œuvre, suivi à faire (action user) :

- [ ] Créer le bucket GCS `opd-snapshots` (5 min, GCP console)
- [ ] Première snapshot manuel des tables raw critiques (10 min)
- [ ] Script `pipeline/scripts/ops/backup_to_gcs.sh` (1 h)
- [ ] Step backup dans `enrich-pipeline.yml` (15 min) + provisioning du secret `GCS_BACKUP_KEY`

Ces 4 actions transforment la stratégie documentée en stratégie active.

## Voir aussi

- [`rollback.md`](rollback.md) — rollback d'un déploiement cassé
- [`source-correction-retroactive.md`](source-correction-retroactive.md) — corrections rétroactives
- BigQuery time travel : https://cloud.google.com/bigquery/docs/time-travel
- GCS lifecycle : https://cloud.google.com/storage/docs/lifecycle
