'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COOKIE_NAME = '_dl_vid';       // visitor ID cookie
const OPTOUT_COOKIE = '_dl_optout';  // opt-out cookie
const COOKIE_MAX_AGE = 60 * 60 * 24 * 395; // 13 months in seconds
const FLUSH_INTERVAL_MS = 3_000;
const ENDPOINT = '/api/ev';
const MAX_BATCH_SIZE = 50;

const KNOWN_EVENTS = new Set([
  'session_start',
  'page_view',
  'scroll_depth',
  'tab_change',
  'year_change',
  'year_range_change',
  'nav_click',
  'glossary_open',
  'glossary_term_view',
  'glossary_section_toggle',
  'sankey_node_click',
  'sankey_drilldown',
  'drilldown_close',
  'chart_click',
  'donut_click',
  'treemap_click',
  'filter_change',
  'filter_reset',
  'table_sort',
  'table_paginate',
  'view_toggle',
  'map_view_toggle',
  'cta_click',
  'external_link_click',
]);

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, maxAge: number): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax; Secure`;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax; Secure`;
}

// ---------------------------------------------------------------------------
// Visitor & session IDs
// ---------------------------------------------------------------------------

function getOrCreateVisitorId(): string {
  const existing = getCookie(COOKIE_NAME);
  if (existing) return existing;
  const id = crypto.randomUUID();
  setCookie(COOKIE_NAME, id, COOKIE_MAX_AGE);
  return id;
}

// Session ID: unique per tab lifetime (module-level, not persisted)
let _sessionId: string | null = null;
function getSessionId(): string {
  if (!_sessionId) _sessionId = crypto.randomUUID();
  return _sessionId;
}

// ---------------------------------------------------------------------------
// Opt-out / GPC check
// ---------------------------------------------------------------------------

function isOptedOut(): boolean {
  if (getCookie(OPTOUT_COOKIE)) return true;
  if (typeof navigator !== 'undefined' && (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl) return true;
  return false;
}

// ---------------------------------------------------------------------------
// UTM extraction (once per session)
// ---------------------------------------------------------------------------

let _utmParams: { utm_source?: string; utm_medium?: string; utm_campaign?: string } | null = null;

function getUtmParams(): typeof _utmParams {
  if (_utmParams) return _utmParams;
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  _utmParams = {
    utm_source: params.get('utm_source') || undefined,
    utm_medium: params.get('utm_medium') || undefined,
    utm_campaign: params.get('utm_campaign') || undefined,
  };
  return _utmParams;
}

// ---------------------------------------------------------------------------
// Event type
// ---------------------------------------------------------------------------

export interface AnalyticsEvent {
  event_id: string;
  event_name: string;
  event_timestamp: string;
  visitor_id: string;
  session_id: string;
  page_path: string;
  page_tab: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device_type: string;
  viewport_width: number;
  screen_width: number;
  locale: string;
  properties: string; // JSON string
}

// ---------------------------------------------------------------------------
// Enabled check
// ---------------------------------------------------------------------------

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const envFlag = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED;
  if (envFlag === 'false' || envFlag === '0') return false;
  // In development, default to disabled unless explicitly enabled
  if (process.env.NODE_ENV === 'development' && envFlag !== 'true' && envFlag !== '1') return false;
  return true;
}

// ---------------------------------------------------------------------------
// Buffer & flush
// ---------------------------------------------------------------------------

const buffer: AnalyticsEvent[] = [];

function flush(): void {
  if (buffer.length === 0) return;
  const events = buffer.splice(0, MAX_BATCH_SIZE);
  const payload = JSON.stringify({ events });

  // Use sendBeacon if available (works during page unload)
  if (navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
  } else {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Silently fail — analytics should never break the app
    });
  }
}

// ---------------------------------------------------------------------------
// Build event
// ---------------------------------------------------------------------------

function buildEvent(
  eventName: string,
  pathname: string,
  searchParams: URLSearchParams,
  properties: Record<string, unknown> = {},
): AnalyticsEvent {
  const utm = getUtmParams();
  return {
    event_id: crypto.randomUUID(),
    event_name: eventName,
    event_timestamp: new Date().toISOString(),
    visitor_id: getOrCreateVisitorId(),
    session_id: getSessionId(),
    page_path: pathname,
    page_tab: searchParams.get('tab') || null,
    referrer: document.referrer || null,
    utm_source: utm?.utm_source || null,
    utm_medium: utm?.utm_medium || null,
    utm_campaign: utm?.utm_campaign || null,
    device_type: window.innerWidth < 768 ? 'mobile' : 'desktop',
    viewport_width: window.innerWidth,
    screen_width: screen.width,
    locale: navigator.language,
    properties: JSON.stringify(properties),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevPathRef = useRef<string | null>(null);
  const sessionStartedRef = useRef(false);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollThresholdsRef = useRef<Set<number>>(new Set());

  // track() — the main function exposed to components
  const track = useCallback(
    (eventName: string, properties: Record<string, unknown> = {}) => {
      if (!isEnabled() || isOptedOut()) return;
      if (!KNOWN_EVENTS.has(eventName)) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[analytics] Unknown event: ${eventName}`);
        }
        return;
      }

      const event = buildEvent(eventName, pathname, searchParams, properties);

      if (process.env.NODE_ENV === 'development') {
        console.log('[analytics]', eventName, event);
      }

      buffer.push(event);
    },
    [pathname, searchParams],
  );

  // Auto-track session_start (once per tab lifetime)
  useEffect(() => {
    if (!isEnabled() || isOptedOut() || sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    track('session_start', { entry_page: pathname });
  }, [track, pathname]);

  // Auto-track page_view on route changes
  useEffect(() => {
    if (!isEnabled() || isOptedOut()) return;
    const fullPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
    if (prevPathRef.current === fullPath) return;
    prevPathRef.current = fullPath;
    // Reset scroll thresholds on new page
    scrollThresholdsRef.current = new Set();
    track('page_view');
  }, [pathname, searchParams, track]);

  // Scroll depth tracking
  useEffect(() => {
    if (!isEnabled() || isOptedOut()) return;

    const thresholds = [25, 50, 75, 100];
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const percent = Math.round((scrollTop / docHeight) * 100);

      for (const t of thresholds) {
        if (percent >= t && !scrollThresholdsRef.current.has(t)) {
          scrollThresholdsRef.current.add(t);
          track('scroll_depth', { depth_percent: t });
        }
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname, track]);

  // Flush interval + unload handler
  useEffect(() => {
    if (!isEnabled()) return;

    flushIntervalRef.current = setInterval(flush, FLUSH_INTERVAL_MS);

    const onUnload = () => flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush(); // Flush remaining events on cleanup
    };
  }, []);

  return track;
}

// ---------------------------------------------------------------------------
// Opt-out helpers (for privacy page)
// ---------------------------------------------------------------------------

export function optOut(): void {
  setCookie(OPTOUT_COOKIE, '1', COOKIE_MAX_AGE);
  deleteCookie(COOKIE_NAME);
  buffer.length = 0;
}

export function optIn(): void {
  deleteCookie(OPTOUT_COOKIE);
}

export function isCurrentlyOptedOut(): boolean {
  return isOptedOut();
}
