# Runbook : setup observabilité (cat. 3)

## Contexte

Sans télémétrie en prod, un export pipeline cassé ou une page qui plante reste **invisible jusqu'à ce qu'un user râle**. Pour un service à vocation publique, c'est inacceptable.

Ce runbook liste les outils à câbler, classés par priorité, avec instructions step-by-step pour créer les comptes et configurer les clés.

## Statut actuel

| Outil | Statut | PR / Config |
|-------|--------|-------------|
| **Vercel Speed Insights** | ✅ activé | cette PR (`@vercel/speed-insights` + `<SpeedInsights />` dans layout) |
| **Vercel Analytics** | ✅ activé | cette PR (`@vercel/analytics` + `<Analytics />` dans layout) |
| **PostHog (mesure d'audience CNIL-exempt)** | ✅ déjà actif | `AnalyticsProvider.tsx` (cf [`/confidentialite`](../../website/src/app/confidentialite/)) |
| Sentry front | ❌ TODO | voir étape 1 ci-dessous |
| Sentry back / pipeline | ❌ TODO | voir étape 2 |
| Uptime monitoring | ❌ TODO | voir étape 3 |
| Status page publique | ❌ TODO | voir étape 4 |
| Logs centralisés | ❌ TODO | voir étape 5 |
| Plausible (alternative PostHog) | non requis | redondant avec PostHog mode privacy |

## Étape 1 — Sentry frontend (priorité haute, ~30 min)

**Pourquoi** : capter les erreurs JS qui plantent silencieusement chez l'utilisateur (TypeError, fetch fail, hydration mismatch). Sans ça, un bug de rendu sur Safari iOS reste invisible jusqu'à signalement.

**Setup** :
1. Créer un compte sur https://sentry.io (free tier : 5 k events/mois — largement suffisant)
2. Créer un projet → choisir "Next.js"
3. Récupérer le DSN (format `https://xxx@oXXX.ingest.sentry.io/XXX`)
4. `cd website && npx @sentry/wizard@latest -i nextjs` — l'installer interactif Sentry crée `sentry.client.config.ts` + `sentry.server.config.ts` + ajoute la config à `next.config.ts`
5. Ajouter `SENTRY_AUTH_TOKEN` et `NEXT_PUBLIC_SENTRY_DSN` dans `website/.env.example`
6. Côté Vercel dashboard → Settings → Environment Variables → ajouter ces 2 vars (prod + preview)

**Validation** : déclencher une erreur volontaire dans une page de test, vérifier qu'elle apparaît dans le dashboard Sentry sous 1 minute.

## Étape 2 — Sentry pipeline Python (priorité haute, ~20 min)

**Pourquoi** : un script de sync qui crash silencieusement à 3h du matin n'est jamais détecté. Avec Sentry, l'exception remonte avec stack trace + variables locales.

**Setup** :
1. Réutiliser le compte Sentry de l'étape 1
2. Créer un second projet → choisir "Python"
3. Récupérer le DSN
4. Ajouter `pipeline/.env.example` la var `SENTRY_DSN_PIPELINE`
5. Dans `pipeline/scripts/_init.py` (créer si absent) :
   ```python
   import os, sentry_sdk
   if dsn := os.environ.get("SENTRY_DSN_PIPELINE"):
       sentry_sdk.init(dsn=dsn, traces_sample_rate=0.1, environment="prod")
   ```
6. Ajouter `sentry-sdk` à `requirements.txt`
7. Dans Github Actions `enrich-pipeline.yml`, ajouter `SENTRY_DSN_PIPELINE` aux secrets et au step `env:`

**Validation** : `raise RuntimeError("test")` dans un script, vérifier remontée dans Sentry.

## Étape 3 — Uptime monitoring (priorité haute, ~15 min)

**Pourquoi** : si Vercel tombe ou si une route renvoie 500 systématiquement, on veut être prévenu en push notif / SMS, pas via un user qui se plaint.

**Choix outil** : Better Stack (https://betterstack.com) — free tier 10 monitors, alerting email + Slack + push.

**Setup** :
1. Créer compte Better Stack
2. New monitor → URL : `https://franceopendata.org` (HEAD request, every 1 min)
3. Ajouter 3 monitors supplémentaires sur les pages clés :
   - `https://franceopendata.org/ville/paris/budget`
   - `https://franceopendata.org/ville/paris/marches`
   - `https://franceopendata.org/ville/paris/subventions`
4. Configurer alerte → email + Slack (créer canal `#opd-alerts` si Slack)
5. Threshold : alerte après 2 échecs consécutifs, escalade après 5 min

**Validation** : faire `vercel rollback` vers une version 404, vérifier l'alerte arrive en ≤ 3 min.

## Étape 4 — Status page publique (priorité moyenne, ~15 min)

**Pourquoi** : crédibilité côté décideur public. Un site officiel a une status page. Un blog perso n'en a pas.

**Setup** : Better Stack inclut une status page gratuite, alimentée par les monitors de l'étape 3.
1. Better Stack dashboard → Status pages → New
2. URL : `status.franceopendata.org` (CNAME à ajouter chez NameCheap)
3. Branding : ajouter logo (cohérent footer du site)
4. Ajouter section "Composants" :
   - Site web (lié au monitor `/`)
   - Pipeline data (manuel — toggle quand un import casse)
   - API chat (lié au monitor `/api/chat`)

**Validation** : visiter `status.franceopendata.org`, voir 4 composants verts.

## Étape 5 — Logs centralisés (priorité basse, ~30 min)

**Pourquoi** : Vercel garde les logs 1 h en free tier. Pour debug un incident d'il y a 2 jours, il faut un log archive externe.

**Choix outil** : Axiom (https://axiom.co) — free tier 0.5 GB/mois (suffisant pour le volume actuel). Alternative : Logtail (Better Stack), Datadog (cher).

**Setup Vercel → Axiom** :
1. Créer compte Axiom
2. New dataset → name `vercel-logs`
3. Récupérer API token Axiom
4. Côté Vercel dashboard → Settings → Log Drains → Add Drain → Type "Axiom" → coller token
5. Tous les logs Vercel arrivent automatiquement dans Axiom, recherchables par requête APL

**Validation** : faire un `console.log("test-axiom")` dans une route API, vérifier qu'il apparaît dans Axiom sous 1 min.

## Vue d'ensemble — coût mensuel estimé

| Outil | Free tier suffisant ? | Coût si dépassement |
|-------|----------------------|---------------------|
| Vercel Speed Insights | oui (intégré au plan Vercel) | inclus |
| Vercel Analytics | oui | inclus |
| Sentry (1 compte 2 projets) | 5 k events/mois | $26/mois si > 5 k |
| Better Stack (uptime + status page) | 10 monitors | $25/mois si plus |
| Axiom (logs) | 0.5 GB/mois | $25/mois si plus |
| **Total prévu** | **0 €/mois** | jusqu'à $76/mois si scale |

Pour un projet en phase grant / PoC, le free tier de tous ces outils suffit largement. À reconsidérer si SaaS B2B avec >10k users actifs.

## Voir aussi

- [`rollback.md`](rollback.md) — quoi faire quand l'observabilité te dit que la prod est cassée
- [`source-correction-retroactive.md`](source-correction-retroactive.md) — corrections rétroactives de données
- Vercel Speed Insights : https://vercel.com/docs/speed-insights
- Sentry Next.js : https://docs.sentry.io/platforms/javascript/guides/nextjs/
- Better Stack : https://betterstack.com/uptime
- Axiom Vercel integration : https://axiom.co/docs/integrations/vercel
