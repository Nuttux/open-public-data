import type { ReactNode } from "react";

/** The provenance line closing a fiche. */
export default function FicheSourceFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="fx-fiche-sources">
      <p className="fx-footer-sources-meta">{children}</p>
    </footer>
  );
}
