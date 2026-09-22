/**
 * Where analytics may be sent from.
 *
 * A dev server must not write into the production project. Between 11 and
 * 22 September 2026, 229 page views from localhost:3021, 3023 and 3031
 * reached it, most of them long enough and busy enough to pass as people —
 * they nearly doubled the "direct" visitors in the weekly reading.
 *
 * The rule: on a local address (localhost, *.localhost, an IP), send only
 * when the configured host is local too. That keeps the local sink of
 * ANALYTICS.md § « Verifying locally » working, and blocks the default
 * `/ingest`, which the dev server proxies to the real project.
 */

/** localhost, *.localhost (fr.localhost…), an IPv4 or an IPv6 address. */
export function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    /^[\d.]+$/.test(h) ||
    h.startsWith('[')
  );
}

/**
 * @param pageHostname  `window.location.hostname`
 * @param apiHost       PostHog's `api_host`: `/ingest` (same origin) or an absolute URL
 */
export function analyticsAllowed(pageHostname: string, apiHost: string): boolean {
  if (!isLocalHostname(pageHostname)) return true;
  // A relative host is this same dev server, which rewrites /ingest to the
  // production project (next.config.ts): that is exactly the leak.
  try {
    return isLocalHostname(new URL(apiHost).hostname);
  } catch {
    return false;
  }
}
