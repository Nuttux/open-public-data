import Link from "next/link";
import { loadLieuxIndex } from "@/lib/lieux-data";
import { readLocale } from "@/lib/seo";

/**
 * Rebond en bas de fiche : d'autres lieux de la même famille, sinon du même
 * arrondissement. Sert à ne pas finir en cul-de-sac (audit UX) — `famille` et
 * `arrondissement` sont déjà indexés.
 */
export default async function LieuxVoisins({
  slug,
  famille,
  arrondissement,
}: {
  slug: string;
  famille: string;
  arrondissement: number;
}) {
  const locale = await readLocale();
  const all = loadLieuxIndex().filter((l) => l.slug !== slug);
  let voisins = all.filter((l) => l.famille === famille);
  let titre = locale === "en" ? "Same kind" : "Même famille";
  if (voisins.length < 2) {
    voisins = all.filter((l) => l.arrondissement === arrondissement && arrondissement > 0);
    titre = locale === "en" ? "Same district" : "Même arrondissement";
  }
  voisins = voisins.sort((a, b) => (b.n_lieu ?? 0) - (a.n_lieu ?? 0)).slice(0, 4);
  if (!voisins.length) return null;

  return (
    <section className="fx-fiche-section">
      <div className="fx-fiche-h">{titre}</div>
      <div className="fx-voisins">
        {voisins.map((l) => (
          <Link key={l.slug} href={`/fr/city/paris/lieu/${l.slug}`} scroll={false} className="fx-voisin">
            {l.photo ? <img src={l.photo} alt="" loading="lazy" /> : <span className="fx-voisin-noimg" />}
            <span className="fx-voisin-name">{l.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
