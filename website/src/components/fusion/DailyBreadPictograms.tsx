/**
 * Pictogrammes SVG custom — section §07 Synthèse de Daily Bread.
 *
 * Style aligné palette fusion : ligne pure, géométrique, stroke 1.75,
 * cohérent avec le ton typographique Inter Tight + Instrument Serif.
 *
 * Tous les pictos partagent : viewBox 0 0 32 32, fill none,
 * stroke="currentColor", linecap/join "round". Couleur héritée du parent
 * (utiliser style.color ou prop `color`).
 *
 * Pas d'emoji — c'est volontaire (cf. mémoire `feedback_no_fake_official_marks`).
 */

type IconProps = {
  size?: number;
  color?: string;
  className?: string;
};

const make = (path: React.ReactNode) =>
  function Picto({ size = 32, color, className }: IconProps) {
    return (
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        fill="none"
        stroke={color ?? "currentColor"}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
      >
        {path}
      </svg>
    );
  };

/** Santé — croix médicale stylisée dans un cercle. */
export const PictoSante = make(
  <>
    <circle cx={16} cy={16} r={12} />
    <path d="M16 10 V22" />
    <path d="M10 16 H22" />
  </>,
);

/** Retraites — silhouette assise + horloge stylisée (arc + aiguille). */
export const PictoRetraite = make(
  <>
    <circle cx={16} cy={16} r={12} />
    <path d="M16 10 V16 L20 18" />
    <path d="M11 22 H21" strokeDasharray="2 2" />
  </>,
);

/** École — livre ouvert posé. */
export const PictoEcole = make(
  <>
    <path d="M4 8 L16 11 L28 8" />
    <path d="M4 8 V24" />
    <path d="M28 8 V24" />
    <path d="M16 11 V25" />
    <path d="M4 24 L16 25 L28 24" />
  </>,
);

/** Transport — bus stylisé géométrique. */
export const PictoTransport = make(
  <>
    <rect x={5} y={7} width={22} height={16} rx={2} />
    <path d="M5 17 H27" />
    <path d="M9 23 V25" />
    <path d="M23 23 V25" />
    <circle cx={10} cy={20} r={1} fill="currentColor" stroke="none" />
    <circle cx={22} cy={20} r={1} fill="currentColor" stroke="none" />
  </>,
);

/** Dette — euro avec courbe descendante (charge). */
export const PictoDette = make(
  <>
    <path d="M22 9 C19 7, 13 7, 11 12 C9 17, 13 21, 16 22 C19 23, 22 22, 23 20" />
    <path d="M7 13 H16" />
    <path d="M7 17 H14" />
  </>,
);

/** Mapping helper : key équivalent → composant picto. */
export type EquivalentKey =
  | "sante"
  | "retraite"
  | "ecole"
  | "transport"
  | "dette";

export function getPictoForKey(
  key: EquivalentKey,
): React.ComponentType<IconProps> {
  switch (key) {
    case "sante":
      return PictoSante;
    case "retraite":
      return PictoRetraite;
    case "ecole":
      return PictoEcole;
    case "transport":
      return PictoTransport;
    case "dette":
      return PictoDette;
  }
}
