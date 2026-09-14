'use client';

import { useEffect, useRef } from 'react';
import { useAddressPathname } from "@/lib/navigation";
import posthog from 'posthog-js';
import { AnalyticsProvider as ContextProvider } from '@/lib/analyticsContext';
import { getClickCoords } from '@/lib/analytics-helpers';
import { pageContext } from '@/lib/analytics/page-context';
import { foldIdFor, isSourceLink, linkRole, sectionIdFor } from '@/lib/analytics/dom';
import { isDrawerOpen } from '@/lib/drawerState';

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
 *   - capture_pageview: false — WE send $pageview from the pathname effect,
 *     after the page context is registered, so the first event of a page
 *     already carries page_pattern / page_kind… (PostHog's own
 *     'history_change' capture fires inside pushState, before React knows
 *     the new page, and would stamp the previous page's context).
 *
 * Page context (lib/analytics/page-context.ts): every event carries the same
 * facts about the page it was fired on — country, tier, city, family, kind,
 * entity type, route pattern, locale, surface (page or drawer). They are
 * computed fresh at capture time from window.location, and also registered
 * as super-properties for the events PostHog fires on its own ($pageleave,
 * $web_vitals).
 *
 * Universal instruments (this file, any page, no per-component code):
 *   $pageview · section_view (a section reached the top 70 % of the
 *   viewport) · details_toggle (a fold opened, with its section and fold id)
 *   · link_click (any internal link, with its role and destination pattern)
 *   · external_link_click · toc_click · cta_click. The catalog is
 *   lib/analytics/events.ts.
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
    capture_pageview: false,
    custom_blocked_useragents: ['lightpanda'],
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

/** The page facts stamped on every event — computed at capture time, because
 *  a child's effect (drawer_open) runs BEFORE this provider's pathname effect
 *  and would otherwise carry the previous page's registered context. */
function currentContext(): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  return {
    ...pageContext(window.location.pathname, document.documentElement.lang || ''),
    page_surface: isDrawerOpen() ? 'drawer' : 'page',
  };
}

function track(eventName: string, properties: Record<string, unknown> = {}) {
  if (typeof window === 'undefined' || !POSTHOG_KEY || isOptedOut()) return;
  if (!initialized) initPostHog();
  if (!initialized) return;
  posthog.capture(eventName, { ...currentContext(), ...properties });
}

/** Sections worth a reach event: every <section> and every named block. A
 *  drawer scrolls inside its own panel, so while one is open only ITS
 *  sections count (against the panel as root); otherwise only the page's,
 *  never the ones sitting behind a drawer. */
const SECTION_QUERY = 'section, [data-section]';

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  // The address, language included (/fr/france/lille): events keep the language the page was read in.
  const pathname = useAddressPathname();

  useEffect(() => {
    initPostHog();
  }, []);

  const lastPathRef = useRef<string | null>(null);
  // One $pageview per pathname, sent after the page context is registered.
  // The ref guards React's dev-only double effect and same-path re-renders;
  // a ?year= change on the same path is a year_change event, not a pageview.
  useEffect(() => {
    if (typeof window === 'undefined' || lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    if (!POSTHOG_KEY || isOptedOut()) return;
    if (!initialized) initPostHog();
    if (!initialized) return;
    posthog.register(currentContext());
    track('$pageview');
  }, [pathname]);

  // section_view — each section once per page, the first time its top is at
  // or above the 70 % line of the viewport: "reached" includes "scrolled
  // past" (the root is extended far upwards), so a jump to the bottom counts
  // every section on the way. Rescans twice after mount for content that
  // arrives late (drawers, client-fetched lists).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    const seen = new Set<string>();
    const observed = new WeakSet<Element>();
    let io: IntersectionObserver | null = null;
    let ioRoot: Element | null | undefined;
    const onEntries = (entries: IntersectionObserverEntry[]) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        io?.unobserve(el);
        const { id, source } = sectionIdFor(el);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        track('section_view', { section_id: id, id_source: source, index: Number(el.dataset.phIndex ?? -1) });
      }
    };
    const scan = () => {
      const drawer = isDrawerOpen() ? document.querySelector('.fx-drawer') : null;
      if (io && ioRoot !== drawer) {
        io.disconnect();
        io = null;
      }
      if (!io) {
        ioRoot = drawer;
        io = new IntersectionObserver(onEntries, { root: drawer, rootMargin: '10000px 0px -30% 0px', threshold: 0 });
      }
      const sections = document.querySelectorAll(SECTION_QUERY);
      sections.forEach((sec, i) => {
        if (observed.has(sec)) return;
        const inDrawer = Boolean(sec.closest('.fx-drawer'));
        if (drawer ? !inDrawer : inDrawer) return;
        observed.add(sec);
        (sec as HTMLElement).dataset.phIndex = String(i);
        io!.observe(sec);
      });
    };
    scan();
    const t1 = setTimeout(scan, 1000);
    const t2 = setTimeout(scan, 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      io?.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const origin = window.location.origin;
    const lang = () => document.documentElement.lang || '';

    const onClick = (ev: MouseEvent) => {
      const el = ev.target as HTMLElement | null;
      if (!el) return;

      const anchor = el.closest('a');
      if (anchor instanceof HTMLAnchorElement && anchor.href) {
        try {
          const u = new URL(anchor.href, origin);
          const section = sectionIdFor(anchor);
          const text = anchor.textContent?.trim().slice(0, 80) || null;
          const isExternal =
            u.origin !== origin &&
            u.protocol !== 'javascript:' &&
            u.protocol !== 'mailto:' &&
            u.protocol !== 'tel:';
          if (isExternal) {
            track('external_link_click', {
              url: anchor.href,
              domain: u.hostname,
              text,
              role: isSourceLink(anchor) ? 'source' : linkRole(anchor),
              section_id: section.id,
              source_page: pathname,
              ...getClickCoords(ev),
            });
          } else if (u.protocol === 'mailto:' || u.protocol === 'tel:') {
            track('external_link_click', {
              url: anchor.href,
              domain: u.protocol.replace(':', ''),
              text,
              role: linkRole(anchor),
              section_id: section.id,
              source_page: pathname,
              ...getClickCoords(ev),
            });
          } else if (u.hash && u.pathname === window.location.pathname && !u.search) {
            // A jump inside the page: page TOC, commune chips bar, inline anchor.
            track('toc_click', {
              section_id: u.hash.slice(1),
              surface: anchor.closest('.fx-page-toc') ? 'toc' : anchor.closest('.fx-pv-toc') ? 'chips' : 'inline',
              page: pathname,
            });
          } else if (anchor.closest('.fx-year-picker')) {
            // The YearPicker component reports its own year_change (with the
            // voted / preview flags); the year menus too.
          } else if (u.protocol === 'http:' || u.protocol === 'https:') {
            const to = pageContext(u.pathname, lang());
            track('link_click', {
              href: u.pathname,
              to_pattern: to.page_pattern,
              to_family: to.page_family,
              to_kind: to.page_kind,
              to_entity_type: to.page_entity_type,
              role: linkRole(anchor),
              section_id: section.id,
              in_fold: Boolean(anchor.closest('details[open]')),
              text,
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
          section_id: sectionIdFor(cta).id,
          ...getClickCoords(ev),
        });
      }
    };

    const onToggle = (ev: Event) => {
      const el = ev.target as HTMLDetailsElement | null;
      if (!el || el.tagName !== 'DETAILS') return;
      const summary = el.querySelector('summary');
      const section = sectionIdFor(el);
      track('details_toggle', {
        page: pathname,
        open: el.open,
        section_id: section.id,
        id_source: section.source,
        fold_id: foldIdFor(el),
        label: summary?.textContent?.trim().slice(0, 80) || null,
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
