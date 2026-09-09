import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { DetailDrawer } from "@/components/fusion";
import { readLocale } from "@/lib/seo";
import FournisseurLocalClient from "@/app/fr/city/[slug]/fournisseur/[siren]/FournisseurLocalClient";
import { loadFournisseurLocal, SOURCE_URL } from "@/app/fr/city/[slug]/fournisseur/[siren]/load";

/**
 * Depuis la page ville, un fournisseur s'ouvre par-dessus la page, comme à
 * Paris — pas dans une nouvelle page. Même donnée et même corps que la page
 * pleine (accès direct, partage, moteurs), seule l'enveloppe change.
 */
export default async function CommuneFournisseurDrawer({ params }: { params: Promise<{ slug: string; siren: string }> }) {
  const { slug, siren } = await params;
  const r = await loadFournisseurLocal(slug, siren);
  if (!r) notFound();
  const locale = await readLocale();
  return (
    <div className="theme-fusion" style={{ display: "contents" }}>
      <DetailDrawer
        kicker={locale === "en" ? `Supplier · ${r.commune.nom}` : `Fournisseur · ${r.commune.nom}`}
        title={r.f.nom}
        shareUrl={`/fr/city/${slug}/fournisseur/${siren}`}
        backHref={`/fr/city/${slug}#achats`}
        breadcrumbLabel={r.commune.nom}
      >
        <FournisseurLocalClient {...r} sourceUrl={SOURCE_URL} embedded />
      </DetailDrawer>
    </div>
  );
}
