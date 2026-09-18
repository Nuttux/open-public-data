/**
 * THE EVENT CATALOG — every product event the site can emit, in one place.
 *
 * Read by people (website/ANALYTICS.md points here), by the weekly PostHog
 * routine (it reads this file before writing a query), and by
 * events.test.ts, which fails when a `track("…")` literal in the code is not
 * listed here — so the catalog cannot drift from the code.
 *
 * Every event also carries the page context (page_country, page_tier,
 * page_city, page_family, page_kind, page_entity_type, page_pattern,
 * page_locale, page_surface) — see page-context.ts. Properties listed below
 * are the event's own.
 */

export type EventSpec = {
  /** what the event means, in one sentence */
  desc: string;
  /** own properties: name → meaning */
  props: Record<string, string>;
  /** emitted by: `global` (AnalyticsProvider, any page) or a component */
  by: string;
  /** first day the event exists in prod with this shape (YYYY-MM-DD) */
  since: string;
  /** universal | search | chat | explorer | map | chart | chrome | gpu */
  group: "universal" | "search" | "chat" | "explorer" | "map" | "chart" | "chrome" | "gpu";
};

export const EVENTS: Record<string, EventSpec> = {
  // ── universal instruments: fire on every page from the page grammar ──
  $pageview: {
    desc: "One per page shown, hard load or client navigation, sent by us AFTER the page context is registered (PostHog's own auto-capture is off).",
    props: { $current_url: "full URL", $pathname: "path", $referrer: "previous URL", "$prev_pageview_*": "PostHog scroll depth of the previous page" },
    by: "global",
    since: "2026-09-10",
    group: "universal",
  },
  section_view: {
    desc: "A section entered the top 70 % of the viewport — once per section per pageview. The denominator for 'nobody opens this fold': not reached ≠ not interesting.",
    props: { section_id: "stable id, or `h:` + heading text when unnamed", id_source: "data | id | h2 | text", index: "section's order on the page" },
    by: "global",
    since: "2026-09-10",
    group: "universal",
  },
  details_toggle: {
    desc: "A fold (<details>) opened or closed. Before 2026-09-10 section_id was the (localised, count-bearing) summary text; now it is the enclosing section and fold_id names the fold.",
    props: { open: "true when opening", section_id: "enclosing section", id_source: "how section_id was found", fold_id: "V3Fold id / FicheMore noun slug / ExpandableList key", label: "summary text (human)", page: "pathname", source: "native_details | expandable_list" },
    by: "global",
    since: "2026-09-10",
    group: "universal",
  },
  link_click: {
    desc: "Any internal link (same origin, not an anchor, not a year picker). The universal 'where do people go next' event; nav_click, search_result_click, drawer_back are richer duplicates of some of these clicks — never add them together.",
    props: { href: "target path", to_pattern: "target page_pattern", to_family: "target family", to_kind: "target page_kind", to_entity_type: "target entity type", role: "nav | footer | crumb | row | door | next | hero | kicker | deck | marquee | chips | sentence | lead | hero_meta | foot | cta | <data-block> | body", section_id: "section the link sits in", in_fold: "true when inside an open fold", text: "link text (80 chars)" },
    by: "global",
    since: "2026-09-10",
    group: "universal",
  },
  external_link_click: {
    desc: "An outbound, mailto or tel link. role = source when the link cites a dataset (lead source line, foot note, sources section).",
    props: { url: "href", domain: "hostname or mailto/tel", text: "link text", source_page: "pathname", role: "source | body | …", section_id: "enclosing section", "x, y, x_pct…": "click coordinates" },
    by: "global",
    since: "2026-07-16",
    group: "universal",
  },
  toc_click: {
    desc: "A jump to a section from a page table of contents, the commune chips bar, or an inline anchor.",
    props: { section_id: "anchor", surface: "toc | chips | inline", page: "pathname" },
    by: "global",
    since: "2026-09-10",
    group: "universal",
  },
  cta_click: {
    desc: "A click on any element carrying data-cta.",
    props: { cta_id: "the data-cta value", source_page: "pathname", text: "label", section_id: "enclosing section" },
    by: "global",
    since: "2026-07-16",
    group: "universal",
  },
  year_change: {
    desc: "The reader picked another budget year (YearPicker component, the commune page's year menu, or a section hero's year menu).",
    props: { page: "pathname", year_from: "previous year", year_to: "chosen year", is_voted: "YearPicker only", is_preview: "YearPicker only", surface: "menu (commune page, section hero)" },
    by: "YearPicker, PageVilleClient, SectionHero",
    since: "2026-07-16",
    group: "universal",
  },
  share_click: {
    desc: "Share or copy-link on a drawer, the investments map, the commune page's headline figure, or a section's number or scene.",
    props: { method: "native | copy | twitter | linkedin | …", entity_type: "drawer entity, map_view, commune, section", object: "hero | scene id (section pages)", url: "shared URL" },
    by: "DetailDrawer, ProjectMap, PageVilleClient, ShareButton",
    since: "2026-07-16",
    group: "universal",
  },

  // ── drawer ──
  drawer_open: { desc: "An entity drawer opened (intercepting route).", props: { entity_type: "route word", url: "entity URL", has_parent: "opened from another drawer", parent_url: "the previous drawer" }, by: "DetailDrawer", since: "2026-07-16", group: "universal" },
  drawer_close: { desc: "The drawer was closed, and how (escape key, backdrop, button).", props: { entity_type: "", url: "", method: "esc | backdrop | button", dwell_ms: "time open" }, by: "DetailDrawer", since: "2026-07-16", group: "universal" },
  drawer_back: { desc: "Back to the previous drawer (pill).", props: { from_type: "", from_url: "", to_url: "" }, by: "DetailDrawer", since: "2026-07-16", group: "universal" },

  // ── search: the reader's own words vs our seeds ──
  search_modal_open: { desc: "The commune finder (⌘K / navbar) opened.", props: {}, by: "SearchModal", since: "2026-08-01", group: "search" },
  search_modal_query: { desc: "A typed commune query returned results (debounced). results_count = 0 is a commune we do not serve or a spelling we do not match.", props: { q_hash: "sha-256 prefix of the query, never the text", q_len: "characters", results_count: "hits", corpus: "fr_communes" }, by: "SearchModal", since: "2026-09-10", group: "search" },
  search_modal_select: { desc: "A commune chosen in the finder.", props: { slug: "", insee: "" }, by: "SearchModal", since: "2026-08-01", group: "search" },
  search_open: { desc: "A search field or modal was opened, before anything is typed. Tells how many people look for a place at all, and from which surface.", props: { corpus: "fr_communes | br_municipios", surface: "champ (inline field) | modal" }, by: "MunicipioSearch", since: "2026-09-18", group: "search" },
  search_query: { desc: "A typed query returned results, on a surface other than the France modal (the Brazil field today). results_count = 0 is what we cannot find — the signal that feeds synonyms.", props: { q_hash: "sha-256 prefix of the query, never the text", q_len: "characters", results_count: "hits", corpus: "which index was searched" }, by: "MunicipioSearch", since: "2026-09-18", group: "search" },
  search_submit: { desc: "A typed search in an explorer (marchés, subventions, SF contracts). Organic demand.", props: { page: "explorer id", q_hash: "hashed text", results_count: "", "len, word_count, has_digit": "query shape" }, by: "explorers", since: "2026-07-16", group: "search" },
  search_seed_click: { desc: "One of OUR suggested searches clicked. Prompt performance, not demand.", props: { page: "", seed: "the seed text" }, by: "explorers", since: "2026-07-16", group: "search" },
  search_result_click: { desc: "A result row of an explorer was opened.", props: { page: "", entity_id: "", entity_name: "", rank: "", theme: "" }, by: "explorers", since: "2026-07-16", group: "search" },
  load_more: { desc: "Next page of a long list.", props: { page: "", visible_before: "", visible_after: "" }, by: "QuiRecoitExplorer", since: "2026-07-16", group: "explorer" },
  filter_change: { desc: "A filter changed in an explorer or on the investments map.", props: { page: "", field: "", value: "" }, by: "explorers, ProjectMap", since: "2026-07-16", group: "explorer" },
  filter_reset: { desc: "All explorer filters cleared at once.", props: { page: "", source: "button | empty_state | stress_test" }, by: "explorers", since: "2026-07-16", group: "explorer" },


  // ── charts and maps ──
  chart_element_click: { desc: "A bar, segment, legend item, card or year bar clicked.", props: { chart: "chart id", page: "", "theme, slug, rank, entity_name, year…": "what was clicked" }, by: "StackedBarTheme, QuiRecoitExplorer, AnalysesClient, AnneesRail", since: "2026-07-16", group: "chart" },
  choropleth_click: { desc: "An arrondissement clicked on a choropleth.", props: { page: "", arr: "" }, by: "DistrictChoropleth", since: "2026-07-16", group: "map" },
  map_marker_click: { desc: "A project marker clicked on the investments map.", props: { page: "", entity_id: "", entity_type: "projet" }, by: "ProjectMap", since: "2026-07-16", group: "map" },
  stress_test_run: { desc: "The debt stress test run with parameters.", props: { "rate, years…": "scenario" }, by: "StressTest", since: "2026-07-16", group: "chart" },

  // ── chrome ──
  nav_click: { desc: "Top bar or footer link.", props: { href: "", label: "i18n key", surface: "nav | footer | brand | …", from: "pathname" }, by: "Navbar, SiteFooter", since: "2026-07-16", group: "chrome" },
  mobile_menu_toggle: { desc: "Burger opened/closed.", props: { open: "" }, by: "Navbar", since: "2026-07-16", group: "chrome" },
  scope_change: { desc: "City/scope dropdown used.", props: { action: "open | close | navigate | open_search", target: "", variant: "" }, by: "ScopeDropdown", since: "2026-07-16", group: "chrome" },
  lang_switch: { desc: "The FR/EN language toggle was used.", props: { from: "", to: "" }, by: "LangSwitcher", since: "2026-07-16", group: "chrome" },
  for_cities_view: { desc: "/pour-les-villes opened.", props: {}, by: "ForCitiesClient", since: "2026-08-20", group: "chrome" },
  for_cities_read: { desc: "Still on /pour-les-villes after 30 s.", props: { dwell_seconds: "" }, by: "ForCitiesClient", since: "2026-08-20", group: "chrome" },

  // ── chat ──
  chat_chips_shown: { desc: "One draw of suggestion chips actually seen (panel open, empty state).", props: { scope: "", section: "", locale: "", chips: "[{id, pos, family}]" }, by: "ChatPanel", since: "2026-09-09", group: "chat" },
  chat_question: { desc: "One per answer, sent when the stream ends. origin = typed is organic demand; suggestion / followup / page_chip measure our prompts.", props: { scope: "", origin: "typed | suggestion | followup | page_chip", locale: "", question: "text (500 chars)", turn: "", tools: "", n_tool_calls: "0 = answered without data", answer_chars: "", error: "", aborted: "", duration_ms: "", page: "", chip_id: "suggestion only", chip_pos: "0-3 | teaser", chip_family: "" }, by: "ChatPanel", since: "2026-09-09", group: "chat" },
  alert_submit: { desc: "The « Prévenez-moi » block at the foot of a section page was submitted (before the server answers).", props: { section: "budget | marches | investissements | subventions | logement | dette" }, by: "DataAlert", since: "2026-09-16", group: "chrome" },
  alert_sent: { desc: "The confirmation mail left (or, off production, was accepted in test mode). Confirmed ÷ sent = the double opt-in rate, read on /abonnement pageviews.", props: { section: "", dev_mode: "true off production: nothing was sent" }, by: "DataAlert", since: "2026-09-16", group: "chrome" },
  alert_error: { desc: "The block could not send: bad address, service not configured, network.", props: { section: "", error: "invalid_email | not_configured | send_failed | network | unknown" }, by: "DataAlert", since: "2026-09-16", group: "chrome" },

  // ── GPU city ──
  city_gl_boot: { desc: "The 3D city (SF the-city) finished booting.", props: { backend: "webgpu | webgl", "…": "device facts" }, by: "CityGLMap", since: "2026-09-01", group: "gpu" },
  city_gl_degrade: { desc: "A slow GPU dropped a quality rung.", props: { rung: "", median_ms: "", backend: "" }, by: "CityGLMap", since: "2026-09-01", group: "gpu" },
};

export const EVENT_NAMES = Object.keys(EVENTS);

/** Properties stamped on EVERY event by AnalyticsProvider (page-context.ts). */
export const PAGE_CONTEXT_PROPS = [
  "page_country",
  "page_tier",
  "page_city",
  "page_family",
  "page_kind",
  "page_entity_type",
  "page_pattern",
  "page_locale",
  "page_surface",
] as const;
