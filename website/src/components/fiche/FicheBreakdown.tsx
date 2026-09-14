import type { ReactNode } from "react";
import Link from "@/components/LocalizedLink";

/**
 * A ranked money breakdown inside a fiche: label + proportional bar + amount,
 * scaled to the biggest row in its own list.
 *
 * The fiche kit had one figure (the hero), one time series (FicheYearBars) and
 * lists of links — so every "X split by Y" ended up rendered as prose, e.g.
 * the SF payee fiche's departments as a "·"-joined string of names with no
 * amounts at all. This is the missing primitive, and it is deliberately
 * city-agnostic: rows come in already ranked and already formatted by the
 * caller's own currency formatter.
 *
 * `tone` marks a row that is real money but not a purchase (SF's obligation /
 * ledger classes: debt service, benefit plans, balance-sheet lines). Those
 * bars render hollow so a payee whose money is a pension flow is never drawn
 * the same as one the City actually buys things from.
 *
 * Negative rows (refunds, reversals) are dropped from the BARS only — the
 * length of a bar cannot express a negative, and faking it at zero width
 * would read as "nothing". They stay in the caller's totals.
 */

export type FicheBreakdownRow = {
  key: string;
  label: ReactNode;
  /** Second line under the label — department, voucher count, note. */
  meta?: ReactNode;
  value: number;
  /** Renders the row as a link to a drill target. */
  href?: string;
  /** "muted" = money out, but not a purchase. Renders a hollow bar. */
  tone?: "solid" | "muted";
};

export default function FicheBreakdown({
  rows,
  format,
  cap = 6,
  footer,
}: {
  rows: FicheBreakdownRow[];
  format: (n: number) => string;
  /** Rows shown; the rest is the caller's business (usually FicheMore). */
  cap?: number;
  footer?: ReactNode;
}) {
  const positive = rows.filter((r) => r.value > 0);
  if (positive.length === 0) return null;
  const shown = positive.slice(0, cap);
  const max = Math.max(...shown.map((r) => r.value), 1);

  return (
    <div className="fx-fiche-breakdown">
      {shown.map((r) => {
        const body = (
          <>
            <span className="fx-fiche-bd-label">
              {r.label}
              {r.meta ? <span className="fx-fiche-bd-meta">{r.meta}</span> : null}
            </span>
            <span className="fx-fiche-bd-track" aria-hidden="true">
              <span
                className={`fx-fiche-bd-fill${r.tone === "muted" ? " fx-fiche-bd-fill--muted" : ""}`}
                style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }}
              />
            </span>
            <span className="fx-fiche-bd-value tnum">{format(r.value)}</span>
          </>
        );
        return r.href ? (
          <Link key={r.key} href={r.href} scroll={false} className="fx-fiche-bd-row fx-fiche-bd-row--link">
            {body}
          </Link>
        ) : (
          <div key={r.key} className="fx-fiche-bd-row">
            {body}
          </div>
        );
      })}
      {footer ? <p className="fx-fiche-sub" style={{ margin: "10px 0 0" }}>{footer}</p> : null}
    </div>
  );
}
