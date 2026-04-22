import { notFound } from "next/navigation";

import { DetailDrawer } from "@/components/fusion";
import CategorieMarcheFiche from "@/components/fusion/CategorieMarcheFiche";
import { loadMarcheCategorie } from "@/lib/fusion-data";

type Params = { slug: string };

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} M€`;
  return `${Math.round(n / 1e3).toLocaleString("fr-FR")} k€`;
};

export default async function DrawerCategoriePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const fiche = loadMarcheCategorie(slug);
  if (!fiche) return notFound();

  const shareText = `${fiche.category} — ${fmtEur(fiche.total)} d'enveloppe sur ${fiche.nbContrats} contrats (Paris ${fiche.year})`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<>Catégorie · Marchés publics · {fiche.year}</>}
        title={fiche.category}
        shareUrl={`/marches-publics/categorie/${fiche.slug}`}
        shareText={shareText}
        backHref="/marches-publics"
        breadcrumbLabel={fiche.category}
      >
        <CategorieMarcheFiche fiche={fiche} />
      </DetailDrawer>
    </div>
  );
}
