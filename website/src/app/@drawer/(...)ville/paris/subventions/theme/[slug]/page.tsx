import { notFound } from "next/navigation";

import { DetailDrawer } from "@/components/fusion";
import ThemeFiche from "@/components/fusion/ThemeFiche";
import { loadThemeSubventions } from "@/lib/fusion-data";

type Params = { slug: string };

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} M€`;
  return `${Math.round(n / 1e3).toLocaleString("fr-FR")} k€`;
};

export default async function DrawerThemePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const fiche = loadThemeSubventions(slug);
  if (!fiche) return notFound();

  const shareText = `${fiche.theme} — ${fmtEur(fiche.total)} versés en ${fiche.year} à ${fiche.nbBeneficiaires} bénéficiaires par la Ville de Paris`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<>Thématique · Subventions · {fiche.year}</>}
        title={fiche.theme}
        shareUrl={`/ville/paris/subventions/theme/${fiche.slug}`}
        shareText={shareText}
        backHref="/ville/paris/subventions"
        breadcrumbLabel={fiche.theme}
      >
        <ThemeFiche fiche={fiche} />
      </DetailDrawer>
    </div>
  );
}
