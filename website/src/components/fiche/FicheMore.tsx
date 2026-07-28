import type { ReactNode } from "react";

/**
 * THE LONG-LIST RULE, in one component.
 *
 * No section dumps an unbounded list. A section shows the top N by materiality
 * and folds the rest behind exactly one expander carrying an honest count
 * ("+52 more permits"). Nothing is ever sliced away silently — if a row is not
 * on screen it is either inside this expander or reported as a number.
 *
 * Used by every SF fiche so the fold reads identically wherever it appears,
 * rather than five hand-styled <details> with five different summaries.
 */
export default function FicheMore({
  count,
  noun,
  children,
}: {
  /** How many rows are hidden. Renders nothing when 0 — callers can pass the
   *  raw remainder without guarding. */
  count: number;
  /** Plural noun for the honest count, e.g. "permits", "more contracts". */
  noun: string;
  children: ReactNode;
}) {
  if (count <= 0) return null;
  return (
    <details className="fx-more">
      <summary>
        + {count.toLocaleString("en-US")} {noun}
      </summary>
      <div className="fx-more-body">{children}</div>
    </details>
  );
}
