# Runbook : activer BigQuery en CI (Workload Identity Federation)

## Pourquoi

Aujourd'hui, le workflow `enrich-pipeline.yml` peut tourner en GitHub Actions, mais SEULEMENT pour les phases `sync` + `enrich` (tier2 Sirene). Les phases `dbt` et `export` lisent BigQuery → elles ont besoin de credentials GCP, qu'on n'a pas voulu mettre dans le repo (et qu'on ne MET PAS sous forme de fichier JSON même en secret).

La solution standard et propre pour GitHub Actions ↔ GCP est **Workload Identity Federation (WIF)** : GitHub authentifie un job via OIDC, GCP fait confiance à cette identité et la mappe sur un service account. **Pas de clé statique stockée.**

Une fois fait :
- `vars.ENABLE_BQ_CI=true` débloque les jobs `dbt-test` et `data-quality-audit` dans `data-platform-audit.yml` (le job `verify-exports` a été retiré le 2026-09-09 : structurellement rouge entre un refresh et la prochaine publication de la Ville, il ne testait plus le code mais le calendrier — voir l'en-tête du workflow).
- Le job `data-quality-audit` rejoue `run_data_quality_audit.py` à chaque PR, upload le JSON en artifact (90j), et fail la PR si un check passe à `fail` ou régresse vs `website/public/data/data_quality_audit.json` committé.
- Le cron `enrich-pipeline.yml` résoudra `phases=auto` → `sync,dbt,export,enrich` (refresh complet de toutes les sources).

Durée totale du setup : ~30 minutes. Une seule fois.

## Migration 2026-09 : Nuttux/open-public-data → AbstractsMachine/qipu

Le pool, le provider et le service account existent déjà (créés le 2026-05-19
pour l'ancien repo). Après la purge du repo (2026-08-27), deux objets GCP
pointent encore sur l'ancien nom et les secrets/variable du nouveau repo sont
vides — c'est pour ça que le cron résolvait en `sync` seul et ne publiait
rien. Il suffit de repointer, pas de recréer :

```bash
# 1. Provider : n'accepter que le nouveau repo (plus strict que l'org).
gcloud iam workload-identity-pools providers update-oidc github-oidc \
  --project=open-data-france-484717 --location=global \
  --workload-identity-pool=github-actions \
  --attribute-condition="assertion.repository == 'AbstractsMachine/qipu'"

# 2. Service account : autoriser le nouveau repo à l'impersonner
#    (et retirer l'ancien, qui n'existe plus).
SA="gha-bq-ci@open-data-france-484717.iam.gserviceaccount.com"
POOL="principalSet://iam.googleapis.com/projects/281685193792/locations/global/workloadIdentityPools/github-actions/attribute.repository"
gcloud iam service-accounts add-iam-policy-binding "$SA" --project=open-data-france-484717 \
  --role=roles/iam.workloadIdentityUser --member="$POOL/AbstractsMachine/qipu"
gcloud iam service-accounts remove-iam-policy-binding "$SA" --project=open-data-france-484717 \
  --role=roles/iam.workloadIdentityUser --member="$POOL/Nuttux/open-public-data"

# 3. GitHub : secrets + variable sur le nouveau repo.
gh secret set GCP_WORKLOAD_IDENTITY_PROVIDER -R AbstractsMachine/qipu \
  --body "projects/281685193792/locations/global/workloadIdentityPools/github-actions/providers/github-oidc"
gh secret set GCP_SERVICE_ACCOUNT -R AbstractsMachine/qipu --body "$SA"
gh variable set ENABLE_BQ_CI -R AbstractsMachine/qipu --body true
```

Vérification : `gh workflow run enrich-pipeline.yml -R AbstractsMachine/qipu -f publish=false`
→ le job `refresh` doit passer l'auth GCP, puis `gate-site` doit tourner sur la
branche `data/refresh-*` créée. Rien n'atteint `main` tant que `publish=false`.

## Pré-requis

- `gcloud` CLI installé et authentifié (`gcloud auth login`)
- Accès admin au projet GCP `open-data-france-484717`
- Accès admin au repo GitHub `AbstractsMachine/qipu`

## Étapes

### 1. Variables locales

```bash
export PROJECT_ID="open-data-france-484717"
export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
export POOL_ID="github-actions"
export PROVIDER_ID="github-oidc"
export SA_NAME="gha-bq-ci"
export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
export GH_REPO="AbstractsMachine/qipu"

echo "Project number: $PROJECT_NUMBER"
echo "Service account email (à noter): $SA_EMAIL"
```

### 2. Créer le service account dédié CI

```bash
gcloud iam service-accounts create "$SA_NAME" \
  --project="$PROJECT_ID" \
  --display-name="GitHub Actions BQ CI" \
  --description="Used by GitHub Actions for dbt test + export verification (read-only on prod, read-write on CI datasets)"
```

### 3. Donner les permissions minimales

```bash
# Lecture (redondant avec dataEditor mais utile en fallback)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.dataViewer" \
  --condition=None

# Écriture sur toutes les tables BQ du projet (sync raw + dbt run).
# 2026-05-19 : on a essayé une condition `resource.name.startsWith("projects/_/datasets/raw")
# || ... dbt_paris*"` mais l'évaluation IAM ne match pas comme attendu sur
# l'upload BQ. Simplifié en grant unconditional — le scope est de toute
# façon limité au projet GCP, et la WIF restreint déjà au repo AbstractsMachine/qipu.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.dataEditor" \
  --condition=None

# Lancer des jobs + créer des datasets (dbt en a besoin pour materialize).
# Plus large que `jobUser` qui ne donne que jobs.create.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.user" \
  --condition=None
```

> **Note** : le SA est scoped au projet BQ uniquement (pas de compute, pas de storage, pas d'IAM). La WIF restreinte à `repository_owner == 'Nuttux'` empêche tout autre repo GitHub d'usurper cette identité.

### 4. Créer le Workload Identity Pool + Provider

```bash
gcloud iam workload-identity-pools create "$POOL_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_ID" \
  --display-name="GitHub OIDC" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == 'AbstractsMachine'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

> **Note** : la condition `assertion.repository_owner == 'AbstractsMachine'` empêche n'importe quel autre repo GitHub d'usurper cette identité. Resserre encore avec `assertion.repository == 'AbstractsMachine/qipu'` si tu veux le binding strictement par repo.

### 5. Autoriser le repo GitHub à impersonner le service account

```bash
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GH_REPO}"
```

### 6. Récupérer la ressource provider à coller dans GitHub

```bash
echo "GCP_WORKLOAD_IDENTITY_PROVIDER:"
echo "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"
echo ""
echo "GCP_SERVICE_ACCOUNT:"
echo "$SA_EMAIL"
```

Garde cette sortie sous la main : tu vas la coller dans les secrets GitHub.

### 7. Configurer GitHub

Sur https://github.com/AbstractsMachine/qipu :

**Settings → Secrets and variables → Actions → New repository secret :**

| Nom | Valeur |
|---|---|
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | la première ligne de l'étape 6 |
| `GCP_SERVICE_ACCOUNT` | la deuxième ligne de l'étape 6 |

**Settings → Secrets and variables → Actions → Variables tab → New repository variable :**

| Nom | Valeur |
|---|---|
| `ENABLE_BQ_CI` | `true` |

### 8. Vérifier

1. Va sur https://github.com/AbstractsMachine/qipu/actions/workflows/data-platform-audit.yml
2. Sur la prochaine PR (ou push sur `main`), le job `dbt-test` doit maintenant apparaître et passer.
3. Va sur https://github.com/AbstractsMachine/qipu/actions/workflows/enrich-pipeline.yml → Run workflow → `phases=auto`. Tu dois voir `→ phases résolues : sync,dbt,export,enrich` dans les logs.

## Coûts

- **Workload Identity Federation** : gratuit (composant IAM standard).
- **BigQuery en CI** : facturé au volume. dbt test scanne en moyenne ~10-50 GB par run selon les tests. Au tarif on-demand (5 €/TB scanné), un run = ~5-25 centimes. À 2 refresh/mois → quelques dizaines de centimes/mois.
- **Tip** : pour éviter les coûts BQ on-demand, le projet utilise déjà les **slots reserved** (cf. `pipeline/profiles.yml`). Vérifier la config actuelle avant.

## Rollback

Pour désactiver BQ en CI sans tout détruire :

```bash
# Remove the repo variable (or set to anything other than 'true')
gh variable delete ENABLE_BQ_CI -R "$GH_REPO"
```

Les jobs `dbt-test` / `verify-exports` redeviennent skip. Le pool/provider/SA peuvent rester en place pour un futur ré-enable.

Pour démolir complètement :

```bash
gcloud iam workload-identity-pools providers delete "$PROVIDER_ID" \
  --workload-identity-pool="$POOL_ID" --location="global" --project="$PROJECT_ID"
gcloud iam workload-identity-pools delete "$POOL_ID" \
  --location="global" --project="$PROJECT_ID"
gcloud iam service-accounts delete "$SA_EMAIL" --project="$PROJECT_ID"
```
