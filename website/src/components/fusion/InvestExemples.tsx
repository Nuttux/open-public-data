"use client";

import type { InvestissementsData } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import ExempleCards, { type ExempleCardItem } from "./ExempleCards";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

export default function InvestExemples({ items }: { items: InvestissementsData["exemples"] }) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";
  const suf = (n: number) => (locale === "en" ? (n === 1 ? "st" : "th") : n === 1 ? "er" : "ᵉ");

  const fmtEur = (n: number) => {
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
  };

  const cards: ExempleCardItem[] = items.map((it) => {
    const { v, u } = fmtEur(it.amount);
    const metaParts = [
      it.arr > 0 ? `${it.arr}${suf(it.arr)} ${t("fx.exemples.arrondissement")}` : null,
      it.nbMarches > 0
        ? it.nbMarches === 1
          ? t("fx.exemples.nb_marches_one")
          : fill(t("fx.exemples.nb_marches"), { n: it.nbMarches })
        : null,
    ].filter(Boolean);
    return {
      href: `/fr/city/paris/investissements/projet/${encodeURIComponent(it.id)}`,
      kicker: t(`fx.inv.sig.k.${it.kind}`),
      title: locale === "en" && it.nameEn ? it.nameEn : it.name,
      amount: v,
      amountUnit: u,
      meta: metaParts.join(" · "),
      cta: t("fx.exemples.cta"),
      photoUrl: it.photoUrl,
      photoCredit: it.photoCredit,
    };
  });

  return <ExempleCards items={cards} />;
}
