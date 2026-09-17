"use client";

/**
 * Client-side formatting hooks. One home for the `fmtEur`/`locStr` idiom that
 * was previously re-declared inline in every fiche and hub client.
 */

import { useMemo } from "react";
import { useT, useLocale } from "@/lib/localeContext";
import { makeFmt, makeFmtEur, numLocale, type Fmt } from "@/lib/fmt";
import { fmtBrlCompact, fmtBrlCompactNum, brlMagnitude } from "@/lib/br/format";
import { fmtUsdAmt, fmtUsdCompact } from "@/lib/us/format";

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

export type Currency = "EUR" | "BRL" | "USD";
export type FmtMoney = {
  /** `{ v, u }` for the kit's amounts : 2,4 + M € · R$ 72,6 + mi · $887.7 + M. */
  amt: (n: number) => { v: string; u: string };
  /** The same amount in one string, for sentences and titles. */
  txt: (n: number) => string;
};

/** One money formatter for a page that can be in euros, reais or dollars
 *  (the Lieux section on four cities, 2026-09-18). Euros follow the UI
 *  locale ; reais and dollars keep their own conventions (lib/br, lib/us). */
export function useFmtMoney(currency: Currency = "EUR"): FmtMoney {
  const eur = useFmtEur();
  return useMemo(() => {
    if (currency === "BRL") return { amt: (n: number) => ({ v: fmtBrlCompactNum(n), u: brlMagnitude(n) }), txt: fmtBrlCompact };
    if (currency === "USD") return { amt: fmtUsdAmt, txt: fmtUsdCompact };
    return { amt: eur, txt: (n: number) => { const f = eur(n); return `${f.v} ${f.u}`; } };
  }, [currency, eur]);
}
