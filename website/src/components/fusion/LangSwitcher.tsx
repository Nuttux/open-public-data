"use client";

import { useLocale, useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";

export default function LangSwitcher() {
  const { locale, setLocale } = useLocale();
  const t = useT();
  const track = useTrack();

  const change = (next: "fr" | "en") => {
    if (next === locale) return;
    track("lang_switch", { from: locale, to: next });
    setLocale(next);
  };

  return (
    <div className="fx-lang" aria-label={t("fx.nav.lang_aria")}>
      <button
        type="button"
        onClick={() => change("fr")}
        className={locale === "fr" ? "fx-lang-on" : "fx-lang-off"}
        aria-pressed={locale === "fr"}
      >
        FR
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
