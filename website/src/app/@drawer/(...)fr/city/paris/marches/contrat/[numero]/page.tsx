import { notFound } from "next/navigation";

import { DetailDrawer, ContratFiche } from "@/components/fusion";
import { DrawerKicker } from "@/components/fusion/DataLabel";
import VoirLeLieu from "@/components/fusion/VoirLeLieu";
import {
  loadContrat,
  loadContratProjet,
  loadContratRanking,
  loadMarcheVulgarization,
  loadSirene,
} from "@/lib/fusion-data";
import { lieuForProjet } from "@/lib/lieux-data";
import { normalizeObjet } from "@/lib/objet-normalizer";

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

  // Même précédence que ContratFiche (objet_clair → regex → brut). Sans le
  // repli `normalizeObjet`, l'en-tête affichait le libellé technique brut
  // ("SA4.TRVX CSTRUCT…") juste au-dessus du lead qui, lui, montrait la version
  // normalisée ("Sa4.Travaux Cstruct…") — deux titres pour un même contrat.
  const label = vulgarization?.objet_clair || normalizeObjet(contrat.objet);
  const shareText = `Paris a notifié un marché de ${montantStr} à ${contrat.fournisseur} en ${contrat.year} — ${label}`;

  const projetLink = loadContratProjet(contrat.numero);
  const lieuLien = projetLink ? lieuForProjet(projetLink.nom) : null;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<DrawerKicker k="contrat" year={contrat.year} nature={contrat.nature} />}
        title={label || `Marché ${contrat.numero}`}
        shareUrl={`/fr/city/paris/marches/contrat/${contrat.numero}`}
        shareText={shareText}
        backHref="/fr/city/paris/marches"
        breadcrumbLabel={`Contrat ${contrat.numero}`}
      >
        <VoirLeLieu lien={lieuLien} locale={"fr"} />
        <ContratFiche
          contrat={contrat}
          vulgarization={vulgarization}
          fournisseurSirene={fournisseurSirene}
          ranking={ranking}
          projet={projetLink}
        />
      </DetailDrawer>
    </div>
  );
}
