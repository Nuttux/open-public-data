/**
 * Pictogrammes SVG — fallback pour les projets sans photo dédiée ni générique.
 *
 * 14 typologies. Ligne simple sur fond ocre/ink, cohérent avec le design fusion.
 * Tous les pictos partagent : viewBox 0 0 48 48, stroke-width 1.5, fill none.
 */

type IconProps = { size?: number; className?: string };

const base = (path: React.ReactNode) => function Picto({ size = 48, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {path}
    </svg>
  );
};

const Ecole = base(
  <>
    <path d="M4 20 L24 10 L44 20 L24 30 Z" />
    <path d="M12 24 V36 M36 24 V36" />
    <path d="M24 30 V38" />
    <path d="M12 36 H36" />
  </>,
);

const College = base(
  <>
    <rect x={8} y={14} width={32} height={26} />
    <path d="M8 14 L24 6 L40 14" />
    <path d="M20 40 V28 H28 V40" />
    <path d="M14 22 H18 M30 22 H34" />
  </>,
);

const Lycee = base(
  <>
    <rect x={6} y={16} width={36} height={24} />
    <path d="M10 16 V8 H38 V16" />
    <path d="M14 24 H20 M28 24 H34 M14 32 H20 M28 32 H34" />
    <path d="M22 40 V32 H26 V40" />
  </>,
);

const Creche = base(
  <>
    <path d="M24 10 C18 10, 14 14, 14 20 L14 32 C14 36, 18 40, 24 40 C30 40, 34 36, 34 32 L34 20 C34 14, 30 10, 24 10 Z" />
    <circle cx={20} cy={22} r={1.2} fill="currentColor" />
    <circle cx={28} cy={22} r={1.2} fill="currentColor" />
    <path d="M20 30 Q24 33 28 30" />
  </>,
);

const Gymnase = base(
  <>
    <rect x={6} y={14} width={36} height={22} rx={2} />
    <path d="M18 14 V36 M30 14 V36" />
    <path d="M6 25 H42" />
    <circle cx={24} cy={25} r={3} />
  </>,
);

const Piscine = base(
  <>
    <path d="M4 32 Q10 28, 16 32 T28 32 T40 32 V40 H4 Z" />
    <circle cx={30} cy={14} r={3} />
    <path d="M28 18 L22 24 L18 22" />
    <path d="M4 22 Q10 18, 16 22 T28 22" strokeDasharray="2 2" />
  </>,
);

const Bibliotheque = base(
  <>
    <rect x={8} y={8} width={6} height={32} />
    <rect x={16} y={12} width={6} height={28} />
    <rect x={26} y={8} width={6} height={32} />
    <rect x={34} y={14} width={6} height={26} />
    <path d="M6 40 H42" />
  </>,
);

const EspaceVert = base(
  <>
    <path d="M16 38 C12 38, 8 34, 10 28 C8 24, 12 20, 16 22 C16 16, 22 14, 26 18 C30 14, 36 18, 34 24 C38 26, 38 32, 32 34 C32 38, 26 40, 22 36" />
    <path d="M24 24 V40" />
    <path d="M24 32 L20 28 M24 32 L28 28" />
  </>,
);

const Voirie = base(
  <>
    <path d="M10 6 L6 42 M38 6 L42 42" />
    <path d="M24 8 V14 M24 20 V26 M24 32 V38" strokeDasharray="2 2" />
    <path d="M14 42 H34" />
  </>,
);

const LogementSocial = base(
  <>
    <rect x={8} y={8} width={32} height={34} />
    <path d="M14 14 H18 M22 14 H26 M30 14 H34" />
    <path d="M14 22 H18 M22 22 H26 M30 22 H34" />
    <path d="M14 30 H18 M22 30 H26 M30 30 H34" />
    <path d="M20 42 V36 H28 V42" />
  </>,
);

const EquipementCulturel = base(
  <>
    <path d="M8 20 L24 8 L40 20" />
    <path d="M12 20 V40 H36 V20" />
    <rect x={18} y={26} width={12} height={14} />
    <path d="M14 26 V36 M34 26 V36" />
  </>,
);

const EquipementSante = base(
  <>
    <rect x={8} y={10} width={32} height={30} rx={2} />
    <path d="M24 16 V34 M15 25 H33" strokeWidth={3} />
  </>,
);

const Administration = base(
  <>
    <path d="M6 18 L24 8 L42 18" />
    <path d="M8 18 V40 H40 V18" />
    <path d="M14 24 V36 M20 24 V36 M28 24 V36 M34 24 V36" />
    <path d="M6 40 H42" />
    <path d="M22 8 L26 8" />
  </>,
);

const Autre = base(
  <>
    <rect x={8} y={12} width={32} height={28} rx={2} />
    <path d="M16 12 V6 H32 V12" />
    <path d="M16 26 H32 M16 32 H24" />
  </>,
);

export const PROJET_PICTOGRAMS = {
  ecole: Ecole,
  college: College,
  lycee: Lycee,
  creche: Creche,
  gymnase: Gymnase,
  piscine: Piscine,
  bibliotheque: Bibliotheque,
  "espace-vert": EspaceVert,
  voirie: Voirie,
  "logement-social": LogementSocial,
  "equipement-culturel": EquipementCulturel,
  "equipement-sante": EquipementSante,
  administration: Administration,
  autre: Autre,
} as const;

export type ProjetTypologie = keyof typeof PROJET_PICTOGRAMS;

export function ProjetPictogram({
  typologie,
  size = 48,
  className,
}: {
  typologie: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const key = (typologie && typologie in PROJET_PICTOGRAMS ? typologie : "autre") as ProjetTypologie;
  const Icon = PROJET_PICTOGRAMS[key];
  return <Icon size={size} className={className} />;
}
