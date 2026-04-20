import { notFound } from "next/navigation";

import { DetailDrawer, AssociationFiche } from "@/components/fusion";
import { loadAssociation, loadSubventionVulgarization } from "@/lib/fusion-data";

type Params = { slug: string };

export default async function DrawerAssoPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const asso = loadAssociation(slug);
  if (!asso) return notFound();
  const vulgarization = loadSubventionVulgarization(asso.name);

  const montantStr = asso.totalAmount >= 1e6
    ? `${(asso.totalAmount / 1e6).toFixed(1).replace(".", ",")} M€`
    : `${Math.round(asso.totalAmount / 1000).toLocaleString("fr-FR")} k€`;
  const shareText = `${asso.name} a reçu ${montantStr} de subventions de la Ville de Paris${asso.theme ? ` (${asso.theme})` : ""}`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<>Association · {asso.theme ?? "Thématique —"}</>}
        title={asso.name}
        shareUrl={`/qui-recoit/association/${encodeURIComponent(asso.name)}`}
        shareText={shareText}
        backHref="/qui-recoit"
        breadcrumbLabel={asso.name}
      >
        <AssociationFiche asso={asso} vulgarization={vulgarization} />
      </DetailDrawer>
    </div>
  );
}
