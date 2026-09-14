"use client";

import SectionHead from "@/components/fusion/SectionHead";
import SfMoneyBar from "@/components/us/SfMoneyBar";
import Tip from "@/components/fusion/Tip";
import { fmtUsdCompact } from "@/lib/us/format";
import type { SfSpendingSection } from "@/lib/us/sf-spending";

/**
 * "What the City buys" — the purchasing side of the ledger as one ranked
 * breakdown, every row opening that category's fiche.
 *
 * This is deliberately the SAME component the contracts page uses for its
 * money breakdowns (SfMoneyBar: swatch · label · bar · percent · amount, row
 * is the link). Two earlier shapes were wrong for different reasons: a plain
 * 12-row list gave the reader nothing to do, and a stacked bar with a local
 * drill panel invented an interaction that exists nowhere else on the site —
 * so the same question ("what is this money, and who got it?") was answered by
 * two different mechanics on two pages. Categories are now facets you navigate
 * into, exactly like contract types.
 *
 * Honesty rules unchanged: purchases are the breakdown, obligations and ledger
 * lines are stated underneath rather than blended in, and the "Other" row is
 * the true gap to the purchase total rather than a rounding of the visible rows.
 */

const nfInt = new Intl.NumberFormat("en-US");

/** Rows in the breakdown; the remainder folds into SfMoneyBar's "Other". */
const SLICES = 8;

export default function SfBuysBar({ d }: { d: SfSpendingSection }) {
  const buys = d.totals.purchase ?? 0;
  const nonBuys = d.totalAll - buys;
  if (d.purchases.length === 0 || buys <= 0) return null;

  // Only a category the export gave a drill list to has a fiche worth opening;
  // the rest render as rows with nowhere to go rather than as dead links.
  const slices = d.purchases.slice(0, SLICES).map((r) => ({
    id: r.code,
    label: r.label,
    amount: r.paid_usd,
    count: r.n_vendors,
    // The year travels with the link: the reader clicked a row that reads
    // FY2025, and the fiche must answer about FY2025 — not about whichever
    // year happens to be newest in the file.
    href:
      r.top_payees.length > 0
        ? `/usa/san-francisco/who-gets-paid/category/${r.slug}?year=${d.fiscalYear}`
        : null,
  }));

  return (
    <section className="fx-section" id="sec-materiality">
      <div className="fx-wrap">
        <SectionHead
          title={
            <>
              What the City <em>buys</em>
            </>
          }
          subtitle={`${fmtUsdCompact(buys)} of FY${d.fiscalYear} payments bought goods and services, across ${nfInt.format(d.nPurchaseCategories)} categories. Open one to see who was paid in it.`}
        />

        <SfMoneyBar
          slices={slices}
          total={buys}
          kicker={`FY${d.fiscalYear} · payments that bought something`}
          otherLabel={`${nfInt.format(Math.max(0, d.nPurchaseCategories - slices.length))} other categories`}
        />

        {/* The rest of the ledger, stated rather than blended in. */}
        {nonBuys > 0 && (
          <div className="fx-callout" style={{ marginTop: 22 }}>
            <b>{fmtUsdCompact(nonBuys)} left the same ledger without buying anything.</b>{" "}
            {[
              d.totals.obligation
                ? `${fmtUsdCompact(d.totals.obligation)} in debt service, benefit plans, tax withholding and payments to other governments`
                : null,
              d.totals.ledger
                ? `${fmtUsdCompact(d.totals.ledger)} in balance-sheet and revenue lines`
                : null,
              d.totals.unclear ? `${fmtUsdCompact(d.totals.unclear)} unclassified` : null,
            ]
              .filter(Boolean)
              .join("; ")}
            .
          </div>
        )}

        <p className="fx-note" style={{ marginTop: 14 }}>
          <Tip label={`${d.classificationNote} ${d.perimeter}`}>Categories</Tip> are the
          City&rsquo;s own accounting codes; the split into purchases and the rest is ours.
        </p>
      </div>
    </section>
  );
}
