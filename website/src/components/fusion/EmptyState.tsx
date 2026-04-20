import type { ReactNode } from "react";

type Props = {
  label: ReactNode;
  title: ReactNode;
  body: ReactNode;
  actions?: ReactNode;
};

/**
 * Empty-state block — used for sections that have nothing to show yet
 * (e.g. "Exécution 2026" quand les comptes ne sont pas encore publiés).
 */
export default function EmptyState({ label, title, body, actions }: Props) {
  return (
    <div className="fx-empty">
      <div className="fx-empty-label">{label}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {actions && <div className="fx-empty-actions">{actions}</div>}
    </div>
  );
}
