import { loadArrondissementLogement } from "@/lib/fusion-data";
import { ogCard, OG_SIZE, type OgStat } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Arrondissement — logement social Paris";

export default async function ArrondissementLogementOG({ params }: { params: Promise<{ arr: string }> }) {
  const { arr } = await params;
  const d = loadArrondissementLogement(arr);
  const label = d?.label ?? "Arrondissement";
  const nbLogements = d?.totalLogements ?? 0;
  const nbOperations = d?.nbOperations ?? 0;
  const rank = d?.rank ?? null;
  const year = d?.year ?? "";

  const stats: OgStat[] = [
    { label: `Logements financés ${year}`, value: nbLogements.toLocaleString("fr-FR") },
    { label: "Opérations", value: nbOperations.toLocaleString("fr-FR") },
  ];
  if (rank) stats.push({ label: "Rang", value: `#${rank}`, accent: true });

  return ogCard({
    variant: "detail",
    titleSize: 78,
    titleSpacing: -2.5,
    route: "/logement/arrondissement",
    kicker: `Logement social · Ville de Paris · ${year}`,
    title: label,
    stats,
    source: "Source Paris Open Data · DDT Paris",
    url: "franceopendata.org/.../logement/arrondissement",
  });
}
