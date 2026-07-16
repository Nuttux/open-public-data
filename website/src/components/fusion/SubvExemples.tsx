"use client";

import type { QuiRecoitData } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";
import ExempleCards, { type ExempleCardItem } from "./ExempleCards";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const STOPWORDS = new Set(["de", "du", "des", "la", "le", "les", "et", "d'", "l'"]);
function titleCaseName(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && STOPWORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export default function SubvExemples({ items }: { items: QuiRecoitData["exemples"] }) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";

  const fmtEur = (n: number) => {
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
  };

  const cards: ExempleCardItem[] = items.map((it) => {
    const { v, u } = fmtEur(it.amount);
    const metaParts = [
      it.theme ? trLabel(it.theme, locale) : null,
      it.kind === "gros" && it.nature ? trLabel(it.nature, locale) : null,
      it.kind === "fidele" && it.sinceYear ? fill(t("fx.qr.sig.depuis"), { year: it.sinceYear }) : null,
    ].filter(Boolean);
    return {
      href: `/fr/city/paris/subventions/association/${encodeURIComponent(it.name)}`,
      kicker: t(`fx.qr.sig.k.${it.kind}`),
      title: titleCaseName(it.name),
      amount: v,
      amountUnit: u,
      meta: metaParts.join(" · "),
      cta: t("fx.exemples.cta"),
      photoUrl: it.photoUrl,
      photoCredit: it.photoCredit,
      photoIllustration: it.photoKind === "illustration",
    };
  });

  return <ExempleCards items={cards} />;
}
