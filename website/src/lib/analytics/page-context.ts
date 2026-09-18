/**
 * Page context — the same facts about a page, derived from its address,
 * stamped on every analytics event (see AnalyticsProvider).
 *
 * Addresses follow lib/urls.ts: /{lang}/{country}/{place}/{family}/{entity}/{slug},
 * national sections under /{lang}/france/{section}, site pages under
 * /{lang}/{page}. Deriving the context here, once, in the browser, lets the
 * weekly PostHog routine group 35 000 commune pages by `page_pattern`, split
 * hubs from fiches with `page_kind`, and compare families across cities
 * without ever parsing a path in HogQL. Pure and synchronous, unit-tested in
 * page-context.test.ts.
 *
 * Ported on 2026-09-14 from feat/analytics-event-architecture (which parsed
 * the legacy /fr/city/… tree) to the one-host address grammar.
 */
import { BIG_CITIES, FRANCE_NATIONAL_SECTIONS, toLogical, type Country } from "@/lib/urls";

export type PageKind =
  | "landing" // the language landing: /fr, /en — the hook, not a data page
  | "country" // /usa, /brasil: the country door
  | "city" // the city's own page: /fr/france/pantin, /fr/france/paris
  | "hub" // a family page: /fr/france/paris/budget, /fr/france/dette
  | "explorer" // a list you filter: …/lieux, …/marches/contrats/…
  | "fiche" // one entity: …/subventions/association/{slug}
  | "compare" // /fr/france/comparer/{a}/{b}
  | "chat"
  | "static"; // méthode, contact, confidentialité…

export type PageContext = {
  /** fr | us | br | none (site-wide pages) */
  page_country: "fr" | "us" | "br" | "none";
  /** hub = a city with its own routes (paris, marseille, san-francisco, recife);
   *  commune = one of the 35 000 on the shared page; national; site */
  page_tier: "hub" | "commune" | "national" | "site";
  /** city slug, commune slug included; null off city pages */
  page_city: string | null;
  /** budget, subventions, marches, payroll, contratos… `ville` on a city page,
   *  `landing`, `chat`, `comparer`, or the static page's own name */
  page_family: string;
  page_kind: PageKind;
  /** the route word before the slug: association, poste, dept, payee… */
  page_entity_type: string | null;
  /** the logical route with placeholders: /france/{commune}, /usa/san-francisco/payroll/role/{slug} */
  page_pattern: string;
  /** the language of the address, or the <html lang> */
  page_locale: string;
};

const COUNTRY_CODE: Record<Country, "fr" | "us" | "br"> = { france: "fr", usa: "us", brasil: "br" };

/** Explorer route words followed by an optional catch-all ([[...parts]]). */
const EXPLORER_TAILS = new Set(["contrats", "fournisseurs", "associations", "projets", "payees", "todos", "contratos"]);

/** Families whose hub IS an explorer (a map or a list). */
const EXPLORER_FAMILIES = new Set(["lieux", "places", "lugares"]);

const STATIC_PAGES = new Set([
  "accessibilite", "accessibility", "acessibilidade",
  "confidentialite", "privacy", "privacidade",
  "contact", "contato",
  "corrections", "correcoes",
  "licence", "license", "licenca",
  "mentions-legales", "legal-notice", "aviso-legal",
  "methode", "method", "metodo",
  "pour-les-villes", "for-cities", "para-cidades",
  "signalement", "report-an-error", "reportar-erro",
]);

/** Every literal route word. Anything else in a path is a slug. */
const LITERALS = new Set<string>([
  "france", "usa", "brasil", "national", "comparer", "compare", "chat", "c", "analyses", "analises",
  // FR families and entity words
  "budget", "subventions", "marches", "dette", "investissements", "logement", "lieux", "lieu",
  "poste", "association", "theme", "fournisseur", "contrat", "categorie", "offres", "domaine", "projet", "chapitre",
  "arrondissement", "bailleur", "instrument", "masse", "garanties", "stress-test",
  "comparaison", "evolution", "simulateur-prelevements", "daily-bread", "etat", "fiscalite", "bucket", "recettes", "local",
  "agg", "region", "dept", "fonction", "nature", "marche",
  // US
  "san-francisco", "payroll", "contracts", "places", "place", "who-gets-paid", "the-city", "records", "sources",
  "timeline", "character", "service", "authority", "contract", "type", "area", "family", "role",
  "payee", "category", "street",
  // BR
  "recife", "contratos", "lugares", "quem-recebe", "modalidade", "orgao", "tema", "funcao",
  ...EXPLORER_TAILS,
  ...STATIC_PAGES,
]);

const PLACEHOLDER = /^\{.+\}$/;

function segmentsOf(logical: string): string[] {
  return logical
    .split("?")[0]
    .split("#")[0]
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s).toLowerCase();
      } catch {
        return s.toLowerCase();
      }
    });
}

function isBigCity(country: Country, place: string): boolean {
  return (BIG_CITIES[country] as readonly string[]).includes(place);
}

/** `/fr/france/pantin/fournisseur/123456789` → `/france/{commune}/fournisseur/{n}` */
export function pagePattern(pathname: string): string {
  const segs = segmentsOf(toLogical(pathname.split(/[?#]/)[0]));
  const out: string[] = [];
  const country = (segs[0] as Country) in COUNTRY_CODE ? (segs[0] as Country) : null;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const prev = segs[i - 1];
    if (out[out.length - 1] === "{parts}") continue; // catch-all swallows the rest
    if (country && i === 1) {
      const national = country === "france" ? FRANCE_NATIONAL_SECTIONS.includes(s) : country === "usa" && s === "national";
      if (national || LITERALS.has(s) && !isBigCity(country, s) && (national || s === "national")) {
        out.push(s);
        continue;
      }
      out.push(isBigCity(country, s) ? s : "{commune}");
      continue;
    }
    if (country === "france" && segs[1] === "comparer" && i >= 2) {
      out.push("{commune}");
      continue;
    }
    if (prev && EXPLORER_TAILS.has(prev)) {
      out.push("{parts}");
      continue;
    }
    if (/^\d+$/.test(s)) {
      out.push("{n}");
      continue;
    }
    if (LITERALS.has(s)) {
      out.push(s);
      continue;
    }
    out.push("{slug}");
  }
  return "/" + out.join("/");
}

function entityBefore(tokens: string[], idx: number): string | null {
  for (let j = idx - 1; j >= 0; j--) {
    if (!PLACEHOLDER.test(tokens[j])) return tokens[j];
  }
  return null;
}

export function pageContext(pathname: string, locale = ""): PageContext {
  const clean = pathname.split(/[?#]/)[0];
  const lang = clean.match(/^\/(fr|en|pt)(\/|$)/)?.[1] ?? "";
  const pattern = pagePattern(clean);
  const p = pattern.split("/").filter(Boolean);
  const segs = segmentsOf(toLogical(clean));
  const base = { page_pattern: pattern, page_locale: lang || locale || "" };

  // "/fr", "/en" (and "/") show the Paris showcase; "/pt" sends to Recife.
  if (p.length === 0) {
    return lang === "pt"
      ? { ...base, page_country: "br", page_tier: "hub", page_city: "recife", page_family: "landing", page_kind: "landing", page_entity_type: null }
      : { ...base, page_country: "fr", page_tier: "hub", page_city: "paris", page_family: "landing", page_kind: "landing", page_entity_type: null };
  }

  const countryName = (p[0] as Country) in COUNTRY_CODE ? (p[0] as Country) : null;
  const country = countryName ? COUNTRY_CODE[countryName] : "none";

  if (countryName) {
    if (p.length === 1) {
      return { ...base, page_country: country, page_tier: "national", page_city: null, page_family: "landing", page_kind: "country", page_entity_type: null };
    }
    const second = segs[1];
    const national =
      (countryName === "france" && FRANCE_NATIONAL_SECTIONS.includes(second)) ||
      (countryName === "usa" && second === "national");
    if (national) {
      const rest = p.slice(1);
      const family = rest[0];
      if (family === "comparer" || family === "compare") {
        return { ...base, page_country: country, page_tier: "commune", page_city: segs[2] ?? null, page_family: "comparer", page_kind: "compare", page_entity_type: null };
      }
      const last = rest[rest.length - 1];
      let kind: PageKind = rest.length === 1 && second === "national" ? "landing" : "hub";
      let entity: string | null = null;
      if (rest.length > 1 && PLACEHOLDER.test(last)) {
        kind = "fiche";
        entity = entityBefore(rest, rest.length - 1);
      }
      return { ...base, page_country: country, page_tier: "national", page_city: null, page_family: family, page_kind: kind, page_entity_type: entity };
    }
    // a place: a big city with its own routes, or one of the 35 000 communes
    const city = second;
    const tier = isBigCity(countryName, city) ? "hub" : "commune";
    const rest = p.slice(2);
    if (rest.length === 0) {
      return { ...base, page_country: country, page_tier: tier, page_city: city, page_family: "ville", page_kind: "city", page_entity_type: null };
    }
    const family = rest[0];
    const last = rest[rest.length - 1];
    let kind: PageKind = "hub";
    let entity: string | null = null;
    if (rest.length === 1) {
      kind = EXPLORER_FAMILIES.has(family) ? "explorer" : "hub";
    } else if (last === "{parts}") {
      kind = "explorer";
    } else if (PLACEHOLDER.test(last)) {
      kind = "fiche";
      entity = entityBefore(rest, rest.length - 1);
    } else if (EXPLORER_TAILS.has(last)) {
      kind = "explorer";
    }
    return { ...base, page_country: country, page_tier: tier, page_city: city, page_family: family, page_kind: kind, page_entity_type: entity };
  }

  if (p[0] === "chat") {
    return { ...base, page_country: "none", page_tier: "site", page_city: null, page_family: "chat", page_kind: "chat", page_entity_type: null };
  }
  if (p[0] === "analyses" || p[0] === "analises") {
    return { ...base, page_country: "none", page_tier: "site", page_city: null, page_family: "analyses", page_kind: p.length > 1 ? "fiche" : "hub", page_entity_type: p.length > 1 ? "analyse" : null };
  }
  if (STATIC_PAGES.has(p[0])) {
    return { ...base, page_country: "none", page_tier: "site", page_city: null, page_family: p[0], page_kind: "static", page_entity_type: null };
  }
  return { ...base, page_country: "none", page_tier: "site", page_city: null, page_family: "other", page_kind: "static", page_entity_type: null };
}
