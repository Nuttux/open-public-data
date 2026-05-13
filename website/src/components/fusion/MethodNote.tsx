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
}: Props) {
  const style: CSSProperties = {
    maxWidth,
    marginBottom,
    marginTop,
  };
  return (
    <p
      className={["fx-method-note", className ?? ""].filter(Boolean).join(" ")}
      style={style}
    >
      {children}
    </p>
  );
}
