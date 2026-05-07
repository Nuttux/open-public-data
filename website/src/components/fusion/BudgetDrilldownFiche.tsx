"use client";

import Link from "next/link";
import { useT, useLocale } from "@/lib/localeContext";
import DrilldownBreadcrumb, {
  type DrilldownBreadcrumbCrumb,
} from "./DrilldownBreadcrumb";
import type {
  DrilldownLevel2Entry,
  DrilldownLevel3Entry,
  DrilldownLevel4Entry,
  DrilldownBucket,
  AggregationEntry,
  LocalScopeBlock,
} from "@/lib/budget-drilldown";

type Mode =
  | { kind: "level2"; level2: DrilldownLevel2Entry }
  | { kind: "level3"; level2: DrilldownLevel2Entry; level3: DrilldownLevel3Entry }
  | {
      kind: "level4";
      level2: DrilldownLevel2Entry;
      level3: DrilldownLevel3Entry;
      level4: DrilldownLevel4Entry;
    }
  | {
      kind: "aggregation";
      aggregation: AggregationEntry;
      resolvedMissions: DrilldownLevel2Entry[];
    }
  | {
      kind: "scope";
      /** "dept" ou "region" — sert à router les liens enfants vers /dept/* ou /region/*. */
      scope: "dept" | "region";
      block: LocalScopeBlock;
      level2: DrilldownLevel2Entry;
    }
  | {
      kind: "scope-level3";
      scope: "dept" | "region";
      block: LocalScopeBlock;
      level2: DrilldownLevel2Entry;
      level3: DrilldownLevel3Entry;
    };

/**
 * Décoration €/an national + €/mois personnel — calculée côté server par
 * les pages drawer/standalone et passée déjà résolue. Toutes les valeurs
 * sont issues du pipeline (pas de hardcode).
 *
 * Si `personalMonthlyEur` est null, l'utilisateur n'a pas de profil
 * (pas de query string ?net=) → on n'affiche pas la ligne "sur ton profil".
 *
 * `nationalAnnualLabel` est déjà formaté (Md€/M€/€) côté caller.
 */
type AmountDecorations = {
  /** Label compact "60,0 Md€/an" (ou null si non disponible). */
  nationalAnnualLabel: string | null;
  /** €/mois entier formaté locale-aware (ou null si pas de profil). */
  personalMonthlyLabel: string | null;
  /** Pour calculer les sub-row €/mois enfants. Null = pas de profil. */
  parentPersonalMonthlyEur: number | null;
};

type LegacyProps = {
  bucket: DrilldownBucket;
  bucketKey: "secu" | "etat" | "local";
  level2: DrilldownLevel2Entry;
  level3?: DrilldownLevel3Entry;
  level4?: DrilldownLevel4Entry;
  isStub?: boolean;
  amounts?: AmountDecorations;
  breadcrumb?: DrilldownBreadcrumbCrumb[];
  /** Query string profil à propager aux liens enfants (level3/level4/agg). */
  profileQuery?: string;
};

type ScopeProps = {
  bucket: DrilldownBucket;
  bucketKey: "local";
  scope: "dept" | "region";
  scopeBlock: LocalScopeBlock;
  level2: DrilldownLevel2Entry;
  /** Optional sub-fonction (M52 niveau 2 grafted as level3) — leaf view. */
  level3?: DrilldownLevel3Entry;
  isStub?: boolean;
  amounts?: AmountDecorations;
  breadcrumb?: DrilldownBreadcrumbCrumb[];
  profileQuery?: string;
};

type AggregationProps = {
  bucket: DrilldownBucket;
  bucketKey: "etat";
  aggregation: AggregationEntry;
  resolvedMissions: DrilldownLevel2Entry[];
  isStub?: boolean;
  amounts?: AmountDecorations;
  breadcrumb?: DrilldownBreadcrumbCrumb[];
  profileQuery?: string;
};

type Props = LegacyProps | ScopeProps | AggregationProps;

function isAggProps(p: Props): p is AggregationProps {
  return (p as AggregationProps).aggregation !== undefined;
}
function isScopeProps(p: Props): p is ScopeProps {
  return (p as ScopeProps).scope !== undefined;
}

/**
 * Format un €/mois entier — locale-aware, fallback 0 si non-fini.
 */
function fmtMonthly(amount: number, locale: "fr" | "en"): string {
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  return Math.round(amount).toLocaleString(
    locale === "en" ? "en-GB" : "fr-FR",
  );
}

/**
 * Suffixe une URL avec le query string profil (sans dupliquer le `?`).
 */
function withProfile(href: string, profileQuery?: string): string {
  if (!profileQuery || href === "#") return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}${profileQuery}`;
}

/**
 * Contenu interne de la fiche drill-down — partagé entre la page drawer
 * interceptée et la page standalone. Lecture pure, aucune logique business :
 * tous les chiffres viennent du loader (pas de hardcode dans le composant).
 *
 * Modes :
 *   - level2 (avec level3 children cliquables si présents)
 *   - level3 (avec level4 children cliquables si présents)
 *   - level4 (feuille — pas d'enfants)
 *   - aggregation (liste des missions level2 cliquables)
 *   - scope (dept/region — comportement level2 mais URL dérivée du scope)
 *
 * Décoration optionnelle :
 *   - amounts : €/an national + €/mois personnel (calculés côté server)
 *   - breadcrumb : chemin drill-down (rendu en haut)
 *   - profileQuery : query string profil propagé aux enfants
 */
export default function BudgetDrilldownFiche(props: Props) {
  const t = useT();
  const { locale } = useLocale();
  const { bucket, bucketKey, isStub, amounts, breadcrumb, profileQuery } =
    props;

  // Résolution du mode (sans assumption sur les optional props).
  const mode: Mode = isAggProps(props)
    ? {
        kind: "aggregation",
        aggregation: props.aggregation,
        resolvedMissions: props.resolvedMissions,
      }
    : isScopeProps(props)
      ? props.level3
        ? {
            kind: "scope-level3",
            scope: props.scope,
            block: props.scopeBlock,
            level2: props.level2,
            level3: props.level3,
          }
        : {
            kind: "scope",
            scope: props.scope,
            block: props.scopeBlock,
            level2: props.level2,
          }
      : props.level4 && props.level3
        ? {
            kind: "level4",
            level2: props.level2,
            level3: props.level3,
            level4: props.level4,
          }
        : props.level3
          ? { kind: "level3", level2: props.level2, level3: props.level3 }
          : { kind: "level2", level2: props.level2 };

  const bucketLabel = locale === "en" ? bucket.label_en : bucket.label_fr;
  const colorClass = `db-fiche-${bucketKey}`;

  return (
    <div className={`db-fiche ${colorClass}`}>
      {breadcrumb && breadcrumb.length > 0 && (
        <DrilldownBreadcrumb
          path={breadcrumb}
          ariaLabel={
            locale === "en" ? "Drill-down position" : "Position drill-down"
          }
        />
      )}

      {isStub && (
        <p className="db-fiche-stub-warn">{t("db.drilldown.stub_warn")}</p>
      )}

      {(() => {
        if (mode.kind === "aggregation") {
          return renderAggregation({
            t,
            locale,
            bucketKey,
            bucketLabel,
            aggregation: mode.aggregation,
            resolvedMissions: mode.resolvedMissions,
            amounts,
            profileQuery,
          });
        }

        // level2 / level3 / level4 / scope share the same "lead + source + children" shell.
        const leadEntry =
          mode.kind === "level4"
            ? mode.level4
            : mode.kind === "scope-level3"
              ? mode.level3
              : mode.kind === "level3"
                ? mode.level3
                : mode.level2;

        const parentLabel = (() => {
          if (mode.kind === "level3" || mode.kind === "level4") {
            const parent = mode.level2;
            return locale === "en" ? parent.label_en : parent.label_fr;
          }
          if (mode.kind === "scope") {
            return locale === "en" ? mode.block.label_en : mode.block.label_fr;
          }
          if (mode.kind === "scope-level3") {
            const parent = mode.level2;
            return locale === "en" ? parent.label_en : parent.label_fr;
          }
          return null;
        })();

        const grandparentLabel =
          mode.kind === "level4"
            ? locale === "en"
              ? mode.level3.label_en
              : mode.level3.label_fr
            : null;

        const label = locale === "en" ? leadEntry.label_en : leadEntry.label_fr;
        const sharePct = Math.round((leadEntry.share_of_parent ?? 0) * 100);
        const shareParent =
          mode.kind === "level4"
            ? (grandparentLabel ?? "")
            : mode.kind === "level3" || mode.kind === "scope-level3"
              ? (parentLabel ?? "")
              : mode.kind === "scope"
                ? (parentLabel ?? "")
                : bucketLabel;

        // Children list — level2 → level3 ; level3 → level4 ;
        // scope (dept/region level2) → grafted level3 (sub-fonctions OFGL M52).
        const childList: Array<{
          key: string;
          label_fr: string;
          label_en: string;
          share_of_parent: number;
        }> | null =
          mode.kind === "level2"
            ? (mode.level2.level3 ?? null)
            : mode.kind === "level3"
              ? (mode.level3.level4 ?? null)
              : mode.kind === "scope"
                ? (mode.level2.level3 ?? null)
                : null;

        const buildChildHref = (childKey: string): string => {
          if (mode.kind === "level2") {
            return `/ville/paris/daily-bread/bucket/${bucketKey}/${encodeURIComponent(
              mode.level2.key,
            )}/${encodeURIComponent(childKey)}`;
          }
          if (mode.kind === "level3") {
            return `/ville/paris/daily-bread/bucket/${bucketKey}/${encodeURIComponent(
              mode.level2.key,
            )}/${encodeURIComponent(mode.level3.key)}/${encodeURIComponent(
              childKey,
            )}`;
          }
          if (mode.kind === "scope") {
            return `/ville/paris/daily-bread/bucket/${bucketKey}/${mode.scope}/${encodeURIComponent(
              mode.level2.key,
            )}/${encodeURIComponent(childKey)}`;
          }
          return "#";
        };

        const hasChildren = !!childList && childList.length > 0;

        const personalMonthlyLabel = amounts?.personalMonthlyLabel ?? null;
        const nationalAnnualLabel = amounts?.nationalAnnualLabel ?? null;
        const parentPersonalMonthlyEur =
          amounts?.parentPersonalMonthlyEur ?? null;

        return (
          <>
            <div className="db-fiche-lead">
              <div className="db-fiche-lead-row">
                <span className="db-fiche-lead-pct tnum">{sharePct}%</span>
                <span className="db-fiche-lead-pct-label">
                  {t("db.drilldown.share_of_parent").replace(
                    "{parent}",
                    shareParent,
                  )}
                </span>
              </div>
              <p className="db-fiche-lead-name">{label}</p>

              {(nationalAnnualLabel || personalMonthlyLabel) && (
                <dl className="db-fiche-amounts">
                  {nationalAnnualLabel && (
                    <div className="db-fiche-amount-row">
                      <dt className="db-fiche-amount-key">
                        {t("db.drilldown.amount.national")}
                      </dt>
                      <dd className="db-fiche-amount-val tnum">
                        {nationalAnnualLabel}
                      </dd>
                    </div>
                  )}
                  {personalMonthlyLabel && (
                    <div className="db-fiche-amount-row db-fiche-amount-row-personal">
                      <dt className="db-fiche-amount-key">
                        {t("db.drilldown.amount.personal")}
                      </dt>
                      <dd className="db-fiche-amount-val tnum">
                        {personalMonthlyLabel}
                        <span className="db-fiche-amount-unit">
                          {" "}
                          €/{locale === "en" ? "mo" : "mois"}
                        </span>
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </div>

            {leadEntry.source && (
              <div className="db-fiche-section">
                <p className="db-fiche-section-head">
                  {t("db.drilldown.source_label")}
                </p>
                <p className="db-fiche-source">
                  {leadEntry.source_url ? (
                    <a
                      href={leadEntry.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="db-fiche-source-link"
                    >
                      {leadEntry.source} ↗
                    </a>
                  ) : (
                    <span>{leadEntry.source}</span>
                  )}
                </p>
              </div>
            )}

            {hasChildren && childList && (
              <div className="db-fiche-section">
                <p className="db-fiche-section-head">
                  {t("db.drilldown.click_to_open")}
                </p>
                <ul className="db-fiche-children">
                  {childList.map((child) => {
                    const childLabel =
                      locale === "en" ? child.label_en : child.label_fr;
                    const childPct = Math.round(
                      (child.share_of_parent ?? 0) * 100,
                    );
                    const href = withProfile(
                      buildChildHref(child.key),
                      profileQuery,
                    );
                    const childMonthly =
                      parentPersonalMonthlyEur !== null
                        ? parentPersonalMonthlyEur *
                          (child.share_of_parent ?? 0)
                        : null;
                    return (
                      <li key={child.key}>
                        <Link
                          href={href}
                          className="db-fiche-child"
                          prefetch={false}
                        >
                          <span className="db-fiche-child-pct tnum">
                            {childPct}%
                          </span>
                          <span className="db-fiche-child-name">
                            {childLabel}
                          </span>
                          {childMonthly !== null && childMonthly > 0 && (
                            <span className="db-fiche-child-monthly tnum">
                              {fmtMonthly(childMonthly, locale)}{" "}
                              €/{locale === "en" ? "mo" : "mois"}
                            </span>
                          )}
                          <span aria-hidden className="db-fiche-child-chevron">
                            →
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Feuille (pas d'enfants attendus) ou pas d'enfants livrés */}
            {!hasChildren &&
              mode.kind !== "level4" &&
              mode.kind !== "scope-level3" && (
                <div className="db-fiche-section">
                  <p className="db-fiche-detail-unavailable">
                    {t("db.drilldown.detail_unavailable").replace(
                      "{source}",
                      leadEntry.source ?? "",
                    )}
                  </p>
                </div>
              )}
          </>
        );
      })()}
    </div>
  );
}

// ─── Sous-rendu : aggregation ─────────────────────────────────────────────

function renderAggregation({
  t,
  locale,
  bucketKey,
  bucketLabel,
  aggregation,
  resolvedMissions,
  amounts,
  profileQuery,
}: {
  t: (k: string) => string;
  locale: "fr" | "en";
  bucketKey: "secu" | "etat" | "local";
  bucketLabel: string;
  aggregation: AggregationEntry;
  resolvedMissions: DrilldownLevel2Entry[];
  amounts?: AmountDecorations;
  profileQuery?: string;
}) {
  const label =
    locale === "en" ? aggregation.label_en : aggregation.label_fr;
  const sharePct = Math.round((aggregation.share_of_parent ?? 0) * 100);
  const introTpl = t("db.drilldown.aggregation_intro");
  const intro = introTpl
    .replace("{count}", String(resolvedMissions.length))
    .replace("{label}", label);

  const personalMonthlyLabel = amounts?.personalMonthlyLabel ?? null;
  const nationalAnnualLabel = amounts?.nationalAnnualLabel ?? null;
  const parentPersonalMonthlyEur = amounts?.parentPersonalMonthlyEur ?? null;

  return (
    <>
      <div className="db-fiche-lead">
        <div className="db-fiche-lead-row">
          <span className="db-fiche-lead-pct tnum">{sharePct}%</span>
          <span className="db-fiche-lead-pct-label">
            {t("db.drilldown.share_of_parent").replace("{parent}", bucketLabel)}
          </span>
        </div>
        <p className="db-fiche-lead-name">{label}</p>

        {(nationalAnnualLabel || personalMonthlyLabel) && (
          <dl className="db-fiche-amounts">
            {nationalAnnualLabel && (
              <div className="db-fiche-amount-row">
                <dt className="db-fiche-amount-key">
                  {t("db.drilldown.amount.national")}
                </dt>
                <dd className="db-fiche-amount-val tnum">
                  {nationalAnnualLabel}
                </dd>
              </div>
            )}
            {personalMonthlyLabel && (
              <div className="db-fiche-amount-row db-fiche-amount-row-personal">
                <dt className="db-fiche-amount-key">
                  {t("db.drilldown.amount.personal")}
                </dt>
                <dd className="db-fiche-amount-val tnum">
                  {personalMonthlyLabel}
                  <span className="db-fiche-amount-unit">
                    {" "}
                    €/{locale === "en" ? "mo" : "mois"}
                  </span>
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {aggregation.source && (
        <div className="db-fiche-section">
          <p className="db-fiche-section-head">
            {t("db.drilldown.source_label")}
          </p>
          <p className="db-fiche-source">
            {aggregation.source_url ? (
              <a
                href={aggregation.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="db-fiche-source-link"
              >
                {aggregation.source} ↗
              </a>
            ) : (
              <span>{aggregation.source}</span>
            )}
          </p>
        </div>
      )}

      <div className="db-fiche-section">
        <p className="db-fiche-section-head">{intro}</p>
        {resolvedMissions.length === 0 ? (
          <p className="db-fiche-detail-unavailable">
            {t("db.drilldown.detail_unavailable").replace("{source}", "")}
          </p>
        ) : (
          <ul className="db-fiche-agg-grid">
            {resolvedMissions.map((mission) => {
              const mLabel =
                locale === "en" ? mission.label_en : mission.label_fr;
              const mPct = Math.round((mission.share_of_parent ?? 0) * 100);
              const href = withProfile(
                `/ville/paris/daily-bread/bucket/${bucketKey}/${encodeURIComponent(
                  mission.key,
                )}`,
                profileQuery,
              );
              // L'agg parent englobe TOUTES les missions de la liste (somme
              // des shares_of_state). Donc share de la mission DANS l'agg =
              // mission.share_of_parent / sum(shares).
              const sumShares = resolvedMissions.reduce(
                (acc, m) => acc + (m.share_of_parent ?? 0),
                0,
              );
              const childMonthly =
                parentPersonalMonthlyEur !== null && sumShares > 0
                  ? parentPersonalMonthlyEur *
                    ((mission.share_of_parent ?? 0) / sumShares)
                  : null;
              return (
                <li key={mission.key}>
                  <Link
                    href={href}
                    className="db-fiche-agg-card"
                    prefetch={false}
                  >
                    <span className="db-fiche-agg-card-pct tnum">{mPct}%</span>
                    <span className="db-fiche-agg-card-name">{mLabel}</span>
                    {childMonthly !== null && childMonthly > 0 && (
                      <span className="db-fiche-agg-card-monthly tnum">
                        {fmtMonthly(childMonthly, locale)}{" "}
                        €/{locale === "en" ? "mo" : "mois"}
                      </span>
                    )}
                    <span
                      aria-hidden
                      className="db-fiche-agg-card-chevron"
                    >
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
