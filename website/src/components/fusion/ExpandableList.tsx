"use client";

import { useState, type ReactNode } from "react";

export type ExpandableItem = {
  key: string;
  /** Main left-aligned label. */
  label: ReactNode;
  /** Value shown on the right in large display type. */
  value: ReactNode;
  /** Optional unit appended to the value. */
  unit?: ReactNode;
  /** Bar width in percent (0–100) used for the visual bar column. */
  barPct?: number;
  /** Optional meta column (e.g. count, variation) between bar and value. */
  meta?: ReactNode;
  /** Content shown when the row is expanded. */
  children: ReactNode;
};

type Props = {
  items: ExpandableItem[];
  /** Which item is open by default (one at a time). */
  initialOpen?: string;
  /** Header row — shown above the items, in mono style. */
  header?: { left: ReactNode; right: ReactNode };
};

/**
 * Accordion-style list matching the mockup pattern "expandable par thématique".
 * Each row collapses/expands to reveal an inner panel (typically a sub-table,
 * mini-histogram, or top-N breakdown).
 */
export default function ExpandableList({ items, initialOpen, header }: Props) {
  const [openKey, setOpenKey] = useState<string | null>(initialOpen ?? null);

  return (
    <div className="fx-expand">
      {header && (
        <div className="fx-barhead">
          <span>{header.left}</span>
          <span>{header.right}</span>
        </div>
      )}
      <div className="fx-expand-list">
        {items.map((it) => {
          const isOpen = openKey === it.key;
          return (
            <div key={it.key} className={isOpen ? "fx-expand-row fx-expand-open" : "fx-expand-row"}>
              <button
                type="button"
                className="fx-expand-head"
                aria-expanded={isOpen}
                onClick={() => setOpenKey(isOpen ? null : it.key)}
              >
                <span className="fx-expand-label">{it.label}</span>
                <span className="fx-expand-bar">
                  <span className="fx-expand-fill" style={{ width: `${Math.max(0, Math.min(100, it.barPct ?? 0))}%` }} />
                </span>
                {it.meta && <span className="fx-expand-meta">{it.meta}</span>}
                <span className="fx-expand-value tnum">
                  {it.value}
                  {it.unit && <span className="fx-expand-unit">{it.unit}</span>}
                </span>
                <span className="fx-expand-chev" aria-hidden="true">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && <div className="fx-expand-body">{it.children}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
