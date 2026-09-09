/**
 * Browse indexes — plain, paged lists of links so that a crawler (or a
 * reader without the search box) reaches every entity page in three clicks:
 * footer → index → letter or year page → fiche. The search box is invisible
 * to crawlers; these pages are what makes 30 000 fiches discoverable.
 *
 * Each list reads the same export the fiche route resolves against and
 * builds the same slug, so every link renders. Private individuals never
 * appear (the search index already excludes them; the marchés files name
 * companies only).
 */
import { cityJsonPath, listDataDir, readDataJsonOrNull } from "@/lib/data/read";
import { fmtCompactEur } from "@/lib/fmt";
import { fmtBrlCompact } from "@/lib/br/format";
import { fmtUsdCompact } from "@/lib/us/format";
import { loadSfPayeesIndex } from "@/lib/us/sf-payees-data";
import { assocHref } from "@/lib/assoc-slug";

export type BrowseItem = { href: string; label: string; sub?: string | null; amount?: { v: string; u: string } | null };
export type LetterCount = { letter: string; count: number };

export const PAGE_SIZE = 200;
export const LETTERS = ["0-9", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

/** First letter of a name, accents folded; digits and symbols go to "0-9". */
export function letterOf(name: string): string {
  const c = name
    .trim()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .charAt(0)
    .toUpperCase();
  return /^[A-Z]$/.test(c) ? c : "0-9";
}

export function isLetter(s: string): boolean {
  return LETTERS.includes(s);
}

const eur = (n: number) => {
  const c = fmtCompactEur(n);
  return { v: c.value, u: c.unit };
};

/** Paginate a sorted list; page numbers are 1-based. */
export function page<T>(items: T[], n: number): { items: T[]; page: number; pages: number; total: number } {
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const p = Math.min(Math.max(1, n), pages);
  return { items: items.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), page: p, pages, total: items.length };
}

export function countByLetter(names: string[]): LetterCount[] {
  const m = new Map<string, number>();
  for (const n of names) m.set(letterOf(n), (m.get(letterOf(n)) ?? 0) + 1);
  return LETTERS.map((letter) => ({ letter, count: m.get(letter) ?? 0 }));
}

// ── France: associations ────────────────────────────────────────────────────

type SearchIndex = { data: { name: string; totalAmount: number; nb: number; byYear: Record<string, number> }[] };

export function associationNames(city: string): { name: string; totalAmount: number; nb: number; years: string }[] {
  const idx = readDataJsonOrNull<SearchIndex>(cityJsonPath(city, "subventions/beneficiaires_search.json"));
  return (idx?.data ?? []).map((r) => {
    const ys = Object.keys(r.byYear).sort();
    return { name: r.name, totalAmount: r.totalAmount, nb: r.nb, years: ys.length > 1 ? `${ys[0]}–${ys[ys.length - 1]}` : (ys[0] ?? "") };
  });
}

/** One name per fiche — spelling variants share a slug — so letter counts and page counts match the pages. */
export function associationUniqueNames(city: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of associationNames(city)) {
    const h = assocHref(city, r.name);
    if (seen.has(h)) continue;
    seen.add(h);
    out.push(r.name);
  }
  return out;
}

export function associationItems(city: string, letter: string, locale: "fr" | "en"): BrowseItem[] {
  // Two spellings of one organisation share a slug, hence a page: list it once.
  const seen = new Set<string>();
  return associationNames(city)
    .filter((r) => letterOf(r.name) === letter)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    .filter((r) => {
      const h = assocHref(city, r.name);
      if (seen.has(h)) return false;
      seen.add(h);
      return true;
    })
    .map((r) => ({
      href: assocHref(city, r.name),
      label: r.name,
      sub: locale === "en" ? `${r.nb} grant${r.nb > 1 ? "s" : ""}${r.years ? `, ${r.years}` : ""}` : `${r.nb} subvention${r.nb > 1 ? "s" : ""}${r.years ? `, ${r.years}` : ""}`,
      amount: eur(r.totalAmount),
    }));
}

// ── France: fournisseurs and contrats ───────────────────────────────────────

type MarchesIndex = { availableYears: number[] };
type MarcheRow = { numero_marche?: string; objet?: string; fournisseur_nom?: string; fournisseur_siret?: string; montant_max?: number; montant_min?: number; date_notification?: string };
type MarchesFile = { data?: MarcheRow[]; marches?: MarcheRow[] };

export function marchesYears(city: string): number[] {
  return (readDataJsonOrNull<MarchesIndex>(cityJsonPath(city, "marches-publics/index.json"))?.availableYears ?? []).slice().sort((a, b) => b - a);
}

function marchesRows(city: string, year: number): MarcheRow[] {
  const f = readDataJsonOrNull<MarchesFile>(cityJsonPath(city, `marches-publics/marches_${year}.json`));
  return f?.data ?? f?.marches ?? [];
}

export function fournisseurList(city: string): { siren: string; nom: string; total: number; count: number; first: number; last: number }[] {
  const by = new Map<string, { siren: string; nom: string; total: number; count: number; first: number; last: number }>();
  for (const y of marchesYears(city)) {
    for (const r of marchesRows(city, y)) {
      const siren = (r.fournisseur_siret ?? "").replace(/\s/g, "").slice(0, 9);
      if (!/^\d{9}$/.test(siren)) continue;
      const cur = by.get(siren) ?? { siren, nom: r.fournisseur_nom ?? siren, total: 0, count: 0, first: y, last: y };
      cur.total += Number(r.montant_max ?? r.montant_min ?? 0) || 0;
      cur.count += 1;
      cur.first = Math.min(cur.first, y);
      cur.last = Math.max(cur.last, y);
      if (y >= cur.last && r.fournisseur_nom) cur.nom = r.fournisseur_nom;
      by.set(siren, cur);
    }
  }
  return [...by.values()];
}

export function fournisseurItems(city: string, letter: string, locale: "fr" | "en"): BrowseItem[] {
  return fournisseurList(city)
    .filter((f) => letterOf(f.nom) === letter)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    .map((f) => ({
      href: `/fr/city/${city}/marches/fournisseur/${f.siren}`,
      label: f.nom,
      sub: locale === "en" ? `${f.count} contract${f.count > 1 ? "s" : ""}, ${f.first === f.last ? f.first : `${f.first}–${f.last}`}` : `${f.count} marché${f.count > 1 ? "s" : ""}, ${f.first === f.last ? f.first : `${f.first}–${f.last}`}`,
      amount: eur(f.total),
    }));
}

export function contratItems(city: string, year: number, locale: "fr" | "en"): BrowseItem[] {
  return marchesRows(city, year)
    .filter((r) => r.numero_marche)
    .sort((a, b) => (Number(b.montant_max ?? 0) || 0) - (Number(a.montant_max ?? 0) || 0))
    .map((r) => ({
      href: `/fr/city/${city}/marches/contrat/${encodeURIComponent(r.numero_marche!)}`,
      label: (r.objet ?? r.numero_marche!).slice(0, 120),
      sub: [r.fournisseur_nom, locale === "en" ? `notified ${year}` : `notifié en ${year}`].filter(Boolean).join(" · "),
      amount: r.montant_max != null ? eur(Number(r.montant_max)) : null,
    }));
}

// ── Paris: projets ──────────────────────────────────────────────────────────

type InvComplet = { data: { id: string; nom_projet?: string; montant?: number; arrondissement?: number; chapitre_libelle?: string }[] };

export function projetYears(): number[] {
  return listDataDir("map")
    .map((f) => f.match(/^investissements_complet_(\d{4})$/)?.[1])
    .filter((y): y is string => !!y)
    .map(Number)
    .sort((a, b) => b - a);
}

export function projetArrondissements(year: number): { arr: number; count: number }[] {
  const doc = readDataJsonOrNull<InvComplet>(`map/investissements_complet_${year}.json`);
  const m = new Map<number, number>();
  for (const r of doc?.data ?? []) {
    const a = Number(r.arrondissement ?? 0);
    m.set(a, (m.get(a) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([arr, count]) => ({ arr, count }));
}

export function projetItems(year: number, arr: number, locale: "fr" | "en"): BrowseItem[] {
  const doc = readDataJsonOrNull<InvComplet>(`map/investissements_complet_${year}.json`);
  return (doc?.data ?? [])
    .filter((r) => Number(r.arrondissement ?? 0) === arr && r.id)
    .sort((a, b) => (b.montant ?? 0) - (a.montant ?? 0))
    .map((r) => ({
      href: `/fr/city/paris/investissements/projet/${encodeURIComponent(r.id)}`,
      label: r.nom_projet ?? r.id,
      sub: [r.chapitre_libelle, String(year)].filter(Boolean).join(" · ") || (locale === "en" ? `Project, ${year}` : `Projet, ${year}`),
      amount: r.montant != null ? eur(r.montant) : null,
    }));
}

// ── San Francisco: payees ───────────────────────────────────────────────────

export function sfPayeeItems(letter: string): BrowseItem[] {
  const withFiche = new Set(listDataDir("us/sf/payees"));
  return loadSfPayeesIndex()
    .filter((p) => withFiche.has(p.slug) && letterOf(p.name) === letter)
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .map((p) => ({
      href: `/us/city/sf/who-gets-paid/payee/${p.slug}`,
      label: p.name,
      sub: `${p.kind}${p.last_year ? `, paid through ${p.last_year}` : ""}`,
      amount: { v: fmtUsdCompact(p.total_paid_usd), u: "" },
    }));
}

export function sfPayeeNames(): string[] {
  const withFiche = new Set(listDataDir("us/sf/payees"));
  return loadSfPayeesIndex()
    .filter((p) => withFiche.has(p.slug))
    .map((p) => p.name);
}

// ── Recife: recebedores ─────────────────────────────────────────────────────

type Recipients = { items: Record<string, { cnpj: string; nome: string; total_pago: number; by_year?: { ano: number }[] }> };

export function recifeRecipientNames(): string[] {
  return Object.values(readDataJsonOrNull<Recipients>("br/recife/recipients.json")?.items ?? {}).map((r) => r.nome);
}

export function recifeRecipientItems(letter: string, locale: "pt" | "en"): BrowseItem[] {
  return Object.values(readDataJsonOrNull<Recipients>("br/recife/recipients.json")?.items ?? {})
    .filter((r) => letterOf(r.nome) === letter)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt"))
    .map((r) => {
      const ys = (r.by_year ?? []).map((y) => y.ano).sort();
      const span = ys.length > 1 ? `${ys[0]}–${ys[ys.length - 1]}` : (ys[0] ?? "");
      return {
        href: `/br/city/recife/quem-recebe/${r.cnpj}`,
        label: r.nome,
        sub: span ? (locale === "en" ? `Paid ${span}` : `Pagamentos ${span}`) : null,
        amount: { v: fmtBrlCompact(r.total_pago), u: "" },
      };
    });
}
