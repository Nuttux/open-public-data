import OffresFiche from "@/components/fusion/OffresFiche";
import { MarchesBackKicker } from "@/components/fusion/EntityPageHeaders";
import type { EntityPageConfig } from "@/lib/entity-page";
import { relatedT } from "@/lib/related-t";
import { loadMarchesOffres } from "@/lib/fusion-data";
import { eur, int, dataDate, sourceLine } from "@/lib/entities/seo-text";

type D = { fiche: NonNullable<ReturnType<typeof loadMarchesOffres>> };

const TITLE_FR: Record<string, string> = { "1": "Une seule offre", "2-3": "2 à 3 offres", "4-5": "4 à 5 offres", "6+": "6 offres ou plus" };
const TITLE_EN: Record<string, string> = { "1": "A single bid", "2-3": "2 to 3 bids", "4-5": "4 to 5 bids", "6+": "6 bids or more" };
const HOW_FR: Record<string, string> = { "1": "signés sur une seule offre", "2-3": "signés avec 2 ou 3 offres", "4-5": "signés avec 4 ou 5 offres", "6+": "signés avec 6 offres ou plus" };
const HOW_EN: Record<string, string> = { "1": "signed on a single bid", "2-3": "signed with 2 or 3 bids", "4-5": "signed with 4 or 5 bids", "6+": "signed with 6 bids or more" };

/** /france/paris/marches/offres/{1|2-3|4-5|6-plus}[-{year}] — the fiche behind
 *  a bar of the Contrats publics scene « par nombre d'offres ». */
export const offresConfig: EntityPageConfig<D> = {
  load: ({ slug }) => {
    const fiche = loadMarchesOffres(slug);
    return fiche ? { fiche } : null;
  },
  metadata: ({ fiche: f }, locale) => {
    const canonical = `/france/paris/marches/offres/${f.hrefSlug}`;
    const totalM = Math.round(f.total / 1e6);
    const title = locale === "en"
      ? `${TITLE_EN[f.bucket]} — Paris public contracts ${f.year} · Qipu`
      : `${TITLE_FR[f.bucket]} — Marchés publics Paris ${f.year} · Qipu`;
    const description = locale === "en"
      ? `${f.count} contracts ${HOW_EN[f.bucket]} in ${f.year}, €${totalM}M in maximum amounts.`
      : `${f.count} contrats ${HOW_FR[f.bucket]} en ${f.year}, ${totalM} M € de montants maximums.`;
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
    if (locale === "en") {
      return {
        title: `Paris ${f.year}: ${int(f.count, "en")} contracts ${HOW_EN[f.bucket]}, ${amt}`,
        answer: `In ${f.year}, ${int(f.count, "en")} of the ${int(f.known, "en")} City of Paris contracts with a published number of bids were ${HOW_EN[f.bucket]}, for ${amt} in maximum amounts. ${sourceLine("en", "DECP via data.gouv.fr", date)}`,
      };
    }
    return {
      title: `Paris ${f.year} : ${int(f.count, "fr")} contrats ${HOW_FR[f.bucket]}, ${amt}`,
      answer: `En ${f.year}, ${int(f.count, "fr")} des ${int(f.known, "fr")} contrats de la Ville de Paris dont le nombre d’offres est publié ont été ${HOW_FR[f.bucket]}, pour ${amt} de montants maximums. ${sourceLine("fr", "DECP via data.gouv.fr", date)}`,
    };
  },
  page: {
    header: ({ fiche }, locale) => (
      <>
        <MarchesBackKicker />
        <h1 className="fx-page-title">{locale === "en" ? TITLE_EN[fiche.bucket] : TITLE_FR[fiche.bucket]}</h1>
      </>
    ),
    body: ({ fiche }) => <OffresFiche fiche={fiche} />,
  },
  drawer: {
    kicker: ({ fiche }, locale) => relatedT(locale)("fx.drawer.kicker.offres", { year: fiche.year }),
    title: ({ fiche }, locale) => (locale === "en" ? TITLE_EN[fiche.bucket] : TITLE_FR[fiche.bucket]),
    shareUrl: ({ fiche }) => `/france/paris/marches/offres/${fiche.hrefSlug}`,
    shareText: ({ fiche }) => `${TITLE_FR[fiche.bucket]} — ${fiche.count} contrats ${HOW_FR[fiche.bucket]} en ${fiche.year} (Paris)`,
    backHref: () => "/france/paris/marches",
    breadcrumbLabel: ({ fiche }) => TITLE_FR[fiche.bucket],
    children: ({ fiche }) => <OffresFiche fiche={fiche} />,
  },
};
