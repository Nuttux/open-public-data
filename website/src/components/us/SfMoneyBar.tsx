"use client";

import Link from "@/components/LocalizedLink";
import type { ReactNode } from "react";
import { fmtUsdCompact, fmtShare } from "@/lib/us/format";

/**
 * A ranked breakdown: one aligned row per slice, and the row is the link.
 *
 * This started as a 100% stacked bar with a legend under it, which is what
 * Paris's `StackedBarTheme` does — but once the legend rows carried their own
 * proportional bars the stacked bar on top was saying the same thing twice, so
 * it went. What is left is the part that reads: swatch · label · bar · percent
 * · amount, with the numbers in columns and nothing truncated.
 *
 * The label column is a fixed width on purpose. Every row is its own grid, so
 * sizing it to content makes each bar start at a different x and the bars stop
 * being comparable — which is the only job a bar has.
 *
 * Slices arrive pre-sorted and pre-capped; whatever is missing from `total`
 * becomes a single trailing "Other" that is never a link (it has no fiche).
 */

export type MoneySlice = {
  /** Stable React key. Labels are NOT unique — two different contracts can
   *  carry the same plain-English title — so pass an id wherever one exists. */
  id?: string;
  label: string;
  amount: number;
  count: number;
  /** Destination fiche. Omit for a slice with nowhere to go. */
  href?: string | null;
};

/** Editorial palette — distinct hues, all ≥4.5:1 against white segment text. */
const PALETTE = [
  "#2a3680", "#8c5e2a", "#b8323a", "#2c7339", "#546583",
  "#b8495d", "#36657a", "#8a5a3b", "#4d7a36", "#7b6aa3",
];
const OTHER_COLOR = "#9aa0ab";

export default function SfMoneyBar({
  slices,
  total,
  kicker,
  otherLabel = "Everything else",
  footnote,
  formatAmount,
}: {
  slices: MoneySlice[];
  /** The true denominator. The gap vs the slices becomes "Other". */
  total: number;
  kicker: ReactNode;
  otherLabel?: string;
  footnote?: ReactNode;
  /** Override the amount formatter — e.g. headcount instead of dollars.
   *  Defaults to compact USD, so existing call sites are unchanged. */
  formatAmount?: (n: number) => string;
}) {
  const fmtAmt = formatAmount ?? fmtUsdCompact;
  const shown = slices.filter((s) => s.amount > 0);
  const covered = shown.reduce((a, s) => a + s.amount, 0);
  const otherAmount = Math.max(0, total - covered);
  const otherCount = 0;
  const rows: (MoneySlice & { color: string; pct: number })[] = shown.map((s, i) => ({
    ...s,
    color: PALETTE[i % PALETTE.length],
    pct: total > 0 ? s.amount / total : 0,
  }));
  if (otherAmount > 0) {
    rows.push({
      label: otherLabel,
      amount: otherAmount,
      count: otherCount,
      href: null,
      color: OTHER_COLOR,
      pct: total > 0 ? otherAmount / total : 0,
    });
  }
  const maxPct = Math.max(...rows.map((r) => r.pct), 0.0001);

  return (
    <div className="fx-moneybar">
      <div className="fx-moneybar-kicker">{kicker}</div>

      {/* One aligned row per slice; the row is the click target. */}
      <ul className="fx-moneybar-legend">
        {rows.map((r) => {
          const inner = (
            <>
              <span className="fx-moneybar-sw" style={{ background: r.color }} aria-hidden="true" />
              <span className="fx-moneybar-nm">{r.label}</span>
              <span className="fx-moneybar-mini" aria-hidden="true">
                <span style={{ width: `${(r.pct / maxPct) * 100}%`, background: r.color }} />
              </span>
              <span className="fx-moneybar-pc tnum">{fmtShare(r.pct)}</span>
              <span className="fx-moneybar-am tnum">{fmtAmt(r.amount)}</span>
            </>
          );
          return (
            <li key={r.id ?? r.label}>
              {r.href ? (
                <Link href={r.href} scroll={false} className="fx-moneybar-row fx-moneybar-row-link">
                  {inner}
                </Link>
              ) : (
                <span className="fx-moneybar-row">{inner}</span>
              )}
            </li>
          );
        })}
      </ul>

      {footnote && <p className="fx-moneybar-foot">{footnote}</p>}
    </div>
  );
}
