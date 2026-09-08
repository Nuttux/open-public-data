import { BailleurFiche } from "@/components/fusion";
import { BailleurKickerText } from "@/components/fusion/EntityPageHeaders";
import type { EntityPageConfig } from "@/lib/entity-page";
import { fmtBillions, fmtMillions } from "@/lib/fmt";
import { loadBailleur } from "@/lib/fusion-data";
import { eur, pct, int, dataDate, sourceLine } from "@/lib/entities/seo-text";

type D = { bailleur: NonNullable<ReturnType<typeof loadBailleur>> };

export const bailleurConfig: EntityPageConfig<D> = {
  load: ({ slug }) => {
    const bailleur = loadBailleur(slug);
    if (!bailleur) return null;
    return { bailleur };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Operator not found — Qipu" : "Bailleur introuvable — Qipu",
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
      ? `${b.name} — Operator · Qipu`
      : `${b.name} — Bailleur · Qipu`;
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
  seo: ({ bailleur: b }, locale) => {
  const g = b.garanties;
  if (!g) return null;
  const amt = eur(g.capital_restant, locale);
  const n = g.count_emprunts;
  const date = dataDate(`hors_bilan_${g.year}.json`, locale);
  const taux = pct(g.taux_moyen_pondere_pct, locale, 2);
  const dur = int(Math.round(g.duree_residuelle_moyenne_ans), locale);
  if (locale === "en") {
    return {
      title: `${b.name}: ${amt} of loans guaranteed by the City of Paris (${g.year})`,
      answer: `At the end of ${g.year}, the City of Paris guarantees ${amt} of ${b.name}'s outstanding loans (${int(n, "en")} loan${n > 1 ? "s" : ""}, ${taux} average rate, ${dur} years remaining). ${sourceLine("en", "opendata.paris.fr (guaranteed debt)", date)}`,
    };
  }
  return {
    title: `${b.name} : ${amt} d'emprunts garantis par la Ville de Paris (${g.year})`,
    answer: `Fin ${g.year}, la Ville de Paris garantit ${amt} d'emprunts de ${b.name} (${int(n, "fr")} emprunt${n > 1 ? "s" : ""}, ${taux} de taux moyen, ${dur} ans restants). ${sourceLine("fr", "opendata.paris.fr (dette garantie)", date)}`,
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
