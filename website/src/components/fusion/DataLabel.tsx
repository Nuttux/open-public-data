"use client";

import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

/**
 * Renders a data-driven French label through trLabel() so the EN locale gets
 * the translated vocabulary. Lets server components (page h1, drawer title)
 * emit locale-aware labels without reading the locale server-side.
 */
export function DataLabel({ value }: { value?: string | null }) {
  const { locale } = useLocale();
  return <>{trLabel(value, locale)}</>;
}

/** Localized kicker line for entity drawers (Thématique / Catégorie / Marché). */
export function DrawerKicker({
  k,
  year,
  nature,
}: {
  k: "theme" | "categorie" | "contrat";
  year: number | string;
  nature?: string | null;
}) {
  const t = useT();
  const { locale } = useLocale();
  let s = t(`fx.drawer.kicker.${k}`).replace("{year}", String(year));
  if (nature != null) s = s.replace("{nature}", trLabel(nature, locale));
  return <>{s}</>;
}
