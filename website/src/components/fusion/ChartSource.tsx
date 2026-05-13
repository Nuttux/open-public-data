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
};

export default function ChartSource({ source, dataHref, methodAnchor }: Props) {
  const t = useT();
  return (
    <figcaption className="fx-chart-source">
      <b>{t("fx.chart.source")} :</b> {source}
      {dataHref ? (
        <>
          <span className="sep">·</span>
          <a href={dataHref} target="_blank" rel="noopener noreferrer">
            {t("fx.chart.data")} ↗
          </a>
        </>
      ) : null}
      {methodAnchor ? (
        <>
          <span className="sep">·</span>
          <a href={`/methode#${methodAnchor}`}>{t("fx.chart.method")} →</a>
        </>
      ) : null}
    </figcaption>
  );
}
