import { AssociationFiche } from "@/components/fusion";
import { AssoKicker, AssoPageHeader } from "@/components/fusion/AssoKicker";
import VoirLeLieu from "@/components/fusion/VoirLeLieu";
import type { EntityPageConfig } from "@/lib/entity-page";
import { getCity } from "@/lib/cities";
import { numLocale } from "@/lib/fmt";
import {
  loadAssociation,
  loadSubventionVulgarization,
  loadBeneficiaireGrounded,
} from "@/lib/fusion-data";
import { lieuForBeneficiaire } from "@/lib/lieux-data";
import { trLabel } from "@/lib/label-translate";
import { eur, int, span, periodLead, cityDataDate, sourceLine, cityPortal } from "@/lib/entities/seo-text";

const PRIVATE_INDIVIDUAL = "Personnes physiques";

type D = {
  asso: NonNullable<ReturnType<typeof loadAssociation>>;
  vulgarization: ReturnType<typeof loadSubventionVulgarization>;
  grounded: ReturnType<typeof loadBeneficiaireGrounded>;
  lieuLien: ReturnType<typeof lieuForBeneficiaire>;
};

/**
 * Association (subventions beneficiary) entity page — city-parametrized.
 * Every href, the loaded city's data and the "Ville de X" copy derive from
 * `city`, so a second city reuses this verbatim (see
 * app/fr/city/<city>/subventions/association/[slug]/page.tsx). The lieux link
 * only resolves for cities that have a lieux corpus (Paris today).
 */
export function makeAssociationConfig(city: string): EntityPageConfig<D> {
  const cityNom = getCity(city)?.nom ?? "la Ville";
  const base = `/fr/city/${city}/subventions`;
  return {
    load: ({ slug }) => {
      const asso = loadAssociation(slug, city);
      if (!asso) return null;
      return {
        asso,
        vulgarization: loadSubventionVulgarization(asso.name, city),
        grounded: loadBeneficiaireGrounded(asso.name),
        lieuLien: city === "paris" ? lieuForBeneficiaire(asso.name) : null,
      };
    },
    notFoundMetadata: (locale) => ({
      title: locale === "en" ? "Beneficiary not found — Qipu" : "Association introuvable — Qipu",
      robots: { index: false },
    }),
    metadata: ({ asso: a }, locale) => {
      // A private individual (nature juridique « Personnes physiques ») has a
      // page because the open data names them, but it is never offered to
      // search engines: noindex, no answer-style title, not in the sitemap.
      if (a.natureJuridique === PRIVATE_INDIVIDUAL) {
        return { title: a.name, robots: { index: false, follow: false } };
      }
      const amountFmt = a.totalAmount.toLocaleString(numLocale(locale));
      const title = locale === "en"
        ? `${a.name} — Beneficiary · Qipu`
        : `${a.name} — Association · Qipu`;
      const description = locale === "en"
        ? `${a.name}: ${a.subventionCount} grants, total €${amountFmt} from the Ville de ${cityNom}.`
        : `${a.name} : ${a.subventionCount} subventions, cumul ${amountFmt} € de la Ville de ${cityNom}.`;
      const canonical = `${base}/association/${encodeURIComponent(a.name)}`;
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
    seo: ({ asso: a }, locale) => {
      if (a.natureJuridique === PRIVATE_INDIVIDUAL) return null;
      const amt = eur(a.totalAmount, locale);
      const sp = span(a.yearsActive);
      const theme = a.theme ? trLabel(a.theme, locale) : null;
      const date = cityDataDate(city, "subventions/index.json", locale);
      const n = a.subventionCount;
      const src = city === "paris"
        ? (locale === "en" ? "opendata.paris.fr (grants paid, annex to the administrative account)" : "opendata.paris.fr (subventions versées, annexe du compte administratif)")
        : (locale === "en" ? `${cityPortal(city)} (grants paid by the City of ${cityNom})` : `${cityPortal(city)} (subventions versées par la Ville de ${cityNom})`);
      if (locale === "en") {
        return {
          title: `${a.name}: ${amt} in grants from the City of ${cityNom}${sp ? ` (${sp})` : ""}`,
          answer: `${periodLead(a.yearsActive, "en")} the City of ${cityNom} paid ${amt} to ${a.name} in ${int(n, "en")} grant${n > 1 ? "s" : ""}${theme ? `, mainly in ${theme.toLowerCase()}` : ""}. ${sourceLine("en", src, date)}`,
        };
      }
      return {
        title: `${a.name} : ${amt} de subventions de la Ville de ${cityNom}${sp ? ` (${sp})` : ""}`,
        answer: `${periodLead(a.yearsActive, "fr")} la Ville de ${cityNom} a versé ${amt} à ${a.name} en ${int(n, "fr")} subvention${n > 1 ? "s" : ""}${theme ? `, principalement en ${theme.toLowerCase()}` : ""}. ${sourceLine("fr", src, date)}`,
      };
    },
    page: {
      header: ({ asso }) => (
        <>
          <AssoPageHeader theme={asso.theme} />
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
            {asso.name}
          </h1>
        </>
      ),
      body: ({ asso, vulgarization, grounded, lieuLien }, locale) => (
        <>
          <VoirLeLieu lien={lieuLien} locale={locale} />
          <AssociationFiche asso={asso} vulgarization={vulgarization} grounded={grounded} />
        </>
      ),
    },
    drawer: {
      kicker: ({ asso }) => <AssoKicker theme={asso.theme} />,
      title: ({ asso }) => asso.name,
      shareUrl: ({ asso }) => `${base}/association/${encodeURIComponent(asso.name)}`,
      shareText: ({ asso }) => {
        const montantStr = asso.totalAmount >= 1e6
          ? `${(asso.totalAmount / 1e6).toFixed(1).replace(".", ",")} M€`
          : `${Math.round(asso.totalAmount / 1000).toLocaleString("fr-FR")} k€`;
        return `${asso.name} a reçu ${montantStr} de subventions de la Ville de ${cityNom}${asso.theme ? ` (${asso.theme})` : ""}`;
      },
      backHref: () => base,
      breadcrumbLabel: ({ asso }) => asso.name,
      children: ({ asso, vulgarization, grounded, lieuLien }) => (
        <>
          <VoirLeLieu lien={lieuLien} locale={"fr"} />
          <AssociationFiche asso={asso} vulgarization={vulgarization} grounded={grounded} />
        </>
      ),
    },
  };
}

// Back-compat default (Paris) — existing imports keep working unchanged.
export const associationConfig = makeAssociationConfig("paris");
