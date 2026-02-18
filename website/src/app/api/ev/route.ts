import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

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

const MAX_EVENTS_PER_REQUEST = 100;
const MAX_PAYLOAD_BYTES = 100_000; // 100 KB

// ---------------------------------------------------------------------------
// BigQuery client (lazy singleton)
// ---------------------------------------------------------------------------

let _bq: BigQuery | null = null;

function getBigQuery(): BigQuery | null {
  if (_bq) return _bq;

  const keyBase64 = process.env.BIGQUERY_ANALYTICS_KEY;
  if (!keyBase64) {
    console.warn('[analytics] BIGQUERY_ANALYTICS_KEY not set — events will be dropped');
    return null;
  }

  try {
    const credentials = JSON.parse(Buffer.from(keyBase64, 'base64').toString('utf-8'));
    _bq = new BigQuery({
      projectId: process.env.BIGQUERY_ANALYTICS_PROJECT || 'open-data-france-484717',
      credentials,
    });
    return _bq;
  } catch (err) {
    console.error('[analytics] Failed to parse BigQuery credentials:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// IP truncation
// ---------------------------------------------------------------------------

function truncateIp(ip: string): string {
  // IPv4: zero last octet
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = '0';
      return parts.join('.');
    }
  }
  // IPv6: zero last 2 groups
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 2) {
      parts[parts.length - 1] = '0';
      parts[parts.length - 2] = '0';
      return parts.join(':');
    }
  }
  return ip;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface ClientEvent {
  event_id?: string;
  event_name?: string;
  event_timestamp?: string;
  visitor_id?: string;
  session_id?: string;
  page_path?: string;
  page_tab?: string | null;
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  device_type?: string;
  viewport_width?: number;
  screen_width?: number;
  locale?: string;
  properties?: string;
}

function isValidEvent(e: ClientEvent): boolean {
  if (!e || typeof e !== 'object') return false;
  if (!e.event_name || !KNOWN_EVENTS.has(e.event_name)) return false;
  if (!e.event_id || typeof e.event_id !== 'string') return false;
  if (!e.page_path || typeof e.page_path !== 'string') return false;
  return true;
}

// ---------------------------------------------------------------------------
// Rate limiting (simple in-memory, resets on cold start)
// ---------------------------------------------------------------------------

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count++;
  // Max 30 requests per minute per IP
  return entry.count > 30;
}

// Periodic cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 60_000);

// ---------------------------------------------------------------------------
// POST /api/ev
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // Check content length
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_PAYLOAD_BYTES) {
      return new NextResponse(null, { status: 413 });
    }

    // Rate limit
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (isRateLimited(ip)) {
      return new NextResponse(null, { status: 429 });
    }

    // Parse body
    const body = await request.json();
    const events: ClientEvent[] = body?.events;
    if (!Array.isArray(events) || events.length === 0) {
      return new NextResponse(null, { status: 400 });
    }
    if (events.length > MAX_EVENTS_PER_REQUEST) {
      return new NextResponse(null, { status: 400 });
    }

    // Validate & enrich
    const now = new Date().toISOString();
    const country = request.headers.get('x-vercel-ip-country') || null;
    const city = request.headers.get('x-vercel-ip-city') || null;
    const ipTruncated = truncateIp(ip);

    const rows = events
      .filter(isValidEvent)
      .map((e) => ({
        event_id: e.event_id,
        event_name: e.event_name,
        event_timestamp: e.event_timestamp || now,
        received_at: now,
        visitor_id: e.visitor_id || null,
        session_id: e.session_id || null,
        page_path: e.page_path,
        page_tab: e.page_tab || null,
        referrer: e.referrer || null,
        utm_source: e.utm_source || null,
        utm_medium: e.utm_medium || null,
        utm_campaign: e.utm_campaign || null,
        device_type: e.device_type || null,
        viewport_width: e.viewport_width || null,
        screen_width: e.screen_width || null,
        user_agent: request.headers.get('user-agent') || null,
        locale: e.locale || null,
        country,
        city,
        ip_truncated: ipTruncated,
        properties: e.properties || '{}',
      }));

    if (rows.length === 0) {
      return new NextResponse(null, { status: 204 });
    }

    // Write to BigQuery
    const bq = getBigQuery();
    if (bq) {
      const dataset = process.env.BIGQUERY_ANALYTICS_DATASET || 'product_analytics';
      try {
        await bq.dataset(dataset).table('events').insert(rows);
      } catch (err: unknown) {
        // Log but don't fail the response — analytics should never break the app
        const error = err as { errors?: unknown[] };
        console.error('[analytics] BigQuery insert error:', JSON.stringify(error.errors || err));
      }
    } else if (process.env.NODE_ENV === 'development') {
      console.log('[analytics] Would write to BigQuery:', JSON.stringify(rows, null, 2));
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}

// Ensure this runs on Node.js runtime (not Edge) for BigQuery SDK compatibility
export const runtime = 'nodejs';
