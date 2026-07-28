"use client";

import { Suspense } from "react";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import PageTOC from "@/components/fusion/PageTOC";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import YearPicker from "@/components/fusion/YearPicker";
import SfSourceFooter from "@/components/us/SfSourceFooter";
import { useT } from "@/lib/localeContext";
import { fmtUsdCompact } from "@/lib/us/format";
import PayeesExplorer from "./PayeesExplorer";
import MaterialityStrip from "./MaterialityStrip";
import SfBuysBar from "@/components/us/SfBuysBar";
import PaymentLenses from "./PaymentLenses";
import type { SfPaymentBreakdowns } from "@/lib/us/sf-payment-breakdowns";
import type { SfSpendingSection } from "@/lib/us/sf-spending";
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
  searchSeeds,
  deptHrefs,
  spending,
  breakdowns,
}: {
  fy: number;
  yearData: WgpYear;
  years: WgpYearStatus[];
  meta: WgpMeta;
  materiality: WgpFile["materiality"];
  vendorSlugMap: Record<string, string>;
  /** Suggestion chips, validated server-side against the search index. */
  searchSeeds: string[];
  /** dept code → budget fiche href, server-validated. */
  deptHrefs: Record<string, string>;
  /** Purchasing side of the ledger for this year (null if not exported yet). */
  spending: SfSpendingSection | null;
  /** The year's payments by department / service area / payee kind. */
  breakdowns: SfPaymentBreakdowns | null;
}) {
  const t = useT();
  const basePath = "/us/city/sf/who-gets-paid";
  const previewYears = years.filter((y) => y.status !== "closed").map((y) => y.fy);
  const status = yearData.execution_status;
  const tot = yearData.totals;

  // Top-10 concentration — the stat every other city page carries in its
  // intro band (Paris marchés/subventions, Recife quem-recebe). Sum of
  // exported rows over the exported total; no new fact.
  //
  // It MUST use the same predicate as the ranking below (TopPayeesSection:
  // drop `person`, drop the default-view excluded buckets) or the intro
  // contradicts the section's own note — an unfiltered top-10 doubles the
  // figure, because pass-through banks head the raw list.
  const top10Usd = yearData.payees
    .filter((p) => p.bucket !== "person" && !meta.default_view.excluded_buckets.includes(p.bucket ?? ""))
    .slice(0, 10)
    .reduce((s, p) => s + p.vouchers_paid_usd, 0);
  const top10Share = tot.all_usd > 0 ? top10Usd / tot.all_usd : 0;

  return (
    <main id="main-content" tabIndex={-1}>
      <PageTOC
        items={[
          { id: "sec-lenses", label: "Where it went" },
          { id: "sec-materiality", label: t("us.sf.wgp.s03.kind") },
          { id: "sec-payees", label: t("us.sf.wgp.s02.kind") },
        ]}
      />

      {/* ── Opener: signature stat band (folds the former "01 Perimeter") ── */}
      <PageIntro
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
              value={<AnimatedNumber value={yearData.n_vendors} format={(n) => nfInt.format(n)} />}
              label={t("us.sf.wgp.s01.kpi.payees")}
            />
            <IntroStat
              value={<AnimatedNumber value={top10Share * 100} format={(n) => n.toFixed(1)} />}
              unit="%"
              label={t("us.sf.wgp.s01.kpi.concentration")}
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

      {/* ── Where it went: one total, three lenses ──
          The contracts page's money section, transposed. It opens the page
          because a reader arriving at "who gets paid" needs the shape of the
          money before a list of 15 names means anything. */}
      {breakdowns && (
        <PaymentLenses
          fy={fy}
          data={breakdowns}
          yearData={yearData}
          meta={meta}
          deptHrefs={deptHrefs}
        />
      )}

      {/* ── What it bought ──
          Its own section, not a lens above. It was briefly a fourth lens and
          it does split the same fiscal-year total — but only $7.9B of the
          $16.7B bought anything, so drawn against the payments denominator
          the residual row became 66% of the chart and the largest bar meant
          "not this". Against its own purchase total the categories read.
          Measured, not assumed: the other three lenses leave 18.6% / 1.0% /
          0.0% in Other. */}
      {spending ? (
        <SfBuysBar d={spending} />
      ) : (
        <MaterialityStrip
          materiality={materiality}
          deptHrefs={deptHrefs}
          vendorSlugMap={vendorSlugMap}
        />
      )}

      {/* ── Who gets paid: the ranking and the search, one section ──
          They were two, and the search had to be seeded from #16 so it would
          not repeat the ranking above it. That offset was the duplication
          admitting itself. Ranked from #1, filterable, searchable. */}
      <Suspense fallback={null}>
        <PayeesExplorer
          fy={fy}
          yearData={yearData}
          meta={meta}
          vendorSlugMap={vendorSlugMap}
          seeds={searchSeeds}
        />
      </Suspense>

      <SfSourceFooter
        perimeter={meta.perimeter}
        coverage={meta.ranking_caveat}
        source={{ name: meta.source.name, href: meta.source.source_url }}
        sourcesAnchor="sec-payees"
        exports={[
          { label: "top_payees.json", href: "/data/us/sf/top_payees.json" },
          { label: "payees_search.json", href: "/data/us/sf/payees_search.json" },
        ]}
      />
    </main>
  );
}
