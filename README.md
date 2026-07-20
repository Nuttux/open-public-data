# France Open Data

> Public finance transparency, built on open data — [franceopendata.org](https://franceopendata.org)

[![CI](https://github.com/Nuttux/open-public-data/actions/workflows/ci.yml/badge.svg)](https://github.com/Nuttux/open-public-data/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![dbt](https://img.shields.io/badge/dbt-BigQuery-orange)](https://www.getdbt.com/)
[![License](https://img.shields.io/badge/Code-AGPL--3.0-blue.svg)](LICENSE)
[![Open Data](https://img.shields.io/badge/Data-Etalab%202.0-green)](https://opendata.paris.fr/)

## The project

An interactive explorer for public money — where it comes from, where it goes, and who receives it — built entirely on open data. Started as a Paris-only budget dashboard; now covers several French cities, national (France) macro finances, and an early English-language preview of a US city (San Francisco).

### What's on the site

| Scope | Pages |
|---|---|
| **Paris** (`/fr/city/paris`) | Budget, Investments, Subsidies (recipients), Public procurement, Social housing, Debt & assets, Places (`/lieux` — per-venue fiches linking deliberations, official bulletin archives, and spend) |
| **Marseille** (`/fr/city/marseille`) | Same page family, work in progress |
| **French communes** (`/fr/city/[slug]`) | ~35,000 communes via OFGL data — 10 flagship cities get a rich page, the rest a slim comparison view |
| **National** (`/fr/national`) | Federal-level budget, state (État) accounts, receipts breakdown, fiscal drilldown, personalized "daily bread" tax calculator |
| **United States (preview)** (`/us`) | Federal budget/debt; San Francisco budget, contracts, payroll, and payee search — English-only, brand/naming not finalized |
| **Cross-cutting** | AI chat assistant (data Q&A), editorial articles, city comparator, corrections log, public error-report form |

Every entity (an association, a contract, a supplier, a place…) gets both a full page and a slide-over drawer, so exploring stays fluid without losing your place in a list.

## Structure

```
open-public-data/
├── pipeline/                       # dbt pipeline (BigQuery)
│   ├── models/
│   │   ├── staging/                # Cleaning, typing
│   │   ├── intermediate/           # Enrichment (LLM, geocoding)
│   │   ├── core/                   # ~15 denormalized one-big-tables (budget, subsidies,
│   │   │                           #   procurement, debt guarantees, deliberations, Sirene…)
│   │   ├── marts/                  # Business-facing aggregation views
│   │   ├── national/               # France macro (État, APU sub-sectors, Eurostat)
│   │   └── us/                     # US federal + San Francisco (dbt_us_* family)
│   ├── seeds/                      # Mappings + enrichment caches (CSV)
│   ├── scripts/                    # Sync, export, enrichment, PDF/archive extraction
│   └── tests/                      # dbt tests across 9 categories (referential integrity,
│                                    #   accounting balance, freshness, completeness, anomalies…)
│
├── website/                        # Next.js 16 (App Router)
│   ├── src/
│   │   ├── app/                    # Routes: fr/city/{ville}, fr/national, us/*, root drawer slot
│   │   ├── components/fusion/      # ~110 shared React components (charts, fiche primitives)
│   │   ├── lib/
│   │   │   ├── entities/           # One config per entity type (association, contrat, projet…)
│   │   │   ├── entity-page.tsx     # Shared page + drawer factory built from those configs
│   │   │   ├── data/read.ts        # Single memoized filesystem entry point for public/data
│   │   │   └── og.tsx              # Shared social-preview (OpenGraph) image factory
│   │   └── i18n/                   # fr.ts / en.ts dictionaries, lazy-loaded per locale
│   └── public/data/                # Pre-computed JSON (budget, map, subsidies, per-entity fiches)
│
├── scripts/
│   └── sync-to-public.sh           # Mirrors pipeline + components to the public sibling repo
│
└── docs/                           # Architecture, data quality, ADRs, runbooks, replicability
```

## Pipeline

Layered architecture: `Open data APIs → BigQuery (raw) → staging → intermediate → core → marts → JSON`.

### Core entities

| Core table | What it covers |
|---|---|
| `core_budget` / `core_budget_vote` | Executed budget (Compte Administratif) / voted budget (Budget Primitif) |
| `core_bilan_comptable` | Balance sheet, debt, savings ratios |
| `core_dette_garantie` | Guaranteed debt (off-balance-sheet commitments) |
| `core_subventions` | Subsidies, enriched with LLM-assigned themes |
| `core_marches_publics` | Public procurement contracts |
| `core_ap_projets` / `core_pdf_investissements_localises` | Geolocated capital projects |
| `core_logements_sociaux`, `core_logement_sru_arr`, `core_logement_attente_arr` | Social housing stock, SRU quota gap, waiting lists |
| `core_deliberations` | City council deliberations (linked to places, contracts, subsidies) |
| `core_sirene_companies` | Company registry cross-reference |
| `core_marseille_budget` | Marseille's budget (nature-based, unlike Paris' function-based reporting) |
| `core_enrichment_caches` | Cached LLM enrichment (thematic tagging, plain-language summaries, translations) |

### Data quality

dbt tests across 9 categories (referential integrity, accounting balances, freshness, completeness, cross-layer consistency, anomaly detection, seed quality…), plus a **replayable audit** (reconciliation + completeness + freshness checks) consumed by [`/methode#audit`](https://franceopendata.org/methode#audit) — see [`pipeline/scripts/audit/run_data_quality_audit.py`](pipeline/scripts/audit/run_data_quality_audit.py).

## New-machine / new-contributor setup

All the heavy state (BigQuery data, IAM/auth, CI secrets, cron) lives in the cloud (GCP + GitHub). A local clone is a disposable workstation.

```bash
# 1. Tools
brew install gcloud gh git python@3.11 node

# 2. Auth (web sign-in, once per machine)
gcloud auth login
gcloud auth application-default login   # ADC for Python scripts
gh auth login

# 3. Clone + venv
git clone https://github.com/Nuttux/open-public-data.git
cd open-public-data
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
cd website && npm install
```

Nothing to reconfigure on the CI side — the scheduled pipeline keeps running independently of your machine.

## CI / Automation

| Workflow | Cadence | What it does |
|---|---|---|
| `ci.yml` | Every PR + push to `main` | website: lint, typecheck, vitest, build · pipeline: Python syntax check |
| `data-platform-audit.yml` | Every PR + push to `main` | Layering audit, dbt parse, schema completeness, dbt test (data + freshness), export verification, data-quality audit |
| `enrich-pipeline.yml` | Weekly + manual | Full pipeline: sync open data → dbt → export JSON → LLM enrichment, auto-commit on diff |
| `bq-snapshots.yml` / `snapshots.yml` | Scheduled | Historical BigQuery table snapshots for sources without a stable key |
| `sync-public-pipeline.yml` | Manual | Mirrors pipeline + shared components to the public sibling repo |

**GCP auth in CI**: Workload Identity Federation (WIF), no static keys. See [`docs/runbooks/enable-bq-ci.md`](docs/runbooks/enable-bq-ci.md).

Enabled via repo variables/secrets (never committed): `vars.ENABLE_BQ_CI`, `secrets.GCP_WORKLOAD_IDENTITY_PROVIDER`, `secrets.GCP_SERVICE_ACCOUNT`.

Trigger a sync manually without waiting for the schedule:

```bash
gh workflow run enrich-pipeline.yml -R Nuttux/open-public-data -f phases=auto -f commit=true
```

## Quickstart (local dev)

### Prerequisites
- Python 3.10+
- Node.js 20+
- GCP access (BigQuery)

### Environment setup

Before running the pipeline or the website, copy the `.env.example` files:

```bash
cp website/.env.example website/.env.local
cp pipeline/.env.example pipeline/.env
```

Then fill in real values (`.env*` files are already gitignored — they never leave your machine; see the comments in each `.env.example` for what each variable does).

Without API keys, LLM/photo enrichment steps are skipped (the pipeline's core still works). Without `ANTHROPIC_API_KEY` on the website side, the chat assistant returns a 500.

### Pipeline

```bash
source .venv/bin/activate
cd pipeline
dbt deps && dbt seed && dbt run
python scripts/export/export_all.py
```

### Website

```bash
cd website
npm install
npm run dev
# → http://localhost:3000
```

### Before pushing

```bash
cd website && npm run lint && npm run typecheck && npm test && npm run build
python3 -m compileall -q pipeline/scripts/
```

100+ unit tests (Vitest) cover pure data-shaping functions and per-entity config validation against real corpus data; Playwright covers smoke + a11y flows. See [`docs/testing.md`](docs/testing.md).

### Sync to the public repo

The pipeline and shared visualization components are open-sourced in [Nuttux/france-open-data](https://github.com/Nuttux/france-open-data).

```bash
./scripts/sync-to-public.sh
```

## Documentation

| Document | Contents |
|---|---|
| [`docs/architecture-modelling.md`](docs/architecture-modelling.md) | dbt pipeline, business rules, data quality |
| [`docs/architecture-frontend.md`](docs/architecture-frontend.md) | React components, design system |
| [`docs/data-quality.md`](docs/data-quality.md) | Known limitations, improvement ideas |
| [`docs/replicability.md`](docs/replicability.md) / [`docs/city-replication-playbook.md`](docs/city-replication-playbook.md) | Adding a new city |
| [`docs/decisions/`](docs/decisions/) | Architecture decision records (ADRs) |
| [`pipeline/README.md`](pipeline/README.md) | dbt commands, enrichment |
| [`docs/runbooks/`](docs/runbooks/) | Ops runbooks: rollback, promoting WIP content |

## Deployment

- **Hosting**: Vercel
- **Domain**: [franceopendata.org](https://franceopendata.org)
- **Auto-deploy**: push to `main` → Vercel build
- **Rollback**: see [`docs/runbooks/rollback.md`](docs/runbooks/rollback.md) — a one-minute procedure via the Vercel dashboard, no code changes needed

## License

Three licenses, one project — each production is covered by the license that fits its nature:

- **Code**: [AGPL-3.0](LICENSE) — if you run a modified version on a publicly accessible server, you must publish your changes under AGPL-3.0 too
- **Derived datasets**: [Etalab Open License 2.0](https://www.data.gouv.fr/pages/legal/licences/etalab-2.0) — same terms as the source open data
- **Editorial content** (articles, methodology writeups): CC BY 4.0

See [`/licence`](https://franceopendata.org/licence) for the full terms.
