import { loadInvestissementsData } from "@/lib/fusion-data";
import { OG_SIZE, ogCard, ogFmtBnFr, ogFmtFr } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "France Open Data — Investissements de la Ville de Paris";

export default async function InvestissementsOG() {
  const d = loadInvestissementsData();
  const totalDisplay = `${ogFmtBnFr(d.total)} Md€`;
  const nbDisplay = ogFmtFr(d.nbProjets);

  return ogCard({
    route: "/investissements",
    kicker: `Investissements · Ville de Paris · ${d.year}`,
    title: "Que construit la Ville ?",
    stats: [
      { label: `Investissements ${d.year}`, value: totalDisplay },
      { label: "Projets recensés", value: nbDisplay },
    ],
    source: "Source Paris Open Data · CA M57",
    url: "franceopendata.org/fr/city/paris/investissements",
  });
}
