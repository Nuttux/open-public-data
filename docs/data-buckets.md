# Data delivery & credentials

**The code is open; the data is not committed.** The site's JSON lives in two
**private** Google Cloud Storage buckets, reachable only with credentials. This
keeps the repo light (~123 MB + 828 MB of regenerable JSON stay out of git) and
means a fork gets the *code* but cannot stand up a working instance by cloning
and deploying — you have to bring your own data and credentials. Self-hosting is
documented and supported; fork-and-boom is deliberately not a shortcut.

## The two buckets

| Bucket | Content | Size | How the app reads it |
|---|---|---|---|
| `gs://qipu-site-data` | Paris/national/Marseille exports (`public/data/**`) | ~123 MB / 243 files | **Build-hydrate**: `npm run prebuild` (→ `scripts/hydrate-data.mjs`) downloads it into `public/data` before `next build`. Loaders read local files, unchanged. |
| `gs://qipu-communes-budget` | Per-commune budget-by-nature (`communes-budget/<slug>/…`) | ~828 MB / 104k files | **Runtime-fetch**: `src/lib/commune-budget.ts` reads a commune's ~10 KB file server-side per render (SSR/ISR). Too large to ship in the deploy. |

Only a small **manifest** is committed — `website/src/data/communes-budget-manifest.json`
(slug → available years, ~0.9 MB) — so the capability resolver stays local and
instant. It never contains the data itself.

## Credentials

Both buckets use **Application Default Credentials**:

- **Local dev**: `gcloud auth application-default login` (once). Then
  `npm run hydrate:data` and `npm run dev` work.
- **Build/host (e.g. Vercel)**: set `GOOGLE_APPLICATION_CREDENTIALS` to a service
  account key (or the platform's Workload Identity) with `roles/storage.objectViewer`
  on both buckets. The `prebuild` step and the runtime budget loader both use it.

Env overrides (all optional, sensible defaults baked in):

| Var | Default | Used by |
|---|---|---|
| `GCP_PROJECT` / `BQ_PROJECT` | `open-data-france-484717` | GCS client project |
| `SITE_DATA_BUCKET` | `qipu-site-data` | `hydrate-data.mjs` |
| `COMMUNE_DATA_BUCKET` | `qipu-communes-budget` | `commune-budget.ts` |
| `COMMUNE_DATA_PREFIX` | `communes-budget` | `commune-budget.ts` |

Without credentials: `hydrate-data.mjs` exits with a clear error, and commune
budget pages resolve to `notFound()`. That is expected — not a bug.

## Self-hosting your own instance

1. Create your own GCP project + two buckets (private).
2. Run the pipeline to generate the exports:
   `python pipeline/scripts/export/…` (Paris/national) and
   `python pipeline/scripts/export/export_budget_national.py --all` (communes).
3. Upload:
   `gcloud storage rsync -r website/public/data gs://<your-site-bucket>/data`
   and `gcloud storage rsync -r website/public/data/communes-budget gs://<your-communes-bucket>/communes-budget`.
4. Point the env vars above at your buckets, provide credentials, `npm run build`.

You get a fully working instance — you just have to do the real work (own data,
own pipeline run, own credentials), which is the point.

## Private enrichment seed-caches

The generated enrichment caches (LLM geocode/thematique, fuzzy SIRET/marché
matching, curated lieux) are **not committed** — they live in
`gs://qipu-site-data/seeds-private` and are pulled into `pipeline/seeds/` by
`pipeline/scripts/sync/hydrate_private_seeds.sh` **before `dbt seed`**. The
enrich *scripts + prompts* (`pipeline/scripts/enrich/`) stay in the repo, so the
method is open — only the outputs are private. A self-hoster either hydrates
(with credentials) or re-runs the enrich scripts to regenerate their own caches.
