import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { DetailDrawer } from "@/components/fusion";
import { readLocale } from "@/lib/seo";
import CommuneNatureFiche from "@/components/fusion/CommuneNatureFiche";
import { loadCommuneNature } from "@/lib/commune-fonctions";

/** Depuis la page ville, une forme de dépense s'ouvre par-dessus la page. */
export default async function CommuneNatureDrawer({ params }: { params: Promise<{ slug: string; nature: string }> }) {
  const { slug, nature } = await params;
  const r = await loadCommuneNature(slug, nature);
  if (!r) notFound();
  const locale = await readLocale();
  return (
    <div className="theme-fusion" style={{ display: "contents" }}>
      <DetailDrawer
        kicker={locale === "en" ? `Type of spending · ${r.doc.commune.nom}` : `Nature de dépense · ${r.doc.commune.nom}`}
        title={locale === "en" ? r.nature.libelle_en : r.nature.libelle}
        shareUrl={`/france/${slug}/nature/${nature}`}
        backHref={`/france/${slug}#depenses`}
        breadcrumbLabel={r.doc.commune.nom}
      >
        <CommuneNatureFiche doc={r.doc} nature={r.nature} embedded />
      </DetailDrawer>
    </div>
  );
}
