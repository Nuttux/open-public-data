import DomaineFiche from "@/components/fusion/DomaineFiche";
import { MarchesBackKicker } from "@/components/fusion/EntityPageHeaders";
import type { EntityPageConfig } from "@/lib/entity-page";
import { relatedT } from "@/lib/related-t";
import { loadMarchesDomaine } from "@/lib/fusion-data";
import { domaineLabel } from "@/lib/marches-domaines";
import { eur, int, dataDate, sourceLine } from "@/lib/entities/seo-text";
import { domaineRelated } from "@/lib/entities/related";

type D = { fiche: NonNullable<ReturnType<typeof loadMarchesDomaine>> };

/** /france/paris/marches/domaine/{slug}[-{year}] — the fiche behind a bar of
 *  the Contrats publics scene « par domaine » : the one axis that reads the
 *  same from 2013 to 2025 (lib/marches-domaines). */
export const domaineConfig: EntityPageConfig<D> = {
  load: ({ slug }) => {
    const fiche = loadMarchesDomaine(slug);
    return fiche ? { fiche } : null;
  },
  metadata: ({ fiche: f }, locale) => {
    const canonical = `/france/paris/marches/domaine/${f.hrefSlug}`;
    const label = domaineLabel(f.slug, locale);
    const totalM = Math.round(f.total / 1e6);
    const pct = Math.round(f.shareOfTotalPct);
    const title = locale === "en"
      ? `${label} — Paris public contracts ${f.year} · Qipu`
      : `${label} — Marchés publics Paris ${f.year} · Qipu`;
    const description = locale === "en"
      ? `${f.count} City of Paris contracts signed in ${f.year} in this domain, €${totalM}M in maximum amounts, ${pct}% of the year's contracts.`
      : `${f.count} contrats de la Ville de Paris signés en ${f.year} dans ce domaine, ${totalM} M € de montants maximums, ${pct} % des contrats de l’année.`;
    return {
      title,
      description,
      alternates: { canonical, languages: { "fr-FR": canonical, "en-US": canonical } },
      openGraph: {
        title,
        description,
        type: "article",
        locale: locale === "en" ? "en_US" : "fr_FR",
        alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
      },
    };
  },
  seo: ({ fiche: f }, locale) => {
    const amt = eur(f.total, locale);
    const date = dataDate("marches-publics/index.json", locale);
    const label = domaineLabel(f.slug, locale);
    const pct = Math.round(f.shareOfTotalPct);
    if (locale === "en") {
      return {
        title: `Paris ${f.year}: ${label}, ${amt}`,
        answer: `In ${f.year}, the City of Paris signed ${int(f.count, "en")} contracts in ${label.toLowerCase()}, for ${amt} in maximum amounts, ${pct}% of the year's contracts. ${sourceLine("en", "City of Paris and DECP", date)}`,
      };
    }
    return {
      title: `Paris ${f.year} : ${label}, ${amt}`,
      answer: `En ${f.year}, la Ville de Paris a signé ${int(f.count, "fr")} contrats en ${label.toLowerCase()}, pour ${amt} de montants maximums, soit ${pct} % des contrats de l’année. ${sourceLine("fr", "Ville de Paris et DECP", date)}`,
    };
  },
  related: ({ fiche }, locale) => domaineRelated(fiche, locale),
  page: {
    header: ({ fiche }, locale) => (
      <>
        <MarchesBackKicker />
        <h1 className="fx-page-title">{domaineLabel(fiche.slug, locale)}</h1>
      </>
    ),
    body: ({ fiche }) => <DomaineFiche fiche={fiche} />,
  },
  drawer: {
    kicker: ({ fiche }, locale) => relatedT(locale)("fx.drawer.kicker.domaine", { year: fiche.year }),
    title: ({ fiche }, locale) => domaineLabel(fiche.slug, locale),
    shareUrl: ({ fiche }) => `/france/paris/marches/domaine/${fiche.hrefSlug}`,
    shareText: ({ fiche }) => `${domaineLabel(fiche.slug, "fr")} — ${fiche.count} contrats en ${fiche.year} (Paris)`,
    backHref: () => "/france/paris/marches",
    breadcrumbLabel: ({ fiche }) => domaineLabel(fiche.slug, "fr"),
    children: ({ fiche }) => <DomaineFiche fiche={fiche} />,
  },
};
