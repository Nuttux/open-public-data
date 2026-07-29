"use client";

import type { ReactNode } from "react";

/**
 * THE SHARED-DENOMINATOR RULE, in one component.
 *
 * Two page sections that cut the SAME total belong in one section with a lens
 * toggle: three ranked lists stacked down a page is something to read top to
 * bottom, while one bar with a toggle is something to use.
 *
 * The gate is arithmetic AND editorial. Arithmetic: every lens must sum to the
 * same total, or switching lens tells the reader three different things while
 * looking like one. Editorial: the cut has to be a real sibling question — SF
 * measured a lens that passed the arithmetic and still failed here, because a
 * "not this" residual became 66% of the chart (see PaymentLenses.tsx). When a
 * cut answers a different question, it stays its own section.
 *
 * Markup and the mobile grid treatment already lived in fusion.css as
 * `.fx-lensbar`, inlined by hand at two SF call sites. This is that markup,
 * once, so Paris/Marseille/Recife get the accessible version rather than a
 * fourth hand-rolled copy.
 */

export type Lens<K extends string> = {
  key: K;
  label: ReactNode;
  /** Screen-reader announcement on switch — usually "<lens name>: <total>". */
  announce?: string;
};

export default function LensBar<K extends string>({
  lenses,
  value,
  onChange,
  ariaLabel,
}: {
  lenses: readonly Lens<K>[];
  value: K;
  onChange: (key: K) => void;
  ariaLabel: string;
}) {
  const active = lenses.find((l) => l.key === value);
  return (
    <>
      <div className="fx-lensbar" role="group" aria-label={ariaLabel}>
        {lenses.map((l) => (
          <button key={l.key} type="button" onClick={() => onChange(l.key)} aria-pressed={value === l.key}>
            {l.label}
          </button>
        ))}
      </div>
      {/* Switching lens replaces the whole breakdown with no visual transition
          a screen reader can follow, so the change is announced. Polite, and
          only the lens name + total: the rows themselves are a list the reader
          can then walk. */}
      {active?.announce ? (
        <p className="fx-sr-only" role="status" aria-live="polite">
          {active.announce}
        </p>
      ) : null}
    </>
  );
}
