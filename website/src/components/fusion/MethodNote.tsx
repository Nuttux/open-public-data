import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Largeur max — par défaut 760px (lecture confortable sur desktop). */
  maxWidth?: number | string;
  /** Marge bas (16px par défaut, ajustable selon contexte). */
  marginBottom?: number;
  /** Marge haut (0 par défaut). */
  marginTop?: number;
  className?: string;
  /**
   * Si fourni, la note est repliée derrière un `<summary>` cliquable
   * (disclosure fermée par défaut) — garde source/méthode sans le mur de
   * texte. Réutilise le CSS `fx-cct-details` (marqueur masqué + chevron).
   */
  summary?: ReactNode;
};

/**
 * Note méthodologique : barre ocre + monospace italic small.
 *
 * Mirroir de `db-p-zoom-method-note` (Daily Bread §04 État) côté
 * `theme-fusion`. Utilisé pour signaler une approximation, un périmètre
 * non-attribué, une convention de calcul. Style strictement aligné sur la
 * version Daily Bread pour cohérence inter-pages.
 */
export default function MethodNote({
  children,
  maxWidth = 760,
  marginBottom = 0,
  marginTop = 0,
  className,
  summary,
}: Props) {
  const style: CSSProperties = {
    maxWidth,
    marginBottom,
    marginTop,
  };

  if (summary) {
    return (
      <details
        className={["fx-cct-details", className ?? ""].filter(Boolean).join(" ")}
        style={style}
      >
        <summary
          style={{
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 11,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ocre)",
            padding: "4px 0",
          }}
        >
          <span className="fx-cct-chev" aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>
            ›
          </span>
          {summary}
        </summary>
        <p className="fx-method-note" style={{ marginTop: 10 }}>
          {children}
        </p>
      </details>
    );
  }

  return (
    <p
      className={["fx-method-note", className ?? ""].filter(Boolean).join(" ")}
      style={style}
    >
      {children}
    </p>
  );
}
