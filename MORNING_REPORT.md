# SF-on-skeleton — overnight build report

Branch: **`sf-rebuild`** (off the skeleton state with the merged us-v0 SF work).
Six commits, nothing pushed, `main` untouched. All work in the canonical clone.

## TL;DR

The San Francisco surface is rebuilt to the Paris post-de-fluff standard, and
the Internet Archive integration is real and working: **27 places published**,
each with a clean-licensed photo, ≥3 genuinely-about-the-place archive
documents, a money link, and a summary written only from pulled material.
Every block landed at least its core; the follow-ups below are wiring and
polish, not missing foundations. **Production `next build` passes** ("Compiled
successfully", 430/430 static pages, exit 0) — verified end of run.

---

## Per-block status

| Block | Status | Commit |
|---|---|---|
| A1 — no-fluff opener pass (5 SF pages + national) | ✅ done | `6b367e07` |
| B — IA corpus + place linkage + payee normalization + exports | ✅ done | `ededab34` |
| C — SF Places, gated publication (27 published) | ✅ done | `483ab03d` |
| A2/D — payee fiches + archive paper trails | ✅ core done | `2ef30ca8` |
| A2/D — who-gets-paid rows → payee fiches | ✅ done | `fb667574` |
| E — SF hub + /us root + US OpenGraph card | ✅ done | `5a9b3d94` |
| A2 — budget dept fiche year-depth + cross-links | ⏱ deferred | — |
| D — contract-page vendor chips; budget/salary pairing shelves | ⏱ deferred | — |

**A1** — Every SF page + national now opens on a `PageIntro` stat band with its
signature scene hoisted first (budget→treemap, national→1790 debt chart,
who-gets-paid→ranked payees, contracts→sole-source lens, payroll→overtime lens),
all section numbers stripped, zero new i18n keys. The five per-file `readJson`
helpers were unified onto the shared memoized `lib/data/read.ts`.

**B** — A full offline pipeline (see §Pipeline). Precision held up: the IA
full-text matching on distinctive names is high-quality; the grounded-summary
pass adjudicated out venue/coincidental matches (details in §Places).

**C** — The demo centerpiece. `/us/city/sf/places` opens on an SF map beside a
synced list; each fiche is photo → grounded summary → the money → the archive
document shelf with highlighted-hit deep links (pool-labelled correctly) →
department report shelf. Root drawer, ForcedLocale-wrapped, no Paris bbox trap.

## Deviations from plan

- **Places copy is inline English**, not `us.*` i18n keys. The pages are
  EN-only and ForcedLocale-wrapped, so this renders correctly and has zero
  French leftovers; keying it is a maintainability follow-up, not a bug.
- **Photo yield drove the published count to 27, not ~50.** The gate decided,
  exactly as instructed — the limiter is Wikimedia Commons photo availability
  (branch libraries and health clinics mostly lack a Commons lead image), not
  archives or money. The 36 in-progress places are almost all "no clean photo".
- **IA scrape scoped to the demo set** (place candidates + SF departments +
  top-50 payees), as planned. Budget/salary *volume* scraping for the pairing
  shelves was not run — that shelf is deferred (see priorities).
- **No production `next build` gate per-block** — I gated each block on `tsc`
  (no type errors) + `eslint --max-warnings 0` + all routes rendering 200 in
  dev + screenshots, and ran the full `next build` once at the end (it passed:
  Compiled successfully, 430/430 static pages, exit 0). Running it per-block was
  avoided because it static-generates hundreds of fiches and would have fought
  the already-running dev server.

---

## Screenshots

All under `screenshots/sf-night/`, desktop + mobile, EN locale.

- `block-a1/` — budget, who-gets-paid, contracts, payroll, national (opener pass)
- `block-c/` — places hub, golden-gate-park, hetch-hetchy fiches, turner-construction payee fiche
- `block-e/` — /us root, /us/city/sf hub

The three worth opening first: `block-c/us_city_sf_places__desktop.png` (the map
centerpiece), `block-c/us_city_sf_places_place_golden-gate-park__desktop.png`
(a full place fiche with archive shelf), and
`block-c/us_city_sf_who-gets-paid_payee_turner-construction-co__desktop.png`
(payee fiche + paper trail).

---

## Published places (27)

Every one has a clean photo, ≥3 adjudicated archive docs, ≥1 money link, and a
source-grounded summary.

Golden Gate Park · Coit Tower · Mission Dolores Park · Union Square · Buena
Vista Park · John McLaren Park · Portsmouth Square · Glen Canyon Park ·
Conservatory of Flowers · Japanese Tea Garden · San Francisco Zoo · Marina
Green · Lake Merced · San Francisco Main Library · Laguna Honda Hospital ·
Louise M. Davies Symphony Hall · Bill Graham Civic Auditorium · Moscone Center ·
de Young Museum · Legion of Honor · Hetch Hetchy / O'Shaughnessy Dam · Sunol
Water Temple · Ferry Building · Pier 70 · Pier 39 · Cable Car Barn & Powerhouse ·
Balboa Park Station / Green Yard.

## In-progress queue (36) — your daytime worklist

Written to `website/public/data/us/sf/places/places_in_progress.json` with
per-place reasons. Summary:

- **35 — no clean photo.** Mostly SFPL branch libraries (Mission, Chinatown,
  North Beach, Bernal, Richmond, Sunset, Bayview, Excelsior, Glen Park, Eureka
  Valley/Harvey Milk), DPH clinics (ZSFG, Southeast/Chinatown/Maxine Hall/Tom
  Waddell), Muni yards, firehouses, and a handful of parks/venues whose
  Wikipedia page has no free lead image (Washington Square, Stern Grove, War
  Memorial Opera House, Kezar, Camp Mather, Asian Art Museum, Randall Museum).
  These have archive docs + money already; they need a photo (Commons upload,
  SFPL/DPH image, or your own).
- **1 — only 2 archive docs after curation: San Francisco City Hall.** The
  gate honestly held it back: "City Hall" appears constantly in the record as a
  *meeting-room address*, not about the building. Genuinely-about-the-building
  docs were just the historic structure report + a concessions item. Worth a
  hand-curated pass (there's real material under "City Hall dome/rotunda").

## Photo licence table (28 fetched; City Hall held for docs)

All Wikimedia Commons, CC/PD only, credit + licence recorded per photo in
`places/_photo_credits.json`. Licence spread: CC BY-SA 4.0 ×7, CC BY-SA 3.0 ×7,
Public domain ×6, CC0 ×4, CC BY 2.0 ×3, CC BY-SA 2.0 ×1, CC BY 3.0 ×1.

| Place | Licence | Author |
|---|---|---|
| golden-gate-park | CC BY-SA 2.0 | Dennis G. Jarvis |
| coit-tower | CC0 | Ryan Schwark |
| mission-dolores-park | CC0 | Alexwennerberg |
| mclaren-park | CC0 | SFHistoryNerd |
| hetch-hetchy | Public domain | Isaiah West Taber |
| de-young-museum | Public domain | Fine Arts Museums of SF |
| legion-of-honor | Public domain | Fine Arts Museums of SF |
| glen-canyon-park | Public domain | Unknown |
| pier-70 | Public domain | Unknown |
| san-francisco-zoo | Public domain | San Francisco Zoo |
| ferry-building | CC BY-SA 4.0 | JaGa |
| union-square | CC BY-SA 4.0 | Lordsamp |
| portsmouth-square | CC BY-SA 4.0 | BrokenSphere |
| cable-car-barn | CC BY-SA 4.0 | Jaredzimmerman (WMF) |
| balboa-park-station | CC BY-SA 4.0 | Pi.1415926535 |
| laguna-honda-hospital | CC BY-SA 4.0 | Pi.1415926535 |
| moscone-center | CC BY-SA 4.0 | 9yz |
| pier-39 | CC BY-SA 4.0 | Chris6d |
| buena-vista-park | CC BY-SA 3.0 | Guliolopez |
| conservatory-of-flowers | CC BY-SA 3.0 | harley photo |
| davies-symphony-hall | CC BY-SA 3.0 | J. Ash Bowie |
| sf-main-library | CC BY-SA 3.0 | J. Ash Bowie |
| bill-graham-civic-auditorium | CC BY-SA 3.0 | J. Ash Bowie |
| sunol-water-temple | CC BY-SA 3.0 | Ike9898 |
| sf-city-hall (held) | CC BY-SA 3.0 | Sanfranman59 |
| lake-merced | CC BY 2.0 | Isabell Schulz |
| marina-green | CC BY 2.0 | Lana |
| japanese-tea-garden | CC BY 3.0 | Asamudra |

## Payee-merge table (evidence-stamped)

200 payees normalized; 9 merged >1 variant. Merges are exact name-core matches
plus a curated table for the JV/predecessor cases the recon verified — never a
fuzzy/substring merge (an early substring rule wrongly folded "Southland
Industries" and separate bonding co-payees into Tutor Perini; fixed to
exact-core, so the long tail stays unkeyed).

| Canonical | Variants merged | Basis |
|---|---|---|
| Tutor Perini | TUTOR PERINI CORPORATION · SOUTHLAND TUTOR PERINI JV | curated: JV + predecessor Tutor-Saliba |
| Bank of New York Mellon | THE BANK OF NEW YORK MELLON · THE BANK OF NEW YORK · THE BANK OF NEW YORK CO INC | curated: pre-Mellon spelling |
| Self-help for the Elderly | SELF-HELP FOR THE ELDERLY · SELF HELP FOR THE ELDERLY | punctuation |
| San Francisco Health Plan | two case variants | case |
| New Flyer of America Inc | two case variants | case |
| S J Amoroso Construction | …CO LLC · …CO INC | legal-suffix |
| En Pointe Technologies Sales | …INC · …LLC | legal-suffix |
| MEDA Small Properties LLC | two case variants | case |
| Bank of America Na | BANK OF AMERICA NA · BANK OF AMERICA | legal-suffix |

---

## Pipeline (Block B) — what runs, in order

1. `sync/sync_ia_sf.py` — IA full-text scrape (FTS beta, cached, resumable) over
   place aliases + SF departments + top-50 payees, across the SFPL partnership
   scans and Democracy's Library pools. Year parsed from title (serial metadata
   is wrong); OCR snippet kept as evidence.
2. `enrich/normalize_sf_payees.py` — top-200 payees, name-core + curated merges,
   per-payee fiches, `_vendor_slug_map.json`.
3. `enrich/link_sf_places.py` — evidence-backed candidate links per place.
4. `enrich/fetch_sf_place_photos.py` — Commons photos, CC/PD only, incremental.
5. `export/export_sf_places.py` — candidate fiches + dl_documents shelves.
6. (grounded summaries written by the editorial pass) → `enrich/apply_sf_place_summaries.py`.
7. `export/export_sf_places.py --finalize` — publication-guarded index + reverse
   index + in-progress queue.
8. `enrich/link_sf_payees.py` — 31 payee archive paper-trails.

Re-runnable end to end; the IA scrape and photo fetch resume from cache.

## Doctrine honoured

- **Source labels**: documents from the SFPL pool read "Internet Archive — San
  Francisco Public Library partnership scans"; only the Berkeley IGS pool reads
  "Democracy's Library". The SFPL pool is never called Democracy's Library.
- **Do-not-promise**: no city bonded-debt figures, no money-by-district
  choropleth, no name-level salaries; payees outside the keyed top-200 render
  as plain text (verified: 87/100 FY2025 rows link, the rest stay text).
- **No dead links**: every place/payee/contract link is runtime-validated
  against the reverse index / keyed set (the lieux publication guard, ported).
- **Skeleton traps**: every SF drawer self-wraps in `ForcedLocale`; SF money
  goes through `lib/us/format`, never `lib/fmt`.

---

## What needs your eyes first (ordered)

1. **City Hall** — hand-curate its archive docs so the marquee civic building
   publishes (currently held at 2 genuine docs).
2. **Photos for the in-progress 35** — the single lever that grows the map from
   27 toward 50. Branch libraries + clinics are the bulk; a batch of Commons/
   SFPL images would publish most of them (archives + money already pass).
3. **Deferred D — contract-page vendor chips**: the contract fiche should link
   its prime to the payee fiche + "seen in the archive" (data is ready:
   `_vendor_slug_map.json` + `dl_documents/payee-*.json`). ~1 sitting.
4. **Deferred D — budget/salary pairing shelves**: needs a targeted scrape of
   the Consolidated Budget & Appropriation Ordinance volumes + salary
   ordinances, then a shelf next to the budget page by fiscal year. Bigger.
5. **Deferred A2 — budget dept fiche year-depth + cross-links** to its payees
   and contracts (the reverse-index `by_dept` is ready to power the place chips).
6. **i18n**: move the inline-English places/hub copy into `us.sf.places.*` keys.

Nothing above blocks the demo cut-line (places + money-flow + search/payee +
the archive integration) — those are working today.
