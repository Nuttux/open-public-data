/**
 * Lien vers la ligne d'un emprunt garanti dans le jeu « dette-garantie »
 * d'opendata.paris.fr. L'objet de l'emprunt n'est pas une facette du jeu : on
 * filtre par année de publication, bénéficiaire, prêteur et année de
 * mobilisation, puis on cherche l'objet exact. Vérifié le 2026-09-14 sur 69
 * emprunts de 2024 et 2025 : jamais vide, une seule ligne pour 43 d'entre eux,
 * sinon les quelques emprunts qui partagent le même objet.
 */
const BASE = "https://opendata.paris.fr/explore/dataset/dette-garantie/table/";

export function empruntSourceHref(e: {
  year: number;
  beneficiaire: string;
  objet: string;
  preteur?: string | null;
  annee_mobilisation?: number | null;
}): string {
  const refine = (k: string, v: string | number | null | undefined) =>
    v === null || v === undefined || v === "" ? "" : `&refine.${k}=${encodeURIComponent(String(v))}`;
  return (
    `${BASE}?refine.annee_de_publication=${e.year}` +
    refine("designation_du_beneficiaire", e.beneficiaire) +
    refine("organisme_preteur_ou_chef_de_file", e.preteur) +
    refine("annee_de_mobilisation", e.annee_mobilisation) +
    `&q=${encodeURIComponent(`"${e.objet.trim()}"`)}`
  );
}
