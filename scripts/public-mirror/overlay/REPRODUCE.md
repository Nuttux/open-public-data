# Reproducing the figures

The pipeline is a [dbt](https://docs.getdbt.com/) project that materializes into
Google BigQuery, fed by Python ingestion scripts. Reproducing the published
figures means: ingest the same public sources, build the same models, run the
same tests, and (optionally) render the same JSON exports.

## Prerequisites

- Python 3.11+ and the packages in `requirements.txt`.
- The dbt BigQuery adapter (`dbt-bigquery`).
- A Google Cloud project you can write BigQuery datasets to, and `gcloud` auth
  (`gcloud auth application-default login`). The dbt profile uses OAuth — no
  service-account key is committed.

> **Cost note.** Building the models writes datasets into *your own* GCP project
> and BigQuery bills those queries to *you*. The reference `prod` datasets
> (`dbt_paris_*` under project `open-data-france-484717`) are readable publicly,
> so you can also compare against them without rebuilding.

## 1. Configure

```bash
export BQ_PROJECT="your-gcp-project"     # where models get built
export DBT_USER="$(whoami)"              # isolates your dev datasets
cp pipeline/.env.example pipeline/.env   # then fill in as documented
```

## 2. Ingest the sources

The `pipeline/scripts/sync/` scripts fetch each dataset from its official
open-data portal into the raw layer. Run the ingestion (see `pipeline/README.md`
for the per-source entrypoints).

## 3. Build the transformations

```bash
cd pipeline
dbt deps
dbt build --target dev        # staging -> core -> marts, runs models + tests
```

`dbt build` runs the tests inline. To run only the test suite:

```bash
dbt test --target dev
```

## 4. Compare against the reference

The published figures are the marts. Compare the tables you just built against
the public reference datasets `dbt_paris_*` (project `open-data-france-484717`),
which are exactly what the site reads — e.g. a `EXCEPT DISTINCT` query between
your `<your-project>.dbt_paris_dev_<user>_marts.<table>` and
`open-data-france-484717.dbt_paris_marts.<table>` should return no rows for the
deterministic marts.

> The step that renders these marts into the site's JSON files is a separate
> thin formatting layer, not required to verify any figure.

## What reproduces exactly, and what doesn't

- **Deterministic financial aggregates** (budget, subventions, marchés, debt,
  housing figures) reproduce exactly from source.
- **Enrichment-derived classifications** (which theme / which location a line is
  assigned to) depend on the frozen enrichment seeds shipped here; they
  reproduce exactly against those seeds, but the seeds themselves are the output
  of a separate closed enrichment step — see [NOTICE](NOTICE).
