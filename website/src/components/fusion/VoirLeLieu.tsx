import Link from "next/link";
import type { LieuLien } from "@/lib/lieux-data";

/**
 * Bandeau « ↗ Voir le lieu » — le tissu conjonctif. Sur une fiche subvention ou
 * projet, renvoie vers la fiche du lieu que le juge a rattaché (exploitant,
 * résident, ou projet au-lieu). Rendu uniquement si le lien existe : jamais de
 * rapprochement de nom au rendu, la preuve est en amont (index inverse).
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
      <span className="fx-voir-lieu-kicker">
        {locale === "en" ? "Place" : "Lieu"} · {roleLabel}
      </span>
      <span className="fx-voir-lieu-name">{lien.lieu}</span>
      <span className="fx-voir-lieu-arrow" aria-hidden="true">↗</span>
    </Link>
  );
}
