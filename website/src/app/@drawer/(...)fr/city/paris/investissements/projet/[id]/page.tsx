import { notFound } from "next/navigation";

import { DetailDrawer, ProjetFiche } from "@/components/fusion";
import { loadProjet, resolveProjetPhoto } from "@/lib/fusion-data";
import { readLocale } from "@/lib/seo";

type Params = { id: string };

/**
 * Root-level intercept — ouvre la fiche projet en drawer quand l'utilisateur
 * navigue vers /fr/city/paris/investissements/projet/[id] depuis n'importe où
 * dans l'app (home, autre section). L'intercept section-level
 * `investissements/@drawer/(.)projet/[id]` reste prioritaire quand la nav se
 * fait depuis l'intérieur d'investissements.
 *
 * Navigation directe (URL partagée) → page complète via
 * /fr/city/paris/investissements/projet/[id]/page.tsx.
 */
export default async function RootDrawerProjetPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const projet = loadProjet(id);
  if (!projet) return notFound();
  const photo = resolveProjetPhoto(projet.id, projet.name);
  const locale = await readLocale();
  const displayName = locale === "en" && projet.name_en ? projet.name_en : projet.name;

  const montantStr = projet.montant >= 1e6
    ? `${(projet.montant / 1e6).toFixed(1).replace(".", ",")} ${locale === "en" ? "€M" : "M€"}`
    : `${Math.round(projet.montant / 1000).toLocaleString(locale === "en" ? "en-GB" : "fr-FR")} ${locale === "en" ? "€k" : "k€"}`;

  const shareText = locale === "en"
    ? `City of Paris investment ${projet.year} · ${displayName} · ${montantStr}`
    : `Investissement Ville de Paris ${projet.year} · ${displayName} · ${montantStr}`;

  const arr = projet.arrondissement > 0
    ? (locale === "en"
        ? `${projet.arrondissement}${projet.arrondissement === 1 ? "st" : projet.arrondissement === 2 ? "nd" : projet.arrondissement === 3 ? "rd" : "th"} district`
        : `${projet.arrondissement}${projet.arrondissement === 1 ? "er" : "ᵉ"} arr.`)
    : (locale === "en" ? "Citywide" : "Transverse");

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<>{locale === "en" ? "Investment" : "Investissement"} · {projet.year} · {arr}</>}
        title={displayName}
        shareUrl={`/fr/city/paris/investissements/projet/${encodeURIComponent(projet.id)}`}
        shareText={shareText}
        backHref="/"
        breadcrumbLabel={displayName.slice(0, 50)}
      >
        <ProjetFiche projet={projet} photo={photo} />
      </DetailDrawer>
    </div>
  );
}
