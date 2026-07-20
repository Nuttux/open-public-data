"use client";

import type { ReactNode } from "react";

export type FicheKpi = {
  label: ReactNode;
  value: ReactNode;
  /** Rendered as the small unit span next to the value (e.g. "M €"). */
  unit?: ReactNode;
};

/**
 * The standard 4-column KPI row at the top of every entity fiche
 * (`fx-fiche-kpis`). Markup extracted verbatim from AssociationFiche.
 */
export default function FicheKpis({ items }: { items: FicheKpi[] }) {
  return (
    <div className="fx-fiche-kpis">
      {items.map((k, i) => (
        <div className="fx-fiche-kpi" key={i}>
          <div className="fx-fiche-kpi-label">{k.label}</div>
          <div className="fx-fiche-kpi-value tnum">
            {k.value}
            {k.unit != null && <span className="u">{k.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
