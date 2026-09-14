"use client";

import { useLocale } from "@/lib/localeContext";
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

