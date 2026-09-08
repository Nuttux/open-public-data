import { breadcrumbJsonLd, datasetJsonLd } from "@/lib/seo";
import { LOCALE_HOSTS, type SiteLocale } from "@/lib/site-locale";

/**
 * Structured data of an answered page (feedback_seo_aigeo_by_default):
 *   - BreadcrumbList, derived from the path — home › country/city › section › page;
 *   - Dataset, for pages whose answer is a figure from an open dataset, so
 *     Google Dataset Search and AI engines can cite the page as data.
 * Rendered as two <script type="application/ld+json"> tags, nothing visible.
 * Labels are the ones the navigation uses, per language; unknown segments
 * are skipped rather than guessed.
 */
const CITY: Record<string, string> = { paris: "Paris", marseille: "Marseille", sf: "San Francisco", recife: "Recife" };
const COUNTRY: Record<string, Record<SiteLocale, string>> = {
  fr: { fr: "France", en: "France", pt: "França" },
  us: { fr: "États-Unis", en: "United States", pt: "Estados Unidos" },
  br: { fr: "Brésil", en: "Brazil", pt: "Brasil" },
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
const COUNTRY_PAGE = new Set(["us"]);
const SECTION_HREF: Record<string, string> = { lieu: "lieux", orgao: "quem-recebe", tema: "quem-recebe", modalidade: "contratos" };

function crumbs(path: string, title: string, locale: SiteLocale): { name: string; path: string }[] {
  const seg = path.split("/").filter(Boolean);
  const out: { name: string; path: string }[] = [{ name: "Qipu", path: "/" }];
  // /fr/city/paris/budget/poste/x  ·  /us/city/sf/payroll/dept/x  ·  /br/city/recife/orgao/x
  if (seg.length >= 3 && seg[1] === "city") {
    // Only /us has a country page; a breadcrumb must not point at a 404.
    const country = COUNTRY[seg[0]]?.[locale];
    if (country && COUNTRY_PAGE.has(seg[0])) out.push({ name: country, path: `/${seg[0]}` });
    const city = CITY[seg[2]] ?? seg[2].charAt(0).toUpperCase() + seg[2].slice(1);
    out.push({ name: city, path: `/${seg[0]}/city/${seg[2]}` });
    const section = seg[3];
    if (section && SECTION[section]) {
      out.push({ name: SECTION[section][locale], path: `/${seg[0]}/city/${seg[2]}/${SECTION_HREF[section] ?? section}` });
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
  const base = LOCALE_HOSTS[locale];
  const bc = breadcrumbJsonLd(crumbs(path, title, locale));
  bc.itemListElement = bc.itemListElement.map((i) => ({ ...i, item: i.item.replace(/^https:\/\/www\.qipu\.org/, base) }));
  const ds = dataset
    ? {
        ...datasetJsonLd({ name: title, description, path, keywords, dateModified: dateModified ?? undefined, spatialCoverage, creator }),
        url: `${base}${path}`,
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
