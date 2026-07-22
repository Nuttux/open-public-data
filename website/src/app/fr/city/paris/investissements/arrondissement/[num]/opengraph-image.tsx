import { loadArrondissement } from "@/lib/fusion-data";
import { ogCard, ogFmtEur, OG_SIZE, type OgStat } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Arrondissement — investissements Ville de Paris";

const suffix = (n: number) => (n === 1 ? "er" : "ᵉ");

export default async function ArrondissementInvestOG({ params }: { params: Promise<{ num: string }> }) {
  const { num } = await params;
  const arrNum = Number(num);
  const d = Number.isInteger(arrNum) ? loadArrondissement(arrNum) : null;
  const arrLabel = Number.isInteger(arrNum) ? `${arrNum}${suffix(arrNum)} arrondissement` : "Arrondissement";
  const total = d ? ogFmtEur(d.total) : "—";
  const nbProjets = d?.nbProjets ?? 0;
  const rank = d?.rank ?? null;
  const year = d?.year ?? "";

  const stats: OgStat[] = [
    { label: "Investi dans l'arrondissement", value: total },
    { label: "Projets", value: nbProjets.toLocaleString("fr-FR") },
  ];
  if (rank) stats.push({ label: "Rang sur 20", value: `#${rank}`, accent: true });

  return ogCard({
    variant: "detail",
    titleSize: 78,
    titleSpacing: -2.5,
    route: "/investissements/arrondissement",
    kicker: `Investissements · Ville de Paris · ${year}`,
    title: arrLabel,
    stats,
    source: "Source Paris Open Data · Annexes IL CA M57",
    url: "qipu.org/.../investissements/arrondissement",
  });
}
