import type { Locale } from "@/lib/localeContext";
import type { LandingClosing } from "@/components/landing/types";
import fr from "@/i18n/fr";
import en from "@/i18n/en";
import pt from "@/i18n/pt";

const DICTS = { fr, en, pt } as const;

/**
 * Resolves the landing closing block ("this site can exist for your city") for
 * one locale.
 *
 * The <Landing> template takes already-resolved strings and knows nothing about
 * i18n (see components/landing/types.ts), but the copy is identical for every
 * city — so it lives once in the dictionaries and is resolved here, rather than
 * being retyped in each city's landing model.
 *
 * The href carries the language because /pour-les-villes sits outside the
 * country trees: without it a Recife reader would land on French copy.
 */
export function landingClosing(locale: Locale): LandingClosing {
  const dict = DICTS[locale] ?? fr;
  const t = (key: string): string => dict[key] ?? fr[key] ?? key;
  return {
    title: t("fx.closing.title"),
    text: t("fx.closing.text"),
    cta: t("fx.closing.cta"),
    href: locale === "fr" ? "/pour-les-villes" : `/pour-les-villes?lang=${locale}`,
  };
}
