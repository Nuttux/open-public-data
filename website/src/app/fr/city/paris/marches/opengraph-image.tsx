import { loadMarchesPageData } from "@/lib/fusion-data";
import { OG_SIZE, ogCard, ogFmtBnFr, ogFmtFr } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "France Open Data — Marchés publics de la Ville de Paris";

export default async function MarchesOG() {
  const d = loadMarchesPageData();
  const totalDisplay = `${ogFmtBnFr(d.total)} Md€`;
  const nbDisplay = ogFmtFr(d.nb);

  return ogCard({
    route: "/marches",
    kicker: `Marchés publics · Ville de Paris · ${d.year}`,
    title: "À qui la Ville commande-t-elle ?",
    stats: [
      { label: `Enveloppes notifiées ${d.year}`, value: totalDisplay },
      { label: "Contrats notifiés", value: nbDisplay },
    ],
    source: "Source Paris Open Data · DECP",
    url: "franceopendata.org/fr/city/paris/marches",
  });
}
