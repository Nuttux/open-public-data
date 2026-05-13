import type { ReactNode } from "react";

type Props = {
  number?: string;
  kind?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  className?: string;
};

/**
 * "01 · Titre" section heading used at the top of every page section
 * in 06-fusion. `number` renders the mono-style "01", `kind` the short
 * category label that follows the bullet.
 */
export default function SectionHead({ number, kind, title, subtitle, className }: Props) {
  return (
    <div className={["fx-sec-head", className ?? ""].filter(Boolean).join(" ")}>
      {(number || kind) && (
        <div className="fx-sec-meta">
          {number && <span className="fx-sec-n">{number}</span>}
          {number && kind && <span className="fx-sec-dot" aria-hidden="true">·</span>}
          {kind && <span className="fx-sec-kind">{kind}</span>}
        </div>
      )}
      {title && <h2 className="fx-sec-title">{title}</h2>}
      {subtitle && <p className="fx-sec-sub">{subtitle}</p>}
    </div>
  );
}
