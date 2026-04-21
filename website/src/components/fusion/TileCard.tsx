import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  href: string;
  /** Top-left sequence number. Omit for tiles that aren't part of a numbered set. */
  number?: string;
  kind: ReactNode;
  title: ReactNode;
  description: ReactNode;
  preview: ReactNode;
  kpi: ReactNode;
  kpiUnit?: ReactNode;
  kpiDelta?: ReactNode;
  className?: string;
};

/**
 * The landing-grid tile. Hover inverts to dark (ink) background, the
 * optional `preview` slot should be an SVG silhouette whose strokes
 * and fills use the `stroke` / `fill` / `stroke-sig` / `fill-sig`
 * class conventions so the hover swap works.
 */
export default function TileCard({
  href,
  number,
  kind,
  title,
  description,
  preview,
  kpi,
  kpiUnit,
  kpiDelta,
  className,
}: Props) {
  return (
    <Link href={href} className={["fx-tile", className ?? ""].filter(Boolean).join(" ")}>
      <div className="fx-tile-top">
        {number && <span className="fx-tile-n">{number}</span>}
        <span className="fx-tile-kind">{kind}</span>
      </div>
      <div className="fx-tile-preview">{preview}</div>
      <h3 className="fx-tile-title">{title}</h3>
      <p className="fx-tile-desc">{description}</p>
      <div className="fx-tile-bot">
        <span className="fx-tile-kpi-wrap">
          <span className="fx-tile-kpi tnum">
            {kpi}
            {kpiUnit && <span className="fx-tile-kpi-u">{kpiUnit}</span>}
          </span>
          {kpiDelta && <span className="fx-tile-kpi-delta">{kpiDelta}</span>}
        </span>
        <span className="fx-tile-arrow" aria-hidden="true">→</span>
      </div>
    </Link>
  );
}
