import { loadChapitre } from "@/lib/fusion-data";
import { OG_SIZE, ogCard, ogFmtEur } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Chapitre investissements — France Open Data";

export default async function ChapitreOG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = loadChapitre(slug);
  const label = d?.label ?? "Chapitre";
  const total = d ? ogFmtEur(d.total) : "—";
  const nbProjets = d?.nbProjets ?? 0;
  const sharePct = d ? (d.share * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—";
  const year = d?.year ?? "";

  return ogCard({
    variant: "detail",
    route: "/investissements/chapitre",
    kicker: `Investissements · Ville de Paris · ${year}`,
    title: label,
    stats: [
      { label: `Investi ${year}`, value: total },
      { label: "Projets", value: nbProjets.toLocaleString("fr-FR") },
      { label: "Part du total", value: `${sharePct} %`, accent: true },
    ],
    source: "Source Paris Open Data · Annexes IL CA M57",
    url: "franceopendata.org/.../investissements/chapitre",
  });
}
