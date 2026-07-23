# Data-quality follow-ups

Tracking file for the deferred items from the 2026-07-23 pipeline audit +
hardening pass (branch `feat/marseille-parity`). Each block below that shipped
is listed at the end for context; this file is the TODO surface.

## Open

### 1. Budget friendly-labels — re-key on M57 code + editorial pass
- **Why:** the friendly-label seed (`seed_label_friendly.csv`) keys on the
  technical LABEL string. It has decayed against the source wording — only
  ~20% of shown budget € still gets a friendly label; ~80% of distinct M57
  natures now display raw jargon.
- **Guarded:** `apply_friendly_labels.py` now fails the build if coverage drops
  below 12% (drift guard shipped).
- **To do:**
  - Add `nature_code` to `mart_budget_sankey_lines` (it currently exposes only
    `nature_libelle`) and carry it onto each sankey item in
    `export_sankey_data.py`.
  - Reconcile the two label vintages: `core_budget.nature_libelle` differs from
    `mart_budget_sankey_lines.nature_libelle` (the friendly match works on the
    mart's, not core's — a code-derived seed built from core recovered only 4
    codes vs ~192 item rewrites/yr from the mart).
  - Author friendly labels for the ~80% uncovered `nature_code`s (editorial
    vulgarization of M57 — NOT to be auto-generated; needs review).
  - Then key the friendly map on `nature_code` (string match as fallback) and
    raise the drift floor.
- **Bonus:** some codes carry >1 label variant (e.g. `6228`, `64131`) — keying
  item aggregation on `nature_code` would merge them (a numbers change; show a
  diff before shipping).

### 2. Two declared grains that don't hold (investigate, then test)
Verified non-unique on live data — left UNtested rather than shipping a red CI
assertion:
- `core_ap_projets` — declared grain `(annee, ap_code)`: 7155 rows / 3747
  distinct. Find the duplication source; either dedup or fix the declared grain,
  then add `dbt_utils.unique_combination_of_columns`.
- `core_logements_sociaux` — declared grain `id_livraison`: 4173 / 4141 (32
  dupes). Same treatment.

### 3. PK-uniqueness + grain docs on the rest of the core layer (audit H1)
Only `core_subventions.cle_technique` (shipped) and the pre-existing
marches/budget models carry uniqueness tests. Add verified-safe unique tests to
the remaining core OBTs once their grains are confirmed.

### 4. `national` + `br` families — grain tests & schema (audit H2/H3)
- `national` cores/marts: no grain-uniqueness or reconciliation tests despite
  the public "budget-by-nature for any commune" claim. Add PK + a cat7-style
  total-reconciliation test.
- `br` (Recife): no `schema.yml` at all under `models/br/`; `mart_br_recife_places`
  reads `source(...)` directly (mart→raw skip). Add schema + route through a
  staging model before it ships.

### 5. Reproducibility: `_dbt_updated_at` / `generated_at` (audit M2/M5, low)
`CURRENT_TIMESTAMP()` is materialized into ~26 core+mart tables and
`datetime.now()` into 15 export scripts. The parity gate already ignores these
keys, so it's a hygiene item: drop the columns or set them from a single
build-time var so BQ tables are content-reproducible.

### 6. SIREN org dimension (audit registry rec #2)
Consolidate the two name→SIRET resolution caches (`seed_cache_siret_by_name`,
`enrich_deliberations_sirene.py`) into one persisted SIREN-keyed org registry,
so `dim_beneficiaire` can attach a resolved SIREN once matched. The SIREN-keyed
half of the marchés path is already fine; only the name-bridge is fragile.

### 7. SF (`us`) run-date non-determinism (audit M1)
`CURRENT_DATE('America/Los_Angeles')` drives *output values* (fiscal-year-closed
/ active-as-of-today flags) in `core_us_sf_*` + two marts — re-running on a
different day changes published numbers. Parameterize via `var('as_of_date')`.

## Shipped 2026-07-23 (context)
- **Block 0** `7f34ce94` — deterministic ordering (killed ~85k-line export churn).
- **Block 1** `f0eeab39` — MAX()/ANY_VALUE → deterministic dominant-row picks.
- **Block 2** `9aad737d` — budget friendly-label coverage drift guard.
- **Block 3** `2393353c` — `dim_beneficiaire` persisted registry + snapshot +
  cat10 thematique-coverage drift test.
- **Block 4** `00aec304` — PK uniqueness on `core_subventions.cle_technique`.
- **Block 5** (this) — re-point `core_subventions` enrichment through
  `dim_beneficiaire` (+ `beneficiaire_id`).

> Note: the dbt-layer changes materialize on the next **prod** build (CI-only per
> `profiles.yml`). Verified via read-only prod queries + dev compile; the final
> JSON regeneration + parity-green happens in CI after the prod rebuild.
