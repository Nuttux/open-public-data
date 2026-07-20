"use client";

import { Suspense } from "react";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import YearPicker from "@/components/fusion/YearPicker";
import ExportRow from "@/components/fusion/ExportRow";
import Fy2018Note from "@/components/us/Fy2018Note";
import { useT } from "@/lib/localeContext";
import { fmtUsdCompact, fmtDateLong } from "@/lib/us/format";
import TopPayeesSection from "./TopPayeesSection";
import MaterialityStrip from "./MaterialityStrip";
import PayeesSearch from "./PayeesSearch";
import type { WgpFile, WgpMeta, WgpYear, WgpYearStatus } from "./wgp-types";

/**
 * /us/city/sf/who-gets-paid — EN-only client (ADR-0010 D3): all copy via
 * `us.sf.wgp.*` keys mirrored verbatim in en.ts and fr.ts. Every number on
 * the page comes from the export payload; the only client arithmetic is
 * sums/shares of exported values (top-10 concentration), never new facts.
 *
 * The Paris QuiRecoitExplorer skeleton, transposed: ranked list with the
 * bucket toggle IN the section head, first-class nonprofit tab, materiality
 * strip, lazy long-tail search with runtime-validated seed chips.
 */

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const nfInt = new Intl.NumberFormat("en-US");

export default function WhoGetsPaidClient({
  fy,
  yearData,
  years,
  meta,
  materiality,
  vendorSlugMap,
}: {
  fy: number;
  yearData: WgpYear;
  years: WgpYearStatus[];
  meta: WgpMeta;
  materiality: WgpFile["materiality"];
  vendorSlugMap: Record<string, string>;
}) {
  const t = useT();
  const basePath = "/us/city/sf/who-gets-paid";
  const previewYears = years.filter((y) => y.status !== "closed").map((y) => y.fy);
  const status = yearData.execution_status;
  const tot = yearData.totals;

  const sourceLinks = (
    <>
      {meta.source.name}{" "}
      <a href={meta.source.source_url} target="_blank" rel="noopener noreferrer">
        {t("us.sf.wgp.s05.data_link")} ↗
      </a>
    </>
  );

  return (
    <main id="main-content" tabIndex={-1}>
      {/* ── Opener: signature stat band (folds the former "01 Perimeter") ── */}
      <PageIntro
        kicker={fill(t("us.sf.wgp.kicker"), { fy })}
        title={
          <>
            {t("us.sf.wgp.title.before")}
            <em>{t("us.sf.wgp.title.em")}</em>
            {t("us.sf.wgp.title.after")}
          </>
        }
        lede={fill(t("us.sf.wgp.lede"), {
          nVouchers: nfInt.format(yearData.n_vouchers),
          nVendors: nfInt.format(yearData.n_vendors),
          fy,
        })}
        actions={
          <YearPicker
            years={years.map((y) => y.fy)}
            previewYears={previewYears}
            current={fy}
            basePath={basePath}
            label={t("us.sf.wgp.year_label")}
          />
        }
        stats={
          <>
            <IntroStat
              value={
                <AnimatedNumber value={tot.all_usd} format={(n) => fmtUsdCompact(n)} />
              }
              label={fill(t("us.sf.wgp.s01.hero.label"), { fy })}
            />
            <IntroStat
              value={
                <AnimatedNumber value={tot.city_usd} format={(n) => fmtUsdCompact(n)} />
              }
              label={t("us.sf.wgp.s01.kpi.city")}
            />
            <IntroStat
              value={
                <AnimatedNumber
                  value={tot.related_govt_units_usd}
                  format={(n) => fmtUsdCompact(n)}
                />
              }
              label={t("us.sf.wgp.s01.kpi.related")}
            />
            <IntroStat
              value={
                <AnimatedNumber
                  value={yearData.n_vendors}
                  format={(n) => nfInt.format(Math.round(n))}
                />
              }
              label={t("us.sf.wgp.s01.kpi.vendors")}
            />
          </>
        }
      >
        {status !== "closed" && (
          <div className="fx-preview-banner" role="note">
            <span className="fx-preview-tag">
              {status === "in_progress" ? "in progress" : "preliminary"}
            </span>
            <span>
              {status === "in_progress"
                ? fill(t("us.sf.wgp.status.in_progress"), { fy, y0: fy - 1, y1: fy })
                : fill(t("us.sf.wgp.status.preliminary"), { fy })}
            </span>
          </div>
        )}
      </PageIntro>

      {/* ── Signature: the ranked payees (tabs + toggle) ── */}
      <TopPayeesSection fy={fy} yearData={yearData} meta={meta} vendorSlugMap={vendorSlugMap} />

      {/* ── 03 · Materiality strip ── */}
      <MaterialityStrip materiality={materiality} />

      {/* ── 04 · Search the long tail ── */}
      <Suspense fallback={null}>
        <PayeesSearch fy={fy} />
      </Suspense>

      {/* ── 05 · Sources & method ── */}
      <section className="fx-footer-sources" id="sec-method">
        <div className="fx-wrap">
          <div className="fx-footer-sources-head">
            <span className="fx-footer-sources-label">{t("us.sf.wgp.s05.label")}</span>
          </div>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.wgp.s05.source_label")}</b>: {sourceLinks}
            {meta.as_of && (
              <>
                {" "}
                <span className="sep">·</span>{" "}
                {fill(t("us.sf.wgp.s05.updated"), {
                  date: fmtDateLong(meta.as_of.slice(0, 10)),
                })}
              </>
            )}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.wgp.s05.perimeter_label")}</b>: {meta.perimeter}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.wgp.s05.classification_label")}</b>: {meta.classification.coverage}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.wgp.s05.default_view_label")}</b>: {meta.default_view.note}{" "}
            {meta.ranking_caveat}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.wgp.s05.grants_label")}</b>: {meta.grant_lens_definition}{" "}
            {meta.nonprofit_floor_note}
          </p>
          <p className="fx-footer-sources-meta">
            <b>{t("us.sf.wgp.s05.individuals_label")}</b>: {t("us.sf.wgp.s05.individuals")}
          </p>
          <div style={{ marginTop: 18 }}>
            <Fy2018Note />
          </div>
          <div style={{ marginTop: 18 }}>
            <ExportRow
              items={[
                { label: "top_payees.json", primary: true, href: "/data/us/sf/top_payees.json" },
                { label: "payees_search.json", href: "/data/us/sf/payees_search.json" },
                { label: meta.source.dataset_id, href: meta.source.source_url },
              ]}
            />
          </div>
          <p
            className="fx-footer-sources-meta"
            style={{ fontFamily: "var(--f-mono)", fontSize: 11, marginTop: 16 }}
          >
            {fill(t("us.sf.wgp.s05.generated"), {
              ts: fmtDateLong(meta.generated_at.slice(0, 10)),
            })}{" "}
            <span className="sep">·</span> {meta.source_pipeline}
          </p>
        </div>
      </section>
    </main>
  );
}
