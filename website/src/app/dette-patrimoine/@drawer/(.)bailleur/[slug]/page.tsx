import { notFound } from "next/navigation";

import { DetailDrawer, BailleurFiche } from "@/components/fusion";
import { loadBailleur } from "@/lib/fusion-data";

type Params = { slug: string };

export default async function DrawerBailleurPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const bailleur = loadBailleur(slug);
  if (!bailleur) return notFound();

  const kicker = bailleur.type
    ? `Bailleur · ${bailleur.type}`
    : bailleur.garanties
    ? "Bénéficiaire · garantie d'emprunt Ville de Paris"
    : "Bailleur social";

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<span className="fx-kicker-mono">{kicker}</span>}
        title={bailleur.name}
        shareUrl={`/dette-patrimoine/bailleur/${encodeURIComponent(bailleur.slug)}`}
        backHref="/dette-patrimoine#sec-hors-bilan"
        breadcrumbLabel={bailleur.name}
      >
        <BailleurFiche bailleur={bailleur} />
      </DetailDrawer>
    </div>
  );
}
