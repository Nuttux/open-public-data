# Analytics setup — PostHog (EU region, CNIL-exemption mode)

Date : 2026-04-22

## Mode opératoire

Le site utilise **PostHog EU** en **mode exemption CNIL par défaut** (pas de
banner de cookies). Le replay de session est **opt-in** via un widget discret
dans le footer — révocable à tout moment.

Résumé des 3 niveaux de consentement :

| Niveau | Statut | Ce qui est tracké | Banner |
|---|---|---|---|
| Par défaut | Exemption CNIL | events custom + pageviews + scroll depth, visitor ID session-only (memory) | ❌ aucun |
| Opt-in replay (widget footer) | Consentement explicite | + session replay + visitor ID persistant (localStorage) | ❌ widget discret |
| Opt-out total (page confidentialité) | Refusé | rien n'est envoyé | ❌ toggle |

## Setup — Phase 1 : PostHog Cloud EU (free tier)

### 1. Créer un compte
1. Va sur <https://eu.posthog.com/signup>
2. Choisis **EU region** (Frankfurt) — important pour le RGPD
3. Crée un projet "France Open Data" (ou autre nom)

### 2. Récupérer la project API key
- Dans PostHog → Settings → Project → Project API Key
- Clé commence par `phc_...`

### 3. Configurer les env vars locales
Crée `.env.local` dans `website/` :

```bash
NEXT_PUBLIC_POSTHOG_KEY=phc_ta_cle_ici
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
```

### 4. Configurer sur Vercel (prod)
- Dashboard Vercel → Project → Settings → Environment Variables
- Ajouter les 2 vars **pour Production + Preview + Development**

### 5. Relancer le dev server
```bash
cd /Users/daniel/code/open-public-data/website
npm run dev
```

Ouvre <http://localhost:3000>. Dans PostHog → Events, tu dois voir les events
apparaître en temps réel.

## Setup — Phase 2 : Self-host Hetzner EU (plus tard)

Quand le trafic dépasse ~1M events/mois ou que tu veux 100% data ownership :

### Infrastructure
1. Commander un Hetzner CX22 (Falkenstein ou Nuremberg) — ~4 €/mois
2. Ubuntu 24.04, 4 GB RAM, 40 GB SSD

### Installation
```bash
ssh root@your-server
git clone https://github.com/PostHog/posthog.git /opt/posthog
cd /opt/posthog
./bin/deploy-hobby
```

PostHog génère un domaine auto-signé ; configure ton DNS pour
`posthog.your-domain.fr` et TLS via Caddy (inclus dans le deploy-hobby).

### Migration
- Change `NEXT_PUBLIC_POSTHOG_HOST=https://posthog.your-domain.fr`
- Récupère la nouvelle project API key
- Re-déploie Vercel
- (Optionnel) exporte les events Cloud vers self-host via CSV

## Événements captés (33 types)

Liste générée par notre instrumentation custom (voir
[docs/legacy-cleanup.md](./legacy-cleanup.md) pour l'historique) :

- **Auto** : `session_start`, `page_view`, `page_exit`, `scroll_depth`
- **Nav** : `nav_click`, `toc_click`, `scope_change`, `lang_switch`,
  `mobile_menu_toggle`
- **Sélection** : `year_change`, `tab_change`
- **Drawer** : `drawer_open`, `drawer_close`, `drawer_back`
- **Share** : `share_click`
- **Viz** : `choropleth_click`, `map_marker_click`, `chart_element_click`,
  `timeline_point_click`, `sankey_node_click`
- **Outils** : `stress_test_run`, `city_compare_change`, `ta_part_change`,
  `logement_simulator_change`
- **Filtres/search** : `filter_change`, `filter_reset`, `search_submit`,
  `search_seed_click`, `search_result_click`, `load_more`
- **Disclosure** : `details_toggle`
- **Outbound/CTA** : `external_link_click`, `cta_click`

## Mode RGPD par défaut

Configuration dans
[src/components/AnalyticsProvider.tsx](../website/src/components/AnalyticsProvider.tsx) :

```ts
posthog.init(KEY, {
  api_host: 'https://eu.i.posthog.com',
  persistence: 'memory',           // session-only, no persistent cookie
  disable_session_recording: true, // opt-in only
  capture_pageview: true,
  capture_pageleave: true,
  autocapture: false,              // we use precise custom events
  person_profiles: 'identified_only',
});
```

## Activer le replay (opt-in utilisateur)

L'utilisateur clique le bouton dans le footer :

> ○ Aider ce site : autoriser l'enregistrement anonyme · détails →

→ `enableReplay()` persiste le choix dans `localStorage`
(`_fod_replay_optin=1`), upgrade PostHog en `persistence: 'localStorage+cookie'`
et démarre `startSessionRecording()`.

Révocable depuis le même bouton ou depuis `/confidentialite`.

### Masking dans PostHog (à activer côté dashboard)

Dans PostHog → Settings → Session Replay :
1. ✅ Mask all inputs (sauf whitelist)
2. ✅ Mask all text (ou au moins les éléments `[data-private]`)
3. Rétention : 30 jours (default 30 jours OK)

Ajouter `data-private` sur tout élément qui pourrait contenir du PII
spécifique (on n'en a pas aujourd'hui sur le site public, mais bon réflexe).

## Export vers BigQuery (optionnel)

PostHog → Settings → Destinations → Add → BigQuery. Configure le service
account existant (`BIGQUERY_ANALYTICS_KEY`). Les events atterrissent dans
`posthog_events_export` (nom configurable).

Tu gardes ainsi BQ comme data warehouse pour croiser avec tes autres datasets
publics, et PostHog sert de UI ops temps réel.
