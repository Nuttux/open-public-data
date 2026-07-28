"use client";

import type { ReactNode } from "react";
import ExportRow from "@/components/fusion/ExportRow";
import { useT } from "@/lib/localeContext";

/**
 * Closing "Sources & downloads" block for the SF pages — the US counterpart
 * of the `fx-footer-sources` section every Paris and Recife page ends with
 * (see fr/city/paris/marches/MarchesPublicsClient.tsx, br/.../BudgetClient).
 *
 * It makes the per-page promise the site makes everywhere else: the exact
 * perimeter of what you just read, and the JSON that produced it, one click
 * away. `sourcesAnchor` points into /us/city/sf/sources, which plays the
 * role /methode plays on the France side.
 *
 * EN-only (ADR-0010 D3): copy flows through `us.sf.footer.*` keys whose EN
 * and FR values are identical English.
 */

export type SfExportItem = {
  label: string;
  href: string;
  primary?: boolean;
};

export default function SfSourceFooter({
  perimeter,
  coverage,
  source,
  sourcesAnchor,
  exports: exportItems,
  id = "sec-sources",
}: {
  /** One line: what this page counts. Comes from the export payload. */
  perimeter: ReactNode;
  /** Optional second line: known gaps, vintages, breaks. */
  coverage?: ReactNode;
  /** Publisher + link to the dataset itself. */
  source: { name: string; href: string };
  /** Section id on /us/city/sf/sources documenting this page (omit if none). */
  sourcesAnchor?: string;
  /** The JSON files behind the page. First one renders as primary. */
  exports: SfExportItem[];
  id?: string;
}) {
  const t = useT();
  const sourcesHref = sourcesAnchor
    ? `/us/city/sf/sources#${sourcesAnchor}`
    : "/us/city/sf/sources";
  return (
    <section className="fx-footer-sources" id={id}>
      <div className="fx-wrap">
        <div className="fx-footer-sources-head">
          <span className="fx-footer-sources-label">{t("us.sf.footer.heading")}</span>
          <a href={sourcesHref} className="fx-footer-sources-methode">
            {t("us.sf.footer.method_link")}
          </a>
        </div>
        <p className="fx-footer-sources-meta">
          <b>{t("us.sf.footer.perimeter_label")}</b> {perimeter}
          {coverage ? (
            <>
              {" "}
              <span className="sep">·</span> <b>{t("us.sf.footer.coverage_label")}</b> {coverage}
            </>
          ) : null}{" "}
          <span className="sep">·</span> <b>{t("us.sf.footer.source_label")}</b>{" "}
          <a href={source.href} target="_blank" rel="noopener noreferrer">
            {source.name} ↗
          </a>
        </p>
        <ExportRow
          items={[
            ...exportItems.map((e, i) => ({
              label: e.label,
              href: e.href,
              primary: e.primary ?? i === 0,
              download: true,
            })),
            { label: t("us.sf.footer.all_sources"), href: sourcesHref },
          ]}
        />
      </div>
    </section>
  );
}
