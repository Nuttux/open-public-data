/**
 * Factory unique pour les fiches d'entités Paris (page complète + drawer).
 *
 * Avant ce helper, 24 page.tsx quasi-identiques dupliquaient :
 *   1. le await params/searchParams + load + notFound(),
 *   2. le scaffold Navbar → fx-page-header → fx-fiche-wrap → Footer,
 *   3. le DetailDrawer (kicker/title/shareUrl/shareText/backHref/breadcrumb),
 *   4. le chargement des données annexes (vulgarisation, sirene, lieux…)
 *      refait à l'identique côté page et côté drawer.
 *
 * Chaque entité (association, contrat, poste…) devient un
 * `EntityPageConfig<D>` dans `@/lib/entities/*` ; les route files sont des
 * stubs de ~6 lignes. Même pattern que `render-drilldown-page.tsx` et
 * `render-recette-fiche.tsx` (national), adapté aux entités Paris qui ont
 * chacune leur generateMetadata et leurs variations de header.
 *
 * Fidélité stricte : les bodies de generateMetadata et les shareText FR des
 * drawers sont déplacés VERBATIM dans les configs — la sortie <head> doit
 * rester identique octet pour octet à l'avant-refacto.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cache } from "react";

import { notFound, permanentRedirect } from "next/navigation";

import "@/app/fusion.css";
import { DetailDrawer, Navbar, Footer } from "@/components/fusion";
import { finalizeEntityMetadata, readLocale } from "@/lib/seo";
import type { SeoAnswer } from "@/lib/entities/seo-text";
import RelatedLinks, { type RelatedBlock } from "@/components/fiche/RelatedLinks";
import PageJsonLd from "@/components/seo/PageJsonLd";

export type EntityLocale = "fr" | "en";
export type EntityParams = Record<string, string>;
export type EntitySearchParams = Record<string, string | string[] | undefined>;

export type EntityPageConfig<D> = {
  /**
   * Charge TOUT ce dont page + drawer ont besoin (entité + données annexes
   * dupliquées avant le refacto). null → notFound() / notFoundMetadata.
   */
  load: (
    params: EntityParams,
    searchParams: EntitySearchParams,
  ) => D | null | Promise<D | null>;
  /** Unused since 2026-09-08: an unknown entity is a 404 (notFound() in
   *  generateMetadata), not a page with "not found" metadata. Kept optional
   *  so the fifteen configs need no edit. */
  notFoundMetadata?: (locale: EntityLocale) => Metadata;
  /** Body de l'ancien generateMetadata, verbatim, une fois l'entité chargée. */
  metadata: (d: D, locale: EntityLocale, params: EntityParams) => Metadata;
  /**
   * L'« answer » SEO / AI de la fiche (lib/entities/seo-text.ts) : un titre
   * qui répond à la question qu'on tape (« X : 12,3 M€ de subventions de la
   * Ville de Paris, 2019-2024 ») et UNE phrase avec les chiffres, les années,
   * qui paie, la source et la date des données. Elle devient le <title> et la
   * meta description, et s'affiche sous le h1. null → metadata inchangée.
   */
  seo?: (d: D, locale: EntityLocale, params: EntityParams) => SeoAnswer | null;
  /**
   * « Voir aussi » (components/fiche/RelatedLinks.tsx) : les pages voisines,
   * calculées depuis les données déjà chargées — jamais déduites par
   * ressemblance de mots, toujours des URL que la route résout. Rendu en
   * dernière section de la fiche. null → rien.
   */
  related?: (d: D, locale: EntityLocale, params: EntityParams) => RelatedBlock | null;
  /**
   * Chemin canonique quand l'URL demandée n'est pas la forme propre (ancien
   * nom encodé → slug) : 308 avant tout streaming. null → rien.
   */
  canonicalRedirect?: (d: D, params: EntityParams) => string | null;
  page: {
    /**
     * Contenu du header (kicker + h1 + lede éventuel), rendu dans
     * `<section className={headerClassName}><div className="fx-wrap">…`.
     * Absent → pas de section header du tout (cas lieu).
     */
    header?: (d: D, locale: EntityLocale) => ReactNode;
    /** Défaut : "fx-page-header fx-page-header--fiche". */
    headerClassName?: string;
    /** Contenu principal — wrappé `<div className="fx-fiche-wrap">` sauf bodyWrapper: "none". */
    body: (d: D, locale: EntityLocale) => ReactNode;
    /** "none" → body fournit son propre wrapper (cas logement : fx-section). */
    bodyWrapper?: "none";
  };
  drawer: {
    /** Unused since 2026-09-13: every drawer reads the locale. Kept optional
     *  so the configs that still set it need no edit. */
    usesLocale?: boolean;
    kicker: (d: D, locale: EntityLocale) => ReactNode;
    title: (d: D, locale: EntityLocale) => ReactNode;
    shareUrl: (d: D) => string;
    /** Absent → pas de prop shareText (DetailDrawer retombe sur title). */
    shareText?: (d: D, locale: EntityLocale) => string;
    backHref: (d: D) => string;
    breadcrumbLabel: (d: D, locale: EntityLocale) => string;
    children: (d: D, locale: EntityLocale) => ReactNode;
  };
  /** Pass-through de generateStaticParams (cas lieu). */
  staticParams?: () => EntityParams[];
};

/**
 * The SEO answer under the h1: the sentence, then its « Source : … » line in
 * small print, as the place page already does. Both stay on the page for
 * search engines and assistants; on screen the answer no longer pushes the
 * fiche's number below the first screen (the project page had it at 962 px).
 */
function AnswerLede({ answer }: { answer: string }) {
  const cut = answer.search(/\sSource\s?:/);
  if (cut <= 0) return <p className="fx-page-lede fx-answer">{answer}</p>;
  return (
    <>
      <p className="fx-page-lede fx-answer">{answer.slice(0, cut)}</p>
      <p className="fx-v3-lead-src fx-answer-src">{answer.slice(cut + 1)}</p>
    </>
  );
}

type RouteProps = {
  params: Promise<EntityParams>;
  searchParams?: Promise<EntitySearchParams>;
};

/**
 * Fabrique { generateMetadata, Page } pour un route file page complète.
 * Scaffold identique à l'avant-refacto : theme-fusion → Navbar → main →
 * section header (si config.page.header) → fiche wrap → Footer.
 */
export function makeEntityPage<D>(cfg: EntityPageConfig<D>) {
  // generateMetadata et Page sont deux invocations SÉPARÉES de Next.js pour
  // la même requête — sans dédup, cfg.load() (qui peut inclure un calcul non
  // trivial, ex. loadContratRanking) tournait deux fois par requête. React
  // cache() dédoublonne à condition d'avoir des arguments identiques ; params/
  // searchParams ne sont pas garantis être le même objet entre les deux
  // appels Next, donc on clé sur leur contenu sérialisé plutôt que la
  // référence.
  const cachedLoad = cache(
    (key: string): D | null | Promise<D | null> => {
      const { params, sp } = JSON.parse(key) as { params: EntityParams; sp: EntitySearchParams };
      return cfg.load(params, sp);
    },
  );
  const loadOnce = (params: EntityParams, sp: EntitySearchParams) =>
    cachedLoad(JSON.stringify({ params, sp }));

  async function generateMetadata(props: RouteProps): Promise<Metadata> {
    const params = await props.params;
    const sp = (await props.searchParams) ?? {};
    const locale = await readLocale();
    const d = await loadOnce(params, sp);
    // Thrown here, before anything streams, so the response carries a real
    // 404. Thrown from the page only, it lands inside the root provider's
    // Suspense boundary after the 200 shell has gone out — a soft 404 that
    // every unknown entity URL served until 2026-09-08.
    if (!d) notFound();
    const to = cfg.canonicalRedirect?.(d, params);
    if (to) permanentRedirect(to);
    const md = cfg.metadata(d, locale, params);
    const seo = cfg.seo?.(d, locale, params) ?? null;
    if (seo) {
      md.title = seo.title;
      md.description = seo.answer;
      md.openGraph = { ...md.openGraph, title: seo.title, description: seo.answer };
      md.twitter = { ...md.twitter, title: seo.title, description: seo.answer };
    }
    return finalizeEntityMetadata(md, locale);
  }

  async function Page(props: RouteProps) {
    const params = await props.params;
    const sp = (await props.searchParams) ?? {};
    const d = await loadOnce(params, sp);
    if (!d) return notFound();
    const to = cfg.canonicalRedirect?.(d, params);
    if (to) permanentRedirect(to);
    const locale = await readLocale();
    const body = cfg.page.body(d, locale);
    const seo = cfg.seo?.(d, locale, params) ?? null;
    const related = cfg.related?.(d, locale, params) ?? null;
    // Structured data (BreadcrumbList + Dataset) for the answered page, on
    // the path the entity config declares as canonical.
    const declared = seo ? cfg.metadata(d, locale, params).alternates?.canonical : null;
    const jsonLdPath = typeof declared === "string" && declared.startsWith("/") ? declared : null;
    const city = jsonLdPath?.match(/^\/fr\/city\/([^/]+)/)?.[1];
    const cityNom = city === "marseille" ? "Marseille" : "Paris";
    return (
      <div className="theme-fusion">
        <Navbar />
        <main id="main-content" tabIndex={-1}>
          {cfg.page.header ? (
            <section
              className={
                cfg.page.headerClassName ?? "fx-page-header fx-page-header--fiche"
              }
            >
              <div className="fx-wrap">
                {cfg.page.header(d, locale)}
                {seo ? <AnswerLede answer={seo.answer} /> : null}
                {seo && jsonLdPath ? (
                  <PageJsonLd title={seo.title} description={seo.answer} path={jsonLdPath} locale={locale} creator={`Ville de ${cityNom}`} spatialCoverage={`${cityNom}, France`} />
                ) : null}
              </div>
            </section>
          ) : null}
          {seo && jsonLdPath && !cfg.page.header ? (
            <PageJsonLd title={seo.title} description={seo.answer} path={jsonLdPath} locale={locale} creator={`Ville de ${cityNom}`} spatialCoverage={`${cityNom}, France`} />
          ) : null}
          {cfg.page.bodyWrapper === "none" ? (
            <>
              {body}
              {related ? <div className="fx-fiche-wrap"><RelatedLinks block={related} /></div> : null}
            </>
          ) : (
            <div className="fx-fiche-wrap">
              {body}
              <RelatedLinks block={related} />
            </div>
          )}
        </main>
        <Footer />
      </div>
    );
  }

  return { generateMetadata, Page };
}

/**
 * Fabrique le composant drawer (route interceptée root-level `(...)`) —
 * DetailDrawer avec exactement les props d'avant le refacto.
 */
export function makeEntityDrawer<D>(cfg: EntityPageConfig<D>) {
  return async function Drawer(props: RouteProps) {
    const params = await props.params;
    const sp = (await props.searchParams) ?? {};
    const d = await cfg.load(params, sp);
    if (!d) return notFound();
    // Every drawer follows the reader's language. Until 2026-09-13 only two
    // configs read it and the others passed French to the header, so an
    // English reader got « Fournisseur · 10 contrats ».
    const locale: EntityLocale = await readLocale();
    const dr = cfg.drawer;
    // The drawer is where in-site clicks land, so it ends like the page, on
    // « Voir aussi ». It used to stop at the fiche body: six drawers had a
    // single link into the rest of the site.
    const related = cfg.related?.(d, locale, params) ?? null;
    // `display: contents` : le wrapper ne génère aucune boîte. Sans ça, Next
    // peut scroller la page d'arrière-plan vers ce div (vide, en fin de
    // document) quand il applique son scroll de navigation — notamment sur
    // les fiches avec ?year=, où un server-patch (Next 16.1, shouldScroll
    // hardcodé à true dans server-patch-reducer) ignore le scroll={false} du
    // Link. Une boîte à rect nul est ignorée par shouldSkipElement, donc
    // aucun scroll n'est appliqué. Les sélecteurs `.theme-fusion .fx-drawer*`
    // continuent de matcher (le matching CSS ne dépend pas des boîtes).
    return (
      <div className="theme-fusion" style={{ display: "contents" }}>
        <DetailDrawer
          kicker={dr.kicker(d, locale)}
          title={dr.title(d, locale)}
          shareUrl={dr.shareUrl(d)}
          shareText={dr.shareText ? dr.shareText(d, locale) : undefined}
          backHref={dr.backHref(d)}
          breadcrumbLabel={dr.breadcrumbLabel(d, locale)}
        >
          {dr.children(d, locale)}
          <RelatedLinks block={related} />
        </DetailDrawer>
      </div>
    );
  };
}
