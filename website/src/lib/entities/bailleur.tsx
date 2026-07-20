import { BailleurFiche } from "@/components/fusion";
import { BailleurKickerText } from "@/components/fusion/EntityPageHeaders";
import type { EntityPageConfig } from "@/lib/entity-page";
import { fmtBillions, fmtMillions } from "@/lib/fmt";
import { loadBailleur } from "@/lib/fusion-data";

type D = { bailleur: NonNullable<ReturnType<typeof loadBailleur>> };

export const bailleurConfig: EntityPageConfig<D> = {
  load: ({ slug }) => {
    const bailleur = loadBailleur(slug);
    if (!bailleur) return null;
    return { bailleur };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Operator not found — France Open Data" : "Bailleur introuvable — France Open Data",
    robots: { index: false },
  }),
  metadata: ({ bailleur: b }, locale) => {
    let capital: string;
    if (b.garanties) {
      if (locale === "en") {
        capital = b.garanties.capital_restant >= 1e9
          ? `€${fmtBillions(b.garanties.capital_restant)}Bn guaranteed`
          : `€${fmtMillions(b.garanties.capital_restant, 0)}M guaranteed`;
      } else {
        capital = b.garanties.capital_restant >= 1e9
          ? `${fmtBillions(b.garanties.capital_restant)} Md € garantis`
          : `${fmtMillions(b.garanties.capital_restant, 0)} M € garantis`;
      }
    } else {
      capital = locale === "en" ? "Paris social-housing operator" : "bailleur social parisien";
    }
    const canonical = `/fr/city/paris/dette/bailleur/${encodeURIComponent(b.slug)}`;
    const title = locale === "en"
      ? `${b.name} — Operator · France Open Data`
      : `${b.name} — Bailleur · France Open Data`;
    const description = locale === "en"
      ? `${b.name}: ${capital} by the Ville de Paris.`
      : `${b.name} : ${capital} par la Ville de Paris.`;
    return {
      title,
      description,
      alternates: {
        canonical,
        languages: { "fr-FR": canonical, "en-US": canonical },
      },
      openGraph: {
        title,
        description,
        type: "profile",
        locale: locale === "en" ? "en_US" : "fr_FR",
        alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
      },
    };
  },
  page: {
    header: ({ bailleur }) => (
      <>
        <div className="fx-kicker-mono" style={{ marginBottom: 10 }}>
          <BailleurKickerText type={bailleur.type} />
        </div>
        <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
          {bailleur.name}
        </h1>
      </>
    ),
    body: ({ bailleur }) => <BailleurFiche bailleur={bailleur} />,
  },
  drawer: {
    kicker: ({ bailleur }) => {
      const kicker = bailleur.type
        ? `Bailleur · ${bailleur.type}`
        : bailleur.garanties
        ? "Bénéficiaire · garantie d'emprunt Ville de Paris"
        : "Bailleur social";
      return <span className="fx-kicker-mono">{kicker}</span>;
    },
    title: ({ bailleur }) => bailleur.name,
    shareUrl: ({ bailleur }) => `/fr/city/paris/dette/bailleur/${encodeURIComponent(bailleur.slug)}`,
    backHref: () => "/fr/city/paris/dette#sec-hors-bilan",
    breadcrumbLabel: ({ bailleur }) => bailleur.name,
    children: ({ bailleur }) => <BailleurFiche bailleur={bailleur} />,
  },
};
