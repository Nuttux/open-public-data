# Product Analytics

First-party event tracking system for [donneeslumieres.fr](https://donneeslumieres.fr). Built to understand user behavior without relying on third-party services, resistant to ad blockers, and compliant with CNIL audience measurement exemption (no consent popup required).

---

## Architecture

```
Browser (client JS)                    Vercel Server (CDG1)
┌──────────────────────┐  POST /api/ev  ┌──────────────────────────┐
│  useAnalytics() hook │ ──────────────→│  app/api/ev/route.ts     │
│  - visitor cookie     │  same domain   │  - validates event names  │
│  - session ID (RAM)   │  (not blocked  │  - enriches with geo/IP   │
│  - event buffer       │   by ad block) │  - truncates IP           │
│  - flush every 3s     │               │  - writes to BigQuery     │
│  - sendBeacon on exit │               └──────────────────────────┘
└──────────────────────┘                          │
                                                  ▼
                                         BigQuery (EU region)
                                         product_analytics.events
```

### Why first-party?

Ad blockers block requests to `google-analytics.com`, `posthog.com`, etc. They cannot block requests to your own domain without breaking your app. The endpoint `/api/ev` is intentionally short and generic.

### Client-side buffering

Events are collected in an in-memory array and sent as a batch:
- Flush every **3 seconds** if events are waiting
- Flush immediately on **page unload** via `navigator.sendBeacon` (guaranteed delivery even when tab closes)
- Max **50 events** per batch

### Server-side processing

The API route (`/api/ev`):
- Validates each event against a known events allowlist
- Rejects payloads >100KB or >100 events
- Rate-limits at 30 req/min per IP (in-memory counter)
- Enriches with Vercel headers: `x-vercel-ip-country`, `x-vercel-ip-city`
- Truncates IP addresses (last octet zeroed for IPv4)
- Writes to BigQuery via `@google-cloud/bigquery`

---

## User Identity

### Visitor ID (persistent cookie)

- Cookie: `_dl_vid` — first-party, `SameSite=Lax`, `Secure`
- Value: `crypto.randomUUID()`
- Max-age: **13 months** (CNIL maximum)
- Enables: returning visitor analysis, multi-visit journeys

### Session ID (in-memory)

- Generated once per tab lifetime (module-level variable)
- Value: `crypto.randomUUID()`
- Enables: grouping events within a single visit

---

## CNIL / GDPR Compliance

This setup qualifies for the **CNIL audience measurement exemption** — no blocking consent popup is needed.

| Requirement | Status |
|---|---|
| Purpose strictly audience measurement | Cookie + data used only for analytics |
| No third-party data sharing | Our own BigQuery, no external services |
| No cross-site tracking | First-party cookie, single domain |
| Cookie lifetime ≤ 13 months | `_dl_vid` max-age = 395 days |
| Data retention ≤ 25 months | BigQuery partition expiry |
| Users informed | `/confidentialite` privacy page |
| Opt-out mechanism | Toggle on privacy page, sets `_dl_optout` cookie |
| GPC signal respected | `navigator.globalPrivacyControl` checked |

### Opt-out

- Setting the `_dl_optout` cookie stops all tracking
- The visitor ID cookie is deleted on opt-out
- Users can toggle tracking on `/confidentialite`
- Browsers sending [Global Privacy Control](https://globalprivacycontrol.org/) are automatically excluded

---

## Setup

### Environment Variables (Vercel)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_ANALYTICS_ENABLED` | `true` to enable tracking. In dev, defaults to disabled unless explicitly `true`. |
| `BIGQUERY_ANALYTICS_KEY` | Base64-encoded service account JSON with `bigquery.dataEditor` on `product_analytics` dataset |
| `BIGQUERY_ANALYTICS_PROJECT` | BigQuery project ID (default: `open-data-france-484717`) |
| `BIGQUERY_ANALYTICS_DATASET` | BigQuery dataset name (default: `product_analytics`) |

### BigQuery Table

```sql
CREATE TABLE `open-data-france-484717.product_analytics.events` (
  event_id STRING NOT NULL,
  event_name STRING NOT NULL,
  event_timestamp TIMESTAMP,
  received_at TIMESTAMP,
  visitor_id STRING,
  session_id STRING,
  page_path STRING,
  page_tab STRING,
  referrer STRING,
  utm_source STRING,
  utm_medium STRING,
  utm_campaign STRING,
  device_type STRING,
  viewport_width INT64,
  screen_width INT64,
  user_agent STRING,
  locale STRING,
  country STRING,
  city STRING,
  ip_truncated STRING,
  properties STRING  -- JSON string for event-specific data
)
PARTITION BY DATE(event_timestamp)
CLUSTER BY event_name, page_path;
```

### Local Development

In dev mode (`NODE_ENV=development`):
- Events are logged to the browser console instead of being sent to BigQuery
- Set `NEXT_PUBLIC_ANALYTICS_ENABLED=true` in `.env.local` to enable console logging
- The API route logs events to the server console when no BigQuery key is configured

### Key Files

| File | Role |
|---|---|
| `src/lib/hooks/useAnalytics.ts` | Core hook: cookie, session, buffering, auto page_view/scroll_depth |
| `src/lib/analyticsContext.tsx` | React Context providing `track()` function to all components |
| `src/components/AnalyticsProvider.tsx` | Wrapper component, initializes analytics, placed in layout.tsx |
| `src/app/api/ev/route.ts` | Server-side: validate, enrich, write to BigQuery |
| `src/app/confidentialite/page.tsx` | Privacy policy page with opt-out toggle |

---

## Events Reference

### Automatic Events

These fire without any manual instrumentation.

#### `session_start`
First event of a new tab session.

| Property | Type | Description |
|---|---|---|
| `entry_page` | string | The first page path visited |

#### `page_view`
Fires on every route change (client-side navigation).

No additional properties — `page_path` and `page_tab` are set from the URL.

#### `scroll_depth`
Fires at 25%, 50%, 75%, and 100% scroll thresholds (once per page).

| Property | Type | Description |
|---|---|---|
| `depth_percent` | number | Threshold reached (25, 50, 75, or 100) |

---

### Navigation Events

#### `nav_click`
User clicks a link in the navbar (desktop top bar or mobile bottom tab bar).

| Property | Type | Description |
|---|---|---|
| `destination` | string | Target href (e.g. `/budget`) |
| `nav_type` | string | `desktop_top` or `mobile_bottom` |

**Component:** `Navbar.tsx`

#### `tab_change`
User switches tabs within a page (Budget, Patrimoine, Logements, etc.).

| Property | Type | Description |
|---|---|---|
| `from_tab` | string | Previous tab ID |
| `to_tab` | string | New tab ID |

**Component:** `TabBar.tsx`

#### `cta_click`
User clicks a call-to-action button or card on the homepage.

| Property | Type | Description |
|---|---|---|
| `cta` | string | CTA identifier (e.g. `hero_primary`, `question_card`) |
| `destination` | string | Target href |

**Component:** `app/page.tsx` (homepage)

#### `external_link_click`
User clicks a link leaving the site (GitHub, Open Data Paris, etc.).

| Property | Type | Description |
|---|---|---|
| `url` | string | External URL |
| `text` | string | Link text |

**Component:** `app/page.tsx` (homepage)

---

### Budget Visualization Events

#### `sankey_node_click`
User clicks a node or edge in the Sankey diagram (or a bar in the mobile view).

| Property | Type | Description |
|---|---|---|
| `node` | string | Node name (e.g. "Éducation") |
| `category` | string | `revenue` or `expense` |
| `type` | string | `node`, `edge`, or `mobile_bar` |

**Component:** `BudgetSankey.tsx`

#### `sankey_drilldown`
User clicks a bar in the drilldown panel to explore deeper.

| Property | Type | Description |
|---|---|---|
| `item` | string | Item name clicked |
| `level` | number | Current drilldown level (0, 1, 2...) |
| `category` | string | `revenue` or `expense` |

**Component:** `DrilldownPanel.tsx`

#### `drilldown_close`
User closes the drilldown panel.

| Property | Type | Description |
|---|---|---|
| `title` | string | Panel title when closed |
| `level` | number | Level at time of closing |

**Component:** `DrilldownPanel.tsx`

#### `view_toggle`
User switches between visualization modes (e.g. Flux/Dépenses on Budget page).

| Property | Type | Description |
|---|---|---|
| `view` | string | New view mode (e.g. `flux`, `depenses`) |
| `context` | string | Page context (e.g. `budget_annuel`) |

**Component:** `budget/BudgetAnnuelTab.tsx`

#### `chart_click`
User clicks a data point on the evolution chart.

| Property | Type | Description |
|---|---|---|
| `chart` | string | Chart type (e.g. `evolution`) |
| `year` | number | Year clicked |

**Component:** `EvolutionChart.tsx`

#### `donut_click`
User clicks a slice in the nature donut chart (drill-down or back).

| Property | Type | Description |
|---|---|---|
| `nature` | string | Nature category name |
| `level` | number | 1 (top-level) or 2 (drilled-down) |
| `action` | string | `drilldown` or `back` |

**Component:** `NatureDonut.tsx`

---

### Year Selection Events

#### `year_change`
User changes the selected year via the year selector dropdown or arrows.

| Property | Type | Description |
|---|---|---|
| `from_year` | number | Previous year |
| `to_year` | number | New year |

**Component:** `YearSelector.tsx`

#### `year_range_change`
User changes the start or end year in the year range selector (Tendances tab).

| Property | Type | Description |
|---|---|---|
| `boundary` | string | `start` or `end` |
| `from` | number | Previous year value |
| `to` | number | New year value |

**Component:** `YearRangeSelector.tsx`

---

### Subventions Events

#### `treemap_click`
User clicks a thematique in the subventions treemap.

| Property | Type | Description |
|---|---|---|
| `thematique` | string | Thematique name |
| `action` | string | `select` or `deselect` |

**Component:** `SubventionsTreemap.tsx`

#### `filter_change`
User changes a filter value (subventions page or logements explorer).

| Property | Type | Description |
|---|---|---|
| `filter` | string | Filter key (e.g. `search`, `typesOrganisme`, `direction`, `arrondissement`, `bailleur`, `annee`) |
| `value` | string | New filter value (JSON-stringified for arrays) |

**Components:** `SubventionsFilters.tsx`, `logements/LogementsExplorerTab.tsx`

#### `filter_reset`
User resets all filters to defaults.

| Property | Type | Description |
|---|---|---|
| `context` | string | Page context (`subventions` or `logements`) |

**Components:** `SubventionsFilters.tsx`, `logements/LogementsExplorerTab.tsx`

#### `table_sort`
User sorts a table column.

| Property | Type | Description |
|---|---|---|
| `column` | string | Column name (e.g. `montant_total`, `beneficiaire`) |
| `direction` | string | `asc` or `desc` |

**Component:** `SubventionsTable.tsx`

#### `table_paginate`
User navigates between table pages.

| Property | Type | Description |
|---|---|---|
| `direction` | string | `prev` or `next` |
| `page` | number | Target page number |

**Component:** `SubventionsTable.tsx`

---

### Logements Events

#### `map_view_toggle`
User switches between list and map view on the logements explorer.

| Property | Type | Description |
|---|---|---|
| `view` | string | `liste` or `carte` |
| `context` | string | `logements` |

**Component:** `logements/LogementsExplorerTab.tsx`

---

### Glossary Events

#### `glossary_open`
User opens the glossary drawer via the navbar button.

| Property | Type | Description |
|---|---|---|
| `trigger` | string | `navbar_button` |

**Component:** `Navbar.tsx`

#### `glossary_term_view`
A specific glossary term is highlighted (opened via a GlossaryTip in the content).

| Property | Type | Description |
|---|---|---|
| `term` | string | Term key (e.g. `epargne_brute`) |

**Component:** `GlossaryDrawer.tsx`

#### `glossary_section_toggle`
User expands or collapses a glossary section accordion.

| Property | Type | Description |
|---|---|---|
| `section` | string | Section title |
| `action` | string | `open` or `close` |

**Component:** `GlossaryDrawer.tsx`
