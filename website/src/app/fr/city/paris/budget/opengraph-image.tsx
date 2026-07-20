import { loadBudgetPageData, loadBudgetIndex } from "@/lib/fusion-data";
import { OG_SIZE, ogCard, ogFmtBnFr } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "France Open Data — Budget de la Ville de Paris";

const fmtPct = (n: number) => Math.round(n).toString();

export default async function BudgetOG() {
  const idx = loadBudgetIndex();
  const d = loadBudgetPageData();
  const typeBudget = idx.summary.find((s) => s.year === d.year)?.type_budget ?? "execute";
  const isVote = typeBudget === "vote";
  const totalDisplay = `${ogFmtBnFr(d.depenses)} Md€`;
  const pctFonct = d.depenses > 0 ? (d.fonctionnement / d.depenses) * 100 : 0;
  const pctInvest = d.depenses > 0 ? (d.investissement / d.depenses) * 100 : 0;

  return ogCard({
    route: "/budget",
    kicker: `Budget · Ville de Paris · ${d.year} ${isVote ? "(voté)" : "(exécuté)"}`,
    title: "Où va l'argent public ?",
    stats: [
      { label: `Dépenses totales ${d.year}`, value: totalDisplay },
      { label: "Fonctionnement", value: `${fmtPct(pctFonct)} %` },
      { label: "Investissement", value: `${fmtPct(pctInvest)} %` },
    ],
    source: "Source Paris Open Data · Comptes M57",
    url: "franceopendata.org/fr/city/paris/budget",
  });
}
