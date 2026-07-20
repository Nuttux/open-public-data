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

import { notFound } from "next/navigation";

import "@/app/fusion.css";
import { DetailDrawer, Navbar, Footer } from "@/components/fusion";
import { readLocale } from "@/lib/seo";

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
  /** Metadata quand load() échoue — verbatim de l'ancien early-return. */
  notFoundMetadata: (locale: EntityLocale) => Metadata;
  /** Body de l'ancien generateMetadata, verbatim, une fois l'entité chargée. */
  metadata: (d: D, locale: EntityLocale, params: EntityParams) => Metadata;
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
    /**
     * true → le drawer lit la locale (readLocale). Les autres drawers restent
     * FR-hardcodé comme avant le refacto — on ne rajoute pas de lecture de
     * cookies là où il n'y en avait pas.
     */
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
  async function generateMetadata(props: RouteProps): Promise<Metadata> {
    const params = await props.params;
    const sp = (await props.searchParams) ?? {};
    const locale = await readLocale();
    const d = await cfg.load(params, sp);
    if (!d) return cfg.notFoundMetadata(locale);
    return cfg.metadata(d, locale, params);
  }

  async function Page(props: RouteProps) {
    const params = await props.params;
    const sp = (await props.searchParams) ?? {};
    const d = await cfg.load(params, sp);
    if (!d) return notFound();
    const locale = await readLocale();
    const body = cfg.page.body(d, locale);
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
              <div className="fx-wrap">{cfg.page.header(d, locale)}</div>
            </section>
          ) : null}
          {cfg.page.bodyWrapper === "none" ? (
            body
          ) : (
            <div className="fx-fiche-wrap">{body}</div>
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
    const locale: EntityLocale = cfg.drawer.usesLocale
      ? await readLocale()
      : "fr";
    const dr = cfg.drawer;
    return (
      <div className="theme-fusion">
        <DetailDrawer
          kicker={dr.kicker(d, locale)}
          title={dr.title(d, locale)}
          shareUrl={dr.shareUrl(d)}
          shareText={dr.shareText ? dr.shareText(d, locale) : undefined}
          backHref={dr.backHref(d)}
          breadcrumbLabel={dr.breadcrumbLabel(d, locale)}
        >
          {dr.children(d, locale)}
        </DetailDrawer>
      </div>
    );
  };
}
