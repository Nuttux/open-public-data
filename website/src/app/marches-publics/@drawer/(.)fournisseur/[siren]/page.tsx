import { notFound } from "next/navigation";

import { DetailDrawer, FournisseurFiche } from "@/components/fusion";
import { loadFournisseur, loadSirene } from "@/lib/fusion-data";

type Params = { siren: string };

export default async function DrawerFournisseurPage({ params }: { params: Promise<Params> }) {
  const { siren } = await params;
  const fournisseur = loadFournisseur(siren);
  if (!fournisseur) return notFound();

  const sirene = loadSirene(fournisseur.siren);

  const montantStr = fournisseur.totalAmount >= 1e9
    ? `${(fournisseur.totalAmount / 1e9).toFixed(2).replace(".", ",")} Md€`
    : `${(fournisseur.totalAmount / 1e6).toFixed(1).replace(".", ",")} M€`;
  const years = fournisseur.yearsActive.length
    ? `${Math.min(...fournisseur.yearsActive)}-${Math.max(...fournisseur.yearsActive)}`
    : "";
  const shareText = `${fournisseur.nom} a reçu ${montantStr} de la Ville de Paris via ${fournisseur.contratCount} marchés${years ? ` (${years})` : ""}`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<>Fournisseur · {fournisseur.contratCount} contrats</>}
        title={fournisseur.nom}
        shareUrl={`/marches-publics/fournisseur/${fournisseur.siret || fournisseur.siren}`}
        shareText={shareText}
        backHref="/marches-publics"
        breadcrumbLabel={fournisseur.nom}
      >
        <FournisseurFiche fournisseur={fournisseur} sirene={sirene} />
      </DetailDrawer>
    </div>
  );
}
