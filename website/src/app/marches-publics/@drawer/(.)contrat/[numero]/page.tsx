import { notFound } from "next/navigation";

import { DetailDrawer, ContratFiche } from "@/components/fusion";
import {
  loadContrat,
  loadContratRanking,
  loadMarcheVulgarization,
  loadSirene,
} from "@/lib/fusion-data";

type Params = { numero: string };

/**
 * Intercepted route — when the user clicks a contract link from the marchés
 * list, this renders as a side drawer over the list. Direct URL navigation
 * (shared link) falls back to the full page in `/contrat/[numero]/page.tsx`.
 */
export default async function DrawerContratPage({ params }: { params: Promise<Params> }) {
  const { numero } = await params;
  const contrat = loadContrat(numero);
  if (!contrat) return notFound();

  const vulgarization = loadMarcheVulgarization(contrat.numero);
  const siren = contrat.fournisseurSiret && contrat.fournisseurSiret.length >= 9
    ? contrat.fournisseurSiret.slice(0, 9)
    : null;
  const fournisseurSirene = siren ? loadSirene(siren) : null;
  const ranking = loadContratRanking(contrat.numero, contrat.year, contrat.nature, contrat.montantMax);

  const montantStr = contrat.montantMax >= 1e6
    ? `${(contrat.montantMax / 1e6).toFixed(1).replace(".", ",")} M€`
    : `${Math.round(contrat.montantMax / 1000).toLocaleString("fr-FR")} k€`;
  const shareText = `Paris a notifié un marché de ${montantStr} à ${contrat.fournisseur} en ${contrat.year} — ${vulgarization?.objet_clair || contrat.objet}`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<>Marché · {contrat.nature} · {contrat.year}</>}
        title={vulgarization?.objet_clair || contrat.objet || `Marché ${contrat.numero}`}
        shareUrl={`/marches-publics/contrat/${contrat.numero}`}
        shareText={shareText}
        backHref="/marches-publics"
        breadcrumbLabel={`Contrat ${contrat.numero}`}
      >
        <ContratFiche
          contrat={contrat}
          vulgarization={vulgarization}
          fournisseurSirene={fournisseurSirene}
          ranking={ranking}
        />
      </DetailDrawer>
    </div>
  );
}
