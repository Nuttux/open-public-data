"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTrack } from "@/lib/analyticsContext";

type Props = {
  years: number[];
  /** Years voted but not executed (displayed in rouge). */
  votedYears?: number[];
  /** Years surfaced from non-consolidated sources (aperçu). Dashed treatment. */
  previewYears?: number[];
  /** Currently selected year. */
  current: number;
  /** Base path (e.g. "/fr/city/paris/budget"). The year is appended as ?year=YYYY. */
  basePath: string;
  /** Optional prefix label; defaults to "Exercice". */
  label?: string;
  /** Hover title for preview years — overridable for non-French pages
   *  (defaults to the historical French copy; additive, France unchanged). */
  previewTitle?: string;
};

/**
 * Year picker — Link-based, works without JavaScript (client component for
 * analytics tracking). Matches the mockup: ghost label on the left, each year
 * as a button with an active state (dark) and a distinct treatment for
 * voted-only years (red).
 */
export default function YearPicker({
  years,
  votedYears = [],
  previewYears = [],
  current,
  basePath,
  label = "Exercice",
  previewTitle = "Aperçu non-consolidé (délibérations)",
}: Props) {
  const votedSet = new Set(votedYears);
  const previewSet = new Set(previewYears);
  const track = useTrack();
  const pathname = usePathname();
  return (
    <div className="fx-year-picker">
      <span className="fx-yp-label">{label}</span>
      {years.map((y) => {
        const isVoted = votedSet.has(y);
        const isPreview = previewSet.has(y);
        const isOn = y === current;
        const cls = [
          "fx-yp-btn",
          isOn && "fx-yp-on",
          isVoted && "fx-yp-voted",
          isPreview && "fx-yp-preview",
          isOn && isVoted && "fx-yp-on-voted",
          isOn && isPreview && "fx-yp-on-preview",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <Link
            key={y}
            href={`${basePath}?year=${y}`}
            className={cls}
            scroll={false}
            title={isPreview ? previewTitle : undefined}
            onClick={() => {
              if (y === current) return;
              track("year_change", {
                page: pathname,
                year_from: current,
                year_to: y,
                is_voted: isVoted,
                is_preview: isPreview,
              });
            }}
          >
            {y}
            {isPreview && <span className="fx-yp-preview-dot" aria-hidden>•</span>}
          </Link>
        );
      })}
    </div>
  );
}
