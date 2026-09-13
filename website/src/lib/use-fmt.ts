"use client";

/**
 * Client-side formatting hooks. One home for the `fmtEur`/`locStr` idiom that
 * was previously re-declared inline in every fiche and hub client.
 */

import { useMemo } from "react";
import { useT, useLocale } from "@/lib/localeContext";
import { makeFmt, makeFmtEur, numLocale, type Fmt } from "@/lib/fmt";

/** `fmtInt`, `fmtDec`, `fmtBillions`, `fmtMillions`, `fmtCompactEur` in the active UI locale. */
export function useFmt(): Fmt {
  const { locale } = useLocale();
  return useMemo(() => makeFmt(locale), [locale]);
}

/** "en-GB" | "fr-FR" according to the active UI locale. */
export function useNumLocale(): string {
  const { locale } = useLocale();
  return numLocale(locale);
}

/** Locale-aware compact euro formatter returning `{ v, u }`. */
export function useFmtEur(): (n: number) => { v: string; u: string } {
  const t = useT();
  const { locale } = useLocale();
  return useMemo(
    () => makeFmtEur(numLocale(locale), { md: t("fx.s.md_eur"), m: t("fx.s.m_eur") }),
    [t, locale],
  );
}
