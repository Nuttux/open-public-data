'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { AnalyticsProvider as ContextProvider } from '@/lib/analyticsContext';
import { getClickCoords } from '@/lib/analytics-helpers';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
// Default to the same-origin reverse proxy (see next.config rewrites) so ad
// blockers can't drop events. Override with NEXT_PUBLIC_POSTHOG_HOST if needed.
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || '/ingest';

const REPLAY_OPTIN_KEY = '_fod_replay_optin';
const OPTOUT_KEY = '_fod_analytics_optout';

/**
 * Analytics wiring — PostHog (EU region), audience-measurement only.
 *
 * Defaults (no banner — CNIL audience-measurement exemption):
 *   - persistence: 'localStorage+cookie' — a random visitor ID kept 365 days
 *     in a first-party cookie (ph_<key>_posthog) + localStorage, so returning
 *     visitors and retention can be measured. No identify(), no person props.
 *   - capture_pageview: 'history_change' — Next.js client-side navigations
 *     count as pageviews (plain `true` only fires on the initial hard load).
 *   - disable_session_recording: true — replay only fires if user opts in
 *   - autocapture: false — we have precise custom events, don't double-fire
 *
 * Opt-in upgrades (via ReplayOptIn footer widget):
 *   - localStorage '_fod_replay_optin' = '1' → enables session recording.
 *     Revocable at any time.
 *
 * Opt-out:
 *   - cookie or localStorage '_fod_analytics_optout' = '1', or
 *     `navigator.globalPrivacyControl` → all tracking disabled, no events sent
 *     at all, stored visitor ID reset.
 *   - The cookie sits on the apex domain (.qipu.org) because the PostHog
 *     visitor cookie does too: one visitor ID spans www / fr / pt, so an
 *     opt-out kept only in per-origin localStorage let the same person keep
 *     sending from the next subdomain they opened.
 */

let initialized = false;

const OPTOUT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year, like the visitor cookie

/** `www.qipu.org` → `qipu.org`; null on localhost / an IP (host-only cookie). */
function apexDomain(): string | null {
  const h = window.location.hostname;
  if (h === 'localhost' || h.endsWith('.localhost') || /^[\d.]+$/.test(h)) return null;
  const parts = h.split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : null;
}

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** `maxAge` 0 deletes; the Domain attribute must match the write to delete. */
function writeCookie(name: string, value: string, maxAge: number) {
  const domain = apexDomain();
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}` +
    (domain ? `; Domain=.${domain}` : '');
}

function isOptedOut(): boolean {
  if (typeof window === 'undefined') return true;
  if ((navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl) return true;
  // The apex cookie is authoritative when present ('1' out, '0' explicitly
  // back in), so an opt-in made on one subdomain beats a stale localStorage
  // flag left on another. No cookie at all → the per-origin flag decides.
  try {
    const c = readCookie(OPTOUT_KEY);
    if (c === '1') return true;
    if (c === '0') return false;
  } catch {
    /* cookies disabled */
  }
  try {
    return localStorage.getItem(OPTOUT_KEY) === '1';
  } catch {
    return false;
  }
}

function hasReplayOptIn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(REPLAY_OPTIN_KEY) === '1';
  } catch {
    return false;
  }
}

function initPostHog() {
  if (initialized || typeof window === 'undefined' || !POSTHOG_KEY) return;
  if (isOptedOut()) return;
  initialized = true;

  const optedInReplay = hasReplayOptIn();

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: 'https://eu.posthog.com',
    persistence: 'localStorage+cookie',
    disable_session_recording: !optedInReplay,
    capture_pageview: 'history_change',
    capture_pageleave: true,
    autocapture: false,
    person_profiles: 'identified_only',
    opt_out_capturing_by_default: false,
    loaded: (ph) => {
      if (optedInReplay) ph.startSessionRecording();
    },
  });
}

/** one product event, for a component that has something to report —
 *  nothing personal in the properties, ever (the city page reports which
 *  GPU backend came up and whether a slow GPU gave up shadows) */
export function trackEvent(eventName: string, properties: Record<string, unknown> = {}) {
  track(eventName, properties);
}

function track(eventName: string, properties: Record<string, unknown> = {}) {
  if (typeof window === 'undefined' || !POSTHOG_KEY || isOptedOut()) return;
  if (!initialized) initPostHog();
  posthog.capture(eventName, properties);
}

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const origin = window.location.origin;

    const onClick = (ev: MouseEvent) => {
      const el = ev.target as HTMLElement | null;
      if (!el) return;

      const anchor = el.closest('a');
      if (anchor instanceof HTMLAnchorElement && anchor.href) {
        try {
          const u = new URL(anchor.href, origin);
          const isExternal =
            u.origin !== origin &&
            u.protocol !== 'javascript:' &&
            u.protocol !== 'mailto:' &&
            u.protocol !== 'tel:';
          if (isExternal) {
            track('external_link_click', {
              url: anchor.href,
              domain: u.hostname,
              text: anchor.textContent?.trim().slice(0, 80) || null,
              source_page: pathname,
              ...getClickCoords(ev),
            });
          } else if (u.protocol === 'mailto:' || u.protocol === 'tel:') {
            track('external_link_click', {
              url: anchor.href,
              domain: u.protocol.replace(':', ''),
              text: anchor.textContent?.trim().slice(0, 80) || null,
              source_page: pathname,
              ...getClickCoords(ev),
            });
          }
        } catch {
          /* bad URL — ignore */
        }
      }

      const cta = el.closest<HTMLElement>('[data-cta]');
      if (cta) {
        track('cta_click', {
          cta_id: cta.dataset.cta,
          source_page: pathname,
          text: cta.textContent?.trim().slice(0, 80) || null,
          ...getClickCoords(ev),
        });
      }
    };

    const onToggle = (ev: Event) => {
      const el = ev.target as HTMLDetailsElement | null;
      if (!el || el.tagName !== 'DETAILS') return;
      const summary = el.querySelector('summary');
      track('details_toggle', {
        page: pathname,
        open: el.open,
        section_id: el.id || summary?.textContent?.trim().slice(0, 80) || null,
        source: 'native_details',
      });
    };

    document.addEventListener('click', onClick, { capture: true });
    document.addEventListener('toggle', onToggle, { capture: true });
    return () => {
      document.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
      document.removeEventListener('toggle', onToggle, { capture: true } as EventListenerOptions);
    };
  }, [pathname]);

  return <ContextProvider value={track}>{children}</ContextProvider>;
}

// ---------------------------------------------------------------------------
// Replay opt-in control (exported for ReplayOptIn widget + /confidentialite)
// ---------------------------------------------------------------------------

export function isReplayOptedIn(): boolean {
  return hasReplayOptIn();
}

export function enableReplay() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(REPLAY_OPTIN_KEY, '1');
  } catch {
    /* storage disabled */
  }
  if (!initialized) initPostHog();
  posthog.startSessionRecording();
}

export function disableReplay() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(REPLAY_OPTIN_KEY, '0');
  } catch {
    /* storage disabled */
  }
  if (initialized) {
    posthog.stopSessionRecording();
  }
}

export function optOutAnalytics() {
  if (typeof window === 'undefined') return;
  try {
    writeCookie(OPTOUT_KEY, '1', OPTOUT_COOKIE_MAX_AGE);
  } catch {
    /* cookies disabled */
  }
  try {
    localStorage.setItem(OPTOUT_KEY, '1');
    localStorage.removeItem(REPLAY_OPTIN_KEY);
  } catch {
    /* storage disabled */
  }
  if (initialized) {
    posthog.stopSessionRecording();
    // Drop the stored visitor ID, then opt out (reset() also clears PostHog's
    // own consent flag, so the opt-out must come last).
    posthog.reset();
    posthog.opt_out_capturing();
  }
}

export function optInAnalytics() {
  if (typeof window === 'undefined') return;
  try {
    writeCookie(OPTOUT_KEY, '0', OPTOUT_COOKIE_MAX_AGE);
  } catch {
    /* cookies disabled */
  }
  try {
    localStorage.removeItem(OPTOUT_KEY);
  } catch {
    /* storage disabled */
  }
  if (initialized) {
    posthog.opt_in_capturing();
  }
}

export function isOptedOutAnalytics(): boolean {
  return isOptedOut();
}
