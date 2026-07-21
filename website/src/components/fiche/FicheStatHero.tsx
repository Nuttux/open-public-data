import type { ReactNode } from "react";

/** The one hero-sized figure at the top of a fiche + its caption. */
export default function FicheStatHero({
  value,
  caption,
}: {
  value: ReactNode;
  caption: ReactNode;
}) {
  return (
    <div className="fx-fiche-stat">
      <div className="fx-fiche-stat-num">{value}</div>
      <div className="fx-fiche-stat-cap">{caption}</div>
    </div>
  );
}
