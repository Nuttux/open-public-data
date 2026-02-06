'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * Hook to sync tab state with URL query parameter `?tab=xxx`.
 * Enables direct linking and bookmarking of specific tabs.
 *
 * @param defaultTab - Default tab ID when no `?tab=` param is present
 * @param validTabs - Optional list of valid tab IDs (guards against invalid URLs)
 * @returns [activeTab, setActiveTab]
 */
export function useTabState(
  defaultTab: string,
  validTabs?: string[]
): [string, (tab: string) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = useMemo(() => {
    const param = searchParams.get('tab');
    if (!param) return defaultTab;
    if (validTabs && !validTabs.includes(param)) return defaultTab;
    return param;
  }, [searchParams, defaultTab, validTabs]);

  const setActiveTab = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === defaultTab) {
        params.delete('tab');
      } else {
        params.set('tab', tab);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [searchParams, pathname, router, defaultTab]
  );

  return [activeTab, setActiveTab];
}
