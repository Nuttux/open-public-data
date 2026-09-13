"use client";

import { useState } from "react";
import SectionHead from "@/components/fusion/SectionHead";
import SfMoneyBar from "@/components/us/SfMoneyBar";
import ChartSource from "@/components/fusion/ChartSource";
import { useT } from "@/lib/localeContext";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";
import { bucketLabelKey, deptDisplay } from "./bucket";
import type { WgpMeta, WgpYear } from "./wgp-types";
import type { SfPaymentBreakdowns } from "@/lib/us/sf-payment-breakdowns";

/**
 * "Where the money went" — one fiscal year cut three ways, one lens at a time.
 *
 * Directly the contracts page's money section (SfContractsClient §sec-money):
 * a row of lens buttons over a single SfMoneyBar, because three ranked lists
 * stacked down a page is something to read top to bottom, while one bar with a
 * toggle is something to use. The page had ONE breakdown against that page's
 * four, which is why it read as thinner than it is.
 *
 * The binding property is the shared denominator: department, service area and
 * payee kind all sum to the same fiscal-year total (verified in the mart), so
 * switching lens re-cuts one pie. A toggle whose totals moved would be telling
 * the reader three different things while looking like one.
 *
 * The related-government-units figure lives HERE rather than floating in its
 * own band between sections: it is a fact ABOUT this breakdown (a third of the
 * department lens is pension, health-system and debt-service flow), and the
 * contracts page's own lesson was to fold marginalia into the section it
 * belongs to.
 *
 * "By category" was briefly a fourth lens here and is a section again. It
 * passed the denominator rule arithmetically — purchases + obligations +
 * ledger + unclear = the payment total — but failed it editorially: only
 * $7.94B of FY2025's $16.75B bought anything, so the purchase categories were
 * being drawn against a denominator two thirds of which is not a purchase.
 * MEASURED, the residual row was 66.0% of the chart against 18.6% / 1.0% /
 * 0.0% for the three lenses here, and Construction Contracts fell from 19.6%
 * of purchases to 9.3% of payments. The biggest bar became a bucket meaning
 * "not this".
 *
 * The rule holds; the category cut is just not a sibling of these three.
 * These answer "who got the money" and share a denominator naturally. "What
 * did it buy" is a different question, and it reads correctly in its own
 * section against its own total (components/us/SfBuysBar).
 */

const nfInt = new Intl.NumberFormat("en-US");

type Lens = "department" | "org_group" | "kind";

const LENSES: { key: Lens; label: string; kicker: string; other: string }[] = [
  {
    key: "department",
    label: "By department",
    kicker: "which department paid it",
    other: "Every other department",
  },
  {
    key: "org_group",
    label: "By service area",
    kicker: "which part of the City paid it",
    other: "Other service areas",
  },
  {
    key: "kind",
    label: "By kind of payee",
    kicker: "what kind of payee received it",
    other: "Other kinds",
  },
];

export default function PaymentLenses({
  fy,
  data,
  yearData,
  meta,
  deptHrefs,
}: {
  fy: number;
  data: SfPaymentBreakdowns;
  yearData: WgpYear;
  meta: WgpMeta;
  deptHrefs: Record<string, string>;
}) {
  const t = useT();
  const [lens, setLens] = useState<Lens>("department");
  const lenses = LENSES;
  const config = lenses.find((l) => l.key === lens) ?? lenses[0];
  const rows = data.dimensions[lens] ?? [];
  const tot = yearData.totals;

  // Labels are display-only; keys and amounts always use the raw values.
  const labelFor = (key: string, label: string) => {
    if (lens === "kind") {
      // Lower-case to sit with the bucket labels, which are all lower-case.
      return key === "unclassified" ? "not classified" : t(bucketLabelKey(key));
    }
    if (lens === "department") return deptDisplay(label);
    return label;
  };

  return (
    <section className="fx-section" id="sec-lenses">
      <div className="fx-wrap">
        <SectionHead
          title={
            <>
              Where the money <em>went</em>
            </>
          }
          subtitle={`${fmtUsdCompact(data.totalUsd)} of payments in FY${fy}. Each lens re-splits the same total.`}
        />

        <div className="fx-lensbar" role="group" aria-label="Breakdown lens">
          {lenses.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setLens(l.key)}
              aria-pressed={lens === l.key}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Switching lens replaces the whole breakdown with no visual
            transition a screen reader can follow, so the change is announced.
            Polite, and only the lens name + total: the rows themselves are a
            list the reader can then walk. */}
        <p className="fx-sr-only" role="status" aria-live="polite">
          {config.label}: {fmtUsdCompact(data.totalUsd)} in FY{fy}.
        </p>

        <SfMoneyBar
          key={lens}
          slices={rows.map((r) => ({
            id: r.key,
            label: labelFor(r.key, r.label),
            amount: r.usd,
            count: r.nPayees,
            // Only the department lens has somewhere to go — its budget fiche,
            // server-validated. A service area and a payee kind have no fiche,
            // and an invented href is worse than a dead one.
            href: lens === "department" ? deptHrefs[r.key] ?? null : null,
          }))}
          total={data.totalUsd}
          kicker={`FY${fy} · ${config.kicker}`}
          otherLabel={config.other}
        />

        {/* Facts ABOUT this breakdown, folded in rather than floating. */}
        <div className="fx-callout" style={{ marginTop: 22 }}>
          {lens === "kind" ? (
            <>
              <b>
                {fmtShare(
                  (rows.find((r) => r.key === "unclassified")?.usd ?? 0) / data.totalUsd,
                )}{" "}
                went to payees this classification does not cover.
              </b>{" "}
              The kinds are ours, applied to the City&rsquo;s payees; the money is the
              City&rsquo;s.
            </>
          ) : (
            <>
              <b>
                {fmtUsdCompact(tot.related_govt_units_usd)}
                {tot.related_share_of_total != null
                  ? ` (${fmtShare(tot.related_share_of_total)})`
                  : ""}{" "}
                of this went through related government units
              </b>{" "}
              —{" "}
              {(yearData.related_top_departments ?? []).map((d, i) => (
                <span key={d.department}>
                  {i > 0 && ", "}
                  {deptDisplay(d.department)}{" "}
                  <span style={{ fontFamily: "var(--f-mono)" }}>{fmtUsdCompact(d.usd)}</span>
                </span>
              ))}
              . Counted in, never netted out.
            </>
          )}
        </div>

        <p className="fx-note" style={{ marginTop: 14 }}>
          {nfInt.format(yearData.n_vendors)} payees were paid in FY{fy}.
        </p>

        <ChartSource
          source={meta.source.name}
          dataHref={meta.source.source_url}
          methodHref="/usa/san-francisco/sources#sec-payees"
        />
      </div>
    </section>
  );
}
