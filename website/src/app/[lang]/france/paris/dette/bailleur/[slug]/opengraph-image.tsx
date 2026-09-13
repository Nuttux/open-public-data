import { loadBailleur } from "@/lib/fusion-data";
import { ogCard, ogFmtEur, OG_SIZE, type OgStat } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Bailleur — Ville de Paris (engagements hors-bilan)";

export default async function BailleurOG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = loadBailleur(slug);
  const name = d?.name ?? "Bailleur";
  const type = d?.type ?? "";
  const share = typeof d?.share === "number" ? d.share : null;
  const garanties = d?.garanties;
  const capitalRestant = garanties?.capital_restant ?? 0;
  const nbEmprunts = garanties?.count_emprunts ?? 0;
  const yearGaranties = garanties?.year ?? "";

  const stats: OgStat[] = [];
  if (capitalRestant > 0)
    stats.push({ label: "Capital restant dû garanti", value: ogFmtEur(capitalRestant) });
  if (nbEmprunts > 0)
    stats.push({ label: "Emprunts garantis", value: nbEmprunts.toLocaleString("fr-FR") });
  if (share != null) stats.push({ label: "Part du parc social", value: `${share} %`, accent: true });

  return ogCard({
    variant: "detail",
    route: "/dette/bailleur",
    kicker: `Engagements hors-bilan · Ville de Paris ${yearGaranties ? `· ${yearGaranties}` : ""} ${type ? `· ${type}` : ""}`,
    title: name,
    stats,
    heroCount: capitalRestant > 0 ? 1 : 0,
    source: "Source Paris Open Data · Annexe IV-B dette garantie",
    url: "qipu.org/.../dette/bailleur",
  });
}
