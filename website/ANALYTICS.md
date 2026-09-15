# Analytics — how the site describes itself to PostHog

PostHog (EU cloud), browser SDK only, audience-measurement mode: persistent
first-party visitor id (365-day cookie), no identify(), no person properties,
no banner (CNIL audience-measurement exemption; see /confidentialite). Session
replay is opt-in; the whole thing is opt-out with one switch. The wiring is
`src/components/AnalyticsProvider.tsx`.

This file is the contract between the site and the weekly product routine
that reads PostHog. Three parts: **the page grammar** (what every event knows
about the page), **the instruments** (the events), and **how to read them**
(the rules the routine follows). The machine-readable catalog is
`src/lib/analytics/events.ts`; `events.test.ts` fails when the code emits an
event the catalog does not list, or lists one the code no longer emits.

Rule of the house (2026-09-14): **every UI change ships with its events in
the same commit** — a fold has a `data-fold`, a section a `data-section`, a
chart its `chart_element_click`, a door its link role. A change that cannot
be read in PostHog the week after is not finished.

---

## 1. The page grammar — nine facts on every event

Every event, including `$pageview`, carries the same context, computed in the
browser from the URL by `src/lib/analytics/page-context.ts`. The address
grammar is `/{lang}/{country}/{place}/…` on one host (`www.qipu.org`); the
patterns below are the *logical* route, language stripped.

| property | values | what it answers |
|---|---|---|
| `page_country` | `fr` `us` `br` `none` | which country's data |
| `page_tier` | `hub` `commune` `national` `site` | a city with its own routes (paris, marseille, san-francisco, recife), one of the 35 000 communes on the shared page, a national page, or a site page |
| `page_city` | slug or null | which city / commune |
| `page_family` | `budget` `subventions` `marches` `dette` `investissements` `logement` `lieux` · `payroll` `contracts` `places` `who-gets-paid` `the-city` · `contratos` `quem-recebe` … · `ville` `landing` `comparer` `chat` `analyses` or the static page's name | which register |
| `page_kind` | `landing` `country` `city` `hub` `explorer` `fiche` `compare` `chat` `static` | what kind of page: the language hook, a country door, the city's page, a family page, a filterable list, one entity, the comparator |
| `page_entity_type` | `association` `poste` `fournisseur` `contrat` `categorie` `offres` `domaine` `projet` `lieu` `dept` `payee` `role` … or null | which kind of entity, on a fiche |
| `page_pattern` | `/france/{commune}` `/france/paris/marches` `/france/paris/subventions/association/{slug}` `/usa/san-francisco/payroll/role/{slug}` … | the route with placeholders — **group by this**, never by `$pathname`, or 35 000 commune pages become 35 000 rows |
| `page_locale` | `fr` `en` `pt` | the `<html lang>` |
| `page_surface` | `page` `drawer` | whether the fiche was shown as a full page or as a drawer over another page |

The unit test `page-context.test.ts` pins one example per route family. When
a route is added, add a line there.

---

## 2. The instruments

### Universal — fire on every page from the markup, no per-page code

| event | when | own properties |
|---|---|---|
| `$pageview` | one per page shown, hard load **or** client navigation. Sent by us after the page context is registered (PostHog's own auto-capture is off, it fired before React knew the new page). A `?year=` change on the same path is not a pageview. | PostHog's `$current_url`, `$referrer`, `$prev_pageview_*` scroll depth |
| `section_view` | a section's top entered the top 70 % of the viewport, once per section per pageview. The **denominator** for every "nobody opens this" question: not reached is not the same as not interesting. | `section_id`, `id_source` (`data` / `id` / `h2` / `text`), `index` |
| `details_toggle` | a fold opened or closed | `open`, `section_id` (enclosing section), `fold_id`, `label`, `source` (`native_details` / `expandable_list`) |
| `link_click` | any internal link. The universal "where next" event. | `href`, `to_pattern`, `to_family`, `to_kind`, `to_entity_type`, `role`, `section_id`, `in_fold`, `text` |
| `external_link_click` | outbound, mailto, tel. `role = source` when the link cites a dataset. | `url`, `domain`, `role`, `section_id`, click coordinates |
| `toc_click` | a jump to a section (page TOC, commune chips bar, inline anchor) | `section_id`, `surface` |
| `cta_click` | any `[data-cta]` | `cta_id`, `section_id` |
| `year_change` | another year picked: the YearPicker of the old hubs, the commune page's year menu, the year menu under a section page's number (`surface = menu`) | `year_from`, `year_to`, `surface` |
| `share_click` | share / copy link: a drawer, a map, the commune headline, a section page's number or scene | `method` (`native` / `copy` / `none`), `entity_type`, `object` (`hero`, `competition`…) |

**Section ids.** A section is named by, in order: `data-section` (the fiche
kit's `<V3Section id="who">`, the commune page's `SectionFold`, a section
page's `SectionHero` = `hero`), a DOM `id` (`sec-sources` on the old hubs,
`depenses` / `construit` / `dette` / `achats` / `comparer` on the commune
page), the `id` of its heading, and only then its heading text with an `h:`
prefix (locale-dependent — fine on EN-only SF fiches, noisy elsewhere).

Fiche kit sections carry short English ids stable across locales: `who`,
`why`, `years`, `lines`, `contracts`, `loans`, `missions`, `links`,
`related`… A **section page** (Contrats publics since 2026-09-14, the others
as they move to the fiche grammar) reads top to bottom: `hero` (the number),
`scene` (on Contrats publics: the year's euros cut by domain, number of
bids or company — the switch is `filter_change` with `field = scene_group`,
`value` = `domaine` | `offres` | `entreprise` (`categorie` until
2026-09-15) and `variant` = `bars` | `mosaic`, the share is `share_click`
with `object = scene_<group>`; a bar or a tile that opens a fiche is a
`link_click` with `role = row` or `role = tile`),
`contracts` (rows), `years` (the years rail), `search` (field only; results
are `search_submit` / `search_result_click`), `understand` (the « Comprendre »
folds), `related` (the doors), `next` (the next section). Reach of `next` is
the page's completion rate.

**Fold ids.** `V3Fold id="more-contracts"`, `FicheMore` (SF) derives its id
from the noun (`more-contracts`, `smaller-departments`), `ExpandableList`
uses the row key, `Bars` folds its rest under the id it is given
(`more-domaines`, `more-companies`). Never the label: it carries a count and
a locale.

**Link roles.** Where the link sits: `nav`, `footer`, `crumb`, `toc`,
`year`, `cta`, `hero_meta` (the figure's grey line), `lead` (the opening
sentence), `row` (a fiche row or a labeled bar), `sentence` (an inline "see
all"), `foot`, `kicker` (the « Paris › Contrats publics » line), `hero`
(anything else in a section page's head), `door` (a « Voir aussi » door),
`next` (the next-section door), `deck` / `marquee` / `chips` (the landing
hero's deck, the scrolling band, the chips), or a `data-block="…"` name, else
`body`.

### Specific — one component, one question

| group | events |
|---|---|
| drawer | `drawer_open` `drawer_close` `drawer_back` |
| search | `search_modal_open` → `search_modal_query` (hashed text, `results_count`) → `search_modal_select` · explorers: `search_submit` (the reader's words, hashed) vs `search_seed_click` (our seed) → `search_result_click` · `results_expand` `load_more` `filter_change` `filter_reset` |
| charts / maps | `chart_element_click` (`chart = annees_rail` with `year` and `open` when a year of the rail is tapped; the budget and explorer charts with their own ids) `choropleth_click` `map_marker_click` `stress_test_run` |
| chrome | `nav_click` `mobile_menu_toggle` `scope_change` `lang_switch` `for_cities_view` `for_cities_read` |
| chat | `chat_chips_shown` · `chat_question` with `origin` ∈ typed / suggestion / followup / page_chip |
| GPU city | `city_gl_boot` `city_gl_degrade` |

Full property lists: `src/lib/analytics/events.ts`.

---

## 3. How to read them

1. **Group by `page_pattern`, split by `page_kind`.** Never by `$pathname`.
2. **Reach before interest.** A fold's open rate is `details_toggle(open)` ÷
   `section_view` of its section, on the same `page_pattern`. A fold never
   opened but rarely reached says the page is too long; a fold reached and
   never opened says the fold is not wanted; a fold opened a lot should open
   by default. That is the whole point of the fold measurement (decision of
   2026-09-09: fold first, measure, then decide).
3. **Dead ends.** Share of `$pageview` on `page_kind = fiche` followed in the
   session by a `link_click` (any role) or a `drawer_open`; exit pages by
   `page_pattern`. `role = door` (the « Voir aussi » block) and `role = next`
   tell whether the doors do their job; on a section page, `section_view` of
   `next` ÷ `$pageview` is how many readers reach the bottom.
4. **The reader's words vs ours.** Demand rests on `chat_question` with
   `origin = typed`, `search_submit` and `search_modal_query` only. Clicks on
   chips, seeds and follow-ups measure our prompts — report them apart, never
   as "what people ask". `search_modal_query` with `results_count = 0` lists
   communes or spellings we miss (hashed: count them, do not name them).
5. **Bots and ourselves.** Exclude events with `$browser` null, user agents
   naming a headless tool (Lightpanda is blocked at the SDK since 2026-09-14;
   older rows exist), `$host` containing localhost / 127.0.0.1 / vercel.app,
   the old-user-agent fleet (browser major version ≤ 125, direct, one
   pageview, no `$web_vitals`), and the two distinct ids of the site's author
   (kept as a PostHog test-account filter, not in this file). Report what was
   excluded.
6. **Duplicates by design.** `link_click` fires for every internal link;
   `nav_click`, `search_result_click`, `chart_element_click` are richer
   duplicates of some of those clicks. Count one or the other, never both.
   `drawer_open` fires twice per opening in development (strict mode), once
   in production.
7. **Dates.** `since` in the catalog says when an event exists with its
   current shape. Instrumentation history:
   - 2026-07-16 first events (memory-only visitor id, hard-load pageviews only)
   - 2026-09-08 persistent visitor id; pageviews on client navigation
   - 2026-09-09 chat events from the browser (`chat_question`, `chat_chips_shown`)
   - 2026-09-14 page grammar on every event (one-host addresses); manual
     `$pageview`; `section_view`, `link_click` with roles, stable
     `details_toggle` ids, `search_modal_query`, `share_click` with `object`,
     `year_change` from the section-page menu, `chart_element_click` on the
     years rail; Lightpanda blocked at the SDK; Contrats publics (Paris,
     Marseille) rebuilt on the fiche grammar with its section ids.
   Nothing before a date can be measured with the instruments that came
   after it — say so rather than diagnosing a fixed thing.

---

## Verifying locally

The SDK refuses to capture from a browser it takes for a bot: Playwright's
Chromium is one (`navigator.webdriver`, the `HeadlessChrome` brand in
`navigator.userAgentData`). Capture requests also use `fetch` keepalive,
which Playwright's request interception does not see. So: run the dev server
with `NEXT_PUBLIC_POSTHOG_KEY=phc_test NEXT_PUBLIC_POSTHOG_HOST=http://localhost:3099`
pointed at a small local sink (answer JS to GETs, a flags JSON to `/flags/`,
decode gzip on `/e/`), and hide the two bot tells with an init script. Nothing
reaches the project.

---

## Privacy notes

No query text is ever sent — `search_submit` and `search_modal_query` carry a
SHA-256 prefix and the length. Chat questions are sent (500 chars) because
the answer quality is the product; the routine never quotes names, emails or
phone numbers from them. Opt-out: the switch on /confidentialite sets a cookie
on the apex domain (`_fod_analytics_optout`), read before every capture.
