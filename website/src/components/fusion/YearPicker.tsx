import Link from "next/link";

type Props = {
  years: number[];
  /** Years voted but not executed (displayed in rouge). */
  votedYears?: number[];
  /** Years surfaced from non-consolidated sources (aperçu). Dashed treatment. */
  previewYears?: number[];
  /** Currently selected year. */
  current: number;
  /** Base path (e.g. "/budget"). The year is appended as ?year=YYYY. */
  basePath: string;
  /** Optional prefix label; defaults to "Exercice". */
  label?: string;
};

/**
 * Year picker — Link-based, works without JavaScript. Server-component safe.
 * Matches the mockup: ghost label on the left, each year as a button with
 * an active state (dark) and a distinct treatment for voted-only years (red).
 */
export default function YearPicker({
  years,
  votedYears = [],
  previewYears = [],
  current,
  basePath,
  label = "Exercice",
}: Props) {
  const votedSet = new Set(votedYears);
  const previewSet = new Set(previewYears);
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
            title={isPreview ? "Aperçu non-consolidé (délibérations)" : undefined}
          >
            {y}
            {isPreview && <span className="fx-yp-preview-dot" aria-hidden>•</span>}
          </Link>
        );
      })}
    </div>
  );
}
