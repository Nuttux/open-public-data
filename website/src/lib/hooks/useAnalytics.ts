'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COOKIE_NAME = '_dl_vid';
const OPTOUT_COOKIE = '_dl_optout';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 395; // 13 months
const FLUSH_INTERVAL_MS = 3_000;
const ENDPOINT = '/api/ev';
const MAX_BATCH_SIZE = 50;

export const KNOWN_EVENTS = new Set([
  // auto
  'session_start',
  'page_view',
  'page_exit',
  'scroll_depth',
  // chrome
  'nav_click',
  'toc_click',
  'scope_change',
  'lang_switch',
  'mobile_menu_toggle',
  // selection
  'year_change',
  'tab_change',
  // drawer
  'drawer_open',
  'drawer_close',
  'drawer_back',
  // share
  'share_click',
  // viz
  'choropleth_click',
  'map_marker_click',
  'chart_element_click',
  'timeline_point_click',
  'sankey_node_click',
  // tools
  'stress_test_run',
  'city_compare_change',
  'ta_part_change',
  'logement_simulator_change',
  // filters / search
  'filter_change',
  'filter_reset',
  'search_submit',
  'search_seed_click',
  'search_result_click',
  'load_more',
  // disclosure
  'details_toggle',
  // outbound / CTA
  'external_link_click',
  'cta_click',
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

let _sessionId: string | null = null;
function getSessionId(): string {
  if (!_sessionId) _sessionId = crypto.randomUUID();
  return _sessionId;
}

// Monotonic per-session sequence counter for replay ordering
let _seq = 0;
function nextSeq(): number {
  return ++_seq;
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
  event_seq: number;
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
  viewport_height: number;
  screen_width: number;
  locale: string;
  properties: string;
}

// ---------------------------------------------------------------------------
// Enabled check
// ---------------------------------------------------------------------------

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const envFlag = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED;
  if (envFlag === 'false' || envFlag === '0') return false;
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

  if (navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
  } else {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Build event
// ---------------------------------------------------------------------------

function buildEvent(
  eventName: string,
  pathname: string,
  properties: Record<string, unknown> = {},
): AnalyticsEvent {
  const utm = getUtmParams();
  const sp = new URLSearchParams(window.location.search);
  return {
    event_id: crypto.randomUUID(),
    event_name: eventName,
    event_timestamp: new Date().toISOString(),
    event_seq: nextSeq(),
    visitor_id: getOrCreateVisitorId(),
    session_id: getSessionId(),
    page_path: pathname,
    page_tab: sp.get('tab') || null,
    referrer: document.referrer || null,
    utm_source: utm?.utm_source || null,
    utm_medium: utm?.utm_medium || null,
    utm_campaign: utm?.utm_campaign || null,
    device_type: window.innerWidth < 768 ? 'mobile' : 'desktop',
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
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
  const prevPathRef = useRef<string | null>(null);
  const pageEnteredAtRef = useRef<number>(Date.now());
  const sessionStartedRef = useRef(false);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollThresholdsRef = useRef<Set<number>>(new Set());
  const maxScrollRef = useRef<number>(0);

  const track = useCallback(
    (eventName: string, properties: Record<string, unknown> = {}) => {
      if (!isEnabled() || isOptedOut()) return;
      if (!KNOWN_EVENTS.has(eventName)) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[analytics] Unknown event: ${eventName}`);
        }
        return;
      }

      const event = buildEvent(eventName, pathname, properties);

      if (process.env.NODE_ENV === 'development') {
        console.log('[analytics]', eventName, properties);
      }

      buffer.push(event);
    },
    [pathname],
  );

  // session_start (once per tab)
  useEffect(() => {
    if (!isEnabled() || isOptedOut() || sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    track('session_start', { entry_page: pathname });
  }, [track, pathname]);

  // page_view + page_exit on route changes
  useEffect(() => {
    if (!isEnabled() || isOptedOut()) return;
    const search = typeof window !== 'undefined' ? window.location.search : '';
    const fullPath = pathname + search;
    if (prevPathRef.current === fullPath) return;

    // Emit page_exit for previous page
    if (prevPathRef.current !== null) {
      const dwell_ms = Date.now() - pageEnteredAtRef.current;
      const max_scroll = maxScrollRef.current;
      const event = buildEvent('page_exit', prevPathRef.current, {
        dwell_ms,
        max_scroll_percent: max_scroll,
      });
      buffer.push(event);
    }

    prevPathRef.current = fullPath;
    pageEnteredAtRef.current = Date.now();
    scrollThresholdsRef.current = new Set();
    maxScrollRef.current = 0;
    track('page_view');
  }, [pathname, track]);

  // Scroll depth tracking
  useEffect(() => {
    if (!isEnabled() || isOptedOut()) return;

    const thresholds = [25, 50, 75, 100];
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const percent = Math.round((scrollTop / docHeight) * 100);
      if (percent > maxScrollRef.current) maxScrollRef.current = percent;

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

  // Flush interval + unload + page_exit on close
  useEffect(() => {
    if (!isEnabled()) return;

    flushIntervalRef.current = setInterval(flush, FLUSH_INTERVAL_MS);

    const emitExit = () => {
      if (prevPathRef.current !== null) {
        const dwell_ms = Date.now() - pageEnteredAtRef.current;
        const event = buildEvent('page_exit', prevPathRef.current, {
          dwell_ms,
          max_scroll_percent: maxScrollRef.current,
          reason: 'unload',
        });
        buffer.push(event);
      }
    };

    const onUnload = () => {
      emitExit();
      flush();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, []);

  return track;
}

// ---------------------------------------------------------------------------
// Opt-out helpers
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
