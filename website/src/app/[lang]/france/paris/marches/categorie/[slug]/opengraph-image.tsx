import { loadMarcheCategorie } from "@/lib/fusion-data";
import { OG_SIZE, ogCard, ogFmtEur } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Catégorie marchés — Qipu";

export default async function CategorieOG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = loadMarcheCategorie(slug);
  const cat = d?.category ?? "Catégorie";
  const total = d ? ogFmtEur(d.total) : "—";
  const nbContrats = d?.nbContrats ?? 0;
  const nbTit = d?.nbTitulaires ?? 0;
  const year = d?.year ?? "";

  return ogCard({
    variant: "detail",
    route: "/marchés/catégorie",
    kicker: `Marchés publics · Ville de Paris · ${year}`,
    title: cat,
    stats: [
      { label: `Enveloppe max ${year}`, value: total },
      { label: "Contrats", value: nbContrats.toLocaleString("fr-FR") },
      { label: "Titulaires", value: nbTit.toLocaleString("fr-FR") },
    ],
    source: "Source DECP · Ville de Paris",
    url: "qipu.org/.../marchés/catégorie",
  });
}
