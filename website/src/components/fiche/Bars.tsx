"use client";

import type { ReactNode } from "react";
import Link from "@/components/LocalizedLink";
import { V3Fold } from "./v3";

export type BarRow = {
  key: string;
  label: ReactNode;
  /** Bar length, relative to the largest row. */
  value: number;
  /** What the bar says, formatted: « 769 M€ », « 343 ». */
  text: ReactNode;
  /** Muted line under the label. */
  sub?: ReactNode;
  /** Logical path; a row with an href opens a fiche (drawer). */
  href?: string | null;
  /** Ink instead of blue: the one bar the sentence above is about. */
  tone?: "ink" | "blue" | "soft";
  /** A rule above the row: it belongs to the list but not to the same kind
   *  (borrowing under the revenue it is not). */
  separated?: boolean;
};

/**
 * Horizontal bars with the label and the value written on each: the one
 * chart shape that reads on a phone without a legend, an axis or a hover.
 * Rows that have an href are links to fiches: a chevron at the right edge
 * says so, and the whole row reacts on hover. Past `cap`, the rest folds
 * under a « Voir plus » (measured: details_toggle with `foldId`).
 */
export default function Bars({
  rows,
  cap,
  foldLabel,
  foldId,
  max: maxIn,
  footRow,
}: {
  rows: BarRow[];
  cap?: number;
  foldLabel?: string;
  foldId?: string;
  max?: number;
  /** A closing row always shown after the fold: the remainder (« 679 autres entreprises »). */
  footRow?: BarRow;
}) {
  const max = maxIn ?? Math.max(...rows.map((r) => r.value), footRow?.value ?? 0, 1);
  const shown = cap && rows.length > cap ? rows.slice(0, cap) : rows;
  const rest = cap && rows.length > cap ? rows.slice(cap) : [];
  const Row = (r: BarRow) => {
    const w = Math.max(3, Math.round((r.value / max) * 100));
    const body = (
      <>
        <span className="lbl">
          <span className="t">{r.label}</span>
          {r.sub ? <span className="sub">{r.sub}</span> : null}
        </span>
        <span className="track"><i className={r.tone ?? "blue"} style={{ width: `${w}%` }} /></span>
        <span className="v tnum">{r.text}</span>
        <span className="c" aria-hidden="true">{r.href ? "›" : ""}</span>
      </>
    );
    const cls = `fx-bars-row${r.href ? " is-link" : ""}${r.separated ? " sep" : ""}`;
    return r.href ? (
      <Link key={r.key} href={r.href} scroll={false} className={cls}>{body}</Link>
    ) : (
      <div key={r.key} className={cls}>{body}</div>
    );
  };
  return (
    <div className="fx-bars">
      {shown.map(Row)}
      {rest.length > 0 && foldLabel ? (
        <V3Fold id={foldId} text label={foldLabel}>{rest.map(Row)}</V3Fold>
      ) : null}
      {footRow ? Row(footRow) : null}
    </div>
  );
}
