import type { Metadata } from "next";
import "@/app/fusion.css";
import { Footer, Navbar } from "@/components/fusion";
import FranceHubClient, { type FranceHubData } from "./FranceHubClient";
import { loadAllCommunesIndex } from "@/lib/all-communes";
import {
  loadBudgetIndex,
  loadBudgetPageData,
  loadInvestissementsData,
  loadLogementSocialData,
  loadMarchesPageData,
  loadPatrimoineData,
  loadQuiRecoitData,
} from "@/lib/fusion-data";
import { loadLieuxIndex } from "@/lib/lieux-data";
import { readSiteLocale } from "@/lib/seo";
import { sectionAlternates } from "@/lib/seo/page-answer";
import budgetManifest from "@/data/communes-budget-manifest.json";

/**
 * /fr/france, /en/france (2026-09-18): the France hub, on the Brazil hub's
 * model. The field to find one's commune among the 34 932, the country's
 * number, Paris as the documented city, Marseille, the 20 largest communes as
 * a way in, and where the numbers come from. Used to redirect to the national
 * budget, which now sits behind a door.
 */

/** OFGL's "dépenses totales hors remboursement d'emprunts" : the same KPI the
 *  commune pages compare their peers on. */
const KPI = "depenses_totales";

function hubData(): FranceHubData {
  const idx = loadAllCommunesIndex();
  const all = idx ? Object.values(idx.communes) : [];
  const total = all.reduce((s, c) => s + (c.kpis[KPI]?.montant ?? 0), 0);
  const byPop = all.slice().sort((a, b) => b.pop - a.pop);
  const biggest = byPop.slice(0, 20).map((c) => ({ slug: c.slug, nom: c.nom, dep: c.dep_name, pop: c.pop, hab: c.kpis[KPI]?.eur_hab ?? null }));
  const suggestions = byPop.slice(0, 8).map((c) => ({ slug: c.slug, nom: c.nom, pop: c.pop, dep_name: c.dep_name }));
  // The last year a commune page can show (DGFiP balances) : said in "where the
  // numbers come from", never typed by hand.
  const years = Object.values((budgetManifest as { communes: Record<string, number[]> }).communes);
  const lastYear = years.reduce((m, ys) => Math.max(m, ...ys), 0);

  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const voted = (city: string, year: number) => (loadBudgetIndex(city).summary.find((s) => s.year === year)?.type_budget ?? "execute") === "vote";
  const paris = {
    budget: safe(() => { const d = loadBudgetPageData(); return { total: d.depenses, year: d.year, voted: voted("paris", d.year) }; }),
    subventions: safe(() => { const d = loadQuiRecoitData(); return { total: d.total, year: d.year }; }),
    marches: safe(() => { const d = loadMarchesPageData(); return { total: d.total, nb: d.nb, year: d.year }; }),
    investissements: safe(() => { const d = loadInvestissementsData(); return { total: d.total, year: d.year }; }),
    dette: safe(() => { const d = loadPatrimoineData(); return { total: d.detteFinanciere, year: d.year }; }),
    logement: safe(() => { const d = loadLogementSocialData(); return Number.isFinite(d.sruRatio) ? { sru: d.sruRatio, year: d.sruYear } : null; }),
    lieux: safe(() => { const l = loadLieuxIndex(); return { n: l.length, money: l.reduce((s, x) => s + (x.argent_total_eur ?? 0), 0) }; }),
  };
  const marseille = safe(() => { const d = loadBudgetPageData(undefined, "marseille"); return { total: d.depenses, year: d.year, voted: voted("marseille", d.year) }; });
  return {
    count: idx?.n_communes ?? all.length,
    year: idx?.year ?? 0,
    total,
    lastYear,
    biggest,
    suggestions,
    paris,
    marseille,
  };
}

/** The title's amount, as the section titles write it ("116 Md€" / "€116bn"). */
function money(n: number, en: boolean): string {
  const nf = (digits: number) => new Intl.NumberFormat(en ? "en-GB" : "fr-FR", { maximumFractionDigits: digits });
  if (Math.abs(n) >= 1e9) return en ? `€${nf(0).format(n / 1e9)}bn` : `${nf(0).format(n / 1e9)}\u00a0Md€`;
  return en ? `€${nf(0).format(n / 1e6)}M` : `${nf(0).format(n / 1e6)}\u00a0M€`;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await readSiteLocale();
  const en = locale === "en";
  const d = hubData();
  const n = new Intl.NumberFormat(en ? "en-GB" : "fr-FR").format(d.count);
  const meta = en
    ? { title: `France: where public money goes in each of ${n} towns`, description: `Every French town has its page: what it spent in ${d.year} (${money(d.total, true)} in all), per resident, against towns of the same size, function by function where the accounts allow. Paris and Marseille in detail. Source: OFGL, DGFiP.` }
    : { title: `France : où va l'argent public de chacune des ${n} communes`, description: `Chaque commune de France a sa page : ce qu'elle a dépensé en ${d.year} (${money(d.total, false)} en tout), par habitant, face aux communes de même taille, fonction par fonction quand les comptes le permettent. Paris et Marseille en détail. Source : OFGL, DGFiP.` };
  return { ...meta, ...sectionAlternates("/france", locale) };
}

export default function FranceHub() {
  return (
    <div className="theme-fusion">
      <Navbar />
      <FranceHubClient d={hubData()} />
      <Footer />
    </div>
  );
}
