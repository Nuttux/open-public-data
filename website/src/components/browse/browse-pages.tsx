import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { Navbar, Footer } from "@/components/fusion";
import BrowseList, { type BrowseNav } from "@/components/browse/BrowseList";
import { getCity } from "@/lib/cities";
import { readLocale } from "@/lib/seo";
import { answerMetadata } from "@/lib/seo/page-answer";
import {
  LETTERS,
  associationItems,
  associationUniqueNames,
  contratItems,
  countByLetter,
  fournisseurItems,
  fournisseurList,
  isLetter,
  marchesYears,
  page,
  projetArrondissements,
  projetItems,
  projetYears,
  recifeRecipientItems,
  recifeRecipientNames,
  sfPayeeItems,
  sfPayeeNames,
  type BrowseItem,
} from "@/lib/seo/browse";
import { recifeLocale } from "@/lib/br/recife-locale";

/**
 * The browse indexes as route-file-sized builders: each returns
 * { generateMetadata, Page } for a `[[...parts]]` optional catch-all, where
 * parts is [] (the index), [letter | year] or [letter | year, page | arr].
 * France pages render the fusion chrome themselves; /us and /br get theirs
 * from their layouts.
 */
type Parts = { parts?: string[] };
type Props = { params: Promise<Parts> };

const intFr = (n: number, locale: string) => n.toLocaleString(locale === "en" ? "en-GB" : locale === "pt" ? "pt-BR" : "fr-FR");

function letterRail(base: string, counts: { letter: string; count: number }[], active: string | null): BrowseNav[] {
  return counts.map((c) => ({ href: `${base}/${c.letter}`, label: c.letter, count: c.count, active: c.letter === active }));
}

function frChrome(children: React.ReactNode) {
  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <Footer />
    </div>
  );
}

/** Associations of a French city, by first letter. */
export function makeAssociationsBrowse(city: string) {
  const base = `/fr/city/${city}/subventions/associations`;
  const cityNom = getCity(city)?.nom ?? city;
  const parse = (parts: string[] = []) => {
    const letter = parts[0] ? decodeURIComponent(parts[0]).toUpperCase() : null;
    const p = parts[1] ? Number(parts[1]) : 1;
    if (letter && !isLetter(letter)) return null;
    if (parts.length > 2 || !Number.isInteger(p) || p < 1) return null;
    return { letter, p };
  };
  async function generateMetadata({ params }: Props): Promise<Metadata> {
    const q = parse((await params).parts);
    if (!q) notFound();
    const locale = await readLocale();
    const total = associationUniqueNames(city).length;
    const path = q.letter ? `${base}/${q.letter}${q.p > 1 ? `/${q.p}` : ""}` : base;
    const en = locale === "en";
    const title = q.letter
      ? en ? `Grant recipients in ${cityNom} starting with ${q.letter}${q.p > 1 ? ` (page ${q.p})` : ""}` : `Associations et organismes subventionnés par ${cityNom}, lettre ${q.letter}${q.p > 1 ? ` (page ${q.p})` : ""}`
      : en ? `Every grant recipient of the City of ${cityNom}, A to Z` : `Tous les bénéficiaires de subventions de la Ville de ${cityNom}, de A à Z`;
    const answer = en
      ? `${intFr(total, "en")} associations and organisations received grants from the City of ${cityNom}, each with its own page: amounts year by year, who pays and for what. Source: ${city === "paris" ? "opendata.paris.fr" : "data.gouv.fr"}.`
      : `${intFr(total, "fr")} associations et organismes ont reçu des subventions de la Ville de ${cityNom}, chacun avec sa page : montants année par année, qui verse et pour quoi. Source : ${city === "paris" ? "opendata.paris.fr" : "data.gouv.fr"}.`;
    return answerMetadata({ title, answer }, path, locale);
  }
  async function Page({ params }: Props) {
    const q = parse((await params).parts);
    if (!q) notFound();
    const path = q.letter ? `${base}/${q.letter}${q.p > 1 ? `/${q.p}` : ""}` : base;
    const locale = await readLocale();
    const en = locale === "en";
    const counts = countByLetter(associationUniqueNames(city));
    const total = counts.reduce((s, c) => s + c.count, 0);
    const rail = letterRail(base, counts, q.letter);
    let items: BrowseItem[] = [];
    let pager;
    if (q.letter) {
      const pg = page(associationItems(city, q.letter, locale), q.p);
      if (pg.items.length === 0 || q.p > pg.pages) notFound();
      items = pg.items;
      pager = { page: pg.page, pages: pg.pages, hrefFor: (p: number) => (p === 1 ? `${base}/${q.letter}` : `${base}/${q.letter}/${p}`), prevLabel: en ? "Previous" : "Précédent", nextLabel: en ? "Next" : "Suivant", pageLabel: en ? "Page" : "Page" };
    }
    const title = q.letter
      ? en ? `Grant recipients starting with ${q.letter}` : `Bénéficiaires de subventions, lettre ${q.letter}`
      : en ? `Every grant recipient of the City of ${cityNom}, A to Z` : `Tous les bénéficiaires de subventions de la Ville de ${cityNom}, de A à Z`;
    const intro = en
      ? `${intFr(total, "en")} associations and organisations, each with its own page. Pick a letter${q.letter ? `: ${intFr(counts.find((c) => c.letter === q.letter)?.count ?? 0, "en")} under ${q.letter}` : ""}.`
      : `${intFr(total, "fr")} associations et organismes, chacun avec sa page. Choisissez une lettre${q.letter ? ` : ${intFr(counts.find((c) => c.letter === q.letter)?.count ?? 0, "fr")} à la lettre ${q.letter}` : ""}.`;
    return frChrome(
      <BrowseList
        seoPath={path}
        locale={locale}
        kicker={en ? `Who receives the City's grants` : `Qui reçoit les subventions de la Ville`}
        kickerHref={`/fr/city/${city}/subventions`}
        title={title}
        intro={intro}
        rail={rail}
        railLabel={en ? "By first letter" : "Par première lettre"}
        items={items}
        pager={pager}
        siblings={[
          { href: `/fr/city/${city}/marches/fournisseurs`, label: en ? "Suppliers A to Z" : "Fournisseurs de A à Z" },
          { href: `/fr/city/${city}/marches/contrats`, label: en ? "Contracts by year" : "Marchés par année" },
          ...(city === "paris" ? [{ href: "/fr/city/paris/investissements/projets", label: en ? "Projects by year" : "Projets par année" }, { href: "/fr/city/paris/lieux", label: en ? "Places" : "Lieux" }] : []),
        ]}
        siblingsLabel={en ? "Other indexes:" : "Autres index :"}
      />,
    );
  }
  return { generateMetadata, Page };
}

/** Suppliers of a French city, by first letter. */
export function makeFournisseursBrowse(city: string) {
  const base = `/fr/city/${city}/marches/fournisseurs`;
  const cityNom = getCity(city)?.nom ?? city;
  const parse = (parts: string[] = []) => {
    const letter = parts[0] ? decodeURIComponent(parts[0]).toUpperCase() : null;
    const p = parts[1] ? Number(parts[1]) : 1;
    if (letter && !isLetter(letter)) return null;
    if (parts.length > 2 || !Number.isInteger(p) || p < 1) return null;
    return { letter, p };
  };
  async function generateMetadata({ params }: Props): Promise<Metadata> {
    const q = parse((await params).parts);
    if (!q) notFound();
    const locale = await readLocale();
    const en = locale === "en";
    const total = fournisseurList(city).length;
    const path = q.letter ? `${base}/${q.letter}${q.p > 1 ? `/${q.p}` : ""}` : base;
    const title = q.letter
      ? en ? `Suppliers of the City of ${cityNom} starting with ${q.letter}${q.p > 1 ? ` (page ${q.p})` : ""}` : `Fournisseurs de la Ville de ${cityNom}, lettre ${q.letter}${q.p > 1 ? ` (page ${q.p})` : ""}`
      : en ? `Every supplier with a public contract from the City of ${cityNom}, A to Z` : `Tous les fournisseurs titulaires d'un marché de la Ville de ${cityNom}, de A à Z`;
    const answer = en
      ? `${intFr(total, "en")} companies won public contracts from the City of ${cityNom}, each with its own page: contracts, amounts (maximum notified) and years. Source: DECP via ${city === "paris" ? "opendata.paris.fr" : "data.gouv.fr"}.`
      : `${intFr(total, "fr")} entreprises ont obtenu des marchés publics de la Ville de ${cityNom}, chacune avec sa page : contrats, montants (plafonds notifiés) et années. Source : DECP via ${city === "paris" ? "opendata.paris.fr" : "data.gouv.fr"}.`;
    return answerMetadata({ title, answer }, path, locale);
  }
  async function Page({ params }: Props) {
    const q = parse((await params).parts);
    if (!q) notFound();
    const path = q.letter ? `${base}/${q.letter}${q.p > 1 ? `/${q.p}` : ""}` : base;
    const locale = await readLocale();
    const en = locale === "en";
    const list = fournisseurList(city);
    const counts = countByLetter(list.map((f) => f.nom));
    const rail = letterRail(base, counts, q.letter);
    let items: BrowseItem[] = [];
    let pager;
    if (q.letter) {
      const pg = page(fournisseurItems(city, q.letter, locale), q.p);
      if (pg.items.length === 0 || q.p > pg.pages) notFound();
      items = pg.items;
      pager = { page: pg.page, pages: pg.pages, hrefFor: (p: number) => (p === 1 ? `${base}/${q.letter}` : `${base}/${q.letter}/${p}`), prevLabel: en ? "Previous" : "Précédent", nextLabel: en ? "Next" : "Suivant", pageLabel: "Page" };
    }
    return frChrome(
      <BrowseList
        seoPath={path}
        locale={locale}
        kicker={en ? "Public contracts of the City" : "Les marchés publics de la Ville"}
        kickerHref={`/fr/city/${city}/marches`}
        title={q.letter ? (en ? `Suppliers starting with ${q.letter}` : `Fournisseurs, lettre ${q.letter}`) : en ? `Every supplier of the City of ${cityNom}, A to Z` : `Tous les fournisseurs de la Ville de ${cityNom}, de A à Z`}
        intro={en ? `${intFr(list.length, "en")} companies with at least one public contract, each with its own page. Amounts are the maximum notified, not what was paid.` : `${intFr(list.length, "fr")} entreprises titulaires d'au moins un marché, chacune avec sa page. Les montants sont les plafonds notifiés, pas la dépense.`}
        rail={rail}
        railLabel={en ? "By first letter" : "Par première lettre"}
        items={items}
        pager={pager}
        siblings={[
          { href: `/fr/city/${city}/marches/contrats`, label: en ? "Contracts by year" : "Marchés par année" },
          { href: `/fr/city/${city}/subventions/associations`, label: en ? "Grant recipients A to Z" : "Bénéficiaires de subventions de A à Z" },
        ]}
        siblingsLabel={en ? "Other indexes:" : "Autres index :"}
      />,
    );
  }
  return { generateMetadata, Page };
}

/** Contracts of a French city, by year of notification. */
export function makeContratsBrowse(city: string) {
  const base = `/fr/city/${city}/marches/contrats`;
  const cityNom = getCity(city)?.nom ?? city;
  const parse = (parts: string[] = []) => {
    const year = parts[0] ? Number(parts[0]) : null;
    const p = parts[1] ? Number(parts[1]) : 1;
    if (year != null && (!Number.isInteger(year) || !marchesYears(city).includes(year))) return null;
    if (parts.length > 2 || !Number.isInteger(p) || p < 1) return null;
    return { year, p };
  };
  async function generateMetadata({ params }: Props): Promise<Metadata> {
    const q = parse((await params).parts);
    if (!q) notFound();
    const locale = await readLocale();
    const en = locale === "en";
    const years = marchesYears(city);
    const path = q.year ? `${base}/${q.year}${q.p > 1 ? `/${q.p}` : ""}` : base;
    const title = q.year
      ? en ? `Public contracts notified by the City of ${cityNom} in ${q.year}${q.p > 1 ? ` (page ${q.p})` : ""}` : `Marchés publics notifiés par la Ville de ${cityNom} en ${q.year}${q.p > 1 ? ` (page ${q.p})` : ""}`
      : en ? `Every public contract of the City of ${cityNom}, year by year` : `Tous les marchés publics de la Ville de ${cityNom}, année par année`;
    const answer = en
      ? `The contracts the City of ${cityNom} notified from ${years[years.length - 1]} to ${years[0]}, each with its own page: object, supplier, maximum amount, procedure. Source: DECP via ${city === "paris" ? "opendata.paris.fr" : "data.gouv.fr"}.`
      : `Les marchés notifiés par la Ville de ${cityNom} de ${years[years.length - 1]} à ${years[0]}, chacun avec sa page : objet, titulaire, montant maximal, procédure. Source : DECP via ${city === "paris" ? "opendata.paris.fr" : "data.gouv.fr"}.`;
    return answerMetadata({ title, answer }, path, locale);
  }
  async function Page({ params }: Props) {
    const q = parse((await params).parts);
    if (!q) notFound();
    const path = q.year ? `${base}/${q.year}${q.p > 1 ? `/${q.p}` : ""}` : base;
    const locale = await readLocale();
    const en = locale === "en";
    const years = marchesYears(city);
    const rail: BrowseNav[] = years.map((y) => ({ href: `${base}/${y}`, label: String(y), active: y === q.year }));
    let items: BrowseItem[] = [];
    let pager;
    let n = 0;
    if (q.year) {
      const all = contratItems(city, q.year, locale);
      n = all.length;
      const pg = page(all, q.p);
      if (pg.items.length === 0 || q.p > pg.pages) notFound();
      items = pg.items;
      pager = { page: pg.page, pages: pg.pages, hrefFor: (p: number) => (p === 1 ? `${base}/${q.year}` : `${base}/${q.year}/${p}`), prevLabel: en ? "Previous" : "Précédent", nextLabel: en ? "Next" : "Suivant", pageLabel: "Page" };
    }
    return frChrome(
      <BrowseList
        seoPath={path}
        locale={locale}
        kicker={en ? "Public contracts of the City" : "Les marchés publics de la Ville"}
        kickerHref={`/fr/city/${city}/marches`}
        title={q.year ? (en ? `Contracts notified in ${q.year}` : `Marchés notifiés en ${q.year}`) : en ? `Every public contract of the City of ${cityNom}, by year` : `Tous les marchés publics de la Ville de ${cityNom}, par année`}
        intro={q.year ? (en ? `${intFr(n, "en")} contracts notified in ${q.year}, biggest first. Amounts are the maximum notified, not what was paid.` : `${intFr(n, "fr")} marchés notifiés en ${q.year}, du plus gros au plus petit. Les montants sont les plafonds notifiés, pas la dépense.`) : en ? "Pick a year." : "Choisissez une année."}
        rail={rail}
        railLabel={en ? "By year" : "Par année"}
        items={items}
        pager={pager}
        siblings={[
          { href: `/fr/city/${city}/marches/fournisseurs`, label: en ? "Suppliers A to Z" : "Fournisseurs de A à Z" },
          { href: `/fr/city/${city}/subventions/associations`, label: en ? "Grant recipients A to Z" : "Bénéficiaires de subventions de A à Z" },
        ]}
        siblingsLabel={en ? "Other indexes:" : "Autres index :"}
      />,
    );
  }
  return { generateMetadata, Page };
}

/** Paris investment projects, by year then arrondissement. */
export function makeProjetsBrowse() {
  const base = "/fr/city/paris/investissements/projets";
  const parse = (parts: string[] = []) => {
    const year = parts[0] ? Number(parts[0]) : null;
    const arr = parts[1] != null ? Number(parts[1]) : null;
    if (year != null && (!Number.isInteger(year) || !projetYears().includes(year))) return null;
    if (arr != null && (!Number.isInteger(arr) || arr < 0 || arr > 20)) return null;
    if (parts.length > 2) return null;
    return { year, arr };
  };
  const arrLabel = (a: number, en: boolean) => (a === 0 ? (en ? "Paris-wide" : "Tout Paris") : en ? `${a}${a === 1 ? "st" : a === 2 ? "nd" : a === 3 ? "rd" : "th"}` : `${a}${a === 1 ? "er" : "e"}`);
  async function generateMetadata({ params }: Props): Promise<Metadata> {
    const q = parse((await params).parts);
    if (!q) notFound();
    const locale = await readLocale();
    const en = locale === "en";
    const path = q.year ? `${base}/${q.year}${q.arr != null ? `/${q.arr}` : ""}` : base;
    const title = q.year
      ? q.arr != null
        ? en ? `Investment projects of the City of Paris in ${q.year}, ${arrLabel(q.arr, true)} arrondissement` : `Projets d'investissement de la Ville de Paris en ${q.year}, ${arrLabel(q.arr, false)} arrondissement`
        : en ? `Investment projects of the City of Paris in ${q.year}, by arrondissement` : `Projets d'investissement de la Ville de Paris en ${q.year}, par arrondissement`
      : en ? "Every investment project of the City of Paris, year by year" : "Tous les projets d'investissement de la Ville de Paris, année par année";
    const answer = en
      ? "The localised investment projects of the City of Paris, each with its own page: amount, chapter, arrondissement and the contracts attached. Source: City of Paris, localised investments in the administrative account."
      : "Les projets d'investissement localisés de la Ville de Paris, chacun avec sa page : montant, chapitre, arrondissement et les marchés rattachés. Source : Ville de Paris, investissements localisés du compte administratif.";
    return answerMetadata({ title, answer }, path, locale);
  }
  async function Page({ params }: Props) {
    const q = parse((await params).parts);
    if (!q) notFound();
    const path = q.year ? `${base}/${q.year}${q.arr != null ? `/${q.arr}` : ""}` : base;
    const locale = await readLocale();
    const en = locale === "en";
    const years = projetYears();
    let rail: BrowseNav[];
    let items: BrowseItem[] = [];
    if (!q.year) {
      rail = years.map((y) => ({ href: `${base}/${y}`, label: String(y) }));
    } else if (q.arr == null) {
      rail = projetArrondissements(q.year).map((a) => ({ href: `${base}/${q.year}/${a.arr}`, label: arrLabel(a.arr, en), count: a.count }));
    } else {
      rail = projetArrondissements(q.year).map((a) => ({ href: `${base}/${q.year}/${a.arr}`, label: arrLabel(a.arr, en), count: a.count, active: a.arr === q.arr }));
      items = projetItems(q.year, q.arr, locale);
      if (items.length === 0) notFound();
    }
    return frChrome(
      <BrowseList
        seoPath={path}
        locale={locale}
        kicker={en ? "The City of Paris's investments" : "Les investissements de la Ville de Paris"}
        kickerHref="/fr/city/paris/investissements"
        title={q.year ? (q.arr != null ? (en ? `Projects in ${q.year}, ${arrLabel(q.arr, true)} arrondissement` : `Projets ${q.year}, ${arrLabel(q.arr, false)} arrondissement`) : en ? `Projects in ${q.year}, by arrondissement` : `Projets ${q.year}, par arrondissement`) : en ? "Every investment project, by year" : "Tous les projets d'investissement, par année"}
        intro={q.year ? (q.arr != null ? (en ? `${intFr(items.length, "en")} projects, biggest first.` : `${intFr(items.length, "fr")} projets, du plus gros au plus petit.`) : en ? "Pick an arrondissement." : "Choisissez un arrondissement.") : en ? "Pick a year." : "Choisissez une année."}
        rail={rail}
        railLabel={q.year ? (en ? "By arrondissement" : "Par arrondissement") : en ? "By year" : "Par année"}
        items={items}
        siblings={[
          { href: "/fr/city/paris/lieux", label: en ? "Places" : "Lieux" },
          { href: "/fr/city/paris/marches/contrats", label: en ? "Contracts by year" : "Marchés par année" },
        ]}
        siblingsLabel={en ? "Other indexes:" : "Autres index :"}
      />,
    );
  }
  return { generateMetadata, Page };
}

/** San Francisco payees with a fiche, by first letter (English only). */
export function makeSfPayeesBrowse() {
  const base = "/us/city/sf/who-gets-paid/payees";
  const parse = (parts: string[] = []) => {
    const letter = parts[0] ? decodeURIComponent(parts[0]).toUpperCase() : null;
    if (letter && !isLetter(letter)) return null;
    if (parts.length > 1) return null;
    return { letter };
  };
  async function generateMetadata({ params }: Props): Promise<Metadata> {
    const q = parse((await params).parts);
    if (!q) notFound();
    const total = sfPayeeNames().length;
    const path = q.letter ? `${base}/${q.letter}` : base;
    return answerMetadata(
      {
        title: q.letter ? `San Francisco payees starting with ${q.letter}` : "Every San Francisco payee with a page, A to Z",
        answer: `${intFr(total, "en")} organisations paid by the City and County of San Francisco, each with its own page: amounts by year, departments and contracts. Source: SF Controller vendor payments (open data).`,
      },
      path,
      "en",
    );
  }
  async function Page({ params }: Props) {
    const q = parse((await params).parts);
    if (!q) notFound();
    const path = q.letter ? `${base}/${q.letter}` : base;
    const counts = countByLetter(sfPayeeNames());
    const total = counts.reduce((s, c) => s + c.count, 0);
    const items = q.letter ? sfPayeeItems(q.letter) : [];
    if (q.letter && items.length === 0) notFound();
    return (
      <BrowseList
        seoPath={path}
        locale={"en"}
        kicker="Who gets paid in San Francisco"
        kickerHref="/us/city/sf/who-gets-paid"
        title={q.letter ? `Payees starting with ${q.letter}` : "Every payee with a page, A to Z"}
        intro={`${intFr(total, "en")} organisations paid by the City, each with its own page. Pick a letter.`}
        rail={letterRail(base, counts, q.letter)}
        railLabel="By first letter"
        items={items}
      />
    );
  }
  return { generateMetadata, Page };
}

/** Recife recipients, by first letter (Portuguese on pt., English on www). */
export function makeRecifeRecipientsBrowse() {
  const base = "/br/city/recife/quem-recebe/todos";
  const parse = (parts: string[] = []) => {
    const letter = parts[0] ? decodeURIComponent(parts[0]).toUpperCase() : null;
    const p = parts[1] ? Number(parts[1]) : 1;
    if (letter && !isLetter(letter)) return null;
    if (parts.length > 2 || !Number.isInteger(p) || p < 1) return null;
    return { letter, p };
  };
  async function generateMetadata({ params }: Props): Promise<Metadata> {
    const q = parse((await params).parts);
    if (!q) notFound();
    const locale = await recifeLocale();
    const en = locale === "en";
    const total = recifeRecipientNames().length;
    const path = q.letter ? `${base}/${q.letter}${q.p > 1 ? `/${q.p}` : ""}` : base;
    return answerMetadata(
      {
        title: q.letter
          ? en ? `Recife payees starting with ${q.letter}${q.p > 1 ? ` (page ${q.p})` : ""}` : `Quem recebe da Prefeitura do Recife, letra ${q.letter}${q.p > 1 ? ` (página ${q.p})` : ""}`
          : en ? "Every organisation paid by the City of Recife, A to Z" : "Todas as organizações pagas pela Prefeitura do Recife, de A a Z",
        answer: en
          ? `${intFr(total, "en")} organisations (CNPJ) paid by the City of Recife, each with its own page: amounts by year, city bodies and contracts. Source: Portal da Transparência do Recife.`
          : `${intFr(total, "pt")} organizações (CNPJ) pagas pela Prefeitura do Recife, cada uma com sua página: valores por ano, órgãos e contratos. Fonte: Portal da Transparência do Recife.`,
      },
      path,
      locale,
    );
  }
  async function Page({ params }: Props) {
    const q = parse((await params).parts);
    if (!q) notFound();
    const path = q.letter ? `${base}/${q.letter}${q.p > 1 ? `/${q.p}` : ""}` : base;
    const locale = await recifeLocale();
    const en = locale === "en";
    const counts = countByLetter(recifeRecipientNames());
    const total = counts.reduce((s, c) => s + c.count, 0);
    let items: BrowseItem[] = [];
    let pager;
    if (q.letter) {
      const pg = page(recifeRecipientItems(q.letter, locale), q.p);
      if (pg.items.length === 0 || q.p > pg.pages) notFound();
      items = pg.items;
      pager = { page: pg.page, pages: pg.pages, hrefFor: (p: number) => (p === 1 ? `${base}/${q.letter}` : `${base}/${q.letter}/${p}`), prevLabel: en ? "Previous" : "Anterior", nextLabel: en ? "Next" : "Próxima", pageLabel: en ? "Page" : "Página" };
    }
    return (
      <main className="fx-wrap" style={{ paddingBottom: 64 }}>
        <BrowseList
        seoPath={path}
        locale={locale}
          kicker={en ? "Who gets paid in Recife" : "Quem recebe da Prefeitura do Recife"}
          kickerHref="/br/city/recife/quem-recebe"
          title={q.letter ? (en ? `Payees starting with ${q.letter}` : `Letra ${q.letter}`) : en ? "Every organisation paid by the City, A to Z" : "Todas as organizações pagas pela Prefeitura, de A a Z"}
          intro={en ? `${intFr(total, "en")} organisations, each with its own page. Pick a letter.` : `${intFr(total, "pt")} organizações, cada uma com sua página. Escolha uma letra.`}
          rail={letterRail(base, counts, q.letter)}
          railLabel={en ? "By first letter" : "Por letra inicial"}
          items={items}
          pager={pager}
        />
      </main>
    );
  }
  return { generateMetadata, Page };
}

export { LETTERS };
