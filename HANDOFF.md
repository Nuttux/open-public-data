# HANDOFF — context for picking up work in a new assistant (Codex / other)

_Written 2026-07-23. This file exists because most durable project context lived
in a Claude-side memory store the new tool cannot read. Read this + `CLAUDE.md`
(+ `ADDING-A-PLACE.md` before touching any place) before starting._

> Codex reads `AGENTS.md`. An `AGENTS.md` at repo root points here and to
> `CLAUDE.md` — keep all three in sync if you edit the rules.

---

## 0. Two hard environment gotchas (read first)

1. **Two clones exist. This one is canonical:**
   `/Users/daniel/code/open-public-data/`.
   A second, **stale** clone lives at
   `/Users/daniel/Desktop/dani-code/open-data-paris/open-public-data/`.
   **Never read, edit, commit, or push from the Desktop clone.** All work —
   reads, edits, git, builds — happens in `/Users/daniel/code/open-public-data/`.

2. **Commit authorship:** the author is **the user only**. Never add the
   assistant as author or `Co-Authored-By`. Git log is read by external audit,
   press, and grant reviewers.

---

## 1. Non-negotiable rules (these override convenience)

**Data integrity**
- **Zero hardcoded numbers.** Every factual metric flows pipeline → JSON with a
  `source` + `source_url`. This is the core Open Data promise. No number in a
  component that didn't come through an export.
- **No pipeline layer bypass.** Data enters raw → stg → core → mart → export,
  always. `core` is row-level OBT; rollups go in `mart`/`intermediate`. No
  shortcuts (ADR-0001).
- **Prove before ship:** source arithmetic self-checks as dbt tests; exported
  headline totals match official published figures.

**Editorial / neutrality** (this is a politically-neutral civic project)
- **Source-anchored framing**, not absolute claims. Prefer "where the numbers
  come from → source X" over "no estimates / we never…".
- **No right-coded fiscal framing.** Never "your taxes / tax receipt". Prefer
  "public service / what the City produces".
- **No invented methodology claims.** Don't invent "human review > X€" or manual
  gestures that aren't actually in the code.
- **No invented commitments.** Never put a future date, vendor, or deliverable
  in a public page or note without explicit user sign-off.
- **No fake official marks.** No fake République seal / stamp / watermark / fake
  code watermark — it discredits the project.
- Apply the **editorial charter** (tone, neutrality, banned tics) to any article.

**UI**
- **UI self-review is mandatory.** Any UI change → screenshot (desktop +
  mobile) and visual re-read before saying "done". Playwright is available.

**i18n**
- Any FR feature/content → fill the matching `en.ts` (and `pt.ts` for Recife) in
  the same session so translations don't drift.

---

## 2. What this project is

Civic-finance explorer, multiple places at two levels:
`/{country}/national` and `/{country}/city/{slug}`. One repo, one app, forked
per instance. We maintain the contracts + playbook, not deployments.

**Convergence is the architecture** (see `CLAUDE.md` + ADR-0010 / ADR-0011):
`website/src/data/places.json` is the ONLY file that should "know" a place
exists. New city = config + seeds, NOT forked code — unless the data genuinely
differs (new schema family). Reuse shared components/macros/exports; adapt Paris
components to a new city's data rather than starting a new direction.

**Brand:** project is being rebranded to **Qipu** (qipu.org). Business framing:
open-core B2G — cities pay for the operated service; the repo is open. Target
segment = mid-tier ODS-native cities without a legibility/AI layer
(Lille/Nantes/Angers/Ghent/Bologna), ~€20–25k/yr, under the direct-award
threshold.

---

## 3. Current work-in-flight (as of 2026-07-23)

**Canonical clone is on branch `feat/sf-budget-timeline`** with a large body of
uncommitted changes (OG-image routes across many pages, Recife BR pages/fiches,
landing deck, i18n en/pt, StackedBarTheme). Decide per-change whether to commit,
stash, or discard before switching contexts — don't blindly `git add -A`.

**Active / recent threads (may span branches):**
- **Recife (br-municipal)** — first Brazilian city, family `dbt_br_*`, config
  `countries/br.yaml`. Data traps: use Modalidade 50 not Grupo; UTF-8; funcional
  ≠ credor. Enrichment: CNPJ + tema + plain-language (`ode_*` join, raw kept
  intact).
- **SF budget 150-year timeline** — 1888→2025 time machine, IA-archive verified
  quotes + live mart, honesty re-verify gate (this branch).
- **National capability matrix** — budget-by-nature for any French commune
  (DGFiP balances, ungated), data-derived resolver `getCommuneCapabilities`;
  branch `feat/national-capability-matrix`, Blocks 2–4 remaining.
- **Marseille v1** and **US v0** (branch `us-v0`, EN-only, BQ) exist as further
  place instances.

**Pipeline follow-ups** live in `pipeline/docs/data_quality_followups.md`
(SIRET absent from subventions source; decayed budget labels; dbt changes ⇒
prod rebuild in CI).

**Known data-model landmines (subventions):**
- 29,090 "beneficiaries" = 13,723 orgs + 15,367 physical persons. **Never
  classify or search the physical persons.**
- `objet_du_dossier`: the City already writes the description — using `MAX()` on
  a string throws the info away; ~87% of real orgs covered for free.
- Identity split: ~39% of € was mis-classified on qui-recoit; CASVP
  under-declared by €386M — same root cause as the objet issue.

---

## 4. Where things live

- **Per-city FR source configs:** `pipeline/configs/cities/{city}.yaml`
  (read by `sync_city.py {city}`).
- **Country configs:** `pipeline/configs/countries/{country}.yaml`.
- **Export plumbing:** `pipeline/scripts/export/_export_common.py`
  (`get_bigquery_client`, `data_dir`, `marts_dataset`, `write_json`). Write only
  the city-shaped SQL.
- **Budget logic:** dbt macros (`ode_categorie_flux`,
  `budget_thematique_best_match`) — not copy-pasted CASE blocks.
- **Choropleth:** `website/src/components/fusion/DistrictChoropleth.tsx` — pass
  geometry via props, don't fork.
- **Shared places explorer:** `components/places/` (Paris lieux + SF places
  unified).
- **Enrichment model:** keep `gemini-3-flash` (beat 17 others; context is worth
  +15–19pt, the model ~0–5pt — beware the haiku fallback trap).
- BQ datasets `raw` + `dbt_paris_*` are public-read (for the Provenance modal);
  query cost billed to the project.

---

## 5. Eval / rigor discipline (learned the hard way)

- Set explicit acceptance criteria per task, check them before "done".
- Never self-evaluate a headline after seeing the ground truth.
- One variable per A/B; state the margin of error before announcing a result.
- No dead suggestions: any clickable chip/seed must be validated at runtime
  against the exact corpus it queries (same predicate as the search).

---

## 6. Deploy / prod topology (brief)

Prod = Vercel project `open-public-data` (domains on qipu.org). Judge prod on
`www.qipu.org`, not stale preview links. Catching prod up = fast-forward merge
feature → main → push. Branches gitignore `public/data`, so a prebuild needs
`GCP_SA_KEY_B64` (sensitive) or it dies early.

---

_If you're the assistant reading this: confirm you're in the canonical clone
(`pwd`), read `CLAUDE.md` and `ADDING-A-PLACE.md`, then ask the user which
thread from §3 to resume._
