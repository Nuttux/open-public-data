"use client";

import Link from "next/link";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import { useCity } from "./CityContext";

export function AssoKicker({ theme }: { theme?: string | null }) {
  const t = useT();
  const { locale } = useLocale();
  const themeLabel = theme ? trLabel(theme, locale) : t("fx.asso.theme_none");
  return <>{t("fx.asso.kicker").replace("{theme}", themeLabel)}</>;
}

export function AssoPageHeader({ theme }: { theme?: string | null }) {
  const t = useT();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const themeLabel = theme ? trLabel(theme, locale) : t("fx.asso.theme_unclassified");
  return (
    <>
      <div className="fx-page-kicker">
        <Link href={`${basePath}/subventions`} style={{ color: "var(--ocre)" }}>{t("fx.asso.back")}</Link>
      </div>
      <p className="fx-page-lede">{themeLabel}</p>
    </>
  );
}
