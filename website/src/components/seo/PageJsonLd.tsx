import { breadcrumbJsonLd, datasetJsonLd } from "@/lib/seo";
import { absoluteUrl, type SiteLocale } from "@/lib/site-locale";
import { scopeOf, type Country } from "@/lib/urls";

/**
 * Structured data of an answered page (feedback_seo_aigeo_by_default):
 *   - BreadcrumbList, derived from the path — home › country/city › section › page;
 *   - Dataset, for pages whose answer is a figure from an open dataset, so
 *     Google Dataset Search and AI engines can cite the page as data.
 * Rendered as two <script type="application/ld+json"> tags, nothing visible.
 * Labels are the ones the navigation uses, per language; unknown segments
 * are skipped rather than guessed.
 */
const CITY: Record<string, string> = { paris: "Paris", marseille: "Marseille", "san-francisco": "San Francisco", recife: "Recife" };
const COUNTRY: Record<Country, Record<SiteLocale, string>> = {
  france: { fr: "France", en: "France", pt: "França" },
  usa: { fr: "États-Unis", en: "United States", pt: "Estados Unidos" },
  brasil: { fr: "Brésil", en: "Brazil", pt: "Brasil" },
};
const SECTION: Record<string, Record<SiteLocale, string>> = {
  budget: { fr: "Budget", en: "Budget", pt: "Orçamento" },
  subventions: { fr: "Subventions", en: "Grants", pt: "Subvenções" },
  marches: { fr: "Marchés publics", en: "Public contracts", pt: "Contratos públicos" },
  investissements: { fr: "Investissements", en: "Investments", pt: "Investimentos" },
  dette: { fr: "Dette et patrimoine", en: "Debt and balance sheet", pt: "Dívida e patrimônio" },
  logement: { fr: "Logement social", en: "Social housing", pt: "Habitação social" },
  lieux: { fr: "Lieux", en: "Places", pt: "Lugares" },
  lieu: { fr: "Lieux", en: "Places", pt: "Lugares" },
  contracts: { fr: "Marchés", en: "Contracts", pt: "Contratos" },
  payroll: { fr: "Paie", en: "Payroll", pt: "Folha de pagamento" },
  "who-gets-paid": { fr: "Qui est payé", en: "Who gets paid", pt: "Quem recebe" },
  places: { fr: "Lieux", en: "Places", pt: "Lugares" },
  contratos: { fr: "Contrats", en: "Contracts", pt: "Contratos" },
  "quem-recebe": { fr: "Qui reçoit", en: "Who gets paid", pt: "Quem recebe" },
  lugares: { fr: "Lieux", en: "Places", pt: "Lugares" },
  orgao: { fr: "Organismes", en: "City bodies", pt: "Órgãos" },
  tema: { fr: "Thèmes", en: "Themes", pt: "Temas" },
  modalidade: { fr: "Modalités", en: "Procurement types", pt: "Modalidades" },
};
const COUNTRY_PAGE = new Set<Country>(["usa"]);
const SECTION_HREF: Record<string, string> = { lieu: "lieux", orgao: "quem-recebe", tema: "quem-recebe", modalidade: "contratos" };

function crumbs(path: string, title: string, locale: SiteLocale): { name: string; path: string }[] {
  const out: { name: string; path: string }[] = [{ name: "Qipu", path: "/" }];
  // /france/paris/budget/poste/x  ·  /usa/san-francisco/payroll/dept/x  ·  /brasil/recife/orgao/x
  const s = scopeOf(path);
  if (s?.place) {
    // Only the United States has a country page; a breadcrumb must not point at a redirect.
    if (COUNTRY_PAGE.has(s.country)) out.push({ name: COUNTRY[s.country][locale], path: `/${s.country}` });
    const city = CITY[s.place] ?? s.place.charAt(0).toUpperCase() + s.place.slice(1);
    out.push({ name: city, path: `/${s.country}/${s.place}` });
    if (s.section && SECTION[s.section]) {
      out.push({ name: SECTION[s.section][locale], path: `/${s.country}/${s.place}/${SECTION_HREF[s.section] ?? s.section}` });
    }
  }
  out.push({ name: title, path });
  return out;
}

export default function PageJsonLd({
  title,
  description,
  path,
  locale,
  dataset = true,
  dateModified,
  keywords,
  creator,
  spatialCoverage,
}: {
  title: string;
  description: string;
  path: string;
  locale: SiteLocale;
  /** false for index/browse pages, which are lists, not data. */
  dataset?: boolean;
  dateModified?: string | null;
  keywords?: string[];
  creator?: string;
  spatialCoverage?: string;
}) {
  const bc = breadcrumbJsonLd(crumbs(path, title, locale), locale);
  const ds = dataset
    ? {
        ...datasetJsonLd({ name: title, description, path, keywords, dateModified: dateModified ?? undefined, spatialCoverage, creator }),
        url: absoluteUrl(path, locale),
        inLanguage: locale === "fr" ? "fr-FR" : locale === "pt" ? "pt-BR" : "en",
      }
    : null;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(bc) }} />
      {ds ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ds) }} /> : null}
    </>
  );
}
