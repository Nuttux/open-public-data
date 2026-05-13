# 03 — Data Quality & Monitoring

> Companion docs: [01-pipeline-diagram.md](./01-pipeline-diagram.md) · [02-catalog-and-model.md](./02-catalog-and-model.md)
> Related: [../data-quality.md](../data-quality.md) — ongoing issue tracker (living incidents); this doc is **the specs**, not the tracker

This doc covers four things:

1. **Caveats register** — centralized list of known limits (per domain) that the UI should display and the tests should assert against
2. **Freshness monitoring** — what's up-to-date, what's stale, how we detect drift
3. **Test catalog** — every dbt test we ship, grouped by category, with pass/fail spec + severity
4. **LLM enrichment audit trail** — models, prompts, confidence scoring, and how we test for hallucinations

---

## 1. Caveats register — the canonical list

**Why centralize:** these caveats are currently scattered across `extract_pdf_investments.py`, `methode/page.tsx`, `build_patrimoine_structure.py`, and [../data-quality.md](../data-quality.md). They need to live in one place so (a) the UI can render them transparently, (b) dbt tests can assert the known-acceptable failure modes without triggering alerts, and (c) a reader can audit the data platform in one read.

**Format:** each caveat has an ID (stable), a scope, the impact, and where it's surfaced.

### 1.1 Budget

| ID | Scope | Caveat | Surfaced in |
|---|---|---|---|
| BUD-01 | `core_budget` 2026 | Only vote available (CA en ~juin 2027) | `budget_sankey_2026.json.dataStatus = "vote_only"` ; banner on `/budget` |
| BUD-02 | `core_budget_vote` 2025–2026 | PDF-extracted (pdfplumber + fitz), not API | data_availability.json warning |
| BUD-03 | Voté vs executé | Le voté ne reflète pas les décisions modificatives en cours d'année | `/methode` section "Budget" |
| BUD-04 | Périmètre | Budgets annexes (Eau, Assainissement, ParisHabitat) exclus | `/methode` |
| BUD-05 | Thematique mapping | `seed_mapping_thematiques.csv` couvre M57 officiel ; zones blanches taguées `Non classifié` | test `quality_score_budget_thematique.sql` |

### 1.2 Subventions

| ID | Scope | Caveat | Surfaced in |
|---|---|---|---|
| SUB-01 | 2020, 2021 | Anonymisées par OpenData Paris (RGPD) — exclues | `/methode` + `subventions/index.json` gap |
| SUB-02 | 2025 | Partielle via deliberations (CA pas encore publié) | banner `/qui-recoit` |
| SUB-03 | Geo | **Pas de géoloc** — siège ≠ périmètre d'action | explicit note on `/qui-recoit` filters |
| SUB-04 | In-kind | Subventions en nature (locaux, matériel) signalées mais non valorisées | `/methode` |
| SUB-05 | Satellites | SEM, CASVP, Eau de Paris, ParisHabitat ont des finances distinctes — exclus | `/methode` |
| SUB-06 | Thematique LLM | Top 500 bénéficiaires (Pareto) classifiés LLM ; reste = pattern/default | field `source_thematique` in JSON |
| SUB-07 | Confiance | `ode_confiance < 0.7` → affiché avec warning, not as a fact | UI convention in `QuiRecoitExplorer` |

### 1.3 Marchés publics

| ID | Scope | Caveat | Surfaced in |
|---|---|---|---|
| MAR-01 | Sources | Paris OpenData ⋈ DECP recouvrement ~55% → on garde le superset | `/methode` |
| MAR-02 | Montant | `montant_max` = plafond autorisé, **pas le réel dépensé** ; bons de commande non publics | tooltip sur le montant UI |
| MAR-03 | Dual amount | Si `|montant_notifie − montant_max| / montant_max > 5%` → les deux affichés (seuil éditorial) | `afficher_deux_montants` flag |
| MAR-04 | Avenants | Mal reportés → sous-estimation possible | `/methode` |
| MAR-05 | Seuils publication | Marchés < 40 k€ HT non obligatoirement publiés | `/methode` |
| MAR-06 | Lieu exécution | DECP niveau département (75) seulement, pas arrondissement | — |
| MAR-07 | Satellites | ParisHabitat, SEM, CASVP, Eau de Paris exclus | `/methode` |

### 1.4 Investissements (AP)

| ID | Scope | Caveat | Surfaced in |
|---|---|---|---|
| INV-01 | API | Dataset AP OpenData **gelé depuis nov. 2019** — ne contient que 2018–2022 | banner `/investissements` ; test `freshness_budget_year_coverage` adjacent |
| INV-02 | 2023–2024 | Reposent sur PDF IL (~450 projets/an vs ~2 500 en 2018) | `/methode` |
| INV-03 | Géoloc | 20–30% projets non géolocalisés (études pluri-sites, dotations centrales) | `completeness_geocoding_ap` test (threshold 70%) |
| INV-04 | Sémantique | Chiffres = autorisations de programme (AP), pas livraisons (CP) — s'étalent sur plusieurs années | `/methode` |
| INV-05 | PDF accuracy | Taux d'erreur résiduel ; pages non-conformes flaggées par LLM, revue manuelle | field `confiance_llm` par ligne |

### 1.5 Logement social

| ID | Scope | Caveat | Surfaced in |
|---|---|---|---|
| LOG-01 | Attente DRIHL | Snapshot 2024 only | `/logement-social` |
| LOG-02 | Financements | 2001–2024 mais définitions changent → comparabilité historique limitée | `/methode` |

### 1.6 Bilan / dette

| ID | Scope | Caveat | Surfaced in |
|---|---|---|---|
| BIL-01 | Structure dette | `taux_part_fixe`, `taux_fixe_moyen_pondere_pct`, `maturite_moyenne_ans` sont **CONSTANTS 2019–2024** (estimation 2024 ROB + CRC) | explicit "INDICATIF" in JSON + tooltip UI |
| BIL-02 | Émissions obligataires | Compilation Euronext / AFT / CRC — **non exhaustif** | `/methode` |
| BIL-03 | Hors bilan | PPP, engagements, quasi-fiscal — seed éditorial, non audité | explicit attribution |

### 1.7 Enrichissement LLM

| ID | Scope | Caveat | Surfaced in |
|---|---|---|---|
| LLM-01 | Beneficiaire grounded | Wikipedia FR biaisée (meilleure couverture culturelle que social) | — |
| LLM-02 | Web search | Timeouts / cache stale possible | field `generated_at` per item |
| LLM-03 | Thematique | Piège `SYNDICAT` → Admin, not Sport ; `Club Sportif` → Sport ; regression tests `enrich_no_*_false_positives.sql` | tests category 10 |

**Proposed next step:** centralize this register as `pipeline/seeds/seed_caveats.csv` with columns `(id, domaine, scope, caveat_text, surfaced_in, test_ref, ui_banner_key)`, then export to `website/public/data/caveats.json` so the UI can render caveats dynamically (not hardcoded). This closes the loop between code and the transparency promise.

---

## 2. Freshness monitoring

### 2.1 Cadence contract per source

This is the **expected** cadence. Deviation from these is the signal for monitoring.

| Source | Expected cadence | Tolerance (staleness alert) | Observable via |
|---|---|---|---|
| OpenData Paris Budget CA | Annuelle, ~juin N+1 | Alert si `max(annee) < current_year - 1` après juillet | `data_availability.json.datasets.budget.years` |
| OpenData Paris Budget BP (PDF BG) | Annuelle, ~février N | Alert si `max(annee) < current_year` après mars | idem |
| AP OpenData | **Gelé** (pas de cadence) | n/a — caveat INV-01 | — |
| AP PDF IL | Annuelle, ~juin N+1 (CA) + février (BP) | Alert si PDF CA N-1 absent au 1er août | `seed_pdf_investissements_*.csv` timestamps |
| Subventions votées + annexe CA | Annuelle, ~juin N+1 | Alert si max < current_year - 1 après juillet | idem |
| Subventions delibs | Rolling, 1–2 jours lag | Alert si dernière session > 14 jours | `subventions_delibs/` latest `session_*.json` mtime |
| Marchés Paris | Mensuelle (rolling) | Alert si dernière `date_notification` > 60 jours | `marches-publics/marches_{current_year}.json` |
| DECP | Annuelle, ~janvier–février N+1 | Alert si 2024 absent au 1er mars 2025 | `raw.decp_marches_paris` |
| Logements | Annuelle | Alert si max < current_year - 1 après décembre | idem |
| DRIHL attente | Annuelle (snapshot mai) | Alert si max < current_year après juillet | `seed_drihl_paris_*.csv` |
| Bilan comptable | Annuelle, ~juin N+1 | Alert si max < current_year - 1 après août | `data_availability.json.datasets.bilan` |
| SIRENE / recherche-entreprises | Rolling | Cache refresh > 90 jours par SIRET | `enrichment/sirene_companies.json` item `generated_at` |
| Enrichissement LLM (thematique, grounded, vulgarize) | On-demand | Cache > 180 jours → refresh candidate | item-level `generated_at` |

### 2.2 How to check freshness today

- `data_availability.json` lists per dataset the years covered + status. This is the **single snapshot** a monitor should read.
- Every JSON carries `generated_at` (ISO 8601 UTC) — compared to current time gives pipeline freshness.
- dbt freshness tests (§3.2 below) assert the expected year set per dataset.

### 2.3 Proposed freshness monitor

Not implemented yet. Proposal:

```python
# pipeline/scripts/audit/check_freshness.py
# Reads data_availability.json + expected cadence table (from seed_cadences.csv)
# Emits monitor report: green / yellow / red per dataset
# Exit non-zero if any RED → CI-gate
```

Drop-in seed `pipeline/seeds/seed_cadences.csv` with columns `(dataset, expected_cadence, tolerance_days, source_url)`. Drives both the monitor AND the UI banner on `/methode`.

---

## 3. Test catalog

Source: [pipeline/tests/](../../pipeline/tests/) — 8 category folders, ~35 singular tests total (counted from filesystem, **not** the earlier "54 tests" claim in the narrative docs, which appears to include generic schema tests declared in YAML).

All tests are dbt **singular tests** (`.sql` returning 0 rows on pass). Invoked via `dbt test`, tagged by category.

### 3.1 Category 4 — Accounting balance

Folder: [pipeline/tests/cat4_accounting_balance/](../../pipeline/tests/cat4_accounting_balance/)

| Test | Spec | Severity | Rationale |
|---|---|---|---|
| `balance_bilan_actif_passif.sql` | `SUM(actif) == SUM(passif)` per year | **error** | Accounting identity must hold ; break = upstream data bug |
| `balance_budget_recettes_depenses.sql` | `abs(recettes − depenses) / depenses` within tolerance | warn | Déficit budgétaire attendu dans certaines années ; flag only if unusual |
| `balance_budget_nature_vs_core.sql` | `SUM(mart_budget_nature) == SUM(core_budget)` per year & sens_flux | error | Mart aggregation can't invent or lose data |
| `balance_sankey_completeness.sql` | `SUM(mart_sankey.links) == total_depenses + total_recettes` | error | Sankey links must sum to reported totals |
| `balance_bilan_mart_vs_core.sql` | `SUM(mart_bilan_sankey) ≤ SUM(core_bilan_comptable)` per year | error | Mart ≤ core (no inflation) |
| `balance_epargne_brute_positive.sql` | `recettes − depenses_fonctionnement ≥ 0` | warn | Can violate during reforms ; flag only |

### 3.2 Category 5 — Row count & freshness

Folder: [pipeline/tests/cat5_row_count_freshness/](../../pipeline/tests/cat5_row_count_freshness/)

| Test | Spec | Severity |
|---|---|---|
| `freshness_budget_year_coverage.sql` | `{2019, 2020, 2021, 2022, 2023, 2024} ⊆ years(core_budget)` | error |
| `freshness_budget_vote_year_coverage.sql` | `{2019..2026} ⊆ years(core_budget_vote)` | error |
| `freshness_subventions_year_coverage.sql` | `{2018, 2019, 2022, 2023, 2024} ⊆ years(core_subventions)` (skip 2020–21 per SUB-01) | error |
| `freshness_bilan_year_coverage.sql` | `{2019..2024} ⊆ years(core_bilan_comptable)` | error |
| `row_count_core_budget.sql` | Row count within ±20% of baseline | warn |
| `row_count_stg_budget_principal.sql` | `count(stg_budget_principal) > 0` | error |
| `row_count_pdf_seeds_completeness.sql` | `count(seed_pdf_budget_vote_*) > 0` per year | error |

### 3.3 Category 6 — Completeness

Folder: [pipeline/tests/cat6_data_completeness/](../../pipeline/tests/cat6_data_completeness/)

| Test | Spec | Severity |
|---|---|---|
| `completeness_thematique_subventions.sql` | `% (ode_thematique != 'Non classifié') ≥ 80%` | warn |
| `completeness_geocoding_ap.sql` | `% (ode_arrondissement IS NOT NULL) ≥ 70%` per year | warn |
| `completeness_siret_associations.sql` | `% (siret IS NOT NULL) ≥ 50%` on associations | warn |
| `completeness_logements_geolocated.sql` | `% (geo_point_2d IS NOT NULL) == 100%` | error |
| `quality_score_budget_thematique.sql` | Flag `(chapitre, fonction)` pairs not in `seed_mapping_thematiques` | warn |

### 3.4 Category 8 — Anomaly detection

Folder: [pipeline/tests/cat8_anomaly_detection/](../../pipeline/tests/cat8_anomaly_detection/)

| Test | Spec | Severity |
|---|---|---|
| `anomaly_no_negative_amounts.sql` | `montant ≥ 0` on core_budget, core_subventions, core_marches_publics | warn |
| `anomaly_max_subvention.sql` | Flag per-beneficiary rows where `montant > percentile(0.99)` (detect CASVP bulk transfers masked as single subvention) | warn |
| `anomaly_budget_yoy_jump.sql` | `|budget_year_N − budget_year_N-1| / budget_year_N-1 < tolerance` | warn |
| `anomaly_execution_rate.sql` | `execution_rate (exec/vote) BETWEEN 0.5 AND 1.2` | warn |
| `anomaly_bilan_yoy_variation.sql` | Same YoY check on bilan masses | warn |

### 3.5 Category 10 — Enrichment quality (LLM regression tests)

Folder: [pipeline/tests/cat10_enrichment_quality/](../../pipeline/tests/cat10_enrichment_quality/)

These are the **hallucination guards** for LLM thematic classification.

| Test | Spec | Why it exists |
|---|---|---|
| `enrich_no_syndicat_false_positives.sql` | `beneficiaire LIKE '%SYNDICA%' AND ode_thematique = 'Sport'` → 0 rows | Past regression : "Syndicat" classified as Sport |
| `enrich_no_sport_false_positives.sql` | `beneficiaire LIKE '%CLUB%SPORT%' AND ode_thematique != 'Sport'` → 0 rows | Double-check deterministic side |
| `enrich_real_syndicats_not_logement.sql` | Known unions (CGT, CFDT, FO, ...) NOT classified Logement | Past regression |
| `enrich_no_empty_pattern_thematique.sql` | `source_thematique = 'pattern' AND ode_thematique IS NULL` → 0 rows | Rule integrity |
| `enrich_known_misclassifications.sql` | Whitelist: `"Maison Européenne Photographie"` → Culture (not International), etc. | Regression list grows as incidents happen |
| `enrich_thematique_valid_values.sql` | `ode_thematique IN (allowed set of 15)` | LLM must not invent categories |

### 3.6 Categories 3, 7, 9

- **cat3_referential_integrity/** — FK-style checks across core/marts
- **cat7_cross_layer/** — staging↔core↔mart consistency
- **cat9_seed_quality/** — seed uniqueness and coverage checks (e.g., `seed_mapping_thematiques` pairs unique)

(Full enumeration: `ls pipeline/tests/cat*/`.)

### 3.7 Invocation

```bash
cd pipeline
dbt test                                       # all
dbt test --select tag:row_count_freshness      # just freshness
dbt test --select tag:accounting_balance       # accounting only
dbt test --select tag:enrichment_quality       # LLM regression tests
```

Results feed into [data-quality.md §9](../data-quality.md) (latest test run dated 2026-02-18 there).

---

## 4. Test gaps — what's missing

What the category structure covers well:
- ✓ Freshness (expected year coverage)
- ✓ Accounting balances (bilan, budget, sankey)
- ✓ Mart ↔ core consistency
- ✓ LLM thematique regression

What's **missing** and should be added:

### 4.1 UI↔JSON reconciliation tests (highest value)

No test currently asserts that the number **shown in the UI** matches the JSON. If a client-side computation drifts (e.g., per-capita formula), silent drift is possible.

**Proposal:** Playwright snapshot tests that:
- Load each key page
- Extract numeric text (e.g., `data-testid="total-depenses"`)
- Assert it matches a value derivable from the JSON (e.g., `budget_sankey_{year}.totals.depenses`)

One spec per UI metric listed in [02-catalog-and-model.md §3](./02-catalog-and-model.md).

### 4.2 JSON ↔ mart reconciliation

Currently `balance_bilan_mart_vs_core` compares mart ↔ core but **not** JSON ↔ mart. A bug in an `export_*.py` script (e.g., a filter applied too aggressively) would not be caught.

**Proposal:** `pipeline/tests/cat11_export_integrity/` with:
- `export_sum_matches_mart.py` (Python, not dbt) — reads JSON, compares aggregate to BigQuery mart query result
- Run as post-export hook

### 4.3 Caveats surfaced check

No test asserts that caveats INV-01, SUB-01, BIL-01, etc. are actually rendered in the UI banners/tooltips they're supposed to.

**Proposal:** Playwright test per caveat ID checking the banner/tooltip text exists on the relevant page. Drives the seed_caveats.csv → caveats.json proposal in §1 above.

### 4.4 PDF extraction accuracy

`extract_pdf_investments.py` already does page-total reconciliation LLM-side. But no **dbt** test compares the sum of extracted rows to a known control total (e.g., Annexe IL total per year from the document's own summary page).

**Proposal:** `cat11_pdf_integrity/pdf_extraction_total_match.sql` that compares `SUM(seed_pdf_investissements_N) / total_officiel_annexe_N` within tolerance.

### 4.5 Enrichment cache staleness

No test flags enrichment items older than a threshold (e.g., 180 days). LLM outputs can be stale and UI shows them with no indication.

**Proposal:** `cat10_enrichment_quality/enrichment_staleness.sql` that flags items where `generated_at < now() - interval '180 days'`. Severity: warn.

### 4.6 Source URL presence

`check_no_hardcoded_factuals.py` scans UI code; there's no equivalent for dbt models. A `core_*` model referencing a constant without a matching `methodology.json` entry could slip through.

**Proposal:** audit script that greps all SQL for hardcoded numeric constants and matches them against `methodology.json` keys.

---

## 5. LLM enrichment audit trail

**Why this needs a dedicated trail:** LLM outputs are derived data. Without versioned prompts, model names, and confidence scoring, a change that silently shifts classification distributions is undetectable.

### 5.1 LLM scripts inventory

Each script below is a distinct LLM job with its own model, prompt, and cache. Source of truth: [pipeline/scripts/enrich/](../../pipeline/scripts/enrich/).

| Script | Model (default) | Alt model | Input | Output cache | Confidence field |
|---|---|---|---|---|---|
| [enrich_thematique_llm.py](../../pipeline/scripts/enrich/enrich_thematique_llm.py) | Gemini 3 Flash | Claude Haiku 4.5 | `beneficiaires_*.json` top 500 Pareto | `seed_cache_thematique_beneficiaires.csv` | `ode_confiance` |
| [enrich_beneficiaire_grounded_llm.py](../../pipeline/scripts/enrich/enrich_beneficiaire_grounded_llm.py) | Claude Haiku 4.5 + web_search | — | `core_subventions` beneficiary names | `enrichment/beneficiaire_grounded.json` | `confiance` + `source_type ∈ {sirene_cache, recherche_api, llm_grounded, wikipedia, insee_naf, fallback}` |
| [enrich_geo_ap_llm.py](../../pipeline/scripts/enrich/enrich_geo_ap_llm.py) | Gemini 3 Flash | — | `core_ap_projets` titles + desc | `seed_cache_geo_ap.csv` + `map/geo_cache.json` | `ode_confiance` |
| [vulgarize_marches_llm.py](../../pipeline/scripts/enrich/vulgarize_marches_llm.py) | Claude Opus | Gemini | Contract objet + nature | `enrichment/vulgarization_marches.json` | implicit (no numeric field) |
| [vulgarize_subventions_llm.py](../../pipeline/scripts/enrich/vulgarize_subventions_llm.py) | Claude Opus | Gemini | Subvention text | `enrichment/vulgarization_subventions.json` | idem |
| [vulgarize_projets_llm.py](../../pipeline/scripts/enrich/vulgarize_projets_llm.py) | Claude Opus | Gemini | AP project text | `enrichment/vulgarization_projets.json` | idem |
| [enrich_deliberations_llm.py](../../pipeline/scripts/enrich/enrich_deliberations_llm.py) | Gemini 3 Flash | — | Delib PDF raw text | `enrichment/deliberations_results/session_*.json` | item-level |
| [enrich_deliberations_websearch.py](../../pipeline/scripts/enrich/enrich_deliberations_websearch.py) | Claude + web_search | — | Delib refs | enrichment cache | — |
| [fetch_photos_grounded_llm.py](../../pipeline/scripts/enrich/fetch_photos_grounded_llm.py) | Claude Opus + web_search | — | Projet/beneficiary names | `enrichment/projet_photos.json` | `confiance` |
| [judge_photos_llm.py](../../pipeline/scripts/enrich/judge_photos_llm.py) | Claude Vision | — | Photo URLs | scoring cache | `confiance` |
| [extract_pdf_investments.py](../../pipeline/scripts/tools/extract_pdf_investments.py) (tools/) | Gemini 3 Flash (vision) | — | Annexe IL PDFs | `seed_pdf_investissements.csv` + `map/investissements_localises_*.json` | `confiance_llm` per row |

### 5.2 Prompt versioning — current state

Prompts are embedded in the scripts (e.g., `enrich_thematique_llm.py` has a 92-line system prompt including a "PIÈGES À ÉVITER" section). They are versioned **implicitly** via `git log` on the script.

**Gap:** there's no `prompt_version` field written into the cache rows. A prompt change that shifts classifications would be invisible in the data.

**Proposal:** add a `prompt_version` column/field to every enrichment cache, set from a constant in the script. Bump on every prompt edit. dbt test `enrich_prompt_version_consistency.sql` asserts all rows share the same version (forces a re-run on edit).

### 5.3 Confidence scoring — what each score means

- **Thematique (`ode_confiance` 0.0–1.0):** LLM self-report. Empirically: ≥ 0.9 reliable; 0.7–0.9 acceptable; < 0.7 should be flagged or hidden.
- **Grounded (`confiance` 0.0–1.0):** weighted by `source_type` — `sirene_cache` = 1.0, `recherche_api` = 0.9, `llm_grounded` = LLM self-report, `wikipedia` = 0.8, `insee_naf` = 0.6, `fallback` = 0.0.
- **Geo (`ode_confiance`):** deterministic sources (regex, lieu connu) = 1.0 ; BAN score passed through ; LLM 0.5–0.95.
- **PDF extraction (`confiance_llm`):** page-level ; pages failing total-reconciliation get flagged.

**UI rule:** any metric displayed with `confiance < 0.7` should carry a visual indicator. Not currently enforced — see [02-catalog-and-model.md §3.4](./02-catalog-and-model.md) for where this lives.

### 5.4 Hallucination regression suite

Already covered by category 10 tests (§3.5 above). Process to add a new regression:

1. User reports misclassification in UI.
2. Add a row to `seed_cache_thematique_beneficiaires.csv` with the correct mapping (overrides LLM).
3. Add a SQL test in `cat10_enrichment_quality/` asserting the specific beneficiary has the correct thematique.
4. Next LLM re-run picks up the cache override; test prevents regression.

### 5.5 LLM cost & latency tracking

Not currently logged. Relevant for:
- Grounded (Claude Haiku 4.5 + web_search) — rate-limit aware, 60s wait on 429
- Vulgarization (Claude Opus) — most expensive job
- PDF extraction (Gemini 3 Flash vision) — per-page, 100+ pages/PDF

**Proposal:** write `{script, model, n_calls, n_tokens_in, n_tokens_out, wall_time_s, cost_usd}` to `pipeline/logs/llm_runs.jsonl` on every run. Separate job aggregates → `llm_audit.json` surfaced on `/methode`.

---

## 6. Hardcoded factuals check

[pipeline/scripts/audit/check_no_hardcoded_factuals.py](../../pipeline/scripts/audit/check_no_hardcoded_factuals.py) enforces the core promise: every numeric metric in the UI must trace back to `methodology.json` with a `source` + `source_url`.

**Scope currently:** UI code. Not SQL models.

**Run:**
```bash
python pipeline/scripts/audit/check_no_hardcoded_factuals.py
# exits non-zero if any UI metric lacks a methodology entry
```

Should be wired as a pre-commit hook + CI gate. See [audit-setup.md](../analytics-setup.md) (if present).

---

## 7. Monitoring operating model (proposal)

Given scope + maintenance cost tradeoff, proposed setup:

1. **On every `dbt run`** — run `dbt test` ; fail the run on errors, pass with warnings (but log them).
2. **After every export** — run the (proposed) `check_freshness.py` + (proposed) `export_integrity` tests ; fail build if RED.
3. **Weekly scheduled** — re-read all seed caches, emit LLM staleness report ; no fail, just a report.
4. **On PR** — `check_no_hardcoded_factuals.py` gate ; blocks merge if missing methodology entries.
5. **On demand (UI change)** — Playwright UI↔JSON reconciliation suite.

Storage of test results: append `{pipeline_run_id, test_id, status, row_count, ts}` to `pipeline/logs/test_runs.jsonl` → surfaced as a time series on an internal page (post-MVP).

---

## 8. Next steps (priorities)

In order, biggest value first:

1. **Centralize caveats register** → `seed_caveats.csv` + `caveats.json` + UI banner renderer. Unlocks transparency at scale.
2. **Add UI↔JSON reconciliation tests** (Playwright). The largest silent-drift risk.
3. **Add `prompt_version` field** to LLM caches + regression test. The cheapest way to catch LLM-output drift.
4. **Implement `check_freshness.py`** with `seed_cadences.csv`. Single script, replaces manual status-checking.
5. **Add `cat11_export_integrity` test category**. Closes the JSON↔mart gap.
6. **LLM cost/latency logging**. Low-priority unless budget is a concern.
