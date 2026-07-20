"use client";

import type { MarchesPageData } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { fill, numLocale } from "@/lib/fmt";
import ExempleCards, { type ExempleCardItem } from "./ExempleCards";

type SigItem = MarchesPageData["signature"][number];

/** Statut de vie du contrat, précision au jour UTC (cf. ContratFiche :
 *  une milliseconde de différence SSR/client casse l'hydratation). */
function statut(dateNotification: string, dureeJours: number): "encours" | "termine" | null {
  if (!dateNotification || !(dureeJours > 0)) return null;
  const startMs = Date.parse(dateNotification);
  if (Number.isNaN(startMs)) return null;
  const DAY = 86400000;
  const nowMs = Math.floor(Date.now() / DAY) * DAY;
  return nowMs < startMs + dureeJours * DAY ? "encours" : "termine";
}

export default function MarchesSignature({ items }: { items: SigItem[] }) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = numLocale(locale);

  const fmtEur = (n: number) => {
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
  };

  const cards: ExempleCardItem[] = items.map((it) => {
    const { v, u } = fmtEur(it.montant);
    const st = statut(it.dateNotification, it.dureeJours);
    const metaParts = [
      it.fournisseur.slice(0, 38),
      it.offres != null && it.offres > 0
        ? it.offres === 1
          ? t("fx.fiche.contrat.conc.offre_one")
          : fill(t("fx.fiche.contrat.conc.offres_n"), { n: it.offres })
        : null,
      st ? t(st === "encours" ? "fx.fiche.contrat.tl.en_cours" : "fx.fiche.contrat.tl.termine") : null,
    ].filter(Boolean);
    return {
      href: `/fr/city/paris/marches/contrat/${encodeURIComponent(it.numero)}`,
      kicker: t(`fx.mp.sig.k.${it.kind}`),
      kickerOcre: it.kind === "mono",
      title: locale === "en" && it.labelEn ? it.labelEn : it.label,
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
