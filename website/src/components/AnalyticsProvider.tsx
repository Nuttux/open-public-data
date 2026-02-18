'use client';

import { Suspense } from 'react';
import { useAnalytics } from '@/lib/hooks/useAnalytics';
import { AnalyticsProvider as ContextProvider } from '@/lib/analyticsContext';

/**
 * Inner component that initializes analytics.
 * Wrapped in Suspense because useAnalytics uses useSearchParams().
 */
function AnalyticsInit({ children }: { children: React.ReactNode }) {
  const track = useAnalytics();
  return <ContextProvider value={track}>{children}</ContextProvider>;
}

/**
 * AnalyticsProvider — wraps the app to enable event tracking.
 *
 * Usage in layout.tsx:
 *   <AnalyticsProvider>
 *     <GlossaryShell>...</GlossaryShell>
 *   </AnalyticsProvider>
 */
export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <AnalyticsInit>{children}</AnalyticsInit>
    </Suspense>
  );
}
