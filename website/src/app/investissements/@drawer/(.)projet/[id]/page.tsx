import { notFound } from "next/navigation";

import { DetailDrawer, ProjetFiche } from "@/components/fusion";
import { loadProjet, resolveProjetPhoto } from "@/lib/fusion-data";

type Params = { id: string };

/**
 * Intercepted route — ouvre la fiche projet en side drawer par-dessus la page
 * /investissements quand l'utilisateur clique une carte de la grille ou un
 * marker de la carte. Navigation directe (lien partagé) → page complète via
 * /investissements/projet/[id]/page.tsx.
 */
export default async function DrawerProjetPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const projet = loadProjet(id);
  if (!projet) return notFound();
  const photo = resolveProjetPhoto(projet.id, projet.name);

  const montantStr = projet.montant >= 1e6
    ? `${(projet.montant / 1e6).toFixed(1).replace(".", ",")} M€`
    : `${Math.round(projet.montant / 1000).toLocaleString("fr-FR")} k€`;

  const shareText = `Investissement Ville de Paris ${projet.year} · ${projet.name} · ${montantStr}`;

  const arr = projet.arrondissement > 0
    ? `${projet.arrondissement}${projet.arrondissement === 1 ? "er" : "ᵉ"} arr.`
    : "Transverse";

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<>Investissement · {projet.year} · {arr}</>}
        title={projet.name}
        shareUrl={`/investissements/projet/${encodeURIComponent(projet.id)}`}
        shareText={shareText}
        backHref="/investissements"
        breadcrumbLabel={projet.name.slice(0, 50)}
      >
        <ProjetFiche projet={projet} photo={photo} />
      </DetailDrawer>
    </div>
  );
}
