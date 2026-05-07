/**
 * Sentry client-side config — captures runtime JS errors in the browser.
 *
 * Active uniquement si NEXT_PUBLIC_SENTRY_DSN est set (prod). En dev,
 * pas de DSN → Sentry no-op silencieusement, pas de bruit.
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,

    // Performance monitoring : sample 10% des transactions en prod pour
    // garder un dashboard utilisable sans saturer le quota free tier.
    tracesSampleRate: 0.1,

    // Replay session : opt-in seulement (cf /confidentialite). On capte
    // uniquement les sessions qui ont une erreur, pour debug.
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.1,

    // Ne pas envoyer les events depuis localhost / preview deploys par
    // défaut, pour ne pas polluer le dashboard prod.
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",
    enabled: process.env.NEXT_PUBLIC_VERCEL_ENV === "production",

    // Filter le bruit : erreurs réseau transitoires, extensions navigateur,
    // tiers (PostHog/Vercel), bots — pas notre code.
    ignoreErrors: [
      // Browser extensions
      /chrome-extension:\/\//,
      /moz-extension:\/\//,
      // Network noise
      "Network request failed",
      "Load failed",
      "NetworkError",
      // Third-party SDKs we don't control
      /posthog/i,
      // Common React hydration noise (separately tracked)
      "Hydration failed",
    ],
  });
}
