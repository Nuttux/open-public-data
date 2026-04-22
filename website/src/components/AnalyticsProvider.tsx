'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { AnalyticsProvider as ContextProvider } from '@/lib/analyticsContext';
import { getClickCoords } from '@/lib/analytics-helpers';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

const REPLAY_OPTIN_KEY = '_fod_replay_optin';
const OPTOUT_KEY = '_fod_analytics_optout';

/**
 * Analytics wiring — PostHog (EU region) in CNIL-exemption mode by default.
 *
 * Defaults (no banner required):
 *   - persistence: 'memory' — session-scoped visitor ID, cleared on tab close
 *   - disable_session_recording: true — replay only fires if user opts in
 *   - autocapture: false — we have precise custom events, don't double-fire
 *
 * Opt-in upgrades (via ReplayOptIn footer widget):
 *   - localStorage '_fod_replay_optin' = '1' → enables session recording +
 *     persistent visitor ID (localStorage). Revocable at any time.
 *
 * Opt-out:
 *   - localStorage '_fod_analytics_optout' = '1' or `navigator.globalPrivacyControl`
 *     → all tracking disabled, no events sent at all.
 */

let initialized = false;

function isOptedOut(): boolean {
  if (typeof window === 'undefined') return true;
  if ((navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl) return true;
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
    persistence: optedInReplay ? 'localStorage+cookie' : 'memory',
    disable_session_recording: !optedInReplay,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
    person_profiles: 'identified_only',
    opt_out_capturing_by_default: false,
    loaded: (ph) => {
      if (optedInReplay) ph.startSessionRecording();
    },
  });
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
  posthog.set_config({ persistence: 'localStorage+cookie' });
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
    posthog.set_config({ persistence: 'memory' });
  }
}

export function optOutAnalytics() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OPTOUT_KEY, '1');
    localStorage.removeItem(REPLAY_OPTIN_KEY);
  } catch {
    /* storage disabled */
  }
  if (initialized) {
    posthog.opt_out_capturing();
    posthog.stopSessionRecording();
  }
}

export function optInAnalytics() {
  if (typeof window === 'undefined') return;
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
