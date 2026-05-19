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
import type { AsideKeys } from "@/lib/editorial-asides";

/**
 * Format compact local d'un montant annuel (Md€/M€/€) — copie inline de
 * `formatAnnualCompact` (lib/daily-bread-profile.ts) pour éviter de tirer
 * un import server (`node:fs`) dans ce client component. Doit rester
 * synchronisé avec la version serveur.
 */
function fmtAnnualCompactClient(
  amountEur: number,
  locale: "fr" | "en",
): string {
  if (!Number.isFinite(amountEur) || amountEur <= 0) return "—";
  const sep = locale === "fr" ? "," : ".";
  const space = " ";
  if (amountEur >= 1e8) {
    const md = amountEur / 1e9;
    const s = md.toFixed(1).replace(".", sep);
    return `${s}${space}${locale === "en" ? "bn€" : "Md€"}`;
  }
  if (amountEur >= 1e6) {
    const m = amountEur / 1e6;
    const s = m.toFixed(0);
    return `${s}${space}M€`;
  }
  return `${Math.round(amountEur).toLocaleString(
    locale === "en" ? "en-GB" : "fr-FR",
  )}${space}€`;
}

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
    }
  | {
      /**
       * Vue scope-level (sans level2 sélectionné) : liste les fonctions du
       * bloc bloc-communal/dept/région pour donner un overview avant le
       * drill. Évite le bug "auto-jump" où cliquer Département envoyait
       * direct sur la 1re fonction (Santé) en masquant les autres.
       */
      kind: "scope-overview";
      scope: "bloc_communal" | "dept" | "region";
      level2List: DrilldownLevel2Entry[];
    };

/**
 * "Voix" éditoriale du drawer — détermine quelles colonnes (€/mois,
 * Md€/an, %) on affiche dans les sub-rows et les cards d'aggregation.
 *
 * - "perso" (/ville/<slug>/daily-bread) : on parle à L'utilisateur, on
 *   n'affiche QUE €/mois. Le Md€ est trop abstrait, le % redondant avec
 *   le lead header.
 * - "impersonal" (/france/budget) sans profil : on affiche QUE Md€/an
 *   (vue nationale impersonnelle).
 * - "impersonal" + profil cross-link (?net=...) : on affiche Md€/an +
 *   €/mois (les deux). Pas de %.
 *
 * Le % reste TOUJOURS visible dans le lead header — c'est l'info de
 * contexte parent ("39% PART DE SÉCURITÉ SOCIALE").
 *
 * Inféré depuis `basePath` : commence par `/ville/` → perso, sinon impersonal.
 */
type Voice = "perso" | "impersonal";

function inferVoice(basePath: string): Voice {
  return basePath.startsWith("/ville/") ? "perso" : "impersonal";
}

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
  /**
   * Montant annuel national brut (€) de l'entité parent — sert à projeter
   * le Md€ par sub-row enfant (sub-row = `parentNationalAnnualEur * child.share_of_parent`).
   * Null si la valeur n'a pas pu être résolue côté loader.
   */
  parentNationalAnnualEur: number | null;
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
  /** Préfixe URL pour les liens enfants — par défaut /ville/paris/daily-bread.
   *  Ex: "/france/budget" pour le drawer Budget Explorer. */
  basePath?: string;
  /** Asides éditoriaux ("Chiffres à retenir") — i18n keys, le composant
   *  appelle `t()` lui-même via le hook. Affichés en bas de la fiche. */
  editorialAsides?: AsideKeys[];
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
  basePath?: string;
  editorialAsides?: AsideKeys[];
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
  basePath?: string;
  editorialAsides?: AsideKeys[];
};

type ScopeOverviewProps = {
  bucket: DrilldownBucket;
  bucketKey: "local";
  /** "bloc_communal" | "dept" | "region" — détermine le préfixe URL des enfants. */
  scopeOverview: "bloc_communal" | "dept" | "region";
  /** Label du scope (ex "Bloc communal", "Niveau départemental"). */
  scopeLabel: string;
  /** Liste des fonctions level2 du bloc — toutes cliquables. */
  level2List: DrilldownLevel2Entry[];
  isStub?: boolean;
  amounts?: AmountDecorations;
  breadcrumb?: DrilldownBreadcrumbCrumb[];
  profileQuery?: string;
  basePath?: string;
  editorialAsides?: AsideKeys[];
};

type Props =
  | LegacyProps
  | ScopeProps
  | AggregationProps
  | ScopeOverviewProps;

function isAggProps(p: Props): p is AggregationProps {
  return (p as AggregationProps).aggregation !== undefined;
}
function isScopeOverviewProps(p: Props): p is ScopeOverviewProps {
  return (p as ScopeOverviewProps).scopeOverview !== undefined;
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
  const basePath = props.basePath ?? "/ville/paris/daily-bread";
  const editorialAsides = props.editorialAsides;
  const voice: Voice = inferVoice(basePath);
  const hasProfile = (amounts?.parentPersonalMonthlyEur ?? null) !== null;
  // Daily Bread (Approche A) : la "personal monthly" est en fait per-capita
  // (calculée comme nationalAnnual / pop / 12). Label "Par habitant" plutôt
  // que "Sur ton profil" pour cohérence avec le reste de Daily Bread.
  const isPerCapita = voice === "perso";
  const personalLabelKey = isPerCapita
    ? "db.drilldown.amount.per_capita"
    : "db.drilldown.amount.personal";
  // Context-aware column visibility :
  //  - Voice perso → €/mois only (cache % et Md€).
  //  - Voice impersonal sans profil → Md€/an only (cache % et €/mois).
  //  - Voice impersonal AVEC profil cross-link → Md€/an + €/mois (cache %).
  // Le % du lead header reste TOUJOURS visible (info de contexte parent).
  const showChildPct = false;
  const showChildAnnual = voice === "impersonal";
  const showChildMonthly = voice === "perso" || (voice === "impersonal" && hasProfile);
  // Variant CSS modifier appliqué sur .db-fiche-children et .db-fiche-agg-grid
  // pour ajuster grid-template-columns sans casser les autres drawers.
  const childrenVariant = (() => {
    if (voice === "perso") return "db-fiche-children-monthly-only";
    if (hasProfile) return "db-fiche-children-annual-monthly";
    return "db-fiche-children-annual-only";
  })();

  // Résolution du mode (sans assumption sur les optional props).
  const mode: Mode = isScopeOverviewProps(props)
    ? {
        kind: "scope-overview",
        scope: props.scopeOverview,
        level2List: props.level2List,
      }
    : isAggProps(props)
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
        if (mode.kind === "scope-overview") {
          // Cast safe : isScopeOverviewProps a déjà filtré au-dessus.
          const sp = props as ScopeOverviewProps;
          return renderScopeOverview({
            t,
            locale,
            scope: mode.scope,
            scopeLabel: sp.scopeLabel,
            level2List: mode.level2List,
            amounts,
            profileQuery,
            basePath,
            showChildAnnual,
            showChildMonthly,
            childrenVariant,
            personalLabelKey,
          });
        }
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
            basePath,
            showChildPct,
            showChildAnnual,
            showChildMonthly,
            childrenVariant,
            personalLabelKey,
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
        const _sharePct = Math.round((leadEntry.share_of_parent ?? 0) * 100);
        const _shareParent =
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
            return `${basePath}/bucket/${bucketKey}/${encodeURIComponent(
              mode.level2.key,
            )}/${encodeURIComponent(childKey)}`;
          }
          if (mode.kind === "level3") {
            return `${basePath}/bucket/${bucketKey}/${encodeURIComponent(
              mode.level2.key,
            )}/${encodeURIComponent(mode.level3.key)}/${encodeURIComponent(
              childKey,
            )}`;
          }
          if (mode.kind === "scope") {
            return `${basePath}/bucket/${bucketKey}/${mode.scope}/${encodeURIComponent(
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
        const parentNationalAnnualEur =
          amounts?.parentNationalAnnualEur ?? null;

        return (
          <>
            <div className="db-fiche-lead">
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
                        {t(personalLabelKey)}
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
                <ul className={`db-fiche-children ${childrenVariant}`}>
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
                    const childAnnualEur =
                      parentNationalAnnualEur !== null
                        ? parentNationalAnnualEur *
                          (child.share_of_parent ?? 0)
                        : null;
                    const childAnnualLabel =
                      childAnnualEur !== null && childAnnualEur > 0
                        ? fmtAnnualCompactClient(childAnnualEur, locale)
                        : null;
                    return (
                      <li key={child.key}>
                        <Link
                          href={href}
                          className="db-fiche-child"
                          prefetch={false}
                        >
                          {showChildAnnual && childAnnualLabel && (
                            <span className="db-fiche-child-annual tnum">
                              {childAnnualLabel}
                            </span>
                          )}
                          {showChildPct && (
                            <span className="db-fiche-child-pct tnum">
                              {childPct}%
                            </span>
                          )}
                          <span className="db-fiche-child-name">
                            {childLabel}
                          </span>
                          {showChildMonthly &&
                            childMonthly !== null &&
                            childMonthly > 0 && (
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

      {editorialAsides && editorialAsides.length > 0 && (
        <div className="db-fiche-section db-fiche-asides-section">
          <p className="db-fiche-section-head">
            {t("db.drilldown.asides.head")}
          </p>
          <ul className={`db-fiche-asides db-fiche-asides-${bucketKey}`}>
            {editorialAsides.map((a, i) => (
              <li key={i} className="db-fiche-aside">
                <p className="db-fiche-aside-num tnum">
                  {t(a.num)}{" "}
                  <em className="db-fiche-aside-num-em">{t(a.numEm)}</em>
                </p>
                <p className="db-fiche-aside-text">{t(a.text)}</p>
                <span className="db-fiche-aside-source">{t(a.source)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Sous-rendu : aggregation ─────────────────────────────────────────────

function renderAggregation({
  t,
  locale,
  bucketKey,
  bucketLabel: _bucketLabel,
  aggregation,
  resolvedMissions,
  amounts,
  profileQuery,
  basePath,
  showChildPct,
  showChildAnnual,
  showChildMonthly,
  childrenVariant,
  personalLabelKey,
}: {
  t: (k: string) => string;
  locale: "fr" | "en";
  bucketKey: "secu" | "etat" | "local";
  bucketLabel: string;
  aggregation: AggregationEntry;
  resolvedMissions: DrilldownLevel2Entry[];
  amounts?: AmountDecorations;
  profileQuery?: string;
  basePath: string;
  showChildPct: boolean;
  showChildAnnual: boolean;
  showChildMonthly: boolean;
  childrenVariant: string;
  personalLabelKey: string;
}) {
  const label =
    locale === "en" ? aggregation.label_en : aggregation.label_fr;
  const _sharePct = Math.round((aggregation.share_of_parent ?? 0) * 100);
  const introTpl = t("db.drilldown.aggregation_intro");
  const intro = introTpl
    .replace("{count}", String(resolvedMissions.length))
    .replace("{label}", label);

  const personalMonthlyLabel = amounts?.personalMonthlyLabel ?? null;
  const nationalAnnualLabel = amounts?.nationalAnnualLabel ?? null;
  const parentPersonalMonthlyEur = amounts?.parentPersonalMonthlyEur ?? null;
  const parentNationalAnnualEur = amounts?.parentNationalAnnualEur ?? null;

  return (
    <>
      <div className="db-fiche-lead">
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
                  {t(personalLabelKey)}
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
          <ul className={`db-fiche-agg-grid ${childrenVariant}`}>
            {resolvedMissions.map((mission) => {
              const mLabel =
                locale === "en" ? mission.label_en : mission.label_fr;
              const mPct = Math.round((mission.share_of_parent ?? 0) * 100);
              const href = withProfile(
                `${basePath}/bucket/${bucketKey}/${encodeURIComponent(
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
              // Md€ national de la mission = part de l'agg × share_of_parent
              // de la mission ÷ somme des shares de l'agg (les shares dans
              // le JSON sont relatives à État central, pas à l'agg).
              const childAnnualEur =
                parentNationalAnnualEur !== null && sumShares > 0
                  ? parentNationalAnnualEur *
                    ((mission.share_of_parent ?? 0) / sumShares)
                  : null;
              const childAnnualLabel =
                childAnnualEur !== null && childAnnualEur > 0
                  ? fmtAnnualCompactClient(childAnnualEur, locale)
                  : null;
              return (
                <li key={mission.key}>
                  <Link
                    href={href}
                    className="db-fiche-agg-card"
                    prefetch={false}
                  >
                    {showChildAnnual && childAnnualLabel && (
                      <span className="db-fiche-agg-card-annual tnum">
                        {childAnnualLabel}
                      </span>
                    )}
                    {showChildPct && (
                      <span className="db-fiche-agg-card-pct tnum">
                        {mPct}%
                      </span>
                    )}
                    <span className="db-fiche-agg-card-name">{mLabel}</span>
                    {showChildMonthly &&
                      childMonthly !== null &&
                      childMonthly > 0 && (
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

/**
 * Vue scope-overview : liste les fonctions level2 du bloc (bloc-communal,
 * dept ou région) avec lien direct vers chaque fiche level2. Le total scope
 * est affiché en lead — chaque enfant porte sa share_of_parent du scope.
 */
function renderScopeOverview({
  t,
  locale,
  scope,
  scopeLabel,
  level2List,
  amounts,
  profileQuery,
  basePath,
  showChildAnnual,
  showChildMonthly,
  childrenVariant,
  personalLabelKey,
}: {
  t: (k: string) => string;
  locale: "fr" | "en";
  scope: "bloc_communal" | "dept" | "region";
  scopeLabel: string;
  level2List: DrilldownLevel2Entry[];
  amounts?: AmountDecorations;
  profileQuery?: string;
  basePath: string;
  showChildAnnual: boolean;
  showChildMonthly: boolean;
  childrenVariant: string;
  personalLabelKey: string;
}) {
  const personalMonthlyLabel = amounts?.personalMonthlyLabel ?? null;
  const nationalAnnualLabel = amounts?.nationalAnnualLabel ?? null;
  const parentPersonalMonthlyEur = amounts?.parentPersonalMonthlyEur ?? null;
  const parentNationalAnnualEur = amounts?.parentNationalAnnualEur ?? null;

  const sorted = [...level2List].sort(
    (a, b) => (b.share_of_parent ?? 0) - (a.share_of_parent ?? 0),
  );

  const buildHref = (key: string): string => {
    if (scope === "bloc_communal") {
      return withProfile(
        `${basePath}/bucket/local/${encodeURIComponent(key)}`,
        profileQuery,
      );
    }
    return withProfile(
      `${basePath}/bucket/local/${scope}/${encodeURIComponent(key)}`,
      profileQuery,
    );
  };

  const intro = t("db.drilldown.scope_overview_intro")
    .replace("{count}", String(sorted.length))
    .replace("{label}", scopeLabel);

  return (
    <>
      <div className="db-fiche-lead">
        <p className="db-fiche-lead-name">{scopeLabel}</p>

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
                  {t(personalLabelKey)}
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

      <div className="db-fiche-section">
        <p className="db-fiche-section-head">{intro}</p>
        <ul className={`db-fiche-agg-grid ${childrenVariant}`}>
          {sorted.map((entry) => {
            const eLabel =
              locale === "en" ? entry.label_en : entry.label_fr;
            const share = entry.share_of_parent ?? 0;
            const childMonthly =
              parentPersonalMonthlyEur !== null
                ? parentPersonalMonthlyEur * share
                : null;
            const childAnnualEur =
              parentNationalAnnualEur !== null
                ? parentNationalAnnualEur * share
                : null;
            const childAnnualLabel =
              childAnnualEur !== null && childAnnualEur > 0
                ? fmtAnnualCompactClient(childAnnualEur, locale)
                : null;
            return (
              <li key={entry.key}>
                <Link
                  href={buildHref(entry.key)}
                  className="db-fiche-agg-card"
                  prefetch={false}
                >
                  {showChildAnnual && childAnnualLabel && (
                    <span className="db-fiche-agg-card-annual tnum">
                      {childAnnualLabel}
                    </span>
                  )}
                  <span className="db-fiche-agg-card-name">{eLabel}</span>
                  {showChildMonthly &&
                    childMonthly !== null &&
                    childMonthly > 0 && (
                      <span className="db-fiche-agg-card-monthly tnum">
                        {fmtMonthly(childMonthly, locale)}{" "}
                        €/{locale === "en" ? "mo" : "mois"}
                      </span>
                    )}
                  <span aria-hidden className="db-fiche-agg-card-chevron">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
