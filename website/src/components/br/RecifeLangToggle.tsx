"use client";

import { useT, type Locale } from "@/lib/localeContext";
import { urlForLocale } from "@/lib/site-locale";

/**
 * PT/EN toggle for /br routes — the same segmented control as the France
 * LangSwitcher (fx-lang). The language is the host's (pt.qipu.org speaks
 * Portuguese, www English), so switching is a navigation to the twin host.
 */
export default function RecifeLangToggle({ locale }: { locale: Locale }) {
  const t = useT();

  const change = (next: "pt" | "en") => {
    if (next === locale || typeof window === "undefined") return;
    const { pathname, search, hash, host } = window.location;
    window.location.assign(urlForLocale(next, `${pathname}${search}${hash}`, host));
  };

  return (
    <div className="fx-lang" aria-label={t("br.recife.lang.aria")}>
      <button
        type="button"
        onClick={() => change("pt")}
        className={locale === "pt" ? "fx-lang-on" : "fx-lang-off"}
        aria-pressed={locale === "pt"}
      >
        PT
      </button>
      <button
        type="button"
        onClick={() => change("en")}
        className={locale === "en" ? "fx-lang-on" : "fx-lang-off"}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
    </div>
  );
}
