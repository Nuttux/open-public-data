"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/localeContext";

/**
 * Invisible companion for server-rendered bilingual pages.
 *
 * The FR/EN toggle (LangSwitcher) only flips the client-side locale context
 * and persists the `dl_locale` cookie — it never triggers a server round-trip.
 * That is enough for client components (they re-render from context), but a
 * page whose copy is rendered on the server (`readLocale()` + ternaries)
 * would keep showing the previous language until the next full navigation.
 *
 * This component bridges the two worlds: rendered (as null) inside a server
 * page, it watches the context locale and calls `router.refresh()` when it
 * changes. The cookie is written synchronously by `setLocale` before React
 * re-renders, so the refreshed RSC payload is produced with the new locale.
 * No-op on initial mount and on pages where the locale never changes.
 */
export default function LocaleRefresh() {
  const { locale } = useLocale();
  const router = useRouter();
  const prev = useRef(locale);

  useEffect(() => {
    if (prev.current !== locale) {
      prev.current = locale;
      router.refresh();
    }
  }, [locale, router]);

  return null;
}
