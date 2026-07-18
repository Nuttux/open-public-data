import Link from "next/link";
import type { LieuIndexEntry } from "@/lib/lieux-data";

/**
 * Encart « lieux liés » — le tissu conjonctif vers l'entité lieu depuis une page
 * de section (arrondissement, investissements, subventions). Présentationnel :
 * l'appelant fournit déjà la liste filtrée (par arrondissement, par argent…) —
 * ici on ne fait que la mettre en scène, avec la même carte que « même famille »
 * (fx-voisin) pour rester cohérent. Rendu seulement s'il y a des lieux.
 */
export default function LieuxLies({
  lieux,
  title,
  intro,
  locale = "fr",
  max = 6,
}: {
  lieux: LieuIndexEntry[];
  title: string;
  intro?: string;
  locale?: string;
  max?: number;
}) {
  if (!lieux.length) return null;
  const shown = lieux.slice(0, max);

  const metric = (l: LieuIndexEntry): string | null => {
    if ((l.argent_total_eur ?? 0) > 0) {
      const m = l.argent_total_eur!;
      const v = m >= 1e6
        ? `${(m / 1e6).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 1 })} M€`
        : `${Math.round(m / 1e3)} k€`;
      return v;
    }
    if (l.depuis) return `${locale === "en" ? "since" : "depuis"} ${l.depuis}`;
    return null;
  };

  return (
    <section className="fx-fiche-section">
      <div className="fx-fiche-h fx-fiche-h--money">{title}</div>
      {intro && <p className="fx-lieuxlies-intro">{intro}</p>}
      <div className="fx-voisins">
        {shown.map((l) => {
          const m = metric(l);
          return (
            <Link key={l.slug} href={`/fr/city/paris/lieu/${l.slug}`} scroll={false} className="fx-voisin">
              {l.photo ? <img src={l.photo} alt="" loading="lazy" /> : <span className="fx-voisin-noimg" />}
              <span className="fx-voisin-name">{l.name}</span>
              {m && <span className="fx-voisin-meta">{m}</span>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
