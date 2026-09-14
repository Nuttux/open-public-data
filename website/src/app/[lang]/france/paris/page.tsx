import type { Metadata } from "next";
import "@/app/fusion.css";
import { SITE_NAME, readLocale } from "@/lib/seo";
import { alternatesFor } from "@/lib/site-locale";
import LandingPage from "../../page";

/**
 * Paris, the city hub: /fr/france/paris, /en/france/paris.
 *
 * Paris's showcase used to be the site's home page, and /fr/city/paris
 * redirected there. Under the one-host addresses (lib/urls.ts) the city has
 * its own address, like every other place; until the per-language landings
 * are designed, the home page of a language and the Paris hub render the
 * same showcase, each under its own canonical.
 */
const META = {
  fr: {
    title: "Paris : budget, subventions, marchés publics, dette et logement de la Ville",
    description:
      "Où va l'argent de la Ville de Paris : budget, subventions, marchés publics, investissements, dette et logement social, à partir des données ouvertes de la Ville, chaque chiffre relié à sa source.",
  },
  en: {
    title: "Paris: the City's budget, grants, public contracts, debt and housing",
    description:
      "Where the City of Paris's money goes: budget, grants, public contracts, investments, debt and social housing, from the City's open data, every figure linked to its source.",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await readLocale();
  const m = META[locale];
  const alt = alternatesFor("/france/paris", locale);
  return {
    title: { absolute: `${m.title} · ${SITE_NAME}` },
    description: m.description,
    alternates: alt,
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: m.title,
      description: m.description,
      url: alt.canonical,
      locale: locale === "en" ? "en_US" : "fr_FR",
      alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
    },
    twitter: { card: "summary_large_image", title: m.title, description: m.description },
  };
}

export default LandingPage;
