import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { DetailDrawer } from "@/components/fusion";
import { readLocale } from "@/lib/seo";
import ContratCommuneClient from "@/app/fr/city/[slug]/marche/[contrat]/ContratCommuneClient";
import { loadContratLocal } from "@/app/fr/city/[slug]/marche/[contrat]/load";

/**
 * Depuis la page ville, un contrat s'ouvre par-dessus la page, comme un
 * fournisseur. Même donnée et même corps que la page pleine.
 */
export default async function CommuneContratDrawer({ params }: { params: Promise<{ slug: string; contrat: string }> }) {
  const { slug, contrat } = await params;
  const r = await loadContratLocal(slug, contrat);
  if (!r) notFound();
  const locale = await readLocale();
  return (
    <div className="theme-fusion" style={{ display: "contents" }}>
      <DetailDrawer
        kicker={locale === "en" ? `Public contract · ${r.commune.nom}` : `Marché public · ${r.commune.nom}`}
        title={r.c.objet}
        shareUrl={`/fr/city/${r.commune.slug}/marche/${r.c.slug}`}
        backHref={`/fr/city/${r.commune.slug}#achats`}
        breadcrumbLabel={r.commune.nom}
      >
        <ContratCommuneClient {...r} embedded />
      </DetailDrawer>
    </div>
  );
}
