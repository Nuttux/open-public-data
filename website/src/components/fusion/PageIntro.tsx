import type { ReactNode } from "react";

type Props = {
  /** Kicker mono, sans numéro de chapitre (ex. "Budget"). */
  kicker?: ReactNode;
  title: ReactNode;
  /** Une seule ligne courte — le contexte, pas un paragraphe. */
  lede?: ReactNode;
  /** Ligne source en mono (datasets, portails). */
  meta?: ReactNode;
  /** YearPicker & co, alignés à droite du titre sur desktop. */
  actions?: ReactNode;
  /**
   * Bande de chiffres clés (composer avec <IntroStat/>) — remplace
   * l'ancienne section « Vue d'ensemble » (HeroNumber + KPIGrid).
   * Style hérité du header de la page Lieux.
   */
  stats?: ReactNode;
  /** Bandeaux (preview, budget voté…) rendus sous la rangée titre. */
  children?: ReactNode;
};

/** Un chiffre clé de la bande d'intro : valeur display + libellé mono. */
export function IntroStat({
  value,
  unit,
  label,
}: {
  value: ReactNode;
  unit?: ReactNode;
  label: ReactNode;
}) {
  return (
    <span className="fx-intro-stat">
      <b>
        {value}
        {unit && <span className="fx-intro-stat-unit">{unit}</span>}
      </b>{" "}
      <span className="fx-intro-stat-label">{label}</span>
    </span>
  );
}

/**
 * Header compact des pages d'exploration — remplace le trio
 * fx-page-header (titre 84px) + PageHook interlude + premier SectionHead.
 * Objectif : la première donnée visible dans le premier écran, desktop
 * comme mobile. Le hook partageable vit désormais sous la première viz
 * (PageHook variant="card").
 */
export default function PageIntro({ kicker, title, lede, meta, actions, stats, children }: Props) {
  return (
    <section className="fx-page-intro">
      <div className="fx-wrap">
        <div className="fx-intro-row">
          <div className="fx-intro-main">
            {kicker && <div className="fx-page-kicker">{kicker}</div>}
            <h1 className="fx-intro-title">{title}</h1>
            {lede && <p className="fx-intro-lede">{lede}</p>}
            {meta && <p className="fx-intro-meta">{meta}</p>}
          </div>
          {actions && <div className="fx-intro-actions">{actions}</div>}
        </div>
        {stats && <div className="fx-intro-stats">{stats}</div>}
        {children}
      </div>
    </section>
  );
}
