import { loadPatrimoineData } from "@/lib/fusion-data";
import { OG_SIZE, ogCard, ogFmtBnFr, ogFmtFr } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Qipu — Dette & patrimoine de la Ville de Paris";

const PARIS_POPULATION = 2_133_000;

export default async function DetteOG() {
  const d = loadPatrimoineData();
  const detteDisplay = `${ogFmtBnFr(d.detteFinanciere)} Md€`;
  const perHab = `${ogFmtFr(Math.round(d.detteFinanciere / PARIS_POPULATION))} €/hab`;

  return ogCard({
    route: "/dette",
    kicker: `Dette & patrimoine · Ville de Paris · ${d.year}`,
    title: "Combien Paris doit-il, à qui ?",
    stats: [
      { label: `Dette financière ${d.year}`, value: detteDisplay },
      { label: "Par habitant", value: perHab },
    ],
    source: "Source Paris Open Data · Bilan M57",
    url: "qipu.org/fr/city/paris/dette",
  });
}
