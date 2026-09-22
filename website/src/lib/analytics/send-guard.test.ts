import { describe, expect, it } from 'vitest';
import { analyticsAllowed, isLocalHostname } from './send-guard';

describe('isLocalHostname', () => {
  it.each(['localhost', 'fr.localhost', 'pt.localhost', '127.0.0.1', '192.168.1.24', '[::1]'])('%s is local', (h) => {
    expect(isLocalHostname(h)).toBe(true);
  });
  it.each(['www.qipu.org', 'fr.qipu.org', 'qipu.org', 'open-public-data-git-x.vercel.app'])('%s is not', (h) => {
    expect(isLocalHostname(h)).toBe(false);
  });
});

describe('analyticsAllowed', () => {
  it('sends from production hosts, whatever the api host', () => {
    expect(analyticsAllowed('www.qipu.org', '/ingest')).toBe(true);
    expect(analyticsAllowed('fr.qipu.org', 'https://eu.i.posthog.com')).toBe(true);
  });

  it('leaves previews as they were', () => {
    expect(analyticsAllowed('open-public-data-git-x.vercel.app', '/ingest')).toBe(true);
  });

  it('blocks a dev server that would reach the real project', () => {
    // the default: /ingest on the dev server is proxied to eu.i.posthog.com
    expect(analyticsAllowed('localhost', '/ingest')).toBe(false);
    expect(analyticsAllowed('fr.localhost', '/ingest')).toBe(false);
    expect(analyticsAllowed('192.168.1.24', '/ingest')).toBe(false);
    expect(analyticsAllowed('localhost', 'https://eu.i.posthog.com')).toBe(false);
  });

  it('keeps the local sink of ANALYTICS.md working', () => {
    expect(analyticsAllowed('localhost', 'http://localhost:3099')).toBe(true);
    expect(analyticsAllowed('fr.localhost', 'http://127.0.0.1:3099')).toBe(true);
  });

  it('refuses a host it cannot read', () => {
    expect(analyticsAllowed('localhost', '')).toBe(false);
  });
});
