import Link from "next/link";

/**
 * Daily Bread drill-down breadcrumb.
 *
 * Pattern : Daily Bread › État › Sécurité › Police › Programme 144 › Action 03
 *
 * - Le dernier maillon est le nœud courant — non cliquable, marqué
 *   `aria-current="page"`.
 * - Tous les autres maillons doivent être cliquables (href fourni).
 * - Style mono small, hérite des vars `theme-fusion`.
 *
 * Sert dans les drawer + standalone pages de drill-down. C'est un composant
 * server-friendly (juste des Link Next + spans) — aucun hook client.
 */
export type DrilldownBreadcrumbCrumb = {
  label: string;
  href?: string;
};

export default function DrilldownBreadcrumb({
  path,
  ariaLabel = "Drill-down position",
}: {
  path: DrilldownBreadcrumbCrumb[];
  ariaLabel?: string;
}) {
  if (!path || path.length === 0) return null;
  return (
    <nav aria-label={ariaLabel} className="db-breadcrumb">
      <ol className="db-breadcrumb-list">
        {path.map((crumb, i) => {
          const isLast = i === path.length - 1;
          return (
            <li key={i} className="db-breadcrumb-item">
              {isLast || !crumb.href ? (
                <span
                  className="db-breadcrumb-current"
                  aria-current={isLast ? "page" : undefined}
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="db-breadcrumb-link"
                  prefetch={false}
                >
                  {crumb.label}
                </Link>
              )}
              {!isLast && (
                <span aria-hidden className="db-breadcrumb-sep">
                  {" › "}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
