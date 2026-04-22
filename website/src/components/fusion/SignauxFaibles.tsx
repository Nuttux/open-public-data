import Link from "next/link";
import type { ReactNode } from "react";

export type Signal = {
  flag: ReactNode;
  title: ReactNode;
  body: ReactNode;
  stats: { label: ReactNode; value: ReactNode }[];
  cta?: { href: string; label: ReactNode };
};

type Props = {
  items: Signal[];
  /** Optional section-head description shown above the grid. */
  note?: ReactNode;
};

/**
 * Signaux faibles — 2-col card grid with ocre accent. Used on marchés and
 * investissements pages to surface contracts/projects that warrant review.
 */
export default function SignauxFaibles({ items, note }: Props) {
  return (
    <div>
      {note && <p className="fx-note">{note}</p>}
      <div className="fx-signaux">
        {items.map((s, i) => (
          <div key={i} className="fx-signal">
            <div className="fx-signal-flag">{s.flag}</div>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
            <div className="fx-signal-stats">
              {s.stats.map((st, j) => (
                <div key={j}>
                  <div className="fx-signal-stat-label">{st.label}</div>
                  <div className="fx-signal-stat-value">{st.value}</div>
                </div>
              ))}
            </div>
            {s.cta && (
              <Link href={s.cta.href} className="fx-signal-cta">
                {s.cta.label} →
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
