/**
 * Sentry edge runtime config — captures errors from Next.js middleware
 * and edge route handlers running at the CDN edge (Cloudflare-like).
 *
 * Mêmes règles que server config — active si SENTRY_DSN set en prod.
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
