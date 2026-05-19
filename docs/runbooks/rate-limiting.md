# Runbook : rate limiting des routes API (cat. 4)

## Contexte

Le site expose plusieurs routes API (`/api/chat`, `/api/og-poster`, `/api/openfisca-calc`, `/api/search-communes`) qui sont **publiques** et peuvent être appelées sans authentification. La plus à risque économique est `/api/chat` qui consomme du quota Anthropic à chaque requête.

Sans rate limiting :
- Un user de mauvaise foi peut envoyer 100 requêtes/minute → facture Anthropic explose
- Un bot scraper peut DDoS l'API → site ralenti pour les vrais users
- Pas de protection contre le credential stuffing si un jour on ajoute de l'auth

## Statut actuel

**Pas de rate limiting actif**. PostHog observe les volumes en passant mais ne bloque rien.

## Stratégie recommandée

### Étape 1 — Rate limit `/api/chat` (priorité haute)

C'est la route qui coûte de l'argent réel à chaque appel.

**Choix d'implémentation** :

| Option | Avantage | Inconvénient |
|--------|----------|--------------|
| Vercel KV + `@upstash/ratelimit` | Multi-instance, persistant, free tier 10k commandes/jour | Demande compte Upstash + Vercel KV provisioning |
| Middleware Next.js + Map en mémoire | Zéro dépendance | Reset à chaque deploy / cold start, pas multi-instance |
| Vercel Edge Config | Plat, simple | Pas vraiment fait pour rate limiting |

**Recommandation : Vercel KV** (le plus propre et standard).

**Setup Vercel KV** :
1. Vercel dashboard → Storage → Create database → KV → free tier
2. Connecter au projet `open-public-data` → variables d'env `KV_REST_API_URL` + `KV_REST_API_TOKEN` injectées auto
3. `cd website && npm install @upstash/ratelimit @vercel/kv`
4. Créer `website/src/lib/ratelimit.ts` :

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { kv } from "@vercel/kv";

// 20 requêtes par 10 minutes par IP. Sliding window.
// Ajuster selon usage réel observé via PostHog.
export const chatRateLimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(20, "10 m"),
  analytics: true,
  prefix: "rl:chat",
});
```

5. Dans `website/src/app/api/chat/route.ts` (en haut de la fonction handler) :

```typescript
const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
const { success, limit, remaining, reset } = await chatRateLimit.limit(ip);
if (!success) {
  return new Response(JSON.stringify({ error: "rate limit exceeded" }), {
    status: 429,
    headers: {
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(reset),
      "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
      "Content-Type": "application/json",
    },
  });
}
```

**Validation** : depuis curl, faire 25 requêtes en 1 minute. Les 5 dernières doivent retourner 429.

### Étape 2 — Rate limit global plus relâché (optionnel)

Pour les autres routes API, un rate limit plus laxiste (100 req/min/IP) suffit.

Réutiliser le même `@upstash/ratelimit` avec un autre prefix :

```typescript
export const apiRateLimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  prefix: "rl:api",
});
```

À appliquer via `middleware.ts` à la racine du `website/src/` :

```typescript
import { NextResponse } from "next/server";
import { apiRateLimit } from "@/lib/ratelimit";

export async function middleware(req: Request) {
  if (!req.url.includes("/api/")) return NextResponse.next();
  if (req.url.includes("/api/chat")) return NextResponse.next(); // déjà ratelimited finer
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
  const { success } = await apiRateLimit.limit(ip);
  if (!success) return new NextResponse("rate limit", { status: 429 });
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
```

## Coûts estimés

- Vercel KV free tier : 30 MB de stockage + 10 k commandes/jour. Largement suffisant pour le volume actuel.
- Upstash payant si dépassement : ~5 €/mois pour 100 k commandes/jour.

## Pour faire de cette PR un statut "complete"

Ce runbook documente la stratégie. Pour la mettre en œuvre, suivi à faire (action user) :

- [ ] Provisioner Vercel KV (5 min)
- [ ] Implémenter `lib/ratelimit.ts` + branchement dans `/api/chat/route.ts` (30 min)
- [ ] Tester en local avec un script qui spam 30 requêtes (10 min)
- [ ] Étendre au middleware global (optionnel, 30 min)

## Voir aussi

- [`observability-setup.md`](observability-setup.md) — monitorer les 429 dans Sentry / logs
- Upstash Ratelimit docs : https://upstash.com/docs/oss/sdks/ts/ratelimit/overview
- Vercel KV : https://vercel.com/docs/storage/vercel-kv
