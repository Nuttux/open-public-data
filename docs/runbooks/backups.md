# Runbook — Backups & reproductibilité des sources

## Pourquoi ce runbook

3 niveaux de "backup" pour tenir la promesse Open Data :
**chaque chiffre publié est reproductible depuis sa source à la date de publication, même si la source disparaît ou change rétroactivement.**

| Niveau | Quoi | Couvre | Où |
|---|---|---|---|
| **L1** — `dbt snapshot` | Sources avec clé stable (subventions assos, marchés, etc.) | Track ligne-à-ligne | `dbt_paris_snapshots.snap_*` |
| **L2** — `bq cp --snapshot` | Sources sans clé stable (budget line items, bilan, etc.) | Whole-table à date X | `dbt_paris_snapshots.<table>__YYYYMMDD` |
| **L3** — GCS bucket versioning | Fichiers CSV/PDF bruts téléchargés depuis OpenData | Cas où l'OpenData lui-même disparaît | `gs://<bucket-raw>/` avec `--versioning on` |

Aucune redondance : chaque niveau a une raison d'exister. L1 + L2 ensemble couvrent **toutes** les tables BQ. L3 est l'assurance ultime si la source upstream est dépubliée.

---

## L1 — dbt snapshots (sources ID-keyed)

Cf [snapshots.md](snapshots.md) pour le détail. Couvre 6 sources :
- subventions_associations_votees
- liste_des_marches_de_la_collectivite_parisienne
- decp_marches_paris
- logements_sociaux_finances_a_paris
- comptes_administratifs_autorisations_de_programmes...
- pdf_investissements_localises_paris

Workflow : [`snapshots.yml`](../../.github/workflows/snapshots.yml) (cron hebdo lundi 03:00 UTC).

---

## L2 — BQ table snapshots (sources sans clé stable)

### Sources couvertes

5 tables sans `unique_key` exploitable :
- `comptes_administratifs_budgets_principaux_a_partir_de_2019_m57_ville_departement` (budget exécuté ligne à ligne)
- `budgets_votes_principaux_a_partir_de_2019_m57_ville_departement` (budget voté)
- `subventions_versees_annexe_compte_administratif_a_partir_de_2018` (annexe CA — pas de numero_dossier)
- `bilan_comptable` (~500 lignes annuelles)
- `dette_garantie_paris` (composite key complexe)

### Mécanique

[`pipeline/scripts/snapshot/bq_table_snapshots.py`](../../pipeline/scripts/snapshot/bq_table_snapshots.py) appelle `bigquery.Client.copy_table` avec `operation_type=SNAPSHOT`.

Cible des snapshots : `dbt_paris_snapshots.<table>__YYYYMMDD` (créé automatiquement si absent). Le `__` double underscore évite la collision avec les snap dbt qui utilisent `snap_*`.

### Run

```bash
# Tout snapshotter
python pipeline/scripts/snapshot/bq_table_snapshots.py

# Dry-run
python pipeline/scripts/snapshot/bq_table_snapshots.py --dry-run

# Une table seule (debug)
python pipeline/scripts/snapshot/bq_table_snapshots.py --table bilan_comptable
```

Automatique : [`bq-snapshots.yml`](../../.github/workflows/bq-snapshots.yml) (cron hebdo lundi 04:00 UTC).

### Comment restaurer / requêter

Lire un snapshot comme une table normale :

```sql
SELECT * FROM `open-data-france-484717.dbt_paris_snapshots.bilan_comptable__20260519`
WHERE Exercice_comptable = 2024;
```

Restaurer en raw (si la table raw est corrompue) :

```bash
bq cp -f \
  open-data-france-484717:dbt_paris_snapshots.bilan_comptable__20260519 \
  open-data-france-484717:raw.bilan_comptable
```

### Rétention & coût

- Les snapshots BQ sont **gratuits 7 jours** (rolling)
- Après : 0.02 $/GB/mois (long-term storage)
- Volume total estimé : ~50 MB × snapshot
- À retention infinie : <5 €/an
- Politique de purge actuellement **manuelle** (rien n'est supprimé). Si volume devient gênant, ajouter un job de purge des snapshots > N mois — pour l'instant inutile.

---

## L3 — GCS bucket versioning (sources brutes)

### Pourquoi

Si OpenData Paris dépublie un dataset, BQ + nos snapshots gardent la donnée. Mais si on veut prouver *exactement* ce que la Ville a publié (avec son schéma CSV/JSON brut, ses fichiers PDF tels quels) — il faut archiver les fichiers téléchargés avant ingestion.

### Setup (one-time)

Pour chaque bucket GCS utilisé par `pipeline/scripts/sync/` :

```bash
# Lister les buckets actuels
gsutil ls

# Activer le versioning (idempotent)
gsutil versioning set on gs://open-data-france-raw-paris

# Vérifier
gsutil versioning get gs://open-data-france-raw-paris
# → gs://open-data-france-raw-paris: Enabled
```

Une fois activé, chaque overwrite d'un fichier crée automatiquement une nouvelle version (l'ancienne est gardée). Pas de changement de code requis.

### Lifecycle (rétention)

Pour éviter la facture explosive si on overwrite quotidien :

```bash
cat > /tmp/lifecycle.json <<'EOF'
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {
        "isLive": false,
        "daysSinceNoncurrentTime": 365
      }
    }
  ]
}
EOF
gsutil lifecycle set /tmp/lifecycle.json gs://open-data-france-raw-paris
```

→ Garde 1 an de versions historiques, puis purge auto.

### Comment restaurer une version historique

```bash
# Lister les versions d'un fichier
gsutil ls -a gs://open-data-france-raw-paris/subventions_associations.csv

# Restaurer une version spécifique (le générateur sera le timestamp)
gsutil cp gs://open-data-france-raw-paris/subventions_associations.csv#1715000000000000 ./subventions_associations_old.csv
```

### Statut actuel

⚠️ **À faire** : exécuter les commandes setup ci-dessus sur les buckets prod. Pas automatisable proprement (besoin droits owner sur projet GCP).

---

## RPO / RTO

- **RPO** (perte de données max acceptable) :
  - L1 dbt snapshots : 7 jours (cron hebdo)
  - L2 BQ snapshots : 7 jours
  - L3 GCS : 1 jour (chaque sync écrase l'ancien, versioning capture)
- **RTO** (temps de restauration) :
  - L1/L2 : 1 requête SQL — instantané
  - L3 : 1 commande `gsutil cp` — secondes

## Tests de restauration

Convention : **1 test de restauration par an** sur 1 source au hasard. Documenter dans une issue "DR test YYYY".

Procédure de test :
1. Choisir une table snapshot (L1 ou L2)
2. Faire un `SELECT COUNT(*)` sur snapshot et raw — comparer
3. Simuler une corruption : `CREATE TABLE raw.foo_test AS SELECT * FROM raw.foo LIMIT 1`
4. Restaurer depuis snapshot avec `bq cp`
5. Vérifier `COUNT(*)` matche
6. Fermer l'issue

## Liens

- [snapshots.md](snapshots.md) — détail L1 dbt snapshots
- [source-correction-retroactive.md](source-correction-retroactive.md) — process amont quand source change
- [rollback.md](rollback.md) — rollback côté site (Vercel) vs côté données (ici)
- [dev-prod-separation.md](dev-prod-separation.md) — setup WIF + secrets BQ
