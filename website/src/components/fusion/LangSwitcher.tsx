"use client";

import { useLocale, useT } from "@/lib/localeContext";

export default function LangSwitcher() {
  const { locale, setLocale } = useLocale();
  const t = useT();
  return (
    <div className="fx-lang" aria-label={t("fx.nav.lang_aria")}>
      <button
        type="button"
        onClick={() => setLocale("fr")}
        className={locale === "fr" ? "fx-lang-on" : "fx-lang-off"}
        aria-pressed={locale === "fr"}
      >
        FR
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={locale === "en" ? "fx-lang-on" : "fx-lang-off"}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
    </div>
  );
}
