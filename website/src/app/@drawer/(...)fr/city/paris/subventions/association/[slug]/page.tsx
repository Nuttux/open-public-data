import { notFound } from "next/navigation";

import { DetailDrawer, AssociationFiche } from "@/components/fusion";
import { AssoKicker } from "@/components/fusion/AssoKicker";
import { loadAssociation, loadSubventionVulgarization, loadBeneficiaireGrounded } from "@/lib/fusion-data";
import { lieuForBeneficiaire } from "@/lib/lieux-data";
import VoirLeLieu from "@/components/fusion/VoirLeLieu";

type Params = { slug: string };

export default async function DrawerAssoPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const asso = loadAssociation(slug);
  if (!asso) return notFound();
  const vulgarization = loadSubventionVulgarization(asso.name);
  const grounded = loadBeneficiaireGrounded(asso.name);

  const montantStr = asso.totalAmount >= 1e6
    ? `${(asso.totalAmount / 1e6).toFixed(1).replace(".", ",")} M€`
    : `${Math.round(asso.totalAmount / 1000).toLocaleString("fr-FR")} k€`;
  const shareText = `${asso.name} a reçu ${montantStr} de subventions de la Ville de Paris${asso.theme ? ` (${asso.theme})` : ""}`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<AssoKicker theme={asso.theme} />}
        title={asso.name}
        shareUrl={`/fr/city/paris/subventions/association/${encodeURIComponent(asso.name)}`}
        shareText={shareText}
        backHref="/fr/city/paris/subventions"
        breadcrumbLabel={asso.name}
      >
        <VoirLeLieu lien={lieuForBeneficiaire(asso.name)} locale={"fr"} />
        <AssociationFiche asso={asso} vulgarization={vulgarization} grounded={grounded} />
      </DetailDrawer>
    </div>
  );
}
