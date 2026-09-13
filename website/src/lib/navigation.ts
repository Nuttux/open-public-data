"use client";

/**
 * Drop-in replacements for next/navigation's useRouter and usePathname that
 * speak LOGICAL paths (lib/urls.ts), so page code never handles the language:
 *
 *   usePathname()  → /france/paris/budget   (address: /fr/france/paris/budget)
 *   router.push('/france/lille') → /fr/france/lille for a French reader
 *
 * useAddressPathname() gives the real address when a component needs it (the
 * language switcher). Everything else re-exports next/navigation unchanged.
 */
import {
  usePathname as useNextPathname,
  useRouter as useNextRouter,
} from "next/navigation";
import { useMemo } from "react";
import { DEFAULT_LANG, type Lang, langOf, localize, toLogical } from "@/lib/urls";

export {
  notFound,
  permanentRedirect,
  redirect,
  useParams,
  useSearchParams,
  useSelectedLayoutSegment,
  useSelectedLayoutSegments,
} from "next/navigation";

/** The address as the browser shows it: /fr/france/paris/budget. */
export function useAddressPathname(): string {
  return useNextPathname() ?? "/";
}

/** The page's logical path: /france/paris/budget. */
export function usePathname(): string {
  return toLogical(useAddressPathname());
}

/** The reader's language, read from the address. */
export function useLang(): Lang {
  return langOf(useAddressPathname()) ?? DEFAULT_LANG;
}

type NextRouter = ReturnType<typeof useNextRouter>;

/** next/navigation's router, with logical paths localized on push, replace and prefetch. */
export function useRouter(): NextRouter {
  const router = useNextRouter();
  const lang = useLang();
  return useMemo(
    () => ({
      ...router,
      push: (href: string, options?: Parameters<NextRouter["push"]>[1]) => router.push(localize(href, lang), options),
      replace: (href: string, options?: Parameters<NextRouter["replace"]>[1]) =>
        router.replace(localize(href, lang), options),
      prefetch: (href: string, options?: Parameters<NextRouter["prefetch"]>[1]) =>
        router.prefetch(localize(href, lang), options),
    }),
    [router, lang],
  );
}
