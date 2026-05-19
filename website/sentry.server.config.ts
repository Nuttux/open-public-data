/**
 * Sentry server-side config — captures errors from Next.js route handlers
 * (e.g. /api/chat, /api/og-poster) and server components.
 *
 * Active uniquement si SENTRY_DSN est set (prod). Sentry server vit côté
 * serveur uniquement, donc pas de NEXT_PUBLIC_ prefix.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV || "development",
    enabled: process.env.VERCEL_ENV === "production",
  });
}
