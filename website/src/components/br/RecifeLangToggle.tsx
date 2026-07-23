"use client";

import { useRouter } from "next/navigation";
import { useT, type Locale } from "@/lib/localeContext";

/**
 * PT/EN toggle for /br routes — the same segmented control as the France
 * LangSwitcher (fx-lang), but /br is server-locale, so it writes the
 * `br_locale` cookie and refreshes rather than using the client setLocale.
 */
export default function RecifeLangToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = useT();

  const change = (next: "pt" | "en") => {
    if (next === locale) return;
    document.cookie = `br_locale=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
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
