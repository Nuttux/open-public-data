# Runbook : correction rétroactive d'une source open data

## Contexte

Une source open data peut être corrigée rétroactivement par son éditeur :
- Open Data Paris republie un dataset avec des montants modifiés (correction d'une erreur de saisie, redressement comptable annuel).
- Data.gouv.fr met à jour rétroactivement un fichier déjà publié.
- INSEE, OFGL, DGFiP republient des séries millésimées avec des chiffres révisés.

**Le problème** : nos JSON exportés (`website/public/data/*.json`) datent d'une version antérieure de la source. Si on re-run le pipeline, les chiffres affichés sur le site changent **sans que personne ne soit prévenu**. Un journaliste qui a cité un chiffre il y a 6 mois ne peut plus le retrouver.

Ce runbook décrit comment gérer une correction rétroactive **sans casser la confiance des utilisateurs** qui ont cité un chiffre publié.

Voir aussi : [`promote-wip-to-production.md`](promote-wip-to-production.md), [`rollback.md`](rollback.md), [`docs/data-platform/04-layering-convention.md`](../data-platform/04-layering-convention.md).

## Quand utiliser ce runbook

- Open Data Paris (ou autre) publie une mise à jour d'un dataset déjà ingéré, avec des **changements de valeurs sur des lignes existantes** (pas juste de nouvelles lignes).
- Un user signale un écart entre un chiffre publié sur le site et un chiffre officiel.
- Le pipeline détecte un drift via les tests `cat5_row_count_freshness` ou `cat8_anomaly_detection`.

## Étapes

### 1. Confirmer que c'est bien une correction rétroactive (5 min)

Avant tout, distinguer trois cas :

| Cas | Action |
|-----|--------|
| Nouvelles lignes ajoutées (millésime suivant) | Refresh normal du pipeline, aucun runbook nécessaire |
| Anciennes lignes modifiées (mêmes IDs, valeurs différentes) | Suivre ce runbook |
| Anciennes lignes supprimées | Idem (cas dégradé : signaler comme retrait) |

Vérification rapide via BigQuery :

```sql
-- Comparer la table raw actuelle vs un snapshot précédent (si disponible)
SELECT
  current.id,
  current.montant AS new_montant,
  snap.montant AS old_montant,
  current.montant - snap.montant AS delta
FROM `open-data-france-484717.raw.<entity>_paris` AS current
INNER JOIN `open-data-france-484717.raw.<entity>_paris_snap_YYYY_MM_DD` AS snap
  USING (id)
WHERE current.montant != snap.montant
LIMIT 100;
```

Si pas de snapshot précédent → diff impossible, passer directement à l'étape 4 (figer la version courante).

### 2. Geler la version corrigée comme un nouveau snapshot (10 min)

Avant de re-run le pipeline, **geler la version actuelle des JSON** dans un dossier daté :

```bash
DATE=$(date +%Y-%m-%d)
mkdir -p website/public/data/_snapshots/$DATE
cp -r website/public/data/<entity> website/public/data/_snapshots/$DATE/
git add website/public/data/_snapshots/$DATE
git commit -m "snapshot(<entity>): before retroactive correction $DATE"
```

Le dossier `_snapshots/YYYY-MM-DD/` est tracké en git pour qu'un journaliste puisse retrouver la version qu'il avait citée.

### 3. Re-run le pipeline avec la source mise à jour (15 min)

```bash
# Sync de la source corrigée
cd pipeline
python scripts/sync/sync_<entity>.py

# dbt run + tests (les tests doivent passer ou échouer explicitement)
dbt run --select <entity>+
dbt test --select <entity>+

# Export
python scripts/export/export_<entity>.py
```

Les tests dbt cat. 5 (row count freshness) et cat. 8 (anomaly detection) doivent **passer**. Si ils échouent, c'est probablement un drift qu'il faut investiguer avant de publier.

### 4. Documenter la correction côté éditorial (15 min)

Ajouter une entrée dans `docs/data-corrections-log.md` (créer le fichier si absent) :

```markdown
## YYYY-MM-DD — <entity> : correction rétroactive

**Source** : [Open Data Paris — <dataset>](https://opendata.paris.fr/explore/dataset/<dataset>/)
**Détection** : <comment on l'a vu>
**Ampleur** : N lignes modifiées sur Y total (Z €)
**Cause éditeur** : <ce que l'éditeur dit dans son changelog>
**Impact côté site** : <pages affectées>
**Snapshot avant correction** : `website/public/data/_snapshots/YYYY-MM-DD/`
**Commit** : <hash>
```

### 5. Notifier les users qui ont cité un chiffre affecté

- Si une analyse / article du blog cite un chiffre maintenant modifié → ajouter une bannière "ce chiffre a été corrigé le YYYY-MM-DD, voir la version d'origine ici".
- Si un partenaire ou journaliste a cité publiquement → email proactif avec le snapshot d'origine.

### 6. Mettre à jour la méthodologie publique

La page `/methode` doit mentionner que les chiffres peuvent être corrigés rétroactivement par les éditeurs sources, et pointer vers `docs/data-corrections-log.md`.

## Plan B : la source disparaît ou refuse de fournir un changelog

Si l'éditeur ne documente pas la correction (cas fréquent en pratique) :

1. Conserver le snapshot précédent à perpétuité dans `_snapshots/`.
2. Publier sur `/methode` la phrase exacte : "La source X a été corrigée par son éditeur entre les dates A et B. Nous n'avons pas reçu de changelog officiel. Voir le snapshot d'origine ici : <lien>."
3. Considérer signaler officiellement à l'éditeur (exemple : Open Data Paris contact, https://opendata.paris.fr/contact) — la transparence sur les corrections devrait faire partie de leur engagement.

## Voir aussi

- [`promote-wip-to-production.md`](promote-wip-to-production.md) — promotion d'un script WIP en prod
- [`rollback.md`](rollback.md) — rollback d'un déploiement cassé
- [`docs/data-platform/04-layering-convention.md`](../data-platform/04-layering-convention.md) — règles de layering pipeline
- dbt sources freshness : https://docs.getdbt.com/reference/resource-properties/freshness
- dbt snapshots : https://docs.getdbt.com/docs/build/snapshots
