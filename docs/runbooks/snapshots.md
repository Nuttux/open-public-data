# Runbook — Snapshots historiques des sources

## Pourquoi

La Ville de Paris **republie régulièrement ses datasets** (subventions amendées, marchés avec avenants, AP réajustées). Sans snapshot, un chiffre cité en mars n'est plus reproductible en juin si la source a été remplacée entretemps.

Promesse du site : *"chaque chiffre publié peut être reconstitué depuis sa source à la date de publication"*. C'est ce runbook qui la rend opérationnelle.

## Comment ça marche

- Chaque snapshot est un fichier `pipeline/snapshots/snap_*.sql` qui décrit :
  - la source raw à suivre (`{{ source('paris_raw', '...') }}`)
  - la clé unique (`unique_key`)
  - les colonnes business à monitorer (`check_cols`)
- À chaque exécution de `dbt snapshot`, dbt compare l'état actuel à l'état précédent stocké dans `dbt_paris_snapshots.snap_*`. Si une colonne business a changé pour une ligne, la version précédente est archivée avec `dbt_valid_to = now()` et la nouvelle version stockée avec `dbt_valid_from = now()`.
- Les snapshots tournent **hebdomadairement** via [snapshots.yml](../../.github/workflows/snapshots.yml) (lundi 03:00 UTC) + sur demande via `workflow_dispatch`.

## Sources couvertes (v1)

| Snapshot | Source raw | Clé unique | Couvre |
|---|---|---|---|
| `snap_subventions_associations` | `subventions_associations_votees` | `numero_de_dossier + annee_budgetaire` | Subventions aux assos (102k lignes) |
| `snap_marches_paris` | `liste_des_marches_de_la_collectivite_parisienne` | `numero_marche` | Marchés Ville (17k lignes) |
| `snap_decp_marches` | `decp_marches_paris` | `id` | DECP data.gouv.fr |
| `snap_logements_sociaux` | `logements_sociaux_finances_a_paris` | `identifiant_livraison` | Logements financés (4k) |
| `snap_ap_projets` | `comptes_administratifs_autorisations_de_programmes...` | `autorisation_de_programme_cle + exercice_comptable` | Projets AP |
| `snap_pdf_investissements` | `pdf_investissements_localises_paris` | `id` | Extraction PDF (~3k projets) |

## Sources NON couvertes (TODO v2)

Les sources sans clé stable (line items budgétaires) ne peuvent pas être snapshottées proprement par dbt. Pour les couvrir :

- `comptes_administratifs_budgets_principaux_*` (budget exécuté ligne à ligne)
- `budgets_votes_principaux_*` (budget voté ligne à ligne)
- `subventions_versees_annexe_compte_administratif_...` (annexe CA)
- `bilan_comptable`
- `dette_garantie_paris`

**Solution prévue** : `bq cp --snapshot raw.foo dbt_paris_snapshots.foo_YYYYMMDD` via un script Python `pipeline/scripts/snapshot/bq_table_snapshots.py` lancé par le même workflow. Rétention 90 jours (~$0.02/GB/mois après les 7 premiers jours gratuits BQ).

## Run

### Manuel (debug ou backfill)

```bash
cd pipeline
dbt snapshot --target prod                          # tous les snapshots
dbt snapshot --target prod --select snap_marches_paris  # un seul
```

Prérequis : profil `prod` configuré (cf [dev-prod-separation.md](dev-prod-separation.md)) + credentials BQ.

### Automatique

- Cron hebdo défini dans [snapshots.yml](../../.github/workflows/snapshots.yml)
- Tourne uniquement si `vars.ENABLE_BQ_CI == 'true'` (sinon le job est skip)
- Pour ré-exécuter à la demande : Actions → snapshots → Run workflow

## Comment retrouver un chiffre historique

Pour répondre à *"que disait le montant de la subvention CASVP 2024 le 15 mars 2026 ?"* :

```sql
SELECT
  numero_de_dossier,
  nom_beneficiaire,
  montant_vote,
  dbt_valid_from,
  dbt_valid_to
FROM `open-data-france-484717.dbt_paris_snapshots.snap_subventions_associations`
WHERE nom_beneficiaire LIKE '%CASVP%'
  AND annee_budgetaire = 2024
  AND DATE '2026-03-15' BETWEEN DATE(dbt_valid_from) AND COALESCE(DATE(dbt_valid_to), CURRENT_DATE())
```

## Coûts BQ

- ~6 snapshots × scan ~5 MB en moyenne = 30 MB lus par run
- 1 run/semaine × 52 = ~1,5 GB/an lus
- ~3-5 € maximum / an sur le pricing BigQuery pay-as-you-go
- Stockage snapshot tables : croissance ~10 MB/semaine, négligeable

## Étendre le système

Pour ajouter un snapshot sur une source ID-keyed :

1. Créer `pipeline/snapshots/snap_<source>.sql` (s'inspirer des existants)
2. Définir `unique_key` et `check_cols` (colonnes business, pas métadonnées)
3. `dbt parse` pour valider la syntaxe
4. Tester en dev : `dbt snapshot --target dev --select snap_<source>`
5. Merger → le workflow hebdo prend automatiquement le nouveau snapshot

Pour ajouter un snapshot sur une source SANS ID stable : implémenter v2 (bq cp).

## Liens

- Doc dbt snapshot officielle : <https://docs.getdbt.com/docs/build/snapshots>
- Source correction rétroactive (process amont) : [source-correction-retroactive.md](source-correction-retroactive.md)
- Rollback (process aval) : [rollback.md](rollback.md)
