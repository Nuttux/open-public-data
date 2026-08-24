import type { Metadata } from "next";
import "../fusion.css";
import { SITE_NAME, SITE_URL } from "@/lib/seo";
import ForCitiesClient, { resolveCitiesLocale } from "./ForCitiesClient";
import fr from "@/i18n/fr";
import en from "@/i18n/en";
import pt from "@/i18n/pt";

/**
 * /pour-les-villes — the one page addressed to a city that wants this built
 * for its own territory. French slug like /methode and /corrections; the
 * content switches on locale rather than forking the route per language.
 *
 * Three languages, unlike the rest of the site's FR/EN pages: a Recife visitor
 * arriving from the BR tree must be addressed in Portuguese, so the dictionary
 * is picked explicitly here (`pt` falls back to `fr` for anything absent, and
 * every key this page reads exists in all three).
 */
type SP = Promise<{ lang?: string }>;

const DICTS = { fr, en, pt } as const;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SP;
}): Promise<Metadata> {
  const locale = await resolveCitiesLocale((await searchParams).lang);
  const d = DICTS[locale];
  const title = d["fx.cities.meta.title"];
  const description = d["fx.cities.meta.desc"];
  const ogLocale = locale === "en" ? "en_US" : locale === "pt" ? "pt_BR" : "fr_FR";

  return {
    title: { absolute: `${title} · ${SITE_NAME}` },
    description,
    alternates: { canonical: "/pour-les-villes" },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/pour-les-villes`,
      siteName: SITE_NAME,
      locale: ogLocale,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

export default async function ForCitiesPage({ searchParams }: { searchParams: SP }) {
  return <ForCitiesClient lang={(await searchParams).lang} />;
}
