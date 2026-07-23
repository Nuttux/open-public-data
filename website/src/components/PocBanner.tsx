"use client";

import { useT } from "@/lib/localeContext";

/**
 * Prototype disclaimer strip, shown under the nav on non-flagship places
 * (registry `poc: true` — Recife, SF, US-national, Marseille…). Neutral, factual,
 * non-official: the data is real but the build is early and not an official
 * source. Copy lives in `chrome.poc.*` (per-locale). Rendered by RegistryChrome.
 */
export default function PocBanner() {
  const t = useT();
  return (
    <div className="fx-poc-banner" role="note">
      <span className="fx-poc-badge">{t("chrome.poc.badge")}</span>
      <span className="fx-poc-text">{t("chrome.poc.label")}</span>
    </div>
  );
}
