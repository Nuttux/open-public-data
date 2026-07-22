import { loadQuiRecoitData } from "@/lib/fusion-data";
import { OG_SIZE, ogCard, ogFmtBnFr, ogFmtFr } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Qipu — Subventions de la Ville de Paris";

export default async function SubventionsOG() {
  const d = loadQuiRecoitData();
  const totalDisplay = `${ogFmtBnFr(d.total)} Md€`;
  const nbDisplay = ogFmtFr(d.nbSubventions);

  return ogCard({
    route: "/subventions",
    kicker: `Subventions · Ville de Paris · ${d.year}`,
    title: "Qui reçoit l'argent public ?",
    stats: [
      { label: `Montant versé ${d.year}`, value: totalDisplay },
      { label: "Subventions versées", value: nbDisplay },
    ],
    source: "Source Paris Open Data · Comptes M57",
    url: "qipu.org/fr/city/paris/subventions",
  });
}
