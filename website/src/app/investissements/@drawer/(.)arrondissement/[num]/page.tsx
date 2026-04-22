import { notFound } from "next/navigation";

import { ArrondissementFiche, DetailDrawer } from "@/components/fusion";
import { loadArrondissement } from "@/lib/fusion-data";

type Params = { num: string };

const suf = (n: number) => (n === 1 ? "er" : "ᵉ");

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("fr-FR")} k€`;
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
};

/**
 * Intercepted route — ouvre la fiche arrondissement en side drawer quand
 * l'utilisateur clique un polygone du choropleth sur /investissements.
 * Navigation directe (lien partagé) → page complète.
 */
export default async function DrawerArrondissementPage({ params }: { params: Promise<Params> }) {
  const { num } = await params;
  const arrNum = parseInt(num, 10);
  const arr = loadArrondissement(arrNum);
  if (!arr) return notFound();

  const shareText = `${arr.arr}${suf(arr.arr)} arrondissement de Paris — ${fmtEur(arr.total)} investis en ${arr.year} sur ${arr.nbProjets} projets`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<>Arrondissement · Investissement · {arr.year}</>}
        title={`${arr.arr}${suf(arr.arr)} arrondissement`}
        shareUrl={`/investissements/arrondissement/${arr.arr}`}
        shareText={shareText}
        backHref="/investissements"
        breadcrumbLabel={`${arr.arr}${suf(arr.arr)} arr.`}
      >
        <ArrondissementFiche arr={arr} />
      </DetailDrawer>
    </div>
  );
}
