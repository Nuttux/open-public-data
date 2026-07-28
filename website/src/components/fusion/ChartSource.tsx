"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/localeContext";

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
};

export default function ChartSource({ source, dataHref, methodAnchor, methodHref }: Props) {
  const t = useT();
  const method = methodHref ?? (methodAnchor ? `/methode#${methodAnchor}` : null);
  return (
    <figcaption className="fx-chart-source">
      {/* Colon lives in the string: "Source :" is French typography and
       *  must not leak into the EN-only US pages. */}
      <b>{t("fx.chart.source_label")}</b> {source}
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
          <a href={method}>{t("fx.chart.method")} →</a>
        </>
      ) : null}
    </figcaption>
  );
}
