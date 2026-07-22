"use client";

import { useRouter } from "next/navigation";
import { useT, type Locale } from "@/lib/localeContext";

/** PT/EN toggle for /br routes (br_locale cookie + router.refresh). The
 * chrome's `trailing` slot; styled with the shared fx-sm-tag class. */
export default function RecifeLangToggle({ locale }: { locale: Locale }) {
  const router = useRouter();
  const t = useT();
  const toggle = () => {
    const next = locale === "pt" ? "en" : "pt";
    document.cookie = `br_locale=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <button type="button" className="fx-sm-tag" style={{ cursor: "pointer" }} onClick={toggle} aria-label="Português / English">
      {t("br.recife.lang.switch")}
    </button>
  );
}
