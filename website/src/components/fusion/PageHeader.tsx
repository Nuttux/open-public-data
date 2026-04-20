import type { ReactNode } from "react";

type Props = {
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  /** Optional mono-style kicker, e.g. "01 · Budget". */
  kicker?: ReactNode;
};

/**
 * Sub-page hero — smaller than the landing hero, same design language.
 * Use at the top of every fusion page to announce the content below.
 */
export default function FusionPageHeader({ title, lede, actions, kicker }: Props) {
  return (
    <section className="fx-page-header">
      <div className="fx-wrap">
        {kicker && <div className="fx-page-kicker">{kicker}</div>}
        <h1 className="fx-page-title">{title}</h1>
        {lede && <p className="fx-page-lede">{lede}</p>}
        {actions && <div className="fx-page-actions">{actions}</div>}
      </div>
    </section>
  );
}
