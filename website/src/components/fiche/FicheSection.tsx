import type { ReactNode } from "react";

/** A titled fiche section — mono-caps heading, optional sub-line, then body. */
export default function FicheSection({
  title,
  sub,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="fx-fiche-block">
      <h2 className="fx-fiche-h2">{title}</h2>
      {sub ? <p className="fx-fiche-sub">{sub}</p> : null}
      {children}
    </section>
  );
}
