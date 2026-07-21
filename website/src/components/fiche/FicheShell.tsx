import type { ReactNode } from "react";

/** Fiche container — constrains the column width; wraps every entity fiche. */
export default function FicheShell({ children }: { children: ReactNode }) {
  return <div className="fx-fiche fx-fiche-shell">{children}</div>;
}
