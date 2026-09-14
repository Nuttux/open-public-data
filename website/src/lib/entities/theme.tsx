import { DataLabel } from "@/components/fusion/DataLabel";
import { SubventionsBackKicker } from "@/components/fusion/EntityPageHeaders";
import ThemeFiche from "@/components/fusion/ThemeFiche";
import type { EntityPageConfig } from "@/lib/entity-page";
import { relatedT } from "@/lib/related-t";
import { getCity } from "@/lib/cities";
import { loadThemeSubventions } from "@/lib/fusion-data";
import { trLabel } from "@/lib/label-translate";
import { eur, pct, int, cityDataDate, sourceLine, cityPortal, clip } from "@/lib/entities/seo-text";
import { themeRelated } from "@/lib/entities/related";

type D = { fiche: NonNullable<ReturnType<typeof loadThemeSubventions>> };

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} M€`;
  return `${Math.round(n / 1e3).toLocaleString("fr-FR")} k€`;
};

/**
 * Subventions theme fiche — city-parametrized. See makeAssociationConfig for the
 * rationale; every href / "Ville de X" copy derives from `city` so a second city
 * reuses this verbatim.
 */
export function makeThemeConfig(city: string): EntityPageConfig<D> {
  const cityNom = getCity(city)?.nom ?? "la Ville";
  const base = `/fr/city/${city}/subventions`;
  return {
    load: ({ slug }) => {
      const fiche = loadThemeSubventions(slug, undefined, city);
      if (!fiche) return null;
      return { fiche };
    },
    notFoundMetadata: (locale) => ({
      title: locale === "en" ? "Theme not found — Qipu" : "Thématique introuvable — Qipu",
      robots: { index: false },
    }),
    metadata: ({ fiche: f }, locale) => {
      const canonical = `${base}/theme/${f.slug}`;
      const themeLabel = trLabel(f.theme, locale);
      const totalM = Math.round(f.total / 1e6);
      const title = locale === "en"
        ? `${themeLabel} — ${cityNom} grants ${f.year} · Qipu`
        : `${f.theme} — Subventions ${cityNom} ${f.year} · Qipu`;
      const description = locale === "en"
        ? `${f.nbBeneficiaires} beneficiaries, ${f.nbSubventions} grants for a total of €${totalM}M in the ${themeLabel} theme.`
        : `${f.nbBeneficiaires} bénéficiaires, ${f.nbSubventions} subventions pour un total de ${totalM} M € dans la thématique ${f.theme}.`;
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
          type: "article",
          locale: locale === "en" ? "en_US" : "fr_FR",
          alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
        },
      };
    },
    seo: ({ fiche: f }, locale) => {
      const amt = eur(f.total, locale);
      const theme = trLabel(f.theme, locale);
      const date = cityDataDate(city, "subventions/index.json", locale);
      const src = city === "paris"
        ? (locale === "en" ? "opendata.paris.fr (grants paid)" : "opendata.paris.fr (subventions versées)")
        : (locale === "en" ? `${cityPortal(city)} (grants paid by the City of ${cityNom})` : `${cityPortal(city)} (subventions versées par la Ville de ${cityNom})`);
      if (locale === "en") {
        return {
          title: `${cityNom} ${clip(theme, 30)} grants ${f.year}: ${amt}`,
          answer: `In ${f.year}, the City of ${cityNom} paid ${amt} in ${theme.toLowerCase()} grants to ${int(f.nbBeneficiaires, "en")} recipients (${int(f.nbSubventions, "en")} grants), ${pct(f.shareOfTotalPct, "en")} of the year's grants. ${sourceLine("en", src, date)}`,
        };
      }
      return {
        title: `Subventions ${clip(f.theme, 30)} à ${cityNom} ${f.year} : ${amt}`,
        answer: `En ${f.year}, la Ville de ${cityNom} a versé ${amt} de subventions en ${f.theme.toLowerCase()} à ${int(f.nbBeneficiaires, "fr")} bénéficiaires (${int(f.nbSubventions, "fr")} subventions), soit ${pct(f.shareOfTotalPct, "fr")} des subventions de l'année. ${sourceLine("fr", src, date)}`,
      };
    },
    related: ({ fiche }, locale) => themeRelated(fiche, city, locale),
    page: {
      header: ({ fiche }) => (
        <>
          <SubventionsBackKicker href={base} />
          <h1 className="fx-page-title"><DataLabel value={fiche.theme} /></h1>
        </>
      ),
      body: ({ fiche }) => <ThemeFiche fiche={fiche} />,
    },
    drawer: {
      kicker: ({ fiche }, locale) => relatedT(locale)("fx.drawer.kicker.theme", { year: fiche.year }),
      title: ({ fiche }, locale) => trLabel(fiche.theme, locale),
      shareUrl: ({ fiche }) => `${base}/theme/${fiche.slug}`,
      shareText: ({ fiche }) =>
        `${fiche.theme} — ${fmtEur(fiche.total)} versés en ${fiche.year} à ${fiche.nbBeneficiaires} bénéficiaires par la Ville de ${cityNom}`,
      backHref: () => base,
      breadcrumbLabel: ({ fiche }) => fiche.theme,
      children: ({ fiche }) => <ThemeFiche fiche={fiche} />,
    },
  };
}

// Back-compat default (Paris).
export const themeConfig = makeThemeConfig("paris");
