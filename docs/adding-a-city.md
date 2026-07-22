# Adding a city — frontend architecture & guardrails

**A new city is an *adapter over shared components*, never a fork.**

This is the contract that keeps the marginal cost of city N+1 low. It is the
frontend companion to the data/product side of
[`city-replication-playbook.md`](./city-replication-playbook.md).

## The lesson that produced this doc

San Francisco's first pass was built as a parallel fork: its own component tree
(`components/us/*`), its own CSS class families (`fx-place-*`, `fx-payee-*`
instead of `fx-fiche-*`), its own everything. The result was the same *pages* as
Paris — a fiche is a header + KPI row + money breakdown + source links + related
— re-implemented from scratch, three layers deep. That cost real dev time and
debugging for zero product difference.

What we actually want is "Paris, adapted to SF's data structures." When we
rebuilt the **landing** and the **places explorer** that way, each became one
neutral template fed by a thin per-city adapter. This doc makes that the default.

## The pattern

```
components/<surface>/         ← NEUTRAL. Renders a typed model. No city imports.
  <Surface>.tsx  types.ts
lib/<city>/<surface>-model.ts ← ADAPTER. Maps that city's loaders → the model.
app/.../<surface>/page.tsx    ← <Surface model={buildModel()} />
```

- **Typed model = the checklist.** The template consumes a `SurfaceModel`
  (e.g. `LandingModel`). TypeScript refuses to let a city ship the surface
  half-built — every field must be supplied. This is the strongest guardrail.
- **Adapters own the city specifics** — hrefs, amounts, i18n, photos. They are
  allowed to import `lib/<city>/*`, city components, i18n. They **derive every
  href/amount from the live corpus** so links can't rot.
- **One CSS vocabulary.** All cities render the same `fx-*` classes under
  `.theme-fusion`. Never invent a city-specific class twin for an existing
  concept. Theme *tokens* may vary by `.theme-<city>` if a city ever needs it.
- **CSS is already global**, so a new city ports *no* styling.

### The boundary is enforced (guardrail G4)

`eslint.config.mjs` restricts imports inside the neutral surface dirs
(`src/components/landing/**`, `src/components/places/**`, …): they may not import
`@/lib/us/*`, `@/lib/fusion-data`, `@/components/{us,fusion}/*`, or `@/i18n/*`.
If a neutral component "needs" a city import, that's the signal to (a) push the
value into the model, or (b) move a genuinely-shared primitive into a neutral
dir. **When you extract a new neutral surface dir, add it to that rule's
`files` list.**

## Surface status

| Surface | Neutral home | Status |
|---|---|---|
| Landing | `components/landing/` | ✅ shared (Paris + SF) |
| Places / lieux explorer | `components/places/` | ✅ shared (Paris + SF) |
| Entity fiche | `components/fiche/` | 🔜 converging (Paris `fx-fiche-*` → neutral; SF fiches migrate) |
| Ranked-list page (payees/subventions, contracts/marchés) | — | ⛔ forked — candidate |
| Budget explorer (treemap + drilldown) | — | ⛔ forked (`BudgetTreemap` vs `UsTreemap`) — candidate |

Convergence is opportunistic: install the rails, then collapse the highest-
duplication surface first (the fiche), then the rest as they're touched.

## Checklist — a city's landing (repeat per surface)

1. Write `lib/<city>/<surface>-model.ts` exporting `build<Surface>Model()`
   returning the surface's typed model, built from that city's loaders.
2. Point the page at `<Surface model={build<Surface>Model()} />`.
3. Source any assets (photos) through a licence-gated script
   (`fetch_sf_landing_photos.py` is the template — Wikimedia Commons, free
   licences only, credits recorded).
4. `npx tsc --noEmit` (the model contract must be fully satisfied) and
   `npx eslint` (the boundary must hold).
5. Self-review with Playwright, desktop + mobile.

If you find yourself creating `components/<city>/…` or a new `fx-<city>-*` class
for something Paris already renders, stop — you're forking. Write an adapter.
