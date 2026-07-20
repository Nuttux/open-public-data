import Link from "next/link";
import type { LieuLien } from "@/lib/lieux-data";

/**
 * Carte « ↗ Voir le lieu » — le tissu conjonctif. Sur une fiche subvention,
 * projet ou contrat, renvoie vers la fiche du lieu que le juge a rattaché
 * (exploitant, résident, projet ou marché au-lieu). Même grammaire visuelle
 * que la carte « Chantier » de la fiche contrat : photo, kicker, nom — le
 * lien inverse (lieu → fiche) est une table d'argent, celui-ci une vitrine.
 * Rendu uniquement si le lien existe : jamais de rapprochement de nom au
 * rendu, la preuve est en amont (index inverse + garde de publication).
 */
export default function VoirLeLieu({ lien, locale }: { lien: LieuLien | null; locale: string }) {
  if (!lien) return null;
  const roleLabel =
    lien.role === "exploitant"
      ? locale === "en" ? "operates" : "exploite"
      : lien.role === "resident"
        ? locale === "en" ? "is funded at" : "est financé au"
        : locale === "en" ? "concerns" : "concerne";
  return (
    <Link href={`/fr/city/paris/lieu/${lien.slug}`} scroll={false} className="fx-voir-lieu">
      {lien.photo && (
        <img src={lien.photo} alt="" width={104} height={70} loading="lazy" className="fx-voir-lieu-img" />
      )}
      <span className="fx-voir-lieu-body">
        <span className="fx-voir-lieu-kicker">
          {locale === "en" ? "Place" : "Lieu"} · {roleLabel}
        </span>
        <span className="fx-voir-lieu-name">{lien.lieu}</span>
      </span>
      <span className="fx-voir-lieu-arrow" aria-hidden="true">↗</span>
    </Link>
  );
}
