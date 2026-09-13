/**
 * Helper unique pour rendre les pages drill-down du Daily Bread (perso) et
 * du Budget Explorer France (impersonal).
 *
 * Avant ce helper, 28 page.tsx quasi-identiques dupliquaient :
 *   1. parsing du profil (`?net=&parts=&c=`),
 *   2. lookup de l'entry (level2/3/4, agg, scope dept/region),
 *   3. computation des montants nationaux + perso,
 *   4. construction du breadcrumb,
 *   5. wrapping drawer ou standalone.
 *
 * Chaque page.tsx devient un wrapper de ~12 lignes qui appelle
 * `renderDrilldownPage({...})` avec les bons opts. Les variations entre voix
 * (perso vs impersonal) et entre drawer/standalone sont entièrement gérées
 * ici, en respectant le rendu pré-refacto (cf. commit b171639 : breadcrumb
 * bucket cliquable seulement en perso pour les vues scope/agg/L4 ; layout
 * standalone wrappé Navbar/Footer ; layout drawer wrappé DetailDrawer).
 */
import type { ReactNode } from "react";

import { notFound } from "next/navigation";

import "@/app/fusion.css";
import {
  DetailDrawer,
  BudgetDrilldownFiche,
  Navbar,
  Footer,
  type DrilldownBreadcrumbCrumb,
} from "@/components/fusion";
import {
  getBucket,
  getDeptDrilldown,
  getDeptEntry,
  getDeptLevel3Entry,
  getDrilldownEntry,
  getEtatAggregation,
  getEtatAggregationForMission,
  getRegionDrilldown,
  getRegionEntry,
  isStub,
  type BucketKey,
} from "@/lib/budget-drilldown";
import {
  getEditorialAsidesForEtatAggregation,
  getEditorialAsidesForLevel2,
  getEditorialAsidesForLocalScope,
} from "@/lib/editorial-asides";
import {
  buildProfileQueryString,
  computeProfileMonthlies,
  formatMonthlyEur,
  formatNationalAnnualLabel,
  nationalEtatLevel2Annual,
  nationalLocalLevel2Annual,
  nationalSecuLevel2Annual,
  parseDailyBreadProfile,
  projectEtatAggregationMonthly,
  projectLevel2Monthly,
  projectLevel3Monthly,
  projectLevel4Monthly,
  projectLocalScopeLevel2Monthly,
  shellRootCrumb,
  type DrilldownShellVoice,
} from "@/lib/daily-bread-profile";
import { loadDailyBread } from "@/lib/national-data";
import { readLocale } from "@/lib/seo";

const VALID_BUCKETS = new Set<BucketKey>(["secu", "etat", "local"]);

export type DrilldownVoice = "perso" | "impersonal";

export type DrilldownBasePath =
  | "/france/daily-bread"
  | "/france/budget";

export type DrilldownKind =
  | "level2"
  | "level3"
  | "level4"
  | "etat-aggregation"
  | "local-dept"
  | "local-dept-level3"
  | "local-region"
  | "local-scope";

export type LocalScope = "bloc_communal" | "dept" | "region";

export type RenderDrilldownOpts = {
  /** Promise<{bucket?, level2?, level3?, level4?, agg?}> selon le `kind`. */
  params: Promise<Record<string, string>>;
  /** Promise<searchParams Next.js 15>. Optionnel — null traité comme {}. */
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  /** "perso" → tutoiement (Daily Bread). "impersonal" → 3e personne (Budget Explorer). */
  voice: DrilldownVoice;
  /** Préfixe URL — utilisé pour les liens enfants ET pour le crumb racine. */
  basePath: DrilldownBasePath;
  /** true → wrap DetailDrawer ; false → wrap Navbar/Footer + page-header. */
  isDrawer: boolean;
  /** Discrimine le lookup de l'entry et la signature du fiche prop. */
  kind: DrilldownKind;
  /** Pour `kind: "local-scope"` — détermine quel bloc afficher (bloc_communal, dept, région). */
  localScope?: LocalScope;
};

/**
 * Mappe la voix publique (perso/impersonal) sur le tag interne du
 * `shellRootCrumb` (daily_bread/budget) — kept internal pour ne pas exposer
 * l'historique de nommage à l'API du helper.
 */
function shellVoice(voice: DrilldownVoice): DrilldownShellVoice {
  return voice === "perso" ? "daily_bread" : "budget";
}

/**
 * Rend une page drill-down (drawer ou standalone) en factorisant la totalité
 * de la logique commune. À utiliser depuis chaque `page.tsx` sous
 * `/france/daily-bread/...` et `/france/budget/...` — voir
 * `app/.../page.tsx` pour les call sites.
 */
export async function renderDrilldownPage(
  opts: RenderDrilldownOpts,
): Promise<ReactNode> {
  const params = await opts.params;
  const sp = (await opts.searchParams) ?? {};
  const locale = await readLocale();

  // 1. Profil personnel — query string `?net=&parts=&c=...`. Toujours parsé,
  // y compris dans Budget Explorer (impersonal) parce que la fonctionnalité
  // "saisis ton salaire" reste accessible depuis n'importe quelle voix.
  const profile = parseDailyBreadProfile(sp);
  const monthlies = profile.hasProfile ? computeProfileMonthlies(profile) : null;
  const profileQuery = profile.hasProfile
    ? buildProfileQueryString(profile)
    : undefined;

  // 2. Lookup + computation des montants — branche par `kind` et délègue à
  // une fonction interne qui retourne TOUT ce dont a besoin le rendu : les
  // labels (eyebrow, title), les montants, le breadcrumb, et les props du
  // BudgetDrilldownFiche. notFound() est lancé immédiatement si le lookup
  // échoue.
  const resolved = await resolveByKind({
    opts,
    params,
    locale,
    monthlies,
    profileQuery,
  });
  if (!resolved) return notFound();

  const { eyebrow, title, shareUrl, backHref, breadcrumb, ficheNode } = resolved;

  // 3. Wrapper drawer ou standalone — différence purement visuelle, pas
  // sémantique. Les deux passent la même fiche.
  if (opts.isDrawer) {
    // Parent hiérarchique = maillon cliquable le plus profond du breadcrumb
    // (hors nœud courant). La pastille "← Retour" du drawer navigue vers
    // cette URL — remonter d'exactement un niveau, indépendamment de
    // l'historique.
    const parentCrumb = [...breadcrumb]
      .slice(0, -1)
      .reverse()
      .find((c) => c.href);
    return (
      <div className="theme-fusion db-drawer-shell">
        <DetailDrawer
          kicker={eyebrow}
          title={title}
          shareUrl={shareUrl}
          backHref={backHref}
          parentLink={
            parentCrumb?.href
              ? {
                  url: parentCrumb.href,
                  label: parentCrumb.label,
                  hard: parentCrumb.hard,
                }
              : undefined
          }
          breadcrumbLabel={title}
        >
          {ficheNode}
        </DetailDrawer>
      </div>
    );
  }
  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <section className="fx-page-header">
          <div className="fx-wrap">
            <p className="fx-page-kicker">{eyebrow}</p>
            <h1
              className="fx-page-title"
              style={{ fontSize: "clamp(28px, 4vw, 48px)" }}
            >
              {title}
            </h1>
          </div>
        </section>
        <div className="fx-fiche-wrap">{ficheNode}</div>
      </main>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

type ResolvedRender = {
  eyebrow: string;
  title: string;
  shareUrl: string;
  backHref: string;
  breadcrumb: DrilldownBreadcrumbCrumb[];
  ficheNode: ReactNode;
};

type ResolveCtx = {
  opts: RenderDrilldownOpts;
  params: Record<string, string>;
  locale: "fr" | "en";
  monthlies: ReturnType<typeof computeProfileMonthlies> | null;
  profileQuery: string | undefined;
};

/**
 * Pour Daily Bread (Approche A) : convertit nationalAnnualEur en per-capita
 * monthly (€/mois/hab). Pour Budget Explorer : null (laisse le profile-based
 * personalMonthlyEur faire son travail).
 *
 * Le label "Sur ton profil" devient "Par habitant" côté fiche quand on est
 * en mode per-capita (voix "perso" — Daily Bread).
 */
function perCapitaMonthly(
  nationalAnnualEur: number | null,
  voice: DrilldownVoice,
): number | null {
  if (voice !== "perso") return null;
  if (nationalAnnualEur == null || nationalAnnualEur <= 0) return null;
  const db = loadDailyBread();
  const pop = db?.apu_subsectors?.totals?.population_france ?? 68042591;
  if (pop <= 0) return null;
  return nationalAnnualEur / pop / 12;
}

/**
 * Helper local pour suffixer une URL avec le query string profil — répliqué
 * du composant fiche pour rester DRY côté server (pas d'import circulaire).
 */
function withProfile(href: string, profileQuery: string | undefined): string {
  if (!profileQuery) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}${profileQuery}`;
}

/**
 * Crumb racine commun à toutes les vues — "Daily Bread" ou "Le budget"
 * selon la voix.
 */
function rootCrumb(
  voice: DrilldownVoice,
  locale: "fr" | "en",
  basePath: string,
): DrilldownBreadcrumbCrumb {
  const root = shellRootCrumb(shellVoice(voice), locale, basePath);
  // hard: depuis un drawer, revenir à la racine exige une navigation dure —
  // sinon le slot @drawer garde son contenu périmé (cf. DrilldownBreadcrumb).
  return { label: root.label, href: root.href, hard: true };
}

/**
 * Crumb agrégat éditorial (État seulement) — maillon "Éducation et
 * recherche" entre le bucket et la mission, cliquable vers la fiche agrégat.
 * null pour les autres buckets ou si la mission n'appartient à aucun agrégat.
 */
function etatAggCrumb(
  bucketKey: BucketKey,
  level2Key: string,
  locale: "fr" | "en",
  basePath: string,
  profileQuery: string | undefined,
): DrilldownBreadcrumbCrumb | null {
  if (bucketKey !== "etat") return null;
  const agg = getEtatAggregationForMission(level2Key);
  if (!agg) return null;
  return {
    label: locale === "en" ? agg.label_en : agg.label_fr,
    href: withProfile(
      `${basePath}/bucket/etat/agg/${encodeURIComponent(agg.key)}`,
      profileQuery,
    ),
  };
}

/**
 * Branche par kind et retourne tout ce dont a besoin le rendu. null si le
 * lookup échoue (le caller appellera notFound()).
 */
async function resolveByKind(
  ctx: ResolveCtx,
): Promise<ResolvedRender | null> {
  switch (ctx.opts.kind) {
    case "level2":
      return resolveLevel2(ctx);
    case "level3":
      return resolveLevel3(ctx);
    case "level4":
      return resolveLevel4(ctx);
    case "etat-aggregation":
      return resolveEtatAggregation(ctx);
    case "local-dept":
      return resolveLocalDept(ctx);
    case "local-dept-level3":
      return resolveLocalDeptLevel3(ctx);
    case "local-region":
      return resolveLocalRegion(ctx);
    case "local-scope":
      return resolveLocalScope(ctx);
  }
}

// --- level2 ---------------------------------------------------------------

function resolveLevel2(ctx: ResolveCtx): ResolvedRender | null {
  const { opts, params, locale, monthlies, profileQuery } = ctx;
  const { bucket, level2 } = params;
  if (!VALID_BUCKETS.has(bucket as BucketKey)) return null;
  const bucketKey = bucket as BucketKey;
  const decodedL2 = decodeURIComponent(level2);

  const found = getDrilldownEntry(bucketKey, decodedL2);
  if (!found || found.kind !== "level2") return null;

  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const entryLabel =
    locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · level 2`
      : `${bucketLabel} · niveau 2`;

  const shareUrl = `${opts.basePath}/bucket/${bucketKey}/${encodeURIComponent(
    decodedL2,
  )}`;
  const backHref = withProfile(opts.basePath, profileQuery);

  const db = loadDailyBread();
  let nationalAnnualEur: number | null = null;
  if (db) {
    if (bucketKey === "etat")
      nationalAnnualEur = nationalEtatLevel2Annual(db, decodedL2);
    else if (bucketKey === "secu")
      nationalAnnualEur = nationalSecuLevel2Annual(
        db,
        found.entry.share_of_parent ?? 0,
      );
    else
      nationalAnnualEur = nationalLocalLevel2Annual(
        db,
        "bloc_communal",
        found.entry.share_of_parent ?? 0,
      );
  }
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

  // Daily Bread (Approche A) : per-capita. Budget Explorer : perso (profile).
  const personalMonthlyEur =
    perCapitaMonthly(nationalAnnualEur, opts.voice) ??
    (monthlies
      ? projectLevel2Monthly(
          monthlies,
          bucketKey,
          decodedL2,
          found.entry.share_of_parent ?? 0,
        )
      : null);
  const personalMonthlyLabel =
    personalMonthlyEur != null
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  // Breadcrumb : pour level2 plain (non-scope), bucket crumb est plain dans
  // les deux voix — pas de href. Pour une mission État rattachée à un
  // agrégat éditorial, on insère le maillon agrégat (cliquable) — sinon la
  // fiche mission n'offrait aucun chemin remontant d'un niveau.
  const aggCrumb = etatAggCrumb(
    bucketKey,
    decodedL2,
    locale,
    opts.basePath,
    profileQuery,
  );
  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    rootCrumb(opts.voice, locale, opts.basePath),
    { label: bucketLabel },
    ...(aggCrumb ? [aggCrumb] : []),
    { label: entryLabel },
  ];

  const ficheNode = (
    <BudgetDrilldownFiche
      bucket={found.bucket}
      bucketKey={bucketKey}
      level2={found.entry}
      isStub={isStub()}
      amounts={{
        nationalAnnualLabel,
        personalMonthlyLabel,
        parentPersonalMonthlyEur: personalMonthlyEur,
        parentNationalAnnualEur: nationalAnnualEur,
      }}
      breadcrumb={breadcrumb}
      profileQuery={profileQuery}
      basePath={opts.basePath}
      editorialAsides={
        getEditorialAsidesForLevel2(bucketKey, decodedL2) ?? undefined
      }
    />
  );

  return {
    eyebrow,
    title: entryLabel,
    shareUrl,
    backHref,
    breadcrumb,
    ficheNode,
  };
}

// --- level3 ---------------------------------------------------------------

function resolveLevel3(ctx: ResolveCtx): ResolvedRender | null {
  const { opts, params, locale, monthlies, profileQuery } = ctx;
  const { bucket, level2, level3 } = params;
  if (!VALID_BUCKETS.has(bucket as BucketKey)) return null;
  const bucketKey = bucket as BucketKey;
  const decodedL2 = decodeURIComponent(level2);
  const decodedL3 = decodeURIComponent(level3);

  const found = getDrilldownEntry(bucketKey, decodedL2, decodedL3);
  if (!found || found.kind !== "level3") return null;

  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const parentLabel =
    locale === "en" ? found.parent.label_en : found.parent.label_fr;
  const entryLabel =
    locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · ${parentLabel} · level 3`
      : `${bucketLabel} · ${parentLabel} · niveau 3`;

  const shareUrl = `${opts.basePath}/bucket/${bucketKey}/${encodeURIComponent(
    decodedL2,
  )}/${encodeURIComponent(decodedL3)}`;
  const backHref = withProfile(
    `${opts.basePath}/bucket/${bucketKey}/${encodeURIComponent(decodedL2)}`,
    profileQuery,
  );

  const db = loadDailyBread();
  let nationalAnnualEur: number | null = null;
  if (db) {
    if (bucketKey === "etat") {
      const l2Annual = nationalEtatLevel2Annual(db, decodedL2);
      if (l2Annual != null)
        nationalAnnualEur = l2Annual * (found.entry.share_of_parent ?? 0);
    } else if (bucketKey === "secu") {
      const l2Annual = nationalSecuLevel2Annual(
        db,
        found.parent.share_of_parent ?? 0,
      );
      if (l2Annual != null)
        nationalAnnualEur = l2Annual * (found.entry.share_of_parent ?? 0);
    } else {
      const l2Annual = nationalLocalLevel2Annual(
        db,
        "bloc_communal",
        found.parent.share_of_parent ?? 0,
      );
      if (l2Annual != null)
        nationalAnnualEur = l2Annual * (found.entry.share_of_parent ?? 0);
    }
  }
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

  const personalMonthlyEur =
    perCapitaMonthly(nationalAnnualEur, opts.voice) ??
    (monthlies
      ? projectLevel3Monthly(
          monthlies,
          bucketKey,
          decodedL2,
          found.parent.share_of_parent ?? 0,
          found.entry.share_of_parent ?? 0,
        )
      : null);
  const personalMonthlyLabel =
    personalMonthlyEur != null
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  const aggCrumb = etatAggCrumb(
    bucketKey,
    decodedL2,
    locale,
    opts.basePath,
    profileQuery,
  );
  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    rootCrumb(opts.voice, locale, opts.basePath),
    { label: bucketLabel },
    ...(aggCrumb ? [aggCrumb] : []),
    {
      label: parentLabel,
      href: withProfile(
        `${opts.basePath}/bucket/${bucketKey}/${encodeURIComponent(decodedL2)}`,
        profileQuery,
      ),
    },
    { label: entryLabel },
  ];

  const ficheNode = (
    <BudgetDrilldownFiche
      bucket={found.bucket}
      bucketKey={bucketKey}
      level2={found.parent}
      level3={found.entry}
      isStub={isStub()}
      amounts={{
        nationalAnnualLabel,
        personalMonthlyLabel,
        parentPersonalMonthlyEur: personalMonthlyEur,
        parentNationalAnnualEur: nationalAnnualEur,
      }}
      breadcrumb={breadcrumb}
      profileQuery={profileQuery}
      basePath={opts.basePath}
    />
  );

  return {
    eyebrow,
    title: entryLabel,
    shareUrl,
    backHref,
    breadcrumb,
    ficheNode,
  };
}

// --- level4 ---------------------------------------------------------------

function resolveLevel4(ctx: ResolveCtx): ResolvedRender | null {
  const { opts, params, locale, monthlies, profileQuery } = ctx;
  const { bucket, level2, level3, level4 } = params;
  if (!VALID_BUCKETS.has(bucket as BucketKey)) return null;
  const bucketKey = bucket as BucketKey;
  const decodedL2 = decodeURIComponent(level2);
  const decodedL3 = decodeURIComponent(level3);
  const decodedL4 = decodeURIComponent(level4);

  const found = getDrilldownEntry(bucketKey, decodedL2, decodedL3, decodedL4);
  if (!found || found.kind !== "level4") return null;

  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const l2Label =
    locale === "en"
      ? found.parentLevel2.label_en
      : found.parentLevel2.label_fr;
  const l3Label =
    locale === "en"
      ? found.parentLevel3.label_en
      : found.parentLevel3.label_fr;
  const entryLabel =
    locale === "en" ? found.entry.label_en : found.entry.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · ${l2Label} · ${l3Label} · level 4`
      : `${bucketLabel} · ${l2Label} · ${l3Label} · niveau 4`;

  const shareUrl = `${opts.basePath}/bucket/${bucketKey}/${encodeURIComponent(
    decodedL2,
  )}/${encodeURIComponent(decodedL3)}/${encodeURIComponent(decodedL4)}`;
  const backHref = withProfile(
    `${opts.basePath}/bucket/${bucketKey}/${encodeURIComponent(
      decodedL2,
    )}/${encodeURIComponent(decodedL3)}`,
    profileQuery,
  );

  const db = loadDailyBread();
  let nationalAnnualEur: number | null = null;
  if (db) {
    if (bucketKey === "etat") {
      const l2Annual = nationalEtatLevel2Annual(db, decodedL2);
      if (l2Annual != null) {
        nationalAnnualEur =
          l2Annual *
          (found.parentLevel3.share_of_parent ?? 0) *
          (found.entry.share_of_parent ?? 0);
      }
    } else if (bucketKey === "secu") {
      const l2Annual = nationalSecuLevel2Annual(
        db,
        found.parentLevel2.share_of_parent ?? 0,
      );
      if (l2Annual != null) {
        nationalAnnualEur =
          l2Annual *
          (found.parentLevel3.share_of_parent ?? 0) *
          (found.entry.share_of_parent ?? 0);
      }
    } else {
      const l2Annual = nationalLocalLevel2Annual(
        db,
        "bloc_communal",
        found.parentLevel2.share_of_parent ?? 0,
      );
      if (l2Annual != null) {
        nationalAnnualEur =
          l2Annual *
          (found.parentLevel3.share_of_parent ?? 0) *
          (found.entry.share_of_parent ?? 0);
      }
    }
  }
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

  const personalMonthlyEur =
    perCapitaMonthly(nationalAnnualEur, opts.voice) ??
    (monthlies
      ? projectLevel4Monthly(
          monthlies,
          bucketKey,
          decodedL2,
          found.parentLevel2.share_of_parent ?? 0,
          found.parentLevel3.share_of_parent ?? 0,
          found.entry.share_of_parent ?? 0,
        )
      : null);
  const personalMonthlyLabel =
    personalMonthlyEur != null
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  // Breadcrumb : bucket crumb cliquable seulement pour `local` — c'est le
  // seul bucket avec une page racine (`/bucket/local`). Pour etat/secu la
  // route n'existe pas (le lien renvoyait un 404), crumb plain.
  const bucketCrumb: DrilldownBreadcrumbCrumb =
    opts.voice === "perso" && bucketKey === "local"
      ? {
          label: bucketLabel,
          href: withProfile(
            `${opts.basePath}/bucket/${bucketKey}`,
            profileQuery,
          ),
        }
      : { label: bucketLabel };

  const aggCrumb = etatAggCrumb(
    bucketKey,
    decodedL2,
    locale,
    opts.basePath,
    profileQuery,
  );
  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    rootCrumb(opts.voice, locale, opts.basePath),
    bucketCrumb,
    ...(aggCrumb ? [aggCrumb] : []),
    {
      label: l2Label,
      href: withProfile(
        `${opts.basePath}/bucket/${bucketKey}/${encodeURIComponent(decodedL2)}`,
        profileQuery,
      ),
    },
    {
      label: l3Label,
      href: withProfile(
        `${opts.basePath}/bucket/${bucketKey}/${encodeURIComponent(
          decodedL2,
        )}/${encodeURIComponent(decodedL3)}`,
        profileQuery,
      ),
    },
    { label: entryLabel },
  ];

  const ficheNode = (
    <BudgetDrilldownFiche
      bucket={found.bucket}
      bucketKey={bucketKey}
      level2={found.parentLevel2}
      level3={found.parentLevel3}
      level4={found.entry}
      isStub={isStub()}
      amounts={{
        nationalAnnualLabel,
        personalMonthlyLabel,
        parentPersonalMonthlyEur: personalMonthlyEur,
        parentNationalAnnualEur: nationalAnnualEur,
      }}
      breadcrumb={breadcrumb}
      profileQuery={profileQuery}
      basePath={opts.basePath}
    />
  );

  return {
    eyebrow,
    title: entryLabel,
    shareUrl,
    backHref,
    breadcrumb,
    ficheNode,
  };
}

// --- etat aggregation ----------------------------------------------------

function resolveEtatAggregation(ctx: ResolveCtx): ResolvedRender | null {
  const { opts, params, locale, monthlies, profileQuery } = ctx;
  const { agg } = params;
  const decodedAgg = decodeURIComponent(agg);

  const found = getEtatAggregation(decodedAgg);
  if (!found) return null;

  const bucketLabel =
    locale === "en" ? found.bucket.label_en : found.bucket.label_fr;
  const aggLabel = locale === "en" ? found.label_en : found.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · editorial aggregate`
      : `${bucketLabel} · agrégat éditorial`;

  const shareUrl = `${opts.basePath}/bucket/etat/agg/${encodeURIComponent(
    decodedAgg,
  )}`;
  const backHref = withProfile(opts.basePath, profileQuery);

  const db = loadDailyBread();
  let nationalAnnualEur: number | null = null;
  if (db) {
    const etatTotal = db.state_breakdown.total_net_cp_eur;
    if (etatTotal && found.share_of_parent > 0) {
      nationalAnnualEur = etatTotal * found.share_of_parent;
    }
  }
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

  const personalMonthlyEur =
    perCapitaMonthly(nationalAnnualEur, opts.voice) ??
    (monthlies
      ? projectEtatAggregationMonthly(
          monthlies,
          found.share_of_parent ?? 0,
          found.missions,
        )
      : null);
  const personalMonthlyLabel =
    personalMonthlyEur != null
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  // Breadcrumb : crumb État toujours plain — `/bucket/etat` n'est pas une
  // route (le lien renvoyait un 404).
  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    rootCrumb(opts.voice, locale, opts.basePath),
    { label: bucketLabel },
    { label: aggLabel },
  ];

  const ficheNode = (
    <BudgetDrilldownFiche
      bucket={found.bucket}
      bucketKey="etat"
      aggregation={found}
      resolvedMissions={found.resolvedMissions}
      isStub={isStub()}
      amounts={{
        nationalAnnualLabel,
        personalMonthlyLabel,
        parentPersonalMonthlyEur: personalMonthlyEur,
        parentNationalAnnualEur: nationalAnnualEur,
      }}
      breadcrumb={breadcrumb}
      profileQuery={profileQuery}
      basePath={opts.basePath}
      editorialAsides={
        getEditorialAsidesForEtatAggregation(decodedAgg) ?? undefined
      }
    />
  );

  return {
    eyebrow,
    title: aggLabel,
    shareUrl,
    backHref,
    breadcrumb,
    ficheNode,
  };
}

// --- local-dept (level2 dept scope) --------------------------------------

function resolveLocalDept(ctx: ResolveCtx): ResolvedRender | null {
  const { opts, params, locale, monthlies, profileQuery } = ctx;
  const { level2 } = params;
  const decodedL2 = decodeURIComponent(level2);

  const bucket = getBucket("local");
  const block = getDeptDrilldown();
  const entry = getDeptEntry(decodedL2);
  if (!bucket || !block || !entry) return null;

  const bucketLabel = locale === "en" ? bucket.label_en : bucket.label_fr;
  const blockLabel = locale === "en" ? block.label_en : block.label_fr;
  const entryLabel = locale === "en" ? entry.label_en : entry.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · departmental level`
      : `${bucketLabel} · niveau départemental`;

  const shareUrl = `${opts.basePath}/bucket/local/dept/${encodeURIComponent(
    decodedL2,
  )}`;
  const backHref = withProfile(opts.basePath, profileQuery);

  const db = loadDailyBread();
  const nationalAnnualEur = db
    ? nationalLocalLevel2Annual(db, "dept", entry.share_of_parent ?? 0)
    : null;
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

  const personalMonthlyEur =
    perCapitaMonthly(nationalAnnualEur, opts.voice) ??
    (monthlies
      ? projectLocalScopeLevel2Monthly(
          monthlies,
          "dept",
          entry.share_of_parent ?? 0,
        )
      : null);
  const personalMonthlyLabel =
    personalMonthlyEur != null
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  const bucketCrumb: DrilldownBreadcrumbCrumb =
    opts.voice === "perso"
      ? {
          label: bucketLabel,
          href: withProfile(`${opts.basePath}/bucket/local`, profileQuery),
        }
      : { label: bucketLabel };

  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    rootCrumb(opts.voice, locale, opts.basePath),
    bucketCrumb,
    { label: blockLabel },
    { label: entryLabel },
  ];

  const ficheNode = (
    <BudgetDrilldownFiche
      bucket={bucket}
      bucketKey="local"
      scope="dept"
      scopeBlock={block}
      level2={entry}
      isStub={isStub()}
      amounts={{
        nationalAnnualLabel,
        personalMonthlyLabel,
        parentPersonalMonthlyEur: personalMonthlyEur,
        parentNationalAnnualEur: nationalAnnualEur,
      }}
      breadcrumb={breadcrumb}
      profileQuery={profileQuery}
      basePath={opts.basePath}
      editorialAsides={getEditorialAsidesForLocalScope("dept") ?? undefined}
    />
  );

  return {
    eyebrow,
    title: entryLabel,
    shareUrl,
    backHref,
    breadcrumb,
    ficheNode,
  };
}

// --- local-dept-level3 (sub-fonction sous un dept) -----------------------

function resolveLocalDeptLevel3(ctx: ResolveCtx): ResolvedRender | null {
  const { opts, params, locale, monthlies, profileQuery } = ctx;
  const { level2, level3 } = params;
  const decodedL2 = decodeURIComponent(level2);
  const decodedL3 = decodeURIComponent(level3);

  const bucket = getBucket("local");
  const block = getDeptDrilldown();
  const l2 = getDeptEntry(decodedL2);
  const l3 = getDeptLevel3Entry(decodedL2, decodedL3);
  if (!bucket || !block || !l2 || !l3) return null;

  const bucketLabel = locale === "en" ? bucket.label_en : bucket.label_fr;
  const blockLabel = locale === "en" ? block.label_en : block.label_fr;
  const l2Label = locale === "en" ? l2.label_en : l2.label_fr;
  const entryLabel = locale === "en" ? l3.label_en : l3.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · departmental · ${l2Label}`
      : `${bucketLabel} · départemental · ${l2Label}`;

  const shareUrl = `${opts.basePath}/bucket/local/dept/${encodeURIComponent(
    decodedL2,
  )}/${encodeURIComponent(decodedL3)}`;
  const backHref = withProfile(
    `${opts.basePath}/bucket/local/dept/${encodeURIComponent(decodedL2)}`,
    profileQuery,
  );

  const db = loadDailyBread();
  let nationalAnnualEur: number | null = null;
  if (db) {
    const l2Annual = nationalLocalLevel2Annual(
      db,
      "dept",
      l2.share_of_parent ?? 0,
    );
    if (l2Annual != null)
      nationalAnnualEur = l2Annual * (l3.share_of_parent ?? 0);
  }
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

  const l2Monthly = monthlies
    ? projectLocalScopeLevel2Monthly(
        monthlies,
        "dept",
        l2.share_of_parent ?? 0,
      )
    : null;
  const personalMonthlyEur =
    l2Monthly != null ? l2Monthly * (l3.share_of_parent ?? 0) : null;
  const personalMonthlyLabel =
    personalMonthlyEur != null
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  const bucketCrumb: DrilldownBreadcrumbCrumb =
    opts.voice === "perso"
      ? {
          label: bucketLabel,
          href: withProfile(`${opts.basePath}/bucket/local`, profileQuery),
        }
      : { label: bucketLabel };

  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    rootCrumb(opts.voice, locale, opts.basePath),
    bucketCrumb,
    { label: blockLabel },
    {
      label: l2Label,
      href: withProfile(
        `${opts.basePath}/bucket/local/dept/${encodeURIComponent(decodedL2)}`,
        profileQuery,
      ),
    },
    { label: entryLabel },
  ];

  const ficheNode = (
    <BudgetDrilldownFiche
      bucket={bucket}
      bucketKey="local"
      scope="dept"
      scopeBlock={block}
      level2={l2}
      level3={l3}
      isStub={isStub()}
      amounts={{
        nationalAnnualLabel,
        personalMonthlyLabel,
        parentPersonalMonthlyEur: personalMonthlyEur,
        parentNationalAnnualEur: nationalAnnualEur,
      }}
      breadcrumb={breadcrumb}
      profileQuery={profileQuery}
      basePath={opts.basePath}
    />
  );

  return {
    eyebrow,
    title: entryLabel,
    shareUrl,
    backHref,
    breadcrumb,
    ficheNode,
  };
}

// --- local-scope (overview du bloc, sans level2 sélectionné) ------------

function resolveLocalScope(ctx: ResolveCtx): ResolvedRender | null {
  const { opts, locale, monthlies, profileQuery } = ctx;
  const scope = opts.localScope;
  if (!scope) return null;

  const bucket = getBucket("local");
  if (!bucket) return null;

  const block =
    scope === "bloc_communal"
      ? null
      : scope === "dept"
        ? getDeptDrilldown()
        : getRegionDrilldown();
  // bloc_communal n'a pas de "block" séparé — on utilise bucket.level2.
  const level2List =
    scope === "bloc_communal" ? bucket.level2 : (block?.level2 ?? []);
  if (level2List.length === 0) return null;

  const bucketLabel = locale === "en" ? bucket.label_en : bucket.label_fr;
  const scopeLabel = (() => {
    if (scope === "bloc_communal") {
      return locale === "en" ? "Municipal block" : "Bloc communal";
    }
    if (scope === "dept") {
      return locale === "en"
        ? "Departmental level"
        : "Niveau départemental";
    }
    return locale === "en" ? "Regional level" : "Niveau régional";
  })();
  const eyebrow =
    locale === "en" ? `${bucketLabel} · scope` : `${bucketLabel} · scope`;

  const urlSegment =
    scope === "bloc_communal"
      ? "/bucket/local"
      : scope === "dept"
        ? "/bucket/local/dept"
        : "/bucket/local/region";
  const shareUrl = `${opts.basePath}${urlSegment}`;
  const backHref = withProfile(opts.basePath, profileQuery);

  // National annuel du scope = total du bloc (level2_share = 1).
  const db = loadDailyBread();
  const nationalAnnualEur = db
    ? nationalLocalLevel2Annual(db, scope, 1)
    : null;
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

  const personalMonthlyEur =
    perCapitaMonthly(nationalAnnualEur, opts.voice) ??
    (monthlies
      ? scope === "bloc_communal"
        ? monthlies.blocCommunalMonthly
        : scope === "dept"
          ? monthlies.departementMonthly
          : monthlies.regionMonthly
      : null);
  const personalMonthlyLabel =
    personalMonthlyEur != null
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  const bucketCrumb: DrilldownBreadcrumbCrumb =
    opts.voice === "perso"
      ? {
          label: bucketLabel,
          href: withProfile(`${opts.basePath}/bucket/local`, profileQuery),
        }
      : { label: bucketLabel };

  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    rootCrumb(opts.voice, locale, opts.basePath),
    bucketCrumb,
    { label: scopeLabel },
  ];

  const ficheNode = (
    <BudgetDrilldownFiche
      bucket={bucket}
      bucketKey="local"
      scopeOverview={scope}
      scopeLabel={scopeLabel}
      level2List={level2List}
      isStub={isStub()}
      amounts={{
        nationalAnnualLabel,
        personalMonthlyLabel,
        parentPersonalMonthlyEur: personalMonthlyEur,
        parentNationalAnnualEur: nationalAnnualEur,
      }}
      breadcrumb={breadcrumb}
      profileQuery={profileQuery}
      basePath={opts.basePath}
    />
  );

  // eyebrow is unused for the Drawer (just label header), but kept consistent.
  void eyebrow;

  return {
    eyebrow,
    title: scopeLabel,
    shareUrl,
    backHref,
    breadcrumb,
    ficheNode,
  };
}

// --- local-region (level2 region scope) ----------------------------------

function resolveLocalRegion(ctx: ResolveCtx): ResolvedRender | null {
  const { opts, params, locale, monthlies, profileQuery } = ctx;
  const { level2 } = params;
  const decodedL2 = decodeURIComponent(level2);

  const bucket = getBucket("local");
  const block = getRegionDrilldown();
  const entry = getRegionEntry(decodedL2);
  if (!bucket || !block || !entry) return null;

  const bucketLabel = locale === "en" ? bucket.label_en : bucket.label_fr;
  const blockLabel = locale === "en" ? block.label_en : block.label_fr;
  const entryLabel = locale === "en" ? entry.label_en : entry.label_fr;
  const eyebrow =
    locale === "en"
      ? `${bucketLabel} · regional level`
      : `${bucketLabel} · niveau régional`;

  const shareUrl = `${opts.basePath}/bucket/local/region/${encodeURIComponent(
    decodedL2,
  )}`;
  const backHref = withProfile(opts.basePath, profileQuery);

  const db = loadDailyBread();
  const nationalAnnualEur = db
    ? nationalLocalLevel2Annual(db, "region", entry.share_of_parent ?? 0)
    : null;
  const nationalAnnualLabel = formatNationalAnnualLabel(
    nationalAnnualEur,
    locale,
  );

  const personalMonthlyEur = monthlies
    ? projectLocalScopeLevel2Monthly(
        monthlies,
        "region",
        entry.share_of_parent ?? 0,
      )
    : null;
  const personalMonthlyLabel =
    personalMonthlyEur != null
      ? formatMonthlyEur(personalMonthlyEur, locale)
      : null;

  const bucketCrumb: DrilldownBreadcrumbCrumb =
    opts.voice === "perso"
      ? {
          label: bucketLabel,
          href: withProfile(`${opts.basePath}/bucket/local`, profileQuery),
        }
      : { label: bucketLabel };

  const breadcrumb: DrilldownBreadcrumbCrumb[] = [
    rootCrumb(opts.voice, locale, opts.basePath),
    bucketCrumb,
    { label: blockLabel },
    { label: entryLabel },
  ];

  const ficheNode = (
    <BudgetDrilldownFiche
      bucket={bucket}
      bucketKey="local"
      scope="region"
      scopeBlock={block}
      level2={entry}
      isStub={isStub()}
      amounts={{
        nationalAnnualLabel,
        personalMonthlyLabel,
        parentPersonalMonthlyEur: personalMonthlyEur,
        parentNationalAnnualEur: nationalAnnualEur,
      }}
      breadcrumb={breadcrumb}
      profileQuery={profileQuery}
      basePath={opts.basePath}
      editorialAsides={getEditorialAsidesForLocalScope("region") ?? undefined}
    />
  );

  return {
    eyebrow,
    title: entryLabel,
    shareUrl,
    backHref,
    breadcrumb,
    ficheNode,
  };
}
