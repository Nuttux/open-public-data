'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * Hook to sync year state with URL query parameter `?year=XXXX`.
 * Enables direct linking and bookmarking of specific year views.
 *
 * Coexists with useTabState (?tab=xxx&year=2024).
 *
 * @param defaultYear - Default year when no `?year=` param is present
 * @returns [year, setYear]
 */
export function useYearParam(
  defaultYear: number,
): [number, (year: number) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const year = useMemo(() => {
    const param = searchParams.get('year');
    if (!param) return defaultYear;
    const parsed = parseInt(param, 10);
    if (isNaN(parsed) || parsed < 2000 || parsed > 2100) return defaultYear;
    return parsed;
  }, [searchParams, defaultYear]);

  const setYear = useCallback(
    (y: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (y === defaultYear) {
        params.delete('year');
      } else {
        params.set('year', String(y));
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [searchParams, pathname, router, defaultYear],
  );

  return [year, setYear];
}
