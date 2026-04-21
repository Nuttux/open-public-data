import { notFound } from "next/navigation";

import { ChapitreFiche, DetailDrawer } from "@/components/fusion";
import { loadChapitre } from "@/lib/fusion-data";

type Params = { slug: string };

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("fr-FR")} k€`;
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
};

export default async function DrawerChapitrePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const chap = loadChapitre(slug);
  if (!chap) return notFound();

  const shareText = `${chap.label} — ${fmtEur(chap.total)} investis en ${chap.year} par la Ville de Paris · ${chap.nbProjets} projets`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<>Chapitre · Investissement · {chap.year}</>}
        title={chap.label}
        shareUrl={`/investissements/chapitre/${chap.slug}`}
        shareText={shareText}
        backHref="/investissements"
        breadcrumbLabel={chap.label}
      >
        <ChapitreFiche chap={chap} />
      </DetailDrawer>
    </div>
  );
}
