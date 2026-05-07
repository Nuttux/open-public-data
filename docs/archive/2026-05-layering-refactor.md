# Layering refactor tracker

Goal: enforce `raw → stg → core → (int) → mart → export → JSON` end-to-end. Eliminate every shortcut. Auditable, with a CI gate.

Generated: phase 0 baseline.

## Baseline

- Branch: `test`
- JSON output checksums: `pipeline/scripts/audit/.baseline_data_md5.txt` (193 files)
- Violation snapshot: `docs/data-platform/_audit_layering_before.csv`

## Hard-violation summary (n=33)

### Exports reading core or intermediate (n=14)

| Script | Reads | Target mart |
|---|---|---|
| `export_bilan_data.py` | `core_bilan_comptable` | `mart_bilan_index` (new) |
| `export_data_availability.py` | `core_ap_projets`, `core_budget`, `core_logements_sociaux`, `core_subventions` | `mart_data_availability` (new) |
| `export_evolution_data.py` | `core_budget`, `core_budget_vote` (in addition to `mart_evolution_budget`) | refactor to use mart only |
| `export_logement_attente.py` | `core_logement_attente_arr` | `mart_logement_attente` (new) |
| `export_map_data.py` | `core_ap_projets`, `core_logements_sociaux` | `mart_investissements_map`, `mart_logements_map` (new) |
| `export_national.py` | `core_marches_national`, `core_subventions_national` | use existing `mart_*_national` (or add) |
| `export_sankey_data.py` | `int_top_beneficiaires`, `int_top_projets` | promote to `mart_sankey_top_beneficiaires`, `mart_sankey_top_projets` |

### Enrich/build scripts writing JSON direct (n=3)

| Script | Should become |
|---|---|
| `build_patrimoine_structure.py` | `seed_dette_qualitative.csv` + `mart_patrimoine_structure` + `export_patrimoine_structure.py` |
| `build_hors_bilan.py` | `seed_hors_bilan_editorial.csv` + `mart_hors_bilan` + `export_hors_bilan.py` |
| `build_generic_photo_bank.py` | review — likely OK to keep as deterministic enrichment writing to `public/data/enrichment/` (per cat E whitelist) |

### Ingest writing JSON direct (n=15)

**In-scope (Paris pipeline, in prod UI):**
| Script | Should become |
|---|---|
| `fetch_subventions_opendata.py` (also writes `beneficiaires_*.json`) | already lands in `raw.subventions_*` — remove the JSON-direct branch, route via `mart_beneficiaires_raw` (new) |
| `extract_pdf_investments.py` | land into `raw.pdf_investissements_localises_*` → `stg_*` → already covered by `core_ap_projets`/`mart_investissements_map` |
| `scrape_deliberations.py` | land into `raw.deliberations_subventions_scraped` → `stg_subventions_delibs` → `mart_subventions_delibs` |

**WIP / not yet wired in production UI** (treat as "must follow new convention when wiring up"):
- `scrape_marches_delibs.py`
- `sync_decp_communes.py`, `sync_ofgl_communes.py`, `sync_ofgl_all_communes.py`, `sync_ofgl_communes_fonctionnelle.py`
- `sync_etat_lfi.py`, `sync_eurostat_apu_subsectors.py`, `sync_eurostat_cofog.py`, `sync_eurostat_dette.py`, `sync_eurostat_fiscalite.py`
- `extract_pdf_via_pdftotext.py`, `merge_subv_pdf_into_opendata.py`, `parse_subv_pdf_text.py` (one-shot tools, may not need refactor)

**Decision:** in-scope scripts are refactored fully. WIP scripts will be flagged by `check_layering.py` once active and the user wires them into UI; for now they're listed in the audit whitelist as `wip-not-yet-consumed` so the gate stays green.

### Data-source seed referenced from core without stg wrapper (n=1)

| Model | Seed | Action |
|---|---|---|
| `core_logement_attente_arr.sql` | `seed_drihl_paris_2024` | Add `stg_drihl_paris.sql`; reroute the ref. |

## Soft-flag summary (n=9, convention call)

These pass the audit by design once whitelisted:

| Pattern | Count | Convention |
|---|---|---|
| Mapping/parameter seeds (`seed_mapping_*`, `seed_match_*`, `seed_lieux_*`, `seed_pdf_budget_vote_*`) ref'd from core/int | 7 | OK — these are config, not data |
| LLM cache seeds (`seed_cache_*`) ref'd from int | 2 | OK — these are memoization, not source data |

## Phase log

- [x] **Phase 0** — Setup, baseline, before-audit (this doc) — 33 hard / 9 soft flags
- [x] **Phase 1** — `stg_drihl_paris` + [04-layering-convention.md](./04-layering-convention.md). dbt build green, JSON byte-equal modulo `generated_at`. Hard violations: 33 → 32.
- [x] **Phase 2** — 7 new marts created and exports rerouted. Hard violations: 32 → 18.
  - `mart_logement_attente`, `mart_bilan_comptable`, `mart_budget_recettes_par_chapitre`, `mart_data_availability`, `mart_investissements_map`, `mart_logements_map`, `mart_budget_sankey_lines`
  - National (currently disabled): `mart_marches_national_detail`, `mart_subventions_national_detail` prepared for re-enable
  - Dead code removed: `int_top_beneficiaires`/`int_top_projets` references in `export_sankey_data.py` (tables never built; baseline already had `drill_down: {}`)
  - All exports verified byte-equal to baseline modulo (timestamps, list-order, 6-sig-digit float noise) via `pipeline/scripts/audit/diff_json_semantic.py`
- [x] **Phase 3** — Build scripts retired. Hard violations: 18 → 16.
  - `build_patrimoine_structure.py` → `pipeline/scripts/export/export_patrimoine_structure.py`. Reads from `mart_bilan_comptable`, reconstructs the Sankey/drilldown shape in Python (with the `(Actif)`/`(Passif)` suffix logic preserved). Editorial constants stay in-script with explicit `indicative_fields` callout.
  - `build_hors_bilan.py` → full split: `pipeline/scripts/sync/sync_dette_garantie.py` (API → `raw.dette_garantie_paris`), `stg_dette_garantie` + `core_dette_garantie` + `mart_hors_bilan`, and `pipeline/scripts/export/export_hors_bilan.py`. Source declared in `staging/sources.yml`.
  - `build_generic_photo_bank.py` retained — it writes to `public/data/enrichment/` which is the dedicated lazy-load enrichment tree (Category E whitelist, formalized in Phase 6).
  - All 6 patrimoine + 6 hors_bilan + index outputs verified byte-equal modulo cosmetic diffs.
- [x] **Phase 4 (partielle)** — 1 of 3 documented bypasses eliminated.
  - `fetch_subventions_opendata.py` output redirected from `website/public/data/subventions/` to `pipeline/cache/subventions_pre_enrichment/` — its real role is to feed the enrichment pipeline, not to publish. 5 enrichment scripts (`enrich_sirene.py`, `enrich_beneficiaire_grounded_llm.py`, `enrich_thematique_llm.py`, `vulgarize_subventions_llm.py`, `sirene_match_new_beneficiaires.py`) and 1 tool (`merge_subv_pdf_into_opendata.py`) updated to read from the new cache path. The public `subventions/*.json` are now produced solely by `export_subventions_data.py` from the marts.
  - **Deferred to Phase 6 whitelist** with strong rationale: `extract_pdf_investments.py` (Gemini-Vision PDF extraction with per-extraction validation metadata that doesn't fit a row-level schema) and `scrape_deliberations.py` (HTML scrape + PDF parsing producing per-session JSON, fed to enrichment cycle). Each will be entered in `check_layering.py` with explicit justification + a `TODO` future-work pointer.
  - **Deferred to Phase 6 whitelist** with `wip-not-yet-consumed` tag: 12 WIP ingest/tools scripts for the national extension (eurostat, ofgl, etat_lfi, decp_communes, scrape_marches_delibs, plus 4 PDF tools). The audit gate enforces the layering rule for everything currently in production; WIP scripts must comply before being wired into UI.
- [x] **Phase 5** — Enrichment lazy-load formalized as Category E exception. Convention doc §4 expanded with three exception categories (E = enrichment caches, D = documented bypasses, W = WIP). The lazy-load pattern is a UX choice (per-record JSON loaded on click) preserved by design. Each Category E item enumerated; the audit gate (Phase 6) enforces that any new write outside the whitelist fails.
- [x] **Phase 6** — `pipeline/scripts/audit/check_layering.py` + `layering_whitelist.yml` + README. Audit returns exit-0 with 5 explicit warnings (1 Category D, 4 Category W). Convention §2 updated to allow `core_ ← int_` (project's enrichment pattern: `int_*` joins seeds/caches, `core_*` exposes the OBT). All exceptions are enumerated with per-script justification + (for Category D) a future-work `todo:`.
- [x] **Phase 7** — Diagram §0 updated (new sync_dette_garantie ingest, internal cache box for pre-enrichment, only 2 Category-D dotted arrows remain, dbt counts updated to stg×12/core×9/mart×21). Master-overview PDF/SVG/PNG re-rendered via the existing scripts in `docs/data-platform/rendered/`. Final state:
  - `python3 pipeline/scripts/audit/check_layering.py` → exit 0, 0 violations, 5 warnings (1 Category D, 4 Category W) — all explicitly justified.
  - `dbt parse` clean.
  - `docs/data-platform/_audit_layering_after.csv` documents the residual flagged items (whitelisted in the gate).
  - `docs/data-platform/rendered/pipeline-diagram.pdf` (469 KB, 9 pages, bookmarked) reflects the new architecture.

## Final state summary (after Phases 0-14, 100% solid)

| Metric | Phase 0 | Phase 7 (intermediate) | Phase 14 (final) |
|---|---|---|---|
| Hard layering violations | 33 | 0 | **0** |
| Documented exceptions (Cat-D + Cat-E + Cat-W whitelist) | 0 | 5 | **0** |
| `--strict` audit exit code | n/a | 1 (warnings) | **0** |
| Dotted bypass arrows in diagram | 4 | 2 | **0** |
| New dbt models | — | 11 | **20+** |
| Build scripts retired | — | 2 | 2 |
| New sync scripts | — | 1 | **5** (`sync_dette_garantie`, `sync_pdf_investissements_localises`, `sync_deliberations`, `sync_sirene_companies`, `sync_enrichment_caches`) |
| New export scripts | — | 2 | **5** (`export_patrimoine_structure`, `export_hors_bilan`, `export_investissements_localises`, `export_deliberations`, `export_enrichment_caches`) |
| Patcher scripts deleted | — | 0 | 1 (`apply_sirene_to_marches.py`, replaced by SIRENE-aware mart) |

## Phase log (suite)

- [x] **Phase 8** — `extract_pdf_investments` full pipeline. Nouveau sync `sync_pdf_investissements_localises.py` charge les JSON existants en `raw.pdf_investissements_localises_paris`. Models stg + core + mart créés. `export_investissements_localises.py` reproduit le JSON depuis le mart (byte-equal). L'extracteur PDF Gemini Vision n'écrit plus que dans `pipeline/cache/pdf_invest/` (interne) + le seed CSV.
- [x] **Phase 9** — Deliberations chain. `scrape_deliberations.py` + `enrich_deliberations_*.py` + `apply_deliberation_results.py` redirigés vers `pipeline/cache/delibs/sessions/`. Nouveau sync charge en 3 tables `raw.deliberations_{sessions,delibs,articles}_paris`. Stg × 3 + `core_deliberations` (joint sessions+delibs+articles avec dédup) + `mart_deliberations`. `export_deliberations.py` reproduit les `session_*.json` byte-equal.
- [x] **Phase 10** — `apply_sirene_to_marches.py` supprimé. SIRENE devient une dimension cuite : `sync_sirene_companies.py` charge le cache en `raw.sirene_companies_paris`, `stg_sirene_companies` + `core_sirene_companies`, et `mart_marches_fournisseurs` + `mart_projet_marches` font un `LEFT JOIN` avec `COALESCE(NULLIF(TRIM(fournisseur_nom), ''), NULLIF(TRIM(sirene_nom), ''))`. **Cat-D vide**.
- [x] **Phase 11** — Cat-E lazy-load. Pattern polymorphe : tous les scripts d'enrichissement (sirene, beneficiaire_grounded, vulgarize_*, generic_photo_bank, match_projet_photos, translate_to_en, deliberations_*, etc.) écrivent désormais sous `pipeline/cache/enrichment/`. `sync_enrichment_caches.py` charge tous les fichiers en une table polymorphe `raw.enrichment_caches_paris(relative_path STRING, payload STRING, …)`. `mart_enrichment_caches` passe-plat. `export_enrichment_caches.py` matérialise chaque payload sous `public/data/enrichment/<relative_path>`. **Cat-E vide**.
- [x] **Phase 12** — Cat-W. 14 scripts WIP (eurostat, ofgl, decp_communes, etat_lfi, scrape_marches_delibs, extract_pdf_via_pdftotext, assign_thematique_post_pdf, …) redirigés vers `pipeline/cache/wip/`. **Cat-W vide**. Quand un de ces scripts sera câblé à l'UI, son chemin sync→raw→stg→core→mart→export devra être créé (le gate refusera le câblage sinon).
- [x] **Phase 13** — Audit gate `--strict` mode. `pipeline/scripts/audit/check_layering.py --strict` retourne exit 0 avec **0 violations et 0 warnings**. La whitelist YAML ne contient plus que les seeds-mappings (Cat-M) et seeds-cache LLM (Cat-C) — qui sont des conventions de référencement dbt, pas des bypass.
- [x] **Phase 14** — Diagramme master overview régénéré sans aucune flèche pointillée. Toutes les caches internes représentées comme une famille (`subventions_pre_enrichment`, `pdf_invest`, `delibs/sessions`, `enrichment`, `wip`). Les sync polymorphes regroupés dans une boîte SYNC2_BOX.
