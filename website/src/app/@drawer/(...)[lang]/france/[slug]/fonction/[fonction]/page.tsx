import { notFound } from "next/navigation";
import "@/app/fusion.css";
import { DetailDrawer } from "@/components/fusion";
import { readLocale } from "@/lib/seo";
import FonctionFiche from "@/components/fusion/FonctionFiche";
import { loadCommuneFonction } from "@/lib/commune-fonctions";

/**
 * Depuis la page ville, une politique publique s'ouvre par-dessus la page —
 * comme à Paris et à Recife. Même donnée et même corps que la page pleine, qui
 * reste l'adresse partageable et celle que les moteurs voient.
 */
export default async function CommuneFonctionDrawer({ params }: { params: Promise<{ slug: string; fonction: string }> }) {
  const { slug, fonction } = await params;
  const r = await loadCommuneFonction(slug, fonction);
  if (!r) notFound();
  const locale = await readLocale();
  const titre = locale === "en" ? r.fonction.libelle_en : r.fonction.libelle;
  return (
    <div className="theme-fusion" style={{ display: "contents" }}>
      <DetailDrawer
        kicker={locale === "en" ? `Public policy · ${r.doc.commune.nom}` : `Politique publique · ${r.doc.commune.nom}`}
        title={titre}
        shareUrl={`/france/${slug}/fonction/${fonction}`}
        backHref={`/france/${slug}#a-quoi-sert`}
        breadcrumbLabel={r.doc.commune.nom}
      >
        <FonctionFiche doc={r.doc} fonction={r.fonction} embedded />
      </DetailDrawer>
    </div>
  );
}
