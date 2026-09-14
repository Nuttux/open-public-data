import { Fragment } from "react";
import { V3Amt, V3Row, V3Section } from "@/components/fiche/v3";

/**
 * "See also" block of a fiche — the last section, rows that all lead to
 * another page of the site (feedback_seo_aigeo_by_default: no fiche is a
 * dead end). Presentational: the caller computes the rows from data it has
 * already loaded and verified, and passes the titles in the page's language.
 * A block with no rows renders nothing.
 */
export type RelatedRow = {
  href: string;
  label: string;
  sub?: string | null;
  amount?: { v: string; u: string } | null;
  /**
   * Short heading shown above the first row of each run of rows that share
   * it: « Même thème · 2024 », « Pour situer », « Dans le budget ». The
   * caller orders the rows; a block without groups renders as before.
   */
  group?: string | null;
};

export type RelatedBlock = {
  title: string;
  sub?: string | null;
  rows: RelatedRow[];
};

export default function RelatedLinks({ block }: { block: RelatedBlock | null | undefined }) {
  if (!block || block.rows.length === 0) return null;
  return (
    <div className="fx-v3 fx-related">
      <V3Section title={block.title} sub={block.sub ?? undefined}>
        {block.rows.map((r, i) => (
          <Fragment key={r.href}>
            {r.group && r.group !== block.rows[i - 1]?.group ? <p className="fx-related-group">{r.group}</p> : null}
            <V3Row
              href={r.href}
              label={r.label}
              subText={r.sub ?? undefined}
              amount={r.amount ? <V3Amt v={r.amount.v} u={r.amount.u} /> : undefined}
            />
          </Fragment>
        ))}
      </V3Section>
    </div>
  );
}
