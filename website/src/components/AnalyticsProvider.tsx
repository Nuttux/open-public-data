'use client';

import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { AnalyticsProvider as ContextProvider } from '@/lib/analyticsContext';

/**
 * AnalyticsProvider — wraps the app to enable event tracking.
 *
 * Usage in layout.tsx:
 *   <AnalyticsProvider>
 *     <GlossaryShell>...</GlossaryShell>
 *   </AnalyticsProvider>
 */
export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const track = useAnalytics();
  return <ContextProvider value={track}>{children}</ContextProvider>;
}
