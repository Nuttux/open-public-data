"use client";

import Link from "@/components/LocalizedLink";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useT } from "@/lib/localeContext";

type Props = {
  /** Human-readable source name, e.g. "Ville de Paris · Comptes administratifs M57 2024". */
  source: ReactNode;
  /** Optional link to the dataset (Open Data portal). */
  dataHref?: string;
  /** Optional anchor to /methode#... for the relevant tool section. */
  methodAnchor?: string;
  /**
   * Full method URL, for surfaces whose method page is not /methode
   * (the US side documents itself at /us/city/sf/sources). Wins over
   * `methodAnchor` when both are set.
   */
  methodHref?: string;
  /**
   * Sources (ids de data_freshness.json) derrière ce graphique. Quand fourni,
   * la légende ajoute « publié par la Ville le … · mis à jour sur Qipu le … »
   * — deux dates, deux acteurs, jamais « repris ».
   */
  sourceIds?: string[];
};

type FreshLite = {
  updated_on_qipu_at: string;
  sources: { source_id: string; published_by_city_at: string | null }[];
};

// Un seul fetch par page, partagé entre toutes les légendes.
let freshPromise: Promise<FreshLite | null> | null = null;
function loadFreshness(): Promise<FreshLite | null> {
  if (!freshPromise) {
    freshPromise = fetch("/data/data_freshness.json")
      .then((r) => (r.ok ? (r.json() as Promise<FreshLite>) : null))
      .catch(() => null);
  }
  return freshPromise;
}

function fmtDate(iso: string, locale: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export default function ChartSource({ source, dataHref, methodAnchor, methodHref, sourceIds }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const method = methodHref ?? (methodAnchor ? `/methode#${methodAnchor}` : null);
  const [fresh, setFresh] = useState<FreshLite | null>(null);

  useEffect(() => {
    if (!sourceIds?.length) return;
    let cancelled = false;
    loadFreshness().then((f) => { if (!cancelled && f) setFresh(f); });
    return () => { cancelled = true; };
  }, [sourceIds]);

  const cityDate = fresh && sourceIds?.length
    ? fresh.sources.filter((s) => sourceIds.includes(s.source_id)).map((s) => s.published_by_city_at).filter((d): d is string => !!d).sort().at(-1)
    : undefined;

  return (
    <figcaption className="fx-chart-source">
      {/* Colon lives in the string: "Source :" is French typography and
       *  must not leak into the EN-only US pages. */}
      <b>{t("fx.chart.source_label")}</b> {source}
      {fresh && cityDate ? (
        <>
          <span className="sep">·</span>
          {t("fx.chart.published_by_city")} {fmtDate(cityDate, locale)}
          <span className="sep">·</span>
          {t("fx.chart.updated_on_qipu")} {fmtDate(fresh.updated_on_qipu_at, locale)}
        </>
      ) : null}
      {dataHref ? (
        <>
          <span className="sep">·</span>
          <a href={dataHref} target="_blank" rel="noopener noreferrer">
            {t("fx.chart.data")} ↗
          </a>
        </>
      ) : null}
      {method ? (
        <>
          <span className="sep">·</span>
          <Link href={method}>{t("fx.chart.method")} →</Link>
        </>
      ) : null}
    </figcaption>
  );
}
