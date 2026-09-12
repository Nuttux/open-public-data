import Link from "next/link";
import { loadLieuxIndex } from "@/lib/lieux-data";
import { readLocale } from "@/lib/seo";

/**
 * Rebond en bas de fiche : d'autres lieux de la même famille, sinon du même
 * arrondissement. Sert à ne pas finir en cul-de-sac (audit UX) — `famille` et
 * `arrondissement` sont déjà indexés.
 */
/** « 117 M € » / « €117M » — le total versé par la Ville, tel que l'index le porte. */
function fmtEur(n: number, locale: string): string {
  const en = locale === "en";
  const loc = en ? "en-US" : "fr-FR";
  const v = n >= 1e9
    ? `${new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(n / 1e9)} ${en ? "bn" : "Md"}`
    : n >= 1e6
      ? `${new Intl.NumberFormat(loc, { maximumFractionDigits: n >= 1e7 ? 0 : 1 }).format(n / 1e6)} M`
      : `${new Intl.NumberFormat(loc, { maximumFractionDigits: 0 }).format(n / 1e3)} k`;
  return `${v} €`;
}

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
            {(l.argent_total_eur ?? 0) > 0 && <span className="fx-voisin-meta">{fmtEur(l.argent_total_eur ?? 0, locale)}</span>}
            {/* Le montant de la vignette couvre la fenêtre commune à tous les
                lieux. Sans cette seconde ligne, la Gaîté-Lyrique affichait
                1,9 M€ à côté de Carnavalet à 41 M€ alors que 97 % de son
                argent est antérieur : un contresens pour qui parcourt la
                liste. Seuil d'affichage à 1 M€, en dessous ça n'apprend rien
                et ça charge la vignette. */}
            {(l.depense_reelle_avant_seuil_eur ?? 0) >= 1e6 && (
              <span className="fx-voisin-avant">
                + {fmtEur(l.depense_reelle_avant_seuil_eur ?? 0, locale)}{" "}
                {locale === "en" ? `before ${l.seuil_commun ?? ""}` : `avant ${l.seuil_commun ?? ""}`}
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
