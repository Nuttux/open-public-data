import { loadThemeSubventions } from "@/lib/fusion-data";
import { OG_SIZE, ogCard, ogFmtEur } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Thème subventions — Qipu";

const fmtPct = (n: number) =>
  n.toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export default async function ThemeOG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = loadThemeSubventions(slug);

  const themeName = d?.theme ?? "Thème";
  const total = d ? ogFmtEur(d.total) : "—";
  const nb = d?.nbSubventions ?? 0;
  const pct = d ? fmtPct(d.shareOfTotalPct) : "—";
  const year = d?.year ?? "";

  return ogCard({
    variant: "detail",
    route: "/subventions/thème",
    kicker: `Thème · Ville de Paris · ${year}`,
    title: themeName,
    stats: [
      { label: `Montant versé ${year}`, value: total },
      { label: "Subventions", value: nb.toLocaleString("fr-FR") },
      { label: "Part du total", value: `${pct} %`, accent: true },
    ],
    source: "Source Paris Open Data · Comptes M57",
    url: "qipu.org/.../subventions/theme",
  });
}
