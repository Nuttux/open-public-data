'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { AnalyticsProvider as ContextProvider } from '@/lib/analyticsContext';
import { getClickCoords } from '@/lib/analytics-helpers';

/**
 * AnalyticsProvider — wraps the app to enable event tracking + attaches
 * delegated global listeners that capture interactions we don't want to wire
 * by hand across 30+ files:
 *
 *   - external_link_click — any outbound <a target="_blank"> anywhere
 *   - details_toggle      — any native <details>/<summary>
 *   - cta_click           — any <a>/<button> with data-cta attribute
 */
export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const track = useAnalytics();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const origin = window.location.origin;

    const onClick = (ev: MouseEvent) => {
      const el = ev.target as HTMLElement | null;
      if (!el) return;

      // External links
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

      // data-cta markers — explicit CTA flag set by components
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
  }, [track, pathname]);

  return <ContextProvider value={track}>{children}</ContextProvider>;
}
